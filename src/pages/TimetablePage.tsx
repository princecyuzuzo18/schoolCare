import React, { useEffect, useState } from 'react';
import { TimetableEntry, HomeworkAssignment, AcademicClass } from '../types';
import { api } from '../services/api';
import { useLanguage } from '../i18n/LanguageContext';
import {
  Calendar,
  BookOpen,
  Clock,
  Plus,
  Building,
  UserCheck
} from 'lucide-react';

export const TimetablePage: React.FC = () => {
  const { t } = useLanguage();
  const [classes, setClasses] = useState<AcademicClass[]>([]);
  const [selectedClassId, setSelectedClassId] = useState<string>('class-l4-sod-a');
  const [timetable, setTimetable] = useState<TimetableEntry[]>([]);
  const [homework, setHomework] = useState<HomeworkAssignment[]>([]);
  const [activeTab, setActiveTab] = useState<'TIMETABLE' | 'HOMEWORK'>('TIMETABLE');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true);
        const [cls, tt, hw] = await Promise.all([
          api.getActiveClasses(),
          api.getTimetable(selectedClassId),
          api.getHomework(selectedClassId)
        ]);
        setClasses(cls);
        setTimetable(tt);
        setHomework(hw);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [selectedClassId]);

  const days: ('MON' | 'TUE' | 'WED' | 'THU' | 'FRI')[] = ['MON', 'TUE', 'WED', 'THU', 'FRI'];

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-6 rounded-2xl border border-slate-200 shadow-xs">
        <div>
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-blue-100 text-blue-800 flex items-center gap-1">
              <Calendar className="w-3.5 h-3.5" />
              <span>Academic Scheduling</span>
            </span>
            <span className="text-xs text-slate-500">ES RUBENGERA RTB</span>
          </div>
          <h1 className="text-2xl font-black text-slate-900 mt-1">{t('navTimetable')}</h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Weekly lesson allocation, TVET computer labs & homework task tracking
          </p>
        </div>

        {/* Tab Switcher */}
        <div className="flex items-center gap-2 bg-slate-100 p-1 rounded-xl">
          <button
            onClick={() => setActiveTab('TIMETABLE')}
            className={`px-4 py-2 rounded-lg text-xs font-bold transition ${
              activeTab === 'TIMETABLE'
                ? 'bg-white text-blue-700 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Weekly Schedule
          </button>
          <button
            onClick={() => setActiveTab('HOMEWORK')}
            className={`px-4 py-2 rounded-lg text-xs font-bold transition ${
              activeTab === 'HOMEWORK'
                ? 'bg-white text-blue-700 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Homework ({homework.length})
          </button>
        </div>
      </div>

      {/* Class Picker */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex items-center gap-3">
        <span className="text-xs font-semibold text-slate-600">Select Class:</span>
        <select
          value={selectedClassId}
          onChange={e => setSelectedClassId(e.target.value)}
          className="px-3 py-1.5 rounded-xl border border-slate-200 text-xs font-bold text-slate-800 bg-white"
        >
          {classes.map(c => (
            <option key={c.id} value={c.id}>{c.name} — {c.combination}</option>
          ))}
        </select>
      </div>

      {activeTab === 'TIMETABLE' ? (
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
          {days.map(day => {
            const slots = timetable.filter(t => t.dayOfWeek === day);
            return (
              <div key={day} className="bg-white rounded-2xl border border-slate-200 shadow-xs p-4 space-y-3">
                <div className="pb-2 border-b border-slate-100 flex items-center justify-between">
                  <span className="font-extrabold text-sm text-[#102B50]">{day}</span>
                  <span className="text-[10px] font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded">
                    {slots.length} Lessons
                  </span>
                </div>

                <div className="space-y-2.5">
                  {slots.length > 0 ? (
                    slots.map(slot => (
                      <div key={slot.id} className="p-3 rounded-xl bg-slate-50 border border-slate-200/80 space-y-1">
                        <span className="font-mono text-[10px] font-bold text-blue-700">
                          {slot.startTime} - {slot.endTime}
                        </span>
                        <p className="text-xs font-bold text-slate-900 leading-snug">{slot.subjectName}</p>
                        <p className="text-[11px] text-slate-600">{slot.teacherName}</p>
                        <p className="text-[10px] text-slate-600 font-medium">{slot.room}</p>
                      </div>
                    ))
                  ) : (
                    <p className="text-xs text-slate-600 py-4 text-center">Self-study / Sports</p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {homework.map(hw => (
            <div key={hw.id} className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs space-y-3">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <span className="text-[10px] font-bold uppercase text-blue-700 bg-blue-50 px-2.5 py-0.5 rounded">
                    {hw.subjectName}
                  </span>
                  <h3 className="text-sm font-bold text-slate-900 mt-1.5">{hw.title}</h3>
                </div>
                <span className="text-xs font-bold text-red-600 flex items-center gap-1">
                  <Clock className="w-3.5 h-3.5" /> Due: {hw.dueDate}
                </span>
              </div>
              <p className="text-xs text-slate-600 leading-relaxed">{hw.description}</p>
              <div className="pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
                <span>Instructor: <strong>{hw.teacherName}</strong></span>
                <span className="font-semibold text-emerald-700">{hw.submissionsCount} submissions received</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
