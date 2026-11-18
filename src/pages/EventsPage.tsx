import React, { useEffect, useState } from 'react';
import { SchoolEvent } from '../types';
import { api } from '../services/api';
import { useLanguage } from '../i18n/LanguageContext';
import { useAuth } from '../contexts/AuthContext';
import {
  CalendarCheck,
  Plus,
  Clock,
  MapPin,
  Users,
  Send,
  Filter,
  Search,
  Sparkles,
  CheckCircle2,
  X
} from 'lucide-react';
import confetti from 'canvas-confetti';

export const EventsPage: React.FC = () => {
  const { t, language } = useLanguage();
  const { role, school } = useAuth();

  const [events, setEvents] = useState<SchoolEvent[]>([]);
  const [filterCategory, setFilterCategory] = useState<string>('ALL');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);

  // New Event Modal
  const [showAddModal, setShowAddModal] = useState(false);
  const [titleEn, setTitleEn] = useState('');
  const [titleRw, setTitleRw] = useState('');
  const [descEn, setDescEn] = useState('');
  const [descRw, setDescRw] = useState('');
  const [eventDate, setEventDate] = useState('2026-11-25');
  const [eventTime, setEventTime] = useState('09:00 AM');
  const [category, setCategory] = useState<SchoolEvent['category']>('PARENT_MEETING');
  const [targetAudience, setTargetAudience] = useState<SchoolEvent['targetAudience']>('PARENTS');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [remindedEventId, setRemindedEventId] = useState<string | null>(null);

  const loadEvents = async () => {
    try {
      setLoading(true);
      const data = await api.getEvents();
      setEvents(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadEvents();
  }, []);

  const handleCreateEvent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!titleEn.trim() && !titleRw.trim()) return;

    try {
      setIsSubmitting(true);
      await api.createEvent({
        titleEn: titleEn || titleRw,
        titleRw: titleRw || titleEn,
        descriptionEn: descEn || descRw,
        descriptionRw: descRw || descEn,
        date: eventDate,
        time: eventTime,
        category,
        targetAudience
      });

      confetti({ particleCount: 50, spread: 60 });
      setShowAddModal(false);
      setTitleEn('');
      setTitleRw('');
      setDescEn('');
      setDescRw('');
      loadEvents();
    } catch (err: any) {
      alert(err.message || 'Failed to create event');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDispatchReminder = async (event: SchoolEvent) => {
    try {
      await api.sendNotification({
        recipientId: 'all-guardians',
        recipientName: 'All Parents & Guardians',
        channel: 'IN_APP',
        category: 'MEETINGS',
        priority: 'ROUTINE',
        titleEn: `Reminder: ${event.titleEn}`,
        titleRw: `Icyibutso: ${event.titleRw}`,
        contentEn: `SchoolCare Reminder: ${event.titleEn} scheduled for ${event.date} at ${event.time} at ${school?.name || 'ES RUBENGERA RTB'}.`,
        contentRw: `Ubutumwa bwa SchoolCare: Turabibutsa gahunda ya "${event.titleRw}" izaba kuwa ${event.date} saa ${event.time} kuri ${school?.name || 'ES RUBENGERA RTB'}.`
      });

      setRemindedEventId(event.id);
      setTimeout(() => setRemindedEventId(null), 3000);
      confetti({ particleCount: 40, spread: 50, origin: { y: 0.7 } });
    } catch (err: any) {
      alert(err.message || 'Failed to dispatch reminder');
    }
  };

  const filtered = events.filter(e => {
    if (filterCategory !== 'ALL' && e.category !== filterCategory) return false;
    if (search) {
      const q = search.toLowerCase();
      return (
        e.titleEn.toLowerCase().includes(q) ||
        e.titleRw.toLowerCase().includes(q) ||
        e.descriptionEn.toLowerCase().includes(q)
      );
    }
    return true;
  });

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-6 rounded-2xl border border-slate-200 shadow-xs">
        <div>
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-blue-100 text-blue-800 flex items-center gap-1">
              <CalendarCheck className="w-3.5 h-3.5" />
              <span>School Calendar & Community Assemblies</span>
            </span>
            <span className="text-xs text-slate-500">{school?.name || 'ES RUBENGERA RTB'}</span>
          </div>
          <h1 className="text-2xl font-black text-slate-900 mt-1">{t('navEvents')}</h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Parent-Teacher General Assemblies (*Inama Rusange*), TVET Robotics showcases, exams & academic calendar
          </p>
        </div>

        {role !== 'STUDENT' && role !== 'PARENT' && (
          <button
            onClick={() => setShowAddModal(true)}
            className="px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs shadow-md transition flex items-center gap-1.5"
          >
            <Plus className="w-4 h-4" />
            <span>Schedule New Event</span>
          </button>
        )}
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex flex-col sm:flex-row items-center justify-between gap-3">
        <div className="relative w-full sm:w-80">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search events by title or keyword..."
            className="w-full pl-9 pr-3 py-2 rounded-xl border border-slate-200 text-xs text-slate-800 focus:outline-hidden focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          <Filter className="w-4 h-4 text-slate-400 shrink-0" />
          <span className="text-xs font-semibold text-slate-600">{t('filter')}:</span>
          <select
            value={filterCategory}
            onChange={e => setFilterCategory(e.target.value)}
            className="px-3 py-1.5 rounded-xl border border-slate-200 text-xs font-semibold text-slate-700 bg-white"
          >
            <option value="ALL">All Categories ({events.length})</option>
            <option value="PARENT_MEETING">Parent Assembly (Inama y’Ababyeyi)</option>
            <option value="ACADEMIC">Academic Showcase & Exams</option>
            <option value="SPORTS">Sports & Competitions</option>
            <option value="HEALTH">Health & Vaccination</option>
            <option value="HOLIDAY">Public Holidays</option>
          </select>
        </div>
      </div>

      {/* Events Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {filtered.map(evt => (
          <div key={evt.id} className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs space-y-4 hover:shadow-md transition">
            <div className="flex items-start justify-between gap-3">
              <div>
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase bg-blue-100 text-blue-800">
                  {evt.category.replace('_', ' ')}
                </span>
                <h3 className="text-base font-extrabold text-slate-900 mt-2">
                  {language === 'rw' ? evt.titleRw : evt.titleEn}
                </h3>
              </div>
              <div className="text-right shrink-0">
                <span className="inline-block px-3 py-1 rounded-xl bg-slate-900 text-white font-mono font-bold text-xs shadow-xs">
                  {evt.date}
                </span>
                <p className="text-[11px] font-semibold text-slate-500 mt-1 flex items-center justify-end gap-1">
                  <Clock className="w-3.5 h-3.5" />
                  <span>{evt.time}</span>
                </p>
              </div>
            </div>

            <p className="text-xs text-slate-600 leading-relaxed">
              {language === 'rw' ? evt.descriptionRw : evt.descriptionEn}
            </p>

            <div className="pt-3 border-t border-slate-100 flex items-center justify-between text-xs">
              <span className="font-semibold text-slate-500">
                Audience: <strong className="text-slate-800">{evt.targetAudience}</strong>
              </span>

              {role !== 'STUDENT' && role !== 'PARENT' && (
                <button
                  onClick={() => handleDispatchReminder(evt)}
                  className="px-3 py-1.5 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-800 font-bold text-xs transition flex items-center gap-1.5"
                >
                  {remindedEventId === evt.id ? (
                    <>
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                      <span>Queued</span>
                    </>
                  ) : (
                    <>
                      <Send className="w-3.5 h-3.5 text-emerald-600" />
                      <span>Queue reminder</span>
                    </>
                  )}
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Add Event Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in">
          <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full p-6 space-y-4 border border-slate-200">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="text-base font-bold text-slate-900">Schedule School Event</h3>
              <button onClick={() => setShowAddModal(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateEvent} className="space-y-3 text-xs">
              <div>
                <label className="block font-bold text-slate-700 mb-1">Title (English) *</label>
                <input
                  type="text"
                  value={titleEn}
                  onChange={e => setTitleEn(e.target.value)}
                  placeholder="e.g. Term 2 General Assembly with Parents"
                  className="w-full px-3 py-2 rounded-xl border border-slate-300"
                  required
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Title (Ikinyarwanda)</label>
                <input
                  type="text"
                  value={titleRw}
                  onChange={e => setTitleRw(e.target.value)}
                  placeholder="e.g. Inama Rusange y’Ababyeyi y’Igihembwe cya 2"
                  className="w-full px-3 py-2 rounded-xl border border-slate-300"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Date *</label>
                  <input
                    type="date"
                    value={eventDate}
                    onChange={e => setEventDate(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300"
                    required
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Time *</label>
                  <input
                    type="text"
                    value={eventTime}
                    onChange={e => setEventTime(e.target.value)}
                    placeholder="e.g. 09:00 AM - 1:00 PM"
                    className="w-full px-3 py-2 rounded-xl border border-slate-300"
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Category *</label>
                  <select
                    value={category}
                    onChange={e => setCategory(e.target.value as any)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-white"
                  >
                    <option value="PARENT_MEETING">Parent Assembly (Inama)</option>
                    <option value="ACADEMIC">Academic Showcase / Exam</option>
                    <option value="SPORTS">Sports Tournament</option>
                    <option value="HEALTH">Health Campaign</option>
                    <option value="HOLIDAY">Public Holiday</option>
                  </select>
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Target Audience</label>
                  <select
                    value={targetAudience}
                    onChange={e => setTargetAudience(e.target.value as any)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-white"
                  >
                    <option value="ALL">All Community</option>
                    <option value="PARENTS">Parents & Guardians</option>
                    <option value="STUDENTS">Students</option>
                    <option value="TEACHERS">Faculty & Staff</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Description (English)</label>
                <textarea
                  rows={2}
                  value={descEn}
                  onChange={e => setDescEn(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2 rounded-xl border border-slate-300 text-slate-700 font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-5 py-2 rounded-xl bg-blue-600 text-white font-bold"
                >
                  {isSubmitting ? 'Saving...' : 'Publish Event'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
