import {
  School,
  UserProfile,
  Student,
  Guardian,
  StudentGuardianLink,
  AcademicClass,
  Subject,
  AttendanceRecord,
  HealthIncident,
  NotificationMessage,
  FeeStructure,
  Invoice,
  Payment,
  StaffMember,
  TimetableEntry,
  HomeworkAssignment,
  SchoolEvent,
  ReportCard,
  AuditLogEntry,
  AcademicYear,
  AcademicTerm,
  AssessmentCategory,
  GradingScale,
  AcademicSettings,
  AcademicCombination
} from '../src/types';

export const initialSchool: School = {
  id: 'school-es-rubengera-01',
  name: 'ES RUBENGERA RTB',
  code: 'ESR-RTB-RW',
  type: 'Secondary & Technical TVET School (RTB)',
  motto: 'Ubumenyi, Umurimo, Ubupfura — Knowledge, Skill, Integrity',
  logo: '/logo.svg',
  district: 'Karongi',
  sector: 'Rubengera',
  province: 'Western Province',
  country: 'Rwanda',
  phone: '+250 788 340 120',
  emergencyPhone: '+250 788 999 112',
  email: 'info@esrubengera.rw',
  website: 'https://esrubengera.ac.rw',
  currentAcademicYear: '2025 - 2026',
  currentTerm: 'Term 2 (Igihembwe cya 2)',
  totalStudents: 486,
  totalStaff: 34
};

export const initialUsers: UserProfile[] = [
  {
    id: 'user-super-admin',
    schoolId: 'school-es-rubengera-01',
    email: 'esrubengera@gmail.com',
    fullName: 'Dr. Emmanuel Habimana',
    role: 'HEAD_TEACHER',
    phone: '+250 788 111 000',
    avatarUrl: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150',
    preferredLanguage: 'en',
    lastLogin: '2026-11-05T08:15:00Z'
  },
  {
    id: 'user-school-admin',
    schoolId: 'school-es-rubengera-01',
    email: 'admin@esrubengera.rw',
    fullName: 'Innocent Niyitegeka',
    role: 'SCHOOL_ADMIN',
    phone: '+250 788 222 101',
    avatarUrl: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150',
    preferredLanguage: 'rw',
    lastLogin: '2026-11-05T09:30:00Z'
  },
  {
    id: 'user-head-teacher',
    schoolId: 'school-es-rubengera-01',
    email: 'headteacher@esrubengera.rw',
    fullName: 'Jean Bosco Mugiraneza',
    role: 'ANIMATEUR',
    phone: '+250 788 333 202',
    avatarUrl: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=150',
    preferredLanguage: 'rw',
    lastLogin: '2026-11-05T07:45:00Z'
  },
  {
    id: 'user-deputy-head',
    schoolId: 'school-es-rubengera-01',
    email: 'deputy@esrubengera.rw',
    fullName: 'Claire Mukamana',
    role: 'DEPUTY_HEAD',
    phone: '+250 788 444 303',
    avatarUrl: 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=150',
    preferredLanguage: 'en',
    lastLogin: '2026-11-05T08:00:00Z'
  },
  {
    id: 'user-teacher',
    schoolId: 'school-es-rubengera-01',
    email: 'teacher@esrubengera.rw',
    fullName: 'Patrick Nshimiyimana',
    role: 'TEACHER',
    phone: '+250 788 555 404',
    avatarUrl: 'https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?w=150',
    preferredLanguage: 'rw',
    teacherDepartment: 'Software Development & ICT',
    lastLogin: '2026-11-05T09:10:00Z'
  },
  {
    id: 'user-nurse',
    schoolId: 'school-es-rubengera-01',
    email: 'nurse@esrubengera.rw',
    fullName: 'Aline Uwimana',
    role: 'NURSE',
    phone: '+250 788 666 505',
    avatarUrl: 'https://images.unsplash.com/photo-1594824813580-57b1a2095fa7?w=150',
    preferredLanguage: 'rw',
    lastLogin: '2026-11-05T08:20:00Z'
  },
  {
    id: 'user-accountant',
    schoolId: 'school-es-rubengera-01',
    email: 'accountant@esrubengera.rw',
    fullName: 'Eric Bizimana',
    role: 'ACCOUNTANT',
    phone: '+250 788 777 606',
    avatarUrl: 'https://images.unsplash.com/photo-1519085360753-af0119f7cbe7?w=150',
    preferredLanguage: 'en',
    lastLogin: '2026-11-05T09:40:00Z'
  },
  {
    id: 'user-parent',
    schoolId: 'school-es-rubengera-01',
    email: 'parent@schoolcare.rw',
    fullName: 'Chantal Mukantabana',
    role: 'PARENT',
    phone: '+250 788 888 707',
    avatarUrl: 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=150',
    preferredLanguage: 'rw',
    linkedStudentIds: ['std-kevin-ishimwe-01', 'std-clarisse-uwera-06'],
    lastLogin: '2026-11-05T10:05:00Z'
  },
  {
    id: 'user-student',
    schoolId: 'school-es-rubengera-01',
    email: 'student@esrubengera.rw',
    fullName: 'Kevin Ishimwe',
    role: 'STUDENT',
    phone: '+250 788 999 808',
    avatarUrl: 'https://images.unsplash.com/photo-1539571696357-5a69c17a67c6?w=150',
    preferredLanguage: 'en',
    studentId: 'std-kevin-ishimwe-01',
    lastLogin: '2026-11-05T08:50:00Z'
  }
];

