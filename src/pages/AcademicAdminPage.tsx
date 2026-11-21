import React, { useEffect, useMemo, useState } from 'react';
import { api, AcademicDashboardView } from '../services/api';
import type {
  AcademicTerm, AcademicYear, AssessmentCategory, ClassSubjectAssignment,
  GradingScale, GradeBoundary, MarkSubmission, UserProfile
} from '../types';
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
  const [classes, setClasses] = useState<Array<{ id: string; name: string }>>([]);
  const [subjects, setSubjects] = useState<Array<{ id: string; name: string; code?: string }>>([]);
  const [teachers, setTeachers] = useState<UserProfile[]>([]);
  const [assignments, setAssignments] = useState<ClassSubjectAssignment[]>([]);
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
  const [newClass, setNewClass] = useState({ name: '', grade: '', stream: '', combination: '', room: '' });
  const [newSubject, setNewSubject] = useState({ name: '', code: '', department: '', credits: '4', passMark: '50' });
  const [assignment, setAssignment] = useState({ classId: '', subjectId: '', teacherIds: [] as string[] });
  const [classTeacher, setClassTeacher] = useState({ classId: '', teacherId: '' });
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
      const [yearList, classList, subjectList, userList, categoryList, scaleList, settingView, dash, submissionList, classTeacherList] =
        await Promise.all([
          api.getAcademicYears(), api.getClasses(), api.getSubjects(), api.getAcademicTeachers(),
          api.getAssessmentCategories(), api.getGradingScales(), api.getAcademicSettings(),
          api.getAcademicDashboard(), api.getSubmissions(), api.getClassTeacherAssignments()
        ]);
      setYears(yearList);
      setClasses(classList.map(item => ({ id: item.id, name: item.name })));
      setSubjects(subjectList.map(item => ({ id: item.id, name: item.name, code: item.code })));
      setTeachers(userList.filter(user => user.role === 'TEACHER' || user.role === 'DEPUTY_HEAD'));
      setCategories(categoryList);
      setScales(scaleList);
      setSettings(settingView);
      setDashboard(dash);
      setSubmissions(submissionList);
      setClassTeachers(classTeacherList);
      const activeYear = settingView.academicYearId || yearList.find(y => y.isActive)?.id || yearList[0]?.id || '';
      const activeTerm = settingView.termId || termListFallback(activeYear);
      setYearId(prev => prev || activeYear);
      setTermId(prev => prev || activeTerm);
      setResultClassId(prev => prev || classList[0]?.id || '');
      setAssignment(prev => ({ ...prev, classId: prev.classId || classList[0]?.id || '', subjectId: prev.subjectId || subjectList[0]?.id || '' }));
      setClassTeacher(prev => ({
        ...prev,
        classId: prev.classId || classList[0]?.id || '',
        teacherId: prev.teacherId || userList.find(user => user.role === 'TEACHER')?.id || ''
      }));
      const termData = await api.getTerms(activeYear);
      setTerms(termData);
      const assignmentData = await api.getAssignments({ yearId: activeYear, termId: activeTerm });
      setAssignments(assignmentData);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load academic administration data.');
    } finally {
      setLoading(false);
    }
  };

  function termListFallback(_yearId: string): string {
    return '';
  }

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
    api.getAssignments({ yearId, termId }).then(setAssignments)
      .catch(err => setError(err instanceof Error ? err.message : 'Failed to load assignments.'));
  }, [yearId, termId]);

  const reviewQueue = useMemo(
    () => submissions.filter(item => ['SUBMITTED', 'UNDER_REVIEW'].includes(item.status)),
    [submissions]
  );
  const approvedQueue = useMemo(() => submissions.filter(item => item.status === 'APPROVED'), [submissions]);

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

  const handleCreateClass = () => act(
    () => api.createClass(newClass),
    `Class ${newClass.name} created.`
  ).then(() => setNewClass({ name: '', grade: '', stream: '', combination: '', room: '' }));

  const handleCreateSubject = () => act(
    () => api.createSubject({
      ...newSubject,
      credits: Number(newSubject.credits),
      passMark: Number(newSubject.passMark)
    }),
    `Subject ${newSubject.name} created.`
  ).then(() => setNewSubject({ name: '', code: '', department: '', credits: '4', passMark: '50' }));

  const handleAssign = () => act(
    () => api.assignTeacher({ academicYearId: yearId, termId, ...assignment }),
    'Teacher assignment saved and notification queued.'
  );

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
    operation: 'approve' | 'return' | 'reopen'
  ) => {
    const reason = reasonBySubmission[id] || '';
    if (operation !== 'approve' && !reason.trim()) {
      setError('A reason is required for this action.');
      return;
    }
    const task = operation === 'approve' ? () => api.approveMarks(id)
      : operation === 'return' ? () => api.returnMarks(id, reason)
        : () => api.reopenMarks(id, reason);
    act(task, operation === 'approve'
      ? 'Marks approved and report cards generated from approved results.'
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
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="rounded-2xl border border-slate-200 bg-white p-4">
            <h2 className="text-sm font-bold text-slate-800">Academic years & terms</h2>
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

          <div className="rounded-2xl border border-slate-200 bg-white p-4">
            <h2 className="text-sm font-bold text-slate-800">Teacher / class / subject assignments</h2>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              <select value={assignment.classId} onChange={e => setAssignment(prev => ({ ...prev, classId: e.target.value }))}
                className="rounded-lg border border-slate-300 px-2 py-2 text-sm">
                {classes.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
              </select>
              <select value={assignment.subjectId} onChange={e => setAssignment(prev => ({ ...prev, subjectId: e.target.value }))}
                className="rounded-lg border border-slate-300 px-2 py-2 text-sm">
                {subjects.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
              </select>
            </div>
            <div className="mt-2 max-h-32 overflow-y-auto rounded-lg border border-slate-200 p-2">
              {teachers.map(teacher => (
                <label key={teacher.id} className="flex items-center gap-2 py-1 text-xs text-slate-700">
                  <input type="checkbox" checked={assignment.teacherIds.includes(teacher.id)}
                    onChange={event => setAssignment(prev => ({
                      ...prev,
                      teacherIds: event.target.checked
                        ? [...prev.teacherIds, teacher.id]
                        : prev.teacherIds.filter(id => id !== teacher.id)
                    }))} />
                  {teacher.fullName}
                </label>
              ))}
            </div>
            <button onClick={handleAssign} disabled={!yearId || !termId}
              className="mt-3 rounded-lg bg-blue-700 px-4 py-2 text-xs font-bold text-white disabled:opacity-50">
              Save assignment
            </button>
            <div className="mt-4 max-h-52 overflow-y-auto">
              <table className="min-w-full text-xs">
                <thead className="bg-slate-50 text-left uppercase text-slate-500">
                  <tr><th className="p-2">Class</th><th className="p-2">Subject</th><th className="p-2">Teachers</th></tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {assignments.map(item => (
                    <tr key={item.id}>
                      <td className="p-2">{classes.find(c => c.id === item.classId)?.name || item.classId}</td>
                      <td className="p-2">{subjects.find(s => s.id === item.subjectId)?.name || item.subjectId}</td>
                      <td className="p-2">{item.teacherIds.map(id => teachers.find(user => user.id === id)?.fullName || id).join(', ') || 'None'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-4 lg:col-span-2">
            <h2 className="text-sm font-bold text-slate-800">Classes, subjects and class teachers</h2>
            <div className="mt-3 grid gap-4 lg:grid-cols-3">
              <div>
                <h3 className="mb-2 text-xs font-bold uppercase text-slate-500">Add a class</h3>
                <div className="grid gap-2">
                  {(['name', 'grade', 'stream', 'combination', 'room'] as const).map(field => (
                    <input key={field} value={newClass[field]} placeholder={field}
                      onChange={e => setNewClass(prev => ({ ...prev, [field]: e.target.value }))}
                      className="rounded-lg border border-slate-300 px-2 py-1.5 text-xs" />
                  ))}
                  <button onClick={handleCreateClass}
                    className="rounded-lg bg-blue-700 px-3 py-2 text-xs font-bold text-white">Add class</button>
                </div>
              </div>
              <div>
                <h3 className="mb-2 text-xs font-bold uppercase text-slate-500">Add a subject</h3>
                <div className="grid gap-2">
                  {(['name', 'code', 'department', 'credits', 'passMark'] as const).map(field => (
                    <input key={field} value={newSubject[field]} placeholder={field}
                      onChange={e => setNewSubject(prev => ({ ...prev, [field]: e.target.value }))}
                      className="rounded-lg border border-slate-300 px-2 py-1.5 text-xs" />
                  ))}
                  <button onClick={handleCreateSubject}
                    className="rounded-lg bg-blue-700 px-3 py-2 text-xs font-bold text-white">Add subject</button>
                </div>
              </div>
              <div>
                <h3 className="mb-2 text-xs font-bold uppercase text-slate-500">Assign class teacher</h3>
                <select value={classTeacher.classId}
                  onChange={e => setClassTeacher(prev => ({ ...prev, classId: e.target.value }))}
                  className="w-full rounded-lg border border-slate-300 px-2 py-2 text-xs">
                  {classes.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
                </select>
                <select value={classTeacher.teacherId}
                  onChange={e => setClassTeacher(prev => ({ ...prev, teacherId: e.target.value }))}
                  className="mt-2 w-full rounded-lg border border-slate-300 px-2 py-2 text-xs">
                  {teachers.map(item => <option key={item.id} value={item.id}>{item.fullName}</option>)}
                </select>
                <button onClick={handleAssignClassTeacher} disabled={!yearId || !classTeacher.teacherId}
                  className="mt-2 rounded-lg bg-blue-700 px-3 py-2 text-xs font-bold text-white disabled:opacity-50">
                  Save class teacher
                </button>
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
    </div>
  );
};

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
