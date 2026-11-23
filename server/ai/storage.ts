import type { Pool } from 'mysql2/promise';
import { getMysqlPool } from '../mysqlConnector';
import type {
  AiConversationRecord,
  AiIntent,
  AiKnowledgeRecord,
  AiMessageRecord,
  AiSettingsRecord,
  AiSource,
  AiUsageRecord
} from './types';
import type { LanguageCode, UserRole } from '../../src/types';

export class AiStorageError extends Error {
  constructor(message = 'AI storage is unavailable. Please try again later.') {
    super(message);
    this.name = 'AiStorageError';
  }
}

type DbRow = Record<string, any>;

function pool(): Pool {
  const current = getMysqlPool();
  if (!current) throw new AiStorageError();
  return current;
}

async function query<T extends DbRow>(sql: string, params: unknown[]): Promise<T[]> {
  try {
    const [rows] = await pool().execute(sql, params as any[]);
    return rows as T[];
  } catch (error) {
    console.warn('[AI] Storage query failed:', error instanceof Error ? error.message.slice(0, 160) : 'unknown');
    throw new AiStorageError();
  }
}

async function run(sql: string, params: unknown[]): Promise<number> {
  try {
    const [result] = await pool().execute(sql, params as any[]);
    return typeof (result as { affectedRows?: number }).affectedRows === 'number'
      ? (result as { affectedRows: number }).affectedRows
      : 0;
  } catch (error) {
    console.warn('[AI] Storage update failed:', error instanceof Error ? error.message.slice(0, 160) : 'unknown');
    throw new AiStorageError();
  }
}

function iso(value: unknown): string {
  if (value instanceof Date) return value.toISOString();
  return value ? String(value) : new Date().toISOString();
}

function json<T>(value: unknown, fallback: T): T {
  if (value == null) return fallback;
  if (typeof value === 'object') return value as T;
  try {
    return JSON.parse(String(value)) as T;
  } catch {
    return fallback;
  }
}

function conversation(row: DbRow): AiConversationRecord {
  return {
    id: String(row.id),
    schoolId: String(row.school_id),
    userId: String(row.user_id),
    title: String(row.title),
    language: (row.language === 'rw' ? 'rw' : 'en') as LanguageCode,
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at)
  };
}

function message(row: DbRow): AiMessageRecord {
  return {
    id: String(row.id),
    conversationId: String(row.conversation_id),
    schoolId: String(row.school_id),
    userId: String(row.user_id),
    role: row.role === 'assistant' ? 'assistant' : 'user',
    content: String(row.content),
    sources: json<AiSource[]>(row.sources, []),
    language: (row.language === 'rw' ? 'rw' : 'en') as LanguageCode,
    createdAt: iso(row.created_at)
  };
}

function knowledge(row: DbRow): AiKnowledgeRecord {
  return {
    id: String(row.id),
    schoolId: String(row.school_id),
    title: String(row.title),
    category: String(row.category),
    visibility: row.visibility === 'SHARED' ? 'SHARED' : 'SCHOOL',
    fileName: String(row.file_name || ''),
    mimeType: String(row.mime_type || 'text/plain'),
    content: String(row.content || ''),
    status: row.status === 'ARCHIVED' ? 'ARCHIVED' : row.status === 'PROCESSING' ? 'PROCESSING' : 'READY',
    uploadedBy: String(row.uploaded_by || ''),
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at)
  };
}

function settings(row: DbRow | undefined, schoolId: string): AiSettingsRecord {
  if (!row) {
    return {
      schoolId,
      isEnabled: true,
      model: '',
      defaultLanguage: 'en',
      rateLimitPerHour: 60,
      retentionDays: 180,
      allowedRoles: null,
      permittedTools: null,
      updatedBy: '',
      updatedAt: new Date().toISOString()
    };
  }
  return {
    schoolId: String(row.school_id),
    isEnabled: Boolean(row.is_enabled),
    model: String(row.model || ''),
    defaultLanguage: row.default_language === 'rw' ? 'rw' : 'en',
    rateLimitPerHour: Number(row.rate_limit_per_hour || 60),
    retentionDays: Number(row.retention_days || 180),
    allowedRoles: json<UserRole[] | null>(row.allowed_roles, null),
    permittedTools: json<AiIntent[] | null>(row.permitted_tools, null),
    updatedBy: String(row.updated_by || ''),
    updatedAt: iso(row.updated_at)
  };
}

