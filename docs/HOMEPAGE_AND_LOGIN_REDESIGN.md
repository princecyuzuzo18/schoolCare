# Homepage and Login Redesign

## Scope

This change improves the existing SchoolCare application in place. It does **not** replace authentication, the database layer, role-based redirects, dashboards, or public-content administration.

The public school website is server-rendered by `server/publicSite.ts` at `/`, `/about`, `/academics`, `/departments`, `/news`, `/events`, `/apply`, `/gallery`, and `/contact`. The private application remains a React SPA at `/portal#/login` and the existing hash routes.

A safety copy of the pre-existing uncommitted working tree was created before implementation:

- `backups/pre-redesign-20261124-164749/working-changes.patch`
- `backups/pre-redesign-20261124-164749/.env.example`

Unrelated pre-existing user changes were preserved and were not committed.

## Implemented: public homepage

### Navigation and identity

- responsive sticky header with official logo, **ES RUBENGERA RTB**, and “Secondary & Technical TVET”
- links: Home, About Us, Academics, Departments, News & Events, Gallery, Contact Us, Apply, Login
- English / Kinyarwanda selector for public-site chrome and homepage copy; selection persists in `localStorage`
- mobile hamburger menu with `aria-expanded`, `aria-controls`, Escape-safe link handling, and keyboard-accessible controls
- skip link, semantic landmarks, visible focus styling, and no horizontal overflow at mobile widths

### Hero slideshow

- full-width slideshow using approved WebP school images from `/public-assets/`
- dark blue gradient overlay, centered title/supporting message, primary and secondary calls to action
- previous/next arrows, numbered indicators, and manual slide selection
- 6.5-second autoplay
- pauses on hover, keyboard focus, manual interaction, and when the page/tab is hidden
- reduced-motion support: no automatic slide changes and near-zero CSS transitions when requested
- first slide is eagerly loaded with high priority; remaining slides are lazy-loaded; all slides have descriptive alt text

### Homepage sections

Added or redesigned:

- welcome message tied to the school motto
- about section using an approved school photo
- academic programmes / departments cards using existing real programme data
- campus and facilities section using approved images
- latest approved news and announcements with a professional empty state
- school-life activities and gallery preview from approved gallery records
- “Why choose us” section based only on known school facts and values
- contact section with the existing approved phone, email, address, and map link
- footer with quick links, contact details, and portal login

No invented achievements, statistics, leadership names, or contact details were added. Dynamic articles and gallery items continue to come only from approved public content.

### Other public pages

- `/departments` added and included in the sitemap; it reuses the existing academics content safely
- `/about` and `/contact` now use approved school photos instead of generic illustrations
- sitemap now includes Apply and Departments
- existing SEO metadata, canonical URLs, Open Graph tags, School structured data, and robots rules remain intact

## Implemented: login experience

`src/pages/AuthPage.tsx` now provides:

- full-screen deep-blue gradient background
- centered white login card with school identity
- smooth Student Login / Staff Login tabs with click and arrow-key support
- password visibility toggle with accessible labels
- email validation, required-field validation, loading state, and translated error/notice states
- keyboard focus rings and ARIA tab/tabpanel relationships
- responsive layout for mobile, tablet, laptop, and desktop
- optional Google sign-in button retained only when the existing backend reports it as configured
- existing recovery and parent/student signup routes retained
- clear administrator-contact guidance where recovery delivery is not configured

Both tabs call the **same existing** `POST /api/auth/login` endpoint via `useAuth().login(email, password)`. The tabs are presentation/context only; they do not grant permissions or select a role. The backend still validates credentials and returns the authorized dashboard.

Passwords are kept only in transient React input state during submission. They are never logged, persisted to local storage, or sent to any new endpoint.

## Portal/public separation

- `/portal#/login` continues to render the redesigned `AuthPage`.
- Anonymous `/portal` without a login hash now redirects to the public website at `/`, removing the old generic green marketing page from the public surface.
- Apply, track, parent signup, student signup, and staff activation hash routes are unchanged.
- Authenticated routing, role dashboards, unauthorized-tab fallback, session restoration, and logout behavior are unchanged.

## Changed files

- `server/publicSite.ts`
- `src/App.tsx`
- `src/pages/AuthPage.tsx`
- `src/i18n/en.ts`
- `src/i18n/rw.ts`
- `src/index.css`
- `docs/HOMEPAGE_AND_LOGIN_REDESIGN.md` (new)

`src/pages/LandingPage.tsx`, `src/rbac.ts`, `src/roleDashboards.ts`, `server/rbac.ts`, `server/authSession.ts`, and `server.ts` were inspected but intentionally not changed by this redesign.

## Preserved behavior

- existing Express/MySQL database architecture
- existing session cookies, credential epochs, logout, and rate limiting
- role dashboard mapping: Student → `student-portal`, Parent → `parent-portal`, Teacher → `attendance`, Nurse → `health`, Accountant → `finance`, etc.
- backend-authoritative permission checks and school isolation
- public APIs: `/api/public/site`, `/api/public/news`, `/api/public/events`, `/api/public/gallery`
- protected admin content APIs behind `authenticateUser` + `school:write`
- published/approved content filtering and draft/scheduled content privacy

## Verification

