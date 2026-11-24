import React, { useEffect, useMemo, useState } from 'react';
import { api, AcademicDashboardView } from '../services/api';
import type {
  AcademicClass, AcademicTerm, AcademicYear, AcademicWorkflowEvent, AssessmentCategory,
  ClassLevel, ClassSubjectAssignmentView, CombinationView, GradingScale, GradeBoundary,
  MarkSubmission, Subject, UserProfile
} from '../types';
import { SearchableSelect } from '../components/SearchableSelect';
import {
  AlertCircle,
  BookOpen,
  CheckCircle2,
  ClipboardCheck,
  Gauge,
  Settings2,
  SlidersHorizontal,
  Undo2,
  Users
} from 'lucide-react';

type Section = 'OVERVIEW' | 'STRUCTURE' | 'CONFIG' | 'REVIEW';
type SubmissionView = MarkSubmission & { subjectName?: string; className?: string; teacherName?: string };
type StructureStatus = 'ACTIVE' | 'INACTIVE' | 'ARCHIVED';
type ConfirmAction = {
  title: string;
  message: string;
  confirmLabel: string;
  onConfirm: () => Promise<void>;
};

const STATUS_COLORS: Record<string, string> = {
  DRAFT: 'bg-slate-100 text-slate-700',
  SUBMITTED: 'bg-blue-100 text-blue-800',
  UNDER_REVIEW: 'bg-indigo-100 text-indigo-800',
  APPROVED: 'bg-emerald-100 text-emerald-800',
  RETURNED: 'bg-amber-100 text-amber-800'
};

