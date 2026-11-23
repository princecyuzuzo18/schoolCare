import React, { useEffect, useState } from 'react';
import { HealthIncident, IncidentPriority, Student, Guardian } from '../types';
import { api } from '../services/api';
import { useLanguage } from '../i18n/LanguageContext';
import { useAuth } from '../contexts/AuthContext';
import { HealthIncidentModal } from '../components/HealthIncidentModal';
import {
  HeartPulse,
  AlertTriangle,
  Plus,
  PhoneCall,
  CheckCircle2,
  Clock,
  Building,
  ShieldCheck,
  Search,
  Filter
} from 'lucide-react';

export const HealthCenterPage: React.FC = () => {
  const { t } = useLanguage();
  const { role } = useAuth();

  const [incidents, setIncidents] = useState<HealthIncident[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [guardians, setGuardians] = useState<Guardian[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterPriority, setFilterPriority] = useState<string>('all');
  const [search, setSearch] = useState('');
  const [selectedIncident, setSelectedIncident] = useState<HealthIncident | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  const loadData = async () => {
    try {
      setLoading(true);
      const [incData, stuData, grdData] = await Promise.all([
        api.getHealthIncidents(),
        api.getStudents(),
        api.getGuardians()
      ]);
      setIncidents(incData);
      setStudents(stuData);
      setGuardians(grdData);
    } catch (err) {
      console.error('Failed to load health incidents:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const filtered = incidents.filter(inc => {
    if (filterPriority !== 'all' && inc.priority !== filterPriority) return false;
    if (search) {
      const q = search.toLowerCase();
      return (
        inc.studentName.toLowerCase().includes(q) ||
        inc.referenceNumber.toLowerCase().includes(q) ||
        inc.symptoms.toLowerCase().includes(q) ||
        inc.guardianName.toLowerCase().includes(q)
      );
    }
    return true;
  });

  const urgentCount = incidents.filter(i => !i.resolved && (i.priority === 'URGENT' || i.priority === 'EMERGENCY')).length;
  const hospitalCount = incidents.filter(i => i.outcome === 'REFERRED_TO_HOSPITAL').length;
  const acknowledgedCount = incidents.filter(i => i.parentAcknowledged).length;
  const acknowledgmentRate = incidents.length > 0
    ? Math.round((acknowledgedCount / incidents.length) * 100)
    : 0;

  const handleOpenNew = () => {
    setSelectedIncident(null);
    setIsModalOpen(true);
  };

  const handleOpenExisting = (inc: HealthIncident) => {
    setSelectedIncident(inc);
    setIsModalOpen(true);
  };

  const handleSaved = (inc: HealthIncident) => {
    setIsModalOpen(false);
    loadData();
  };

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-6 rounded-2xl border border-slate-200 shadow-xs">
        <div>
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-red-100 text-red-800 flex items-center gap-1">
              <HeartPulse className="w-3.5 h-3.5" />
              <span>Infirmary Care Center</span>
            </span>
            <span className="text-xs text-slate-500">ES RUBENGERA RTB</span>
          </div>
          <h1 className="text-2xl font-black text-slate-900 mt-1">{t('healthTitle')}</h1>
          <p className="text-xs text-slate-500 mt-0.5">{t('healthSubtitle')}</p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={handleOpenNew}
            className="px-4 py-2.5 rounded-xl bg-red-600 hover:bg-red-700 text-white font-bold text-xs shadow-md transition flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            <span>{t('reportIncident')}</span>
          </button>
        </div>
      </div>

      {/* Triage & Protocol KPI Bar */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-red-50/80 border border-red-200 p-5 rounded-2xl">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase text-red-800 tracking-wider">Active Urgent Cases</span>
            <AlertTriangle className="w-5 h-5 text-red-600 animate-pulse" />
          </div>
          <p className="text-3xl font-black text-red-950 mt-2">{urgentCount}</p>
          <p className="text-xs text-red-700 mt-1">Requiring immediate guardian contact / triage</p>
        </div>

        <div className="bg-blue-50/80 border border-blue-200 p-5 rounded-2xl">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase text-blue-800 tracking-wider">Hospital Referrals</span>
            <Building className="w-5 h-5 text-blue-600" />
          </div>
          <p className="text-3xl font-black text-blue-950 mt-2">{hospitalCount}</p>
          <p className="text-xs text-blue-700 mt-1">To Rubengera Health Center or Kibuye Hospital</p>
        </div>

        <div className="bg-emerald-50/80 border border-emerald-200 p-5 rounded-2xl">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase text-emerald-800 tracking-wider">Parent Acknowledgment Rate</span>
            <CheckCircle2 className="w-5 h-5 text-emerald-600" />
          </div>
          <p className="text-3xl font-black text-emerald-950 mt-2">{acknowledgmentRate}%</p>
          <p className="text-xs text-emerald-700 mt-1">Acknowledgments recorded in school records ({acknowledgedCount}/{incidents.length})</p>
        </div>
      </div>

      {/* Search & Filters */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex flex-col sm:flex-row items-center justify-between gap-3">
        <div className="relative w-full sm:w-80">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder={t('search')}
            className="w-full pl-9 pr-3 py-2 rounded-xl border border-slate-200 text-xs text-slate-800 focus:outline-hidden focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          <Filter className="w-4 h-4 text-slate-400 shrink-0" />
          <span className="text-xs font-semibold text-slate-600">{t('filter')}:</span>
          <select
            value={filterPriority}
            onChange={e => setFilterPriority(e.target.value)}
            className="px-3 py-1.5 rounded-xl border border-slate-200 text-xs font-semibold text-slate-700 bg-white"
          >
            <option value="all">All Priorities ({incidents.length})</option>
            <option value="EMERGENCY">Emergency (Ikibi Cyihutirwa)</option>
            <option value="URGENT">Urgent (Byihutirwa)</option>
            <option value="ROUTINE">Routine (Bisanzwe)</option>
          </select>
        </div>
      </div>

      {/* Incidents Table & List */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 uppercase tracking-wider font-bold">
              <tr>
                <th className="py-3 px-4">Ref #</th>
                <th className="py-3 px-4">Student & Class</th>
                <th className="py-3 px-4">Priority / Category</th>
                <th className="py-3 px-4">Symptoms & Vitals</th>
                <th className="py-3 px-4">Guardian Contact</th>
                <th className="py-3 px-4">Outcome</th>
                <th className="py-3 px-4 text-right">{t('actions')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.map(inc => (
                <tr
                  key={inc.id}
                  onClick={() => handleOpenExisting(inc)}
                  className={`hover:bg-blue-50/50 cursor-pointer transition ${
                    inc.priority === 'URGENT' || inc.priority === 'EMERGENCY' ? 'bg-red-50/30' : ''
                  }`}
                >
                  <td className="py-3 px-4 font-mono font-bold text-slate-800">
                    {inc.referenceNumber}
                  </td>
                  <td className="py-3 px-4">
                    <p className="font-bold text-slate-900">{inc.studentName}</p>
                    <p className="text-[11px] text-slate-500">{inc.studentClass}</p>
                  </td>
                  <td className="py-3 px-4">
                    <span
                      className={`inline-block px-2.5 py-0.5 rounded-full text-[10px] font-extrabold ${
                        inc.priority === 'EMERGENCY' || inc.priority === 'URGENT'
                          ? 'bg-red-600 text-white'
                          : 'bg-blue-100 text-blue-800'
                      }`}
                    >
                      {inc.priority}
                    </span>
                    <p className="text-[10px] text-slate-600 mt-0.5">{inc.category}</p>
                  </td>
                  <td className="py-3 px-4 max-w-xs">
                    <p className="truncate font-medium text-slate-800">{inc.symptoms}</p>
                    <p className="text-[10px] text-slate-600 mt-0.5">
                      Temp: {inc.temperature || 'N/A'} • Pulse: {inc.pulse || 'N/A'}
                    </p>
                  </td>
                  <td className="py-3 px-4">
                    <p className="font-semibold text-slate-800">{inc.guardianName}</p>
                    <div className="flex items-center gap-1 mt-0.5">
                      {inc.parentAcknowledged ? (
                        <span className="text-[10px] text-emerald-700 font-bold flex items-center gap-0.5">
                          <CheckCircle2 className="w-3 h-3" /> Acknowledged
                        </span>
                      ) : (
                        <span className="text-[10px] text-amber-700 font-bold flex items-center gap-0.5">
                          <Clock className="w-3 h-3" /> {inc.contactStatus}
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="py-3 px-4">
                    <span className="text-[11px] font-medium text-slate-700 bg-slate-100 px-2 py-0.5 rounded">
                      {inc.outcome.replace(/_/g, ' ')}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-right">
                    <button
                      onClick={e => {
                        e.stopPropagation();
                        handleOpenExisting(inc);
                      }}
                      className="px-2.5 py-1 rounded-lg bg-blue-50 text-blue-700 font-bold hover:bg-blue-100 transition"
                    >
                      {t('view')}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Incident Dossier / Reporting Modal */}
      <HealthIncidentModal
        incident={selectedIncident}
        students={students}
        guardians={guardians}
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSaved={handleSaved}
      />
    </div>
  );
};
