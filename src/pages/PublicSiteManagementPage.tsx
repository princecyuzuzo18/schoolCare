import React, { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, EyeOff, ImagePlus, RefreshCw, ShieldCheck, Trash2 } from 'lucide-react';
import { ApiError, api } from '../services/api';
import { useLanguage } from '../i18n/LanguageContext';
import type {
  PublicArticleCategory,
  PublicArticleStatus,
  PublicContentArticle,
  PublicContentArticleInput,
  PublicContentGalleryImage
} from '../types';

type ManagementTab = 'articles' | 'gallery';

interface ArticleFormState {
  title: string;
  summary: string;
  body: string;
  category: PublicArticleCategory;
  status: PublicArticleStatus;
  approved: boolean;
  publishAt: string;
  eventDate: string;
  location: string;
  imageUrl: string;
  imageAlt: string;
}

interface GalleryFormState {
  alt: string;
  caption: string;
  category: string;
}

const EMPTY_ARTICLE: ArticleFormState = {
  title: '',
  summary: '',
  body: '',
  category: 'NEWS',
  status: 'DRAFT',
  approved: false,
  publishAt: '',
  eventDate: '',
  location: '',
  imageUrl: '',
  imageAlt: ''
};

const EMPTY_GALLERY: GalleryFormState = { alt: '', caption: '', category: 'School Life' };

function messageOf(error: unknown, fallback: string): string {
  if (error instanceof ApiError) return error.message || fallback;
  if (error instanceof Error) return error.message || fallback;
  return fallback;
}

function toDateTimeInput(value?: string): string {
  if (!value) return '';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : date.toISOString().slice(0, 16);
}

