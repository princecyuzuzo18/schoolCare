export type UserRole =
  | 'SUPER_ADMIN'
  | 'SCHOOL_ADMIN'
  | 'HEAD_TEACHER'
  | 'DEPUTY_HEAD'
  | 'TEACHER'
  | 'NURSE'
  | 'ACCOUNTANT'
  | 'DISCIPLINE_OFFICER'
  | 'SCHOOL_IT'
  | 'ANIMATEUR'
  | 'PARENT'
  | 'STUDENT';

export type LanguageCode = 'en' | 'rw';

export interface School {
  id: string;
  name: string;
  code: string;
  type: string; // e.g. "Secondary & TVET (RTB)"
  motto: string;
  logo: string;
  district: string;
  sector: string;
  province: string;
  country: string;
  phone: string;
  emergencyPhone: string;
  email: string;
  website: string;
  currentAcademicYear: string;
  currentTerm: string;
  totalStudents: number;
  totalStaff: number;
}

export interface UserProfile {
  id: string;
  schoolId: string;
  email: string;
  /** Given name. Kept alongside fullName for official staff records. */
  firstName?: string;
  /** Family name. Kept alongside fullName for official staff records. */
  lastName?: string;
  fullName: string;
  role: UserRole;
  phone: string;
  avatarUrl: string;
  preferredLanguage: LanguageCode;
  isActive?: boolean;
  /** Sessions issued before this timestamp are rejected after a credential reset. */
  credentialsResetAt?: string;
  delegatedPermissions?: string[];
  /** Roles this account may create/edit when staff management was delegated. */
  delegatedRoleScope?: UserRole[];
  createdAt?: string;
  invitedBy?: string;
  linkedStudentIds?: string[]; // for parents
  linkedGuardianIds?: string[];
  studentId?: string; // for students
  teacherDepartment?: string;
  lastLogin?: string;
}

export interface Student {
  id: string;
  schoolId: string;
  admissionNumber: string; // e.g. "ESR-2024-001"
  firstName: string;
  lastName: string;
  gender: 'M' | 'F';
  dob: string;
  classId: string;
  className: string;
  combination: string; // e.g. "Software Development (SOD)", "Accounting", "Senior 3"
  /** Link to the managed combination record when the student was registered through it. */
  combinationId?: string;
  educationLevel?: string;
  academicProgramme?: string;
  enrollmentStatus: 'ACTIVE' | 'TRANSFERRED' | 'GRADUATED' | 'SUSPENDED';
  admissionDate: string;
  bloodGroup?: string;
  allergies?: string;
  medicalNotes?: string;
  photoUrl: string;
  nationalId?: string;
  previousSchool?: string;
  /** Soft-delete metadata. Archived learners keep their full academic history. */
  archivedAt?: string;
  archivedBy?: string;
  archiveReason?: string;
  archivedFromStatus?: Student['enrollmentStatus'];
}

export interface Guardian {
  id: string;
  schoolId: string;
  fullName: string;
  relationship: 'FATHER' | 'MOTHER' | 'GUARDIAN' | 'UNCLE' | 'AUNT' | 'SIBLING';
  phone: string;
  altPhone?: string;
  email?: string;
  nationalId?: string;
  occupation?: string;
  address: string;
  preferredLanguage: LanguageCode;
  preferredChannel: 'SMS' | 'WHATSAPP' | 'EMAIL' | 'IN_APP';
  isVerified: boolean;
  canPickup: boolean;
  emergencyPriority: number; // 1 = Primary, 2 = Secondary
  /** Soft-delete metadata. Links and historical records are never cascaded away. */
  archivedAt?: string;
  archivedBy?: string;
  archiveReason?: string;
}

export interface StudentGuardianLink {
  studentId: string;
  guardianId: string;
  relationship: string;
  emergencyPriority: number;
  canPickup: boolean;
  isPrimary: boolean;
}

export type AttendanceStatus =
  | 'PRESENT'
  | 'ABSENT'
  | 'LATE'
  | 'EXCUSED'
  | 'SICK'
  | 'AUTHORIZED_LEAVE';

export interface AttendanceRecord {
  id: string;
  schoolId: string;
  studentId: string;
  studentName: string;
  classId: string;
  className: string;
  date: string;
  status: AttendanceStatus;
  recordedByStaffId: string;
  recordedByName: string;
  remarks?: string;
  parentNotified: boolean;
  parentExplanation?: string;
  updatedAt?: string;
}

export type IncidentCategory =
  | 'ILLNESS'
  | 'ACCIDENT'
  | 'INJURY'
  | 'EMERGENCY'
  | 'OTHER';

export type IncidentPriority = 'ROUTINE' | 'URGENT' | 'EMERGENCY';

export type ContactAttemptStatus =
  | 'PENDING'
  | 'ATTEMPTED'
  | 'REACHED'
  | 'UNREACHABLE'
  | 'ESCALATED'
  | 'ACKNOWLEDGED';

export type IncidentOutcome =
  | 'RETURNED_TO_CLASS'
  | 'RESTING_IN_INFIRMARY'
  | 'PICKED_UP_BY_GUARDIAN'
  | 'REFERRED_TO_HOSPITAL'
  | 'UNDER_OBSERVATION';

