import React, { useEffect, useState } from 'react';
import { AuditLogEntry } from '../types';
import { api } from '../services/api';
import { useLanguage } from '../i18n/LanguageContext';
import {
  ShieldAlert,
  Search,
  Filter,
  CheckCircle2,
  Lock,
  ShieldCheck,
  Clock,
  Terminal
} from 'lucide-react';

export const AuditPage: React.FC = () => {
  const { t } = useLanguage();
  const [logs, setLogs] = useState<AuditLogEntry[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true);
        const data = await api.getAuditLogs();
        setLogs(data);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const filtered = logs.filter(l => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      l.action.toLowerCase().includes(q) ||
      l.userName.toLowerCase().includes(q) ||
      l.details.toLowerCase().includes(q) ||
      l.entityType.toLowerCase().includes(q)
    );
  });

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs">
        <div className="flex items-center gap-2">
          <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-slate-900 text-white flex items-center gap-1">
            <Lock className="w-3.5 h-3.5 text-emerald-400" />
            <span>Append-only Audit Trail & Security Center</span>
          </span>
          <span className="text-xs text-slate-500">Law No 058/2021 (Rwanda Data Protection)</span>
        </div>
        <h1 className="text-2xl font-black text-slate-900 mt-1">{t('navAudit')}</h1>
        <p className="text-xs text-slate-500 mt-0.5">
          Real-time activity logs, role permission validation, health privacy safeguards & tenant isolation checks
        </p>
      </div>

      {/* Compliance & Security Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-slate-900 text-white p-5 rounded-2xl border border-slate-800 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase text-slate-400">MariaDB Isolation</span>
            <ShieldCheck className="w-5 h-5 text-emerald-400" />
          </div>
          <p className="text-lg font-black text-white mt-2">Active (InnoDB Enforced)</p>
          <p className="text-xs text-slate-400 mt-1">Tenant key: school-es-rubengera-01</p>
        </div>

        <div className="bg-slate-900 text-white p-5 rounded-2xl border border-slate-800 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase text-slate-400">Health Privacy Protection</span>
            <Lock className="w-5 h-5 text-blue-400" />
          </div>
          <p className="text-lg font-black text-white mt-2">Restricted Access</p>
          <p className="text-xs text-slate-400 mt-1">Nurses, Head Teacher & verified parents only</p>
        </div>

        <div className="bg-slate-900 text-white p-5 rounded-2xl border border-slate-800 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase text-slate-400">Financial Audit Log</span>
            <ShieldAlert className="w-5 h-5 text-amber-400" />
          </div>
          <p className="text-lg font-black text-white mt-2">Zero Tampering</p>
          <p className="text-xs text-slate-400 mt-1">Append-only receipt & callback verification</p>
        </div>
      </div>

      {/* Search Bar */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex items-center gap-3">
        <div className="relative w-full max-w-sm">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search action, actor, entity..."
            className="w-full pl-9 pr-3 py-2 rounded-xl border border-slate-200 text-xs text-slate-800 focus:ring-2 focus:ring-blue-500"
          />
        </div>
      </div>

      {/* Audit Log Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 uppercase tracking-wider font-bold">
              <tr>
                <th className="py-3 px-4">Timestamp</th>
                <th className="py-3 px-4">Action</th>
                <th className="py-3 px-4">Actor & Role</th>
                <th className="py-3 px-4">Entity</th>
                <th className="py-3 px-4">Audit Details</th>
                <th className="py-3 px-4">IP Address</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-mono text-[11px]">
              {filtered.map(log => (
                <tr key={log.id} className="hover:bg-slate-50 transition">
                  <td className="py-3 px-4 text-slate-500 font-medium">
                    {new Date(log.timestamp).toLocaleString()}
                  </td>
                  <td className="py-3 px-4 font-bold text-blue-700">
                    <span className="bg-blue-50 px-2 py-0.5 rounded text-[10px] font-mono">
                      {log.action}
                    </span>
                  </td>
                  <td className="py-3 px-4 font-sans">
                    <p className="font-bold text-slate-900">{log.userName}</p>
                    <p className="text-[10px] text-slate-500">{log.userRole}</p>
                  </td>
                  <td className="py-3 px-4 font-semibold text-slate-700">
                    {log.entityType} ({log.entityId.slice(0, 12)}...)
                  </td>
                  <td className="py-3 px-4 font-sans text-slate-700 max-w-sm">
                    {log.details}
                  </td>
                  <td className="py-3 px-4 text-slate-500">
                    {log.ipAddress}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
