import type { Express, Request, Response } from 'express';
import multer from 'multer';
import crypto from 'node:crypto';
import type { LanguageCode, UserRole } from '../../src/types';
import { db } from '../database';
import { createRateLimiter } from '../admissions';
import { getEffectivePermissions } from '../permissions';
import { requireRole } from '../rbac';
import { aiConfig, aiAvailability } from './config';
import { buildAuthorizedDataContext, resolveStudentIds } from './dataTools';
import { buildSystemInstruction, detectIntent, detectLanguage, getSuggestions, sanitizeUserText } from './prompts';
import { AiProviderError, generateAssistantReply } from './provider';
import * as store from './storage';
import { actorContext, type AiDataContext, type AiIntent, type AiSource } from './types';

const ADMIN_ROLES: UserRole[] = ['SUPER_ADMIN', 'SCHOOL_ADMIN', 'HEAD_TEACHER'];
const KNOWLEDGE_MANAGERS: UserRole[] = ['SUPER_ADMIN', 'SCHOOL_ADMIN', 'HEAD_TEACHER', 'DEPUTY_HEAD'];
const ALL_ROLES: UserRole[] = [
  'SUPER_ADMIN', 'SCHOOL_ADMIN', 'HEAD_TEACHER', 'DEPUTY_HEAD', 'TEACHER', 'NURSE',
  'ACCOUNTANT', 'DISCIPLINE_OFFICER', 'SCHOOL_IT', 'ANIMATEUR', 'PARENT', 'STUDENT'
];
const ID_PATTERN = /^[A-Za-z0-9_-]{1,80}$/;
const INTENTS: AiIntent[] = ['general', 'student_count', 'attendance_summary', 'academic_summary', 'my_results', 'announcements', 'finance_summary', 'knowledge'];

let lastMessageIdTime = 0;
/** Time-ordered IDs keep chat history in order even when timestamps share a second. */
function nextMessageId(): string {
  const now = Date.now();
  lastMessageIdTime = now > lastMessageIdTime ? now : lastMessageIdTime + 1;
  return `${lastMessageIdTime.toString(36).padStart(10, '0')}-${crypto.randomUUID().replace(/-/g, '').slice(0, 25)}`;
}

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024, files: 1 }
});

function actor(req: Request) {
  if (!req.user) throw new Error('Authenticated request is missing its user context.');
  return req.user;
}

/** Only a platform Super Admin may target another school explicitly. */
function scopeSchool(req: Request): string {
  const user = actor(req);
  if (user.role === 'SUPER_ADMIN') {
    const requested = req.query.schoolId ?? (typeof req.body?.schoolId === 'string' ? req.body.schoolId : undefined);
    if (typeof requested === 'string' && ID_PATTERN.test(requested.trim()) && db.getSchool(requested.trim())) {
      return requested.trim();
    }
  }
  return user.schoolId;
}

function safeError(res: Response, error: unknown): Response {
  if (error instanceof store.AiStorageError) {
    return res.status(503).json({ error: error.message });
  }
  if (error instanceof AiProviderError) {
    const status = error.code === 'NOT_CONFIGURED' || error.code === 'DISABLED' ? 503 : error.code === 'TIMEOUT' ? 504 : 502;
    return res.status(status).json({ error: error.message, code: error.code });
  }
  console.error('[AI] Unexpected request error:', error instanceof Error ? error.message.slice(0, 200) : 'unknown');
  return res.status(500).json({ error: 'The AI assistant could not complete this request.' });
}

async function schoolName(schoolId: string): Promise<string> {
  return db.getSchool(schoolId)?.name || 'your school';
}

interface GenerationInput {
  schoolId: string;
  language: LanguageCode;
  question: string;
  history: Array<{ role: 'user' | 'assistant'; content: string }>;
  context: AiDataContext;
  knowledge: Array<{ title: string; category: string; excerpt: string }>;
  role: UserRole;
  model: string;
}