export interface HealthIncident {
  id: string;
  schoolId: string;
  referenceNumber: string; // e.g. "EMG-2026-0042"
  studentId: string;
  studentName: string;
  studentClass: string;
  date: string;
  time: string;
  category: IncidentCategory;
  priority: IncidentPriority;
  symptoms: string;
  observations: string;
  temperature?: string;
  pulse?: string;
  actionsTaken: string;
  responsibleStaffName: string;
  guardianId?: string;
  guardianName: string;
  guardianPhone: string;
  contactStatus: ContactAttemptStatus;
  parentAcknowledged: boolean;
  parentAcknowledgedAt?: string;
  parentResponseNotes?: string;
  handoverArrangement?: string;
  medicalReferral?: string; // e.g. "Rubengera Health Center"
  outcome: IncidentOutcome;
  resolved: boolean;
  createdAt: string;
  timeline: {
    time: string;
    action: string;
    actor: string;
  }[];
}

export type NotificationChannel = 'SMS' | 'WHATSAPP' | 'EMAIL' | 'IN_APP';

export type NotificationCategory =
  | 'EMERGENCY'
  | 'HEALTH'
  | 'ATTENDANCE'
  | 'ACADEMIC'
  | 'FEES'
  | 'MEETINGS'
  | 'ANNOUNCEMENTS'
  | 'TIMETABLE'
  | 'GENERAL';

export type DeliveryStatus =
  | 'QUEUED'
  | 'SENDING'
  | 'SENT'
  | 'DELIVERED'
  | 'FAILED'
  | 'ACKNOWLEDGED';

export interface NotificationMessage {
  id: string;
  schoolId: string;
  recipientId: string;
  recipientName: string;
  recipientPhone: string;
  recipientEmail?: string;
  channel: NotificationChannel;
  category: NotificationCategory;
  priority: 'ROUTINE' | 'URGENT' | 'EMERGENCY';
  titleEn: string;
  titleRw: string;
  contentEn: string;
  contentRw: string;
  status: DeliveryStatus;
  provider?: string;
  providerReference?: string;
  errorMessage?: string;
  acknowledgedAt?: string;
  scheduledFor?: string;
  createdAt: string;
  relatedEntityId?: string;
}

export interface AcademicClass {
  id: string;
  schoolId: string;
  name: string; // "Level 4 SOD A", "Y1 Accounting"
  grade: string;
  stream: string;
  combination: string;
  classTeacherName: string;
  room: string;
  studentCount: number;
  /** Lifecycle state. Archived classes remain available for historical records. */
  status?: 'ACTIVE' | 'INACTIVE' | 'ARCHIVED';
  archivedAt?: string;
  archivedBy?: string;
  combinationId?: string;
  /** Managed academic structure links (additive; legacy classes stay valid). */
  code?: string;
  academicYearId?: string;
  levelId?: string;
  classTeacherId?: string;
}

export interface Subject {
  id: string;
  schoolId: string;
  name: string;
  code: string;
  department: string;
  credits: number;
  passMark: number;
  /** Archived subjects can never be selected for new marks assessments. */
  status?: 'ACTIVE' | 'INACTIVE' | 'ARCHIVED';
  combinationIds?: string[];
  levelIds?: string[];
  archivedAt?: string;
}

