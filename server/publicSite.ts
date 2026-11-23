import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { Express, Request, Response, NextFunction, RequestHandler } from 'express';
import express from 'express';
import multer from 'multer';
import { authenticateUser, requirePermission } from './rbac';
import {
  PUBLIC_UPLOAD_DIR,
  PublicContentError,
  addGalleryImage,
  createArticle,
  deleteArticle,
  deleteGalleryImage,
  ensureUploadDir,
  getPublishedArticleBySlug,
  listAllArticles,
  listAllGallery,
  listApprovedGallery,
  listPublishedArticles,
  setGalleryApproval,
  updateArticle,
  type PublicArticle
} from './publicContent';

/**
 * Public school website surface.
 *
 * Everything in this module is intentionally isolated from the private
 * SchoolCare portal. It reads ONLY from server/publicContent.ts, which never
 * contains student, parent, staff, financial, health, message or report data.
 * The private SPA is untouched and remains behind the existing login flow at
 * /portal#/login.
 */

const SCHOOL = {
  name: 'ES RUBENGERA RTB',
  shortName: 'ES Rubengera RTB',
  legalName: 'Ecole Secondaire de Rubengera — RTB',
  motto: 'Ubumenyi, Umurimo, Ubupfura — Knowledge, Skill, Integrity',
  description:
    'ES Rubengera RTB is a secondary and technical TVET school in Rubengera, Karongi District, Western Province, Rwanda.',
  phone: '+250 788 340 120',
  phoneHref: '+250788340120',
  email: 'info@esrubengera.ac.rw',
  address: 'Rubengera, Karongi District, Western Province, Rwanda',
  mapsUrl: 'https://www.google.com/maps/search/?api=1&query=ES+Rubengera+RTB+Karongi+Rwanda'
};

const LOGIN_URL = '/portal#/login';
const APPLY_URL = '/apply';
const APPLICATION_FORM_URL = '/portal#/apply';
const TRACK_URL = '/portal#/track';

const NAV = [
  { href: '/', label: 'Home' },
  { href: '/about', label: 'About Us' },
  { href: '/academics', label: 'Academics' },
  { href: '/news', label: 'News & Events' },
  { href: APPLY_URL, label: 'Apply' },
  { href: '/gallery', label: 'Gallery' },
  { href: '/contact', label: 'Contact Us' }
];

