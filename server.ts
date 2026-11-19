import express, { NextFunction, Request, Response } from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import net from 'net';
import crypto from 'crypto';
import dotenv from 'dotenv';
import fs from 'fs';
import multer from 'multer';
import { db } from './server/database';
import { authenticateUser, requirePermission, requireRole } from './server/rbac';
import { checkMysqlHealth, getExportSqlPath, getMysqlPool } from './server/mysqlConnector';
import { getPasswordHash, verifyPassword } from './server/authCredentials';
import { createSession, destroySession } from './server/sessions';
import {
  APPLICATION_STATUSES,
  APPLICATION_TYPES,
  RESULT_SLIP_VERIFICATION_STATUSES,
  UPLOAD_LIMITS,
  assertSameOrigin,
  buildApplication,
  buildSenior3ResultsRecord,
  contactMatches,
  createRateLimiter,
  generateVerificationCode,
  getAllowedDocumentTypes,
  hasActualAcademicData,
  hashValue,
  isValidUpload,
  nextReferenceNumber,
  normalizeAcademicPerformance,
  normalizeContact,
  validateSubmission
} from './server/admissions';
import {
  mirrorAdmissionSettings,
  mirrorAdmissionSlipUpload,
  mirrorApplicationCreate,
  mirrorApplicationUpdate,
  mirrorResultVerificationEvent,
  mirrorReviewNote,
  mirrorSenior3Results,
  mirrorStatusHistory
} from './server/admissionsMysql';
import { extractAcademicPerformance } from './server/resultSlipOcr';
import {
  emailConfigured,
  notifyStatusChange,
  notifySubmission,
  sendVerificationCode,
  smsConfigured
} from './server/notifications';
import {
  AdmissionApplication,
  AdmissionTrackingSummary,
  ApplicationStatus,
  ApplicationType,
  HealthIncident,
  NotificationChannel,
  NotificationMessage,
  Payment,
  ResultSlipVerificationStatus,
  UserProfile,
  UserRole
} from './src/types';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const isProduction = process.env.NODE_ENV === 'production';

async function isPortAvailable(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const tester = net.createServer();

    tester.once('error', () => resolve(false));
    tester.once('listening', () => {
      tester.close(() => resolve(true));
    });

    tester.listen(port, '0.0.0.0');
  });
}

async function resolvePort(preferredPort?: number): Promise<number> {
  const fallbackPorts = [3000, 3010, 3011, 3012, 3020];
  const candidates = preferredPort
    ? Array.from(new Set([preferredPort, ...fallbackPorts]))
    : fallbackPorts;

  for (const port of candidates) {
    const available = await isPortAvailable(port);
    if (available) {
      return port;
    }
  }

  return preferredPort ?? 3000;
}

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

const loginAttempts = new Map<string, { count: number; resetAt: number }>();
const LOGIN_ATTEMPT_LIMIT = 5;
const LOGIN_WINDOW_MS = 15 * 60 * 1000;

// ==========================================
// PUBLIC ADMISSIONS — SECURITY & UPLOAD SETUP
// ==========================================

const UPLOAD_ROOT = path.resolve(
  process.env.ADMISSION_UPLOAD_DIR || path.resolve(process.cwd(), 'data', 'admission-documents')
);

const ALLOWED_UPLOAD_MIMES = new Set(['application/pdf', 'image/jpeg', 'image/png']);

const admissionUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: UPLOAD_LIMITS.maxFileBytes,
    files: UPLOAD_LIMITS.maxFiles,
    fields: 80,
    parts: 90
  },
  fileFilter: (_req, file, callback) => {
    if (ALLOWED_UPLOAD_MIMES.has(file.mimetype.toLowerCase())) {
      callback(null, true);
    } else {
      callback(new Error('Unsupported file type.'));
    }
  }
}).any();

function runAdmissionUpload(req: Request, res: Response, next: NextFunction): void {
  admissionUpload(req, res, error => {
    if (error) {
      res.status(400).json({ error: 'One or more documents could not be uploaded. Check the file type and size.' });
      return;
    }
    next();
  });
}

const SLIP_UPLOAD_DIR = path.join(UPLOAD_ROOT, '.slips');
const SLIP_TTL_MS = 30 * 60 * 1000;

const slipUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: UPLOAD_LIMITS.maxFileBytes,
    files: 1,
    fields: 10,
    parts: 12
  },
  fileFilter: (_req, file, callback) => {
    if (ALLOWED_UPLOAD_MIMES.has(file.mimetype.toLowerCase())) callback(null, true);
    else callback(new Error('Unsupported file type.'));
  }
}).single('resultSlip');

function runSlipUpload(req: Request, res: Response, next: NextFunction): void {
  slipUpload(req, res, error => {
    if (error) {
      res.status(400).json({ error: 'The result slip could not be uploaded. Use a PDF, JPG or PNG up to 5 MB.' });
      return;
    }
    next();
  });
}

function resultSlipExtension(mime: string): string {
  if (mime === 'application/pdf') return '.pdf';
  if (mime === 'image/png') return '.png';
  return '.jpg';
}

function activeSlipUpload(token: string) {
  if (!/^[a-f0-9]{64}$/i.test(token)) return null;
  const record = db.getAdmissionSlipUploadByTokenHash(hashValue(token));
  if (!record || record.consumedAt || record.replacedAt) return null;
  if (new Date(record.expiresAt).getTime() <= Date.now()) return null;
  const filePath = path.resolve(UPLOAD_ROOT, record.storagePath);
  if (!filePath.startsWith(`${UPLOAD_ROOT}${path.sep}`) || !fs.existsSync(filePath)) return null;
  return { record, filePath };
}

function safeFileName(original: string): string {
  return path
    .basename(original)
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .replace(/^\.+/, '')
    .slice(0, 120) || 'document';
}

function sanitizeInput(value: unknown, max = 2000): string {
  if (typeof value !== 'string') return '';
  return value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').trim().slice(0, max);
}

function sanitizeReference(value: unknown): string {
  return sanitizeInput(value, 40).toUpperCase();
}

const submissionRateLimiter = createRateLimiter({ windowMs: 60 * 60 * 1000, max: 8, prefix: 'admission-submit' });
const slipUploadRateLimiter = createRateLimiter({ windowMs: 60 * 60 * 1000, max: 15, prefix: 'admission-slip-upload' });
const slipPreviewRateLimiter = createRateLimiter({ windowMs: 15 * 60 * 1000, max: 30, prefix: 'admission-slip-preview' });
const trackingRequestLimiter = createRateLimiter({ windowMs: 15 * 60 * 1000, max: 6, prefix: 'admission-track-request' });
const trackingVerifyLimiter = createRateLimiter({ windowMs: 15 * 60 * 1000, max: 12, prefix: 'admission-track-verify' });

function requireAdmissionsRole(mode: 'read' | 'write') {
  return requireRole(...MODULE_ACCESS.admissions[mode]);
}

function limitedTrackingSummary(application: AdmissionApplication): AdmissionTrackingSummary {
  const response =
    application.status === 'REJECTED' || application.status === 'ADDITIONAL_INFO_REQUIRED'
      ? application.rejectionReason
      : undefined;
  return {
    referenceNumber: application.referenceNumber,
    applicationType: application.applicationType,
    submittedAt: application.submittedAt,
    status: application.status,
    schoolResponse: response ? sanitizeInput(response, 1000) : undefined
  };
}

function csvCell(value: unknown): string {
  let text = value === undefined || value === null ? '' : String(value);
  text = text.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, ' ');
  if (/^[=+\-@]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}

function findAdminApplication(req: Request, res: Response): AdmissionApplication | null {
  const actor = getActor(req);
  const application = db.getAdmissionById(req.params.id);
  if (!application || (actor.role !== 'SUPER_ADMIN' && application.schoolId !== actor.schoolId)) {
    res.status(404).json({ error: 'Application not found.' });
    return null;
  }
  return application;
}

async function persistMirror(task: () => Promise<void>, label: string): Promise<void> {
  try {
    await task();
  } catch (error) {
    console.warn(`[Admissions] MySQL mirror skipped (${label}):`, error instanceof Error ? error.message : error);
  }
}

const MODULE_ACCESS: Record<string, { read: UserRole[]; write: UserRole[] }> = {
  admissions: {
    read: ['SUPER_ADMIN', 'SCHOOL_ADMIN', 'HEAD_TEACHER', 'DEPUTY_HEAD'],
    write: ['SUPER_ADMIN', 'SCHOOL_ADMIN', 'HEAD_TEACHER']
  },
  documents: {
    read: ['SUPER_ADMIN', 'SCHOOL_ADMIN', 'HEAD_TEACHER', 'DEPUTY_HEAD', 'TEACHER'],
    write: ['SUPER_ADMIN', 'SCHOOL_ADMIN', 'HEAD_TEACHER']
  },
  exams: {
    read: ['SUPER_ADMIN', 'SCHOOL_ADMIN', 'HEAD_TEACHER', 'DEPUTY_HEAD', 'TEACHER'],
    write: ['SUPER_ADMIN', 'SCHOOL_ADMIN', 'HEAD_TEACHER', 'TEACHER']
  },
  'marking-guides': {
    read: ['SUPER_ADMIN', 'SCHOOL_ADMIN', 'HEAD_TEACHER', 'DEPUTY_HEAD', 'TEACHER'],
    write: ['SUPER_ADMIN', 'SCHOOL_ADMIN', 'HEAD_TEACHER', 'TEACHER']
  },
  teaching: {
    read: ['SUPER_ADMIN', 'SCHOOL_ADMIN', 'HEAD_TEACHER', 'DEPUTY_HEAD', 'TEACHER'],
    write: ['SUPER_ADMIN', 'SCHOOL_ADMIN', 'HEAD_TEACHER', 'TEACHER']
  },
  'report-cards': {
    read: ['SUPER_ADMIN', 'SCHOOL_ADMIN', 'HEAD_TEACHER', 'DEPUTY_HEAD', 'TEACHER'],
    write: ['SUPER_ADMIN', 'SCHOOL_ADMIN', 'HEAD_TEACHER', 'TEACHER']
  },
  'sms-email': {
    read: ['SUPER_ADMIN', 'SCHOOL_ADMIN', 'HEAD_TEACHER', 'NURSE'],
    write: ['SUPER_ADMIN', 'SCHOOL_ADMIN', 'HEAD_TEACHER', 'NURSE']
  },
  collaboration: {
    read: ['SUPER_ADMIN', 'SCHOOL_ADMIN', 'HEAD_TEACHER', 'DEPUTY_HEAD', 'TEACHER', 'ACCOUNTANT'],
    write: ['SUPER_ADMIN', 'SCHOOL_ADMIN', 'HEAD_TEACHER', 'DEPUTY_HEAD', 'TEACHER', 'ACCOUNTANT']
  },
  meetings: {
    read: ['SUPER_ADMIN', 'SCHOOL_ADMIN', 'HEAD_TEACHER', 'DEPUTY_HEAD', 'TEACHER', 'ACCOUNTANT'],
    write: ['SUPER_ADMIN', 'SCHOOL_ADMIN', 'HEAD_TEACHER', 'DEPUTY_HEAD', 'TEACHER', 'ACCOUNTANT']
  },
  inventory: {
    read: ['SUPER_ADMIN', 'SCHOOL_ADMIN', 'HEAD_TEACHER', 'ACCOUNTANT'],
    write: ['SUPER_ADMIN', 'SCHOOL_ADMIN', 'HEAD_TEACHER', 'ACCOUNTANT']
  },
  discipline: {
    read: ['SUPER_ADMIN', 'SCHOOL_ADMIN', 'HEAD_TEACHER', 'DEPUTY_HEAD', 'TEACHER'],
    write: ['SUPER_ADMIN', 'SCHOOL_ADMIN', 'HEAD_TEACHER', 'DEPUTY_HEAD']
  },
  'partner-schools': {
    read: ['SUPER_ADMIN', 'SCHOOL_ADMIN', 'HEAD_TEACHER'],
    write: ['SUPER_ADMIN', 'SCHOOL_ADMIN', 'HEAD_TEACHER']
  },
  'ai-training-books': {
    read: [
      'SUPER_ADMIN',
      'SCHOOL_ADMIN',
      'HEAD_TEACHER',
      'DEPUTY_HEAD',
      'TEACHER',
      'NURSE',
      'ACCOUNTANT',
      'PARENT',
      'STUDENT'
    ],
    write: ['SUPER_ADMIN', 'SCHOOL_ADMIN']
  },
  innovations: {
    read: ['SUPER_ADMIN', 'SCHOOL_ADMIN', 'HEAD_TEACHER', 'DEPUTY_HEAD', 'TEACHER'],
    write: ['SUPER_ADMIN', 'SCHOOL_ADMIN', 'HEAD_TEACHER', 'DEPUTY_HEAD', 'TEACHER']
  }
};

