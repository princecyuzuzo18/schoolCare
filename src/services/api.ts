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
  ResultSlipVerificationStatus
} from '../types';

const API_BASE = '/api';

export class ApiError extends Error {
  constructor(message: string, public readonly status: number) {
    super(message);
    this.name = 'ApiError';
  }
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
      const err = await res.json().catch(() => ({ error: 'Network response was not ok' }));
      if (
        res.status === 401 &&
        !['/auth/login', '/auth/me', '/auth/password-reset/request'].includes(endpoint) &&
        !endpoint.startsWith('/public/admissions/')
      ) {
        window.dispatchEvent(new Event('schoolcare:session-expired'));
      }
      throw new ApiError(err.error || `HTTP ${res.status}`, res.status);
    }

    return res.json();
  }

  private async requestForm<T>(endpoint: string, formData: FormData): Promise<T> {
    const res = await fetch(`${API_BASE}${endpoint}`, {
      method: 'POST',
      body: formData,
      credentials: 'same-origin'
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Network response was not ok' }));
      throw new ApiError(err.error || `HTTP ${res.status}`, res.status);
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
  public async login(email: string, password: string): Promise<{ user: UserProfile }> {
    return this.request<{ user: UserProfile }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password })
    });
  }

  public async getMe(): Promise<{ user: UserProfile | null }> {
    return this.request<{ user: UserProfile | null }>('/auth/me');
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

  public async getUsers(): Promise<UserProfile[]> {
    return this.request<UserProfile[]>('/users');
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

  public async getSubjects(): Promise<Subject[]> {
    return this.request<Subject[]>('/academics/subjects');
  }

  public async getReportCards(studentId?: string): Promise<ReportCard[]> {
    const params = new URLSearchParams();
    if (studentId) params.append('studentId', studentId);
    return this.request<ReportCard[]>(`/academics/report-cards?${params.toString()}`);
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
