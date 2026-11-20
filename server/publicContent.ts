import fs from 'node:fs';
import path from 'node:path';

/**
 * Isolated content store for the public school website.
 *
 * This file is deliberately separate from data/schoolcare_db.json. It contains
 * ONLY information that a school administrator has explicitly approved for
 * public release. No student, parent, staff, financial, health, message or
 * internal report data is ever written here or read from here.
 */

export type PublicArticleCategory = 'NEWS' | 'ANNOUNCEMENT' | 'EVENT';
export type PublicArticleStatus = 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';

export interface PublicArticle {
  id: string;
  slug: string;
  title: string;
  summary: string;
  body: string;
  category: PublicArticleCategory;
  status: PublicArticleStatus;
  approved: boolean;
  publishAt?: string;
  eventDate?: string;
  location?: string;
  imageUrl?: string;
  imageAlt?: string;
  createdAt: string;
  updatedAt: string;
  publishedAt?: string;
  createdBy: string;
}

export interface PublicGalleryImage {
  id: string;
  src: string;
  alt: string;
  caption: string;
  category: string;
  approved: boolean;
  createdAt: string;
  createdBy: string;
}

export interface PublicSiteContent {
  articles: PublicArticle[];
  gallery: PublicGalleryImage[];
  updatedAt: string;
}

// Tests can point this at a temporary directory before importing this module.
// Production uses the normal application data/ directory.
const DATA_DIR = process.env.SCHOOLCARE_PUBLIC_CONTENT_DIR
  ? path.resolve(process.env.SCHOOLCARE_PUBLIC_CONTENT_DIR)
  : path.resolve(process.cwd(), 'data');
const CONTENT_FILE = path.join(DATA_DIR, 'public_content.json');
export const PUBLIC_UPLOAD_DIR = path.join(DATA_DIR, 'public-uploads');

function seedContent(): PublicSiteContent {
  const now = new Date().toISOString();
  return {
    articles: [
      {
        id: 'public-news-welcome',
        slug: 'welcome-to-es-rubengera-rtb',
        title: 'Welcome to ES Rubengera RTB',
        summary: 'Our school community welcomes learners and families to a new term of learning, skills and integrity.',
        body: 'ES Rubengera RTB is a secondary and technical TVET school serving the Rubengera community in Karongi District, Western Province, Rwanda. Our motto — Ubumenyi, Umurimo, Ubupfura (Knowledge, Skill, Integrity) — guides everything we do.\n\nThis website shares approved school information with families and the wider community. For admissions enquiries, please use the Apply section or contact the school office.',
        category: 'NEWS',
        status: 'PUBLISHED',
        approved: true,
        publishAt: '2026-01-10T08:00:00.000Z',
        imageUrl: '/school-campus.svg',
        imageAlt: 'Illustration of the ES Rubengera RTB school campus',
        createdAt: now,
        updatedAt: now,
        publishedAt: '2026-01-10T08:00:00.000Z',
        createdBy: 'system-public-site'
      },
      {
        id: 'public-news-admissions',
        slug: 'admissions-applications-are-open',
        title: 'Admissions applications are open',
        summary: 'Families can submit an application online and track its progress through the SchoolCare admissions portal.',
        body: 'Applications for admission to ES Rubengera RTB are handled through our online admissions portal. The portal lets applicants submit details and track the status of their application.\n\nPlease prepare the required documents before starting an application. Contact the school office if you need assistance.',
        category: 'ANNOUNCEMENT',
        status: 'PUBLISHED',
        approved: true,
        publishAt: '2026-02-01T08:00:00.000Z',
        imageUrl: '/school-classroom.svg',
        imageAlt: 'Illustration of a classroom learning session',
        createdAt: now,
        updatedAt: now,
        publishedAt: '2026-02-01T08:00:00.000Z',
        createdBy: 'system-public-site'
      }
    ],
    gallery: [
      {
        id: 'public-gallery-campus',
        src: '/school-campus.svg',
        alt: 'Illustration of the ES Rubengera RTB school campus buildings',
        caption: 'Our campus in Rubengera, Karongi District',
        category: 'Campus',
        approved: true,
        createdAt: now,
        createdBy: 'system-public-site'
      },
      {
        id: 'public-gallery-classroom',
        src: '/school-classroom.svg',
        alt: 'Illustration of learners and a teacher in a classroom',
        caption: 'Teaching and learning in progress',
        category: 'Learning',
        approved: true,
        createdAt: now,
        createdBy: 'system-public-site'
      },
      {
        id: 'public-gallery-library',
        src: '/school-library.svg',
        alt: 'Illustration of the school library with bookshelves and reading tables',
        caption: 'The school library and reading space',
        category: 'Facilities',
        approved: true,
        createdAt: now,
        createdBy: 'system-public-site'
      }
    ],
    updatedAt: now
  };
}

