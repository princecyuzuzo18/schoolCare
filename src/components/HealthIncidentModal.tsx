import React, { useState } from 'react';
import { HealthIncident, IncidentCategory, IncidentPriority, IncidentOutcome, Student, Guardian } from '../types';
import { useLanguage } from '../i18n/LanguageContext';
import { useAuth } from '../contexts/AuthContext';
import { api } from '../services/api';
import {
  X,
  HeartPulse,
  AlertTriangle,
  PhoneCall,
  CheckCircle2,
  Clock,
  Building,
  User,
  ShieldAlert,
  Send,
  Plus
} from 'lucide-react';

interface HealthIncidentModalProps {
  incident: HealthIncident | null;
  students: Student[];
  guardians: Guardian[];
  isOpen: boolean;
  onClose: () => void;
  onSaved: (incident: HealthIncident) => void;
}

export const HealthIncidentModal: React.FC<HealthIncidentModalProps> = ({
  incident,
  students,
  guardians,
  isOpen,
  onClose,
  onSaved
}) => {
  const { t } = useLanguage();
  const { currentUser, role } = useAuth();

  const isEditing = Boolean(incident);

  // Form State
  const [studentId, setStudentId] = useState(incident?.studentId || (students[0]?.id || ''));
  const [category, setCategory] = useState<IncidentCategory>(incident?.category || 'ILLNESS');
  const [priority, setPriority] = useState<IncidentPriority>(incident?.priority || 'URGENT');
  const [symptoms, setSymptoms] = useState(incident?.symptoms || '');
  const [observations, setObservations] = useState(incident?.observations || '');
  const [temperature, setTemperature] = useState(incident?.temperature || '');
  const [pulse, setPulse] = useState(incident?.pulse || '');
  const [selectedGuardianId, setSelectedGuardianId] = useState(incident?.guardianId || '');
  const [actionsTaken, setActionsTaken] = useState(incident?.actionsTaken || '');
  const [outcome, setOutcome] = useState<IncidentOutcome>(incident?.outcome || 'RESTING_IN_INFIRMARY');
  const [medicalReferral, setMedicalReferral] = useState(incident?.medicalReferral || 'Rubengera Health Center (Centre de Santé Rubengera)');
  const [newActionText, setNewActionText] = useState('');
  const [parentNotes, setParentNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isOpen) return null;

  const selectedStudent = students.find(s => s.id === studentId) || students[0];
  // Never invent a guardian: the server also verifies the link to this student.
  const matchedGuardian = guardians.find(g => g.id === selectedGuardianId) || null;

  const handleCreateOrUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!symptoms.trim()) {
      alert('Please describe observed symptoms.');
      return;
    }

    try {
      setIsSubmitting(true);
      if (incident) {
        // Just add an action or close
        if (newActionText.trim()) {
          const updated = await api.addIncidentAction(incident.id, newActionText);
          onSaved(updated);
        } else {
          onClose();
        }
      } else {
        const created = await api.createHealthIncident({
          studentId: selectedStudent.id,
          studentName: `${selectedStudent.firstName} ${selectedStudent.lastName}`,
          studentClass: selectedStudent.className,
          category,
          priority,
          symptoms,
          observations,
          temperature,
          pulse,
          actionsTaken,
          responsibleStaffName: currentUser?.fullName || 'School Nurse Aline',
          guardianId: matchedGuardian?.id,
          guardianName: matchedGuardian?.fullName,
          guardianPhone: matchedGuardian?.phone,
          medicalReferral: priority === 'URGENT' || priority === 'EMERGENCY' ? medicalReferral : undefined,
          outcome
        });
        onSaved(created);
      }
    } catch (err: any) {
      alert(err.message || 'Failed to save incident');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleAcknowledge = async () => {
    if (!incident) return;
    try {
      setIsSubmitting(true);
      const updated = await api.acknowledgeIncident(incident.id, parentNotes || 'Parent acknowledged via portal');
      onSaved(updated);
    } catch (err: any) {
      alert(err.message || 'Failed to acknowledge');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 overflow-y-auto animate-in fade-in">
      <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] flex flex-col border border-slate-200 overflow-hidden my-auto">
        {/* Modal Header */}
        <div className={`px-6 py-4 flex items-center justify-between border-b ${
          priority === 'URGENT' || priority === 'EMERGENCY' ? 'bg-red-50 border-red-200' : 'bg-slate-50 border-slate-200'
        }`}>
          <div className="flex items-center gap-3">
            <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${
              priority === 'URGENT' || priority === 'EMERGENCY' ? 'bg-red-600 text-white' : 'bg-blue-600 text-white'
            }`}>
              <HeartPulse className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900">
                {incident ? `Incident Dossier: ${incident.referenceNumber}` : t('reportIncident')}
              </h3>
              <p className="text-xs text-slate-500">
                ES RUBENGERA RTB Health & Infirmary Triage Protocol
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-200 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleCreateOrUpdate} className="flex-1 overflow-y-auto p-6 space-y-4 text-xs">
          {/* Statutory Medical Disclaimer */}
          <div className="p-3 bg-amber-50 rounded-xl border border-amber-200 text-amber-900 flex items-start gap-2.5">
            <ShieldAlert className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
            <p className="text-[11px] leading-tight">
              {t('safetyDisclaimer')}
            </p>
          </div>

          {!incident ? (
            <>
              {/* Student Picker */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Select Student *</label>
                  <select
                    value={studentId}
                    onChange={e => setStudentId(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-white text-slate-800 font-semibold focus:ring-2 focus:ring-blue-500 focus:outline-hidden"
                  >
                    {students.map(s => (
                      <option key={s.id} value={s.id}>
                        {s.firstName} {s.lastName} ({s.className} - {s.admissionNumber})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">Priority Level *</label>
                  <select
                    value={priority}
                    onChange={e => setPriority(e.target.value as IncidentPriority)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-white text-slate-800 font-bold focus:ring-2 focus:ring-blue-500 focus:outline-hidden"
                  >
                    <option value="ROUTINE">Routine (Bisanzwe)</option>
                    <option value="URGENT">Urgent (Byihutirwa)</option>
                    <option value="EMERGENCY">CRITICAL EMERGENCY (Ikibi Cyihutirwa Cyane)</option>
                  </select>
                </div>
              </div>

              {/* Category & Vitals */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Category *</label>
                  <select
                    value={category}
                    onChange={e => setCategory(e.target.value as IncidentCategory)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-white text-slate-800 font-semibold"
                  >
                    <option value="ILLNESS">Illness / Uburwayi</option>
                    <option value="INJURY">Injury / Gukomereka</option>
                    <option value="ACCIDENT">Accident / Impanuka</option>
                    <option value="EMERGENCY">Acute Medical Emergency</option>
                    <option value="OTHER">Other Health Concern</option>
                  </select>
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">Body Temp (°C)</label>
                  <input
                    type="text"
                    value={temperature}
                    onChange={e => setTemperature(e.target.value)}
                    placeholder="e.g. 38.9 °C"
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-white"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">Heart Pulse</label>
                  <input
                    type="text"
                    value={pulse}
                    onChange={e => setPulse(e.target.value)}
                    placeholder="e.g. 98 bpm"
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-white"
                  />
                </div>
              </div>

              {/* Symptoms & Observations */}
              <div>
                <label className="block font-bold text-slate-700 mb-1">{t('symptoms')} *</label>
                <textarea
                  rows={2}
                  value={symptoms}
                  onChange={e => setSymptoms(e.target.value)}
                  placeholder="e.g. High fever, shivering, vomiting, dizziness during practical exam..."
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-white focus:ring-2 focus:ring-blue-500"
                  required
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">{t('actionsTaken')} *</label>
                <textarea
                  rows={2}
                  value={actionsTaken}
                  onChange={e => setActionsTaken(e.target.value)}
                  placeholder="e.g. Rested in infirmary, oral rehydration salts given, sponge bath applied..."
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-white focus:ring-2 focus:ring-blue-500"
                  required
                />
              </div>

              {/* Hospital Referral & Outcome */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">{t('referralHospital')}</label>
                  <input
                    type="text"
                    value={medicalReferral}
                    onChange={e => setMedicalReferral(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-white"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">Initial Outcome *</label>
                  <select
                    value={outcome}
                    onChange={e => setOutcome(e.target.value as IncidentOutcome)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-white font-semibold"
                  >
                    <option value="RESTING_IN_INFIRMARY">Resting in Infirmary</option>
                    <option value="REFERRED_TO_HOSPITAL">Referred to Hospital / Clinic</option>
                    <option value="PICKED_UP_BY_GUARDIAN">Picked up by Guardian</option>
                    <option value="RETURNED_TO_CLASS">Returned to Class</option>
                    <option value="UNDER_OBSERVATION">Under Observation</option>
                  </select>
                </div>
              </div>

              {/* Guardian Target — must be explicitly selected and verified server-side */}
              <div className="p-3 bg-blue-50 rounded-xl border border-blue-200 space-y-2">
                <label htmlFor="incident-guardian" className="font-bold text-blue-900 block">
                  Guardian to alert (optional)
                </label>
                <select
                  id="incident-guardian"
                  value={selectedGuardianId}
                  onChange={e => setSelectedGuardianId(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-blue-200 bg-white text-sm"
                >
                  <option value="">No alert — record incident only</option>
                  {guardians.map(guardian => (
                    <option key={guardian.id} value={guardian.id}>
                      {guardian.fullName} ({guardian.phone})
                    </option>
                  ))}
                </select>
                {matchedGuardian && (
                  <p className="text-slate-600 mt-0.5">
                    An urgent alert will be queued for{' '}
                    <span className="font-semibold text-slate-800">{matchedGuardian.fullName}</span> if the school verifies this guardian is linked to the student.
                  </p>
                )}
              </div>
            </>
          ) : (
            /* Viewing Existing Incident with Timeline */
            <div className="space-y-4">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-slate-50 p-3 rounded-xl border border-slate-200">
                <div>
                  <span className="text-[10px] text-slate-500 uppercase">Student</span>
                  <p className="font-bold text-slate-800">{incident.studentName}</p>
                  <p className="text-[11px] text-slate-500">{incident.studentClass}</p>
                </div>
                <div>
                  <span className="text-[10px] text-slate-500 uppercase">Priority</span>
                  <p className="font-bold text-red-600">{incident.priority}</p>
                  <p className="text-[11px] text-slate-500">{incident.time} on {incident.date}</p>
                </div>
                <div>
                  <span className="text-[10px] text-slate-500 uppercase">Vitals</span>
                  <p className="font-bold text-slate-800">{incident.temperature || 'Not recorded'}</p>
                  <p className="text-[11px] text-slate-500">{incident.pulse || 'Not recorded'}</p>
                </div>
                <div>
                  <span className="text-[10px] text-slate-500 uppercase">Guardian Status</span>
                  <p className="font-bold text-blue-700">{incident.contactStatus}</p>
                  <p className="text-[11px] text-slate-500">{incident.guardianName}</p>
                </div>
              </div>

              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                <span className="font-bold text-slate-700">Observed Symptoms:</span>
                <p className="text-slate-900 mt-1">{incident.symptoms}</p>
              </div>

              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                <span className="font-bold text-slate-700">Actions Taken by Staff:</span>
                <p className="text-slate-900 mt-1">{incident.actionsTaken}</p>
                {incident.medicalReferral && (
                  <p className="text-red-700 font-semibold mt-1.5 flex items-center gap-1.5">
                    <Building className="w-3.5 h-3.5" />
                    Referral Facility: {incident.medicalReferral}
                  </p>
                )}
              </div>

              {/* Timeline */}
              <div>
                <h4 className="font-bold text-slate-800 mb-2">Care & Contact Timeline:</h4>
                <div className="space-y-2 border-l-2 border-blue-200 pl-3">
                  {incident.timeline?.map((item, idx) => (
                    <div key={idx} className="relative">
                      <div className="w-2 h-2 rounded-full bg-blue-600 absolute -left-[17px] top-1" />
                      <p className="font-semibold text-slate-800">
                        <span className="text-blue-600 font-mono text-[11px] mr-1.5">{item.time}</span>
                        {item.action}
                      </p>
                      <p className="text-[10px] text-slate-600">Logged by: {item.actor}</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Add New Care Action */}
              <div className="pt-2 border-t border-slate-200">
                <label className="block font-bold text-slate-700 mb-1">{t('logAction')}:</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={newActionText}
                    onChange={e => setNewActionText(e.target.value)}
                    placeholder="e.g. Temperature lowered to 37.8°C; mother arrived at school infirmary gate."
                    className="flex-1 px-3 py-2 rounded-xl border border-slate-300 bg-white"
                  />
                  <button
                    type="submit"
                    disabled={isSubmitting || !newActionText.trim()}
                    className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs disabled:opacity-50"
                  >
                    Add
                  </button>
                </div>
              </div>

              {/* Parent Acknowledgment Action */}
              {!incident.parentAcknowledged && (
                <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-bold text-emerald-950">Acknowledge this Alert</p>
                      <p className="text-[11px] text-emerald-800">Confirm receipt of health notification</p>
                    </div>
                    <button
                      type="button"
                      onClick={handleAcknowledge}
                      disabled={isSubmitting}
                      className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow"
                    >
                      Acknowledge Now
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Footer Buttons */}
          <div className="pt-4 border-t border-slate-200 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 rounded-xl border border-slate-300 text-slate-700 font-semibold hover:bg-slate-100"
            >
              {t('close')}
            </button>
            {!incident && (
              <button
                type="submit"
                disabled={isSubmitting}
                className="px-5 py-2.5 rounded-xl bg-red-600 hover:bg-red-700 text-white font-bold shadow-md flex items-center gap-2 disabled:opacity-50"
              >
                <Send className="w-4 h-4" />
                <span>Submit & Dispatch Guardian Alert</span>
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  );
};
