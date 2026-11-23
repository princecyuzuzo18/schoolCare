import express, { NextFunction, Request, Response } from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import net from 'net';
import crypto from 'crypto';
import dotenv from 'dotenv';
import fs from 'fs';
import { pipeline } from 'node:stream/promises';
import multer from 'multer';
import type { RowDataPacket } from 'mysql2';
import { db } from './server/database';
import { authenticateUser, requireAnyPermission, requirePermission, requireRole } from './server/rbac';
import { checkMysqlHealth, closeMysqlPool, getExportSqlPath, getMysqlPool } from './server/mysqlConnector';
import { getPasswordHash, replacePassword, verifyPassword } from './server/authCredentials';
import { createSession, destroySession, invalidateUserSessions } from './server/sessions';
import { buildAuthSessionView } from './server/authSession';
import { ASSIGNABLE_STAFF_ROLES, getProfessionalTitle } from './src/roleCatalog';
import { registerPublicSite } from './server/publicSite';
import { registerAcademicRoutes } from './server/academics';
import { registerCombinationRoutes } from './server/combinations';
import { registerReportPrintingRoutes } from './server/reportPrinting';
import { registerAiRoutes } from './server/ai/routes';
import { registerHeadteacherDashboardRoutes } from './server/headteacherDashboard';
import { registerHeadteacherAppointmentRoutes } from './server/headteacherAppointment';
import { registerStudentImportRoutes } from './server/studentImport';
import {
  DELEGATABLE_PERMISSIONS,
  PERMISSION_CATALOG,
  ROLE_PERMISSIONS,
  PermissionError,
  LEADER_ONLY_DELEGATABLE_PERMISSIONS,
  assertCanActivateStaff,
  assertCanArchiveStaff,
  assertCanAssignStaffRole,
  assertCanCreateStaffRole,
  assertCanDefinePermissionGroup,
  assertCanEditStaff,
  assertCanGrantPermissions,
  assertCanManageInvitations,
  assertCanManageStaff,
  assertCanResetStaffAccess,
  assertCanRevokePermissions,
  assertCanSuspendStaff,
  assertCanViewStaff,
  canonicalPermission,
  getEffectivePermissions
} from './server/permissions';
import {
  StaffManagementError,
  activateStaffInvitation,
  createStaffInvitation,
  publicInvitation,
  resendStaffInvitation
} from './server/staffManagement';
import {
  archiveStaffAccount,
  getStaffDirectory,
  getStaffProfile,
  getStaffSummary,
  restoreStaffAccount,
  updateStaffProfile
} from './server/staffAdministration';
import {
  SignupError,
  approveSignupRequest,
  createParentSignupRequest,
  createStudentSignupRequest,
  getPublicSignupRequestView,
  listSignupRequests,
  rejectSignupRequest,
  resendSignupCode,
  verifySignupRequest
} from './server/accountSignup';
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
  notifyStaffInvitation,
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
  LanguageCode,
  NotificationChannel,
  NotificationMessage,
  Payment,
  PermissionGroup,
  PortalDashboardView,
  ResultSlipVerificationStatus,
  School,
  UserProfile,
  UserRole
} from './src/types';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const isProduction = process.env.NODE_ENV === 'production';

// Only trust X-Forwarded-* when an explicit reverse proxy hop is configured.
// With no proxy, leaving this unset prevents client IP spoofing.
const trustProxyHops = Number(process.env.TRUST_PROXY || 0);
if (Number.isInteger(trustProxyHops) && trustProxyHops > 0) {
  app.set('trust proxy', trustProxyHops);
}

// Fail closed in production: verification-code hashes and admission tracking
// tokens must never be protected by the development fallback secret.
if (isProduction && (process.env.ADMISSION_TRACKING_SECRET || '').length < 32) {
  throw new Error(
    'ADMISSION_TRACKING_SECRET must be set to at least 32 random characters when NODE_ENV=production.'
  );
}

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
  // In production an explicit PORT is a deployment contract: silently moving
  // to a fallback port would leave the reverse proxy talking to another app.
  if (preferredPort) {
    if (!(await isPortAvailable(preferredPort))) {
      throw new Error(
        `Configured PORT ${preferredPort} is already in use. Free that port or change PORT in .env.`
      );
    }
    return preferredPort;
  }

  const fallbackPorts = [3000, 3010, 3011, 3012, 3020];
  for (const port of fallbackPorts) {
    if (await isPortAvailable(port)) return port;
  }

  throw new Error('No available development port found in 3000, 3010, 3011, 3012, 3020.');
}

app.disable('x-powered-by');
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Baseline response hardening. Routes that serve downloads set their own
// restrictive CSP; these defaults apply to every other response.
app.use((_req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  if (isProduction) {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }
  next();
});

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

/** Stream a file without letting an I/O error become an unhandled process event. */
function streamFileSafely(filePath: string, res: Response): void {
  pipeline(fs.createReadStream(filePath), res).catch(error => {
    console.error('[Files] Stream failed:', error);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Unable to read the requested file.' });
    } else {
      res.destroy();
    }
  });
}

