import React, { useEffect, useRef } from 'react';
import { X, Type, Contrast, Moon, SunMedium, Zap, Keyboard, MonitorSmartphone, RotateCcw } from 'lucide-react';
import { useAccessibility } from '../contexts/AccessibilityContext';
import { useLanguage } from '../i18n/LanguageContext';

interface AccessibilityPanelProps {
  open: boolean;
  onClose: () => void;
}

export const AccessibilityPanel: React.FC<AccessibilityPanelProps> = ({ open, onClose }) => {
  const { t } = useLanguage();
  const {
    theme,
    textScale,
    highContrast,
    reducedMotion,
    setTheme,
    setTextScale,
    setHighContrast,
    setReducedMotion,
    resetPreferences
  } = useAccessibility();
  const panelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    const focusable = panelRef.current?.querySelectorAll<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );

    focusable?.[0]?.focus();
    window.addEventListener('keydown', handleKeyDown);

    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/55 p-4 backdrop-blur-sm" aria-modal="true" role="dialog" aria-labelledby="accessibility-panel-title">
      <div ref={panelRef} className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-blue-700">SchoolCare</p>
            <h2 id="accessibility-panel-title" className="text-lg font-black text-slate-900">{t('accessibilityTitle')}</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t('closeAccessibilityPanel')}
            className="rounded-lg p-2 text-slate-500 transition hover:bg-slate-100 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-5 p-5">
          <div>
            <div className="mb-2 flex items-center gap-2 text-sm font-bold text-slate-800">
              <Type className="h-4 w-4 text-blue-700" />
              <span>{t('textSize')}</span>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {[
                { value: 'normal', label: t('textSizeNormal') },
                { value: 'large', label: t('textSizeLarge') },
                { value: 'extra-large', label: t('textSizeExtraLarge') }
              ].map(({ value, label }) => {
                const selected = textScale === value;
                return (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setTextScale(value as typeof textScale)}
                    className={`rounded-xl border px-3 py-2 text-sm font-semibold transition ${
                      selected
                        ? 'border-blue-600 bg-blue-50 text-blue-800'
                        : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                    }`}
                    aria-pressed={selected}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <div className="mb-2 flex items-center gap-2 text-sm font-bold text-slate-800">
              <Contrast className="h-4 w-4 text-blue-700" />
              <span>{t('contrastMode')}</span>
            </div>
            <button
              type="button"
              onClick={() => setHighContrast(!highContrast)}
              aria-pressed={highContrast}
              className={`flex w-full items-center justify-between rounded-xl border px-3 py-2.5 text-sm font-semibold ${
                highContrast ? 'border-amber-500 bg-amber-50 text-amber-900' : 'border-slate-200 bg-white text-slate-700'
              }`}
            >
              <span>{t('contrastMode')}</span>
              <span className="rounded-full border px-1.5 py-0.5 text-[10px] uppercase tracking-wide">
                {highContrast ? 'On' : 'Off'}
              </span>
            </button>
          </div>

          <div>
            <div className="mb-2 flex items-center gap-2 text-sm font-bold text-slate-800">
              <MonitorSmartphone className="h-4 w-4 text-blue-700" />
              <span>{t('theme')}</span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setTheme('light')}
                aria-pressed={theme === 'light'}
                className={`flex items-center justify-center gap-2 rounded-xl border px-3 py-2 text-sm font-semibold ${
                  theme === 'light' ? 'border-blue-600 bg-blue-50 text-blue-800' : 'border-slate-200 bg-white text-slate-700'
                }`}
              >
                <SunMedium className="h-4 w-4" />
                {t('themeLight')}
              </button>
              <button
                type="button"
                onClick={() => setTheme('dark')}
                aria-pressed={theme === 'dark'}
                className={`flex items-center justify-center gap-2 rounded-xl border px-3 py-2 text-sm font-semibold ${
                  theme === 'dark' ? 'border-blue-600 bg-blue-50 text-blue-800' : 'border-slate-200 bg-white text-slate-700'
                }`}
              >
                <Moon className="h-4 w-4" />
                {t('themeDark')}
              </button>
            </div>
          </div>

          <div className="space-y-2 rounded-xl border border-slate-200 bg-slate-50 p-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm font-bold text-slate-800">
                <Zap className="h-4 w-4 text-blue-700" />
                <span>{t('reduceMotion')}</span>
              </div>
              <button
                type="button"
                onClick={() => setReducedMotion(!reducedMotion)}
                aria-pressed={reducedMotion}
                className={`relative h-6 w-11 rounded-full transition ${reducedMotion ? 'bg-blue-600' : 'bg-slate-300'}`}
                aria-label={t('reduceMotion')}
              >
                <span
                  className={`absolute top-1 h-4 w-4 rounded-full bg-white transition ${reducedMotion ? 'left-6' : 'left-1'}`}
                />
              </button>
            </div>

            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm font-bold text-slate-800">
                <Keyboard className="h-4 w-4 text-blue-700" />
                <span>{t('keyboardNavigation')}</span>
              </div>
              <span className="rounded-full bg-slate-200 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-slate-700">
                Tab
              </span>
            </div>
          </div>

          <div className="flex justify-end gap-2 border-t border-slate-200 pt-4">
            <button
              type="button"
              onClick={resetPreferences}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
            >
              <RotateCcw className="h-4 w-4" />
              {t('resetDefaults')}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-bold text-white transition hover:bg-blue-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
            >
              {t('close')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
