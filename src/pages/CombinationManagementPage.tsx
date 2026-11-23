import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  Archive,
  ArrowLeft,
  BookOpen,
  CheckCircle2,
  Eye,
  GraduationCap,
  Layers,
  Pencil,
  Plus,
  RefreshCw,
  RotateCcw,
  Save,
  Search,
  Settings2,
  UserCheck,
  Users,
  X
} from 'lucide-react';
import { api, CombinationCatalogView, CombinationStudentsView, CombinationTeacherSummary } from '../services/api';
import type {
  AcademicCombination,
  CombinationStatus,
  CombinationView,
  CreateCombinationInput,
  Subject
} from '../types';
import { useLanguage } from '../i18n/LanguageContext';

type View = 'list' | 'details' | 'form' | 'subjects' | 'teachers' | 'students';
type StatusAction = 'ACTIVATE' | 'DEACTIVATE' | 'ARCHIVE' | 'RESTORE';

const INPUT = 'w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100';
const LABEL = 'block text-xs font-bold uppercase tracking-wide text-slate-500 mb-1.5';
const BUTTON = 'inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-bold transition';
const PRIMARY = `${BUTTON} bg-blue-700 text-white hover:bg-blue-800`;
const SECONDARY = `${BUTTON} bg-white text-slate-700 border border-slate-200 hover:bg-slate-50`;
const DANGER = `${BUTTON} bg-amber-50 text-amber-800 border border-amber-200 hover:bg-amber-100`;

const STATUS_STYLES: Record<CombinationStatus, string> = {
  ACTIVE: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  INACTIVE: 'bg-slate-100 text-slate-700 border-slate-200',
  ARCHIVED: 'bg-amber-100 text-amber-800 border-amber-200'
};

function emptyForm(year = ''): CreateCombinationInput {
  return {
    name: '',
    code: '',
    educationLevel: 'TVET RTB',
    academicProgramme: '',
    description: '',
    academicYear: year,
    status: 'ACTIVE',
    subjects: [],
    classIds: [],
    teacherIds: [],
    department: '',
    notes: ''
  };
}

function selectedValues(event: React.ChangeEvent<HTMLSelectElement>): string[] {
  return Array.from(event.currentTarget.selectedOptions).map(option => option.value);
}

interface Props {
  onNavigate?: (tab: string) => void;
}

