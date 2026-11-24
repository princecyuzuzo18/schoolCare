import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  BadgeCheck,
  Check,
  CheckCircle2,
  ClipboardList,
  FileCheck2,
  FileText,
  GraduationCap,
  HelpCircle,
  Loader2,
  LockKeyhole,
  Plus,
  Printer,
  School,
  ShieldCheck,
  Trash2,
  UploadCloud,
  UserRound,
  Users,
  X,
  ZoomIn
} from 'lucide-react';
import type {
  AcademicPerformanceData,
  AcademicResultSubject,
  AdmissionNotificationStatus,
  ApplicationStatus,
  ApplicationType,
  ResultSlipVerificationStatus
} from '../types';
import {
  api,
  type AdmissionDocumentUploadResponse,
  type PublicAdmissionSettings,
  type ResultSlipUploadResponse
} from '../services/api';
import { useAdmissionsCopy } from '../i18n/admissions';
import { useAuth } from '../contexts/AuthContext';
import { PublicLayout } from '../components/PublicSiteChrome';

/**
 * Public "Apply Here" UI.
 *
 * Frontend responsibilities: step navigation, validation, document selection,
 * review rendering and confirmation presentation.
 * Backend boundary: persistence happens only through `api.submitAdmissionApplication`.
 * This component never invents a reference number and never shows the confirmation
 * screen unless the service returns a successful response.
 */

interface AdmissionsPortalPageProps {
  onBackHome: () => void;
  onOpenTracking: () => void;
}

interface FormState {
  applicationType: string;
  applicantFullName: string;
  applicantDob: string;
  applicantGender: string;
  applicantPhone: string;
  applicantEmail: string;
  applicantDistrict: string;
  applicantSector: string;
  applicantCell: string;
  applicantResidence: string;
  guardianFullName: string;
  guardianPhone: string;
  guardianRelationship: string;
  academicYear: string;
  previousSchool: string;
  previousSchoolLocation: string;
  previousAcademicPerformance: string;
  reasonForChoosingSchool: string;
  currentSchool: string;
  currentSchoolLocation: string;
  currentClass: string;
  currentLevel: string;
  transferAcademicYear: string;
  requestedClass: string;
  previousSchoolType: string;
  transferReason: string;
  transferReasonOther: string;
  confirmAccurate: boolean;
  privacyAccepted: boolean;
  website: string;
}

type FieldErrors = Partial<Record<keyof FormState, string>>;
type Stage = 'welcome' | 'type' | 'form' | 'success';

interface Receipt {
  referenceNumber: string;
  submittedAt: string;
  applicationStatus: ApplicationStatus;
  resultSlipUploaded: boolean;
  resultVerificationStatus?: ResultSlipVerificationStatus;
  schoolContact?: string;
  notifications: AdmissionNotificationStatus[];
}

interface UploadedSlip extends ResultSlipUploadResponse {}

interface AcademicBackgroundState {
  previousClassOrLevel: string;
  schoolIdentification: string;
  performanceMarks: string;
  performanceGrade: string;
  performanceDescription: string;
  subjects: AcademicResultSubject[];
}

const emptyAcademicBackground = (): AcademicBackgroundState => ({
  previousClassOrLevel: '',
  schoolIdentification: '',
  performanceMarks: '',
  performanceGrade: '',
  performanceDescription: '',
  subjects: [{ name: '', marks: '', grade: '' }]
});

const emptyAcademicData = (): AcademicPerformanceData => ({
  studentName: '',
  examinationYear: '',
  subjects: [{ name: '', marks: '', grade: '' }],
  total: '',
  aggregate: '',
  division: ''
});

function hasAcademicData(data: AcademicPerformanceData): boolean {
  return Boolean(
    data.studentName ||
      data.examinationYear ||
      data.total ||
      data.aggregate ||
      data.division ||
      data.subjects.some(subject => subject.name || subject.marks || subject.grade)
  );
}

const MAX_FILE_SIZE = 5 * 1024 * 1024;
const ALLOWED_FILE_TYPES = ['application/pdf', 'image/jpeg', 'image/png'];

const TRANSFER_REASONS = [
  'Family relocation',
  'Moving to another district',
  'Better learning opportunities',
  'Change of school environment',
  'Family circumstances',
  'Academic reasons',
  'Financial circumstances',
  'Other reason'
];

const DOCUMENT_FIELDS: Record<
  ApplicationType,
  Array<{ key: string; labelKey: 'docSeniorResults' | 'docPreviousReport' | 'docTransferLetter' | 'docStudentId' | 'docOther' | 'docSupporting' }>
> = {
  NEW_STUDENT_SENIOR4: [
    { key: 'PREVIOUS_REPORT', labelKey: 'docPreviousReport' },
    { key: 'OTHER', labelKey: 'docOther' }
  ],
  SCHOOL_TRANSFER: [
    { key: 'PREVIOUS_REPORT', labelKey: 'docPreviousReport' },
    { key: 'TRANSFER_LETTER', labelKey: 'docTransferLetter' },
    { key: 'STUDENT_ID', labelKey: 'docStudentId' },
    { key: 'OTHER', labelKey: 'docOther' }
  ],
  OTHER_ADMISSION: [
    { key: 'PREVIOUS_REPORT', labelKey: 'docPreviousReport' },
    { key: 'SUPPORTING_DOCUMENT', labelKey: 'docSupporting' },
    { key: 'OTHER', labelKey: 'docOther' }
  ]
};

const TYPE_TITLE_KEYS: Record<ApplicationType, 'typeNewTitle' | 'typeTransferTitle' | 'typeOtherTitle'> = {
  NEW_STUDENT_SENIOR4: 'typeNewTitle',
  SCHOOL_TRANSFER: 'typeTransferTitle',
  OTHER_ADMISSION: 'typeOtherTitle'
};

const TYPE_OPTIONS: Array<{
  type: ApplicationType;
  titleKey: 'typeNewTitle' | 'typeTransferTitle' | 'typeOtherTitle';
  descriptionKey: 'typeNewDescription' | 'typeTransferDescription' | 'typeOtherDescription';
  icon: React.ComponentType<{ className?: string }>;
}> = [
  { type: 'NEW_STUDENT_SENIOR4', titleKey: 'typeNewTitle', descriptionKey: 'typeNewDescription', icon: GraduationCap },
  { type: 'SCHOOL_TRANSFER', titleKey: 'typeTransferTitle', descriptionKey: 'typeTransferDescription', icon: School },
  { type: 'OTHER_ADMISSION', titleKey: 'typeOtherTitle', descriptionKey: 'typeOtherDescription', icon: HelpCircle }
];

function currentAcademicYear(): string {
  const now = new Date();
  const year = now.getFullYear();
  return now.getMonth() + 1 >= 9 ? `${year}-${year + 1}` : `${year - 1}-${year}`;
}

function makeInitialForm(): FormState {
  return {
    applicationType: '',
    applicantFullName: '',
    applicantDob: '',
    applicantGender: '',
    applicantPhone: '',
    applicantEmail: '',
    applicantDistrict: '',
    applicantSector: '',
    applicantCell: '',
    applicantResidence: '',
    guardianFullName: '',
    guardianPhone: '',
    guardianRelationship: '',
    academicYear: currentAcademicYear(),
    previousSchool: '',
    previousSchoolLocation: '',
    previousAcademicPerformance: '',
    reasonForChoosingSchool: '',
    currentSchool: '',
    currentSchoolLocation: '',
    currentClass: '',
    currentLevel: '',
    transferAcademicYear: currentAcademicYear(),
    requestedClass: '',
    previousSchoolType: '',
    transferReason: '',
    transferReasonOther: '',
    confirmAccurate: false,
    privacyAccepted: false,
    website: ''
  };
}

