import React, { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../i18n/LanguageContext';
import { AccessibilityPanel } from './AccessibilityPanel';
import {
  Globe,
  Bell,
  HeartPulse,
  Sparkles,
  LogOut,
  Settings2
} from 'lucide-react';

interface HeaderProps {
  currentTab: string;
  onNavigate: (tab: string) => void;
  urgentIncidentCount: number;
}

export const Header: React.FC<HeaderProps> = ({ currentTab, onNavigate, urgentIncidentCount }) => {
  const { currentUser, role, school, logout } = useAuth();
  const { language, toggleLanguage, t } = useLanguage();
  const [isAccessibilityOpen, setIsAccessibilityOpen] = useState(false);

  return (
    <>
      <header className="sticky top-0 z-40 brand-gradient text-white shadow-md border-b border-white/10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex h-16 items-center justify-between gap-2">
            <div className="flex items-center gap-3 cursor-pointer" onClick={() => onNavigate('landing')}>
              <div className="h-10 w-10 overflow-hidden rounded-xl bg-white ring-1 ring-white/15 shadow-inner">
                <img
                  src="/images/school-logo.png"
                  alt="ES Rubengera Secondary School official logo"
                  className="h-full w-full object-contain bg-white p-1"
                />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-bold text-lg tracking-tight text-white">SchoolCare</span>
                  <span className="hidden sm:inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                    {school?.code || 'ESR-RTB-RW'}
                  </span>
                </div>
                <p className="text-[11px] text-blue-200 hidden md:block">
                  {t('appTagline')}
                </p>
              </div>
            </div>

            <div className="hidden lg:flex items-center gap-2 bg-blue-950/60 px-3 py-1.5 rounded-lg border border-blue-800/50">
              <span className="text-xs font-semibold text-blue-100">{school?.name || 'ES RUBENGERA RTB'}</span>
              <span className="text-[11px] text-blue-300">({school?.district || 'Karongi'}, Rwanda)</span>
            </div>

            <div className="flex flex-wrap items-center justify-end gap-2 sm:gap-3">
              {urgentIncidentCount > 0 && (
                <button
                  onClick={() => onNavigate(role === 'PARENT' ? 'parent-portal' : 'health')}
                  className="relative hidden sm:flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-red-500 hover:bg-red-400 text-white text-xs font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
                  title="Active Urgent Health Case"
                >
                  <HeartPulse className="w-4 h-4" />
                  <span className="hidden sm:inline">{urgentIncidentCount} Urgent Alert</span>
                </button>
              )}

              <button
                type="button"
                onClick={() => setIsAccessibilityOpen(true)}
                aria-label={t('openAccessibilityPanel')}
                className="flex items-center gap-1.5 rounded-lg bg-white/5 px-2.5 py-1.5 text-xs font-medium text-blue-100 border border-white/10 transition-colors hover:bg-white/10"
              >
                <Settings2 className="w-3.5 h-3.5 text-blue-300" />
                <span className="hidden sm:inline">{t('accessibilitySettings')}</span>
              </button>

              <button
                type="button"
                onClick={toggleLanguage}
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-xs font-medium text-blue-100 border border-white/10 transition-colors"
                aria-label={language === 'en' ? 'Switch to Kinyarwanda' : 'Switch to English'}
                title="Switch Language (Ikinyarwanda / English)"
              >
                <Globe className="w-3.5 h-3.5 text-blue-300" />
                <span>{language === 'en' ? 'RW' : 'EN'}</span>
              </button>

              <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white/10 text-white text-xs font-semibold shadow-sm border border-white/10">
                <Sparkles className="w-3.5 h-3.5 text-amber-300" />
                <span className="hidden sm:inline">{t(`role_${role}` as any) || role}</span>
                <span className="sm:hidden">Role</span>
              </div>

              <div className="flex items-center gap-2 pl-1 border-l border-blue-800/60">
                {currentUser?.avatarUrl ? (
                  <img
                    src={currentUser.avatarUrl}
                    alt={currentUser.fullName}
                    className="w-8 h-8 rounded-full object-cover border border-blue-400"
                  />
                ) : (
                  <div className="w-8 h-8 rounded-full bg-blue-700 flex items-center justify-center text-xs font-bold text-white">
                    {currentUser?.fullName?.charAt(0) || 'U'}
                  </div>
                )}
                <div className="hidden xl:block text-left">
                  <p className="text-xs font-semibold leading-tight text-white">{currentUser?.fullName}</p>
                  <p className="text-[10px] text-blue-200">{school?.name ?? t('schoolName')}</p>
                  <p className="text-[10px] text-blue-300">{currentUser?.phone}</p>
                </div>
                {currentUser && (
                  <button
                    type="button"
                    onClick={() => {
                      void logout().catch(error => {
                        console.error('Failed to sign out:', error);
                        window.alert(t('authLogoutError'));
                      });
                    }}
                    aria-label={t('navLogout')}
                    className="ml-1 rounded-lg border border-white/10 bg-white/5 p-2 text-blue-100 transition hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
                  >
                    <LogOut className="h-4 w-4" />
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      </header>

      <AccessibilityPanel open={isAccessibilityOpen} onClose={() => setIsAccessibilityOpen(false)} />
    </>
  );
};
