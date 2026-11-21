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
  UserRole,
  MysqlStatus,
  AdmissionApplication,
  AdmissionNotificationStatus,
  AdmissionTrackingSummary,
  ApplicationStatus,
  ApplicationType,
  AdmissionReviewNote,
  AdmissionSettings,
  AcademicPerformanceData,
  ResultSlipVerificationEvent,
  ResultSlipVerificationStatus,
  PermissionsResponse,
  PermissionGrantRecord,
  PermissionGroup,
  AuthSessionResponse,
  StaffAccountView,
  StaffInvitationResponse,
  StaffInvitation,
  StaffSummary,
  StaffDirectoryResponse,
  StaffDirectoryItem,
  SignupRequestView,
  PortalDashboardView,
  PublicContentArticle,
  PublicContentArticleInput,
  PublicContentGalleryImage,
  LanguageCode,
  AcademicYear,
  AcademicTerm,
  ClassSubjectAssignment,
  AssessmentCategory,
  GradingScale,
  MarkEntry,
  MarkSubmission,
  AcademicSettings,
  ReportDistribution,
  StudentResult,
  CalculationResult,
  AcademicSubjectResult,
  MissingAcademicRequirement
} from '../types';

const API_BASE = '/api';

export class ApiError extends Error {
  constructor(message: string, public readonly status: number) {
    super(message);
    this.name = 'ApiError';
  }
}

export interface MarksEntryView {
  year: AcademicYear;
  term: AcademicTerm;
  classInfo?: AcademicClass;
  subject?: Subject;
  categories: AssessmentCategory[];
  students: Array<Student & { result?: StudentResult }>;
  marks: MarkEntry[];
  submission: MarkSubmission | null;
  missing: MissingAcademicRequirement[];
  canEdit: boolean;
  isComplete: boolean;
}

export interface AcademicDashboardView {
  totals: {
    assignments: number;
    myAssignments: number;
    draft: number;
    submitted: number;
    approved: number;
    returned: number;
    publishedReports: number;
    incompleteReports: number;
  };
  submissions: Array<MarkSubmission & { subjectName?: string; className?: string; teacherName?: string }>;
  notSubmitted: Array<MarkSubmission & { subjectName?: string; className?: string; teacherName?: string }>;
  classAverages: Array<{ classId: string; className: string; average: number }>;
  year?: AcademicYear;
  term?: AcademicTerm;
}

export interface ReportPrintData {
  school?: School;
  academicYear?: AcademicYear;
  term?: AcademicTerm;
  settings: AcademicSettings;
  cards: Array<ReportCard & { attendance?: { present: number; total: number }; distribution?: string }>;
  total: number;
}

export interface ResultSlipExtraction {
  status: 'EXTRACTED' | 'UNAVAILABLE' | 'ERROR' | 'NOT_ATTEMPTED';
  data?: AcademicPerformanceData | null;
  message?: string | null;
}

export interface ResultSlipUploadResponse {
  uploadToken: string;
  fileName: string;
  fileSize: number;
  fileMime: string;
  expiresAt: string;
  extracted: ResultSlipExtraction;
}

class ApiService {
  private async request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    const headers = {
      'Content-Type': 'application/json',
      ...(options.headers || {})
    };

