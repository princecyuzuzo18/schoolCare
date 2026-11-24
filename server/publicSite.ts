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
  { href: '/', label: 'Home', labelRw: 'Ahabanza' },
  { href: '/about', label: 'About Us', labelRw: 'Ibyacu' },
  { href: '/academics', label: 'Academics', labelRw: 'Imyigire', children: [
    { href: '/academics', label: 'Academic Programmes', labelRw: 'Gahunda z’Imyigire' },
    { href: '/departments', label: 'Departments', labelRw: 'Amashami' }
  ]},
  { href: '/news', label: 'News & Events', labelRw: 'Amakuru n’Ibirori' },
  { href: '/gallery', label: 'Gallery', labelRw: 'Amashusho' },
  { href: '/contact', label: 'Contact Us', labelRw: 'Tuvugane' },
  { href: TRACK_URL, label: 'Track Application', labelRw: 'Kurikirana Ubusabe' }
];

const PROGRAMS = [
  {
    title: 'Software Development (SOD)',
    category: 'TVET RTB',
    description: 'Practical computing and software skills for learners preparing for technology careers.'
  },
  {
    title: 'Networking (NIT)',
    category: 'TVET RTB',
    description: 'Computer networking and infrastructure skills for modern workplaces.'
  },
  {
    title: 'Accounting',
    category: 'TVET RTB',
    description: 'Commercial accounting and entrepreneurship across Y1, Y2 and Y3.'
  },
  {
    title: 'Advanced TVET pathways',
    category: 'TVET Levels 4-5',
    description: 'Further technical training for learners progressing beyond Level 3.'
  },
  {
    title: 'Continuous assessment',
    category: 'Assessment',
    description: 'Class tests and terminal examinations measure knowledge, skills and conduct.'
  },
  {
    title: 'English & Ikinyarwanda',
    category: 'Communication',
    description: 'Communication skills support learning, work placements and community life.'
  }
];

