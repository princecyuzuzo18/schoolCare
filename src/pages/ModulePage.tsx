import React from 'react';
import { useLanguage } from '../i18n/LanguageContext';

interface ModulePageProps {
  title: string;
  description?: string;
}

export const ModulePage: React.FC<ModulePageProps> = ({ title, description }) => {
  const { t } = useLanguage();
  return (
    <div className="p-6 md:p-8 max-w-6xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-[#102B50]">{title}</h1>
        {description && <p className="text-sm text-slate-500 mt-1">{description}</p>}
      </div>
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-8 text-center">
        <p className="text-slate-500 text-sm">
          {t('comingSoon') || 'This module is being set up. Functionality will be available soon.'}
        </p>
      </div>
    </div>
  );
};