function fromDateTimeInput(value: string): string | undefined {
  if (!value) return undefined;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

export const PublicSiteManagementPage: React.FC = () => {
  const { t } = useLanguage();
  const [tab, setTab] = useState<ManagementTab>('articles');
  const [articles, setArticles] = useState<PublicContentArticle[]>([]);
  const [images, setImages] = useState<PublicContentGalleryImage[]>([]);
  const [articleForm, setArticleForm] = useState<ArticleFormState>(EMPTY_ARTICLE);
  const [galleryForm, setGalleryForm] = useState<GalleryFormState>(EMPTY_GALLERY);
  const [editingId, setEditingId] = useState('');
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [busyId, setBusyId] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [articleList, imageList] = await Promise.all([
        api.getPublicContentArticles(),
        api.getPublicContentGallery()
      ]);
      setArticles(articleList);
      setImages(imageList);
    } catch (loadError) {
      setError(messageOf(loadError, t('publicSiteError')));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    load();
  }, [load]);

  const setArticleField = <K extends keyof ArticleFormState>(field: K, value: ArticleFormState[K]) => {
    setArticleForm(previous => ({ ...previous, [field]: value }));
  };

  const resetArticleForm = () => {
    setEditingId('');
    setArticleForm(EMPTY_ARTICLE);
  };

  const startEdit = (article: PublicContentArticle) => {
    setEditingId(article.id);
    setArticleForm({
      title: article.title,
      summary: article.summary,
      body: article.body,
      category: article.category,
      status: article.status,
      approved: article.approved,
      publishAt: toDateTimeInput(article.publishAt),
      eventDate: toDateTimeInput(article.eventDate),
      location: article.location || '',
      imageUrl: article.imageUrl || '',
      imageAlt: article.imageAlt || ''
    });
    setNotice('');
    setError('');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const saveArticle = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusyId(editingId || 'new');
    setError('');
    setNotice('');
    const payload: PublicContentArticleInput = {
      title: articleForm.title.trim(),
      summary: articleForm.summary.trim(),
      body: articleForm.body.trim(),
      category: articleForm.category,
      status: articleForm.status,
      approved: articleForm.approved,
      publishAt: fromDateTimeInput(articleForm.publishAt),
      eventDate: fromDateTimeInput(articleForm.eventDate),
      location: articleForm.location.trim() || undefined,
      imageUrl: articleForm.imageUrl.trim() || undefined,
      imageAlt: articleForm.imageAlt.trim() || undefined
    };
    try {
      if (editingId) await api.updatePublicContentArticle(editingId, payload);
      else await api.createPublicContentArticle(payload);
      setNotice(t('publicSiteSaved'));
      resetArticleForm();
      await load();
    } catch (saveError) {
      setError(messageOf(saveError, t('publicSiteError')));
    } finally {
      setBusyId('');
    }
  };

  const quickUpdate = async (article: PublicContentArticle, patch: Partial<PublicContentArticleInput>) => {
    setBusyId(article.id);
    setError('');
    setNotice('');
    try {
      await api.updatePublicContentArticle(article.id, patch);
      setNotice(t('publicSiteSaved'));
      await load();
    } catch (updateError) {
      setError(messageOf(updateError, t('publicSiteError')));
    } finally {
      setBusyId('');
    }
  };

  const removeArticle = async (article: PublicContentArticle) => {
    if (!window.confirm(`${t('publicSiteDelete')} “${article.title}”?`)) return;
    setBusyId(article.id);
    try {
      await api.deletePublicContentArticle(article.id);
      if (editingId === article.id) resetArticleForm();
      setNotice(t('publicSiteSaved'));
      await load();
    } catch (deleteError) {
      setError(messageOf(deleteError, t('publicSiteError')));
    } finally {
      setBusyId('');
    }
  };

  const uploadImage = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!uploadFile) return;
    setBusyId('upload');
    setError('');
    setNotice('');
    const formData = new FormData();
    formData.append('image', uploadFile);
    formData.append('alt', galleryForm.alt.trim());
    formData.append('caption', galleryForm.caption.trim());
    formData.append('category', galleryForm.category.trim() || 'School Life');
    try {
      await api.uploadPublicContentImage(formData);
      setUploadFile(null);
      setGalleryForm(EMPTY_GALLERY);
      setNotice(t('publicSiteUploadPending'));
      await load();
    } catch (uploadError) {
      setError(messageOf(uploadError, t('publicSiteError')));
    } finally {
      setBusyId('');
    }
  };

  const toggleImageApproval = async (image: PublicContentGalleryImage) => {
    setBusyId(image.id);
    setError('');
    try {
      await api.setPublicContentImageApproval(image.id, !image.approved);
      setNotice(t('publicSiteSaved'));
      await load();
    } catch (approvalError) {
      setError(messageOf(approvalError, t('publicSiteError')));
    } finally {
      setBusyId('');
    }
  };

  const removeImage = async (image: PublicContentGalleryImage) => {
    if (!window.confirm(`${t('publicSiteDelete')} “${image.caption}”?`)) return;
    setBusyId(image.id);
    try {
      await api.deletePublicContentImage(image.id);
      setNotice(t('publicSiteSaved'));
      await load();
    } catch (deleteError) {
      setError(messageOf(deleteError, t('publicSiteError')));
    } finally {
      setBusyId('');
    }
  };

  return (
    <section className="space-y-5 p-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{t('publicSiteTitle')}</h1>
          <p className="mt-1 text-sm text-slate-600">{t('publicSiteSubtitle')}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={load}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            <RefreshCw size={16} /> {t('viewReports')}
          </button>
          <a
            href="/"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 rounded-lg bg-blue-700 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-800"
          >
            {t('publicSiteOpenWebsite')}
          </a>
        </div>
      </header>

      {error && <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}
      {notice && <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{notice}</div>}

      <div className="flex gap-2 border-b border-slate-200">
        {(['articles', 'gallery'] as ManagementTab[]).map(item => (
          <button
            key={item}
            type="button"
            onClick={() => setTab(item)}
            className={`px-4 py-2 text-sm font-semibold ${
              tab === item
                ? 'border-b-2 border-blue-700 text-blue-700'
                : 'border-b-2 border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            {item === 'articles' ? t('publicSiteTabArticles') : t('publicSiteTabGallery')}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">…</div>
      ) : tab === 'articles' ? (
        <div className="space-y-5">
          <form onSubmit={saveArticle} className="grid gap-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-lg font-semibold text-slate-900">
                {editingId ? t('publicSiteEditArticle') : t('publicSiteNewArticle')}
              </h2>
              {editingId && (
                <button
                  type="button"
                  onClick={resetArticleForm}
                  className="text-sm font-medium text-slate-500 hover:text-slate-700"
                >
                  {t('publicSiteCancelEdit')}
                </button>
              )}
            </div>

            <label className="block">
              <span className="text-xs font-medium text-slate-600">{t('publicSiteTitleField')}</span>
              <input
                value={articleForm.title}
                onChange={event => setArticleField('title', event.target.value)}
                maxLength={160}
                minLength={3}
                required
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-500"
              />
            </label>

            <label className="block">
              <span className="text-xs font-medium text-slate-600">{t('publicSiteSummary')}</span>
              <textarea
                value={articleForm.summary}
                onChange={event => setArticleField('summary', event.target.value)}
                maxLength={300}
                minLength={10}
                rows={2}
                required
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-500"
              />
            </label>

            <label className="block">
              <span className="text-xs font-medium text-slate-600">{t('publicSiteBody')}</span>
              <textarea
                value={articleForm.body}
                onChange={event => setArticleField('body', event.target.value)}
                maxLength={20000}
                minLength={20}
                rows={6}
                required
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-500"
              />
            </label>

            <div className="grid gap-4 md:grid-cols-2">
              <label className="block">
                <span className="text-xs font-medium text-slate-600">{t('publicSiteCategory')}</span>
                <select
                  value={articleForm.category}
                  onChange={event => setArticleField('category', event.target.value as PublicArticleCategory)}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-500"
                >
                  <option value="NEWS">News</option>
                  <option value="ANNOUNCEMENT">Announcement</option>
                  <option value="EVENT">Event</option>
                </select>
              </label>
              <label className="block">
                <span className="text-xs font-medium text-slate-600">{t('publicSiteStatus')}</span>
                <select
                  value={articleForm.status}
                  onChange={event => setArticleField('status', event.target.value as PublicArticleStatus)}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-500"
                >
                  <option value="DRAFT">Draft</option>
                  <option value="PUBLISHED">Published</option>
                  <option value="ARCHIVED">Archived</option>
                </select>
              </label>
              <label className="block">
                <span className="text-xs font-medium text-slate-600">{t('publicSitePublishAt')}</span>
                <input
                  type="datetime-local"
                  value={articleForm.publishAt}
                  onChange={event => setArticleField('publishAt', event.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-500"
                />
              </label>
              <label className="block">
                <span className="text-xs font-medium text-slate-600">{t('publicSiteEventDate')}</span>
                <input
                  type="datetime-local"
                  value={articleForm.eventDate}
                  onChange={event => setArticleField('eventDate', event.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-500"
                />
              </label>
              <label className="block">
                <span className="text-xs font-medium text-slate-600">{t('publicSiteLocation')}</span>
                <input
                  value={articleForm.location}
                  onChange={event => setArticleField('location', event.target.value)}
                  maxLength={160}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-500"
                />
              </label>
              <label className="block">
                <span className="text-xs font-medium text-slate-600">{t('publicSiteImageUrl')}</span>
                <input
                  value={articleForm.imageUrl}
                  onChange={event => setArticleField('imageUrl', event.target.value)}
                  placeholder="/school-campus.svg or /public-assets/photo.jpg"
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-500"
                />
              </label>
              <label className="block md:col-span-2">
                <span className="text-xs font-medium text-slate-600">{t('publicSiteImageAlt')}</span>
                <input
                  value={articleForm.imageAlt}
                  onChange={event => setArticleField('imageAlt', event.target.value)}
                  maxLength={240}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-500"
                />
              </label>
            </div>

            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={articleForm.approved}
                onChange={event => setArticleField('approved', event.target.checked)}
                className="h-4 w-4 rounded border-slate-300"
              />
              {t('publicSiteApproved')}
            </label>

            <div>
              <button
                type="submit"
                disabled={busyId === (editingId || 'new')}
                className="rounded-lg bg-blue-700 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-800 disabled:opacity-60"
              >
                {t('publicSiteSave')}
              </button>
            </div>
          </form>

          {articles.length === 0 ? (
            <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-600">
              {t('publicSiteNoArticles')}
            </div>
          ) : (
            <div className="space-y-3">
              {articles.map(article => (
                <article key={article.id} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold text-slate-900">{article.title}</p>
                      <p className="text-sm text-slate-600">{article.summary}</p>
                      <p className="mt-1 text-xs text-slate-400">
                        {article.category} · {article.status} · {article.approved ? t('publicSiteApproved') : t('publicSitePendingApproval')}
                      </p>
                    </div>
                    <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
                      {t('publicSiteStatus')}: {article.status}
                    </span>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => startEdit(article)}
                      className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                    >
                      {t('publicSiteEditArticle')}
                    </button>
                    <button
                      type="button"
                      onClick={() => quickUpdate(article, {
                        status: 'PUBLISHED',
                        approved: true,
                        publishAt: new Date().toISOString()
                      })}
                      disabled={busyId === article.id}
                      className="inline-flex items-center gap-2 rounded-lg bg-emerald-700 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-800 disabled:opacity-60"
                    >
                      <CheckCircle2 size={16} /> {t('publicSitePublishNow')}
                    </button>
                    <button
                      type="button"
                      onClick={() => quickUpdate(article, { status: 'DRAFT' })}
                      disabled={busyId === article.id}
                      className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
                    >
                      <EyeOff size={16} /> {t('publicSiteUnpublish')}
                    </button>
                    <button
                      type="button"
                      onClick={() => removeArticle(article)}
                      disabled={busyId === article.id}
                      className="inline-flex items-center gap-2 rounded-lg border border-red-300 px-3 py-2 text-sm font-semibold text-red-700 hover:bg-red-50 disabled:opacity-60"
                    >
                      <Trash2 size={16} /> {t('publicSiteDelete')}
                    </button>
                  </div>
                </article>
              ))}
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-5">
          <form onSubmit={uploadImage} className="grid gap-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm md:grid-cols-2">
            <label className="block md:col-span-2">
              <span className="text-xs font-medium text-slate-600">{t('publicSiteImageFile')}</span>
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif"
                onChange={event => setUploadFile(event.target.files?.[0] || null)}
                required
                className="mt-1 w-full text-sm text-slate-600"
              />
            </label>
            <label className="block">
              <span className="text-xs font-medium text-slate-600">{t('publicSiteImageAlt')}</span>
              <input
                value={galleryForm.alt}
                onChange={event => setGalleryForm(previous => ({ ...previous, alt: event.target.value }))}
                minLength={5}
                maxLength={240}
                required
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-500"
              />
            </label>
            <label className="block">
              <span className="text-xs font-medium text-slate-600">{t('publicSiteCaption')}</span>
              <input
                value={galleryForm.caption}
                onChange={event => setGalleryForm(previous => ({ ...previous, caption: event.target.value }))}
                minLength={3}
                maxLength={240}
                required
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-500"
              />
            </label>
            <label className="block">
              <span className="text-xs font-medium text-slate-600">{t('publicSiteCategory')}</span>
              <input
                value={galleryForm.category}
                onChange={event => setGalleryForm(previous => ({ ...previous, category: event.target.value }))}
                maxLength={60}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-500"
              />
            </label>
            <div className="flex items-end">
              <button
                type="submit"
                disabled={busyId === 'upload' || !uploadFile}
                className="inline-flex items-center gap-2 rounded-lg bg-blue-700 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-800 disabled:opacity-60"
              >
                <ImagePlus size={16} /> {t('publicSiteUploadImage')}
              </button>
            </div>
          </form>

          {images.length === 0 ? (
            <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-600">
              {t('publicSiteNoImages')}
            </div>
          ) : (
            <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
              {images.map(image => (
                <article key={image.id} className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
                  <img src={image.src} alt={image.alt} className="h-36 w-full bg-slate-100 object-cover" loading="lazy" />
                  <div className="space-y-2 p-4">
                    <p className="text-sm font-semibold text-slate-900">{image.caption}</p>
                    <p className="text-xs text-slate-500">{image.category}</p>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => toggleImageApproval(image)}
                        disabled={busyId === image.id}
                        className={`rounded-lg px-3 py-2 text-xs font-semibold disabled:opacity-60 ${
                          image.approved
                            ? 'border border-slate-300 text-slate-700 hover:bg-slate-50'
                            : 'bg-emerald-700 text-white hover:bg-emerald-800'
                        }`}
                      >
                        {image.approved ? t('publicSiteRevokeImage') : t('publicSiteApproveImage')}
                      </button>
                      <button
                        type="button"
                        onClick={() => removeImage(image)}
                        disabled={busyId === image.id}
                        className="inline-flex items-center gap-1 rounded-lg border border-red-300 px-3 py-2 text-xs font-semibold text-red-700 hover:bg-red-50 disabled:opacity-60"
                      >
                        <Trash2 size={14} /> {t('publicSiteDelete')}
                      </button>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          )}
        </div>
      )}

      <p className="flex items-center gap-2 text-xs text-slate-500">
        <ShieldCheck size={14} /> {t('publicSitePrivacyNote')}
      </p>
    </section>
  );
};
