import { useCallback, useEffect, useState } from 'react';
import { MessageCircle, Sparkles, X } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../i18n/LanguageContext';
import { isTabAllowedForRole } from '../rbac';
import { getNavItem } from '../navigation';
import AiChat from './AiChat';
import type { LanguageCode, UserRole } from '../types';

interface ContextPrompt {
  en: string;
  rw: string;
}

function promptFor(tab: string, role: UserRole | null, language: LanguageCode): string {
  const portal = role === 'PARENT' || role === 'STUDENT';
  const teacher = role === 'TEACHER';
  const leader = role === 'SCHOOL_ADMIN' || role === 'HEAD_TEACHER' || role === 'DEPUTY_HEAD';
  const prompts: Record<string, ContextPrompt> = {
    dashboard: portal
      ? { en: 'Explain the information shown on my portal dashboard.', rw: 'Sobanura amakuru ari kuri dashboard yanjye.' }
      : { en: 'Help me understand the key figures on this dashboard.', rw: 'Mfasha gusobanura imibare y’ingenzi kuri iyi dashboard.' },
    attendance: portal
      ? { en: 'Explain my attendance record and what I should do if a day is missing.', rw: 'Sobanura imyitabiriye yanjye n’icyo nakora ku munsi wabuze.' }
      : teacher
        ? { en: 'Summarize attendance for the classes I teach and suggest follow-up.', rw: 'Sobanura imyitabiriye mu masomo nkamishe kandi utange inama.' }
        : { en: 'Summarize school attendance and suggest follow-up.', rw: 'Sobanura imyitabiriye y’ishuri kandi utange inama.' },
    academics: {
      en: 'Help me prepare an effective lesson and a short assessment for my subject.',
      rw: 'Mfasha kwitegura isomo rikwiye n’ikizamini ngufi kuri isomo nkamishe.'
    },
    'academic-admin': {
      en: 'How should I review academic submissions before approving them?',
      rw: 'Nigute nasuzuma ibyatanzwe mu masomo mbere yo kubyemeza?'
    },
    'report-printing': portal
      ? { en: 'Explain my published report card in simple terms.', rw: 'Sobanura raporo yanjye yatangajwe mu buryo bworoshye.' }
      : { en: 'How should I check a report card before releasing it?', rw: 'Nigute ngenzura raporo mbere yo kuyitangaza?' },
    exams: teacher
      ? { en: 'Prepare fair practice questions for my students.', rw: 'Tegura ibibazo by’imyitozo bikwiye ku banyeshuri banjye.' }
      : { en: 'How can I prepare effectively for my next examination?', rw: 'Nigute nitegura neza ikizamini kiri imbere?' },
    'marking-guides': {
      en: 'Create a clear marking guide with fair criteria.',
      rw: 'Kora ubuyobozi bwo gukosora bufite ibipimo bikwiye.'
    },
    teaching: {
      en: 'Suggest a simple explanation and practice activity for today’s topic.',
      rw: 'Tanga ubusobanuro bworoshye n’imyitozo ku nsomo y’uyu munsi.'
    },
    finance: {
      en: 'Explain the school fee process using only information I am authorized to see.',
      rw: 'Sobanura uburyo bwo kwishyura amafaranga y’ishuri ukoresheje amakuru yemewe gusa.'
    },
    health: {
      en: 'What information belongs in a school health incident report?',
      rw: 'Ni ayahe makuru agomba kuba muri raporo y’ubuzima bw’ishuri?'
    },
    communication: {
      en: 'Draft a respectful, bilingual message for parents.',
      rw: 'Tegura ubutumwa bwubaha ku babyeyi mu Cyongereza no mu Kinyarwanda.'
    },
    students: {
      en: 'How can I support a student who is falling behind?',
      rw: 'Nigute nafasha umunyeshuri usigara inyuma?'
    },
    guardians: {
      en: 'How can I improve communication with guardians?',
      rw: 'Nigute nashimangira itumanaho n’ababyeyi?'
    },
    timetable: {
      en: 'Suggest a balanced weekly study timetable.',
      rw: 'Tanga gahunda y’icyumweru yo kwiga iganya neza.'
    },
    events: {
      en: 'Suggest activities that encourage student participation.',
      rw: 'Tanga ibikorwa bishishikariza abanyeshuri kwitabira.'
    },
    reports: {
      en: 'Help me interpret this report using only authorized data.',
      rw: 'Mfasha gusobanura iyi raporo ukoresheje amakuru yemewe gusa.'
    },
    discipline: {
      en: 'Draft a fair incident report for a discipline matter.',
      rw: 'Tegura raporo ikwiye ku kibazo cy’imyitwarire.'
    },
    admissions: {
      en: 'Summarize the admission process for a new family.',
      rw: 'Sobanura uburyo bwo kwinjira ku muryo mushya.'
    },
    staff: {
      en: 'How should I prepare a constructive staff meeting agenda?',
      rw: 'Nigute ntegura gahunda y’inama y’abakozi ikubaka?'
    },
    permissions: {
      en: 'Explain the principle of least privilege for school accounts.',
      rw: 'Sobanura ihame ryo gutanga uburenganzira buke bushoboka ku makonti y’ishuri.'
    },
    audit: {
      en: 'Which audit events should I review after a sensitive change?',
      rw: 'Ni izihe nkuru zo kugenzura ngomba gusuzuma nyuma y’impinduka ikomeye?'
    },
    settings: {
      en: 'Which school settings affect student privacy?',
      rw: 'Ni izihe ngenamiterere ry’ishuri rirebana n’ubuzima bwite bw’abanyeshuri?'
    },
    'public-site': {
      en: 'Suggest a short announcement for the school website.',
      rw: 'Tanga itangazo ngufi ry’urupapuro rw’ishuri.'
    },
    'ai-assistant': {
      en: 'What can you help me with in my role?',
      rw: 'Ni iki ushobora kungirira mu nshingano zanjye?'
    }
  };
  const found = prompts[tab];
  if (found) return found[language];
  if (leader) {
    return language === 'rw'
      ? 'Sobanura amakuru y’ishuri ari kuri iyi paji.'
      : 'Explain the school information shown on this page.';
  }
  return language === 'rw'
    ? 'Mfasha gusobanura ibiri kuri iyi paji.'
    : 'Help me understand the information on this page.';
}

