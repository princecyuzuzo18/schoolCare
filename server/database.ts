import fs from 'fs';
import path from 'path';
import {
  School,
  UserProfile,
  UserRole,
  Student,
  Guardian,
  StudentGuardianLink,
  AcademicClass,
  Subject,
  AttendanceRecord,
  HealthIncident,
  NotificationMessage,
  FeeStructure,
  Invoice,
  Payment,
  StaffMember,
  StaffAccount,
  StaffInvitation,
  PermissionGrantRecord,
  PermissionGroup,
  TimetableEntry,
  HomeworkAssignment,
  SchoolEvent,
  ReportCard,
  AuditLogEntry,
  AdmissionApplication,
  AdmissionDocument,
  AdmissionReviewNote,
  AdmissionSettings,
  AdmissionSlipUpload,
  AdmissionStatusHistory,
  AdmissionVerification,
  ApplicationStatus,
  ApplicationType,
  AcademicYear,
  AcademicTerm,
  ClassSubjectAssignment,
  ClassTeacherAssignment,
  AssessmentCategory,
  GradingScale,
  MarkEntry,
  MarkSubmission,
  ReportCardSubjectRow,
  ReportDistribution,
  AcademicSettings,
  AcademicCollectionKey,
  AcademicCombination
} from '../src/types';
import {
  initialSchool,
  initialUsers,
  initialClasses,
  initialSubjects,
  initialStudents,
  initialGuardians,
  initialStudentGuardians,
  initialAttendance,
  initialHealthIncidents,
  initialNotifications,
  initialFeeStructures,
  initialInvoices,
  initialPayments,
  initialStaff,
  initialTimetable,
  initialHomework,
  initialEvents,
  initialReportCards,
  initialAuditLogs,
  initialAcademicYears,
  initialTerms,
  initialAssessmentCategories,
  initialGradingScales,
  initialAcademicSettings,
  initialClassSubjectAssignments,
  initialClassTeacherAssignments,
  initialCombinations
} from './seedData';
import { getProfessionalTitle, isStaffRole } from '../src/roleCatalog';

/**
 * Audit details are engineering evidence, not a place to copy personal or
 * credential data. Every detail string is passed through this redactor before
 * it is appended to the activity history.
 */
const AUDIT_REDACTIONS: ReadonlyArray<{ pattern: RegExp; replacement: string }> = [
  {
    pattern: /(password|passwd|pwd|token|secret|api[_-]?key|authorization|credential|verification[_-]?code|otp)\s*[:=]\s*[^\s,;]+/gi,
    replacement: '$1=[REDACTED]'
  },
  { pattern: /\b(?:\+?250|0)\d{9,12}\b/g, replacement: '[PHONE REDACTED]' },
  { pattern: /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, replacement: '[EMAIL REDACTED]' },
  { pattern: /\b[a-f0-9]{32,}\b/gi, replacement: '[TOKEN REDACTED]' }
];

export function sanitizeAuditDetails(details: string): string {
  let safe = String(details ?? '');
  for (const { pattern, replacement } of AUDIT_REDACTIONS) {
    safe = safe.replace(pattern, replacement);
  }
  return safe.slice(0, 500);
}

interface DatabaseSchema {
  schools: School[];
  users: UserProfile[];
  classes: AcademicClass[];
  combinations: AcademicCombination[];
  subjects: Subject[];
  students: Student[];
  guardians: Guardian[];
  studentGuardians: StudentGuardianLink[];
  attendance: AttendanceRecord[];
  healthIncidents: HealthIncident[];
  notifications: NotificationMessage[];
  feeStructures: FeeStructure[];
  invoices: Invoice[];
  payments: Payment[];
  staff: StaffMember[];
  staffAccounts: StaffAccount[];
  staffInvitations: StaffInvitation[];
  permissionGrants: PermissionGrantRecord[];
  permissionGroups: PermissionGroup[];
  timetable: TimetableEntry[];
  homework: HomeworkAssignment[];
  events: SchoolEvent[];
  reportCards: ReportCard[];
  auditLogs: AuditLogEntry[];
  admissions: AdmissionApplication[];
  admissionVerifications: AdmissionVerification[];
  admissionSlipUploads: AdmissionSlipUpload[];
  admissionSettings: AdmissionSettings;
  modules: Record<string, Array<Record<string, unknown>>>;
  academicYears: AcademicYear[];
  terms: AcademicTerm[];
  classSubjectAssignments: ClassSubjectAssignment[];
  classTeacherAssignments: ClassTeacherAssignment[];
  assessmentCategories: AssessmentCategory[];
  gradingScales: GradingScale[];
  marks: MarkEntry[];
  markSubmissions: MarkSubmission[];
  reportDistributions: ReportDistribution[];
  academicSettings: AcademicSettings[];
}

const ADMISSION_STATUS_ORDER: ApplicationStatus[] = [
  'SUBMITTED',
  'UNDER_REVIEW',
  'ADDITIONAL_INFO_REQUIRED',
  'APPROVED',
  'REJECTED'
];

const ADMISSION_STATUSES: Record<ApplicationStatus, { label: string; color: string }> = {
  SUBMITTED: { label: 'Submitted', color: 'bg-slate-100 text-slate-700' },
  UNDER_REVIEW: { label: 'Under Review', color: 'bg-blue-100 text-blue-700' },
  ADDITIONAL_INFO_REQUIRED: { label: 'Additional Info Required', color: 'bg-amber-100 text-amber-700' },
  APPROVED: { label: 'Approved', color: 'bg-emerald-100 text-emerald-700' },
  REJECTED: { label: 'Rejected', color: 'bg-red-100 text-red-700' }
};

const ADMISSION_TYPE_LABELS: Record<ApplicationType, string> = {
  NEW_STUDENT_SENIOR4: 'New Student — Senior 4 Admission',
  SCHOOL_TRANSFER: 'School Transfer',
  OTHER_ADMISSION: 'Other Admission Request'
};

const DATA_DIR = process.env.SCHOOLCARE_DATA_DIR || path.resolve(process.cwd(), 'data');
const DB_FILE = path.join(DATA_DIR, 'schoolcare_db.json');

class DatabaseStore {
  private data: DatabaseSchema;

  constructor() {
    this.data = this.loadOrSeed();
  }