Commands run after implementation:

- `npm run lint` — passed
- `npm run build` — passed (existing Vite chunk-size warning only)
- `npm run test:public-site` — 52/52 passed
- `npm run test:db` — 18/18 passed
- `npm test` — passed all configured suites, including:
  - navigation: 180/180
  - permissions: 58/58
  - staff management: 23/23
  - API security: 64/64
  - school isolation: 24/24
  - record lifecycle: 22/22
  - role redirection: 95/95
  - combinations: 69/69
  - hardening: 13/13
  - AI assistant: 49/49
  - Google OAuth: 16/16
  - and the remaining configured suites

Additional check: the generated inline homepage JavaScript was extracted and passed `node --check`.

No tests failed.

## Remaining configuration and limitations

- Password recovery email delivery is **not configured** on this server. `/api/auth/password-reset/request` returns HTTP 503 with administrator-contact guidance. The login page reflects this honestly rather than implying email delivery is active.
- Google sign-in is optional and only shown when `googleOAuthConfig().enabled` is true. Setup instructions are in `docs/GOOGLE_OAUTH_SETUP.md`.
- No separate Student or Staff login API was found or added; do not create one without deliberate backend design. Role destinations must remain backend-derived.
- The public language selector translates site chrome/homepage copy. Existing approved article and gallery text remains in its source language because no translations are stored in public content.
- No reference video was present in the repository, so the slideshow/animation design was implemented from the written requirements rather than exact video matching.
- `public/images/school-logo.png` is still the existing ~2.1 MB source asset. It was not replaced to avoid altering an official user-provided asset; consider generating and using an optimized WebP variant if page weight becomes a priority.

## Run instructions

```bash
npm install
npm run dev
```

Then open:

- public school website: `http://localhost:3010/`
- login: `http://localhost:3010/portal#/login`
- admissions: `http://localhost:3010/apply`

Use `npm run build` for a production SPA build. Database setup/migration scripts are documented in the existing project scripts (`npm run db:setup`, `npm run db:migrate`, `npm run db:status`).

## Navigation redesign update (follow-up)

### Public website navigation

- Updated `server/publicSite.ts` public header to the requested professional blue/white system.
- Design tokens aligned to: Navy `#082B63`, Blue `#1455A0`, Light blue `#F4F7FC`, White `#FFFFFF`.
- Sticky header remains in place with smooth scroll transition: background/shadow/border/height change when scrolled.
- Navigation links use animated underline hover/active states.
- Added smooth dropdown navigation for Academics (Academic Programmes, Departments) with keyboard support, Escape-to-close, hover/focus behavior on desktop, and tap-to-expand on mobile.
- Login button is a dedicated CTA with hover lift/shadow transition and links to existing `/portal#/login`.
- Mobile hamburger uses animated icon transition and smooth open/close panel animation; menu closes on link navigation, outside click, Escape, and resize to desktop.
- Language selector (EN/RW) preserved and keyboard accessible.
- Public nav keeps required items visible: Home, About Us, Academics, News & Events, Gallery, Contact, EN/RW selector, Login. Apply remains available for existing admissions flow and public-site tests.

### Authenticated navigation

- Public website navigation is not rendered inside authenticated portal views; authenticated users see the existing `Header` + role-filtered `Sidebar`.
- `src/App.tsx` already routes authenticated users to `AuthenticatedApp`; public links (Home/About/Academics/News/Gallery/Contact) are not exposed there.
- Sidebar/navigation visibility remains RBAC-driven via `getVisibleNavSections(role, effectivePermissions)` and route guards in `handleNavigate`.
- Backend permission enforcement remains unchanged; hiding links is not relied on for security.

### Logout

- Existing logout flow in `AuthContext` clears session and redirects to `/` (public website), restoring public navigation.

### Tests run (follow-up)

- `npm run lint` — passed
- `npm run test:public-site` — 52/52 passed
- `npm run build` — passed (existing Vite chunk-size warning only)
- `npm run test:navigation` — 180/180 passed

### Parent/student login and account creation update

- The login card now offers **Parent**, **Student**, and **Staff** tabs. Each tab has its own translated heading, identifier label/placeholder, and submit/loading copy.
- Parent and Student tabs are presentation contexts only; all three tabs still call the existing `POST /api/auth/login` endpoint and the server determines the authorized dashboard.
- The account-creation area is now labelled “New to SchoolCare?” with separate **Create parent account** and **Create student account** buttons linking to the existing signup routes.
- Tab labels use short English/Kinyarwanda text on small screens, with arrow-key cycling across all three tabs and ARIA tab/tabpanel relationships preserved.
- Fixed anonymous route syncing so `#/parent-signup` and `#/student-signup` are no longer rewritten back to `#/login` before the signup page opens.
- Fixed post-approval sign-in when email was left blank: the server-generated sign-in address is now used instead of the empty form field.
- `npm run lint`, `npm run build`, and `npm run test:navigation` were re-run and passed after this update.

### Remaining work / notes

- A full manual browser pass is still recommended for visual polish on real devices (iOS Safari/Android Chrome) and for keyboard tab-order feel across the new dropdown.
- The reference “exact match” request cannot be fully verified without the provided reference video/path; implementation follows the stated professional blue/white requirements.