/** School-managed class level (Level 3/4/5, Y1/Y2/Y3, or any school level). */
export interface ClassLevel {
  id: string;
  schoolId: string;
  name: string;
  code: string;
  description?: string;
  academicProgramme?: string;
  combinationIds: string[];
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Assessment {
  id: string;
  schoolId: string;
  classId: string;
  subjectId: string;
  subjectName: string;
  term: string;
  name: string; // "CAT 1", "CAT 2", "Terminal Exam"
  maxMarks: number;
  weightPercentage: number;
  date: string;
}

export interface StudentMark {
  id: string;
  assessmentId: string;
  studentId: string;
  studentName: string;
  score: number;
  maxScore: number;
  percentage: number;
  grade: string; // 'A' | 'B' | 'C' | 'D' | 'F'
  comment?: string;
}

export interface ReportCardSubjectRow {
  subjectName: string;
  subjectCode: string;
  catScore: number;
  catMax: number;
  examScore: number;
  examMax: number;
  totalPercent: number;
  grade: string;
  rankInClass: number;
  teacherComment: string;
  // Configurable assessment breakdown. catScore/catMax remain the canonical
  // coursework values so existing seeded report cards keep working.
  courseworkScore?: number;
  courseworkMax?: number;
  testScore?: number;
  testMax?: number;
  totalMarks?: number;
  percentage?: number;
  teacherName?: string;
}

export interface ReportCard {
  id: string;
  schoolId: string;
  studentId: string;
  studentName: string;
  admissionNumber: string;
  className: string;
  combination: string;
  academicYear: string;
  term: string;
  classId?: string;
  subjects: ReportCardSubjectRow[];
  overallAverage: number;
  overallGrade?: string;
  overallRank: number;
  totalStudentsInClass: number;
  attendanceDaysPresent: number;
  attendanceTotalDays: number;
  conductScore: string; // e.g. "40 / 40 (Excellent / Imyitwarire Myiza)"
  classTeacherRemarks: string;
  headTeacherRemarks: string;
  isApproved: boolean;
  publishedAt?: string;
  publishedBy?: string;
  generatedAt?: string;
  generatedBy?: string;
  approvedAt?: string;
  approvedBy?: string;
  issueDate?: string;
  classTeacherName?: string;
  headTeacherName?: string;
  conductRemarks?: string;
  strengths?: string;
  areasForImprovement?: string;
  promotionDecision?: string;
  sourceSubmissionIds?: string[];
  status?: 'DRAFT' | 'APPROVED' | 'PUBLISHED';
  /** Academic context snapshot captured when the card is generated. */
  programme?: string;
  educationLevel?: string;
  academicLevel?: string;
}

export interface FeeStructure {
  id: string;
  schoolId: string;
  title: string;
  academicYear: string;
  term: string;
  classIds: string[];
  amountRwf: number;
  description: string;
  dueDate: string;
}

export interface Invoice {
  id: string;
  schoolId: string;
  invoiceNumber: string; // "INV-2026-0045"
  studentId: string;
  studentName: string;
  className: string;
  term: string;
  title: string;
  totalAmountRwf: number;
  paidAmountRwf: number;
  balanceRwf: number;
  dueDate: string;
  status: 'PENDING' | 'PARTIAL' | 'PAID' | 'OVERDUE';
  createdAt: string;
}

export interface Payment {
  id: string;
  schoolId: string;
  invoiceId: string;
  receiptNumber: string; // "REC-2026-0098"
  studentId: string;
  studentName: string;
  amountRwf: number;
  method: 'MTN_MOMO' | 'AIRTEL_MONEY' | 'BANK_TRANSFER' | 'CASH';
  reference: string;
  payerName: string;
  payerPhone: string;
  status: 'COMPLETED' | 'PENDING' | 'FAILED';
  date: string;
}

export interface StaffMember {
  id: string;
  schoolId: string;
  staffId: string; // e.g. "STF-014"
  firstName?: string;
  lastName?: string;
  fullName: string;
  gender: 'M' | 'F';
  role: UserRole;
  title: string; // "Head of Software Department", "School Nurse", etc.
  department: string;
  phone: string;
  email: string;
  assignedClasses: string[];
  assignedSubjects: string[];
  status: 'ACTIVE' | 'ON_LEAVE' | 'SUSPENDED' | 'ARCHIVED';
  joinedDate: string;
  photoUrl?: string;
  responsibilities?: string[];
  employmentStartDate?: string;
  archivedAt?: string;
  archivedBy?: string;
  archiveReason?: string;
}

export type StaffAccountStatus = 'ACTIVE' | 'INVITED' | 'SUSPENDED' | 'ARCHIVED';

export interface StaffAccount {
  id: string;
  userId: string;
  schoolId: string;
  role: UserRole;
  professionalTitle: string;
  department: string;
  status: StaffAccountStatus;
  delegatedPermissions: string[];
  delegatedRoleScope?: UserRole[];
  staffId?: string;
  phone?: string;
  gender?: 'M' | 'F';
  photoUrl?: string;
  responsibilities?: string[];
  employmentStartDate?: string;
  createdAt: string;
  createdBy: string;
  invitedAt?: string;
  acceptedAt?: string;
  archivedAt?: string;
  archivedBy?: string;
  archiveReason?: string;
  archivedFromStatus?: StaffAccountStatus;
  lastModifiedBy?: string;
  lastModifiedAt?: string;
}

export type StaffInvitationDeliveryMode = 'INVITATION' | 'SECURE_ACTIVATION';

export interface StaffInvitation {
  id: string;
  schoolId: string;
  fullName: string;
  email: string;
  phone?: string;
  gender?: 'M' | 'F';
  role: UserRole;
  professionalTitle: string;
  department?: string;
  staffId?: string;
  photoUrl?: string;
  responsibilities?: string[];
  employmentStartDate?: string;
  deliveryMode?: StaffInvitationDeliveryMode;
  notificationStatuses?: AdmissionNotificationStatus[];
  tokenHash: string;
  expiresAt: string;
  createdAt: string;
  createdBy: string;
  consumedAt?: string;
  revokedAt?: string;
  userId?: string;
  resentAt?: string;
}

export interface PermissionGrantRecord {
  id: string;
  schoolId: string;
  userId: string;
  previousPermissions: string[];
  permissions: string[];
  previousRoleScope?: UserRole[];
  roleScope?: UserRole[];
  grantedBy: string;
  grantedAt: string;
  revokedAt?: string;
  revokedBy?: string;
}

/** Reusable permission template owned by one school. Assigning a group copies
 * its permissions through the normal delegation checks; it is never a hidden
 * source of authority. */
export interface PermissionGroup {
  id: string;
  schoolId: string;
  name: string;
  description?: string;
  permissions: string[];
  roleScope?: UserRole[];
  createdBy: string;
  createdAt: string;
  updatedBy?: string;
  updatedAt?: string;
  archivedAt?: string;
  archivedBy?: string;
}

export interface StaffSummary {
  total: number;
  active: number;
  pendingInvitations: number;
  suspended: number;
  archived: number;
  delegatedAdministrators: number;
  byRole: Record<Extract<UserRole, 'DEPUTY_HEAD' | 'TEACHER' | 'NURSE' | 'ACCOUNTANT' | 'DISCIPLINE_OFFICER' | 'SCHOOL_IT' | 'ANIMATEUR'>, number>;
}

export interface StaffDirectoryItem {
  accountId: string;
  userId: string;
  staffId: string;
  fullName: string;
  email: string;
  phone: string;
  role: UserRole;
  professionalTitle: string;
  department: string;
  gender?: 'M' | 'F';
  photoUrl?: string;
  responsibilities: string[];
  employmentStartDate?: string;
  accountStatus: StaffAccountStatus;
  employmentStatus: 'ACTIVE' | 'ON_LEAVE' | 'SUSPENDED' | 'ARCHIVED';
  isActive: boolean;
  dateAdded: string;
  delegatedPermissions: string[];
  delegatedRoleScope: UserRole[];
  invitedAt?: string;
  acceptedAt?: string;
  archivedAt?: string;
  lastLogin?: string;
}

export interface StaffDirectoryResponse {
  items: StaffDirectoryItem[];
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
}

export interface PermissionDefinition {
  code: string;
  legacyCode: string;
  labelKey: string;
  restricted: boolean;
}

export interface PermissionsResponse {
  role: UserRole;
  effectivePermissions: string[];
  delegatablePermissions: string[];
  leaderOnlyDelegatablePermissions: string[];
  delegatableRoleScope: UserRole[];
  rolePermissions: Record<UserRole, string[]>;
  catalog: PermissionDefinition[];
}

/** Server-authoritative session view used by login and session restore. */
export interface AuthSessionResponse {
  user: UserProfile | null;
  defaultDashboard: string;
  dashboardUrl: string;
}

export interface StaffAccountView extends StaffAccount {
  user?: {
    id: string;
    fullName: string;
    email: string;
    role: UserRole;
    phone: string;
    isActive?: boolean;
    lastLogin?: string;
    delegatedPermissions?: string[];
    delegatedRoleScope?: UserRole[];
  } | null;
  staffMember?: StaffMember | null;
}

export interface StaffInvitationResponse {
  invitation: StaffInvitation;
  token: string;
  activationUrl: string;
  delivery: AdmissionNotificationStatus[];
  deliveryPending: boolean;
}

export type SignupRole = 'PARENT' | 'STUDENT';
export type SignupContactType = 'EMAIL' | 'SMS' | 'MANUAL';

export interface PortalDashboardView {
  students: Student[];
  healthIncidents: HealthIncident[];
  attendance: AttendanceRecord[];
  invoices: Invoice[];
  payments: Payment[];
  reportCards: ReportCard[];
  timetable: TimetableEntry[];
  homework: HomeworkAssignment[];
}

export interface SignupRequestView {
  id: string;
  role: SignupRole;
  fullName: string;
  phone: string;
  email: string | null;
  signInEmail: string;
  admissionNumber: string;
  status: 'PENDING' | 'VERIFIED' | 'APPROVED' | 'REJECTED' | 'EXPIRED';
  contactType: SignupContactType;
  verificationSent: boolean;
  requiresManualReview: boolean;
  message: string;
  createdAt: string;
}

export type PublicArticleCategory = 'NEWS' | 'ANNOUNCEMENT' | 'EVENT';
export type PublicArticleStatus = 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';

export interface PublicContentArticleInput {
  title: string;
  summary: string;
  body: string;
  category: PublicArticleCategory;
  status: PublicArticleStatus;
  approved: boolean;
  publishAt?: string;
  eventDate?: string;
  location?: string;
  imageUrl?: string;
  imageAlt?: string;
}

export interface PublicContentArticle extends PublicContentArticleInput {
  id: string;
  slug: string;
  createdAt: string;
  updatedAt: string;
  publishedAt?: string;
  createdBy: string;
}

export interface PublicContentGalleryImage {
  id: string;
  src: string;
  alt: string;
  caption: string;
  category: string;
  approved: boolean;
  createdAt: string;
  createdBy: string;
}

export interface TimetableEntry {
  id: string;
  schoolId: string;
  classId: string;
  className: string;
  dayOfWeek: 'MON' | 'TUE' | 'WED' | 'THU' | 'FRI';
  startTime: string;
  endTime: string;
  subjectName: string;
  teacherName: string;
  room: string;
}

export interface HomeworkAssignment {
  id: string;
  schoolId: string;
  classId: string;
  className: string;
  subjectName: string;
  teacherName: string;
  title: string;
  description: string;
  assignedDate: string;
  dueDate: string;
  maxPoints: number;
  submissionsCount: number;
}

export interface SchoolEvent {
  id: string;
  schoolId: string;
  titleEn: string;
  titleRw: string;
  descriptionEn: string;
  descriptionRw: string;
  date: string;
  time: string;
  category: 'ACADEMIC' | 'SPORTS' | 'PARENT_MEETING' | 'HEALTH' | 'HOLIDAY';
  targetAudience: 'ALL' | 'PARENTS' | 'STUDENTS' | 'TEACHERS';
}

export interface AuditLogEntry {
  id: string;
  schoolId: string;
  userId: string;
  userName: string;
  userRole: UserRole;
  action: string;
  entityType: string;
  entityId: string;
  details: string;
  ipAddress: string;
  timestamp: string;
}

export interface MysqlStatus {
  connected: boolean;
  engine: string;
  host: string;
  port: number;
  database: string;
  user: string;
  tableCount?: number;
  error?: string;
  mode: 'MYSQL_LIVE' | 'FALLBACK_PERSISTENT_JSON';
}

// ==========================================
// ADMISSION SYSTEM TYPES
// ==========================================

export type ApplicationType = 'NEW_STUDENT_SENIOR4' | 'SCHOOL_TRANSFER' | 'OTHER_ADMISSION';

export type ApplicationStatus =
  | 'DRAFT'
  | 'SUBMITTED'
  | 'UNDER_REVIEW'
  | 'DOCUMENTS_REQUIRED'
  | 'ADDITIONAL_INFO_REQUIRED'
  | 'APPROVED'
  | 'REJECTED'
  | 'WAITLISTED';

// Result verification is intentionally separate from the application status.
export type ResultSlipVerificationStatus =
  | 'NOT_YET_VERIFIED'
  | 'UNDER_VERIFICATION'
  | 'VERIFIED'
  | 'VERIFICATION_FAILED'
  | 'ADDITIONAL_DOCUMENT_REQUIRED';

export interface AcademicResultSubject {
  id?: string;
  name: string;
  marks?: string;
  grade?: string;
}

/** Only values actually present on the original slip or entered by a reviewer/applicant. */
export interface AcademicPerformanceData {
  studentName?: string;
  examinationYear?: string;
  subjects: AcademicResultSubject[];
  total?: string;
  aggregate?: string;
  division?: string;
}

export interface ResultSlipVerificationEvent {
  id: string;
  applicationId: string;
  status: ResultSlipVerificationStatus;
  notes?: string;
  changedBy: string;
  changedByName: string;
  createdAt: string;
}

export interface Senior3ResultsRecord {
  applicationId: string;
  documentId?: string;
  resultSlipUploaded: boolean;
  slipWaived?: boolean;
  slipExceptionNote?: string;
  previousSchoolName?: string;
  academicYearCompleted?: string;
  senior3CompletionYear?: string;
  previousSchoolLocation?: string;
  requestedLevel?: string;
  requestedCombination?: string;
  ocrStatus: 'NOT_ATTEMPTED' | 'EXTRACTED' | 'UNAVAILABLE' | 'ERROR';
  ocrMessage?: string;
  ocrAt?: string;
  extracted?: AcademicPerformanceData;
  applicantReviewed?: AcademicPerformanceData;
  verifiedSummary?: AcademicPerformanceData;
  verificationStatus: ResultSlipVerificationStatus;
  verificationNotes?: string;
  verificationHistory: ResultSlipVerificationEvent[];
  verifiedBy?: string;
  verifiedByName?: string;
  verifiedAt?: string;
  createdAt: string;
  updatedAt: string;
}

/** Internal only: never serialized to public clients. */
export interface AdmissionSlipUpload {
  id: string;
  tokenHash: string;
  storagePath: string;
  originalFileName: string;
  fileMime: string;
  fileSize: number;
  createdAt: string;
  expiresAt: string;
  consumedAt?: string;
  replacedAt?: string;
  applicationId?: string;
  documentId?: string;
  ocrStatus: 'NOT_ATTEMPTED' | 'EXTRACTED' | 'UNAVAILABLE' | 'ERROR';
  ocrData?: AcademicPerformanceData;
  ocrMessage?: string;
}

export interface AdmissionDocumentCategory {
  key: string;
  label: string;
  active: boolean;
  required?: boolean;
  applicationTypes?: ApplicationType[];
}

export interface AdmissionSettings {
  resultSlipRequired: boolean;
  resultSlipExceptionNote?: string;
  documentCategories?: AdmissionDocumentCategory[];
  updatedAt?: string;
  updatedBy?: string;
}

/**
 * Structured "Previous Academic Background" captured on the public application.
 * Existing free-text fields on AdmissionApplication are preserved for history and
 * reports; this object is additive.
 */
export interface PreviousAcademicBackground {
  academicYearCompleted?: string;
  seniorCompletionYear?: string;
  previousCombination?: string;
  preferredCombination?: string;
  performanceMarks?: string;
  performanceGrade?: string;
  performanceDescription?: string;
  previousSchoolName?: string;
  previousSchoolLocation?: string;
  previousClassOrLevel?: string;
  schoolIdentification?: string;
  subjects: AcademicResultSubject[];
}

/** Temporary, private upload created before the application is submitted. */
export interface AdmissionDocumentUpload {
  id: string;
  tokenHash: string;
  documentType: string;
  applicationId?: string;
  documentId?: string;
  storagePath: string;
  originalFileName: string;
  fileMime: string;
  fileSize: number;
  createdAt: string;
  expiresAt: string;
  consumedAt?: string;
  replacedAt?: string;
}

export interface AdmissionDocumentAccessEvent {
  id: string;
  applicationId: string;
  documentId: string;
  actorId: string;
  actorName: string;
  actorRole: string;
  action: 'PREVIEW' | 'DOWNLOAD';
  ip?: string;
  createdAt: string;
}

export interface AdmissionReviewDecision {
  id: string;
  applicationId: string;
  decision: ApplicationStatus;
  reason?: string;
  requestedDocumentTypes?: string[];
  decidedBy: string;
  decidedByName: string;
  decidedByRole: string;
  createdAt: string;
}

export interface AdmissionDocument {
  id: string;
  applicationId: string;
  documentType: string;
  fileName: string;
  fileMime: string;
  fileSize: number;
  storagePath: string;
  uploadedAt: string;
}

export interface AdmissionReviewNote {
  id: string;
  applicationId: string;
  reviewerId: string;
  reviewerName: string;
  reviewerRole: string;
  note: string;
  createdAt: string;
}

export interface AdmissionStatusHistory {
  id: string;
  applicationId: string;
  fromStatus: ApplicationStatus | null;
  toStatus: ApplicationStatus;
  changedBy: string;
  changedByName: string;
  reason?: string;
  createdAt: string;
}

export interface AdmissionApplication {
  id: string;
  referenceNumber: string;
  schoolId: string;
  applicationType: ApplicationType;
  status: ApplicationStatus;
  academicYear: string;

