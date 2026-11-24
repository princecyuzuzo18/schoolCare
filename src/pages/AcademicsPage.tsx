/**
 * Deprecated legacy prototype. This page is intentionally not routed: it uses
 * placeholder marks and local handlers that would violate the backend-authoritative
 * academic workflow. Use TeacherAcademicsPage, AcademicAdminPage and
 * ReportPrintingPage instead.
 */
import React, { useEffect, useState } from 'react';
import { ReportCard, AcademicClass, Subject, Student } from '../types';
import { api } from '../services/api';
import { HEADTEACHER_DISPLAY_NAME } from '../roleCatalog';
import { useLanguage } from '../i18n/LanguageContext';
import { useAuth } from '../contexts/AuthContext';
import {
  GraduationCap,
  Printer,
  CheckCircle2,
  Clock,
  BookOpen,
  Filter,
  Search,
  Award,
  Download,
  Save,
  Plus,
  Sparkles,
  Send
} from 'lucide-react';
import confetti from 'canvas-confetti';

export const AcademicsPage: React.FC = () => {
  const { t } = useLanguage();
  const { school, role } = useAuth();

  const [activeTab, setActiveTab] = useState<'REPORT_CARDS' | 'MARKS_ENTRY'>('REPORT_CARDS');
  const [reportCards, setReportCards] = useState<ReportCard[]>([]);
  const [classes, setClasses] = useState<AcademicClass[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [selectedReportCard, setSelectedReportCard] = useState<ReportCard | null>(null);
  const [loading, setLoading] = useState(true);

  // Marks Entry state
  const [entrySubjectId, setEntrySubjectId] = useState<string>('subj-web-dev');
  const [entryClassId, setEntryClassId] = useState<string>('class-l4-sod-a');
  const [marksState, setMarksState] = useState<Record<string, { cat: number; exam: number; comment: string }>>({
    'std-kevin-ishimwe-01': { cat: 28, exam: 61, comment: 'Outstanding coding logic & Tailwind design' },
    'std-divine-keza-02': { cat: 27, exam: 58, comment: 'Very consistent lab practical progress' },
    'std-eric-uwitonze-03': { cat: 24, exam: 52, comment: 'Good effort, continue practicing SQL queries' },
    'std-sandrine-mutoni-04': { cat: 26, exam: 55, comment: 'Attentive, active during code reviews' }
  });
  const [isSavingMarks, setIsSavingMarks] = useState(false);
  const [saveMarksSuccess, setSaveMarksSuccess] = useState(false);

  useEffect(() => {
    const loadData = async () => {
      try {
        setLoading(true);
        const [rcList, clsList, subList, stuList] = await Promise.all([
          api.getReportCards(),
          api.getActiveClasses(),
          api.getSubjects(),
          api.getStudents()
        ]);
        setReportCards(rcList);
        setClasses(clsList);
        setSubjects(subList);
        setStudents(stuList);
        if (rcList.length > 0) {
          setSelectedReportCard(rcList[0]);
        }
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    loadData();
  }, []);

  const handleScoreChange = (studentId: string, field: 'cat' | 'exam', val: number) => {
    setMarksState(prev => ({
      ...prev,
      [studentId]: {
        cat: field === 'cat' ? val : (prev[studentId]?.cat || 0),
        exam: field === 'exam' ? val : (prev[studentId]?.exam || 0),
        comment: prev[studentId]?.comment || ''
      }
    }));
  };

  const handleCommentChange = (studentId: string, comment: string) => {
    setMarksState(prev => ({
      ...prev,
      [studentId]: {
        cat: prev[studentId]?.cat || 0,
        exam: prev[studentId]?.exam || 0,
        comment
      }
    }));
  };

  const handleSaveMarks = () => {
    setIsSavingMarks(true);
    setTimeout(() => {
      setIsSavingMarks(false);
      setSaveMarksSuccess(true);
      confetti({ particleCount: 60, spread: 60, origin: { y: 0.7 } });
      setTimeout(() => setSaveMarksSuccess(false), 3000);
    }, 600);
  };

  const handlePublishAll = () => {
    confetti({ particleCount: 90, spread: 70, origin: { y: 0.6 } });
    alert('Term Report Cards have been officially certified and published to verified Parent Portals!');
  };

  const getLetterGrade = (total: number) => {
    if (total >= 80) return 'A';
    if (total >= 70) return 'B';
    if (total >= 60) return 'C';
    if (total >= 50) return 'D';
    return 'F';
  };

  const currentClassStudents = students.filter(s => s.classId === entryClassId);

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-6 rounded-2xl border border-slate-200 shadow-xs">
        <div>
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-blue-100 text-blue-800 flex items-center gap-1">
              <GraduationCap className="w-3.5 h-3.5" />
              <span>REB / RTB Academic Module</span>
            </span>
            <span className="text-xs text-slate-500">{school?.name || 'ES RUBENGERA RTB'}</span>
          </div>
          <h1 className="text-2xl font-black text-slate-900 mt-1">{t('reportCardsTitle')}</h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Official secondary & TVET assessment bulletins: CAT (30%), Term Exam (70%), Rank & Conduct (/40)
          </p>
        </div>

        {/* View Switcher Tabs */}
        <div className="flex items-center gap-2">
          <div className="flex bg-slate-100 p-1 rounded-xl text-xs font-bold">
            <button
              onClick={() => setActiveTab('REPORT_CARDS')}
              className={`px-3 py-1.5 rounded-lg transition ${
                activeTab === 'REPORT_CARDS' ? 'bg-white text-blue-700 shadow-xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Report Cards (Indangamanota)
            </button>
            <button
              onClick={() => setActiveTab('MARKS_ENTRY')}
              className={`px-3 py-1.5 rounded-lg transition ${
                activeTab === 'MARKS_ENTRY' ? 'bg-white text-blue-700 shadow-xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Teacher Marks Entry (CAT & Exams)
            </button>
          </div>

          <button
            onClick={() => window.print()}
            className="px-3.5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs shadow-md transition flex items-center gap-1.5"
          >
            <Printer className="w-4 h-4" />
            <span>Print Bulletin</span>
          </button>
        </div>
      </div>

      {activeTab === 'REPORT_CARDS' ? (
        /* Report Cards Viewer & Selector */
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left Column: Report Card List */}
          <div className="lg:col-span-4 bg-white p-5 rounded-2xl border border-slate-200 shadow-xs space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <h3 className="text-sm font-bold text-slate-900">Approved Term 1 Bulletins</h3>
              <button
                onClick={handlePublishAll}
                className="text-[11px] font-bold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 px-2.5 py-1 rounded-lg transition flex items-center gap-1"
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>Publish to Parents</span>
              </button>
            </div>

            <div className="space-y-2">
              {reportCards.map(rc => (
                <div
                  key={rc.id}
                  onClick={() => setSelectedReportCard(rc)}
                  className={`p-3.5 rounded-xl border transition cursor-pointer ${
                    selectedReportCard?.id === rc.id
                      ? 'bg-blue-50/80 border-blue-500 shadow-xs'
                      : 'bg-slate-50 border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <p className="font-bold text-slate-900 text-xs">{rc.studentName}</p>
                    <span className="font-mono text-xs font-bold text-blue-700">{rc.overallAverage}%</span>
                  </div>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    {rc.className} • Rank: #{rc.overallRank} of {rc.totalStudentsInClass}
                  </p>
                </div>
              ))}
            </div>

            {/* Department Subjects */}
            <div className="pt-4 border-t border-slate-100">
              <h4 className="text-xs font-bold text-slate-700 mb-2">RTB Department Subjects:</h4>
              <div className="space-y-1.5">
                {subjects.map(sub => (
                  <div key={sub.id} className="p-2 bg-slate-50 rounded-lg text-xs flex justify-between">
                    <span className="font-semibold text-slate-800">{sub.name}</span>
                    <span className="font-mono text-slate-500">{sub.code} ({sub.credits} cr)</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Right Column: Printable REB/RTB Report Card */}
          <div className="lg:col-span-8 bg-white p-8 rounded-2xl border-2 border-blue-900 shadow-md space-y-6">
            {selectedReportCard ? (
              <div id="reb-report-card" className="space-y-6">
                {/* Official Header */}
                <div className="border-b-2 border-blue-900 pb-4 text-center space-y-1">
                  <div className="flex items-center justify-between text-[11px] text-slate-600 font-semibold mb-2">
                    <span>REPUBLIC OF RWANDA</span>
                    <span>MINISTRY OF EDUCATION (MINEDUC)</span>
                    <span>RWANDA TVET BOARD (RTB)</span>
                  </div>
                  <h2 className="text-lg font-black uppercase text-[#102B50] tracking-wider">
                    {school?.name || 'ES RUBENGERA RTB'}
                  </h2>
                  <p className="text-xs text-slate-600 font-medium">
                    {school?.motto || 'Ubumenyi, Umurimo, Ubupfura — Knowledge, Skill, Integrity'}
                  </p>
                  <p className="text-xs text-blue-800 font-bold uppercase tracking-wider pt-1">
                    OFFICIAL STUDENT PERFORMANCE BULLETIN (INDANGAMANOTA)
                  </p>
                </div>

                {/* Metadata */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-slate-50 p-4 rounded-xl border border-slate-200 text-xs">
                  <div>
                    <span className="text-[10px] text-slate-500 uppercase font-semibold">Student Name</span>
                    <p className="font-bold text-slate-900 text-sm">{selectedReportCard.studentName}</p>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-500 uppercase font-semibold">Admission #</span>
                    <p className="font-mono font-bold text-slate-800">{selectedReportCard.admissionNumber}</p>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-500 uppercase font-semibold">Class / Trade</span>
                    <p className="font-semibold text-slate-800">{selectedReportCard.className}</p>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-500 uppercase font-semibold">Academic Year</span>
                    <p className="font-semibold text-slate-800">{selectedReportCard.academicYear} ({selectedReportCard.term})</p>
                  </div>
                </div>

                {/* Marks Grid */}
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs border border-slate-300">
                    <thead className="bg-[#102B50] text-white font-bold text-[11px]">
                      <tr>
                        <th className="py-2.5 px-3 border-r border-blue-800">Subject Name</th>
                        <th className="py-2.5 px-3 border-r border-blue-800">Code</th>
                        <th className="py-2.5 px-3 border-r border-blue-800 text-center">CAT (/30)</th>
                        <th className="py-2.5 px-3 border-r border-blue-800 text-center">Exam (/70)</th>
                        <th className="py-2.5 px-3 border-r border-blue-800 text-center">Total (%)</th>
                        <th className="py-2.5 px-3 border-r border-blue-800 text-center">Grade</th>
                        <th className="py-2.5 px-3">Teacher Comment</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                      {selectedReportCard.subjects.map((s, idx) => (
                        <tr key={idx} className={idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/70'}>
                          <td className="py-2.5 px-3 font-semibold text-slate-900 border-r border-slate-200">
                            {s.subjectName}
                          </td>
                          <td className="py-2.5 px-3 font-mono text-slate-500 border-r border-slate-200">
                            {s.subjectCode}
                          </td>
                          <td className="py-2.5 px-3 font-mono text-center border-r border-slate-200">
                            {s.catScore}
                          </td>
                          <td className="py-2.5 px-3 font-mono text-center border-r border-slate-200">
                            {s.examScore}
                          </td>
                          <td className="py-2.5 px-3 font-black text-blue-700 text-center border-r border-slate-200">
                            {s.totalPercent}%
                          </td>
                          <td className="py-2.5 px-3 font-black text-center border-r border-slate-200 text-emerald-600">
                            {s.grade}
                          </td>
                          <td className="py-2.5 px-3 text-slate-600 text-[11px]">
                            {s.teacherComment}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot className="bg-slate-100 font-bold border-t-2 border-slate-300">
                      <tr>
                        <td colSpan={4} className="py-2.5 px-3 text-right uppercase text-slate-700">
                          Term Average & Class Standing:
                        </td>
                        <td className="py-2.5 px-3 font-black text-blue-900 text-center text-sm">
                          {selectedReportCard.overallAverage}%
                        </td>
                        <td colSpan={2} className="py-2.5 px-3 font-extrabold text-blue-800">
                          Rank: #{selectedReportCard.overallRank} of {selectedReportCard.totalStudentsInClass} Students
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>

                {/* Conduct & Remarks */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                  <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-1">
                    <span className="font-bold text-slate-700">Discipline & Conduct (Imyitwarire):</span>
                    <p className="font-black text-emerald-700 text-sm">{selectedReportCard.conductScore}</p>
                    <p className="text-[11px] text-slate-500 pt-1">
                      Attendance: {selectedReportCard.attendanceDaysPresent} / {selectedReportCard.attendanceTotalDays} days attended
                    </p>
                  </div>

                  <div className="p-4 bg-blue-50/70 rounded-xl border border-blue-200 space-y-1">
                    <span className="font-bold text-blue-900">Head Teacher Decision & Remarks:</span>
                    <p className="text-slate-800 leading-tight">{selectedReportCard.headTeacherRemarks}</p>
                  </div>
                </div>

                {/* Sign-off */}
                <div className="pt-6 border-t border-slate-200 grid grid-cols-3 gap-4 text-center text-xs">
                  <div>
                    <p className="font-bold text-slate-800">Class Teacher</p>
                    <p className="text-[10px] text-slate-600 mt-8 border-t border-slate-300 pt-1">Signature & Date</p>
                  </div>
                  <div>
                    <div className="w-16 h-16 mx-auto rounded-full border-2 border-dashed border-blue-600 flex items-center justify-center text-[10px] font-bold text-blue-800 uppercase rotate-12">
                      ESR Stamp
                    </div>
                    <p className="text-[10px] text-slate-600 mt-2">Official School Seal</p>
                  </div>
                  <div>
                    <p className="font-bold text-slate-800">Directeur d'Établissement</p>
                    <p className="text-[10px] text-slate-600 mt-8 border-t border-slate-300 pt-1">
                      {selectedReportCard.headTeacherName || HEADTEACHER_DISPLAY_NAME}
                    </p>
                  </div>
                </div>
              </div>
            ) : (
              <p className="text-xs text-slate-500 text-center py-12">Select a report card to view.</p>
            )}
          </div>
        </div>
      ) : (
        /* Teacher Marks Entry Tab */
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-100">
            <div>
              <h3 className="text-base font-bold text-slate-900">
                Continuous Assessment (CAT) & Terminal Exam Marks Entry
              </h3>
              <p className="text-xs text-slate-500">
                Grades automatically calculate pass status and REB/RTB grade level
              </p>
            </div>

            <div className="flex items-center gap-3">
              <button
                onClick={handleSaveMarks}
                disabled={isSavingMarks}
                className="px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs shadow-md transition flex items-center gap-1.5"
              >
                {saveMarksSuccess ? (
                  <>
                    <CheckCircle2 className="w-4 h-4 text-emerald-300" />
                    <span>Marks Saved & Computed!</span>
                  </>
                ) : (
                  <>
                    <Save className="w-4 h-4" />
                    <span>{isSavingMarks ? 'Calculating...' : 'Save & Compile Marks'}</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Selectors */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 bg-slate-50 p-4 rounded-xl border border-slate-200 text-xs">
            <div>
              <label className="block font-bold text-slate-700 mb-1">Select Subject *</label>
              <select
                value={entrySubjectId}
                onChange={e => setEntrySubjectId(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-white font-semibold text-slate-800"
              >
                {subjects.map(s => (
                  <option key={s.id} value={s.id}>
                    {s.name} ({s.code} - {s.department})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block font-bold text-slate-700 mb-1">Select Class / Combination *</label>
              <select
                value={entryClassId}
                onChange={e => setEntryClassId(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-white font-semibold text-slate-800"
              >
                {classes.map(c => (
                  <option key={c.id} value={c.id}>
                    {c.name} — {c.combination}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Marks Entry Table */}
          <div className="overflow-x-auto border border-slate-200 rounded-xl">
            <table className="w-full text-left text-xs">
              <thead className="bg-[#102B50] text-white font-bold text-[10px] uppercase">
                <tr>
                  <th className="py-2.5 px-3">Student Name</th>
                  <th className="py-2.5 px-3">Admission No</th>
                  <th className="py-2.5 px-3 text-center">CAT Score (/30)</th>
                  <th className="py-2.5 px-3 text-center">Exam Score (/70)</th>
                  <th className="py-2.5 px-3 text-center">Total (%)</th>
                  <th className="py-2.5 px-3 text-center">Grade</th>
                  <th className="py-2.5 px-3">Teacher Observation / Comment</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {currentClassStudents.map(student => {
                  const current = marksState[student.id] || { cat: 25, exam: 55, comment: 'Good progress' };
                  const total = (current.cat || 0) + (current.exam || 0);
                  const grade = getLetterGrade(total);

                  return (
                    <tr key={student.id} className="hover:bg-slate-50">
                      <td className="py-2.5 px-3 font-bold text-slate-900">
                        {student.firstName} {student.lastName}
                      </td>
                      <td className="py-2.5 px-3 font-mono text-slate-500">
                        {student.admissionNumber}
                      </td>
                      <td className="py-2.5 px-3 text-center">
                        <input
                          type="number"
                          min="0"
                          max="30"
                          value={current.cat}
                          onChange={e => handleScoreChange(student.id, 'cat', Number(e.target.value))}
                          className="w-16 px-2 py-1 rounded-lg border border-slate-300 text-center font-mono font-bold"
                        />
                      </td>
                      <td className="py-2.5 px-3 text-center">
                        <input
                          type="number"
                          min="0"
                          max="70"
                          value={current.exam}
                          onChange={e => handleScoreChange(student.id, 'exam', Number(e.target.value))}
                          className="w-16 px-2 py-1 rounded-lg border border-slate-300 text-center font-mono font-bold"
                        />
                      </td>
                      <td className="py-2.5 px-3 font-black text-center text-blue-700 text-sm">
                        {total}%
                      </td>
                      <td className="py-2.5 px-3 text-center">
                        <span className={`inline-block px-2.5 py-0.5 rounded-full text-[11px] font-black ${
                          grade === 'A'
                            ? 'bg-emerald-100 text-emerald-800'
                            : grade === 'B'
                            ? 'bg-blue-100 text-blue-800'
                            : grade === 'C'
                            ? 'bg-amber-100 text-amber-800'
                            : 'bg-red-100 text-red-800'
                        }`}>
                          {grade}
                        </span>
                      </td>
                      <td className="py-2.5 px-3">
                        <input
                          type="text"
                          value={current.comment}
                          onChange={e => handleCommentChange(student.id, e.target.value)}
                          placeholder="e.g. Excellent practical exam performance"
                          className="w-full px-2.5 py-1 rounded-lg border border-slate-200 text-xs"
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};