export const initialClasses: AcademicClass[] = [
  {
    id: 'class-l3-sod-a', schoolId: 'school-es-rubengera-01', name: 'Level 3 SOD A', grade: 'Level 3 RTB',
    stream: 'A', combination: 'Software Development (SOD)', classTeacherName: 'Unassigned',
    room: 'ICT Lab', studentCount: 0, status: 'ACTIVE', combinationId: 'comb-sod'
  },
  {
    id: 'class-l4-sod-a', schoolId: 'school-es-rubengera-01', name: 'Level 4 SOD A', grade: 'Level 4 RTB',
    stream: 'A', combination: 'Software Development (SOD)', classTeacherName: 'Patrick Nshimiyimana',
    room: 'Lab 2 - ICT Building', studentCount: 38, status: 'ACTIVE', combinationId: 'comb-sod'
  },
  {
    id: 'class-l5-sod-b', schoolId: 'school-es-rubengera-01', name: 'Level 5 SOD B', grade: 'Level 5 RTB',
    stream: 'B', combination: 'Software Development (SOD)', classTeacherName: 'Jean Damascene Kayitare',
    room: 'Lab 1 - Innovation Center', studentCount: 35, status: 'ACTIVE', combinationId: 'comb-sod'
  },
  {
    id: 'class-l3-nit-a', schoolId: 'school-es-rubengera-01', name: 'Level 3 NIT A', grade: 'Level 3 RTB',
    stream: 'A', combination: 'Networking (NIT)', classTeacherName: 'Unassigned',
    room: 'ICT Lab', studentCount: 0, status: 'ACTIVE', combinationId: 'comb-nit'
  },
  {
    id: 'class-l4-nit-a', schoolId: 'school-es-rubengera-01', name: 'Level 4 NIT A', grade: 'Level 4 RTB',
    stream: 'A', combination: 'Networking (NIT)', classTeacherName: 'Unassigned',
    room: 'ICT Lab', studentCount: 0, status: 'ACTIVE', combinationId: 'comb-nit'
  },
  {
    id: 'class-l5-nit-a', schoolId: 'school-es-rubengera-01', name: 'Level 5 NIT A', grade: 'Level 5 RTB',
    stream: 'A', combination: 'Networking (NIT)', classTeacherName: 'Unassigned',
    room: 'ICT Lab', studentCount: 0, status: 'ACTIVE', combinationId: 'comb-nit'
  },
  {
    // Legacy IDs retained so historical student/mark links remain intact.
    id: 'class-l3-accounting-a', schoolId: 'school-es-rubengera-01', name: 'Y1 Accounting', grade: 'Y1 Accounting',
    stream: 'A', combination: 'Accounting', classTeacherName: 'Unassigned',
    room: 'Classroom TBD', studentCount: 0, status: 'ACTIVE', combinationId: 'comb-accounting'
  },
  {
    id: 'class-l4-accounting-a', schoolId: 'school-es-rubengera-01', name: 'Y2 Accounting', grade: 'Y2 Accounting',
    stream: 'A', combination: 'Accounting', classTeacherName: 'Unassigned',
    room: 'Classroom TBD', studentCount: 0, status: 'ACTIVE', combinationId: 'comb-accounting'
  },
  {
    id: 'class-l5-accounting-a', schoolId: 'school-es-rubengera-01', name: 'Y3 Accounting', grade: 'Y3 Accounting',
    stream: 'A', combination: 'Accounting', classTeacherName: 'Unassigned',
    room: 'Classroom TBD', studentCount: 0, status: 'ACTIVE', combinationId: 'comb-accounting'
  },
  {
    // Archived, not deleted: existing CST learners keep their records.
    id: 'class-l4-cst', schoolId: 'school-es-rubengera-01', name: 'Level 4 CST', grade: 'Level 4 RTB',
    stream: 'A', combination: 'Building & Construction Technology', classTeacherName: 'Alexis Manirakiza',
    room: 'Workshop 3', studentCount: 42, status: 'ARCHIVED', combinationId: 'comb-cst-archived'
  },
  {
    // Archived, not deleted: existing S3 learners keep their records.
    id: 'class-s3-a', schoolId: 'school-es-rubengera-01', name: 'Senior 3 A', grade: 'O-Level S3',
    stream: 'A', combination: 'General Science & Languages', classTeacherName: 'Jeannette Mukarugwiza',
    room: 'Block B - Room 104', studentCount: 45, status: 'ARCHIVED', combinationId: 'comb-general-science-archived'
  }
];

/**
 * Default combination catalogue. Discontinued options are seeded as ARCHIVED
 * so historical students keep their programme while registration only sees
 * ACTIVE combinations.
 */
export const initialCombinations: AcademicCombination[] = [
  {
    id: 'comb-sod', schoolId: 'school-es-rubengera-01', name: 'Software Development (SOD)', code: 'SOD',
    educationLevel: 'TVET RTB', academicProgramme: 'Software Development',
    description: 'Software development and database pathways.', academicYear: '2025 - 2026', status: 'ACTIVE',
    subjects: [
      { subjectId: 'subj-web-dev', isRequired: true, teacherIds: [] },
      { subjectId: 'subj-db-design', isRequired: true, teacherIds: [] },
      { subjectId: 'subj-math', isRequired: true, teacherIds: [] },
      { subjectId: 'subj-english', isRequired: false, teacherIds: [] }
    ],
    classIds: ['class-l3-sod-a', 'class-l4-sod-a', 'class-l5-sod-b'], teacherIds: [],
    department: 'Software Development', createdAt: '2025-09-01T00:00:00Z', updatedAt: '2025-09-01T00:00:00Z'
  },
  {
    id: 'comb-nit', schoolId: 'school-es-rubengera-01', name: 'Networking (NIT)', code: 'NIT',
    educationLevel: 'TVET RTB', academicProgramme: 'Networking',
    description: 'Computer networking and infrastructure pathway.', academicYear: '2025 - 2026', status: 'ACTIVE',
    subjects: [
      { subjectId: 'subj-web-dev', isRequired: true, teacherIds: [] },
      { subjectId: 'subj-math', isRequired: true, teacherIds: [] }
    ],
    classIds: ['class-l3-nit-a', 'class-l4-nit-a', 'class-l5-nit-a'], teacherIds: [],
    department: 'Software Development', createdAt: '2025-09-01T00:00:00Z', updatedAt: '2025-09-01T00:00:00Z'
  },
  {
    id: 'comb-accounting', schoolId: 'school-es-rubengera-01', name: 'Accounting', code: 'ACC',
    educationLevel: 'TVET RTB', academicProgramme: 'Accounting',
    description: 'Y1, Y2 and Y3 Accounting programme.', academicYear: '2025 - 2026', status: 'ACTIVE',
    subjects: [
      { subjectId: 'subj-math', isRequired: true, teacherIds: [] },
      { subjectId: 'subj-entrepreneurship', isRequired: true, teacherIds: [] },
      { subjectId: 'subj-english', isRequired: false, teacherIds: [] }
    ],
    classIds: ['class-l3-accounting-a', 'class-l4-accounting-a', 'class-l5-accounting-a'], teacherIds: [],
    department: 'Business & Management', createdAt: '2025-09-01T00:00:00Z', updatedAt: '2025-09-01T00:00:00Z'
  },
  {
    id: 'comb-cst-archived', schoolId: 'school-es-rubengera-01', name: 'Building & Construction (CST)', code: 'CST',
    educationLevel: 'TVET RTB', academicProgramme: 'Building & Construction',
    description: 'Discontinued combination; historical records only.', academicYear: '2025 - 2026', status: 'ARCHIVED',
    subjects: [{ subjectId: 'subj-math', isRequired: true, teacherIds: [] }],
    classIds: ['class-l4-cst'], teacherIds: [], department: 'Construction',
    createdAt: '2025-09-01T00:00:00Z', updatedAt: '2025-09-01T00:00:00Z'
  },
  {
    id: 'comb-general-science-archived', schoolId: 'school-es-rubengera-01', name: 'General Science', code: 'GSC',
    educationLevel: 'O-Level', academicProgramme: 'General Science',
    description: 'Discontinued O-Level combination; historical records only.', academicYear: '2025 - 2026', status: 'ARCHIVED',
    subjects: [{ subjectId: 'subj-math', isRequired: true, teacherIds: [] }],
    classIds: ['class-s3-a'], teacherIds: [], department: 'Science',
    createdAt: '2025-09-01T00:00:00Z', updatedAt: '2025-09-01T00:00:00Z'
  },
  {
    id: 'comb-languages-archived', schoolId: 'school-es-rubengera-01', name: 'Languages', code: 'LAN',
    educationLevel: 'O-Level', academicProgramme: 'Languages',
    description: 'Discontinued O-Level combination; historical records only.', academicYear: '2025 - 2026', status: 'ARCHIVED',
    subjects: [
      { subjectId: 'subj-english', isRequired: true, teacherIds: [] },
      { subjectId: 'subj-kinyarwanda', isRequired: true, teacherIds: [] }
    ],
    classIds: ['class-s3-a'], teacherIds: [], department: 'Languages',
    createdAt: '2025-09-01T00:00:00Z', updatedAt: '2025-09-01T00:00:00Z'
  }
];