  // Applicant information
  applicantFullName: string;
  applicantDob: string;
  applicantGender?: 'M' | 'F';
  applicantPhone: string;
  applicantEmail?: string;
  applicantDistrict: string;
  applicantSector?: string;
  applicantCell?: string;
  applicantResidence: string;

  // Guardian information
  guardianFullName: string;
  guardianPhone: string;
  guardianRelationship: string;

  // Type-specific fields
  previousSchoolName?: string;
  previousSchoolLocation?: string;
  academicYearCompleted?: string;
  senior3CompletionStatus?: string;
  previousCombination?: string;
  requestedLevel?: string;
  requestedCombination?: string;
  previousAcademicPerformance?: string;
  reasonForChoosingSchool?: string;

  // Transfer fields
  currentSchoolName?: string;
  currentSchoolLocation?: string;
  currentClass?: string;
  currentLevel?: string;
  transferAcademicYear?: string;
  requestedClass?: string;
  previousSchoolType?: string;
  transferReason?: string;
  transferReasonOther?: string;

  // Other admission fields
  currentEducationLevel?: string;
  requestedEducationLevel?: string;
  previousSchoolOther?: string;
  applicationReason?: string;

  // Metadata
  submittedAt: string;
  reviewedAt?: string;
  reviewedBy?: string;
  reviewedByName?: string;
  reviewNotes?: string;
  rejectionReason?: string;
  senior3Results?: Senior3ResultsRecord;
  academicBackground?: PreviousAcademicBackground;
  documents: AdmissionDocument[];
  documentAccessHistory?: AdmissionDocumentAccessEvent[];
  reviewDecisions?: AdmissionReviewDecision[];
  reviewHistory: AdmissionReviewNote[];
  statusHistory: AdmissionStatusHistory[];
}

// Public application tracking (no account required)
export interface AdmissionVerification {
  id: string;
  applicationId: string;
  referenceNumber: string;
  contactHash: string;
  codeHash: string;
  expiresAt: string;
  attempts: number;
  createdAt: string;
  consumedAt?: string;
}

export interface AdmissionTrackingSummary {
  referenceNumber: string;
  applicationType: ApplicationType;
  submittedAt: string;
  status: ApplicationStatus;
  schoolResponse?: string;
}

export interface AdmissionNotificationStatus {
  channel: 'email' | 'sms';
  configured: boolean;
  sent: boolean;
  detail?: string;
}

// ============================================================
// ACADEMIC MANAGEMENT (marks, results, approval, report cards)
// These types are additive. Existing academic records are untouched.
// ============================================================

export interface AcademicYear {
  id: string;
  schoolId: string;
  name: string;
  startDate?: string;
  endDate?: string;
  isActive: boolean;
  createdAt: string;
}

export interface AcademicTerm {
  id: string;
  schoolId: string;
  academicYearId: string;
  name: string;
  startDate?: string;
  endDate?: string;
  isActive: boolean;
  createdAt: string;
}

export interface ClassSubjectAssignment {
  id: string;
  schoolId: string;
  academicYearId: string;
  termId: string;
  classId: string;
  subjectId: string;
  teacherIds: string[];
  isActive: boolean;
  createdAt: string;
  /** Structure context recorded at assignment time so filters stay consistent. */
  combinationId?: string;
  levelId?: string;
  createdBy?: string;
  updatedAt?: string;
  history?: AcademicWorkflowEvent[];
}

/** Teacher-facing/admin-facing assignment with resolved structure names. */
export interface ClassSubjectAssignmentView extends ClassSubjectAssignment {
  combinationName: string;
  levelName: string;
  className: string;
  subjectName: string;
  subjectCode: string;
  teacherNames: string[];
}

export interface ClassTeacherAssignment {
  id: string;
  schoolId: string;
  academicYearId: string;
  classId: string;
  teacherId: string;
  createdAt: string;
}

export interface AssessmentCategory {
  id: string;
  schoolId: string;
  code: string;
  name: string;
  maxMarks: number;
  weightPercentage: number;
  sortOrder: number;
  isActive: boolean;
  createdAt: string;
}

export interface GradeBoundary {
  grade: string;
  minPercentage: number;
  maxPercentage: number;
  description: string;
  descriptionRw?: string;
}

export interface GradingScale {
  id: string;
  schoolId: string;
  name: string;
  passMark: number;
  gradeBoundaries: GradeBoundary[];
  isActive: boolean;
  createdAt: string;
}

export interface AcademicSettings {
  schoolId: string;
  academicYearId?: string;
  termId?: string;
  gradingScaleId?: string;
  enableRanking: boolean;
  enablePromotionDecision: boolean;
  promotionPassAverage?: number;
  commentsRequiredBeforeApproval?: boolean;
  submissionDeadlineDays?: number;
  allowSelfApproval?: boolean;
  updatedAt?: string;
}

export type MarkAttendanceStatus = 'PRESENT' | 'ABSENT' | 'EXCUSED';

export interface MarkEntry {
  id: string;
  schoolId: string;
  academicYearId: string;
  termId: string;
  classId: string;
  subjectId: string;
  studentId: string;
  categoryId: string;
  score: number | null;
  attendanceStatus: MarkAttendanceStatus;
  remark?: string;
  updatedBy: string;
  updatedAt: string;
}

export type MarkSubmissionStatus = 'DRAFT' | 'SUBMITTED' | 'UNDER_REVIEW' | 'APPROVED' | 'RETURNED';

export interface AcademicWorkflowEvent {
  action: string;
  by: string;
  byName: string;
  role: string;
  at: string;
  note?: string;
}

export interface MarkSubmission {
  id: string;
  schoolId: string;
  academicYearId: string;
  termId: string;
  classId: string;
  subjectId: string;
  teacherId: string;
  status: MarkSubmissionStatus;
  submittedAt?: string;
  reviewedAt?: string;
  reviewedBy?: string;
  reviewedByName?: string;
  reviewNotes?: string;
  approvedAt?: string;
  approvedBy?: string;
  returnedAt?: string;
  correctionReason?: string;
  history: AcademicWorkflowEvent[];
  createdAt: string;
  updatedAt: string;
}

export interface AcademicSubjectResult {
  subjectId: string;
  subjectName: string;
  subjectCode: string;
  teacherName: string;
  categories: Array<{
    categoryId: string;
    code: string;
    name: string;
    score: number | null;
    maxMarks: number;
    weightPercentage: number;
    attendanceStatus: MarkAttendanceStatus;
  }>;
  courseworkScore: number;
  courseworkMax: number;
  testScore: number;
  testMax: number;
  examScore: number;
  examMax: number;
  totalMarks: number;
  percentage: number;
  grade: string;
  gradeDescription: string;
  remark: string;
  rankInClass: number;
  isComplete: boolean;
}

export interface StudentResult {
  studentId: string;
  studentName: string;
  admissionNumber: string;
  classId: string;
  subjects: AcademicSubjectResult[];
  totalMarks: number;
  average: number;
  grade: string;
  gradeDescription: string;
  rank: number;
  isComplete: boolean;
}

export interface CalculationResult {
  students: StudentResult[];
  missing: MissingAcademicRequirement[];
  classAverage: number;
  subjectPerformance: Array<{
    subjectId: string;
    subjectName: string;
    average: number;
    highest: number;
    lowest: number;
    passRate: number;
    studentCount: number;
  }>;
  categories: AssessmentCategory[];
  scale?: GradingScale;
}

export interface MissingAcademicRequirement {
  studentId: string;
  studentName: string;
  subjectId: string;
  subjectName: string;
  categoryId?: string;
  categoryName?: string;
  reason: string;
}

export interface SubjectPerformanceSummary {
  subjectId: string;
  subjectName: string;
  average: number;
  highest: number;
  lowest: number;
  passRate: number;
  studentCount: number;
}

export interface AcademicProgressPoint {
  label: string;
  average: number;
}

export type ReportDistributionStatus = 'NOT_GENERATED' | 'GENERATED' | 'PRINTED' | 'ISSUED' | 'COLLECTED';

export interface ReportDistribution {
  id: string;
  schoolId: string;
  reportCardId: string;
  studentId: string;
  studentName: string;
  className: string;
  academicYear: string;
  term: string;
  status: ReportDistributionStatus;
  generatedAt?: string;
  printedAt?: string;
  issuedAt?: string;
  issuedToName?: string;
  issuedToRelationship?: string;
  collectedAt?: string;
  collectedByName?: string;
  staffId: string;
  staffName: string;
  notes?: string;
  history: AcademicWorkflowEvent[];
  createdAt: string;
  updatedAt: string;
}

// ============================================================
// COMBINATION MANAGEMENT (school-scoped academic programmes)
// Additive: existing free-text `combination` fields remain valid.
// ============================================================

export type CombinationStatus = 'ACTIVE' | 'INACTIVE' | 'ARCHIVED';

export interface CombinationSubject {
  subjectId: string;
  isRequired: boolean;
  teacherIds: string[];
}

export interface AcademicCombination {
  id: string;
  schoolId: string;
  name: string;
  code: string;
  educationLevel: string;
  academicProgramme: string;
  description?: string;
  academicYear: string;
  status: CombinationStatus;
  subjects: CombinationSubject[];
  classIds: string[];
  teacherIds: string[];
  classTeacherId?: string;
  department?: string;
  maxCapacity?: number;
  notes?: string;
  createdAt: string;
  updatedAt: string;
  archivedAt?: string;
  archivedBy?: string;
  archiveReason?: string;
}

export interface CombinationView extends AcademicCombination {
  studentCount: number;
  classes: Array<{ id: string; name: string; grade: string; status?: string }>;
  subjectDetails: Array<CombinationSubject & { name: string; code: string; department: string; teacherNames: string[] }>;
  teacherDetails: Array<{ id: string; fullName: string; role: string }>;
  classTeacher?: { id: string; fullName: string };
}

export interface CreateCombinationInput {
  name: string;
  code: string;
  educationLevel: string;
  academicProgramme: string;
  description?: string;
  academicYear: string;
  status?: CombinationStatus;
  subjects?: CombinationSubject[];
  classIds?: string[];
  teacherIds?: string[];
  classTeacherId?: string;
  department?: string;
  maxCapacity?: number;
  notes?: string;
}

export type AcademicCollectionKey =
  | 'combinations'
  | 'classes'
  | 'subjects'
  | 'classLevels'
  | 'academicYears'
  | 'terms'
  | 'classSubjectAssignments'
  | 'classTeacherAssignments'
  | 'assessmentCategories'
  | 'gradingScales'
  | 'marks'
  | 'markSubmissions'
  | 'reportDistributions'
  | 'academicSettings';

// --- SchoolCare AI Assistant ---
export type AiIntent =
  | 'general'
  | 'student_count'
  | 'attendance_summary'
  | 'academic_summary'
  | 'my_results'
  | 'announcements'
  | 'finance_summary'
  | 'insights'
  | 'knowledge';

export interface AiSource {
  title: string;
  kind: 'DATABASE' | 'DOCUMENT';
  detail?: string;
}

export interface AiMessage {
  id: string;
  conversationId: string;
  role: 'user' | 'assistant';
  content: string;
  sources: AiSource[];
  language: LanguageCode;
  createdAt: string;
  feedback?: 'helpful' | 'not_helpful';
}

export interface AiConversation {
  id: string;
  title: string;
  language: LanguageCode;
  createdAt: string;
  updatedAt: string;
  messages?: AiMessage[];
  feedback?: Record<string, 'helpful' | 'not_helpful'>;
}

export interface AiStatus {
  provider: string;
  providerSupported?: boolean;
  model: string;
  modelSource?: 'GEMINI_MODEL' | 'AI_MODEL' | 'default';
  enabled: boolean;
  available: boolean;
  reason?: string;
  defaultLanguage: LanguageCode;
  rateLimitPerHour: number;
  retentionDays: number;
  suggestions: string[];
  capabilities: number;
}

export interface AiSettings {
  schoolId: string;
  isEnabled: boolean;
  model: string;
  defaultLanguage: LanguageCode;
  rateLimitPerHour: number;
  retentionDays: number;
  allowedRoles: UserRole[] | null;
  permittedTools: AiIntent[] | null;
  updatedBy: string;
  updatedAt: string;
}

export interface AiKnowledgeDocument {
  id: string;
  schoolId: string;
  title: string;
  category: string;
  visibility: 'SCHOOL' | 'SHARED';
  fileName: string;
  mimeType: string;
  content: string;
  status: 'PROCESSING' | 'READY' | 'ARCHIVED';
  uploadedBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface AiChatResponse {
  conversationId: string;
  messages: AiMessage[];
  language: LanguageCode;
  intent: AiIntent;
  notice?: string;
}

export interface AiUsageStats {
  days: number;
  rows: Array<{
    status: 'OK' | 'ERROR';
    action: string;
    errorCode: string | null;
    count: number;
    averageLatencyMs: number;
  }>;
  errors: Array<{
    id: string | number;
    action: string;
    errorCode: string | null;
    model: string;
    createdAt: string;
  }>;
}

/** A single item in the central Headteacher Approval Center. */
export interface HeadteacherApprovalItem {
  id: string;
  type: 'ADMISSION' | 'MARKS' | 'REPORT_CARD' | 'SIGNUP' | 'STAFF_REQUEST' | 'FINANCE';
  title: string;
  detail: string;
  status: string;
  createdAt: string;
  tab: string;
  permission: string;
}

/** A plain-language action item shown in "Needs Your Attention". */
export interface HeadteacherAttentionItem {
  id: string;
  category: string;
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
  title: string;
  whatHappened: string;
  whyItMatters: string;
  actionNeeded: string;
  responsible: string;
  dueAt: string | null;
  status: string;
  tab: string;
  permission: string;
}

/** Server-authoritative summary used by the Headteacher dashboard. */
export interface HeadteacherDashboardView {
  generatedAt: string;
  schoolId: string;
  schoolName: string;
  currentTerm: string | null;
  academicPeriod: {
    academicYear: string | null;
    term: string | null;
    source: string;
  };
  totals: {
    students: number;
    staff: number;
    teachers: number;
    parents: number;
    activeClasses: number;
    archivedStudents: number;
    pendingAdmissions: number;
    publishedResults: number;
    pendingAcademicApprovals: number;
  };
  attendance: {
    date: string;
    total: number;
    present: number;
    absent: number;
    late: number;
    rate: number | null;
  };
  academics: {
    evaluated: number;
    average: number | null;
    passRate: number | null;
    gradeDistribution: Record<string, number>;
  };
  performance: {
    attendanceTrend: Array<{ date: string; present: number; total: number; rate: number | null }>;
    classPerformance: Array<{
      className: string;
      evaluated: number;
      average: number | null;
      passRate: number | null;
    }>;
    examinationCompletion: {
      total: number;
      draft: number;
      submitted: number;
      approved: number;
      returned: number;
    };
    staffTaskCompletion: { total: number; activated: number; pending: number } | null;
  };
  approvals: {
    total: number;
    byType: Record<string, number>;
    items: HeadteacherApprovalItem[];
  };
  attention: {
    total: number;
    items: HeadteacherAttentionItem[];
  };
  activities: AuditLogEntry[];
  notifications: NotificationMessage[];
  events: SchoolEvent[];
  health: { urgent: number; total: number } | null;
  finance: { billed: number; collected: number; outstanding: number } | null;
  discipline: { openRecords: number } | null;
}

