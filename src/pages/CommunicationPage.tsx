import React, { useEffect, useState } from 'react';
import {
  NotificationMessage,
  NotificationChannel,
  NotificationCategory,
  Guardian,
  AcademicClass,
  Student
} from '../types';
import { api } from '../services/api';
import { useLanguage } from '../i18n/LanguageContext';
import {
  MessageSquare,
  Send,
  CheckCircle2,
  Clock,
  CheckCheck,
  ShieldCheck,
  Users,
  RefreshCw,
  Search,
  AlertCircle,
  GraduationCap,
  UserRound
} from 'lucide-react';

type RecipientType = 'ALL' | 'CLASS' | 'INDIVIDUAL';
type MessagePriority = 'ROUTINE' | 'URGENT' | 'EMERGENCY';

const isReachableOnChannel = (guardian: Guardian, channel: NotificationChannel) => {
  if (channel === 'EMAIL') return Boolean(guardian.email?.trim());
  if (channel === 'IN_APP') return true;
  return Boolean(guardian.phone.trim());
};

export const CommunicationPage: React.FC = () => {
  const { t, language } = useLanguage();
  const [messages, setMessages] = useState<NotificationMessage[]>([]);
  const [guardians, setGuardians] = useState<Guardian[]>([]);
  const [classes, setClasses] = useState<AcademicClass[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(true);
  const [historyError, setHistoryError] = useState('');
  const [loadingDirectory, setLoadingDirectory] = useState(true);
  const [filterChannel, setFilterChannel] = useState<NotificationChannel | 'all'>('all');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [historySearch, setHistorySearch] = useState('');
  const [historyCategory, setHistoryCategory] = useState<NotificationCategory | 'all'>('all');
  const [formError, setFormError] = useState('');
  const [formNotice, setFormNotice] = useState('');

  // New message form state
  const [recipientType, setRecipientType] = useState<RecipientType>('ALL');
  const [selectedClassId, setSelectedClassId] = useState('');
  const [selectedGuardianId, setSelectedGuardianId] = useState('');
  const [classRecipients, setClassRecipients] = useState<Guardian[]>([]);
  const [loadingClassRecipients, setLoadingClassRecipients] = useState(false);
  const [channel, setChannel] = useState<NotificationChannel>('WHATSAPP');
  const [category, setCategory] = useState<NotificationCategory>('ANNOUNCEMENTS');
  const [priority, setPriority] = useState<MessagePriority>('ROUTINE');
  const [titleEn, setTitleEn] = useState('');
  const [titleRw, setTitleRw] = useState('');
  const [contentEn, setContentEn] = useState('');
  const [contentRw, setContentRw] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [sendSuccess, setSendSuccess] = useState(false);

  // Template selector
  const templates = [
    {
      label: 'Parent meeting invitation',
      category: 'MEETINGS' as NotificationCategory,
      titleEn: 'Parent meeting invitation',
      titleRw: 'Ubutumire mu nama y’ababyeyi',
      contentEn: 'Dear Parent/Guardian,\n\nYou are invited to a school meeting on [date] at [time].\n\nLocation: [location]\n\nPlease contact the school if you need more information.',
      contentRw: 'Mubyeyi/Murera,\n\nMuratumirwa mu nama y’ishuri izaba ku wa [itariki] saa [igihe].\n\nAho izabera: [ahantu]\n\nMwahamagara ishuri niba mukeneye andi makuru.'
    },
    {
      label: 'School fee reminder',
      category: 'FEES' as NotificationCategory,
      titleEn: 'School fee reminder',
      titleRw: 'Icyibutso cy’amafaranga y’ishuri',
      contentEn: 'Dear Parent/Guardian,\n\nThis is a reminder about the school fee balance for [student name].\n\nBalance: [amount] RWF\nDue date: [date]\n\nPlease contact the school office if you have any questions.',
      contentRw: 'Mubyeyi/Murera,\n\nTubibutsa amafaranga y’ishuri asigaye kuri [izina ry’umunyeshuri].\n\nAmafaranga asigaye: [amafaranga] RWF\nItariki ntarengwa: [itariki]\n\nMwabariza ku biro by’ishuri niba hari ikibazo.'
    },
    {
      label: 'General health notice',
      category: 'HEALTH' as NotificationCategory,
      titleEn: 'School health notice',
      titleRw: 'Itangazo ry’ubuzima ku ishuri',
      contentEn: 'Dear Parent/Guardian,\n\n[Write the health notice and any steps families should take.]\n\nFor urgent concerns, contact the school office.',
      contentRw: 'Mubyeyi/Murera,\n\n[Andika itangazo ry’ubuzima n’ingamba imiryango ikwiye gufata.]\n\nKu kibazo cyihutirwa, hamagara ibiro by’ishuri.'
    }
  ];

  const handleApplyTemplate = (tpl: typeof templates[0]) => {
    setCategory(tpl.category);
    setTitleEn(tpl.titleEn);
    setTitleRw(tpl.titleRw);
    setContentEn(tpl.contentEn);
    setContentRw(tpl.contentRw);
  };

  const loadMessages = async () => {
    try {
      setLoading(true);
      setHistoryError('');
      const data = await api.getNotifications();
      setMessages(data);
    } catch (err) {
      console.error(err);
      setHistoryError('Unable to load message history. Refresh the list to try again.');
    } finally {
      setLoading(false);
    }
  };

  const loadDirectory = async () => {
    try {
      setLoadingDirectory(true);
      const [guardianData, classData, studentData] = await Promise.all([
        api.getGuardians(),
        api.getActiveClasses(),
        api.getStudents()
      ]);
      setGuardians(guardianData);
      setClasses(classData);
      setStudents(studentData);
      setSelectedClassId(currentId => currentId || classData[0]?.id || '');
      setSelectedGuardianId(currentId => currentId || guardianData.find(g => g.isVerified)?.id || '');
    } catch (err) {
      console.error('Failed to load messaging recipient directory:', err);
      setFormError('Could not load the recipient list. Refresh this page and try again.');
    } finally {
      setLoadingDirectory(false);
    }
  };

  useEffect(() => {
    loadMessages();
    loadDirectory();
  }, []);

  useEffect(() => {
    if (recipientType !== 'CLASS' || !selectedClassId) {
      setClassRecipients([]);
      return;
    }

    let active = true;
    const loadClassRecipients = async () => {
      try {
        setLoadingClassRecipients(true);
        const classStudents = students.filter(student => student.classId === selectedClassId);
        const studentRecords = await Promise.all(classStudents.map(student => api.getStudent(student.id)));
        const linkedGuardians = new Map<string, Guardian>();
        studentRecords.forEach(student => {
          student.guardians.forEach(({ guardian }) => {
            if (guardian.isVerified) linkedGuardians.set(guardian.id, guardian);
          });
        });
        if (active) setClassRecipients(Array.from(linkedGuardians.values()));
      } catch (err) {
        console.error('Failed to load class guardians:', err);
        if (active) {
          setClassRecipients([]);
          setFormError('Could not load verified guardians for this class. Please try another class or refresh.');
        }
      } finally {
        if (active) setLoadingClassRecipients(false);
      }
    };

    loadClassRecipients();
    return () => {
      active = false;
    };
  }, [recipientType, selectedClassId, students]);

  const verifiedGuardians = guardians.filter(guardian => guardian.isVerified);
  const selectedRecipients =
    recipientType === 'ALL'
      ? verifiedGuardians
      : recipientType === 'CLASS'
        ? classRecipients
        : verifiedGuardians.filter(guardian => guardian.id === selectedGuardianId);
  const reachableRecipients = selectedRecipients.filter(guardian => isReachableOnChannel(guardian, channel));
  const unavailableRecipientCount = selectedRecipients.length - reachableRecipients.length;
  const smsLength = Math.max(contentEn.length, contentRw.length);
  const smsSegments = smsLength === 0 ? 0 : smsLength <= 160 ? 1 : Math.ceil(smsLength / 153);

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');
    setFormNotice('');
    if (!contentEn.trim() && !contentRw.trim()) {
      setFormError('Write a message in English or Kinyarwanda before sending.');
      return;
    }
    if (recipientType === 'CLASS' && !selectedClassId) {
      setFormError('Select a class before sending.');
      return;
    }
    if (recipientType === 'INDIVIDUAL' && !selectedGuardianId) {
      setFormError('Select a verified guardian before sending.');
      return;
    }
    if (reachableRecipients.length === 0) {
      setFormError('No verified recipients have a contact address for the selected channel.');
      return;
    }
    if (reachableRecipients.length > 1 && !window.confirm(`Queue this message for ${reachableRecipients.length} verified guardians using ${channel}?`)) {
      return;
    }

    try {
      setIsSending(true);
      const outcomes = await Promise.allSettled(
        reachableRecipients.map(guardian =>
          api.sendNotification({
            recipientId: guardian.id,
            recipientName: guardian.fullName,
            recipientPhone: guardian.phone || '',
            recipientEmail: guardian.email,
            channel,
            category,
            priority,
            titleEn: titleEn.trim() || 'SchoolCare Notice',
            titleRw: titleRw.trim() || 'Itangazo ry’ishuri',
            contentEn: contentEn.trim() || contentRw.trim(),
            contentRw: contentRw.trim() || contentEn.trim()
          })
        )
      );
      const successfulCount = outcomes.filter(outcome => outcome.status === 'fulfilled').length;
      const failedNames = outcomes.flatMap((outcome, index) =>
        outcome.status === 'rejected' ? [reachableRecipients[index].fullName] : []
      );
      await loadMessages();

      if (failedNames.length > 0) {
        setFormError(
          `Queued for ${successfulCount} of ${reachableRecipients.length} guardians. Could not queue for: ${failedNames.join(', ')}. Check the history before retrying.`
        );
        return;
      }

      setSendSuccess(true);
      setFormNotice(`Queued for ${successfulCount} verified guardian${successfulCount === 1 ? '' : 's'}. Delivery is not confirmed until the channel provider reports it.`);
      setTitleEn('');
      setTitleRw('');
      setContentEn('');
      setContentRw('');
      setTimeout(() => setSendSuccess(false), 3500);
    } catch (err) {
      console.error('Failed to queue notification batch:', err);
      setFormError(err instanceof Error ? err.message : 'Failed to queue notification.');
    } finally {
      setIsSending(false);
    }
  };

  const filtered = messages.filter(m => {
    if (filterChannel !== 'all' && m.channel !== filterChannel) return false;
    if (filterStatus !== 'all' && m.status !== filterStatus) return false;
    if (historyCategory !== 'all' && m.category !== historyCategory) return false;
    const query = historySearch.trim().toLowerCase();
    if (query && ![m.recipientName, m.titleEn, m.titleRw, m.contentEn, m.contentRw].some(value => value.toLowerCase().includes(query))) return false;
    return true;
  });

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-5 bg-white p-5 sm:p-6 rounded-2xl border border-slate-200 shadow-xs">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="px-2.5 py-1 rounded-full text-[11px] font-semibold bg-indigo-50 text-indigo-800 ring-1 ring-inset ring-indigo-100 flex items-center gap-1">
              <MessageSquare className="w-3.5 h-3.5" />
              <span>School communications</span>
            </span>
            <span className="text-xs text-slate-500">Verified guardian directory</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 mt-2">{t('commTitle')}</h1>
          <p className="text-sm text-slate-500 mt-1">{t('commSubtitle')}</p>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 sm:min-w-[360px]">
          <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Verified guardians</p>
            <p className="mt-1 text-lg font-bold text-slate-900">{loadingDirectory ? '—' : verifiedGuardians.length}</p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Queued messages</p>
            <p className="mt-1 text-lg font-bold text-slate-900">{messages.filter(message => message.status === 'QUEUED').length}</p>
          </div>
            <div className="col-span-2 sm:col-span-1 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-amber-800">Delivery mode</p>
              <p className="mt-1 text-sm font-bold text-amber-900">Local queue</p>
            </div>
        </div>
      </div>

      {/* Strict Delivery Guarantee Disclaimer */}
      <div className="p-4 bg-blue-50/80 rounded-2xl border border-blue-200 text-blue-900 flex items-start gap-3">
        <ShieldCheck className="w-5 h-5 text-blue-700 shrink-0 mt-0.5" />
        <div>
            <p className="text-xs font-bold">Delivery status</p>
            <p className="text-[11px] text-blue-700 mt-0.5">
              Messages created here are added to the local queue. No SMS, WhatsApp, or email is sent until a provider integration is configured; queued messages are not the same as delivered messages.
            </p>
        </div>
      </div>

      {/* Grid: Dispatch Composer & History Log */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
        {/* Composer Form */}
        <div className="xl:col-span-5 bg-white p-5 sm:p-6 rounded-2xl border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-100">
            <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <Send className="w-4 h-4 text-blue-600" />
              <span>Compose message</span>
            </h3>
            <span className="text-[11px] font-medium text-slate-500">English + Kinyarwanda</span>
          </div>

          {/* Quick Template Buttons */}
          <div className="mb-4">
            <label className="block text-[11px] font-semibold text-slate-600 mb-1.5">
              Start from a template
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-3 xl:grid-cols-1 gap-2">
              {templates.map((tpl, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => handleApplyTemplate(tpl)}
                  className="min-h-10 w-full text-left text-xs p-2.5 rounded-xl bg-slate-50 hover:bg-blue-50 border border-slate-200 text-slate-700 transition-colors"
                >
                  {tpl.label}
                </button>
              ))}
            </div>
          </div>

          <form onSubmit={handleSendMessage} className="space-y-4 text-xs" noValidate>
            {/* Channel & Priority */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block font-bold text-slate-700 mb-1">Channel *</label>
                <select
                  value={channel}
                  onChange={e => setChannel(e.target.value as NotificationChannel)}
                  className="w-full min-h-10 px-3 py-2 rounded-xl border border-slate-200 font-medium bg-white"
                >
                  <option value="WHATSAPP">WhatsApp</option>
                  <option value="SMS">SMS</option>
                  <option value="IN_APP">In-app notification</option>
                  <option value="EMAIL">Email</option>
                </select>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Priority *</label>
                <select
                  value={priority}
                  onChange={e => setPriority(e.target.value as MessagePriority)}
                  className="w-full min-h-10 px-3 py-2 rounded-xl border border-slate-200 font-medium bg-white"
                >
                  <option value="ROUTINE">Routine</option>
                  <option value="URGENT">Urgent</option>
                  <option value="EMERGENCY">Emergency</option>
                </select>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Message type *</label>
                <select
                  value={category}
                  onChange={e => setCategory(e.target.value as NotificationCategory)}
                  className="w-full min-h-10 px-3 py-2 rounded-xl border border-slate-200 font-medium bg-white"
                >
                  <option value="ANNOUNCEMENTS">Announcement</option>
                  <option value="MEETINGS">Meeting</option>
                  <option value="HEALTH">Health</option>
                  <option value="ATTENDANCE">Attendance</option>
                  <option value="ACADEMIC">Academic</option>
                  <option value="FEES">Fees</option>
                  <option value="TIMETABLE">Timetable</option>
                  <option value="GENERAL">General</option>
                  <option value="EMERGENCY">Emergency</option>
                </select>
              </div>
            </div>

            {/* Recipient Target */}
            <div>
              <div className="flex items-center justify-between gap-2 mb-2">
                <label className="block font-bold text-slate-700">Recipients *</label>
                <span className="text-[11px] text-slate-500">Verified guardian contacts only</span>
              </div>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { id: 'ALL' as const, label: 'All guardians', icon: Users },
                  { id: 'CLASS' as const, label: 'By class', icon: GraduationCap },
                  { id: 'INDIVIDUAL' as const, label: 'One guardian', icon: UserRound }
                ].map(r => (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => {
                      setRecipientType(r.id);
                      setFormError('');
                      setFormNotice('');
                    }}
                    aria-pressed={recipientType === r.id}
                    className={`min-h-10 flex items-center justify-center gap-1.5 py-2 px-2 rounded-xl text-[11px] font-semibold border transition-colors ${
                      recipientType === r.id
                        ? 'bg-blue-700 text-white border-blue-700'
                        : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                    }`}
                  >
                    <r.icon className="w-3.5 h-3.5" />
                    {r.label}
                  </button>
                ))}
              </div>
            </div>

            {recipientType === 'ALL' && (
              <div className="rounded-xl border border-blue-100 bg-blue-50/70 px-3 py-2.5 text-[11px] text-blue-900">
                This queues one individual message per verified guardian who has a usable contact for the selected channel.
              </div>
            )}

            {recipientType === 'CLASS' && (
              <div className="space-y-2">
                <label htmlFor="message-class" className="block font-bold text-slate-700">Choose a class</label>
                <select
                  id="message-class"
                  value={selectedClassId}
                  onChange={e => setSelectedClassId(e.target.value)}
                  disabled={loadingDirectory || classes.length === 0}
                  className="w-full min-h-10 px-3 py-2 rounded-xl border border-slate-200 bg-white disabled:bg-slate-50"
                  required
                >
                  {classes.length === 0 && <option value="">No classes available</option>}
                  {classes.map(schoolClass => (
                    <option key={schoolClass.id} value={schoolClass.id}>
                      {schoolClass.name} · {schoolClass.studentCount} students
                    </option>
                  ))}
                </select>
                <p className="text-[11px] text-slate-500" aria-live="polite">
                  {loadingClassRecipients
                    ? 'Finding verified guardians for this class…'
                    : `${reachableRecipients.length} reachable guardian${reachableRecipients.length === 1 ? '' : 's'}${unavailableRecipientCount ? ` · ${unavailableRecipientCount} missing a ${channel} contact` : ''}`}
                </p>
              </div>
            )}

            {recipientType === 'INDIVIDUAL' && (
              <div>
                <label htmlFor="message-guardian" className="block font-bold text-slate-700 mb-1">Choose a verified guardian</label>
                <select
                  id="message-guardian"
                  value={selectedGuardianId}
                  onChange={e => setSelectedGuardianId(e.target.value)}
                  disabled={loadingDirectory}
                  className="w-full min-h-10 px-3 py-2 rounded-xl border border-slate-200 bg-white disabled:bg-slate-50"
                  required
                >
                  <option value="">Select a guardian</option>
                  {verifiedGuardians.map(guardian => (
                    <option key={guardian.id} value={guardian.id}>
                      {guardian.fullName} · {guardian.phone || guardian.email || 'No contact'}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* English Title & Content */}
            <div>
              <label className="block font-bold text-slate-700 mb-1">English (optional if Kinyarwanda is filled)</label>
              <input
                type="text"
                value={titleEn}
                onChange={e => setTitleEn(e.target.value)}
                placeholder="Subject (English)"
                aria-label="Message subject in English"
                maxLength={120}
                className="w-full min-h-10 px-3 py-2 rounded-xl border border-slate-200 bg-white mb-2"
              />
              <textarea
                rows={4}
                value={contentEn}
                onChange={e => setContentEn(e.target.value)}
                placeholder="Write your message in English…"
                aria-label="Message body in English"
                maxLength={2000}
                className="w-full px-3 py-2.5 rounded-xl border border-slate-200 bg-white leading-relaxed"
              />
              <p className="mt-1 text-right text-[10px] text-slate-500">{contentEn.length}/2000</p>
            </div>

            {/* Kinyarwanda Title & Content */}
            <div>
              <label className="block font-bold text-slate-700 mb-1">Ikinyarwanda (optional if English is filled)</label>
              <input
                type="text"
                value={titleRw}
                onChange={e => setTitleRw(e.target.value)}
                placeholder="Umutwe w’ubutumwa"
                aria-label="Umutwe w'ubutumwa mu Kinyarwanda"
                maxLength={120}
                className="w-full min-h-10 px-3 py-2 rounded-xl border border-slate-200 bg-white mb-2"
              />
              <textarea
                rows={4}
                value={contentRw}
                onChange={e => setContentRw(e.target.value)}
                placeholder="Andika ubutumwa mu Kinyarwanda…"
                aria-label="Ubutumwa mu Kinyarwanda"
                maxLength={2000}
                className="w-full px-3 py-2.5 rounded-xl border border-slate-200 bg-white leading-relaxed"
              />
              <p className="mt-1 text-right text-[10px] text-slate-500">{contentRw.length}/2000</p>
            </div>

            {channel === 'SMS' && (
              <p className="text-[11px] text-slate-500" aria-live="polite">
                Longest language version: {smsLength} characters · approximately {smsSegments} SMS segment{smsSegments === 1 ? '' : 's'}.
              </p>
            )}

            {unavailableRecipientCount > 0 && (
              <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-[11px] text-amber-900">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                <p>{unavailableRecipientCount} selected guardian{unavailableRecipientCount === 1 ? '' : 's'} will be skipped because no {channel} contact is on file.</p>
              </div>
            )}

            {formError && (
              <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-xs text-red-800" role="alert">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                <p>{formError}</p>
              </div>
            )}
            {formNotice && (
              <div className="flex items-start gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-xs text-emerald-800" role="status">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
                <p>{formNotice}</p>
              </div>
            )}

            <button
              type="submit"
              disabled={isSending || loadingDirectory || loadingClassRecipients || reachableRecipients.length === 0}
              className="w-full min-h-11 py-2.5 px-4 rounded-xl bg-[#102B50] hover:bg-[#173b6c] text-white font-semibold text-xs shadow-sm transition-colors flex items-center justify-center gap-2 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {sendSuccess ? (
                <>
                  <CheckCircle2 className="w-4 h-4 text-emerald-300" />
                  <span>Added to local queue</span>
                </>
              ) : (
                <>
                  <Send className="w-4 h-4" />
                  <span>{isSending ? 'Adding to queue…' : `Queue for ${reachableRecipients.length} recipient${reachableRecipients.length === 1 ? '' : 's'}`}</span>
                </>
              )}
            </button>
          </form>
        </div>

        {/* Transmission History & Delivery Tracking Log */}
        <div className="xl:col-span-7 bg-white p-5 sm:p-6 rounded-2xl border border-slate-200 shadow-xs space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
            <div>
              <h3 className="text-sm font-bold text-slate-900">Message queue & history</h3>
              <p className="text-xs text-slate-500">Search messages and review their current queue status.</p>
            </div>
            <button type="button" onClick={loadMessages} disabled={loading} className="inline-flex min-h-9 items-center justify-center gap-2 rounded-xl border border-slate-200 px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50">
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <label className="relative sm:col-span-2">
              <span className="sr-only">Search message history</span>
              <Search className="absolute left-3 top-3 h-4 w-4 text-slate-400" aria-hidden="true" />
              <input
                type="search"
                value={historySearch}
                onChange={e => setHistorySearch(e.target.value)}
                placeholder="Search recipient, subject, or message…"
                className="w-full min-h-10 rounded-xl border border-slate-200 bg-white pl-9 pr-3 py-2 text-xs"
              />
            </label>
            <label>
              <span className="sr-only">Filter by channel</span>
              <select
                value={filterChannel}
                onChange={e => setFilterChannel(e.target.value as NotificationChannel | 'all')}
                className="w-full min-h-10 px-3 py-2 rounded-xl border border-slate-200 text-xs text-slate-700 bg-white"
              >
                <option value="all">All channels</option>
                <option value="WHATSAPP">WhatsApp</option>
                <option value="SMS">SMS</option>
                <option value="EMAIL">Email</option>
                <option value="IN_APP">In-app</option>
              </select>
            </label>
            <label>
              <span className="sr-only">Filter by status</span>
              <select
                value={filterStatus}
                onChange={e => setFilterStatus(e.target.value)}
                className="w-full min-h-10 px-3 py-2 rounded-xl border border-slate-200 text-xs text-slate-700 bg-white"
              >
                <option value="all">All statuses</option>
                <option value="QUEUED">Queued</option>
                <option value="SENDING">Sending</option>
                <option value="SENT">Sent</option>
                <option value="DELIVERED">Delivered</option>
                <option value="FAILED">Failed</option>
                <option value="ACKNOWLEDGED">Acknowledged</option>
              </select>
            </label>
            <label className="sm:col-span-2">
              <span className="sr-only">Filter by message type</span>
              <select
                value={historyCategory}
                onChange={e => setHistoryCategory(e.target.value as NotificationCategory | 'all')}
                className="w-full min-h-10 px-3 py-2 rounded-xl border border-slate-200 text-xs text-slate-700 bg-white"
              >
                <option value="all">All message types</option>
                {['ANNOUNCEMENTS', 'MEETINGS', 'HEALTH', 'ATTENDANCE', 'ACADEMIC', 'FEES', 'TIMETABLE', 'GENERAL', 'EMERGENCY'].map(value => (
                  <option key={value} value={value}>{value.replace('_', ' ')}</option>
                ))}
              </select>
            </label>
          </div>

          {historyError && (
            <div className="flex items-center justify-between gap-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800" role="alert">
              <span>{historyError}</span>
              <button type="button" onClick={loadMessages} className="shrink-0 font-semibold underline">Retry</button>
            </div>
          )}

          <div className="space-y-3 max-h-[760px] overflow-y-auto pr-1">
            {loading && (
              <div className="rounded-xl border border-slate-200 px-4 py-8 text-center text-xs text-slate-500" role="status">
                Loading message history…
              </div>
            )}
            {!loading && filtered.length === 0 && !historyError && (
              <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-10 text-center">
                <MessageSquare className="mx-auto h-8 w-8 text-slate-300" />
                <p className="mt-3 text-sm font-semibold text-slate-700">
                  {messages.length === 0 ? 'No messages in the queue yet' : 'No messages match these filters'}
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  {messages.length === 0 ? 'Queued messages will appear here.' : 'Try a different search or clear the filters.'}
                </p>
              </div>
            )}
            {filtered.map(msg => (
              <div
                key={msg.id}
                className="p-4 rounded-xl border border-slate-200 bg-white hover:border-slate-300 transition-colors"
              >
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-1.5">
                    <span className="px-2 py-1 rounded-full text-[10px] font-semibold uppercase bg-blue-50 text-blue-800">
                      {msg.channel}
                    </span>
                    <span className="px-2 py-1 rounded-full text-[10px] font-medium bg-slate-100 text-slate-700">
                      {msg.category}
                    </span>
                    </div>
                    <h4 className="mt-2 text-sm font-semibold text-slate-900 break-words">
                      {(language === 'rw' ? msg.titleRw : msg.titleEn) || msg.titleEn || msg.titleRw}
                    </h4>
                  </div>

                  {/* Delivery Status Badge */}
                  <span
                    className={`shrink-0 inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                      msg.status === 'ACKNOWLEDGED'
                        ? 'bg-purple-100 text-purple-800'
                        : msg.status === 'DELIVERED'
                        ? 'bg-emerald-100 text-emerald-800'
                        : msg.status === 'FAILED'
                        ? 'bg-red-100 text-red-800'
                        : msg.status === 'QUEUED' || msg.status === 'SENDING'
                          ? 'bg-amber-100 text-amber-800'
                          : 'bg-blue-100 text-blue-800'
                    }`}
                  >
                    {msg.status === 'ACKNOWLEDGED' && <CheckCheck className="w-3 h-3 text-purple-600" />}
                    {msg.status === 'DELIVERED' && <CheckCircle2 className="w-3 h-3 text-emerald-600" />}
                    {(msg.status === 'SENT' || msg.status === 'QUEUED' || msg.status === 'SENDING') && <Clock className="w-3 h-3 text-blue-600" />}
                    <span>{msg.status}</span>
                  </span>
                </div>

                <p className="text-xs text-slate-700 mt-2 leading-relaxed whitespace-pre-line">
                  {(language === 'rw' ? msg.contentRw : msg.contentEn) || msg.contentEn || msg.contentRw}
                </p>

                <div className="flex flex-wrap items-center justify-between gap-2 mt-3 pt-2 border-t border-slate-200/80 text-[11px] text-slate-500">
                  <div className="flex items-center gap-3">
                    <span>To <strong className="text-slate-700">{msg.recipientName}</strong></span>
                    {(msg.channel === 'SMS' || msg.channel === 'WHATSAPP') && (
                      <span className="font-mono text-slate-700">{msg.recipientPhone}</span>
                    )}
                    {msg.channel === 'EMAIL' && msg.recipientEmail && (
                      <span className="break-all text-slate-700">{msg.recipientEmail}</span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <span>{new Date(msg.createdAt).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
