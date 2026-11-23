import type { LanguageCode, UserProfile, UserRole } from '../../src/types';

export type AiIntent =
  | 'general'
  | 'student_count'
  | 'attendance_summary'
  | 'academic_summary'
  | 'my_results'
  | 'announcements'
  | 'finance_summary'
  | 'knowledge';

export interface AiActorContext {
  id: string;
  schoolId: string;
  role: UserRole;
  fullName: string;
  preferredLanguage: LanguageCode;
  permissions: string[];
}

export interface AiSource {
  title: string;
  kind: 'DATABASE' | 'DOCUMENT';
  detail?: string;
}

export interface AiDataContext {
  intent: AiIntent;
  /** Compact, already-authorized facts. Never contains unrestricted table dumps. */
  facts: Record<string, unknown>;
  sources: AiSource[];
  /** Explains when a requested dataset was withheld or unavailable. */
  notice?: string;
}

export interface AiConversationRecord {
  id: string;
  schoolId: string;
  userId: string;
  title: string;
  language: LanguageCode;
  createdAt: string;
  updatedAt: string;
}

export interface AiMessageRecord {
  id: string;
  conversationId: string;
  schoolId: string;
  userId: string;
  role: 'user' | 'assistant';
  content: string;
  sources: AiSource[];
  language: LanguageCode;
  createdAt: string;
}

export interface AiSettingsRecord {
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

export interface AiKnowledgeRecord {
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

export interface AiUsageRecord {
  id: string | number;
  schoolId: string;
  userId: string;
  userRole: UserRole;
  action: string;
  model: string;
  status: 'OK' | 'ERROR';
  errorCode: string | null;
  latencyMs: number;
  createdAt: string;
}

export function actorContext(user: UserProfile, permissions: string[]): AiActorContext {
  return {
    id: user.id,
    schoolId: user.schoolId,
    role: user.role,
    fullName: user.fullName,
    preferredLanguage: user.preferredLanguage === 'rw' ? 'rw' : 'en',
    permissions
  };
}