export async function listConversations(schoolId: string, userId: string): Promise<AiConversationRecord[]> {
  const rows = await query<DbRow>(
    'SELECT id, school_id, user_id, title, language, created_at, updated_at FROM ai_conversations ' +
      'WHERE school_id = ? AND user_id = ? AND archived_at IS NULL ORDER BY updated_at DESC LIMIT 50',
    [schoolId, userId]
  );
  return rows.map(conversation);
}

export async function createConversation(input: {
  id: string;
  schoolId: string;
  userId: string;
  title: string;
  language: LanguageCode;
}): Promise<AiConversationRecord> {
  await query(
    'INSERT INTO ai_conversations (id, school_id, user_id, title, language) VALUES (?, ?, ?, ?, ?)',
    [input.id, input.schoolId, input.userId, input.title.slice(0, 200), input.language]
  );
  return {
    id: input.id,
    schoolId: input.schoolId,
    userId: input.userId,
    title: input.title.slice(0, 200),
    language: input.language,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
}

export async function getConversation(schoolId: string, userId: string, id: string): Promise<AiConversationRecord | null> {
  const rows = await query<DbRow>(
    'SELECT id, school_id, user_id, title, language, created_at, updated_at FROM ai_conversations ' +
      'WHERE id = ? AND school_id = ? AND user_id = ? AND archived_at IS NULL LIMIT 1',
    [id, schoolId, userId]
  );
  return rows[0] ? conversation(rows[0]) : null;
}

export async function touchConversation(schoolId: string, userId: string, id: string): Promise<void> {
  await query('UPDATE ai_conversations SET updated_at = CURRENT_TIMESTAMP WHERE id = ? AND school_id = ? AND user_id = ?', [id, schoolId, userId]);
}

export async function deleteConversation(schoolId: string, userId: string, id: string): Promise<boolean> {
  // ai_messages and ai_feedback are ON DELETE CASCADE children.
  const affected = await run(
    'DELETE FROM ai_conversations WHERE id = ? AND school_id = ? AND user_id = ?',
    [id, schoolId, userId]
  );
  return affected > 0;
}

export async function listMessages(schoolId: string, userId: string, conversationId: string, limit = 12): Promise<AiMessageRecord[]> {
  const rows = await query<DbRow>(
    'SELECT id, conversation_id, school_id, user_id, role, content, sources, language, created_at ' +
      'FROM ai_messages WHERE conversation_id = ? AND school_id = ? AND user_id = ? ' +
      'ORDER BY created_at DESC, id DESC LIMIT ?',
    [conversationId, schoolId, userId, Math.max(1, Math.min(100, limit))]
  );
  return rows.map(message).reverse();
}

export async function insertMessage(input: {
  id: string;
  conversationId: string;
  schoolId: string;
  userId: string;
  role: 'user' | 'assistant';
  content: string;
  sources: AiSource[];
  language: LanguageCode;
}): Promise<AiMessageRecord> {
  await query(
    'INSERT INTO ai_messages (id, conversation_id, school_id, user_id, role, content, sources, language) ' +
      'VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    [
      input.id,
      input.conversationId,
      input.schoolId,
      input.userId,
      input.role,
      input.content.slice(0, 60_000),
      JSON.stringify(input.sources.slice(0, 10)),
      input.language
    ]
  );
  return {
    id: input.id,
    conversationId: input.conversationId,
    schoolId: input.schoolId,
    userId: input.userId,
    role: input.role,
    content: input.content,
    sources: input.sources,
    language: input.language,
    createdAt: new Date().toISOString()
  };
}

