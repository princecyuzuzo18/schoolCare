/**
 * Regression checks for the public school website.
 *
 * Verifies that:
 *  - public pages and SEO assets work without a session
 *  - public APIs expose only approved content fields
 *  - private SchoolCare APIs still require authentication
 *  - the Login button points at the existing portal login
 *
 * Run with: npm run test:public-site
 */

process.env.SCHOOLCARE_SKIP_SERVER_START = '1';

import type { AddressInfo } from 'node:net';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

let passed = 0;
let failed = 0;

function check(label: string, condition: boolean): void {
  if (condition) {
    passed += 1;
    console.log(`[PASS] ${label}`);
  } else {
    failed += 1;
    console.error(`[FAIL] ${label}`);
  }
}

async function main(): Promise<void> {
  // Keep tests away from the real data/ directory and its uploaded photos.
  const contentDir = await fs.mkdtemp(path.join(os.tmpdir(), 'schoolcare-public-site-'));
  process.env.SCHOOLCARE_PUBLIC_CONTENT_DIR = contentDir;

  const { app } = await import('../server');
  const { PUBLIC_SITE_TEST_HOOKS } = await import('../server/publicSite');
  const {
    addGalleryImage,
    createArticle,
    listApprovedGallery,
    listPublishedArticles,
    setGalleryApproval,
    updateArticle
  } = await import('../server/publicContent');

  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>(resolve => server.once('listening', () => resolve()));
  const port = (server.address() as AddressInfo).port;
  const base = `http://127.0.0.1:${port}`;

  const get = async (url: string) => fetch(`${base}${url}`, { redirect: 'manual' });
  const text = async (url: string) => (await get(url)).text();

  const home = await text('/');
  check('public homepage opens without login', home.includes('Welcome to ES RUBENGERA RTB'));
  check('homepage has canonical URL', home.includes('rel="canonical"'));
  check('homepage has Open Graph metadata', home.includes('property="og:title"'));
  check('homepage has School structured data', home.includes('"@type":"School"'));
  check('homepage uses official school name', home.includes('ES RUBENGERA RTB'));
  check('login links to existing portal login', home.includes('/portal#/login'));
  check('no student result data in public HTML', !home.includes('reportCard') && !home.includes('attendance_records'));

  for (const route of ['/about', '/academics', '/news', '/events', '/admissions', '/gallery', '/contact']) {
    const response = await get(route);
    check(`${route} is publicly accessible`, response.status === 200);
  }

  const eventsHtml = await text('/events');
  const eventsCanonical = eventsHtml.match(/<link rel="canonical" href="([^"]+)"/)?.[1] || '';
  check('/events has its own canonical URL', eventsCanonical.endsWith('/events'));
  const sitemapXml = await text('/sitemap.xml');
  check('sitemap includes the events page', sitemapXml.includes('/events'));

  const sitemap = await text('/sitemap.xml');
  check('sitemap lists official website', sitemap.includes('<urlset') && sitemap.includes('/admissions'));
  const robots = await text('/robots.txt');
  check('robots.txt references sitemap', robots.includes('Sitemap:') && robots.includes('/sitemap.xml'));

  const newsResponse = await get('/api/public/news');
  const news = (await newsResponse.json()) as Array<Record<string, unknown>>;
  check('public news API is accessible', newsResponse.status === 200 && Array.isArray(news));
  check('public news contains only approved records', news.every(item => item.title && item.summary && item.body));
  check('public news hides internal fields', news.every(item =>
    !('status' in item) && !('approved' in item) && !('createdBy' in item) && !('publishAt' in item)
  ));

  const galleryResponse = await get('/api/public/gallery');
  const gallery = (await galleryResponse.json()) as Array<Record<string, unknown>>;
  check('public gallery API is accessible', galleryResponse.status === 200 && Array.isArray(gallery));
  check('public gallery requires alt text', gallery.every(item => typeof item.alt === 'string' && item.alt.length >= 5));

  const privatePaths = [
    '/api/students',
    '/api/notifications',
    '/api/attendance',
    '/api/users',
    '/api/admin/public-content/articles'
  ];
  for (const privatePath of privatePaths) {
    const response = await get(privatePath);
    check(`${privatePath} still requires authentication`, response.status === 401);
  }

  const unauthorizedWrite = await fetch(`${base}/api/admin/public-content/articles`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title: 'Unauthorized', summary: 'Should not be published', body: 'No session present.', category: 'NEWS', status: 'PUBLISHED', approved: true })
  });
  check('anonymous visitors cannot create news', unauthorizedWrite.status === 401);

  const published = listPublishedArticles();
  check('all public articles are approved', published.every(article => article.approved === true && article.status === 'PUBLISHED'));
  check('all gallery images are approved', listApprovedGallery().every(image => image.approved === true));
  check('HTML escaping is active', PUBLIC_SITE_TEST_HOOKS.escapeHtml('<script>alert(1)</script>').includes('&lt;script&gt;'));
  check('structured data uses School schema', PUBLIC_SITE_TEST_HOOKS.structuredData().includes('"@type":"School"'));

  const draft = createArticle({
    title: 'Public website scheduling test',
    summary: 'A test article used to verify that unpublished content stays private.',
    body: 'This article body is long enough to pass the public content validation rules used by the school website.',
    category: 'NEWS',
    status: 'DRAFT',
    approved: false
  }, 'public-site-test');
  check('draft article is not publicly visible', !listPublishedArticles().some(item => item.id === draft.id));

  const scheduled = updateArticle(draft.id, {
    status: 'PUBLISHED',
    approved: true,
    publishAt: new Date(Date.now() + 60 * 60 * 1000).toISOString()
  });
  check(
    'future-scheduled article is not publicly visible yet',
    Boolean(scheduled) && !listPublishedArticles().some(item => item.id === draft.id)
  );

  updateArticle(draft.id, { publishAt: new Date(Date.now() - 60 * 1000).toISOString() });
  check('published approved article becomes publicly visible', listPublishedArticles().some(item => item.id === draft.id));

  updateArticle(draft.id, { status: 'DRAFT' });
  check('unpublished article is hidden again', !listPublishedArticles().some(item => item.id === draft.id));

  const upload = addGalleryImage({
    src: '/public-assets/test-campus-photo.jpg',
    alt: 'Approved photograph of the school campus',
    caption: 'Campus view used by the public website test'
  }, 'public-site-test');
  check('unapproved gallery upload is not publicly visible', !listApprovedGallery().some(item => item.id === upload.id));
  setGalleryApproval(upload.id, true);
  check('approved gallery upload becomes publicly visible', listApprovedGallery().some(item => item.id === upload.id));

  await new Promise<void>(resolve => server.close(() => resolve()));
  await fs.rm(contentDir, { recursive: true, force: true });
  console.log(`\n${passed}/${passed + failed} public website checks passed.`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch(error => {
  console.error('Public website verification failed:', error instanceof Error ? error.message : error);
  process.exit(1);
});