export const initialSubjects: Subject[] = [
  {
    id: 'subj-web-dev',
    schoolId: 'school-es-rubengera-01',
    name: 'Web Application Development',
    code: 'SOD401',
    department: 'Software Development',
    credits: 5,
    passMark: 50
  },
  {
    id: 'subj-db-design',
    schoolId: 'school-es-rubengera-01',
    name: 'Database Architecture & SQL',
    code: 'SOD402',
    department: 'Software Development',
    credits: 5,
    passMark: 50
  },
  {
    id: 'subj-math',
    schoolId: 'school-es-rubengera-01',
    name: 'Applied Mathematics & Statistics',
    code: 'MTH401',
    department: 'Mathematics',
    credits: 4,
    passMark: 50
  },
  {
    id: 'subj-english',
    schoolId: 'school-es-rubengera-01',
    name: 'Professional English & Communication',
    code: 'ENG401',
    department: 'Languages',
    credits: 3,
    passMark: 50
  },
  {
    id: 'subj-kinyarwanda',
    schoolId: 'school-es-rubengera-01',
    name: 'Ikinyarwanda n’Umuco Nyarwanda',
    code: 'KIN401',
    department: 'Languages',
    credits: 3,
    passMark: 50
  },
  {
    id: 'subj-entrepreneurship',
    schoolId: 'school-es-rubengera-01',
    name: 'Entrepreneurship & Innovation',
    code: 'ENT401',
    department: 'Business & Management',
    credits: 3,
    passMark: 50
  }
];

export const initialStudents: Student[] = [
  {
    id: 'std-kevin-ishimwe-01',
    schoolId: 'school-es-rubengera-01',
    admissionNumber: 'ESR-2024-0104',
    firstName: 'Kevin',
    lastName: 'Ishimwe',
    gender: 'M',
    dob: '2008-04-12',
    classId: 'class-l4-sod-a',
    className: 'Level 4 SOD A',
    combination: 'Software Development (SOD)',
    enrollmentStatus: 'ACTIVE',
    admissionDate: '2024-09-02',
    bloodGroup: 'O+',
    allergies: 'Penicillin (Allergie kuri Pénicilline)',
    medicalNotes: 'Has mild asthma, keeps rescue inhaler at school infirmary.',
    photoUrl: 'https://images.unsplash.com/photo-1539571696357-5a69c17a67c6?w=200',
    nationalId: '1200880123456789',
    previousSchool: 'GS Rubengera Catholique'
  },
  {
    id: 'std-divine-keza-02',
    schoolId: 'school-es-rubengera-01',
    admissionNumber: 'ESR-2024-0105',
    firstName: 'Divine',
    lastName: 'Keza',
    gender: 'F',
    dob: '2008-08-23',
    classId: 'class-l4-sod-a',
    className: 'Level 4 SOD A',
    combination: 'Software Development (SOD)',
    enrollmentStatus: 'ACTIVE',
    admissionDate: '2024-09-02',
    bloodGroup: 'A+',
    allergies: 'None recorded',
    medicalNotes: 'None',
    photoUrl: 'https://images.unsplash.com/photo-1517841905240-472988babdf9?w=200',
    nationalId: '1200880987654321',
    previousSchool: 'ES Kirinda'
  },
  {
    id: 'std-eric-uwitonze-03',
    schoolId: 'school-es-rubengera-01',
    admissionNumber: 'ESR-2024-0106',
    firstName: 'Eric',
    lastName: 'Uwitonze',
    gender: 'M',
    dob: '2007-11-15',
    classId: 'class-l4-sod-a',
    className: 'Level 4 SOD A',
    combination: 'Software Development (SOD)',
    enrollmentStatus: 'ACTIVE',
    admissionDate: '2024-09-02',
    bloodGroup: 'B+',
    allergies: 'Dust mite sensitivity',
    medicalNotes: 'Sports athlete - track & basketball',
    photoUrl: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=200',
    previousSchool: 'GS Kibuye'
  },
  {
    id: 'std-sandrine-mutoni-04',
    schoolId: 'school-es-rubengera-01',
    admissionNumber: 'ESR-2024-0107',
    firstName: 'Sandrine',
    lastName: 'Mutoni',
    gender: 'F',
    dob: '2008-01-30',
    classId: 'class-l4-sod-a',
    className: 'Level 4 SOD A',
    combination: 'Software Development (SOD)',
    enrollmentStatus: 'ACTIVE',
    admissionDate: '2024-09-02',
    bloodGroup: 'AB+',
    photoUrl: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=200',
    previousSchool: 'GS Karongi'
  },
  {
    id: 'std-jeanpaul-habineza-05',
    schoolId: 'school-es-rubengera-01',
    admissionNumber: 'ESR-2024-0108',
    firstName: 'Jean-Paul',
    lastName: 'Habineza',
    gender: 'M',
    dob: '2007-06-19',
    classId: 'class-l4-cst',
    className: 'Level 4 CST',
    combination: 'Building & Construction',
    enrollmentStatus: 'ACTIVE',
    admissionDate: '2024-09-02',
    bloodGroup: 'O-',
    photoUrl: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=200'
  },
  {
    id: 'std-clarisse-uwera-06',
    schoolId: 'school-es-rubengera-01',
    admissionNumber: 'ESR-2024-0109',
    firstName: 'Clarisse',
    lastName: 'Uwera',
    gender: 'F',
    dob: '2009-03-14',
    classId: 'class-s3-a',
    className: 'Senior 3 A',
    combination: 'General Science & Languages',
    enrollmentStatus: 'ACTIVE',
    admissionDate: '2024-09-02',
    bloodGroup: 'O+',
    photoUrl: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=200',
    medicalNotes: 'Sibling of Kevin Ishimwe'
  }
];

export const initialGuardians: Guardian[] = [
  {
    id: 'grd-chantal-01',
    schoolId: 'school-es-rubengera-01',
    fullName: 'Chantal Mukantabana',
    relationship: 'MOTHER',
    phone: '+250 788 888 707',
    altPhone: '+250 722 341 902',
    email: 'chantal.mukantabana@gmail.com',
    nationalId: '1198070014285714',
    occupation: 'Teacher & Agricultural Cooperative Manager',
    address: 'Rubengera Sector, Gitwa Cell, Karongi District',
    preferredLanguage: 'rw',
    preferredChannel: 'WHATSAPP',
    isVerified: true,
    canPickup: true,
    emergencyPriority: 1
  },
  {
    id: 'grd-celestin-02',
    schoolId: 'school-es-rubengera-01',
    fullName: 'Celestin Gasana',
    relationship: 'FATHER',
    phone: '+250 788 456 789',
    altPhone: '+250 733 998 877',
    email: 'celestin.gasana@karongi.gov.rw',
    nationalId: '1197880029384756',
    occupation: 'Civil Engineer',
    address: 'Kibuye Town, Karongi District',
    preferredLanguage: 'rw',
    preferredChannel: 'SMS',
    isVerified: true,
    canPickup: true,
    emergencyPriority: 1
  },
  {
    id: 'grd-angelique-03',
    schoolId: 'school-es-rubengera-01',
    fullName: 'Angelique Nyirandikubwimana',
    relationship: 'MOTHER',
    phone: '+250 788 912 345',
    email: 'angelique.nyira@yahoo.fr',
    address: 'Bwishyura Sector, Karongi District',
    preferredLanguage: 'rw',
    preferredChannel: 'SMS',
    isVerified: true,
    canPickup: true,
    emergencyPriority: 1
  }
];