    const res = await fetch(`${API_BASE}${endpoint}`, {
      ...options,
      headers,
      credentials: 'same-origin'
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: `HTTP ${res.status}: ${res.statusText}` }));
      if (
        res.status === 401 &&
        !['/auth/login', '/auth/me', '/auth/password-reset/request', '/staff/invitations/activate'].includes(endpoint) &&
        !endpoint.startsWith('/public/admissions/')
      ) {
        window.dispatchEvent(new Event('schoolcare:session-expired'));
      }
      throw new ApiError(err.error || `HTTP ${res.status}`, res.status);
    }

    const contentType = res.headers.get('content-type') || '';
    if (!contentType.includes('application/json')) {
      const preview = (await res.text()).slice(0, 120).replace(/\s+/g, ' ').trim();
      throw new ApiError(
        `Expected JSON from ${endpoint} but received ${contentType || 'an unknown content type'}${preview ? `: ${preview}` : ''}`,
        res.status
      );
    }
    try {
      return await res.json() as T;
    } catch {
      throw new ApiError(`Invalid JSON response from ${endpoint}`, res.status);
    }
  }

  private async requestForm<T>(endpoint: string, formData: FormData): Promise<T> {
    const res = await fetch(`${API_BASE}${endpoint}`, {
      method: 'POST',
      body: formData,
      credentials: 'same-origin'
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: `HTTP ${res.status}: ${res.statusText}` }));
      throw new ApiError(err.error || `HTTP ${res.status}`, res.status);
    }
    const contentType = res.headers.get('content-type') || '';
    if (!contentType.includes('application/json')) {
      throw new ApiError(`Expected JSON from the upload endpoint but received ${contentType || 'an unknown content type'}.`, res.status);
    }
    return res.json();
  }

  private async requestBlob(endpoint: string, body: unknown): Promise<Blob> {
    const res = await fetch(`${API_BASE}${endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      credentials: 'same-origin'
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Network response was not ok' }));
      throw new ApiError(err.error || `HTTP ${res.status}`, res.status);
    }
    return res.blob();
  }

  // --- Auth ---
  public async login(email: string, password: string): Promise<AuthSessionResponse> {
    return this.request<AuthSessionResponse>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password })
    });
  }

  public async getMe(): Promise<AuthSessionResponse> {
    return this.request<AuthSessionResponse>('/auth/me');
  }

  public async logout(): Promise<void> {
    await this.request<{ success: boolean }>('/auth/logout', { method: 'POST' });
  }

  public async requestPasswordReset(email: string): Promise<{ error?: string; message?: string }> {
    return this.request<{ error?: string; message?: string }>('/auth/password-reset/request', {
      method: 'POST',
      body: JSON.stringify({ email })
    });
  }

  // --- Parent and student self-service sign-up ---

  public async submitParentSignup(data: {
    fullName: string;
    phone: string;
    email: string;
    password: string;
    confirmPassword: string;
    admissionNumber: string;
    admissionNumbers?: string[] | string;
    preferredLanguage: LanguageCode;
  }): Promise<{ request: SignupRequestView }> {
    return this.request('/public/accounts/parent/signup', {
      method: 'POST',
      body: JSON.stringify(data)
    });
  }

  public async submitStudentSignup(data: {
    fullName: string;
    admissionNumber: string;
    dob: string;
    email: string;
    password: string;
    confirmPassword: string;
    preferredLanguage: LanguageCode;
  }): Promise<{ request: SignupRequestView }> {
    return this.request('/public/accounts/student/signup', {
      method: 'POST',
      body: JSON.stringify(data)
    });
  }

  public async verifySignup(requestId: string, code: string): Promise<{ request: SignupRequestView }> {
    return this.request('/public/accounts/verify', {
      method: 'POST',
      body: JSON.stringify({ requestId, code })
    });
  }

  public async resendSignupCode(requestId: string): Promise<{ request: SignupRequestView }> {
    return this.request('/public/accounts/resend', {
      method: 'POST',
      body: JSON.stringify({ requestId })
    });
  }

  public async getSignupStatus(requestId: string): Promise<{ request: SignupRequestView }> {
    return this.request(`/public/accounts/status/${encodeURIComponent(requestId)}`);
  }

  public async getSignupRequests(): Promise<SignupRequestView[]> {
    return this.request('/account-signup-requests');
  }

  public async approveSignupRequest(id: string, notes = ''): Promise<{ user: UserProfile }> {
    return this.request(`/account-signup-requests/${encodeURIComponent(id)}/approve`, {
      method: 'POST',
      body: JSON.stringify({ notes })
    });
  }

  public async rejectSignupRequest(id: string, notes = ''): Promise<{ request: SignupRequestView }> {
    return this.request(`/account-signup-requests/${encodeURIComponent(id)}/reject`, {
      method: 'POST',
      body: JSON.stringify({ notes })
    });
  }

  // --- Public school website content (requires school:write) ---

  public async getPublicContentArticles(): Promise<PublicContentArticle[]> {
    return this.request<PublicContentArticle[]>('/admin/public-content/articles');
  }

  public async createPublicContentArticle(data: PublicContentArticleInput): Promise<PublicContentArticle> {
    return this.request<PublicContentArticle>('/admin/public-content/articles', {
      method: 'POST',
      body: JSON.stringify(data)
    });
  }

  public async updatePublicContentArticle(
    id: string,
    data: Partial<PublicContentArticleInput>
  ): Promise<PublicContentArticle> {
    return this.request<PublicContentArticle>(`/admin/public-content/articles/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify(data)
    });
  }

  public async deletePublicContentArticle(id: string): Promise<{ deleted: boolean }> {
    return this.request<{ deleted: boolean }>(`/admin/public-content/articles/${encodeURIComponent(id)}`, {
      method: 'DELETE'
    });
  }

  public async getPublicContentGallery(): Promise<PublicContentGalleryImage[]> {
    return this.request<PublicContentGalleryImage[]>('/admin/public-content/gallery');
  }

  public async uploadPublicContentImage(formData: FormData): Promise<PublicContentGalleryImage> {
    return this.requestForm<PublicContentGalleryImage>('/admin/public-content/gallery/upload', formData);
  }

  public async setPublicContentImageApproval(
    id: string,
    approved: boolean
  ): Promise<PublicContentGalleryImage> {
    return this.request<PublicContentGalleryImage>(
      `/admin/public-content/gallery/${encodeURIComponent(id)}/approval`,
      { method: 'PATCH', body: JSON.stringify({ approved }) }
    );
  }

  public async deletePublicContentImage(id: string): Promise<{ deleted: boolean }> {
    return this.request<{ deleted: boolean }>(`/admin/public-content/gallery/${encodeURIComponent(id)}`, {
      method: 'DELETE'
    });
  }

  // --- Scoped parent/student portal data and self-service actions ---

  public async getPortalDashboard(): Promise<PortalDashboardView> {
    return this.request('/portal/dashboard');
  }

  public async explainPortalAbsence(recordId: string, explanation: string): Promise<unknown> {
    return this.request(`/portal/attendance/${encodeURIComponent(recordId)}/explain`, {
      method: 'POST',
      body: JSON.stringify({ explanation })
    });
  }

  public async acknowledgePortalIncident(incidentId: string, notes = ''): Promise<unknown> {
    return this.request(`/portal/health-incidents/${encodeURIComponent(incidentId)}/acknowledge`, {
      method: 'POST',
      body: JSON.stringify({ notes })
    });
  }

  public async recordPortalPayment(data: {
    invoiceId: string;
    studentId: string;
    studentName: string;
    amountRwf: number;
    method: 'MTN_MOMO' | 'AIRTEL_MONEY' | 'BANK_TRANSFER';
    reference: string;
    payerPhone: string;
  }): Promise<unknown> {
    return this.request('/portal/payments', {
      method: 'POST',
      body: JSON.stringify(data)
    });
  }

  public async getUsers(): Promise<UserProfile[]> {
    return this.request<UserProfile[]>('/users');
  }

  // --- Permissions and staff administration ---
  public async getPermissions(): Promise<PermissionsResponse> {
    return this.request<PermissionsResponse>('/permissions');
  }

  public async getStaffAccounts(): Promise<StaffAccountView[]> {
    return this.request<StaffAccountView[]>('/staff/accounts');
  }

  public async getStaffSummary(): Promise<StaffSummary> {
    return this.request<StaffSummary>('/staff/summary');
  }

  public async getStaffDirectory(query: {
    search?: string;
    role?: string;
    department?: string;
    status?: string;
    page?: number;
    pageSize?: number;
  } = {}): Promise<StaffDirectoryResponse> {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined && value !== '') params.set(key, String(value));
    }
    const suffix = params.toString() ? `?${params.toString()}` : '';
    return this.request<StaffDirectoryResponse>(`/staff/directory${suffix}`);
  }

  public async getStaffProfile(userId: string): Promise<StaffDirectoryItem> {
    return this.request<StaffDirectoryItem>(`/staff/accounts/${encodeURIComponent(userId)}`);
  }

  public async updateStaffProfile(
    userId: string,
    input: {
      fullName?: string;
      phone?: string;
      staffId?: string;
      professionalTitle?: string;
      department?: string;
      gender?: 'M' | 'F';
      photoUrl?: string;
      responsibilities?: string[];
      employmentStartDate?: string;
    }
  ): Promise<StaffDirectoryItem> {
    return this.request<StaffDirectoryItem>(`/staff/accounts/${encodeURIComponent(userId)}/profile`, {
      method: 'PATCH',
      body: JSON.stringify(input)
    });
  }

  public async archiveStaffAccount(
    userId: string,
    reason?: string
  ): Promise<{ user: UserProfile; item: StaffDirectoryItem }> {
    return this.request(`/staff/accounts/${encodeURIComponent(userId)}/archive`, {
      method: 'POST',
      body: JSON.stringify({ reason })
    });
  }

  public async restoreStaffAccount(
    userId: string
  ): Promise<{ user: UserProfile; item: StaffDirectoryItem }> {
    return this.request(`/staff/accounts/${encodeURIComponent(userId)}/restore`, { method: 'POST' });
  }

  public async resetStaffAccess(userId: string): Promise<{
    temporaryPassword: string;
    credentialsResetAt: string;
    user: UserProfile;
  }> {
    return this.request(`/staff/accounts/${encodeURIComponent(userId)}/reset-access`, { method: 'POST' });
  }

  public async getPermissionGrants(userId: string): Promise<PermissionGrantRecord[]> {
    return this.request<PermissionGrantRecord[]>(`/staff/accounts/${encodeURIComponent(userId)}/permission-grants`);
  }

  public async getPermissionGroups(): Promise<PermissionGroup[]> {
    return this.request<PermissionGroup[]>('/permission-groups');
  }

  public async createPermissionGroup(input: {
    name: string;
    description?: string;
    permissions: string[];
    roleScope?: UserRole[];
  }): Promise<PermissionGroup> {
    return this.request<PermissionGroup>('/permission-groups', {
      method: 'POST',
      body: JSON.stringify(input)
    });
  }

  public async updatePermissionGroup(
    id: string,
    input: { name: string; description?: string; permissions: string[]; roleScope?: UserRole[] }
  ): Promise<PermissionGroup> {
    return this.request<PermissionGroup>(`/permission-groups/${encodeURIComponent(id)}`, {
      method: 'PUT',
      body: JSON.stringify(input)
    });
  }

  public async assignPermissionGroup(id: string, userId: string): Promise<{
    user: UserProfile;
    account: StaffAccountView | null;
  }> {
    return this.request(`/permission-groups/${encodeURIComponent(id)}/assign`, {
      method: 'POST',
      body: JSON.stringify({ userId })
    });
  }

  public async archivePermissionGroup(id: string): Promise<{ success: boolean }> {
    return this.request(`/permission-groups/${encodeURIComponent(id)}`, { method: 'DELETE' });
  }

  public async revokeStaffPermission(
    userId: string,
    permission: string
  ): Promise<{ user: UserProfile; account: StaffAccountView | null }> {
    return this.request(`/staff/accounts/${encodeURIComponent(userId)}/permissions/revoke-one`, {
      method: 'POST',
      body: JSON.stringify({ permission })
    });
  }

  public async archiveStudent(id: string, reason: string): Promise<Student> {
    return this.request<Student>(`/students/${encodeURIComponent(id)}/archive`, {
      method: 'POST',
      body: JSON.stringify({ reason })
    });
  }

  public async restoreStudent(id: string): Promise<Student> {
    return this.request<Student>(`/students/${encodeURIComponent(id)}/restore`, { method: 'POST' });
  }

  public async archiveGuardian(id: string, reason: string): Promise<Guardian> {
    return this.request<Guardian>(`/guardians/${encodeURIComponent(id)}/archive`, {
      method: 'POST',
      body: JSON.stringify({ reason })
    });
  }

  public async restoreGuardian(id: string): Promise<Guardian> {
    return this.request<Guardian>(`/guardians/${encodeURIComponent(id)}/restore`, { method: 'POST' });
  }

  public async getDelegatedAdministrators(): Promise<StaffAccountView[]> {
    return this.request<StaffAccountView[]>('/staff/delegated-administrators');
  }

  public async getStaffActivity(action?: string): Promise<AuditLogEntry[]> {
    const suffix = action ? `?action=${encodeURIComponent(action)}` : '';
    return this.request<AuditLogEntry[]>(`/staff/activity${suffix}`);
  }

  public async grantStaffPermissions(
    userId: string,
    permissions: string[],
    roleScope?: UserRole[]
  ): Promise<{ user: UserProfile; account: StaffAccountView | null }> {
    return this.request(`/staff/accounts/${encodeURIComponent(userId)}/permissions`, {
      method: 'PUT',
      body: JSON.stringify({ permissions, roleScope })
    });
  }

  public async revokeStaffPermissions(
    userId: string
  ): Promise<{ user: UserProfile; account: StaffAccountView | null }> {
    return this.request(`/staff/accounts/${encodeURIComponent(userId)}/permissions/revoke`, {
      method: 'POST'
    });
  }

  public async changeStaffRole(
    userId: string,
    role: UserRole
  ): Promise<{ user: UserProfile; account: StaffAccountView | null }> {
    return this.request(`/staff/accounts/${encodeURIComponent(userId)}/role`, {
      method: 'PATCH',
      body: JSON.stringify({ role })
    });
  }

  public async setStaffStatus(
    userId: string,
    status: 'ACTIVE' | 'SUSPENDED'
  ): Promise<{ user: UserProfile; account: StaffAccountView | null }> {
    return this.request(`/staff/accounts/${encodeURIComponent(userId)}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status })
    });
  }

  public async getStaffInvitations(): Promise<StaffInvitation[]> {
    return this.request<StaffInvitation[]>('/staff/invitations');
  }

  public async createStaffInvitation(data: {
    fullName: string;
    email: string;
    phone: string;
    role: UserRole;
    gender?: 'M' | 'F';
    preferredLanguage: LanguageCode;
    department?: string;
    staffId?: string;
    photoUrl?: string;
    professionalTitle?: string;
    responsibilities?: string[];
    employmentStartDate?: string;
    deliveryMode?: 'INVITATION' | 'SECURE_ACTIVATION';
  }): Promise<StaffInvitationResponse> {
    return this.request<StaffInvitationResponse>('/staff/invitations', {
      method: 'POST',
      body: JSON.stringify(data)
    });
  }

  public async revokeStaffInvitation(id: string): Promise<{ invitation: StaffInvitation }> {
    return this.request(`/staff/invitations/${encodeURIComponent(id)}/revoke`, {
      method: 'POST'
    });
  }

  public async resendStaffInvitation(id: string): Promise<StaffInvitationResponse> {
    return this.request<StaffInvitationResponse>(`/staff/invitations/${encodeURIComponent(id)}/resend`, {
      method: 'POST'
    });
  }

  public async activateStaffInvitation(data: {
    token: string;
    password: string;
    phone?: string;
    preferredLanguage?: LanguageCode;
  }): Promise<{ user: UserProfile }> {
    return this.request<{ user: UserProfile }>('/staff/invitations/activate', {
      method: 'POST',
      body: JSON.stringify(data)
    });
  }

  // --- Schools ---
  public async getSchool(): Promise<School> {
    const schools = await this.request<School[]>('/schools');
    return schools[0];
  }

  public async updateSchool(id: string, updates: Partial<School>): Promise<School> {
    return this.request<School>(`/schools/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(updates)
    });
  }

  // --- Students ---
  public async getStudents(classId?: string, search?: string): Promise<Student[]> {
    const params = new URLSearchParams();
    if (classId) params.append('classId', classId);
    if (search) params.append('search', search);
    return this.request<Student[]>(`/students?${params.toString()}`);
  }

  public async getStudent(id: string): Promise<Student & { guardians: { guardian: Guardian; link: StudentGuardianLink }[] }> {
    return this.request<Student & { guardians: { guardian: Guardian; link: StudentGuardianLink }[] }>(`/students/${id}`);
  }

  public async createStudent(data: Partial<Student>): Promise<Student> {
    return this.request<Student>('/students', {
      method: 'POST',
      body: JSON.stringify(data)
    });
  }

  public async updateStudent(id: string, data: Partial<Student>): Promise<Student> {
    return this.request<Student>(`/students/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data)
    });
  }

  // --- Guardians ---
  public async getGuardians(): Promise<Guardian[]> {
    return this.request<Guardian[]>('/guardians');
  }

  public async createGuardian(data: Partial<Guardian> & { studentId?: string }): Promise<Guardian> {
    return this.request<Guardian>('/guardians', {
      method: 'POST',
      body: JSON.stringify(data)
    });
  }

  public async getMyChildren(guardianId: string): Promise<{ student: Student; link: StudentGuardianLink }[]> {
    return this.request<{ student: Student; link: StudentGuardianLink }[]>(`/guardians/my-children/${guardianId}`);
  }

  // --- Attendance ---
  public async getAttendance(date?: string, classId?: string): Promise<AttendanceRecord[]> {
    const params = new URLSearchParams();
    if (date) params.append('date', date);
    if (classId) params.append('classId', classId);
    return this.request<AttendanceRecord[]>(`/attendance?${params.toString()}`);
  }

  public async recordAttendanceBatch(records: AttendanceRecord[], notifyAbsences = true): Promise<{ success: boolean; savedCount: number }> {
    return this.request<{ success: boolean; savedCount: number }>('/attendance/batch', {
      method: 'POST',
      body: JSON.stringify({ records, notifyAbsences })
    });
  }

  public async explainAbsence(recordId: string, explanation: string): Promise<AttendanceRecord> {
    return this.request<AttendanceRecord>(`/attendance/${recordId}/explain`, {
      method: 'POST',
      body: JSON.stringify({ explanation })
    });
  }

  // --- Health & Emergency ---
  public async getHealthIncidents(): Promise<HealthIncident[]> {
    return this.request<HealthIncident[]>('/health-incidents');
  }

  public async getHealthIncident(id: string): Promise<HealthIncident> {
    return this.request<HealthIncident>(`/health-incidents/${id}`);
  }

  public async createHealthIncident(data: Partial<HealthIncident>): Promise<HealthIncident> {
    return this.request<HealthIncident>('/health-incidents', {
      method: 'POST',
      body: JSON.stringify(data)
    });
  }

  public async addIncidentAction(id: string, action: string): Promise<HealthIncident> {
    return this.request<HealthIncident>(`/health-incidents/${id}/action`, {
      method: 'POST',
      body: JSON.stringify({ action })
    });
  }

  public async acknowledgeIncident(id: string, notes?: string): Promise<HealthIncident> {
    return this.request<HealthIncident>(`/health-incidents/${id}/acknowledge`, {
      method: 'POST',
      body: JSON.stringify({ notes })
    });
  }

  // --- Notifications ---
  public async getNotifications(): Promise<NotificationMessage[]> {
    return this.request<NotificationMessage[]>('/notifications');
  }

  public async sendNotification(data: Partial<NotificationMessage>): Promise<NotificationMessage> {
    return this.request<NotificationMessage>('/notifications/send', {
      method: 'POST',
      body: JSON.stringify(data)
    });
  }

  public async acknowledgeNotification(id: string): Promise<NotificationMessage> {
    return this.request<NotificationMessage>(`/notifications/${id}/acknowledge`, {
      method: 'POST'
    });
  }

  // --- Finance ---
  public async getFeeStructures(): Promise<FeeStructure[]> {
    return this.request<FeeStructure[]>('/finance/fee-structures');
  }

  public async getInvoices(studentId?: string): Promise<Invoice[]> {
    const params = new URLSearchParams();
    if (studentId) params.append('studentId', studentId);
    return this.request<Invoice[]>(`/finance/invoices?${params.toString()}`);
  }

  public async getPayments(studentId?: string): Promise<Payment[]> {
    const params = new URLSearchParams();
    if (studentId) params.append('studentId', studentId);
    return this.request<Payment[]>(`/finance/payments?${params.toString()}`);
  }

  public async recordPayment(data: Partial<Payment>): Promise<{ payment: Payment; invoice?: Invoice }> {
    return this.request<{ payment: Payment; invoice?: Invoice }>('/finance/payments', {
      method: 'POST',
      body: JSON.stringify(data)
    });
  }

  // --- Academics ---
  public async getClasses(): Promise<AcademicClass[]> {
    return this.request<AcademicClass[]>('/academics/classes');
  }

  public createClass(payload: Partial<AcademicClass>): Promise<AcademicClass> {
    return this.request<AcademicClass>('/academics/classes', { method: 'POST', body: JSON.stringify(payload) });
  }

  public getAcademicTeachers(): Promise<UserProfile[]> {
    return this.request<UserProfile[]>('/academics/teachers');
  }

  public async getSubjects(): Promise<Subject[]> {
    return this.request<Subject[]>('/academics/subjects');
  }

  public createSubject(payload: Partial<Subject>): Promise<Subject> {
    return this.request<Subject>('/academics/subjects', { method: 'POST', body: JSON.stringify(payload) });
  }

  public async getReportCards(studentId?: string): Promise<ReportCard[]> {
    const params = new URLSearchParams();
    if (studentId) params.append('studentId', studentId);
    return this.request<ReportCard[]>(`/academics/report-cards?${params.toString()}`);
  }

  // --- Academic structure & configuration ---
  public getAcademicYears(): Promise<AcademicYear[]> {
    return this.request<AcademicYear[]>('/academics/years');
  }
  public createAcademicYear(payload: Partial<AcademicYear>): Promise<AcademicYear> {
    return this.request<AcademicYear>('/academics/years', { method: 'POST', body: JSON.stringify(payload) });
  }
  public updateAcademicYear(id: string, payload: Partial<AcademicYear>): Promise<AcademicYear> {
    return this.request<AcademicYear>(`/academics/years/${id}`, { method: 'PATCH', body: JSON.stringify(payload) });
  }
  public getTerms(yearId?: string): Promise<AcademicTerm[]> {
    const params = new URLSearchParams();
    if (yearId) params.append('yearId', yearId);
    return this.request<AcademicTerm[]>(`/academics/terms?${params.toString()}`);
  }
  public createTerm(payload: Partial<AcademicTerm>): Promise<AcademicTerm> {
    return this.request<AcademicTerm>('/academics/terms', { method: 'POST', body: JSON.stringify(payload) });
  }
  public updateTerm(id: string, payload: Partial<AcademicTerm>): Promise<AcademicTerm> {
    return this.request<AcademicTerm>(`/academics/terms/${id}`, { method: 'PATCH', body: JSON.stringify(payload) });
  }
  public getAssignments(filters: { yearId?: string; termId?: string; classId?: string; subjectId?: string } = {}): Promise<ClassSubjectAssignment[]> {
    const params = new URLSearchParams();
    Object.entries(filters).forEach(([key, value]) => { if (value) params.append(key, value); });
    return this.request<ClassSubjectAssignment[]>(`/academics/assignments?${params.toString()}`);
  }
  public assignTeacher(payload: Partial<ClassSubjectAssignment>): Promise<ClassSubjectAssignment> {
    return this.request<ClassSubjectAssignment>('/academics/assignments', { method: 'POST', body: JSON.stringify(payload) });
  }
  public getClassTeacherAssignments(yearId?: string): Promise<Array<{ id: string; schoolId: string; academicYearId: string; classId: string; teacherId: string }>> {
    const params = new URLSearchParams();
    if (yearId) params.append('yearId', yearId);
    return this.request(`/academics/class-teachers?${params.toString()}`);
  }
  public assignClassTeacher(payload: { academicYearId: string; classId: string; teacherId: string }): Promise<unknown> {
    return this.request('/academics/class-teachers', { method: 'POST', body: JSON.stringify(payload) });
  }
  public getAssessmentCategories(): Promise<AssessmentCategory[]> {
    return this.request<AssessmentCategory[]>('/academics/assessment-categories');
  }
  public createAssessmentCategory(payload: Partial<AssessmentCategory>): Promise<AssessmentCategory> {
    return this.request<AssessmentCategory>('/academics/assessment-categories', { method: 'POST', body: JSON.stringify(payload) });
  }
  public updateAssessmentCategory(id: string, payload: Partial<AssessmentCategory>): Promise<AssessmentCategory> {
    return this.request<AssessmentCategory>(`/academics/assessment-categories/${id}`, { method: 'PATCH', body: JSON.stringify(payload) });
  }
  public getGradingScales(): Promise<GradingScale[]> {
    return this.request<GradingScale[]>('/academics/grading-scales');
  }
  public createGradingScale(payload: Partial<GradingScale>): Promise<GradingScale> {
    return this.request<GradingScale>('/academics/grading-scales', { method: 'POST', body: JSON.stringify(payload) });
  }
  public updateGradingScale(id: string, payload: Partial<GradingScale>): Promise<GradingScale> {
    return this.request<GradingScale>(`/academics/grading-scales/${id}`, { method: 'PATCH', body: JSON.stringify(payload) });
  }
  public getAcademicSettings(): Promise<AcademicSettings & { activeScale?: GradingScale }> {
    return this.request('/academics/settings');
  }
  public updateAcademicSettings(payload: Partial<AcademicSettings>): Promise<AcademicSettings> {
    return this.request<AcademicSettings>('/academics/settings', { method: 'PATCH', body: JSON.stringify(payload) });
  }

  // --- Teacher marks workflow ---
  public getMyAssignments(filters: { yearId?: string; termId?: string } = {}): Promise<{
    year?: AcademicYear;
    term?: AcademicTerm;
    assignments: Array<ClassSubjectAssignment & { subjectName: string; subjectCode: string; className: string; status: string }>;
    classTeacherOf: string[];
  }> {
    const params = new URLSearchParams();
    Object.entries(filters).forEach(([key, value]) => { if (value) params.append(key, value); });
    return this.request(`/academics/my-assignments?${params.toString()}`);
  }
  public getMarksEntry(filters: { yearId: string; termId: string; classId: string; subjectId: string }): Promise<MarksEntryView> {
    const params = new URLSearchParams();
    Object.entries(filters).forEach(([key, value]) => { if (value) params.append(key, value); });
    return this.request<MarksEntryView>(`/academics/marks-entry?${params.toString()}`);
  }
  public saveMarks(payload: {
    yearId: string; termId: string; classId: string; subjectId: string;
    marks: Array<{ studentId: string; categoryId: string; score: number | null; attendanceStatus?: string; remark?: string }>;
    action: 'DRAFT' | 'SUBMIT';
  }): Promise<{ saved: number; submission: MarkSubmission }> {
    return this.request('/academics/marks/save', { method: 'POST', body: JSON.stringify(payload) });
  }
  public getSubmissions(filters: { status?: string; yearId?: string; termId?: string } = {}): Promise<Array<MarkSubmission & { subjectName: string; className: string; teacherName: string }>> {
    const params = new URLSearchParams();
    Object.entries(filters).forEach(([key, value]) => { if (value) params.append(key, value); });
    return this.request(`/academics/submissions?${params.toString()}`);
  }
  public submitMarks(id: string): Promise<MarkSubmission> {
    return this.request(`/academics/submissions/${id}/submit`, { method: 'POST', body: '{}' });
  }
  public returnMarks(id: string, reason: string): Promise<MarkSubmission> {
    return this.request(`/academics/submissions/${id}/return`, { method: 'POST', body: JSON.stringify({ reason }) });
  }
  public approveMarks(id: string, notes = ''): Promise<{ submission: MarkSubmission; generatedReportCards: number }> {
    return this.request(`/academics/submissions/${id}/approve`, { method: 'POST', body: JSON.stringify({ notes }) });
  }
  public reopenMarks(id: string, reason: string): Promise<{ submission: MarkSubmission; unpublishedReportCards: number }> {
    return this.request(`/academics/submissions/${id}/reopen`, { method: 'POST', body: JSON.stringify({ reason }) });
  }
  public getAcademicResults(filters: { yearId?: string; termId?: string; classId: string; subjectId?: string }): Promise<CalculationResult> {
    const params = new URLSearchParams();
    Object.entries(filters).forEach(([key, value]) => { if (value) params.append(key, value); });
    return this.request<CalculationResult>(`/academics/results?${params.toString()}`);
  }
  public getAcademicDashboard(filters: { yearId?: string; termId?: string } = {}): Promise<AcademicDashboardView> {
    const params = new URLSearchParams();
    Object.entries(filters).forEach(([key, value]) => { if (value) params.append(key, value); });
    return this.request<AcademicDashboardView>(`/academics/dashboard?${params.toString()}`);
  }

  // --- Report cards, printing and distribution ---
  public generateReportCards(payload: { yearId: string; termId: string; classIds?: string[] | string; studentIds?: string[] }): Promise<{
    generated: number; cards: ReportCard[]; missingByClass: Array<{ classId: string; items: MissingAcademicRequirement[] }>;
  }> {
    return this.request('/academics/reports/generate', { method: 'POST', body: JSON.stringify(payload) });
  }
  public getReportCardDetail(id: string): Promise<{ card: ReportCard; school?: School; settings: AcademicSettings; distribution: string; attendance: { present: number; total: number } }> {
    return this.request(`/academics/reports/${id}`);
  }
  public getReportPrintData(filters: { yearId?: string; termId?: string; classId?: string; studentId?: string } = {}): Promise<ReportPrintData> {
    const params = new URLSearchParams();
    Object.entries(filters).forEach(([key, value]) => { if (value) params.append(key, value); });
    return this.request<ReportPrintData>(`/academics/reports/print-data?${params.toString()}`);
  }
  public publishReportCard(id: string): Promise<ReportCard> {
    return this.request(`/academics/reports/${id}/publish`, { method: 'POST', body: '{}' });
  }
  public publishReportCards(ids: string[]): Promise<{ published: number }> {
    return this.request('/academics/reports/publish-batch', { method: 'POST', body: JSON.stringify({ ids }) });
  }
  public unpublishReportCard(id: string, reason: string): Promise<ReportCard> {
    return this.request(`/academics/reports/${id}/unpublish`, { method: 'POST', body: JSON.stringify({ reason }) });
  }
  public getDistributions(filters: { status?: string; classId?: string } = {}): Promise<ReportDistribution[]> {
    const params = new URLSearchParams();
    Object.entries(filters).forEach(([key, value]) => { if (value) params.append(key, value); });
    return this.request<ReportDistribution[]>(`/academics/distributions?${params.toString()}`);
  }
  public markReportPrinted(id: string): Promise<ReportDistribution> {
    return this.request(`/academics/distributions/${id}/printed`, { method: 'POST', body: '{}' });
  }
  public issueReport(id: string, issuedToName: string, relationship: string, notes = ''): Promise<ReportDistribution> {
    return this.request(`/academics/distributions/${id}/issue`, { method: 'POST', body: JSON.stringify({ issuedToName, relationship, notes }) });
  }
  public confirmReportCollection(id: string, collectedByName: string): Promise<ReportDistribution> {
    return this.request(`/academics/distributions/${id}/collect`, { method: 'POST', body: JSON.stringify({ collectedByName }) });
  }

  // --- Staff, Timetable, Homework, Events, Audit ---
  public async getStaff(): Promise<StaffMember[]> {
    return this.request<StaffMember[]>('/staff');
  }

  public async getTimetable(classId?: string): Promise<TimetableEntry[]> {
    const params = new URLSearchParams();
    if (classId) params.append('classId', classId);
    return this.request<TimetableEntry[]>(`/timetable?${params.toString()}`);
  }

  public async getHomework(classId?: string): Promise<HomeworkAssignment[]> {
    const params = new URLSearchParams();
    if (classId) params.append('classId', classId);
    return this.request<HomeworkAssignment[]>(`/homework?${params.toString()}`);
  }

  public async getEvents(): Promise<SchoolEvent[]> {
    return this.request<SchoolEvent[]>('/events');
  }

  public async createEvent(data: Partial<SchoolEvent>): Promise<SchoolEvent> {
    return this.request<SchoolEvent>('/events', {
      method: 'POST',
      body: JSON.stringify(data)
    });
  }

  // --- Executive Reports & Analytics ---
  public async getReportsAnalytics(term?: string): Promise<any> {
    const params = new URLSearchParams();
    if (term) params.append('term', term);
    return this.request<any>(`/reports/analytics?${params.toString()}`);
  }

  public async getAuditLogs(): Promise<AuditLogEntry[]> {
    return this.request<AuditLogEntry[]>('/audit-logs');
  }

  // --- Server-backed generic modules ---
  public async getModuleRecords<T = Record<string, unknown>>(moduleKey: string): Promise<T[]> {
    return this.request<T[]>(`/modules/${encodeURIComponent(moduleKey)}`);
  }

  public async createModuleRecord<T = Record<string, unknown>>(
    moduleKey: string,
    data: Record<string, unknown>
  ): Promise<T> {
    return this.request<T>(`/modules/${encodeURIComponent(moduleKey)}`, {
      method: 'POST',
      body: JSON.stringify(data)
    });
  }

  public async updateModuleRecord<T = Record<string, unknown>>(
    moduleKey: string,
    id: string,
    data: Record<string, unknown>
  ): Promise<T> {
    return this.request<T>(`/modules/${encodeURIComponent(moduleKey)}/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify(data)
    });
  }

  public async deleteModuleRecord(moduleKey: string, id: string): Promise<{ success: boolean }> {
    return this.request<{ success: boolean }>(
      `/modules/${encodeURIComponent(moduleKey)}/${encodeURIComponent(id)}`,
      { method: 'DELETE' }
    );
  }

  // --- AI Assistant ---
  public async askAssistant(message: string, context = ''): Promise<{ reply: string }> {
    return this.request<{ reply: string }>('/ai/assistant', {
      method: 'POST',
      body: JSON.stringify({ message, context })
    });
  }

  // --- Public admissions (no account required) ---
  public async submitAdmissionApplication(formData: FormData): Promise<{
    referenceNumber: string;
    applicationId: string;
    submittedAt: string;
    applicationStatus: ApplicationStatus;
    resultSlipUploaded: boolean;
    resultVerificationStatus?: ResultSlipVerificationStatus;
    schoolContact?: string;
    notifications: AdmissionNotificationStatus[];
  }> {
    return this.requestForm('/public/admissions/applications', formData);
  }

  public async getPublicAdmissionSettings(): Promise<{
    resultSlipRequired: boolean;
    resultSlipExceptionNote?: string;
  }> {
    return this.request('/public/admissions/settings');
  }

  public uploadResultSlip(
    file: File,
    onProgress: (percent: number) => void,
    replaceToken?: string
  ): Promise<ResultSlipUploadResponse> {
    const formData = new FormData();
    formData.append('resultSlip', file);
    if (replaceToken) formData.append('replaceToken', replaceToken);

    return new Promise<ResultSlipUploadResponse>((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('POST', `${API_BASE}/public/admissions/result-slips`);
      xhr.withCredentials = true;
      xhr.upload.onprogress = event => {
        if (event.lengthComputable) onProgress(Math.min(100, Math.round((event.loaded / event.total) * 100)));
      };
      xhr.onload = () => {
        let payload: Record<string, unknown> = {};
        try {
          payload = JSON.parse(xhr.responseText) as Record<string, unknown>;
        } catch {
          // handled below
        }
        if (xhr.status >= 200 && xhr.status < 300) {
          resolve(payload as unknown as ResultSlipUploadResponse);
        } else {
          reject(new ApiError(String(payload.error || 'The result slip could not be uploaded.'), xhr.status));
        }
      };
      xhr.onerror = () => reject(new ApiError('The result slip could not be uploaded. Check your connection.', 0));
      xhr.send(formData);
    });
  }

  public async previewResultSlip(uploadToken: string): Promise<Blob> {
    return this.requestBlob('/public/admissions/result-slips/preview', { uploadToken });
  }

  public async requestAdmissionTrackingCode(
    referenceNumber: string,
    contact: string
  ): Promise<{ requiresCode: boolean; channel: 'email' | 'sms' | 'none'; message: string }> {
    return this.request('/public/admissions/tracking/request', {
      method: 'POST',
      body: JSON.stringify({ referenceNumber, contact })
    });
  }

  public async verifyAdmissionTracking(
    referenceNumber: string,
    contact: string,
    code?: string
  ): Promise<{ application: AdmissionTrackingSummary }> {
    return this.request('/public/admissions/tracking/verify', {
      method: 'POST',
      body: JSON.stringify({ referenceNumber, contact, code })
    });
  }

  // --- Admissions management (administrators only) ---
  public async getAdmissionApplications(filters: {
    search?: string;
    applicationType?: ApplicationType;
    status?: ApplicationStatus;
    academicYear?: string;
  } = {}): Promise<{ applications: AdmissionApplication[]; total: number }> {
    const params = new URLSearchParams();
    Object.entries(filters).forEach(([key, value]) => {
      if (value) params.set(key, String(value));
    });
    const suffix = params.toString() ? `?${params.toString()}` : '';
    return this.request(`/admissions/applications${suffix}`);
  }

  public async getAdmissionApplication(id: string): Promise<{ application: AdmissionApplication }> {
    return this.request(`/admissions/applications/${encodeURIComponent(id)}`);
  }

  public async getAdmissionSettings(): Promise<AdmissionSettings> {
    return this.request('/admissions/settings');
  }

  public async updateAdmissionSettings(settings: {
    resultSlipRequired: boolean;
    resultSlipExceptionNote?: string;
  }): Promise<AdmissionSettings> {
    return this.request('/admissions/settings', {
      method: 'PATCH',
      body: JSON.stringify(settings)
    });
  }

  public async updateResultVerification(
    id: string,
    payload: {
      status: ResultSlipVerificationStatus;
      notes?: string;
      academicPerformance?: AcademicPerformanceData;
    }
  ): Promise<{ application: AdmissionApplication; event: ResultSlipVerificationEvent }> {
    return this.request(`/admissions/applications/${encodeURIComponent(id)}/result-verification`, {
      method: 'POST',
      body: JSON.stringify(payload)
    });
  }

  public async addAdmissionReviewNote(
    id: string,
    note: string
  ): Promise<{ note: AdmissionReviewNote; application: AdmissionApplication }> {
    return this.request(`/admissions/applications/${encodeURIComponent(id)}/review-notes`, {
      method: 'POST',
      body: JSON.stringify({ note })
    });
  }

  public async updateAdmissionStatus(
    id: string,
    status: ApplicationStatus,
    reason = ''
  ): Promise<{ application: AdmissionApplication; notifications: AdmissionNotificationStatus[] }> {
    return this.request(`/admissions/applications/${encodeURIComponent(id)}/status`, {
      method: 'POST',
      body: JSON.stringify({ status, reason })
    });
  }

  public getAdmissionDocumentUrl(applicationId: string, documentId: string): string {
    return `${API_BASE}/admissions/applications/${encodeURIComponent(applicationId)}/documents/${encodeURIComponent(documentId)}/download`;
  }

  public getAdmissionDocumentPreviewUrl(applicationId: string, documentId: string): string {
    return `${API_BASE}/admissions/applications/${encodeURIComponent(applicationId)}/documents/${encodeURIComponent(documentId)}/preview`;
  }

  // --- MySQL & XAMPP Integration ---
  public async getMysqlStatus(): Promise<MysqlStatus> {
    return this.request<MysqlStatus>('/mysql/status');
  }
}

export const api = new ApiService();
