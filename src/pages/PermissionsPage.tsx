import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../i18n/LanguageContext';
import type { TranslationKey } from '../i18n';
import { api, ApiError } from '../services/api';
import { getProfessionalTitle, isProtectedRole, isSchoolLeader } from '../roleCatalog';
import type {
  PermissionGrantRecord,
  PermissionGroup,
  PermissionsResponse,
  StaffAccountView,
  UserRole
} from '../types';
import {
  Archive,
  CalendarClock,
  History,
  KeyRound,
  LockKeyhole,
  Pencil,
  Plus,
  RotateCcw,
  ShieldCheck,
  Trash2
} from 'lucide-react';

function errorMessage(error: unknown, fallback: string): string {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error) return error.message;
  return fallback;
}

interface GroupFormState {
  editingId: string | null;
  name: string;
  description: string;
  permissions: string[];
  roleScope: UserRole[];
}

const emptyGroupForm = (): GroupFormState => ({
  editingId: null,
  name: '',
  description: '',
  permissions: [],
  roleScope: []
});

export const PermissionsPage: React.FC = () => {
  const { currentUser } = useAuth();
  const { t } = useLanguage();

  const [permissionData, setPermissionData] = useState<PermissionsResponse | null>(null);
  const [accounts, setAccounts] = useState<StaffAccountView[]>([]);
  const [groups, setGroups] = useState<PermissionGroup[]>([]);
  const [grants, setGrants] = useState<PermissionGrantRecord[]>([]);
  const [selectedUserId, setSelectedUserId] = useState('');
  const [selectedPermissions, setSelectedPermissions] = useState<string[]>([]);
  const [selectedRoleScope, setSelectedRoleScope] = useState<UserRole[]>([]);
  const [groupForm, setGroupForm] = useState<GroupFormState>(emptyGroupForm);
  const [applyGroupId, setApplyGroupId] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const [permissions, staffAccounts, permissionGroups] = await Promise.all([
        api.getPermissions(),
        api.getStaffAccounts(),
        api.getPermissionGroups()
      ]);
      setPermissionData(permissions);
      setAccounts(staffAccounts);
      setGroups(permissionGroups.filter(group => !group.archivedAt));
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

  const loadGrants = useCallback(async (userId: string) => {
    if (!userId) {
      setGrants([]);
      return;
    }
    try {
      const history = await api.getPermissionGrants(userId);
      setGrants(history);
    } catch (err) {
      setError(errorMessage(err, t('permissionLoadError')));
    }
  }, [t]);

  useEffect(() => {
    loadGrants(selectedUserId);
  }, [selectedUserId, loadGrants]);

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
      setSelectedRoleScope([]);
      return;
    }
    if (!manageableAccounts.some(account => account.userId === selectedUserId)) {
      const first = manageableAccounts[0];
      setSelectedUserId(first.userId);
      setSelectedPermissions(first.delegatedPermissions || []);
      setSelectedRoleScope(first.delegatedRoleScope || []);
    }
  }, [manageableAccounts, selectedUserId]);

  const selectedAccount = manageableAccounts.find(account => account.userId === selectedUserId);
  const isLeader =
    isSchoolLeader(currentUser?.role) ||
    currentUser?.role === 'SCHOOL_ADMIN' ||
    currentUser?.role === 'SUPER_ADMIN';
  const leaderOnly = permissionData?.leaderOnlyDelegatablePermissions ?? [];
  const delegatable = (permissionData?.delegatablePermissions ?? []).filter(
    permission => isLeader || !leaderOnly.includes(permission)
  );
  const staffCreationPermissions = ['staff.create', 'staff.assign_roles', 'invitations.manage'];
  const needsRoleScope = selectedPermissions.some(permission => staffCreationPermissions.includes(permission));
  const groupNeedsRoleScope = groupForm.permissions.some(permission => staffCreationPermissions.includes(permission));
  const roleScopeOptions = permissionData?.delegatableRoleScope ?? [];
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

  const translatePermission = (code: string): string => {
    const labelKey = labelByCode.get(code);
    return labelKey ? t(labelKey as TranslationKey) : code;
  };

  const notify = (message: string) => {
    setSuccess(message);
    setError('');
  };

  const fail = (err: unknown) => {
    setError(errorMessage(err, t('permissionLoadError')));
    setSuccess('');
  };

  const togglePermission = (permission: string) => {
    setSelectedPermissions(previous =>
      previous.includes(permission)
        ? previous.filter(item => item !== permission)
        : [...previous, permission]
    );
  };

  const handleSave = async () => {
    if (!selectedUserId) return;
    if (needsRoleScope && selectedRoleScope.length === 0) {
      setError(t('roleScopeRequired'));
      return;
    }
    setSaving(true);
    setError('');
    setSuccess('');
    try {
      await api.grantStaffPermissions(
        selectedUserId,
        selectedPermissions,
        needsRoleScope ? selectedRoleScope : undefined
      );
      notify(t('permissionsSaved'));
      await Promise.all([load(), loadGrants(selectedUserId)]);
    } catch (err) {
      fail(err);
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
      notify(t('permissionsRevoked'));
      await Promise.all([load(), loadGrants(selectedUserId)]);
    } catch (err) {
      fail(err);
    } finally {
      setSaving(false);
    }
  };

  const handleRevokeOne = async (permission: string) => {
    if (!selectedUserId || !window.confirm(t('confirmRevokePermission'))) return;
    setSaving(true);
    setError('');
    setSuccess('');
    try {
      await api.revokeStaffPermission(selectedUserId, permission);
      notify(t('permissionRevoked'));
      await Promise.all([load(), loadGrants(selectedUserId)]);
    } catch (err) {
      fail(err);
    } finally {
      setSaving(false);
    }
  };

  const toggleGroupPermission = (permission: string) => {
    setGroupForm(previous => ({
      ...previous,
      permissions: previous.permissions.includes(permission)
        ? previous.permissions.filter(item => item !== permission)
        : [...previous.permissions, permission]
    }));
  };

  const startGroupEdit = (group: PermissionGroup) => {
    setGroupForm({
      editingId: group.id,
      name: group.name,
      description: group.description || '',
      permissions: [...group.permissions],
      roleScope: [...(group.roleScope || [])]
    });
    setError('');
  };

  const resetGroupForm = () => setGroupForm(emptyGroupForm());

  const handleSaveGroup = async () => {
    const name = groupForm.name.trim();
    if (name.length < 2 || groupForm.permissions.length === 0) {
      setError(t('groupNameLabel'));
      return;
    }
    if (groupNeedsRoleScope && groupForm.roleScope.length === 0) {
      setError(t('roleScopeRequired'));
      return;
    }
    setSaving(true);
    setError('');
    setSuccess('');
    try {
      const payload = {
        name,
        description: groupForm.description.trim() || undefined,
        permissions: groupForm.permissions,
        roleScope: groupNeedsRoleScope ? groupForm.roleScope : undefined
      };
      if (groupForm.editingId) {
        await api.updatePermissionGroup(groupForm.editingId, payload);
        notify(t('groupUpdated'));
      } else {
        await api.createPermissionGroup(payload);
        notify(t('groupCreated'));
      }
      resetGroupForm();
      await load();
    } catch (err) {
      fail(err);
    } finally {
      setSaving(false);
    }
  };

  const handleArchiveGroup = async (group: PermissionGroup) => {
    if (!window.confirm(t('confirmArchiveGroup'))) return;
    setSaving(true);
    setError('');
    setSuccess('');
    try {
      await api.archivePermissionGroup(group.id);
      if (groupForm.editingId === group.id) resetGroupForm();
      if (applyGroupId === group.id) setApplyGroupId('');
      notify(t('groupArchived'));
      await load();
    } catch (err) {
      fail(err);
    } finally {
      setSaving(false);
    }
  };

  const handleApplyGroup = async () => {
    const group = groups.find(item => item.id === applyGroupId);
    if (!selectedUserId || !group) return;
    if (!window.confirm(`${t('applyGroup')}: ${group.name}?`)) return;
    setSaving(true);
    setError('');
    setSuccess('');
    try {
      const result = await api.assignPermissionGroup(group.id, selectedUserId);
      setSelectedPermissions(result.account?.delegatedPermissions || []);
      setSelectedRoleScope(result.account?.delegatedRoleScope || []);
      notify(t('groupApplied'));
      await Promise.all([load(), loadGrants(selectedUserId)]);
    } catch (err) {
      fail(err);
    } finally {
      setSaving(false);
    }
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
                    setSelectedRoleScope(account.delegatedRoleScope || []);
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
          {selectedAccount && selectedPermissions.length > 0 && (
            <div className="mt-4 rounded-xl border border-red-200 bg-red-50/60 p-3">
              <p className="text-[10px] font-bold text-red-800">{t('revokePermission')}</p>
              <div className="mt-2 space-y-1">
                {selectedPermissions.map(permission => (
                  <div key={permission} className="flex items-center justify-between gap-2 rounded-lg bg-white px-2 py-1.5">
                    <span className="min-w-0 truncate text-[10px] font-semibold text-slate-700">
                      {translatePermission(permission)}
                    </span>
                    <button
                      type="button"
                      disabled={saving}
                      onClick={() => handleRevokeOne(permission)}
                      className="shrink-0 rounded-md bg-red-100 px-1.5 py-0.5 text-[9px] font-bold text-red-700 hover:bg-red-200 disabled:opacity-60"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
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

          {needsRoleScope && (
            <div className="mt-5 rounded-xl border border-indigo-200 bg-indigo-50 p-4">
              <p className="text-[11px] font-bold text-indigo-900">{t('roleScopeTitle')}</p>
              <p className="mt-0.5 text-[10px] text-indigo-800">{t('roleScopeHelp')}</p>
              <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2">
                {roleScopeOptions.map(role => (
                  <label
                    key={role}
                    className="flex items-center gap-2 rounded-lg border border-indigo-200 bg-white px-2.5 py-1.5 text-[10px] font-semibold text-slate-700"
                  >
                    <input
                      type="checkbox"
                      checked={selectedRoleScope.includes(role)}
                      onChange={() =>
                        setSelectedRoleScope(previous =>
                          previous.includes(role)
                            ? previous.filter(item => item !== role)
                            : [...previous, role]
                        )
                      }
                      className="h-3.5 w-3.5 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                    />
                    {getProfessionalTitle(role)}
                  </label>
                ))}
              </div>
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

          {selectedAccount && groups.length > 0 && (
            <div className="mt-6 rounded-xl border border-indigo-200 bg-indigo-50/50 p-4">
              <p className="text-xs font-bold text-indigo-900">{t('applyGroup')}</p>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <select
                  value={applyGroupId}
                  onChange={event => setApplyGroupId(event.target.value)}
                  className="rounded-lg border border-indigo-200 bg-white px-3 py-2 text-[11px] font-semibold text-slate-700"
                >
                  <option value="">{t('selectAGroup')}</option>
                  {groups.map(group => (
                    <option key={group.id} value={group.id}>{group.name}</option>
                  ))}
                </select>
                <button
                  type="button"
                  disabled={!applyGroupId || saving}
                  onClick={handleApplyGroup}
                  className="rounded-lg bg-indigo-700 px-3 py-2 text-[11px] font-bold text-white hover:bg-indigo-800 disabled:opacity-60"
                >
                  {t('applyGroup')}
                </button>
              </div>
            </div>
          )}
        </section>
      </div>

      {/* Permission groups */}
      <section className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs">
        <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 text-blue-600" />
          {t('permissionGroups')}
        </h2>
        <p className="mt-1 text-[11px] text-slate-500">{t('permissionDelegateHelp')}</p>

        <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50/70 p-4">
          <p className="text-[11px] font-bold text-slate-800">
            {groupForm.editingId ? t('editingGroup') : t('createGroup')}
          </p>
          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1 block text-[10px] font-bold text-slate-600">{t('groupNameLabel')}</span>
              <input
                value={groupForm.name}
                onChange={event => setGroupForm(previous => ({ ...previous, name: event.target.value }))}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-[11px] text-slate-800"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-[10px] font-bold text-slate-600">{t('groupDescriptionLabel')}</span>
              <input
                value={groupForm.description}
                onChange={event => setGroupForm(previous => ({ ...previous, description: event.target.value }))}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-[11px] text-slate-800"
              />
            </label>
          </div>
          <p className="mt-4 mb-2 text-[10px] font-bold text-slate-600">{t('groupPermissions')}</p>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            {delegatable.map(permission => (
              <label
                key={permission}
                className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[10px] font-semibold text-slate-700"
              >
                <input
                  type="checkbox"
                  checked={groupForm.permissions.includes(permission)}
                  onChange={() => toggleGroupPermission(permission)}
                  className="h-3.5 w-3.5 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                />
                <span className="truncate">{translatePermission(permission)}</span>
              </label>
            ))}
          </div>
          {groupNeedsRoleScope && (
            <div className="mt-3 rounded-lg border border-indigo-200 bg-white p-3">
              <p className="text-[10px] font-bold text-indigo-800">{t('roleScopeTitle')}</p>
              <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-3">
                {roleScopeOptions.map(role => (
                  <label key={role} className="flex items-center gap-2 text-[10px] font-semibold text-slate-700">
                    <input
                      type="checkbox"
                      checked={groupForm.roleScope.includes(role)}
                      onChange={() =>
                        setGroupForm(previous => ({
                          ...previous,
                          roleScope: previous.roleScope.includes(role)
                            ? previous.roleScope.filter(item => item !== role)
                            : [...previous.roleScope, role]
                        }))
                      }
                      className="h-3.5 w-3.5 rounded border-slate-300 text-indigo-600"
                    />
                    {getProfessionalTitle(role)}
                  </label>
                ))}
              </div>
            </div>
          )}
          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              disabled={saving || groupForm.name.trim().length < 2 || groupForm.permissions.length === 0}
              onClick={handleSaveGroup}
              className="rounded-lg bg-blue-700 px-3 py-2 text-[11px] font-bold text-white hover:bg-blue-800 disabled:opacity-60"
            >
              {groupForm.editingId ? (
                <Pencil className="mr-1 inline h-3.5 w-3.5" />
              ) : (
                <Plus className="mr-1 inline h-3.5 w-3.5" />
              )}
              {groupForm.editingId ? t('saveGroup') : t('createGroup')}
            </button>
            {groupForm.editingId && (
              <button
                type="button"
                onClick={resetGroupForm}
                className="rounded-lg border border-slate-300 px-3 py-2 text-[11px] font-bold text-slate-600"
              >
                {t('cancelEdit')}
              </button>
            )}
          </div>
        </div>

        <div className="mt-5 grid grid-cols-1 gap-3 md:grid-cols-2">
          {groups.length === 0 ? (
            <p className="text-xs text-slate-500">{t('noGroups')}</p>
          ) : groups.map(group => (
            <div key={group.id} className="rounded-xl border border-slate-200 p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-[12px] font-bold text-slate-900">{group.name}</p>
                  {group.description && <p className="mt-0.5 text-[10px] text-slate-500">{group.description}</p>}
                </div>
                <div className="flex shrink-0 gap-1">
                  <button
                    type="button"
                    onClick={() => startGroupEdit(group)}
                    className="rounded-lg bg-blue-50 p-1.5 text-blue-700"
                    title={t('editingGroup')}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    disabled={saving}
                    onClick={() => handleArchiveGroup(group)}
                    className="rounded-lg bg-red-50 p-1.5 text-red-700"
                    title={t('archiveGroup')}
                  >
                    <Archive className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
              <div className="mt-3 flex flex-wrap gap-1">
                {group.permissions.map(permission => (
                  <span key={permission} className="rounded-full bg-slate-100 px-2 py-0.5 text-[9px] font-semibold text-slate-600">
                    {translatePermission(permission)}
                  </span>
                ))}
              </div>
              <p className="mt-3 flex items-center gap-1 text-[9px] text-slate-400">
                <CalendarClock className="h-3 w-3" />
                {new Date(group.createdAt).toLocaleString()}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* Grant history */}
      <section className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs">
        <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
          <History className="w-4 h-4 text-indigo-600" />
          {t('grantHistory')}
        </h2>
        {!selectedAccount ? (
          <p className="mt-4 text-xs text-slate-500">{t('selectStaff')}</p>
        ) : grants.length === 0 ? (
          <p className="mt-4 text-xs text-slate-500">{t('noGrantHistory')}</p>
        ) : (
          <div className="mt-4 space-y-3">
            {grants.map(grant => (
              <div key={grant.id} className="rounded-xl border border-slate-200 bg-slate-50/70 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-[11px] font-bold text-slate-800">
                    {grant.revokedAt ? t('revokePermission') : t('permissionGroups')}
                  </p>
                  <p className="text-[9px] text-slate-400">
                    <CalendarClock className="mr-1 inline h-3 w-3" />
                    {new Date(grant.revokedAt || grant.grantedAt).toLocaleString()}
                  </p>
                </div>
                <div className="mt-2 grid grid-cols-1 gap-2 text-[10px] sm:grid-cols-2">
                  <div>
                    <p className="font-bold text-slate-600">{t('grantedByLabel')}</p>
                    <p className="text-slate-700">{grant.grantedBy}</p>
                  </div>
                  <div>
                    <p className="font-bold text-slate-600">{t('previousPermissionsLabel')}</p>
                    <p className="text-slate-700">
                      {grant.previousPermissions.length
                        ? grant.previousPermissions.map(translatePermission).join(', ')
                        : '—'}
                    </p>
                  </div>
                </div>
                <div className="mt-2 flex flex-wrap gap-1">
                  {grant.permissions.map(permission => (
                    <span key={permission} className="rounded-full bg-blue-100 px-2 py-0.5 text-[9px] font-semibold text-blue-800">
                      {translatePermission(permission)}
                    </span>
                  ))}
                  {grant.permissions.length === 0 && (
                    <span className="text-[10px] text-slate-500">—</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
};