export async function getAssistantMessage(schoolId: string, userId: string, id: string): Promise<AiMessageRecord | null> {
  const rows = await query<DbRow>(
    'SELECT id, conversation_id, school_id, user_id, role, content, sources, language, created_at ' +
      'FROM ai_messages WHERE id = ? AND school_id = ? AND user_id = ? AND role = ? LIMIT 1',
    [id, schoolId, userId, 'assistant']
  );
  return rows[0] ? message(rows[0]) : null;
}

export async function saveFeedback(input: {
  id: string;
  messageId: string;
  schoolId: string;
  userId: string;
  helpful: boolean;
}): Promise<void> {
  await query(
    'INSERT INTO ai_feedback (id, message_id, school_id, user_id, helpful) VALUES (?, ?, ?, ?, ?) ' +
      'ON DUPLICATE KEY UPDATE helpful = VALUES(helpful), updated_at = CURRENT_TIMESTAMP',
    [input.id, input.messageId, input.schoolId, input.userId, input.helpful ? 1 : 0]
  );
}

export async function getFeedback(schoolId: string, userId: string, messageId: string): Promise<'helpful' | 'not_helpful' | null> {
  const rows = await query<DbRow>(
    'SELECT helpful FROM ai_feedback WHERE message_id = ? AND school_id = ? AND user_id = ? LIMIT 1',
    [messageId, schoolId, userId]
  );
  if (!rows[0]) return null;
  return Boolean(rows[0].helpful) ? 'helpful' : 'not_helpful';
}

export async function recordUsage(input: {
  schoolId: string;
  userId: string;
  role: UserRole;
  action: string;
  model: string;
  status: 'OK' | 'ERROR';
  errorCode?: string | null;
  latencyMs: number;
}): Promise<void> {
  await query(
    'INSERT INTO ai_usage (school_id, user_id, user_role, action, model, status, error_code, latency_ms) ' +
      'VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    [input.schoolId, input.userId, input.role, input.action.slice(0, 60), input.model.slice(0, 100), input.status, input.errorCode?.slice(0, 60) ?? null, Math.min(input.latencyMs, 600_000)]
  );
}

export async function countRecentRequests(schoolId: string, userId: string): Promise<number> {
  const rows = await query<DbRow>(
    'SELECT COUNT(*) AS total FROM ai_usage WHERE school_id = ? AND user_id = ? AND created_at >= DATE_SUB(NOW(), INTERVAL 1 HOUR)',
    [schoolId, userId]
  );
  return rows[0] ? Number(rows[0].total || 0) : 0;
}

export async function replaceMessageContent(
  schoolId: string,
  userId: string,
  id: string,
  content: string,
  sources: AiSource[]
): Promise<AiMessageRecord | null> {
  await run('UPDATE ai_messages SET content = ?, sources = ? WHERE id = ? AND school_id = ? AND user_id = ? AND role = ?', [
    content.slice(0, 60_000),
    JSON.stringify(sources.slice(0, 10)),
    id,
    schoolId,
    userId,
    'assistant'
  ]);
  return getAssistantMessage(schoolId, userId, id);
}

export async function getSettings(schoolId: string): Promise<AiSettingsRecord> {
  const rows = await query<DbRow>('SELECT * FROM ai_settings WHERE school_id = ? LIMIT 1', [schoolId]);
  return settings(rows[0], schoolId);
}