function isValidPhone(value: string): boolean {
  const digits = value.replace(/\D/g, '');
  let normalized = digits;
  if (digits.startsWith('250') && digits.length === 12) normalized = digits;
  else if (digits.startsWith('0') && digits.length === 10) normalized = `250${digits.slice(1)}`;
  else if (digits.length === 9 && digits.startsWith('7')) normalized = `250${digits}`;
  return /^2507\d{8}$/.test(normalized) || (normalized.length >= 8 && normalized.length <= 15);
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

type TextFieldName = Exclude<
  keyof FormState,
  'applicationType' | 'applicantGender' | 'transferReason' | 'confirmAccurate' | 'privacyAccepted' | 'website'
>;

export const AdmissionsPortalPage: React.FC<AdmissionsPortalPageProps> = ({ onBackHome, onOpenTracking }) => {
  const copy = useAdmissionsCopy();
  const { school } = useAuth();

  const [stage, setStage] = useState<Stage>('welcome');
  const [step, setStep] = useState(0);
  const [form, setForm] = useState<FormState>(makeInitialForm);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [fileErrors, setFileErrors] = useState<Record<string, string>>({});
  const [uploadedDocuments, setUploadedDocuments] = useState<Record<string, AdmissionDocumentUploadResponse>>({});
  const [documentUploading, setDocumentUploading] = useState<Record<string, boolean>>({});
  const [documentProgress, setDocumentProgress] = useState<Record<string, number>>({});
  const [formError, setFormError] = useState('');
  const [backgroundError, setBackgroundError] = useState('');
  const [submitError, setSubmitError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [draggingKey, setDraggingKey] = useState<string | null>(null);

  const [publicOptions, setPublicOptions] = useState<PublicAdmissionSettings | null>(null);
  const [academicBackground, setAcademicBackground] = useState<AcademicBackgroundState>(emptyAcademicBackground);
  const [settingsLoading, setSettingsLoading] = useState(true);
  const [slipUpload, setSlipUpload] = useState<UploadedSlip | null>(null);
  const [slipUploading, setSlipUploading] = useState(false);
  const [slipProgress, setSlipProgress] = useState(0);
  const [slipError, setSlipError] = useState('');
  const [extractionNote, setExtractionNote] = useState('');
  const [academic, setAcademic] = useState<AcademicPerformanceData>(emptyAcademicData);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewMeta, setPreviewMeta] = useState<{ fileName: string; mime: string }>({
    fileName: '',
    mime: ''
  });

  const fileInputs = useRef<Record<string, HTMLInputElement | null>>({});
  const slipInput = useRef<HTMLInputElement | null>(null);
  const formCardRef = useRef<HTMLDivElement>(null);

  const releasePreview = useCallback(() => {
    setPreviewUrl(current => {
      if (current) URL.revokeObjectURL(current);
      return null;
    });
  }, []);

  useEffect(() => {
    let active = true;
    api
      .getPublicAdmissionSettings()
      .then(settings => {
        if (!active) return;
        setPublicOptions(settings);
      })
      .catch(() => {
        // Keep the safe default (slip required) if settings cannot be loaded.
      })
      .finally(() => {
        if (active) setSettingsLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => () => releasePreview(), [releasePreview]);

  const type = (form.applicationType || null) as ApplicationType | null;
  const usesResultSlip = type === 'NEW_STUDENT_SENIOR4' || type === 'OTHER_ADMISSION';
  const steps = [copy.stepApplicant, copy.stepDetails, copy.stepDocuments, copy.stepReview];
  const documentFields = type
    ? publicOptions?.documentCategories
        .filter(category =>
          category.active &&
          (!category.applicationTypes?.length || category.applicationTypes.includes(type))
        )
        .map(category => ({ key: category.key, label: category.label })) ??
      DOCUMENT_FIELDS[type].map(({ key, labelKey }) => ({ key, label: String(copy[labelKey]) }))
    : [];
  const schoolName = school?.name || 'ES RUBENGERA RTB';

  const clearErrors = () => {
    setFieldErrors({});
    setFormError('');
    setBackgroundError('');
    setSubmitError('');
    setSlipError('');
  };

  const focusField = (key: keyof FormState) => {
    requestAnimationFrame(() => {
      const element = document.getElementById(`field-${key}`) as HTMLElement | null;
      element?.focus();
      element?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    });
  };

  const setField = (name: keyof FormState, value: string | boolean) => {
    setForm(previous => ({ ...previous, [name]: value }));
    setFieldErrors(previous => {
      if (!previous[name]) return previous;
      const next = { ...previous };
      delete next[name];
      return next;
    });
    setFormError('');
  };

  const validateStep = (index: number): boolean => {
    const errors: FieldErrors = {};
    let slipProblem = '';
    let backgroundErrorText = '';
    const valueOf = (key: TextFieldName) => String(form[key] ?? '').trim();
    const required = (key: TextFieldName) => {
      if (!valueOf(key)) errors[key] = copy.required;
    };
    const minLength = (key: TextFieldName, min: number) => {
      const value = valueOf(key);
      if (!value) errors[key] = copy.required;
      else if (value.length < min) errors[key] = copy.minChars.replace('{min}', String(min));
    };
    const checkPhone = (key: 'applicantPhone' | 'guardianPhone') => {
      const value = valueOf(key);
      if (!value) errors[key] = copy.required;
      else if (!isValidPhone(value)) errors[key] = copy.invalidPhone;
    };

    if (index === 0) {
      minLength('applicantFullName', 2);
      const dob = valueOf('applicantDob');
      if (!dob) errors.applicantDob = copy.required;
      else if (Number.isNaN(new Date(dob).getTime()) || new Date(dob).getTime() >= Date.now()) {
        errors.applicantDob = copy.invalidDate;
      }
      checkPhone('applicantPhone');
      const email = valueOf('applicantEmail');
      if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) errors.applicantEmail = copy.invalidEmail;
      required('academicYear');
      minLength('applicantDistrict', 2);
      minLength('applicantResidence', 5);
      minLength('guardianFullName', 2);
      checkPhone('guardianPhone');
      minLength('guardianRelationship', 2);
    }

    if (index === 1) {
      if (type === 'NEW_STUDENT_SENIOR4') {
        minLength('previousSchool', 2);
        minLength('previousSchoolLocation', 2);
        minLength('reasonForChoosingSchool', 10);
      }
      if (type === 'SCHOOL_TRANSFER') {
        minLength('currentSchool', 2);
        minLength('currentSchoolLocation', 2);
        required('currentClass');
        required('currentLevel');
        required('transferAcademicYear');
        required('requestedClass');
        const transferReason = String(form.transferReason ?? '').trim();
        if (!transferReason) errors.transferReason = copy.required;
        else if (transferReason.length < 3) errors.transferReason = copy.minChars.replace('{min}', '3');
        if (form.transferReason === 'Other reason') minLength('transferReasonOther', 5);
      }
      // OTHER_ADMISSION: removed fields (currentEducationLevel, requestedEducationLevel,
      // previousSchool, applicationReason) are no longer collected or required.

      const bg = academicBackground;
      if (
        bg.performanceGrade &&
        publicOptions?.grading.grades.length &&
        !publicOptions.grading.grades.some(item => item.grade === bg.performanceGrade)
      ) {
        backgroundErrorText = copy.gradeScaleNote;
      }
    }

    if (index === 2) {
      if (Object.values(documentUploading).some(Boolean)) slipProblem = copy.documentUploading;
      else if (slipUploading) slipProblem = copy.slipUploading;
      else if (type === 'NEW_STUDENT_SENIOR4' && !slipUpload) {
        slipProblem = copy.slipRequiredNote;
      }
    }

    if (index === 3) {
      if (!form.confirmAccurate) errors.confirmAccurate = copy.required;
      if (!form.privacyAccepted) errors.privacyAccepted = copy.required;
    }

    const keys = Object.keys(errors) as Array<keyof FormState>;
    setFieldErrors(errors);
    setBackgroundError(backgroundErrorText);
    setFormError(keys.length ? copy.fixErrors : backgroundErrorText || slipProblem);
    setSlipError(slipProblem);
    if (keys.length) {
      focusField(keys[0]);
      return false;
    }
    if (backgroundErrorText) {
      requestAnimationFrame(() => document.getElementById('academic-background')?.scrollIntoView({ block: 'center', behavior: 'smooth' }));
      return false;
    }
    if (slipProblem) {
      requestAnimationFrame(() => slipInput.current?.focus());
      return false;
    }
    return true;
  };

  const goToStep = (next: number) => {
    setStep(Math.max(0, Math.min(next, steps.length - 1)));
    clearErrors();
    requestAnimationFrame(() => formCardRef.current?.scrollIntoView({ block: 'start', behavior: 'smooth' }));
  };

  const selectApplicationType = (nextType: ApplicationType) => {
    setForm(previous => ({
      ...previous,
      applicationType: nextType,
      previousSchool: '',
      previousSchoolLocation: '',
      previousAcademicPerformance: '',
      reasonForChoosingSchool: '',
      currentSchool: '',
      currentSchoolLocation: '',
      currentClass: '',
      currentLevel: '',
      transferAcademicYear: currentAcademicYear(),
      requestedClass: '',
      previousSchoolType: '',
      transferReason: '',
      transferReasonOther: '',
      confirmAccurate: false,
      privacyAccepted: false
    }));
    setUploadedDocuments({});
    setDocumentUploading({});
    setDocumentProgress({});
    setFileErrors({});
    setAcademicBackground(emptyAcademicBackground());
    setBackgroundError('');
    setSlipUpload(null);
    setSlipUploading(false);
    setSlipProgress(0);
    setSlipError('');
    setExtractionNote('');
    setAcademic(emptyAcademicData());
    releasePreview();
    setPreviewOpen(false);
    if (slipInput.current) slipInput.current.value = '';
    setStep(0);
    setStage('form');
    clearErrors();
  };

  const next = () => {
    if (!validateStep(step)) return;
    goToStep(step + 1);
  };

  const submit = async () => {
    if (!type || !validateStep(3)) return;
    if (usesResultSlip) {
      const slipStepValid = validateStep(2);
      if (!slipStepValid) {
        setStep(2);
        requestAnimationFrame(() => formCardRef.current?.scrollIntoView({ block: 'start', behavior: 'smooth' }));
        return;
      }
    }
    setSubmitting(true);
    setSubmitError('');
    setFormError('');
    try {
      const formData = new FormData();
      Object.entries(form).forEach(([key, value]) => {
        if (typeof value === 'boolean') formData.append(key, value ? 'true' : 'false');
        else if (value) formData.append(key, value);
      });
      formData.set('applicationType', type);
      // The API uses explicit field names for school details; send aliases alongside the UI keys.
      formData.set('previousSchoolName', form.previousSchool);
      formData.set('currentSchoolName', form.currentSchool);
      const bg = academicBackground;
      const backgroundPayload = {
        performanceMarks: bg.performanceMarks,
        performanceGrade: bg.performanceGrade,
        performanceDescription: bg.performanceDescription,
        previousSchoolName: form.previousSchool || form.currentSchool,
        previousSchoolLocation: form.previousSchoolLocation || form.currentSchoolLocation,
        previousClassOrLevel: bg.previousClassOrLevel,
        schoolIdentification: bg.schoolIdentification,
        subjects: bg.subjects
      };
      formData.set('academicBackground', JSON.stringify(backgroundPayload));
      if (usesResultSlip) {
        if (slipUpload) formData.set('resultSlipToken', slipUpload.uploadToken);
        if (hasAcademicData(academic)) formData.set('academicPerformance', JSON.stringify(academic));
      }
      const tokenEntries = Object.entries(uploadedDocuments).map(([key, upload]) => ({
        key,
        token: upload.uploadToken
      }));
      if (tokenEntries.length) formData.set('documentTokens', JSON.stringify(tokenEntries));

      // Real backend only: the confirmation screen is reached exclusively from a successful API response.
      const result = await api.submitAdmissionApplication(formData);
      if (!result?.referenceNumber) throw new Error(copy.genericError);

      setReceipt({
        referenceNumber: result.referenceNumber,
        submittedAt: result.submittedAt,
        applicationStatus: result.applicationStatus ?? 'SUBMITTED',
        resultSlipUploaded: result.resultSlipUploaded ?? Boolean(slipUpload),
        resultVerificationStatus: result.resultVerificationStatus,
        schoolContact: result.schoolContact,
        notifications: result.notifications ?? []
      });
      setStage('success');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : copy.genericError);
    } finally {
      setSubmitting(false);
    }
  };

  const handleFile = async (key: string, file: File | undefined) => {
    if (!file || !type || documentUploading[key]) return;
    if (!ALLOWED_FILE_TYPES.includes(file.type)) {
      setFileErrors(previous => ({ ...previous, [key]: copy.invalidFileType }));
      return;
    }
    if (file.size > MAX_FILE_SIZE) {
      setFileErrors(previous => ({ ...previous, [key]: copy.fileTooLarge }));
      return;
    }
    setFileErrors(previous => {
      const next = { ...previous };
      delete next[key];
      return next;
    });
    setDocumentUploading(previous => ({ ...previous, [key]: true }));
    setDocumentProgress(previous => ({ ...previous, [key]: 0 }));
    try {
      const upload = await api.uploadAdmissionDocument(
        file,
        key,
        type,
        percent => setDocumentProgress(previous => ({ ...previous, [key]: percent })),
        uploadedDocuments[key]?.uploadToken
      );
      setUploadedDocuments(previous => ({ ...previous, [key]: upload }));
    } catch (error) {
      setFileErrors(previous => ({
        ...previous,
        [key]: error instanceof Error ? error.message : copy.slipUploadFailed
      }));
    } finally {
      setDocumentUploading(previous => ({ ...previous, [key]: false }));
    }
  };

  const removeFile = async (key: string) => {
    const upload = uploadedDocuments[key];
    if (upload) {
      try {
        await api.removeAdmissionDocument(upload.uploadToken);
      } catch {
        // The temporary token expires server-side; clearing local state is enough.
      }
    }
    setUploadedDocuments(previous => {
      const next = { ...previous };
      delete next[key];
      return next;
    });
    setFileErrors(previous => {
      const next = { ...previous };
      delete next[key];
      return next;
    });
    if (fileInputs.current[key]) fileInputs.current[key]!.value = '';
  };

  const openDocumentPreview = async (key: string) => {
    const upload = uploadedDocuments[key];
    if (!upload) return;
    try {
      const blob = await api.previewAdmissionDocument(upload.uploadToken);
      releasePreview();
      setPreviewMeta({ fileName: upload.fileName, mime: upload.fileMime });
      setPreviewUrl(URL.createObjectURL(blob));
      setPreviewOpen(true);
    } catch (error) {
      setFileErrors(previous => ({
        ...previous,
        [key]: error instanceof Error ? error.message : copy.documentPreviewFailed
      }));
    }
  };

  const handleSlipFile = async (file: File | undefined) => {
    if (!file || slipUploading) return;
    setSlipError('');
    setExtractionNote('');
    if (!ALLOWED_FILE_TYPES.includes(file.type)) {
      setSlipError(copy.slipInvalidType);
      return;
    }
    if (file.size > MAX_FILE_SIZE) {
      setSlipError(copy.slipTooLarge);
      return;
    }

    releasePreview();
    const objectUrl = URL.createObjectURL(file);
    setPreviewUrl(objectUrl);
    setSlipUploading(true);
    setSlipProgress(0);
    try {
      const result = await api.uploadResultSlip(file, setSlipProgress, slipUpload?.uploadToken);
      setSlipUpload(result);
      if (result.extracted.data) {
        setAcademic(result.extracted.data);
      } else if (result.extracted.status === 'UNAVAILABLE' || result.extracted.status === 'ERROR') {
        setExtractionNote(result.extracted.message || copy.extractionUnavailable);
      }
    } catch (error) {
      setSlipError(error instanceof Error ? error.message : copy.slipUploadFailed);
      releasePreview();
    } finally {
      setSlipUploading(false);
    }
  };

  const removeSlip = () => {
    setSlipUpload(null);
    setSlipUploading(false);
    setSlipProgress(0);
    setSlipError('');
    setExtractionNote('');
    setAcademic(emptyAcademicData());
    setPreviewOpen(false);
    releasePreview();
    if (slipInput.current) slipInput.current.value = '';
  };

  const openSlipPreview = async () => {
    let url = previewUrl;
    if (!url && slipUpload) {
      try {
        const blob = await api.previewResultSlip(slipUpload.uploadToken);
        url = URL.createObjectURL(blob);
        setPreviewMeta({ fileName: slipUpload.fileName, mime: slipUpload.fileMime });
        setPreviewUrl(url);
      } catch (error) {
        setSlipError(error instanceof Error ? error.message : copy.slipUploadFailed);
        return;
      }
    }
    if (url) setPreviewOpen(true);
  };

  const setBackgroundField = <K extends keyof AcademicBackgroundState>(key: K, value: AcademicBackgroundState[K]) => {
    setAcademicBackground(previous => ({ ...previous, [key]: value }));
    setBackgroundError('');
  };

  const setBackgroundSubject = (index: number, key: keyof AcademicResultSubject, value: string) => {
    setAcademicBackground(previous => ({
      ...previous,
      subjects: previous.subjects.map((subject, subjectIndex) =>
        subjectIndex === index ? { ...subject, [key]: value } : subject
      )
    }));
  };

  const addBackgroundSubject = () => {
    setAcademicBackground(previous => ({
      ...previous,
      subjects: [...previous.subjects, { name: '', marks: '', grade: '' }]
    }));
  };

  const removeBackgroundSubject = (index: number) => {
    setAcademicBackground(previous => ({
      ...previous,
      subjects: previous.subjects.filter((_, subjectIndex) => subjectIndex !== index)
    }));
  };

  const setAcademicField = <K extends keyof AcademicPerformanceData>(key: K, value: AcademicPerformanceData[K]) => {
    setAcademic(previous => ({ ...previous, [key]: value }));
  };

  const setSubjectField = (index: number, key: keyof AcademicResultSubject, value: string) => {
    setAcademic(previous => ({
      ...previous,
      subjects: previous.subjects.map((subject, subjectIndex) =>
        subjectIndex === index ? { ...subject, [key]: value } : subject
      )
    }));
  };

  const addSubject = () => {
    setAcademic(previous => ({
      ...previous,
      subjects: [...previous.subjects, { name: '', marks: '', grade: '' }]
    }));
  };

  const removeSubject = (index: number) => {
    setAcademic(previous => ({
      ...previous,
      subjects: previous.subjects.filter((_, subjectIndex) => subjectIndex !== index)
    }));
  };

  const verificationLabel = (status?: ResultSlipVerificationStatus) => {
    switch (status) {
      case 'UNDER_VERIFICATION': return copy.statusUnder;
      case 'VERIFIED': return copy.statusVerified;
      case 'VERIFICATION_FAILED': return copy.statusFailed;
      case 'ADDITIONAL_DOCUMENT_REQUIRED': return copy.statusAdditionalDoc;
      default: return copy.statusNotYet;
    }
  };

  const applicationStatusLabel = (status: ApplicationStatus) => {
    switch (status) {
      case 'DRAFT': return copy.statusDraft;
      case 'UNDER_REVIEW': return copy.statusUnderReview;
      case 'DOCUMENTS_REQUIRED': return copy.statusDocumentsRequired;
      case 'ADDITIONAL_INFO_REQUIRED': return copy.statusAdditional;
      case 'APPROVED': return copy.statusApproved;
      case 'REJECTED': return copy.statusRejected;
      case 'WAITLISTED': return copy.statusWaitlisted;
      default: return copy.statusSubmitted;
    }
  };

  const notificationMessage = useMemo(() => {
    const notifications = receipt?.notifications ?? [];
    if (notifications.some(item => item.channel === 'email' && item.sent)) return copy.emailQueued;
    if (notifications.some(item => item.channel === 'sms' && item.sent)) return copy.smsQueued;
    return copy.messagingOff;
  }, [copy, receipt]);

  const renderField = (
    name: TextFieldName,
    label: string,
    options: { type?: string; required?: boolean; placeholder?: string; textarea?: boolean; hint?: string; autoComplete?: string } = {}
  ) => {
    const error = fieldErrors[name];
    const describedBy = [error ? `error-${name}` : null, options.hint ? `hint-${name}` : null].filter(Boolean).join(' ') || undefined;
    const commonProps = {
      id: `field-${name}`,
      value: String(form[name] ?? ''),
      onChange: (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setField(name, event.target.value),
      className: `admission-input${error ? ' is-invalid' : ''}`,
      placeholder: options.placeholder,
      'aria-invalid': error ? (true as const) : undefined,
      'aria-describedby': describedBy,
      'data-field-error': error ? 'true' : undefined
    };

    return (
      <div className="apply-field">
        <label htmlFor={`field-${name}`} className="apply-label">
          {label} {options.required && <span className="text-[#B91C1C]">*</span>}
        </label>
        {options.textarea ? (
          <textarea {...commonProps} rows={4} />
        ) : (
          <input {...commonProps} type={options.type || 'text'} autoComplete={options.autoComplete || 'off'} />
        )}
        {options.hint && <p id={`hint-${name}`} className="apply-hint">{options.hint}</p>}
        {error && <p id={`error-${name}`} className="apply-error-text" role="alert">{error}</p>}
      </div>
    );
  };

  const renderSelect = (
    name: 'applicantGender' | 'transferReason',
    label: string,
    options: Array<{ value: string; label: string }>,
    required = false
  ) => {
    const error = fieldErrors[name];
    return (
      <div className="apply-field">
        <label htmlFor={`field-${name}`} className="apply-label">
          {label} {required && <span className="text-[#B91C1C]">*</span>}
        </label>
        <select
          id={`field-${name}`}
          value={form[name]}
          onChange={event => setField(name, event.target.value)}
          className={`admission-input${error ? ' is-invalid' : ''}`}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `error-${name}` : undefined}
          data-field-error={error ? 'true' : undefined}
        >
          <option value="">{copy.selectOption}</option>
          {options.map(option => (
            <option key={option.value} value={option.value}>{option.label}</option>
          ))}
        </select>
        {error && <p id={`error-${name}`} className="apply-error-text" role="alert">{error}</p>}
      </div>
    );
  };

  const renderCheckbox = (name: 'confirmAccurate' | 'privacyAccepted', label: string) => {
    const error = fieldErrors[name];
    return (
      <div>
        <label htmlFor={`field-${name}`} className="apply-checkbox-row">
          <input
            id={`field-${name}`}
            type="checkbox"
            checked={form[name]}
            onChange={event => setField(name, event.target.checked)}
            className="apply-checkbox"
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? `error-${name}` : undefined}
            data-field-error={error ? 'true' : undefined}
          />
          <span>{label}</span>
        </label>
        {error && <p id={`error-${name}`} className="apply-error-text ml-8" role="alert">{error}</p>}
      </div>
    );
  };

  const renderDocumentRow = ({ key, label }: { key: string; label: string }) => {
    const upload = uploadedDocuments[key];
    const error = fileErrors[key];
    const uploading = Boolean(documentUploading[key]);
    const progress = documentProgress[key] ?? 0;
    const isDragging = draggingKey === key;
    return (
      <div
        key={key}
        className={`apply-doc-row${isDragging ? ' is-dragging' : ''}${error ? ' has-error' : ''}`}
        onDragOver={event => {
          event.preventDefault();
          setDraggingKey(key);
        }}
        onDragLeave={() => setDraggingKey(current => (current === key ? null : current))}
        onDrop={event => {
          event.preventDefault();
          setDraggingKey(null);
          void handleFile(key, event.dataTransfer.files?.[0]);
        }}
      >
        <span className="apply-doc-icon">
          {uploading ? <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" /> : <FileText className="h-5 w-5" aria-hidden="true" />}
        </span>
        <div className="min-w-0 flex-1">
          <p className="apply-doc-label">{label}</p>
          <p className="apply-doc-meta truncate">
            {upload
              ? `${copy.fileSelected}: ${upload.fileName} · ${formatFileSize(upload.fileSize)}`
              : uploading
                ? copy.documentUploading
                : `${copy.dropFilesHere} ${copy.browseFiles}`}
          </p>
          {uploading && (
            <div className="apply-progress" role="progressbar" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100}>
              <span className="apply-progress-bar" style={{ width: `${progress}%` }} />
              <span className="apply-progress-label">{progress}%</span>
            </div>
          )}
          {error && <p className="apply-error-text mt-1" role="alert">{error}</p>}
          {!error && !uploading && <p className="apply-doc-types">{copy.fileTypes}</p>}
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={uploading}
            className="apply-btn-secondary !min-h-[2.5rem] !px-3 !py-2 !text-xs"
            onClick={() => fileInputs.current[key]?.click()}
          >
            {upload ? copy.replaceFile : copy.chooseFile}
          </button>
          {upload && (
            <>
              <button
                type="button"
                className="apply-btn-secondary !min-h-[2.5rem] !px-3 !py-2 !text-xs"
                onClick={() => void openDocumentPreview(key)}
              >
                <ZoomIn className="h-3.5 w-3.5" aria-hidden="true" /> {copy.documentPreview}
              </button>
              <button
                type="button"
                onClick={() => void removeFile(key)}
                className="apply-icon-btn"
                aria-label={`${copy.removeFile} ${label}`}
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </>
          )}
          <input
            ref={element => {
              fileInputs.current[key] = element;
            }}
            type="file"
            accept=".pdf,.jpg,.jpeg,.png"
            className="sr-only"
            tabIndex={-1}
            disabled={uploading}
            aria-label={label}
            onChange={event => {
              void handleFile(key, event.target.files?.[0]);
              event.target.value = '';
            }}
          />
        </div>
      </div>
    );
  };

  const textValue = (value: string) => (value?.trim() ? value : '—');

  const renderSummary = (title: string, targetStep: number, rows: Array<{ label: string; value: string }>) => (
    <div key={title} className="apply-summary-card">
      <div className="flex items-center justify-between gap-3 border-b border-[#EEE9DD] px-5 py-3.5">
        <p className="text-sm font-bold text-[#064E3B]">{title}</p>
        <button type="button" onClick={() => goToStep(targetStep)} className="apply-edit-btn">
          {copy.edit}
          <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
      </div>
      <dl className="divide-y divide-[#F1EDE3] px-5">
        {rows.map(row => (
          <div key={row.label} className="grid gap-1 py-2.5 sm:grid-cols-[minmax(9rem,0.7fr)_1fr] sm:gap-4">
            <dt className="text-xs font-semibold text-[#6B7874]">{row.label}</dt>
            <dd className="break-words text-sm font-semibold text-[#31413C]">{textValue(row.value)}</dd>
          </div>
        ))}
      </dl>
    </div>
  );

  const detailRows = (): Array<{ label: string; value: string }> => {
    if (type === 'NEW_STUDENT_SENIOR4') {
      return [
        { label: copy.previousSchool, value: form.previousSchool },
        { label: copy.previousSchoolLocation, value: form.previousSchoolLocation },
        { label: copy.reasonChoosing, value: form.reasonForChoosingSchool }
      ];
    }
    if (type === 'SCHOOL_TRANSFER') {
      return [
        { label: copy.currentSchool, value: form.currentSchool },
        { label: copy.currentSchoolLocation, value: form.currentSchoolLocation },
        { label: copy.currentClass, value: form.currentClass },
        { label: copy.currentLevel, value: form.currentLevel },
        { label: copy.academicYear, value: form.transferAcademicYear },
        { label: copy.requestedClass, value: form.requestedClass },
        { label: copy.transferReason, value: form.transferReason === 'Other reason' ? form.transferReasonOther : form.transferReason }
      ];
    }
    return [];
  };

  const handlePublicNavigate = (target: string) => {
    if (target === 'home') onBackHome();
    else if (target === 'apply') { window.location.hash = '#/apply'; }
    else if (target === 'track') onOpenTracking();
    else window.location.assign(`/${target === 'home' ? '' : target}`);
  };

  return (
    <PublicLayout active="apply" onNavigate={handlePublicNavigate} mainClassName="apply-page">
      <a
        href="#apply-main"
        className="skip-link"
        onClick={event => {
          event.preventDefault();
          document.getElementById('apply-main')?.focus();
        }}
      >
        Skip to main content
      </a>

      <div id="apply-main" tabIndex={-1} className="outline-none">
        {stage === 'welcome' && (
          <section className="relative isolate overflow-hidden py-10 sm:py-14">
            <div className="public-site-shell grid items-center gap-10 py-6 sm:py-10 lg:grid-cols-[1.08fr_0.92fr] lg:gap-14">
              <div className="max-w-2xl">
                <span className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-4 py-2 text-xs font-bold uppercase tracking-[0.16em] text-[#E8C97F]">
                  <BadgeCheck className="h-3.5 w-3.5" aria-hidden="true" />
                  {schoolName} · {copy.applyPortalLabel}
                </span>
                <h1 className="mt-6 text-4xl font-bold leading-[1.08] tracking-tight text-white sm:text-5xl lg:text-[3.5rem] public-hero-title">
                  {copy.welcomeTitle}
                </h1>
                <div className="mt-5 h-1.5 w-28 rounded-full bg-[#D6A84F]" aria-hidden="true" />
                <p className="mt-5 text-lg font-bold text-[#E8C97F]">{copy.smootherStart}</p>
                <p className="mt-3 max-w-xl text-base leading-8 text-[#D7E8E1]">{copy.whoCanApply}</p>
                <p className="mt-2 max-w-xl text-sm leading-7 text-[#C7D8D2]">{copy.welcomeDescription}</p>
                <p className="mt-2 text-sm font-bold text-white">{copy.staffOnlyNote}</p>

                <div className="mt-9 flex flex-col gap-3 sm:flex-row">
                  <button type="button" className="apply-btn-primary" onClick={() => setStage('type')}>
                    {copy.startApplication}
                    <ArrowRight className="h-4 w-4" aria-hidden="true" />
                  </button>
                  <button type="button" className="apply-btn-secondary" onClick={onOpenTracking}>
                    {copy.trackApplication}
                  </button>
                </div>

                <div className="mt-11 grid gap-3 sm:grid-cols-3">
                  {[
                    { icon: LockKeyhole, title: copy.noAccountNeeded, text: copy.noAccountNeededDesc },
                    { icon: ClipboardList, title: copy.guidedApplication, text: copy.guidedApplicationDesc },
                    { icon: ShieldCheck, title: copy.privateByDesign, text: copy.privateByDesignDesc }
                  ].map(({ icon: Icon, title, text }) => (
                    <div key={title} className="rounded-2xl border border-white/15 bg-white/10 p-4 backdrop-blur-sm">
                      <Icon className="h-5 w-5 text-[#E8C97F]" aria-hidden="true" />
                      <p className="mt-3 text-sm font-bold text-white">{title}</p>
                      <p className="mt-1 text-xs leading-5 text-[#D7E8E1]">{text}</p>
                    </div>
                  ))}
                </div>
              </div>

              <div className="relative mx-auto w-full max-w-md">
                <div className="absolute -right-10 -top-10 h-48 w-48 rounded-full bg-[#D6A84F]/20 blur-3xl" aria-hidden="true" />
                <div className="apply-card relative overflow-hidden !rounded-[2rem] p-6 sm:p-8">
                  <span className="apply-eyebrow">{copy.guidedApplication}</span>
                  <p className="mt-5 text-lg font-bold leading-snug text-[#064E3B]">{copy.chooseApplicationType}</p>
                  <p className="mt-2 text-sm leading-6 text-[#687570]">{copy.chooseApplicationTypeDesc}</p>
                  <div className="mt-7 space-y-3">
                    {TYPE_OPTIONS.map(({ type: optionType, titleKey, icon: Icon }, index) => (
                      <div key={optionType} className="flex items-center gap-3 rounded-2xl border border-[#E9E4D9] bg-[var(--schoolcare-surface-muted)] p-3.5">
                        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-white text-[#0B6B51]">
                          <Icon className="h-4 w-4" aria-hidden="true" />
                        </span>
                        <span className="flex-1 text-sm font-bold text-[#31413C]">{String(copy[titleKey])}</span>
                        <span className="grid h-6 w-6 place-items-center rounded-full bg-[#064E3B] text-[10px] font-bold text-white">
                          {index + 1}
                        </span>
                      </div>
                    ))}
                  </div>
                  <div className="mt-6 flex items-center gap-2 border-t border-[#EEE9DD] pt-5 text-xs text-[#6B7874]">
                    <ShieldCheck className="h-4 w-4 text-[#0B6B51]" aria-hidden="true" />
                    {copy.privateByDesignDesc}
                  </div>
                </div>
              </div>
            </div>
          </section>
        )}

        {stage === 'type' && (
          <section className="apply-shell py-12 sm:py-16">
            <button type="button" onClick={() => setStage('welcome')} className="apply-back-link text-white/90 hover:text-white">
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
              {copy.backToSite}
            </button>
            <span className="mt-6 inline-flex rounded-full border border-white/20 bg-white/10 px-4 py-2 text-xs font-bold uppercase tracking-[0.16em] text-[#E8C97F]">{copy.applyPortalLabel}</span>
            <h1 className="mt-5 text-3xl font-bold tracking-tight text-white sm:text-4xl public-hero-title">{copy.chooseApplicationType}</h1>
            <p className="mt-3 max-w-2xl text-sm leading-7 text-[#D7E8E1]">{copy.chooseApplicationTypeDesc}</p>

            <div className="mt-9 grid gap-5 lg:grid-cols-3">
              {TYPE_OPTIONS.map(({ type: optionType, titleKey, descriptionKey, icon: Icon }) => (
                <button
                  key={optionType}
                  type="button"
                  onClick={() => selectApplicationType(optionType)}
                  className="apply-type-card group"
                >
                  <span className="apply-type-icon"><Icon className="h-6 w-6" aria-hidden="true" /></span>
                  <span className="mt-5 block text-lg font-bold text-[#064E3B]">{String(copy[titleKey])}</span>
                  <span className="mt-2 block flex-1 text-sm leading-6 text-[#687570]">{String(copy[descriptionKey])}</span>
                  <span className="mt-6 inline-flex items-center gap-2 text-sm font-bold text-[#1D4ED8]">
                    {copy.selectType}
                    <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" aria-hidden="true" />
                  </span>
                </button>
              ))}
            </div>
          </section>
        )}

        {stage === 'form' && type && (
          <section className="apply-shell py-10 sm:py-14">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <button type="button" onClick={() => (step === 0 ? setStage('type') : goToStep(step - 1))} className="apply-back-link text-white/90 hover:text-white">
                <ArrowLeft className="h-4 w-4" aria-hidden="true" />
                {step === 0 ? copy.backToTypes : steps[step - 1]}
              </button>
              <span className="inline-flex rounded-full border border-white/20 bg-white/10 px-3 py-1.5 text-xs font-bold text-[#E8C97F]">{copy.stepOf} {step + 1} / {steps.length}</span>
            </div>

            <div className="mt-8 grid gap-8 lg:grid-cols-[15rem_minmax(0,1fr)] lg:items-start">
              <aside className="hidden lg:block" aria-label={copy.guidedApplication}>
                <div className="sticky top-28">
                  <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-[#8A7A57]">{copy.guidedApplication}</p>
                  <ol className="mt-5 space-y-1">
                    {steps.map((label, index) => {
                      const isDone = index < step;
                      const isActive = index === step;
                      return (
                        <li key={label}>
                          <button
                            type="button"
                            disabled={!isDone}
                            onClick={() => goToStep(index)}
                            className={`apply-step-item${isActive ? ' is-active' : ''}${isDone ? ' is-done' : ''}`}
                            aria-current={isActive ? 'step' : undefined}
                          >
                            <span className="apply-step-dot">
                              {isDone ? <Check className="h-3.5 w-3.5" aria-hidden="true" /> : index + 1}
                            </span>
                            <span className="text-left text-sm font-bold">{label}</span>
                          </button>
                        </li>
                      );
                    })}
                  </ol>
                  <div className="mt-8 rounded-2xl border border-[#E9E4D9] bg-white/70 p-4">
                    <p className="flex items-center gap-2 text-sm font-bold text-[#064E3B]">
                      <HelpCircle className="h-4 w-4" aria-hidden="true" /> {copy.needHelp}
                    </p>
                    <p className="mt-1.5 text-xs leading-5 text-[#6B7874]">{copy.needHelpText}</p>
                  </div>
                </div>
              </aside>

              <div>
                <div className="mb-5 flex gap-2 lg:hidden" aria-label={copy.guidedApplication}>
                  {steps.map((label, index) => (
                    <div key={label} className="flex-1">
                      <div className={`h-1.5 rounded-full ${index <= step ? 'bg-[#064E3B]' : 'bg-[#E7DFC9]'}`} />
                      <span className={`mt-1.5 block truncate text-[10px] font-bold ${index === step ? 'text-[#064E3B]' : 'text-[#9AA6A1]'}`}>
                        {label}
                      </span>
                    </div>
                  ))}
                </div>

                <div ref={formCardRef} className="apply-card scroll-mt-28 p-5 sm:p-8">
                  <input
                    type="text"
                    name="website"
                    value={form.website}
                    onChange={event => setField('website', event.target.value)}
                    tabIndex={-1}
                    autoComplete="off"
                    aria-hidden="true"
                    className="absolute -left-[9999px]"
                  />

                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <span className="apply-eyebrow">{copy.stepOf} {step + 1} / {steps.length}</span>
                      <h1 className="mt-4 text-2xl font-bold tracking-tight text-[#064E3B] sm:text-3xl">{steps[step]}</h1>
                    </div>
                    <span className="apply-badge hidden sm:inline-flex">{String(copy[TYPE_TITLE_KEYS[type]])}</span>
                  </div>

                  {formError && Object.keys(fieldErrors).length > 0 && (
                    <div role="alert" className="apply-alert mt-6">
                      <AlertCircle className="h-5 w-5 shrink-0" aria-hidden="true" />
                      <div>
                        <p className="font-bold">{formError}</p>
                        <ul className="mt-1 list-disc space-y-0.5 pl-4 text-xs">
                          {Object.values(fieldErrors).map((message, index) => <li key={`${message}-${index}`}>{message}</li>)}
                        </ul>
                      </div>
                    </div>
                  )}

                  {submitError && (
                    <div role="alert" className="apply-alert mt-6">
                      <AlertCircle className="h-5 w-5 shrink-0" aria-hidden="true" />
                      <div>
                        <p className="font-bold">{copy.submitErrorTitle}</p>
                        <p className="mt-1 text-sm">{submitError}</p>
                        <p className="mt-1 text-xs">{copy.submitErrorNote}</p>
                      </div>
                    </div>
                  )}

                  {step === 0 && (
                    <div className="mt-8 space-y-10">
                      <section>
                        <div className="apply-section-heading">
                          <UserRound className="h-5 w-5" aria-hidden="true" />
                          <h2>{copy.personalHeading}</h2>
                        </div>
                        <div className="mt-5 grid gap-5 sm:grid-cols-2">
                          {renderField('applicantFullName', copy.fullName, { required: true })}
                          {renderField('applicantDob', copy.dateOfBirth, { type: 'date', required: true })}
                          {renderSelect('applicantGender', copy.gender, [
                            { value: 'M', label: 'Male' },
                            { value: 'F', label: 'Female' }
                          ])}
                          {renderField('applicantPhone', copy.phone, { required: true, type: 'tel', hint: '0788 123 456' })}
                          {renderField('applicantEmail', copy.email, { type: 'email' })}
                          {renderField('academicYear', copy.academicYear, { required: true })}
                          {renderField('applicantDistrict', copy.district, { required: true })}
                          {renderField('applicantSector', copy.sector)}
                          {renderField('applicantCell', copy.cell)}
                          {renderField('applicantResidence', copy.residence, { required: true })}
                        </div>
                      </section>

                      <section className="border-t border-[#EEE9DD] pt-8">
                        <div className="apply-section-heading">
                          <Users className="h-5 w-5" aria-hidden="true" />
                          <h2>{copy.guardianHeading}</h2>
                        </div>
                        <p className="mt-1.5 text-sm text-[#0B6B51]">{copy.guardianNote}</p>
                        <div className="mt-5 grid gap-5 sm:grid-cols-2">
                          {renderField('guardianFullName', copy.guardianName, { required: true })}
                          {renderField('guardianPhone', copy.guardianPhone, { required: true, type: 'tel', hint: '0788 123 456' })}
                          {renderField('guardianRelationship', copy.relationship, { required: true })}
                        </div>
                      </section>
                    </div>
                  )}

                  {step === 1 && type === 'NEW_STUDENT_SENIOR4' && (
                    <div className="mt-8 space-y-7">
                      <section className="apply-subsection">
                        <div className="apply-section-heading">
                          <GraduationCap className="h-5 w-5" aria-hidden="true" />
                          <h2>{copy.senior3ResultsHeading}</h2>
                        </div>
                        <p className="mt-2 max-w-2xl text-sm leading-6 text-[#52615C]">{copy.senior3ResultsDescription}</p>
                      </section>
                      <section className="grid gap-5 sm:grid-cols-2">
                        {renderField('previousSchool', copy.previousSchool, { required: true })}
                        {renderField('previousSchoolLocation', copy.previousSchoolLocation, { required: true })}
                        <div className="sm:col-span-2">{renderField('previousAcademicPerformance', copy.performance, { textarea: true })}</div>
                        <div className="sm:col-span-2">{renderField('reasonForChoosingSchool', copy.reasonChoosing, { required: true, textarea: true })}</div>
                      </section>
                    </div>
                  )}

                  {step === 1 && type === 'SCHOOL_TRANSFER' && (
                    <div className="mt-8 grid gap-5 sm:grid-cols-2">
                      {renderField('currentSchool', copy.currentSchool, { required: true })}
                      {renderField('currentSchoolLocation', copy.currentSchoolLocation, { required: true })}
                      {renderField('currentClass', copy.currentClass, { required: true })}
                      {renderField('currentLevel', copy.currentLevel, { required: true })}
                      {renderField('transferAcademicYear', copy.academicYear, { required: true })}
                      {renderField('requestedClass', copy.requestedClass, { required: true })}
                      {renderField('previousSchoolType', copy.previousSchoolType)}
                      {renderSelect('transferReason', copy.transferReason, TRANSFER_REASONS.map(reason => ({ value: reason, label: reason })), true)}
                      {form.transferReason === 'Other reason' && (
                        <div className="sm:col-span-2">{renderField('transferReasonOther', copy.otherReason, { required: true, textarea: true })}</div>
                      )}
                    </div>
                  )}

                  {step === 1 && type === 'OTHER_ADMISSION' && (
                    <div className="mt-8 rounded-2xl border border-[#E9E4D9] bg-[#FBFAF6] p-5 text-sm leading-7 text-[#52615C]">
                      <p className="font-bold text-[#064E3B]">{copy.academicBackgroundNote}</p>
                      <p className="mt-1">{copy.previousAcademicBackgroundIntro}</p>
                    </div>
                  )}

                  {step === 1 && (
                    <section id="academic-background" className="apply-subsection mt-8 border-t border-[#EEE9DD] pt-8">
                      <div className="apply-section-heading">
                        <GraduationCap className="h-5 w-5" aria-hidden="true" />
                        <h2>{copy.previousAcademicBackgroundHeading}</h2>
                      </div>
                      <p className="mt-2 max-w-3xl text-sm leading-6 text-[#52615C]">{copy.previousAcademicBackgroundIntro}</p>
                      {backgroundError && (
                        <p className="apply-error-text mt-3" role="alert">{backgroundError}</p>
                      )}

                      <div className="mt-5 grid gap-5 sm:grid-cols-2">
                        <div className="apply-field">
                          <label className="apply-label" htmlFor="bg-previous-class">{copy.previousClassOrLevel}</label>
                          <input
                            id="bg-previous-class"
                            className="admission-input"
                            value={academicBackground.previousClassOrLevel}
                            onChange={event => setBackgroundField('previousClassOrLevel', event.target.value)}
                          />
                        </div>
                        <div className="apply-field">
                          <label className="apply-label" htmlFor="bg-school-id">{copy.schoolIdentification}</label>
                          <input
                            id="bg-school-id"
                            className="admission-input"
                            value={academicBackground.schoolIdentification}
                            onChange={event => setBackgroundField('schoolIdentification', event.target.value)}
                          />
                        </div>
                      </div>

                      <div className="mt-6">
                        <div className="flex items-center justify-between gap-3">
                          <h3 className="text-sm font-bold text-[#064E3B]">{copy.academicPerformanceHeading}</h3>
                          <button type="button" onClick={addBackgroundSubject} className="apply-edit-btn">
                            <Plus className="h-3.5 w-3.5" aria-hidden="true" /> {copy.addSubject}
                          </button>
                        </div>
                        <p className="mt-1 text-xs text-[#8A7A57]">{copy.gradeScaleNote}</p>
                        <div className="mt-3 space-y-3">
                          {academicBackground.subjects.map((subject, index) => (
                            <div key={`bg-subject-${index}`} className="apply-result-subject">
                              <div className="apply-field">
                                <label className="apply-label" htmlFor={`bg-subject-name-${index}`}>{copy.subject}</label>
                                <input
                                  id={`bg-subject-name-${index}`}
                                  className="admission-input"
                                  value={subject.name}
                                  onChange={event => setBackgroundSubject(index, 'name', event.target.value)}
                                />
                              </div>
                              <div className="apply-field">
                                <label className="apply-label" htmlFor={`bg-subject-marks-${index}`}>{copy.marks}</label>
                                <input
                                  id={`bg-subject-marks-${index}`}
                                  className="admission-input"
                                  inputMode="decimal"
                                  value={subject.marks || ''}
                                  onChange={event => setBackgroundSubject(index, 'marks', event.target.value)}
                                />
                              </div>
                              <div className="apply-field">
                                <label className="apply-label" htmlFor={`bg-subject-grade-${index}`}>{copy.grade}</label>
                                <select
                                  id={`bg-subject-grade-${index}`}
                                  className="admission-input"
                                  value={subject.grade || ''}
                                  onChange={event => setBackgroundSubject(index, 'grade', event.target.value)}
                                >
                                  <option value="">{copy.selectOption}</option>
                                  {(publicOptions?.grading.grades ?? []).map(grade => (
                                    <option key={grade.grade} value={grade.grade}>{grade.grade}{grade.description ? ` — ${grade.description}` : ''}</option>
                                  ))}
                                </select>
                              </div>
                              <button
                                type="button"
                                className="apply-icon-btn self-end"
                                onClick={() => removeBackgroundSubject(index)}
                                aria-label={`${copy.removeSubject} ${index + 1}`}
                              >
                                <X className="h-4 w-4" aria-hidden="true" />
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>

                      <div className="mt-6 grid gap-5 sm:grid-cols-3">
                        <div className="apply-field">
                          <label className="apply-label" htmlFor="bg-performance-marks">{copy.performanceMarks}</label>
                          <input
                            id="bg-performance-marks"
                            className="admission-input"
                            inputMode="decimal"
                            value={academicBackground.performanceMarks}
                            onChange={event => setBackgroundField('performanceMarks', event.target.value)}
                          />
                        </div>
                        <div className="apply-field">
                          <label className="apply-label" htmlFor="bg-performance-grade">{copy.performanceGrade}</label>
                          <select
                            id="bg-performance-grade"
                            className="admission-input"
                            value={academicBackground.performanceGrade}
                            onChange={event => setBackgroundField('performanceGrade', event.target.value)}
                          >
                            <option value="">{copy.selectOption}</option>
                            {(publicOptions?.grading.grades ?? []).map(grade => (
                              <option key={grade.grade} value={grade.grade}>{grade.grade}{grade.description ? ` — ${grade.description}` : ''}</option>
                            ))}
                          </select>
                        </div>
                        <div className="apply-field sm:col-span-3">
                          <label className="apply-label" htmlFor="bg-performance-description">{copy.performanceDescription}</label>
                          <textarea
                            id="bg-performance-description"
                            className="admission-input"
                            rows={3}
                            value={academicBackground.performanceDescription}
                            onChange={event => setBackgroundField('performanceDescription', event.target.value)}
                          />
                        </div>
                      </div>
                    </section>
                  )}

                  {step === 2 && usesResultSlip && (
                    <div className="mt-8 space-y-8">
                      <section className="apply-subsection">
                        <div className="apply-section-heading">
                          <GraduationCap className="h-5 w-5" aria-hidden="true" />
                          <h2>{copy.senior3ResultsHeading}</h2>
                        </div>
                        <p className="mt-2 max-w-2xl text-sm leading-6 text-[#52615C]">{copy.senior3ResultsDescription}</p>
                      </section>

                      <section className="apply-slip-card">
                        <div className="apply-section-heading">
                          <FileCheck2 className="h-5 w-5" aria-hidden="true" />
                          <h2>{copy.uploadSlipHeading}</h2>
                        </div>
                        <p className="mt-2 text-sm leading-6 text-[#52615C]">{copy.uploadSlipText}</p>
                        <p className="mt-2 text-xs font-bold text-[#8A6D1F]">
                          {type === 'NEW_STUDENT_SENIOR4' ? copy.slipRequiredNote : copy.slipOptionalNote}
                        </p>

                        <div
                          className={`apply-slip-row${draggingKey === 'resultSlip' ? ' is-dragging' : ''}${slipError ? ' has-error' : ''}`}
                          onDragOver={event => {
                            event.preventDefault();
                            setDraggingKey('resultSlip');
                          }}
                          onDragLeave={() => setDraggingKey(current => (current === 'resultSlip' ? null : current))}
                          onDrop={event => {
                            event.preventDefault();
                            setDraggingKey(null);
                            void handleSlipFile(event.dataTransfer.files?.[0]);
                          }}
                        >
                          <span className="apply-slip-icon">
                            {slipUploading ? <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" /> : <FileCheck2 className="h-5 w-5" aria-hidden="true" />}
                          </span>
                          <div className="min-w-0 flex-1">
                            <p className="apply-doc-label">{copy.uploadSlipHeading}</p>
                            <p className="apply-doc-meta truncate">
                              {slipUpload
                                ? `${copy.fileSelected}: ${slipUpload.fileName} · ${formatFileSize(slipUpload.fileSize)}`
                                : `${copy.dropFilesHere} ${copy.browseFiles}`}
                            </p>
                            {slipUploading && (
                              <div className="apply-progress" role="progressbar" aria-valuenow={slipProgress} aria-valuemin={0} aria-valuemax={100}>
                                <span className="apply-progress-bar" style={{ width: `${slipProgress}%` }} />
                                <span className="apply-progress-label">{slipProgress}%</span>
                              </div>
                            )}
                            {slipError && <p className="apply-error-text mt-1" role="alert">{slipError}</p>}
                            {extractionNote && !slipError && <p className="apply-hint mt-1">{extractionNote}</p>}
                            {!slipError && !slipUploading && <p className="apply-doc-types">{copy.fileTypes}</p>}
                          </div>
                          <div className="flex shrink-0 flex-wrap items-center gap-2">
                            <button
                              type="button"
                              className="apply-btn-secondary !min-h-[2.5rem] !px-3 !py-2 !text-xs"
                              disabled={slipUploading}
                              onClick={() => slipInput.current?.click()}
                            >
                              {slipUpload ? copy.slipReplaceFile : copy.slipChooseFile}
                            </button>
                            {slipUpload && (
                              <>
                                <button type="button" className="apply-btn-secondary !min-h-[2.5rem] !px-3 !py-2 !text-xs" onClick={() => void openSlipPreview()}>
                                  <ZoomIn className="h-3.5 w-3.5" aria-hidden="true" /> {copy.slipPreview}
                                </button>
                                <button type="button" className="apply-icon-btn" onClick={removeSlip} aria-label={copy.slipRemoveFile}>
                                  <Trash2 className="h-4 w-4" aria-hidden="true" />
                                </button>
                              </>
                            )}
                            <input
                              ref={slipInput}
                              type="file"
                              accept=".pdf,.jpg,.jpeg,.png"
                              className="sr-only"
                              tabIndex={-1}
                              disabled={slipUploading}
                              aria-label={copy.uploadSlipHeading}
                              onChange={event => {
                                void handleSlipFile(event.target.files?.[0]);
                                event.target.value = '';
                              }}
                            />
                          </div>
                        </div>
                      </section>

                      <section className="apply-result-card">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <div className="apply-section-heading">
                            <ClipboardList className="h-5 w-5" aria-hidden="true" />
                            <h2>{copy.academicPerformanceHeading}</h2>
                          </div>
                          <span className="apply-status-chip">{copy.pendingVerification}</span>
                        </div>
                        <p className="mt-3 text-sm leading-6 text-[#52615C]">{copy.academicPerformanceText}</p>

                        <div className="mt-5 grid gap-5 sm:grid-cols-2">
                          <div className="apply-field">
                            <label className="apply-label" htmlFor="academic-student-name">{copy.studentNameOnSlip}</label>
                            <input
                              id="academic-student-name"
                              className="admission-input"
                              value={academic.studentName || ''}
                              onChange={event => setAcademicField('studentName', event.target.value)}
                            />
                          </div>
                          <div className="apply-field">
                            <label className="apply-label" htmlFor="academic-exam-year">{copy.examinationYear}</label>
                            <input
                              id="academic-exam-year"
                              className="admission-input"
                              value={academic.examinationYear || ''}
                              onChange={event => setAcademicField('examinationYear', event.target.value)}
                            />
                          </div>
                        </div>

                        <div className="mt-6">
                          <div className="flex items-center justify-between gap-3">
                            <h3 className="text-sm font-bold text-[#064E3B]">{copy.subject}</h3>
                            <button type="button" onClick={addSubject} className="apply-edit-btn">
                              <Plus className="h-3.5 w-3.5" aria-hidden="true" /> {copy.addSubject}
                            </button>
                          </div>
                          <div className="mt-3 space-y-3">
                            {academic.subjects.length === 0 && <p className="text-sm text-[#6B7874]">{copy.noSubjects}</p>}
                            {academic.subjects.map((subject, index) => (
                              <div key={`subject-${index}`} className="apply-result-subject">
                                <div className="apply-field">
                                  <label className="apply-label" htmlFor={`subject-name-${index}`}>{copy.subject}</label>
                                  <input
                                    id={`subject-name-${index}`}
                                    className="admission-input"
                                    value={subject.name}
                                    onChange={event => setSubjectField(index, 'name', event.target.value)}
                                  />
                                </div>
                                <div className="apply-field">
                                  <label className="apply-label" htmlFor={`subject-marks-${index}`}>{copy.marks}</label>
                                  <input
                                    id={`subject-marks-${index}`}
                                    className="admission-input"
                                    value={subject.marks || ''}
                                    onChange={event => setSubjectField(index, 'marks', event.target.value)}
                                  />
                                </div>
                                <div className="apply-field">
                                  <label className="apply-label" htmlFor={`subject-grade-${index}`}>{copy.grade}</label>
                                  <input
                                    id={`subject-grade-${index}`}
                                    className="admission-input"
                                    value={subject.grade || ''}
                                    onChange={event => setSubjectField(index, 'grade', event.target.value)}
                                  />
                                </div>
                                <button
                                  type="button"
                                  className="apply-icon-btn self-end"
                                  onClick={() => removeSubject(index)}
                                  aria-label={`${copy.removeSubject} ${index + 1}`}
                                >
                                  <X className="h-4 w-4" aria-hidden="true" />
                                </button>
                              </div>
                            ))}
                          </div>
                        </div>

                        <div className="mt-6 grid gap-5 sm:grid-cols-3">
                          {(['total', 'aggregate', 'division'] as const).map(key => (
                            <div className="apply-field" key={key}>
                              <label className="apply-label" htmlFor={`academic-${key}`}>{copy[key]}</label>
                              <input
                                id={`academic-${key}`}
                                className="admission-input"
                                value={academic[key] || ''}
                                onChange={event => setAcademicField(key, event.target.value)}
                              />
                            </div>
                          ))}
                        </div>
                        <p className="mt-4 text-xs text-[#8A7A57]">{copy.slipReviewNote}</p>
                      </section>

                      <section className="border-t border-[#EEE9DD] pt-8">
                        <div className="apply-section-heading">
                          <UploadCloud className="h-5 w-5" aria-hidden="true" />
                          <h2>{copy.documentsHeading}</h2>
                        </div>
                        <p className="mt-3 rounded-xl bg-[#F6F3EA] p-4 text-sm leading-6 text-[#4F5F5A]">{copy.documentsNote}</p>
                        <div className="mt-6 space-y-3">{documentFields.map(renderDocumentRow)}</div>
                      </section>
                    </div>
                  )}

                  {step === 2 && !usesResultSlip && (
                    <div className="mt-8">
                      <div className="apply-section-heading">
                        <UploadCloud className="h-5 w-5" aria-hidden="true" />
                        <h2>{copy.documentsHeading}</h2>
                      </div>
                      <p className="mt-3 rounded-xl bg-[#F6F3EA] p-4 text-sm leading-6 text-[#4F5F5A]">{copy.documentsNote}</p>
                      <div className="mt-6 space-y-3">{documentFields.map(renderDocumentRow)}</div>
                    </div>
                  )}

                  {step === 3 && (
                    <div className="mt-8 space-y-6">
                      <div className="apply-section-heading">
                        <ClipboardList className="h-5 w-5" aria-hidden="true" />
                        <h2>{copy.reviewHeading}</h2>
                      </div>
                      <p className="text-sm text-[#687570]">{copy.reviewNote}</p>

                      <div className="grid gap-4">
                        {renderSummary(copy.stepApplicant, 0, [
                          { label: copy.fullName, value: form.applicantFullName },
                          { label: copy.dateOfBirth, value: form.applicantDob },
                          { label: copy.phone, value: form.applicantPhone },
                          { label: copy.email, value: form.applicantEmail },
                          { label: copy.district, value: form.applicantDistrict },
                          { label: copy.residence, value: form.applicantResidence }
                        ])}
                        {renderSummary(copy.guardianHeading, 0, [
                          { label: copy.guardianName, value: form.guardianFullName },
                          { label: copy.guardianPhone, value: form.guardianPhone },
                          { label: copy.relationship, value: form.guardianRelationship }
                        ])}
                        {renderSummary(copy.stepDetails, 1, detailRows())}
                        {renderSummary(copy.previousAcademicBackgroundHeading, 1, [
                          { label: copy.previousClassOrLevel, value: academicBackground.previousClassOrLevel },
                          { label: copy.schoolIdentification, value: academicBackground.schoolIdentification },
                          { label: copy.performanceMarks, value: academicBackground.performanceMarks },
                          { label: copy.performanceGrade, value: academicBackground.performanceGrade },
                          ...academicBackground.subjects
                            .filter(subject => subject.name || subject.marks || subject.grade)
                            .map(subject => ({
                              label: subject.name || copy.subject,
                              value: [subject.marks, subject.grade].filter(Boolean).join(' · ')
                            }))
                        ])}
                        {renderSummary(copy.stepDocuments, 2, [
                          ...documentFields.map(({ key, label }) => ({
                            label,
                            value: uploadedDocuments[key]?.fileName ?? ''
                          })),
                          ...(usesResultSlip
                            ? [{
                                label: copy.resultSlipLabel,
                                value: slipUpload ? `${copy.resultSlipUploaded}: ${slipUpload.fileName}` : copy.resultSlipNotUploaded
                              }]
                            : [])
                        ])}
                        {type === 'NEW_STUDENT_SENIOR4' && hasAcademicData(academic) && renderSummary(copy.academicPerformanceHeading, 2, [
                          { label: copy.pendingVerification, value: copy.pendingVerification },
                          { label: copy.studentNameOnSlip, value: academic.studentName || '' },
                          { label: copy.examinationYear, value: academic.examinationYear || '' },
                          ...academic.subjects
                            .filter(subject => subject.name || subject.marks || subject.grade)
                            .map(subject => ({
                              label: subject.name || copy.subject,
                              value: [subject.marks, subject.grade].filter(Boolean).join(' · ')
                            })),
                          { label: copy.total, value: academic.total || '' },
                          { label: copy.aggregate, value: academic.aggregate || '' },
                          { label: copy.division, value: academic.division || '' }
                        ])}
                      </div>

                      <div className="rounded-2xl border border-[#D6A84F]/35 bg-[#FBF6E9] p-5">
                        <h3 className="flex items-center gap-2 font-bold text-[#064E3B]">
                          <LockKeyhole className="h-5 w-5" aria-hidden="true" /> {copy.privacyTitle}
                        </h3>
                        <p className="mt-2 text-sm leading-6 text-[#52615C]">{copy.privacyText}</p>
                      </div>

                      <div className="rounded-2xl border border-[#E9E4D9] p-5">
                        <p className="text-sm font-bold text-[#064E3B]">{copy.declaration}</p>
                        <p className="mt-1 text-xs text-[#6B7874]">{copy.declarationNote}</p>
                        <div className="mt-4 space-y-3">
                          {renderCheckbox('confirmAccurate', copy.confirmationLabel)}
                          {renderCheckbox('privacyAccepted', copy.privacyLabel)}
                        </div>
                      </div>
                    </div>
                  )}

                  <div className="mt-8 flex flex-col-reverse gap-3 border-t border-[#EEE9DD] pt-6 sm:flex-row sm:justify-end">
                    {step > 0 && (
                      <button type="button" className="apply-btn-secondary" onClick={() => goToStep(step - 1)} disabled={submitting}>
                        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
                        {steps[step - 1]}
                      </button>
                    )}
                    {step < steps.length - 1 ? (
                      <button type="button" className="apply-btn-primary" onClick={next}>
                        {copy.next}
                        <ArrowRight className="h-4 w-4" aria-hidden="true" />
                      </button>
                    ) : (
                      <button type="button" className="apply-btn-primary" onClick={submit} disabled={submitting}>
                        {submitting ? copy.submitting : copy.submitApplication}
                        {!submitting && <Check className="h-4 w-4" aria-hidden="true" />}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </section>
        )}

        {stage === 'success' && receipt && (
          <section className="apply-shell py-14 sm:py-20">
            <div className="apply-confirmation mx-auto max-w-2xl">
              <span className="apply-success-icon"><CheckCircle2 className="h-9 w-9" aria-hidden="true" /></span>
              <span className="apply-eyebrow mt-7">{copy.applicationReceived}</span>
              <h1 className="mt-5 text-3xl font-bold tracking-tight text-[#064E3B] sm:text-4xl">
                {type === 'NEW_STUDENT_SENIOR4' ? copy.senior4SuccessTitle : copy.successTitle}
              </h1>
              <p className="mt-4 text-sm text-[#52615C]">{copy.successReferenceLabel}</p>
              <p className="apply-reference mt-3">{receipt.referenceNumber}</p>
              <p className="mt-3 text-xs text-[#6B7874]">
                {copy.submittedOn}: {new Date(receipt.submittedAt).toLocaleString()}
              </p>

              <div className="mt-6 grid gap-3 text-left sm:grid-cols-2">
                <div className="apply-receipt-card">
                  <p className="text-xs font-semibold text-[#6B7874]">{copy.resultSlipLabel}</p>
                  <p className="mt-1 text-sm font-bold text-[#064E3B]">
                    {receipt.resultSlipUploaded ? copy.resultSlipUploaded : copy.resultSlipNotUploaded}
                  </p>
                  {type === 'NEW_STUDENT_SENIOR4' && (
                    <p className="mt-1 text-xs text-[#6B7874]">{verificationLabel(receipt.resultVerificationStatus)}</p>
                  )}
                </div>
                <div className="apply-receipt-card">
                  <p className="text-xs font-semibold text-[#6B7874]">{copy.applicationStatusLabel}</p>
                  <p className="mt-1 text-sm font-bold text-[#064E3B]">{applicationStatusLabel(receipt.applicationStatus)}</p>
                </div>
              </div>

              {receipt.schoolContact && (
                <div className="mt-4 rounded-xl bg-[#F6F3EA] p-4 text-left">
                  <p className="text-xs font-bold text-[#064E3B]">{copy.schoolContactLabel}</p>
                  <p className="mt-1 text-sm text-[#52615C]">{receipt.schoolContact}</p>
                  <p className="mt-1 text-xs text-[#6B7874]">{copy.contactSchool}</p>
                </div>
              )}

              <div className="mt-8 rounded-2xl border border-[#E9E4D9] bg-[var(--schoolcare-surface-muted)] p-5 text-left">
                <p className="text-sm font-bold text-[#064E3B]">{copy.nextSteps}</p>
                <ul className="mt-3 space-y-2">
                  {[copy.nextStepOne, copy.nextStepTwo, copy.nextStepThree].map(stepText => (
                    <li key={stepText} className="flex items-start gap-2 text-sm leading-6 text-[#52615C]">
                      <Check className="mt-1 h-4 w-4 shrink-0 text-[#0B6B51]" aria-hidden="true" />
                      {stepText}
                    </li>
                  ))}
                </ul>
              </div>

              <p className="mt-5 text-xs font-semibold text-[#1D4ED8]">{notificationMessage}</p>
              <p className="mt-1 text-xs text-[#6B7874]">{copy.successKeep}</p>

              <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:justify-center">
                <button type="button" className="apply-btn-primary" onClick={onOpenTracking}>
                  {copy.successTrack}
                  <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </button>
                <button type="button" className="apply-btn-secondary no-print" onClick={() => window.print()}>
                  <Printer className="h-4 w-4" aria-hidden="true" />
                  {copy.printConfirmation}
                </button>
                <button type="button" className="apply-text-btn no-print" onClick={onBackHome}>
                  {copy.successHome}
                </button>
              </div>
              <p className="mt-7 text-[11px] text-[#8A7A57]">{copy.serviceNote}</p>
            </div>
          </section>
        )}
      </div>

      {previewOpen && previewUrl && (
        <div className="apply-modal-backdrop" role="presentation" onClick={() => setPreviewOpen(false)}>
          <div
            className="apply-modal"
            role="dialog"
            aria-modal="true"
            aria-label={copy.slipPreview}
            onClick={event => event.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-3 border-b border-[#EEE9DD] px-5 py-3">
              <p className="text-sm font-bold text-[#064E3B]">{previewMeta.fileName || copy.slipPreview}</p>
              <button type="button" className="apply-icon-btn" onClick={() => setPreviewOpen(false)} aria-label={copy.slipClosePreview}>
                <X className="h-5 w-5" aria-hidden="true" />
              </button>
            </div>
            <div className="apply-modal-body">
              {previewMeta.mime.startsWith('image/') ? (
                <img src={previewUrl || undefined} alt={copy.slipPreview} className="mx-auto max-h-full max-w-full object-contain" />
              ) : (
                <iframe src={previewUrl || undefined} title={copy.slipPreview} className="h-full w-full border-0" />
              )}
            </div>
          </div>
        </div>
      )}
    </PublicLayout>
  );
};