function requireModuleAccess(mode: 'read' | 'write') {
  return (req: Request, res: Response, next: NextFunction) => {
    const access = MODULE_ACCESS[req.params.moduleKey];
    if (!access) {
      res.status(404).json({ error: 'Unknown module.' });
      return;
    }
    const allowedRoles = mode === 'read' ? access.read : access.write;
    requireRole(...allowedRoles)(req, res, next);
  };
}

function sanitizeModulePayload(input: unknown): Record<string, unknown> {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return {};

  const reserved = new Set(['id', 'schoolId', 'createdAt', 'updatedAt', 'createdBy', 'deleted', 'deletedAt']);
  const result: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
    if (reserved.has(key)) continue;
    if (!/^[a-zA-Z][a-zA-Z0-9_]{0,49}$/.test(key)) continue;
    if (value === null || typeof value === 'boolean' || typeof value === 'number') {
      result[key] = value;
    } else if (typeof value === 'string') {
      result[key] = value.slice(0, 200_000);
    }
    if (Object.keys(result).length >= 60) break;
  }

  return result;
}

function authorizeApiRequest(req: Request, res: Response, next: () => void): void {
  const { method, path: requestPath } = req;
  const requiresAdmin = requireRole('SUPER_ADMIN', 'SCHOOL_ADMIN');
  const permissionForPath: Array<[string, string]> = [
    ['/guardians', method === 'GET' ? 'guardians:read' : 'guardians:write'],
    ['/attendance', method === 'GET' ? 'attendance:read' : 'attendance:write'],
    ['/health-incidents', method === 'GET' ? 'health:read' : 'health:write'],
    ['/notifications', method === 'GET' ? 'notifications:read' : 'notifications:write'],
    ['/finance', method === 'GET' ? 'finance:read' : 'finance:write'],
    ['/academics', method === 'GET' ? 'academics:read' : 'academics:write'],
    ['/staff', method === 'GET' ? 'staff:read' : 'staff:write'],
    ['/timetable', 'academics:read'],
    ['/homework', 'academics:read'],
    ['/reports', 'reports:read']
  ];

  if (requestPath.startsWith('/schools') && method !== 'GET') {
    requiresAdmin(req, res, next);
    return;
  }
  if (requestPath.startsWith('/mysql')) {
    requiresAdmin(req, res, next);
    return;
  }
  if (requestPath === '/events' && method !== 'GET') {
    requireRole('SUPER_ADMIN', 'SCHOOL_ADMIN', 'HEAD_TEACHER')(req, res, next);
    return;
  }

  const match = permissionForPath.find(([prefix]) => requestPath.startsWith(prefix));
  if (match) {
    requirePermission(match[1])(req, res, next);
    return;
  }
  next();
}

app.use('/api', (req, res, next) => {
  const isPublicSchoolRead = req.method === 'GET' && /^\/schools(?:\/[^/]+)?$/.test(req.path);
  const isLogin = req.method === 'POST' && req.path === '/auth/login';
  const isSessionCheck = req.method === 'GET' && req.path === '/auth/me';
  const isPasswordResetRequest = req.method === 'POST' && req.path === '/auth/password-reset/request';
  const isPublicAdmissions = req.path.startsWith('/public/admissions/');
  if (isPublicSchoolRead || isLogin || isSessionCheck || isPasswordResetRequest || isPublicAdmissions) {
    next();
    return;
  }
  authenticateUser(req, res, () => authorizeApiRequest(req, res, next));
});

// Request logging & Audit trail header extraction
app.use((req, res, next) => {
  res.header('X-App-Platform', 'SchoolCare-Rwanda');
  next();
});

function getActor(req: Request) {
  if (!req.user) throw new Error('Authenticated request is missing its user context.');
  return req.user;
}

// ==========================================
// API ROUTES
// ==========================================

// --- Auth & Users ---
app.post('/api/auth/login', async (req: Request, res: Response) => {
  const email = typeof req.body?.email === 'string' ? req.body.email.trim() : '';
  const password = typeof req.body?.password === 'string' ? req.body.password : '';

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || password.length === 0 || password.length > 128) {
    return res.status(400).json({ error: 'Enter a valid email address and password.' });
  }

  const ip = req.ip || 'unknown';
  const now = Date.now();
  const attempt = loginAttempts.get(ip);
  if (attempt && attempt.resetAt > now && attempt.count >= LOGIN_ATTEMPT_LIMIT) {
    res.setHeader('Retry-After', String(Math.ceil((attempt.resetAt - now) / 1000)));
    return res.status(429).json({ error: 'Too many sign-in attempts. Try again later.' });
  }

  const mysql = await checkMysqlHealth();
  if (!mysql.connected) {
    return res.status(503).json({ error: 'Sign-in requires MySQL. Start MySQL in XAMPP, then try again.' });
  }

  const user = db.getUserByEmail(email);
  let passwordMatches: boolean;
  try {
    passwordMatches = await verifyPassword(password, await getPasswordHash(email));
  } catch (error) {
    console.error('[Auth] Password verification failed:', error);
    const message = error instanceof Error ? error.message : '';
    if (/mysql is unavailable/i.test(message)) {
      return res.status(503).json({ error: 'Sign-in requires MySQL. Start MySQL in XAMPP, then try again.' });
    }
    return res.status(500).json({ error: 'Unable to authenticate at this time.' });
  }
  if (!user || !passwordMatches) {
    const nextAttempt = attempt && attempt.resetAt > now
      ? { count: attempt.count + 1, resetAt: attempt.resetAt }
      : { count: 1, resetAt: now + LOGIN_WINDOW_MS };
    loginAttempts.set(ip, nextAttempt);
    return res.status(401).json({ error: 'Invalid email or password.' });
  }

  loginAttempts.delete(ip);
  createSession(user.id, res);
  db.logAudit(
    user.schoolId,
    user.id,
    user.fullName,
    user.role,
    'USER_LOGIN',
    'USER',
    user.id,
    `User logged in with role ${user.role} from ${req.ip}`,
    req.ip
  );

  return res.json({ user });
});

app.get('/api/auth/me', (req: Request, res: Response) => {
  return res.json({ user: req.user ?? null });
});

app.post('/api/auth/logout', (req: Request, res: Response) => {
  destroySession(req, res);
  return res.json({ success: true });
});

app.post('/api/auth/password-reset/request', (req: Request, res: Response) => {
  const email = typeof req.body?.email === 'string' ? req.body.email.trim() : '';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: 'Enter a valid email address.' });
  }
  return res.status(503).json({
    error: 'Password recovery email is not configured. Please contact your school administrator.'
  });
});

app.get('/api/users', requireRole('SUPER_ADMIN', 'SCHOOL_ADMIN'), (req: Request, res: Response) => {
  const schoolId = (req.query.schoolId as string) || 'school-es-rubengera-01';
  return res.json(db.getUsers(schoolId));
});

// --- AI Assistant (server-side key only) ---
app.post(
  '/api/ai/assistant',
  requireRole('SUPER_ADMIN', 'SCHOOL_ADMIN', 'HEAD_TEACHER', 'DEPUTY_HEAD', 'TEACHER', 'ACCOUNTANT'),
  async (req: Request, res: Response) => {
    const actor = getActor(req);
    const message = typeof req.body?.message === 'string' ? req.body.message.trim() : '';
    const context = typeof req.body?.context === 'string' ? req.body.context.slice(0, 30000) : '';

    if (!message) {
      return res.status(400).json({ error: 'Enter a question for the assistant.' });
    }
    if (message.length > 4000) {
      return res.status(400).json({ error: 'Question is too long. Keep it under 4,000 characters.' });
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return res.status(503).json({
        error: 'AI assistant is not configured. Ask an administrator to set GEMINI_API_KEY on the server.'
      });
    }

    try {
      const upstream = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${encodeURIComponent(apiKey)}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{
              parts: [{
                text: `You are a school administration AI assistant for ES RUBENGERA RTB in Rwanda. Use the following school training material when relevant:\n${context}\n\nUser question: ${message}`
              }]
            }]
          })
        }
      );

      if (!upstream.ok) {
        console.error('[AI] Upstream error:', upstream.status, await upstream.text());
        return res.status(502).json({ error: 'The AI service could not answer right now. Try again later.' });
      }

      const data = await upstream.json() as {
        candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
      };
      const reply = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
      if (!reply) {
        return res.status(502).json({ error: 'The AI service returned an empty response.' });
      }

      db.logAudit(
        actor.schoolId,
        actor.id,
        actor.fullName,
        actor.role,
        'AI_ASSISTANT_QUERY',
        'AI',
        actor.id,
        `AI assistant question (${message.length} chars)`,
        req.ip
      );

      return res.json({ reply });
    } catch (error) {
      console.error('[AI] Request failed:', error);
      return res.status(502).json({ error: 'Unable to reach the AI service right now.' });
    }
  }
);

// --- Schools ---
app.get('/api/schools', (req: Request, res: Response) => {
  return res.json(db.getSchools());
});

app.get('/api/schools/:id', (req: Request, res: Response) => {
  const school = db.getSchool(req.params.id);
  if (!school) return res.status(404).json({ error: 'School not found' });
  return res.json(school);
});

app.patch('/api/schools/:id', (req: Request, res: Response) => {
  const updated = db.updateSchool(req.params.id, req.body);
  if (!updated) return res.status(404).json({ error: 'School not found' });
  const actor = getActor(req);
  db.logAudit(
    updated.id,
    actor.id,
    actor.fullName,
    actor.role,
    'UPDATE_SCHOOL_SETTINGS',
    'SCHOOL',
    updated.id,
    `Updated school contact info / academic settings`,
    req.ip
  );
  return res.json(updated);
});