export const initialStudentGuardians: StudentGuardianLink[] = [
  {
    studentId: 'std-kevin-ishimwe-01',
    guardianId: 'grd-chantal-01',
    relationship: 'MOTHER',
    emergencyPriority: 1,
    canPickup: true,
    isPrimary: true
  },
  {
    studentId: 'std-clarisse-uwera-06',
    guardianId: 'grd-chantal-01',
    relationship: 'MOTHER',
    emergencyPriority: 1,
    canPickup: true,
    isPrimary: true
  },
  {
    studentId: 'std-eric-uwitonze-03',
    guardianId: 'grd-celestin-02',
    relationship: 'FATHER',
    emergencyPriority: 1,
    canPickup: true,
    isPrimary: true
  },
  {
    studentId: 'std-divine-keza-02',
    guardianId: 'grd-angelique-03',
    relationship: 'MOTHER',
    emergencyPriority: 1,
    canPickup: true,
    isPrimary: true
  }
];

export const initialAttendance: AttendanceRecord[] = [
  {
    id: 'att-01',
    schoolId: 'school-es-rubengera-01',
    studentId: 'std-kevin-ishimwe-01',
    studentName: 'Kevin Ishimwe',
    classId: 'class-l4-sod-a',
    className: 'Level 4 SOD A',
    date: '2026-11-05',
    status: 'PRESENT',
    recordedByStaffId: 'user-teacher',
    recordedByName: 'Patrick Nshimiyimana',
    parentNotified: false
  },
  {
    id: 'att-02',
    schoolId: 'school-es-rubengera-01',
    studentId: 'std-divine-keza-02',
    studentName: 'Divine Keza',
    classId: 'class-l4-sod-a',
    className: 'Level 4 SOD A',
    date: '2026-11-05',
    status: 'PRESENT',
    recordedByStaffId: 'user-teacher',
    recordedByName: 'Patrick Nshimiyimana',
    parentNotified: false
  },
  {
    id: 'att-03',
    schoolId: 'school-es-rubengera-01',
    studentId: 'std-eric-uwitonze-03',
    studentName: 'Eric Uwitonze',
    classId: 'class-l4-sod-a',
    className: 'Level 4 SOD A',
    date: '2026-11-05',
    status: 'ABSENT',
    recordedByStaffId: 'user-teacher',
    recordedByName: 'Patrick Nshimiyimana',
    remarks: 'Unexplained absence at morning roll-call (8:00 AM)',
    parentNotified: true,
    parentExplanation: 'Family had medical appointment in Kigali; arriving by 1:00 PM.'
  },
  {
    id: 'att-04',
    schoolId: 'school-es-rubengera-01',
    studentId: 'std-sandrine-mutoni-04',
    studentName: 'Sandrine Mutoni',
    classId: 'class-l4-sod-a',
    className: 'Level 4 SOD A',
    date: '2026-11-05',
    status: 'LATE',
    recordedByStaffId: 'user-teacher',
    recordedByName: 'Patrick Nshimiyimana',
    remarks: 'Arrived at 8:25 AM due to rain delay on Rubengera road',
    parentNotified: true
  },
  {
    id: 'att-05',
    schoolId: 'school-es-rubengera-01',
    studentId: 'std-kevin-ishimwe-01',
    studentName: 'Kevin Ishimwe',
    classId: 'class-l4-sod-a',
    className: 'Level 4 SOD A',
    date: '2026-11-04',
    status: 'PRESENT',
    recordedByStaffId: 'user-teacher',
    recordedByName: 'Patrick Nshimiyimana',
    parentNotified: false
  },
  {
    id: 'att-06',
    schoolId: 'school-es-rubengera-01',
    studentId: 'std-clarisse-uwera-06',
    studentName: 'Clarisse Uwera',
    classId: 'class-s3-a',
    className: 'Senior 3 A',
    date: '2026-11-05',
    status: 'PRESENT',
    recordedByStaffId: 'user-teacher',
    recordedByName: 'Jeannette Mukarugwiza',
    parentNotified: false
  }
];

export const initialHealthIncidents: HealthIncident[] = [
  {
    id: 'inc-2026-0042',
    schoolId: 'school-es-rubengera-01',
    referenceNumber: 'EMG-2026-0042',
    studentId: 'std-kevin-ishimwe-01',
    studentName: 'Kevin Ishimwe',
    studentClass: 'Level 4 SOD A',
    date: '2026-11-05',
    time: '09:20',
    category: 'ILLNESS',
    priority: 'URGENT',
    symptoms: 'High fever (39.2°C), severe shivering, dizziness and headache during Coding practical exam.',
    observations: 'Student felt cold despite warm ambient temperature; rapid pulse (105 bpm). Suspected acute malaria.',
    temperature: '39.2 °C',
    pulse: '105 bpm',
    actionsTaken: 'Administered oral rehydration, sponge bath to reduce temperature. Kept in school infirmary bed under observation. Contacted mother immediately.',
    responsibleStaffName: 'Aline Uwimana (School Nurse)',
    guardianId: 'grd-chantal-01',
    guardianName: 'Chantal Mukantabana (Mother)',
    guardianPhone: '+250 788 888 707',
    contactStatus: 'ACKNOWLEDGED',
    parentAcknowledged: true,
    parentAcknowledgedAt: '2026-11-05T09:42:10Z',
    parentResponseNotes: 'Mother acknowledged via WhatsApp. Arranging taxi to take Kevin to Rubengera Health Center for RDT blood test.',
    handoverArrangement: 'Mother Chantal arrived at school gate at 10:15 AM with identity card.',
    medicalReferral: 'Rubengera Health Center (Centre de Santé Rubengera)',
    outcome: 'REFERRED_TO_HOSPITAL',
    resolved: false,
    createdAt: '2026-11-05T09:25:00Z',
    timeline: [
      {
        time: '09:20',
        action: 'Student arrived at infirmary accompanied by Class Prefect.',
        actor: 'Aline Uwimana (Nurse)'
      },
      {
        time: '09:28',
        action: 'Vitals recorded: Temp 39.2°C, Pulse 105 bpm. Priority elevated to URGENT.',
        actor: 'Aline Uwimana (Nurse)'
      },
      {
        time: '09:32',
        action: 'Dispatched automated WhatsApp & SMS alert to primary guardian Chantal Mukantabana.',
        actor: 'System Care Engine'
      },
      {
        time: '09:42',
        action: 'Guardian Chantal acknowledged via SchoolCare Parent App with arrival ETA.',
        actor: 'Chantal Mukantabana (Parent)'
      },
      {
        time: '10:15',
        action: 'Handover completed at infirmary gate with official exit slip ESR-EX-88.',
        actor: 'Claire Mukamana (Deputy Head)'
      }
    ]
  },
  {
    id: 'inc-2026-0043',
    schoolId: 'school-es-rubengera-01',
    referenceNumber: 'EMG-2026-0043',
    studentId: 'std-eric-uwitonze-03',
    studentName: 'Eric Uwitonze',
    studentClass: 'Level 4 SOD A',
    date: '2026-11-04',
    time: '16:15',
    category: 'INJURY',
    priority: 'ROUTINE',
    symptoms: 'Mild right ankle sprain during inter-class soccer training on school playground.',
    observations: 'Swelling around lateral malleolus, able to bear partial weight. No deformity.',
    temperature: '36.8 °C',
    actionsTaken: 'Applied R.I.C.E. protocol (Rest, Ice pack 20 min, Elastic compression bandage, elevation).',
    responsibleStaffName: 'Aline Uwimana (School Nurse)',
    guardianId: 'grd-celestin-02',
    guardianName: 'Celestin Gasana (Father)',
    guardianPhone: '+250 788 456 789',
    contactStatus: 'REACHED',
    parentAcknowledged: true,
    parentAcknowledgedAt: '2026-11-04T16:45:00Z',
    parentResponseNotes: 'Father reached via phone call. Advised that student will rest at home next day.',
    outcome: 'PICKED_UP_BY_GUARDIAN',
    resolved: true,
    createdAt: '2026-11-04T16:20:00Z',
    timeline: [
      {
        time: '16:15',
        action: 'Arrived at infirmary helped by sports coach.',
        actor: 'Coach Alexis'
      },
      {
        time: '16:25',
        action: 'Bandage and cold compression applied.',
        actor: 'Aline Uwimana (Nurse)'
      },
      {
        time: '16:40',
        action: 'Father contacted and confirmed pickup.',
        actor: 'Aline Uwimana (Nurse)'
      }
    ]
  }
];

