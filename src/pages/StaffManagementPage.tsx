import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../i18n/LanguageContext';
import { api, ApiError } from '../services/api';
import {
  ASSIGNABLE_STAFF_ROLES,
  getProfessionalTitle,
  isProtectedRole
} from '../roleCatalog';
import type {
  LanguageCode,
  StaffAccountView,
  StaffDirectoryItem,
  StaffDirectoryResponse,
  StaffInvitation,
  StaffInvitationResponse,
  StaffSummary,
  UserRole
} from '../types';
import {
  Archive,
  Copy,
  KeyRound,
  Mail,
  Pencil,
  RotateCcw,
  Search,
  ShieldCheck,
  UserCog,
  Users
} from 'lucide-react';
import type { AuditLogEntry } from '../types';

type StaffSection = 'overview' | 'add' | 'directory' | 'invitations' | 'delegated' | 'activity';

interface StaffForm {
  fullName: string;
  email: string;
  phone: string;
  staffId: string;
  professionalTitle: string;
  department: string;
  role: UserRole;
  gender: 'M' | 'F';
  preferredLanguage: LanguageCode;
  responsibilities: string;
  employmentStartDate: string;
  deliveryMode: 'INVITATION' | 'SECURE_ACTIVATION';
  photoUrl: string;
}

interface ProfileForm {
  fullName: string;
  phone: string;
  staffId: string;
  professionalTitle: string;
  department: string;
  gender: 'M' | 'F';
  photoUrl: string;
  responsibilities: string;
  employmentStartDate: string;
}

interface StaffManagementPageProps {
  onNavigate: (tab: string) => void;
}

const emptyForm = (language: LanguageCode): StaffForm => ({
  fullName: '',
  email: '',
  phone: '',
  staffId: '',
  professionalTitle: '',
  department: '',
  role: 'TEACHER',
  gender: 'F',
  preferredLanguage: language,
  responsibilities: '',
  employmentStartDate: new Date().toISOString().slice(0, 10),
  deliveryMode: 'INVITATION',
  photoUrl: ''
});

const toProfileForm = (item: StaffDirectoryItem): ProfileForm => ({
  fullName: item.fullName,
  phone: item.phone,
  staffId: item.staffId,
  professionalTitle: item.professionalTitle,
  department: item.department,
  gender: item.gender || 'F',
  photoUrl: item.photoUrl || '',
  responsibilities: (item.responsibilities || []).join(', '),
  employmentStartDate: item.employmentStartDate || ''
});

function errorMessage(error: unknown, fallback: string): string {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error) return error.message;
  return fallback;
}

function splitList(value: string): string[] {
  return value
    .split(/[,\n;]/)
    .map(item => item.trim())
    .filter(Boolean);
}

function formatDate(value?: string): string {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString();
}

function isExpired(invitation: StaffInvitation): boolean {
  if (!invitation.expiresAt || invitation.consumedAt || invitation.revokedAt) return false;
  const expires = new Date(invitation.expiresAt).getTime();
  return Number.isFinite(expires) && expires <= Date.now();
}

const ActivationLinkPanel: React.FC<{
  invitation: StaffInvitationResponse;
  copied: string;
  onCopy: (url: string) => void;
}> = ({ invitation, copied, onCopy }) => {
  const { t } = useLanguage();
  return (
    <div className="mt-5 rounded-xl border border-amber-200 bg-amber-50 p-4">
      <p className="text-[11px] font-bold text-amber-900">{t('activationLink')}</p>
      <p className="mt-1 break-all font-mono text-[10px] text-amber-800">
        {`${window.location.origin}${invitation.activationUrl}`}
      </p>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => onCopy(invitation.activationUrl)}
          className="inline-flex items-center gap-1 rounded-lg border border-amber-300 bg-white px-2 py-1 text-[10px] font-bold text-amber-800"
        >
          <Copy className="w-3 h-3" />
          {copied === invitation.activationUrl ? t('copied') : t('copyActivationLink')}
        </button>
        <span className="text-[10px] font-semibold text-amber-800">
          {invitation.deliveryPending ? t('deliveryPending') : t('deliverySent')}
        </span>
        <span className="text-[10px] font-semibold text-amber-800">
          {t('activationExpires')}: {formatDate(invitation.invitation.expiresAt)}
        </span>
      </div>
      <p className="mt-2 text-[10px] text-amber-800">{t('activationCopyOnce')}</p>
      <p className="mt-1 text-[10px] text-amber-800">{t('activationResendInvalidates')}</p>
    </div>
  );
};

