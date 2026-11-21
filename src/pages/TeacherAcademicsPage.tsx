import React, { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { api, MarksEntryView } from '../services/api';
import type { AcademicTerm, AcademicYear, MarkAttendanceStatus } from '../types';
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

export const TeacherAcademicsPage: React.FC = () => {
  const { currentUser } = useAuth();

  const [years, setYears] = useState<AcademicYear[]>([]);
  const [terms, setTerms] = useState<AcademicTerm[]>([]);
  const [yearId, setYearId] = useState('');
  const [termId, setTermId] = useState('');
  const [assignments, setAssignments] = useState<Array<{
    id: string; classId: string; subjectId: string; className: string; subjectName: string; status: string;
  }>>([]);
  const [classId, setClassId] = useState('');
  const [subjectId, setSubjectId] = useState('');
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
        const initialYear = workspace.year?.id || yearList.find(y => y.isActive)?.id || yearList[0]?.id || '';
        const initialTerm = workspace.term?.id || termList.find(t => t.isActive)?.id || termList[0]?.id || '';
        setYearId(initialYear);
        setTermId(initialTerm);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load academic workspace.');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  useEffect(() => {
    if (!yearId || !termId) return;
    const load = async () => {
      try {
        const [workspace, termList] = await Promise.all([
          api.getMyAssignments({ yearId, termId }), api.getTerms(yearId)
        ]);
        setTerms(termList);
        setAssignments(workspace.assignments);
        const first = workspace.assignments[0];
        setClassId(current => workspace.assignments.some(a => a.classId === current) ? current : first?.classId || '');
        setSubjectId(current => workspace.assignments.some(a => a.subjectId === current && a.classId === (classId || first?.classId)) ? current : first?.subjectId || '');
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load assignments.');
      }
    };
    load();
  }, [yearId, termId]);

  const loadEntry = async () => {
    if (!classId || !subjectId || !yearId || !termId) return;
    setLoading(true);
    setError('');
    try {
      const data = await api.getMarksEntry({ yearId, termId, classId, subjectId });
      setEntry(data);
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
    loadEntry();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [yearId, termId, classId, subjectId]);

  const selectedAssignment = useMemo(
    () => assignments.find(item => item.classId === classId && item.subjectId === subjectId),
    [assignments, classId, subjectId]
  );

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

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-slate-900">My Academic Work</h1>
          <p className="text-sm text-slate-500 mt-1">
            Enter marks only for classes and subjects assigned to you for the selected term.
          </p>
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

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { label: 'Academic year', value: yearId, set: setYearId, options: years.map(y => ({ id: y.id, name: y.name })) },
          { label: 'Term', value: termId, set: setTermId, options: terms.map(t => ({ id: t.id, name: t.name })) },
          {
            label: 'Class', value: classId, set: (value: string) => {
              setClassId(value);
              const match = assignments.find(a => a.classId === value && a.subjectId === subjectId);
              if (!match) setSubjectId(assignments.find(a => a.classId === value)?.subjectId || '');
            },
            options: Array.from(new Map(assignments.map(a => [a.classId, { id: a.classId, name: a.className }])).values())
          },
          {
            label: 'Subject', value: subjectId, set: setSubjectId,
            options: assignments.filter(a => a.classId === classId).map(a => ({ id: a.subjectId, name: a.subjectName }))
          }
        ].map(control => (
          <label key={control.label} className="text-xs font-bold text-slate-600">
            {control.label}
            <select
              className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-800"
              value={control.value}
              onChange={event => control.set(event.target.value)}
            >
              <option value="">Select...</option>
              {control.options.map(option => (
                <option key={option.id} value={option.id}>{option.name}</option>
              ))}
            </select>
          </label>
        ))}
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

      {entry && (
        <>
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="rounded-xl bg-blue-50 p-2.5 text-blue-700"><BookOpen size={20} /></div>
                <div>
                  <p className="font-bold text-slate-900">{entry.subject?.name} - {entry.classInfo?.name}</p>
                  <p className="text-xs text-slate-500">
                    {entry.year?.name} | {entry.term?.name} | {entry.students.length} students
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className={`rounded-full px-3 py-1 text-xs font-bold ${
                  status === 'APPROVED' ? 'bg-emerald-100 text-emerald-800'
                    : status === 'SUBMITTED' ? 'bg-blue-100 text-blue-800'
                      : status === 'RETURNED' ? 'bg-amber-100 text-amber-800'
                        : 'bg-slate-100 text-slate-700'
                }`}>{status}</span>
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
                  {entry.categories.map(category => (
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
                      {entry.categories.map(category => {
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