export const initialNotifications: NotificationMessage[] = [
  {
    id: 'msg-01',
    schoolId: 'school-es-rubengera-01',
    recipientId: 'grd-chantal-01',
    recipientName: 'Chantal Mukantabana',
    recipientPhone: '+250 788 888 707',
    recipientEmail: 'chantal.mukantabana@gmail.com',
    channel: 'WHATSAPP',
    category: 'HEALTH',
    priority: 'URGENT',
    titleEn: 'URGENT HEALTH ALERT: Kevin Ishimwe at Infirmary',
    titleRw: 'UBUTUMWA BW’UBUZIMA BWIKUBYE: Kevin Ishimwe ari mu Buvuzi bw’Ishuri',
    contentEn: 'Dear Chantal, your son Kevin Ishimwe (L4 SOD A) is currently receiving care at the school infirmary with high fever (39.2°C). Please review and acknowledge in SchoolCare app or call Nurse Aline: +250 788 666 505.',
    contentRw: 'Mubyeyi Chantal, umuhungu wawe Kevin Ishimwe (L4 SOD A) ari kwitabwaho mu buvuzi bw’ishuri afite umuriro mwinshi (39.2°C). Nyamuneka kanda hano wemeze cyangwa uhamagare Umuganga Aline: +250 788 666 505.',
    status: 'ACKNOWLEDGED',
    provider: 'WHATSAPP_CLOUD_API',
    providerReference: 'wamid.HBgLMjUwNzg4ODg4NzA3FQIAERgSRTI0OTY2OTY1QTQzOTQ0N0E5AA==',
    acknowledgedAt: '2026-11-05T09:42:10Z',
    createdAt: '2026-11-05T09:32:00Z',
    relatedEntityId: 'inc-2026-0042'
  },
  {
    id: 'msg-02',
    schoolId: 'school-es-rubengera-01',
    recipientId: 'grd-celestin-02',
    recipientName: 'Celestin Gasana',
    recipientPhone: '+250 788 456 789',
    channel: 'SMS',
    category: 'ATTENDANCE',
    priority: 'ROUTINE',
    titleEn: 'Absence Notification: Eric Uwitonze',
    titleRw: 'Kumenyesha Gusiba: Eric Uwitonze',
    contentEn: 'Notice: Eric Uwitonze (L4 SOD A) was recorded absent today 05/11/2026 at morning roll call. If this is unexpected, kindly contact the school or reply in portal.',
    contentRw: 'Icyitonderwa: Eric Uwitonze (L4 SOD A) ntiyabonetse ku ishuri uyu munsi 05/11/2026 mu gitondo. Niba mutabizi, mwamenyesha ubuyobozi bw’ishuri.',
    status: 'DELIVERED',
    provider: 'MTN_RW_SMS_GATEWAY',
    providerReference: 'MTN-SMS-884920',
    createdAt: '2026-11-05T08:35:00Z'
  },
  {
    id: 'msg-03',
    schoolId: 'school-es-rubengera-01',
    recipientId: 'grd-chantal-01',
    recipientName: 'Chantal Mukantabana',
    recipientPhone: '+250 788 888 707',
    channel: 'IN_APP',
    category: 'ACADEMIC',
    priority: 'ROUTINE',
    titleEn: 'Term 1 Report Card Approved: Kevin Ishimwe',
    titleRw: 'Indangamanota y’Igihembwe cya 1 Yemejwe: Kevin Ishimwe',
    contentEn: 'Official REB/RTB Term 1 report card for Kevin Ishimwe is now approved by Head Teacher. Score: 84.5% (Rank 3/38). You can view and download the official PDF.',
    contentRw: 'Indangamanota yemewe y’igihembwe cya 1 ya Kevin Ishimwe yamaze kwemezwa n’Umuyobozi w’Ishuri. Amanota: 84.5% (Umwanya wa 3/38). Ushobora kuyireba.',
    status: 'DELIVERED',
    provider: 'SYSTEM_IN_APP',
    createdAt: '2026-11-03T14:00:00Z'
  }
];

export const initialFeeStructures: FeeStructure[] = [
  {
    id: 'fee-t2-2026',
    schoolId: 'school-es-rubengera-01',
    title: 'Term 2 Tuition, Meals & Practical Workshop Fee',
    academicYear: '2025 - 2026',
    term: 'Term 2',
    classIds: ['class-l4-sod-a', 'class-l5-sod-b', 'class-l4-cst'],
    amountRwf: 85000,
    description: 'Includes TVET computer lab internet bundle, lunch program, medical insurance supplement, and practical exam materials.',
    dueDate: '2026-11-30'
  },
  {
    id: 'fee-t2-s3',
    schoolId: 'school-es-rubengera-01',
    title: 'Term 2 O-Level Tuition & Science Lab Fee',
    academicYear: '2025 - 2026',
    term: 'Term 2',
    classIds: ['class-s3-a'],
    amountRwf: 65000,
    description: 'Covers ordinary level tuition, science lab reagents, and school library access.',
    dueDate: '2026-11-30'
  }
];