/**
 * Floating AI launcher plus a contextual "Ask AI about this page" control.
 * It only renders for authenticated users whose role may use the assistant.
 */
export default function AiAssistantLauncher({ currentTab }: { currentTab: string }) {
  const { role, effectivePermissions } = useAuth();
  const { t, language } = useLanguage();
  const [open, setOpen] = useState(false);
  const [prompt, setPrompt] = useState<string | null>(null);
  const allowed = isTabAllowedForRole(role, 'ai-assistant', effectivePermissions);

  const openWithContext = useCallback(() => {
    setPrompt(promptFor(currentTab, role, language));
    setOpen(true);
  }, [currentTab, language, role]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open]);

  if (!allowed) return null;

  const navItem = getNavItem(currentTab);
  const navLabel = navItem?.labelKey ? t(navItem.labelKey) : (navItem?.label ?? currentTab);
  const contextualLabel = `${t('aiAskAbout')}: ${navLabel}`;

  return (
    <>
      <div className="flex justify-end px-4 pt-3 sm:px-6">
        <button
          type="button"
          onClick={openWithContext}
          className="inline-flex items-center gap-1.5 rounded-full border border-blue-200 bg-white/90 px-3 py-1.5 text-[11px] font-semibold text-blue-700 shadow-sm transition hover:border-blue-400 hover:bg-blue-50"
          title={contextualLabel}
        >
          <Sparkles size={13} aria-hidden="true" />
          <span className="hidden sm:inline">{contextualLabel}</span>
          <span className="sm:hidden">{t('aiAskAbout')}</span>
        </button>
      </div>

      <button
        type="button"
        onClick={openWithContext}
        aria-label={t('aiOpen')}
        title={t('aiOpen')}
        className="fixed bottom-24 right-4 z-40 flex h-13 w-13 items-center justify-center rounded-full bg-blue-700 text-white shadow-lg shadow-blue-900/25 transition hover:bg-blue-800 focus:outline-none focus:ring-4 focus:ring-blue-200 md:bottom-6 md:right-6 md:h-14 md:w-14"
      >
        {open ? <X size={22} aria-hidden="true" /> : <MessageCircle size={22} aria-hidden="true" />}
      </button>

      {open && (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/50 p-2 backdrop-blur-sm sm:p-6"
          role="presentation"
        >
          <button
            type="button"
            aria-label={t('aiClose')}
            className="absolute inset-0 cursor-default"
            onClick={() => setOpen(false)}
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-label={t('aiTitle')}
            className="relative z-10 flex h-[88vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-blue-200 bg-white shadow-2xl"
          >
            <div className="flex items-center justify-between border-b border-blue-100 bg-blue-50/70 px-3 py-2">
              <p className="truncate pr-3 text-xs font-semibold text-blue-800">{contextualLabel}</p>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label={t('aiClose')}
                className="rounded-lg p-1.5 text-blue-700 hover:bg-blue-100"
              >
                <X size={17} aria-hidden="true" />
              </button>
            </div>
            <div className="min-h-0 flex-1">
              <AiChat
                compact
                initialPrompt={prompt ?? undefined}
                onInitialPromptConsumed={() => setPrompt(null)}
              />
            </div>
          </div>
        </div>
      )}
    </>
  );
}
