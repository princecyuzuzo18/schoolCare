import React, { useEffect, useState } from 'react';
import { AttendanceRecord, AttendanceStatus, AcademicClass, Student } from '../types';
import { api } from '../services/api';
import { useLanguage } from '../i18n/LanguageContext';
import { useAuth } from '../contexts/AuthContext';
import {
  UserCheck,
  CheckCircle,
  XCircle,
  Clock,
  HelpCircle,
  AlertTriangle,
  Download,
  Send,
  Save,
  CheckCircle2,
  Calendar
} from 'lucide-react';

export const AttendancePage: React.FC = () => {
  const { t } = useLanguage();
  const { role, currentUser } = useAuth();

  const [classes, setClasses] = useState<AcademicClass[]>([]);
  const [selectedClassId, setSelectedClassId] = useState<string>('');
  const [selectedDate, setSelectedDate] = useState<string>(() => new Date().toISOString().split('T')[0]);
  const [students, setStudents] = useState<Student[]>([]);
  const [attendanceMap, setAttendanceMap] = useState<Record<string, AttendanceStatus>>({});
  const [remarksMap, setRemarksMap] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedSuccess, setSavedSuccess] = useState(false);
  const [notifyParents, setNotifyParents] = useState(true);

  // Load classes
  useEffect(() => {
    const init = async () => {
      try {
        const cls = await api.getActiveClasses();
        setClasses(cls);
        if (cls.length > 0) {
          setSelectedClassId(cls[0].id);
        }
      } catch (err) {
        console.error(err);
      }
    };
    init();
  }, []);

  // Load students & existing attendance for selected class and date
  useEffect(() => {
    if (!selectedClassId) return;
    const fetchClassAttendance = async () => {
      try {
        setLoading(true);
        const [stuList, attRecords] = await Promise.all([
          api.getStudents(selectedClassId),
          api.getAttendance(selectedDate, selectedClassId)
        ]);
        setStudents(stuList);

        // Pre-fill statuses from existing records or default to PRESENT
        const map: Record<string, AttendanceStatus> = {};
        const rem: Record<string, string> = {};

        stuList.forEach(s => {
          const rec = attRecords.find(a => a.studentId === s.id);
          if (rec) {
            map[s.id] = rec.status;
            rem[s.id] = rec.remarks || '';
          } else {
            map[s.id] = 'PRESENT';
            rem[s.id] = '';
          }
        });

        setAttendanceMap(map);
        setRemarksMap(rem);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    fetchClassAttendance();
  }, [selectedClassId, selectedDate]);

  const handleStatusChange = (studentId: string, status: AttendanceStatus) => {
    setAttendanceMap(prev => ({ ...prev, [studentId]: status }));
  };

  const handleRemarkChange = (studentId: string, val: string) => {
    setRemarksMap(prev => ({ ...prev, [studentId]: val }));
  };

  const handleMarkAll = (status: AttendanceStatus) => {
    const updated: Record<string, AttendanceStatus> = {};
    students.forEach(s => {
      updated[s.id] = status;
    });
    setAttendanceMap(updated);
  };

  const handleSaveAttendance = async () => {
    try {
      setSaving(true);
      const selectedClass = classes.find(c => c.id === selectedClassId);
      const recordsToSave: AttendanceRecord[] = students.map(s => ({
        id: `att-${s.id}-${selectedDate}`,
        schoolId: s.schoolId,
        studentId: s.id,
        studentName: `${s.firstName} ${s.lastName}`,
        classId: selectedClassId,
        className: selectedClass?.name || 'Class',
        date: selectedDate,
        status: attendanceMap[s.id] || 'PRESENT',
        recordedByStaffId: currentUser?.id || 'staff',
        recordedByName: currentUser?.fullName || 'Teacher Patrick N.',
        remarks: remarksMap[s.id] || '',
        parentNotified: attendanceMap[s.id] === 'ABSENT' && notifyParents
      }));

      await api.recordAttendanceBatch(recordsToSave, notifyParents);
      setSavedSuccess(true);
      setTimeout(() => setSavedSuccess(false), 3000);
    } catch (err: any) {
      alert(err.message || 'Failed to save attendance');
    } finally {
      setSaving(false);
    }
  };

  const handleExportCsv = () => {
    const rows = [
      ['Student ID', 'Admission Number', 'Name', 'Class', 'Date', 'Status', 'Remarks'],
      ...students.map(s => [
        s.id,
        s.admissionNumber,
        `${s.firstName} ${s.lastName}`,
        s.className,
        selectedDate,
        attendanceMap[s.id] || 'PRESENT',
        remarksMap[s.id] || ''
      ])
    ];

    const csvContent = 'data:text/csv;charset=utf-8,' + rows.map(e => e.join(',')).join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `Attendance_${selectedClassId}_${selectedDate}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Stats
  const presentCount = Object.values(attendanceMap).filter(s => s === 'PRESENT').length;
  const absentCount = Object.values(attendanceMap).filter(s => s === 'ABSENT').length;
  const lateCount = Object.values(attendanceMap).filter(s => s === 'LATE').length;
  const excusedCount = Object.values(attendanceMap).filter(s => s === 'EXCUSED' || s === 'SICK' || s === 'AUTHORIZED_LEAVE').length;

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 bg-white p-5 sm:p-6 rounded-2xl border border-slate-200 shadow-xs">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="px-2.5 py-1 rounded-full text-[11px] font-semibold bg-emerald-50 text-emerald-800 ring-1 ring-inset ring-emerald-100 flex items-center gap-1">
              <UserCheck className="w-3.5 h-3.5" />
              <span>Roll Call Session</span>
            </span>
            <span className="text-xs text-slate-500">ES RUBENGERA RTB</span>
          </div>
          <h1 className="text-2xl font-black text-slate-900 mt-1">{t('attendanceTitle')}</h1>
          <p className="text-xs text-slate-500 mt-0.5">{t('attendanceSubtitle')}</p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={handleExportCsv}
            className="min-h-10 px-3.5 py-2 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-700 font-semibold text-xs transition-colors flex items-center gap-1.5"
          >
            <Download className="w-4 h-4" />
            <span>{t('exportCsv')}</span>
          </button>

          <button
            onClick={handleSaveAttendance}
            disabled={saving}
            className="min-h-10 px-5 py-2 rounded-xl bg-[#102B50] hover:bg-[#173b6c] text-white font-semibold text-xs shadow-sm transition-colors flex items-center gap-2 disabled:opacity-50"
          >
            {savedSuccess ? (
              <>
                <CheckCircle2 className="w-4 h-4 text-emerald-300" />
                <span>Attendance Saved!</span>
              </>
            ) : (
              <>
                <Save className="w-4 h-4" />
                <span>{saving ? 'Saving...' : 'Submit Roll Call'}</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Class & Date Controls */}
      <div className="grid grid-cols-1 sm:grid-cols-12 gap-4 bg-white p-4 sm:p-5 rounded-2xl border border-slate-200 shadow-xs items-center">
        <div className="sm:col-span-5">
          <label className="block text-xs font-bold text-slate-700 mb-1">Select Class / Combination:</label>
          <select
            value={selectedClassId}
            onChange={e => setSelectedClassId(e.target.value)}
            className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs font-bold text-slate-800 bg-white focus:ring-2 focus:ring-blue-500"
          >
            {classes.map(c => (
              <option key={c.id} value={c.id}>
                {c.name} — {c.combination} ({c.studentCount} students)
              </option>
            ))}
          </select>
        </div>

        <div className="sm:col-span-4">
          <label className="block text-xs font-bold text-slate-700 mb-1">Attendance Date:</label>
          <div className="relative">
            <input
              type="date"
              value={selectedDate}
              onChange={e => setSelectedDate(e.target.value)}
              className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs font-bold text-slate-800 bg-white focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>

        <div className="sm:col-span-3 flex items-center sm:pt-5">
          <label className="flex items-center gap-2 cursor-pointer text-xs font-semibold text-slate-700">
            <input
              type="checkbox"
              checked={notifyParents}
              onChange={e => setNotifyParents(e.target.checked)}
              className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500"
            />
            <span>{t('notifyAbsentParents')}</span>
          </label>
        </div>
      </div>

      {/* Stats Summary & Bulk Actions */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 bg-white p-4 rounded-2xl border border-slate-200 shadow-xs">
        <div className="flex flex-wrap items-center gap-3 text-xs font-bold">
          <span className="px-3 py-1 rounded-lg bg-emerald-100 text-emerald-800">
            {presentCount} {t('present')}
          </span>
          <span className="px-3 py-1 rounded-lg bg-red-100 text-red-800">
            {absentCount} {t('absent')}
          </span>
          <span className="px-3 py-1 rounded-lg bg-amber-100 text-amber-800">
            {lateCount} {t('late')}
          </span>
          <span className="px-3 py-1 rounded-lg bg-blue-100 text-blue-800">
            {excusedCount} {t('excused')}
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="text-slate-500 font-semibold">Bulk Set:</span>
          <button
            onClick={() => handleMarkAll('PRESENT')}
            className="min-h-9 px-3 rounded-lg bg-white border border-slate-200 font-semibold text-emerald-700 hover:bg-emerald-50 transition-colors"
          >
            All Present
          </button>
          <button
            onClick={() => handleMarkAll('ABSENT')}
            className="min-h-9 px-3 rounded-lg bg-white border border-slate-200 font-semibold text-red-700 hover:bg-red-50 transition-colors"
          >
            All Absent
          </button>
        </div>
      </div>

      {/* Attendance Roll Call Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[780px] text-left text-xs">
            <thead className="sticky top-0 z-10 bg-slate-50 border-b border-slate-200 text-slate-500 uppercase tracking-wider font-bold">
              <tr>
                <th className="py-3 px-4">#</th>
                <th className="py-3 px-4">Student</th>
                <th className="py-3 px-4">Admission No</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4">Remarks / Explanation</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {students.map((student, idx) => {
                const currentStatus = attendanceMap[student.id] || 'PRESENT';
                return (
                  <tr key={student.id} className="hover:bg-slate-50/70 transition">
                    <td className="py-3 px-4 text-slate-400 font-mono">{idx + 1}</td>
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-3">
                        <img
                          src={student.photoUrl}
                          alt={student.firstName}
                          className="w-8 h-8 rounded-full object-cover border border-slate-200"
                        />
                        <div>
                          <p className="font-bold text-slate-900">
                            {student.firstName} {student.lastName}
                          </p>
                          <p className="text-[11px] text-slate-500">{student.gender === 'M' ? 'Male' : 'Female'}</p>
                        </div>
                      </div>
                    </td>
                    <td className="py-3 px-4 font-mono font-semibold text-slate-700">
                      {student.admissionNumber}
                    </td>
                    <td className="py-3 px-4">
                      <div className="inline-flex rounded-xl bg-slate-100 p-1 gap-1">
                        {(['PRESENT', 'ABSENT', 'LATE', 'EXCUSED'] as AttendanceStatus[]).map(st => {
                          const isSel = currentStatus === st;
                          return (
                            <button
                              key={st}
                              type="button"
                              onClick={() => handleStatusChange(student.id, st)}
                              className={`min-h-9 px-3 rounded-lg text-[11px] font-semibold transition-colors ${
                                isSel
                                  ? st === 'PRESENT'
                                    ? 'bg-emerald-600 text-white shadow-xs'
                                    : st === 'ABSENT'
                                    ? 'bg-red-600 text-white shadow-xs'
                                    : st === 'LATE'
                                    ? 'bg-amber-500 text-white shadow-xs'
                                    : 'bg-blue-600 text-white shadow-xs'
                                  : 'text-slate-600 hover:text-slate-900'
                              }`}
                            >
                              {t(st.toLowerCase() as any) || st}
                            </button>
                          );
                        })}
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      <input
                        type="text"
                        value={remarksMap[student.id] || ''}
                        onChange={e => handleRemarkChange(student.id, e.target.value)}
                        placeholder="e.g. Arrived 8:20 AM, rain delay..."
                        className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 text-xs focus:ring-1 focus:ring-blue-500"
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
