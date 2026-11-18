import React from 'react';
import { HealthIncident } from '../types';
import { AlertTriangle, PhoneCall, CheckCircle, ArrowRight } from 'lucide-react';
import { useLanguage } from '../i18n/LanguageContext';
import { useAuth } from '../contexts/AuthContext';

interface EmergencyBannerProps {
  incidents: HealthIncident[];
  onOpenIncident: (incident: HealthIncident) => void;
  onAcknowledge?: (incidentId: string) => void;
}

export const EmergencyBanner: React.FC<EmergencyBannerProps> = ({
  incidents,
  onOpenIncident,
  onAcknowledge
}) => {
  const { t } = useLanguage();
  const { role } = useAuth();

  const urgentCases = incidents.filter(i => !i.resolved && (i.priority === 'URGENT' || i.priority === 'EMERGENCY'));

  if (urgentCases.length === 0) return null;

  const current = urgentCases[0];

  return (
    <div className="bg-gradient-to-r from-rose-700 to-red-700 text-white shadow-sm border-b border-red-800/50">
      <div className="max-w-7xl mx-auto px-4 py-3 sm:px-6 lg:px-8">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="flex h-3 w-3 relative">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-75"></span>
              <span className="relative inline-flex rounded-full h-3 w-3 bg-white"></span>
            </span>
            <div className="flex min-w-0 items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-amber-200 shrink-0" />
              <div>
              <span className="text-[10px] sm:text-xs font-bold uppercase tracking-wider bg-white/15 px-2 py-1 rounded-md">
                  {current.priority}: {current.referenceNumber}
                </span>
              <span className="block sm:inline sm:ml-2 mt-1 sm:mt-0 text-xs font-medium leading-relaxed text-red-50">
                  {current.studentName} ({current.studentClass}) — {current.symptoms}
                </span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
            <span className="text-[11px] text-amber-100 hidden md:inline">
              Guardian: {current.guardianName} ({current.contactStatus})
            </span>

            {role === 'PARENT' && !current.parentAcknowledged && onAcknowledge && (
              <button
                onClick={() => onAcknowledge(current.id)}
                className="px-3 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-white text-xs font-bold shadow-md transition flex items-center gap-1.5"
              >
                <CheckCircle className="w-3.5 h-3.5" />
                <span>{t('acknowledgeAlert')}</span>
              </button>
            )}

            <button
              onClick={() => onOpenIncident(current)}
              className="px-3 py-1.5 rounded-lg bg-white text-red-900 hover:bg-red-50 text-xs font-bold transition flex items-center gap-1"
            >
              <span>{t('view')}</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