export const initialInvoices: Invoice[] = [
  {
    id: 'inv-01',
    schoolId: 'school-es-rubengera-01',
    invoiceNumber: 'INV-2026-0042',
    studentId: 'std-kevin-ishimwe-01',
    studentName: 'Kevin Ishimwe',
    className: 'Level 4 SOD A',
    term: 'Term 2',
    title: 'Term 2 Tuition & Practical Lab Fee',
    totalAmountRwf: 85000,
    paidAmountRwf: 50000,
    balanceRwf: 35000,
    dueDate: '2026-11-30',
    status: 'PARTIAL',
    createdAt: '2026-10-15'
  },
  {
    id: 'inv-02',
    schoolId: 'school-es-rubengera-01',
    invoiceNumber: 'inv-2026-0043',
    studentId: 'std-divine-keza-02',
    studentName: 'Divine Keza',
    className: 'Level 4 SOD A',
    term: 'Term 2',
    title: 'Term 2 Tuition & Practical Lab Fee',
    totalAmountRwf: 85000,
    paidAmountRwf: 85000,
    balanceRwf: 0,
    dueDate: '2026-11-30',
    status: 'PAID',
    createdAt: '2026-10-15'
  },
  {
    id: 'inv-03',
    schoolId: 'school-es-rubengera-01',
    invoiceNumber: 'INV-2026-0044',
    studentId: 'std-clarisse-uwera-06',
    studentName: 'Clarisse Uwera',
    className: 'Senior 3 A',
    term: 'Term 2',
    title: 'Term 2 O-Level Tuition Fee',
    totalAmountRwf: 65000,
    paidAmountRwf: 65000,
    balanceRwf: 0,
    dueDate: '2026-11-30',
    status: 'PAID',
    createdAt: '2026-10-15'
  }
];

export const initialPayments: Payment[] = [
  {
    id: 'pay-01',
    schoolId: 'school-es-rubengera-01',
    invoiceId: 'inv-01',
    receiptNumber: 'REC-2026-0091',
    studentId: 'std-kevin-ishimwe-01',
    studentName: 'Kevin Ishimwe',
    amountRwf: 50000,
    method: 'MTN_MOMO',
    reference: 'MTN-MOMO-RW-9823412',
    payerName: 'Chantal Mukantabana',
    payerPhone: '+250 788 888 707',
    status: 'COMPLETED',
    date: '2026-10-22'
  },
  {
    id: 'pay-02',
    schoolId: 'school-es-rubengera-01',
    invoiceId: 'inv-02',
    receiptNumber: 'REC-2026-0092',
    studentId: 'std-divine-keza-02',
    studentName: 'Divine Keza',
    amountRwf: 85000,
    method: 'BANK_TRANSFER',
    reference: 'BK-TRF-003847291',
    payerName: 'Angelique Nyirandikubwimana',
    payerPhone: '+250 788 912 345',
    status: 'COMPLETED',
    date: '2026-10-18'
  }
];

export const initialStaff: StaffMember[] = [
  {
    id: 'stf-01',
    schoolId: 'school-es-rubengera-01',
    staffId: 'STF-001',
    fullName: 'Jean Bosco Mugiraneza',
    gender: 'M',
    role: 'ANIMATEUR',
    title: 'Animateur / Student Activities Coordinator',
    department: 'Co-Curricular & Student Welfare',
    phone: '+250 788 333 202',
    email: 'headteacher@esrubengera.rw',
    assignedClasses: [],
    assignedSubjects: [],
    status: 'ACTIVE',
    joinedDate: '2018-01-10'
  },
  {
    id: 'stf-02',
    schoolId: 'school-es-rubengera-01',
    staffId: 'STF-002',
    fullName: 'Claire Mukamana',
    gender: 'F',
    role: 'DEPUTY_HEAD',
    title: 'Dean of Studies & Discipline',
    department: 'Academic Coordination',
    phone: '+250 788 444 303',
    email: 'deputy@esrubengera.rw',
    assignedClasses: ['Level 5 SOD B'],
    assignedSubjects: ['Professional English'],
    status: 'ACTIVE',
    joinedDate: '2019-09-01'
  },
  {
    id: 'stf-03',
    schoolId: 'school-es-rubengera-01',
    staffId: 'STF-003',
    fullName: 'Patrick Nshimiyimana',
    gender: 'M',
    role: 'TEACHER',
    title: 'Lead Software & TVET Instructor',
    department: 'Software Development & ICT',
    phone: '+250 788 555 404',
    email: 'teacher@esrubengera.rw',
    assignedClasses: ['Level 4 SOD A', 'Level 5 SOD B'],
    assignedSubjects: ['Web Application Development', 'Database Architecture & SQL'],
    status: 'ACTIVE',
    joinedDate: '2021-02-15'
  },
  {
    id: 'stf-04',
    schoolId: 'school-es-rubengera-01',
    staffId: 'STF-004',
    fullName: 'Aline Uwimana',
    gender: 'F',
    role: 'NURSE',
    title: 'School Health Officer & Nurse',
    department: 'Infirmary & Student Wellbeing',
    phone: '+250 788 666 505',
    email: 'nurse@esrubengera.rw',
    assignedClasses: [],
    assignedSubjects: [],
    status: 'ACTIVE',
    joinedDate: '2020-03-01'
  },
  {
    id: 'stf-05',
    schoolId: 'school-es-rubengera-01',
    staffId: 'STF-005',
    fullName: 'Eric Bizimana',
    gender: 'M',
    role: 'ACCOUNTANT',
    title: 'Chief Accountant & Bursar',
    department: 'Finance & Administration',
    phone: '+250 788 777 606',
    email: 'accountant@esrubengera.rw',
    assignedClasses: [],
    assignedSubjects: [],
    status: 'ACTIVE',
    joinedDate: '2019-01-15'
  },
  {
    id: 'stf-06',
    schoolId: 'school-es-rubengera-01',
    staffId: 'STF-006',
    fullName: 'Dr. Emmanuel Habimana',
    gender: 'M',
    role: 'HEAD_TEACHER',
    title: 'Headteacher',
    department: 'School Leadership',
    phone: '+250 788 111 000',
    email: 'esrubengera@gmail.com',
    assignedClasses: [],
    assignedSubjects: [],
    status: 'ACTIVE',
    joinedDate: '2015-08-01'
  }
];

