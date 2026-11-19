import fs from 'fs';
import path from 'path';
import {
  School,
  UserProfile,
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
  ApplicationType
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
  initialAuditLogs
} from './seedData';

interface DatabaseSchema {
  schools: School[];
  users: UserProfile[];
  classes: AcademicClass[];
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
      timetable: [...initialTimetable],
      homework: [...initialHomework],
      events: [...initialEvents],
      reportCards: [...initialReportCards],
      auditLogs: [...initialAuditLogs],
      admissions: [],
      admissionVerifications: [],
      admissionSlipUploads: [],
      admissionSettings: { resultSlipRequired: true },
      modules: {}
    };
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
          if (needsSave) {
            this.saveData(parsed);
          }
          return parsed;
        }
      }
    } catch (err) {
      console.warn('Could not read existing database file, initializing with fresh seed data.', err);
    }

    const defaultData = this.getDefaultData();
    this.saveData(defaultData);
    return defaultData;
  }

  private saveData(dataToSave = this.data): void {
    try {
      if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
      }
      fs.writeFileSync(DB_FILE, JSON.stringify(dataToSave, null, 2), { encoding: 'utf-8', mode: 0o600 });
      try {
        fs.chmodSync(DB_FILE, 0o600);
      } catch {
        // Some Windows filesystems do not support POSIX permissions.
      }
    } catch (err) {
      console.error('Failed to write to database file:', err);
    }
  }

  public resetToSeed(): DatabaseSchema {
    this.data = this.getDefaultData();
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
      details,
      ipAddress,
      timestamp: new Date().toISOString()
    };
    this.data.auditLogs.unshift(log);
    // keep latest 200 logs
    if (this.data.auditLogs.length > 200) {
      this.data.auditLogs = this.data.auditLogs.slice(0, 200);
    }
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

  // --- Students ---
  public getStudents(schoolId: string, classId?: string, search?: string): Student[] {
    let list = this.data.students.filter(s => s.schoolId === schoolId);
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
  public getGuardians(schoolId: string): Guardian[] {
    return this.data.guardians.filter(g => g.schoolId === schoolId);
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
      this.data.studentGuardians.push({
        studentId: linkWithStudentId,
        guardianId: guardian.id,
        relationship,
        emergencyPriority: guardian.emergencyPriority || 1,
        canPickup: guardian.canPickup ?? true,
        isPrimary: true
      });
    }
    this.saveData();
    return guardian;
  }

  // --- Classes & Subjects ---
  public getClasses(schoolId: string): AcademicClass[] {
    return this.data.classes.filter(c => c.schoolId === schoolId);
  }

  public getSubjects(schoolId: string): Subject[] {
    return this.data.subjects.filter(s => s.schoolId === schoolId);
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
    this.data.payments.unshift(payment);
    const invoice = this.data.invoices.find(i => i.id === payment.invoiceId);
    if (invoice) {
      invoice.paidAmountRwf += payment.amountRwf;
      invoice.balanceRwf = Math.max(0, invoice.totalAmountRwf - invoice.paidAmountRwf);
      if (invoice.balanceRwf === 0) {
        invoice.status = 'PAID';
      } else {
        invoice.status = 'PARTIAL';
      }
    }
    this.saveData();
    return { payment, invoice };
  }

  // --- Staff & Timetable & Homework ---
  public getStaff(schoolId: string): StaffMember[] {
    return this.data.staff.filter(s => s.schoolId === schoolId);
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

  // --- Report Cards ---
  public getReportCards(schoolId: string, studentId?: string): ReportCard[] {
    let list = this.data.reportCards.filter(r => r.schoolId === schoolId);
    if (studentId) list = list.filter(r => r.studentId === studentId);
    return list;
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
