import React, { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../i18n/LanguageContext';
import { api } from '../services/api';
import { PortalReportCards } from '../components/PortalReportCards';
import {
  Student,
  ReportCard,
  AttendanceRecord,
  TimetableEntry,
  HomeworkAssignment
} from '../types';
import {
  Calendar,
  BookOpen,
  UserCheck,
  CheckCircle2,
  Clock,
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

  const [portalError, setPortalError] = useState('');

  useEffect(() => {
    const loadStudentData = async () => {
      try {
        setLoading(true);
        setPortalError('');
        const data = await api.getPortalDashboard();
        const me = data.students.find(item => item.id === currentUser?.studentId);
        setStudent(me || null);
        if (me) {
          setReportCards(data.reportCards.filter(item => item.studentId === me.id));
          setAttendance(data.attendance.filter(item => item.studentId === me.id));
          setTimetable(data.timetable.filter(item => item.classId === me.classId));
          setHomework(data.homework.filter(item => item.classId === me.classId));
        }
      } catch (err: any) {
        setPortalError(err?.message || 'Failed to load student portal.');
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    loadStudentData();
  }, [currentUser?.studentId]);

  if (loading) {
    return (
      <div className="p-8 flex items-center justify-center min-h-[500px]">
        <div className="w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!student) {
    return (
      <div className="p-8">
        <div role="alert" className="rounded-xl border border-amber-200 bg-amber-50 p-6 text-sm text-amber-900">
          {portalError || 'Your student account is not linked to an active student record. Contact the school.'}
        </div>
      </div>
    );
  }

  const latestReportCard = reportCards[0];

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
            <span className="text-[10px] uppercase font-bold text-blue-200">
              {latestReportCard ? `${latestReportCard.term} Rank` : 'Rank'}
            </span>
            <p className="text-lg font-black text-amber-300">
              {latestReportCard?.overallRank
                ? `#${latestReportCard.overallRank} of ${latestReportCard.totalStudentsInClass || '-'}`
                : '-'}
            </p>
          </div>
          <div className="bg-white/10 px-4 py-3 rounded-xl text-center border border-white/15">
            <span className="text-[10px] uppercase font-bold text-blue-200">Average</span>
            <p className="text-lg font-black text-emerald-400">
              {latestReportCard ? `${latestReportCard.overallAverage}%` : '-'}
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

      {/* Published Academic Report Card History */}
      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs space-y-4">
        <div className="pb-3 border-b border-slate-100">
          <h3 className="text-sm font-bold text-slate-900">My Official Report Cards (Indangamanota)</h3>
          <p className="text-xs text-slate-500">Published reports released by the school</p>
        </div>
        <PortalReportCards
          cards={reportCards}
          school={school}
          emptyMessage="No published report cards are available yet."
        />
      </div>
    </div>
  );
};