export const CombinationManagementPage: React.FC<Props> = ({ onNavigate }) => {
  const { t } = useLanguage();
  const [view, setView] = useState<View>('list');
  const [combinations, setCombinations] = useState<CombinationView[]>([]);
  const [selected, setSelected] = useState<CombinationView | null>(null);
  const [catalog, setCatalog] = useState<CombinationCatalogView>({
    years: [], classes: [], archivedClasses: [], subjects: [], teachers: []
  });
  const [teacherSummaries, setTeacherSummaries] = useState<CombinationTeacherSummary[]>([]);
  const [students, setStudents] = useState<CombinationStudentsView | null>(null);
  const [filters, setFilters] = useState({
    search: '', status: '' as CombinationStatus | '', educationLevel: '', academicYear: '', includeArchived: true
  });
  const [form, setForm] = useState<CreateCombinationInput>(emptyForm());
  const [subjectDraft, setSubjectDraft] = useState<AcademicCombination['subjects']>([]);
  const [teacherDraft, setTeacherDraft] = useState<{ teacherIds: string[]; classTeacherId: string; subjects: AcademicCombination['subjects'] }>({
    teacherIds: [], classTeacherId: '', subjects: []
  });
  const [newSubject, setNewSubject] = useState({ name: '', code: '', department: '' });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);

  const message = (value: unknown) => value instanceof Error ? value.message : String(value);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [list, catalogData, summaries] = await Promise.all([
        api.getCombinations({
          includeArchived: filters.includeArchived,
          status: filters.status || undefined,
          educationLevel: filters.educationLevel || undefined,
          academicYear: filters.academicYear || undefined,
          search: filters.search || undefined
        }),
        api.getCombinationCatalog(),
        api.getCombinationTeacherSummary().catch(() => [] as CombinationTeacherSummary[])
      ]);
      setCombinations(list);
      setCatalog(catalogData);
      setTeacherSummaries(summaries);
      setForm(previous => previous.academicYear ? previous : emptyForm(catalogData.years[0]?.name ?? ''));
    } catch (err) {
      setError(message(err));
    } finally {
      setLoading(false);
    }
  }, [filters.includeArchived, filters.status, filters.educationLevel, filters.academicYear, filters.search]);

  useEffect(() => { void load(); }, [load]);

  const totals = useMemo(() => ({
    all: combinations.length,
    active: combinations.filter(item => item.status === 'ACTIVE').length,
    archived: combinations.filter(item => item.status === 'ARCHIVED').length,
    students: combinations.reduce((sum, item) => sum + item.studentCount, 0)
  }), [combinations]);

  const open = async (next: View, item?: CombinationView) => {
    setError('');
    setSuccess('');
    setView(next);
    if (!item) return;
    try {
      const fresh = await api.getCombination(item.id);
      setSelected(fresh);
      if (next === 'subjects') setSubjectDraft(fresh.subjects.map(entry => ({ ...entry, teacherIds: [...entry.teacherIds] })));
      if (next === 'teachers') {
        setTeacherDraft({
          teacherIds: [...fresh.teacherIds],
          classTeacherId: fresh.classTeacherId ?? '',
          subjects: fresh.subjects.map(entry => ({ ...entry, teacherIds: [...entry.teacherIds] }))
        });
      }
      if (next === 'students') {
        const data = await api.getCombinationStudents(item.id);
        setStudents(data);
      }
    } catch (err) {
      setError(message(err));
    }
  };

  const startCreate = () => {
    setEditingId(null);
    setForm(emptyForm(catalog.years[0]?.name ?? '2025 - 2026'));
    setError('');
    setSuccess('');
    setView('form');
  };

  const startEdit = async (item: CombinationView) => {
    await open('form', item);
    setEditingId(item.id);
    setForm({
      name: item.name,
      code: item.code,
      educationLevel: item.educationLevel,
      academicProgramme: item.academicProgramme,
      description: item.description ?? '',
      academicYear: item.academicYear,
      status: item.status,
      subjects: item.subjects.map(entry => ({ ...entry, teacherIds: [...entry.teacherIds] })),
      classIds: [...item.classIds],
      teacherIds: [...item.teacherIds],
      classTeacherId: item.classTeacherId,
      department: item.department ?? '',
      maxCapacity: item.maxCapacity,
      notes: item.notes ?? ''
    });
  };

  const resetFormAndStay = () => {
    setEditingId(null);
    setForm(emptyForm(catalog.years[0]?.name ?? '2025 - 2026'));
  };

  const saveForm = async (addAnother = false) => {
    setSaving(true);
    setError('');
    setSuccess('');
    try {
      const payload: CreateCombinationInput = {
        ...form,
        maxCapacity: form.maxCapacity === 0 ? undefined : form.maxCapacity
      };
      if (editingId) {
        const updated = await api.updateCombination(editingId, payload);
        setSelected(updated);
        setSuccess(`${updated.name} was updated.`);
        await load();
        if (!addAnother) setView('details');
      } else {
        const created = await api.createCombination(payload);
        setSelected(created);
        setSuccess(`${created.name} was created.`);
        await load();
        if (addAnother) resetFormAndStay();
        else setView('details');
      }
    } catch (err) {
      setError(message(err));
    } finally {
      setSaving(false);
    }
  };

  const toggleSubject = (subjectId: string) => {
    setForm(previous => {
      const exists = (previous.subjects ?? []).some(item => item.subjectId === subjectId);
      return {
        ...previous,
        subjects: exists
          ? (previous.subjects ?? []).filter(item => item.subjectId !== subjectId)
          : [...(previous.subjects ?? []), { subjectId, isRequired: true, teacherIds: [] }]
      };
    });
  };

  const toggleClass = (classId: string) => {
    setForm(previous => ({
      ...previous,
      classIds: previous.classIds?.includes(classId)
        ? previous.classIds.filter(item => item !== classId)
        : [...(previous.classIds ?? []), classId]
    }));
  };

  const createSubject = async () => {
    if (!newSubject.name.trim() || !newSubject.code.trim()) {
      setError('Subject name and code are required.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const subject = await api.createCombinationSubject(newSubject);
      setCatalog(previous => ({ ...previous, subjects: [subject, ...previous.subjects] }));
      setNewSubject({ name: '', code: '', department: '' });
      setSuccess(`${subject.name} was added to the subject catalogue.`);
    } catch (err) {
      setError(message(err));
    } finally {
      setSaving(false);
    }
  };

  const saveSubjects = async () => {
    if (!selected) return;
    setSaving(true);
    setError('');
    try {
      const updated = await api.updateCombinationSubjects(selected.id, subjectDraft);
      setSelected(updated);
      setSuccess('Combination subjects were updated.');
      await load();
      setView('details');
    } catch (err) {
      setError(message(err));
    } finally {
      setSaving(false);
    }
  };

  const saveTeachers = async () => {
    if (!selected) return;
    setSaving(true);
    setError('');
    try {
      const updated = await api.assignCombinationTeachers(selected.id, teacherDraft);
      setSelected(updated);
      setSuccess('Teacher assignments were updated.');
      await load();
      setView('details');
    } catch (err) {
      setError(message(err));
    } finally {
      setSaving(false);
    }
  };

  const changeStatus = async (item: CombinationView, action: StatusAction) => {
    if (action === 'ARCHIVE' && !window.confirm(
      `Archive ${item.name}? Historical students, marks and report cards are preserved, but new registrations are blocked.`
    )) return;
    setSaving(true);
    setError('');
    try {
      const result = await api.setCombinationStatus(item.id, action);
      setSelected(result);
      setSuccess(`${item.name} is now ${result.status.toLowerCase()}. ${result.dependentRecords?.students ?? 0} student record(s) preserved.`);
      await load();
      setView('details');
    } catch (err) {
      setError(message(err));
    } finally {
      setSaving(false);
    }
  };

  const statusBadge = (status: CombinationStatus) => (
    <span className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-bold ${STATUS_STYLES[status] ?? STATUS_STYLES.INACTIVE}`}>
      {status}
    </span>
  );

  const actionButton = (item: CombinationView, action: StatusAction, Icon: React.ComponentType<{ size?: number; className?: string }>, label: string) => (
    <button type="button" onClick={() => void changeStatus(item, action)} disabled={saving} className={DANGER} title={label}>
      <Icon size={13} /> {label}
    </button>
  );

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black text-slate-900">{t('navCombinationManagement')}</h1>
          <p className="mt-1 text-sm text-slate-500">
            Manage active and archived academic combinations, their classes, subjects, teachers and student intake.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={() => void load()} className={SECONDARY} disabled={loading}>
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Refresh
          </button>
          {view === 'list' && <button type="button" onClick={startCreate} className={PRIMARY}><Plus size={15} /> Add New Combination</button>}
        </div>
      </div>

      {error && (
        <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">
          <AlertCircle size={16} className="mt-0.5 shrink-0" /> {error}
        </div>
      )}
      {success && (
        <div className="flex items-start gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
          <CheckCircle2 size={16} className="mt-0.5 shrink-0" /> {success}
        </div>
      )}

      {view === 'list' && (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {[
              ['All combinations', totals.all, Layers, 'bg-blue-50 text-blue-700'],
              ['Active', totals.active, CheckCircle2, 'bg-emerald-50 text-emerald-700'],
              ['Archived', totals.archived, Archive, 'bg-amber-50 text-amber-700'],
              ['Students in programmes', totals.students, Users, 'bg-indigo-50 text-indigo-700']
            ].map(([label, value, Icon, color]) => {
              const IconComponent = Icon as React.ComponentType<{ size?: number }>;
              return (
                <div key={String(label)} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold uppercase tracking-wide text-slate-500">{label as string}</span>
                    <span className={`flex h-9 w-9 items-center justify-center rounded-xl ${color as string}`}>
                      <IconComponent size={17} />
                    </span>
                  </div>
                  <p className="mt-3 text-2xl font-black text-slate-900">{value as number}</p>
                </div>
              );
            })}
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
              <label className="md:col-span-2 xl:col-span-1">
                <span className={LABEL}>Search</span>
                <span className="relative block">
                  <Search size={15} className="absolute left-3 top-2.5 text-slate-400" />
                  <input
                    value={filters.search}
                    onChange={event => setFilters(previous => ({ ...previous, search: event.target.value }))}
                    placeholder="Name, code or programme"
                    className={`${INPUT} pl-9`}
                  />
                </span>
              </label>
              <label>
                <span className={LABEL}>Status</span>
                <select value={filters.status} onChange={event => setFilters(previous => ({ ...previous, status: event.target.value as CombinationStatus | '' }))} className={INPUT}>
                  <option value="">All statuses</option>
                  <option value="ACTIVE">Active</option>
                  <option value="INACTIVE">Inactive</option>
                  <option value="ARCHIVED">Archived</option>
                </select>
              </label>
              <label>
                <span className={LABEL}>Education level</span>
                <select value={filters.educationLevel} onChange={event => setFilters(previous => ({ ...previous, educationLevel: event.target.value }))} className={INPUT}>
                  <option value="">All levels</option>
                  {Array.from(new Set(combinations.map(item => item.educationLevel).filter(Boolean))).map(level => (
                    <option key={level} value={level}>{level}</option>
                  ))}
                </select>
              </label>
              <label>
                <span className={LABEL}>Academic year</span>
                <select value={filters.academicYear} onChange={event => setFilters(previous => ({ ...previous, academicYear: event.target.value }))} className={INPUT}>
                  <option value="">All years</option>
                  {catalog.years.map(year => <option key={year.id} value={year.name}>{year.name}</option>)}
                </select>
              </label>
              <label className="flex items-end gap-2 pb-2 text-xs font-semibold text-slate-600">
                <input
                  type="checkbox"
                  checked={filters.includeArchived}
                  onChange={event => setFilters(previous => ({ ...previous, includeArchived: event.target.checked }))}
                />
                Include archived
              </label>
            </div>
          </div>

          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-100 text-left text-sm">
                <thead className="bg-slate-50 text-[11px] uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-4 py-3 font-bold">Combination</th>
                    <th className="px-4 py-3 font-bold">Level / Programme</th>
                    <th className="px-4 py-3 font-bold">Classes</th>
                    <th className="px-4 py-3 font-bold">Subjects</th>
                    <th className="px-4 py-3 font-bold">Students</th>
                    <th className="px-4 py-3 font-bold">Teachers</th>
                    <th className="px-4 py-3 font-bold">Status</th>
                    <th className="px-4 py-3 font-bold">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {combinations.map(item => (
                    <tr key={item.id} className="hover:bg-slate-50/70">
                      <td className="px-4 py-3">
                        <p className="font-bold text-slate-900">{item.name}</p>
                        <p className="text-[11px] text-slate-500">{item.code} • {item.academicYear}</p>
                      </td>
                      <td className="px-4 py-3">
                        <p className="text-slate-700">{item.educationLevel}</p>
                        <p className="text-[11px] text-slate-500">{item.academicProgramme}</p>
                      </td>
                      <td className="px-4 py-3 text-slate-700">{item.classes.length}</td>
                      <td className="px-4 py-3 text-slate-700">{item.subjectDetails.length}</td>
                      <td className="px-4 py-3 font-semibold text-blue-700">{item.studentCount}</td>
                      <td className="px-4 py-3 text-slate-700">{item.teacherDetails.length}</td>
                      <td className="px-4 py-3">{statusBadge(item.status)}</td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-1.5">
                          <button type="button" onClick={() => void open('details', item)} className={SECONDARY}><Eye size={13} /> View</button>
                          <button type="button" onClick={() => void startEdit(item)} className={SECONDARY}><Pencil size={13} /> Edit</button>
                          <button type="button" onClick={() => void open('subjects', item)} className={SECONDARY}><BookOpen size={13} /> Subjects</button>
                          <button type="button" onClick={() => void open('teachers', item)} className={SECONDARY}><UserCheck size={13} /> Teachers</button>
                          <button type="button" onClick={() => void open('students', item)} className={SECONDARY}><Users size={13} /> Students</button>
                          {item.status !== 'ACTIVE' && actionButton(item, 'ACTIVATE', CheckCircle2, 'Activate')}
                          {item.status === 'ACTIVE' && actionButton(item, 'DEACTIVATE', Settings2, 'Deactivate')}
                          {item.status !== 'ARCHIVED' && actionButton(item, 'ARCHIVE', Archive, 'Archive')}
                          {item.status === 'ARCHIVED' && actionButton(item, 'RESTORE', RotateCcw, 'Restore')}
                        </div>
                      </td>
                    </tr>
                  ))}
                  {!loading && combinations.length === 0 && (
                    <tr><td colSpan={8} className="px-4 py-10 text-center text-slate-500">No combinations match these filters.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {view === 'details' && selected && (
        <div className="space-y-5">
          <button type="button" onClick={() => setView('list')} className={SECONDARY}><ArrowLeft size={14} /> Back to combinations</button>
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-xs font-bold uppercase tracking-wide text-blue-700">{selected.code}</p>
                <h2 className="text-xl font-black text-slate-900">{selected.name}</h2>
                <p className="mt-1 text-sm text-slate-500">{selected.educationLevel} • {selected.academicProgramme} • {selected.academicYear}</p>
              </div>
              {statusBadge(selected.status)}
            </div>
            <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {[
                ['Students', selected.studentCount], ['Classes', selected.classes.length],
                ['Subjects', selected.subjectDetails.length], ['Teachers', selected.teacherDetails.length]
              ].map(([label, value]) => (
                <div key={String(label)} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <p className="text-[11px] font-bold uppercase text-slate-500">{label}</p>
                  <p className="mt-1 text-xl font-black text-slate-900">{value}</p>
                </div>
              ))}
            </div>
            <div className="mt-5 flex flex-wrap gap-2">
              <button type="button" onClick={() => void startEdit(selected)} className={PRIMARY}><Pencil size={14} /> Edit</button>
              <button type="button" onClick={() => void open('subjects', selected)} className={SECONDARY}><BookOpen size={14} /> Update Subjects</button>
              <button type="button" onClick={() => void open('teachers', selected)} className={SECONDARY}><UserCheck size={14} /> Assign Teachers</button>
              <button type="button" onClick={() => void open('students', selected)} className={SECONDARY}><Users size={14} /> View Students</button>
              {selected.status !== 'ACTIVE' && actionButton(selected, 'ACTIVATE', CheckCircle2, 'Activate')}
              {selected.status === 'ACTIVE' && actionButton(selected, 'DEACTIVATE', Settings2, 'Deactivate')}
              {selected.status !== 'ARCHIVED' && actionButton(selected, 'ARCHIVE', Archive, 'Archive')}
              {selected.status === 'ARCHIVED' && actionButton(selected, 'RESTORE', RotateCcw, 'Restore')}
            </div>
          </div>

          <div className="grid gap-5 lg:grid-cols-2">
            <DetailCard title="Classes & levels" icon={GraduationCap}>
              {selected.classes.length ? selected.classes.map(classItem => (
                <div key={classItem.id} className="flex items-center justify-between rounded-xl border border-slate-100 bg-slate-50 p-3">
                  <div><p className="text-sm font-bold text-slate-800">{classItem.name}</p><p className="text-[11px] text-slate-500">{classItem.grade}</p></div>
                  <span className={`text-[10px] font-bold ${classItem.status === 'ACTIVE' ? 'text-emerald-700' : 'text-amber-700'}`}>{classItem.status}</span>
                </div>
              )) : <Empty text="No classes linked." />}
            </DetailCard>

            <DetailCard title="Subjects" icon={BookOpen}>
              {selected.subjectDetails.length ? selected.subjectDetails.map(subject => (
                <div key={subject.subjectId} className="rounded-xl border border-slate-100 bg-slate-50 p-3">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-bold text-slate-800">{subject.name}</p>
                    <span className="text-[10px] font-bold text-slate-500">{subject.isRequired ? 'REQUIRED' : 'OPTIONAL'}</span>
                  </div>
                  <p className="text-[11px] text-slate-500">{subject.code} • {subject.teacherNames.length ? subject.teacherNames.join(', ') : 'No teacher assigned'}</p>
                </div>
              )) : <Empty text="No subjects linked." />}
            </DetailCard>
          </div>

          <DetailCard title="Teachers" icon={UserCheck}>
            {selected.teacherDetails.length || selected.classTeacher ? (
              <div className="flex flex-wrap gap-2">
                {selected.classTeacher && <span className="rounded-full border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs font-bold text-blue-800">Class teacher: {selected.classTeacher.fullName}</span>}
                {selected.teacherDetails.map(teacher => (
                  <span key={teacher.id} className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700">{teacher.fullName}</span>
                ))}
              </div>
            ) : <Empty text="No teachers assigned yet." />}
          </DetailCard>
        </div>
      )}

      {view === 'form' && (
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-black text-slate-900">{editingId ? 'Edit combination' : 'Add new combination'}</h2>
              <p className="text-xs text-slate-500">School-scoped details only. Archived options never appear in new registrations.</p>
            </div>
            <button type="button" onClick={() => setView('list')} className={SECONDARY}><X size={14} /> Cancel</button>
          </div>

          <FormSection title="Combination Information" icon={Layers}>
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Combination name *"><input className={INPUT} value={form.name} onChange={event => setForm({ ...form, name: event.target.value })} placeholder="e.g. Software Development (SOD)" /></Field>
              <Field label="Code *"><input className={INPUT} value={form.code} onChange={event => setForm({ ...form, code: event.target.value.toUpperCase() })} placeholder="SOD" /></Field>
              <Field label="Education level *">
                <select className={INPUT} value={form.educationLevel} onChange={event => setForm({ ...form, educationLevel: event.target.value })}>
                  {Array.from(new Set(['TVET RTB', 'O-Level', ...combinations.map(item => item.educationLevel)])).filter(Boolean).map(level => <option key={level} value={level}>{level}</option>)}
                </select>
              </Field>
              <Field label="Academic programme *"><input className={INPUT} value={form.academicProgramme} onChange={event => setForm({ ...form, academicProgramme: event.target.value })} placeholder="Software Development" /></Field>
              <Field label="Academic year *">
                <select className={INPUT} value={form.academicYear} onChange={event => setForm({ ...form, academicYear: event.target.value })}>
                  {catalog.years.map(year => <option key={year.id} value={year.name}>{year.name}</option>)}
                  {!catalog.years.length && <option value="">No academic year configured</option>}
                </select>
              </Field>
              <Field label="Status">
                <select className={INPUT} value={form.status} onChange={event => setForm({ ...form, status: event.target.value as CombinationStatus })}>
                  <option value="ACTIVE">Active</option><option value="INACTIVE">Inactive</option><option value="ARCHIVED">Archived</option>
                </select>
              </Field>
              <Field label="Description"><textarea rows={3} className={INPUT} value={form.description ?? ''} onChange={event => setForm({ ...form, description: event.target.value })} /></Field>
            </div>
          </FormSection>

          <FormSection title="Subjects" icon={BookOpen}>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {catalog.subjects.map(subject => {
                const checked = (form.subjects ?? []).some(item => item.subjectId === subject.id);
                return (
                  <label key={subject.id} className={`flex items-start gap-2 rounded-xl border p-3 text-sm ${checked ? 'border-blue-300 bg-blue-50' : 'border-slate-200'}`}>
                    <input type="checkbox" className="mt-1" checked={checked} onChange={() => toggleSubject(subject.id)} />
                    <span><span className="block font-bold text-slate-800">{subject.name}</span><span className="text-[11px] text-slate-500">{subject.code} • {subject.department}</span></span>
                  </label>
                );
              })}
              {!catalog.subjects.length && <Empty text="No subjects in the catalogue." />}
            </div>
            {(form.subjects ?? []).length > 0 && (
              <div className="mt-4 grid gap-3 md:grid-cols-2">
                {(form.subjects ?? []).map(subject => (
                  <div key={subject.subjectId} className="rounded-xl border border-slate-200 p-3">
                    <p className="text-sm font-bold text-slate-800">{catalog.subjects.find(item => item.id === subject.subjectId)?.name ?? subject.subjectId}</p>
                    <label className="mt-2 flex items-center gap-2 text-xs text-slate-600">
                      <input type="checkbox" checked={subject.isRequired} onChange={event => setForm(previous => ({
                        ...previous,
                        subjects: (previous.subjects ?? []).map(item => item.subjectId === subject.subjectId ? { ...item, isRequired: event.target.checked } : item)
                      }))} /> Required subject
                    </label>
                    <select multiple value={subject.teacherIds} onChange={event => setForm(previous => ({
                      ...previous,
                      subjects: (previous.subjects ?? []).map(item => item.subjectId === subject.subjectId
                        ? { ...item, teacherIds: selectedValues(event) } : item)
                    }))} className={`${INPUT} mt-2 h-24`}>
                      {catalog.teachers.map(teacher => <option key={teacher.id} value={teacher.id}>{teacher.fullName}</option>)}
                    </select>
                  </div>
                ))}
              </div>
            )}
            <div className="mt-4 rounded-xl border border-dashed border-slate-300 p-3">
              <p className="mb-2 text-xs font-bold uppercase text-slate-500">Add a subject to the catalogue</p>
              <div className="grid gap-2 sm:grid-cols-4">
                <input className={INPUT} placeholder="Subject name" value={newSubject.name} onChange={event => setNewSubject({ ...newSubject, name: event.target.value })} />
                <input className={INPUT} placeholder="Code" value={newSubject.code} onChange={event => setNewSubject({ ...newSubject, code: event.target.value })} />
                <input className={INPUT} placeholder="Department" value={newSubject.department} onChange={event => setNewSubject({ ...newSubject, department: event.target.value })} />
                <button type="button" onClick={() => void createSubject()} disabled={saving} className={SECONDARY}><Plus size={14} /> Add subject</button>
              </div>
            </div>
          </FormSection>

          <FormSection title="Class and Level" icon={GraduationCap}>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {catalog.classes.map(classItem => (
                <label key={classItem.id} className={`flex items-start gap-2 rounded-xl border p-3 text-sm ${form.classIds?.includes(classItem.id) ? 'border-blue-300 bg-blue-50' : 'border-slate-200'}`}>
                  <input type="checkbox" className="mt-1" checked={form.classIds?.includes(classItem.id) ?? false} onChange={() => toggleClass(classItem.id)} />
                  <span><span className="block font-bold text-slate-800">{classItem.name}</span><span className="text-[11px] text-slate-500">{classItem.grade} • {classItem.stream}</span></span>
                </label>
              ))}
              {!catalog.classes.length && <Empty text="No active classes available." />}
            </div>
            {catalog.archivedClasses.length > 0 && (
              <p className="mt-3 rounded-lg bg-amber-50 p-3 text-xs text-amber-800">
                Archived classes are hidden from new registration: {catalog.archivedClasses.map(item => item.name).join(', ')}.
              </p>
            )}
          </FormSection>

          <FormSection title="Additional Information" icon={Settings2}>
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Department"><input className={INPUT} value={form.department ?? ''} onChange={event => setForm({ ...form, department: event.target.value })} /></Field>
              <Field label="Maximum capacity"><input type="number" min={0} className={INPUT} value={form.maxCapacity ?? ''} onChange={event => setForm({ ...form, maxCapacity: event.target.value === '' ? undefined : Number(event.target.value) })} /></Field>
              <Field label="Class teacher">
                <select className={INPUT} value={form.classTeacherId ?? ''} onChange={event => setForm({ ...form, classTeacherId: event.target.value || undefined })}>
                  <option value="">Unassigned</option>
                  {catalog.teachers.map(teacher => <option key={teacher.id} value={teacher.id}>{teacher.fullName}</option>)}
                </select>
              </Field>
              <Field label="Combination teachers">
                <select multiple className={`${INPUT} h-24`} value={form.teacherIds ?? []} onChange={event => setForm({ ...form, teacherIds: selectedValues(event) })}>
                  {catalog.teachers.map(teacher => <option key={teacher.id} value={teacher.id}>{teacher.fullName}</option>)}
                </select>
              </Field>
              <Field label="Notes"><textarea rows={3} className={INPUT} value={form.notes ?? ''} onChange={event => setForm({ ...form, notes: event.target.value })} /></Field>
            </div>
          </FormSection>

          <div className="mt-6 flex flex-wrap gap-2 border-t border-slate-100 pt-5">
            <button type="button" onClick={() => void saveForm(false)} disabled={saving} className={PRIMARY}><Save size={15} /> {editingId ? 'Save Combination' : 'Save Combination'}</button>
            {!editingId && <button type="button" onClick={() => void saveForm(true)} disabled={saving} className={SECONDARY}><Plus size={14} /> Save and Add Another</button>}
            <button type="button" onClick={() => setView('list')} className={SECONDARY}>Cancel</button>
          </div>
        </div>
      )}

      {view === 'subjects' && selected && (
        <EditorCard title={`Update subjects — ${selected.name}`} onBack={() => setView('details')} onSave={() => void saveSubjects()} saving={saving}>
          <div className="grid gap-3 md:grid-cols-2">
            {catalog.subjects.map(subject => {
              const draft = subjectDraft.find(item => item.subjectId === subject.id);
              return (
                <div key={subject.id} className={`rounded-xl border p-3 ${draft ? 'border-blue-300 bg-blue-50' : 'border-slate-200'}`}>
                  <label className="flex items-center gap-2 text-sm font-bold text-slate-800">
                    <input
                      type="checkbox"
                      checked={Boolean(draft)}
                      onChange={event => setSubjectDraft(previous => event.target.checked
                        ? [...previous, { subjectId: subject.id, isRequired: true, teacherIds: [] }]
                        : previous.filter(item => item.subjectId !== subject.id))}
                    />
                    {subject.name}
                  </label>
                  {draft && (
                    <div className="mt-3 space-y-2">
                      <label className="flex items-center gap-2 text-xs text-slate-600">
                        <input type="checkbox" checked={draft.isRequired} onChange={event => setSubjectDraft(previous => previous.map(item => item.subjectId === subject.id ? { ...item, isRequired: event.target.checked } : item))} />
                        Required
                      </label>
                      <select multiple className={`${INPUT} h-24`} value={draft.teacherIds} onChange={event => setSubjectDraft(previous => previous.map(item => item.subjectId === subject.id ? { ...item, teacherIds: selectedValues(event) } : item))}>
                        {catalog.teachers.map(teacher => <option key={teacher.id} value={teacher.id}>{teacher.fullName}</option>)}
                      </select>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </EditorCard>
      )}

      {view === 'teachers' && selected && (
        <EditorCard title={`Assign teachers — ${selected.name}`} onBack={() => setView('details')} onSave={() => void saveTeachers()} saving={saving}>
          <div className="grid gap-4 lg:grid-cols-2">
            <div>
              <Field label="Combination teachers">
                <select multiple className={`${INPUT} h-40`} value={teacherDraft.teacherIds} onChange={event => setTeacherDraft({ ...teacherDraft, teacherIds: selectedValues(event) })}>
                  {catalog.teachers.map(teacher => <option key={teacher.id} value={teacher.id}>{teacher.fullName} — {teacher.role}</option>)}
                </select>
              </Field>
              <Field label="Class teacher">
                <select className={INPUT} value={teacherDraft.classTeacherId} onChange={event => setTeacherDraft({ ...teacherDraft, classTeacherId: event.target.value })}>
                  <option value="">Unassigned</option>
                  {catalog.teachers.map(teacher => <option key={teacher.id} value={teacher.id}>{teacher.fullName}</option>)}
                </select>
              </Field>
            </div>
            <div>
              <p className={LABEL}>Per-subject teachers</p>
              <div className="space-y-2">
                {teacherDraft.subjects.map(subject => (
                  <div key={subject.subjectId} className="rounded-xl border border-slate-200 p-3">
                    <p className="text-sm font-bold text-slate-800">{catalog.subjects.find(item => item.id === subject.subjectId)?.name ?? subject.subjectId}</p>
                    <select multiple className={`${INPUT} mt-2 h-24`} value={subject.teacherIds} onChange={event => setTeacherDraft(previous => ({
                      ...previous,
                      subjects: previous.subjects.map(item => item.subjectId === subject.subjectId ? { ...item, teacherIds: selectedValues(event) } : item)
                    }))}>
                      {catalog.teachers.map(teacher => <option key={teacher.id} value={teacher.id}>{teacher.fullName}</option>)}
                    </select>
                  </div>
                ))}
                {!teacherDraft.subjects.length && <Empty text="Add subjects before assigning subject teachers." />}
              </div>
            </div>
          </div>
          {teacherSummaries.length > 0 && (
            <div className="mt-5 rounded-xl border border-slate-200 bg-slate-50 p-3">
              <p className="mb-2 text-xs font-bold uppercase text-slate-500">Teacher workload overview</p>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {teacherSummaries.map(teacher => (
                  <div key={teacher.id} className="rounded-lg bg-white p-2 text-xs text-slate-700">
                    <p className="font-bold">{teacher.fullName}</p>
                    <p className="text-slate-500">{teacher.combinations.length} combination(s) • {teacher.subjects.length} subject(s)</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </EditorCard>
      )}

      {view === 'students' && selected && (
        <div className="space-y-5">
          <button type="button" onClick={() => setView('details')} className={SECONDARY}><ArrowLeft size={14} /> Back to details</button>
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-black text-slate-900">Students — {selected.name}</h2>
                <p className="text-xs text-slate-500">{students?.studentCount ?? 0} historical and active student record(s) preserved.</p>
              </div>
              {onNavigate && <button type="button" onClick={() => onNavigate('students')} className={PRIMARY}><Users size={14} /> Open Student Registry</button>}
            </div>
            <div className="mt-4 overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-100 text-left text-sm">
                <thead className="bg-slate-50 text-[11px] uppercase text-slate-500">
                  <tr><th className="px-3 py-2 font-bold">Admission no.</th><th className="px-3 py-2 font-bold">Name</th><th className="px-3 py-2 font-bold">Class</th><th className="px-3 py-2 font-bold">Combination</th><th className="px-3 py-2 font-bold">Status</th></tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {(students?.students ?? []).map(student => (
                    <tr key={student.id}>
                      <td className="px-3 py-2 font-semibold text-blue-700">{student.admissionNumber}</td>
                      <td className="px-3 py-2">{student.fullName}</td>
                      <td className="px-3 py-2">{student.className}</td>
                      <td className="px-3 py-2">{student.combination}</td>
                      <td className="px-3 py-2">{student.archivedAt ? 'Archived' : student.enrollmentStatus}</td>
                    </tr>
                  ))}
                  {!students?.students.length && <tr><td colSpan={5} className="px-3 py-8 text-center text-slate-500">No students linked to this combination.</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const Field: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <label><span className={LABEL}>{label}</span>{children}</label>
);

const FormSection: React.FC<{ title: string; icon: React.ComponentType<{ size?: number; className?: string }>; children: React.ReactNode }> = ({ title, icon: Icon, children }) => (
  <section className="mt-6 rounded-2xl border border-slate-200 p-4">
    <h3 className="mb-4 flex items-center gap-2 text-sm font-black text-slate-900"><Icon size={16} className="text-blue-700" /> {title}</h3>
    {children}
  </section>
);

const DetailCard: React.FC<{ title: string; icon: React.ComponentType<{ size?: number; className?: string }>; children: React.ReactNode }> = ({ title, icon: Icon, children }) => (
  <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
    <h3 className="mb-3 flex items-center gap-2 text-sm font-black text-slate-900"><Icon size={16} className="text-blue-700" /> {title}</h3>
    <div className="space-y-2">{children}</div>
  </section>
);

const EditorCard: React.FC<{
  title: string; onBack: () => void; onSave: () => void; saving: boolean; children: React.ReactNode;
}> = ({ title, onBack, onSave, saving, children }) => (
  <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
    <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
      <h2 className="text-lg font-black text-slate-900">{title}</h2>
      <div className="flex gap-2">
        <button type="button" onClick={onBack} className={SECONDARY}><ArrowLeft size={14} /> Back</button>
        <button type="button" onClick={onSave} disabled={saving} className={PRIMARY}><Save size={14} /> Save changes</button>
      </div>
    </div>
    {children}
  </div>
);

const Empty: React.FC<{ text: string }> = ({ text }) => (
  <p className="rounded-xl border border-dashed border-slate-200 p-4 text-center text-xs text-slate-500">{text}</p>
);