  private getDefaultData(): DatabaseSchema {
    return {
      schools: [initialSchool],
      users: [...initialUsers],
      classes: [...initialClasses],
      combinations: initialCombinations.map(item => ({
        ...item,
        subjects: item.subjects.map(subject => ({ ...subject, teacherIds: [...subject.teacherIds] })),
        classIds: [...item.classIds],
        teacherIds: [...item.teacherIds]
      })),
      subjects: [...initialSubjects],
      students: [...initialStudents],
      guardians: [...initialGuardians],
      studentGuardians: [...initialStudentGuardians],
      attendance: [...initialAttendance],
      healthIncidents: [...initialHealthIncidents],
      notifications: [...initialNotifications],
      feeStructures: [...initialFeeStructures],
      invoices: [...initialInvoices],
      payments: [...initialPayments],
      staff: [...initialStaff],
      staffAccounts: [],
      staffInvitations: [],
      permissionGrants: [],
      permissionGroups: [],
      timetable: [...initialTimetable],
      homework: [...initialHomework],
      events: [...initialEvents],
      reportCards: [...initialReportCards],
      auditLogs: [...initialAuditLogs],
      admissions: [],
      admissionVerifications: [],
      admissionSlipUploads: [],
      admissionSettings: { resultSlipRequired: true },
      modules: {},
      academicYears: initialAcademicYears.map(item => ({ ...item })),
      terms: initialTerms.map(item => ({ ...item })),
      classSubjectAssignments: initialClassSubjectAssignments.map(item => ({ ...item })),
      classTeacherAssignments: initialClassTeacherAssignments.map(item => ({ ...item })),
      assessmentCategories: initialAssessmentCategories.map(item => ({ ...item })),
      gradingScales: initialGradingScales.map(item => ({ ...item })),
      marks: [],
      markSubmissions: [],
      reportDistributions: [],
      academicSettings: initialAcademicSettings.map(item => ({ ...item }))
    };
  }

  /**
   * One-time, additive normalization for the Headteacher transition.
   * It only changes the two legacy role values chosen by the school and adds
   * missing staff-management collections. No existing record is deleted.
   */
  private normalizeStaffData(data: DatabaseSchema): boolean {
    let changed = false;

    if (!Array.isArray(data.users)) {
      data.users = [];
      changed = true;
    }
    if (!Array.isArray(data.staff)) {
      data.staff = [];
      changed = true;
    }
    if (!Array.isArray(data.staffAccounts)) {
      data.staffAccounts = [];
      changed = true;
    }
    if (!Array.isArray(data.staffInvitations)) {
      data.staffInvitations = [];
      changed = true;
    }
    if (!Array.isArray(data.permissionGrants)) {
      data.permissionGrants = [];
      changed = true;
    }
    if (!Array.isArray(data.permissionGroups)) {
      data.permissionGroups = [];
      changed = true;
    }

    const superAdminAccount = data.users.find(user => user.id === 'user-super-admin');
    if (superAdminAccount && superAdminAccount.role === 'SUPER_ADMIN') {
      superAdminAccount.role = 'HEAD_TEACHER';
      changed = true;
    }

    const legacyHeadAccount = data.users.find(user => user.id === 'user-head-teacher');
    if (legacyHeadAccount && legacyHeadAccount.role === 'HEAD_TEACHER') {
      legacyHeadAccount.role = 'ANIMATEUR';
      changed = true;
    }

    const now = new Date().toISOString();
    for (const account of data.users) {
      if (account.isActive === undefined) {
        account.isActive = true;
        changed = true;
      }

      const staffMember = data.staff.find(
        member => member.email.toLowerCase() === account.email.toLowerCase()
      );
      if (staffMember && staffMember.role !== account.role) {
        staffMember.role = account.role;
        staffMember.title = getProfessionalTitle(account.role);
        changed = true;
      }

      if (!isStaffRole(account.role)) continue;

      const title = getProfessionalTitle(account.role);
      const existingStaffAccount = data.staffAccounts.find(item => item.userId === account.id);
      if (!existingStaffAccount) {
        data.staffAccounts.push({
          id: `staff-account-${account.id}`,
          userId: account.id,
          schoolId: account.schoolId,
          role: account.role,
          professionalTitle: title,
          department: account.teacherDepartment || title,
          status: 'ACTIVE',
          delegatedPermissions: Array.isArray(account.delegatedPermissions)
            ? [...account.delegatedPermissions]
            : [],
          createdAt: account.createdAt || now,
          createdBy: 'system-migration',
          acceptedAt: account.createdAt || now
        });
        changed = true;
      } else if (existingStaffAccount.role !== account.role) {
        existingStaffAccount.role = account.role;
        existingStaffAccount.professionalTitle = title;
        changed = true;
      }
    }

    const hasHeadteacherDirectoryRecord = data.staff.some(
      member => member.email.toLowerCase() === 'esrubengera@gmail.com'
    );
    if (!hasHeadteacherDirectoryRecord && superAdminAccount) {
      data.staff.push({
        id: 'stf-06',
        schoolId: superAdminAccount.schoolId,
        staffId: 'STF-006',
        fullName: superAdminAccount.fullName,
        gender: 'M',
        role: 'HEAD_TEACHER',
        title: 'Headteacher',
        department: 'School Leadership',
        phone: superAdminAccount.phone,
        email: superAdminAccount.email,
        assignedClasses: [],
        assignedSubjects: [],
        status: 'ACTIVE',
        joinedDate: now.slice(0, 10)
      });
      changed = true;
    }

    return changed;
  }

  /**
   * Additive normalization for the academic management module. Missing
   * collections are created; seed configuration is only inserted when the
   * school has no academic settings yet. Existing records are never changed.
   */
  private normalizeAcademicData(data: DatabaseSchema): boolean {
    let changed = false;
    const collectionKeys: AcademicCollectionKey[] = [
      'academicYears',
      'terms',
      'classSubjectAssignments',
      'classTeacherAssignments',
      'assessmentCategories',
      'gradingScales',
      'marks',
      'markSubmissions',
      'reportDistributions',
      'academicSettings'
    ];
    for (const key of collectionKeys) {
      if (!Array.isArray((data as unknown as Record<string, unknown>)[key])) {
        (data as unknown as Record<string, unknown>)[key] = [];
        changed = true;
      }
    }

    if (data.academicSettings.length === 0) {
      data.academicYears.push(...initialAcademicYears.map(item => ({ ...item })));
      data.terms.push(...initialTerms.map(item => ({ ...item })));
      data.classSubjectAssignments.push(...initialClassSubjectAssignments.map(item => ({ ...item, teacherIds: [...item.teacherIds] })));
      data.classTeacherAssignments.push(...initialClassTeacherAssignments.map(item => ({ ...item })));
      data.assessmentCategories.push(...initialAssessmentCategories.map(item => ({ ...item })));
      data.gradingScales.push(...initialGradingScales.map(item => ({ ...item, gradeBoundaries: item.gradeBoundaries.map(b => ({ ...b })) })));
      data.academicSettings.push(...initialAcademicSettings.map(item => ({ ...item })));
      changed = true;
    }
    return changed;
  }

