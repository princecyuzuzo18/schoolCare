import React, { useEffect, useState } from 'react';
import { Student, AcademicClass } from '../types';
import { api } from '../services/api';
import { useLanguage } from '../i18n/LanguageContext';
import { useAuth } from '../contexts/AuthContext';
import { StudentIdCardModal } from '../components/StudentIdCardModal';
import {
  Users,
  Plus,
  Search,
  Filter,
  Download,
  Upload,
  QrCode,
  Edit,
  Eye,
  CheckCircle2,
  X,
  Sparkles,
  Archive,
  RotateCcw
} from 'lucide-react';

export const StudentsPage: React.FC = () => {
  const { t } = useLanguage();
  const { school, hasPermission } = useAuth();

  const [students, setStudents] = useState<Student[]>([]);
  const [classes, setClasses] = useState<AcademicClass[]>([]);
  const [selectedClassId, setSelectedClassId] = useState<string>('all');
  const [selectedCombination, setSelectedCombination] = useState<string>('all');
  const [selectedLevel, setSelectedLevel] = useState<string>('all');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState('');

  // Student ID card modal
  const [activeCardStudent, setActiveCardStudent] = useState<Student | null>(null);

  // New Student Modal
  const [showAddModal, setShowAddModal] = useState(false);
  const [newFirstName, setNewFirstName] = useState('');
  const [newLastName, setNewLastName] = useState('');
  const [newGender, setNewGender] = useState<'M' | 'F'>('M');
  const [newDob, setNewDob] = useState('2008-05-10');
  const [newClassId, setNewClassId] = useState('class-l4-sod-a');
  const [newCombination, setNewCombination] = useState('Software Development (SOD)');
  const [newLevel, setNewLevel] = useState('Level 4 RTB');
  const [newBloodGroup, setNewBloodGroup] = useState('O+');
  const [newMedicalNotes, setNewMedicalNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const loadData = async () => {
    try {
      setLoading(true);
      const [stu, cls] = await Promise.all([
        api.getStudents(selectedClassId === 'all' ? undefined : selectedClassId, search),
        api.getClasses()
      ]);
      setStudents(stu);
      setClasses(cls);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [selectedClassId, search]);

  const handleArchive = async (student: Student) => {
    const reason = window.prompt(t('archiveReasonPrompt'));
    if (!reason || !reason.trim()) return;
    if (!window.confirm(t('confirmArchiveStudent'))) return;
    try {
      setNotice('');
      await api.archiveStudent(student.id, reason.trim());
      setNotice(t('studentArchivedNotice'));
      await loadData();
    } catch (err) {
      setNotice(err instanceof Error ? err.message : t('actionFailed'));
    }
  };

  const handleRestore = async (student: Student) => {
    if (!window.confirm(t('confirmRestoreStudent'))) return;
    try {
      setNotice('');
      await api.restoreStudent(student.id);
      setNotice(t('studentRestoredNotice'));
      await loadData();
    } catch (err) {
      setNotice(err instanceof Error ? err.message : t('actionFailed'));
    }
  };

  const getClassLevel = (classItem: AcademicClass | undefined) => classItem?.grade || '';
  const visibleStudents = students.filter(student => {
    const level = getClassLevel(classes.find(classItem => classItem.id === student.classId));
    return (selectedCombination === 'all' || student.combination === selectedCombination)
      && (selectedLevel === 'all' || level === selectedLevel);
  });
  const combinationOptions = [...new Set(classes.map(classItem => classItem.combination))];
  const filterableClasses = classes.filter(classItem =>
    (selectedCombination === 'all' || classItem.combination === selectedCombination)
      && (selectedLevel === 'all' || getClassLevel(classItem) === selectedLevel)
  );
  const filterLevelOptions = [...new Set(
    classes
      .filter(classItem => selectedCombination === 'all' || classItem.combination === selectedCombination)
      .map(getClassLevel)
  )].filter(Boolean).sort();
  const levelOptions = [...new Set(
    classes.filter(classItem => classItem.combination === newCombination).map(getClassLevel)
  )];
  const matchingClasses = classes.filter(
    classItem => classItem.combination === newCombination && getClassLevel(classItem) === newLevel
  );

  const handleCreateStudent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newFirstName.trim() || !newLastName.trim()) return;

    try {
      setIsSubmitting(true);
      const cls = classes.find(c => c.id === newClassId);
      await api.createStudent({
        firstName: newFirstName,
        lastName: newLastName,
        gender: newGender,
        dob: newDob,
        classId: newClassId,
        className: cls?.name || 'Class',
        combination: cls?.combination || 'TVET RTB',
        bloodGroup: newBloodGroup,
        allergies: newMedicalNotes || 'None recorded'
      });

      setShowAddModal(false);
      setNewFirstName('');
      setNewLastName('');
      setNewMedicalNotes('');
      loadData();
    } catch (err: any) {
      alert(err.message || 'Failed to add student');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleExportCsv = () => {
    const rows = [
      ['Admission No', 'First Name', 'Last Name', 'Gender', 'Class', 'Combination', 'Status', 'Blood Group'],
      ...visibleStudents.map(s => [
        s.admissionNumber,
        s.firstName,
        s.lastName,
        s.gender,
        s.className,
        s.combination,
        s.enrollmentStatus,
        s.bloodGroup || 'O+'
      ])
    ];

    const csvContent = 'data:text/csv;charset=utf-8,' + rows.map(e => e.join(',')).join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `Students_Registry_ES_Rubengera_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-6 rounded-2xl border border-slate-200 shadow-xs">
        <div>
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-blue-100 text-blue-800 flex items-center gap-1">
              <Users className="w-3.5 h-3.5" />
              <span>Student Enrollment Registry</span>
            </span>
            <span className="text-xs text-slate-500">ES RUBENGERA RTB</span>
          </div>
          <h1 className="text-2xl font-black text-slate-900 mt-1">{t('navStudents')}</h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Dossiers, biometric identification, QR gate pass cards & academic combinations
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleExportCsv}
            className="px-3.5 py-2 rounded-xl border border-slate-300 hover:bg-slate-50 text-slate-700 font-semibold text-xs flex items-center gap-1.5 transition"
          >
            <Download className="w-4 h-4" />
            <span>{t('exportCsv')}</span>
          </button>

          <button
            onClick={() => setShowAddModal(true)}
            className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs shadow-md transition flex items-center gap-1.5"
          >
            <Plus className="w-4 h-4" />
            <span>{t('addStudent')}</span>
          </button>
        </div>
      </div>

      {notice && (
        <div role="status" className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-xs font-semibold text-blue-800">
          {notice}
        </div>
      )}

      {/* Filter and Search Bar */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex flex-col sm:flex-row items-center justify-between gap-3">
        <div className="relative w-full sm:w-80">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search student by name, admission #..."
            className="w-full pl-9 pr-3 py-2 rounded-xl border border-slate-200 text-xs text-slate-800 focus:outline-hidden focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
          <Filter className="w-4 h-4 text-slate-400 shrink-0" />
          <label className="sr-only" htmlFor="student-combination-filter">Combination</label>
          <select
            id="student-combination-filter"
            value={selectedCombination}
            onChange={e => {
              setSelectedCombination(e.target.value);
              setSelectedLevel('all');
              setSelectedClassId('all');
            }}
            className="px-3 py-1.5 rounded-xl border border-slate-200 text-xs font-semibold text-slate-700 bg-white"
          >
            <option value="all">All Combinations</option>
            {combinationOptions.map(combination => <option key={combination} value={combination}>{combination}</option>)}
          </select>
          <label className="sr-only" htmlFor="student-level-filter">Level</label>
          <select
            id="student-level-filter"
            value={selectedLevel}
            onChange={e => {
              setSelectedLevel(e.target.value);
              setSelectedClassId('all');
            }}
            className="px-3 py-1.5 rounded-xl border border-slate-200 text-xs font-semibold text-slate-700 bg-white"
          >
            <option value="all">All Levels</option>
            {filterLevelOptions.map(level => (
              <option key={level} value={level}>{level.replace('Level ', 'L').replace(' RTB', '')}</option>
            ))}
          </select>
          <label className="sr-only" htmlFor="student-class-filter">Class</label>
          <select
            id="student-class-filter"
            value={selectedClassId}
            onChange={e => setSelectedClassId(e.target.value)}
            className="px-3 py-1.5 rounded-xl border border-slate-200 text-xs font-semibold text-slate-700 bg-white"
          >
            <option value="all">All Classes</option>
            {filterableClasses.map(c => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Students Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 uppercase tracking-wider font-bold">
              <tr>
                <th className="py-3 px-4">Student</th>
                <th className="py-3 px-4">Admission No</th>
                <th className="py-3 px-4">Combination & Level</th>
                <th className="py-3 px-4">DOB & Gender</th>
                <th className="py-3 px-4">Medical / Vitals</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4 text-right">Gate QR Card</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {visibleStudents.map(s => (
                <tr key={s.id} className="hover:bg-slate-50/70 transition">
                  <td className="py-3 px-4">
                    <div className="flex items-center gap-3">
                      <img
                        src={s.photoUrl}
                        alt={s.firstName}
                        className="w-9 h-9 rounded-full object-cover border border-slate-200"
                      />
                      <div>
                        <p className="font-bold text-slate-900">{s.firstName} {s.lastName}</p>
                        <p className="text-[11px] text-slate-500">{s.nationalId ? `NID: ${s.nationalId}` : 'Rwandan Student'}</p>
                      </div>
                    </div>
                  </td>
                  <td className="py-3 px-4 font-mono font-bold text-slate-700">{s.admissionNumber}</td>
                  <td className="py-3 px-4">
                    <p className="font-semibold text-slate-800">{s.combination}</p>
                    <p className="text-[11px] text-slate-500">
                      {classes.find(classItem => classItem.id === s.classId)?.grade.replace('Level ', 'L').replace(' RTB', '') || s.className}
                      {' · '}{s.className}
                    </p>
                  </td>
                  <td className="py-3 px-4">
                    <p className="text-slate-700">{s.dob}</p>
                    <p className="text-[10px] text-slate-500">{s.gender === 'M' ? 'Male' : 'Female'}</p>
                  </td>
                  <td className="py-3 px-4">
                    <span className="font-bold text-red-700 bg-red-50 px-2 py-0.5 rounded text-[10px]">
                      Blood: {s.bloodGroup || 'O+'}
                    </span>
                    <p className="text-[10px] text-slate-500 mt-0.5 truncate max-w-xs">{s.allergies}</p>
                  </td>
                  <td className="py-3 px-4">
                    <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                      s.archivedAt
                        ? 'bg-slate-200 text-slate-700'
                        : 'bg-emerald-100 text-emerald-800'
                    }`}>
                      {s.archivedAt ? t('archivedStatus') : s.enrollmentStatus}
                    </span>
                    {hasPermission('students.write') && (
                      <div className="mt-1.5">
                        {s.archivedAt ? (
                          <button
                            onClick={() => handleRestore(s)}
                            title={t('restore')}
                            className="inline-flex items-center gap-1 rounded-lg bg-emerald-50 px-2 py-1 text-[10px] font-bold text-emerald-700 hover:bg-emerald-100"
                          >
                            <RotateCcw className="w-3 h-3" />
                            {t('restore')}
                          </button>
                        ) : (
                          <button
                            onClick={() => handleArchive(s)}
                            title={t('archiveAccount')}
                            className="inline-flex items-center gap-1 rounded-lg bg-red-50 px-2 py-1 text-[10px] font-bold text-red-700 hover:bg-red-100"
                          >
                            <Archive className="w-3 h-3" />
                            {t('archivedStatus')}
                          </button>
                        )}
                      </div>
                    )}
                  </td>
                  <td className="py-3 px-4 text-right">
                    <button
                      onClick={() => setActiveCardStudent(s)}
                      className="px-3 py-1.5 rounded-xl bg-blue-50 text-blue-700 font-bold hover:bg-blue-100 transition inline-flex items-center gap-1.5 shadow-2xs"
                    >
                      <QrCode className="w-3.5 h-3.5" />
                      <span>ID Pass</span>
                    </button>
                  </td>
                </tr>
              ))}
              {visibleStudents.length === 0 && (
                <tr>
                  <td colSpan={7} className="py-10 px-4 text-center text-sm text-slate-500">
                    No students match the selected combination, level, and class.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ID Card Modal */}
      {activeCardStudent && (
        <StudentIdCardModal
          student={activeCardStudent}
          school={school}
          onClose={() => setActiveCardStudent(null)}
        />
      )}

      {/* Add Student Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in">
          <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full p-6 space-y-4 border border-slate-200">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="text-base font-bold text-slate-900">{t('addStudent')}</h3>
              <button onClick={() => setShowAddModal(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateStudent} className="space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">First Name *</label>
                  <input
                    type="text"
                    value={newFirstName}
                    onChange={e => setNewFirstName(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300"
                    placeholder="e.g. Jean"
                    required
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Last Name *</label>
                  <input
                    type="text"
                    value={newLastName}
                    onChange={e => setNewLastName(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300"
                    placeholder="e.g. Mugisha"
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Gender *</label>
                  <select
                    value={newGender}
                    onChange={e => setNewGender(e.target.value as any)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-white"
                  >
                    <option value="M">Male (Gabo)</option>
                    <option value="F">Female (Gore)</option>
                  </select>
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Date of Birth *</label>
                  <input
                    type="date"
                    value={newDob}
                    onChange={e => setNewDob(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300"
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Combination *</label>
                  <select
                    value={newCombination}
                    onChange={e => {
                      const combination = e.target.value;
                      const nextClass = classes.find(classItem => classItem.combination === combination && getClassLevel(classItem) === newLevel)
                        || classes.find(classItem => classItem.combination === combination);
                      setNewCombination(combination);
                      if (nextClass) {
                        setNewLevel(getClassLevel(nextClass));
                        setNewClassId(nextClass.id);
                      }
                    }}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-white"
                  >
                    {combinationOptions.map(combination => (
                      <option key={combination} value={combination}>{combination}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Level *</label>
                  <select
                    value={newLevel}
                    onChange={e => {
                      const level = e.target.value;
                      const nextClass = classes.find(classItem => classItem.combination === newCombination && getClassLevel(classItem) === level);
                      setNewLevel(level);
                      if (nextClass) setNewClassId(nextClass.id);
                    }}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-white"
                  >
                    {levelOptions.map(level => <option key={level} value={level}>{level.replace('Level ', 'L').replace(' RTB', '')}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Class / Stream *</label>
                  <select
                    value={newClassId}
                    onChange={e => setNewClassId(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-white"
                  >
                    {matchingClasses.map(classItem => (
                      <option key={classItem.id} value={classItem.id}>{classItem.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Blood Group</label>
                  <select
                    value={newBloodGroup}
                    onChange={e => setNewBloodGroup(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-white"
                  >
                    <option value="O+">O+</option>
                    <option value="A+">A+</option>
                    <option value="B+">B+</option>
                    <option value="AB+">AB+</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Allergies & Medical Notes</label>
                <input
                  type="text"
                  value={newMedicalNotes}
                  onChange={e => setNewMedicalNotes(e.target.value)}
                  placeholder="e.g. Asthmatic, Penicillin allergy..."
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
                  {isSubmitting ? 'Registering...' : 'Complete Registration'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
