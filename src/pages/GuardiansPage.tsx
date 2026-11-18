import React, { useEffect, useState } from 'react';
import { Guardian, Student } from '../types';
import { api } from '../services/api';
import { useLanguage } from '../i18n/LanguageContext';
import {
  UserSquare2,
  Plus,
  Search,
  PhoneCall,
  Mail,
  CheckCircle2,
  ShieldCheck,
  MapPin,
  X
} from 'lucide-react';

export const GuardiansPage: React.FC = () => {
  const { t } = useLanguage();

  const [guardians, setGuardians] = useState<Guardian[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);

  // Add modal
  const [showAddModal, setShowAddModal] = useState(false);
  const [fullName, setFullName] = useState('');
  const [relationship, setRelationship] = useState<Guardian['relationship']>('MOTHER');
  const [phone, setPhone] = useState('+250 788 ');
  const [email, setEmail] = useState('');
  const [address, setAddress] = useState('Rubengera Sector, Karongi District');
  const [selectedStudentId, setSelectedStudentId] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const loadData = async () => {
    try {
      setLoading(true);
      const [grd, stu] = await Promise.all([
        api.getGuardians(),
        api.getStudents()
      ]);
      setGuardians(grd);
      setStudents(stu);
      if (stu.length > 0) setSelectedStudentId(stu[0].id);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleCreateGuardian = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fullName.trim() || !phone.trim()) return;

    try {
      setIsSubmitting(true);
      await api.createGuardian({
        fullName,
        relationship,
        phone,
        email,
        address,
        preferredLanguage: 'rw',
        preferredChannel: 'WHATSAPP',
        isVerified: true,
        canPickup: true,
        emergencyPriority: 1,
        studentId: selectedStudentId
      });

      setShowAddModal(false);
      setFullName('');
      setPhone('+250 788 ');
      loadData();
    } catch (err: any) {
      alert(err.message || 'Failed to add guardian');
    } finally {
      setIsSubmitting(false);
    }
  };

  const filtered = guardians.filter(g => {
    if (!search) return true;
    const q = search.toLowerCase();
    return g.fullName.toLowerCase().includes(q) || g.phone.includes(q) || g.address.toLowerCase().includes(q);
  });

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-6 rounded-2xl border border-slate-200 shadow-xs">
        <div>
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-purple-100 text-purple-800 flex items-center gap-1">
              <UserSquare2 className="w-3.5 h-3.5" />
              <span>Verified Family Network</span>
            </span>
            <span className="text-xs text-slate-500">ES RUBENGERA RTB</span>
          </div>
          <h1 className="text-2xl font-black text-slate-900 mt-1">{t('navGuardians')}</h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Verified parent contacts, SMS/WhatsApp delivery channels & authorized gate pickup status
          </p>
        </div>

        <button
          onClick={() => setShowAddModal(true)}
          className="px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs shadow-md transition flex items-center gap-1.5"
        >
          <Plus className="w-4 h-4" />
          <span>{t('addGuardian')}</span>
        </button>
      </div>

      {/* Search */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex items-center gap-3">
        <div className="relative w-full max-w-sm">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search parent by name, phone (+250)..."
            className="w-full pl-9 pr-3 py-2 rounded-xl border border-slate-200 text-xs text-slate-800 focus:ring-2 focus:ring-blue-500"
          />
        </div>
      </div>

      {/* Guardians Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {filtered.map(grd => (
          <div key={grd.id} className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs space-y-4">
            <div className="flex items-start justify-between">
              <div>
                <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-purple-100 text-purple-800">
                  {grd.relationship}
                </span>
                <h3 className="text-base font-bold text-slate-900 mt-1">{grd.fullName}</h3>
                <p className="text-[11px] text-slate-500">{grd.occupation || 'Parent / Guardian'}</p>
              </div>
              {grd.isVerified && (
                <span className="p-1 rounded-full bg-emerald-100 text-emerald-700" title="Identity Verified">
                  <ShieldCheck className="w-4 h-4" />
                </span>
              )}
            </div>

            <div className="space-y-1.5 text-xs text-slate-600 border-t border-slate-100 pt-3">
              <div className="flex items-center gap-2">
                <PhoneCall className="w-3.5 h-3.5 text-blue-600" />
                <span className="font-mono font-bold text-slate-800">{grd.phone}</span>
              </div>
              {grd.email && (
                <div className="flex items-center gap-2">
                  <Mail className="w-3.5 h-3.5 text-blue-600" />
                  <span className="truncate">{grd.email}</span>
                </div>
              )}
              <div className="flex items-center gap-2">
                <MapPin className="w-3.5 h-3.5 text-blue-600" />
                <span className="truncate">{grd.address}</span>
              </div>
            </div>

            <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-[11px]">
              <span className="font-semibold text-slate-500">
                Channel: <strong className="text-blue-700">{grd.preferredChannel}</strong>
              </span>
              <span className={`px-2 py-0.5 rounded-full font-bold ${
                grd.canPickup ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-800'
              }`}>
                {grd.canPickup ? 'Gate Pickup Allowed' : 'No Pickup'}
              </span>
            </div>
          </div>
        ))}
      </div>

      {/* Add Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 space-y-4 border border-slate-200">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="text-base font-bold text-slate-900">{t('addGuardian')}</h3>
              <button onClick={() => setShowAddModal(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateGuardian} className="space-y-3 text-xs">
              <div>
                <label className="block font-bold text-slate-700 mb-1">Full Name *</label>
                <input
                  type="text"
                  value={fullName}
                  onChange={e => setFullName(e.target.value)}
                  placeholder="e.g. Chantal Mukantabana"
                  className="w-full px-3 py-2 rounded-xl border border-slate-300"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Relationship *</label>
                  <select
                    value={relationship}
                    onChange={e => setRelationship(e.target.value as any)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-white"
                  >
                    <option value="MOTHER">Mother (Nyina)</option>
                    <option value="FATHER">Father (Se)</option>
                    <option value="GUARDIAN">Legal Guardian</option>
                    <option value="UNCLE">Uncle</option>
                    <option value="AUNT">Aunt</option>
                  </select>
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Phone Number (+250) *</label>
                  <input
                    type="text"
                    value={phone}
                    onChange={e => setPhone(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 font-mono"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Link to Student *</label>
                <select
                  value={selectedStudentId}
                  onChange={e => setSelectedStudentId(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-white"
                >
                  {students.map(s => (
                    <option key={s.id} value={s.id}>
                      {s.firstName} {s.lastName} ({s.className})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Residential Address</label>
                <input
                  type="text"
                  value={address}
                  onChange={e => setAddress(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2 rounded-xl border border-slate-300 text-slate-700 font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-5 py-2 rounded-xl bg-blue-600 text-white font-bold"
                >
                  {isSubmitting ? 'Saving...' : 'Register Guardian'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
