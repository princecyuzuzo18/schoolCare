import { createHash, randomBytes } from 'node:crypto';
import type { LanguageCode, StaffInvitation, UserProfile, UserRole } from '../src/types';
import { ASSIGNABLE_STAFF_ROLES, getProfessionalTitle } from '../src/roleCatalog';
import { createInvitedAccount } from './authCredentials';
import { db } from './database';

const INVITATION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{40,60}$/;

export class StaffManagementError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'StaffManagementError';
  }
}

export interface CreateStaffInvitationInput {
  fullName: string;
  email: string;
  phone: string;
  role: UserRole;
  gender?: 'M' | 'F';
  preferredLanguage: LanguageCode;
  professionalTitle?: string;
  department?: string;
}

export interface ActivateStaffInvitationInput {
  token: string;
  password: string;
  phone?: string;
  preferredLanguage?: LanguageCode;
}

export function hashInvitationToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function publicInvitation(invitation: StaffInvitation) {
  const { tokenHash: _tokenHash, ...safeInvitation } = invitation;
  return safeInvitation;
}

function validateCreateInput(input: CreateStaffInvitationInput): void {
  const fullName = typeof input.fullName === 'string' ? input.fullName.trim() : '';
  const email = typeof input.email === 'string' ? input.email.trim().toLowerCase() : '';
  const phone = typeof input.phone === 'string' ? input.phone.trim() : '';

  if (fullName.length < 2 || fullName.length > 120) {
    throw new StaffManagementError('Enter a full name between 2 and 120 characters.');
  }
  if (!EMAIL_PATTERN.test(email) || email.length > 255) {
    throw new StaffManagementError('Enter a valid email address of at most 255 characters.');
  }
  if (phone.length < 3 || phone.length > 50) {
    throw new StaffManagementError('Enter a phone number between 3 and 50 characters.');
  }
  if (!ASSIGNABLE_STAFF_ROLES.includes(input.role)) {
    throw new StaffManagementError('That staff role cannot be invited. Choose an assignable staff role.');
  }
  if (input.preferredLanguage !== 'en' && input.preferredLanguage !== 'rw') {
    throw new StaffManagementError('Choose English or Ikinyarwanda as the preferred language.');
  }
  if (input.gender !== undefined && input.gender !== 'M' && input.gender !== 'F') {
    throw new StaffManagementError('Gender must be M or F.');
  }
}

export function createStaffInvitation(
  input: CreateStaffInvitationInput,
  actor: UserProfile
): { invitation: StaffInvitation; token: string } {
  validateCreateInput(input);

  const email = input.email.trim().toLowerCase();
  const fullName = input.fullName.trim();
  const role = input.role;
  const now = new Date();

  if (db.getUserByEmail(email)) {
    throw new StaffManagementError('An account with that email already exists.');
  }

  const pendingDuplicate = db.getStaffInvitations(actor.schoolId).some(invitation =>
    invitation.email.toLowerCase() === email &&
    !invitation.consumedAt &&
    !invitation.revokedAt &&
    new Date(invitation.expiresAt).getTime() > now.getTime()
  );
  if (pendingDuplicate) {
    throw new StaffManagementError('A valid invitation is already pending for that email.');
  }

  const token = randomBytes(32).toString('base64url');
  const professionalTitle = input.professionalTitle?.trim() || getProfessionalTitle(role);
  const invitation: StaffInvitation = {
    id: `invite-${Date.now()}-${randomBytes(4).toString('hex')}`,
    schoolId: actor.schoolId,
    fullName,
    email,
    ...(input.gender ? { gender: input.gender } : {}),
    role,
    professionalTitle,
    tokenHash: hashInvitationToken(token),
    expiresAt: new Date(now.getTime() + INVITATION_TTL_MS).toISOString(),
    createdAt: now.toISOString(),
    createdBy: actor.id,
    department: input.department?.trim() || professionalTitle
  };

  db.createStaffInvitation(invitation);
  return { invitation, token };
}

