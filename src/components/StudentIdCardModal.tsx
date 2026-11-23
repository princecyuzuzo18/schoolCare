import React, { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { Student, School } from '../types';
import { X, Printer, ShieldCheck, CheckCircle2, QrCode } from 'lucide-react';
import { useLanguage } from '../i18n/LanguageContext';

interface StudentIdCardModalProps {
  student: Student | null;
  school: School | null;
  onClose: () => void;
}

export const StudentIdCardModal: React.FC<StudentIdCardModalProps> = ({ student, school, onClose }) => {
  const [qrDataUrl, setQrDataUrl] = useState<string>('');
  const { t } = useLanguage();

  useEffect(() => {
    if (student) {
      // QR data identifies the card holder. It does not claim verification:
      // only the school's own records can confirm status at the point of use.
      const qrPayload = JSON.stringify({
        type: 'student-id-card',
        admissionNumber: student.admissionNumber,
        name: `${student.firstName} ${student.lastName}`,
        class: student.className,
        school: school?.name || 'SchoolCare'
      });

      QRCode.toDataURL(qrPayload, { width: 160, margin: 1, color: { dark: '#102B50', light: '#FFFFFF' } })
        .then(setQrDataUrl)
        .catch(console.error);
    }
  }, [student, school]);

  if (!student) return null;

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in">
      <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full overflow-hidden border border-slate-200">
        {/* Modal Header */}
        <div className="flex items-center justify-between px-5 py-3.5 bg-slate-50 border-b border-slate-200">
          <div className="flex items-center gap-2">
            <QrCode className="w-5 h-5 text-blue-600" />
            <h3 className="text-sm font-bold text-slate-800">
              Official Student Identification Card
            </h3>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-200/60 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Printable Card Area */}
        <div className="p-6 flex flex-col items-center">
          <div
            id="student-id-card-print"
            className="w-full max-w-sm rounded-2xl border-2 border-blue-900 bg-gradient-to-b from-[#102B50] via-[#102B50] to-[#153a6b] text-white p-5 shadow-xl relative overflow-hidden"
          >
            {/* Top Security Header */}
            <div className="flex items-center justify-between border-b border-blue-800/80 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-lg bg-white/10 flex items-center justify-center p-1 border border-white/20">
                  <ShieldCheck className="w-6 h-6 text-emerald-400" />
                </div>
                <div>
                  <p className="text-[12px] font-black tracking-wider uppercase text-white">
                    {school?.name || 'ES RUBENGERA RTB'}
                  </p>
                  <p className="text-[10px] text-blue-200">
                    Republic of Rwanda • Ministry of Education (RTB)
                  </p>
                </div>
              </div>
            </div>

            {/* Photo & Student Core Info */}
            <div className="flex gap-4 mt-4 items-start">
              <div className="shrink-0 relative">
                <img
                  src={student.photoUrl}
                  alt={student.firstName}
                  className="w-24 h-28 object-cover rounded-xl border-2 border-white shadow-md bg-slate-200"
                />
                <span className="absolute -bottom-2 -right-2 px-1.5 py-0.5 rounded-full text-[9px] font-bold bg-emerald-500 text-white flex items-center gap-0.5 shadow">
                  <CheckCircle2 className="w-2.5 h-2.5" /> Active
                </span>
              </div>

              <div className="flex-1 space-y-1">
                <p className="text-base font-extrabold text-white leading-tight">
                  {student.firstName} {student.lastName}
                </p>
                <div className="text-[11px] text-blue-200">
                  <span className="text-blue-300">Class:</span> <span className="font-semibold text-white">{student.className}</span>
                </div>
                <div className="text-[11px] text-blue-200">
                  <span className="text-blue-300">Trade:</span> <span className="font-semibold text-amber-300">{student.combination}</span>
                </div>
                <div className="text-[11px] text-blue-200">
                  <span className="text-blue-300">Admission No:</span>
                  <p className="font-mono font-bold text-white tracking-wider text-xs">{student.admissionNumber}</p>
                </div>
                <div className="text-[10px] text-blue-200">
                  <span className="text-blue-300">DOB:</span> {student.dob} • <span className="text-blue-300">Gender:</span> {student.gender}
                </div>
              </div>
            </div>

            {/* QR Code & Barcode Verification Footer */}
            <div className="mt-4 pt-3 border-t border-blue-800/80 flex items-center justify-between bg-black/20 -mx-5 -mb-5 px-5 py-3">
              <div className="space-y-0.5">
                <p className="text-[9px] font-semibold text-blue-200 uppercase tracking-wider">
                  Gate Scan & Parent Pickup Pass
                </p>
                <p className="text-[9px] text-slate-300">
                  Emergency: {school?.emergencyPhone || 'Not configured'}
                </p>
                <p className="text-[8px] text-blue-300">
                  Academic Year: {school?.currentAcademicYear || 'Not configured'}
                </p>
              </div>
              {qrDataUrl && (
                <div className="bg-white p-1 rounded-lg shadow-inner">
                  <img src={qrDataUrl} alt="Student QR Code" className="w-14 h-14" />
                </div>
              )}
            </div>
          </div>

          <div className="flex items-center gap-3 mt-6 w-full">
            <button
              onClick={handlePrint}
              className="flex-1 flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs shadow-md transition"
            >
              <Printer className="w-4 h-4" />
              <span>Print Official ID Card</span>
            </button>
            <button
              onClick={onClose}
              className="py-2.5 px-4 rounded-xl border border-slate-300 hover:bg-slate-100 text-slate-700 font-semibold text-xs transition"
            >
              {t('close')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
