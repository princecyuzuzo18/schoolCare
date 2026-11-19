import React from 'react';
import { ArrowRight, Mail, MapPin, Phone } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useAdmissionsCopy } from '../i18n/admissions';
import { useLanguage } from '../i18n/LanguageContext';

interface PublicAdmissionsHeaderProps {
  onBackHome: () => void;
  onOpenTracking?: () => void;
  showTrackingLink?: boolean;
}

/** Shared public chrome so Apply Here and tracking feel like one admissions site. */
export const PublicAdmissionsHeader: React.FC<PublicAdmissionsHeaderProps> = ({
  onBackHome,
  onOpenTracking,
  showTrackingLink = true
}) => {
  const copy = useAdmissionsCopy();
  const { toggleLanguage, t: translate } = useLanguage();

  return (
    <header className="apply-header">
      <div className="apply-shell flex h-[4.5rem] items-center justify-between gap-3">
        <button
          type="button"
          onClick={onBackHome}
          className="group flex min-w-0 items-center gap-3 text-left"
          aria-label={`${copy.backToSite} — SchoolCare`}
        >
          <span className="apply-logo-tile">
            <img src="/images/school-logo.png" alt="ES Rubengera Secondary School official logo" className="h-full w-full bg-white object-contain p-1" />
          </span>
          <span className="min-w-0 leading-tight">
            <span className="block truncate text-base font-bold tracking-tight text-[#064E3B]">SchoolCare</span>
            <span className="block truncate text-[10px] font-bold uppercase tracking-[0.18em] text-[#8A7A57]">
              {copy.applyPortalLabel}
            </span>
          </span>
        </button>

        <div className="flex shrink-0 items-center gap-2">
          <button type="button" onClick={toggleLanguage} className="apply-chip" aria-label={translate('switchLanguage')}>
            {translate('switchLanguage')}
          </button>
          {showTrackingLink && onOpenTracking && (
            <button type="button" onClick={onOpenTracking} className="apply-chip hidden sm:inline-flex">
              {copy.trackApplication}
              <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          )}
          {showTrackingLink && onOpenTracking && (
            <button
              type="button"
              onClick={onOpenTracking}
              className="apply-chip sm:hidden"
              aria-label={copy.trackApplication}
            >
              {copy.trackApplication}
            </button>
          )}
        </div>
      </div>
    </header>
  );
};

export const PublicAdmissionsFooter: React.FC = () => {
  const copy = useAdmissionsCopy();
  const { school } = useAuth();
  const schoolName = school?.name || 'ES RUBENGERA RTB';
  const schoolEmail = school?.email || 'info@esrubengera.rw';
  const schoolPhone = school?.phone || '+250 788 999 112';
  const address = [school?.sector, school?.district, school?.province]
    .filter(Boolean)
    .join(', ') || 'Rubengera, Karongi, Rwanda';

  return (
    <footer className="apply-footer no-print">
      <div className="apply-shell grid gap-6 py-10 sm:grid-cols-2 lg:grid-cols-[1.4fr_1fr_1fr]">
        <div>
          <p className="text-base font-bold tracking-tight text-white">SchoolCare — {copy.applyPortalLabel}</p>
          <p className="mt-2 max-w-sm text-xs leading-6 text-[#B9CEC6]">{copy.staffOnlyNote}</p>
          <p className="mt-4 inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3 py-1.5 text-[11px] font-bold text-[#E8C97F]">
            {copy.noAccountNeeded}
          </p>
        </div>
        <div className="space-y-2 text-xs text-[#C7D8D2]">
          <p className="flex items-start gap-2">
            <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#E8C97F]" aria-hidden="true" />
            {schoolName} · {address}
          </p>
          <p className="flex items-center gap-2">
            <Phone className="h-3.5 w-3.5 text-[#E8C97F]" aria-hidden="true" />
            <a href={`tel:${schoolPhone.replace(/\s+/g, '')}`} className="hover:text-white">{schoolPhone}</a>
          </p>
        </div>
        <div className="space-y-2 text-xs text-[#C7D8D2]">
          <p className="flex items-center gap-2 break-all">
            <Mail className="h-3.5 w-3.5 text-[#E8C97F]" aria-hidden="true" />
            <a href={`mailto:${schoolEmail}`} className="hover:text-white">{schoolEmail}</a>
          </p>
          <p className="leading-6">{copy.needHelp}</p>
          <p className="leading-6 text-[#8FAAA0]">{copy.needHelpText}</p>
        </div>
      </div>
      <div className="apply-shell border-t border-white/10 py-5 text-[11px] text-[#8FAAA0]">
        © 2026 SchoolCare Rwanda · {schoolName}
      </div>
    </footer>
  );
};