// --- Students ---
app.get('/api/students', requirePermission('students:read'), async (req: Request, res: Response) => {
  try {
    const schoolId = (req.query.schoolId as string) || 'school-es-rubengera-01';
    const classId = req.query.classId as string | undefined;
    const search = req.query.search as string | undefined;
    const actor = req.user;

    const pool = getMysqlPool();
    const mysqlStatus = await checkMysqlHealth();
    const mysqlPool = pool;

    if (!mysqlPool || !mysqlStatus.connected) {
      const students = db.getStudents(schoolId, classId, search);
      return res.json(students);
    }

    let sql = 'SELECT * FROM students WHERE school_id = ?';
    const params: any[] = [schoolId];

    if (actor?.role === 'PARENT') {
      const linkedStudentIds = actor.linkedStudentIds ?? [];
      if (!linkedStudentIds.length) {
        return res.json([]);
      }
      sql += ` AND id IN (${linkedStudentIds.map(() => '?').join(',')})`;
      params.push(...linkedStudentIds);
    }

    if (actor?.role === 'STUDENT') {
      if (!actor.studentId) {
        return res.json([]);
      }
      sql += ' AND id = ?';
      params.push(actor.studentId);
    }

    if (classId) {
      sql += ' AND class_id = ?';
      params.push(classId);
    }

    if (search) {
      sql += ' AND (first_name LIKE ? OR last_name LIKE ? OR admission_number LIKE ?)';
      const term = `%${search}%`;
      params.push(term, term, term);
    }

    const [rows] = await mysqlPool.execute(sql, params);

    const students = (rows as any[]).map((row) => ({
      id: row.id,
      schoolId: row.school_id,
      admissionNumber: row.admission_number,
      firstName: row.first_name,
      lastName: row.last_name,
      gender: row.gender,
      dob: row.dob instanceof Date
        ? row.dob.toISOString().split('T')[0]
        : String(row.dob).split('T')[0],
      classId: row.class_id,
      className: row.class_name,
      combination: row.combination,
      enrollmentStatus: row.enrollment_status,
      admissionDate: row.admission_date instanceof Date
        ? row.admission_date.toISOString().split('T')[0]
        : String(row.admission_date).split('T')[0],
      bloodGroup: row.blood_group,
      allergies: row.allergies,
      medicalNotes: row.medical_notes,
      photoUrl: row.photo_url,
      nationalId: row.national_id,
      previousSchool: row.previous_school
    }));

    return res.json(students);
  } catch (error) {
    console.error('[MySQL] Student listing failed:', error);
    return res.status(500).json({ error: 'Unable to load students from MySQL' });
  }
});

app.get('/api/students/:id', requirePermission('students:read'), (req: Request, res: Response) => {
  const student = db.getStudentById(req.params.id);
  if (!student) return res.status(404).json({ error: 'Student not found' });

  const actor = req.user;
  if (actor && actor.role === 'PARENT' && actor.linkedStudentIds && !actor.linkedStudentIds.includes(student.id)) {
    return res.status(403).json({ error: 'You are not authorized to access that student record.' });
  }

  if (actor && actor.role === 'STUDENT' && actor.studentId && actor.studentId !== student.id) {
    return res.status(403).json({ error: 'You are not authorized to access that student record.' });
  }

  const guardians = db.getGuardiansForStudent(student.id);
  return res.json({ ...student, guardians });
});