export async function saveSettings(input: AiSettingsRecord): Promise<AiSettingsRecord> {
  await query(
    'INSERT INTO ai_settings (school_id, is_enabled, model, default_language, rate_limit_per_hour, retention_days, allowed_roles, permitted_tools, updated_by) ' +
      'VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) ' +
      'ON DUPLICATE KEY UPDATE is_enabled = VALUES(is_enabled), model = VALUES(model), default_language = VALUES(default_language), ' +
      'rate_limit_per_hour = VALUES(rate_limit_per_hour), retention_days = VALUES(retention_days), ' +
      'allowed_roles = VALUES(allowed_roles), permitted_tools = VALUES(permitted_tools), updated_by = VALUES(updated_by), updated_at = CURRENT_TIMESTAMP',
    [
      input.schoolId,
      input.isEnabled ? 1 : 0,
      input.model.slice(0, 100),
      input.defaultLanguage,
      input.rateLimitPerHour,
      input.retentionDays,
      JSON.stringify(input.allowedRoles),
      JSON.stringify(input.permittedTools),
      input.updatedBy.slice(0, 150)
    ]
  );
  return getSettings(input.schoolId);
}

export async function listKnowledgeForSchool(schoolId: string, includeArchived = false): Promise<AiKnowledgeRecord[]> {
  const sql = includeArchived
    ? 'SELECT * FROM ai_knowledge_documents WHERE school_id = ? ORDER BY updated_at DESC LIMIT 200'
    : 'SELECT * FROM ai_knowledge_documents WHERE school_id = ? AND status <> ? ORDER BY updated_at DESC LIMIT 200';
  const rows = await query<DbRow>(sql, includeArchived ? [schoolId] : [schoolId, 'ARCHIVED']);
  return rows.map(knowledge).map(doc => ({ ...doc, content: doc.content.slice(0, 600) }));
}

export async function createKnowledge(input: {
  id: string;
  schoolId: string;
  title: string;
  category: string;
  visibility: 'SCHOOL' | 'SHARED';
  fileName: string;
  mimeType: string;
  content: string;
  uploadedBy: string;
}): Promise<AiKnowledgeRecord> {
  await query(
    'INSERT INTO ai_knowledge_documents (id, school_id, title, category, visibility, file_name, mime_type, content, status, uploaded_by) ' +
      'VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    [
      input.id,
      input.schoolId,
      input.title.slice(0, 200),
      input.category.slice(0, 80),
      input.visibility,
      input.fileName.slice(0, 255),
      input.mimeType.slice(0, 120),
      input.content.slice(0, 200_000),
      'READY',
      input.uploadedBy.slice(0, 150)
    ]
  );
  return {
    ...input,
    status: 'READY',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
}

export async function updateKnowledge(input: {
  id: string;
  schoolId: string;
  title?: string;
  category?: string;
  visibility?: 'SCHOOL' | 'SHARED';
  content?: string;
  status?: 'PROCESSING' | 'READY' | 'ARCHIVED';
}): Promise<AiKnowledgeRecord | null> {
  const existing = await query<DbRow>(
    'SELECT * FROM ai_knowledge_documents WHERE id = ? AND school_id = ? LIMIT 1',
    [input.id, input.schoolId]
  );
  if (!existing[0]) return null;
  const merged = knowledge(existing[0]);
  await query(
    'UPDATE ai_knowledge_documents SET title = ?, category = ?, visibility = ?, content = ?, status = ? ' +
      'WHERE id = ? AND school_id = ?',
    [
      (input.title ?? merged.title).slice(0, 200),
      (input.category ?? merged.category).slice(0, 80),
      input.visibility ?? merged.visibility,
      (input.content ?? merged.content).slice(0, 200_000),
      input.status ?? merged.status,
      input.id,
      input.schoolId
    ]
  );
  return getKnowledgeById(input.schoolId, input.id);
}

export async function getKnowledgeById(schoolId: string, id: string): Promise<AiKnowledgeRecord | null> {
  const rows = await query<DbRow>('SELECT * FROM ai_knowledge_documents WHERE id = ? AND school_id = ? LIMIT 1', [id, schoolId]);
  return rows[0] ? knowledge(rows[0]) : null;
}