export const initialTimetable: TimetableEntry[] = [
  {
    id: 'tt-01',
    schoolId: 'school-es-rubengera-01',
    classId: 'class-l4-sod-a',
    className: 'Level 4 SOD A',
    dayOfWeek: 'MON',
    startTime: '08:00',
    endTime: '09:40',
    subjectName: 'Web Application Development',
    teacherName: 'Patrick Nshimiyimana',
    room: 'Lab 2 - ICT Building'
  },
  {
    id: 'tt-02',
    schoolId: 'school-es-rubengera-01',
    classId: 'class-l4-sod-a',
    className: 'Level 4 SOD A',
    dayOfWeek: 'MON',
    startTime: '10:00',
    endTime: '11:40',
    subjectName: 'Database Architecture & SQL',
    teacherName: 'Patrick Nshimiyimana',
    room: 'Lab 2 - ICT Building'
  },
  {
    id: 'tt-03',
    schoolId: 'school-es-rubengera-01',
    classId: 'class-l4-sod-a',
    className: 'Level 4 SOD A',
    dayOfWeek: 'TUE',
    startTime: '08:00',
    endTime: '09:40',
    subjectName: 'Applied Mathematics & Statistics',
    teacherName: 'Jean Damascene Kayitare',
    room: 'Block A - Room 102'
  },
  {
    id: 'tt-04',
    schoolId: 'school-es-rubengera-01',
    classId: 'class-l4-sod-a',
    className: 'Level 4 SOD A',
    dayOfWeek: 'WED',
    startTime: '08:00',
    endTime: '11:40',
    subjectName: 'Full-Stack Practical Project Lab',
    teacherName: 'Patrick Nshimiyimana',
    room: 'Lab 1 - Innovation Center'
  },
  {
    id: 'tt-05',
    schoolId: 'school-es-rubengera-01',
    classId: 'class-l4-sod-a',
    className: 'Level 4 SOD A',
    dayOfWeek: 'THU',
    startTime: '13:30',
    endTime: '15:10',
    subjectName: 'Professional English & Communication',
    teacherName: 'Claire Mukamana',
    room: 'Block B - Room 104'
  },
  {
    id: 'tt-06',
    schoolId: 'school-es-rubengera-01',
    classId: 'class-l4-sod-a',
    className: 'Level 4 SOD A',
    dayOfWeek: 'FRI',
    startTime: '10:00',
    endTime: '11:40',
    subjectName: 'Entrepreneurship & Innovation',
    teacherName: 'Eric Bizimana',
    room: 'Auditorium'
  }
];

export const initialHomework: HomeworkAssignment[] = [
  {
    id: 'hw-01',
    schoolId: 'school-es-rubengera-01',
    classId: 'class-l4-sod-a',
    className: 'Level 4 SOD A',
    subjectName: 'Web Application Development',
    teacherName: 'Patrick Nshimiyimana',
    title: 'Responsive Dashboard Design using Tailwind & Semantic HTML',
    description: 'Implement a mobile-friendly 3-column school dashboard mockup with accessible color contrast and clean component structure.',
    assignedDate: '2026-11-03',
    dueDate: '2026-11-10',
    maxPoints: 100,
    submissionsCount: 24
  },
  {
    id: 'hw-02',
    schoolId: 'school-es-rubengera-01',
    classId: 'class-l4-sod-a',
    className: 'Level 4 SOD A',
    subjectName: 'Database Architecture & SQL',
    teacherName: 'Patrick Nshimiyimana',
    title: 'Relational Schema Design for Hospital Clinic Registry',
    description: 'Design 3NF tables with foreign keys, indexes, and write 5 complex JOIN queries.',
    assignedDate: '2026-11-01',
    dueDate: '2026-11-08',
    maxPoints: 50,
    submissionsCount: 31
  }
];

export const initialReportCards: ReportCard[] = [
  {
    id: 'rc-kevin-t1',
    schoolId: 'school-es-rubengera-01',
    studentId: 'std-kevin-ishimwe-01',
    studentName: 'Kevin Ishimwe',
    admissionNumber: 'ESR-2024-0104',
    className: 'Level 4 SOD A',
    combination: 'Software Development (SOD)',
    academicYear: '2025 - 2026',
    term: 'Term 1',
    subjects: [
      {
        subjectName: 'Web Application Development',
        subjectCode: 'SOD401',
        catScore: 28,
        catMax: 30,
        examScore: 61,
        examMax: 70,
        totalPercent: 89,
        grade: 'A',
        rankInClass: 2,
        teacherComment: 'Outstanding programming logic, excels in modern frontend design.'
      },
      {
        subjectName: 'Database Architecture & SQL',
        subjectCode: 'SOD402',
        catScore: 26,
        catMax: 30,
        examScore: 59,
        examMax: 70,
        totalPercent: 85,
        grade: 'A',
        rankInClass: 3,
        teacherComment: 'Thorough understanding of relational schemas and transaction safety.'
      },
      {
        subjectName: 'Applied Mathematics',
        subjectCode: 'MTH401',
        catScore: 24,
        catMax: 30,
        examScore: 55,
        examMax: 70,
        totalPercent: 79,
        grade: 'B+',
        rankInClass: 6,
        teacherComment: 'Good analytical precision, continues to make steady progress.'
      },
      {
        subjectName: 'Professional English',
        subjectCode: 'ENG401',
        catScore: 27,
        catMax: 30,
        examScore: 58,
        examMax: 70,
        totalPercent: 85,
        grade: 'A',
        rankInClass: 4,
        teacherComment: 'Speaks and writes articulately; excellent technical presentation skills.'
      },
      {
        subjectName: 'Ikinyarwanda n’Umuco',
        subjectCode: 'KIN401',
        catScore: 26,
        catMax: 30,
        examScore: 59,
        examMax: 70,
        totalPercent: 85,
        grade: 'A',
        rankInClass: 3,
        teacherComment: 'Akoresha Ikinyarwanda gitunganye kandi yubaha indangagaciro z’umuco.'
      }
    ],
    overallAverage: 84.6,
    overallRank: 3,
    totalStudentsInClass: 38,
    attendanceDaysPresent: 64,
    attendanceTotalDays: 65,
    conductScore: '40 / 40 (Imyitwarire Myiza Cyane / Exemplary)',
    classTeacherRemarks: 'A brilliant, disciplined, and helpful student who actively assists peers in the ICT laboratory.',
    headTeacherRemarks: 'Promoted with high honors. Recommended for the National TVET Innovation competition.',
    isApproved: true,
    publishedAt: '2026-04-10'
  }
];

export const initialEvents: SchoolEvent[] = [
  {
    id: 'evt-01',
    schoolId: 'school-es-rubengera-01',
    titleEn: 'Annual General Assembly with Parents (Inama Rusange y’Ababyeyi)',
    titleRw: 'Inama Rusange y’Ababyeyi n’Ubuyobozi bw’Ishuri',
    descriptionEn: 'Discussion on academic progress, TVET certification, and campus infrastructure expansion.',
    descriptionRw: 'Kuganira ku mitsindire y’abanyeshuri, imyiteguro y’ibizamini bya Leta n’ubuzima bw’ishuri.',
    date: '2026-11-20',
    time: '09:00 AM - 1:00 PM',
    category: 'PARENT_MEETING',
    targetAudience: 'PARENTS'
  },
  {
    id: 'evt-02',
    schoolId: 'school-es-rubengera-01',
    titleEn: 'RTB Inter-School Coding & Robotics Showcase',
    titleRw: 'Imurikabikorwa ry’Ikoranabuhanga mu Mashuri ya RTB',
    descriptionEn: 'Live student demonstrations of software and embedded systems projects.',
    descriptionRw: 'Kumurika imishinga y’ikoranabuhanga n’iterambere ryakozwe n’abanyeshuri ba SOD.',
    date: '2026-12-05',
    time: '10:00 AM',
    category: 'ACADEMIC',
    targetAudience: 'ALL'
  }
];