function siteUrl(): string {
  const configured = (process.env.PUBLIC_SITE_URL || process.env.APP_URL || '').trim();
  if (/^https?:\/\//i.test(configured)) return configured.replace(/\/+$/, '');
  return `http://localhost:${process.env.PORT || 3010}`;
}

function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function paragraphs(value: string): string {
  return value
    .split(/\n\s*\n/)
    .map(part => `<p>${escapeHtml(part).replace(/\n/g, '<br />')}</p>`)
    .join('');
}

interface PageMeta {
  path: string;
  title: string;
  description: string;
}

function structuredData(): string {
  const base = siteUrl();
  const payload = {
    '@context': 'https://schema.org',
    '@type': 'School',
    name: SCHOOL.name,
    alternateName: SCHOOL.shortName,
    description: SCHOOL.description,
    url: `${base}/`,
    logo: `${base}/images/school-logo.png`,
    image: `${base}/images/school-logo.png`,
    telephone: SCHOOL.phoneHref,
    email: SCHOOL.email,
    address: {
      '@type': 'PostalAddress',
      addressLocality: 'Rubengera',
      addressRegion: 'Western Province',
      addressCountry: 'RW'
    },
    educationalOrganizationType: 'Secondary and Technical TVET School'
  };
  return JSON.stringify(payload).replace(/</g, '\\u003c');
}

function layout(meta: PageMeta, content: string): string {
  const canonical = `${siteUrl()}${meta.path}`;
  const closeMenu = ' onclick="this.closest(\'.nav\').classList.remove(\'open\')"';
  const navLinks = NAV.map(item => {
    const active = item.href === meta.path ? ' aria-current="page"' : '';
    const className = item.href === APPLY_URL ? ' class="apply-link"' : '';
    return `<a href="${item.href}"${className}${active}${closeMenu}>${escapeHtml(item.label)}</a>`;
  }).join('');

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(meta.title)}</title>
  <meta name="description" content="${escapeHtml(meta.description)}" />
  <link rel="canonical" href="${escapeHtml(canonical)}" />
  <meta property="og:type" content="website" />
  <meta property="og:site_name" content="${escapeHtml(SCHOOL.name)}" />
  <meta property="og:title" content="${escapeHtml(meta.title)}" />
  <meta property="og:description" content="${escapeHtml(meta.description)}" />
  <meta property="og:url" content="${escapeHtml(canonical)}" />
  <meta property="og:image" content="${escapeHtml(siteUrl())}/images/school-logo.png" />
  <meta property="og:locale" content="en_RW" />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="${escapeHtml(meta.title)}" />
  <meta name="twitter:description" content="${escapeHtml(meta.description)}" />
  <meta name="theme-color" content="#102B50" />
  <link rel="icon" type="image/svg+xml" href="/logo.svg" />
  <link rel="apple-touch-icon" href="/images/school-logo.png" />
  <script type="application/ld+json">${structuredData()}</script>
  <script>
    // Preserve existing private-portal bookmarks that used the SPA hash URLs.
    if (window.location.hash && window.location.hash.indexOf('#/') === 0) {
      window.location.replace('/portal' + window.location.hash + window.location.search);
    }
  </script>
  <style>
    :root{--navy:#102B50;--navy2:#173B6C;--blue:#2563EB;--sky:#EFF6FF;--ink:#17243B;--muted:#52627A;--line:#D9E3F0;--white:#fff}
    *{box-sizing:border-box}
    html{scroll-behavior:smooth}
    body{margin:0;font-family:Inter,"Segoe UI",system-ui,-apple-system,sans-serif;color:var(--ink);background:var(--white);line-height:1.65}
    a{color:inherit;text-decoration:none}
    img{max-width:100%;height:auto;display:block}
    .container{width:min(1120px,92%);margin:0 auto}
    .skip{position:absolute;left:-9999px;top:0;background:var(--navy);color:#fff;padding:10px 16px;z-index:100}
    .skip:focus{left:8px;top:8px}
    .topbar{background:linear-gradient(90deg,#0B1F3A 0%,var(--navy) 55%,#123A6B 100%);color:#c7d9f2;font-size:.8rem;padding:8px 0;letter-spacing:.02em}
    .topbar .container{display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap;align-items:center}
    .topbar span{display:inline-flex;align-items:center;gap:8px}
    .topbar span+span::before{content:"•";color:#6f9bd6;font-size:.9em}
    .site-header{background:rgba(255,255,255,.96);border-bottom:1px solid rgba(16,43,80,.1);position:sticky;top:0;z-index:50;box-shadow:0 6px 24px rgba(16,43,80,.06);backdrop-filter:saturate(140%) blur(10px)}
    .header-inner{display:flex;align-items:center;justify-content:space-between;gap:20px;padding:10px 0;min-height:74px}
    .brand{display:flex;align-items:center;gap:12px;font-weight:800;color:var(--navy);letter-spacing:.01em;line-height:1.1}
    .brand img{width:48px;height:48px;object-fit:contain;border-radius:10px;background:var(--sky);padding:4px}
    .brand span{display:block;font-size:1.02rem}
    .brand small{display:block;font-size:.64rem;font-weight:700;color:var(--blue);letter-spacing:.12em;text-transform:uppercase;margin-top:2px}
    .nav{display:flex;align-items:center;gap:4px;flex-wrap:wrap}
    .nav a{position:relative;font-size:.88rem;font-weight:600;color:var(--navy2);padding:9px 12px;border-radius:9px;transition:background .18s ease,color .18s ease,transform .18s ease}
    .nav a::after{content:"";position:absolute;left:12px;right:12px;bottom:5px;height:2px;background:var(--blue);border-radius:2px;transform:scaleX(0);transform-origin:left;transition:transform .2s ease}
    .nav a:hover{color:var(--blue);background:var(--sky)}
    .nav a:hover::after,.nav a[aria-current="page"]::after{transform:scaleX(1)}
    .nav a[aria-current="page"]{color:var(--blue);background:var(--sky);font-weight:700}
    .nav a.apply-link{background:linear-gradient(135deg,var(--blue),#1D4ED8);color:#fff;box-shadow:0 4px 12px rgba(37,99,235,.25)}
    .nav a.apply-link::after{display:none}
    .nav a.apply-link:hover{background:linear-gradient(135deg,#1D4ED8,var(--navy2));color:#fff;transform:translateY(-1px);box-shadow:0 6px 16px rgba(37,99,235,.32)}
    .nav a.login-btn{margin-left:6px;background:transparent;color:var(--navy2)!important;border:1.5px solid var(--line)!important;padding:8px 16px;border-radius:10px;font-weight:700}
    .nav a.login-btn:hover{background:var(--navy);color:#fff!important;border-color:var(--navy)!important;transform:translateY(-1px)}
    .menu-toggle{display:none;background:var(--sky);border:1px solid var(--line);border-radius:10px;padding:9px 11px;font-size:1.2rem;line-height:1;color:var(--navy);cursor:pointer;transition:background .18s ease}
    .hero{background:linear-gradient(135deg,var(--navy) 0%,var(--navy2) 58%,#1D4ED8 100%);color:#fff;padding:74px 0 80px}
    .hero-grid{display:grid;grid-template-columns:1.15fr .85fr;gap:44px;align-items:center}
    .hero h1{font-size:clamp(2.1rem,5vw,3.5rem);line-height:1.12;margin:0 0 18px;letter-spacing:-.02em}
    .hero p{font-size:1.08rem;max-width:620px;color:#dbeafe}
    .hero-actions{display:flex;gap:12px;flex-wrap:wrap;margin-top:26px}
    .btn{display:inline-block;padding:12px 22px;border-radius:10px;font-weight:700;font-size:.94rem}
    .btn-primary{background:#fff;color:var(--navy)}
    .btn-secondary{background:transparent;color:#fff;border:1.5px solid rgba(255,255,255,.7)}
    .hero-card{background:rgba(255,255,255,.1);border:1px solid rgba(255,255,255,.25);border-radius:20px;padding:24px;backdrop-filter:blur(4px)}
    .hero-card img{width:100%;height:260px;object-fit:cover;border-radius:14px;background:#fff}
    .motto{margin-top:16px;font-style:italic;color:#e0e7ff;font-size:.95rem;text-align:center}
    section{padding:66px 0}
    .section-alt{background:var(--sky)}
    .eyebrow{text-transform:uppercase;letter-spacing:.14em;font-size:.75rem;font-weight:800;color:var(--blue);margin:0 0 10px}
    h2{font-size:clamp(1.7rem,3.2vw,2.4rem);line-height:1.2;margin:0 0 16px;color:var(--navy)}
    h3{font-size:1.15rem;margin:0 0 8px;color:var(--navy2)}
    .lead{font-size:1.05rem;color:var(--muted);max-width:760px}
    .grid{display:grid;gap:22px}
    .grid-2{grid-template-columns:repeat(2,minmax(0,1fr))}
    .grid-3{grid-template-columns:repeat(3,minmax(0,1fr))}
    .grid-4{grid-template-columns:repeat(4,minmax(0,1fr))}
    .card{background:#fff;border:1px solid var(--line);border-radius:16px;padding:24px;box-shadow:0 8px 24px rgba(16,43,80,.05)}
    .card p{color:var(--muted);margin-bottom:0}
    .stat{text-align:center}
    .stat strong{display:block;font-size:2rem;color:var(--blue)}
    .news-list{display:grid;gap:18px}
    .news-item{display:grid;grid-template-columns:180px 1fr;gap:20px;align-items:start}
    .news-item img{width:100%;height:120px;object-fit:cover;border-radius:12px;background:var(--sky)}
    .news-meta{font-size:.8rem;color:var(--muted);text-transform:uppercase;letter-spacing:.06em;font-weight:700}
    .news-item h3{margin:6px 0}
    .tag{display:inline-block;background:var(--sky);color:var(--navy2);border-radius:999px;padding:3px 10px;font-size:.72rem;font-weight:800;text-transform:uppercase;letter-spacing:.05em}
    .gallery-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:16px}
    .gallery-grid figure{margin:0;background:#fff;border:1px solid var(--line);border-radius:14px;overflow:hidden}
    .gallery-grid img{width:100%;height:210px;object-fit:cover;background:var(--sky)}
    .gallery-grid figcaption{padding:12px 14px;font-size:.88rem;color:var(--muted)}
    .steps{counter-reset:step;list-style:none;padding:0;margin:0;display:grid;gap:16px}
    .steps li{counter-increment:step;position:relative;padding-left:52px}
    .steps li::before{content:counter(step);position:absolute;left:0;top:0;width:36px;height:36px;border-radius:50%;background:var(--blue);color:#fff;display:grid;place-items:center;font-weight:800}
    .contact-grid{display:grid;grid-template-columns:1fr 1fr;gap:28px}
    .site-footer{background:var(--navy);color:#cbd5e1;padding:52px 0 24px}
    .footer-grid{display:grid;grid-template-columns:1.4fr 1fr 1fr;gap:32px}
    .site-footer h3{color:#fff}
    .site-footer a:hover{text-decoration:underline}
    .footer-bottom{border-top:1px solid rgba(255,255,255,.15);margin-top:36px;padding-top:18px;font-size:.82rem;display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap}
    empty-state{padding:22px;border:1px dashed var(--line);border-radius:12px;color:var(--muted)}
    @media(max-width:900px){.hero-grid,.contact-grid,.footer-grid{grid-template-columns:1fr}.grid-4{grid-template-columns:repeat(2,1fr)}}
    @media(max-width:960px){
      .nav{display:none;position:absolute;top:100%;left:0;right:0;background:#fff;border-bottom:1px solid var(--line);padding:14px 4% 20px;flex-direction:column;align-items:stretch;gap:4px;box-shadow:0 18px 30px rgba(16,43,80,.12)}
      .nav.open{display:flex;animation:navFade .18s ease-out}
      .nav a{padding:11px 14px;border-radius:10px}
      .nav a::after{display:none}
      .nav a.login-btn{margin:6px 0 0;text-align:center}
      .menu-toggle{display:block}
    }
    @keyframes navFade{from{opacity:0;transform:translateY(-6px)}to{opacity:1;transform:none}}
    @media(max-width:720px){
      .grid-2,.grid-3,.grid-4,.gallery-grid,.news-item{grid-template-columns:1fr}
      .news-item img{height:170px}
      section{padding:48px 0}.hero{padding:52px 0 58px}
    }
  </style>
</head>
<body>
  <a class="skip" href="#main">Skip to main content</a>
  <div class="topbar"><div class="container"><span>${escapeHtml(SCHOOL.motto)}</span><span>Karongi District · Western Province · Rwanda</span></div></div>
  <header class="site-header">
    <div class="container header-inner">
      <a class="brand" href="/" aria-label="${escapeHtml(SCHOOL.name)} home">
        <img src="/images/school-logo.png" alt="ES Rubengera RTB official school logo" />
        <span>${escapeHtml(SCHOOL.name)}<small>Secondary &amp; Technical TVET</small></span>
      </a>
      <button class="menu-toggle" type="button" aria-label="Toggle navigation" aria-expanded="false" onclick="var n=document.querySelector('.nav');n.classList.toggle('open');this.setAttribute('aria-expanded',n.classList.contains('open'))">☰</button>
      <nav class="nav" aria-label="Main navigation">${navLinks}<a class="login-btn" href="${LOGIN_URL}"${closeMenu}>Login</a></nav>
    </div>
  </header>
  <main id="main">${content}</main>
  <footer class="site-footer">
    <div class="container">
      <div class="footer-grid">
        <div>
          <h3>${escapeHtml(SCHOOL.name)}</h3>
          <p>${escapeHtml(SCHOOL.description)}</p>
          <p>${escapeHtml(SCHOOL.motto)}</p>
        </div>
        <div>
          <h3>Quick links</h3>
          <p><a href="/about">About Us</a><br /><a href="/academics">Academics</a><br /><a href="/news">News &amp; Events</a><br /><a href="${APPLY_URL}">Apply</a><br /><a href="${TRACK_URL}">Track Application</a><br /><a href="/gallery">Gallery</a><br /><a href="/contact">Contact Us</a></p>
        </div>
        <div>
          <h3>Contact</h3>
          <p>${escapeHtml(SCHOOL.address)}<br /><a href="tel:${escapeHtml(SCHOOL.phoneHref)}">${escapeHtml(SCHOOL.phone)}</a><br /><a href="mailto:${escapeHtml(SCHOOL.email)}">${escapeHtml(SCHOOL.email)}</a></p>
          <p><a href="${LOGIN_URL}">Staff &amp; Parent Login</a></p>
        </div>
      </div>
      <div class="footer-bottom"><span>© ${new Date().getFullYear()} ${escapeHtml(SCHOOL.name)}. All rights reserved.</span><span>Approved public information only.</span></div>
    </div>
  </footer>
</body>
</html>`;
}

function articleCard(article: PublicArticle): string {
  const date = article.eventDate || article.publishAt || article.createdAt;
  const pretty = Number.isFinite(Date.parse(date))
    ? new Date(date).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })
    : '';
  const href = `/news/${encodeURIComponent(article.slug)}`;
  return `<article class="card news-item">
    ${article.imageUrl ? `<a href="${href}"><img src="${escapeHtml(article.imageUrl)}" alt="${escapeHtml(article.imageAlt || article.title)}" loading="lazy" /></a>` : ''}
    <div>
      <span class="tag">${escapeHtml(article.category === 'EVENT' ? 'Event' : article.category === 'ANNOUNCEMENT' ? 'Announcement' : 'News')}</span>
      <span class="news-meta">${escapeHtml(pretty)}</span>
      <h3><a href="${href}">${escapeHtml(article.title)}</a></h3>
      <p>${escapeHtml(article.summary)}</p>
      <p><a href="${href}" aria-label="Read ${escapeHtml(article.title)}">Read more →</a></p>
    </div>
  </article>`;
}

function sendHtml(res: Response, meta: PageMeta, content: string): void {
  res.status(200).type('html').set('Cache-Control', 'public, max-age=300').send(layout(meta, content));
}

function homePage(res: Response): void {
  const news = listPublishedArticles().slice(0, 3);
  const content = `
    <section class="hero">
      <div class="container hero-grid">
        <div>
          <p class="eyebrow">Official school website</p>
          <h1>Welcome to ${escapeHtml(SCHOOL.name)}</h1>
          <p>${escapeHtml(SCHOOL.description)} Our students learn knowledge, practical skills and strong character in a caring Rwandan school community.</p>
          <div class="hero-actions">
            <a class="btn btn-primary" href="${APPLY_URL}">Apply now</a>
            <a class="btn btn-secondary" href="/about">Learn about our school</a>
          </div>
        </div>
        <div class="hero-card">
          <img src="/public-assets/es1.webp" alt="ES Rubengera RTB school campus" />
          <p class="motto">“${escapeHtml(SCHOOL.motto)}”</p>
        </div>
      </div>
    </section>
    <section class="section-alt">
      <div class="container">
        <p class="eyebrow">Welcome message</p>
        <h2>A school rooted in Rubengera, focused on the future</h2>
        <p class="lead">At ${escapeHtml(SCHOOL.name)}, we combine strong academics with technical and vocational training so every learner can contribute to their community and country.</p>
        <div class="grid grid-4" style="margin-top:28px">
          <div class="card stat"><strong>01</strong><span>Secondary education</span></div>
          <div class="card stat"><strong>02</strong><span>TVET pathways</span></div>
          <div class="card stat"><strong>03</strong><span>Skills &amp; integrity</span></div>
          <div class="card stat"><strong>04</strong><span>Community partnership</span></div>
        </div>
      </div>
    </section>
    <section>
      <div class="container">
        <p class="eyebrow">Latest from the school</p>
        <h2>News &amp; announcements</h2>
        <div class="news-list">${news.length ? news.map(articleCard).join('') : '<p class="lead">No approved announcements have been published yet.</p>'}</div>
        <p style="margin-top:22px"><a class="btn btn-primary" href="/news">View all news and events</a></p>
      </div>
    </section>
    <section class="section-alt">
      <div class="container grid grid-3">
        <div class="card"><h3>Apply</h3><p>Find out how to apply, what to prepare and how to track an application.</p><p><a href="${APPLY_URL}">Apply information →</a></p></div>
        <div class="card"><h3>Academics</h3><p>Explore our secondary and TVET programmes.</p><p><a href="/academics">Academic programmes →</a></p></div>
        <div class="card"><h3>Contact</h3><p>Visit us in Rubengera or contact the school office.</p><p><a href="/contact">Contact details →</a></p></div>
      </div>
    </section>`;
  sendHtml(res, {
    path: '/',
    title: `${SCHOOL.name} | Official School Website`,
    description: `Official website of ${SCHOOL.name}, a secondary and technical TVET school in Rubengera, Karongi District, Rwanda. Learn about our programmes, news, how to apply and contact details.`
  }, content);
}

function aboutPage(res: Response): void {
  const content = `
    <section class="section-alt">
      <div class="container">
        <p class="eyebrow">About us</p>
        <h2>About ${escapeHtml(SCHOOL.name)}</h2>
        <p class="lead">${escapeHtml(SCHOOL.description)} We are committed to accessible, practical and values-based education for young people in our community.</p>
      </div>
    </section>
    <section>
      <div class="container grid grid-2">
        <div><h2>Our history</h2><p>${escapeHtml(SCHOOL.name)} serves the Rubengera community in Karongi District, Western Province of Rwanda. The school has grown alongside the community, offering secondary education and technical and vocational training that prepares learners for further study, work and service.</p></div>
        <div><img src="/school-campus.svg" alt="Illustration showing the school campus environment" /></div>
      </div>
    </section>
    <section class="section-alt">
      <div class="container grid grid-2">
        <div class="card"><h2>Our mission</h2><p>To provide quality secondary and technical education that builds knowledge, practical skills and integrity, enabling learners to thrive in Rwanda and beyond.</p></div>
        <div class="card"><h2>Our vision</h2><p>To be a centre of learning and character in Rubengera, where every learner is equipped with the skills and values needed for a productive and responsible life.</p></div>
      </div>
    </section>
    <section>
      <div class="container">
        <p class="eyebrow">Leadership</p>
        <h2>School leadership</h2>
        <p class="lead">${escapeHtml(SCHOOL.name)} is led by a school leadership team responsible for teaching quality, student welfare, discipline and community relations. For the names and contact details of current office holders, please contact the school office using the details on our <a href="/contact">Contact Us</a> page.</p>
        <div class="grid grid-3" style="margin-top:24px">
          <div class="card"><h3>Headteacher</h3><p>School leadership and overall administration.</p></div>
          <div class="card"><h3>Deputy Head Teacher</h3><p>Dean of studies and discipline.</p></div>
          <div class="card"><h3>Head of TVET</h3><p>Technical and vocational programmes.</p></div>
        </div>
      </div>
    </section>`;
  sendHtml(res, {
    path: '/about',
    title: `About Us | ${SCHOOL.name}`,
    description: `Learn about ${SCHOOL.name}: our history, mission, vision and school leadership structure in Rubengera, Karongi District, Rwanda.`
  }, content);
}

function academicsPage(res: Response): void {
  const content = `
    <section class="section-alt">
      <div class="container">
        <p class="eyebrow">Academics</p>
        <h2>Academic programmes at ${escapeHtml(SCHOOL.name)}</h2>
        <p class="lead">Our programmes combine a strong academic foundation with practical, work-ready skills in line with Rwanda's secondary and TVET priorities.</p>
      </div>
    </section>
    <section>
      <div class="container grid grid-3">
        <div class="card"><span class="tag">TVET RTB</span><h3>Software Development (SOD)</h3><p>Practical computing and software skills for learners preparing for technology careers.</p></div>
        <div class="card"><span class="tag">TVET RTB</span><h3>Networking (NIT)</h3><p>Computer networking and infrastructure skills for modern workplaces.</p></div>
        <div class="card"><span class="tag">TVET RTB</span><h3>Accounting</h3><p>Commercial accounting and entrepreneurship across Y1, Y2 and Y3.</p></div>
        <div class="card"><span class="tag">TVET Levels 4-5</span><h3>Advanced TVET pathways</h3><p>Further technical training for learners progressing beyond Level 3.</p></div>
        <div class="card"><span class="tag">Assessment</span><h3>Continuous assessment</h3><p>Class tests and terminal examinations measure knowledge, skills and conduct.</p></div>
        <div class="card"><span class="tag">Communication</span><h3>English &amp; Ikinyarwanda</h3><p>Communication skills support learning, work placements and community life.</p></div>
      </div>
    </section>
    <section class="section-alt">
      <div class="container"><h2>Learning environment</h2><p class="lead">Our classrooms, library and practical workshops support both academic study and technical training. Browse the <a href="/gallery">gallery</a> to see approved images of school facilities.</p></div>
    </section>`;
  sendHtml(res, {
    path: '/academics',
    title: `Academic Programmes | ${SCHOOL.name}`,
    description: `Explore current TVET programmes at ${SCHOOL.name}, including Software Development, Networking, Accounting and advanced technical pathways.`
  }, content);
}

function newsPage(res: Response, path = '/news'): void {
  const news = listPublishedArticles('NEWS').concat(listPublishedArticles('ANNOUNCEMENT'));
  const events = listPublishedArticles('EVENT');
  const content = `
    <section class="section-alt">
      <div class="container"><p class="eyebrow">News &amp; events</p><h2>School news and announcements</h2><p class="lead">Only information approved and published by the school appears here.</p></div>
    </section>
    <section>
      <div class="container">
        <h3>News &amp; announcements</h3>
        <div class="news-list">${news.length ? news.map(articleCard).join('') : '<p class="lead">No approved news has been published yet.</p>'}</div>
      </div>
    </section>
    <section class="section-alt">
      <div class="container">
        <h3>Events &amp; activities</h3>
        <div class="news-list">${events.length ? events.map(articleCard).join('') : '<p class="lead">No approved events have been published yet.</p>'}</div>
      </div>
    </section>`;
  sendHtml(res, {
    path,
    title: `News & Events | ${SCHOOL.name}`,
    description: `Read approved news, announcements and event information from ${SCHOOL.name} in Rubengera, Rwanda.`
  }, content);
}

function articlePage(res: Response, article: PublicArticle): void {
  const content = `
    <section class="section-alt">
      <div class="container">
        <p class="eyebrow">${escapeHtml(article.category === 'EVENT' ? 'School event' : article.category === 'ANNOUNCEMENT' ? 'Announcement' : 'School news')}</p>
        <h1>${escapeHtml(article.title)}</h1>
        <p class="lead">${escapeHtml(article.summary)}</p>
      </div>
    </section>
    <section>
      <div class="container">
        ${article.imageUrl ? `<img src="${escapeHtml(article.imageUrl)}" alt="${escapeHtml(article.imageAlt || article.title)}" style="border-radius:16px;margin-bottom:28px" />` : ''}
        <div>${paragraphs(article.body)}</div>
        ${article.location ? `<p><strong>Location:</strong> ${escapeHtml(article.location)}</p>` : ''}
        <p><a href="/news">← Back to all news and events</a></p>
      </div>
    </section>`;
  sendHtml(res, {
    path: `/news/${encodeURIComponent(article.slug)}`,
    title: `${article.title} | ${SCHOOL.name}`,
    description: article.summary
  }, content);
}

function applyPage(res: Response): void {
  const content = `
    <section class="section-alt">
      <div class="container">
        <p class="eyebrow">Apply</p><h1>Join ${escapeHtml(SCHOOL.name)}</h1>
        <p class="lead">We welcome applications from learners who are ready to learn, work hard and contribute to our school community. Completed Senior 3, or ready to transfer from another school? Apply online in a few simple steps — no account needed.</p>
        <p><a class="btn btn-primary" href="${APPLICATION_FORM_URL}">Apply online</a> <a class="btn btn-secondary" href="${TRACK_URL}" style="background:var(--navy2);color:#fff">Track an application</a></p>
      </div>
    </section>
    <section>
      <div class="container grid grid-2">
        <div>
          <h2>How to apply</h2>
          <ol class="steps">
            <li>Read the requirements below and prepare the documents requested by the school.</li>
            <li>Open the online application form using the Apply online button.</li>
            <li>Complete the form and submit your application.</li>
            <li>Save the reference number you receive after submission.</li>
            <li>Use the tracking page to follow the progress of your application.</li>
          </ol>
        </div>
        <div class="card">
          <h2>Admission requirements</h2>
          <p>Applicants should provide accurate personal details, previous school information and any documents requested by the school. Requirements vary by level and programme; the school office can confirm what is needed for your intended class.</p>
          <p>Please do not include private information about other people in an application.</p>
        </div>
      </div>
    </section>
    <section class="section-alt">
      <div class="container grid grid-2">
        <div class="card"><h2>Application process</h2><p>Applications are reviewed by the school. Applicants may be asked to provide additional information or to attend an interview or assessment. Decisions are communicated through the school's normal channels and can be checked on the tracking page.</p></div>
        <div class="card"><h2>School contact information</h2><p>${escapeHtml(SCHOOL.address)}<br /><a href="tel:${escapeHtml(SCHOOL.phoneHref)}">${escapeHtml(SCHOOL.phone)}</a><br /><a href="mailto:${escapeHtml(SCHOOL.email)}">${escapeHtml(SCHOOL.email)}</a></p><p>For help with an application, contact the school office.</p></div>
      </div>
    </section>`;
  sendHtml(res, {
    path: '/apply',
    title: `Apply | ${SCHOOL.name}`,
    description: `How to apply to ${SCHOOL.name}: requirements, application process and school contact information in Rubengera, Rwanda.`
  }, content);
}

function galleryPage(res: Response): void {
  const images = listApprovedGallery();
  const cards = images.map(image => `<figure><img src="${escapeHtml(image.src)}" alt="${escapeHtml(image.alt)}" loading="lazy" /><figcaption>${escapeHtml(image.caption)}</figcaption></figure>`).join('');
  const content = `
    <section class="section-alt">
      <div class="container"><p class="eyebrow">Gallery</p><h1>Photos of ${escapeHtml(SCHOOL.name)}</h1><p class="lead">Approved images of our campus and learning environment. Photographs of individual learners are not published here.</p></div>
    </section>
    <section>
      <div class="container"><div class="gallery-grid">${cards || '<p class="lead">No approved photographs are available yet.</p>'}</div></div>
    </section>`;
  sendHtml(res, {
    path: '/gallery',
    title: `School Gallery | ${SCHOOL.name}`,
    description: `View approved photographs of the campus, classrooms and facilities at ${SCHOOL.name} in Rubengera, Rwanda.`
  }, content);
}

function contactPage(res: Response): void {
  const content = `
    <section class="section-alt">
      <div class="container"><p class="eyebrow">Contact us</p><h1>Contact ${escapeHtml(SCHOOL.name)}</h1><p class="lead">We welcome enquiries from parents, guardians, learners and the community.</p></div>
    </section>
    <section>
      <div class="container contact-grid">
        <div class="card">
          <h2>School office</h2>
          <p><strong>Address:</strong><br />${escapeHtml(SCHOOL.address)}</p>
          <p><strong>Telephone:</strong> <a href="tel:${escapeHtml(SCHOOL.phoneHref)}">${escapeHtml(SCHOOL.phone)}</a></p>
          <p><strong>Email:</strong> <a href="mailto:${escapeHtml(SCHOOL.email)}">${escapeHtml(SCHOOL.email)}</a></p>
          <p><strong>Website:</strong> ${escapeHtml(siteUrl())}</p>
        </div>
        <div class="card">
          <h2>School location</h2>
          <p>${escapeHtml(SCHOOL.address)}</p>
          <p><a href="${escapeHtml(SCHOOL.mapsUrl)}" target="_blank" rel="noopener noreferrer">Open the school location in Google Maps →</a></p>
          <img src="/school-campus.svg" alt="Illustration of the ES Rubengera RTB campus area" style="border-radius:12px;margin-top:16px" />
        </div>
      </div>
    </section>
    <section class="section-alt">
      <div class="container"><h2>Portal login</h2><p class="lead">Staff, parents and students can sign in to the private SchoolCare portal.</p><p><a class="btn btn-primary" href="${LOGIN_URL}">Go to SchoolCare Login</a></p></div>
    </section>`;
  sendHtml(res, {
    path: '/contact',
    title: `Contact Us | ${SCHOOL.name}`,
    description: `Contact ${SCHOOL.name} in Rubengera, Karongi District, Western Province, Rwanda. Find our address, telephone, email and school location.`
  }, content);
}

function sitemap(res: Response): void {
  const base = siteUrl();
  const paths = [...NAV.map(item => item.href), '/events'];
  const articles = listPublishedArticles().map(article => `/news/${encodeURIComponent(article.slug)}`);
  const urls = Array.from(new Set([...paths, ...articles]));
  const body = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map(item => `  <url><loc>${escapeHtml(base + item)}</loc></url>`).join('\n')}
</urlset>`;
  res.status(200).type('application/xml').set('Cache-Control', 'public, max-age=3600').send(body);
}

function robots(res: Response): void {
  const body = `User-agent: *
Allow: /
# Keep the private portal and all JSON APIs out of search indexes.
Disallow: /api/
Disallow: /portal
Disallow: /public-assets/

Sitemap: ${siteUrl()}/sitemap.xml
`;
  res.status(200).type('text/plain').set('Cache-Control', 'public, max-age=3600').send(body);
}

function publicArticleDto(article: PublicArticle) {
  return {
    id: article.id,
    slug: article.slug,
    title: article.title,
    summary: article.summary,
    body: article.body,
    category: article.category,
    publishedAt: article.publishedAt || article.publishAt || article.createdAt,
    eventDate: article.eventDate,
    location: article.location,
    imageUrl: article.imageUrl,
    imageAlt: article.imageAlt
  };
}

function respondWithPublicError(res: Response, error: unknown): void {
  if (error instanceof PublicContentError) {
    res.status(400).json({ error: error.message });
    return;
  }
  console.error('[PublicSite] Request failed:', error);
  res.status(500).json({ error: 'Unable to complete this request.' });
}

const imageUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, cb) => {
    const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
    if (!allowed.includes(file.mimetype)) {
      cb(new PublicContentError('Upload a JPG, PNG, WEBP or GIF school photograph.'));
      return;
    }
    cb(null, true);
  }
});

function hasImageMagic(buffer: Buffer, mimetype: string): boolean {
  if (mimetype === 'image/jpeg') return buffer[0] === 0xff && buffer[1] === 0xd8;
  if (mimetype === 'image/png') return buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  if (mimetype === 'image/gif') return buffer.subarray(0, 3).toString('ascii') === 'GIF';
  if (mimetype === 'image/webp') return buffer.subarray(0, 4).toString('ascii') === 'RIFF' && buffer.subarray(8, 12).toString('ascii') === 'WEBP';
  return false;
}

const requireSiteAdmin: RequestHandler[] = [authenticateUser, requirePermission('school:write')];

/** Registers all public website routes on the existing Express app. */
export function registerPublicSite(app: Express): void {
  ensureUploadDir();
  app.use(
    '/public-assets',
    express.static(PUBLIC_UPLOAD_DIR, {
      fallthrough: true,
      setHeaders: res => {
        res.setHeader('Cache-Control', 'public, max-age=86400');
        res.setHeader('X-Content-Type-Options', 'nosniff');
      }
    })
  );

  // --- Public JSON APIs (mounted before the private /api auth middleware) ---
  app.get('/api/public/site', (_req: Request, res: Response) => {
    res.json({
      school: {
        name: SCHOOL.name,
        description: SCHOOL.description,
        motto: SCHOOL.motto,
        address: SCHOOL.address,
        phone: SCHOOL.phone,
        email: SCHOOL.email
      },
      loginUrl: LOGIN_URL,
      applyUrl: APPLY_URL,
      applicationUrl: APPLICATION_FORM_URL,
      trackUrl: TRACK_URL
    });
  });
  app.get('/api/public/news', (_req: Request, res: Response) => {
    res.json(listPublishedArticles().filter(a => a.category !== 'EVENT').map(publicArticleDto));
  });
  app.get('/api/public/events', (_req: Request, res: Response) => {
    res.json(listPublishedArticles('EVENT').map(publicArticleDto));
  });
  app.get('/api/public/gallery', (_req: Request, res: Response) => {
    res.json(listApprovedGallery().map(image => ({ src: image.src, alt: image.alt, caption: image.caption, category: image.category })));
  });

  // --- Public HTML pages ---
  app.get('/', (_req: Request, res: Response) => homePage(res));
  app.get('/about', (_req: Request, res: Response) => aboutPage(res));
  app.get('/academics', (_req: Request, res: Response) => academicsPage(res));
  app.get('/news', (_req: Request, res: Response) => newsPage(res));
  app.get('/news/:slug', (req: Request, res: Response) => {
    const article = getPublishedArticleBySlug(req.params.slug);
    if (!article) {
      res.status(404).type('html').send(layout({
        path: '/news',
        title: `Page not found | ${SCHOOL.name}`,
        description: 'The requested page could not be found.'
      }, '<section><div class="container"><h1>Page not found</h1><p><a href="/news">Return to news and events</a></p></div></section>'));
      return;
    }
    articlePage(res, article);
  });
  app.get('/events', (_req: Request, res: Response) => newsPage(res, '/events'));
  app.get('/apply', (_req: Request, res: Response) => applyPage(res));
  app.get('/gallery', (_req: Request, res: Response) => galleryPage(res));
  app.get('/contact', (_req: Request, res: Response) => contactPage(res));
  app.get('/sitemap.xml', (_req: Request, res: Response) => sitemap(res));
  app.get('/robots.txt', (_req: Request, res: Response) => robots(res));

  // --- Administrator content management (existing authentication + permissions) ---
  app.get('/api/admin/public-content/articles', ...requireSiteAdmin, (_req: Request, res: Response) => {
    res.json(listAllArticles());
  });
  app.post('/api/admin/public-content/articles', ...requireSiteAdmin, (req: Request, res: Response) => {
    try {
      const article = createArticle(req.body || {}, String((req as any).user?.id || ''));
      res.status(201).json(article);
    } catch (error) {
      respondWithPublicError(res, error);
    }
  });
  app.patch('/api/admin/public-content/articles/:id', ...requireSiteAdmin, (req: Request, res: Response) => {
    try {
      const article = updateArticle(req.params.id, req.body || {});
      if (!article) return res.status(404).json({ error: 'Article not found.' });
      return res.json(article);
    } catch (error) {
      return respondWithPublicError(res, error);
    }
  });
  app.delete('/api/admin/public-content/articles/:id', ...requireSiteAdmin, (req: Request, res: Response) => {
    res.json({ deleted: deleteArticle(req.params.id) });
  });

  app.get('/api/admin/public-content/gallery', ...requireSiteAdmin, (_req: Request, res: Response) => {
    res.json(listAllGallery());
  });
  app.post(
    '/api/admin/public-content/gallery/upload',
    ...requireSiteAdmin,
    (req: Request, res: Response, next: NextFunction) => imageUpload.single('image')(req, res, next),
    (req: Request, res: Response) => {
      try {
        if (!req.file) throw new PublicContentError('Choose a school photograph to upload.');
        if (!hasImageMagic(req.file.buffer, req.file.mimetype)) {
          throw new PublicContentError('The uploaded file is not a valid image.');
        }
        ensureUploadDir();
        const extension = req.file.mimetype.split('/')[1].replace('jpeg', 'jpg');
        const filename = `${crypto.randomUUID()}.${extension}`;
        fs.writeFileSync(path.join(PUBLIC_UPLOAD_DIR, filename), req.file.buffer, { mode: 0o600 });
        const image = addGalleryImage({
          src: `/public-assets/${filename}`,
          alt: String(req.body?.alt || ''),
          caption: String(req.body?.caption || ''),
          category: String(req.body?.category || 'School Life')
        }, String((req as any).user?.id || ''));
        res.status(201).json(image);
      } catch (error) {
        respondWithPublicError(res, error);
      }
    }
  );
  app.patch('/api/admin/public-content/gallery/:id/approval', ...requireSiteAdmin, (req: Request, res: Response) => {
    const approved = req.body?.approved === true;
    const image = setGalleryApproval(req.params.id, approved);
    if (!image) return res.status(404).json({ error: 'Image not found.' });
    return res.json(image);
  });
  app.delete('/api/admin/public-content/gallery/:id', ...requireSiteAdmin, (req: Request, res: Response) => {
    res.json({ deleted: deleteGalleryImage(req.params.id) });
  });
}

export const PUBLIC_SITE_TEST_HOOKS = {
  escapeHtml,
  layout,
  structuredData,
  publicArticleDto,
  SCHOOL,
  LOGIN_URL,
  APPLY_URL,
  APPLICATION_FORM_URL
};