  /**
   * Additive academic-structure normalization.
   *
   * - Renames the legacy Level 3/4/5 Accounting classes to Y1/Y2/Y3 without
   *   changing their IDs (so student, mark and report links stay valid).
   * - Marks discontinued O-Level S3 and CST classes as ARCHIVED; their rows,
   *   students, marks, attendance and report cards are untouched.
   * - Seeds the managed combination catalogue only for schools that have none.
   */
  private normalizeAcademicStructure(data: DatabaseSchema): boolean {
    let changed = false;

    if (!Array.isArray(data.combinations)) {
      data.combinations = [];
      changed = true;
    }

    const archivedAt = new Date().toISOString();
    const accountingNames: Record<string, { name: string; grade: string }> = {
      'class-l3-accounting-a': { name: 'Y1 Accounting', grade: 'Y1 Accounting' },
      'class-l4-accounting-a': { name: 'Y2 Accounting', grade: 'Y2 Accounting' },
      'class-l5-accounting-a': { name: 'Y3 Accounting', grade: 'Y3 Accounting' }
    };
    const classCombination: Record<string, string> = {
      'class-l3-sod-a': 'comb-sod', 'class-l4-sod-a': 'comb-sod', 'class-l5-sod-b': 'comb-sod',
      'class-l3-nit-a': 'comb-nit', 'class-l4-nit-a': 'comb-nit', 'class-l5-nit-a': 'comb-nit',
      'class-l3-accounting-a': 'comb-accounting', 'class-l4-accounting-a': 'comb-accounting',
      'class-l5-accounting-a': 'comb-accounting',
      'class-l4-cst': 'comb-cst-archived',
      'class-s3-a': 'comb-general-science-archived'
    };

    for (const classItem of data.classes) {
      const nextAccounting = accountingNames[classItem.id];
      if (nextAccounting && (classItem.name !== nextAccounting.name || classItem.grade !== nextAccounting.grade)) {
        classItem.name = nextAccounting.name;
        classItem.grade = nextAccounting.grade;
        changed = true;
      }
      const linkedCombination = classCombination[classItem.id];
      if (linkedCombination && !classItem.combinationId) {
        classItem.combinationId = linkedCombination;
        changed = true;
      }
      if (classItem.id === 'class-s3-a' || classItem.id === 'class-l4-cst') {
        if (classItem.status !== 'ARCHIVED') {
          classItem.status = 'ARCHIVED';
          classItem.archivedAt = classItem.archivedAt || archivedAt;
          classItem.archivedBy = classItem.archivedBy || 'system-migration';
          changed = true;
        }
      } else if (!classItem.status) {
        classItem.status = 'ACTIVE';
        changed = true;
      }
    }

    for (const seedCombination of initialCombinations) {
      const exists = data.combinations.some(
        item => item.schoolId === seedCombination.schoolId && item.code === seedCombination.code
      );
      if (exists) continue;
      data.combinations.push({
        ...seedCombination,
        subjects: seedCombination.subjects.map(subject => ({ ...subject, teacherIds: [...subject.teacherIds] })),
        classIds: [...seedCombination.classIds],
        teacherIds: [...seedCombination.teacherIds]
      });
      changed = true;
    }

    return changed;
  }

  private loadOrSeed(): DatabaseSchema {
    try {
      if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
      }

      if (fs.existsSync(DB_FILE)) {
        const raw = fs.readFileSync(DB_FILE, 'utf-8');
        const parsed = JSON.parse(raw);
        if (parsed.schools && parsed.students && parsed.healthIncidents) {
          let needsSave = false;
          const classes = Array.isArray(parsed.classes) ? parsed.classes : [];
          const missingClasses = initialClasses.filter(
            seedClass => !classes.some((existingClass: AcademicClass) => existingClass.id === seedClass.id)
          );
          if (missingClasses.length > 0) {
            parsed.classes = [...classes, ...missingClasses];
            needsSave = true;
          }
          if (!parsed.modules || typeof parsed.modules !== 'object' || Array.isArray(parsed.modules) || parsed.modules === null) {
            parsed.modules = {};
            needsSave = true;
          }
          if (!Array.isArray(parsed.admissions)) {
            parsed.admissions = [];
            needsSave = true;
          }
          if (!Array.isArray(parsed.admissionVerifications)) {
            parsed.admissionVerifications = [];
            needsSave = true;
          }
          if (!Array.isArray(parsed.admissionSlipUploads)) {
            parsed.admissionSlipUploads = [];
            needsSave = true;
          }
          if (
            !parsed.admissionSettings ||
            typeof parsed.admissionSettings !== 'object' ||
            Array.isArray(parsed.admissionSettings) ||
            typeof parsed.admissionSettings.resultSlipRequired !== 'boolean'
          ) {
            parsed.admissionSettings = {
              ...(parsed.admissionSettings && typeof parsed.admissionSettings === 'object' ? parsed.admissionSettings : {}),
              resultSlipRequired: true
            };
            needsSave = true;
          }
          needsSave = this.normalizeStaffData(parsed) || needsSave;
          needsSave = this.normalizeAcademicData(parsed) || needsSave;
          needsSave = this.normalizeAcademicStructure(parsed) || needsSave;
          if (needsSave) {
            this.saveData(parsed);
          }
          return parsed;
        }
      }
    } catch (err) {
      // Never replace an existing data file with seed data. A corrupt or
      // unreadable store must be preserved for manual recovery: silently
      // re-seeding here would destroy real student and financial records.
      if (fs.existsSync(DB_FILE)) {
        const preserved = `${DB_FILE}.corrupt-${new Date().toISOString().replace(/[:.]/g, '-')}`;
        try {
          fs.copyFileSync(DB_FILE, preserved);
        } catch {
          // The original file remains untouched even if the copy fails.
        }
        throw new Error(
          `Unable to read ${DB_FILE}: ${err instanceof Error ? err.message : String(err)}. ` +
          `A copy was preserved at ${preserved}. Refusing to overwrite existing data with seed records.`
        );
      }
      console.warn('No existing database file found; initializing with fresh seed data.');
    }

