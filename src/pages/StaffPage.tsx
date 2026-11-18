import React, { useEffect, useState } from 'react';
import { StaffMember } from '../types';
import { api } from '../services/api';
import { useLanguage } from '../i18n/LanguageContext';
import {
  Briefcase,
  Search,
  PhoneCall,
  Mail,
  GraduationCap,
  Building,
  CheckCircle2
} from 'lucide-react';

export const StaffPage: React.FC = () => {
  const { t } = useLanguage();
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true);
        const data = await api.getStaff();
        setStaff(data);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const filtered = staff.filter(s => {
    if (!search) return true;
    const q = search.toLowerCase();
    return s.fullName.toLowerCase().includes(q) || s.department.toLowerCase().includes(q) || s.title.toLowerCase().includes(q);
  });

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto space-y-6">
      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs">
        <div className="flex items-center gap-2">
          <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-blue-100 text-blue-800 flex items-center gap-1">
            <Briefcase className="w-3.5 h-3.5" />
            <span>Academic Faculty & Staff</span>
          </span>
          <span className="text-xs text-slate-500">ES RUBENGERA RTB</span>
        </div>
        <h1 className="text-2xl font-black text-slate-900 mt-1">{t('navStaff')}</h1>
        <p className="text-xs text-slate-500 mt-0.5">
          Instructors, School Nurse, Administrators & Technical TVET trainers
        </p>
      </div>

      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex items-center gap-3">
        <div className="relative w-full max-w-sm">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search faculty by name, department, title..."
            className="w-full pl-9 pr-3 py-2 rounded-xl border border-slate-200 text-xs text-slate-800 focus:ring-2 focus:ring-blue-500"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {filtered.map(stf => (
          <div key={stf.id} className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs space-y-4">
            <div className="flex items-start justify-between">
              <div>
                <span className="font-mono text-[10px] font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded">
                  {stf.staffId}
                </span>
                <h3 className="text-base font-bold text-slate-900 mt-1.5">{stf.fullName}</h3>
                <p className="text-xs font-semibold text-blue-600">{stf.title}</p>
                <p className="text-[11px] text-slate-500">{stf.department}</p>
              </div>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800">
                {stf.status}
              </span>
            </div>

            <div className="space-y-1.5 text-xs text-slate-600 border-t border-slate-100 pt-3">
              <div className="flex items-center gap-2">
                <PhoneCall className="w-3.5 h-3.5 text-blue-600" />
                <span className="font-mono font-bold text-slate-800">{stf.phone}</span>
              </div>
              <div className="flex items-center gap-2">
                <Mail className="w-3.5 h-3.5 text-blue-600" />
                <span className="truncate">{stf.email}</span>
              </div>
            </div>

            {stf.assignedClasses && stf.assignedClasses.length > 0 && (
              <div className="pt-2 border-t border-slate-100 text-[11px]">
                <span className="text-slate-500 font-semibold">Assigned Classes: </span>
                <span className="font-bold text-slate-800">{stf.assignedClasses.join(', ')}</span>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};