const HERO_SLIDES = [
  {
    src: '/images/esrubengera/welcome.webp',
    alt: 'ES Rubengera RTB welcome view of the school campus',
    eyebrowEn: 'Official school website',
    eyebrowRw: 'Urubuga rwemewe rw’ishuri',
    titleEn: 'Welcome to ES RUBENGERA RTB',
    titleRw: 'Murakaza neza muri ES RUBENGERA RTB',
    textEn: 'A secondary and technical TVET school in Rubengera, Karongi District, Rwanda.',
    textRw: 'Ishuri ry’imyigire n’ubumenyi bw’imikorere mu Murenge wa Rubengera, Akarere ka Karongi, mu Rwanda.',
    primaryEn: 'Apply now',
    primaryRw: 'Saba kwinjira',
    secondaryEn: 'Learn about our school',
    secondaryRw: 'Menya ishuri ryacu'
  },
  {
    src: '/public-assets/smart-class.webp',
    alt: 'Students learning in a smart classroom at ES Rubengera RTB',
    eyebrowEn: 'Knowledge in action',
    eyebrowRw: 'Ubumenyi mu bikorwa',
    titleEn: 'Learning with purpose',
    titleRw: 'Kwiga hagamijwe intego',
    textEn: 'Our motto — Ubumenyi, Umurimo, Ubupfura — guides learning, practical work and character.',
    textRw: 'Inyigisho zacu — Ubumenyi, Umurimo, Ubupfura — ziyobora kwiga, gukora no kubaka umuntu w’ubupfura.',
    primaryEn: 'Explore our programmes',
    primaryRw: 'Reba gahunda zacu',
    secondaryEn: 'View school life',
    secondaryRw: 'Reba ubuzima bw’ishuri'
  },
  {
    src: '/public-assets/es6.webp',
    alt: 'Approved photograph of school activities at ES Rubengera RTB',
    eyebrowEn: 'Rooted in Rubengera',
    eyebrowRw: 'Ifuratse muri Rubengera',
    titleEn: 'A community of learners',
    titleRw: 'Umuryango w’abiga',
    textEn: 'We serve families in Karongi District with secondary education and technical and vocational training.',
    textRw: 'Dukorera imiryango yo mu Karere ka Karongi imyigire yisumbuye n’ubumenyi bw’umwuga.',
    primaryEn: 'See our gallery',
    primaryRw: 'Reba amashusho',
    secondaryEn: 'Contact the school',
    secondaryRw: 'Vugana n’ishuri'
  }
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
  const navItems = [...NAV, { href: APPLY_URL, label: 'Apply', labelRw: 'Saba Kwinjira' }];
  const navLinks = navItems
    .map(item => {
      const children = (item as { children?: Array<{ href: string; label: string; labelRw: string }> }).children;
      const isActive = item.href === meta.path || (children || []).some(child => child.href === meta.path);
      const active = isActive ? ' aria-current="page"' : '';
      if (children && children.length) {
        const childLinks = children
          .map(child => {
            const childActive = child.href === meta.path ? ' aria-current="page"' : '';
            return `<a href="${child.href}" role="menuitem"${childActive} data-en="${escapeHtml(child.label)}" data-rw="${escapeHtml(child.labelRw)}" data-nav-link>${escapeHtml(child.label)}</a>`;
          })
          .join('');
        return `<div class="nav-item has-dropdown${isActive ? ' is-active' : ''}" data-dropdown>
          <a href="${item.href}" class="nav-trigger"${active} aria-haspopup="true" aria-expanded="false" data-dropdown-trigger data-en="${escapeHtml(item.label)}" data-rw="${escapeHtml(item.labelRw)}" data-nav-link>${escapeHtml(item.label)}<span class="nav-caret" aria-hidden="true"></span></a>
          <div class="dropdown-menu" role="menu" aria-label="${escapeHtml(item.label)} submenu">${childLinks}</div>
        </div>`;
      }
      const className = item.href === APPLY_URL ? ' class="apply-link"' : '';
      return `<a href="${item.href}"${className}${active} data-en="${escapeHtml(item.label)}" data-rw="${escapeHtml(item.labelRw)}" data-nav-link>${escapeHtml(item.label)}</a>`;
    })
    .join('');

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
  <meta name="theme-color" content="#0B2E5B" />
  <link rel="icon" type="image/svg+xml" href="/logo.svg" />
  <link rel="apple-touch-icon" href="/images/school-logo.png" />
  <script type="application/ld+json">${structuredData()}</script>
  <script>
    if (window.location.hash && window.location.hash.indexOf('#/') === 0) {
      window.location.replace('/portal' + window.location.hash + window.location.search);
    }
  </script>
  <style>
    :root{--navy:#082B63;--navy2:#1455A0;--blue:#1455A0;--blue2:#1A6BC7;--sky:#F4F7FC;--ink:#17243B;--muted:#52627A;--line:#D9E3F0;--white:#fff;--shadow:0 18px 48px rgba(8,43,99,.12)}
    *{box-sizing:border-box}
    html{scroll-behavior:smooth;overflow-x:hidden}
    body{margin:0;font-family:Inter,"Segoe UI",system-ui,-apple-system,sans-serif;color:var(--ink);background:#041835;line-height:1.65;overflow-x:hidden}
    body::before{content:"";position:fixed;inset:0;z-index:-2;background:url('/images/esrubengera/welcome.webp') center/cover no-repeat;transform:translateZ(0)}
    body::after{content:"";position:fixed;inset:0;z-index:-1;background:linear-gradient(180deg,rgba(4,24,53,.62) 0%,rgba(6,35,73,.56) 35%,rgba(4,24,53,.72) 100%),linear-gradient(90deg,rgba(4,24,53,.18) 0%,rgba(4,24,53,.08) 50%,rgba(4,24,53,.18) 100%)}
    a{color:inherit;text-decoration:none}
    img{max-width:100%;height:auto;display:block}
    button{font:inherit}
    .container{width:min(1160px,92%);margin:0 auto}
    .skip{position:absolute;left:-9999px;top:0;background:var(--navy);color:#fff;padding:10px 16px;z-index:200;border-radius:0 0 10px 0}
    .skip:focus{left:8px;top:8px}
    .topbar{background:linear-gradient(90deg,#051A3D 0%,var(--navy) 55%,var(--navy2) 100%);color:#c7d9f2;font-size:.78rem;padding:8px 0;letter-spacing:.02em;transition:transform .28s ease,opacity .28s ease}
    .topbar .container{display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap;align-items:center}
    .topbar span{display:inline-flex;align-items:center;gap:8px}
    .topbar span+span::before{content:"•";color:#6f9bd6;font-size:.9em}
    .site-header{background:rgba(255,255,255,.98);border-bottom:1px solid rgba(8,43,99,.08);position:sticky;top:0;z-index:100;transition:background .28s ease,box-shadow .28s ease,border-color .28s ease}
    .site-header.is-scrolled{background:rgba(255,255,255,.99);box-shadow:0 10px 30px rgba(8,43,99,.1);border-bottom-color:rgba(8,43,99,.12)}
    .header-inner{display:flex;align-items:center;justify-content:space-between;gap:18px;padding:11px 0;min-height:78px;transition:min-height .28s ease,padding .28s ease}
    .site-header.is-scrolled .header-inner{min-height:68px;padding:7px 0}
    .brand{display:flex;align-items:center;gap:12px;font-weight:800;color:var(--navy);letter-spacing:.01em;line-height:1.1;min-width:0}
    .brand img{width:50px;height:50px;object-fit:contain;border-radius:12px;background:var(--sky);padding:4px;flex:none;transition:width .28s ease,height .28s ease}
    .site-header.is-scrolled .brand img{width:44px;height:44px}
    .brand span{display:block;font-size:1.02rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .brand small{display:block;font-size:.62rem;font-weight:700;color:var(--navy2);letter-spacing:.13em;text-transform:uppercase;margin-top:2px;white-space:nowrap}
    .nav-wrap{display:flex;align-items:center;gap:10px;min-width:0}
    .nav{display:flex;align-items:center;gap:2px;flex-wrap:nowrap}
    .nav a,.nav-trigger{position:relative;white-space:nowrap;font-size:.84rem;font-weight:650;color:var(--navy);padding:10px 11px;border-radius:10px;background:transparent;border:0;cursor:pointer;transition:background .2s ease,color .2s ease,transform .2s ease}
    .nav a::after,.nav-trigger::after{content:"";position:absolute;left:11px;right:11px;bottom:6px;height:2px;background:var(--navy2);border-radius:2px;transform:scaleX(0);transform-origin:left;transition:transform .22s ease}
    .nav a:hover,.nav-trigger:hover{color:var(--navy2);background:var(--sky)}
    .nav a:hover::after,.nav a[aria-current="page"]::after,.nav-trigger:hover::after,.nav-trigger[aria-current="page"]::after,.nav-item.is-open .nav-trigger::after{transform:scaleX(1)}
    .nav a[aria-current="page"],.nav-trigger[aria-current="page"]{color:var(--navy2);background:var(--sky);font-weight:800}
    .nav-item{position:relative}
    .nav-caret{display:inline-block;width:0;height:0;margin-left:6px;border-left:4px solid transparent;border-right:4px solid transparent;border-top:5px solid currentColor;vertical-align:middle;transition:transform .2s ease;opacity:.75}
    .nav-item.is-open .nav-caret{transform:rotate(180deg)}
    .dropdown-menu{position:absolute;top:calc(100% + 8px);left:0;min-width:220px;padding:8px;background:#fff;border:1px solid rgba(8,43,99,.1);border-radius:14px;box-shadow:0 20px 40px rgba(8,43,99,.12);opacity:0;visibility:hidden;transform:translateY(-8px);transition:opacity .22s ease,transform .22s ease,visibility .22s ease;z-index:30}
    .nav-item.is-open .dropdown-menu{opacity:1;visibility:visible;transform:translateY(0)}
    .dropdown-menu a{display:block;padding:10px 12px;border-radius:10px;font-size:.84rem;color:var(--navy)}
    .dropdown-menu a::after{display:none}
    .dropdown-menu a:hover,.dropdown-menu a[aria-current="page"]{background:var(--sky);color:var(--navy2)}
    .nav a.apply-link{background:transparent;color:var(--navy);box-shadow:none;border:1px solid rgba(8,43,99,.12)}
    .nav a.apply-link:hover{color:var(--navy2);background:var(--sky);transform:none}
    .lang-switch{display:inline-flex;align-items:center;gap:4px;border:1px solid rgba(8,43,99,.14);border-radius:12px;padding:4px;background:#fff}
    .lang-switch button{min-width:40px;min-height:36px;border:0;border-radius:8px;background:transparent;color:var(--muted);font-size:.72rem;font-weight:800;cursor:pointer;transition:background .18s ease,color .18s ease,transform .18s ease}
    .lang-switch button:hover{color:var(--navy);background:var(--sky)}
    .lang-switch button[aria-pressed="true"]{background:var(--navy);color:#fff}
    .login-btn{white-space:nowrap;background:var(--navy);color:#fff!important;border:1px solid var(--navy)!important;padding:10px 18px;border-radius:12px;font-size:.84rem;font-weight:800;box-shadow:0 10px 24px rgba(8,43,99,.2);transition:transform .2s ease,box-shadow .2s ease,background .2s ease}
    .login-btn:hover{background:var(--navy2);transform:translateY(-2px);box-shadow:0 14px 28px rgba(20,85,160,.28)}
    .login-btn:active{transform:translateY(0)}
    .login-btn::after{display:none!important}
    .menu-toggle{display:none;position:relative;width:44px;height:44px;background:var(--sky);border:1px solid rgba(8,43,99,.14);border-radius:12px;padding:0;color:var(--navy);cursor:pointer;transition:background .2s ease,border-color .2s ease}
    .menu-toggle:hover{background:#e8f0fb;border-color:rgba(20,85,160,.28)}
    .menu-toggle span,.menu-toggle span::before,.menu-toggle span::after{display:block;position:absolute;left:11px;right:11px;height:2px;background:currentColor;border-radius:2px;transition:transform .25s ease,top .25s ease,opacity .2s ease}
    .menu-toggle span{top:20px}
    .menu-toggle span::before,.menu-toggle span::after{content:"";left:0;right:0}
    .menu-toggle span::before{top:-7px}
    .menu-toggle span::after{top:7px}
    .menu-toggle[aria-expanded="true"] span{background:transparent}
    .menu-toggle[aria-expanded="true"] span::before{top:0;transform:rotate(45deg)}
    .menu-toggle[aria-expanded="true"] span::after{top:0;transform:rotate(-45deg)}
    .hero{position:relative;isolation:isolate;min-height:clamp(560px,78vh,760px);color:#fff;background:var(--navy);overflow:hidden}
    .hero-slide{position:absolute;inset:0;opacity:0;visibility:hidden;transition:opacity .85s ease,visibility .85s ease;pointer-events:none}
    .hero-slide.is-active{opacity:1;visibility:visible;pointer-events:auto}
    .hero-slide img{width:100%;height:100%;object-fit:cover;object-position:center;transform:scale(1.035);transition:transform 7s linear}
    .hero-slide.is-active img{transform:scale(1)}
    .hero-overlay{position:absolute;inset:0;background:linear-gradient(180deg,rgba(4,24,53,.72) 0%,rgba(6,35,73,.86) 50%,rgba(4,24,53,.92) 100%)}
    .hero-content{position:relative;z-index:2;min-height:inherit;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:80px 0 108px}
    .hero-content .eyebrow{color:#bfdbfe;background:rgba(255,255,255,.1);border-color:rgba(255,255,255,.25)}
    .hero h1{font-size:clamp(2.25rem,5.4vw,4.4rem);line-height:1.08;margin:0 0 18px;letter-spacing:-.035em;max-width:980px;text-wrap:balance}
    .hero p.hero-text{font-size:clamp(1rem,1.6vw,1.2rem);max-width:720px;color:#dbeafe;margin:0 auto}
    .hero-actions{display:flex;gap:12px;flex-wrap:wrap;margin-top:30px;justify-content:center}
    .btn{display:inline-flex;align-items:center;justify-content:center;min-height:48px;padding:11px 22px;border-radius:11px;font-weight:800;font-size:.92rem;transition:transform .18s ease,box-shadow .18s ease,background .18s ease}
    .btn:hover{transform:translateY(-2px)}
    .btn-primary{background:#fff;color:var(--navy);box-shadow:0 12px 30px rgba(0,0,0,.18)}
    .btn-secondary{background:rgba(255,255,255,.08);color:#fff;border:1.5px solid rgba(255,255,255,.65);backdrop-filter:blur(4px)}
    .btn-secondary:hover{background:rgba(255,255,255,.16)}
    .hero-arrow{position:absolute;top:50%;z-index:4;width:44px;height:44px;transform:translateY(-50%);border-radius:50%;border:1px solid rgba(255,255,255,.35);background:rgba(4,24,53,.38);color:#fff;font-size:1.8rem;line-height:1;cursor:pointer;backdrop-filter:blur(4px);transition:background .18s ease}
    .hero-arrow:hover{background:rgba(255,255,255,.18)}
    .hero-prev{left:18px}.hero-next{right:18px}
    .hero-dots{position:absolute;z-index:4;bottom:30px;left:50%;transform:translateX(-50%);display:flex;gap:9px}
    .hero-dots button{width:11px;height:11px;padding:0;border-radius:50%;border:2px solid rgba(255,255,255,.75);background:transparent;cursor:pointer;transition:background .18s ease,transform .18s ease}
    .hero-dots button[aria-selected="true"]{background:#fff;transform:scale(1.25)}
    section{padding:70px 0;scroll-margin-top:86px}
    .section-alt{background:rgba(244,247,252,.95);backdrop-filter:blur(2px)}
    .section-white{background:rgba(255,255,255,.96);backdrop-filter:blur(2px)}
    .eyebrow{display:inline-block;text-transform:uppercase;letter-spacing:.14em;font-size:.72rem;font-weight:800;color:var(--blue);margin:0 0 10px}
    h2{font-size:clamp(1.75rem,3.2vw,2.5rem);line-height:1.2;margin:0 0 16px;color:var(--navy);letter-spacing:-.025em}
    h3{font-size:1.12rem;margin:0 0 8px;color:var(--navy2)}
    .lead{font-size:1.05rem;color:var(--muted);max-width:780px}
    .grid{display:grid;gap:22px}
    .grid-2{grid-template-columns:repeat(2,minmax(0,1fr))}
    .grid-3{grid-template-columns:repeat(3,minmax(0,1fr))}
    .grid-4{grid-template-columns:repeat(4,minmax(0,1fr))}
    .card{background:#fff;border:1px solid var(--line);border-radius:17px;padding:24px;box-shadow:0 10px 28px rgba(11,46,91,.055);transition:transform .22s ease,box-shadow .22s ease,border-color .22s ease}
    .card:hover{transform:translateY(-4px);border-color:#b9d1f5;box-shadow:var(--shadow)}
    .card p{color:var(--muted);margin-bottom:0}
    .value-card{text-align:center}
    .value-icon{width:48px;height:48px;margin:0 auto 14px;border-radius:14px;display:grid;place-items:center;background:var(--sky);color:var(--blue);font-weight:900}
    .about-media{position:relative;border-radius:22px;overflow:hidden;box-shadow:var(--shadow);border:1px solid var(--line)}
    .about-media img{width:100%;height:420px;object-fit:cover}
    .about-media::after{content:"";position:absolute;inset:0;background:linear-gradient(180deg,transparent 55%,rgba(7,31,63,.48) 100%)}
    .about-caption{position:absolute;z-index:2;left:22px;bottom:20px;color:#fff;font-weight:700;text-shadow:0 2px 8px rgba(0,0,0,.45)}
    .news-list{display:grid;gap:18px}
    .news-item{display:grid;grid-template-columns:190px 1fr;gap:20px;align-items:start}
    .news-item img{width:100%;height:125px;object-fit:cover;border-radius:12px;background:var(--sky)}
    .news-meta{font-size:.8rem;color:var(--muted);text-transform:uppercase;letter-spacing:.06em;font-weight:700}
    .news-item h3{margin:6px 0}
    .tag{display:inline-block;background:var(--sky);color:var(--navy2);border-radius:999px;padding:3px 10px;font-size:.72rem;font-weight:800;text-transform:uppercase;letter-spacing:.05em;margin-right:8px}
    .gallery-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:16px}
    .gallery-grid figure{margin:0;background:#fff;border:1px solid var(--line);border-radius:15px;overflow:hidden;transition:transform .22s ease,box-shadow .22s ease}
    .gallery-grid figure:hover{transform:translateY(-4px);box-shadow:var(--shadow)}
    .gallery-grid img{width:100%;height:210px;object-fit:cover;background:var(--sky)}
    .gallery-grid figcaption{padding:12px 14px;font-size:.86rem;color:var(--muted)}
    .contact-grid{display:grid;grid-template-columns:1fr 1fr;gap:28px}
    .contact-line{display:flex;gap:12px;align-items:flex-start;margin:15px 0;color:var(--muted)}
    .contact-line strong{color:var(--navy2)}
    .contact-icon{flex:none;width:38px;height:38px;border-radius:12px;display:grid;place-items:center;background:var(--sky);color:var(--blue);font-weight:900}
    .empty-state{padding:22px;border:1px dashed #b9cde8;border-radius:12px;color:var(--muted);background:#f9fbff}
    .site-footer{background:linear-gradient(180deg,#071F3F 0%,var(--navy) 100%);color:#cbd5e1;padding:56px 0 24px}
    .footer-grid{display:grid;grid-template-columns:1.4fr 1fr 1fr;gap:32px}
    .site-footer h3{color:#fff}
    .site-footer p{color:#b7c9e2}
    .site-footer a:hover{text-decoration:underline}
    .footer-bottom{border-top:1px solid rgba(255,255,255,.15);margin-top:36px;padding-top:18px;font-size:.82rem;display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap}
    .reveal{opacity:0;transform:translateY(16px);transition:opacity .6s ease,transform .6s ease}
    .reveal.is-visible{opacity:1;transform:none}
    @media(max-width:1080px){
      .nav{gap:0}.nav a,.nav-trigger{padding:9px 8px;font-size:.8rem}.brand span{font-size:.92rem}.brand small{font-size:.56rem}
    }
    @media(max-width:960px){
      .menu-toggle{display:inline-flex;align-items:center;justify-content:center}
      .nav-wrap{position:absolute;top:100%;left:0;right:0;background:#fff;border-bottom:1px solid rgba(8,43,99,.1);padding:0 4%;flex-direction:column;align-items:stretch;gap:12px;box-shadow:0 20px 36px rgba(8,43,99,.12);max-height:0;opacity:0;overflow:hidden;visibility:hidden;transform:translateY(-8px);transition:max-height .28s ease,opacity .22s ease,transform .22s ease,visibility .22s ease,padding .22s ease;pointer-events:none}
      .nav-wrap.open{max-height:min(78vh,680px);opacity:1;visibility:visible;transform:translateY(0);padding:14px 4% 20px;overflow:auto;pointer-events:auto}
      .nav{flex-direction:column;align-items:stretch;gap:4px}
      .nav a,.nav-trigger{width:100%;text-align:left;padding:12px 14px;font-size:.92rem;border-radius:12px}
      .nav a::after,.nav-trigger::after{display:none}
      .nav-item{width:100%}
      .nav-trigger{display:flex;align-items:center;justify-content:space-between}
      .dropdown-menu{position:static;min-width:0;margin-top:4px;padding:4px 0 0 10px;border:0;border-left:2px solid rgba(20,85,160,.18);border-radius:0;box-shadow:none;opacity:1;visibility:visible;transform:none;max-height:0;overflow:hidden;transition:max-height .24s ease}
      .nav-item.is-open .dropdown-menu{max-height:240px}
      .dropdown-menu a{padding:10px 12px}
      .lang-switch{align-self:flex-start}
      .login-btn{text-align:center;width:100%}
    }
    @media(max-width:720px){
      .hero{min-height:610px}.hero-content{padding:70px 0 100px}.hero-arrow{width:38px;height:38px;font-size:1.5rem}.hero-prev{left:8px}.hero-next{right:8px}
      .grid-2,.grid-3,.grid-4,.gallery-grid,.news-item,.contact-grid,.footer-grid{grid-template-columns:1fr}
      .news-item img{height:170px}.about-media img{height:300px}
      section{padding:52px 0}
      .topbar .container{justify-content:center;text-align:center}
    }
    @media(prefers-reduced-motion:reduce){
      html{scroll-behavior:auto}
      *,*::before,*::after{animation-duration:.01ms!important;animation-iteration-count:1!important;transition-duration:.01ms!important}
      .reveal{opacity:1;transform:none}
    }
  </style>
</head>
<body>
  <a class="skip" href="#main">Skip to main content</a>
  <div class="topbar"><div class="container"><span data-en="${escapeHtml(SCHOOL.motto)}" data-rw="Ubumenyi, Umurimo, Ubupfura — Knowledge, Skill, Integrity">${escapeHtml(SCHOOL.motto)}</span><span data-en="Karongi District · Western Province · Rwanda" data-rw="Akarere ka Karongi · Intara y’Uburengerazuba · Rwanda">Karongi District · Western Province · Rwanda</span></div></div>
  <header class="site-header" data-site-header>
    <div class="container header-inner">
      <a class="brand" href="/" aria-label="${escapeHtml(SCHOOL.name)} home">
        <img src="/images/school-logo.png" alt="ES Rubengera RTB official school logo" width="50" height="50" />
        <span>${escapeHtml(SCHOOL.name)}<small data-en="Secondary &amp; Technical TVET" data-rw="Imyigire n’Ubumenyi bw’Umwuga">Secondary &amp; Technical TVET</small></span>
      </a>
      <button class="menu-toggle" type="button" data-menu-toggle aria-controls="site-navigation" aria-expanded="false" aria-label="Open navigation menu" data-en-label="Open navigation menu" data-rw-label="Fungura ibikoresho by’ubuyobozi"><span aria-hidden="true"></span></button>
      <div class="nav-wrap" id="site-navigation" data-nav>
        <nav class="nav" aria-label="Main navigation">${navLinks}</nav>
        <div class="lang-switch" aria-label="Choose language" role="group">
          <button type="button" data-lang-toggle="en" aria-pressed="true" aria-label="English">EN</button>
          <button type="button" data-lang-toggle="rw" aria-pressed="false" aria-label="Ikinyarwanda">RW</button>
        </div>
        <a class="login-btn" href="${LOGIN_URL}" data-nav-link data-en="Login" data-rw="Injira">Login</a>
      </div>
    </div>
  </header>
  <main id="main">${content}</main>
  <footer class="site-footer">
    <div class="container">
      <div class="footer-grid">
        <div>
          <h3>${escapeHtml(SCHOOL.name)}</h3>
          <p>${escapeHtml(SCHOOL.description)}</p>
          <p><em>${escapeHtml(SCHOOL.motto)}</em></p>
        </div>
        <div>
          <h3 data-en="Quick links" data-rw="Ihuza ryihuse">Quick links</h3>
          <p><a href="/about" data-en="About Us" data-rw="Ibyacu" data-nav-link>About Us</a><br /><a href="/academics" data-en="Academics" data-rw="Imyigire" data-nav-link>Academics</a><br /><a href="/departments" data-en="Departments" data-rw="Amashami" data-nav-link>Departments</a><br /><a href="/news" data-en="News &amp; Events" data-rw="Amakuru n’Ibirori" data-nav-link>News &amp; Events</a><br /><a href="${APPLY_URL}" data-en="Apply" data-rw="Saba Kwinjira" data-nav-link>Apply</a><br /><a href="${TRACK_URL}" data-en="Track Application" data-rw="Kurikirana Ubusabe" data-nav-link>Track Application</a><br /><a href="/gallery" data-en="Gallery" data-rw="Amashusho" data-nav-link>Gallery</a><br /><a href="/contact" data-en="Contact Us" data-rw="Tuvugane" data-nav-link>Contact Us</a></p>
        </div>
        <div>
          <h3 data-en="Contact" data-rw="Tuvugane">Contact</h3>
          <p>${escapeHtml(SCHOOL.address)}<br /><a href="tel:${escapeHtml(SCHOOL.phoneHref)}">${escapeHtml(SCHOOL.phone)}</a><br /><a href="mailto:${escapeHtml(SCHOOL.email)}">${escapeHtml(SCHOOL.email)}</a></p>
          <p><a href="${LOGIN_URL}" data-en="Staff &amp; Student Login" data-rw="Kwinjira kw’Abakozi n’Abanyeshuri" data-nav-link>Staff &amp; Student Login</a></p>
        </div>
      </div>
      <div class="footer-bottom"><span>© ${new Date().getFullYear()} ${escapeHtml(SCHOOL.name)}. All rights reserved.</span><span data-en="Approved public information only." data-rw="Amakuru yemewe gusa niyo ashyirwa hano.">Approved public information only.</span></div>
    </div>
  </footer>
  <script>
    (function(){
      var root = document.documentElement;
      function setValue(el, lang){
        var value = el.getAttribute('data-' + lang);
        if (value !== null && value !== undefined) el.textContent = value;
      }
      function applyLanguage(lang){
        if (lang !== 'rw') lang = 'en';
        root.lang = lang;
        try { window.localStorage.setItem('schoolcare_public_lang', lang); } catch (e) {}
        Array.prototype.forEach.call(document.querySelectorAll('[data-en][data-rw]'), function(el){ setValue(el, lang); });
        Array.prototype.forEach.call(document.querySelectorAll('[data-en-label][data-rw-label]'), function(el){
          var value = el.getAttribute('data-' + lang + '-label');
          if (value) { el.setAttribute('aria-label', value); el.setAttribute('title', value); }
        });
        Array.prototype.forEach.call(document.querySelectorAll('[data-lang-toggle]'), function(button){
          button.setAttribute('aria-pressed', String(button.getAttribute('data-lang-toggle') === lang));
        });
      }
      var saved = 'en';
      try { saved = window.localStorage.getItem('schoolcare_public_lang') || 'en'; } catch (e) {}
      applyLanguage(saved);
      Array.prototype.forEach.call(document.querySelectorAll('[data-lang-toggle]'), function(button){
        button.addEventListener('click', function(){ applyLanguage(button.getAttribute('data-lang-toggle')); });
      });

      var siteHeader = document.querySelector('[data-site-header]');
      var menuButton = document.querySelector('[data-menu-toggle]');
      var nav = document.querySelector('[data-nav]');
      var dropdowns = Array.prototype.slice.call(document.querySelectorAll('[data-dropdown]'));
      var mobileMq = window.matchMedia ? window.matchMedia('(max-width: 960px)') : { matches: false };

      function closeDropdowns(except){
        dropdowns.forEach(function(dropdown){
          if (except && dropdown === except) return;
          dropdown.classList.remove('is-open');
          var trigger = dropdown.querySelector('[data-dropdown-trigger]');
          if (trigger) trigger.setAttribute('aria-expanded', 'false');
        });
      }
      function closeMenu(){
        if (!nav || !menuButton) return;
        nav.classList.remove('open');
        menuButton.setAttribute('aria-expanded', 'false');
        closeDropdowns();
      }

      if (siteHeader) {
        var onScroll = function(){ siteHeader.classList.toggle('is-scrolled', window.scrollY > 12); };
        onScroll();
        window.addEventListener('scroll', onScroll, { passive: true });
      }

      dropdowns.forEach(function(dropdown){
        var trigger = dropdown.querySelector('[data-dropdown-trigger]');
        var menu = dropdown.querySelector('.dropdown-menu');
        if (!trigger || !menu) return;
        trigger.addEventListener('click', function(event){
          if (mobileMq.matches) {
            var isOpen = dropdown.classList.contains('is-open');
            if (!isOpen) {
              event.preventDefault();
              closeDropdowns(dropdown);
              dropdown.classList.add('is-open');
              trigger.setAttribute('aria-expanded', 'true');
            } else {
              closeMenu();
            }
          }
        });
        trigger.addEventListener('keydown', function(event){
          if (event.key === 'Escape') { closeDropdowns(); trigger.focus(); }
          if ((event.key === 'ArrowDown' || event.key === 'Enter' || event.key === ' ') && !mobileMq.matches) {
            dropdown.classList.add('is-open');
            trigger.setAttribute('aria-expanded', 'true');
          }
        });
        dropdown.addEventListener('mouseenter', function(){ if (!mobileMq.matches) { closeDropdowns(dropdown); dropdown.classList.add('is-open'); trigger.setAttribute('aria-expanded', 'true'); } });
        dropdown.addEventListener('mouseleave', function(){ if (!mobileMq.matches) { dropdown.classList.remove('is-open'); trigger.setAttribute('aria-expanded', 'false'); } });
        dropdown.addEventListener('focusin', function(){ if (!mobileMq.matches) { dropdown.classList.add('is-open'); trigger.setAttribute('aria-expanded', 'true'); } });
        dropdown.addEventListener('focusout', function(event){
          if (!mobileMq.matches && !dropdown.contains(event.relatedTarget)) {
            dropdown.classList.remove('is-open');
            trigger.setAttribute('aria-expanded', 'false');
          }
        });
      });

      if (menuButton && nav) {
        menuButton.addEventListener('click', function(){
          var open = nav.classList.toggle('open');
          menuButton.setAttribute('aria-expanded', String(open));
          if (!open) closeDropdowns();
        });
        Array.prototype.forEach.call(nav.querySelectorAll('[data-nav-link]'), function(link){
          link.addEventListener('click', function(event){
            var dropdown = link.closest('[data-dropdown]');
            var trigger = dropdown ? dropdown.querySelector('[data-dropdown-trigger]') : null;
            if (mobileMq.matches && dropdown && trigger === link) return;
            closeMenu();
          });
        });
        document.addEventListener('click', function(event){
          if (nav.classList.contains('open') && !nav.contains(event.target) && !menuButton.contains(event.target)) closeMenu();
        });
        document.addEventListener('keydown', function(event){
          if (event.key === 'Escape') { closeMenu(); closeDropdowns(); }
        });
        window.addEventListener('resize', function(){ if (!mobileMq.matches) closeMenu(); });
      }

      var slideshow = document.querySelector('[data-slideshow]');
      if (slideshow) {
        var slides = Array.prototype.slice.call(slideshow.querySelectorAll('[data-slide]'));
        var dots = Array.prototype.slice.call(slideshow.querySelectorAll('[data-slide-dot]'));
        var index = 0;
        var timer = null;
        var userPaused = false;
        var reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        function show(next){
          if (!slides.length) return;
          index = (next + slides.length) % slides.length;
          slides.forEach(function(slide, i){ slide.classList.toggle('is-active', i === index); });
          dots.forEach(function(dot, i){
            dot.setAttribute('aria-selected', String(i === index));
            dot.setAttribute('tabindex', i === index ? '0' : '-1');
          });
        }
        function stop(){ if (timer) { window.clearInterval(timer); timer = null; } }
        function start(){
          stop();
          if (reduced || userPaused || document.hidden || slides.length < 2) return;
          timer = window.setInterval(function(){ show(index + 1); }, 6500);
        }
        function go(next){ userPaused = true; stop(); show(next); }
        var prev = slideshow.querySelector('[data-slide-prev]');
        var next = slideshow.querySelector('[data-slide-next]');
        if (prev) prev.addEventListener('click', function(){ go(index - 1); });
        if (next) next.addEventListener('click', function(){ go(index + 1); });
        dots.forEach(function(dot, i){
          dot.addEventListener('click', function(){ go(i); });
          dot.addEventListener('keydown', function(event){
            if (event.key === 'ArrowRight' || event.key === 'ArrowDown') { event.preventDefault(); go(i + 1); dots[(i + 1) % dots.length].focus(); }
            if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') { event.preventDefault(); go(i - 1); dots[(i - 1 + dots.length) % dots.length].focus(); }
          });
        });
        slideshow.addEventListener('mouseenter', stop);
        slideshow.addEventListener('mouseleave', start);
        slideshow.addEventListener('focusin', stop);
        slideshow.addEventListener('focusout', function(event){
          if (!slideshow.contains(event.relatedTarget)) start();
        });
        document.addEventListener('visibilitychange', function(){ document.hidden ? stop() : start(); });
        show(0);
        start();
      }

      var revealItems = Array.prototype.slice.call(document.querySelectorAll('.reveal'));
      if (revealItems.length && 'IntersectionObserver' in window && !reduced) {
        var observer = new IntersectionObserver(function(entries){
          entries.forEach(function(entry){
            if (entry.isIntersecting) { entry.target.classList.add('is-visible'); observer.unobserve(entry.target); }
          });
        }, { threshold: 0.12 });
        revealItems.forEach(function(item){ observer.observe(item); });
      } else {
        revealItems.forEach(function(item){ item.classList.add('is-visible'); });
      }
    })();
  </script>
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
  const gallery = listApprovedGallery().slice(0, 6);
  const slides = HERO_SLIDES.map((slide, index) => `
    <article class="hero-slide${index === 0 ? ' is-active' : ''}" data-slide aria-label="${escapeHtml(slide.titleEn)}">
      <img src="${slide.src}" alt="${escapeHtml(slide.alt)}" loading="${index === 0 ? 'eager' : 'lazy'}" fetchpriority="${index === 0 ? 'high' : 'low'}" decoding="async" />
      <div class="hero-overlay" aria-hidden="true"></div>
      <div class="hero-content container">
        <p class="eyebrow" data-en="${escapeHtml(slide.eyebrowEn)}" data-rw="${escapeHtml(slide.eyebrowRw)}">${escapeHtml(slide.eyebrowEn)}</p>
        <h1 data-en="${escapeHtml(slide.titleEn)}" data-rw="${escapeHtml(slide.titleRw)}">${escapeHtml(slide.titleEn)}</h1>
        <p class="hero-text" data-en="${escapeHtml(slide.textEn)}" data-rw="${escapeHtml(slide.textRw)}">${escapeHtml(slide.textEn)}</p>
        <div class="hero-actions">
          <a class="btn btn-primary" href="${index === 1 ? '/academics' : index === 2 ? '/gallery' : APPLY_URL}" data-en="${escapeHtml(slide.primaryEn)}" data-rw="${escapeHtml(slide.primaryRw)}">${escapeHtml(slide.primaryEn)}</a>
          <a class="btn btn-secondary" href="${index === 1 ? '/gallery' : index === 2 ? '/contact' : '/about'}" data-en="${escapeHtml(slide.secondaryEn)}" data-rw="${escapeHtml(slide.secondaryRw)}">${escapeHtml(slide.secondaryEn)}</a>
        </div>
      </div>
    </article>`).join('');
  const dots = HERO_SLIDES.map((slide, index) => `<button type="button" data-slide-dot role="tab" aria-selected="${index === 0}" tabindex="${index === 0 ? '0' : '-1'}" aria-label="Show slide ${index + 1}: ${escapeHtml(slide.titleEn)}"></button>`).join('');
  const galleryCards = gallery.map(image => `
    <figure>
      <img src="${escapeHtml(image.src)}" alt="${escapeHtml(image.alt)}" loading="lazy" decoding="async" />
      <figcaption><span class="tag">${escapeHtml(image.category)}</span>${escapeHtml(image.caption)}</figcaption>
    </figure>`).join('');

  const content = `
    <section class="hero" data-slideshow aria-roledescription="carousel" aria-label="School highlights">
      ${slides}
      <button class="hero-arrow hero-prev" type="button" data-slide-prev aria-label="Previous slide" data-en-label="Previous slide" data-rw-label="Slide mbere">‹</button>
      <button class="hero-arrow hero-next" type="button" data-slide-next aria-label="Next slide" data-en-label="Next slide" data-rw-label="Slide ikurikira">›</button>
      <div class="hero-dots" role="tablist" aria-label="Choose school highlight">${dots}</div>
    </section>

    <section id="welcome" class="section-alt">
      <div class="container">
        <p class="eyebrow reveal" data-en="Welcome message" data-rw="Ubutumwa bw’ikaze">Welcome message</p>
        <h2 class="reveal" data-en="A school rooted in Rubengera, focused on the future" data-rw="Ishuri rifite imizi muri Rubengera, ryitegura ejo hazaza">A school rooted in Rubengera, focused on the future</h2>
        <p class="lead reveal" data-en="${escapeHtml(SCHOOL.description)} Our students learn knowledge, practical skills and strong character in a caring Rwandan school community." data-rw="Ishuri ry’imyigire n’ubumenyi bw’umwuga mu Murenge wa Rubengera, Akarere ka Karongi, mu Rwanda. Abanyeshuri biga ubumenyi, ubuhanga n’ubupfura mu muryango wita ku bana.">${escapeHtml(SCHOOL.description)} Our students learn knowledge, practical skills and strong character in a caring Rwandan school community.</p>
        <div class="grid grid-4" style="margin-top:30px">
          <div class="card value-card reveal"><div class="value-icon">K</div><h3 data-en="Knowledge" data-rw="Ubumenyi">Knowledge</h3><p data-en="Strong academic foundations for every learner." data-rw="Imiberezo y’ubumenyi ikomeye kuri buri mwana.">Strong academic foundations for every learner.</p></div>
          <div class="card value-card reveal"><div class="value-icon">S</div><h3 data-en="Skill" data-rw="Umurimo">Skill</h3><p data-en="Practical TVET training linked to real work." data-rw="Amahugurwa y’umwuga afite isano n’akazi k’ukuri.">Practical TVET training linked to real work.</p></div>
          <div class="card value-card reveal"><div class="value-icon">I</div><h3 data-en="Integrity" data-rw="Ubupfura">Integrity</h3><p data-en="Character, respect and responsibility in school life." data-rw="Ubupfura, icyubahiro n’inshingano mu buzima bw’ishuri.">Character, respect and responsibility in school life.</p></div>
          <div class="card value-card reveal"><div class="value-icon">R</div><h3 data-en="Community" data-rw="Umuryango">Community</h3><p data-en="Serving families in Rubengera and Karongi District." data-rw="Gukorera imiryango yo muri Rubengera n’Akarere ka Karongi.">Serving families in Rubengera and Karongi District.</p></div>
        </div>
      </div>
    </section>

    <section id="about" class="section-white">
      <div class="container grid grid-2">
        <div class="about-media reveal">
          <img src="/public-assets/es2.webp" alt="Students and staff at ES Rubengera RTB" loading="lazy" decoding="async" />
          <span class="about-caption" data-en="Learning together at ES Rubengera RTB" data-rw="Kwiga hamwe muri ES Rubengera RTB">Learning together at ES Rubengera RTB</span>
        </div>
        <div class="reveal">
          <p class="eyebrow" data-en="About our school" data-rw="Kuri ishuri ryacu">About our school</p>
          <h2 data-en="Secondary education and technical training in one school" data-rw="Imyigire yisumbuye n’amahugurwa y’umwuga mu ishuri rimwe">Secondary education and technical training in one school</h2>
          <p class="lead" data-en="${escapeHtml(SCHOOL.description)} We are committed to accessible, practical and values-based education for young people in our community." data-rw="Ishuri ry’imyigire n’ubumenyi bw’umwuga mu Murenge wa Rubengera, Akarere ka Karongi, mu Rwanda. Twiyemeje uburezi buboneka, bufatika kandi bushingiye ku ndangagaciro.">${escapeHtml(SCHOOL.description)} We are committed to accessible, practical and values-based education for young people in our community.</p>
          <p data-en="For the names and contact details of current office holders, please contact the school office." data-rw="Kugira ngo ubone amazina n’ibyangombwa by’abayobozi b’ubu, hamagara ibiro by’ishuri.">For the names and contact details of current office holders, please contact the school office.</p>
          <div class="hero-actions" style="justify-content:flex-start;margin-top:24px">
            <a class="btn btn-primary" href="/about" data-en="Read more about us" data-rw="Soma byinshi kuriwe">Read more about us</a>
          </div>
        </div>
      </div>
    </section>

    <section id="academics" class="section-alt">
      <div class="container">
        <p class="eyebrow reveal" data-en="Academics" data-rw="Imyigire">Academics</p>
        <h2 class="reveal" data-en="Programmes and departments" data-rw="Gahunda n’amashami">Programmes and departments</h2>
        <p class="lead reveal" data-en="Our programmes combine a strong academic foundation with practical, work-ready skills in line with Rwanda's secondary and TVET priorities." data-rw="Gahunda zacu zihuza ubumenyi bw’ibanze n’ubuhanga bufatika bujyanye n’ibyo Rwanda ikeneye mu myigire n’umwuga.">Our programmes combine a strong academic foundation with practical, work-ready skills in line with Rwanda's secondary and TVET priorities.</p>
        <div class="grid grid-3" style="margin-top:30px">
          ${PROGRAMS.map(program => `
            <article class="card reveal">
              <span class="tag">${escapeHtml(program.category)}</span>
              <h3>${escapeHtml(program.title)}</h3>
              <p>${escapeHtml(program.description)}</p>
            </article>`).join('')}
        </div>
        <p style="margin-top:24px"><a class="btn btn-primary" href="/academics" data-en="Explore academics" data-rw="Reba imyigire">Explore academics</a></p>
      </div>
    </section>

    <section id="facilities" class="section-white">
      <div class="container">
        <p class="eyebrow reveal" data-en="Campus and facilities" data-rw="Kampus n’ibikorwa remezo">Campus and facilities</p>
        <h2 class="reveal" data-en="Spaces for learning and school life" data-rw="Ahantu ho kwiga n’ubuzima bw’ishuri">Spaces for learning and school life</h2>
        <div class="grid grid-3" style="margin-top:28px">
          <figure class="about-media reveal" style="border-radius:16px"><img src="/public-assets/smart-class.webp" alt="Smart classroom at ES Rubengera RTB" loading="lazy" decoding="async" /><span class="about-caption" data-en="Smart learning" data-rw="Kwiga by’ubuhanga">Smart learning</span></figure>
          <figure class="about-media reveal" style="border-radius:16px"><img src="/public-assets/es1.webp" alt="ES Rubengera RTB school campus" loading="lazy" decoding="async" /><span class="about-caption" data-en="Our campus" data-rw="Kampus yacu">Our campus</span></figure>
          <figure class="about-media reveal" style="border-radius:16px"><img src="/public-assets/es9.webp" alt="School activities at ES Rubengera RTB" loading="lazy" decoding="async" /><span class="about-caption" data-en="School activities" data-rw="Ibirori by’ishuri">School activities</span></figure>
        </div>
      </div>
    </section>

    <section class="section-alt">
      <div class="container">
        <p class="eyebrow reveal" data-en="Latest from the school" data-rw="Ibyavuye mu ishuri vuba">Latest from the school</p>
        <h2 class="reveal" data-en="News & announcements" data-rw="Amakuru n’amatangazo">News & announcements</h2>
        <div class="news-list reveal">${news.length ? news.map(articleCard).join('') : `<p class="empty-state" data-en="No approved announcements have been published yet." data-rw="Nta matangazo yemewe yashyizweho kugeza ubu.">No approved announcements have been published yet.</p>`}</div>
        <p style="margin-top:22px"><a class="btn btn-primary" href="/news" data-en="View all news and events" data-rw="Reba amakuru n’ibyabaye byose">View all news and events</a></p>
      </div>
    </section>

    <section id="activities" class="section-white">
      <div class="container">
        <p class="eyebrow reveal" data-en="School life" data-rw="Ubuzima bw’ishuri">School life</p>
        <h2 class="reveal" data-en="Activities and gallery" data-rw="Ibirori n’amashusho">Activities and gallery</h2>
        <p class="lead reveal" data-en="Approved images of our campus, classrooms and school community. Photographs of individual learners are not published here." data-rw="Amashusho yemewe ya kampus, ibyumba by’amahugurwa n’umuryango w’ishuri. Amashusho y’umwana ku giti cye ntabwo ashyirwa hano.">Approved images of our campus, classrooms and school community. Photographs of individual learners are not published here.</p>
        <div class="gallery-grid reveal" style="margin-top:28px">${galleryCards || `<p class="empty-state" data-en="No approved photographs are available yet." data-rw="Nta mafoto yemewe aboneka kugeza ubu.">No approved photographs are available yet.</p>`}</div>
        <p style="margin-top:22px"><a class="btn btn-secondary" href="/gallery" style="background:var(--navy);color:#fff;border-color:var(--navy)" data-en="View the full gallery" data-rw="Reba amashusho yose">View the full gallery</a></p>
      </div>
    </section>

    <section id="why-us" class="section-alt">
      <div class="container">
        <p class="eyebrow reveal" data-en="Why choose us" data-rw="Kuki waturwaho">Why choose us</p>
        <h2 class="reveal" data-en="A focused school community in Rubengera" data-rw="Umuryango w’ishuri wita ku burezi muri Rubengera">A focused school community in Rubengera</h2>
        <div class="grid grid-3" style="margin-top:28px">
          <div class="card reveal"><h3 data-en="Secondary and TVET pathways" data-rw="Imyigire yisumbuye n’umwuga">Secondary and TVET pathways</h3><p data-en="Academic study and technical training are offered within one school community." data-rw="Kwiga no guhugurwa mu mwuga bibera mu muryango umwe w’ishuri.">Academic study and technical training are offered within one school community.</p></div>
          <div class="card reveal"><h3 data-en="Values-based learning" data-rw="Kwiga gushingiye ku ndangagaciro">Values-based learning</h3><p data-en="Our motto places knowledge, practical work and integrity at the centre of school life." data-rw="Inyigisho zacu zishyira ubumenyi, umurimo n’ubupfura ku mutima w’ubuzima bw’ishuri.">Our motto places knowledge, practical work and integrity at the centre of school life.</p></div>
          <div class="card reveal"><h3 data-en="Clear, approved information" data-rw="Amakuru yemewe kandi asobanutse">Clear, approved information</h3><p data-en="This website publishes only information approved for public release by the school." data-rw="Urubuga rushyira gusa amakuru yemewe n’ishuri ko ashyirwa mu ruhame.">This website publishes only information approved for public release by the school.</p></div>
        </div>
      </div>
    </section>

    <section id="contact" class="section-white">
      <div class="container">
        <div class="card contact-grid reveal" style="padding:34px">
          <div>
            <p class="eyebrow" data-en="Contact" data-rw="Tuvugane">Contact</p>
            <h2 data-en="Visit or contact the school" data-rw="Sura cyangwa hamagara ishuri">Visit or contact the school</h2>
            <div class="contact-line"><span class="contact-icon">⌖</span><span><strong data-en="Address" data-rw="Aderesi">Address</strong><br />${escapeHtml(SCHOOL.address)}</span></div>
            <div class="contact-line"><span class="contact-icon">☎</span><span><strong data-en="Telephone" data-rw="Telefoni">Telephone</strong><br /><a href="tel:${escapeHtml(SCHOOL.phoneHref)}">${escapeHtml(SCHOOL.phone)}</a></span></div>
            <div class="contact-line"><span class="contact-icon">✉</span><span><strong data-en="Email" data-rw="Imeyili">Email</strong><br /><a href="mailto:${escapeHtml(SCHOOL.email)}">${escapeHtml(SCHOOL.email)}</a></span></div>
          </div>
          <div>
            <h3 data-en="Find us in Rubengera" data-rw="Udubone muri Rubengera">Find us in Rubengera</h3>
            <p data-en="The school is located in Rubengera, Karongi District, Western Province, Rwanda." data-rw="Ishuri riherereye muri Rubengera, Akarere ka Karongi, Intara y’Uburengerazuba, mu Rwanda.">The school is located in Rubengera, Karongi District, Western Province, Rwanda.</p>
            <div class="hero-actions" style="justify-content:flex-start">
              <a class="btn btn-primary" href="${escapeHtml(SCHOOL.mapsUrl)}" target="_blank" rel="noopener noreferrer" data-en="Open map" data-rw="Fungura ikarita">Open map</a>
              <a class="btn btn-secondary" href="${LOGIN_URL}" style="background:var(--sky);color:var(--navy);border-color:var(--line)" data-en="Portal login" data-rw="Kwinjira muri portal">Portal login</a>
            </div>
          </div>
        </div>
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
        <div><img src="/public-assets/es1.webp" alt="ES Rubengera RTB school campus" loading="lazy" decoding="async" /></div>
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

function academicsPage(res: Response, path = '/academics'): void {
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
    path,
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
          <img src="/public-assets/es1.webp" alt="ES Rubengera RTB school campus" loading="lazy" decoding="async" style="border-radius:12px;margin-top:16px" />
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
  const paths = [...NAV.map(item => item.href), APPLY_URL, '/events'];
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
  app.get('/departments', (_req: Request, res: Response) => academicsPage(res, '/departments'));
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