    const defaultData = this.getDefaultData();
    this.normalizeStaffData(defaultData);
    this.normalizeAcademicData(defaultData);
    this.normalizeAcademicStructure(defaultData);
    this.saveData(defaultData);
    return defaultData;
  }

  private saveData(dataToSave = this.data): void {
    try {
      if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
      }
      // Write to a temporary file and rename it into place: an interrupted
      // write must never truncate the authoritative store.
      const tempFile = path.join(DATA_DIR, `.schoolcare_db.${process.pid}.${Date.now()}.tmp`);
      const fd = fs.openSync(tempFile, 'w', 0o600);
      try {
        fs.writeFileSync(fd, JSON.stringify(dataToSave, null, 2), { encoding: 'utf-8' });
        fs.fsyncSync(fd);
      } finally {
        fs.closeSync(fd);
      }
      try {
        fs.renameSync(tempFile, DB_FILE);
      } catch (error) {
        // Windows cannot rename over an existing file atomically. Fall back to
        // a copy there, keeping the temp file until the copy succeeds.
        if (process.platform !== 'win32') throw error;
        fs.copyFileSync(tempFile, DB_FILE);
        fs.unlinkSync(tempFile);
      }
      try {
        fs.chmodSync(DB_FILE, 0o600);
      } catch {
        // Some Windows filesystems do not support POSIX permissions.
      }
    } catch (err) {
      console.error('Failed to write to database file:', err);
    }
  }

  /** Persists in-memory mutations made through public helpers that mutate fields in place. */
  public persist(): void {
    this.saveData();
  }

  public resetToSeed(): DatabaseSchema {
    this.data = this.getDefaultData();
    this.normalizeStaffData(this.data);
    this.normalizeAcademicStructure(this.data);
    this.saveData(this.data);
    return this.data;
  }

  // --- Audit Logging ---
  public logAudit(
    schoolId: string,
    userId: string,
    userName: string,
    userRole: any,
    action: string,
    entityType: string,
    entityId: string,
    details: string,
    ipAddress = '127.0.0.1'
  ): void {
    const log: AuditLogEntry = {
      id: `log-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      schoolId,
      userId,
      userName,
      userRole,
      action,
      entityType,
      entityId,
      details: sanitizeAuditDetails(details),
      ipAddress,
      timestamp: new Date().toISOString()
    };
    // Audit events are append-only: never truncate or overwrite prior entries.
    this.data.auditLogs.unshift(log);
    this.saveData();
  }

  // --- Schools ---
  public getSchools(): School[] {
    return this.data.schools;
  }

  public getSchool(id: string): School | undefined {
    return this.data.schools.find(s => s.id === id);
  }

  public updateSchool(id: string, updates: Partial<School>): School | null {
    const idx = this.data.schools.findIndex(s => s.id === id);
    if (idx === -1) return null;
    this.data.schools[idx] = { ...this.data.schools[idx], ...updates };
    this.saveData();
    return this.data.schools[idx];
  }

  // --- Users & Auth ---
  public getUsers(schoolId?: string): UserProfile[] {
    if (schoolId) return this.data.users.filter(u => u.schoolId === schoolId);
    return this.data.users;
  }

  public getUserByEmail(email: string): UserProfile | undefined {
    return this.data.users.find(u => u.email.toLowerCase() === email.toLowerCase());
  }

  public getUserById(id: string): UserProfile | undefined {
    return this.data.users.find(u => u.id === id);
  }

  public createUser(user: UserProfile): UserProfile {
    this.data.users.push(user);
    this.saveData();
    return user;
  }

  public updateUserRole(userId: string, role: UserRole): UserProfile | undefined {
    const user = this.data.users.find(item => item.id === userId);
    if (!user) return undefined;
    user.role = role;
    this.saveData();
    return user;
  }

  public updateUserProfile(
    userId: string,
    updates: Partial<Pick<UserProfile, 'fullName' | 'firstName' | 'lastName' | 'phone' | 'avatarUrl' | 'teacherDepartment'>>
  ): UserProfile | undefined {
    const user = this.data.users.find(item => item.id === userId);
    if (!user) return undefined;
    for (const [key, value] of Object.entries(updates)) {
      if (value !== undefined) {
        (user as unknown as Record<string, unknown>)[key] = value;
      }
    }
    this.saveData();
    return user;
  }

  public setUserActive(userId: string, isActive: boolean): UserProfile | undefined {
    const user = this.data.users.find(item => item.id === userId);
    if (!user) return undefined;
    user.isActive = isActive;
    this.saveData();
    return user;
  }

  /** Advance the credential epoch so sessions issued before this time are invalid. */
  public setCredentialsResetAt(userId: string, epoch: string): UserProfile | undefined {
    const user = this.data.users.find(item => item.id === userId);
    if (!user) return undefined;
    user.credentialsResetAt = epoch;
    this.saveData();
    return user;
  }

  public setDelegatedPermissions(userId: string, permissions: string[]): UserProfile | undefined {
    const user = this.data.users.find(item => item.id === userId);
    if (!user) return undefined;
    user.delegatedPermissions = [...permissions];
    const staffAccount = this.data.staffAccounts.find(account => account.userId === userId);
    if (staffAccount) {
      staffAccount.delegatedPermissions = [...permissions];
      staffAccount.lastModifiedAt = new Date().toISOString();
    }
    this.saveData();
    return user;
  }

  public setDelegatedRoleScope(userId: string, roles: UserRole[]): UserProfile | undefined {
    const user = this.data.users.find(item => item.id === userId);
    if (!user) return undefined;
    user.delegatedRoleScope = [...roles];
    const staffAccount = this.data.staffAccounts.find(account => account.userId === userId);
    if (staffAccount) {
      staffAccount.delegatedRoleScope = [...roles];
      staffAccount.lastModifiedAt = new Date().toISOString();
    }
    this.saveData();
    return user;
  }

  // --- Staff accounts, invitations and permission history ---

  public getStaffAccounts(schoolId?: string): StaffAccount[] {
    return schoolId
      ? this.data.staffAccounts.filter(account => account.schoolId === schoolId)
      : [...this.data.staffAccounts];
  }

  public getStaffAccountById(id: string): StaffAccount | undefined {
    return this.data.staffAccounts.find(account => account.id === id);
  }

  public getStaffAccountByUserId(userId: string): StaffAccount | undefined {
    return this.data.staffAccounts.find(account => account.userId === userId);
  }

  public createStaffAccount(account: StaffAccount): StaffAccount {
    this.data.staffAccounts.push(account);
    this.saveData();
    return account;
  }

  public updateStaffAccount(id: string, updates: Partial<StaffAccount>): StaffAccount | undefined {
    const account = this.data.staffAccounts.find(item => item.id === id);
    if (!account) return undefined;
    Object.assign(account, updates, { lastModifiedAt: new Date().toISOString() });
    this.saveData();
    return account;
  }

  public getStaffInvitations(schoolId?: string): StaffInvitation[] {
    return schoolId
      ? this.data.staffInvitations.filter(invitation => invitation.schoolId === schoolId)
      : [...this.data.staffInvitations];
  }

  public getStaffInvitationById(id: string): StaffInvitation | undefined {
    return this.data.staffInvitations.find(invitation => invitation.id === id);
  }

  public getStaffInvitationByTokenHash(tokenHash: string): StaffInvitation | undefined {
    return this.data.staffInvitations.find(invitation => invitation.tokenHash === tokenHash);
  }

  public createStaffInvitation(invitation: StaffInvitation): StaffInvitation {
    this.data.staffInvitations.push(invitation);
    this.saveData();
    return invitation;
  }

  public updateStaffInvitation(id: string, updates: Partial<StaffInvitation>): StaffInvitation | undefined {
    const invitation = this.data.staffInvitations.find(item => item.id === id);
    if (!invitation) return undefined;
    Object.assign(invitation, updates);
    this.saveData();
    return invitation;
  }

  public getPermissionGrants(schoolId?: string): PermissionGrantRecord[] {
    return schoolId
      ? this.data.permissionGrants.filter(record => record.schoolId === schoolId)
      : [...this.data.permissionGrants];
  }

  public createPermissionGrant(record: PermissionGrantRecord): PermissionGrantRecord {
    this.data.permissionGrants.push(record);
    this.saveData();
    return record;
  }

  public getPermissionGroups(schoolId?: string, includeArchived = false): PermissionGroup[] {
    return this.data.permissionGroups.filter(
      group =>
        (!schoolId || group.schoolId === schoolId) &&
        (includeArchived || !group.archivedAt)
    );
  }

  public getPermissionGroupById(id: string): PermissionGroup | undefined {
    return this.data.permissionGroups.find(group => group.id === id);
  }

  public createPermissionGroup(group: PermissionGroup): PermissionGroup {
    this.data.permissionGroups.push(group);
    this.saveData();
    return group;
  }

  public updatePermissionGroup(id: string, updates: Partial<PermissionGroup>): PermissionGroup | undefined {
    const group = this.data.permissionGroups.find(item => item.id === id);
    if (!group) return undefined;
    Object.assign(group, updates);
    this.saveData();
    return group;
  }

  public updatePermissionGrant(id: string, updates: Partial<PermissionGrantRecord>): PermissionGrantRecord | undefined {
    const record = this.data.permissionGrants.find(item => item.id === id);
    if (!record) return undefined;
    Object.assign(record, updates);
    this.saveData();
    return record;
  }

  // --- Students ---
  public getStudents(schoolId: string, classId?: string, search?: string, includeArchived = false): Student[] {
    let list = this.data.students.filter(
      s => s.schoolId === schoolId && (includeArchived || !s.archivedAt)
    );
    if (classId && classId !== 'all') {
      list = list.filter(s => s.classId === classId);
    }
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(
        s =>
          s.firstName.toLowerCase().includes(q) ||
          s.lastName.toLowerCase().includes(q) ||
          s.admissionNumber.toLowerCase().includes(q)
      );
    }
    return list;
  }

  public getStudentById(id: string): Student | undefined {
    return this.data.students.find(s => s.id === id);
  }

  public createStudent(student: Student): Student {
    this.data.students.push(student);
    this.saveData();
    return student;
  }

  public updateStudent(id: string, updates: Partial<Student>): Student | null {
    const idx = this.data.students.findIndex(s => s.id === id);
    if (idx === -1) return null;
    this.data.students[idx] = { ...this.data.students[idx], ...updates };
    this.saveData();
    return this.data.students[idx];
  }

  // --- Guardians & Links ---
  public getGuardians(schoolId: string, includeArchived = false): Guardian[] {
    return this.data.guardians.filter(
      g => g.schoolId === schoolId && (includeArchived || !g.archivedAt)
    );
  }

  public getGuardianById(id: string): Guardian | undefined {
    return this.data.guardians.find(g => g.id === id);
  }

  public updateGuardian(id: string, updates: Partial<Guardian>): Guardian | undefined {
    const idx = this.data.guardians.findIndex(g => g.id === id);
    if (idx === -1) return undefined;
    this.data.guardians[idx] = { ...this.data.guardians[idx], ...updates };
    this.saveData();
    return this.data.guardians[idx];
  }

  public getGuardiansForStudent(studentId: string): { guardian: Guardian; link: StudentGuardianLink }[] {
    const links = this.data.studentGuardians.filter(l => l.studentId === studentId);
    return links
      .map(link => {
        const guardian = this.data.guardians.find(g => g.id === link.guardianId);
        return guardian ? { guardian, link } : null;
      })
      .filter((item): item is { guardian: Guardian; link: StudentGuardianLink } => item !== null);
  }

  public getStudentsForGuardian(guardianId: string): { student: Student; link: StudentGuardianLink }[] {
    const links = this.data.studentGuardians.filter(l => l.guardianId === guardianId);
    return links
      .map(link => {
        const student = this.data.students.find(s => s.id === link.studentId);
        return student ? { student, link } : null;
      })
      .filter((item): item is { student: Student; link: StudentGuardianLink } => item !== null);
  }

  public createGuardian(guardian: Guardian, linkWithStudentId?: string, relationship = 'GUARDIAN'): Guardian {
    this.data.guardians.push(guardian);
    if (linkWithStudentId) {
      this.createGuardianLink({
        studentId: linkWithStudentId,
        guardianId: guardian.id,
        relationship,
        emergencyPriority: guardian.emergencyPriority || 1,
        canPickup: guardian.canPickup ?? true,
        isPrimary: true
      });
    } else {
      this.saveData();
    }
    return guardian;
  }

  public getGuardianLink(studentId: string, guardianId: string): StudentGuardianLink | undefined {
    return this.data.studentGuardians.find(
      link => link.studentId === studentId && link.guardianId === guardianId
    );
  }

  public createGuardianLink(link: StudentGuardianLink): StudentGuardianLink {
    const existing = this.getGuardianLink(link.studentId, link.guardianId);
    if (existing) return existing;
    this.data.studentGuardians.push(link);
    this.saveData();
    return link;
  }

  public deleteGuardian(id: string): void {
    this.data.guardians = this.data.guardians.filter(guardian => guardian.id !== id);
    this.data.studentGuardians = this.data.studentGuardians.filter(link => link.guardianId !== id);
    this.saveData();
  }

  public getUserByStudentId(studentId: string): UserProfile | undefined {
    return this.data.users.find(user => user.studentId === studentId);
  }

  public getUserByGuardianId(guardianId: string): UserProfile | undefined {
    return this.data.users.find(user => user.linkedGuardianIds?.includes(guardianId));
  }

  // --- Classes & Subjects ---
  /** All classes, including archived ones (needed for historical records). */
  public getClasses(schoolId: string): AcademicClass[] {
    return this.data.classes.filter(c => c.schoolId === schoolId);
  }

  /** Only classes that may be offered to new registrations/assignments. */
  public getActiveClasses(schoolId: string): AcademicClass[] {
    return this.data.classes.filter(c => c.schoolId === schoolId && (c.status ?? 'ACTIVE') === 'ACTIVE');
  }

  public getSubjects(schoolId: string): Subject[] {
    return this.data.subjects.filter(s => s.schoolId === schoolId);
  }

  public addClass(record: AcademicClass): AcademicClass {
    this.data.classes.push(record);
    this.saveData();
    return record;
  }

  public addSubject(record: Subject): Subject {
    this.data.subjects.push(record);
    this.saveData();
    return record;
  }

  // --- Attendance ---
  public getAttendance(schoolId: string, date?: string, classId?: string): AttendanceRecord[] {
    let list = this.data.attendance.filter(a => a.schoolId === schoolId);
    if (date) list = list.filter(a => a.date === date);
    if (classId && classId !== 'all') list = list.filter(a => a.classId === classId);
    return list;
  }

  public saveAttendanceBatch(records: AttendanceRecord[]): AttendanceRecord[] {
    for (const rec of records) {
      const existingIdx = this.data.attendance.findIndex(
        a => a.studentId === rec.studentId && a.date === rec.date
      );
      if (existingIdx !== -1) {
        this.data.attendance[existingIdx] = { ...this.data.attendance[existingIdx], ...rec, updatedAt: new Date().toISOString() };
      } else {
        this.data.attendance.push(rec);
      }
    }
    this.saveData();
    return records;
  }

  public updateAttendanceExplanation(id: string, explanation: string): AttendanceRecord | null {
    const idx = this.data.attendance.findIndex(a => a.id === id);
    if (idx === -1) return null;
    // An explanation may only excuse an absence. Re-mark other statuses avoids
    // silently rewriting verified attendance or medical/leave records.
    if (this.data.attendance[idx].status !== 'ABSENT') return null;
    this.data.attendance[idx].parentExplanation = explanation;
    this.data.attendance[idx].status = 'EXCUSED';
    this.saveData();
    return this.data.attendance[idx];
  }

  // --- Health Incidents ---
  public getHealthIncidents(schoolId: string): HealthIncident[] {
    return this.data.healthIncidents
      .filter(h => h.schoolId === schoolId)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  public getHealthIncidentById(id: string): HealthIncident | undefined {
    return this.data.healthIncidents.find(h => h.id === id || h.referenceNumber === id);
  }

  public createHealthIncident(incident: HealthIncident): HealthIncident {
    this.data.healthIncidents.unshift(incident);
    this.saveData();
    return incident;
  }

  public addIncidentAction(incidentId: string, action: string, actor: string): HealthIncident | null {
    const inc = this.data.healthIncidents.find(h => h.id === incidentId);
    if (!inc) return null;
    const now = new Date();
    const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    inc.timeline.push({ time: timeStr, action, actor });
    this.saveData();
    return inc;
  }

  public acknowledgeIncident(incidentId: string, notes?: string): HealthIncident | null {
    const inc = this.data.healthIncidents.find(h => h.id === incidentId);
    if (!inc) return null;
    inc.parentAcknowledged = true;
    inc.parentAcknowledgedAt = new Date().toISOString();
    inc.contactStatus = 'ACKNOWLEDGED';
    if (notes) inc.parentResponseNotes = notes;
    inc.timeline.push({
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      action: `Guardian confirmed acknowledgment: ${notes || 'Acknowledged receipt of alert.'}`,
      actor: inc.guardianName || 'Guardian'
    });
    this.saveData();
    return inc;
  }

  // --- Notifications ---
  public getNotifications(schoolId: string): NotificationMessage[] {
    return this.data.notifications
      .filter(n => n.schoolId === schoolId)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  public queueNotification(msg: NotificationMessage): NotificationMessage {
    this.data.notifications.unshift(msg);
    this.saveData();
    return msg;
  }

  public updateNotificationStatus(
    id: string,
    status: NotificationMessage['status'],
    providerRef?: string,
    error?: string
  ): NotificationMessage | null {
    const idx = this.data.notifications.findIndex(n => n.id === id);
    if (idx === -1) return null;
    this.data.notifications[idx].status = status;
    if (providerRef) this.data.notifications[idx].providerReference = providerRef;
    if (error) this.data.notifications[idx].errorMessage = error;
    if (status === 'ACKNOWLEDGED') {
      this.data.notifications[idx].acknowledgedAt = new Date().toISOString();
    }
    this.saveData();
    return this.data.notifications[idx];
  }

  // --- Finance ---
  public getFeeStructures(schoolId: string): FeeStructure[] {
    return this.data.feeStructures.filter(f => f.schoolId === schoolId);
  }

  public getInvoices(schoolId: string, studentId?: string): Invoice[] {
    let list = this.data.invoices.filter(i => i.schoolId === schoolId);
    if (studentId) list = list.filter(i => i.studentId === studentId);
    return list;
  }

  public getPayments(schoolId: string, studentId?: string): Payment[] {
    let list = this.data.payments.filter(p => p.schoolId === schoolId);
    if (studentId) list = list.filter(p => p.studentId === studentId);
    return list;
  }

  public recordPayment(payment: Payment): { payment: Payment; invoice?: Invoice } {
    if (!Number.isFinite(payment.amountRwf) || payment.amountRwf <= 0) {
      throw new Error('A positive payment amount is required.');
    }
    const invoice = this.data.invoices.find(i => i.id === payment.invoiceId);
    if (!invoice) {
      throw new Error('The linked invoice no longer exists.');
    }
    if (invoice.schoolId !== payment.schoolId || invoice.studentId !== payment.studentId) {
      throw new Error('The invoice does not belong to this school and student.');
    }
    if (payment.amountRwf > invoice.balanceRwf) {
      throw new Error('Payment exceeds the outstanding invoice balance.');
    }
    if (
      this.data.payments.some(
        item =>
          item.reference === payment.reference ||
          item.receiptNumber === payment.receiptNumber ||
          item.id === payment.id
      )
    ) {
      throw new Error('A payment with this reference already exists.');
    }

    this.data.payments.unshift(payment);
    invoice.paidAmountRwf += payment.amountRwf;
    invoice.balanceRwf = Math.max(0, invoice.totalAmountRwf - invoice.paidAmountRwf);
    invoice.status = invoice.balanceRwf === 0 ? 'PAID' : 'PARTIAL';
    this.saveData();
    return { payment, invoice };
  }

  // --- Staff & Timetable & Homework ---
  public getStaff(schoolId: string): StaffMember[] {
    return this.data.staff.filter(s => s.schoolId === schoolId);
  }

  public createStaffMember(member: StaffMember): StaffMember {
    this.data.staff.push(member);
    this.saveData();
    return member;
  }

  public updateStaffMember(id: string, updates: Partial<StaffMember>): StaffMember | undefined {
    const member = this.data.staff.find(item => item.id === id);
    if (!member) return undefined;
    Object.assign(member, updates);
    this.saveData();
    return member;
  }

  public getTimetable(schoolId: string, classId?: string): TimetableEntry[] {
    let list = this.data.timetable.filter(t => t.schoolId === schoolId);
    if (classId && classId !== 'all') list = list.filter(t => t.classId === classId);
    return list;
  }

  public getHomework(schoolId: string, classId?: string): HomeworkAssignment[] {
    let list = this.data.homework.filter(h => h.schoolId === schoolId);
    if (classId && classId !== 'all') list = list.filter(h => h.classId === classId);
    return list;
  }

  // --- Academic management storage (additive, school-isolated) ---
  /** Returns a defensive shallow copy so callers cannot mutate the store by accident. */
  public getAcademicCollection<T>(key: AcademicCollectionKey, schoolId?: string): T[] {
    const list = (this.data as unknown as Record<string, unknown>)[key];
    if (!Array.isArray(list)) return [];
    const records = list as T[];
    if (!schoolId) return records.slice();
    return records.filter(record => (record as { schoolId?: string }).schoolId === schoolId).slice();
  }

  public saveAcademicCollection<T>(key: AcademicCollectionKey, records: T[]): T[] {
    (this.data as unknown as Record<string, unknown>)[key] = records;
    this.saveData();
    return records;
  }

  public addAcademicRecord<T extends { id: string; schoolId: string }>(key: AcademicCollectionKey, record: T): T {
    const records = this.getAcademicCollection<T>(key);
    records.unshift(record);
    this.saveAcademicCollection(key, records);
    return record;
  }

  public updateAcademicRecord<T extends { id: string; schoolId: string }>(
    key: AcademicCollectionKey,
    id: string,
    schoolId: string,
    updates: Partial<T>
  ): T | null {
    const records = this.getAcademicCollection<T>(key);
    const index = records.findIndex(item => item.id === id && item.schoolId === schoolId);
    if (index === -1) return null;
    records[index] = { ...records[index], ...updates, id, schoolId };
    this.saveAcademicCollection(key, records);
    return records[index];
  }

  // --- Report Cards ---
  public getReportCards(
    schoolId: string,
    studentId?: string,
    filters?: { academicYear?: string; term?: string; publishedOnly?: boolean; approvedOnly?: boolean }
  ): ReportCard[] {
    let list = this.data.reportCards.filter(r => r.schoolId === schoolId);
    if (studentId) list = list.filter(r => r.studentId === studentId);
    if (filters?.academicYear) list = list.filter(r => r.academicYear === filters.academicYear);
    if (filters?.term) list = list.filter(r => r.term === filters.term);
    if (filters?.approvedOnly) list = list.filter(r => r.isApproved);
    if (filters?.publishedOnly) list = list.filter(r => Boolean(r.publishedAt));
    return list;
  }

  public upsertReportCard(card: ReportCard): ReportCard {
    const index = this.data.reportCards.findIndex(
      item => item.schoolId === card.schoolId && item.studentId === card.studentId &&
        item.academicYear === card.academicYear && item.term === card.term
    );
    if (index === -1) {
      this.data.reportCards.unshift(card);
    } else {
      const existing = this.data.reportCards[index];
      // Regeneration creates blank qualitative fields. Never overwrite an
      // existing teacher/headteacher note or published state with generated
      // defaults. Reopening explicitly clears publication before regeneration.
      const preservedKeys: (keyof ReportCard)[] = [
        'conductScore', 'classTeacherRemarks', 'headTeacherRemarks',
        'strengths', 'areasForImprovement', 'promotionDecision',
        'publishedAt', 'publishedBy'
      ];
      const preserved: Partial<ReportCard> = {};
      for (const key of preservedKeys) {
        const existingValue = existing[key];
        const incomingValue = card[key];
        if ((incomingValue === '' || incomingValue === undefined || incomingValue === null) &&
            existingValue !== '' && existingValue !== undefined && existingValue !== null) {
          (preserved as Record<string, unknown>)[key] = existingValue;
        }
      }
      this.data.reportCards[index] = {
        ...existing, ...card, ...preserved, id: existing.id
      };
    }
    this.saveData();
    return index === -1 ? card : this.data.reportCards[index];
  }

  public getReportCardById(schoolId: string, id: string): ReportCard | undefined {
    return this.data.reportCards.find(card => card.schoolId === schoolId && card.id === id);
  }

  public updateReportCard(schoolId: string, id: string, updates: Partial<ReportCard>): ReportCard | null {
    const index = this.data.reportCards.findIndex(card => card.schoolId === schoolId && card.id === id);
    if (index === -1) return null;
    this.data.reportCards[index] = { ...this.data.reportCards[index], ...updates, id, schoolId };
    this.saveData();
    return this.data.reportCards[index];
  }

  // --- Events ---
  public getEvents(schoolId: string): SchoolEvent[] {
    return this.data.events.filter(e => e.schoolId === schoolId);
  }

  public createEvent(event: SchoolEvent): SchoolEvent {
    this.data.events.push(event);
    this.saveData();
    return event;
  }

  // --- Audit Logs ---
  public getAuditLogs(schoolId: string): AuditLogEntry[] {
    return this.data.auditLogs.filter(a => a.schoolId === schoolId);
  }

  // ==========================================
  // ADMISSION SYSTEM
  // ==========================================

  public getAdmissions(
    schoolId?: string,
    filters?: {
      search?: string;
      applicationType?: ApplicationType;
      status?: ApplicationStatus;
      academicYear?: string;
    }
  ): AdmissionApplication[] {
    let list = schoolId
      ? this.data.admissions.filter(a => a.schoolId === schoolId)
      : [...this.data.admissions];

    if (filters?.search) {
      const q = filters.search.toLowerCase();
      list = list.filter(
        a =>
          a.applicantFullName.toLowerCase().includes(q) ||
          a.referenceNumber.toLowerCase().includes(q) ||
          a.guardianFullName.toLowerCase().includes(q)
      );
    }
    if (filters?.applicationType) {
      list = list.filter(a => a.applicationType === filters.applicationType);
    }
    if (filters?.status) {
      list = list.filter(a => a.status === filters.status);
    }
    if (filters?.academicYear) {
      list = list.filter(a => a.academicYear === filters.academicYear);
    }

    return list.sort((a, b) => new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime());
  }

  public getAdmissionById(id: string): AdmissionApplication | undefined {
    return this.data.admissions.find(a => a.id === id || a.referenceNumber === id);
  }

  public getAdmissionByReference(ref: string): AdmissionApplication | undefined {
    return this.data.admissions.find(a => a.referenceNumber === ref);
  }

  public createAdmission(application: AdmissionApplication): AdmissionApplication {
    this.data.admissions.unshift(application);
    this.saveData();
    return application;
  }

  public updateAdmission(id: string, updates: Partial<AdmissionApplication>): AdmissionApplication | null {
    const idx = this.data.admissions.findIndex(a => a.id === id);
    if (idx === -1) return null;
    this.data.admissions[idx] = { ...this.data.admissions[idx], ...updates };
    this.saveData();
    return this.data.admissions[idx];
  }

  public addAdmissionDocument(applicationId: string, doc: AdmissionDocument): AdmissionApplication | null {
    const app = this.data.admissions.find(a => a.id === applicationId);
    if (!app) return null;
    app.documents.push(doc);
    this.saveData();
    return app;
  }

  public removeAdmissionDocument(applicationId: string, docId: string): AdmissionApplication | null {
    const app = this.data.admissions.find(a => a.id === applicationId);
    if (!app) return null;
    app.documents = app.documents.filter(d => d.id !== docId);
    this.saveData();
    return app;
  }

  public addAdmissionReviewNote(applicationId: string, note: AdmissionReviewNote): AdmissionApplication | null {
    const app = this.data.admissions.find(a => a.id === applicationId);
    if (!app) return null;
    app.reviewHistory.push(note);
    this.saveData();
    return app;
  }

  public addAdmissionStatusHistory(
    applicationId: string,
    history: AdmissionStatusHistory
  ): AdmissionApplication | null {
    const app = this.data.admissions.find(a => a.id === applicationId);
    if (!app) return null;
    app.statusHistory.push(history);
    this.saveData();
    return app;
  }

  public updateAdmissionStatus(
    id: string,
    newStatus: ApplicationStatus,
    changedBy: string,
    changedByName: string,
    reason?: string
  ): AdmissionApplication | null {
    const app = this.data.admissions.find(a => a.id === id);
    if (!app) return null;

    const oldStatus = app.status;
    app.status = newStatus;
    app.reviewedAt = new Date().toISOString();
    app.reviewedBy = changedBy;
    app.reviewedByName = changedByName;

    if (reason) {
      app.rejectionReason = reason;
    }

    app.statusHistory.push({
      id: `hist-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      applicationId: id,
      fromStatus: oldStatus,
      toStatus: newStatus,
      changedBy,
      changedByName,
      reason,
      createdAt: new Date().toISOString()
    });

    this.saveData();
    return app;
  }

  // --- Public application verification (one-time codes) ---
  public addAdmissionVerification(record: AdmissionVerification): AdmissionVerification {
    this.data.admissionVerifications.push(record);
    this.saveData();
    return record;
  }

  public getAdmissionVerification(id: string): AdmissionVerification | undefined {
    return this.data.admissionVerifications.find(item => item.id === id);
  }

  public getActiveVerificationByReference(referenceNumber: string): AdmissionVerification | undefined {
    return [...this.data.admissionVerifications]
      .reverse()
      .find(item => item.referenceNumber === referenceNumber && !item.consumedAt);
  }

  public updateAdmissionVerification(
    id: string,
    updates: Partial<AdmissionVerification>
  ): AdmissionVerification | null {
    const index = this.data.admissionVerifications.findIndex(item => item.id === id);
    if (index === -1) return null;
    this.data.admissionVerifications[index] = {
      ...this.data.admissionVerifications[index],
      ...updates
    };
    this.saveData();
    return this.data.admissionVerifications[index];
  }

  // --- Senior 3 result slip uploads (temporary, private capability records) ---
  public addAdmissionSlipUpload(record: AdmissionSlipUpload): AdmissionSlipUpload {
    this.data.admissionSlipUploads.push(record);
    this.saveData();
    return record;
  }

  public getAdmissionSlipUploadByTokenHash(tokenHash: string): AdmissionSlipUpload | undefined {
    return this.data.admissionSlipUploads.find(item => item.tokenHash === tokenHash);
  }

  public updateAdmissionSlipUpload(
    id: string,
    updates: Partial<AdmissionSlipUpload>
  ): AdmissionSlipUpload | null {
    const index = this.data.admissionSlipUploads.findIndex(item => item.id === id);
    if (index === -1) return null;
    this.data.admissionSlipUploads[index] = {
      ...this.data.admissionSlipUploads[index],
      ...updates
    };
    this.saveData();
    return this.data.admissionSlipUploads[index];
  }

  // --- Administrator-configured admission settings ---
  public getAdmissionSettings(): AdmissionSettings {
    return { ...this.data.admissionSettings };
  }

  public updateAdmissionSettings(updates: Partial<AdmissionSettings>): AdmissionSettings {
    this.data.admissionSettings = { ...this.data.admissionSettings, ...updates };
    this.saveData();
    return this.getAdmissionSettings();
  }

  public updateSenior3Results(
    applicationId: string,
    updates: Partial<NonNullable<AdmissionApplication['senior3Results']>>
  ): AdmissionApplication | null {
    const app = this.data.admissions.find(item => item.id === applicationId);
    if (!app || !app.senior3Results || !updates) return null;
    app.senior3Results = { ...app.senior3Results, ...updates, updatedAt: new Date().toISOString() };
    this.saveData();
    return app;
  }

  // --- Generic school modules (admissions, documents, exams, discipline, etc.) ---
  public getModuleRecords(schoolId: string, moduleKey: string): Array<Record<string, unknown>> {
    const bucket = this.data.modules[moduleKey];
    if (!Array.isArray(bucket)) return [];
    return bucket.filter(record => record && record.schoolId === schoolId && record.deleted !== true);
  }

  public createModuleRecord(
    schoolId: string,
    moduleKey: string,
    payload: Record<string, unknown>,
    actorId: string
  ): Record<string, unknown> {
    const records = this.data.modules[moduleKey] ?? [];
    const now = new Date().toISOString();
    const record: Record<string, unknown> = {
      ...payload,
      id: `mod-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`,
      schoolId,
      createdAt: now,
      updatedAt: now,
      createdBy: actorId
    };
    records.unshift(record);
    this.data.modules[moduleKey] = records;
    this.saveData();
    return record;
  }

  public updateModuleRecord(
    schoolId: string,
    moduleKey: string,
    id: string,
    payload: Record<string, unknown>
  ): Record<string, unknown> | null {
    const records = this.data.modules[moduleKey];
    if (!Array.isArray(records)) return null;
    const index = records.findIndex(
      record => record.id === id && record.schoolId === schoolId && record.deleted !== true
    );
    if (index === -1) return null;

    const updated: Record<string, unknown> = {
      ...records[index],
      ...payload,
      id: records[index].id,
      schoolId,
      updatedAt: new Date().toISOString()
    };
    records[index] = updated;
    this.saveData();
    return updated;
  }

  public deleteModuleRecord(schoolId: string, moduleKey: string, id: string): boolean {
    const records = this.data.modules[moduleKey];
    if (!Array.isArray(records)) return false;
    const index = records.findIndex(
      record => record.id === id && record.schoolId === schoolId && record.deleted !== true
    );
    if (index === -1) return false;

    records[index] = {
      ...records[index],
      deleted: true,
      deletedAt: new Date().toISOString()
    };
    this.saveData();
    return true;
  }

  public static getAdmissionStatusMeta(status: ApplicationStatus): { label: string; color: string } {
    return ADMISSION_STATUSES[status] || { label: status, color: 'bg-slate-100 text-slate-700' };
  }

  public static getAdmissionTypeLabel(type: ApplicationType): string {
    return ADMISSION_TYPE_LABELS[type] || type;
  }

  public static getAdmissionStatusOrder(): ApplicationStatus[] {
    return ADMISSION_STATUS_ORDER;
  }
}

export const db = new DatabaseStore();