export const AcademicAdminPage: React.FC = () => {
  const [section, setSection] = useState<Section>('OVERVIEW');
  const [years, setYears] = useState<AcademicYear[]>([]);
  const [terms, setTerms] = useState<AcademicTerm[]>([]);
  const [classes, setClasses] = useState<AcademicClass[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [combinations, setCombinations] = useState<CombinationView[]>([]);
  const [levels, setLevels] = useState<ClassLevel[]>([]);
  const [teachers, setTeachers] = useState<UserProfile[]>([]);
  const [assignments, setAssignments] = useState<ClassSubjectAssignmentView[]>([]);
  const [classTeachers, setClassTeachers] = useState<Array<{ id: string; classId: string; teacherId: string }>>([]);
  const [categories, setCategories] = useState<AssessmentCategory[]>([]);
  const [scales, setScales] = useState<GradingScale[]>([]);
  const [settings, setSettings] = useState<{
    academicYearId?: string; termId?: string; gradingScaleId?: string;
    enableRanking: boolean; enablePromotionDecision: boolean;
    promotionPassAverage?: number; allowSelfApproval?: boolean;
    commentsRequiredBeforeApproval?: boolean; submissionDeadlineDays?: number;
  } | null>(null);
  const [dashboard, setDashboard] = useState<AcademicDashboardView | null>(null);
  const [submissions, setSubmissions] = useState<SubmissionView[]>([]);
  const [yearId, setYearId] = useState('');
  const [termId, setTermId] = useState('');
  const [resultClassId, setResultClassId] = useState('');
  const [newYear, setNewYear] = useState('');
  const [newTerm, setNewTerm] = useState('');
  const [newClass, setNewClass] = useState({
    id: '', name: '', code: '', academicYearId: '', combinationId: '', levelId: '',
    classTeacherId: '', stream: '', room: '', status: 'ACTIVE' as StructureStatus
  });
  const [newSubject, setNewSubject] = useState({
    id: '', name: '', code: '', department: '', credits: '4', passMark: '50',
    status: 'ACTIVE' as StructureStatus, combinationIds: [] as string[], levelIds: [] as string[]
  });
  const [newLevel, setNewLevel] = useState({
    id: '', name: '', code: '', description: '', academicProgramme: '',
    combinationIds: [] as string[], isActive: true
  });
  const [assignment, setAssignment] = useState({
    id: '', classId: '', subjectId: '', combinationId: '', levelId: '', teacherIds: [] as string[]
  });
  const [classTeacher, setClassTeacher] = useState({ classId: '', teacherId: '' });
  const [confirmAction, setConfirmAction] = useState<ConfirmAction | null>(null);
  const [historyView, setHistoryView] = useState<{ title: string; events: AcademicWorkflowEvent[] } | null>(null);
  const [newCategory, setNewCategory] = useState({ code: '', name: '', maxMarks: '30', weightPercentage: '30' });
  const [editingCategoryId, setEditingCategoryId] = useState('');
  const [editingScaleId, setEditingScaleId] = useState('');
  const [newScale, setNewScale] = useState({
    name: 'Custom Scale', passMark: '50',
    boundaries: [
      { grade: 'A', minPercentage: '80', maxPercentage: '100', description: 'Excellent' },
      { grade: 'B', minPercentage: '70', maxPercentage: '79.99', description: 'Very Good' },
      { grade: 'C', minPercentage: '60', maxPercentage: '69.99', description: 'Good' },
      { grade: 'D', minPercentage: '50', maxPercentage: '59.99', description: 'Satisfactory' },
      { grade: 'F', minPercentage: '0', maxPercentage: '49.99', description: 'Fail' }
    ]
  });
  const [reasonBySubmission, setReasonBySubmission] = useState<Record<string, string>>({});
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  const reload = async () => {
    setLoading(true);
    setError('');
    try {
      const [
        yearList, classList, subjectList, userList, categoryList, scaleList, settingView,
        dash, submissionList, classTeacherList, combinationList, levelList, assignmentList
      ] = await Promise.all([
        api.getAcademicYears(), api.getClasses(), api.getSubjects(), api.getAcademicTeachers(),
        api.getAssessmentCategories(), api.getGradingScales(), api.getAcademicSettings(),
        api.getAcademicDashboard(), api.getSubmissions(), api.getClassTeacherAssignments(),
        api.getCombinations({ includeArchived: false }), api.getClassLevels(),
        api.getAssignments({ includeInactive: true })
      ]);
      setYears(yearList);
      setClasses(classList);
      setSubjects(subjectList);
      setCombinations(combinationList);
      setLevels(levelList);
      setTeachers(userList.filter(user => user.role === 'TEACHER' || user.role === 'DEPUTY_HEAD'));
      setCategories(categoryList);
      setScales(scaleList);
      setSettings(settingView);
      setDashboard(dash);
      setSubmissions(submissionList);
      setClassTeachers(classTeacherList);
      const activeYear = settingView.academicYearId || yearList.find(y => y.isActive)?.id || yearList[0]?.id || '';
      const activeTerm = settingView.termId || '';
      setYearId(prev => prev || activeYear);
      setTermId(prev => prev || activeTerm);
      setResultClassId(prev => prev || classList.find(item => (item.status ?? 'ACTIVE') === 'ACTIVE')?.id || classList[0]?.id || '');
      const initialAssignment = assignmentList.find(item =>
        (!activeYear || item.academicYearId === activeYear) && (!activeTerm || item.termId === activeTerm)
      ) ?? assignmentList[0];
      if (initialAssignment) {
        setAssignment({
          id: initialAssignment.id,
          classId: initialAssignment.classId,
          subjectId: initialAssignment.subjectId,
          combinationId: initialAssignment.combinationId || '',
          levelId: initialAssignment.levelId || '',
          teacherIds: [...initialAssignment.teacherIds]
        });
      }
      setClassTeacher(prev => ({
        ...prev,
        classId: prev.classId || classList.find(item => (item.status ?? 'ACTIVE') === 'ACTIVE')?.id || classList[0]?.id || '',
        teacherId: prev.teacherId || userList.find(user => user.role === 'TEACHER')?.id || ''
      }));
      setNewClass(prev => ({ ...prev, academicYearId: prev.academicYearId || activeYear }));
      const termData = await api.getTerms(activeYear);
      setTerms(termData);
      setAssignments(assignmentList);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load academic administration data.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { reload(); }, []);

  useEffect(() => {
    if (!yearId) return;
    let active = true;
    api.getTerms(yearId).then(data => {
      if (!active) return;
      setTerms(data);
      setTermId(current => data.some(term => term.id === current) ? current : data.find(term => term.isActive)?.id || data[0]?.id || '');
    }).catch(err => setError(err instanceof Error ? err.message : 'Failed to load terms.'));
    return () => { active = false; };
  }, [yearId]);

  useEffect(() => {
    if (!yearId || !termId) return;
    api.getAssignments({ yearId, termId, includeInactive: true }).then(setAssignments)
      .catch(err => setError(err instanceof Error ? err.message : 'Failed to load assignments.'));
  }, [yearId, termId]);

  const reviewQueue = useMemo(
    () => submissions.filter(item => ['SUBMITTED', 'UNDER_REVIEW'].includes(item.status)),
    [submissions]
  );
  const approvedQueue = useMemo(() => submissions.filter(item => item.status === 'APPROVED'), [submissions]);

  const activeCombinations = useMemo(
    () => combinations.filter(item => item.status === 'ACTIVE'),
    [combinations]
  );
  const activeLevels = useMemo(() => levels.filter(item => item.isActive), [levels]);
  const levelsForCombination = (combinationId: string) => activeLevels.filter(item =>
    !combinationId || item.combinationIds.includes(combinationId)
  );
  const classesForStructure = useMemo(
    () => classes.filter(item => (item.status ?? 'ACTIVE') === 'ACTIVE'
      && (!assignment.combinationId || item.combinationId === assignment.combinationId)
      && (!assignment.levelId || item.levelId === assignment.levelId)),
    [classes, assignment.combinationId, assignment.levelId]
  );
  const subjectsForStructure = useMemo(
    () => subjects.filter(item => item.status !== 'ARCHIVED'
      && (!assignment.combinationId || !item.combinationIds?.length || item.combinationIds.includes(assignment.combinationId))
      && (!assignment.levelId || !item.levelIds?.length || item.levelIds.includes(assignment.levelId))),
    [subjects, assignment.combinationId, assignment.levelId]
  );
  const classFormLevels = levelsForCombination(newClass.combinationId);
  const activeClasses = classes.filter(item => (item.status ?? 'ACTIVE') === 'ACTIVE');

  const act = async (task: () => Promise<unknown>, success: string) => {
    setMessage('');
    setError('');
    try {
      await task();
      setMessage(success);
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'The operation failed.');
    }
  };

  const handleCreateYear = () => act(
    () => api.createAcademicYear({ name: newYear }),
    `Academic year ${newYear} created.`
  ).then(() => setNewYear(''));

  const handleCreateTerm = () => act(
    () => api.createTerm({ academicYearId: yearId, name: newTerm }),
    `Term ${newTerm} created.`
  ).then(() => setNewTerm(''));

  const resetClassForm = () => setNewClass({
    id: '', name: '', code: '', academicYearId: yearId, combinationId: '', levelId: '',
    classTeacherId: '', stream: '', room: '', status: 'ACTIVE'
  });
  const resetSubjectForm = () => setNewSubject({
    id: '', name: '', code: '', department: '', credits: '4', passMark: '50',
    status: 'ACTIVE', combinationIds: [], levelIds: []
  });
  const resetLevelForm = () => setNewLevel({
    id: '', name: '', code: '', description: '', academicProgramme: '', combinationIds: [], isActive: true
  });

  const handleSaveClass = () => {
    const level = levels.find(item => item.id === newClass.levelId);
    const combination = combinations.find(item => item.id === newClass.combinationId);
    const teacher = teachers.find(item => item.id === newClass.classTeacherId);
    const payload = {
      ...newClass,
      academicYearId: newClass.academicYearId || yearId,
      grade: level?.name || '',
      combination: combination?.name || '',
      classTeacherName: teacher?.fullName || ''
    };
    return act(
      () => newClass.id ? api.updateClass(newClass.id, payload) : api.createClass(payload),
      `Class ${newClass.name} ${newClass.id ? 'updated' : 'created'}.`
    ).then(resetClassForm);
  };

  const handleSaveSubject = () => act(
    () => {
      const payload = {
        ...newSubject,
        credits: Number(newSubject.credits),
        passMark: Number(newSubject.passMark)
      };
      return newSubject.id ? api.updateSubject(newSubject.id, payload) : api.createSubject(payload);
    },
    `Subject ${newSubject.name} ${newSubject.id ? 'updated' : 'created'}.`
  ).then(resetSubjectForm);

  const handleSaveLevel = () => act(
    () => newLevel.id
      ? api.updateClassLevel(newLevel.id, newLevel)
      : api.createClassLevel(newLevel),
    `Class level ${newLevel.name} ${newLevel.id ? 'updated' : 'created'}.`
  ).then(resetLevelForm);

  const handleSaveAssignment = () => act(
    () => {
      const payload = {
        academicYearId: yearId,
        termId,
        classId: assignment.classId,
        subjectId: assignment.subjectId,
        combinationId: assignment.combinationId || undefined,
        levelId: assignment.levelId || undefined,
        teacherIds: assignment.teacherIds
      };
      return assignment.id ? api.updateAssignment(assignment.id, payload) : api.assignTeacher(payload);
    },
    'Teacher assignment saved and notification queued.'
  );

  const handleSetStatus = (
    kind: 'class' | 'subject',
    id: string,
    name: string,
    status: StructureStatus
  ) => {
    setConfirmAction({
      title: `${status === 'ARCHIVED' ? 'Archive' : status === 'INACTIVE' ? 'Deactivate' : 'Activate'} ${name}?`,
      message: status === 'ARCHIVED'
        ? 'Existing students, marks and report cards are preserved. Archived records cannot receive new assignments or marks.'
        : 'This changes whether the record can be selected for new academic work.',
      confirmLabel: status === 'ARCHIVED' ? 'Archive' : 'Change status',
      onConfirm: () => act(
        () => kind === 'class' ? api.setClassStatus(id, status) : api.setSubjectStatus(id, status),
        `${name} status changed to ${status}.`
      )
    });
  };

  const handleAssignmentStatus = (item: ClassSubjectAssignmentView) => {
    const nextActive = !item.isActive;
    setConfirmAction({
      title: nextActive ? 'Reactivate assignment?' : 'Deactivate assignment?',
      message: 'Teachers only see active assignments when entering marks. Existing marks and submissions are preserved.',
      confirmLabel: nextActive ? 'Reactivate' : 'Deactivate',
      onConfirm: () => act(
        () => api.updateAssignment(item.id, { isActive: nextActive }),
        `Assignment ${nextActive ? 'reactivated' : 'deactivated'}.`
      )
    });
  };

  const handleAssignmentHistory = async (id: string) => {
    try {
      const events = await api.getAssignmentHistory(id);
      const item = assignments.find(entry => entry.id === id);
      setHistoryView({
        title: `${item?.className || 'Assignment'} · ${item?.subjectName || 'Subject'}`,
        events
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load assignment history.');
    }
  };

  const handleAssignClassTeacher = () => act(
    () => api.assignClassTeacher({ academicYearId: yearId, ...classTeacher }),
    'Class teacher assigned for the selected academic year.'
  );

  const categoryPayload = {
    ...newCategory,
    maxMarks: Number(newCategory.maxMarks),
    weightPercentage: Number(newCategory.weightPercentage)
  };

  const handleEditCategory = (category: AssessmentCategory) => {
    setEditingCategoryId(category.id);
    setNewCategory({
      code: category.code, name: category.name,
      maxMarks: String(category.maxMarks), weightPercentage: String(category.weightPercentage)
    });
  };

  const handleSaveCategory = () => act(
    () => editingCategoryId
      ? api.updateAssessmentCategory(editingCategoryId, categoryPayload)
      : api.createAssessmentCategory(categoryPayload),
    `Assessment category ${newCategory.code} ${editingCategoryId ? 'updated' : 'created'}.`
  ).then(() => {
    setEditingCategoryId('');
    setNewCategory({ code: '', name: '', maxMarks: '30', weightPercentage: '30' });
  });

  const scalePayload = {
    name: newScale.name,
    passMark: Number(newScale.passMark),
    gradeBoundaries: newScale.boundaries.map((boundary): GradeBoundary => ({
      grade: boundary.grade,
      minPercentage: Number(boundary.minPercentage),
      maxPercentage: Number(boundary.maxPercentage),
      description: boundary.description
    }))
  };

  const handleEditScale = (scale: GradingScale) => {
    setEditingScaleId(scale.id);
    setNewScale({
      name: scale.name,
      passMark: String(scale.passMark),
      boundaries: scale.gradeBoundaries.map(boundary => ({
        grade: boundary.grade,
        minPercentage: String(boundary.minPercentage),
        maxPercentage: String(boundary.maxPercentage),
        description: boundary.description
      }))
    });
  };

  const handleSaveScale = () => act(
    () => editingScaleId
      ? api.updateGradingScale(editingScaleId, scalePayload)
      : api.createGradingScale(scalePayload),
    `Grading scale ${newScale.name} ${editingScaleId ? 'updated' : 'created'}.`
  ).then(() => {
    setEditingScaleId('');
    setNewScale({
      name: 'Custom Scale', passMark: '50',
      boundaries: [
        { grade: 'A', minPercentage: '80', maxPercentage: '100', description: 'Excellent' },
        { grade: 'B', minPercentage: '70', maxPercentage: '79.99', description: 'Very Good' },
        { grade: 'C', minPercentage: '60', maxPercentage: '69.99', description: 'Good' },
        { grade: 'D', minPercentage: '50', maxPercentage: '59.99', description: 'Satisfactory' },
        { grade: 'F', minPercentage: '0', maxPercentage: '49.99', description: 'Fail' }
      ]
    });
  });

  const handleSetting = (patch: Parameters<typeof api.updateAcademicSettings>[0]) => act(
    () => api.updateAcademicSettings(patch), 'Academic policy updated.'
  );

  const handleSubmission = (
    id: string,
    operation: 'approve' | 'review' | 'return' | 'reopen'
  ) => {
    const reason = reasonBySubmission[id] || '';
    if (['return', 'reopen'].includes(operation) && !reason.trim()) {
      setError('A reason is required for this action.');
      return;
    }
    const task = operation === 'approve' ? () => api.approveMarks(id)
      : operation === 'review' ? () => api.markMarksUnderReview(id)
        : operation === 'return' ? () => api.returnMarks(id, reason)
          : () => api.reopenMarks(id, reason);
    act(task, operation === 'approve'
      ? 'Marks approved and report cards generated from approved results.'
      : operation === 'review' ? 'Marks moved under review.'
        : operation === 'return' ? 'Marks returned to the teacher with the recorded reason.'
          : 'Approved marks reopened and dependent reports unpublished.');
  };

  if (loading && !dashboard) return <div className="p-8 text-center text-slate-500">Loading academic administration...</div>;

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div>
        <h1 className="text-2xl font-black text-slate-900">Academic Administration</h1>
        <p className="mt-1 text-sm text-slate-500">
          Manage the school academic year, assignments, grading policy, marks approval and performance monitoring.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {([
          ['OVERVIEW', 'Overview', Gauge], ['STRUCTURE', 'Years, terms & assignments', Users],
          ['CONFIG', 'Assessment & grading', Settings2], ['REVIEW', 'Review queue', ClipboardCheck]
        ] as const).map(([id, label, Icon]) => (
          <button
            key={id}
            onClick={() => setSection(id)}
            className={`inline-flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-bold ${
              section === id ? 'bg-blue-700 text-white' : 'bg-white text-slate-600 border border-slate-200'
            }`}
          >
            <Icon size={14} /> {label}
          </button>
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

      {section === 'OVERVIEW' && dashboard && (
        <div className="space-y-5">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {([
              { label: 'Assignments', value: dashboard.totals.assignments, Icon: BookOpen },
              { label: 'Submitted', value: dashboard.totals.submitted, Icon: ClipboardCheck },
              { label: 'Approved', value: dashboard.totals.approved, Icon: CheckCircle2 },
              { label: 'Returned', value: dashboard.totals.returned, Icon: Undo2 },
              { label: 'Published reports', value: dashboard.totals.publishedReports, Icon: Gauge },
              { label: 'Incomplete reports', value: dashboard.totals.incompleteReports, Icon: AlertCircle }
            ] as Array<{ label: string; value: number; Icon: React.ComponentType<{ size?: number }> }>).map(kpi => (
              <div key={kpi.label} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold uppercase text-slate-500">{kpi.label}</span>
                  <kpi.Icon size={16} />
                </div>
                <p className="mt-2 text-2xl font-black text-slate-900">{kpi.value}</p>
              </div>
            ))}
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-4">
            <h2 className="mb-3 text-sm font-bold text-slate-800">Non-submitters / returned work</h2>
            {dashboard.notSubmitted.length ? (
              <div className="overflow-x-auto">
                <table className="min-w-full text-xs">
                  <thead className="bg-slate-50 text-left uppercase text-slate-500">
                    <tr><th className="p-2">Teacher</th><th className="p-2">Class</th><th className="p-2">Subject</th><th className="p-2">Status</th></tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {dashboard.notSubmitted.map(item => (
                      <tr key={item.id}>
                        <td className="p-2">{item.teacherName}</td>
                        <td className="p-2">{item.className}</td>
                        <td className="p-2">{item.subjectName}</td>
                        <td className="p-2"><span className={`rounded px-2 py-0.5 ${STATUS_COLORS[item.status]}`}>{item.status}</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : <p className="text-xs text-slate-400">All assigned submissions are with the reviewer.</p>}
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-4">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-sm font-bold text-slate-800">Class performance snapshot</h2>
              <select
                value={resultClassId}
                onChange={event => setResultClassId(event.target.value)}
                className="rounded-lg border border-slate-300 px-2 py-1.5 text-xs"
              >
                {classes.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
              </select>
            </div>
            <ClassPerformance classId={resultClassId} yearId={yearId} termId={termId} />
          </div>
        </div>
      )}

      {section === 'STRUCTURE' && (
        <div className="space-y-4">
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <h2 className="text-sm font-bold text-slate-800">Academic years &amp; terms</h2>
              <div className="mt-3 flex gap-2">
                <input value={newYear} onChange={e => setNewYear(e.target.value)} placeholder="e.g. 2026 - 2027"
                  className="min-w-0 flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm" />
                <button onClick={handleCreateYear} className="rounded-lg bg-blue-700 px-3 py-2 text-xs font-bold text-white">Add year</button>
              </div>
              <div className="mt-3 flex gap-2">
                <input value={newTerm} onChange={e => setNewTerm(e.target.value)} placeholder="New term name"
                  className="min-w-0 flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm" />
                <button onClick={handleCreateTerm} disabled={!yearId} className="rounded-lg bg-blue-700 px-3 py-2 text-xs font-bold text-white disabled:opacity-50">Add term</button>
              </div>
              <ul className="mt-4 space-y-1 text-xs">
                {years.map(year => (
                  <li key={year.id} className="rounded-lg bg-slate-50 px-3 py-2">
                    <span className="font-bold">{year.name}</span>
                    {year.isActive && <span className="ml-2 rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] text-emerald-800">Active</span>}
                    <span className="ml-2 text-slate-500">{terms.filter(term => term.academicYearId === year.id).map(term => term.name).join(', ')}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="rounded-2xl border border-blue-200 bg-blue-50/60 p-4">
              <h2 className="text-sm font-bold text-slate-800">Managed academic chain</h2>
              <p className="mt-2 text-xs leading-5 text-slate-600">
                Configure once here, then use the same records in registration, class placement and marks entry.
              </p>
              <div className="mt-3 flex flex-wrap gap-2 text-[11px] font-bold text-blue-900">
                {[
                  `Years ${years.length}`, `Combinations ${activeCombinations.length}`,
                  `Levels ${activeLevels.length}`, `Classes ${activeClasses.length}`,
                  `Subjects ${subjects.filter(item => item.status !== 'ARCHIVED').length}`,
                  `Assignments ${assignments.filter(item => item.isActive).length}`
                ].map(item => (
                  <span key={item} className="rounded-full bg-white px-2.5 py-1">{item}</span>
                ))}
              </div>
              <p className="mt-3 text-[11px] text-slate-500">
                Teacher marks screens expose only active assignments. Archived records remain available for historical reports.
              </p>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-sm font-bold text-slate-800">Class levels</h2>
              <span className="text-[11px] text-slate-500">Derived from existing classes; new levels are added without deleting legacy records.</span>
            </div>
            <div className="mt-3 grid gap-3 lg:grid-cols-4">
              <input value={newLevel.name} onChange={e => setNewLevel(prev => ({ ...prev, name: e.target.value }))}
                placeholder="Level name" className="rounded-lg border border-slate-300 px-3 py-2 text-xs" />
              <input value={newLevel.code} onChange={e => setNewLevel(prev => ({ ...prev, code: e.target.value }))}
                placeholder="Code (e.g. L4)" className="rounded-lg border border-slate-300 px-3 py-2 text-xs" />
              <input value={newLevel.academicProgramme} onChange={e => setNewLevel(prev => ({ ...prev, academicProgramme: e.target.value }))}
                placeholder="Programme" className="rounded-lg border border-slate-300 px-3 py-2 text-xs" />
              <input value={newLevel.description} onChange={e => setNewLevel(prev => ({ ...prev, description: e.target.value }))}
                placeholder="Description" className="rounded-lg border border-slate-300 px-3 py-2 text-xs" />
            </div>
            <div className="mt-3 grid gap-3 lg:grid-cols-2">
              <IdChecklist
                title="Linked combinations"
                options={activeCombinations.map(item => ({ id: item.id, name: item.name }))}
                selected={newLevel.combinationIds}
                onChange={ids => setNewLevel(prev => ({ ...prev, combinationIds: ids }))}
              />
              <label className="mt-6 flex items-center gap-2 text-xs font-bold text-slate-700">
                <input type="checkbox" checked={newLevel.isActive}
                  onChange={e => setNewLevel(prev => ({ ...prev, isActive: e.target.checked }))} />
                Active level
              </label>
            </div>
            <div className="mt-3 flex gap-2">
              <button onClick={handleSaveLevel} className="rounded-lg bg-blue-700 px-4 py-2 text-xs font-bold text-white">
                {newLevel.id ? 'Update level' : 'Add level'}
              </button>
              <button onClick={resetLevelForm} className="rounded-lg border border-slate-300 px-4 py-2 text-xs font-bold text-slate-600">Reset</button>
            </div>
            <div className="mt-4 max-h-56 overflow-y-auto">
              <table className="min-w-full text-xs">
                <thead className="bg-slate-50 text-left uppercase text-slate-500">
                  <tr><th className="p-2">Level</th><th className="p-2">Code</th><th className="p-2">Combinations</th><th className="p-2">Status</th><th className="p-2">Action</th></tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {levels.map(item => (
                    <tr key={item.id}>
                      <td className="p-2 font-bold">{item.name}</td>
                      <td className="p-2">{item.code}</td>
                      <td className="p-2">{item.combinationIds.map(id => combinations.find(c => c.id === id)?.name || id).join(', ') || 'All'}</td>
                      <td className="p-2">{item.isActive ? 'Active' : 'Inactive'}</td>
                      <td className="p-2">
                        <div className="flex flex-wrap gap-2">
                          <button onClick={() => setNewLevel({
                            id: item.id, name: item.name, code: item.code,
                            description: item.description || '', academicProgramme: item.academicProgramme || '',
                            combinationIds: [...item.combinationIds], isActive: item.isActive
                          })} className="text-blue-700 underline">Edit</button>
                          <button onClick={() => setConfirmAction({
                            title: `${item.isActive ? 'Deactivate' : 'Activate'} ${item.name}?`,
                            message: 'This affects new selections only. Existing classes and marks are preserved.',
                            confirmLabel: item.isActive ? 'Deactivate' : 'Activate',
                            onConfirm: () => act(() => api.updateClassLevel(item.id, { isActive: !item.isActive }), 'Class level status updated.')
                          })} className="text-slate-600 underline">
                            {item.isActive ? 'Deactivate' : 'Activate'}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <h2 className="text-sm font-bold text-slate-800">Classes</h2>
            <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <input value={newClass.name} onChange={e => setNewClass(prev => ({ ...prev, name: e.target.value }))}
                placeholder="Class name" className="rounded-lg border border-slate-300 px-3 py-2 text-xs" />
              <input value={newClass.code} onChange={e => setNewClass(prev => ({ ...prev, code: e.target.value }))}
                placeholder="Class code" className="rounded-lg border border-slate-300 px-3 py-2 text-xs" />
              <SearchableSelect label="Academic year" value={newClass.academicYearId || yearId}
                options={years.map(item => ({ id: item.id, name: item.name }))}
                onChange={value => setNewClass(prev => ({ ...prev, academicYearId: value }))} />
              <SearchableSelect label="Combination" value={newClass.combinationId}
                options={activeCombinations.map(item => ({ id: item.id, name: item.name }))}
                onChange={value => setNewClass(prev => ({ ...prev, combinationId: value, levelId: '' }))} />
              <SearchableSelect label="Class level" value={newClass.levelId}
                options={classFormLevels.map(item => ({ id: item.id, name: item.name }))}
                onChange={value => setNewClass(prev => ({ ...prev, levelId: value }))} />
              <SearchableSelect label="Class teacher" value={newClass.classTeacherId}
                options={teachers.map(item => ({ id: item.id, name: item.fullName }))}
                onChange={value => setNewClass(prev => ({ ...prev, classTeacherId: value }))} />
              <input value={newClass.stream} onChange={e => setNewClass(prev => ({ ...prev, stream: e.target.value }))}
                placeholder="Stream" className="rounded-lg border border-slate-300 px-3 py-2 text-xs" />
              <input value={newClass.room} onChange={e => setNewClass(prev => ({ ...prev, room: e.target.value }))}
                placeholder="Room" className="rounded-lg border border-slate-300 px-3 py-2 text-xs" />
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <select value={newClass.status} onChange={e => setNewClass(prev => ({ ...prev, status: e.target.value as StructureStatus }))}
                className="rounded-lg border border-slate-300 px-3 py-2 text-xs">
                <option value="ACTIVE">Active</option><option value="INACTIVE">Inactive</option><option value="ARCHIVED">Archived</option>
              </select>
              <button onClick={handleSaveClass} className="rounded-lg bg-blue-700 px-4 py-2 text-xs font-bold text-white">
                {newClass.id ? 'Update class' : 'Add class'}
              </button>
              <button onClick={resetClassForm} className="rounded-lg border border-slate-300 px-4 py-2 text-xs font-bold text-slate-600">Reset</button>
            </div>
            <div className="mt-4 max-h-72 overflow-y-auto">
              <table className="min-w-full text-xs">
                <thead className="bg-slate-50 text-left uppercase text-slate-500">
                  <tr><th className="p-2">Class</th><th className="p-2">Code</th><th className="p-2">Combination / level</th><th className="p-2">Teacher</th><th className="p-2">Status</th><th className="p-2">Action</th></tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {classes.map(item => (
                    <tr key={item.id}>
                      <td className="p-2 font-bold">{item.name}</td>
                      <td className="p-2">{item.code || '-'}</td>
                      <td className="p-2">{item.combination || '-'} / {levels.find(level => level.id === item.levelId)?.name || item.grade || '-'}</td>
                      <td className="p-2">{item.classTeacherName || '-'}</td>
                      <td className="p-2">{item.status ?? 'ACTIVE'}</td>
                      <td className="p-2">
                        <div className="flex flex-wrap gap-2">
                          <button onClick={() => setNewClass({
                            id: item.id, name: item.name, code: item.code || '',
                            academicYearId: item.academicYearId || '', combinationId: item.combinationId || '',
                            levelId: item.levelId || '', classTeacherId: item.classTeacherId || '',
                            stream: item.stream || '', room: item.room || '', status: item.status ?? 'ACTIVE'
                          })} className="text-blue-700 underline">Edit</button>
                          <button onClick={() => handleSetStatus('class', item.id, item.name,
                            (item.status ?? 'ACTIVE') === 'ARCHIVED' ? 'ACTIVE' : 'ARCHIVED')} className="text-slate-600 underline">
                            {(item.status ?? 'ACTIVE') === 'ARCHIVED' ? 'Restore' : 'Archive'}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <h2 className="text-sm font-bold text-slate-800">Subjects</h2>
            <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
              <input value={newSubject.name} onChange={e => setNewSubject(prev => ({ ...prev, name: e.target.value }))}
                placeholder="Subject name" className="rounded-lg border border-slate-300 px-3 py-2 text-xs" />
              <input value={newSubject.code} onChange={e => setNewSubject(prev => ({ ...prev, code: e.target.value }))}
                placeholder="Code" className="rounded-lg border border-slate-300 px-3 py-2 text-xs" />
              <input value={newSubject.department} onChange={e => setNewSubject(prev => ({ ...prev, department: e.target.value }))}
                placeholder="Department" className="rounded-lg border border-slate-300 px-3 py-2 text-xs" />
              <input value={newSubject.credits} type="number" onChange={e => setNewSubject(prev => ({ ...prev, credits: e.target.value }))}
                placeholder="Credits" className="rounded-lg border border-slate-300 px-3 py-2 text-xs" />
              <input value={newSubject.passMark} type="number" onChange={e => setNewSubject(prev => ({ ...prev, passMark: e.target.value }))}
                placeholder="Pass mark" className="rounded-lg border border-slate-300 px-3 py-2 text-xs" />
            </div>
            <div className="mt-3 grid gap-3 lg:grid-cols-3">
              <IdChecklist title="Combinations" options={activeCombinations.map(item => ({ id: item.id, name: item.name }))}
                selected={newSubject.combinationIds}
                onChange={ids => setNewSubject(prev => ({ ...prev, combinationIds: ids }))} />
              <IdChecklist title="Class levels" options={activeLevels.map(item => ({ id: item.id, name: item.name }))}
                selected={newSubject.levelIds}
                onChange={ids => setNewSubject(prev => ({ ...prev, levelIds: ids }))} />
              <div className="space-y-2">
                <select value={newSubject.status} onChange={e => setNewSubject(prev => ({ ...prev, status: e.target.value as StructureStatus }))}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs">
                  <option value="ACTIVE">Active</option><option value="INACTIVE">Inactive</option><option value="ARCHIVED">Archived</option>
                </select>
                <div className="flex gap-2">
                  <button onClick={handleSaveSubject} className="rounded-lg bg-blue-700 px-4 py-2 text-xs font-bold text-white">
                    {newSubject.id ? 'Update subject' : 'Add subject'}
                  </button>
                  <button onClick={resetSubjectForm} className="rounded-lg border border-slate-300 px-4 py-2 text-xs font-bold text-slate-600">Reset</button>
                </div>
              </div>
            </div>
            <div className="mt-4 max-h-56 overflow-y-auto">
              <table className="min-w-full text-xs">
                <thead className="bg-slate-50 text-left uppercase text-slate-500">
                  <tr><th className="p-2">Subject</th><th className="p-2">Code</th><th className="p-2">Links</th><th className="p-2">Status</th><th className="p-2">Action</th></tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {subjects.map(item => (
                    <tr key={item.id}>
                      <td className="p-2 font-bold">{item.name}</td>
                      <td className="p-2">{item.code}</td>
                      <td className="p-2">{[...(item.combinationIds ?? []).map(id => combinations.find(c => c.id === id)?.name || id),
                        ...(item.levelIds ?? []).map(id => levels.find(level => level.id === id)?.name || id)].join(', ') || 'All'}</td>
                      <td className="p-2">{item.status ?? 'ACTIVE'}</td>
                      <td className="p-2">
                        <div className="flex flex-wrap gap-2">
                          <button onClick={() => setNewSubject({
                            id: item.id, name: item.name, code: item.code, department: item.department,
                            credits: String(item.credits), passMark: String(item.passMark),
                            status: item.status ?? 'ACTIVE',
                            combinationIds: [...(item.combinationIds ?? [])], levelIds: [...(item.levelIds ?? [])]
                          })} className="text-blue-700 underline">Edit</button>
                          <button onClick={() => handleSetStatus('subject', item.id, item.name,
                            (item.status ?? 'ACTIVE') === 'ARCHIVED' ? 'ACTIVE' : 'ARCHIVED')} className="text-slate-600 underline">
                            {(item.status ?? 'ACTIVE') === 'ARCHIVED' ? 'Restore' : 'Archive'}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <h2 className="text-sm font-bold text-slate-800">Teacher / class / subject assignments</h2>
            <p className="mt-1 text-[11px] text-slate-500">
              Choices are limited to active combinations, levels, classes and subjects. Mismatched structure is rejected by the server.
            </p>
            <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <SearchableSelect label="Combination" value={assignment.combinationId}
                options={activeCombinations.map(item => ({ id: item.id, name: item.name }))}
                onChange={value => setAssignment(prev => ({ ...prev, combinationId: value, levelId: '', classId: '', subjectId: '', id: '' }))} />
              <SearchableSelect label="Class level" value={assignment.levelId}
                options={levelsForCombination(assignment.combinationId).map(item => ({ id: item.id, name: item.name }))}
                onChange={value => setAssignment(prev => ({ ...prev, levelId: value, classId: '', subjectId: '', id: '' }))} />
              <SearchableSelect label="Class" value={assignment.classId}
                options={classesForStructure.map(item => ({ id: item.id, name: item.name }))}
                onChange={value => setAssignment(prev => ({ ...prev, classId: value, subjectId: '', id: '' }))} />
              <SearchableSelect label="Subject" value={assignment.subjectId}
                options={subjectsForStructure.map(item => ({ id: item.id, name: item.name, detail: item.code }))}
                onChange={value => setAssignment(prev => ({ ...prev, subjectId: value, id: '' }))} />
            </div>
            <div className="mt-3">
              <IdChecklist title="Teachers" options={teachers.map(item => ({ id: item.id, name: item.fullName }))}
                selected={assignment.teacherIds}
                onChange={ids => setAssignment(prev => ({ ...prev, teacherIds: ids, id: '' }))} />
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <button onClick={handleSaveAssignment} disabled={!yearId || !termId}
                className="rounded-lg bg-blue-700 px-4 py-2 text-xs font-bold text-white disabled:opacity-50">
                {assignment.id ? 'Update assignment' : 'Save assignment'}
              </button>
              <button onClick={() => setAssignment({ id: '', classId: '', subjectId: '', combinationId: '', levelId: '', teacherIds: [] })}
                className="rounded-lg border border-slate-300 px-4 py-2 text-xs font-bold text-slate-600">Clear</button>
            </div>
            <div className="mt-4 max-h-72 overflow-y-auto">
              <table className="min-w-full text-xs">
                <thead className="bg-slate-50 text-left uppercase text-slate-500">
                  <tr><th className="p-2">Class</th><th className="p-2">Subject</th><th className="p-2">Structure</th><th className="p-2">Teachers</th><th className="p-2">Status</th><th className="p-2">Action</th></tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {assignments.map(item => (
                    <tr key={item.id}>
                      <td className="p-2 font-bold">{item.className}</td>
                      <td className="p-2">{item.subjectName}</td>
                      <td className="p-2">{item.combinationName || '-'} / {item.levelName || '-'}</td>
                      <td className="p-2">{item.teacherNames.join(', ') || 'None'}</td>
                      <td className="p-2">{item.isActive ? 'Active' : 'Inactive'}</td>
                      <td className="p-2">
                        <div className="flex flex-wrap gap-2">
                          <button onClick={() => setAssignment({
                            id: item.id, classId: item.classId, subjectId: item.subjectId,
                            combinationId: item.combinationId || '', levelId: item.levelId || '',
                            teacherIds: [...item.teacherIds]
                          })} className="text-blue-700 underline">Edit</button>
                          <button onClick={() => handleAssignmentHistory(item.id)} className="text-blue-700 underline">History</button>
                          <button onClick={() => handleAssignmentStatus(item)} className="text-slate-600 underline">
                            {item.isActive ? 'Deactivate' : 'Activate'}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <h2 className="text-sm font-bold text-slate-800">Class teachers for the selected year</h2>
            <div className="mt-3 grid gap-3 sm:grid-cols-3">
              <SearchableSelect label="Class" value={classTeacher.classId}
                options={classes.map(item => ({ id: item.id, name: item.name }))}
                onChange={value => setClassTeacher(prev => ({ ...prev, classId: value }))} />
              <SearchableSelect label="Teacher" value={classTeacher.teacherId}
                options={teachers.map(item => ({ id: item.id, name: item.fullName }))}
                onChange={value => setClassTeacher(prev => ({ ...prev, teacherId: value }))} />
              <div className="flex items-end">
                <button onClick={handleAssignClassTeacher} disabled={!yearId || !classTeacher.teacherId}
                  className="rounded-lg bg-blue-700 px-4 py-2 text-xs font-bold text-white disabled:opacity-50">Save class teacher</button>
              </div>
            </div>
            <ul className="mt-3 max-h-28 space-y-1 overflow-y-auto text-[11px] text-slate-600">
              {classTeachers.map(item => (
                <li key={item.id} className="rounded bg-slate-50 px-2 py-1">
                  {classes.find(c => c.id === item.classId)?.name || item.classId}:
                  {' '}{teachers.find(user => user.id === item.teacherId)?.fullName || item.teacherId}
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {section === 'CONFIG' && (
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="rounded-2xl border border-slate-200 bg-white p-4">
            <h2 className="flex items-center gap-2 text-sm font-bold text-slate-800">
              <SlidersHorizontal size={16} /> Assessment categories
            </h2>
            <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
              {(['code', 'name', 'maxMarks', 'weightPercentage'] as const).map(field => (
                <input key={field} value={newCategory[field]} placeholder={field}
                  onChange={e => setNewCategory(prev => ({ ...prev, [field]: e.target.value }))}
                  className="rounded-lg border border-slate-300 px-2 py-2 text-xs" />
              ))}
            </div>
            <div className="mt-2 flex gap-2">
              <button onClick={handleSaveCategory} className="rounded-lg bg-blue-700 px-3 py-2 text-xs font-bold text-white">
                {editingCategoryId ? 'Update category' : 'Add category'}
              </button>
              {editingCategoryId && (
                <button onClick={() => { setEditingCategoryId(''); setNewCategory({ code: '', name: '', maxMarks: '30', weightPercentage: '30' }); }}
                  className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-bold text-slate-600">Cancel</button>
              )}
            </div>
            <ul className="mt-4 space-y-1 text-xs">
              {categories.map(category => (
                <li key={category.id} className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2">
                  <span className="font-bold">{category.name}</span>
                  <span className="flex items-center gap-2">
                    <span className="text-slate-600">{category.maxMarks} marks / {category.weightPercentage}%</span>
                    <button onClick={() => handleEditCategory(category)} className="text-blue-700 underline">Edit</button>
                  </span>
                </li>
              ))}
            </ul>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-4">
            <h2 className="text-sm font-bold text-slate-800">Grading scales</h2>
            <div className="mt-3 flex gap-2">
              <input value={newScale.name} onChange={e => setNewScale(prev => ({ ...prev, name: e.target.value }))}
                className="min-w-0 flex-1 rounded-lg border border-slate-300 px-2 py-2 text-xs" />
              <input value={newScale.passMark} type="number" onChange={e => setNewScale(prev => ({ ...prev, passMark: e.target.value }))}
                className="w-20 rounded-lg border border-slate-300 px-2 py-2 text-xs" />
              <button onClick={handleSaveScale} className="rounded-lg bg-blue-700 px-3 py-2 text-xs font-bold text-white">
                {editingScaleId ? 'Update scale' : 'Add scale'}
              </button>
              {editingScaleId && (
                <button onClick={() => setEditingScaleId('')}
                  className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-bold text-slate-600">Cancel</button>
              )}
            </div>
            <div className="mt-3 max-h-36 overflow-y-auto text-xs">
              {newScale.boundaries.map((boundary, index) => (
                <div key={index} className="mb-1 grid grid-cols-4 gap-1">
                  {(['grade', 'minPercentage', 'maxPercentage', 'description'] as const).map(field => (
                    <input key={field} value={boundary[field]}
                      onChange={event => setNewScale(prev => ({
                        ...prev,
                        boundaries: prev.boundaries.map((item, i) => i === index ? { ...item, [field]: event.target.value } : item)
                      }))}
                      className="rounded border border-slate-300 px-1.5 py-1" />
                  ))}
                </div>
              ))}
            </div>
            <ul className="mt-3 space-y-1 text-xs">
              {scales.map(scale => (
                <li key={scale.id} className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2">
                  <span>
                    <span className="font-bold">{scale.name}</span>
                    <span className="ml-2 text-slate-600">pass {scale.passMark}</span>
                    <span className="ml-2 text-slate-500">{scale.gradeBoundaries.map(b => b.grade).join(', ')}</span>
                  </span>
                  <button onClick={() => handleEditScale(scale)} className="text-blue-700 underline">Edit</button>
                </li>
              ))}
            </ul>
          </div>

          {settings && (
            <div className="rounded-2xl border border-slate-200 bg-white p-4 lg:col-span-2">
              <h2 className="text-sm font-bold text-slate-800">Academic policy</h2>
              <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                <label className="text-xs font-bold text-slate-600">Active year
                  <select value={settings.academicYearId || ''} onChange={e => handleSetting({ academicYearId: e.target.value })}
                    className="mt-1 w-full rounded-lg border border-slate-300 px-2 py-2">
                    {years.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
                  </select>
                </label>
                <label className="text-xs font-bold text-slate-600">Active term
                  <select value={settings.termId || ''} onChange={e => handleSetting({ termId: e.target.value })}
                    className="mt-1 w-full rounded-lg border border-slate-300 px-2 py-2">
                    {terms.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
                  </select>
                </label>
                <label className="text-xs font-bold text-slate-600">Grading scale
                  <select value={settings.gradingScaleId || ''} onChange={e => handleSetting({ gradingScaleId: e.target.value })}
                    className="mt-1 w-full rounded-lg border border-slate-300 px-2 py-2">
                    {scales.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
                  </select>
                </label>
                <label className="flex items-center gap-2 text-xs font-bold text-slate-700">
                  <input type="checkbox" checked={settings.enableRanking}
                    onChange={e => handleSetting({ enableRanking: e.target.checked })} /> Enable ranking
                </label>
                <label className="flex items-center gap-2 text-xs font-bold text-slate-700">
                  <input type="checkbox" checked={settings.enablePromotionDecision}
                    onChange={e => handleSetting({ enablePromotionDecision: e.target.checked })} /> Promotion decision
                </label>
                <label className="flex items-center gap-2 text-xs font-bold text-slate-700">
                  <input type="checkbox" checked={Boolean(settings.allowSelfApproval)}
                    onChange={e => handleSetting({ allowSelfApproval: e.target.checked })} /> Allow self-approval
                </label>
                <label className="text-xs font-bold text-slate-600">Promotion pass average
                  <input type="number" value={settings.promotionPassAverage ?? 50}
                    onChange={e => handleSetting({ promotionPassAverage: Number(e.target.value) })}
                    className="mt-1 w-full rounded-lg border border-slate-300 px-2 py-2" />
                </label>
                <label className="text-xs font-bold text-slate-600">Submission deadline (days)
                  <input type="number" value={settings.submissionDeadlineDays ?? ''}
                    onChange={e => handleSetting({ submissionDeadlineDays: e.target.value ? Number(e.target.value) : undefined })}
                    className="mt-1 w-full rounded-lg border border-slate-300 px-2 py-2" />
                </label>
              </div>
              <p className="mt-3 text-[11px] text-slate-500">
                Grade boundaries, pass marks and assessment weightings are stored per school and enforced by the backend.
              </p>
            </div>
          )}
        </div>
      )}

      {section === 'REVIEW' && (
        <div className="space-y-4">
          <div className="rounded-2xl border border-slate-200 bg-white p-4">
            <h2 className="text-sm font-bold text-slate-800">Marks awaiting review ({reviewQueue.length})</h2>
            {reviewQueue.length === 0 ? (
              <p className="mt-3 text-xs text-slate-400">No submissions are waiting for review.</p>
            ) : (
              <div className="mt-3 space-y-3">
                {reviewQueue.map(item => (
                  <div key={item.id} className="rounded-xl border border-slate-200 p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <p className="text-sm font-bold text-slate-800">{item.subjectName} - {item.className}</p>
                        <p className="text-xs text-slate-500">Submitted by {item.teacherName} | {item.status}</p>
                      </div>
                      <span className={`rounded-full px-2 py-1 text-[10px] font-bold ${STATUS_COLORS[item.status]}`}>{item.status}</span>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <input value={reasonBySubmission[item.id] || ''}
                        onChange={e => setReasonBySubmission(prev => ({ ...prev, [item.id]: e.target.value }))}
                        placeholder="Review note / return reason"
                        className="min-w-[220px] flex-1 rounded-lg border border-slate-300 px-3 py-2 text-xs" />
                      {item.status === 'SUBMITTED' && (
                        <button onClick={() => handleSubmission(item.id, 'review')}
                          className="rounded-lg bg-indigo-700 px-3 py-2 text-xs font-bold text-white">Start Review</button>
                      )}
                      <button onClick={() => handleSubmission(item.id, 'approve')}
                        className="rounded-lg bg-emerald-700 px-3 py-2 text-xs font-bold text-white">Approve</button>
                      <button onClick={() => handleSubmission(item.id, 'return')}
                        className="rounded-lg bg-amber-600 px-3 py-2 text-xs font-bold text-white">Return</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-4">
            <h2 className="text-sm font-bold text-slate-800">Approved submissions ({approvedQueue.length})</h2>
            {approvedQueue.length === 0 ? (
              <p className="mt-3 text-xs text-slate-400">No approved submissions yet.</p>
            ) : (
              <div className="mt-3 overflow-x-auto">
                <table className="min-w-full text-xs">
                  <thead className="bg-slate-50 text-left uppercase text-slate-500">
                    <tr><th className="p-2">Class</th><th className="p-2">Subject</th><th className="p-2">Teacher</th><th className="p-2">Approved</th><th className="p-2">Action</th></tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {approvedQueue.map(item => (
                      <tr key={item.id}>
                        <td className="p-2">{item.className}</td>
                        <td className="p-2">{item.subjectName}</td>
                        <td className="p-2">{item.teacherName}</td>
                        <td className="p-2">{item.approvedAt ? new Date(item.approvedAt).toLocaleDateString() : '-'}</td>
                        <td className="p-2">
                          <div className="flex gap-2">
                            <input value={reasonBySubmission[item.id] || ''}
                              onChange={e => setReasonBySubmission(prev => ({ ...prev, [item.id]: e.target.value }))}
                              placeholder="Reason"
                              className="w-40 rounded border border-slate-300 px-2 py-1" />
                            <button onClick={() => handleSubmission(item.id, 'reopen')}
                              className="rounded bg-slate-700 px-2 py-1 font-bold text-white">Reopen</button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {confirmAction && (
        <ConfirmDialog
          title={confirmAction.title}
          message={confirmAction.message}
          confirmLabel={confirmAction.confirmLabel}
          onCancel={() => setConfirmAction(null)}
          onConfirm={async () => {
            const task = confirmAction.onConfirm;
            setConfirmAction(null);
            await task();
          }}
        />
      )}
      {historyView && (
        <HistoryDialog title={historyView.title} events={historyView.events} onClose={() => setHistoryView(null)} />
      )}
    </div>
  );
};

function IdChecklist({
  title,
  options,
  selected,
  onChange
}: {
  title: string;
  options: Array<{ id: string; name: string }>;
  selected: string[];
  onChange: (ids: string[]) => void;
}) {
  return (
    <div className="rounded-lg border border-slate-200 p-2">
      <p className="mb-1 text-[11px] font-bold uppercase text-slate-500">{title}</p>
      <div className="max-h-24 space-y-1 overflow-y-auto">
        {options.length === 0 && <p className="text-[11px] text-slate-400">No options available.</p>}
        {options.map(option => (
          <label key={option.id} className="flex items-center gap-2 text-xs text-slate-700">
            <input
              type="checkbox"
              checked={selected.includes(option.id)}
              onChange={event => onChange(event.target.checked
                ? [...selected, option.id]
                : selected.filter(id => id !== option.id))}
            />
            {option.name}
          </label>
        ))}
      </div>
    </div>
  );
}

function ConfirmDialog({
  title,
  message,
  confirmLabel,
  onCancel,
  onConfirm
}: {
  title: string;
  message: string;
  confirmLabel: string;
  onCancel: () => void;
  onConfirm: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
      <div role="dialog" aria-modal="true" className="w-full max-w-md rounded-2xl bg-white p-5 shadow-2xl">
        <h2 className="text-base font-black text-slate-900">{title}</h2>
        <p className="mt-2 text-sm leading-6 text-slate-600">{message}</p>
        <div className="mt-5 flex justify-end gap-2">
          <button onClick={onCancel} className="rounded-lg border border-slate-300 px-4 py-2 text-xs font-bold text-slate-600">Cancel</button>
          <button
            onClick={async () => {
              setBusy(true);
              try { await onConfirm(); } finally { setBusy(false); }
            }}
            disabled={busy}
            className="rounded-lg bg-blue-700 px-4 py-2 text-xs font-bold text-white disabled:opacity-50"
          >
            {busy ? 'Working...' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

function HistoryDialog({
  title,
  events,
  onClose
}: {
  title: string;
  events: AcademicWorkflowEvent[];
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
      <div role="dialog" aria-modal="true" className="w-full max-w-lg rounded-2xl bg-white p-5 shadow-2xl">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-black text-slate-900">Assignment history</h2>
            <p className="mt-1 text-xs text-slate-500">{title}</p>
          </div>
          <button onClick={onClose} className="rounded-lg border border-slate-300 px-3 py-1 text-xs font-bold text-slate-600">Close</button>
        </div>
        {events.length === 0 ? (
          <p className="mt-5 text-sm text-slate-400">No history recorded for this assignment yet.</p>
        ) : (
          <ol className="mt-4 space-y-2">
            {events.slice().reverse().map((event, index) => (
              <li key={`${event.at}-${index}`} className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">
                <span className="font-bold text-slate-800">{event.action.replaceAll('_', ' ')}</span>
                {' · '}{event.byName}
                {' · '}{new Date(event.at).toLocaleString()}
                {event.note && <p className="mt-1 text-slate-500">{event.note}</p>}
              </li>
            ))}
          </ol>
        )}
      </div>
    </div>
  );
}

function ClassPerformance({ classId, yearId, termId }: { classId: string; yearId: string; termId: string }) {
  const [data, setData] = useState<Awaited<ReturnType<typeof api.getAcademicResults>> | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!classId) return;
    let active = true;
    api.getAcademicResults({ classId, yearId, termId }).then(result => {
      if (active) setData(result);
    }).catch(err => {
      if (active) setError(err instanceof Error ? err.message : 'Failed to load class performance.');
    });
    return () => { active = false; };
  }, [classId, yearId, termId]);

  if (error) return <p className="text-xs text-red-600">{error}</p>;
  if (!data) return <p className="text-xs text-slate-400">Loading performance...</p>;

  return (
    <div className="overflow-x-auto">
      <div className="mb-2 text-xs font-bold text-blue-800">Class average: {data.classAverage}%</div>
      <table className="min-w-full text-xs">
        <thead className="bg-slate-50 text-left uppercase text-slate-500">
          <tr><th className="p-2">Student</th><th className="p-2">Average</th><th className="p-2">Grade</th><th className="p-2">Rank</th><th className="p-2">Complete</th></tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {data.students.map(student => (
            <tr key={student.studentId}>
              <td className="p-2">{student.studentName}</td>
              <td className="p-2 font-bold">{student.average}%</td>
              <td className="p-2">{student.grade}</td>
              <td className="p-2">{student.rank || '-'}</td>
              <td className="p-2">{student.isComplete ? 'Yes' : 'No'}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {data.missing.length > 0 && (
        <p className="mt-2 text-[11px] text-amber-700">{data.missing.length} missing mark record(s) detected.</p>
      )}
    </div>
  );
}