function normalizeContent(input: unknown): PublicSiteContent {
  const fallback = seedContent();
  if (!input || typeof input !== 'object') return fallback;
  const value = input as Partial<PublicSiteContent>;
  return {
    articles: Array.isArray(value.articles)
      ? value.articles.filter((item): item is PublicArticle => Boolean(item && typeof item.id === 'string'))
      : fallback.articles,
    gallery: Array.isArray(value.gallery)
      ? value.gallery.filter((item): item is PublicGalleryImage => Boolean(item && typeof item.id === 'string'))
      : fallback.gallery,
    updatedAt: typeof value.updatedAt === 'string' ? value.updatedAt : fallback.updatedAt
  };
}

export function getContent(): PublicSiteContent {
  try {
    if (!fs.existsSync(CONTENT_FILE)) {
      const seeded = seedContent();
      writeContent(seeded);
      return seeded;
    }
    return normalizeContent(JSON.parse(fs.readFileSync(CONTENT_FILE, 'utf8')));
  } catch (error) {
    console.error('[PublicSite] Could not read public content; using safe defaults:', error);
    return seedContent();
  }
}

function writeContent(content: PublicSiteContent): void {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  content.updatedAt = new Date().toISOString();
  fs.writeFileSync(CONTENT_FILE, JSON.stringify(content, null, 2), { mode: 0o600 });
}

function publicReady(article: PublicArticle, now: number): boolean {
  if (article.status !== 'PUBLISHED' || article.approved !== true) return false;
  if (!article.publishAt) return true;
  const publishTime = Date.parse(article.publishAt);
  return Number.isFinite(publishTime) && publishTime <= now;
}

/** Returns only approved, published articles. Never returns drafts or private data. */
export function listPublishedArticles(category?: PublicArticleCategory): PublicArticle[] {
  const now = Date.now();
  return getContent()
    .articles.filter(article => publicReady(article, now) && (!category || article.category === category))
    .sort((a, b) => Date.parse(b.publishAt || b.createdAt) - Date.parse(a.publishAt || a.createdAt))
    .map(article => ({ ...article }));
}

export function listApprovedGallery(): PublicGalleryImage[] {
  return getContent().gallery.filter(image => image.approved === true).map(image => ({ ...image }));
}

export function getPublishedArticleBySlug(slug: string): PublicArticle | undefined {
  return listPublishedArticles().find(article => article.slug === slug);
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .slice(0, 80);
}

export interface ArticleInput {
  title: string;
  summary: string;
  body: string;
  category: PublicArticleCategory;
  status: PublicArticleStatus;
  approved: boolean;
  publishAt?: string;
  eventDate?: string;
  location?: string;
  imageUrl?: string;
  imageAlt?: string;
}

export class PublicContentError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PublicContentError';
  }
}

function validateArticleInput(input: ArticleInput): void {
  if (typeof input.title !== 'string' || input.title.trim().length < 3 || input.title.length > 160) {
    throw new PublicContentError('Enter a title between 3 and 160 characters.');
  }
  if (typeof input.summary !== 'string' || input.summary.trim().length < 10 || input.summary.length > 300) {
    throw new PublicContentError('Enter a summary between 10 and 300 characters.');
  }
  if (typeof input.body !== 'string' || input.body.trim().length < 20 || input.body.length > 20_000) {
    throw new PublicContentError('Enter a body between 20 and 20,000 characters.');
  }
  if (!['NEWS', 'ANNOUNCEMENT', 'EVENT'].includes(input.category)) {
    throw new PublicContentError('Choose a valid category.');
  }
  if (!['DRAFT', 'PUBLISHED', 'ARCHIVED'].includes(input.status)) {
    throw new PublicContentError('Choose a valid status.');
  }
  if (input.approved !== true && input.approved !== false) {
    throw new PublicContentError('Approval must be true or false.');
  }
  if (input.publishAt && Number.isNaN(Date.parse(input.publishAt))) {
    throw new PublicContentError('Enter a valid publish date.');
  }
  if (input.eventDate && Number.isNaN(Date.parse(input.eventDate))) {
    throw new PublicContentError('Enter a valid event date.');
  }
  if (input.imageUrl && !/^(\/public-assets\/|\/[a-z0-9-]+\.svg)$/i.test(input.imageUrl)) {
    throw new PublicContentError('Images must be approved school images served from this website.');
  }
  if (input.status === 'PUBLISHED' && input.approved !== true) {
    throw new PublicContentError('A published article must also be approved for public release.');
  }
}