app.post('/api/students', requirePermission('students:write'), async (req: Request, res: Response) => {
  try {
    const actor = getActor(req);
    const body = req.body;
    const pool = getMysqlPool();
    const mysqlStatus = await checkMysqlHealth();
    const mysqlPool = pool;

    if (!body.firstName || !body.lastName || !body.dob) {
      return res.status(400).json({
        error: 'First name, last name and date of birth are required'
      });
    }

    if (!mysqlPool || !mysqlStatus.connected) {
      const schoolId = body.schoolId || 'school-es-rubengera-01';
      const classId = body.classId || 'class-l4-sod-a';
      const fallbackClass = db.getClasses(schoolId).find(cls => cls.id === classId) ?? db.getClasses(schoolId)[0];
      const newStudent = {
        id: `std-${Date.now()}`,
        schoolId,
        admissionNumber: body.admissionNumber || `ESR-${new Date().getFullYear()}-${Date.now()}`,
        firstName: body.firstName,
        lastName: body.lastName,
        gender: body.gender || 'M',
        dob: body.dob,
        classId: fallbackClass?.id ?? classId,
        className: fallbackClass?.name ?? 'Unknown Class',
        combination: body.combination || fallbackClass?.combination || '',
        enrollmentStatus: 'ACTIVE',
        admissionDate: body.admissionDate || new Date().toISOString().split('T')[0],
        bloodGroup: body.bloodGroup || 'O+',
        allergies: body.allergies || 'None',
        medicalNotes: body.medicalNotes || '',
        photoUrl: body.photoUrl || '',
        nationalId: body.nationalId || null,
        previousSchool: body.previousSchool || null
      } as any;

      const created = db.createStudent(newStudent);
      db.logAudit(
        created.schoolId,
        actor.id,
        actor.fullName,
        actor.role,
        'REGISTER_STUDENT',
        'STUDENT',
        created.id,
        `Registered new student: ${created.firstName} ${created.lastName}`,
        req.ip
      );

      return res.status(201).json(created);
    }

    const schoolId = body.schoolId || 'school-es-rubengera-01';
    const classId = body.classId || 'class-l4-sod-a';

    const [classRows] = await mysqlPool.execute(
      'SELECT name, combination FROM classes WHERE id = ? AND school_id = ?',
      [classId, schoolId]
    );

    const classInfo = (classRows as any[])[0];

    if (!classInfo) {
      return res.status(400).json({ error: 'Invalid class selected' });
    }

    const newStudent = {
      id: `std-${Date.now()}`,
      schoolId,
      admissionNumber: body.admissionNumber ||
        `ESR-${new Date().getFullYear()}-${Date.now()}`,
      firstName: body.firstName,
      lastName: body.lastName,
      gender: body.gender || 'M',
      dob: body.dob,
      classId,
      className: classInfo.name,
      combination: body.combination || classInfo.combination || '',
      enrollmentStatus: 'ACTIVE',
      admissionDate: body.admissionDate ||
        new Date().toISOString().split('T')[0],
      bloodGroup: body.bloodGroup || 'O+',
      allergies: body.allergies || 'None',
      medicalNotes: body.medicalNotes || '',
      photoUrl: body.photoUrl || '',
      nationalId: body.nationalId || null,
      previousSchool: body.previousSchool || null
    };

    await mysqlPool.execute(
      `INSERT INTO students (
        id, school_id, admission_number, first_name, last_name,
        gender, dob, class_id, class_name, combination,
        enrollment_status, admission_date, blood_group,
        allergies, medical_notes, photo_url, national_id, previous_school
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        newStudent.id, newStudent.schoolId, newStudent.admissionNumber,
        newStudent.firstName, newStudent.lastName, newStudent.gender,
        newStudent.dob, newStudent.classId, newStudent.className,
        newStudent.combination, newStudent.enrollmentStatus,
        newStudent.admissionDate, newStudent.bloodGroup,
        newStudent.allergies, newStudent.medicalNotes, newStudent.photoUrl,
        newStudent.nationalId, newStudent.previousSchool
      ]
    );

    db.logAudit(
      newStudent.schoolId, actor.id, actor.fullName, actor.role,
      'REGISTER_STUDENT', 'STUDENT', newStudent.id,
      `Registered new student: ${newStudent.firstName} ${newStudent.lastName}`,
      req.ip
    );

    return res.status(201).json(newStudent);
  } catch (error: any) {
    console.error('[MySQL] Student registration failed:', error);

    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({
        error: 'This admission number already exists'
      });
    }

    return res.status(500).json({
      error: 'Unable to register student in MySQL'
    });
  }
});

app.patch('/api/students/:id', requirePermission('students:write'), async (req: Request, res: Response) => {
  try {
    const actor = getActor(req);
    const pool = getMysqlPool();
    const mysqlStatus = await checkMysqlHealth();
    const mysqlPool = pool;
    const studentId = req.params.id;
    const body = req.body;

    if (!mysqlPool || !mysqlStatus.connected) {
      const existing = db.getStudentById(studentId);
      if (!existing) {
        return res.status(404).json({ error: 'Student not found' });
      }

      const updatedStudent = db.updateStudent(studentId, {
        firstName: body.firstName ?? existing.firstName,
        lastName: body.lastName ?? existing.lastName,
        gender: body.gender ?? existing.gender,
        dob: body.dob ?? existing.dob,
        classId: body.classId ?? existing.classId,
        className: body.className ?? existing.className,
        combination: body.combination ?? existing.combination,
        enrollmentStatus: body.enrollmentStatus ?? existing.enrollmentStatus,
        admissionDate: body.admissionDate ?? existing.admissionDate,
        bloodGroup: body.bloodGroup ?? existing.bloodGroup,
        allergies: body.allergies ?? existing.allergies,
        medicalNotes: body.medicalNotes ?? existing.medicalNotes,
        photoUrl: body.photoUrl ?? existing.photoUrl,
        nationalId: body.nationalId ?? existing.nationalId,
        previousSchool: body.previousSchool ?? existing.previousSchool
      });

      if (!updatedStudent) {
        return res.status(404).json({ error: 'Student not found' });
      }

      db.logAudit(
        updatedStudent.schoolId,
        actor.id,
        actor.fullName,
        actor.role,
        'UPDATE_STUDENT',
        'STUDENT',
        updatedStudent.id,
        `Updated profile of student ${updatedStudent.firstName} ${updatedStudent.lastName}`,
        req.ip
      );

      return res.json(updatedStudent);
    }

    const [existingRows] = await mysqlPool.execute(
      'SELECT * FROM students WHERE id = ?',
      [studentId]
    );

    const existing = (existingRows as any[])[0];

    if (!existing) {
      return res.status(404).json({
        error: 'Student not found'
      });
    }

    const allowedFields = [
      'firstName',
      'lastName',
      'gender',
      'dob',
      'classId',
      'combination',
      'enrollmentStatus',
      'admissionDate',
      'bloodGroup',
      'allergies',
      'medicalNotes',
      'photoUrl',
      'nationalId',
      'previousSchool'
    ];

    const fieldMap: Record<string, string> = {
      firstName: 'first_name',
      lastName: 'last_name',
      gender: 'gender',
      dob: 'dob',
      classId: 'class_id',
      combination: 'combination',
      enrollmentStatus: 'enrollment_status',
      admissionDate: 'admission_date',
      bloodGroup: 'blood_group',
      allergies: 'allergies',
      medicalNotes: 'medical_notes',
      photoUrl: 'photo_url',
      nationalId: 'national_id',
      previousSchool: 'previous_school'
    };

    const updates: string[] = [];
    const values: any[] = [];

    for (const field of allowedFields) {
      if (Object.prototype.hasOwnProperty.call(body, field)) {
        updates.push(`${fieldMap[field]} = ?`);
        values.push(body[field] ?? null);
      }
    }

    if (body.classId) {
      const [classRows] = await mysqlPool.execute(
        'SELECT name FROM classes WHERE id = ? AND school_id = ?',
        [body.classId, existing.school_id]
      );

      const classInfo = (classRows as any[])[0];

      if (!classInfo) {
        return res.status(400).json({
          error: 'Invalid class selected'
        });
      }

      updates.push('class_name = ?');
      values.push(classInfo.name);
    }

    if (updates.length > 0) {
      values.push(studentId);

      await mysqlPool.execute(
        `UPDATE students SET ${updates.join(', ')} WHERE id = ?`,
        values
      );
    }

    const [updatedRows] = await mysqlPool.execute(
      'SELECT * FROM students WHERE id = ?',
      [studentId]
    );

    const row = (updatedRows as any[])[0];

    const updated = {
      id: row.id,
      schoolId: row.school_id,
      admissionNumber: row.admission_number,
      firstName: row.first_name,
      lastName: row.last_name,
      gender: row.gender,
      dob: row.dob instanceof Date
        ? row.dob.toISOString().split('T')[0]
        : String(row.dob).split('T')[0],
      classId: row.class_id,
      className: row.class_name,
      combination: row.combination,
      enrollmentStatus: row.enrollment_status,
      admissionDate: row.admission_date instanceof Date
        ? row.admission_date.toISOString().split('T')[0]
        : String(row.admission_date).split('T')[0],
      bloodGroup: row.blood_group,
      allergies: row.allergies,
      medicalNotes: row.medical_notes,
      photoUrl: row.photo_url,
      nationalId: row.national_id,
      previousSchool: row.previous_school
    };

    db.logAudit(
      updated.schoolId,
      actor.id,
      actor.fullName,
      actor.role,
      'UPDATE_STUDENT',
      'STUDENT',
      updated.id,
      `Updated profile of student ${updated.firstName} ${updated.lastName}`,
      req.ip
    );

    return res.json(updated);

  } catch (error: any) {
    console.error('[MySQL] Student update failed:', error);

    return res.status(500).json({
      error: 'Unable to update student in MySQL'
    });
  }
});
// --- Guardians & Links ---
app.get('/api/guardians', (req: Request, res: Response) => {
  const schoolId = (req.query.schoolId as string) || 'school-es-rubengera-01';
  return res.json(db.getGuardians(schoolId));
});

app.post('/api/guardians', (req: Request, res: Response) => {
  const actor = getActor(req);
  const body = req.body;
  const newGuardian = {
    id: `grd-${Date.now()}`,
    schoolId: body.schoolId || 'school-es-rubengera-01',
    fullName: body.fullName,
    relationship: body.relationship || 'GUARDIAN',
    phone: body.phone,
    altPhone: body.altPhone,
    email: body.email,
    nationalId: body.nationalId,
    occupation: body.occupation,
    address: body.address || 'Karongi, Western Province',
    preferredLanguage: body.preferredLanguage || 'rw',
    preferredChannel: body.preferredChannel || 'SMS',
    isVerified: true,
    canPickup: body.canPickup ?? true,
    emergencyPriority: body.emergencyPriority || 1
  };

  const created = db.createGuardian(newGuardian, body.studentId, body.relationship);
  db.logAudit(
    created.schoolId,
    actor.id,
    actor.fullName,
    actor.role,
    'REGISTER_GUARDIAN',
    'GUARDIAN',
    created.id,
    `Added guardian ${created.fullName} (${created.phone}) linked to student ${body.studentId || 'none'}`,
    req.ip
  );
  return res.status(201).json(created);
});

app.get('/api/guardians/student/:studentId', (req: Request, res: Response) => {
  const guardians = db.getGuardiansForStudent(req.params.studentId);
  return res.json(guardians);
});

app.get('/api/guardians/my-children/:guardianId', requireRole('PARENT'), (req: Request, res: Response) => {
  const actor = req.user;
  if (actor && actor.role === 'PARENT' && actor.id !== req.params.guardianId) {
    return res.status(403).json({ error: 'Parents can only view records for their own linked children.' });
  }

  const children = db.getStudentsForGuardian(req.params.guardianId);
  return res.json(children);
});

// --- Attendance ---
app.get('/api/attendance', requirePermission('attendance:read'), (req: Request, res: Response) => {
  const schoolId = (req.query.schoolId as string) || 'school-es-rubengera-01';
  const date = req.query.date as string | undefined;
  const classId = req.query.classId as string | undefined;
  return res.json(db.getAttendance(schoolId, date, classId));
});

app.post('/api/attendance/batch', requirePermission('attendance:write'), (req: Request, res: Response) => {
  const actor = getActor(req);
  const records = req.body.records;
  if (!Array.isArray(records)) {
    return res.status(400).json({ error: 'records array required' });
  }

  const saved = db.saveAttendanceBatch(records);

  if (req.body.notifyAbsences) {
    const absentRecords = records.filter(r => r.status === 'ABSENT');
    for (const rec of absentRecords) {
      const guardians = db.getGuardiansForStudent(rec.studentId);
      for (const item of guardians) {
        db.queueNotification({
          id: `msg-att-${Date.now()}-${Math.random().toString(36).substring(2, 5)}`,
          schoolId: rec.schoolId,
          recipientId: item.guardian.id,
          recipientName: item.guardian.fullName,
          recipientPhone: item.guardian.phone,
          recipientEmail: item.guardian.email,
          channel: item.guardian.preferredChannel || 'SMS',
          category: 'ATTENDANCE',
          priority: 'ROUTINE',
          titleEn: `Attendance Notice: ${rec.studentName}`,
          titleRw: `Kumenyesha Gusiba: ${rec.studentName}`,
          contentEn: `SchoolCare Notice: ${rec.studentName} (${rec.className}) was marked absent on ${rec.date}. Please submit an explanation via portal or contact ES Rubengera.`,
          contentRw: `Ubutumwa bwa SchoolCare: ${rec.studentName} (${rec.className}) ntiyabonetse ku ishuri ku itariki ${rec.date}. Nyamuneka tanga ibisobanuro ku rubuga cyangwa uhamagare ishuri.`,
          status: 'QUEUED',
          createdAt: new Date().toISOString(),
          relatedEntityId: rec.id
        });
      }
    }
  }

  db.logAudit(
    records[0]?.schoolId || 'school-es-rubengera-01',
    actor.id,
    actor.fullName,
    actor.role,
    'RECORD_ATTENDANCE',
    'ATTENDANCE',
    `batch-${records.length}`,
    `Recorded attendance for ${records.length} students.`,
    req.ip
  );

  return res.json({ success: true, savedCount: saved.length });
});

app.post('/api/attendance/:id/explain', (req: Request, res: Response) => {
  const { explanation } = req.body;
  const updated = db.updateAttendanceExplanation(req.params.id, explanation);
  if (!updated) return res.status(404).json({ error: 'Record not found' });
  const actor = getActor(req);
  db.logAudit(
    updated.schoolId,
    actor.id,
    actor.fullName,
    actor.role,
    'EXPLAIN_ABSENCE',
    'ATTENDANCE',
    updated.id,
    `Parent provided absence justification: "${explanation}"`,
    req.ip
  );
  return res.json(updated);
});

// --- Health & Emergency Incidents ---
app.get('/api/health-incidents', (req: Request, res: Response) => {
  const schoolId = (req.query.schoolId as string) || 'school-es-rubengera-01';
  return res.json(db.getHealthIncidents(schoolId));
});

app.get('/api/health-incidents/:id', (req: Request, res: Response) => {
  const incident = db.getHealthIncidentById(req.params.id);
  if (!incident) return res.status(404).json({ error: 'Incident not found' });
  return res.json(incident);
});

app.post('/api/health-incidents', (req: Request, res: Response) => {
  const actor = getActor(req);
  const body = req.body;
  const refNum = `EMG-${new Date().getFullYear()}-${String(Math.floor(Math.random() * 9000) + 1000)}`;

  const newIncident: HealthIncident = {
    id: `inc-${Date.now()}`,
    schoolId: body.schoolId || 'school-es-rubengera-01',
    referenceNumber: refNum,
    studentId: body.studentId,
    studentName: body.studentName,
    studentClass: body.studentClass || 'Level 4 SOD A',
    date: body.date || new Date().toISOString().split('T')[0],
    time: body.time || new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    category: body.category || 'ILLNESS',
    priority: body.priority || 'URGENT',
    symptoms: body.symptoms || '',
    observations: body.observations || '',
    temperature: body.temperature || '38.5 °C',
    pulse: body.pulse || '90 bpm',
    actionsTaken: body.actionsTaken || 'Administered initial care in infirmary.',
    responsibleStaffName: body.responsibleStaffName || actor.fullName,
    guardianId: body.guardianId,
    guardianName: body.guardianName,
    guardianPhone: body.guardianPhone,
    contactStatus: 'ATTEMPTED',
    parentAcknowledged: false,
    handoverArrangement: body.handoverArrangement,
    medicalReferral: body.medicalReferral,
    outcome: body.outcome || 'RESTING_IN_INFIRMARY',
    resolved: false,
    createdAt: new Date().toISOString(),
    timeline: [
      {
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        action: `Reported incident ${refNum} (${body.priority}): ${body.symptoms}`,
        actor: actor.fullName
      }
    ]
  };

  const created = db.createHealthIncident(newIncident);

  if (body.guardianPhone) {
    db.queueNotification({
      id: `msg-emg-${Date.now()}`,
      schoolId: created.schoolId,
      recipientId: body.guardianId || 'grd-01',
      recipientName: body.guardianName || 'Parent',
      recipientPhone: body.guardianPhone,
      channel: 'WHATSAPP',
      category: 'EMERGENCY',
      priority: created.priority,
      titleEn: `[HEALTH ALERT ${refNum}] ${created.studentName}`,
      titleRw: `[UBUTUMWA BW�?TUBUZIMA ${refNum}] ${created.studentName}`,
      contentEn: `Urgent notice from ES Rubengera Infirmary: ${created.studentName} requires attention for ${created.symptoms}. Please review in SchoolCare.`,
      contentRw: `Ubutumwa bwihutirwa buturutse mu buvuzi bwa ES Rubengera: ${created.studentName} akeneye kwitabwaho kubera ${created.symptoms}. Nyamuneka musuzume muri SchoolCare.`,
      status: 'QUEUED',
      createdAt: new Date().toISOString(),
      relatedEntityId: created.id
    });
  }

  db.logAudit(
    created.schoolId,
    actor.id,
    actor.fullName,
    actor.role,
    'CREATE_HEALTH_INCIDENT',
    'HEALTH_INCIDENT',
    created.id,
    `Created health incident ${refNum} for ${created.studentName} (Priority: ${created.priority})`,
    req.ip
  );

  return res.status(201).json(created);
});

app.post('/api/health-incidents/:id/action', (req: Request, res: Response) => {
  const actor = getActor(req);
  const { action } = req.body;
  const updated = db.addIncidentAction(req.params.id, action, actor.fullName);
  if (!updated) return res.status(404).json({ error: 'Incident not found' });
  return res.json(updated);
});

app.post('/api/health-incidents/:id/acknowledge', (req: Request, res: Response) => {
  const actor = getActor(req);
  const { notes } = req.body;
  const updated = db.acknowledgeIncident(req.params.id, notes);
  if (!updated) return res.status(404).json({ error: 'Incident not found' });
  db.logAudit(
    updated.schoolId,
    actor.id,
    actor.fullName,
    actor.role,
    'ACKNOWLEDGE_HEALTH_ALERT',
    'HEALTH_INCIDENT',
    updated.id,
    `Guardian acknowledged emergency incident ${updated.referenceNumber}`,
    req.ip
  );
  return res.json(updated);
});

// --- Notifications Hub ---
app.get('/api/notifications', (req: Request, res: Response) => {
  const schoolId = (req.query.schoolId as string) || 'school-es-rubengera-01';
  return res.json(db.getNotifications(schoolId));
});

app.post('/api/notifications/send', (req: Request, res: Response) => {
  const actor = getActor(req);
  const body = req.body;
  const allowedChannels: NotificationChannel[] = ['SMS', 'WHATSAPP', 'EMAIL', 'IN_APP'];
  const allowedCategories: NotificationMessage['category'][] = [
    'EMERGENCY',
    'HEALTH',
    'ATTENDANCE',
    'ACADEMIC',
    'FEES',
    'MEETINGS',
    'ANNOUNCEMENTS',
    'TIMETABLE',
    'GENERAL'
  ];
  const allowedPriorities: NotificationMessage['priority'][] = ['ROUTINE', 'URGENT', 'EMERGENCY'];
  const channel = body.channel as NotificationChannel;
  const category = body.category as NotificationMessage['category'];
  const priority = body.priority as NotificationMessage['priority'];
  const recipientId = typeof body.recipientId === 'string' ? body.recipientId.trim() : '';
  const recipientName = typeof body.recipientName === 'string' ? body.recipientName.trim() : '';
  const recipientPhone = typeof body.recipientPhone === 'string' ? body.recipientPhone.trim() : '';
  const recipientEmail = typeof body.recipientEmail === 'string' ? body.recipientEmail.trim() : '';
  const contentEn = typeof body.contentEn === 'string' ? body.contentEn.trim() : '';
  const contentRw = typeof body.contentRw === 'string' ? body.contentRw.trim() : '';

  if (!allowedChannels.includes(channel)) {
    return res.status(400).json({ error: 'Choose a supported message channel.' });
  }
  if (!allowedCategories.includes(category) || !allowedPriorities.includes(priority)) {
    return res.status(400).json({ error: 'Choose a supported message type and priority.' });
  }
  if (!recipientId || !recipientName || (!contentEn && !contentRw)) {
    return res.status(400).json({ error: 'A recipient and message body are required.' });
  }
  if (channel === 'EMAIL' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipientEmail)) {
    return res.status(400).json({ error: 'A valid recipient email address is required.' });
  }
  if ((channel === 'SMS' || channel === 'WHATSAPP') && !/^\+?[\d\s()-]{7,20}$/.test(recipientPhone)) {
    return res.status(400).json({ error: 'A valid recipient phone number is required.' });
  }

  const newMsg: NotificationMessage = {
    id: `msg-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
    schoolId: body.schoolId || 'school-es-rubengera-01',
    recipientId,
    recipientName,
    recipientPhone,
    recipientEmail: recipientEmail || undefined,
    channel,
    category,
    priority,
    titleEn: typeof body.titleEn === 'string' && body.titleEn.trim() ? body.titleEn.trim() : 'School Notice',
    titleRw: typeof body.titleRw === 'string' && body.titleRw.trim() ? body.titleRw.trim() : 'Itangazo ry’Isuri',
    contentEn,
    contentRw,
    status: 'QUEUED',
    createdAt: new Date().toISOString(),
  };

  const queued = db.queueNotification(newMsg);
  db.logAudit(
    queued.schoolId,
    actor.id,
    actor.fullName,
    actor.role,
    'QUEUE_NOTIFICATION',
    'NOTIFICATION',
    queued.id,
    `Queued ${queued.channel} message for ${queued.recipientName}`,
    req.ip
  );
  return res.status(201).json(queued);
});

app.post('/api/notifications/:id/acknowledge', (req: Request, res: Response) => {
  const updated = db.updateNotificationStatus(req.params.id, 'ACKNOWLEDGED');
  if (!updated) return res.status(404).json({ error: 'Notification not found' });
  return res.json(updated);
});

// --- Finance ---
app.get('/api/finance/fee-structures', (req: Request, res: Response) => {
  const schoolId = (req.query.schoolId as string) || 'school-es-rubengera-01';
  return res.json(db.getFeeStructures(schoolId));
});

app.get('/api/finance/invoices', (req: Request, res: Response) => {
  const schoolId = (req.query.schoolId as string) || 'school-es-rubengera-01';
  const studentId = req.query.studentId as string | undefined;
  return res.json(db.getInvoices(schoolId, studentId));
});

app.get('/api/finance/payments', (req: Request, res: Response) => {
  const schoolId = (req.query.schoolId as string) || 'school-es-rubengera-01';
  const studentId = req.query.studentId as string | undefined;
  return res.json(db.getPayments(schoolId, studentId));
});

app.post('/api/finance/payments', (req: Request, res: Response) => {
  const actor = getActor(req);
  const body = req.body;
  const receiptNo = `REC-2026-${String(Math.floor(Math.random() * 9000) + 1000)}`;

  const newPayment: Payment = {
    id: `pay-${Date.now()}`,
    schoolId: body.schoolId || 'school-es-rubengera-01',
    invoiceId: body.invoiceId,
    receiptNumber: receiptNo,
    studentId: body.studentId,
    studentName: body.studentName,
    amountRwf: Number(body.amountRwf),
    method: body.method || 'MTN_MOMO',
    reference: body.reference || `MOMO-RW-${Date.now()}`,
    payerName: body.payerName || actor.fullName,
    payerPhone: body.payerPhone || '+250 788 000 000',
    status: 'COMPLETED',
    date: new Date().toISOString().split('T')[0]
  };

  const result = db.recordPayment(newPayment);
  db.logAudit(
    newPayment.schoolId,
    actor.id,
    actor.fullName,
    actor.role,
    'RECORD_PAYMENT',
    'PAYMENT',
    newPayment.id,
    `Recorded payment of ${newPayment.amountRwf.toLocaleString()} RWF via ${newPayment.method} (Receipt: ${receiptNo})`,
    req.ip
  );
  return res.status(201).json(result);
});

// --- Academics & Report Cards ---
app.get('/api/academics/classes', (req: Request, res: Response) => {
  const schoolId = (req.query.schoolId as string) || 'school-es-rubengera-01';
  return res.json(db.getClasses(schoolId));
});

app.get('/api/academics/subjects', (req: Request, res: Response) => {
  const schoolId = (req.query.schoolId as string) || 'school-es-rubengera-01';
  return res.json(db.getSubjects(schoolId));
});

app.get('/api/academics/report-cards', (req: Request, res: Response) => {
  const schoolId = (req.query.schoolId as string) || 'school-es-rubengera-01';
  const studentId = req.query.studentId as string | undefined;
  return res.json(db.getReportCards(schoolId, studentId));
});

// --- Staff, Timetable, Homework, Events, Audit ---
app.get('/api/staff', (req: Request, res: Response) => {
  const schoolId = (req.query.schoolId as string) || 'school-es-rubengera-01';
  return res.json(db.getStaff(schoolId));
});

app.get('/api/timetable', (req: Request, res: Response) => {
  const schoolId = (req.query.schoolId as string) || 'school-es-rubengera-01';
  const classId = req.query.classId as string | undefined;
  return res.json(db.getTimetable(schoolId, classId));
});

app.get('/api/homework', (req: Request, res: Response) => {
  const schoolId = (req.query.schoolId as string) || 'school-es-rubengera-01';
  const classId = req.query.classId as string | undefined;
  return res.json(db.getHomework(schoolId, classId));
});

// --- Executive Reports & Analytics Engine ---
app.get('/api/reports/analytics', (req: Request, res: Response) => {
  const schoolId = (req.query.schoolId as string) || 'school-es-rubengera-01';
  const term = (req.query.term as string) || 'Term 1';

  const students = db.getStudents(schoolId);
  const reportCards = db.getReportCards(schoolId);
  const attendance = db.getAttendance(schoolId);
  const health = db.getHealthIncidents(schoolId);
  const invoices = db.getInvoices(schoolId);
  const payments = db.getPayments(schoolId);
  const messages = db.getNotifications(schoolId);
  const classes = db.getClasses(schoolId);
  const subjects = db.getSubjects(schoolId);

  // 1. Academic Aggregation
  const totalEvaluated = reportCards.length || 1;
  const overallAverage = Number(
    (reportCards.reduce((acc, r) => acc + r.overallAverage, 0) / totalEvaluated).toFixed(1)
  );
  const passedStudents = reportCards.filter(r => r.overallAverage >= 50).length;
  const passRate = Number(((passedStudents / totalEvaluated) * 100).toFixed(1));

  const gradeDistribution = {
    A: reportCards.filter(r => r.overallAverage >= 80).length,
    B: reportCards.filter(r => r.overallAverage >= 70 && r.overallAverage < 80).length,
    C: reportCards.filter(r => r.overallAverage >= 60 && r.overallAverage < 70).length,
    D: reportCards.filter(r => r.overallAverage >= 50 && r.overallAverage < 60).length,
    F: reportCards.filter(r => r.overallAverage < 50).length
  };

  // 2. Attendance Aggregation
  const totalAtt = attendance.length || 1;
  const presentCount = attendance.filter(a => a.status === 'PRESENT').length;
  const absentCount = attendance.filter(a => a.status === 'ABSENT').length;
  const lateCount = attendance.filter(a => a.status === 'LATE').length;
  const excusedCount = attendance.filter(a => a.status === 'EXCUSED' || a.status === 'SICK' || a.status === 'AUTHORIZED_LEAVE').length;
  const attendanceRate = Number(((presentCount / totalAtt) * 100).toFixed(1));

  // Chronic absenteeism: students with at least 1 unexcused absence
  const chronicAbsentStudents = students.filter(s =>
    attendance.some(a => a.studentId === s.id && a.status === 'ABSENT' && !a.parentExplanation)
  );

  // 3. Health & Infirmary Registry Aggregation
  const urgentHealthCases = health.filter(h => h.priority === 'URGENT' || h.priority === 'EMERGENCY').length;
  const hospitalReferrals = health.filter(h => h.outcome === 'REFERRED_TO_HOSPITAL').length;
  const acknowledgedHealthAlerts = health.filter(h => h.parentAcknowledged).length;
  const ackRate = health.length > 0 ? Number(((acknowledgedHealthAlerts / health.length) * 100).toFixed(1)) : 100;

  // 4. Financial Reconciliation Aggregation
  const totalBilledRwf = invoices.reduce((acc, i) => acc + i.totalAmountRwf, 0);
  const totalCollectedRwf = invoices.reduce((acc, i) => acc + i.paidAmountRwf, 0);
  const totalOutstandingRwf = invoices.reduce((acc, i) => acc + i.balanceRwf, 0);
  const collectionEfficiency = totalBilledRwf > 0 ? Number(((totalCollectedRwf / totalBilledRwf) * 100).toFixed(1)) : 0;

  const paymentMethodsBreakdown = {
    MTN_MOMO: payments.filter(p => p.method === 'MTN_MOMO').reduce((acc, p) => acc + p.amountRwf, 0),
    BANK_TRANSFER: payments.filter(p => p.method === 'BANK_TRANSFER').reduce((acc, p) => acc + p.amountRwf, 0),
    AIRTEL_MONEY: payments.filter(p => p.method === 'AIRTEL_MONEY').reduce((acc, p) => acc + p.amountRwf, 0),
    CASH: payments.filter(p => p.method === 'CASH').reduce((acc, p) => acc + p.amountRwf, 0)
  };

  // 5. Parent Communication Delivery Audit
  const totalDispatched = messages.length;
  const deliveredCount = messages.filter(m => m.status === 'DELIVERED' || m.status === 'ACKNOWLEDGED').length;
  const deliverySuccessRate = totalDispatched > 0 ? Number(((deliveredCount / totalDispatched) * 100).toFixed(1)) : 100;

  return res.json({
    generatedAt: new Date().toISOString(),
    school: db.getSchool(schoolId),
    term,
    academics: {
      totalEvaluated,
      overallAverage,
      passRate,
      gradeDistribution,
      topStudents: reportCards.slice(0, 5)
    },
    attendance: {
      totalRecords: totalAtt,
      attendanceRate,
      presentCount,
      absentCount,
      lateCount,
      excusedCount,
      chronicAbsentCount: chronicAbsentStudents.length,
      chronicAbsentStudents
    },
    health: {
      totalIncidents: health.length,
      urgentHealthCases,
      hospitalReferrals,
      parentAcknowledgmentRate: ackRate,
      recentCases: health.slice(0, 5)
    },
    finance: {
      totalBilledRwf,
      totalCollectedRwf,
      totalOutstandingRwf,
      collectionEfficiency,
      paymentMethodsBreakdown
    },
    communication: {
      totalDispatched,
      deliveredCount,
      deliverySuccessRate
    }
  });
});

// --- Server-backed module records ---
app.get('/api/modules/:moduleKey', requireModuleAccess('read'), (req: Request, res: Response) => {
  const actor = getActor(req);
  return res.json(db.getModuleRecords(actor.schoolId, req.params.moduleKey));
});

app.post('/api/modules/:moduleKey', requireModuleAccess('write'), (req: Request, res: Response) => {
  const actor = getActor(req);
  const payload = sanitizeModulePayload(req.body);
  const record = db.createModuleRecord(actor.schoolId, req.params.moduleKey, payload, actor.id);

  db.logAudit(
    actor.schoolId,
    actor.id,
    actor.fullName,
    actor.role,
    'CREATE_MODULE_RECORD',
    req.params.moduleKey.toUpperCase(),
    String(record.id),
    `Created ${req.params.moduleKey} record`,
    req.ip
  );

  return res.status(201).json(record);
});

app.patch('/api/modules/:moduleKey/:id', requireModuleAccess('write'), (req: Request, res: Response) => {
  const actor = getActor(req);
  const payload = sanitizeModulePayload(req.body);
  const updated = db.updateModuleRecord(actor.schoolId, req.params.moduleKey, req.params.id, payload);

  if (!updated) {
    return res.status(404).json({ error: 'Record not found.' });
  }

  db.logAudit(
    actor.schoolId,
    actor.id,
    actor.fullName,
    actor.role,
    'UPDATE_MODULE_RECORD',
    req.params.moduleKey.toUpperCase(),
    req.params.id,
    `Updated ${req.params.moduleKey} record`,
    req.ip
  );

  return res.json(updated);
});

app.delete('/api/modules/:moduleKey/:id', requireModuleAccess('write'), (req: Request, res: Response) => {
  const actor = getActor(req);
  const deleted = db.deleteModuleRecord(actor.schoolId, req.params.moduleKey, req.params.id);

  if (!deleted) {
    return res.status(404).json({ error: 'Record not found.' });
  }

  db.logAudit(
    actor.schoolId,
    actor.id,
    actor.fullName,
    actor.role,
    'DELETE_MODULE_RECORD',
    req.params.moduleKey.toUpperCase(),
    req.params.id,
    `Deleted ${req.params.moduleKey} record`,
    req.ip
  );

  return res.json({ success: true });
});

// --- Events CRUD ---
app.get('/api/events', (req: Request, res: Response) => {
  const schoolId = (req.query.schoolId as string) || 'school-es-rubengera-01';
  return res.json(db.getEvents(schoolId));
});

app.post('/api/events', (req: Request, res: Response) => {
  const actor = getActor(req);
  const body = req.body;
  const newEvent = {
    id: `evt-${Date.now()}`,
    schoolId: body.schoolId || 'school-es-rubengera-01',
    titleEn: body.titleEn || 'School Event',
    titleRw: body.titleRw || 'Gahunda y’Ishuri',
    descriptionEn: body.descriptionEn || '',
    descriptionRw: body.descriptionRw || '',
    date: body.date || new Date().toISOString().split('T')[0],
    time: body.time || '09:00 AM',
    category: body.category || 'ACADEMIC',
    targetAudience: body.targetAudience || 'ALL'
  };

  db.getEvents(newEvent.schoolId).push(newEvent);
  db.logAudit(
    newEvent.schoolId,
    actor.id,
    actor.fullName,
    actor.role,
    'CREATE_SCHOOL_EVENT',
    'EVENT',
    newEvent.id,
    `Scheduled event: ${newEvent.titleEn} (${newEvent.date})`,
    req.ip
  );
  return res.status(201).json(newEvent);
});

app.get('/api/audit-logs', requireRole('SUPER_ADMIN', 'SCHOOL_ADMIN', 'HEAD_TEACHER'), (req: Request, res: Response) => {
  const schoolId = (req.query.schoolId as string) || 'school-es-rubengera-01';
  return res.json(db.getAuditLogs(schoolId));
});

app.post('/api/demo/reset', requireRole('SUPER_ADMIN', 'SCHOOL_ADMIN'), (req: Request, res: Response) => {
  if (process.env.ALLOW_DEMO_RESET !== 'true') {
    return res.status(403).json({
      error: 'Demo reset is disabled. Set ALLOW_DEMO_RESET=true on the server only for a controlled demo environment.'
    });
  }

  const actor = getActor(req);
  db.resetToSeed();
  db.logAudit(
    actor.schoolId,
    actor.id,
    actor.fullName,
    actor.role,
    'DEMO_DATABASE_RESET',
    'SYSTEM',
    actor.schoolId,
    'Database reset to seed data',
    req.ip
  );
  return res.json({ success: true, message: 'Database reset to initial ES RUBENGERA RTB seed.' });
});

// ==========================================
// PUBLIC ADMISSIONS API (NO ACCOUNT REQUIRED)
// ==========================================

app.get('/api/public/admissions/settings', (_req: Request, res: Response) => {
  const settings = db.getAdmissionSettings();
  res.json({
    resultSlipRequired: settings.resultSlipRequired,
    resultSlipExceptionNote: settings.resultSlipRequired ? undefined : settings.resultSlipExceptionNote
  });
});

app.post(
  '/api/public/admissions/result-slips',
  assertSameOrigin,
  slipUploadRateLimiter,
  runSlipUpload,
  async (req: Request, res: Response) => {
    const file = req.file;
    if (!file || !isValidUpload(file, ['resultSlip'])) {
      res.status(400).json({ error: 'Use a clear PDF, JPG or PNG result slip up to 5 MB.' });
      return;
    }

    try {
      fs.mkdirSync(SLIP_UPLOAD_DIR, { recursive: true, mode: 0o700 });
      const token = crypto.randomBytes(32).toString('hex');
      const mime = file.mimetype.toLowerCase();
      const storagePath = path.join('.slips', `${crypto.randomUUID()}${resultSlipExtension(mime)}`);
      fs.writeFileSync(path.resolve(UPLOAD_ROOT, storagePath), file.buffer, { mode: 0o600 });

      const replaceToken = sanitizeInput(req.body?.replaceToken, 100);
      if (replaceToken) {
        const previous = activeSlipUpload(replaceToken);
        if (previous) {
          db.updateAdmissionSlipUpload(previous.record.id, { replacedAt: new Date().toISOString() });
        }
      }

      const extraction = await extractAcademicPerformance(file);
      const now = new Date().toISOString();
      const record = {
        id: `slip-${crypto.randomUUID()}`,
        tokenHash: hashValue(token),
        storagePath,
        originalFileName: safeFileName(file.originalname),
        fileMime: mime,
        fileSize: file.size,
        createdAt: now,
        expiresAt: new Date(Date.now() + SLIP_TTL_MS).toISOString(),
        ocrStatus: extraction.status,
        ocrData: extraction.data,
        ocrMessage: extraction.message
      };
      db.addAdmissionSlipUpload(record);
      await persistMirror(() => mirrorAdmissionSlipUpload(record), 'slip upload');

      res.status(201).json({
        uploadToken: token,
        fileName: record.originalFileName,
        fileSize: record.fileSize,
        fileMime: record.fileMime,
        expiresAt: record.expiresAt,
        extracted: {
          status: extraction.status,
          data: extraction.data ?? null,
          message: extraction.message ?? null
        }
      });
    } catch (error) {
      console.error('[Admissions] Result slip upload failed:', error);
      res.status(500).json({ error: 'The result slip could not be saved. Please try again.' });
    }
  }
);

app.post(
  '/api/public/admissions/result-slips/preview',
  assertSameOrigin,
  slipPreviewRateLimiter,
  (req: Request, res: Response) => {
    const active = activeSlipUpload(sanitizeInput(req.body?.uploadToken, 100));
    if (!active) {
      res.status(404).json({ error: 'This result slip is no longer available. Please upload it again.' });
      return;
    }
    res.setHeader('Content-Type', active.record.fileMime);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Content-Security-Policy', "default-src 'none'; img-src data:; style-src 'unsafe-inline'");
    res.setHeader(
      'Content-Disposition',
      `inline; filename="${safeFileName(active.record.originalFileName)}"`
    );
    fs.createReadStream(active.filePath).pipe(res);
  }
);

app.post(
  '/api/public/admissions/applications',
  assertSameOrigin,
  submissionRateLimiter,
  runAdmissionUpload,
  async (req: Request, res: Response) => {
    const validation = validateSubmission(req.body);
    if (!validation.ok) {
      res.status(400).json({ error: 'Please correct the highlighted fields.', errors: validation.errors });
      return;
    }

    const applicationType = validation.value.applicationType;
    const allowedDocuments = getAllowedDocumentTypes(applicationType);
    const files = ((req.files as Express.Multer.File[] | undefined) ?? []).slice(0, UPLOAD_LIMITS.maxFiles);
    if (files.some(file => !isValidUpload(file, allowedDocuments))) {
      res.status(400).json({
        error: 'One or more documents are invalid. Use PDF, JPG or PNG files up to 5 MB each.'
      });
      return;
    }

    const resultSlipToken = sanitizeInput(req.body?.resultSlipToken, 100);
    const slipSettings = db.getAdmissionSettings();
    const slipContext = resultSlipToken ? activeSlipUpload(resultSlipToken) : null;
    if (resultSlipToken && !slipContext) {
      res.status(400).json({ error: 'The result slip upload expired. Please upload the slip again.' });
      return;
    }
    if (applicationType === 'NEW_STUDENT_SENIOR4' && slipSettings.resultSlipRequired && !slipContext) {
      res.status(400).json({ error: 'Upload your Senior 3 result slip before submitting.' });
      return;
    }
    const applicantAcademicData = normalizeAcademicPerformance(req.body?.academicPerformance);

    const school = db.getSchools()[0];
    if (!school) {
      res.status(503).json({ error: 'School information is not available yet. Please try again later.' });
      return;
    }

    try {
      const referenceNumber = await nextReferenceNumber();
      const application = buildApplication(validation.value, school.id, referenceNumber);
      const applicationDir = path.join(UPLOAD_ROOT, application.id);
      fs.mkdirSync(applicationDir, { recursive: true, mode: 0o700 });

      const genericFiles = slipContext ? files.filter(file => file.fieldname !== 'SENIOR3_RESULTS') : files;
      for (const file of genericFiles) {
        const extension =
          file.mimetype.toLowerCase() === 'application/pdf'
            ? '.pdf'
            : file.mimetype.toLowerCase() === 'image/png'
              ? '.png'
              : '.jpg';
        const storedName = `${crypto.randomUUID()}${extension}`;
        const storagePath = path.join(application.id, storedName);
        fs.writeFileSync(path.join(UPLOAD_ROOT, storagePath), file.buffer, { mode: 0o600 });
        application.documents.push({
          id: `doc-${crypto.randomUUID()}`,
          applicationId: application.id,
          documentType: file.fieldname,
          fileName: safeFileName(file.originalname),
          fileMime: file.mimetype.toLowerCase(),
          fileSize: file.size,
          storagePath,
          uploadedAt: new Date().toISOString()
        });
      }

      let slipDocumentId: string | undefined;
      if (slipContext) {
        const slipDocument = {
          id: `doc-${crypto.randomUUID()}`,
          applicationId: application.id,
          documentType: 'SENIOR3_RESULTS',
          fileName: slipContext.record.originalFileName,
          fileMime: slipContext.record.fileMime,
          fileSize: slipContext.record.fileSize,
          storagePath: path.join(application.id, `${crypto.randomUUID()}${resultSlipExtension(slipContext.record.fileMime)}`),
          uploadedAt: new Date().toISOString()
        };
        // Copy the original bytes unchanged into the application's private folder.
        fs.copyFileSync(slipContext.filePath, path.join(UPLOAD_ROOT, slipDocument.storagePath), fs.constants.COPYFILE_EXCL);
        application.documents.push(slipDocument);
        slipDocumentId = slipDocument.id;
      }

      if (applicationType === 'NEW_STUDENT_SENIOR4') {
        application.senior3Results = buildSenior3ResultsRecord(validation.value, application.id, {
          documentId: slipDocumentId,
          resultSlipUploaded: Boolean(slipContext),
          slipWaived: !slipContext && !slipSettings.resultSlipRequired,
          slipExceptionNote: !slipContext && !slipSettings.resultSlipRequired ? slipSettings.resultSlipExceptionNote : undefined,
          ocrStatus: slipContext?.record.ocrStatus ?? 'NOT_ATTEMPTED',
          ocrMessage: slipContext?.record.ocrMessage,
          ocrAt: slipContext?.record.createdAt,
          extracted: slipContext?.record.ocrData,
          applicantReviewed: hasActualAcademicData(applicantAcademicData) ? applicantAcademicData : undefined
        });
      }

      db.createAdmission(application);
      await persistMirror(() => mirrorApplicationCreate(application), 'create');
      if (application.senior3Results) {
        await persistMirror(() => mirrorSenior3Results(application.senior3Results!), 'senior 3 results');
      }
      if (slipContext) {
        const consumedAt = new Date().toISOString();
        const updatedUpload = db.updateAdmissionSlipUpload(slipContext.record.id, {
          consumedAt,
          applicationId: application.id,
          documentId: slipDocumentId
        });
        if (updatedUpload) {
          await persistMirror(() => mirrorAdmissionSlipUpload(updatedUpload), 'slip consumption');
        }
      }
      const notifications = await notifySubmission(application);

      res.status(201).json({
        referenceNumber: application.referenceNumber,
        applicationId: application.id,
        submittedAt: application.submittedAt,
        applicationStatus: application.status,
        resultSlipUploaded: Boolean(slipContext),
        resultVerificationStatus: application.senior3Results?.verificationStatus,
        schoolContact: [school.phone, school.email].filter(Boolean).join(' · '),
        notifications
      });
    } catch (error) {
      console.error('[Admissions] Submission failed:', error);
      res.status(500).json({ error: 'Your application could not be saved. Please try again.' });
    }
  }
);

app.post(
  '/api/public/admissions/tracking/request',
  assertSameOrigin,
  trackingRequestLimiter,
  async (req: Request, res: Response) => {
    const referenceNumber = sanitizeReference(req.body?.referenceNumber);
    const contact = sanitizeInput(req.body?.contact, 200);
    const application = db.getAdmissionByReference(referenceNumber);
    if (!application || !contactMatches(application, contact)) {
      res.status(400).json({ error: 'No application matches that reference number and contact.' });
      return;
    }

    let channel: 'email' | 'sms' | 'none' = 'none';
    if (emailConfigured() && application.applicantEmail) channel = 'email';
    else if (smsConfigured() && (application.applicantPhone || application.guardianPhone)) channel = 'sms';

    if (channel === 'none') {
      const existing = db.getActiveVerificationByReference(referenceNumber);
      if (existing) {
        db.updateAdmissionVerification(existing.id, { consumedAt: new Date().toISOString() });
      }
      res.json({
        requiresCode: false,
        channel: 'none',
        message: 'Messaging is not configured. Confirm the registered contact to view limited status information.'
      });
      return;
    }

    const code = generateVerificationCode();
    const verification = {
      id: `ver-${crypto.randomUUID()}`,
      applicationId: application.id,
      referenceNumber,
      contactHash: hashValue(normalizeContact(contact)),
      codeHash: hashValue(`${referenceNumber}:${code}`),
      expiresAt: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
      attempts: 0,
      createdAt: new Date().toISOString()
    };
    db.addAdmissionVerification(verification);
    const delivery = await sendVerificationCode(application, channel, code);

    if (!delivery.sent) {
      db.updateAdmissionVerification(verification.id, { consumedAt: new Date().toISOString() });
      res.status(503).json({
        error: 'We could not deliver a verification code. Please try again later or contact the school.'
      });
      return;
    }

    res.json({
      requiresCode: true,
      channel,
      message:
        channel === 'email'
          ? 'A verification code was sent to the email address on the application.'
          : 'A verification code was sent to the phone number on the application.'
    });
  }
);

app.post(
  '/api/public/admissions/tracking/verify',
  assertSameOrigin,
  trackingVerifyLimiter,
  (req: Request, res: Response) => {
    const referenceNumber = sanitizeReference(req.body?.referenceNumber);
    const contact = sanitizeInput(req.body?.contact, 200);
    const application = db.getAdmissionByReference(referenceNumber);
    if (!application || !contactMatches(application, contact)) {
      res.status(400).json({ error: 'No application matches that reference number and contact.' });
      return;
    }

    const verification = db.getActiveVerificationByReference(referenceNumber);
    if (verification) {
      if (verification.contactHash !== hashValue(normalizeContact(contact))) {
        res.status(400).json({ error: 'No application matches that reference number and contact.' });
        return;
      }
      if (new Date(verification.expiresAt).getTime() <= Date.now()) {
        res.status(400).json({ error: 'The verification code expired. Request a new one.' });
        return;
      }
      if (verification.attempts >= 5) {
        res.status(429).json({ error: 'Too many incorrect codes. Request a new verification code.' });
        return;
      }
      const code = sanitizeInput(req.body?.code, 10);
      if (!code || verification.codeHash !== hashValue(`${referenceNumber}:${code}`)) {
        db.updateAdmissionVerification(verification.id, { attempts: verification.attempts + 1 });
        res.status(400).json({ error: 'Incorrect verification code.' });
        return;
      }
      db.updateAdmissionVerification(verification.id, { consumedAt: new Date().toISOString() });
    } else if (emailConfigured() || smsConfigured()) {
      // A provider is connected, so a code is always required.
      res.status(400).json({ error: 'Request a verification code first.' });
      return;
    }

    res.json({ application: limitedTrackingSummary(application) });
  }
);

// ==========================================
// ADMIN ADMISSIONS MANAGEMENT API
// ==========================================

app.get('/api/admissions/applications', requireAdmissionsRole('read'), (req: Request, res: Response) => {
  const actor = getActor(req);
  const rawType = sanitizeInput(req.query.applicationType, 40);
  const type = APPLICATION_TYPES.includes(rawType as ApplicationType) ? (rawType as ApplicationType) : undefined;
  const rawStatus = sanitizeInput(req.query.status, 40);
  const status = APPLICATION_STATUSES.includes(rawStatus as ApplicationStatus) ? (rawStatus as ApplicationStatus) : undefined;
  const academicYear = sanitizeInput(req.query.academicYear, 20);
  if (rawType && !type) {
    res.status(400).json({ error: 'Invalid application type filter.' });
    return;
  }
  if (rawStatus && !status) {
    res.status(400).json({ error: 'Invalid status filter.' });
    return;
  }
  const applications = db.getAdmissions(actor.role === 'SUPER_ADMIN' ? undefined : actor.schoolId, {
    search: sanitizeInput(req.query.search, 120) || undefined,
    applicationType: type,
    status,
    academicYear: academicYear || undefined
  });
  res.json({ applications, total: applications.length });
});

app.get('/api/admissions/settings', requireAdmissionsRole('read'), (_req: Request, res: Response) => {
  res.json(db.getAdmissionSettings());
});

app.patch('/api/admissions/settings', requireAdmissionsRole('write'), async (req: Request, res: Response) => {
  const actor = getActor(req);
  const resultSlipRequired = req.body?.resultSlipRequired;
  if (typeof resultSlipRequired !== 'boolean') {
    res.status(400).json({ error: 'Select whether a Senior 3 result slip is required.' });
    return;
  }
  const exceptionNote = sanitizeInput(req.body?.resultSlipExceptionNote, 500);
  if (!resultSlipRequired && exceptionNote.length < 5) {
    res.status(400).json({ error: 'Add a short reason for the result slip exception.' });
    return;
  }
  const settings = db.updateAdmissionSettings({
    resultSlipRequired,
    resultSlipExceptionNote: resultSlipRequired ? undefined : exceptionNote,
    updatedAt: new Date().toISOString(),
    updatedBy: actor.id
  });
  await persistMirror(() => mirrorAdmissionSettings(settings), 'admission settings');
  db.logAudit(
    actor.schoolId, actor.id, actor.fullName, actor.role,
    'ADMISSION_SETTINGS_UPDATED', 'ADMISSION_SETTINGS', 'public_admissions',
    `Result slip requirement set to ${resultSlipRequired ? 'required' : `waived: ${exceptionNote}`}.`, req.ip
  );
  res.json(settings);
});

app.get('/api/admissions/export', requireAdmissionsRole('read'), (req: Request, res: Response) => {
  const actor = getActor(req);
  const applications = db.getAdmissions(actor.role === 'SUPER_ADMIN' ? undefined : actor.schoolId);
  const headers = [
    'Reference', 'Type', 'Status', 'Submitted', 'Academic Year',
    'Applicant', 'Date of Birth', 'Phone', 'Email', 'District', 'Sector', 'Residence',
    'Guardian', 'Guardian Phone', 'Relationship', 'Previous/Current School', 'Requested Level/Class',
    'Reason', 'Reviewed By', 'Reviewed At'
  ];
  const rows = applications.map(application =>
    [
      application.referenceNumber,
      application.applicationType,
      application.status,
      application.submittedAt,
      application.academicYear,
      application.applicantFullName,
      application.applicantDob,
      application.applicantPhone,
      application.applicantEmail,
      application.applicantDistrict,
      application.applicantSector,
      application.applicantResidence,
      application.guardianFullName,
      application.guardianPhone,
      application.guardianRelationship,
      application.previousSchoolName || application.currentSchoolName || application.previousSchoolOther,
      application.requestedLevel || application.requestedClass || application.requestedEducationLevel,
      application.reasonForChoosingSchool || application.transferReason || application.applicationReason,
      application.reviewedByName,
      application.reviewedAt
    ]
      .map(csvCell)
      .join(',')
  );
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="schoolcare-admissions-${new Date().toISOString().slice(0, 10)}.csv"`);
  res.send(`\uFEFF${headers.map(csvCell).join(',')}\n${rows.join('\n')}\n`);
});

app.get('/api/admissions/applications/:id', requireAdmissionsRole('read'), (req: Request, res: Response) => {
  const application = findAdminApplication(req, res);
  if (!application) return;
  res.json({ application });
});

app.post('/api/admissions/applications/:id/review-notes', requireAdmissionsRole('write'), (req: Request, res: Response) => {
  const application = findAdminApplication(req, res);
  if (!application) return;
  const actor = getActor(req);
  const noteText = sanitizeInput(req.body?.note, 2000);
  if (noteText.length < 2) {
    res.status(400).json({ error: 'Enter a review note.' });
    return;
  }

  const note = {
    id: `note-${crypto.randomUUID()}`,
    applicationId: application.id,
    reviewerId: actor.id,
    reviewerName: actor.fullName,
    reviewerRole: actor.role,
    note: noteText,
    createdAt: new Date().toISOString()
  };
  db.addAdmissionReviewNote(application.id, note);
  const updated = db.updateAdmission(application.id, {
    reviewNotes: [application.reviewNotes, `${actor.fullName}: ${noteText}`].filter(Boolean).join('\n\n').slice(0, 20_000)
  });
  if (updated) {
    void persistMirror(() => mirrorReviewNote(note), 'review note');
  }
  db.logAudit(
    actor.schoolId, actor.id, actor.fullName, actor.role,
    'ADMISSION_REVIEW_NOTE_ADDED', 'ADMISSION_APPLICATION', application.id,
    `Internal review note added to ${application.referenceNumber}.`, req.ip
  );
  res.json({ note, application: updated });
});

app.post(
  '/api/admissions/applications/:id/result-verification',
  requireAdmissionsRole('write'),
  async (req: Request, res: Response) => {
    const application = findAdminApplication(req, res);
    if (!application) return;
    const actor = getActor(req);
    if (application.applicationType !== 'NEW_STUDENT_SENIOR4' || !application.senior3Results) {
      res.status(400).json({ error: 'This application has no Senior 3 results to verify.' });
      return;
    }

    const status = sanitizeInput(req.body?.status, 60) as ResultSlipVerificationStatus;
    if (!(RESULT_SLIP_VERIFICATION_STATUSES as string[]).includes(status)) {
      res.status(400).json({ error: 'Select a valid verification status.' });
      return;
    }
    const notes = sanitizeInput(req.body?.notes, 4000);
    const academicData = normalizeAcademicPerformance(req.body?.academicPerformance);
    if (status === 'VERIFIED' && !hasActualAcademicData(academicData)) {
      res.status(400).json({ error: 'Enter the subjects and marks/grades from the original slip before marking it verified.' });
      return;
    }
    if (
      (status === 'VERIFICATION_FAILED' || status === 'ADDITIONAL_DOCUMENT_REQUIRED') &&
      notes.length < 5
    ) {
      res.status(400).json({ error: 'Add a short explanation for this verification decision.' });
      return;
    }

    const now = new Date().toISOString();
    const event = {
      id: `verhist-${crypto.randomUUID()}`,
      applicationId: application.id,
      status,
      notes: notes || undefined,
      changedBy: actor.id,
      changedByName: actor.fullName,
      createdAt: now
    };
    const updated = db.updateSenior3Results(application.id, {
      verificationStatus: status,
      verificationNotes: notes || undefined,
      verificationHistory: [...application.senior3Results.verificationHistory, event],
      verifiedBy: actor.id,
      verifiedByName: actor.fullName,
      verifiedAt: now,
      verifiedSummary: status === 'VERIFIED' ? academicData : application.senior3Results.verifiedSummary
    });
    if (!updated) {
      res.status(404).json({ error: 'Application not found.' });
      return;
    }
    await persistMirror(async () => {
      if (updated.senior3Results) await mirrorSenior3Results(updated.senior3Results);
      await mirrorResultVerificationEvent(event);
    }, 'result verification');
    db.logAudit(
      actor.schoolId, actor.id, actor.fullName, actor.role,
      'ADMISSION_RESULT_VERIFICATION_UPDATED', 'ADMISSION_APPLICATION', application.id,
      `${application.referenceNumber}: result verification -> ${status}.`, req.ip
    );
    res.json({ application: updated, event });
  }
);

app.post('/api/admissions/applications/:id/status', requireAdmissionsRole('write'), async (req: Request, res: Response) => {
  const application = findAdminApplication(req, res);
  if (!application) return;
  const actor = getActor(req);
  const status = sanitizeInput(req.body?.status, 40) as ApplicationStatus;
  const reason = sanitizeInput(req.body?.reason, 2000);
  if (!(APPLICATION_STATUSES as string[]).includes(status)) {
    res.status(400).json({ error: 'Select a valid status.' });
    return;
  }
  if ((status === 'REJECTED' || status === 'ADDITIONAL_INFO_REQUIRED') && reason.length < 5) {
    res.status(400).json({ error: 'A short explanation is required for this status.' });
    return;
  }

  const updated = db.updateAdmissionStatus(application.id, status, actor.id, actor.fullName, reason);
  if (!updated) {
    res.status(404).json({ error: 'Application not found.' });
    return;
  }
  const historyEntry = updated.statusHistory[updated.statusHistory.length - 1];
  await persistMirror(async () => {
    await mirrorApplicationUpdate(updated);
    if (historyEntry) await mirrorStatusHistory(historyEntry);
  }, 'status change');

  db.logAudit(
    actor.schoolId, actor.id, actor.fullName, actor.role,
    'ADMISSION_STATUS_CHANGED', 'ADMISSION_APPLICATION', application.id,
    `${application.referenceNumber}: ${application.status} -> ${status}.`, req.ip
  );
  const notifications = await notifyStatusChange(updated, status, reason);
  res.json({ application: updated, notifications });
});

app.get(
  '/api/admissions/applications/:id/documents/:documentId/download',
  requireAdmissionsRole('read'),
  (req: Request, res: Response) => {
    const application = findAdminApplication(req, res);
    if (!application) return;
    const document = application.documents.find(item => item.id === req.params.documentId);
    if (!document) {
      res.status(404).json({ error: 'Document not found.' });
      return;
    }
    const filePath = path.resolve(UPLOAD_ROOT, document.storagePath);
    if (!filePath.startsWith(`${UPLOAD_ROOT}${path.sep}`) || !fs.existsSync(filePath)) {
      res.status(404).json({ error: 'Document not found.' });
      return;
    }
    const fileName = safeFileName(document.fileName);
    res.setHeader('Content-Type', document.fileMime);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${fileName}"; filename*=UTF-8''${encodeURIComponent(fileName)}`
    );
    fs.createReadStream(filePath).pipe(res);
  }
);

