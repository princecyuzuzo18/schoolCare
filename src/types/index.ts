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
  fullName: string;
  role: UserRole;
  phone: string;
  avatarUrl: string;
  preferredLanguage: LanguageCode;
  isActive?: boolean;
  delegatedPermissions?: string[];
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
  enrollmentStatus: 'ACTIVE' | 'TRANSFERRED' | 'GRADUATED' | 'SUSPENDED';
  admissionDate: string;
  bloodGroup?: string;
  allergies?: string;
  medicalNotes?: string;
  photoUrl: string;
  nationalId?: string;
  previousSchool?: string;
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
  name: string; // "Level 4 SOD A"
  grade: string;
  stream: string;
  combination: string;
  classTeacherName: string;
  room: string;
  studentCount: number;
}

export interface Subject {
  id: string;
  schoolId: string;
  name: string;
  code: string;
  department: string;
  credits: number;
  passMark: number;
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
  subjects: {
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
  }[];
  overallAverage: number;
  overallRank: number;
  totalStudentsInClass: number;
  attendanceDaysPresent: number;
  attendanceTotalDays: number;
  conductScore: string; // e.g. "40 / 40 (Excellent / Imyitwarire Myiza)"
  classTeacherRemarks: string;
  headTeacherRemarks: string;
  isApproved: boolean;
  publishedAt?: string;
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
  fullName: string;
  gender: 'M' | 'F';
  role: UserRole;
  title: string; // "Head of Software Department", "School Nurse", etc.
  department: string;
  phone: string;
  email: string;
  assignedClasses: string[];
  assignedSubjects: string[];
  status: 'ACTIVE' | 'ON_LEAVE' | 'SUSPENDED';
  joinedDate: string;
}

export type StaffAccountStatus = 'ACTIVE' | 'INVITED' | 'SUSPENDED';

export interface StaffAccount {
  id: string;
  userId: string;
  schoolId: string;
  role: UserRole;
  professionalTitle: string;
  department: string;
  status: StaffAccountStatus;
  delegatedPermissions: string[];
  createdAt: string;
  createdBy: string;
  invitedAt?: string;
  acceptedAt?: string;
  lastModifiedBy?: string;
  lastModifiedAt?: string;
}

export interface StaffInvitation {
  id: string;
  schoolId: string;
  fullName: string;
  email: string;
  gender?: 'M' | 'F';
  role: UserRole;
  professionalTitle: string;
  department?: string;
  tokenHash: string;
  expiresAt: string;
  createdAt: string;
  createdBy: string;
  consumedAt?: string;
  revokedAt?: string;
  userId?: string;
}

export interface PermissionGrantRecord {
  id: string;
  schoolId: string;
  userId: string;
  previousPermissions: string[];
  permissions: string[];
  grantedBy: string;
  grantedAt: string;
  revokedAt?: string;
  revokedBy?: string;
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
  rolePermissions: Record<UserRole, string[]>;
  catalog: PermissionDefinition[];
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
  } | null;
}

export interface StaffInvitationResponse {
  invitation: StaffInvitation;
  token: string;
  activationUrl: string;
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
  | 'SUBMITTED'
  | 'UNDER_REVIEW'
  | 'ADDITIONAL_INFO_REQUIRED'
  | 'APPROVED'
  | 'REJECTED';

// Result verification is intentionally separate from the application status.
export type ResultSlipVerificationStatus =
  | 'NOT_YET_VERIFIED'
  | 'UNDER_VERIFICATION'
  | 'VERIFIED'
  | 'VERIFICATION_FAILED'
  | 'ADDITIONAL_DOCUMENT_REQUIRED';

export interface AcademicResultSubject {
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

export interface AdmissionSettings {
  resultSlipRequired: boolean;
  resultSlipExceptionNote?: string;
  updatedAt?: string;
  updatedBy?: string;
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
  documents: AdmissionDocument[];
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