export const StaffManagementPage: React.FC<StaffManagementPageProps> = ({ onNavigate }) => {
  const { currentUser, hasPermission, refreshPermissions } = useAuth();
  const { t, language } = useLanguage();

  const [section, setSection] = useState<StaffSection>('overview');
  const [summary, setSummary] = useState<StaffSummary | null>(null);
  const [accounts, setAccounts] = useState<StaffAccountView[]>([]);
  const [invitations, setInvitations] = useState<StaffInvitation[]>([]);
  const [delegated, setDelegated] = useState<StaffAccountView[]>([]);
  const [activity, setActivity] = useState<AuditLogEntry[]>([]);
  const [directory, setDirectory] = useState<StaffDirectoryResponse>({
    items: [],
    total: 0,
    page: 1,
    pageSize: 10,
    pageCount: 1
  });
  const [directoryQuery, setDirectoryQuery] = useState({
    search: '',
    role: 'ALL',
    department: '',
    status: 'ALL',
    page: 1
  });
  const [form, setForm] = useState<StaffForm>(() => emptyForm(language));
  const [profile, setProfile] = useState<StaffDirectoryItem | null>(null);
  const [profileForm, setProfileForm] = useState<ProfileForm | null>(null);
  const [newInvitation, setNewInvitation] = useState<StaffInvitationResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [copied, setCopied] = useState('');

  const canView = hasPermission('staff.read');
  const canCreate = hasPermission('staff.create') || hasPermission('invitations.manage');
  const canEdit = hasPermission('staff.write');
  const canArchive = hasPermission('staff.archive');
  const canDelegate = hasPermission('permissions.delegate') || hasPermission('permissions.view');
  const canAudit = hasPermission('audit.review');

  const loadDirectory = useCallback(async () => {
    try {
      const result = await api.getStaffDirectory(directoryQuery);
      setDirectory(result);
    } catch (err) {
      setError(errorMessage(err, t('staffLoadError')));
    }
  }, [directoryQuery, t]);

  const load = useCallback(async () => {
    setLoading(true);
    const requests = await Promise.allSettled([
      api.getStaffSummary(),
      api.getStaffAccounts(),
      api.getStaffInvitations(),
      api.getDelegatedAdministrators(),
      api.getStaffActivity()
    ]);
    if (requests[0].status === 'fulfilled') setSummary(requests[0].value as StaffSummary);
    if (requests[1].status === 'fulfilled') setAccounts(requests[1].value as StaffAccountView[]);
    if (requests[2].status === 'fulfilled') setInvitations(requests[2].value as StaffInvitation[]);
    if (requests[3].status === 'fulfilled') setDelegated(requests[3].value as StaffAccountView[]);
    if (requests[4].status === 'fulfilled') setActivity(requests[4].value as AuditLogEntry[]);
    setLoading(false);
    if (canView) await loadDirectory();
  }, [canView, loadDirectory, t]);

  useEffect(() => {
    load();
  }, [load]);

  const updateForm = <K extends keyof StaffForm>(key: K, value: StaffForm[K]) => {
    setForm(previous => ({ ...previous, [key]: value }));
  };

  const handleInvite = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError('');
    setSuccess('');
    setCopied('');
    setNewInvitation(null);
    try {
      const result = await api.createStaffInvitation({
        fullName: form.fullName.trim(),
        email: form.email.trim(),
        phone: form.phone.trim(),
        role: form.role,
        gender: form.gender,
        preferredLanguage: form.preferredLanguage,
        department: form.department.trim() || undefined,
        professionalTitle: form.professionalTitle.trim() || undefined,
        staffId: form.staffId.trim() || undefined,
        photoUrl: form.photoUrl.trim() || undefined,
        responsibilities: splitList(form.responsibilities),
        employmentStartDate: form.employmentStartDate || undefined,
        deliveryMode: form.deliveryMode
      });
      setNewInvitation(result);
      setSuccess(
        result.deliveryPending ? t('inviteCreatedPending') : t('inviteSent')
      );
      setForm(emptyForm(language));
      await load();
    } catch (err) {
      setError(errorMessage(err, t('staffLoadError')));
    } finally {
      setSaving(false);
    }
  };

  const copyLink = async (url: string) => {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}${url}`);
      setCopied(url);
    } catch {
      setError(t('copyFailed'));
    }
  };

  const handleRoleChange = async (account: StaffAccountView, role: UserRole) => {
    if (!window.confirm(t('confirmRoleChange'))) return;
    setSaving(true);
    setError('');
    try {
      await api.changeStaffRole(account.userId, role);
      setSuccess(t('roleUpdated'));
      await Promise.all([load(), refreshPermissions()]);
    } catch (err) {
      setError(errorMessage(err, t('staffLoadError')));
    } finally {
      setSaving(false);
    }
  };

  const handleStatusChange = async (item: StaffDirectoryItem) => {
    const nextStatus = item.accountStatus === 'SUSPENDED' ? 'ACTIVE' : 'SUSPENDED';
    const confirmKey = nextStatus === 'SUSPENDED' ? 'confirmSuspendAccount' : 'confirmActivateAccount';
    if (!window.confirm(t(confirmKey))) return;
    setSaving(true);
    setError('');
    try {
      await api.setStaffStatus(item.userId, nextStatus);
      setSuccess(nextStatus === 'SUSPENDED' ? t('accountSuspended') : t('accountActivated'));
      await Promise.all([load(), refreshPermissions()]);
    } catch (err) {
      setError(errorMessage(err, t('staffLoadError')));
    } finally {
      setSaving(false);
    }
  };

  const handleArchive = async (item: StaffDirectoryItem) => {
    if (!window.confirm(t('confirmArchive'))) return;
    setSaving(true);
    setError('');
    try {
      await api.archiveStaffAccount(item.userId);
      setSuccess(t('archivedNotice'));
      setProfile(null);
      setProfileForm(null);
      await Promise.all([load(), refreshPermissions()]);
    } catch (err) {
      setError(errorMessage(err, t('staffLoadError')));
    } finally {
      setSaving(false);
    }
  };

  const handleRestore = async (item: StaffDirectoryItem) => {
    if (!window.confirm(t('confirmRestore'))) return;
    setSaving(true);
    setError('');
    try {
      await api.restoreStaffAccount(item.userId);
      setSuccess(t('restoredNotice'));
      setProfile(null);
      setProfileForm(null);
      await Promise.all([load(), refreshPermissions()]);
    } catch (err) {
      setError(errorMessage(err, t('staffLoadError')));
    } finally {
      setSaving(false);
    }
  };

  const handleResetAccess = async (item: StaffDirectoryItem) => {
    if (!window.confirm(t('confirmResetAccess'))) return;
    setSaving(true);
    setError('');
    try {
      const result = await api.resetStaffAccess(item.userId);
      setSuccess(`${t('accessResetNotice')} ${result.temporaryPassword}`);
      await load();
    } catch (err) {
      setError(errorMessage(err, t('staffLoadError')));
    } finally {
      setSaving(false);
    }
  };

  const openProfile = async (item: StaffDirectoryItem) => {
    setSaving(true);
    setError('');
    try {
      const fullProfile = await api.getStaffProfile(item.userId);
      setProfile(fullProfile);
      setProfileForm(toProfileForm(fullProfile));
    } catch (err) {
      setError(errorMessage(err, t('staffLoadError')));
    } finally {
      setSaving(false);
    }
  };

  const saveProfile = async () => {
    if (!profile || !profileForm) return;
    setSaving(true);
    setError('');
    try {
      const updated = await api.updateStaffProfile(profile.userId, {
        fullName: profileForm.fullName.trim(),
        phone: profileForm.phone.trim(),
        staffId: profileForm.staffId.trim(),
        professionalTitle: profileForm.professionalTitle.trim(),
        department: profileForm.department.trim(),
        gender: profileForm.gender,
        photoUrl: profileForm.photoUrl.trim(),
        responsibilities: splitList(profileForm.responsibilities),
        employmentStartDate: profileForm.employmentStartDate || undefined
      });
      setProfile(updated);
      setSuccess(t('profileUpdated'));
      await load();
    } catch (err) {
      setError(errorMessage(err, t('staffLoadError')));
    } finally {
      setSaving(false);
    }
  };

  const handleRevokeInvitation = async (invitation: StaffInvitation) => {
    if (!window.confirm(t('confirmRevokeInvitation'))) return;
    setSaving(true);
    setError('');
    try {
      await api.revokeStaffInvitation(invitation.id);
      setSuccess(t('invitationRevoked'));
      await load();
    } catch (err) {
      setError(errorMessage(err, t('staffLoadError')));
    } finally {
      setSaving(false);
    }
  };

  const handleResendInvitation = async (invitation: StaffInvitation) => {
    setSaving(true);
    setError('');
    try {
      const result = await api.resendStaffInvitation(invitation.id);
      setNewInvitation(result);
      setCopied('');
      setSuccess(result.deliveryPending ? t('inviteCreatedPending') : t('invitationResent'));
      await load();
    } catch (err) {
      setError(errorMessage(err, t('staffLoadError')));
    } finally {
      setSaving(false);
    }
  };

  const handleRevokeDelegation = async (account: StaffAccountView) => {
    if (!window.confirm(t('confirmDelegationRevoke'))) return;
    setSaving(true);
    setError('');
    try {
      await api.revokeStaffPermissions(account.userId);
      setSuccess(t('delegationRevoked'));
      await Promise.all([load(), refreshPermissions()]);
    } catch (err) {
      setError(errorMessage(err, t('staffLoadError')));
    } finally {
      setSaving(false);
    }
  };

  const sections: Array<{ id: StaffSection; label: string; visible: boolean }> = [
    { id: 'overview', label: t('staffSectionOverview'), visible: canView },
    { id: 'add', label: t('staffSectionAdd'), visible: canCreate },
    { id: 'directory', label: t('staffSectionDirectory'), visible: canView },
    { id: 'invitations', label: t('staffSectionInvitations'), visible: canCreate },
    { id: 'delegated', label: t('staffSectionDelegated'), visible: canDelegate },
    { id: 'activity', label: t('staffSectionActivity'), visible: canAudit }
  ];
  const visibleSections = sections.filter(item => item.visible);
  const activeSection = visibleSections.some(item => item.id === section)
    ? section
    : visibleSections[0]?.id || 'overview';

  const departments = useMemo(
    () => Array.from(new Set(directory.items.map(item => item.department).filter(Boolean))).sort(),
    [directory.items]
  );

  const roleCounts = summary?.byRole || {
    DEPUTY_HEAD: 0,
    TEACHER: 0,
    NURSE: 0,
    ACCOUNTANT: 0,
    DISCIPLINE_OFFICER: 0,
    SCHOOL_IT: 0,
    ANIMATEUR: 0
  };

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto space-y-6">
      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs">
        <div className="flex items-center gap-2">
          <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-indigo-100 text-indigo-800 flex items-center gap-1">
            <UserCog className="w-3.5 h-3.5" />
            {t('headteacherWorkspace')}
          </span>
          <span className="text-xs text-slate-500">{t('serverEnforced')}</span>
        </div>
        <h1 className="text-2xl font-black text-slate-900 mt-1">{t('staffManagementTitle')}</h1>
        <p className="text-xs text-slate-500 mt-0.5">{t('staffManagementSubtitle')}</p>
      </div>

      {error && (
        <div role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-xs font-semibold text-red-800">
          {error}
        </div>
      )}
      {success && (
        <div role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs font-semibold text-emerald-800">
          {success}
        </div>
      )}

      {visibleSections.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {visibleSections.map(item => (
            <button
              key={item.id}
              type="button"
              onClick={() => setSection(item.id)}
              className={`rounded-xl px-3 py-1.5 text-[11px] font-bold border transition-colors ${
                activeSection === item.id
                  ? 'border-indigo-300 bg-indigo-600 text-white'
                  : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
      )}

      {loading && <p className="text-xs text-slate-500">{t('loading')}</p>}

      {activeSection === 'overview' && (
        <section className="space-y-6">
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
            {[
              { label: t('staffTotal'), value: summary?.total ?? 0, tone: 'bg-blue-50 text-blue-800' },
              { label: t('staffActive'), value: summary?.active ?? 0, tone: 'bg-emerald-50 text-emerald-800' },
              { label: t('staffPending'), value: summary?.pendingInvitations ?? 0, tone: 'bg-amber-50 text-amber-800' },
              { label: t('staffSuspended'), value: summary?.suspended ?? 0, tone: 'bg-red-50 text-red-800' },
              { label: t('staffArchived'), value: summary?.archived ?? 0, tone: 'bg-slate-100 text-slate-700' },
              { label: t('staffDelegated'), value: summary?.delegatedAdministrators ?? 0, tone: 'bg-indigo-50 text-indigo-800' }
            ].map(card => (
              <div key={card.label} className={`rounded-2xl border border-slate-200 p-4 ${card.tone}`}>
                <p className="text-[10px] font-bold uppercase tracking-wide opacity-80">{card.label}</p>
                <p className="mt-1 text-2xl font-black">{card.value}</p>
              </div>
            ))}
          </div>
          <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs">
            <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <Users className="w-4 h-4 text-indigo-600" />
              {t('staffRoleBreakdown')}
            </h2>
            <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {ASSIGNABLE_STAFF_ROLES.map(role => (
                <button
                  key={role}
                  type="button"
                  onClick={() => {
                    setDirectoryQuery(previous => ({ ...previous, role, page: 1 }));
                    setSection('directory');
                  }}
                  className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-left hover:border-indigo-300"
                >
                  <p className="text-[11px] font-bold text-slate-900">{getProfessionalTitle(role)}</p>
                  <p className="mt-0.5 text-lg font-black text-indigo-700">
                    {roleCounts[role as keyof typeof roleCounts] ?? 0}
                  </p>
                </button>
              ))}
            </div>
          </div>
        </section>
      )}

      {activeSection === 'add' && (
        <section className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs">
          <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
            <Mail className="w-4 h-4 text-blue-600" />
            {t('inviteStaffHeading')}
          </h2>
          <p className="mt-1 text-[11px] text-slate-500">{t('secureActivationNote')}</p>
          <form onSubmit={handleInvite} className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label={t('staffFullName')} htmlFor="staff-name">
              <input id="staff-name" required value={form.fullName} onChange={e => updateForm('fullName', e.target.value)} className={inputClass} />
            </Field>
            <Field label={t('staffId')} htmlFor="staff-id">
              <input id="staff-id" value={form.staffId} onChange={e => updateForm('staffId', e.target.value)} placeholder="STF-014" className={inputClass} />
            </Field>
            <Field label={t('staffEmail')} htmlFor="staff-email">
              <input id="staff-email" type="email" required value={form.email} onChange={e => updateForm('email', e.target.value)} className={inputClass} />
            </Field>
            <Field label={t('staffPhone')} htmlFor="staff-phone">
              <input id="staff-phone" required value={form.phone} onChange={e => updateForm('phone', e.target.value)} className={inputClass} />
            </Field>
            <Field label={t('staffRole')} htmlFor="staff-role">
              <select id="staff-role" value={form.role} onChange={e => updateForm('role', e.target.value as UserRole)} className={inputClass}>
                {ASSIGNABLE_STAFF_ROLES.map(role => (
                  <option key={role} value={role}>{getProfessionalTitle(role)}</option>
                ))}
              </select>
            </Field>
            <Field label={t('professionalTitle')} htmlFor="staff-title">
              <input id="staff-title" value={form.professionalTitle} onChange={e => updateForm('professionalTitle', e.target.value)} placeholder={getProfessionalTitle(form.role)} className={inputClass} />
            </Field>
            <Field label={t('staffDepartment')} htmlFor="staff-department">
              <input id="staff-department" value={form.department} onChange={e => updateForm('department', e.target.value)} className={inputClass} />
            </Field>
            <Field label={t('staffGender')} htmlFor="staff-gender">
              <select id="staff-gender" value={form.gender} onChange={e => updateForm('gender', e.target.value as 'M' | 'F')} className={inputClass}>
                <option value="F">F</option>
                <option value="M">M</option>
              </select>
            </Field>
            <Field label={t('staffSubjects')} htmlFor="staff-subjects">
              <input id="staff-subjects" value={form.responsibilities} onChange={e => updateForm('responsibilities', e.target.value)} placeholder="Math, Physics" className={inputClass} />
            </Field>
            <Field label={t('staffStartDate')} htmlFor="staff-start-date">
              <input id="staff-start-date" type="date" value={form.employmentStartDate} onChange={e => updateForm('employmentStartDate', e.target.value)} className={inputClass} />
            </Field>
            <Field label={t('staffPhotoUrl')} htmlFor="staff-photo">
              <input id="staff-photo" value={form.photoUrl} onChange={e => updateForm('photoUrl', e.target.value)} className={inputClass} />
            </Field>
            <Field label={t('staffLanguage')} htmlFor="staff-language">
              <select id="staff-language" value={form.preferredLanguage} onChange={e => updateForm('preferredLanguage', e.target.value as LanguageCode)} className={inputClass}>
                <option value="en">English</option>
                <option value="rw">Ikinyarwanda</option>
              </select>
            </Field>
            <Field label={t('staffDeliveryMode')} htmlFor="staff-delivery">
              <select id="staff-delivery" value={form.deliveryMode} onChange={e => updateForm('deliveryMode', e.target.value as StaffForm['deliveryMode'])} className={inputClass}>
                <option value="INVITATION">{t('staffDeliveryInvitation')}</option>
                <option value="SECURE_ACTIVATION">{t('staffDeliverySecure')}</option>
              </select>
            </Field>
            <div className="sm:col-span-2 flex flex-wrap items-center gap-3">
              <button type="submit" disabled={saving} className="rounded-xl bg-blue-700 px-4 py-2.5 text-xs font-bold text-white hover:bg-blue-800 disabled:opacity-60">
                {saving ? t('saving') : t('sendInvitation')}
              </button>
              <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-slate-500">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                {t('staffAccountStatus')}: {t('pending')}
              </span>
            </div>
          </form>

          {newInvitation && (
            <ActivationLinkPanel invitation={newInvitation} copied={copied} onCopy={copyLink} />
          )}
        </section>
      )}

      {activeSection === 'directory' && (
        <section className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2 mr-auto">
              <Users className="w-4 h-4 text-emerald-600" />
              {t('staffDirectoryTitle')} ({directory.total})
            </h2>
            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-slate-400" />
              <input
                value={directoryQuery.search}
                onChange={e => setDirectoryQuery(previous => ({ ...previous, search: e.target.value, page: 1 }))}
                placeholder={t('staffSearch')}
                className={`${inputClass} pl-8 w-48`}
              />
            </div>
            <select value={directoryQuery.role} onChange={e => setDirectoryQuery(previous => ({ ...previous, role: e.target.value, page: 1 }))} className={`${inputClass} w-44`}>
              <option value="ALL">{t('allRoles')}</option>
              {ASSIGNABLE_STAFF_ROLES.map(role => <option key={role} value={role}>{getProfessionalTitle(role)}</option>)}
            </select>
            <select value={directoryQuery.department} onChange={e => setDirectoryQuery(previous => ({ ...previous, department: e.target.value, page: 1 }))} className={`${inputClass} w-40`}>
              <option value="">{t('allDepartments')}</option>
              {departments.map(department => <option key={department} value={department}>{department}</option>)}
            </select>
            <select value={directoryQuery.status} onChange={e => setDirectoryQuery(previous => ({ ...previous, status: e.target.value, page: 1 }))} className={`${inputClass} w-36`}>
              <option value="ALL">{t('allStatuses')}</option>
              <option value="ACTIVE">ACTIVE</option>
              <option value="INVITED">INVITED</option>
              <option value="SUSPENDED">SUSPENDED</option>
              <option value="ARCHIVED">ARCHIVED</option>
            </select>
          </div>

          {directory.items.length === 0 ? (
            <p className="text-xs text-slate-500">{t('noStaffMatch')}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[900px] text-left text-[11px]">
                <thead className="text-slate-500">
                  <tr>
                    <th className="pb-2 font-bold">{t('staffNameColumn')}</th>
                    <th className="pb-2 font-bold">{t('staffIdColumn')}</th>
                    <th className="pb-2 font-bold">{t('staffRoleColumn')}</th>
                    <th className="pb-2 font-bold">{t('staffDepartment')}</th>
                    <th className="pb-2 font-bold">{t('staffStatusColumn')}</th>
                    <th className="pb-2 font-bold">{t('staffActionsColumn')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {directory.items.map(item => {
                    const protectedAccount = isProtectedRole(item.role) || item.userId === currentUser?.id;
                    return (
                      <tr key={item.accountId} className="align-middle">
                        <td className="py-2.5 pr-3">
                          <div className="flex items-center gap-2">
                            {item.photoUrl ? (
                              <img src={item.photoUrl || undefined} alt="" className="h-7 w-7 rounded-full object-cover" />
                            ) : (
                              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-indigo-100 text-[10px] font-bold text-indigo-700">
                                {item.fullName.charAt(0)}
                              </span>
                            )}
                            <div>
                              <p className="font-bold text-slate-900">{item.fullName}</p>
                              <p className="text-[10px] text-slate-500">{item.email}</p>
                            </div>
                          </div>
                        </td>
                        <td className="py-2.5 pr-3 font-mono text-[10px] text-slate-600">{item.staffId || '—'}</td>
                        <td className="py-2.5 pr-3">{getProfessionalTitle(item.role)}</td>
                        <td className="py-2.5 pr-3 text-slate-600">{item.department || '—'}</td>
                        <td className="py-2.5 pr-3">
                          <span className={`rounded-full px-2 py-1 text-[10px] font-bold ${
                            item.accountStatus === 'SUSPENDED' || item.accountStatus === 'ARCHIVED'
                              ? 'bg-red-100 text-red-800'
                              : 'bg-emerald-100 text-emerald-800'
                          }`}>
                            {item.accountStatus}
                          </span>
                        </td>
                        <td className="py-2.5">
                          <div className="flex flex-wrap gap-1.5">
                            <button type="button" onClick={() => openProfile(item)} className="inline-flex items-center gap-1 rounded-lg border border-blue-200 bg-blue-50 px-2 py-1 text-[10px] font-bold text-blue-800">
                              <UserCog className="w-3 h-3" />
                              {t('staffProfileTitle')}
                            </button>
                            {!protectedAccount && canEdit && (
                              <button type="button" disabled={saving} onClick={() => openProfile(item)} className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2 py-1 text-[10px] font-bold text-slate-700">
                                <Pencil className="w-3 h-3" />
                                {t('editStaff')}
                              </button>
                            )}
                            {!protectedAccount && (
                              <button type="button" disabled={saving} onClick={() => onNavigate('permissions')} className="inline-flex items-center gap-1 rounded-lg border border-indigo-200 bg-indigo-50 px-2 py-1 text-[10px] font-bold text-indigo-800">
                                <KeyRound className="w-3 h-3" />
                                {t('permissions')}
                              </button>
                            )}
                            {!protectedAccount && (
                              <button type="button" disabled={saving} onClick={() => handleStatusChange(item)} className="rounded-lg border border-slate-200 px-2 py-1 text-[10px] font-bold text-slate-700">
                                {item.accountStatus === 'SUSPENDED' ? t('activateAccount') : t('suspendAccount')}
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-3 text-[10px] font-semibold text-slate-600">
            <span>{t('pageLabel')}: {directory.page} / {directory.pageCount}</span>
            <div className="flex gap-2">
              <button
                type="button"
                disabled={directory.page <= 1}
                onClick={() => setDirectoryQuery(previous => ({ ...previous, page: previous.page - 1 }))}
                className="rounded-lg border border-slate-200 px-2 py-1 disabled:opacity-40"
              >
                {t('previousPage')}
              </button>
              <button
                type="button"
                disabled={directory.page >= directory.pageCount}
                onClick={() => setDirectoryQuery(previous => ({ ...previous, page: previous.page + 1 }))}
                className="rounded-lg border border-slate-200 px-2 py-1 disabled:opacity-40"
              >
                {t('nextPage')}
              </button>
            </div>
          </div>
        </section>
      )}

      {activeSection === 'invitations' && (
        <section className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs">
          <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
            <Mail className="w-4 h-4 text-amber-600" />
            {t('pendingInvitations')} ({invitations.filter(item => !item.consumedAt && !item.revokedAt && !isExpired(item)).length})
          </h2>
          {invitations.length === 0 ? (
            <p className="mt-4 text-xs text-slate-500">{t('noInvitations')}</p>
          ) : (
            <ul className="mt-4 space-y-2">
              {invitations.map(invitation => {
                const active = !invitation.consumedAt && !invitation.revokedAt;
                const sent = invitation.notificationStatuses?.some(status => status.sent);
                return (
                  <li key={invitation.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-100 bg-slate-50 px-3 py-2">
                    <div>
                      <p className="text-[11px] font-bold text-slate-900">{invitation.fullName}</p>
                      <p className="text-[10px] text-slate-500">
                        {invitation.email} · {getProfessionalTitle(invitation.role)} · {invitation.staffId}
                      </p>
                      <p className="text-[10px] text-slate-500">
                        {t('invitationDelivery')}: {sent ? t('deliverySent') : t('deliveryPending')}
                      </p>
                      <p className="text-[10px] text-slate-500">
                        {t('activationExpires')}: {formatDate(invitation.expiresAt)}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`rounded-full px-2 py-1 text-[10px] font-bold ${
                        active && !isExpired(invitation) ? 'bg-amber-100 text-amber-800' : 'bg-slate-200 text-slate-600'
                      }`}>
                        {invitation.revokedAt
                          ? t('revoked')
                          : invitation.consumedAt
                            ? t('used')
                            : isExpired(invitation)
                              ? t('invitationExpired')
                              : t('pending')}
                      </span>
                      {active && (
                        <>
                          <button type="button" disabled={saving} onClick={() => handleResendInvitation(invitation)} className="inline-flex items-center gap-1 rounded-lg border border-blue-200 bg-blue-50 px-2 py-1 text-[10px] font-bold text-blue-800">
                            <RotateCcw className="w-3 h-3" />
                            {t('resendInvitation')}
                          </button>
                          <button type="button" disabled={saving} onClick={() => handleRevokeInvitation(invitation)} className="rounded-lg border border-red-200 px-2 py-1 text-[10px] font-bold text-red-700">
                            {t('revokeInvitation')}
                          </button>
                        </>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
          {newInvitation && (
            <ActivationLinkPanel invitation={newInvitation} copied={copied} onCopy={copyLink} />
          )}
        </section>
      )}

      {activeSection === 'delegated' && (
        <section className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs">
          <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-indigo-600" />
            {t('delegatedAdminsTitle')}
          </h2>
          <p className="mt-1 text-[11px] text-slate-500">{t('delegatedAdminsSubtitle')}</p>
          {delegated.length === 0 ? (
            <p className="mt-4 text-xs text-slate-500">{t('noDelegatedAdmins')}</p>
          ) : (
            <div className="mt-4 grid grid-cols-1 lg:grid-cols-2 gap-3">
              {delegated.map(account => (
                <div key={account.id} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="text-[11px] font-bold text-slate-900">{account.user?.fullName || t('unknownStaff')}</p>
                      <p className="text-[10px] text-slate-500">{getProfessionalTitle(account.role)}</p>
                    </div>
                    <button type="button" disabled={saving} onClick={() => handleRevokeDelegation(account)} className="rounded-lg border border-red-200 bg-white px-2 py-1 text-[10px] font-bold text-red-700">
                      {t('revokeDelegation')}
                    </button>
                  </div>
                  <p className="mt-2 text-[10px] font-bold text-slate-700">{t('delegatedPermissions')}</p>
                  <p className="text-[10px] text-slate-500">{(account.delegatedPermissions || []).join(', ') || '—'}</p>
                  {(account.delegatedRoleScope || []).length > 0 && (
                    <>
                      <p className="mt-2 text-[10px] font-bold text-slate-700">{t('delegatedRoleScopeLabel')}</p>
                      <p className="text-[10px] text-slate-500">
                        {(account.delegatedRoleScope || []).map(role => getProfessionalTitle(role)).join(', ')}
                      </p>
                    </>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {activeSection === 'activity' && (
        <section className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs">
          <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-emerald-600" />
            {t('staffActivityTitle')}
          </h2>
          <p className="mt-1 text-[11px] text-slate-500">{t('staffActivitySubtitle')}</p>
          {activity.length === 0 ? (
            <p className="mt-4 text-xs text-slate-500">{t('noActivity')}</p>
          ) : (
            <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-[720px] text-left text-[11px]">
                <thead className="text-slate-500">
                  <tr>
                    <th className="pb-2 font-bold">{t('activityAction')}</th>
                    <th className="pb-2 font-bold">{t('activityUser')}</th>
                    <th className="pb-2 font-bold">{t('activityWhen')}</th>
                    <th className="pb-2 font-bold">{t('activityDetails')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {activity.slice(0, 100).map(entry => (
                    <tr key={entry.id}>
                      <td className="py-2 pr-3 font-bold text-slate-800">{entry.action}</td>
                      <td className="py-2 pr-3 text-slate-600">{entry.userName}</td>
                      <td className="py-2 pr-3 text-slate-500">{formatDate(entry.timestamp)}</td>
                      <td className="py-2 pr-3 text-slate-600">{entry.details}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {profile && profileForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4" role="dialog" aria-modal="true">
          <div className="w-full max-w-2xl rounded-2xl bg-white p-5 shadow-xl">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-sm font-black text-slate-900">{t('staffProfileTitle')}</h2>
                <p className="text-[10px] text-slate-500">{profile.email}</p>
              </div>
              <button type="button" onClick={() => { setProfile(null); setProfileForm(null); }} className="rounded-lg border border-slate-200 px-2 py-1 text-[10px] font-bold text-slate-600">
                {t('cancelEdit')}
              </button>
            </div>
            <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Info label={t('staffRoleColumn')} value={getProfessionalTitle(profile.role)} />
              <Info label={t('staffStatusColumn')} value={profile.accountStatus} />
              <Info label={t('staffPermissionsColumn')} value={profile.delegatedPermissions.join(', ') || '—'} />
              <Info label={t('dateAdded')} value={formatDate(profile.dateAdded)} />
              <Info label={t('employmentStatus')} value={profile.employmentStatus} />
              <Info label={t('lastLogin')} value={formatDate(profile.lastLogin)} />
            </div>
            {canEdit && (
              <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3 border-t border-slate-100 pt-4">
                <Field label={t('staffFullName')} htmlFor="profile-name">
                  <input id="profile-name" value={profileForm.fullName} onChange={e => setProfileForm({ ...profileForm, fullName: e.target.value })} className={inputClass} />
                </Field>
                <Field label={t('staffPhone')} htmlFor="profile-phone">
                  <input id="profile-phone" value={profileForm.phone} onChange={e => setProfileForm({ ...profileForm, phone: e.target.value })} className={inputClass} />
                </Field>
                <Field label={t('staffId')} htmlFor="profile-staff-id">
                  <input id="profile-staff-id" value={profileForm.staffId} onChange={e => setProfileForm({ ...profileForm, staffId: e.target.value })} className={inputClass} />
                </Field>
                <Field label={t('professionalTitle')} htmlFor="profile-title">
                  <input id="profile-title" value={profileForm.professionalTitle} onChange={e => setProfileForm({ ...profileForm, professionalTitle: e.target.value })} className={inputClass} />
                </Field>
                <Field label={t('staffDepartment')} htmlFor="profile-department">
                  <input id="profile-department" value={profileForm.department} onChange={e => setProfileForm({ ...profileForm, department: e.target.value })} className={inputClass} />
                </Field>
                <Field label={t('staffGender')} htmlFor="profile-gender">
                  <select id="profile-gender" value={profileForm.gender} onChange={e => setProfileForm({ ...profileForm, gender: e.target.value as 'M' | 'F' })} className={inputClass}>
                    <option value="F">F</option>
                    <option value="M">M</option>
                  </select>
                </Field>
                <Field label={t('staffPhotoUrl')} htmlFor="profile-photo">
                  <input id="profile-photo" value={profileForm.photoUrl} onChange={e => setProfileForm({ ...profileForm, photoUrl: e.target.value })} className={inputClass} />
                </Field>
                <Field label={t('staffStartDate')} htmlFor="profile-start-date">
                  <input id="profile-start-date" type="date" value={profileForm.employmentStartDate} onChange={e => setProfileForm({ ...profileForm, employmentStartDate: e.target.value })} className={inputClass} />
                </Field>
                <div className="sm:col-span-2">
                  <Field label={t('staffSubjects')} htmlFor="profile-subjects">
                    <input id="profile-subjects" value={profileForm.responsibilities} onChange={e => setProfileForm({ ...profileForm, responsibilities: e.target.value })} className={inputClass} />
                  </Field>
                </div>
              </div>
            )}
            <div className="mt-4 flex flex-wrap gap-2 border-t border-slate-100 pt-4">
              {canEdit && (
                <button type="button" disabled={saving} onClick={saveProfile} className="rounded-xl bg-blue-700 px-4 py-2 text-xs font-bold text-white hover:bg-blue-800 disabled:opacity-60">
                  {saving ? t('saving') : t('saveStaff')}
                </button>
              )}
              {canArchive && profile.userId !== currentUser?.id && !isProtectedRole(profile.role) && (
                <>
                  {profile.accountStatus === 'ARCHIVED' ? (
                    <button type="button" disabled={saving} onClick={() => handleRestore(profile)} className="inline-flex items-center gap-1 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2 text-xs font-bold text-emerald-700">
                      <RotateCcw className="w-3.5 h-3.5" />
                      {t('restore')}
                    </button>
                  ) : (
                    <>
                      <button type="button" disabled={saving} onClick={() => handleArchive(profile)} className="inline-flex items-center gap-1 rounded-xl border border-red-200 bg-red-50 px-4 py-2 text-xs font-bold text-red-700">
                        <Archive className="w-3.5 h-3.5" />
                        {t('archiveAccount')}
                      </button>
                      <button type="button" disabled={saving} onClick={() => handleResetAccess(profile)} className="inline-flex items-center gap-1 rounded-xl border border-amber-200 bg-amber-50 px-4 py-2 text-xs font-bold text-amber-800">
                        <KeyRound className="w-3.5 h-3.5" />
                        {t('resetAccess')}
                      </button>
                    </>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const inputClass =
  'mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-xs focus:ring-2 focus:ring-blue-500';

const Field: React.FC<{ label: string; htmlFor: string; children: React.ReactNode }> = ({ label, htmlFor, children }) => (
  <div>
    <label className="block text-[11px] font-bold text-slate-600" htmlFor={htmlFor}>{label}</label>
    {children}
  </div>
);

const Info: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
    <p className="text-[10px] font-bold text-slate-500">{label}</p>
    <p className="mt-0.5 break-words text-[11px] font-semibold text-slate-800">{value}</p>
  </div>
);
