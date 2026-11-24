import React, { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { api, MarksEntryView } from '../services/api';
import type {
  AcademicTerm,
  AcademicYear,
  ClassSubjectAssignmentView,
  MarkAttendanceStatus
} from '../types';
import { SearchableSelect, type SearchableOption } from '../components/SearchableSelect';
import { NO_ASSIGNMENT_MESSAGE } from '../teacherMarksMessages';
import {
  AlertCircle,
  BookOpen,
  CheckCircle2,
  ClipboardList,
  Clock,
  Send,
  Save,
  TrendingUp
} from 'lucide-react';

type CellKey = string;

const cellKey = (studentId: string, categoryId: string): CellKey => `${studentId}:${categoryId}`;

interface TeacherAcademicsPageProps {
  title?: string;
  description?: string;
}

type TeacherAssignmentView = ClassSubjectAssignmentView & { status: string };

interface ChainOption extends SearchableOption {
  detail?: string;
}

function uniqueOptions(items: ChainOption[]): ChainOption[] {
  return Array.from(new Map(items.filter(item => item.id).map(item => [item.id, item])).values());
}

export const TeacherAcademicsPage: React.FC<TeacherAcademicsPageProps> = ({
  title = 'My Academic Work',
  description = 'Enter marks only for classes and subjects assigned to you for the selected term.'
}) => {
  const { currentUser } = useAuth();

  const [years, setYears] = useState<AcademicYear[]>([]);
  const [terms, setTerms] = useState<AcademicTerm[]>([]);
  const [yearId, setYearId] = useState('');
  const [termId, setTermId] = useState('');
  const [assignments, setAssignments] = useState<TeacherAssignmentView[]>([]);
  const [combinationId, setCombinationId] = useState('');
  const [levelId, setLevelId] = useState('');
  const [classId, setClassId] = useState('');
  const [subjectId, setSubjectId] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [entry, setEntry] = useState<MarksEntryView | null>(null);
  const [scores, setScores] = useState<Record<CellKey, string>>({});
  const [attendance, setAttendance] = useState<Record<CellKey, MarkAttendanceStatus>>({});
  const [remarks, setRemarks] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    const load = async () => {
      try {
        const [yearList, termList, workspace] = await Promise.all([
          api.getAcademicYears(), api.getTerms(), api.getMyAssignments()
        ]);
        setYears(yearList);
        setTerms(termList);
        setYearId(workspace.year?.id || yearList.find(y => y.isActive)?.id || yearList[0]?.id || '');
        setTermId(workspace.term?.id || termList.find(t => t.isActive)?.id || termList[0]?.id || '');
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load academic workspace.');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  useEffect(() => {
    if (!yearId) return;
    let active = true;
    api.getTerms(yearId).then(data => {
      if (!active) return;
      setTerms(data);
      setTermId(current => data.some(term => term.id === current)
        ? current
        : data.find(term => term.isActive)?.id || data[0]?.id || '');
    }).catch(err => {
      if (active) setError(err instanceof Error ? err.message : 'Failed to load terms.');
    });
    return () => { active = false; };
  }, [yearId]);

  useEffect(() => {
    if (!yearId || !termId) {
      setAssignments([]);
      setEntry(null);
      return;
    }
    let active = true;
    setLoading(true);
    api.getMyAssignments({ yearId, termId }).then(workspace => {
      if (!active) return;
      const list = workspace.assignments as TeacherAssignmentView[];
      setAssignments(list);
      setCombinationId('');
      setLevelId('');
      setClassId('');
      setSubjectId('');
      setCategoryId('');
      setEntry(null);
      const first = list[0];
      if (first) {
        setCombinationId(first.combinationId || '');
        setLevelId(first.levelId || '');
        setClassId(first.classId || '');
        setSubjectId(first.subjectId || '');
      }
    }).catch(err => {
      if (active) setError(err instanceof Error ? err.message : 'Failed to load assignments.');
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, [yearId, termId]);

  const loadEntry = async () => {
    if (!classId || !subjectId || !yearId || !termId) return;
    setLoading(true);
    setError('');
    try {
      const data = await api.getMarksEntry({ yearId, termId, classId, subjectId });
      setEntry(data);
      setCategoryId('');
      const nextScores: Record<CellKey, string> = {};
      const nextAttendance: Record<CellKey, MarkAttendanceStatus> = {};
      const nextRemarks: Record<string, string> = {};
      for (const mark of data.marks) {
        nextScores[cellKey(mark.studentId, mark.categoryId)] = mark.score === null ? '' : String(mark.score);
        nextAttendance[cellKey(mark.studentId, mark.categoryId)] = mark.attendanceStatus;
        if (!nextRemarks[mark.studentId] && mark.remark) nextRemarks[mark.studentId] = mark.remark;
      }
      setScores(nextScores);
      setAttendance(nextAttendance);
      setRemarks(nextRemarks);
    } catch (err) {
      setEntry(null);
      setError(err instanceof Error ? err.message : 'You cannot access this class/subject combination.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setEntry(null);
    setCategoryId('');
    if (!classId || !subjectId || !yearId || !termId) return;
    loadEntry();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [yearId, termId, classId, subjectId]);

  const combinationOptions = useMemo(
    () => uniqueOptions(assignments.map(item => ({
      id: item.combinationId || '',
      name: item.combinationName || 'Unassigned combination',
      detail: item.id
    }))),
    [assignments]
  );
  const levelOptions = useMemo(
    () => uniqueOptions(assignments
      .filter(item => !combinationId || item.combinationId === combinationId)
      .map(item => ({ id: item.levelId || '', name: item.levelName || 'Unassigned level' }))),
    [assignments, combinationId]
  );
  const classOptions = useMemo(
    () => uniqueOptions(assignments
      .filter(item => (!combinationId || item.combinationId === combinationId)
        && (!levelId || item.levelId === levelId))
      .map(item => ({ id: item.classId, name: item.className }))),
    [assignments, combinationId, levelId]
  );
  const subjectOptions = useMemo(
    () => uniqueOptions(assignments
      .filter(item => item.classId === classId
        && (!combinationId || item.combinationId === combinationId)
        && (!levelId || item.levelId === levelId))
      .map(item => ({ id: item.subjectId, name: item.subjectName, detail: item.subjectCode }))),
    [assignments, combinationId, levelId, classId]
  );
  const assessmentOptions = useMemo<ChainOption[]>(
    () => [
      { id: '', name: 'All assessments', detail: 'Show every active category' },
      ...(entry?.categories.map(category => ({
        id: category.id,
        name: category.name,
        detail: `${category.code} · max ${category.maxMarks} · ${category.weightPercentage}%`
      })) ?? [])
    ],
    [entry]
  );
  const visibleCategories = useMemo(
    () => categoryId ? entry?.categories.filter(category => category.id === categoryId) ?? [] : entry?.categories ?? [],
    [entry, categoryId]
  );

  const selectedAssignment = useMemo(
    () => assignments.find(item => item.classId === classId && item.subjectId === subjectId
      && (!combinationId || item.combinationId === combinationId)
      && (!levelId || item.levelId === levelId)),
    [assignments, combinationId, levelId, classId, subjectId]
  );

  const clearDependents = (kind: 'year' | 'term' | 'combination' | 'level' | 'class' | 'subject') => {
    setEntry(null);
    setCategoryId('');
    if (kind === 'year' || kind === 'term') {
      setCombinationId('');
      setLevelId('');
    }
    if (['year', 'term', 'combination'].includes(kind)) setClassId('');
    if (['year', 'term', 'combination', 'level', 'class'].includes(kind)) setSubjectId('');
  };

  const changeYear = (value: string) => {
    clearDependents('year');
    setYearId(value);
    setTermId(terms.find(term => term.academicYearId === value && term.isActive)?.id
      || terms.find(term => term.academicYearId === value)?.id || '');
  };

  const changeTerm = (value: string) => {
    clearDependents('term');
    setTermId(value);
  };

  const preview = (studentId: string) => {
    if (!entry) return null;
    let weighted = 0;
    let weight = 0;
    let filled = 0;
    for (const category of entry.categories) {
      const raw = scores[cellKey(studentId, category.id)];
      const status = attendance[cellKey(studentId, category.id)] || 'PRESENT';
      if (raw !== undefined && raw !== '') {
        const value = Number(raw);
        if (Number.isFinite(value)) {
          weighted += (value / Math.max(1, category.maxMarks)) * category.weightPercentage;
          weight += category.weightPercentage;
          filled += 1;
        }
      } else if (status === 'ABSENT') {
        weight += category.weightPercentage;
        filled += 1;
      }
    }
    return { percentage: weight > 0 ? Math.round((weighted / weight) * 100) : 0, filled, total: entry.categories.length };
  };

  const handleSave = async (action: 'DRAFT' | 'SUBMIT') => {
    if (!entry) return;
    setSaving(true);
    setMessage('');
    setError('');
    try {
      const marks = entry.students.flatMap(student => entry.categories.map(category => ({
        studentId: student.id,
        categoryId: category.id,
        score: scores[cellKey(student.id, category.id)] === ''
          ? null : Number(scores[cellKey(student.id, category.id)]),
        attendanceStatus: attendance[cellKey(student.id, category.id)] || 'PRESENT',
        remark: remarks[student.id] || undefined
      })));
      const result = await api.saveMarks({ yearId, termId, classId, subjectId, marks, action });
      setMessage(action === 'SUBMIT'
        ? `Submitted ${result.saved} marks for approval.`
        : `Saved ${result.saved} marks as a draft.`);
      await loadEntry();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save marks.');
    } finally {
      setSaving(false);
    }
  };

  if (loading && !entry) {
    return <div className="p-8 text-center text-slate-500">Loading academic workspace...</div>;
  }

  const status = entry?.submission?.status || 'DRAFT';
  const canEdit = Boolean(entry?.canEdit);
  const noAssignments = !loading && Boolean(yearId && termId) && assignments.length === 0;

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-slate-900">{title}</h1>
          <p className="text-sm text-slate-500 mt-1">{description}</p>
        </div>
        <div className="flex flex-wrap gap-2 text-xs font-semibold">
          <span className="rounded-full bg-blue-50 px-3 py-1.5 text-blue-800">
            {currentUser?.fullName}
          </span>
          <span className="rounded-full bg-slate-100 px-3 py-1.5 text-slate-700">
            Assigned pairs: {assignments.length}
          </span>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        <SearchableSelect
          label="Academic year"
          value={yearId}
          options={years.map(item => ({ id: item.id, name: item.name }))}
          onChange={changeYear}
        />
        <SearchableSelect
          label="Term"
          value={termId}
          options={terms
            .filter(item => !yearId || item.academicYearId === yearId)
            .map(item => ({ id: item.id, name: item.name }))}
          onChange={changeTerm}
        />
        <SearchableSelect
          label="Combination"
          value={combinationId}
          options={combinationOptions}
          onChange={value => { clearDependents('combination'); setCombinationId(value); }}
          disabled={assignments.length === 0}
        />
        <SearchableSelect
          label="Class level"
          value={levelId}
          options={levelOptions}
          onChange={value => { clearDependents('level'); setLevelId(value); }}
          disabled={assignments.length === 0}
        />
        <SearchableSelect
          label="Class"
          value={classId}
          options={classOptions}
          onChange={value => { clearDependents('class'); setClassId(value); }}
          disabled={assignments.length === 0}
        />
        <SearchableSelect
          label="Subject"
          value={subjectId}
          options={subjectOptions}
          onChange={value => { clearDependents('subject'); setSubjectId(value); }}
          disabled={assignments.length === 0}
        />
        <SearchableSelect
          label="Assessment"
          value={categoryId}
          options={assessmentOptions}
          onChange={setCategoryId}
          disabled={!entry}
          emptyText="No active assessments configured"
        />
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <AlertCircle size={16} /> {error}
        </div>
      )}
      {message && (
        <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          <CheckCircle2 size={16} /> {message}
        </div>
      )}

      {noAssignments && (
        <div role="status" className="rounded-2xl border border-dashed border-blue-300 bg-blue-50 p-10 text-center text-sm font-semibold text-blue-800">
          {NO_ASSIGNMENT_MESSAGE}
        </div>
      )}

      {!noAssignments && !entry && !loading && (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center text-sm text-slate-500">
          Choose a combination, class level, class and subject to open the marks sheet.
        </div>
      )}

      {entry && (
        <>
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="rounded-xl bg-blue-50 p-2.5 text-blue-700"><BookOpen size={20} /></div>
                <div>
                  <p className="font-bold text-slate-900">{entry.subject?.name} - {entry.classInfo?.name}</p>
                  <p className="text-xs text-slate-500">
                    {combinationOptions.find(item => item.id === combinationId)?.name || 'Combination'}
                    {' · '}{levelOptions.find(item => item.id === levelId)?.name || 'Level'}
                    {' · '}{entry.year?.name} | {entry.term?.name} | {entry.students.length} enrolled students
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className={`rounded-full px-3 py-1 text-xs font-bold ${
                  status === 'APPROVED' ? 'bg-emerald-100 text-emerald-800'
                    : status === 'SUBMITTED' ? 'bg-blue-100 text-blue-800'
                      : status === 'RETURNED' ? 'bg-amber-100 text-amber-800'
                        : 'bg-slate-100 text-slate-700'
                }`}>{status.replaceAll('_', ' ')}</span>
                {selectedAssignment && (
                  <span className="text-xs text-slate-500">Assigned to you</span>
                )}
              </div>
            </div>
            {!canEdit && (
              <p className="mt-3 flex items-center gap-2 text-xs text-slate-500">
                <Clock size={14} /> These marks are locked after submission. A reviewer can return them for correction.
              </p>
            )}
          </div>

          <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 text-left text-[11px] uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-3 py-3">Admission no.</th>
                  <th className="px-3 py-3 min-w-[180px]">Full name</th>
                  {visibleCategories.map(category => (
                    <th key={category.id} className="px-3 py-3 text-center">
                      {category.code}<span className="block font-normal normal-case">max {category.maxMarks} / {category.weightPercentage}%</span>
                    </th>
                  ))}
                  <th className="px-3 py-3 text-center">Total</th>
                  <th className="px-3 py-3 text-center">Grade</th>
                  <th className="px-3 py-3 min-w-[220px]">Remarks</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {entry.students.map(student => {
                  const saved = student.result?.subjects.find(item => item.subjectId === subjectId);
                  const live = preview(student.id);
                  return (
                    <tr key={student.id} className="hover:bg-slate-50/60">
                      <td className="px-3 py-2 font-mono text-xs text-slate-600">{student.admissionNumber}</td>
                      <td className="px-3 py-2 font-semibold text-slate-800">{student.firstName} {student.lastName}</td>
                      {visibleCategories.map(category => {
                        const key = cellKey(student.id, category.id);
                        return (
                          <td key={category.id} className="px-2 py-2">
                            <input
                              type="number"
                              min={0}
                              max={category.maxMarks}
                              disabled={!canEdit}
                              value={scores[key] ?? ''}
                              onChange={event => setScores(prev => ({ ...prev, [key]: event.target.value }))}
                              className="w-16 rounded-lg border border-slate-300 px-2 py-1.5 text-center disabled:bg-slate-100"
                              aria-label={`${category.name} for ${student.firstName} ${student.lastName}`}
                            />
                            <select
                              disabled={!canEdit}
                              value={attendance[key] || 'PRESENT'}
                              onChange={event => setAttendance(prev => ({
                                ...prev, [key]: event.target.value as MarkAttendanceStatus
                              }))}
                              className="mt-1 w-16 rounded border border-slate-200 bg-white px-1 py-0.5 text-[10px] disabled:bg-slate-100"
                              aria-label={`Attendance for ${category.code} - ${student.firstName}`}
                            >
                              <option value="PRESENT">Present</option>
                              <option value="ABSENT">Absent</option>
                              <option value="EXCUSED">Excused</option>
                            </select>
                          </td>
                        );
                      })}
                      <td className="px-3 py-2 text-center font-bold text-slate-800">
                        {saved ? `${saved.totalMarks}` : '—'}
                      </td>
                      <td className="px-3 py-2 text-center">
                        <span className="rounded bg-slate-100 px-2 py-1 text-xs font-bold">{saved?.grade || '—'}</span>
                      </td>
                      <td className="px-3 py-2">
                        <input
                          value={remarks[student.id] || ''}
                          disabled={!canEdit}
                          onChange={event => setRemarks(prev => ({ ...prev, [student.id]: event.target.value }))}
                          placeholder="Teacher remark"
                          className="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-xs disabled:bg-slate-100"
                        />
                        {live && (
                          <span className="mt-1 block text-[10px] text-slate-400">
                            Draft preview: {live.filled}/{live.total} entries, {live.percentage}%
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {entry.missing.length > 0 && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-xs text-amber-800">
              <p className="mb-1 flex items-center gap-2 font-bold"><AlertCircle size={14} /> Missing marks</p>
              <ul className="list-inside list-disc space-y-0.5">
                {entry.missing.slice(0, 8).map((item, index) => (
                  <li key={`${item.studentId}-${item.categoryId}-${index}`}>
                    {item.studentName} - {item.categoryName}: {item.reason}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="flex flex-wrap gap-3">
            <button
              onClick={() => handleSave('DRAFT')}
              disabled={!canEdit || saving}
              className="inline-flex items-center gap-2 rounded-lg bg-slate-700 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50"
            >
              <Save size={16} /> Save Draft
            </button>
            <button
              onClick={() => handleSave('SUBMIT')}
              disabled={!canEdit || saving}
              className="inline-flex items-center gap-2 rounded-lg bg-blue-700 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50"
            >
              <Send size={16} /> Submit Marks
            </button>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <div className="rounded-2xl border border-slate-200 bg-white p-4">
              <h2 className="mb-3 flex items-center gap-2 text-sm font-bold text-slate-800">
                <ClipboardList size={16} /> Submission history
              </h2>
              {entry.submission?.history?.length ? (
                <ol className="space-y-2 text-xs text-slate-600">
                  {entry.submission.history.slice().reverse().map((event, index) => (
                    <li key={`${event.action}-${index}`} className="rounded-lg bg-slate-50 px-3 py-2">
                      <span className="font-bold text-slate-800">{event.action.replaceAll('_', ' ')}</span>
                      <span className="ml-2">{event.byName}</span>
                      <span className="ml-2 text-slate-400">{new Date(event.at).toLocaleString()}</span>
                      {event.note && <p className="mt-1 text-slate-500">{event.note}</p>}
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="text-xs text-slate-400">No submission activity yet.</p>
              )}
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white p-4">
              <h2 className="mb-3 flex items-center gap-2 text-sm font-bold text-slate-800">
                <TrendingUp size={16} /> Saved subject summary
              </h2>
              {entry.students.length > 0 && (
                <div className="space-y-2 text-xs">
                  <div className="flex justify-between rounded-lg bg-blue-50 px-3 py-2">
                    <span className="text-blue-800">Complete student records</span>
                    <span className="font-bold text-blue-900">
                      {entry.students.filter(student => student.result?.subjects.find(s => s.subjectId === subjectId)?.isComplete).length}
                      / {entry.students.length}
                    </span>
                  </div>
                  <div className="flex justify-between rounded-lg bg-emerald-50 px-3 py-2">
                    <span className="text-emerald-800">Class average</span>
                    <span className="font-bold text-emerald-900">{entry.submission ? 'Calculated on approval' : 'Not yet submitted'}</span>
                  </div>
                  <p className="pt-1 text-slate-500">
                    Totals, percentages and grades are calculated and validated by the server when marks are saved.
                  </p>
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
};
