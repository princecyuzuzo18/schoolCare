import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../i18n/LanguageContext';
import { api } from '../services/api';
import { MysqlStatus } from '../types';
import {
  Settings,
  Building,
  Phone,
  Mail,
  MapPin,
  RefreshCw,
  Save,
  CheckCircle2,
  AlertTriangle,
  Radio,
  Database,
  Download,
  Server,
  ExternalLink,
  Layers,
  HelpCircle,
  Copy,
  Check
} from 'lucide-react';

export const SettingsPage: React.FC = () => {
  const { school, refreshSchool } = useAuth();
  const { t } = useLanguage();

  const [name, setName] = useState(school?.name || 'ES RUBENGERA RTB');
  const [phone, setPhone] = useState(school?.phone || '+250 788 340 120');
  const [emergencyPhone, setEmergencyPhone] = useState(school?.emergencyPhone || '+250 788 999 112');
  const [email, setEmail] = useState(school?.email || 'info@esrubengera.rw');
  const [motto, setMotto] = useState(school?.motto || 'Ubumenyi, Umurimo, Ubupfura');
  const [saving, setSaving] = useState(false);
  const [savedSuccess, setSavedSuccess] = useState(false);

  // MySQL & XAMPP status state
  const [mysqlStatus, setMysqlStatus] = useState<MysqlStatus | null>(null);
  const [loadingMysql, setLoadingMysql] = useState(false);
  const [copiedEnv, setCopiedEnv] = useState(false);

  const fetchMysqlStatus = async () => {
    try {
      setLoadingMysql(true);
      const status = await api.getMysqlStatus();
      setMysqlStatus(status);
    } catch (err) {
      console.error('Failed to load MySQL status:', err);
    } finally {
      setLoadingMysql(false);
    }
  };

  useEffect(() => {
    fetchMysqlStatus();
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!school) return;

    try {
      setSaving(true);
      await api.updateSchool(school.id, {
        name,
        phone,
        emergencyPhone,
        email,
        motto
      });
      await refreshSchool();
      setSavedSuccess(true);
      setTimeout(() => setSavedSuccess(false), 3000);
    } catch (err: any) {
      alert(err.message || 'Failed to update school settings');
    } finally {
      setSaving(false);
    }
  };

  const handleDownloadSql = () => {
    window.location.href = '/api/mysql/export';
  };

  const copyEnvSnippet = () => {
    const snippet = `DB_HOST="localhost"\nDB_PORT="3306"\nDB_USER="root"\nDB_PASSWORD=""\nDB_NAME="schoolcare_db"`;
    navigator.clipboard.writeText(snippet);
    setCopiedEnv(true);
    setTimeout(() => setCopiedEnv(false), 2500);
  };

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs">
        <div className="flex items-center gap-2">
          <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-blue-100 text-blue-800 flex items-center gap-1">
            <Settings className="w-3.5 h-3.5" />
            <span>Institution Settings</span>
          </span>
          <span className="text-xs text-slate-500">School Administration</span>
        </div>
        <h1 className="text-2xl font-black text-slate-900 mt-1">{t('navSettings')}</h1>
        <p className="text-xs text-slate-500 mt-0.5">
          Configure school identity, contact details, emergency telephone hotlines, and MySQL/XAMPP database deployment
        </p>
      </div>

      {/* Main Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* School Profile Form */}
        <div className="lg:col-span-7 bg-white p-6 rounded-2xl border border-slate-200 shadow-xs space-y-4">
          <div className="pb-3 border-b border-slate-100 flex items-center justify-between">
            <div>
              <h3 className="text-sm font-bold text-slate-900">Official School Dossier</h3>
              <p className="text-xs text-slate-500">Public metadata printed on reports and emergency SMS headers</p>
            </div>
            <span className="px-2.5 py-1 rounded-md text-[11px] font-bold bg-slate-100 text-slate-700">
              ESR-RTB-RW
            </span>
          </div>

          <form onSubmit={handleSave} className="space-y-4 text-xs">
            <div>
              <label className="block font-bold text-slate-700 mb-1">Official School Name *</label>
              <input
                type="text"
                value={name}
                onChange={e => setName(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-slate-300 font-bold text-slate-900"
                required
              />
            </div>

            <div>
              <label className="block font-bold text-slate-700 mb-1">Motto / Intego y’Ishuri</label>
              <input
                type="text"
                value={motto}
                onChange={e => setMotto(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-slate-300"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block font-bold text-slate-700 mb-1">General Office Phone *</label>
                <input
                  type="text"
                  value={phone}
                  onChange={e => setPhone(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 font-mono"
                  required
                />
              </div>

              <div>
                <label className="block font-bold text-red-700 mb-1">Emergency Care Hotline *</label>
                <input
                  type="text"
                  value={emergencyPhone}
                  onChange={e => setEmergencyPhone(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-red-300 font-mono font-bold text-red-700"
                  required
                />
              </div>
            </div>

            <div>
              <label className="block font-bold text-slate-700 mb-1">Official Administration Email *</label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-slate-300"
                required
              />
            </div>

            <div className="pt-2">
              <button
                type="submit"
                disabled={saving}
                className="px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs shadow-md transition flex items-center gap-2 cursor-pointer"
              >
                {savedSuccess ? (
                  <>
                    <CheckCircle2 className="w-4 h-4 text-emerald-300" />
                    <span>Saved Successfully</span>
                  </>
                ) : (
                  <>
                    <Save className="w-4 h-4" />
                    <span>{saving ? 'Saving...' : 'Save Settings'}</span>
                  </>
                )}
              </button>
            </div>
          </form>

          {/* Infrastructure Health Cards */}
          <div className="pt-4 border-t border-slate-100">
            <h4 className="font-bold text-slate-800 mb-2 flex items-center gap-1.5">
              <Radio className="w-4 h-4 text-emerald-600" />
              <span>Connected Rwandan Telecom Gateways</span>
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl">
                <div className="flex items-center justify-between mb-1">
                  <span className="font-bold text-slate-800">SMS Gateway</span>
                  <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800">
                    Active
                  </span>
                </div>
                <p className="text-[11px] text-slate-500">
                  MTN Rwanda & Airtel Rwanda with sender ID <strong className="text-slate-700">SchoolCare</strong>
                </p>
              </div>

              <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl">
                <div className="flex items-center justify-between mb-1">
                  <span className="font-bold text-slate-800">WhatsApp Business</span>
                  <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800">
                    Verified
                  </span>
                </div>
                <p className="text-[11px] text-slate-500">
                  Meta Cloud API with delivery callbacks and guardian read receipts
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* MySQL & XAMPP Management Column */}
        <div className="lg:col-span-5 space-y-6">
          {/* XAMPP & MySQL Database Card */}
          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs space-y-4 text-xs">
            <div className="pb-3 border-b border-slate-100 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-orange-100 text-orange-700 flex items-center justify-center font-bold">
                  <Database className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-900">MySQL & XAMPP Database</h3>
                  <p className="text-[11px] text-slate-500">phpMyAdmin & MariaDB Compatible</p>
                </div>
              </div>
              <button
                onClick={fetchMysqlStatus}
                title="Refresh database connection status"
                className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 transition cursor-pointer"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${loadingMysql ? 'animate-spin' : ''}`} />
              </button>
            </div>

            {/* Connection Status Box */}
            <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-bold text-slate-700 flex items-center gap-1.5">
                  <Server className="w-3.5 h-3.5 text-blue-600" />
                  <span>Database Engine</span>
                </span>
                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800">
                  MySQL 5.7+ / 8.0+ / MariaDB
                </span>
              </div>

              <div className="grid grid-cols-2 gap-2 pt-1 border-t border-slate-200 text-[11px]">
                <div>
                  <span className="text-slate-400">Host / Port:</span>{' '}
                  <span className="font-mono font-bold text-slate-800">
                    {mysqlStatus?.host || 'localhost'}:{mysqlStatus?.port || 3306}
                  </span>
                </div>
                <div>
                  <span className="text-slate-400">Database:</span>{' '}
                  <span className="font-mono font-bold text-slate-800">
                    {mysqlStatus?.database || 'schoolcare_db'}
                  </span>
                </div>
                <div>
                  <span className="text-slate-400">User:</span>{' '}
                  <span className="font-mono font-bold text-slate-800">
                    {mysqlStatus?.user || 'root'}
                  </span>
                </div>
                <div>
                  <span className="text-slate-400">Storage:</span>{' '}
                  <span className="font-bold text-blue-700">InnoDB (ACID)</span>
                </div>
              </div>
            </div>

            {/* 1-Click SQL Dump Download */}
            <div className="p-4 rounded-xl bg-blue-50 border border-blue-200 space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-bold text-blue-900 text-xs flex items-center gap-1.5">
                  <Download className="w-4 h-4 text-blue-700" />
                  <span>Download SQL Dump for XAMPP</span>
                </span>
                <span className="text-[10px] font-mono bg-blue-200 text-blue-900 px-1.5 py-0.5 rounded font-bold">
                  .sql (16 tables)
                </span>
              </div>
              <p className="text-[11px] text-blue-800 leading-relaxed">
                Download the complete <strong className="text-blue-950 font-mono">schoolcare_db.sql</strong> schema with all 16 tables, foreign keys, and ES RUBENGERA RTB records for 1-click import into phpMyAdmin.
              </p>
              <button
                onClick={handleDownloadSql}
                className="w-full mt-1 py-2 px-3 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs shadow-xs transition flex items-center justify-center gap-2 cursor-pointer"
              >
                <Download className="w-4 h-4" />
                <span>Download schoolcare_db.sql</span>
              </button>
            </div>

            {/* XAMPP & phpMyAdmin Step-by-Step Instructions */}
            <div className="space-y-2 pt-1">
              <div className="flex items-center justify-between">
                <span className="font-bold text-slate-800 flex items-center gap-1.5">
                  <HelpCircle className="w-3.5 h-3.5 text-slate-500" />
                  <span>How to Import into XAMPP phpMyAdmin</span>
                </span>
                <button
                  onClick={copyEnvSnippet}
                  className="text-[10px] text-blue-600 hover:text-blue-800 flex items-center gap-1 font-semibold cursor-pointer"
                >
                  {copiedEnv ? (
                    <>
                      <Check className="w-3 h-3 text-emerald-600" />
                      <span className="text-emerald-700">Copied .env</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3 h-3" />
                      <span>Copy .env config</span>
                    </>
                  )}
                </button>
              </div>

              <ol className="list-decimal list-inside space-y-1.5 text-[11px] text-slate-600 bg-slate-50 p-3 rounded-xl border border-slate-200">
                <li>
                  Open <strong>XAMPP Control Panel</strong> and click <strong>Start</strong> next to <strong>Apache</strong> and <strong>MySQL</strong>.
                </li>
                <li>
                  Open browser at <code className="px-1 py-0.5 bg-slate-200 rounded text-slate-900">http://localhost/phpmyadmin</code>.
                </li>
                <li>
                  Click the <strong>Import</strong> tab at the top.
                </li>
                <li>
                  Choose the downloaded <code className="px-1 py-0.5 bg-slate-200 rounded text-slate-900">schoolcare_db.sql</code> file and click <strong>Go</strong>.
                </li>
                <li>
                  Your local MySQL instance now contains all 16 tables and ES RUBENGERA RTB data!
                </li>
              </ol>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
