import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../i18n/LanguageContext';
import type { TranslationKey } from '../i18n';
import { api, ApiError } from '../services/api';
import { getProfessionalTitle, isProtectedRole } from '../roleCatalog';
import type { PermissionsResponse, StaffAccountView } from '../types';
import { KeyRound, LockKeyhole, RotateCcw, ShieldCheck } from 'lucide-react';

function errorMessage(error: unknown, fallback: string): string {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error) return error.message;
  return fallback;
}

export const PermissionsPage: React.FC = () => {
  const { currentUser } = useAuth();
  const { t } = useLanguage();

  const [permissionData, setPermissionData] = useState<PermissionsResponse | null>(null);
  const [accounts, setAccounts] = useState<StaffAccountView[]>([]);
  const [selectedUserId, setSelectedUserId] = useState('');
  const [selectedPermissions, setSelectedPermissions] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const [permissions, staffAccounts] = await Promise.all([
        api.getPermissions(),
        api.getStaffAccounts()
      ]);
      setPermissionData(permissions);
      setAccounts(staffAccounts);
      setError('');
    } catch (err) {
      setError(errorMessage(err, t('permissionLoadError')));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    load();
  }, [load]);

  const manageableAccounts = useMemo(
    () =>
      accounts.filter(
        account =>
          account.user &&
          account.userId !== currentUser?.id &&
          !isProtectedRole(account.role) &&
          account.role !== 'HEAD_TEACHER'
      ),
    [accounts, currentUser?.id]
  );

  useEffect(() => {
    if (manageableAccounts.length === 0) {
      setSelectedUserId('');
      setSelectedPermissions([]);
      return;
    }
    if (!manageableAccounts.some(account => account.userId === selectedUserId)) {
      const first = manageableAccounts[0];
      setSelectedUserId(first.userId);
      setSelectedPermissions(first.delegatedPermissions || []);
    }
  }, [manageableAccounts, selectedUserId]);

  const selectedAccount = manageableAccounts.find(account => account.userId === selectedUserId);
  const delegatable = permissionData?.delegatablePermissions ?? [];
  const labelByCode = useMemo(() => {
    const map = new Map<string, string>();
    for (const definition of permissionData?.catalog ?? []) {
      map.set(definition.code, definition.labelKey);
      map.set(definition.legacyCode, definition.labelKey);
    }
    return map;
  }, [permissionData]);

  const basePermissions = selectedAccount
    ? permissionData?.rolePermissions?.[selectedAccount.role] ?? []
    : [];

  const togglePermission = (permission: string) => {
    setSelectedPermissions(previous =>
      previous.includes(permission)
        ? previous.filter(item => item !== permission)
        : [...previous, permission]
    );
  };

  const handleSave = async () => {
    if (!selectedUserId) return;
    setSaving(true);
    setError('');
    setSuccess('');
    try {
      await api.grantStaffPermissions(selectedUserId, selectedPermissions);
      setSuccess(t('permissionsSaved'));
      await load();
    } catch (err) {
      setError(errorMessage(err, t('permissionLoadError')));
    } finally {
      setSaving(false);
    }
  };

  const handleRevokeAll = async () => {
    if (!selectedUserId || !window.confirm(t('confirmRevokeAll'))) return;
    setSaving(true);
    setError('');
    setSuccess('');
    try {
      await api.revokeStaffPermissions(selectedUserId);
      setSuccess(t('permissionsRevoked'));
      await load();
    } catch (err) {
      setError(errorMessage(err, t('permissionLoadError')));
    } finally {
      setSaving(false);
    }
  };

  const translatePermission = (code: string): string => {
    const labelKey = labelByCode.get(code);
    return labelKey ? t(labelKey as TranslationKey) : code;
  };

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto space-y-6">
      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs">
        <div className="flex items-center gap-2">
          <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-indigo-100 text-indigo-800 flex items-center gap-1">
            <ShieldCheck className="w-3.5 h-3.5" />
            {t('headteacherWorkspace')}
          </span>
          <span className="text-xs text-slate-500">{t('serverEnforced')}</span>
        </div>
        <h1 className="text-2xl font-black text-slate-900 mt-1">{t('permissionsTitle')}</h1>
        <p className="text-xs text-slate-500 mt-0.5">{t('permissionsSubtitle')}</p>
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

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        <section className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs lg:col-span-1">
          <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
            <KeyRound className="w-4 h-4 text-blue-600" />
            {t('selectStaff')}
          </h2>
          {loading ? (
            <p className="mt-4 text-xs text-slate-500">{t('loading')}</p>
          ) : manageableAccounts.length === 0 ? (
            <p className="mt-4 text-xs text-slate-500">{t('noDelegatableStaff')}</p>
          ) : (
            <div className="mt-4 space-y-2">
              {manageableAccounts.map(account => (
                <button
                  key={account.id}
                  type="button"
                  onClick={() => {
                    setSelectedUserId(account.userId);
                    setSelectedPermissions(account.delegatedPermissions || []);
                  }}
                  className={`w-full rounded-xl border px-3 py-2 text-left transition-colors ${
                    selectedUserId === account.userId
                      ? 'border-blue-300 bg-blue-50'
                      : 'border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  <p className="text-[11px] font-bold text-slate-900">
                    {account.user?.fullName || t('unknownStaff')}
                  </p>
                  <p className="text-[10px] text-slate-500">
                    {getProfessionalTitle(account.role)}
                  </p>
                </button>
              ))}
            </div>
          )}
          <div className="mt-5 rounded-xl border border-slate-200 bg-slate-50 p-3">
            <p className="text-[10px] font-bold text-slate-700">{t('basePermissions')}</p>
            {basePermissions.length === 0 ? (
              <p className="mt-1 text-[10px] text-slate-500">—</p>
            ) : (
              <ul className="mt-1 space-y-1">
                {basePermissions.map(permission => (
                  <li key={permission} className="text-[10px] text-slate-600">
                    • {translatePermission(permission)}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>

        <section className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs lg:col-span-3">
          <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
            <LockKeyhole className="w-4 h-4 text-emerald-600" />
            {t('delegatedPermissions')}
          </h2>
          <p className="mt-1 text-[11px] text-slate-500">{t('permissionDelegateHelp')}</p>

          {!selectedAccount ? (
            <p className="mt-6 text-xs text-slate-500">{t('noDelegatableStaff')}</p>
          ) : delegatable.length === 0 ? (
            <p className="mt-6 text-xs text-slate-500">{t('noDelegatablePermissions')}</p>
          ) : (
            <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-2">
              {delegatable.map(permission => (
                <label
                  key={permission}
                  className="flex items-start gap-2 rounded-xl border border-slate-200 px-3 py-2 text-[11px] font-semibold text-slate-700 hover:bg-slate-50"
                >
                  <input
                    type="checkbox"
                    checked={selectedPermissions.includes(permission)}
                    onChange={() => togglePermission(permission)}
                    className="mt-0.5 h-3.5 w-3.5 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                  />
                  <span>
                    {translatePermission(permission)}
                    <span className="block font-mono text-[9px] font-normal text-slate-400">{permission}</span>
                  </span>
                </label>
              ))}
            </div>
          )}

          <div className="mt-5 flex flex-wrap gap-2 border-t border-slate-100 pt-4">
            <button
              type="button"
              disabled={!selectedAccount || saving}
              onClick={handleSave}
              className="rounded-xl bg-blue-700 px-4 py-2 text-xs font-bold text-white hover:bg-blue-800 disabled:opacity-60"
            >
              {saving ? t('saving') : t('savePermissions')}
            </button>
            <button
              type="button"
              disabled={!selectedAccount || saving || selectedPermissions.length === 0}
              onClick={handleRevokeAll}
              className="inline-flex items-center gap-1 rounded-xl border border-red-200 bg-red-50 px-4 py-2 text-xs font-bold text-red-700 disabled:opacity-60"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              {t('revokeAll')}
            </button>
          </div>
        </section>
      </div>
    </div>
  );
};
