import type { AdmissionDocumentCategory, ApplicationType } from '../src/types';

/**
 * Default configurable admission document categories. Staff can change these
 * through the authenticated admissions settings endpoint; the JSON store and
 * MySQL mirror both keep the configured list.
 */
export const DEFAULT_DOCUMENT_CATEGORIES: AdmissionDocumentCategory[] = [
  {
    key: 'PREVIOUS_REPORT',
    label: 'Previous school report',
    active: true,
    applicationTypes: ['NEW_STUDENT_SENIOR4', 'SCHOOL_TRANSFER', 'OTHER_ADMISSION']
  },
  {
    key: 'ACADEMIC_TRANSCRIPT',
    label: 'Academic transcript',
    active: true,
    applicationTypes: ['NEW_STUDENT_SENIOR4', 'SCHOOL_TRANSFER', 'OTHER_ADMISSION']
  },
  {
    key: 'TRANSFER_LETTER',
    label: 'Transfer letter',
    active: true,
    applicationTypes: ['SCHOOL_TRANSFER']
  },
  {
    key: 'STUDENT_ID',
    label: 'Student or school ID',
    active: true,
    applicationTypes: ['SCHOOL_TRANSFER']
  },
  {
    key: 'SUPPORTING_DOCUMENT',
    label: 'Other supporting document',
    active: true,
    applicationTypes: ['OTHER_ADMISSION']
  },
  {
    key: 'OTHER',
    label: 'Other supporting document',
    active: true,
    applicationTypes: ['NEW_STUDENT_SENIOR4', 'SCHOOL_TRANSFER', 'OTHER_ADMISSION']
  }
];

/**
 * Some uploads are part of the school's minimum admission evidence, so staff
 * cannot hide them from the applicant-facing forms by deactivating a category.
 */
const REQUIRED_DOCUMENT_APPLICATIONS: Record<string, ApplicationType[]> = {
  PREVIOUS_REPORT: ['NEW_STUDENT_SENIOR4', 'SCHOOL_TRANSFER', 'OTHER_ADMISSION']
};

function withRequiredDocumentApplications(
  categories: AdmissionDocumentCategory[] | undefined
): AdmissionDocumentCategory[] {
  const source =
    categories && categories.length > 0
      ? categories.map(category => ({
          ...category,
          applicationTypes: category.applicationTypes ? [...category.applicationTypes] : undefined
        }))
      : DEFAULT_DOCUMENT_CATEGORIES.map(category => ({
          ...category,
          applicationTypes: category.applicationTypes ? [...category.applicationTypes] : undefined
        }));

  for (const category of source) {
    const requiredTypes = REQUIRED_DOCUMENT_APPLICATIONS[category.key];
    if (!requiredTypes) continue;
    category.active = true;
    const applicationTypes = new Set<ApplicationType>(category.applicationTypes ?? []);
    for (const type of requiredTypes) applicationTypes.add(type);
    category.applicationTypes = [...applicationTypes];
  }
  return source;
}

const APPLICATION_TYPES: ApplicationType[] = [
  'NEW_STUDENT_SENIOR4',
  'SCHOOL_TRANSFER',
  'OTHER_ADMISSION'
];

function cleanText(value: unknown, max: number): string {
  if (typeof value !== 'string') return '';
  return value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').trim().slice(0, max);
}

export function normalizeDocumentCategories(raw: unknown): AdmissionDocumentCategory[] | undefined {
  if (raw === undefined || raw === null || raw === '') return undefined;
  const source = typeof raw === 'string' ? safeParse(raw) : raw;
  if (!Array.isArray(source)) return undefined;
  const seen = new Set<string>();
  const categories: AdmissionDocumentCategory[] = [];
  for (const item of source) {
    if (!item || typeof item !== 'object') continue;
    const record = item as Record<string, unknown>;
    const key = cleanText(record.key, 100).toUpperCase().replace(/[^A-Z0-9_]/g, '_');
    const label = cleanText(record.label, 160);
    if (!key || !label || seen.has(key)) continue;
    seen.add(key);
    const applicationTypes = Array.isArray(record.applicationTypes)
      ? record.applicationTypes
          .map(value => cleanText(value, 40) as ApplicationType)
          .filter(value => APPLICATION_TYPES.includes(value))
      : undefined;
    categories.push({
      key,
      label,
      active: record.active !== false,
      required: record.required === true,
      applicationTypes: applicationTypes && applicationTypes.length > 0 ? applicationTypes : undefined
    });
  }
  return categories.length > 0 ? categories : undefined;
}

export function documentCategoriesFor(
  categories: AdmissionDocumentCategory[] | undefined,
  type: ApplicationType
): AdmissionDocumentCategory[] {
  const source = withRequiredDocumentApplications(categories);
  return source.filter(
    category =>
      category.active &&
      (!category.applicationTypes || category.applicationTypes.length === 0 || category.applicationTypes.includes(type))
  );
}

export function publicDocumentCategories(categories: AdmissionDocumentCategory[] | undefined) {
  return withRequiredDocumentApplications(categories).map(category => ({
    key: category.key,
    label: category.label,
    active: category.active,
    applicationTypes: category.applicationTypes ?? []
  }));
}

function safeParse(raw: string): unknown {
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return undefined;
  }
}