export async function deleteKnowledge(schoolId: string, id: string): Promise<boolean> {
  return (await run('DELETE FROM ai_knowledge_documents WHERE id = ? AND school_id = ?', [id, schoolId])) > 0;
}

export async function searchKnowledge(schoolId: string, question: string): Promise<Array<{ title: string; category: string; excerpt: string }>> {
  const rows = await query<DbRow>(
    "SELECT id, title, category, content FROM ai_knowledge_documents " +
      "WHERE status = 'READY' AND (school_id = ? OR visibility = 'SHARED') LIMIT 200",
    [schoolId]
  );
  const tokens = String(question || '')
    .toLowerCase()
    .split(/[^a-z0-9à-ÿ']+/)
    .filter(token => token.length > 3);
  if (!tokens.length) return [];
  const scored = rows.map(row => {
    const title = String(row.title || '');
    const content = String(row.content || '');
    const haystack = `${title}\n${content}`.toLowerCase();
    const score = tokens.reduce((total, token) => total + (haystack.includes(token) ? 1 : 0), 0);
    return { title, category: String(row.category || 'general'), content, score };
  }).filter(item => item.score > 0).sort((a, b) => b.score - a.score).slice(0, 3);
  return scored.map(item => {
    const lower = item.content.toLowerCase();
    const hit = tokens.find(token => lower.includes(token));
    const index = hit ? lower.indexOf(hit) : 0;
    const start = Math.max(0, index - 500);
    return {
      title: item.title,
      category: item.category,
      excerpt: item.content.slice(start, start + 2000)
    };
  });
}

export async function getUsageStats(schoolId: string, days = 30): Promise<Record<string, unknown>> {
  const rows = await query<DbRow>(
    'SELECT status, action, error_code, COUNT(*) AS count, AVG(latency_ms) AS avgLatency ' +
      'FROM ai_usage WHERE school_id = ? AND created_at >= DATE_SUB(NOW(), INTERVAL ? DAY) ' +
      'GROUP BY status, action, error_code ORDER BY count DESC LIMIT 100',
    [schoolId, Math.max(1, Math.min(365, days))]
  );
  return {
    days,
    rows: rows.map(row => ({
      status: String(row.status),
      action: String(row.action),
      errorCode: row.error_code ? String(row.error_code) : null,
      count: Number(row.count),
      averageLatencyMs: Math.round(Number(row.avgLatency || 0))
    }))
  };
}

export async function listErrorLogs(schoolId: string, days = 7): Promise<AiUsageRecord[]> {
  const rows = await query<DbRow>(
    "SELECT id, school_id, user_id, user_role, action, model, status, error_code, latency_ms, created_at " +
      "FROM ai_usage WHERE school_id = ? AND status = 'ERROR' AND created_at >= DATE_SUB(NOW(), INTERVAL ? DAY) " +
      'ORDER BY created_at DESC LIMIT 100',
    [schoolId, Math.max(1, Math.min(365, days))]
  );
  return rows.map(row => ({
    id: row.id,
    schoolId: String(row.school_id),
    userId: String(row.user_id),
    userRole: String(row.user_role) as UserRole,
    action: String(row.action),
    model: String(row.model),
    status: 'ERROR' as const,
    errorCode: row.error_code ? String(row.error_code) : null,
    latencyMs: Number(row.latency_ms || 0),
    createdAt: iso(row.created_at)
  }));
}

export async function purgeExpiredAiData(schoolId: string, retentionDays: number): Promise<{ conversations: number; usage: number }> {
  const days = Math.max(1, Math.min(3650, retentionDays));
  const conversations = await run(
    'DELETE FROM ai_conversations WHERE school_id = ? AND created_at < DATE_SUB(NOW(), INTERVAL ? DAY)',
    [schoolId, days]
  );
  const usage = await run(
    'DELETE FROM ai_usage WHERE school_id = ? AND created_at < DATE_SUB(NOW(), INTERVAL ? DAY)',
    [schoolId, days]
  );
  return { conversations, usage };
}