export const initialAuditLogs: AuditLogEntry[] = [
  {
    id: 'log-01',
    schoolId: 'school-es-rubengera-01',
    userId: 'user-nurse',
    userName: 'Aline Uwimana',
    userRole: 'NURSE',
    action: 'CREATE_HEALTH_INCIDENT',
    entityType: 'HEALTH_INCIDENT',
    entityId: 'inc-2026-0042',
    details: 'Logged urgent health incident for Kevin Ishimwe (Temp 39.2°C). Dispatched guardian SMS/WhatsApp notification.',
    ipAddress: '197.243.18.42',
    timestamp: '2026-11-05T09:25:00Z'
  },
  {
    id: 'log-02',
    schoolId: 'school-es-rubengera-01',
    userId: 'user-parent',
    userName: 'Chantal Mukantabana',
    userRole: 'PARENT',
    action: 'ACKNOWLEDGE_HEALTH_ALERT',
    entityType: 'HEALTH_INCIDENT',
    entityId: 'inc-2026-0042',
    details: 'Guardian acknowledged emergency alert via SchoolCare Parent Portal with hospital transfer note.',
    ipAddress: '197.243.22.11',
    timestamp: '2026-11-05T09:42:10Z'
  },
  {
    id: 'log-03',
    schoolId: 'school-es-rubengera-01',
    userId: 'user-teacher',
    userName: 'Patrick Nshimiyimana',
    userRole: 'TEACHER',
    action: 'RECORD_DAILY_ATTENDANCE',
    entityType: 'ATTENDANCE_SESSION',
    entityId: 'class-l4-sod-a-2026-11-05',
    details: 'Recorded daily attendance for Level 4 SOD A. 36 Present, 1 Absent, 1 Late.',
    ipAddress: '197.243.18.44',
    timestamp: '2026-11-05T08:30:00Z'
  }
];

// --- Academic management seed (additive; existing records are unchanged) ---

export const initialAcademicYears: AcademicYear[] = [
  {
    id: 'ay-2025-2026',
    schoolId: 'school-es-rubengera-01',
    name: '2025 - 2026',
    startDate: '2025-09-01',
    endDate: '2026-08-31',
    isActive: true,
    createdAt: '2025-09-01T00:00:00Z'
  }
];

export const initialTerms: AcademicTerm[] = [
  {
    id: 'term-2025-2026-1',
    schoolId: 'school-es-rubengera-01',
    academicYearId: 'ay-2025-2026',
    name: 'Term 1',
    isActive: false,
    createdAt: '2025-09-01T00:00:00Z'
  },
  {
    id: 'term-2025-2026-2',
    schoolId: 'school-es-rubengera-01',
    academicYearId: 'ay-2025-2026',
    name: 'Term 2',
    isActive: true,
    createdAt: '2026-01-05T00:00:00Z'
  },
  {
    id: 'term-2025-2026-3',
    schoolId: 'school-es-rubengera-01',
    academicYearId: 'ay-2025-2026',
    name: 'Term 3',
    isActive: false,
    createdAt: '2026-05-04T00:00:00Z'
  }
];

export const initialAssessmentCategories: AssessmentCategory[] = [
  {
    id: 'ac-coursework',
    schoolId: 'school-es-rubengera-01',
    code: 'COURSEWORK',
    name: 'Coursework / Continuous Assessment',
    maxMarks: 30,
    weightPercentage: 30,
    sortOrder: 1,
    isActive: true,
    createdAt: '2025-09-01T00:00:00Z'
  },
  {
    id: 'ac-test',
    schoolId: 'school-es-rubengera-01',
    code: 'TEST',
    name: 'Test',
    maxMarks: 20,
    weightPercentage: 20,
    sortOrder: 2,
    isActive: true,
    createdAt: '2025-09-01T00:00:00Z'
  },
  {
    id: 'ac-exam',
    schoolId: 'school-es-rubengera-01',
    code: 'EXAM',
    name: 'Examination',
    maxMarks: 50,
    weightPercentage: 50,
    sortOrder: 3,
    isActive: true,
    createdAt: '2025-09-01T00:00:00Z'
  }
];

export const initialGradingScales: GradingScale[] = [
  {
    id: 'gs-reb-rtb-default',
    schoolId: 'school-es-rubengera-01',
    name: 'REB / RTB Default Scale',
    passMark: 50,
    isActive: true,
    createdAt: '2025-09-01T00:00:00Z',
    gradeBoundaries: [
      { grade: 'A', minPercentage: 80, maxPercentage: 100, description: 'Excellent', descriptionRw: 'Indashyikirwa' },
      { grade: 'B', minPercentage: 70, maxPercentage: 79.99, description: 'Very Good', descriptionRw: 'Nziza cyane' },
      { grade: 'C', minPercentage: 60, maxPercentage: 69.99, description: 'Good', descriptionRw: 'Nziza' },
      { grade: 'D', minPercentage: 50, maxPercentage: 59.99, description: 'Satisfactory', descriptionRw: 'Iruhuje' },
      { grade: 'F', minPercentage: 0, maxPercentage: 49.99, description: 'Fail', descriptionRw: 'Ntibitsinze' }
    ]
  }
];

export const initialAcademicSettings: AcademicSettings[] = [
  {
    schoolId: 'school-es-rubengera-01',
    academicYearId: 'ay-2025-2026',
    termId: 'term-2025-2026-2',
    gradingScaleId: 'gs-reb-rtb-default',
    enableRanking: true,
    enablePromotionDecision: false,
    promotionPassAverage: 50,
    commentsRequiredBeforeApproval: false,
    submissionDeadlineDays: 14,
    updatedAt: '2026-01-05T00:00:00Z'
  }
];

export const initialClassSubjectAssignments = [
  {
    id: 'csa-l4-sod-web',
    schoolId: 'school-es-rubengera-01',
    academicYearId: 'ay-2025-2026',
    termId: 'term-2025-2026-2',
    classId: 'class-l4-sod-a',
    subjectId: 'subj-web-dev',
    teacherIds: ['user-teacher'],
    isActive: true,
    createdAt: '2026-01-05T00:00:00Z'
  },
  {
    id: 'csa-l4-sod-db',
    schoolId: 'school-es-rubengera-01',
    academicYearId: 'ay-2025-2026',
    termId: 'term-2025-2026-2',
    classId: 'class-l4-sod-a',
    subjectId: 'subj-db-design',
    teacherIds: ['user-teacher'],
    isActive: true,
    createdAt: '2026-01-05T00:00:00Z'
  },
  {
    id: 'csa-l4-sod-math',
    schoolId: 'school-es-rubengera-01',
    academicYearId: 'ay-2025-2026',
    termId: 'term-2025-2026-2',
    classId: 'class-l4-sod-a',
    subjectId: 'subj-math',
    teacherIds: ['user-teacher'],
    isActive: true,
    createdAt: '2026-01-05T00:00:00Z'
  }
];

export const initialClassTeacherAssignments = [
  {
    id: 'cta-l4-sod-a',
    schoolId: 'school-es-rubengera-01',
    academicYearId: 'ay-2025-2026',
    classId: 'class-l4-sod-a',
    teacherId: 'user-teacher',
    createdAt: '2026-01-05T00:00:00Z'
  }
];