app.get(
  '/api/admissions/applications/:id/documents/:documentId/preview',
  requireAdmissionsRole('read'),
  (req: Request, res: Response) => {
    const application = findAdminApplication(req, res);
    if (!application) return;
    const document = application.documents.find(item => item.id === req.params.documentId);
    if (!document) {
      res.status(404).json({ error: 'Document not found.' });
      return;
    }
    const filePath = path.resolve(UPLOAD_ROOT, document.storagePath);
    if (!filePath.startsWith(`${UPLOAD_ROOT}${path.sep}`) || !fs.existsSync(filePath)) {
      res.status(404).json({ error: 'Document not found.' });
      return;
    }
    res.setHeader('Content-Type', document.fileMime);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Content-Security-Policy', "default-src 'none'; img-src data:; style-src 'unsafe-inline'");
    res.setHeader('Content-Disposition', `inline; filename="${safeFileName(document.fileName)}"`);
    fs.createReadStream(filePath).pipe(res);
  }
);

// --- MySQL & XAMPP Integration Endpoints ---
app.get('/api/mysql/status', async (_req: Request, res: Response) => {
  const status = await checkMysqlHealth();
  return res.json(status);
});

app.get('/api/mysql/export', (_req: Request, res: Response) => {
  const sqlPath = getExportSqlPath();
  if (!fs.existsSync(sqlPath)) {
    return res.status(404).json({ error: 'SQL export file not found' });
  }
  res.setHeader('Content-Type', 'application/sql');
  res.setHeader('Content-Disposition', 'attachment; filename="schoolcare_db.sql"');
  return res.sendFile(sqlPath);
});

// ==========================================
// VITE DEV SERVER / STATIC ASSETS
// ==========================================

export { app };

async function startServer() {
  const PORT = await resolvePort(process.env.PORT ? Number(process.env.PORT) : undefined);

  if (!isProduction) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa'
    });
    app.use(vite.middlewares);
  } else {
    // Serve static files in production
    app.use(express.static(path.resolve(__dirname, 'dist')));
    app.get('*', (_req, res) => {
      res.sendFile(path.resolve(__dirname, 'dist', 'index.html'));
    });
  }

  if (PORT !== Number(process.env.PORT) && !process.env.PORT) {
    console.log(`Port 3000 was unavailable. SchoolCare is running on http://localhost:${PORT}`);
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`SchoolCare Rwanda Server running at http://localhost:${PORT}`);
  });
}

startServer().catch(err => {
  console.error('Failed to start server:', err);
});
