import React, { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../i18n/LanguageContext';
import type { TranslationKey } from '../i18n';
import { api, ApiError } from '../services/api';
import {
  ASSIGNABLE_STAFF_ROLES,
  getProfessionalTitle,
  isProtectedRole
} from '../roleCatalog';
import type {
  LanguageCode,
  StaffAccountView,
  StaffInvitation,
  StaffInvitationResponse,
  UserRole
} from '../types';
import { Copy, KeyRound, Mail, ShieldCheck, UserCog, Users } from 'lucide-react';

interface StaffManagementPageProps {
  onNavigate: (tab: string) => void;
}

interface InvitationForm {
  fullName: string;
  email: string;
  phone: string;
  role: UserRole;
  department: string;
  gender: 'M' | 'F';
  preferredLanguage: LanguageCode;
}

const emptyForm = (language: LanguageCode): InvitationForm => ({
  fullName: '',
  email: '',
  phone: '',
  role: 'TEACHER',
  department: '',
  gender: 'F',
  preferredLanguage: language
});

function errorMessage(error: unknown, fallback: string): string {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error) return error.message;
  return fallback;
}

export const StaffManagementPage: React.FC<StaffManagementPageProps> = ({ onNavigate }) => {
  const { currentUser, refreshPermissions } = useAuth();
  const { t, language } = useLanguage();

  const [accounts, setAccounts] = useState<StaffAccountView[]>([]);
  const [invitations, setInvitations] = useState<StaffInvitation[]>([]);
  const [form, setForm] = useState<InvitationForm>(() => emptyForm(language));
  const [newInvitation, setNewInvitation] = useState<StaffInvitationResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const [accountData, invitationData] = await Promise.all([
        api.getStaffAccounts(),
        api.getStaffInvitations()
      ]);
      setAccounts(accountData);
      setInvitations(invitationData);
      setError('');
    } catch (err) {
      setError(errorMessage(err, t('staffLoadError')));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    load();
  }, [load]);

  const updateForm = <K extends keyof InvitationForm>(key: K, value: InvitationForm[K]) => {
    setForm(previous => ({ ...previous, [key]: value }));
  };

  const handleInvite = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError('');
    setSuccess('');
    setCopied(false);
    try {
      const result = await api.createStaffInvitation({
        ...form,
        department: form.department.trim() || undefined
      });
      setNewInvitation(result);
      setSuccess(t('inviteSent'));
      setForm(emptyForm(language));
      await load();
    } catch (err) {
      setError(errorMessage(err, t('staffLoadError')));
    } finally {
      setSaving(false);
    }
  };

  const handleRoleChange = async (account: StaffAccountView, role: UserRole) => {
    if (!account.user) return;
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

  const handleStatusChange = async (account: StaffAccountView) => {
    if (!account.user) return;
    const nextStatus = account.status === 'SUSPENDED' ? 'ACTIVE' : 'SUSPENDED';
    const confirmKey: TranslationKey =
      nextStatus === 'SUSPENDED' ? 'confirmSuspendAccount' : 'confirmActivateAccount';
    if (!window.confirm(t(confirmKey))) return;

    setSaving(true);
    setError('');
    try {
      await api.setStaffStatus(account.userId, nextStatus);
      setSuccess(nextStatus === 'SUSPENDED' ? t('accountSuspended') : t('accountActivated'));
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

  const handleCopy = async () => {
    if (!newInvitation) return;
    const url = `${window.location.origin}${newInvitation.activationUrl}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
    } catch {
      setError(t('copyFailed'));
    }
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

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        <section className="lg:col-span-2 bg-white rounded-2xl border border-slate-200 p-5 shadow-xs">
          <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
            <Mail className="w-4 h-4 text-blue-600" />
            {t('inviteStaffHeading')}
          </h2>
          <form onSubmit={handleInvite} className="mt-4 space-y-3">
            <div>
              <label className="block text-[11px] font-bold text-slate-600" htmlFor="staff-name">
                {t('staffFullName')}
              </label>
              <input
                id="staff-name"
                required
                value={form.fullName}
                onChange={event => updateForm('fullName', event.target.value)}
                className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-xs focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-[11px] font-bold text-slate-600" htmlFor="staff-email">
                {t('staffEmail')}
              </label>
              <input
                id="staff-email"
                type="email"
                required
                value={form.email}
                onChange={event => updateForm('email', event.target.value)}
                className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-xs focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-[11px] font-bold text-slate-600" htmlFor="staff-phone">
                {t('staffPhone')}
              </label>
              <input
                id="staff-phone"
                required
                value={form.phone}
                onChange={event => updateForm('phone', event.target.value)}
                className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-xs focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-bold text-slate-600" htmlFor="staff-role">
                  {t('staffRole')}
                </label>
                <select
                  id="staff-role"
                  value={form.role}
                  onChange={event => updateForm('role', event.target.value as UserRole)}
                  className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-xs focus:ring-2 focus:ring-blue-500"
                >
                  {ASSIGNABLE_STAFF_ROLES.map(role => (
                    <option key={role} value={role}>
                      {getProfessionalTitle(role)}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-[11px] font-bold text-slate-600" htmlFor="staff-gender">
                  {t('staffGender')}
                </label>
                <select
                  id="staff-gender"
                  value={form.gender}
                  onChange={event => updateForm('gender', event.target.value as 'M' | 'F')}
                  className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-xs focus:ring-2 focus:ring-blue-500"
                >
                  <option value="F">F</option>
                  <option value="M">M</option>
                </select>
              </div>
            </div>
            <div>
              <label className="block text-[11px] font-bold text-slate-600" htmlFor="staff-department">
                {t('staffDepartment')}
              </label>
              <input
                id="staff-department"
                value={form.department}
                onChange={event => updateForm('department', event.target.value)}
                placeholder={getProfessionalTitle(form.role)}
                className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-xs focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-[11px] font-bold text-slate-600" htmlFor="staff-language">
                {t('staffLanguage')}
              </label>
              <select
                id="staff-language"
                value={form.preferredLanguage}
                onChange={event => updateForm('preferredLanguage', event.target.value as LanguageCode)}
                className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-xs focus:ring-2 focus:ring-blue-500"
              >
                <option value="en">English</option>
                <option value="rw">Ikinyarwanda</option>
              </select>
            </div>
            <button
              type="submit"
              disabled={saving}
              className="w-full rounded-xl bg-blue-700 px-4 py-2.5 text-xs font-bold text-white hover:bg-blue-800 disabled:opacity-60"
            >
              {saving ? t('saving') : t('sendInvitation')}
            </button>
          </form>

          {newInvitation && (
            <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3">
              <p className="text-[11px] font-bold text-amber-900">{t('activationLink')}</p>
              <p className="mt-1 break-all font-mono text-[10px] text-amber-800">
                {`${window.location.origin}${newInvitation.activationUrl}`}
              </p>
              <button
                type="button"
                onClick={handleCopy}
                className="mt-2 inline-flex items-center gap-1 rounded-lg border border-amber-300 bg-white px-2 py-1 text-[10px] font-bold text-amber-800"
              >
                <Copy className="w-3 h-3" />
                {copied ? t('copied') : t('copyActivationLink')}
              </button>
            </div>
          )}
        </section>

        <section className="lg:col-span-3 space-y-6">
          <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs">
            <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <Users className="w-4 h-4 text-emerald-600" />
              {t('activeAccounts')} ({accounts.length})
            </h2>
            {loading ? (
              <p className="mt-4 text-xs text-slate-500">{t('loading')}</p>
            ) : accounts.length === 0 ? (
              <p className="mt-4 text-xs text-slate-500">{t('noStaffAccounts')}</p>
            ) : (
              <div className="mt-4 overflow-x-auto">
                <table className="w-full min-w-[640px] text-left text-[11px]">
                  <thead className="text-slate-500">
                    <tr>
                      <th className="pb-2 font-bold">{t('staffFullName')}</th>
                      <th className="pb-2 font-bold">{t('staffRole')}</th>
                      <th className="pb-2 font-bold">{t('delegatedPermissions')}</th>
                      <th className="pb-2 font-bold">{t('status')}</th>
                      <th className="pb-2 font-bold">{t('actions')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {accounts.map(account => {
                      const protectedAccount =
                        isProtectedRole(account.role) || account.userId === currentUser?.id;
                      return (
                        <tr key={account.id} className="align-middle">
                          <td className="py-2.5 pr-3">
                            <p className="font-bold text-slate-900">
                              {account.user?.fullName || t('unknownStaff')}
                            </p>
                            <p className="text-[10px] text-slate-500">{account.user?.email || ''}</p>
                          </td>
                          <td className="py-2.5 pr-3">
                            {protectedAccount ? (
                              <span className="inline-flex items-center gap-1 rounded-full bg-indigo-50 px-2 py-1 text-[10px] font-bold text-indigo-800">
                                <ShieldCheck className="w-3 h-3" />
                                {getProfessionalTitle(account.role)}
                              </span>
                            ) : (
                              <select
                                aria-label={`${t('staffRole')} - ${account.user?.fullName}`}
                                value={account.role}
                                disabled={saving}
                                onChange={event =>
                                  handleRoleChange(account, event.target.value as UserRole)
                                }
                                className="max-w-[190px] rounded-lg border border-slate-200 px-2 py-1 text-[10px]"
                              >
                                {ASSIGNABLE_STAFF_ROLES.map(role => (
                                  <option key={role} value={role}>
                                    {getProfessionalTitle(role)}
                                  </option>
                                ))}
                              </select>
                            )}
                          </td>
                          <td className="py-2.5 pr-3 font-semibold text-slate-700">
                            {account.delegatedPermissions.length}
                          </td>
                          <td className="py-2.5 pr-3">
                            <span
                              className={`rounded-full px-2 py-1 text-[10px] font-bold ${
                                account.status === 'SUSPENDED'
                                  ? 'bg-red-100 text-red-800'
                                  : 'bg-emerald-100 text-emerald-800'
                              }`}
                            >
                              {account.status}
                            </span>
                          </td>
                          <td className="py-2.5">
                            <div className="flex flex-wrap gap-1.5">
                              {!protectedAccount && (
                                <>
                                  <button
                                    type="button"
                                    disabled={saving}
                                    onClick={() => onNavigate('permissions')}
                                    className="inline-flex items-center gap-1 rounded-lg border border-blue-200 bg-blue-50 px-2 py-1 text-[10px] font-bold text-blue-800"
                                  >
                                    <KeyRound className="w-3 h-3" />
                                    {t('permissions')}
                                  </button>
                                  <button
                                    type="button"
                                    disabled={saving}
                                    onClick={() => handleStatusChange(account)}
                                    className="rounded-lg border border-slate-200 px-2 py-1 text-[10px] font-bold text-slate-700"
                                  >
                                    {account.status === 'SUSPENDED'
                                      ? t('activateAccount')
                                      : t('suspendAccount')}
                                  </button>
                                </>
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
          </div>

          <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs">
            <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <Mail className="w-4 h-4 text-amber-600" />
              {t('pendingInvitations')} ({invitations.filter(item => !item.consumedAt && !item.revokedAt).length})
            </h2>
            {invitations.length === 0 ? (
              <p className="mt-4 text-xs text-slate-500">{t('noInvitations')}</p>
            ) : (
              <ul className="mt-4 space-y-2">
                {invitations.map(invitation => {
                  const active = !invitation.consumedAt && !invitation.revokedAt;
                  return (
                    <li
                      key={invitation.id}
                      className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-100 bg-slate-50 px-3 py-2"
                    >
                      <div>
                        <p className="text-[11px] font-bold text-slate-900">{invitation.fullName}</p>
                        <p className="text-[10px] text-slate-500">
                          {invitation.email} · {getProfessionalTitle(invitation.role)}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <span
                          className={`rounded-full px-2 py-1 text-[10px] font-bold ${
                            active ? 'bg-amber-100 text-amber-800' : 'bg-slate-200 text-slate-600'
                          }`}
                        >
                          {invitation.revokedAt
                            ? t('revoked')
                            : invitation.consumedAt
                              ? t('used')
                              : t('pending')}
                        </span>
                        {active && (
                          <button
                            type="button"
                            disabled={saving}
                            onClick={() => handleRevokeInvitation(invitation)}
                            className="rounded-lg border border-red-200 px-2 py-1 text-[10px] font-bold text-red-700"
                          >
                            {t('revokeInvitation')}
                          </button>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </section>
      </div>
    </div>
  );
};