export function createArticle(input: ArticleInput, actorId: string): PublicArticle {
  validateArticleInput(input);
  const content = getContent();
  const now = new Date().toISOString();
  let slug = slugify(input.title.trim()) || 'article';
  if (content.articles.some(article => article.slug === slug)) {
    slug = `${slug}-${Date.now().toString(36)}`;
  }
  const article: PublicArticle = {
    id: `article-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    slug,
    title: input.title.trim(),
    summary: input.summary.trim(),
    body: input.body.trim(),
    category: input.category,
    status: input.status,
    approved: input.approved,
    publishAt: input.publishAt ? new Date(input.publishAt).toISOString() : now,
    eventDate: input.eventDate ? new Date(input.eventDate).toISOString() : undefined,
    location: typeof input.location === 'string' ? input.location.trim().slice(0, 160) : undefined,
    imageUrl: input.imageUrl,
    imageAlt: typeof input.imageAlt === 'string' ? input.imageAlt.trim().slice(0, 240) : undefined,
    createdAt: now,
    updatedAt: now,
    publishedAt: input.status === 'PUBLISHED' ? (input.publishAt ? new Date(input.publishAt).toISOString() : now) : undefined,
    createdBy: actorId
  };
  content.articles.unshift(article);
  writeContent(content);
  return article;
}

export function updateArticle(id: string, updates: Partial<ArticleInput>): PublicArticle | null {
  const content = getContent();
  const article = content.articles.find(item => item.id === id);
  if (!article) return null;
  const next: ArticleInput = {
    title: updates.title ?? article.title,
    summary: updates.summary ?? article.summary,
    body: updates.body ?? article.body,
    category: updates.category ?? article.category,
    status: updates.status ?? article.status,
    approved: updates.approved ?? article.approved,
    publishAt: updates.publishAt ?? article.publishAt,
    eventDate: updates.eventDate ?? article.eventDate,
    location: updates.location ?? article.location,
    imageUrl: updates.imageUrl ?? article.imageUrl,
    imageAlt: updates.imageAlt ?? article.imageAlt
  };
  validateArticleInput(next);
  article.title = next.title.trim();
  article.summary = next.summary.trim();
  article.body = next.body.trim();
  article.category = next.category;
  article.status = next.status;
  article.approved = next.approved;
  article.publishAt = next.publishAt ? new Date(next.publishAt).toISOString() : undefined;
  article.eventDate = next.eventDate ? new Date(next.eventDate).toISOString() : undefined;
  article.location = next.location?.trim() || undefined;
  article.imageUrl = next.imageUrl;
  article.imageAlt = next.imageAlt?.trim() || undefined;
  article.publishedAt = article.status === 'PUBLISHED'
    ? (article.publishedAt || article.publishAt || new Date().toISOString())
    : undefined;
  article.updatedAt = new Date().toISOString();
  writeContent(content);
  return article;
}

export function deleteArticle(id: string): boolean {
  const content = getContent();
  const before = content.articles.length;
  content.articles = content.articles.filter(article => article.id !== id);
  if (content.articles.length === before) return false;
  writeContent(content);
  return true;
}

export function listAllArticles(): PublicArticle[] {
  return getContent().articles.map(article => ({ ...article }));
}

export function addGalleryImage(input: {
  src: string;
  alt: string;
  caption: string;
  category?: string;
}, actorId: string): PublicGalleryImage {
  const src = typeof input.src === 'string' ? input.src.trim() : '';
  const alt = typeof input.alt === 'string' ? input.alt.trim() : '';
  const caption = typeof input.caption === 'string' ? input.caption.trim() : '';
  if (!/^\/public-assets\/[A-Za-z0-9._-]+$/.test(src)) {
    throw new PublicContentError('Choose an uploaded school photograph.');
  }
  if (alt.length < 5 || alt.length > 240) {
    throw new PublicContentError('Enter descriptive alt text between 5 and 240 characters.');
  }
  if (caption.length < 3 || caption.length > 240) {
    throw new PublicContentError('Enter a caption between 3 and 240 characters.');
  }
  const image: PublicGalleryImage = {
    id: `gallery-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    src,
    alt,
    caption,
    category: typeof input.category === 'string' ? input.category.trim().slice(0, 60) || 'School Life' : 'School Life',
    approved: false,
    createdAt: new Date().toISOString(),
    createdBy: actorId
  };
  const content = getContent();
  content.gallery.unshift(image);
  writeContent(content);
  return image;
}

export function setGalleryApproval(id: string, approved: boolean): PublicGalleryImage | null {
  const content = getContent();
  const image = content.gallery.find(item => item.id === id);
  if (!image) return null;
  image.approved = approved;
  writeContent(content);
  return { ...image };
}

export function deleteGalleryImage(id: string): boolean {
  const content = getContent();
  const before = content.gallery.length;
  content.gallery = content.gallery.filter(image => image.id !== id);
  if (content.gallery.length === before) return false;
  writeContent(content);
  return true;
}

export function listAllGallery(): PublicGalleryImage[] {
  return getContent().gallery.map(image => ({ ...image }));
}

export function ensureUploadDir(): void {
  if (!fs.existsSync(PUBLIC_UPLOAD_DIR)) {
    fs.mkdirSync(PUBLIC_UPLOAD_DIR, { recursive: true, mode: 0o700 });
  }
}
