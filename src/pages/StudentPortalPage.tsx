import React, { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../i18n/LanguageContext';
import { api } from '../services/api';
import {
  Student,
  ReportCard,
  AttendanceRecord,
  TimetableEntry,
  HomeworkAssignment
} from '../types';
import {
  GraduationCap,
  Calendar,
  BookOpen,
  UserCheck,
  CheckCircle2,
  Clock,
  Download,
  Printer,
  Sparkles
} from 'lucide-react';

export const StudentPortalPage: React.FC = () => {
  const { currentUser, school } = useAuth();
  const { t } = useLanguage();

  const [student, setStudent] = useState<Student | null>(null);
  const [reportCards, setReportCards] = useState<ReportCard[]>([]);
  const [attendance, setAttendance] = useState<AttendanceRecord[]>([]);
  const [timetable, setTimetable] = useState<TimetableEntry[]>([]);
  const [homework, setHomework] = useState<HomeworkAssignment[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadStudentData = async () => {
      try {
        setLoading(true);
        // Student Kevin Ishimwe
        const allStudents = await api.getStudents();
        const me = allStudents.find(s => s.id === 'std-kevin-ishimwe-01') || allStudents[0];
        setStudent(me);

        if (me) {
          const [rcList, attList, ttList, hwList] = await Promise.all([
            api.getReportCards(me.id),
            api.getAttendance(undefined, me.classId),
            api.getTimetable(me.classId),
            api.getHomework(me.classId)
          ]);

          setReportCards(rcList);
          setAttendance(attList.filter(a => a.studentId === me.id));
          setTimetable(ttList);
          setHomework(hwList);
        }
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    loadStudentData();
  }, [currentUser]);

  if (loading || !student) {
    return (
      <div className="p-8 flex items-center justify-center min-h-[500px]">
        <div className="w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const reportCard = reportCards[0];

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto space-y-6">
      {/* Header Profile Banner */}
      <div className="relative overflow-hidden bg-gradient-to-br from-[#102B50] to-[#1d4b88] text-white p-5 sm:p-6 rounded-2xl shadow-sm border border-blue-900/70 flex flex-col lg:flex-row lg:items-center justify-between gap-5">
        <img
          src="/school-campus.svg"
          alt=""
          aria-hidden="true"
          className="absolute inset-0 w-full h-full object-cover object-center opacity-15"
        />
        <div aria-hidden="true" className="absolute inset-0 bg-gradient-to-r from-[#102B50]/95 via-[#102B50]/75 to-[#102B50]/60" />
        <div className="relative z-10 flex items-center gap-4">
          <img
            src={student.photoUrl}
            alt={student.firstName}
            className="w-16 h-20 object-cover rounded-xl border-2 border-white/60 shadow"
          />
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="px-2 py-1 rounded-full text-[10px] font-semibold bg-white/10 border border-white/15 text-blue-100">
                RTB TVET Student
              </span>
              <span className="text-xs text-blue-200">{school?.name}</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold text-white mt-2">
              Muraho, {student.firstName} {student.lastName}
            </h1>
            <p className="text-xs text-blue-200 mt-0.5">
              {student.className} • {student.combination} • Reg: {student.admissionNumber}
            </p>
          </div>
        </div>

        <div className="relative z-10 grid grid-cols-2 gap-3 sm:flex sm:items-center">
          <div className="bg-white/10 px-4 py-3 rounded-xl text-center border border-white/15">
            <span className="text-[10px] uppercase font-bold text-blue-200">Term 1 Rank</span>
            <p className="text-lg font-black text-amber-300">
              #{reportCard?.overallRank || 3} of {reportCard?.totalStudentsInClass || 38}
            </p>
          </div>
          <div className="bg-white/10 px-4 py-3 rounded-xl text-center border border-white/15">
            <span className="text-[10px] uppercase font-bold text-blue-200">Average</span>
            <p className="text-lg font-black text-emerald-400">
              {reportCard?.overallAverage || 84.6}%
            </p>
          </div>
        </div>
      </div>

      {/* Grid: Timetable & Homework Tasks */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Weekly Timetable */}
        <div className="lg:col-span-6 bg-white p-6 rounded-2xl border border-slate-200 shadow-xs space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100">
            <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <Calendar className="w-5 h-5 text-blue-600" />
              <span>Weekly Class Schedule ({student.className})</span>
            </h3>
            <span className="text-xs text-slate-500 font-semibold">TVET Labs & Workshops</span>
          </div>

          <div className="space-y-2.5">
            {timetable.map(slot => (
              <div
                key={slot.id}
                className="p-3 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-between"
              >
                <div>
                  <div className="flex items-center gap-2">
                    <span className="px-2 py-0.5 rounded text-[10px] font-black bg-blue-100 text-blue-800">
                      {slot.dayOfWeek}
                    </span>
                    <span className="text-xs font-bold text-slate-900">{slot.subjectName}</span>
                  </div>
                  <p className="text-[11px] text-slate-500 mt-1">
                    {slot.teacherName} • Room: <strong className="text-slate-700">{slot.room}</strong>
                  </p>
                </div>
                <div className="text-right">
                  <span className="font-mono text-xs font-bold text-slate-800">
                    {slot.startTime} - {slot.endTime}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Assigned Homework & Deadlines */}
        <div className="lg:col-span-6 bg-white p-6 rounded-2xl border border-slate-200 shadow-xs space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100">
            <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <BookOpen className="w-5 h-5 text-emerald-600" />
              <span>Homework & Projects (Imikoro)</span>
            </h3>
            <span className="text-xs text-slate-500 font-semibold">{homework.length} Active</span>
          </div>

          <div className="space-y-3">
            {homework.map(hw => (
              <div key={hw.id} className="p-4 rounded-xl border border-slate-200 bg-slate-50/70 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <span className="text-[10px] font-bold uppercase text-blue-700 bg-blue-50 px-2 py-0.5 rounded">
                      {hw.subjectName}
                    </span>
                    <h4 className="text-xs font-bold text-slate-900 mt-1">{hw.title}</h4>
                  </div>
                  <span className="text-[11px] font-bold text-red-600 flex items-center gap-1">
                    <Clock className="w-3.5 h-3.5" /> Due: {hw.dueDate}
                  </span>
                </div>
                <p className="text-xs text-slate-600 leading-relaxed">{hw.description}</p>
                <div className="flex items-center justify-between pt-2 border-t border-slate-200 text-[11px] text-slate-500">
                  <span>Instructor: {hw.teacherName}</span>
                  <span className="font-semibold text-emerald-700">{hw.maxPoints} Points Max</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Academic Report Card Breakdown */}
      {reportCard && (
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100">
            <div>
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <GraduationCap className="w-5 h-5 text-blue-600" />
                <span>My Official Report Card (Indangamanota)</span>
              </h3>
              <p className="text-xs text-slate-500">Academic Year 2025-2026 • Term 1</p>
            </div>
            <button
              onClick={() => window.print()}
              className="px-3.5 py-1.5 rounded-xl border border-slate-300 hover:bg-slate-50 text-slate-700 font-semibold text-xs flex items-center gap-1.5 transition"
            >
              <Printer className="w-4 h-4" />
              <span>Print Bulletin</span>
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-500 uppercase font-bold text-[10px]">
                <tr>
                  <th className="py-2.5 px-3">Subject</th>
                  <th className="py-2.5 px-3">Code</th>
                  <th className="py-2.5 px-3">CAT (/30)</th>
                  <th className="py-2.5 px-3">Exam (/70)</th>
                  <th className="py-2.5 px-3">Total (%)</th>
                  <th className="py-2.5 px-3">Grade</th>
                  <th className="py-2.5 px-3">Teacher Comment</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {reportCard.subjects.map((sub, i) => (
                  <tr key={i} className="hover:bg-slate-50">
                    <td className="py-2.5 px-3 font-semibold text-slate-800">{sub.subjectName}</td>
                    <td className="py-2.5 px-3 font-mono text-slate-500">{sub.subjectCode}</td>
                    <td className="py-2.5 px-3 font-mono">{sub.catScore}</td>
                    <td className="py-2.5 px-3 font-mono">{sub.examScore}</td>
                    <td className="py-2.5 px-3 font-bold text-blue-700">{sub.totalPercent}%</td>
                    <td className="py-2.5 px-3 font-black text-emerald-600">{sub.grade}</td>
                    <td className="py-2.5 px-3 text-slate-600">{sub.teacherComment}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};
