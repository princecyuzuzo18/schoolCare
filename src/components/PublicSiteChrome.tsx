import React, { useEffect, useState } from 'react';
import { ArrowRight, Mail, MapPin, Menu, Phone, X } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useAdmissionsCopy } from '../i18n/admissions';
import { useLanguage } from '../i18n/LanguageContext';
import { PublicPageBackground } from './PublicPageBackground';

interface PublicSiteHeaderProps {
  active?: 'home' | 'apply' | 'track' | 'about' | 'academics' | 'news' | 'gallery' | 'contact';
  onNavigate: (target: string) => void;
}

const NAV_ITEMS: Array<{ id: PublicSiteHeaderProps['active']; label: string; target: string }> = [
  { id: 'home', label: 'Home', target: 'home' },
  { id: 'about', label: 'About Us', target: 'about' },
  { id: 'academics', label: 'Academics', target: 'academics' },
  { id: 'news', label: 'News & Events', target: 'news' },
  { id: 'gallery', label: 'Gallery', target: 'gallery' },
  { id: 'contact', label: 'Contact', target: 'contact' }
];

export const PublicSiteHeader: React.FC<PublicSiteHeaderProps> = ({ active, onNavigate }) => {
  const copy = useAdmissionsCopy();
  const { toggleLanguage, t: translate } = useLanguage();
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    if (!mobileOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setMobileOpen(false); };
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    document.addEventListener('keydown', onKey);
    return () => { document.body.style.overflow = prev; document.removeEventListener('keydown', onKey); };
  }, [mobileOpen]);

  const go = (target: string) => {
    setMobileOpen(false);
    onNavigate(target);
  };

  const navBtnClass = (id: PublicSiteHeaderProps['active']) =>
    `public-nav-link ${active === id ? 'is-active' : ''}`;

  return (
    <header className="public-site-header">
      <div className="public-site-shell flex h-[4.5rem] items-center justify-between gap-3">
        <button
          type="button"
          onClick={() => go('home')}
          className="group flex min-w-0 items-center gap-3 text-left"
          aria-label="ES RUBENGERA RTB home"
        >
          <span className="public-logo-tile">
            <img src="/images/school-logo.png" alt="ES Rubengera Secondary School official logo" className="h-full w-full bg-white object-contain p-1" />
          </span>
          <span className="min-w-0 leading-tight">
            <span className="block truncate text-base font-bold tracking-tight text-white">ES RUBENGERA RTB</span>
            <span className="block truncate text-[10px] font-bold uppercase tracking-[0.18em] text-[#E8C97F]">
              Secondary &amp; Technical TVET
            </span>
          </span>
        </button>

        <nav aria-label="Public navigation" className="hidden items-center gap-1 xl:flex">
          {NAV_ITEMS.map(item => (
            <button key={item.id} type="button" onClick={() => go(item.target)} className={navBtnClass(item.id)}>
              {item.label}
            </button>
          ))}
        </nav>

        <div className="hidden shrink-0 items-center gap-2 lg:flex">
          <button type="button" onClick={toggleLanguage} className="public-chip" aria-label={translate('switchLanguage')}>
            {translate('switchLanguage')}
          </button>
          <button type="button" onClick={() => go('track')} className={`public-chip ${active === 'track' ? 'is-active' : ''}`}>
            {copy.trackApplication}
          </button>
          <button type="button" onClick={() => go('apply')} className="public-primary-btn px-4 py-2.5 text-sm">
            {copy.applyHere}
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        <button
          type="button"
          className="grid h-11 w-11 place-items-center rounded-xl border border-white/20 bg-white/10 text-white lg:hidden"
          onClick={() => setMobileOpen(v => !v)}
          aria-expanded={mobileOpen}
          aria-controls="public-mobile-nav"
          aria-label={mobileOpen ? 'Close navigation menu' : 'Open navigation menu'}
        >
          {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </div>

      {mobileOpen && (
        <nav id="public-mobile-nav" aria-label="Mobile public navigation" className="border-t border-white/10 bg-[#062147]/95 px-4 pb-5 pt-3 backdrop-blur-xl lg:hidden">
          <div className="mx-auto flex max-w-xl flex-col gap-1">
            {NAV_ITEMS.map(item => (
              <button key={item.id} type="button" onClick={() => go(item.target)} className={`public-mobile-link ${active === item.id ? 'is-active' : ''}`}>
                {item.label}
              </button>
            ))}
            <div className="mt-3 grid grid-cols-2 gap-2">
              <button type="button" onClick={() => go('track')} className="public-chip justify-center py-3">{copy.trackApplication}</button>
              <button type="button" onClick={toggleLanguage} className="public-chip justify-center py-3">{translate('switchLanguage')}</button>
            </div>
            <button type="button" onClick={() => go('apply')} className="public-primary-btn mt-1 justify-center px-4 py-3 text-sm">
              {copy.applyHere} <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        </nav>
      )}
    </header>
  );
};