export async function activateStaffInvitation(
  input: ActivateStaffInvitationInput
): Promise<{ user: UserProfile; invitation: StaffInvitation }> {
  const token = typeof input.token === 'string' ? input.token.trim() : '';
  const password = typeof input.password === 'string' ? input.password : '';

  if (!TOKEN_PATTERN.test(token)) {
    throw new StaffManagementError('This invitation link is invalid.');
  }
  if (password.length < 12 || password.length > 128) {
    throw new StaffManagementError('Choose a password between 12 and 128 characters.');
  }

  const invitation = db.getStaffInvitationByTokenHash(hashInvitationToken(token));
  if (!invitation) {
    throw new StaffManagementError('This invitation link is invalid.');
  }
  if (invitation.revokedAt) {
    throw new StaffManagementError('This invitation was revoked. Ask the Headteacher for a new one.');
  }
  if (invitation.consumedAt) {
    throw new StaffManagementError('This invitation has already been used.');
  }
  if (new Date(invitation.expiresAt).getTime() <= Date.now()) {
    throw new StaffManagementError('This invitation has expired. Ask the Headteacher for a new one.');
  }

  if (db.getUserByEmail(invitation.email)) {
    throw new StaffManagementError('An account with that email already exists.');
  }

  const preferredLanguage: LanguageCode =
    input.preferredLanguage === 'rw' || input.preferredLanguage === 'en'
      ? input.preferredLanguage
      : 'en';
  const phone = input.phone?.trim() || '';
  const now = new Date().toISOString();
  const userId = `user-${randomBytes(8).toString('hex')}`;
  const title = invitation.professionalTitle || getProfessionalTitle(invitation.role);

  try {
    await createInvitedAccount({
      id: userId,
      schoolId: invitation.schoolId,
      roleId: invitation.role,
      fullName: invitation.fullName,
      email: invitation.email,
      phone,
      preferredLanguage
    }, password);
  } catch (error) {
    const code = error && typeof error === 'object' && 'code' in error ? (error as any).code : undefined;
    if (code === 'ER_NO_REFERENCED_ROW_2') {
      throw new StaffManagementError(
        'MariaDB is missing the role for this invitation. Run npm run db:migrate, then try again.'
      );
    }
    if (code === 'ER_DUP_ENTRY') {
      throw new StaffManagementError('An account with that email already exists.');
    }
    throw new StaffManagementError('Could not activate the invitation. Check the MariaDB connection and try again.');
  }

  const user: UserProfile = {
    id: userId,
    schoolId: invitation.schoolId,
    email: invitation.email,
    fullName: invitation.fullName,
    role: invitation.role,
    phone,
    avatarUrl: '',
    preferredLanguage,
    isActive: true,
    delegatedPermissions: [],
    createdAt: now,
    invitedBy: invitation.createdBy
  };
  db.createUser(user);

  db.createStaffAccount({
    id: `staff-account-${userId}`,
    userId,
    schoolId: invitation.schoolId,
    role: invitation.role,
    professionalTitle: title,
    department: invitation.department || title,
    status: 'ACTIVE',
    delegatedPermissions: [],
    createdAt: now,
    createdBy: invitation.createdBy,
    invitedAt: invitation.createdAt,
    acceptedAt: now
  });

  const existingStaffMember = db
    .getStaff(invitation.schoolId)
    .find(member => member.email.toLowerCase() === invitation.email.toLowerCase());
  if (!existingStaffMember) {
    db.createStaffMember({
      id: `stf-${userId}`,
      schoolId: invitation.schoolId,
      staffId: `STF-${randomBytes(3).toString('hex').toUpperCase()}`,
      fullName: invitation.fullName,
      gender: invitation.gender ?? 'M',
      role: invitation.role,
      title: title,
      department: invitation.department || title,
      phone,
      email: invitation.email,
      assignedClasses: [],
      assignedSubjects: [],
      status: 'ACTIVE',
      joinedDate: now.slice(0, 10)
    });
  }

  db.updateStaffInvitation(invitation.id, { consumedAt: now, userId });

  return { user, invitation: { ...invitation, consumedAt: now, userId } };
}