async function generate(input: GenerationInput): Promise<{ text: string; model: string; sources: AiSource[] }> {
  const systemInstruction = buildSystemInstruction({
    role: input.role,
    language: input.language,
    schoolName: await schoolName(input.schoolId),
    dataContext: input.context,
    knowledge: input.knowledge
  });
  const result = await generateAssistantReply({
    systemInstruction,
    language: input.language,
    model: input.model,
    messages: [
      ...input.history.slice(-aiConfig.maxHistoryMessages).map(message => ({ role: message.role, content: message.content })),
      { role: 'user' as const, content: `<user_question>${input.question}</user_question>` }
    ]
  });
  const sources: AiSource[] = [
    ...input.context.sources,
    ...input.knowledge.map(doc => ({ title: doc.title, kind: 'DOCUMENT' as const, detail: doc.category }))
  ];
  return { text: result.text, model: result.model, sources: sources.slice(0, 10) };
}

function audit(actorUser: ReturnType<typeof actor>, schoolId: string, action: string, entityId: string, details: string, req: Request): void {
  db.logAudit(schoolId, actorUser.id, actorUser.fullName, actorUser.role, action, 'AI', entityId, details, req.ip || '127.0.0.1');
}

export function registerAiRoutes(app: Express): void {
  const chatLimiter = createRateLimiter({
    windowMs: 60 * 60 * 1000,
    max: aiConfig.rateLimitPerHour,
    prefix: 'ai-chat',
    keyFrom: (req, prefix) => `${prefix}:${req.user?.id ?? req.ip ?? 'unknown'}:${req.user?.schoolId ?? 'unknown'}`
  });

  app.get('/api/ai/status', (_req: Request, res: Response) => {
    const availability = aiAvailability();
    const user = _req.user;
    return res.json({
      provider: aiConfig.provider,
      model: aiConfig.model,
      enabled: aiConfig.enabledFlag,
      available: availability.available,
      reason: availability.reason,
      defaultLanguage: aiConfig.defaultLanguage,
      rateLimitPerHour: aiConfig.rateLimitPerHour,
      retentionDays: aiConfig.retentionDays,
      suggestions: user ? getSuggestions(user.role, user.preferredLanguage === 'rw' ? 'rw' : aiConfig.defaultLanguage) : [],
      capabilities: user ? getSuggestions(user.role, 'en').length : 0
    });
  });

  app.get('/api/ai/settings', requireRole(...ADMIN_ROLES), async (req: Request, res: Response) => {
    try {
      return res.json(await store.getSettings(scopeSchool(req)));
    } catch (error) {
      return safeError(res, error);
    }
  });

  app.put('/api/ai/settings', requireRole(...ADMIN_ROLES), async (req: Request, res: Response) => {
    try {
      const schoolId = scopeSchool(req);
      const current = await store.getSettings(schoolId);
      const body = req.body ?? {};
      const language: LanguageCode = body.defaultLanguage === 'rw' ? 'rw' : body.defaultLanguage === 'en' ? 'en' : current.defaultLanguage;
      const allowedRoles = Array.isArray(body.allowedRoles)
        ? body.allowedRoles.filter((role: unknown) => ALL_ROLES.includes(role as UserRole))
        : current.allowedRoles;
      const permittedTools = Array.isArray(body.permittedTools)
        ? body.permittedTools.filter((tool: unknown) => INTENTS.includes(tool as AiIntent))
        : current.permittedTools;
      const settings = await store.saveSettings({
        ...current,
        isEnabled: typeof body.isEnabled === 'boolean' ? body.isEnabled : current.isEnabled,
        model: typeof body.model === 'string' ? sanitizeUserText(body.model, 100) : current.model,
        defaultLanguage: language,
        rateLimitPerHour: Number.isFinite(Number(body.rateLimitPerHour))
          ? Math.max(1, Math.min(10_000, Math.round(Number(body.rateLimitPerHour))))
          : current.rateLimitPerHour,
        retentionDays: Number.isFinite(Number(body.retentionDays))
          ? Math.max(1, Math.min(3650, Math.round(Number(body.retentionDays))))
          : current.retentionDays,
        allowedRoles,
        permittedTools,
        updatedBy: actor(req).id
      });
      audit(actor(req), schoolId, 'AI_SETTINGS_UPDATED', schoolId, 'AI school settings updated', req);
      return res.json(settings);
    } catch (error) {
      return safeError(res, error);
    }
  });

  app.get('/api/ai/conversations', async (req: Request, res: Response) => {
    try {
      const user = actor(req);
      return res.json(await store.listConversations(user.schoolId, user.id));
    } catch (error) {
      return safeError(res, error);
    }
  });

  app.post('/api/ai/conversations', async (req: Request, res: Response) => {
    try {
      const user = actor(req);
      const title = sanitizeUserText(req.body?.title, 200) || 'New conversation';
      const language: LanguageCode = req.body?.language === 'rw' ? 'rw' : req.body?.language === 'en' ? 'en' : (user.preferredLanguage === 'rw' ? 'rw' : 'en');
      const conversation = await store.createConversation({
        id: crypto.randomUUID(),
        schoolId: user.schoolId,
        userId: user.id,
        title,
        language
      });
      return res.status(201).json(conversation);
    } catch (error) {
      return safeError(res, error);
    }
  });

  app.get('/api/ai/conversations/:id', async (req: Request, res: Response) => {
    try {
      if (!ID_PATTERN.test(req.params.id)) return res.status(400).json({ error: 'Invalid conversation id.' });
      const user = actor(req);
      const conversation = await store.getConversation(user.schoolId, user.id, req.params.id);
      if (!conversation) return res.status(404).json({ error: 'Conversation not found.' });
      const messages = await store.listMessages(user.schoolId, user.id, conversation.id, 100);
      const feedback: Record<string, string> = {};
      for (const message of messages) {
        if (message.role !== 'assistant') continue;
        const value = await store.getFeedback(user.schoolId, user.id, message.id);
        if (value) feedback[message.id] = value;
      }
      return res.json({ ...conversation, messages, feedback });
    } catch (error) {
      return safeError(res, error);
    }
  });

  app.delete('/api/ai/conversations/:id', async (req: Request, res: Response) => {
    try {
      if (!ID_PATTERN.test(req.params.id)) return res.status(400).json({ error: 'Invalid conversation id.' });
      const user = actor(req);
      const deleted = await store.deleteConversation(user.schoolId, user.id, req.params.id);
      if (!deleted) return res.status(404).json({ error: 'Conversation not found.' });
      audit(user, user.schoolId, 'AI_CONVERSATION_DELETED', req.params.id, 'AI conversation deleted by its owner', req);
      return res.json({ deleted: true });
    } catch (error) {
      return safeError(res, error);
    }
  });

  app.post('/api/ai/chat', chatLimiter, async (req: Request, res: Response) => {
    const started = Date.now();
    const user = actor(req);
    let model = aiConfig.model;
    try {
      const question = sanitizeUserText(req.body?.message, aiConfig.maxMessageChars);
      if (!question) return res.status(400).json({ error: 'Enter a question for the assistant.' });

      const settings = await store.getSettings(user.schoolId);
      if (!settings.isEnabled) {
        return res.status(403).json({ error: 'The AI assistant is disabled for this school.' });
      }
      if (settings.allowedRoles?.length && !settings.allowedRoles.includes(user.role)) {
        return res.status(403).json({ error: 'Your role does not have access to the AI assistant.' });
      }

      const requestedLanguage = req.body?.language;
      const language: LanguageCode = requestedLanguage === 'rw' || requestedLanguage === 'en'
        ? requestedLanguage
        : detectLanguage(question, user.preferredLanguage === 'rw' ? 'rw' : settings.defaultLanguage);

      const conversationId = typeof req.body?.conversationId === 'string' ? req.body.conversationId : '';
      let conversation;
      if (conversationId) {
        if (!ID_PATTERN.test(conversationId)) return res.status(400).json({ error: 'Invalid conversation id.' });
        conversation = await store.getConversation(user.schoolId, user.id, conversationId);
        if (!conversation) return res.status(404).json({ error: 'Conversation not found.' });
      } else {
        conversation = await store.createConversation({
          id: crypto.randomUUID(),
          schoolId: user.schoolId,
          userId: user.id,
          title: question.length > 60 ? `${question.slice(0, 60)}…` : question,
          language
        });
      }

      const history = await store.listMessages(user.schoolId, user.id, conversation.id, aiConfig.maxHistoryMessages);
      const actorCtx = actorContext(user, getEffectivePermissions(user));
      const intent = detectIntent(question, user.role);
      if (settings.permittedTools?.length && intent !== 'general' && !settings.permittedTools.includes(intent)) {
        return res.status(403).json({ error: 'This AI tool is not enabled for your school.' });
      }
      if (settings.rateLimitPerHour && (await store.countRecentRequests(user.schoolId, user.id)) >= settings.rateLimitPerHour) {
        res.setHeader('Retry-After', '3600');
        return res.status(429).json({ error: 'AI usage limit reached for this hour. Please try again later.' });
      }

      const dataContext = await buildAuthorizedDataContext({
        actor: actorCtx,
        intent,
        schoolId: actorCtx.schoolId,
        studentIds: resolveStudentIds(actorCtx, user)
      });
      const knowledge = await searchKnowledgeSafely(user.schoolId, question);
      const generated = await generate({
        schoolId: user.schoolId,
        language,
        question,
        history: history.map(message => ({ role: message.role, content: message.content })),
        context: dataContext,
        knowledge,
        role: user.role,
        model: settings.model || aiConfig.model
      });
      model = generated.model;

      const userMessage = await store.insertMessage({
        id: nextMessageId(),
        conversationId: conversation.id,
        schoolId: user.schoolId,
        userId: user.id,
        role: 'user',
        content: question,
        sources: [],
        language
      });
      const assistantMessage = await store.insertMessage({
        id: nextMessageId(),
        conversationId: conversation.id,
        schoolId: user.schoolId,
        userId: user.id,
        role: 'assistant',
        content: generated.text,
        sources: generated.sources,
        language
      });
      await store.touchConversation(user.schoolId, user.id, conversation.id);
      await store.recordUsage({
        schoolId: user.schoolId,
        userId: user.id,
        role: user.role,
        action: `chat:${intent}`,
        model,
        status: 'OK',
        latencyMs: Date.now() - started
      });
      audit(user, user.schoolId, 'AI_CHAT_COMPLETED', conversation.id, `AI chat (${intent}, ${language})`, req);
      return res.json({
        conversationId: conversation.id,
        messages: [userMessage, assistantMessage],
        language,
        intent,
        notice: dataContext.notice
      });
    } catch (error) {
      const code = error instanceof AiProviderError ? error.code : 'STORAGE_OR_INTERNAL';
      await store.recordUsage({
        schoolId: user.schoolId,
        userId: user.id,
        role: user.role,
        action: 'chat:error',
        model,
        status: 'ERROR',
        errorCode: code,
        latencyMs: Date.now() - started
      }).catch(() => undefined);
      audit(user, user.schoolId, 'AI_CHAT_FAILED', 'AI', `AI chat failed (${code})`, req);
      return safeError(res, error);
    }
  });

  app.post('/api/ai/regenerate', chatLimiter, async (req: Request, res: Response) => {
    const started = Date.now();
    const user = actor(req);
    try {
      const messageId = typeof req.body?.messageId === 'string' ? req.body.messageId : '';
      if (!ID_PATTERN.test(messageId)) return res.status(400).json({ error: 'Invalid message id.' });
      const target = await store.getAssistantMessage(user.schoolId, user.id, messageId);
      if (!target) return res.status(404).json({ error: 'Assistant message not found.' });
      const all = await store.listMessages(user.schoolId, user.id, target.conversationId, 100);
      const index = all.findIndex(message => message.id === target.id);
      const priorUser = [...all.slice(0, index)].reverse().find(message => message.role === 'user');
      if (!priorUser) return res.status(400).json({ error: 'The original question is no longer available.' });

      const conversation = await store.getConversation(user.schoolId, user.id, target.conversationId);
      if (!conversation) return res.status(404).json({ error: 'Conversation not found.' });
      const settings = await store.getSettings(user.schoolId);
      if (!settings.isEnabled) {
        return res.status(403).json({ error: 'The AI assistant is disabled for this school.' });
      }
      if (settings.allowedRoles?.length && !settings.allowedRoles.includes(user.role)) {
        return res.status(403).json({ error: 'Your role does not have access to the AI assistant.' });
      }
      const language = target.language;
      const intent = detectIntent(priorUser.content, user.role);
      if (settings.permittedTools?.length && intent !== 'general' && !settings.permittedTools.includes(intent)) {
        return res.status(403).json({ error: 'This AI tool is not enabled for your school.' });
      }
      const actorCtx = actorContext(user, getEffectivePermissions(user));
      const dataContext = await buildAuthorizedDataContext({
        actor: actorCtx,
        intent,
        schoolId: actorCtx.schoolId,
        studentIds: resolveStudentIds(actorCtx, user)
      });
      const generated = await generate({
        schoolId: user.schoolId,
        language,
        question: priorUser.content,
        history: all.slice(0, index - 1).map(message => ({ role: message.role, content: message.content })),
        context: dataContext,
        knowledge: await searchKnowledgeSafely(user.schoolId, priorUser.content),
        role: user.role,
        model: settings.model || aiConfig.model
      });
      const updated = await store.replaceMessageContent(user.schoolId, user.id, target.id, generated.text, generated.sources);
      await store.recordUsage({
        schoolId: user.schoolId,
        userId: user.id,
        role: user.role,
        action: 'regenerate',
        model: generated.model,
        status: 'OK',
        latencyMs: Date.now() - started
      });
      audit(user, user.schoolId, 'AI_RESPONSE_REGENERATED', target.id, 'AI response regenerated', req);
      return res.json({ message: updated, language });
    } catch (error) {
      await store.recordUsage({
        schoolId: user.schoolId,
        userId: user.id,
        role: user.role,
        action: 'regenerate:error',
        model: aiConfig.model,
        status: 'ERROR',
        errorCode: error instanceof AiProviderError ? error.code : 'STORAGE_OR_INTERNAL',
        latencyMs: Date.now() - started
      }).catch(() => undefined);
      return safeError(res, error);
    }
  });

  app.post('/api/ai/feedback', async (req: Request, res: Response) => {
    try {
      const user = actor(req);
      const messageId = typeof req.body?.messageId === 'string' ? req.body.messageId : '';
      if (!ID_PATTERN.test(messageId)) return res.status(400).json({ error: 'Invalid message id.' });
      if (typeof req.body?.helpful !== 'boolean') return res.status(400).json({ error: 'Feedback must be helpful or not helpful.' });
      const message = await store.getAssistantMessage(user.schoolId, user.id, messageId);
      if (!message) return res.status(404).json({ error: 'Assistant message not found.' });
      await store.saveFeedback({
        id: crypto.randomUUID(),
        messageId,
        schoolId: user.schoolId,
        userId: user.id,
        helpful: req.body.helpful
      });
      audit(user, user.schoolId, 'AI_FEEDBACK_SAVED', messageId, req.body.helpful ? 'Helpful' : 'Not helpful', req);
      return res.json({ saved: true, helpful: req.body.helpful });
    } catch (error) {
      return safeError(res, error);
    }
  });

  app.get('/api/ai/knowledge', async (req: Request, res: Response) => {
    try {
      const schoolId = scopeSchool(req);
      return res.json(await store.listKnowledgeForSchool(schoolId, req.query.includeArchived === 'true'));
    } catch (error) {
      return safeError(res, error);
    }
  });

  app.post('/api/ai/knowledge', requireRole(...KNOWLEDGE_MANAGERS), upload.single('file'), async (req: Request, res: Response) => {
    try {
      const user = actor(req);
      const schoolId = scopeSchool(req);
      const title = sanitizeUserText(req.body?.title, 200);
      const file = req.file;
      const content = file
        ? file.buffer.toString('utf8').slice(0, 200_000)
        : sanitizeUserText(req.body?.content, 200_000);
      if (!title) return res.status(400).json({ error: 'A document title is required.' });
      if (!content.trim()) return res.status(400).json({ error: 'Document content is required.' });
      if (file && !/\.(txt|md|markdown|csv|json)$/i.test(file.originalname)) {
        return res.status(400).json({ error: 'Only .txt, .md, .csv and .json documents are supported.' });
      }
      const document = await store.createKnowledge({
        id: crypto.randomUUID(),
        schoolId,
        title,
        category: sanitizeUserText(req.body?.category, 80) || 'general',
        visibility: req.body?.visibility === 'SHARED' ? 'SHARED' : 'SCHOOL',
        fileName: file ? file.originalname.slice(0, 255) : '',
        mimeType: file?.mimetype?.slice(0, 120) || 'text/plain',
        content,
        uploadedBy: user.id
      });
      audit(user, schoolId, 'AI_KNOWLEDGE_UPLOADED', document.id, `Knowledge document: ${title}`, req);
      return res.status(201).json({ ...document, content: content.slice(0, 600) });
    } catch (error) {
      return safeError(res, error);
    }
  });

  app.patch('/api/ai/knowledge/:id', requireRole(...KNOWLEDGE_MANAGERS), async (req: Request, res: Response) => {
    try {
      if (!ID_PATTERN.test(req.params.id)) return res.status(400).json({ error: 'Invalid document id.' });
      const user = actor(req);
      const schoolId = scopeSchool(req);
      const status = ['PROCESSING', 'READY', 'ARCHIVED'].includes(req.body?.status) ? req.body.status : undefined;
      const document = await store.updateKnowledge({
        id: req.params.id,
        schoolId,
        title: typeof req.body?.title === 'string' ? sanitizeUserText(req.body.title, 200) : undefined,
        category: typeof req.body?.category === 'string' ? sanitizeUserText(req.body.category, 80) : undefined,
        visibility: req.body?.visibility === 'SHARED' || req.body?.visibility === 'SCHOOL' ? req.body.visibility : undefined,
        content: typeof req.body?.content === 'string' ? sanitizeUserText(req.body.content, 200_000) : undefined,
        status
      });
      if (!document) return res.status(404).json({ error: 'Document not found.' });
      audit(user, schoolId, 'AI_KNOWLEDGE_UPDATED', document.id, 'Knowledge document updated', req);
      return res.json({ ...document, content: document.content.slice(0, 600) });
    } catch (error) {
      return safeError(res, error);
    }
  });

  app.delete('/api/ai/knowledge/:id', requireRole(...KNOWLEDGE_MANAGERS), async (req: Request, res: Response) => {
    try {
      if (!ID_PATTERN.test(req.params.id)) return res.status(400).json({ error: 'Invalid document id.' });
      const user = actor(req);
      const schoolId = scopeSchool(req);
      const deleted = await store.deleteKnowledge(schoolId, req.params.id);
      if (!deleted) return res.status(404).json({ error: 'Document not found.' });
      audit(user, schoolId, 'AI_KNOWLEDGE_DELETED', req.params.id, 'Knowledge document removed', req);
      return res.json({ deleted: true });
    } catch (error) {
      return safeError(res, error);
    }
  });

  app.get('/api/ai/usage', requireRole(...ADMIN_ROLES), async (req: Request, res: Response) => {
    try {
      const days = Number(req.query.days) || 30;
      const stats = await store.getUsageStats(scopeSchool(req), days);
      const errors = await store.listErrorLogs(scopeSchool(req), days);
      return res.json({ ...stats, errors });
    } catch (error) {
      return safeError(res, error);
    }
  });

  app.post('/api/ai/maintenance/purge', requireRole(...ADMIN_ROLES), async (req: Request, res: Response) => {
    try {
      const user = actor(req);
      const schoolId = scopeSchool(req);
      const settings = await store.getSettings(schoolId);
      const result = await store.purgeExpiredAiData(schoolId, settings.retentionDays);
      audit(user, schoolId, 'AI_DATA_PURGED', schoolId, `AI retention purge (${settings.retentionDays} days)`, req);
      return res.json(result);
    } catch (error) {
      return safeError(res, error);
    }
  });
}

async function searchKnowledgeSafely(schoolId: string, question: string) {
  try {
    return await store.searchKnowledge(schoolId, question);
  } catch (error) {
    console.warn('[AI] Knowledge search skipped:', error instanceof Error ? error.message.slice(0, 120) : 'unknown');
    return [];
  }
}
