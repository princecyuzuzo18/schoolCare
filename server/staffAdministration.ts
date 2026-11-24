import { db } from './database';
import type {
  StaffDirectoryItem,
  StaffDirectoryResponse,
  StaffSummary,
  UserProfile,
  UserRole
} from '../src/types';
import type { StaffAccount, StaffMember } from '../src/types';
import { StaffManagementError } from './staffManagement';

const SUMMARY_ROLE_KEYS: Array<keyof StaffSummary['byRole']> = [
  'DEPUTY_HEAD',
  'TEACHER',
  'NURSE',
  'ACCOUNTANT',
  'DISCIPLINE_OFFICER',
  'SCHOOL_IT',
  'ANIMATEUR'
];

export interface StaffDirectoryQuery {
  search?: string;
  role?: string;
  department?: string;
  status?: string;
  page?: string | number;
  pageSize?: string | number;
}

export interface StaffProfileUpdateInput {
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

/** The only profile fields a Headteacher may change for their own account. */
export interface SelfProfileUpdateInput {
  fullName?: string;
  phone?: string;
  photoUrl?: string;
}

/** Split a personal name without importing one-off migration constants. */
export function splitPersonalName(fullName: string): { firstName: string; lastName: string } {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  const firstName = parts.shift() ?? '';
  return { firstName, lastName: parts.join(' ') };
}

function normalizeList(values?: string[]): string[] {
  if (!Array.isArray(values)) return [];
  return Array.from(
    new Set(
      values
        .filter((value): value is string => typeof value === 'string')
        .map(value => value.trim())
        .filter(Boolean)
    )
  ).slice(0, 30);
}

function findStaffMember(account: StaffAccount, schoolId: string): StaffMember | undefined {
  return db.getStaff(schoolId).find(member =>
    member.id === `stf-${account.userId}` ||
    member.email.toLowerCase() === (db.getUserById(account.userId)?.email || '').toLowerCase() ||
    Boolean(account.staffId && member.staffId.toLowerCase() === account.staffId.toLowerCase())
  );
}

function toDirectoryItem(account: StaffAccount, schoolId: string): StaffDirectoryItem {
  const user = db.getUserById(account.userId);
  const member = findStaffMember(account, schoolId);
  return {
    accountId: account.id,
    userId: account.userId,
    staffId: account.staffId || member?.staffId || '',
    fullName: user?.fullName || member?.fullName || 'Unnamed staff member',
    email: user?.email || member?.email || '',
    phone: account.phone || user?.phone || member?.phone || '',
    role: account.role,
    professionalTitle: account.professionalTitle || member?.title || '',
    department: account.department || member?.department || '',
    gender: account.gender || member?.gender,
    photoUrl: account.photoUrl || user?.avatarUrl || member?.photoUrl,
    responsibilities: account.responsibilities || member?.responsibilities || [],
    employmentStartDate: account.employmentStartDate || member?.employmentStartDate,
    accountStatus: account.status,
    employmentStatus: member?.status || (account.status === 'ARCHIVED' ? 'ARCHIVED' : account.status === 'SUSPENDED' ? 'SUSPENDED' : 'ACTIVE'),
    isActive: user?.isActive !== false,
    dateAdded: account.createdAt,
    delegatedPermissions: account.delegatedPermissions || user?.delegatedPermissions || [],
    delegatedRoleScope: account.delegatedRoleScope || user?.delegatedRoleScope || [],
    invitedAt: account.invitedAt,
    acceptedAt: account.acceptedAt,
    archivedAt: account.archivedAt,
    lastLogin: user?.lastLogin
  };
}

export function getStaffSummary(schoolId: string): StaffSummary {
  const accounts = db.getStaffAccounts(schoolId).filter(account => {
    const user = db.getUserById(account.userId);
    return Boolean(user && user.schoolId === schoolId);
  });
  const now = Date.now();
  const pendingInvitations = db.getStaffInvitations(schoolId).filter(invitation =>
    !invitation.consumedAt &&
    !invitation.revokedAt &&
    new Date(invitation.expiresAt).getTime() > now
  ).length;

  const byRole = {
    DEPUTY_HEAD: 0,
    TEACHER: 0,
    NURSE: 0,
    ACCOUNTANT: 0,
    DISCIPLINE_OFFICER: 0,
    SCHOOL_IT: 0,
    ANIMATEUR: 0
  } as StaffSummary['byRole'];

  for (const account of accounts) {
    if (SUMMARY_ROLE_KEYS.includes(account.role as keyof StaffSummary['byRole'])) {
      byRole[account.role as keyof StaffSummary['byRole']] += 1;
    }
  }

  return {
    total: accounts.length,
    active: accounts.filter(account =>
      account.status === 'ACTIVE' && db.getUserById(account.userId)?.isActive !== false
    ).length,
    pendingInvitations,
    suspended: accounts.filter(account => account.status === 'SUSPENDED').length,
    archived: accounts.filter(account => account.status === 'ARCHIVED').length,
    delegatedAdministrators: accounts.filter(account =>
      account.status !== 'ARCHIVED' && (account.delegatedPermissions || []).length > 0
    ).length,
    byRole
  };
}

export function getStaffDirectory(schoolId: string, query: StaffDirectoryQuery): StaffDirectoryResponse {
  const search = (query.search || '').trim().toLowerCase();
  const role = (query.role || '').trim();
  const department = (query.department || '').trim().toLowerCase();
  const status = (query.status || '').trim().toLowerCase();
  const page = Math.max(1, Number.parseInt(String(query.page || 1), 10) || 1);
  const pageSize = Math.min(100, Math.max(1, Number.parseInt(String(query.pageSize || 20), 10) || 20));

  const items = db
    .getStaffAccounts(schoolId)
    .filter(account => {
      const user = db.getUserById(account.userId);
      return Boolean(user && user.schoolId === schoolId);
    })
    .map(account => toDirectoryItem(account, schoolId))
    .filter(item => {
      if (role && role !== 'ALL' && item.role !== role) return false;
      if (department && !item.department.toLowerCase().includes(department)) return false;
      if (status && status !== 'ALL' && item.accountStatus.toLowerCase() !== status && item.employmentStatus.toLowerCase() !== status) {
        return false;
      }
      if (!search) return true;
      return [
        item.fullName,
        item.email,
        item.staffId,
        item.role,
        item.professionalTitle,
        item.department,
        item.phone
      ].some(value => value.toLowerCase().includes(search));
    })
    .sort((a, b) => a.fullName.localeCompare(b.fullName));

  const total = items.length;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(page, pageCount);

  return {
    items: items.slice((safePage - 1) * pageSize, safePage * pageSize),
    total,
    page: safePage,
    pageSize,
    pageCount
  };
}

export function getStaffProfile(schoolId: string, userId: string): StaffDirectoryItem | undefined {
  const account = db.getStaffAccountByUserId(userId);
  if (!account || account.schoolId !== schoolId) return undefined;
  const user = db.getUserById(userId);
  if (!user || user.schoolId !== schoolId) return undefined;
  return toDirectoryItem(account, schoolId);
}

function validateText(value: string | undefined, field: string, max: number): void {
  if (value !== undefined && (value.trim().length < 1 || value.trim().length > max)) {
    throw new StaffManagementError(`${field} must be between 1 and ${max} characters.`);
  }
}

export function updateStaffProfile(
  schoolId: string,
  userId: string,
  input: StaffProfileUpdateInput,
  actorId: string
): StaffDirectoryItem | undefined {
  const account = db.getStaffAccountByUserId(userId);
  const user = db.getUserById(userId);
  if (!account || !user || account.schoolId !== schoolId || user.schoolId !== schoolId) return undefined;

  for (const [field, value] of Object.entries(input)) {
    if (value !== undefined && typeof value === 'string' && field !== 'employmentStartDate' && field !== 'gender') {
      validateText(value, field, field === 'photoUrl' ? 500 : 150);
    }
  }
  if (input.employmentStartDate && Number.isNaN(new Date(input.employmentStartDate).getTime())) {
    throw new StaffManagementError('Enter a valid employment start date.');
  }
  if (input.gender !== undefined && input.gender !== 'M' && input.gender !== 'F') {
    throw new StaffManagementError('Gender must be M or F.');
  }

  db.updateUserProfile(userId, {
    fullName: input.fullName?.trim(),
    phone: input.phone?.trim(),
    avatarUrl: input.photoUrl?.trim()
  });

  const accountUpdates: Partial<StaffAccount> = {
    lastModifiedBy: actorId
  };
  if (input.staffId !== undefined) accountUpdates.staffId = input.staffId.trim();
  if (input.phone !== undefined) accountUpdates.phone = input.phone.trim();
  if (input.professionalTitle !== undefined) accountUpdates.professionalTitle = input.professionalTitle.trim();
  if (input.department !== undefined) accountUpdates.department = input.department.trim();
  if (input.gender !== undefined) accountUpdates.gender = input.gender;
  if (input.photoUrl !== undefined) accountUpdates.photoUrl = input.photoUrl.trim();
  if (input.responsibilities !== undefined) accountUpdates.responsibilities = normalizeList(input.responsibilities);
  if (input.employmentStartDate !== undefined) {
    accountUpdates.employmentStartDate = new Date(input.employmentStartDate).toISOString().slice(0, 10);
  }
  db.updateStaffAccount(account.id, accountUpdates);

  const member = findStaffMember(account, schoolId);
  if (member) {
    const memberUpdates: Partial<StaffMember> = {};
    if (input.fullName !== undefined) memberUpdates.fullName = input.fullName.trim();
    if (input.staffId !== undefined) memberUpdates.staffId = input.staffId.trim();
    if (input.phone !== undefined) memberUpdates.phone = input.phone.trim();
    if (input.professionalTitle !== undefined) memberUpdates.title = input.professionalTitle.trim();
    if (input.department !== undefined) memberUpdates.department = input.department.trim();
    if (input.gender !== undefined) memberUpdates.gender = input.gender;
    if (input.photoUrl !== undefined) memberUpdates.photoUrl = input.photoUrl.trim();
    if (input.responsibilities !== undefined) memberUpdates.responsibilities = normalizeList(input.responsibilities);
    if (input.employmentStartDate !== undefined) {
      memberUpdates.employmentStartDate = new Date(input.employmentStartDate).toISOString().slice(0, 10);
    }
    db.updateStaffMember(member.id, memberUpdates);
  }

  return getStaffProfile(schoolId, userId);
}

/**
 * Self-service Headteacher profile edit. The caller must derive the user id
 * and school from the authenticated session; no identity, role, permission,
 * credential or school field is read from the request body.
 */
export function updateSelfProfile(
  schoolId: string,
  userId: string,
  input: SelfProfileUpdateInput,
  actorId: string
): UserProfile | undefined {
  const user = db.getUserById(userId);
  if (!user || user.schoolId !== schoolId) return undefined;

  if (input.fullName !== undefined) validateText(input.fullName, 'fullName', 150);
  if (input.phone !== undefined) validateText(input.phone, 'phone', 50);
  if (input.photoUrl !== undefined && input.photoUrl.trim().length > 500) {
    throw new StaffManagementError('photoUrl must be 500 characters or fewer.');
  }

  const userUpdates: Partial<Pick<UserProfile, 'fullName' | 'firstName' | 'lastName' | 'phone' | 'avatarUrl'>> = {};
  if (input.fullName !== undefined) {
    const fullName = input.fullName.trim();
    const names = splitPersonalName(fullName);
    userUpdates.fullName = fullName;
    userUpdates.firstName = names.firstName;
    userUpdates.lastName = names.lastName;
  }
  if (input.phone !== undefined) userUpdates.phone = input.phone.trim();
  if (input.photoUrl !== undefined) userUpdates.avatarUrl = input.photoUrl.trim();

  const updated = db.updateUserProfile(userId, userUpdates);

  const account = db.getStaffAccountByUserId(userId);
  if (account && account.schoolId === schoolId) {
    const accountUpdates: Partial<StaffAccount> = { lastModifiedBy: actorId };
    if (input.phone !== undefined) accountUpdates.phone = input.phone.trim();
    if (input.photoUrl !== undefined) accountUpdates.photoUrl = input.photoUrl.trim();
    db.updateStaffAccount(account.id, accountUpdates);

    const member = findStaffMember(account, schoolId);
    if (member) {
      const memberUpdates: Partial<StaffMember> = {};
      if (input.fullName !== undefined) {
        memberUpdates.fullName = input.fullName.trim();
        const names = splitPersonalName(input.fullName);
        memberUpdates.firstName = names.firstName;
        memberUpdates.lastName = names.lastName;
      }
      if (input.phone !== undefined) memberUpdates.phone = input.phone.trim();
      if (input.photoUrl !== undefined) memberUpdates.photoUrl = input.photoUrl.trim();
      db.updateStaffMember(member.id, memberUpdates);
    }
  }

  return updated;
}

export function archiveStaffAccount(
  schoolId: string,
  userId: string,
  actorId: string,
  reason = 'Archived by school administrator'
): { user: UserProfile; item: StaffDirectoryItem } | undefined {
  const account = db.getStaffAccountByUserId(userId);
  const user = db.getUserById(userId);
  if (!account || !user || account.schoolId !== schoolId || user.schoolId !== schoolId) return undefined;

  const archivedAt = new Date().toISOString();
  db.updateStaffAccount(account.id, {
    status: 'ARCHIVED',
    archivedAt,
    archivedBy: actorId,
    archiveReason: reason,
    archivedFromStatus: account.status === 'ARCHIVED' ? 'ACTIVE' : account.status,
    lastModifiedBy: actorId
  });
  db.setUserActive(userId, false);
  const member = findStaffMember(account, schoolId);
  if (member) {
    db.updateStaffMember(member.id, {
      status: 'ARCHIVED',
      archivedAt,
      archivedBy: actorId,
      archiveReason: reason
    });
  }

  const updatedUser = db.getUserById(userId);
  const item = getStaffProfile(schoolId, userId);
  if (!updatedUser || !item) return undefined;
  return { user: updatedUser, item };
}

/**
 * Restore an archived staff account without recreating it. Delegated
 * permissions stay revoked until the Headteacher explicitly grants them again.
 */
export function restoreStaffAccount(
  schoolId: string,
  userId: string,
  actorId: string
): { user: UserProfile; item: StaffDirectoryItem } | undefined {
  const account = db.getStaffAccountByUserId(userId);
  const user = db.getUserById(userId);
  if (!account || !user || account.schoolId !== schoolId || user.schoolId !== schoolId) return undefined;
  if (account.status !== 'ARCHIVED') return undefined;

  const restoredStatus = account.archivedFromStatus === 'SUSPENDED' ? 'SUSPENDED' : 'ACTIVE';
  db.updateStaffAccount(account.id, {
    status: restoredStatus,
    archivedAt: undefined,
    archivedBy: undefined,
    archiveReason: undefined,
    archivedFromStatus: undefined,
    lastModifiedBy: actorId
  });
  db.setDelegatedPermissions(userId, []);
  db.setDelegatedRoleScope(userId, []);
  db.setUserActive(userId, restoredStatus === 'ACTIVE');
  const member = findStaffMember(account, schoolId);
  if (member) {
    db.updateStaffMember(member.id, {
      status: restoredStatus === 'SUSPENDED' ? 'SUSPENDED' : 'ACTIVE',
      archivedAt: undefined,
      archivedBy: undefined,
      archiveReason: undefined
    });
  }

  const updatedUser = db.getUserById(userId);
  const item = getStaffProfile(schoolId, userId);
  if (!updatedUser || !item) return undefined;
  return { user: updatedUser, item };
}
