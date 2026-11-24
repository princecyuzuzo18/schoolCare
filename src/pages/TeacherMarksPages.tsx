import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  BookOpen,
  CheckCircle2,
  ClipboardList,
  GraduationCap,
  Loader2,
  RefreshCw,
  Send,
  TrendingUp,
  Users
} from 'lucide-react';
import type {
  AcademicTerm,
  AcademicYear,
  CalculationResult,
  ClassSubjectAssignmentView,
  MarkSubmission
} from '../types';
import { api, type AcademicDashboardView } from '../services/api';
import { SearchableSelect } from '../components/SearchableSelect';
import { NO_ASSIGNMENT_MESSAGE } from '../teacherMarksMessages';
import { TeacherAcademicsPage } from './TeacherAcademicsPage';

type TeacherAssignmentView = ClassSubjectAssignmentView & { status: string };

type SubmissionView = MarkSubmission & { subjectName?: string; className?: string; teacherName?: string };

function useTeacherMarksWorkspace() {
  const [years, setYears] = useState<AcademicYear[]>([]);
  const [terms, setTerms] = useState<AcademicTerm[]>([]);
  const [yearId, setYearId] = useState('');
  const [termId, setTermId] = useState('');
  const [assignments, setAssignments] = useState<TeacherAssignmentView[]>([]);
  const [dashboard, setDashboard] = useState<AcademicDashboardView | null>(null);
  const [combinationId, setCombinationId] = useState('');
  const [levelId, setLevelId] = useState('');
  const [classId, setClassId] = useState('');
  const [subjectId, setSubjectId] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    Promise.all([
      api.getAcademicYears(),
      api.getTerms(),
      api.getMyAssignments(),
      api.getAcademicDashboard()
    ])
      .then(([yearList, termList, workspace, dashboardView]) => {
        if (!active) return;
        setYears(yearList);
        setTerms(termList);
        setDashboard(dashboardView);
        const initialYear = workspace.year?.id || yearList.find(item => item.isActive)?.id || yearList[0]?.id || '';
        const initialTerm = workspace.term?.id || termList.find(item => item.isActive)?.id || termList[0]?.id || '';
        setYearId(initialYear);
        setTermId(initialTerm);
      })
      .catch(err => {
        if (active) setError(err instanceof Error ? err.message : 'Could not load your academic workspace.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!yearId || !termId) return;
    let active = true;
    setError('');
    Promise.all([
      api.getMyAssignments({ yearId, termId }),
      api.getTerms(yearId),
      api.getAcademicDashboard({ yearId, termId })
    ])
      .then(([workspace, termList, dashboardView]) => {
        if (!active) return;
        const list = workspace.assignments as TeacherAssignmentView[];
        setTerms(termList);
        setAssignments(list);
        setDashboard(dashboardView);
        const first = list[0];
        setCombinationId(first?.combinationId || '');
        setLevelId(first?.levelId || '');
        const nextClass = list.some(item => item.classId === classId) ? classId : first?.classId || '';
        const nextSubject = list.some(
          item => item.classId === nextClass && item.subjectId === subjectId
            && (!first?.combinationId || item.combinationId === first.combinationId)
            && (!first?.levelId || item.levelId === first.levelId)
        ) ? subjectId : first?.subjectId || '';
        setClassId(nextClass);
        setSubjectId(nextSubject);
      })
      .catch(err => {
        if (active) setError(err instanceof Error ? err.message : 'Could not load assigned classes.');
      });
    return () => { active = false; };
    // Selection state is used only to preserve a valid pair across refreshes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [yearId, termId]);

  const refresh = useCallback(async () => {
    if (!yearId || !termId) return;
    const [workspace, dashboardView] = await Promise.all([
      api.getMyAssignments({ yearId, termId, combinationId, levelId }),
      api.getAcademicDashboard({ yearId, termId })
    ]);
    setAssignments(workspace.assignments as TeacherAssignmentView[]);
    setDashboard(dashboardView);
  }, [yearId, termId, combinationId, levelId]);

  const clearDependents = (kind: 'year' | 'term' | 'combination' | 'level' | 'class') => {
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
    const matchingTerms = terms.filter(item => item.academicYearId === value);
    setTermId(matchingTerms.find(item => item.isActive)?.id || matchingTerms[0]?.id || '');
  };

  const changeTerm = (value: string) => {
    clearDependents('term');
    setTermId(value);
  };

  return {
    years,
    terms,
    yearId,
    termId,
    assignments,
    dashboard,
    combinationId,
    levelId,
    classId,
    subjectId,
    loading,
    error,
    setError,
    setCombinationId,
    setLevelId,
    setClassId,
    setSubjectId,
    setTermId,
    changeYear,
    changeTerm,
    clearDependents,
    refresh
  };
}

interface ScopeControlsProps {
  years: AcademicYear[];
  terms: AcademicTerm[];
  yearId: string;
  termId: string;
  assignments: TeacherAssignmentView[];
  combinationId: string;
  levelId: string;
  classId: string;
  subjectId: string;
  onYear: (value: string) => void;
  onTerm: (value: string) => void;
  onCombination: (value: string) => void;
  onLevel: (value: string) => void;
  onClass: (value: string) => void;
  onSubject: (value: string) => void;
}

function ScopeControls({
  years,
  terms,
  yearId,
  termId,
  assignments,
  combinationId,
  levelId,
  classId,
  subjectId,
  onYear,
  onTerm,
  onCombination,
  onLevel,
  onClass,
  onSubject
}: ScopeControlsProps) {
  const optionsFrom = (items: Array<{ id: string; name: string; detail?: string }>) =>
    Array.from(new Map(items.filter(item => item.id).map(item => [item.id, item])).values());

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
      <SearchableSelect
        label="Academic year"
        value={yearId}
        options={years.map(item => ({ id: item.id, name: item.name }))}
        onChange={onYear}
      />
      <SearchableSelect
        label="Term"
        value={termId}
        options={terms
          .filter(item => !yearId || item.academicYearId === yearId)
          .map(item => ({ id: item.id, name: item.name }))}
        onChange={onTerm}
      />
      <SearchableSelect
        label="Combination"
        value={combinationId}
        options={optionsFrom(assignments.map(item => ({
          id: item.combinationId || '',
          name: item.combinationName || 'Unassigned combination'
        })))}
        onChange={onCombination}
        disabled={assignments.length === 0}
      />
      <SearchableSelect
        label="Class level"
        value={levelId}
        options={optionsFrom(assignments
          .filter(item => !combinationId || item.combinationId === combinationId)
          .map(item => ({ id: item.levelId || '', name: item.levelName || 'Unassigned level' })))}
        onChange={onLevel}
        disabled={assignments.length === 0}
      />
      <SearchableSelect
        label="Assigned class"
        value={classId}
        options={optionsFrom(assignments
          .filter(item => (!combinationId || item.combinationId === combinationId)
            && (!levelId || item.levelId === levelId))
          .map(item => ({ id: item.classId, name: item.className })))}
        onChange={onClass}
        disabled={assignments.length === 0}
      />
      <SearchableSelect
        label="Assigned subject"
        value={subjectId}
        options={optionsFrom(assignments
          .filter(item => item.classId === classId
            && (!combinationId || item.combinationId === combinationId)
            && (!levelId || item.levelId === levelId))
          .map(item => ({ id: item.subjectId, name: item.subjectName, detail: item.subjectCode })))}
        onChange={onSubject}
        disabled={assignments.length === 0}
      />
    </div>
  );
}

function PageHeader({ title, description }: { title: string; description: string }) {
  return (
    <div>
      <h1 className="text-2xl font-black text-slate-900">{title}</h1>
      <p className="mt-1 text-sm text-slate-500">{description}</p>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const color = status === 'APPROVED'
    ? 'bg-emerald-100 text-emerald-800'
    : status === 'SUBMITTED' || status === 'UNDER_REVIEW'
      ? 'bg-blue-100 text-blue-800'
      : status === 'RETURNED'
        ? 'bg-amber-100 text-amber-800'
        : 'bg-slate-100 text-slate-700';
  return <span className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${color}`}>{status.replaceAll('_', ' ')}</span>;
}

function WorkspaceAlert({ error }: { error: string }) {
  if (!error) return null;
  return (
    <div className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
      <AlertCircle size={16} /> {error}
    </div>
  );
}

interface NavigationProps {
  onNavigate: (tab: string) => void;
}

export const TeacherMyClassesPage: React.FC<NavigationProps> = ({ onNavigate }) => {
  const workspace = useTeacherMarksWorkspace();
  const classes = useMemo(() => {
    const grouped = new Map<string, { classId: string; className: string; subjects: TeacherAssignmentView[] }>();
    for (const assignment of workspace.assignments) {
      const current = grouped.get(assignment.classId) || {
        classId: assignment.classId,
        className: assignment.className,
        subjects: []
      };
      current.subjects.push(assignment);
      grouped.set(assignment.classId, current);
    }
    return Array.from(grouped.values());
  }, [workspace.assignments]);
  const totals = workspace.dashboard?.totals;

  return (
    <div className="space-y-6 p-4 md:p-6">
      <PageHeader
        title="My Classes"
        description="Classes and subjects assigned to you for the selected academic term. Only assigned records are shown."
      />
      <WorkspaceAlert error={workspace.error} />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { label: 'My assignments', value: totals?.myAssignments ?? workspace.assignments.length, Icon: BookOpen },
          { label: 'Draft', value: totals?.draft ?? 0, Icon: ClipboardList },
          { label: 'Submitted', value: totals?.submitted ?? 0, Icon: Send },
          { label: 'Approved', value: totals?.approved ?? 0, Icon: CheckCircle2 }
        ].map(item => (
          <div key={item.label} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-500">{item.label}</span>
              <item.Icon size={16} className="text-slate-400" />
            </div>
            <p className="mt-2 text-2xl font-black text-slate-900">{item.value}</p>
          </div>
        ))}
      </div>

      <ScopeControls
        years={workspace.years}
        terms={workspace.terms}
        yearId={workspace.yearId}
        termId={workspace.termId}
        assignments={workspace.assignments}
        combinationId={workspace.combinationId}
        levelId={workspace.levelId}
        classId={workspace.classId}
        subjectId={workspace.subjectId}
        onYear={workspace.changeYear}
        onTerm={workspace.changeTerm}
        onCombination={value => { workspace.clearDependents('combination'); workspace.setCombinationId(value); }}
        onLevel={value => { workspace.clearDependents('level'); workspace.setLevelId(value); }}
        onClass={value => { workspace.clearDependents('class'); workspace.setClassId(value); }}
        onSubject={workspace.setSubjectId}
      />

      {workspace.loading ? (
        <div className="flex items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white p-10 text-sm text-slate-500">
          <Loader2 size={16} className="animate-spin" /> Loading assigned classes...
        </div>
      ) : classes.length === 0 ? (
        <div role="status" className="rounded-2xl border border-dashed border-blue-300 bg-blue-50 p-10 text-center text-sm font-semibold text-blue-800">
          {NO_ASSIGNMENT_MESSAGE}
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {classes.map(item => (
            <div key={item.classId} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex items-center gap-3">
                <span className="rounded-xl bg-blue-50 p-2.5 text-blue-700"><Users size={18} /></span>
                <div>
                  <p className="font-bold text-slate-900">{item.className}</p>
                  <p className="text-xs text-slate-500">{item.subjects.length} assigned subject(s)</p>
                </div>
              </div>
              <div className="mt-3 space-y-1.5">
                {item.subjects.map(subject => (
                  <div key={subject.id} className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2 text-xs">
                    <span className="font-semibold text-slate-700">
                      {subject.subjectName} {subject.subjectCode && <span className="text-slate-400">({subject.subjectCode})</span>}
                    </span>
                    <StatusBadge status={subject.status} />
                  </div>
                ))}
              </div>
              <button
                type="button"
                onClick={() => onNavigate('teacher-marks-management')}
                className="mt-4 inline-flex items-center gap-2 rounded-lg bg-blue-700 px-3 py-2 text-xs font-bold text-white hover:bg-blue-800"
              >
                Open Marks Management <Send size={14} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export const TeacherMarksManagementPage: React.FC = () => (
  <TeacherAcademicsPage
    title="Marks Management"
    description="Enter, save and submit marks only for the classes and subjects assigned to you."
  />
);

export const TeacherExaminationResultsPage: React.FC = () => {
  const workspace = useTeacherMarksWorkspace();
  const [results, setResults] = useState<CalculationResult | null>(null);
  const [loadingResults, setLoadingResults] = useState(false);

  useEffect(() => {
    if (!workspace.yearId || !workspace.termId || !workspace.classId || !workspace.subjectId) {
      setResults(null);
      return;
    }
    let active = true;
    setLoadingResults(true);
    setResults(null);
    api.getAcademicResults({
      yearId: workspace.yearId,
      termId: workspace.termId,
      classId: workspace.classId,
      subjectId: workspace.subjectId
    })
      .then(data => { if (active) setResults(data); })
      .catch(err => {
        if (active) workspace.setError(err instanceof Error ? err.message : 'Could not load examination results.');
      })
      .finally(() => { if (active) setLoadingResults(false); });
    return () => { active = false; };
  }, [workspace.yearId, workspace.termId, workspace.classId, workspace.subjectId, workspace.setError]);

  const selected = workspace.assignments.find(item =>
    item.classId === workspace.classId && item.subjectId === workspace.subjectId
  );

  return (
    <div className="space-y-6 p-4 md:p-6">
      <PageHeader
        title="Examination Results"
        description="Calculated class results for an assigned class and subject. The server rejects unassigned combinations."
      />
      <WorkspaceAlert error={workspace.error} />
      <ScopeControls
        years={workspace.years}
        terms={workspace.terms}
        yearId={workspace.yearId}
        termId={workspace.termId}
        assignments={workspace.assignments}
        combinationId={workspace.combinationId}
        levelId={workspace.levelId}
        classId={workspace.classId}
        subjectId={workspace.subjectId}
        onYear={workspace.changeYear}
        onTerm={workspace.changeTerm}
        onCombination={value => { workspace.clearDependents('combination'); workspace.setCombinationId(value); }}
        onLevel={value => { workspace.clearDependents('level'); workspace.setLevelId(value); }}
        onClass={value => { workspace.clearDependents('class'); workspace.setClassId(value); }}
        onSubject={workspace.setSubjectId}
      />

      {loadingResults ? (
        <div className="flex items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white p-10 text-sm text-slate-500">
          <Loader2 size={16} className="animate-spin" /> Loading results...
        </div>
      ) : !results ? (
        <div role="status" className="rounded-2xl border border-dashed border-blue-300 bg-blue-50 p-10 text-center text-sm font-semibold text-blue-800">
          {workspace.assignments.length === 0
            ? NO_ASSIGNMENT_MESSAGE
            : 'Choose an assigned class and subject to view results.'}
        </div>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {[
              { label: 'Class average', value: `${results.classAverage}%`, Icon: TrendingUp },
              { label: 'Students', value: results.students.length, Icon: Users },
              { label: 'Missing entries', value: results.missing.length, Icon: AlertCircle },
              {
                label: 'Subject average',
                value: `${results.subjectPerformance[0]?.average ?? 0}%`,
                Icon: GraduationCap
              }
            ].map(item => (
              <div key={item.label} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-500">{item.label}</span>
                  <item.Icon size={16} className="text-slate-400" />
                </div>
                <p className="mt-2 text-2xl font-black text-slate-900">{item.value}</p>
              </div>
            ))}
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <p className="font-bold text-slate-900">
              {selected?.subjectName || 'Subject'} — {selected?.className || 'Class'}
            </p>
            <p className="mt-1 text-xs text-slate-500">
              {results.scale?.name || 'School grading scale'} · unverified draft calculations are never published.
            </p>
          </div>

          <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 text-left text-[11px] uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-3 py-3">Admission no.</th>
                  <th className="px-3 py-3">Student</th>
                  <th className="px-3 py-3 text-center">Total</th>
                  <th className="px-3 py-3 text-center">%</th>
                  <th className="px-3 py-3 text-center">Grade</th>
                  <th className="px-3 py-3 text-center">Rank</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {results.students.map(student => {
                  const subject = student.subjects.find(item => item.subjectId === workspace.subjectId);
                  return (
                    <tr key={student.studentId} className="hover:bg-slate-50/60">
                      <td className="px-3 py-2 font-mono text-xs text-slate-600">{student.admissionNumber}</td>
                      <td className="px-3 py-2 font-semibold text-slate-800">{student.studentName}</td>
                      <td className="px-3 py-2 text-center font-bold text-slate-800">{subject?.totalMarks ?? 0}</td>
                      <td className="px-3 py-2 text-center text-slate-600">{subject?.percentage ?? 0}</td>
                      <td className="px-3 py-2 text-center">
                        <span className="rounded bg-slate-100 px-2 py-1 text-xs font-bold">{subject?.grade || '—'}</span>
                      </td>
                      <td className="px-3 py-2 text-center text-slate-600">{subject?.rankInClass || '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
};

export const TeacherMySubjectsPage: React.FC<NavigationProps> = ({ onNavigate }) => {
  const workspace = useTeacherMarksWorkspace();
  const subjects = useMemo(() => {
    const grouped = new Map<string, { subjectId: string; subjectName: string; subjectCode: string; classes: TeacherAssignmentView[] }>();
    for (const assignment of workspace.assignments) {
      const current = grouped.get(assignment.subjectId) || {
        subjectId: assignment.subjectId,
        subjectName: assignment.subjectName,
        subjectCode: assignment.subjectCode,
        classes: []
      };
      current.classes.push(assignment);
      grouped.set(assignment.subjectId, current);
    }
    return Array.from(grouped.values());
  }, [workspace.assignments]);

  return (
    <div className="space-y-6 p-4 md:p-6">
      <PageHeader
        title="My Subjects"
        description="Subjects you are assigned to teach, with the exact classes and levels attached to each assignment."
      />
      <WorkspaceAlert error={workspace.error} />

      {subjects.length === 0 ? (
        <div role="status" className="rounded-2xl border border-dashed border-blue-300 bg-blue-50 p-10 text-center text-sm font-semibold text-blue-800">
          {NO_ASSIGNMENT_MESSAGE}
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {subjects.map(subject => (
            <div key={subject.subjectId} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex items-center gap-3">
                <span className="rounded-xl bg-emerald-50 p-2.5 text-emerald-700"><BookOpen size={18} /></span>
                <div>
                  <p className="font-bold text-slate-900">{subject.subjectName}</p>
                  <p className="text-xs text-slate-500">{subject.subjectCode || 'No code'} · {subject.classes.length} class(es)</p>
                </div>
              </div>
              <div className="mt-3 space-y-1.5">
                {subject.classes.map(item => (
                  <div key={item.id} className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2 text-xs">
                    <span className="font-semibold text-slate-700">{item.className}</span>
                    <StatusBadge status={item.status} />
                  </div>
                ))}
              </div>
              <button
                type="button"
                onClick={() => onNavigate('teacher-marks-management')}
                className="mt-4 inline-flex items-center gap-2 rounded-lg bg-slate-700 px-3 py-2 text-xs font-bold text-white hover:bg-slate-800"
              >
                Manage marks <Send size={14} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export const TeacherSubmittedMarksPage: React.FC = () => {
  const workspace = useTeacherMarksWorkspace();
  const [submissions, setSubmissions] = useState<SubmissionView[]>([]);
  const [busyId, setBusyId] = useState('');
  const [message, setMessage] = useState('');

  const loadSubmissions = useCallback(async () => {
    if (!workspace.yearId || !workspace.termId) return;
    const list = await api.getSubmissions({ yearId: workspace.yearId, termId: workspace.termId });
    setSubmissions(list);
  }, [workspace.yearId, workspace.termId]);

  useEffect(() => {
    loadSubmissions().catch(err => {
      workspace.setError(err instanceof Error ? err.message : 'Could not load submitted marks.');
    });
  }, [loadSubmissions, workspace.setError]);

  const resubmit = async (id: string) => {
    setBusyId(id);
    setMessage('');
    try {
      await api.submitMarks(id);
      await Promise.all([loadSubmissions(), workspace.refresh()]);
      setMessage('Marks resubmitted for review.');
    } catch (err) {
      workspace.setError(err instanceof Error ? err.message : 'Could not resubmit marks.');
    } finally {
      setBusyId('');
    }
  };

  return (
    <div className="space-y-6 p-4 md:p-6">
      <PageHeader
        title="Submitted Marks"
        description="Your own marks submissions, review outcomes and correction history."
      />
      <WorkspaceAlert error={workspace.error} />
      {message && (
        <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          <CheckCircle2 size={16} /> {message}
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { label: 'Draft', value: workspace.dashboard?.totals.draft ?? 0 },
          { label: 'Submitted', value: workspace.dashboard?.totals.submitted ?? 0 },
          { label: 'Returned', value: workspace.dashboard?.totals.returned ?? 0 },
          { label: 'Approved', value: workspace.dashboard?.totals.approved ?? 0 }
        ].map(item => (
          <div key={item.label} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <span className="text-xs font-semibold text-slate-500">{item.label}</span>
            <p className="mt-2 text-2xl font-black text-slate-900">{item.value}</p>
          </div>
        ))}
      </div>

      <div className="flex justify-end">
        <button
          type="button"
          onClick={() => void Promise.all([loadSubmissions(), workspace.refresh()])}
          className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-bold text-slate-700"
        >
          <RefreshCw size={14} /> Refresh
        </button>
      </div>

      {submissions.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center text-sm text-slate-500">
          No marks submissions found for this term.
        </div>
      ) : (
        <div className="space-y-3">
          {submissions.map(submission => (
            <div key={submission.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="font-bold text-slate-900">
                    {submission.subjectName || submission.subjectId} — {submission.className || submission.classId}
                  </p>
                  <p className="mt-0.5 text-xs text-slate-500">
                    Updated {new Date(submission.updatedAt).toLocaleString()}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <StatusBadge status={submission.status} />
                  {submission.status === 'RETURNED' && (
                    <button
                      type="button"
                      disabled={busyId === submission.id}
                      onClick={() => void resubmit(submission.id)}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-blue-700 px-3 py-2 text-xs font-bold text-white disabled:opacity-50"
                    >
                      {busyId === submission.id ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                      Resubmit
                    </button>
                  )}
                </div>
              </div>
              {submission.correctionReason && (
                <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
                  Return reason: {submission.correctionReason}
                </p>
              )}
              {submission.history.length > 0 && (
                <ol className="mt-3 space-y-1.5 border-t border-slate-100 pt-3">
                  {submission.history.slice().reverse().slice(0, 5).map((event, index) => (
                    <li key={`${event.at}-${index}`} className="text-xs text-slate-600">
                      <span className="font-bold text-slate-800">{event.action.replaceAll('_', ' ')}</span>
                      {' · '}{event.byName}{' · '}{new Date(event.at).toLocaleString()}
                      {event.note && <span className="block text-slate-500">{event.note}</span>}
                    </li>
                  ))}
                </ol>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