// Signup verification must not be bypassable by changing a client-supplied
// referenceNumber, and resends must share one bucket with verification.
const accountSignupRateLimiter = createRateLimiter({
  windowMs: 60 * 60 * 1000,
  max: 8,
  prefix: 'account-signup',
  keyFrom: (req, prefix) => `${prefix}:${req.ip}:${req.path}`
});
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
    read: ['SUPER_ADMIN', 'SCHOOL_ADMIN', 'HEAD_TEACHER', 'DEPUTY_HEAD', 'TEACHER', 'ACCOUNTANT', 'ANIMATEUR'],
    write: ['SUPER_ADMIN', 'SCHOOL_ADMIN', 'HEAD_TEACHER', 'DEPUTY_HEAD', 'TEACHER', 'ACCOUNTANT', 'ANIMATEUR']
  },
  meetings: {
    read: ['SUPER_ADMIN', 'SCHOOL_ADMIN', 'HEAD_TEACHER', 'DEPUTY_HEAD', 'TEACHER', 'ACCOUNTANT', 'ANIMATEUR'],
    write: ['SUPER_ADMIN', 'SCHOOL_ADMIN', 'HEAD_TEACHER', 'DEPUTY_HEAD', 'TEACHER', 'ACCOUNTANT', 'ANIMATEUR']
  },
  inventory: {
    read: ['SUPER_ADMIN', 'SCHOOL_ADMIN', 'HEAD_TEACHER', 'ACCOUNTANT'],
    write: ['SUPER_ADMIN', 'SCHOOL_ADMIN', 'HEAD_TEACHER', 'ACCOUNTANT']
  },
  discipline: {
    read: ['SUPER_ADMIN', 'SCHOOL_ADMIN', 'HEAD_TEACHER', 'DEPUTY_HEAD', 'TEACHER', 'DISCIPLINE_OFFICER'],
    write: ['SUPER_ADMIN', 'SCHOOL_ADMIN', 'HEAD_TEACHER', 'DEPUTY_HEAD', 'DISCIPLINE_OFFICER']
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
      'DISCIPLINE_OFFICER',
      'SCHOOL_IT',
      'ANIMATEUR',
      'PARENT',
      'STUDENT'
    ],
    write: ['SUPER_ADMIN', 'SCHOOL_ADMIN']
  },
  innovations: {
    read: ['SUPER_ADMIN', 'SCHOOL_ADMIN', 'HEAD_TEACHER', 'DEPUTY_HEAD', 'TEACHER', 'SCHOOL_IT'],
    write: ['SUPER_ADMIN', 'SCHOOL_ADMIN', 'HEAD_TEACHER', 'DEPUTY_HEAD', 'TEACHER', 'SCHOOL_IT']
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
    ['/timetable', 'academics:read'],
    ['/homework', 'academics:read'],
    ['/reports', 'reports:read']
  ];

  if (requestPath.startsWith('/academics') && method !== 'GET') {
    // The granular academic powers are checked again inside each route. This
    // gate only makes sure the account has at least one of them.
    requireAnyPermission(
      'academics.write',
      'marks.write',
      'marks.review',
      'reports.generate',
      'reports.publish',
      'reports.distribute'
    )(req, res, next);
    return;
  }
  if (requestPath === '/staff') {
    requirePermission(method === 'GET' ? 'staff.read' : 'staff.write')(req, res, next);
    return;
  }
  if (requestPath.startsWith('/schools') && method !== 'GET') {
    // Headteachers may edit their own school's settings; by-ID access is
    // enforced in the route handler with assertSchoolRecordAccess.
    requirePermission('school.write')(req, res, next);
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

/**
 * Public school website. Registered BEFORE the private /api auth middleware so
 * that anonymous visitors can read approved public content. Its own admin
 * routes apply the existing authentication and permission middleware.
 * The private SchoolCare SPA is unchanged and remains at /portal#/login.
 */
registerPublicSite(app);

/**
 * Public, dependency-free liveness probe for reverse proxies and uptime
 * monitors. It deliberately exposes no database, user or configuration data.
 */
app.get('/api/health', (_req, res) => {
  return res.json({
    status: 'ok',
    service: 'schoolcare',
    uptimeSeconds: Math.round(process.uptime()),
    timestamp: new Date().toISOString()
  });
});

app.use('/api', (req, res, next) => {
  // /schools/me is authenticated: it must resolve the school from the session,
  // never from the anonymous public school directory used by the website.
  const isPublicSchoolRead =
    req.method === 'GET' && /^\/schools(?:\/[^/]+)?$/.test(req.path) && req.path !== '/schools/me';
  const isLogin = req.method === 'POST' && req.path === '/auth/login';
  const isPasswordResetRequest = req.method === 'POST' && req.path === '/auth/password-reset/request';
  const isStaffActivation = req.method === 'POST' && req.path === '/staff/invitations/activate';
  const isPublicAccountSignup = req.path.startsWith('/public/accounts/');
  const isPublicAdmissions = req.path.startsWith('/public/admissions/');
  if (
    isPublicSchoolRead ||
    isLogin ||
    isPasswordResetRequest ||
    isStaffActivation ||
    isPublicAccountSignup ||
    isPublicAdmissions
  ) {
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

/**
 * Resolve the school a request is allowed to read/write.
 *
 * School-level users are always scoped to the school stored on their account;
 * a browser-supplied `schoolId` is ignored. Only the platform Super Admin may
 * explicitly target another school.
 */
function getScopedSchoolId(req: Request): string {
  const actor = getActor(req);
  if (actor.role === 'SUPER_ADMIN') {
    const fromQuery = req.query.schoolId;
    const fromBody = typeof req.body?.schoolId === 'string' ? req.body.schoolId : undefined;
    const requested = fromQuery ?? fromBody;
    if (typeof requested === 'string' && requested.trim()) return requested.trim();
  }
  return actor.schoolId;
}

/** Student IDs a parent/student account is allowed to see. Staff return null (unrestricted). */
function portalStudentIds(actor?: UserProfile | null): string[] | null {
  if (!actor) return null;
  if (actor.role === 'PARENT') return Array.isArray(actor.linkedStudentIds) ? actor.linkedStudentIds : [];
  if (actor.role === 'STUDENT') return actor.studentId ? [actor.studentId] : [];
  return null;
}

/** Broadcast recipients intentionally visible to every portal account. */
const BROADCAST_NOTIFICATION_RECIPIENTS = new Set(['all-guardians', 'all-students', 'all-staff']);

/**
 * Recipient IDs a parent/student account may read or message: the account
 * itself, linked students, and guardians linked to those students. Staff
 * accounts return null because their hub is school-wide.
 */
function portalNotificationRecipientIds(actor: UserProfile | undefined, schoolId: string): string[] | null {
  const students = portalStudentIds(actor);
  if (!students) return null;
  const ids = new Set<string>([actor?.id ?? '', ...students]);
  for (const studentId of students) {
    for (const { guardian } of db.getGuardiansForStudent(studentId)) ids.add(guardian.id);
  }
  ids.delete('');
  return [...ids];
}

function isPortalNotificationVisible(
  notification: { recipientId: string; relatedEntityId?: string },
  actor: UserProfile | undefined,
  schoolId: string,
  allowedRecipientIds: string[] | null,
  allowedStudentIds: string[] | null
): boolean {
  if (!allowedRecipientIds || !allowedStudentIds) return true;
  if (BROADCAST_NOTIFICATION_RECIPIENTS.has(notification.recipientId)) return true;
  if (allowedRecipientIds.includes(notification.recipientId)) return true;
  if (notification.relatedEntityId) {
    const incident = db.getHealthIncidents(schoolId).find(item => item.id === notification.relatedEntityId);
    if (incident && allowedStudentIds.includes(incident.studentId)) return true;
  }
  return false;
}

interface NotificationRecipient {
  id: string;
  name: string;
  phone: string;
  email?: string;
}

/** Resolve a recipient from school records instead of trusting client input. */
function resolveNotificationRecipient(
  recipientId: string,
  schoolId: string,
  actor: UserProfile
): NotificationRecipient | null {
  const broadcastName = recipientId === 'all-guardians'
    ? 'All Parents & Guardians'
    : recipientId === 'all-students'
      ? 'All Students'
      : recipientId === 'all-staff'
        ? 'All Staff'
        : null;
  if (broadcastName) {
    return BROADCAST_NOTIFICATION_RECIPIENTS.has(recipientId)
      ? { id: recipientId, name: broadcastName, phone: '' }
      : null;
  }

  const portalAllowed = portalNotificationRecipientIds(actor, schoolId);
  if (portalAllowed && !portalAllowed.includes(recipientId)) return null;

  const guardian = db.getGuardians(schoolId).find(item => item.id === recipientId);
  if (guardian) {
    return { id: guardian.id, name: guardian.fullName, phone: guardian.phone || '', email: guardian.email || undefined };
  }
  const student = db.getStudents(schoolId).find(item => item.id === recipientId);
  if (student) {
    return { id: student.id, name: `${student.firstName} ${student.lastName}`, phone: '' };
  }
  const user = db.getUserById(recipientId);
  if (user && user.schoolId === schoolId) {
    return { id: user.id, name: user.fullName, phone: user.phone || '', email: user.email || undefined };
  }
  return null;
}

function assertPortalStudentAccess(actor: UserProfile, studentId: string): void {
  const allowed = portalStudentIds(actor);
  if (allowed && !allowed.includes(studentId)) {
    throw new PermissionError('You can only access records linked to your own account.');
  }
}

function scopeStudentsForActor<T extends { id: string }>(actor: UserProfile | undefined, students: T[]): T[] {
  const allowed = portalStudentIds(actor);
  return allowed ? students.filter(student => allowed.includes(student.id)) : students;
}

/**
 * Reject any by-ID record that belongs to a different school. The platform
 * Super Admin is the only actor allowed to work across schools.
 */
function assertSchoolRecordAccess(req: Request, recordSchoolId: string | undefined, entity = 'Record'): void {
  const actor = getActor(req);
  if (actor.role === 'SUPER_ADMIN') return;
  if (!recordSchoolId || recordSchoolId !== actor.schoolId) {
    throw new PermissionError(`${entity} is not available in your school.`);
  }
}

/** Verify that a client-supplied student ID really belongs to the actor's school. */
function assertStudentInSchool(req: Request, studentId: string): void {
  if (!studentId) throw new PermissionError('A student from your school is required.');
  const student = db.getStudentById(studentId);
  assertSchoolRecordAccess(req, student?.schoolId, 'Student');
}

function respondWithSchoolAccessError(res: Response, error: unknown, context: string) {
  if (error instanceof PermissionError) {
    return res.status(403).json({ error: error.message });
  }
  console.error(`[School isolation] ${context}:`, error);
  return res.status(500).json({ error: 'Unable to verify school access.' });
}

function respondWithPortalError(res: Response, error: unknown) {
  if (error instanceof PermissionError) {
    return res.status(403).json({ error: error.message });
  }
  console.error('[Portal] Unexpected error:', error);
  return res.status(500).json({ error: 'Unable to load your portal right now.' });
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
  // Throttle both the source IP and the target account. This keeps a shared
  // office IP from locking out every user after one person's failures, while
  // still blocking distributed brute force against one email.
  const ipKey = `ip:${ip}`;
  const emailKey = `email:${email.toLowerCase()}`;
  const activeAttempts = [ipKey, emailKey]
    .map(key => loginAttempts.get(key))
    .filter((item): item is { count: number; resetAt: number } => Boolean(item && item.resetAt > now));
  const blocked = activeAttempts.find(item => item.count >= LOGIN_ATTEMPT_LIMIT);
  if (blocked) {
    res.setHeader('Retry-After', String(Math.ceil((blocked.resetAt - now) / 1000)));
    return res.status(429).json({ error: 'Too many sign-in attempts. Try again later.' });
  }

  const mysql = await checkMysqlHealth();
  if (!mysql.connected) {
    return res.status(503).json({ error: 'Sign-in requires MariaDB. Check the database service and DB_* settings, then try again.' });
  }

  const user = db.getUserByEmail(email);
  let passwordMatches: boolean;
  try {
    passwordMatches = await verifyPassword(password, await getPasswordHash(email));
  } catch (error) {
    console.error('[Auth] Password verification failed:', error);
    const message = error instanceof Error ? error.message : '';
    if (/(?:mysql|database) is unavailable/i.test(message)) {
      return res.status(503).json({ error: 'Sign-in requires MariaDB. Check the database service and DB_* settings, then try again.' });
    }
    return res.status(500).json({ error: 'Unable to authenticate at this time.' });
  }
  if (!user || !passwordMatches || user.isActive === false) {
    for (const key of [ipKey, emailKey]) {
      const current = loginAttempts.get(key);
      loginAttempts.set(
        key,
        current && current.resetAt > now
          ? { count: current.count + 1, resetAt: current.resetAt }
          : { count: 1, resetAt: now + LOGIN_WINDOW_MS }
      );
    }
    return res.status(401).json({ error: 'Invalid email or password.' });
  }

  // Clear only this account's failure bucket after a legitimate login; other
  // users behind the same IP must not inherit a clean slate.
  loginAttempts.delete(emailKey);
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

  return res.json(buildAuthSessionView(user));
});

app.get('/api/auth/me', (req: Request, res: Response) => {
  return res.json(buildAuthSessionView(getActor(req)));
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

function respondWithSignupError(res: Response, error: unknown) {
  if (error instanceof SignupError) {
    return res.status(error.status).json({ error: error.message });
  }
  if (error instanceof PermissionError) {
    return res.status(403).json({ error: error.message });
  }
  const code = error && typeof error === 'object' && 'code' in error ? (error as { code?: string }).code : undefined;
  if (code === 'ER_DUP_ENTRY') {
    return res.status(409).json({ error: 'An account with those details already exists.' });
  }
  const message = error instanceof Error ? error.message : String(error);
  if (/(?:mysql|database) is unavailable|connect|timed? ?out|refused/i.test(message)) {
    return res.status(503).json({ error: 'The school database is unavailable. Try again shortly.' });
  }
  console.error('[AccountSignup] Unexpected error:', error);
  return res.status(500).json({ error: 'Unable to process the request right now.' });
}

// --- Public parent and student sign-up (verification + school approval required) ---

app.post(
  '/api/public/accounts/parent/signup',
  assertSameOrigin,
  accountSignupRateLimiter,
  async (req: Request, res: Response) => {
    try {
      const request = await createParentSignupRequest({
        fullName: req.body?.fullName ?? '',
        phone: req.body?.phone ?? '',
        email: req.body?.email ?? '',
        password: req.body?.password ?? '',
        confirmPassword: req.body?.confirmPassword ?? '',
        admissionNumber: req.body?.admissionNumber ?? '',
        admissionNumbers: req.body?.admissionNumbers,
        preferredLanguage: req.body?.preferredLanguage as LanguageCode
      });
      return res.status(201).json({ request });
    } catch (error) {
      return respondWithSignupError(res, error);
    }
  }
);

app.post(
  '/api/public/accounts/student/signup',
  assertSameOrigin,
  accountSignupRateLimiter,
  async (req: Request, res: Response) => {
    try {
      const request = await createStudentSignupRequest({
        fullName: req.body?.fullName ?? '',
        admissionNumber: req.body?.admissionNumber ?? '',
        dob: req.body?.dob ?? '',
        email: req.body?.email ?? '',
        password: req.body?.password ?? '',
        confirmPassword: req.body?.confirmPassword ?? '',
        preferredLanguage: req.body?.preferredLanguage as LanguageCode
      });
      return res.status(201).json({ request });
    } catch (error) {
      return respondWithSignupError(res, error);
    }
  }
);

app.post(
  '/api/public/accounts/verify',
  assertSameOrigin,
  accountSignupRateLimiter,
  async (req: Request, res: Response) => {
    try {
      const request = await verifySignupRequest(req.body?.requestId ?? '', req.body?.code ?? '');
      return res.json({ request });
    } catch (error) {
      return respondWithSignupError(res, error);
    }
  }
);

app.post(
  '/api/public/accounts/resend',
  assertSameOrigin,
  accountSignupRateLimiter,
  async (req: Request, res: Response) => {
    try {
      const request = await resendSignupCode(req.body?.requestId ?? '');
      return res.json({ request });
    } catch (error) {
      return respondWithSignupError(res, error);
    }
  }
);

app.get('/api/public/accounts/status/:id', async (req: Request, res: Response) => {
  try {
    const request = await getPublicSignupRequestView(req.params.id);
    return res.json({ request });
  } catch (error) {
    return respondWithSignupError(res, error);
  }
});

app.get('/api/account-signup-requests', async (req: Request, res: Response) => {
  try {
    const actor = getActor(req);
    assertCanManageInvitations(actor);
    return res.json(await listSignupRequests(actor.schoolId));
  } catch (error) {
    return respondWithSignupError(res, error);
  }
});

app.post('/api/account-signup-requests/:id/approve', async (req: Request, res: Response) => {
  try {
    const actor = getActor(req);
    assertCanManageInvitations(actor);
    const user = await approveSignupRequest(req.params.id, actor, req.body?.notes ?? '');
    return res.json({ user });
  } catch (error) {
    return respondWithSignupError(res, error);
  }
});

app.post('/api/account-signup-requests/:id/reject', async (req: Request, res: Response) => {
  try {
    const actor = getActor(req);
    assertCanManageInvitations(actor);
    const request = await rejectSignupRequest(req.params.id, actor, req.body?.notes ?? '');
    return res.json({ request });
  } catch (error) {
    return respondWithSignupError(res, error);
  }
});

// --- Narrow parent/student self-service portal (no staff write permissions) ---

app.get('/api/portal/dashboard', requireRole('PARENT', 'STUDENT'), (req: Request, res: Response) => {
  try {
    const actor = getActor(req);
    const allowed = portalStudentIds(actor) || [];
    const students = scopeStudentsForActor(actor, db.getStudents(actor.schoolId)).filter(student =>
      allowed.includes(student.id)
    );
    const studentIds = new Set(students.map(student => student.id));
    const classIds = Array.from(new Set(students.map(student => student.classId).filter(Boolean)));

    const timetable = classIds.flatMap(classId => db.getTimetable(actor.schoolId, classId));
    const homework = classIds.flatMap(classId => db.getHomework(actor.schoolId, classId));
    const dedupeById = <T extends { id: string }>(items: T[]): T[] =>
      Array.from(new Map(items.map(item => [item.id, item])).values());

    const dashboard: PortalDashboardView = {
      students,
      healthIncidents: db.getHealthIncidents(actor.schoolId).filter(item => studentIds.has(item.studentId)),
      attendance: db.getAttendance(actor.schoolId).filter(item => studentIds.has(item.studentId)),
      invoices: db.getInvoices(actor.schoolId).filter(item => studentIds.has(item.studentId)),
      payments: db.getPayments(actor.schoolId).filter(item => studentIds.has(item.studentId)),
      // Portals only receive reports that leadership has explicitly published.
      reportCards: db.getReportCards(actor.schoolId, undefined, { publishedOnly: true })
        .filter(item => studentIds.has(item.studentId)),
      timetable: dedupeById(timetable),
      homework: dedupeById(homework)
    };
    return res.json(dashboard);
  } catch (error) {
    return respondWithPortalError(res, error);
  }
});

app.post('/api/portal/attendance/:id/explain', requireRole('PARENT'), (req: Request, res: Response) => {
  try {
    const actor = getActor(req);
    const existing = db.getAttendance(actor.schoolId).find(record => record.id === req.params.id);
    if (!existing) return res.status(404).json({ error: 'Record not found' });
    assertPortalStudentAccess(actor, existing.studentId);
    if (existing.status !== 'ABSENT') {
      return res.status(400).json({ error: 'Only absence records can be explained.' });
    }
    const explanation = sanitizeInput(req.body?.explanation, 1000);
    if (!explanation) return res.status(400).json({ error: 'Enter an explanation.' });
    const updated = db.updateAttendanceExplanation(req.params.id, explanation);
    if (!updated) return res.status(404).json({ error: 'Record not found' });
    db.logAudit(
      updated.schoolId,
      actor.id,
      actor.fullName,
      actor.role,
      'EXPLAIN_ABSENCE',
      'ATTENDANCE',
      updated.id,
      `Parent provided an absence explanation: "${explanation}"`,
      req.ip
    );
    return res.json(updated);
  } catch (error) {
    return respondWithPortalError(res, error);
  }
});

app.post('/api/portal/health-incidents/:id/acknowledge', requireRole('PARENT'), (req: Request, res: Response) => {
  try {
    const actor = getActor(req);
    const existing = db.getHealthIncidentById(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Incident not found' });
    assertSchoolRecordAccess(req, existing.schoolId, 'Health incident');
    assertPortalStudentAccess(actor, existing.studentId);
    const updated = db.acknowledgeIncident(req.params.id, sanitizeInput(req.body?.notes, 1000));
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
  } catch (error) {
    return respondWithPortalError(res, error);
  }
});

app.post('/api/portal/payments', requireRole('PARENT'), (_req: Request, res: Response) => {
  // A parent must never be able to mark an invoice as paid from the browser.
  // There is no verified payment-provider callback wired into this deployment,
  // so accepting these requests would create false COMPLETED receipts.
  return res.status(503).json({
    error:
      'Online parent payments are not enabled. Pay through the school bursar (bank/MTN/Airtel) and ask the bursar to record the official receipt.'
  });
});

app.get('/api/users', requireRole('SUPER_ADMIN', 'SCHOOL_ADMIN'), (req: Request, res: Response) => {
  const schoolId = getScopedSchoolId(req);
  return res.json(db.getUsers(schoolId));
});

// --- Staff management, delegated permissions and invitations ---

function respondWithStaffError(res: Response, error: unknown) {
  if (error instanceof PermissionError) {
    return res.status(403).json({ error: error.message });
  }
  if (error instanceof StaffManagementError) {
    return res.status(400).json({ error: error.message });
  }
  console.error('[Staff] Unhandled error:', error);
  return res.status(500).json({ error: 'The staff action could not be completed.' });
}

function staffAccountView(account: ReturnType<typeof db.getStaffAccounts>[number]) {
  const user = db.getUserById(account.userId);
  const staffMember = db
    .getStaff(account.schoolId)
    .find(member => member.id === `stf-${account.userId}` || member.email.toLowerCase() === (user?.email || '').toLowerCase());
  return {
    ...account,
    user: user
      ? {
          id: user.id,
          fullName: user.fullName,
          email: user.email,
          role: user.role,
          phone: user.phone,
          isActive: user.isActive,
          lastLogin: user.lastLogin,
          delegatedPermissions: user.delegatedPermissions,
          delegatedRoleScope: user.delegatedRoleScope
        }
      : null,
    staffMember: staffMember || null
  };
}

app.get('/api/permissions', (req: Request, res: Response) => {
  const actor = getActor(req);
  return res.json({
    role: actor.role,
    effectivePermissions: getEffectivePermissions(actor),
    delegatablePermissions: DELEGATABLE_PERMISSIONS,
    leaderOnlyDelegatablePermissions: LEADER_ONLY_DELEGATABLE_PERMISSIONS,
    delegatableRoleScope: ASSIGNABLE_STAFF_ROLES,
    rolePermissions: ROLE_PERMISSIONS,
    catalog: PERMISSION_CATALOG
  });
});

app.get('/api/staff/accounts', requirePermission('staff.read'), (req: Request, res: Response) => {
  try {
    const actor = getActor(req);
    assertCanViewStaff(actor);
    const schoolId = getScopedSchoolId(req);
    return res.json(db.getStaffAccounts(schoolId).map(staffAccountView));
  } catch (error) {
    return respondWithStaffError(res, error);
  }
});

app.get('/api/staff/summary', requirePermission('staff.read'), (req: Request, res: Response) => {
  try {
    const actor = getActor(req);
    assertCanViewStaff(actor);
    const schoolId = getScopedSchoolId(req);
    return res.json(getStaffSummary(schoolId));
  } catch (error) {
    return respondWithStaffError(res, error);
  }
});

app.get('/api/staff/directory', requirePermission('staff.read'), (req: Request, res: Response) => {
  try {
    const actor = getActor(req);
    assertCanViewStaff(actor);
    const schoolId = getScopedSchoolId(req);
    return res.json(
      getStaffDirectory(schoolId, {
        search: req.query.search as string,
        role: req.query.role as string,
        department: req.query.department as string,
        status: req.query.status as string,
        page: req.query.page as string,
        pageSize: req.query.pageSize as string
      })
    );
  } catch (error) {
    return respondWithStaffError(res, error);
  }
});

app.get('/api/staff/delegated-administrators', requirePermission('permissions.view'), (req: Request, res: Response) => {
  try {
    const actor = getActor(req);
    const schoolId = actor.schoolId;
    return res.json(
      db.getStaffAccounts(schoolId)
        .filter(account => account.status !== 'ARCHIVED' && (account.delegatedPermissions || []).length > 0)
        .map(staffAccountView)
    );
  } catch (error) {
    return respondWithStaffError(res, error);
  }
});

app.get(
  '/api/staff/accounts/:userId/permission-grants',
  requirePermission('permissions.view'),
  (req: Request, res: Response) => {
    try {
      const actor = getActor(req);
      const target = db.getUserById(req.params.userId);
      if (!target) return res.status(404).json({ error: 'Staff account not found.' });
      assertSchoolRecordAccess(req, target.schoolId, 'Staff account');
      const grants = db
        .getPermissionGrants(getScopedSchoolId(req))
        .filter(record => record.userId === target.id)
        .sort((a, b) => new Date(b.grantedAt).getTime() - new Date(a.grantedAt).getTime());
      return res.json(grants);
    } catch (error) {
      return respondWithStaffError(res, error);
    }
  }
);

app.post(
  '/api/staff/accounts/:userId/permissions/revoke-one',
  requirePermission('permissions.revoke'),
  (req: Request, res: Response) => {
    try {
      const actor = getActor(req);
      const target = db.getUserById(req.params.userId);
      if (!target) return res.status(404).json({ error: 'Staff account not found.' });
      assertCanRevokePermissions(actor, target);
      const permission = typeof req.body?.permission === 'string'
        ? canonicalPermission(req.body.permission)
        : '';
      if (!permission) return res.status(400).json({ error: 'A permission is required.' });
      const previous = (target.delegatedPermissions || []).map(canonicalPermission);
      if (!previous.includes(permission)) {
        return res.status(400).json({ error: 'This permission is not delegated to that account.' });
      }
      const permissions = previous.filter(item => item !== permission);
      db.setDelegatedPermissions(target.id, permissions);

      const staffCreationPermissions = ['staff.create', 'staff.assign_roles', 'invitations.manage'];
      if (!permissions.some(item => staffCreationPermissions.includes(item))) {
        const user = db.getUserById(target.id);
        if (user) user.delegatedRoleScope = [];
        const account = db.getStaffAccountByUserId(target.id);
        if (account) account.delegatedRoleScope = [];
        db.persist();
      }

      db.createPermissionGrant({
        id: `grant-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`,
        schoolId: actor.schoolId,
        userId: target.id,
        previousPermissions: previous,
        permissions,
        previousRoleScope: target.delegatedRoleScope || [],
        roleScope: db.getUserById(target.id)?.delegatedRoleScope || [],
        grantedBy: actor.id,
        grantedAt: new Date().toISOString(),
        revokedAt: new Date().toISOString(),
        revokedBy: actor.id
      });
      db.logAudit(
        actor.schoolId,
        actor.id,
        actor.fullName,
        actor.role,
        'STAFF_PERMISSION_REVOKED',
        'STAFF_ACCOUNT',
        target.id,
        `Revoked one delegated permission: ${permission}`,
        req.ip
      );
      const account = db.getStaffAccountByUserId(target.id);
      return res.json({ user: db.getUserById(target.id), account: account ? staffAccountView(account) : null });
    } catch (error) {
      return respondWithStaffError(res, error);
    }
  }
);

app.get('/api/permission-groups', requirePermission('permissions.view'), (req: Request, res: Response) => {
  try {
    const actor = getActor(req);
    return res.json(db.getPermissionGroups(getScopedSchoolId(req)));
  } catch (error) {
    return respondWithStaffError(res, error);
  }
});

app.post('/api/permission-groups', requirePermission('permissions.delegate'), (req: Request, res: Response) => {
  try {
    const actor = getActor(req);
    const name = typeof req.body?.name === 'string' ? req.body.name.trim() : '';
    if (name.length < 2 || name.length > 80) {
      return res.status(400).json({ error: 'Group name must be between 2 and 80 characters.' });
    }
    const rawPermissions = Array.isArray(req.body?.permissions) ? req.body.permissions : [];
    if (!rawPermissions.every((permission: unknown) => typeof permission === 'string')) {
      return res.status(400).json({ error: 'Permissions must be a list of permission names.' });
    }
    if (rawPermissions.length === 0) {
      return res.status(400).json({ error: 'Select at least one permission for the group.' });
    }
    const roleScope = Array.isArray(req.body?.roleScope)
      ? (req.body.roleScope.filter((role: unknown) =>
          typeof role === 'string' && ASSIGNABLE_STAFF_ROLES.includes(role as UserRole)
        ) as UserRole[])
      : undefined;
    const permissions = assertCanDefinePermissionGroup(actor, rawPermissions as string[], roleScope);
    const group: PermissionGroup = {
      id: `perm-group-${crypto.randomUUID()}`,
      schoolId: actor.schoolId,
      name,
      description: typeof req.body?.description === 'string' ? req.body.description.trim().slice(0, 500) : undefined,
      permissions,
      roleScope,
      createdBy: actor.id,
      createdAt: new Date().toISOString()
    };
    db.createPermissionGroup(group);
    db.logAudit(
      actor.schoolId,
      actor.id,
      actor.fullName,
      actor.role,
      'PERMISSION_GROUP_CREATED',
      'PERMISSION_GROUP',
      group.id,
      `Created permission group "${group.name}" with ${permissions.length} permissions.`,
      req.ip
    );
    return res.status(201).json(group);
  } catch (error) {
    return respondWithStaffError(res, error);
  }
});

app.put('/api/permission-groups/:id', requirePermission('permissions.delegate'), (req: Request, res: Response) => {
  try {
    const actor = getActor(req);
    const group = db.getPermissionGroupById(req.params.id);
    if (!group || group.schoolId !== actor.schoolId || group.archivedAt) {
      return res.status(404).json({ error: 'Permission group not found.' });
    }
    const rawPermissions = Array.isArray(req.body?.permissions) ? req.body.permissions : [];
    if (!rawPermissions.every((permission: unknown) => typeof permission === 'string')) {
      return res.status(400).json({ error: 'Permissions must be a list of permission names.' });
    }
    if (rawPermissions.length === 0) {
      return res.status(400).json({ error: 'Select at least one permission for the group.' });
    }
    const roleScope = Array.isArray(req.body?.roleScope)
      ? (req.body.roleScope.filter((role: unknown) =>
          typeof role === 'string' && ASSIGNABLE_STAFF_ROLES.includes(role as UserRole)
        ) as UserRole[])
      : undefined;
    const permissions = assertCanDefinePermissionGroup(actor, rawPermissions as string[], roleScope);
    const updated = db.updatePermissionGroup(group.id, {
      name: typeof req.body?.name === 'string' ? req.body.name.trim().slice(0, 80) : group.name,
      description: typeof req.body?.description === 'string' ? req.body.description.trim().slice(0, 500) : group.description,
      permissions,
      roleScope,
      updatedBy: actor.id,
      updatedAt: new Date().toISOString()
    });
    db.logAudit(
      actor.schoolId,
      actor.id,
      actor.fullName,
      actor.role,
      'PERMISSION_GROUP_UPDATED',
      'PERMISSION_GROUP',
      group.id,
      `Updated permission group "${group.name}".`,
      req.ip
    );
    return res.json(updated);
  } catch (error) {
    return respondWithStaffError(res, error);
  }
});

app.post('/api/permission-groups/:id/assign', requirePermission('permissions.delegate'), (req: Request, res: Response) => {
  try {
    const actor = getActor(req);
    const group = db.getPermissionGroupById(req.params.id);
    if (!group || group.schoolId !== actor.schoolId || group.archivedAt) {
      return res.status(404).json({ error: 'Permission group not found.' });
    }
    const target = db.getUserById(String(req.body?.userId || ''));
    if (!target) return res.status(404).json({ error: 'Staff account not found.' });
    assertCanGrantPermissions(actor, target, group.permissions, group.roleScope);

    const previousPermissions = (target.delegatedPermissions || []).map(canonicalPermission);
    db.setDelegatedPermissions(target.id, group.permissions);
    if (group.roleScope || (target.delegatedRoleScope || []).length > 0) {
      const user = db.getUserById(target.id);
      if (user) user.delegatedRoleScope = group.roleScope || [];
      const account = db.getStaffAccountByUserId(target.id);
      if (account) account.delegatedRoleScope = group.roleScope || [];
      db.persist();
    }
    db.createPermissionGrant({
      id: `grant-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`,
      schoolId: actor.schoolId,
      userId: target.id,
      previousPermissions,
      permissions: group.permissions,
      previousRoleScope: target.delegatedRoleScope || [],
      roleScope: group.roleScope || [],
      grantedBy: actor.id,
      grantedAt: new Date().toISOString()
    });
    db.logAudit(
      actor.schoolId,
      actor.id,
      actor.fullName,
      actor.role,
      'PERMISSION_GROUP_ASSIGNED',
      'STAFF_ACCOUNT',
      target.id,
      `Applied permission group "${group.name}" to ${target.fullName}.`,
      req.ip
    );
    const account = db.getStaffAccountByUserId(target.id);
    return res.json({ user: db.getUserById(target.id), account: account ? staffAccountView(account) : null });
  } catch (error) {
    return respondWithStaffError(res, error);
  }
});

app.delete('/api/permission-groups/:id', requirePermission('permissions.delegate'), (req: Request, res: Response) => {
  try {
    const actor = getActor(req);
    const group = db.getPermissionGroupById(req.params.id);
    if (!group || group.schoolId !== actor.schoolId || group.archivedAt) {
      return res.status(404).json({ error: 'Permission group not found.' });
    }
    db.updatePermissionGroup(group.id, {
      archivedAt: new Date().toISOString(),
      archivedBy: actor.id
    });
    db.logAudit(
      actor.schoolId,
      actor.id,
      actor.fullName,
      actor.role,
      'PERMISSION_GROUP_ARCHIVED',
      'PERMISSION_GROUP',
      group.id,
      `Archived permission group "${group.name}"; existing staff grants are unchanged.`,
      req.ip
    );
    return res.json({ success: true });
  } catch (error) {
    return respondWithStaffError(res, error);
  }
});

app.get('/api/staff/activity', requirePermission('audit.review'), (req: Request, res: Response) => {
  const actor = getActor(req);
  const logs = db.getAuditLogs(actor.schoolId);
  const action = (req.query.action as string || '').trim().toLowerCase();
  const staffLogs = logs.filter(entry =>
    entry.entityType === 'STAFF_ACCOUNT' ||
    entry.entityType === 'STAFF_INVITATION' ||
    entry.entityType === 'STAFF_PERMISSION' ||
    entry.action.startsWith('STAFF_') ||
    entry.action === 'USER_LOGIN'
  );
  return res.json(
    action ? staffLogs.filter(entry => entry.action.toLowerCase().includes(action)) : staffLogs
  );
});

app.put(
  '/api/staff/accounts/:userId/permissions',
  requirePermission('permissions.delegate'),
  (req: Request, res: Response) => {
    try {
      const actor = getActor(req);
      const target = db.getUserById(req.params.userId);
      if (!target) return res.status(404).json({ error: 'Staff account not found.' });

      const rawPermissions = Array.isArray(req.body?.permissions) ? req.body.permissions : [];
      if (!rawPermissions.every((permission: unknown) => typeof permission === 'string')) {
        return res.status(400).json({ error: 'Permissions must be a list of permission names.' });
      }
      const permissions = rawPermissions.map((permission: string) => canonicalPermission(permission));
      const rawRoleScope = Array.isArray(req.body?.roleScope) ? req.body.roleScope : undefined;
      if (rawRoleScope && !rawRoleScope.every((role: unknown) => typeof role === 'string')) {
        return res.status(400).json({ error: 'Role scope must be a list of staff role codes.' });
      }
      const roleScope = rawRoleScope?.filter((role: string) => ASSIGNABLE_STAFF_ROLES.includes(role as any)) as
        | UserRole[]
        | undefined;
      assertCanGrantPermissions(actor, target, permissions, roleScope);

      const previousPermissions = Array.isArray(target.delegatedPermissions)
        ? target.delegatedPermissions.map(canonicalPermission)
        : [];
      const previousRoleScope = target.delegatedRoleScope || [];
      db.setDelegatedPermissions(target.id, permissions);
      if (roleScope || previousRoleScope.length > 0) {
        const user = db.getUserById(target.id);
        if (user) user.delegatedRoleScope = roleScope || [];
        const staffAccount = db.getStaffAccountByUserId(target.id);
        if (staffAccount) {
          staffAccount.delegatedRoleScope = roleScope || [];
          staffAccount.lastModifiedAt = new Date().toISOString();
        }
        db.persist();
      }
      db.createPermissionGrant({
        id: `grant-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`,
        schoolId: actor.schoolId,
        userId: target.id,
        previousPermissions,
        permissions,
        previousRoleScope,
        roleScope: roleScope || [],
        grantedBy: actor.id,
        grantedAt: new Date().toISOString()
      });
      db.logAudit(
        actor.schoolId,
        actor.id,
        actor.fullName,
        actor.role,
        'STAFF_PERMISSIONS_GRANTED',
        'STAFF_ACCOUNT',
        target.id,
        `Delegated permissions: ${permissions.join(', ') || 'none'}; roles: ${(roleScope || previousRoleScope).join(', ') || 'not restricted'}`,
        req.ip
      );

      const account = db.getStaffAccountByUserId(target.id);
      return res.json({ user: target, account: account ? staffAccountView(account) : null });
    } catch (error) {
      return respondWithStaffError(res, error);
    }
  }
);

app.post(
  '/api/staff/accounts/:userId/permissions/revoke',
  requirePermission('permissions.revoke'),
  (req: Request, res: Response) => {
    try {
      const actor = getActor(req);
      const target = db.getUserById(req.params.userId);
      if (!target) return res.status(404).json({ error: 'Staff account not found.' });

      assertCanRevokePermissions(actor, target);
      const previousPermissions = Array.isArray(target.delegatedPermissions)
        ? target.delegatedPermissions.map(canonicalPermission)
        : [];
      const previousRoleScope = target.delegatedRoleScope || [];
      db.setDelegatedPermissions(target.id, []);
      const revokedUser = db.getUserById(target.id);
      if (revokedUser) revokedUser.delegatedRoleScope = [];
      const revokedAccount = db.getStaffAccountByUserId(target.id);
      if (revokedAccount) {
        revokedAccount.delegatedRoleScope = [];
        revokedAccount.lastModifiedAt = new Date().toISOString();
      }
      db.persist();
      db.createPermissionGrant({
        id: `grant-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`,
        schoolId: actor.schoolId,
        userId: target.id,
        previousPermissions,
        permissions: [],
        previousRoleScope,
        roleScope: [],
        grantedBy: actor.id,
        grantedAt: new Date().toISOString(),
        revokedAt: new Date().toISOString(),
        revokedBy: actor.id
      });
      db.logAudit(
        actor.schoolId,
        actor.id,
        actor.fullName,
        actor.role,
        'STAFF_PERMISSIONS_REVOKED',
        'STAFF_ACCOUNT',
        target.id,
        `Revoked permissions: ${previousPermissions.join(', ') || 'none'}; roles: ${previousRoleScope.join(', ') || 'none'}`,
        req.ip
      );

      const account = db.getStaffAccountByUserId(target.id);
      return res.json({ user: target, account: account ? staffAccountView(account) : null });
    } catch (error) {
      return respondWithStaffError(res, error);
    }
  }
);

app.patch(
  '/api/staff/accounts/:userId/role',
  requireAnyPermission('staff.assign_roles', 'staff.role.manage'),
  (req: Request, res: Response) => {
    try {
      const actor = getActor(req);
      const target = db.getUserById(req.params.userId);
      if (!target) return res.status(404).json({ error: 'Staff account not found.' });

      const role = req.body?.role as UserRole;
      if (!ASSIGNABLE_STAFF_ROLES.includes(role)) {
        return res.status(400).json({ error: 'Choose a valid assignable staff role.' });
      }
      assertCanAssignStaffRole(actor, target, role);

      const previousRole = target.role;
      db.updateUserRole(target.id, role);
      const account = db.getStaffAccountByUserId(target.id);
      if (account) {
        db.updateStaffAccount(account.id, {
          role,
          professionalTitle: getProfessionalTitle(role)
        });
      }
      const staffMember = db.getStaff(actor.schoolId).find(
        member => member.email.toLowerCase() === target.email.toLowerCase()
      );
      if (staffMember) {
        db.updateStaffMember(staffMember.id, { role, title: getProfessionalTitle(role) });
      }
      db.logAudit(
        actor.schoolId,
        actor.id,
        actor.fullName,
        actor.role,
        'STAFF_ROLE_CHANGED',
        'STAFF_ACCOUNT',
        target.id,
        `${previousRole} -> ${role}`,
        req.ip
      );

      const updatedUser = db.getUserById(target.id);
      const updatedAccount = db.getStaffAccountByUserId(target.id);
      return res.json({ user: updatedUser, account: updatedAccount ? staffAccountView(updatedAccount) : null });
    } catch (error) {
      return respondWithStaffError(res, error);
    }
  }
);

app.patch(
  '/api/staff/accounts/:userId/status',
  requireAnyPermission('staff.activate', 'staff.suspend'),
  (req: Request, res: Response) => {
    try {
      const actor = getActor(req);
      const target = db.getUserById(req.params.userId);
      if (!target) return res.status(404).json({ error: 'Staff account not found.' });

      const status = req.body?.status;
      if (status !== 'ACTIVE' && status !== 'SUSPENDED') {
        return res.status(400).json({ error: 'Status must be ACTIVE or SUSPENDED.' });
      }
      if (status === 'ACTIVE') assertCanActivateStaff(actor, target);
      else assertCanSuspendStaff(actor, target);

      db.setUserActive(target.id, status === 'ACTIVE');
      const account = db.getStaffAccountByUserId(target.id);
      if (account) db.updateStaffAccount(account.id, { status });
      db.logAudit(
        actor.schoolId,
        actor.id,
        actor.fullName,
        actor.role,
        status === 'ACTIVE' ? 'STAFF_ACCOUNT_ACTIVATED' : 'STAFF_ACCOUNT_SUSPENDED',
        'STAFF_ACCOUNT',
        target.id,
        `Account status set to ${status}`,
        req.ip
      );

      const updatedAccount = db.getStaffAccountByUserId(target.id);
      return res.json({
        user: db.getUserById(target.id),
        account: updatedAccount ? staffAccountView(updatedAccount) : null
      });
    } catch (error) {
      return respondWithStaffError(res, error);
    }
  }
);

app.get('/api/staff/accounts/:userId', requirePermission('staff.read'), (req: Request, res: Response) => {
  try {
    const actor = getActor(req);
    assertCanViewStaff(actor);
    const profile = getStaffProfile(actor.schoolId, req.params.userId);
    if (!profile) return res.status(404).json({ error: 'Staff account not found.' });
    return res.json(profile);
  } catch (error) {
    return respondWithStaffError(res, error);
  }
});

app.patch(
  '/api/staff/accounts/:userId/profile',
  requirePermission('staff.write'),
  (req: Request, res: Response) => {
    try {
      const actor = getActor(req);
      const target = db.getUserById(req.params.userId);
      if (!target) return res.status(404).json({ error: 'Staff account not found.' });
      assertCanEditStaff(actor, target);

      const input = {
        fullName: typeof req.body?.fullName === 'string' ? req.body.fullName : undefined,
        phone: typeof req.body?.phone === 'string' ? req.body.phone : undefined,
        staffId: typeof req.body?.staffId === 'string' ? req.body.staffId : undefined,
        professionalTitle: typeof req.body?.professionalTitle === 'string' ? req.body.professionalTitle : undefined,
        department: typeof req.body?.department === 'string' ? req.body.department : undefined,
        gender: req.body?.gender === 'M' || req.body?.gender === 'F' ? req.body.gender : undefined,
        photoUrl: typeof req.body?.photoUrl === 'string' ? req.body.photoUrl : undefined,
        responsibilities: Array.isArray(req.body?.responsibilities) ? req.body.responsibilities : undefined,
        employmentStartDate: typeof req.body?.employmentStartDate === 'string' ? req.body.employmentStartDate : undefined
      };
      const profile = updateStaffProfile(actor.schoolId, target.id, input, actor.id);
      if (!profile) return res.status(404).json({ error: 'Staff account not found.' });
      db.logAudit(
        actor.schoolId,
        actor.id,
        actor.fullName,
        actor.role,
        'STAFF_ACCOUNT_EDITED',
        'STAFF_ACCOUNT',
        target.id,
        `Updated professional profile for ${profile.fullName}`,
        req.ip
      );
      return res.json(profile);
    } catch (error) {
      return respondWithStaffError(res, error);
    }
  }
);

app.post(
  '/api/staff/accounts/:userId/archive',
  requirePermission('staff.archive'),
  (req: Request, res: Response) => {
    try {
      const actor = getActor(req);
      const target = db.getUserById(req.params.userId);
      if (!target) return res.status(404).json({ error: 'Staff account not found.' });
      assertCanArchiveStaff(actor, target);
      const reason = typeof req.body?.reason === 'string' ? req.body.reason.trim().slice(0, 500) : undefined;
      const archived = archiveStaffAccount(actor.schoolId, target.id, actor.id, reason || undefined);
      if (!archived) return res.status(404).json({ error: 'Staff account not found.' });
      db.logAudit(
        actor.schoolId,
        actor.id,
        actor.fullName,
        actor.role,
        'STAFF_ACCOUNT_ARCHIVED',
        'STAFF_ACCOUNT',
        target.id,
        `Archived staff record for ${archived.item.fullName}; history preserved`,
        req.ip
      );
      return res.json(archived);
    } catch (error) {
      return respondWithStaffError(res, error);
    }
  }
);

app.post(
  '/api/staff/accounts/:userId/restore',
  requirePermission('staff.archive'),
  (req: Request, res: Response) => {
    try {
      const actor = getActor(req);
      const target = db.getUserById(req.params.userId);
      if (!target) return res.status(404).json({ error: 'Staff account not found.' });
      assertCanArchiveStaff(actor, target);
      const restored = restoreStaffAccount(actor.schoolId, target.id, actor.id);
      if (!restored) {
        return res.status(400).json({ error: 'Only an archived staff account can be restored.' });
      }
      db.logAudit(
        actor.schoolId,
        actor.id,
        actor.fullName,
        actor.role,
        'STAFF_ACCOUNT_RESTORED',
        'STAFF_ACCOUNT',
        target.id,
        `Restored staff record for ${restored.item.fullName}; delegated access must be re-granted`,
        req.ip
      );
      return res.json(restored);
    } catch (error) {
      return respondWithStaffError(res, error);
    }
  }
);

app.post(
  '/api/staff/accounts/:userId/reset-access',
  requirePermission('staff.write'),
  async (req: Request, res: Response) => {
    const actor = getActor(req);
    const target = db.getUserById(req.params.userId);
    if (!target) return res.status(404).json({ error: 'Staff account not found.' });

    try {
      assertCanResetStaffAccess(actor, target);
    } catch (error) {
      return respondWithStaffError(res, error);
    }

    // Generate a strong one-time password. It is returned exactly once and
    // never written to the audit log or any other persisted record.
    const temporaryPassword = `Sc-${crypto.randomBytes(15).toString('base64url')}`;
    try {
      await replacePassword(target.id, temporaryPassword);
    } catch (error) {
      console.error('[Staff] Password replacement failed:', error);
      return res.status(503).json({
        error: 'The MariaDB service is unavailable. The access reset was not applied; try again.'
      });
    }

    const credentialsResetAt = new Date().toISOString();
    db.setCredentialsResetAt(target.id, credentialsResetAt);
    invalidateUserSessions(target.id);
    db.logAudit(
      actor.schoolId,
      actor.id,
      actor.fullName,
      actor.role,
      'STAFF_ACCESS_RESET',
      'STAFF_ACCOUNT',
      target.id,
      `Reset access for ${target.fullName}: all sessions revoked and password replaced. The temporary password was shown once to the administrator.`,
      req.ip
    );

    return res.json({
      temporaryPassword,
      credentialsResetAt,
      user: db.getUserById(target.id)
    });
  }
);

app.get(
  '/api/staff/invitations',
  requirePermission('invitations.manage'),
  (req: Request, res: Response) => {
    try {
      const actor = getActor(req);
      assertCanManageInvitations(actor);
      return res.json(db.getStaffInvitations(actor.schoolId).map(publicInvitation));
    } catch (error) {
      return respondWithStaffError(res, error);
    }
  }
);

app.post(
  '/api/staff/invitations',
  requirePermission('invitations.manage'),
  async (req: Request, res: Response) => {
    try {
      const actor = getActor(req);
      assertCanManageInvitations(actor);
      const role = req.body?.role as UserRole;
      assertCanCreateStaffRole(actor, role);
      const { invitation, token } = createStaffInvitation(
        {
          fullName: req.body?.fullName,
          email: req.body?.email,
          phone: req.body?.phone,
          role,
          gender: req.body?.gender,
          preferredLanguage: req.body?.preferredLanguage,
          professionalTitle: req.body?.professionalTitle,
          department: req.body?.department,
          staffId: req.body?.staffId,
          photoUrl: typeof req.body?.photoUrl === 'string' ? req.body.photoUrl : undefined,
          responsibilities: req.body?.responsibilities,
          employmentStartDate: req.body?.employmentStartDate,
          deliveryMode: req.body?.deliveryMode
        },
        actor
      );
      const activationUrl = `/portal#/staff-activate?token=${encodeURIComponent(token)}`;
      const delivery = await notifyStaffInvitation({
        fullName: invitation.fullName,
        email: invitation.email,
        phone: invitation.phone,
        role: invitation.role,
        activationUrl,
        deliveryMode: invitation.deliveryMode
      });
      invitation.notificationStatuses = delivery;
      db.updateStaffInvitation(invitation.id, { notificationStatuses: delivery });
      db.logAudit(
        actor.schoolId,
        actor.id,
        actor.fullName,
        actor.role,
        'STAFF_INVITATION_CREATED',
        'STAFF_INVITATION',
        invitation.id,
        `Invited ${invitation.email} as ${invitation.role}`,
        req.ip
      );
      return res.status(201).json({
        invitation: publicInvitation(invitation),
        token,
        activationUrl,
        delivery,
        deliveryPending: !delivery.some(status => status.sent)
      });
    } catch (error) {
      return respondWithStaffError(res, error);
    }
  }
);

app.post(
  '/api/staff/invitations/:id/revoke',
  requirePermission('invitations.manage'),
  (req: Request, res: Response) => {
    try {
      const actor = getActor(req);
      assertCanManageInvitations(actor);
      const invitation = db.getStaffInvitationById(req.params.id);
      if (!invitation || invitation.schoolId !== actor.schoolId) {
        return res.status(404).json({ error: 'Invitation not found.' });
      }
      if (invitation.consumedAt) {
        return res.status(400).json({ error: 'A used invitation cannot be revoked.' });
      }
      const updated = db.updateStaffInvitation(invitation.id, {
        revokedAt: new Date().toISOString()
      });
      db.logAudit(
        actor.schoolId,
        actor.id,
        actor.fullName,
        actor.role,
        'STAFF_INVITATION_REVOKED',
        'STAFF_INVITATION',
        invitation.id,
        `Revoked invitation for ${invitation.email}`,
        req.ip
      );
      return res.json({ invitation: updated ? publicInvitation(updated) : null });
    } catch (error) {
      return respondWithStaffError(res, error);
    }
  }
);

app.post(
  '/api/staff/invitations/:id/resend',
  requirePermission('invitations.manage'),
  async (req: Request, res: Response) => {
    try {
      const actor = getActor(req);
      assertCanManageInvitations(actor);
      const invitation = db.getStaffInvitationById(req.params.id);
      if (!invitation || invitation.schoolId !== actor.schoolId) {
        return res.status(404).json({ error: 'Invitation not found.' });
      }
      const { invitation: updated, token } = resendStaffInvitation(invitation);
      const activationUrl = `/portal#/staff-activate?token=${encodeURIComponent(token)}`;
      const delivery = await notifyStaffInvitation({
        fullName: updated.fullName,
        email: updated.email,
        phone: updated.phone,
        role: updated.role,
        activationUrl,
        deliveryMode: updated.deliveryMode
      });
      const withDelivery = db.updateStaffInvitation(updated.id, { notificationStatuses: delivery });
      db.logAudit(
        actor.schoolId,
        actor.id,
        actor.fullName,
        actor.role,
        'STAFF_INVITATION_RESENT',
        'STAFF_INVITATION',
        updated.id,
        `Resent invitation for ${updated.email}`,
        req.ip
      );
      return res.json({
        invitation: publicInvitation(withDelivery || updated),
        token,
        activationUrl,
        delivery,
        deliveryPending: !delivery.some(status => status.sent)
      });
    } catch (error) {
      return respondWithStaffError(res, error);
    }
  }
);

app.post('/api/staff/invitations/activate', async (req: Request, res: Response) => {
  try {
    const { user, invitation } = await activateStaffInvitation({
      token: req.body?.token,
      password: req.body?.password,
      phone: typeof req.body?.phone === 'string' ? req.body.phone : undefined,
      preferredLanguage: req.body?.preferredLanguage
    });
    db.logAudit(
      user.schoolId,
      user.id,
      user.fullName,
      user.role,
      'STAFF_INVITATION_ACCEPTED',
      'STAFF_INVITATION',
      invitation.id,
      `Activated account ${user.email}`,
      req.ip
    );
    return res.status(201).json({ user });
  } catch (error) {
    return respondWithStaffError(res, error);
  }
});

// --- Schools ---
app.get('/api/schools', (req: Request, res: Response) => {
  return res.json(db.getSchools());
});

/**
 * Authenticated school context. Multi-school accounts must never fall back to
 * `schools[0]`; the school is derived from the verified account (or, for the
 * platform super admin, from an explicitly scoped schoolId).
 */
app.get('/api/schools/me', (req: Request, res: Response) => {
  const school = db.getSchool(getScopedSchoolId(req));
  if (!school) return res.status(404).json({ error: 'School not found' });
  return res.json(school);
});

app.get('/api/schools/:id', (req: Request, res: Response) => {
  const school = db.getSchool(req.params.id);
  if (!school) return res.status(404).json({ error: 'School not found' });
  return res.json(school);
});

app.patch('/api/schools/:id', requirePermission('school.write'), (req: Request, res: Response) => {
  try {
    assertSchoolRecordAccess(req, req.params.id, 'School');
  } catch (error) {
    return respondWithSchoolAccessError(res, error, 'school settings update');
  }

  // Only display/contact fields are editable here. Never let a client replace
  // identity keys, counters or arbitrary object properties.
  const editableFields: (keyof School)[] = [
    'name', 'type', 'motto', 'logo', 'district', 'sector', 'province', 'country',
    'phone', 'emergencyPhone', 'email', 'website', 'currentAcademicYear', 'currentTerm'
  ];
  const updates: Partial<School> = {};
  for (const field of editableFields) {
    const value = req.body?.[field];
    if (typeof value === 'string') {
      (updates as Record<string, string>)[field] = sanitizeInput(value, field === 'logo' ? 2000 : 300);
    }
  }
  if (Object.keys(updates).length === 0) {
    return res.status(400).json({ error: 'No editable school fields were provided.' });
  }

  const updated = db.updateSchool(req.params.id, updates);
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
    const schoolId = getScopedSchoolId(req);
    const classId = req.query.classId as string | undefined;
    const search = req.query.search as string | undefined;
    const actor = req.user;

    const pool = getMysqlPool();
    const mysqlStatus = await checkMysqlHealth();
    const mysqlPool = pool;

    if (!mysqlPool || !mysqlStatus.connected) {
      const students = scopeStudentsForActor(actor, db.getStudents(schoolId, classId, search));
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

  try {
    assertSchoolRecordAccess(req, student.schoolId, 'Student');
  } catch (error) {
    return respondWithSchoolAccessError(res, error, 'student detail');
  }

  const actor = req.user;
  try {
    if (actor) assertPortalStudentAccess(actor, student.id);
  } catch (error) {
    return respondWithPortalError(res, error);
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

    const blockedRegistrationCombination = (value: unknown) => {
      const text = String(value || '').toLowerCase();
      return text.includes('o-level') || text.includes('o level') || text.includes('senior 3') ||
        text.includes('building') || text.includes('construction') || text.includes('cst');
    };

    /**
     * Registration may only use an ACTIVE class and an ACTIVE, school-owned
     * combination. Browser-supplied schoolId is never trusted here.
     */
    const validateRegistrationAcademics = (
      selectedClassId: string | undefined,
      mysqlClassInfo?: { status?: string; combination_id?: string | null; combination?: string; name?: string }
    ): { ok: true; combination: any; className: string } | { ok: false; error: string } => {
      const schoolId = getScopedSchoolId(req);
      if (!selectedClassId) return { ok: false, error: 'Class selection is required' };

      const jsonClass = db.getClasses(schoolId).find(item => item.id === selectedClassId);
      const status = String(mysqlClassInfo?.status ?? jsonClass?.status ?? 'ACTIVE').toUpperCase();
      if (status !== 'ACTIVE') {
        return { ok: false, error: 'The selected class is archived or inactive and cannot accept new students.' };
      }

      const activeCombinations = db.getAcademicCollection<any>('combinations', schoolId)
        .filter(item => item.status === 'ACTIVE');
      const classCombinationId = mysqlClassInfo?.combination_id ?? jsonClass?.combinationId;
      const requestedId = typeof body.combinationId === 'string' && body.combinationId.trim()
        ? body.combinationId.trim() : classCombinationId;
      let combination = requestedId
        ? activeCombinations.find(item => item.id === requestedId)
        : undefined;

      const selectedText = String(
        body.combination || mysqlClassInfo?.combination || jsonClass?.combination || ''
      ).trim().toLowerCase();
      if (!combination && selectedText) {
        const matches = (value: unknown) => String(value || '').trim().toLowerCase();
        combination = activeCombinations.find(item =>
          [item.name, item.code, item.academicProgramme].map(matches).includes(selectedText)
        ) ?? activeCombinations.find(item =>
          [item.name, item.code, item.academicProgramme].some(value => matches(value).includes(selectedText))
        );
      }

      if (!combination) {
        const available = activeCombinations.map(item => item.name).join(', ') || 'no active combinations';
        return {
          ok: false,
          error: `This combination is no longer available for new registration. Active combinations: ${available}.`
        };
      }
      return {
        ok: true,
        combination,
        className: mysqlClassInfo?.name ?? jsonClass?.name ?? ''
      };
    };

    if (!mysqlPool || !mysqlStatus.connected) {
      const schoolId = getScopedSchoolId(req);
      const activeClasses = db.getActiveClasses(schoolId);
      const classId = body.classId || activeClasses[0]?.id || '';
      const academicCheck = validateRegistrationAcademics(classId);
      if (!academicCheck.ok) {
        return res.status(400).json({ error: academicCheck.error });
      }
      const fallbackClass = db.getClasses(schoolId).find(cls => cls.id === classId);
      const selectedCombination = body.combination || academicCheck.combination.name || fallbackClass?.combination || '';
      if (blockedRegistrationCombination(selectedCombination)) {
        return res.status(400).json({
          error: 'O-Level and Building Construction are not available for new student registration. Use Networking or another allowed combination.'
        });
      }
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
        combination: selectedCombination,
        combinationId: academicCheck.combination.id,
        educationLevel: academicCheck.combination.educationLevel,
        academicProgramme: academicCheck.combination.academicProgramme,
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

    const schoolId = getScopedSchoolId(req);
    const classId = body.classId;

    if (!classId) {
      return res.status(400).json({ error: 'Class selection is required' });
    }

    const [classRows] = await mysqlPool.execute(
      'SELECT name, combination, combination_id, status FROM classes WHERE id = ? AND school_id = ?',
      [classId, schoolId]
    );

    const classInfo = (classRows as any[])[0];

    if (!classInfo) {
      return res.status(400).json({ error: 'Invalid class selected' });
    }

    const academicCheck = validateRegistrationAcademics(classId, classInfo);
    if (!academicCheck.ok) {
      return res.status(400).json({ error: academicCheck.error });
    }
    const selectedCombination = body.combination || academicCheck.combination.name || classInfo.combination || '';
    if (blockedRegistrationCombination(selectedCombination)) {
      return res.status(400).json({
        error: 'O-Level and Building Construction are not available for new student registration. Use Networking or another allowed combination.'
      });
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
      combination: selectedCombination,
      combinationId: academicCheck.combination.id,
      educationLevel: academicCheck.combination.educationLevel,
      academicProgramme: academicCheck.combination.academicProgramme,
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
        combination_id, education_level, academic_programme,
        enrollment_status, admission_date, blood_group,
        allergies, medical_notes, photo_url, national_id, previous_school
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        newStudent.id, newStudent.schoolId, newStudent.admissionNumber,
        newStudent.firstName, newStudent.lastName, newStudent.gender,
        newStudent.dob, newStudent.classId, newStudent.className,
        newStudent.combination, newStudent.combinationId,
        newStudent.educationLevel, newStudent.academicProgramme,
        newStudent.enrollmentStatus, newStudent.admissionDate, newStudent.bloodGroup,
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

    assertStudentInSchool(req, studentId);

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
        combinationId: body.combinationId ?? existing.combinationId,
        educationLevel: body.educationLevel ?? existing.educationLevel,
        academicProgramme: body.academicProgramme ?? existing.academicProgramme,
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
      'SELECT * FROM students WHERE id = ? AND school_id = ?',
      [studentId, getScopedSchoolId(req)]
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
      'combinationId',
      'educationLevel',
      'academicProgramme',
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
      combinationId: 'combination_id',
      educationLevel: 'education_level',
      academicProgramme: 'academic_programme',
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
      values.push(getScopedSchoolId(req), studentId);

      await mysqlPool.execute(
        `UPDATE students SET ${updates.join(', ')} WHERE school_id = ? AND id = ?`,
        values
      );
    }

    const [updatedRows] = await mysqlPool.execute(
      'SELECT * FROM students WHERE id = ? AND school_id = ?',
      [studentId, getScopedSchoolId(req)]
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
    if (error instanceof PermissionError) {
      return res.status(403).json({ error: error.message });
    }
    console.error('[MySQL] Student update failed:', error);

    return res.status(500).json({
      error: 'Unable to update student in MySQL'
    });
  }
});
app.post(
  '/api/students/:id/archive',
  requirePermission('students:write'),
  (req: Request, res: Response) => {
    try {
      assertStudentInSchool(req, req.params.id);
      const actor = getActor(req);
      const student = db.getStudentById(req.params.id);
      if (!student) return res.status(404).json({ error: 'Student not found' });
      if (student.archivedAt) return res.status(400).json({ error: 'Student is already archived.' });
      const reason = typeof req.body?.reason === 'string' ? req.body.reason.trim().slice(0, 500) : '';
      if (!reason) return res.status(400).json({ error: 'A reason is required to archive a learner.' });
      const archived = db.updateStudent(student.id, {
        archivedAt: new Date().toISOString(),
        archivedBy: actor.id,
        archiveReason: reason,
        archivedFromStatus: student.enrollmentStatus
      });
      const user = db.getUserByStudentId(student.id);
      if (user) db.setUserActive(user.id, false);
      db.logAudit(
        student.schoolId,
        actor.id,
        actor.fullName,
        actor.role,
        'STUDENT_ARCHIVED',
        'STUDENT',
        student.id,
        `Archived learner ${student.firstName} ${student.lastName}. Reason: ${reason}. Academic and financial history preserved.`,
        req.ip
      );
      return res.json(archived);
    } catch (error) {
      return respondWithSchoolAccessError(res, error, 'student archive');
    }
  }
);

app.post(
  '/api/students/:id/restore',
  requirePermission('students:write'),
  (req: Request, res: Response) => {
    try {
      assertStudentInSchool(req, req.params.id);
      const actor = getActor(req);
      const student = db.getStudentById(req.params.id);
      if (!student) return res.status(404).json({ error: 'Student not found' });
      if (!student.archivedAt) return res.status(400).json({ error: 'Student is not archived.' });
      const restored = db.updateStudent(student.id, {
        archivedAt: undefined,
        archivedBy: undefined,
        archiveReason: undefined,
        archivedFromStatus: undefined
      });
      const user = db.getUserByStudentId(student.id);
      if (user) db.setUserActive(user.id, true);
      db.logAudit(
        student.schoolId,
        actor.id,
        actor.fullName,
        actor.role,
        'STUDENT_RESTORED',
        'STUDENT',
        student.id,
        `Restored learner ${student.firstName} ${student.lastName} without deleting historical records.`,
        req.ip
      );
      return res.json(restored);
    } catch (error) {
      return respondWithSchoolAccessError(res, error, 'student restore');
    }
  }
);

// --- Guardians & Links ---
app.get('/api/guardians', (req: Request, res: Response) => {
  const schoolId = getScopedSchoolId(req);
  const guardians = db.getGuardians(schoolId);
  const allowed = portalStudentIds(req.user);
  if (!allowed) return res.json(guardians);

  const linkedGuardianIds = new Set(
    allowed.flatMap(studentId => db.getGuardiansForStudent(studentId).map(item => item.guardian.id))
  );
  return res.json(guardians.filter(guardian => linkedGuardianIds.has(guardian.id)));
});

app.post('/api/guardians', (req: Request, res: Response) => {
  const actor = getActor(req);
  const body = req.body;
  try {
    if (body.studentId) assertStudentInSchool(req, String(body.studentId));
  } catch (error) {
    return respondWithSchoolAccessError(res, error, 'guardian link');
  }
  const newGuardian = {
    id: `grd-${Date.now()}`,
    schoolId: getScopedSchoolId(req),
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
  try {
    assertStudentInSchool(req, req.params.studentId);
    if (req.user) assertPortalStudentAccess(req.user, req.params.studentId);
  } catch (error) {
    return respondWithSchoolAccessError(res, error, 'guardian list');
  }
  return res.json(db.getGuardiansForStudent(req.params.studentId));
});

app.get('/api/guardians/my-children/:guardianId', requireRole('PARENT'), (req: Request, res: Response) => {
  const actor = getActor(req);
  const allowed = portalStudentIds(actor) || [];
  const isLinkedGuardian =
    Boolean(actor.linkedGuardianIds?.includes(req.params.guardianId)) ||
    allowed.some(studentId =>
      db.getGuardiansForStudent(studentId).some(item => item.guardian.id === req.params.guardianId)
    );
  if (!isLinkedGuardian) {
    return res.status(403).json({ error: 'Parents can only view records for their own linked children.' });
  }

  const children = db
    .getStudentsForGuardian(req.params.guardianId)
    .filter(item => allowed.includes(item.student.id));
  return res.json(children);
});

app.post(
  '/api/guardians/:id/archive',
  requirePermission('guardians:write'),
  (req: Request, res: Response) => {
    try {
      const actor = getActor(req);
      const guardian = db.getGuardianById(req.params.id);
      if (!guardian) return res.status(404).json({ error: 'Parent/guardian not found' });
      try {
        assertSchoolRecordAccess(req, guardian.schoolId, 'Parent/guardian');
      } catch (error) {
        return respondWithSchoolAccessError(res, error, 'guardian archive');
      }
      if (guardian.archivedAt) return res.status(400).json({ error: 'Parent/guardian is already archived.' });
      const reason = typeof req.body?.reason === 'string' ? req.body.reason.trim().slice(0, 500) : '';
      if (!reason) return res.status(400).json({ error: 'A reason is required to archive a parent record.' });
      const archived = db.updateGuardian(guardian.id, {
        archivedAt: new Date().toISOString(),
        archivedBy: actor.id,
        archiveReason: reason
      });
      const user = db.getUserByGuardianId(guardian.id);
      if (user) db.setUserActive(user.id, false);
      db.logAudit(
        guardian.schoolId,
        actor.id,
        actor.fullName,
        actor.role,
        'GUARDIAN_ARCHIVED',
        'GUARDIAN',
        guardian.id,
        `Archived parent/guardian ${guardian.fullName}. Reason: ${reason}. Links and history preserved.`,
        req.ip
      );
      return res.json(archived);
    } catch (error) {
      return respondWithSchoolAccessError(res, error, 'guardian archive');
    }
  }
);

app.post(
  '/api/guardians/:id/restore',
  requirePermission('guardians:write'),
  (req: Request, res: Response) => {
    try {
      const actor = getActor(req);
      const guardian = db.getGuardianById(req.params.id);
      if (!guardian) return res.status(404).json({ error: 'Parent/guardian not found' });
      try {
        assertSchoolRecordAccess(req, guardian.schoolId, 'Parent/guardian');
      } catch (error) {
        return respondWithSchoolAccessError(res, error, 'guardian restore');
      }
      if (!guardian.archivedAt) return res.status(400).json({ error: 'Parent/guardian is not archived.' });
      const restored = db.updateGuardian(guardian.id, {
        archivedAt: undefined,
        archivedBy: undefined,
        archiveReason: undefined
      });
      const user = db.getUserByGuardianId(guardian.id);
      if (user) db.setUserActive(user.id, true);
      db.logAudit(
        guardian.schoolId,
        actor.id,
        actor.fullName,
        actor.role,
        'GUARDIAN_RESTORED',
        'GUARDIAN',
        guardian.id,
        `Restored parent/guardian ${guardian.fullName} without deleting historical records.`,
        req.ip
      );
      return res.json(restored);
    } catch (error) {
      return respondWithSchoolAccessError(res, error, 'guardian restore');
    }
  }
);

// --- Attendance ---
app.get('/api/attendance', requirePermission('attendance:read'), (req: Request, res: Response) => {
  const schoolId = getScopedSchoolId(req);
  const date = req.query.date as string | undefined;
  const classId = req.query.classId as string | undefined;
  const records = db.getAttendance(schoolId, date, classId);
  const allowed = portalStudentIds(req.user);
  return res.json(allowed ? records.filter(record => allowed.includes(record.studentId)) : records);
});

app.post('/api/attendance/batch', requirePermission('attendance:write'), (req: Request, res: Response) => {
  const actor = getActor(req);
  const records = req.body.records;
  if (!Array.isArray(records)) {
    return res.status(400).json({ error: 'records array required' });
  }

  const schoolId = getScopedSchoolId(req);
  try {
    for (const record of records) {
      assertStudentInSchool(req, String(record.studentId || ''));
    }
  } catch (error) {
    return respondWithSchoolAccessError(res, error, 'attendance batch');
  }

  // Never persist a school supplied by the browser; every record belongs to
  // the authenticated actor's school.
  const scopedRecords = records.map(record => ({ ...record, schoolId }));
  const saved = db.saveAttendanceBatch(scopedRecords);

  if (req.body.notifyAbsences) {
    const absentRecords = scopedRecords.filter(r => r.status === 'ABSENT');
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
    schoolId,
    actor.id,
    actor.fullName,
    actor.role,
    'RECORD_ATTENDANCE',
    'ATTENDANCE',
    `batch-${scopedRecords.length}`,
    `Recorded attendance for ${scopedRecords.length} students.`,
    req.ip
  );

  return res.json({ success: true, savedCount: saved.length });
});

app.post('/api/attendance/:id/explain', (req: Request, res: Response) => {
  const actor = getActor(req);
  const existing = db.getAttendance(actor.schoolId).find(record => record.id === req.params.id);
  if (!existing) return res.status(404).json({ error: 'Record not found' });
  try {
    assertPortalStudentAccess(actor, existing.studentId);
  } catch (error) {
    return respondWithPortalError(res, error);
  }
  if (existing.status !== 'ABSENT') {
    return res.status(400).json({ error: 'Only absence records can be explained.' });
  }
  const { explanation } = req.body;
  const updated = db.updateAttendanceExplanation(req.params.id, explanation);
  if (!updated) return res.status(404).json({ error: 'Record not found' });
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
  const schoolId = getScopedSchoolId(req);
  const incidents = db.getHealthIncidents(schoolId);
  const allowed = portalStudentIds(req.user);
  return res.json(allowed ? incidents.filter(incident => allowed.includes(incident.studentId)) : incidents);
});

app.get('/api/health-incidents/:id', (req: Request, res: Response) => {
  const incident = db.getHealthIncidentById(req.params.id);
  if (!incident) return res.status(404).json({ error: 'Incident not found' });
  try {
    assertSchoolRecordAccess(req, incident.schoolId, 'Health incident');
    if (req.user) assertPortalStudentAccess(req.user, incident.studentId);
  } catch (error) {
    return respondWithPortalError(res, error);
  }
  return res.json(incident);
});

app.post('/api/health-incidents', (req: Request, res: Response) => {
  const actor = getActor(req);
  const body = req.body;
  try {
    assertStudentInSchool(req, String(body.studentId || ''));
  } catch (error) {
    return respondWithSchoolAccessError(res, error, 'health incident');
  }
  const student = db.getStudentById(String(body.studentId));
  if (!student) {
    return res.status(404).json({ error: 'Student not found.' });
  }
  if (body.guardianId && !db.getGuardianLink(student.id, String(body.guardianId))) {
    return res.status(400).json({ error: 'The selected guardian is not linked to this student.' });
  }
  const linkedGuardian = body.guardianId
    ? db.getGuardiansForStudent(student.id).find(item => item.guardian.id === String(body.guardianId))?.guardian
    : undefined;
  if (body.guardianPhone && !linkedGuardian) {
    return res.status(400).json({ error: 'Select a guardian linked to this student before sending an alert.' });
  }
  const refNum = `EMG-${new Date().getFullYear()}-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
  const notRecorded = 'Not recorded';

  const newIncident: HealthIncident = {
    id: `inc-${crypto.randomUUID()}`,
    schoolId: getScopedSchoolId(req),
    referenceNumber: refNum,
    studentId: body.studentId,
    studentName: body.studentName || `${student.firstName} ${student.lastName}`.trim(),
    // Clinical metadata is derived from the enrolment record, never guessed.
    studentClass: student.className || notRecorded,
    date: body.date || new Date().toISOString().split('T')[0],
    time: body.time || new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    category: body.category || 'ILLNESS',
    priority: body.priority || 'URGENT',
    symptoms: body.symptoms || '',
    observations: body.observations || '',
    temperature: sanitizeInput(body.temperature, 40) || notRecorded,
    pulse: sanitizeInput(body.pulse, 40) || notRecorded,
    actionsTaken: sanitizeInput(body.actionsTaken, 500) || notRecorded,
    responsibleStaffName: body.responsibleStaffName || actor.fullName,
    guardianId: linkedGuardian?.id,
    guardianName: linkedGuardian?.fullName || '',
    guardianPhone: linkedGuardian ? (sanitizeInput(body.guardianPhone, 40) || linkedGuardian.phone) : '',
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
  if (linkedGuardian) {
    const schoolName = db.getSchool(created.schoolId)?.name || 'SchoolCare';
    db.queueNotification({
      id: `msg-emg-${crypto.randomUUID()}`,
      schoolId: created.schoolId,
      recipientId: linkedGuardian.id,
      recipientName: linkedGuardian.fullName,
      recipientPhone: body.guardianPhone || linkedGuardian.phone,
      channel: 'WHATSAPP',
      category: 'EMERGENCY',
      priority: created.priority,
      titleEn: `[HEALTH ALERT ${refNum}] ${created.studentName}`,
      titleRw: `[UBUTUMWA BWIHUTIRWA ${refNum}] ${created.studentName}`,
      contentEn: `Urgent notice from ${schoolName} infirmary: ${created.studentName} requires attention for ${created.symptoms}. Please review in SchoolCare.`,
      contentRw: `Ubutumwa bwihutirwa buturutse mu buvuzi bwa ${schoolName}: ${created.studentName} akeneye kwitabwaho kubera ${created.symptoms}. Nyamuneka musuzume muri SchoolCare.`,
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
  const existing = db.getHealthIncidentById(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Incident not found' });
  try {
    assertSchoolRecordAccess(req, existing.schoolId, 'Health incident');
    assertPortalStudentAccess(actor, existing.studentId);
  } catch (error) {
    return respondWithSchoolAccessError(res, error, 'health incident action');
  }
  const { action } = req.body;
  const updated = db.addIncidentAction(req.params.id, action, actor.fullName);
  if (!updated) return res.status(404).json({ error: 'Incident not found' });
  return res.json(updated);
});

app.post('/api/health-incidents/:id/acknowledge', (req: Request, res: Response) => {
  const actor = getActor(req);
  const existing = db.getHealthIncidentById(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Incident not found' });
  try {
    assertSchoolRecordAccess(req, existing.schoolId, 'Health incident');
    assertPortalStudentAccess(actor, existing.studentId);
  } catch (error) {
    return respondWithSchoolAccessError(res, error, 'health incident acknowledgement');
  }
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
  const schoolId = getScopedSchoolId(req);
  const notifications = db.getNotifications(schoolId);
  const allowedRecipients = portalNotificationRecipientIds(req.user, schoolId);
  const allowedStudents = portalStudentIds(req.user);
  return res.json(
    notifications.filter(notification =>
      isPortalNotificationVisible(notification, req.user, schoolId, allowedRecipients, allowedStudents)
    )
  );
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
  const schoolId = getScopedSchoolId(req);
  const recipientId = typeof body.recipientId === 'string' ? body.recipientId.trim() : '';
  const resolvedRecipient = recipientId
    ? resolveNotificationRecipient(recipientId, schoolId, actor)
    : null;
  const contentEn = typeof body.contentEn === 'string' ? body.contentEn.trim() : '';
  const contentRw = typeof body.contentRw === 'string' ? body.contentRw.trim() : '';

  if (!allowedChannels.includes(channel)) {
    return res.status(400).json({ error: 'Choose a supported message channel.' });
  }
  if (!allowedCategories.includes(category) || !allowedPriorities.includes(priority)) {
    return res.status(400).json({ error: 'Choose a supported message type and priority.' });
  }
  if (!resolvedRecipient || (!contentEn && !contentRw)) {
    return res.status(400).json({ error: 'A valid recipient and message body are required.' });
  }
  if (channel === 'EMAIL' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(resolvedRecipient.email || '')) {
    return res.status(400).json({ error: 'A valid stored recipient email address is required.' });
  }
  if ((channel === 'SMS' || channel === 'WHATSAPP') && !/^\+?[\d\s()-]{7,20}$/.test(resolvedRecipient.phone)) {
    return res.status(400).json({ error: 'A valid stored recipient phone number is required.' });
  }

  const newMsg: NotificationMessage = {
    id: `msg-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
    schoolId,
    recipientId: resolvedRecipient.id,
    recipientName: resolvedRecipient.name,
    recipientPhone: resolvedRecipient.phone,
    recipientEmail: resolvedRecipient.email,
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
  const schoolId = getScopedSchoolId(req);
  const allowedRecipients = portalNotificationRecipientIds(req.user, schoolId);
  const allowedStudents = portalStudentIds(req.user);
  const notification = db
    .getNotifications(schoolId)
    .find(item =>
      item.id === req.params.id &&
      isPortalNotificationVisible(item, req.user, schoolId, allowedRecipients, allowedStudents)
    );
  if (!notification) return res.status(404).json({ error: 'Notification not found' });
  try {
    assertSchoolRecordAccess(req, notification.schoolId, 'Notification');
  } catch (error) {
    return respondWithSchoolAccessError(res, error, 'notification acknowledgement');
  }
  const updated = db.updateNotificationStatus(req.params.id, 'ACKNOWLEDGED');
  if (!updated) return res.status(404).json({ error: 'Notification not found' });
  return res.json(updated);
});

// --- Finance ---
app.get('/api/finance/fee-structures', (req: Request, res: Response) => {
  const schoolId = getScopedSchoolId(req);
  return res.json(db.getFeeStructures(schoolId));
});

app.get('/api/finance/invoices', (req: Request, res: Response) => {
  const schoolId = getScopedSchoolId(req);
  const studentId = req.query.studentId as string | undefined;
  const allowed = portalStudentIds(req.user);
  if (studentId && allowed && !allowed.includes(studentId)) {
    return res.status(403).json({ error: 'You can only access records linked to your own account.' });
  }
  const invoices = db.getInvoices(schoolId, studentId);
  return res.json(allowed ? invoices.filter(invoice => allowed.includes(invoice.studentId)) : invoices);
});

app.get('/api/finance/payments', (req: Request, res: Response) => {
  const schoolId = getScopedSchoolId(req);
  const studentId = req.query.studentId as string | undefined;
  const allowed = portalStudentIds(req.user);
  if (studentId && allowed && !allowed.includes(studentId)) {
    return res.status(403).json({ error: 'You can only access records linked to your own account.' });
  }
  const payments = db.getPayments(schoolId, studentId);
  return res.json(allowed ? payments.filter(payment => allowed.includes(payment.studentId)) : payments);
});

app.post('/api/finance/payments', (req: Request, res: Response) => {
  const actor = getActor(req);
  const body = req.body;
  try {
    assertStudentInSchool(req, String(body.studentId || ''));
    assertPortalStudentAccess(actor, String(body.studentId || ''));
  } catch (error) {
    return respondWithSchoolAccessError(res, error, 'payment student');
  }
  const schoolId = getScopedSchoolId(req);
  if (!body.invoiceId) {
    return res.status(400).json({ error: 'Select the invoice this payment settles.' });
  }
  const invoice = db.getInvoices(schoolId).find(item => item.id === body.invoiceId);
  if (!invoice) {
    return res.status(403).json({ error: 'Invoice is not available in your school.' });
  }
  if (invoice.studentId !== body.studentId) {
    return res.status(400).json({ error: 'This invoice does not belong to the selected student.' });
  }
  const amountRwf = Number(body.amountRwf);
  if (!Number.isFinite(amountRwf) || amountRwf <= 0) {
    return res.status(400).json({ error: 'Enter a positive payment amount.' });
  }
  if (amountRwf > invoice.balanceRwf) {
    return res.status(400).json({
      error: `Payment exceeds the outstanding balance of ${invoice.balanceRwf.toLocaleString()} RWF.`
    });
  }
  const allowedMethods: Payment['method'][] = ['MTN_MOMO', 'AIRTEL_MONEY', 'BANK_TRANSFER', 'CASH'];
  const method = body.method as Payment['method'];
  if (!allowedMethods.includes(method)) {
    return res.status(400).json({ error: 'Select a supported payment method.' });
  }
  const student = db.getStudents(schoolId).find(item => item.id === body.studentId);
  const reference = sanitizeInput(body.reference, 120) || `PAY-${crypto.randomUUID()}`;
  const receiptNo = `REC-${new Date().getFullYear()}-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
  const existingPayments = db.getPayments(schoolId);
  if (existingPayments.some(item => item.reference === reference || item.receiptNumber === receiptNo)) {
    return res.status(409).json({ error: 'A payment with this reference already exists.' });
  }

  const newPayment: Payment = {
    id: `pay-${crypto.randomUUID()}`,
    schoolId,
    invoiceId: body.invoiceId,
    receiptNumber: receiptNo,
    studentId: body.studentId,
    studentName: student ? `${student.firstName} ${student.lastName}` : sanitizeInput(body.studentName, 160),
    amountRwf,
    method,
    reference,
    payerName: sanitizeInput(body.payerName, 160) || actor.fullName,
    payerPhone: sanitizeInput(body.payerPhone, 50),
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
  const schoolId = getScopedSchoolId(req);
  // Attendance and other day-to-day selectors pass active=true so archived
  // classes remain available for historical records but cannot be selected.
  if (req.query.active === 'true') {
    return res.json(db.getActiveClasses(schoolId));
  }
  return res.json(db.getClasses(schoolId));
});

app.get('/api/academics/subjects', (req: Request, res: Response) => {
  const schoolId = getScopedSchoolId(req);
  return res.json(db.getSubjects(schoolId));
});

app.get('/api/academics/report-cards', (req: Request, res: Response) => {
  const schoolId = getScopedSchoolId(req);
  const studentId = req.query.studentId as string | undefined;
  const allowed = portalStudentIds(req.user);
  if (studentId && allowed && !allowed.includes(studentId)) {
    return res.status(403).json({ error: 'You can only access records linked to your own account.' });
  }
  // Students and parents may only see report cards that have been published.
  const cards = db.getReportCards(schoolId, studentId, allowed ? { publishedOnly: true } : undefined);
  return res.json(allowed ? cards.filter(card => allowed.includes(card.studentId)) : cards);
});

registerAcademicRoutes(app);
registerCombinationRoutes(app);
registerReportPrintingRoutes(app);
registerAiRoutes(app);
registerHeadteacherDashboardRoutes(app);
registerHeadteacherAppointmentRoutes(app);
registerStudentImportRoutes(app);

// --- Staff, Timetable, Homework, Events, Audit ---
app.get('/api/staff', (req: Request, res: Response) => {
  const schoolId = getScopedSchoolId(req);
  return res.json(db.getStaff(schoolId));
});

app.get('/api/timetable', (req: Request, res: Response) => {
  const schoolId = getScopedSchoolId(req);
  const classId = req.query.classId as string | undefined;
  return res.json(db.getTimetable(schoolId, classId));
});

app.get('/api/homework', (req: Request, res: Response) => {
  const schoolId = getScopedSchoolId(req);
  const classId = req.query.classId as string | undefined;
  return res.json(db.getHomework(schoolId, classId));
});

// --- Executive Reports & Analytics Engine ---
app.get('/api/reports/analytics', (req: Request, res: Response) => {
  const schoolId = getScopedSchoolId(req);
  const term = (req.query.term as string) || 'Term 1';

  // `reports:read` grants access to the report, not to every underlying
  // module. Each section is redacted unless the account can read that module.
  const permissionCodes = new Set(
    getEffectivePermissions(getActor(req)).map(permission => permission.replace(':', '.'))
  );
  const canRead = (code: string) => permissionCodes.has(code);
  const canReadStudents = canRead('students.read');
  const canReadAcademics = canRead('academics.read');
  const canReadAttendance = canRead('attendance.read') && canReadStudents;
  const canReadHealth = canRead('health.read') && canReadStudents;
  const canReadFinance = canRead('finance.read');
  const canReadCommunication = canRead('notifications.read');
  const restrictedSections = [
    !canReadAcademics && 'academics',
    !canReadAttendance && 'attendance',
    !canReadHealth && 'health',
    !canReadFinance && 'finance',
    !canReadCommunication && 'communication'
  ].filter(Boolean) as string[];

  const allStudents = db.getStudents(schoolId);
  const allReportCards = db.getReportCards(schoolId);
  const allAttendance = db.getAttendance(schoolId);
  const allHealth = db.getHealthIncidents(schoolId);
  const allInvoices = db.getInvoices(schoolId);
  const allPayments = db.getPayments(schoolId);
  const allMessages = db.getNotifications(schoolId);

  // Without publish rights, analytics may only use report cards already made
  // visible to the school community.
  const visibleReportCards = canRead('reports.publish')
    ? allReportCards
    : allReportCards.filter(card => Boolean(card.publishedAt) && card.status !== 'DRAFT');
  const students = canReadStudents ? allStudents : [];
  const reportCards = canReadAcademics ? visibleReportCards : [];
  const attendance = canReadAttendance ? allAttendance : [];
  const health = canReadHealth ? allHealth : [];
  const invoices = canReadFinance ? allInvoices : [];
  const payments = canReadFinance ? allPayments : [];
  const messages = canReadCommunication ? allMessages : [];

  // 1. Academic Aggregation
  const evaluatedCount = reportCards.length;
  const academicDenominator = evaluatedCount || 1;
  const overallAverage = evaluatedCount > 0 ? Number(
    (reportCards.reduce((acc, r) => acc + r.overallAverage, 0) / academicDenominator).toFixed(1)
  ) : 0;
  const passedStudents = reportCards.filter(r => r.overallAverage >= 50).length;
  const passRate = evaluatedCount > 0 ? Number(((passedStudents / academicDenominator) * 100).toFixed(1)) : 0;

  const gradeDistribution = {
    A: reportCards.filter(r => r.overallAverage >= 80).length,
    B: reportCards.filter(r => r.overallAverage >= 70 && r.overallAverage < 80).length,
    C: reportCards.filter(r => r.overallAverage >= 60 && r.overallAverage < 70).length,
    D: reportCards.filter(r => r.overallAverage >= 50 && r.overallAverage < 60).length,
    F: reportCards.filter(r => r.overallAverage < 50).length
  };

  // 2. Attendance Aggregation
  const totalAtt = attendance.length;
  const attendanceDenominator = totalAtt || 1;
  const presentCount = attendance.filter(a => a.status === 'PRESENT').length;
  const absentCount = attendance.filter(a => a.status === 'ABSENT').length;
  const lateCount = attendance.filter(a => a.status === 'LATE').length;
  const excusedCount = attendance.filter(a => a.status === 'EXCUSED' || a.status === 'SICK' || a.status === 'AUTHORIZED_LEAVE').length;
  const attendanceRate = totalAtt > 0 ? Number(((presentCount / attendanceDenominator) * 100).toFixed(1)) : 0;

  // Chronic absenteeism: students with at least 1 unexcused absence
  const chronicAbsentStudents = students.filter(s =>
    attendance.some(a => a.studentId === s.id && a.status === 'ABSENT' && !a.parentExplanation)
  );

  // 3. Health & Infirmary Registry Aggregation
  const urgentHealthCases = health.filter(h => h.priority === 'URGENT' || h.priority === 'EMERGENCY').length;
  const hospitalReferrals = health.filter(h => h.outcome === 'REFERRED_TO_HOSPITAL').length;
  const acknowledgedHealthAlerts = health.filter(h => h.parentAcknowledged).length;
  const ackRate = health.length > 0 ? Number(((acknowledgedHealthAlerts / health.length) * 100).toFixed(1)) : 0;

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
  const deliverySuccessRate = totalDispatched > 0 ? Number(((deliveredCount / totalDispatched) * 100).toFixed(1)) : 0;

  return res.json({
    generatedAt: new Date().toISOString(),
    school: db.getSchool(schoolId),
    term,
    restrictedSections,
    academics: {
      totalEvaluated: evaluatedCount,
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
  const schoolId = getScopedSchoolId(req);
  return res.json(db.getEvents(schoolId));
});

app.post('/api/events', (req: Request, res: Response) => {
  const actor = getActor(req);
  const body = req.body;
  const newEvent = {
    id: `evt-${Date.now()}`,
    schoolId: getScopedSchoolId(req),
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

app.get('/api/audit-logs', requirePermission('audit.review'), (req: Request, res: Response) => {
  const schoolId = getScopedSchoolId(req);
  return res.json(db.getAuditLogs(schoolId));
});

app.post('/api/demo/reset', requireRole('SUPER_ADMIN', 'SCHOOL_ADMIN'), (req: Request, res: Response) => {
  if (isProduction || process.env.ALLOW_DEMO_RESET !== 'true') {
    return res.status(403).json({
      error: 'Demo reset is disabled in production and on any server without explicit demo opt-in.'
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
    streamFileSafely(active.filePath, res);
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
    streamFileSafely(filePath, res);
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
    streamFileSafely(filePath, res);
  }
);

// --- MariaDB Integration & Health Endpoints ---
/**
 * Protected, minimal database health check.
 * Admin-only via RBAC; deliberately omits host, user, database name and driver errors.
 */
app.get('/api/health/database', requireRole('SUPER_ADMIN', 'SCHOOL_ADMIN'), async (_req: Request, res: Response) => {
  const startedAt = Date.now();
  const status = await checkMysqlHealth();
  const payload = {
    ok: status.connected,
    status: status.connected ? 'up' : 'down',
    engine: status.connected ? 'MariaDB/MySQL' : undefined,
    latencyMs: Date.now() - startedAt,
    checkedAt: new Date().toISOString(),
    ...(status.connected ? {} : { error: status.error ?? 'Database is unavailable.' })
  };
  return status.connected ? res.json(payload) : res.status(503).json(payload);
});

// Legacy endpoint kept for the existing Settings page. School admins get the
// same operational summary without infrastructure identifiers.
app.get('/api/mysql/status', async (req: Request, res: Response) => {
  const status = await checkMysqlHealth();
  if (req.user?.role === 'SUPER_ADMIN') return res.json(status);
  return res.json({
    connected: status.connected,
    engine: status.connected ? 'MariaDB/MySQL' : '',
    host: 'Hidden',
    port: 0,
    database: 'Hidden',
    user: 'Hidden',
    tableCount: status.tableCount,
    mode: status.mode,
    ...(status.connected ? {} : { error: 'Database is unavailable.' })
  });
});

// A full schema/data dump is a platform-level artifact, not a tenant export.
app.get('/api/mysql/export', requireRole('SUPER_ADMIN'), (_req: Request, res: Response) => {
  const sqlPath = getExportSqlPath();
  if (!fs.existsSync(sqlPath)) {
    return res.status(404).json({ error: 'SQL export file not found' });
  }
  res.setHeader('Content-Type', 'application/sql');
  res.setHeader('Content-Disposition', 'attachment; filename="schoolcare_db.sql"');
  return res.sendFile(sqlPath);
});

// Unknown API paths must return JSON, never the SPA HTML shell. Otherwise the
// browser reports a confusing "Unexpected token '<'" while parsing JSON.
app.use('/api', (req: Request, res: Response) => {
  res.status(404).json({ error: `Unknown API endpoint: ${req.method} ${req.originalUrl}` });
});

// Final safety net for errors forwarded by Express middleware/routes.
app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  console.error('[SchoolCare] Unhandled request error:', err);
  if (res.headersSent) {
    res.destroy();
    return;
  }
  res.status(500).json({ error: 'An unexpected server error occurred.' });
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

  if (!process.env.PORT) {
    console.log(`No PORT configured; SchoolCare is running on http://localhost:${PORT}`);
  }

  const server = app.listen(PORT, '0.0.0.0', () => {
    console.log(`SchoolCare Rwanda Server running at http://localhost:${PORT}`);
  });

  let shuttingDown = false;
  const shutdown = (signal: 'SIGTERM' | 'SIGINT'): void => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`[SchoolCare] ${signal} received. Closing server and MariaDB pool.`);

    const forceExit = setTimeout(() => {
      console.error('[SchoolCare] Forced shutdown after 10s timeout.');
      process.exit(1);
    }, 10_000);
    forceExit.unref();

    server.close(async () => {
      clearTimeout(forceExit);
      try {
        await closeMysqlPool();
        console.log('[SchoolCare] Shutdown complete.');
        process.exit(0);
      } catch (error) {
        console.error('[SchoolCare] Error during shutdown:', error);
        process.exit(1);
      }
    });
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

if (process.env.SCHOOLCARE_SKIP_SERVER_START !== '1') {
  startServer().catch(err => {
    console.error('Failed to start server:', err);
    process.exit(1);
  });
}