export const PublicSiteFooter: React.FC<{ onNavigate: (target: string) => void }> = ({ onNavigate }) => {
  const copy = useAdmissionsCopy();
  const { school } = useAuth();
  const schoolName = school?.name || 'ES RUBENGERA RTB';
  const schoolEmail = school?.email || 'info@esrubengera.rw';
  const schoolPhone = school?.phone || '+250 788 340 120';
  const address = [school?.sector, school?.district, school?.province, school?.country].filter(Boolean).join(', ') || 'Rubengera, Karongi District, Western Province, Rwanda';

  return (
    <footer className="public-site-footer mt-auto">
      <div className="public-site-shell grid gap-8 py-10 sm:grid-cols-2 lg:grid-cols-[1.3fr_1fr_1fr_1.1fr]">
        <div>
          <div className="flex items-center gap-3">
            <span className="public-logo-tile h-11 w-11">
              <img src="/images/school-logo.png" alt="ES Rubengera Secondary School official logo" className="h-full w-full bg-white object-contain p-1" />
            </span>
            <div>
              <p className="text-base font-bold tracking-tight text-white">{schoolName}</p>
              <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#E8C97F]">Secondary &amp; Technical TVET</p>
            </div>
          </div>
          <p className="mt-4 max-w-sm text-sm leading-7 text-[#B9CEC6]">
            A secondary and technical TVET school in Rubengera, Karongi District, Rwanda.
          </p>
        </div>

        <div>
          <p className="public-footer-heading">Quick Links</p>
          <ul className="mt-4 space-y-2.5 text-sm text-[#C7D8D2]">
            {[['home', 'Home'], ['about', 'About Us'], ['academics', 'Academics'], ['news', 'News & Events'], ['gallery', 'Gallery'], ['contact', 'Contact']].map(([target, label]) => (
              <li key={target}><button type="button" onClick={() => onNavigate(target)} className="hover:text-white">{label}</button></li>
            ))}
          </ul>
        </div>

        <div>
          <p className="public-footer-heading">Admissions</p>
          <ul className="mt-4 space-y-2.5 text-sm text-[#C7D8D2]">
            <li><button type="button" onClick={() => onNavigate('apply')} className="font-semibold text-[#E8C97F] hover:text-white">{copy.applyHere}</button></li>
            <li><button type="button" onClick={() => onNavigate('track')} className="hover:text-white">{copy.trackApplication}</button></li>
            <li><a href="/portal#/login" className="hover:text-white">Staff / Portal Login</a></li>
          </ul>
        </div>

        <div>
          <p className="public-footer-heading">Contact</p>
          <div className="mt-4 space-y-3 text-sm text-[#C7D8D2]">
            <p className="flex items-start gap-2"><MapPin className="mt-0.5 h-4 w-4 shrink-0 text-[#E8C97F]" aria-hidden="true" />{address}</p>
            <p className="flex items-center gap-2"><Phone className="h-4 w-4 shrink-0 text-[#E8C97F]" aria-hidden="true" /><a href={`tel:${schoolPhone.replace(/\s+/g, '')}`} className="hover:text-white">{schoolPhone}</a></p>
            <p className="flex items-center gap-2 break-all"><Mail className="h-4 w-4 shrink-0 text-[#E8C97F]" aria-hidden="true" /><a href={`mailto:${schoolEmail}`} className="hover:text-white">{schoolEmail}</a></p>
          </div>
        </div>
      </div>
      <div className="public-site-shell border-t border-white/10 py-5 text-[11px] text-[#8FAAA0]">
        © 2026 {schoolName}. All rights reserved. <span className="ml-2 text-[#6F8C82]">Ubumenyi, Umurimo, Ubupfura.</span>
      </div>
    </footer>
  );
};

interface PublicLayoutProps {
  active?: PublicSiteHeaderProps['active'];
  onNavigate: (target: string) => void;
  children: React.ReactNode;
  mainClassName?: string;
}

export const PublicLayout: React.FC<PublicLayoutProps> = ({ active, onNavigate, children, mainClassName = '' }) => {
  return (
    <PublicPageBackground>
      <PublicSiteHeader active={active} onNavigate={onNavigate} />
      <main className={`flex-1 ${mainClassName}`.trim()}>{children}</main>
      <PublicSiteFooter onNavigate={onNavigate} />
    </PublicPageBackground>
  );
};
