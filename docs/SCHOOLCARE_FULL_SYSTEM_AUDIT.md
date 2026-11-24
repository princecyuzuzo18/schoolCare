# SchoolCare Full System Audit

**Project:** SchoolCare – ES RUBENGERA RTB
**Audit date:** 2026-11-24
**Repository baseline:** `0e03339` plus pre-existing uncommitted work (headteacher personal-name fields, signup-test script fixes, AI error-classification fix).
**Auditor:** OpenCode AI agent
**Phase:** Phase 1 – inspection only. No application code, database records, files, or deployed services were changed by this audit.

---

## 1. Classification legend

| Classification | Meaning |
|---|---|
| **WORKING** | A complete code path was found: UI/action → backend endpoint → stored data/state, with authorization where required. Not necessarily exercised end-to-end in this audit. |
| **PARTIALLY WORKING** | Core path exists, but an important part is missing, unguarded, disabled, or dependent on incomplete configuration. |
| **DEMO ONLY** | Exists mainly as sample/demo data or a reset/demo utility; not suitable as a production feature. |
| **NOT IMPLEMENTED** | No working implementation found; endpoint may be a deliberate stub. |
| **BROKEN** | Code exists but has a definitive defect. No definitively broken core handler was found in this static audit. |
| **REQUIRES CONFIGURATION** | Implementation exists but needs external services or environment variables to work in practice. |

> **Evidence rule:** “WORKING” below means static code evidence of a complete path. It does **not** mean a live browser click-through or a live login for every role was performed. Items actually executed during this audit are listed in section 12.

---

## 2. Inspection method and constraints

- Inspected frontend, backend, database schema, data files, migration ledger, API routes, navigation, role rules, tests, docs and deployment configuration.
- Used read-only inspection tools and safe read-only database statements only.
- Did **not** run `npm test` because the aggregate suite contains mutating tests (see section 12).
- Did **not** delete, overwrite, migrate, back up, or alter any database record.
- Did not print `.env` secrets.
- Preserved all pre-existing uncommitted changes; they were treated as user work.

### Commands actually executed

| Command | Result |
|---|---|
| `npm run dev` | Started background server (`tsx server.ts`); 29 env vars loaded; no startup error observed at first output. |
| `npm run lint` | PASS (`tsc --noEmit`, no errors). |
| `npm run db:status` | Database `schoolcare_db` exists; **54 tables**; migrations **001–011** recorded, including `011_headteacher_personal_name`; staff governance tables present. |
| `npm run db:check` | MariaDB/InnoDB connection OK at `127.0.0.1:3306`; 54 tables. |
| Read-only SQL counts | Live table counts captured (section 5). |
| Read-only JSON inspection | `data/schoolcare_db.json` and public-content files inspected, not modified. |

---

## 3. Architecture summary

### 3.1 Frontend

- React 19 + TypeScript, Vite 8, Tailwind 4, Lucide icons, Motion, jsPDF, canvas-confetti.
- SPA entry: `index.html:1-19`, `src/main.tsx`.
- App shell/routing: `src/App.tsx`, `src/routes.tsx`, `src/components/Sidebar.tsx`, `src/components/Header.tsx`.
- Navigation registry: `src/navigation.ts:66-357`; Headteacher grouping: `src/navigation.ts:387-449`.
- Role rules: `src/rbac.ts`, `src/roleCatalog.ts`, `src/roleDashboards.ts`.
- Auth state: `src/contexts/AuthContext.tsx`; API client: `src/services/api.ts:1-1442`.
- i18n: `src/i18n/{en,rw,admissions,translations,index,LanguageContext}`. Kinyarwanda support exists in translation tables.
- Dashboard: `src/pages/DashboardPage.tsx`; dedicated server-authoritative Headteacher overview component at `src/pages/DashboardPage.tsx:141-310`.

### 3.2 Backend

- Express 4 + `tsx`; monolithic `server.ts` (4,432 lines) plus focused modules under `server/`.
- 210 registered routes total: 111 in `server.ts`, 99 in modules.
- Authentication: `POST /api/auth/login` (`server.ts:747-818`), scrypt password hashes (`server/authCredentials.ts:79-111`), in-memory sessions (`server/sessions.ts:5-6,51-60`).
- RBAC: `server/rbac.ts`, `server/permissions.ts`, `server/headteacherAppointment.ts`.
- Database: JSON store in `server/database.ts` is authoritative for most modules; MariaDB is required for login/credentials and is mirrored for selected domains (`server/mysqlConnector.ts`, `server/admissionsMysql.ts`, AI storage).
- Security middleware: security headers, login/signup/OCR/tracking rate limiters, upload allowlists, school scoping, production secret guard (`server.ts:137-329`, `:478-576`).

### 3.3 Database

- MariaDB database `schoolcare_db`, 54 tables.
- Migration ledger shows all known migrations through `011_headteacher_personal_name` applied.
- Notable schema gap: `schools` table has no `current_academic_year` or `current_term` columns; those values currently come from the JSON school record (`data/schoolcare_db.json`).
- Live `academic_years` and `terms` tables were empty at audit time, while the JSON file has one academic year and three terms. This is a JSON↔MariaDB parity gap.

---

## 4. Live data and data-source inventory

### 4.1 Live MariaDB counts (read-only, audited 2026-11-24)

| Table | Rows | Interpretation |
|---|---:|---|
| `schools` | 1 | Single school: ES RUBENGERA RTB |
| `user_profiles` | 9 | Role accounts present |
| `user_auth_credentials` | 3 | Only three credential rows; other accounts may need provisioning/activation |
| `students` | 8 | Two recently created students plus six seed-looking students |
| `guardians` | 3 | Seed-looking parent/guardian records |
| `staff_accounts` | 0 | No staff governance accounts mirrored |
| `staff_invitations` | 0 | No pending staff invitations |
| `attendance_records` | 5 | Small real-looking attendance set |
| `health_incidents` | 2 | Small real-looking health set |
| `messages` | 2 | Notification/message records |
| `invoices` | 3 | Fee invoices |
| `payments` | 2 | Payments |
| `audit_logs` | 2 | Audit entries |
| `classes` | 11 | Classes |
| `combinations` | 6 | Combinations |
| `subjects` | 6 | Subjects |
| `terms` | 0 | No MariaDB terms |
| `academic_years` | 0 | No MariaDB academic years |
| `mark_submissions` | 0 | No marks submissions |
| `student_marks` | 0 | No marks |
| `report_cards` | 0 | No report cards |
| `report_card_subjects` | 0 | No report-card subject rows |
| `report_distributions` | 0 | No distributions |
| `admission_applications` | 0 | No public admission applications |
| `permission_grants` | 0 | No delegated grants |

### 4.2 JSON fallback snapshot (`data/schoolcare_db.json`)

| Collection | Records | Notes |
|---|---:|---|
| `students` | 6 | Seed-looking names (`Kevin Ishimwe`, `Divine Keza`, etc.) |
| `staff` | 6 | Includes `MUNYENTWARI Olivier` after pre-existing edit |
| `guardians` | 3 | Seed-looking names |
| `attendance` | 6 | Sample attendance |
| `notifications` | 9 | Sample notification records |
| `invoices` / `payments` | 3 / 2 | Sample finance records |
| `reportCards` | 1 | Sample report card |
| `events` | 2 | Sample events |
| `academicYears` / `terms` | 1 / 3 | `2025 - 2026`, Terms 1–3 |
| `modules` | `{}` | Generic modules (documents, meetings, collaboration, etc.) are empty |
| `school.totalStudents` | **486** | Hardcoded-looking statistic; does not match 6 JSON or 8 MariaDB student rows |
| `school.totalStaff` | **34** | Hardcoded-looking statistic; does not match 6 JSON or 0 MariaDB staff-account rows |

### 4.3 Data protection conclusion

- **Do not delete anything automatically.** The live database contains a mix of apparent real records (e.g. `prince kagabo`, `murinzi fred`) and seed-looking records.
- The hardcoded `totalStudents: 486` and `totalStaff: 34` are unsafe to present as verified statistics.
- No table was dropped, no record was deleted, and no backup was created or overwritten by this audit.
- Before any cleanup: create and verify a backup, then ask the school to confirm which records are genuine.

---

## 5. Complete inspection areas (30 requested areas)

| # | Area | Classification | Findings / evidence |
|---:|---|---|---|
| 1 | Frontend architecture | WORKING | React/Vite/Tailwind SPA; `src/App.tsx`, `src/routes.tsx`, `src/navigation.ts`. `npm run lint` passes. |
| 2 | Backend architecture | WORKING | Express + modules; 210 routes; `server.ts:545-4385`, `server/*`. |
| 3 | Authentication & login | WORKING | scrypt hashes, throttling, MariaDB health requirement, server-derived dashboard URL: `server.ts:747-818`, `server/authCredentials.ts:79-111`, `server/authSession.ts:9-14`. |
| 4 | Registration system | PARTIALLY WORKING / REQUIRES CONFIGURATION | Parent/student signup exists (`server.ts:860-972`), but needs SMTP/SMS codes; isolated test DB required for signup suite. README still says “no public registration” (`README.md:113`) — stale doc. |
| 5 | RBAC | WORKING | `server/permissions.ts:20-62,152-214,357-547`; frontend `src/rbac.ts`. Backend checks exist, but see security gaps in section 8. |
| 6 | Headteacher permissions | WORKING | Headteacher is school-level leader; cannot self-promote to platform admin; `server/headteacherAppointment.ts:7-17`, `server/permissions.ts:342-349`. |
| 7 | Staff management | WORKING | Staff accounts, roles, status, archive/restore, activity: `server.ts:1130-1841`, `server/staffAdministration.ts`. |
| 8 | Student management | WORKING | CRUD + archive/restore + import: `server.ts:2089-2660`, `server/studentImport.ts:45-56`. |
| 9 | Parent management | PARTIALLY WORKING | CRUD exists (`server.ts:2695-2819`) but most guardian routes are global-auth-only; no dedicated `guardians.read/write` permission gate. |
| 10 | Academic management | WORKING | Years, terms, classes, subjects, assignments, marks workflow: `server/academics.ts:142-871`, `server/academicCore.ts`. |
| 11 | Classes & combinations | WORKING | Combination CRUD/lifecycle and teacher sync: `server/combinations.ts:364-656`. |
| 12 | Subjects & teacher assignments | WORKING | `server/academics.ts:265-407`, `server/combinations.ts:560-620`. |
| 13 | Attendance | WORKING | `server.ts:2857-2928`; batch submission and read are permission-gated. |
| 14 | Examination & results | WORKING | Server-authoritative calculation, draft/submit/return/approve/reopen: `server/academics.ts:591-856`, `server/academicCore.ts:276-460`. |
| 15 | Report cards | WORKING | Generation, publish/unpublish, distribution: `server/reportPrinting.ts:127-393`; qualitative/sign-off workflow documented missing. |
| 16 | Finance | PARTIALLY WORKING | Payment creation gated (`server.ts:3257-3327`), finance reads global-auth-only (`:3230-3246`), parent payment disabled (`:1065-1073`). |
| 17 | Communication | PARTIALLY WORKING / REQUIRES CONFIGURATION | Notification queue and send endpoint exist; delivery needs SMTP/SMS; send route global-auth-only (`server.ts:3132`). |
| 18 | Notifications | PARTIALLY WORKING | Read/send/acknowledge routes exist (`server.ts:3120-3229`); sample notifications present in JSON. |
| 19 | Smart Alert Center | NOT IMPLEMENTED | No dedicated alert model/endpoints found; dashboard approvals/health incidents are the closest existing signals. |
| 20 | School Activity History | WORKING | Audit logs + staff activity: `server.ts:1446,3639`; `db.logAudit` used across modules. |
| 21 | AI Assistant | WORKING / REQUIRES CONFIGURATION | Full API and role-scoped data tools (`server/ai/routes.ts:119-557`); needs `GEMINI_API_KEY`. |
| 22 | Online meetings & collaboration | DEMO ONLY / NOT IMPLEMENTED | Only generic `ModuleCrud` pages (`src/routes.tsx:250-281`) backed by `/api/modules/meetings|collaboration`; no dedicated meeting, agenda, minutes, RSVP, task or join-link backend. |
| 23 | Database structure | PARTIALLY WORKING | 54 tables; good coverage; JSON still authoritative for many domains; academic year/term not in MariaDB school row. |
| 24 | Database migrations | WORKING | Ledger through 011 applied (`npm run db:status`). Note duplicate `005_*` filenames documented in prior audit. |
| 25 | API endpoints | WORKING | 210 routes; frontend/backend parity is good; several backend endpoints unused by client. |
| 26 | Error handling | WORKING | `wrap()` handlers, try/catch, 503 DB guards, safe 404s. Some global-auth gaps remain. |
| 27 | Security | PARTIALLY WORKING | Strong crypto/SQL safety; high-severity authorization gaps on sensitive routes; in-memory sessions. |
| 28 | Responsive design | PARTIALLY WORKING | Tailwind responsive grids used; no browser/mobile test was executed in this audit. |
| 29 | Performance | PARTIALLY WORKING | Large main JS chunk (~1.4 MB) documented; no load test executed; dashboard fires 10 parallel API calls. |
| 30 | Deployment configuration | REQUIRES CONFIGURATION | Production guard, static `dist/` serving, systemd/Nginx docs exist; deployment blocked pending owner provisioning and secrets. |

---

## 6. Feature classification matrix

| Feature | Status | Evidence / note |
|---|---|---|
| Login + role redirect | WORKING | `server.ts:747-818`; `server/authSession.ts:9-14`; role redirect script exists. |
| Password reset | NOT IMPLEMENTED | `server.ts:829-837` always returns 503. |
| Parent signup | WORKING / REQUIRES CONFIGURATION | `server.ts:860-861`; verification codes need SMS/email config. |
| Student signup | WORKING / REQUIRES CONFIGURATION | `server.ts:883-884`. |
| Signup approval | WORKING | `server.ts:942-972`. |
| Staff create/invite/activate/resend/reset | WORKING | `server.ts:1794-2023`; `server/staffManagement.ts:108-293`. |
| Staff suspend/reactivate/archive/restore | WORKING | `server.ts:1587-1765`. |
| Staff profile edit | WORKING | `server.ts:1692-1728`. |
| Staff activity history | WORKING | `server.ts:1446`. |
| Students CRUD/archive/import | WORKING | `server.ts:2089-2660`; `server/studentImport.ts`. |
| Guardians CRUD | PARTIALLY WORKING | `server.ts:2695-2819`; read/create routes only globally authenticated. |
| Attendance | WORKING | `server.ts:2857-2928`. |
| Health incidents | PARTIALLY WORKING | `server.ts:2959-3119`; mutations not permission-gated. |
| Academics config/marks/approval | WORKING | `server/academics.ts:142-871`. |
| Report-card generation/publication/distribution | WORKING | `server/reportPrinting.ts:127-393`. |
| Combinations | WORKING | `server/combinations.ts:364-656`. |
| Finance reads | PARTIALLY WORKING | `server.ts:3230-3246`, no permission gate. |
| Record payment | WORKING | `server.ts:3257-3327`. |
| Parent online payment | NOT IMPLEMENTED | `server.ts:1065-1073` returns 503. |
| Notifications | REQUIRES CONFIGURATION | `server/notifications.ts:16-22`. |
| Smart Alert Center | NOT IMPLEMENTED | No dedicated implementation found. |
| Audit logs | WORKING | `server.ts:3639`; `db.logAudit`. |
| AI Assistant | WORKING / REQUIRES CONFIGURATION | `server/ai/routes.ts:119-557`. |
| Public website | WORKING | `server/publicSite.ts:661-771`. |
| Public admissions | WORKING | `server.ts:3671-4300`. |
| Result-slip OCR | REQUIRES CONFIGURATION | `server/resultSlipOcr.ts:32-68`. |
| Meetings | DEMO ONLY | Generic module CRUD only. |
| Collaboration | DEMO ONLY | Generic module CRUD only. |
| School Documents nav | DEMO ONLY | Generic module CRUD; user requested removal from Headteacher menu. |
| Reports & Analytics | WORKING | `server.ts:3385-3527`; uses real records but renders `0` where no data exists. |
| PDF/print report cards | WORKING | `server/reportPrinting.ts`, `src/services/reportPdf.ts`, `src/components/ReportCardSheet.tsx`. |
| Excel export | PARTIALLY WORKING | Admissions CSV exists (`server.ts:4068`); general Excel export not found. |
| School settings | WORKING | `server.ts:2047-2087`; `src/pages/SettingsPage.tsx`. |
| Headteacher profile | PARTIALLY WORKING | Profile data displayed from session; no dedicated secure profile-edit/password-change flow found beyond credential provisioning scripts. |
| Demo reset | DEMO ONLY | `server.ts:3644`; disabled in production per code, but endpoint exists. |

---

## 7. Phase 2 demo/fake data review list

### 7.1 Hardcoded/artificial values

| Item | Location | Risk | Recommendation |
|---|---|---|---|
| `school.totalStudents = 486` | `data/schoolcare_db.json` | Presented as real statistic; contradicted by 6 JSON / 8 DB students. | Replace with live count; do not present as verified until confirmed. |
| `school.totalStaff = 34` | `data/schoolcare_db.json` | Same as above. | Replace with live count. |
| Seed students | `data/schoolcare_db.json`, `server/seedData.ts:346-457`, live `students` | Could be genuine school records after edits. | Leave untouched; ask school to confirm. |
| Seed staff/users | `server/seedData.ts:50-156,900-1000`, live `user_profiles` | Headteacher name was intentionally updated; other seed names may be real. | Leave untouched; ask school to confirm. |
| Sample notifications/events/fees | `server/seedData.ts:732-899,1193-1219` | May appear as real activity. | Label as sample if still used; do not delete without confirmation. |
| Generic module pages | `src/routes.tsx:166-299`, `data/schoolcare_db.json.modules = {}` | Empty CRUD pages look like working modules. | Remove from Headteacher menu where unnecessary; label remaining previews. |
| Analytics zero-fallback | `server.ts:3430-3525` | Empty data rendered as `0`, not “No data available”. | Change to null/unavailable semantics. |

### 7.2 Safe cleanup prerequisites

1. Create and verify a full database backup (`npm run db:backup`) before any cleanup.
2. Export/verify `data/schoolcare_db.json` copy.
3. Ask the school to classify each seeded person/record as genuine or demo.
4. Only then consider hiding/removing demo-only entries; never drop tables or delete unconfirmed records.

No cleanup was performed in this audit.

---

## 8. Security findings

### 8.1 Strengths

- scrypt password hashing with per-user salt and timing-safe comparison (`server/authCredentials.ts:1-6,79-111`).
- No SQL injection found; MySQL access is parameterized.
- School scoping ignores browser-supplied `schoolId` except for `SUPER_ADMIN` (`server.ts:596-605`).
- Upload hardening: memory storage, MIME allowlists, size limits, filename sanitisation (`server.ts:216-294`).
- Security headers and rate limiters present.
- Headteacher cannot promote self to `SUPER_ADMIN`; platform appointment route is super-admin-only.
- Gemini key sent via header, not URL, in AI/OCR paths.

### 8.2 High severity — authorization gaps

The following routes rely on global authentication only and must be gated before production use:

- Guardians read/create/student lookup: `server.ts:2695,2707,2748`.
- Attendance explanation: `server.ts:2929`.
- Health incidents read/create/actions/acknowledge: `server.ts:2959-3119`.
- Notifications read/send/acknowledge: `server.ts:3120-3229`.
- Finance reads: `server.ts:3230-3246`.
- Events read/create: `server.ts:3603-3608`.
- Generic analytics/timetable/homework/staff reads: `server.ts:3331-3385`.

A PARENT or STUDENT account could call these endpoints directly even if the menu item is hidden. Frontend hiding is not backend authorization.

### 8.3 Other issues

| Severity | Issue | Evidence |
|---|---|---|
| High | Sessions are in-memory; restart loses sessions and multi-instance breaks. | `server/sessions.ts:5-6,51-60` |
| Medium | Invite tokens and one-time reset passwords returned in API response bodies. | `server.ts:1794-1998` |
| Medium | Password reset endpoint is a 503 stub. | `server.ts:829-837` |
| Medium | Parent online payment is a 503 stub. | `server.ts:1065-1073` |
| Medium | Demo reset endpoint exists. | `server.ts:3644` |
| Medium | No CSRF token; relies on `SameSite=Lax`. | `server/sessions.ts:35-38` |
| Low | No `strict` TypeScript mode, CI, browser/a11y/load tests. | `tsconfig.json:1-28`; no CI config found. |

---

## 9. Headteacher dashboard assessment

### 9.1 What already works

- Server-authoritative endpoint `GET /api/dashboard/headteacher` (`server/headteacherDashboard.ts:42-297`).
- Uses authenticated actor’s school; ignores browser school ID.
- Real counts for students, staff, parents, active classes, attendance, approvals, activities, notifications, events.
- Permission-aware finance/health/discipline sections.
- Frontend renders a compact overview (`src/pages/DashboardPage.tsx:141-310`).

### 9.2 Gaps against the requested professional dashboard

| Requested | Current state |
|---|---|
| Exact welcome text “Welcome, MUNYENTWARI Olivier” / “Headteacher – ES RUBENGERA RTB” | Not present; currently “Muraho, {fullName}” with school name. |
| Current academic year | Not shown; school JSON has `2025 - 2026`, MariaDB school table has no such column. |
| Current term | Shown only in small overview subtitle from JSON. |
| Today’s date | Shown (locale `en-RW`). |
| 10 required summary cards | Only a subset shown; outstanding fees and teachers-only breakdown not explicit. |
| Explanation + data source + link on every card | Not implemented. |
| “Today’s School Activity” section | Not present by name; recent activity/notification list only. |
| “Needs Your Attention” with why/who/when/action | Not implemented; approval queue exists but lacks explanation fields. |
| Performance charts with filters | No year/term/class/subject filters; no professional chart component found. |
| Unavailable vs zero semantics | Mostly zero/“—”; needs explicit “No data available”. |

---

## 10. Meetings and collaboration assessment

- `src/routes.tsx:250-281` renders generic `ModuleCrud` pages for `collaboration` and `meetings`.
- Backend generic module routes `server.ts:3530-3599` store arbitrary fields in JSON module records.
- `MODULE_ACCESS` allows headteacher/deputy/teacher/accountant/animateur for meetings/collaboration (`server.ts:403-410`).
- No dedicated meeting model, invitation/RSVP, agenda, minutes, action-item, deadline, comment, attachment, external join URL, or PDF export found.
- No video provider integration found. The system must not claim video meetings work; an external URL field would need to be explicit and permission-protected.

**Verdict:** DEMO ONLY / NOT IMPLEMENTED for the requested functionality.

---

## 11. Reports and analytics assessment

- `GET /api/reports/analytics` (`server.ts:3385-3527`) aggregates real records with permission-based redaction.
- `ReportsPage` and report card printing components exist.
- Academic workflow has draft/approved/published/distribution states.
- Gaps: no general report builder for the requested categories, no report status lifecycle beyond report cards, no report reference numbers, no consistent official PDF header/footer/page-number/signature workflow, no Excel export for most reports, no filter-driven preview/generate/print flow across categories.
- Empty data currently renders `0` instead of “No data available”.

---

## 12. Testing assessment

### Safe commands executed in this audit

- `npm run lint` — PASS.
- `npm run db:status` — PASS.
- `npm run db:check` — PASS.
- Read-only SQL counts — PASS.

### Existing verification suites

Safe/read-only or isolated-safe suites include: `test:navigation`, `test:permissions`, `test:staff`, `test:api`, `test:school-context`, `test:lifecycle`, `test:permission-management`, `test:academics`, `test:role-redirection`, `test:public-site`, `test:combinations`, `test:hardening`, `test:headteacher`, `test:activity`, `test:reports`, `test:meetings`, `test:profile`, `test:db`.

**Do not run on live data:** `npm test` (includes mutating suites), `test:isolation`, `test:access-reset`, `test:ai`, `test:gemini`, signup suites against any DB other than `schoolcare_signup_test`.

### Coverage gaps

- No successful staff invitation activation test.
- No meeting/collaboration CRUD or RSVP tests.
- No PDF fidelity, logo, pagination, Kinyarwanda glyph or accessibility browser tests.
- No report-card qualitative sign-off test.
- No role × endpoint exhaustive API authorization test.
- No JSON↔MariaDB parity test.
- No responsive/mobile browser test.
- No load/performance test.

A separate `docs/SCHOOLCARE_TEST_REPORT.md` will be created when implementation testing is performed.

---

## 13. Documentation contradictions found

1. `README.md:113` says “no public registration”, but public signup endpoints exist.
2. `PRODUCTION_DEPLOYMENT.md:286` says AI is not wired; code registers AI routes at `server.ts:22,3361`.
3. Migration status in older audit docs is stale; migration ledger now includes 009–011.
4. `npm test` suite counts differ between `package.json`, `PRODUCTION_AUDIT_REPORT.md` and `PRODUCTION_DEPLOYMENT.md`.
5. Deployment docs say bind Node to loopback, but code listens on `0.0.0.0`.
6. Bundle-size figures disagree across docs; local built chunk is ~1.4 MB.
7. Gemini connection script still sends key as a query parameter to Google model-list endpoint (`scripts/verify-gemini-connection.ts:42-43`), unlike the OCR path.

---

## 14. Duplicate, unused and unnecessary items

- Headteacher sidebar contains **School Documents** (`src/navigation.ts:263-268,435`) backed by an empty generic CRUD page (`src/routes.tsx:166-182`). User explicitly requested removal from Headteacher navigation only; underlying upload/document functions in admissions/reports/staff must remain.
- `meetings`, `collaboration`, `exams`, `marking-guides`, `teaching`, `sms-email`, `inventory`, `partner-schools`, `innovations` are generic CRUD screens. Some duplicate real functionality (e.g. exams vs academic marks workflow, SMS/Email vs Communication).
- `src/pages/ModulePage.tsx` and several older page components may be unused; no dead-code removal was performed.
- `POST /api/demo/reset` is demo-only.

---

## 15. Recommended implementation order (safe stages)

1. **Phase 2 – DATA SAFETY:** Create verified backup, label/hide hardcoded demo statistics, add empty-state semantics. Do not delete records.
2. **Phase 3/12 – HEADTEACHER DASHBOARD:** Extend `server/headteacherDashboard.ts` with academic year/term, teachers-only count, pending admissions, published results, pending approvals, outstanding fees, attention explanations; redesign `HeadteacherOverview` with real data and proper empty states.
3. **Phase 14 – SECURITY QUICK WINS:** Add permission/role gates to the high-risk routes in section 8.2.
4. **Phase 9 – NAVIGATION:** Remove School Documents from Headteacher nav only; do not delete routes/files used elsewhere unless confirmed unused.
5. **Phase 5 – STAFF WORKFLOW UI:** Improve Staff Management copy, activation status, invitation pending state, and administrator-controlled activation when email is not configured; never expose existing passwords.
6. **Phase 8 – MEETINGS:** Replace generic meeting/collaboration CRUD with dedicated, permission-protected backend endpoints and clear “external meeting link” configuration status.
7. **Phase 7 – REPORTS:** Add filter-driven report categories, real records, professional PDF layout, report status, and explicit configuration notes.
8. **Phases 16–18:** Run safe tests, create test report and user guide, then produce final delivery report.

---

## 16. Audit conclusion

SchoolCare is **not an empty prototype**: authentication, RBAC, staff lifecycle, students, attendance, academics, marks approval, report cards, admissions, public website, AI assistant and audit logging have substantive backend implementations. The main problems are not missing foundations but:

1. **Authorization gaps** on sensitive routes.
2. **Demo/fallback data and hardcoded statistics** presented alongside real records.
3. **Missing dedicated meetings/collaboration and Smart Alert Center**.
4. **Headteacher dashboard that is real but not yet professional/explanatory**.
5. **JSON↔MariaDB parity gaps and configuration-dependent services**.
6. **Stale documentation and unsafe aggregate test command**.

No data was deleted or changed during this audit. Any phase that could affect real school records must be preceded by a verified backup and explicit confirmation for ambiguous records.

---

## 17. Verified implementation progress after the audit

The classifications in sections 5–16 remain the original Phase 1 baseline. This section records only work that has been implemented and verified afterwards.

| Area | Baseline | Current verified status | Evidence |
|---|---|---|---|
| Headteacher dashboard | PARTIALLY WORKING | **IMPLEMENTED for the requested overview** | `server/headteacherDashboard.ts` now returns `academicPeriod`, expanded `totals`, `performance` and `attention`; `src/pages/DashboardPage.tsx` renders the exact welcome text, school role line, explanation/source cards, “Needs Your Attention”, “Today's School Activity” and filterable performance views. |
| Headteacher sidebar | PARTIALLY WORKING | **IMPLEMENTED** | `src/navigation.ts` groups Headteacher navigation into eight sections and hides only `documents` for `HEAD_TEACHER`; `scripts/verify-navigation.ts` confirms the route remains registered for other roles. |
| High-risk API authorization gaps | PARTIALLY WORKING | **IMPLEMENTED for the audited route list** | 23 permission gates added in `server.ts` for guardians, attendance explanation, health incidents, notifications, finance reads, staff/academic/timetable/homework/analytics reads and events. `scripts/verify-api-security.ts` now checks denied and allowed cases. |
| Dashboard verification | Coverage gap | **IMPLEMENTED** | `scripts/verify-headteacher-dashboard.ts` now asserts all new dashboard fields, bounded chart values, actionable attention items, and count consistency with stored records. |
| Smart Alert Center | NOT IMPLEMENTED | **IMPLEMENTED as a read-only aggregator** | `src/pages/AlertCenterPage.tsx` reads the existing attention, health-incident and notification records; `src/navigation.ts`/`src/routes.tsx` add `alert-center` under the Headteacher Dashboard section; no new alert store or approval state was created. |
| School Settings accuracy | DEMO CLAIMS | **IMPLEMENTED for status honesty** | `src/pages/SettingsPage.tsx` no longer labels SMS/WhatsApp gateways as active/verified; it reports delivery as pending unless configured and adds a read-only signed-in profile card without platform-admin controls. |
| School Activity History | WORKING | **IMPLEMENTED with privacy safeguards** | `server/database.ts` now redacts credentials, tokens, phone/email and long token strings from every audit detail; learner names were removed from health/report-card audit details. `src/pages/AuditPage.tsx` adds category/today filters, empty states and accurate status text. `scripts/verify-activity-history.ts` verifies redaction and permission gates. |
| Executive reports and export | WORKING WITH CLAIMS | **IMPLEMENTED for record-based reporting** | `server/reportAnalytics.ts` gives the JSON view and CSV export one shared builder with module permission redaction, applied scope metadata and CSV-injection escaping. `server.ts` adds a permission-gated export endpoint and activity record; `src/pages/ReportsPage.tsx` removes unverified benchmark/reconciliation captions, adds scope notices and downloads the server-generated file. A4 print rules are in `src/index.css`. |
| Meetings and collaboration | DEMO ONLY / NOT IMPLEMENTED | **IMPLEMENTED on the existing module store** | `src/pages/MeetingWorkspacePage.tsx` replaces generic CRUD with invitations, responses, external links, agendas, notes, tasks, minutes, filters and an A4 print sheet. `server.ts` now preserves bounded nested arrays/objects in module payloads; `scripts/verify-meetings.ts` verifies persistence, permissions, sanitization, school scope and audit records. No second meeting database was created. |
| Staff invitation handoff | WORKING | **IMPLEMENTED with clearer handoff** | `src/pages/StaffManagementPage.tsx` now shows the one-time activation link after both create and resend, with expiry, copy-once guidance and an expired state. Token rotation and hash-only storage are unchanged; `scripts/verify-staff-management.ts` covers the UI contract alongside the existing token-security checks. |
| Headteacher self-profile | READ ONLY | **IMPLEMENTED with strict allowlist** | `PATCH /api/auth/me/profile` is Headteacher-only and session-derived. Only display name, phone and photo URL are accepted; role, email, school, credentials, status and permissions are ignored. `server/profileSync.ts` mirrors name/phone to MariaDB when available and reports failure honestly. `scripts/verify-headteacher-profile.ts` verifies immutable fields, mirrors, audit privacy and validation. |

### Commands executed after implementation

| Command | Result |
|---|---|
| `npm run lint` | PASS (`tsc --noEmit`) |
| `npm run build` | PASS (1,951 modules transformed; large-chunk warning remains documented) |
| `npm run test:headteacher` | PASS — 26/26 checks |
| `npm run test:api` | PASS — 64/64 checks |
| `npm run test:navigation` | PASS — 177/177 checks |
| `npm run test:activity` | PASS — 16/16 checks |
| `npm run test:reports` | PASS — 19/19 checks |
| `npm run test:meetings` | PASS — 29/29 checks |
| `npm run test:profile` | PASS — 22/22 checks |
| `npm run test:db` | PASS — 18/18 checks |
| Safe suite chain: `test:permissions` 58/58, `test:staff` 23/23, `test:school-context` 7/7, `test:lifecycle` 22/22, `test:permission-management` 23/23, `test:academics` 60/60, `test:role-redirection` 95/95, `test:public-site` 52/52, `test:combinations` 69/69, `test:hardening` 13/13 | PASS |

### Still outstanding

- Phase 2 destructive cleanup remains blocked: no fresh verified backup and no record-by-record owner confirmation.
- Broader Kinyarwanda UI coverage remains to be implemented. The Smart Alert Center now exists as a read-only aggregator, but its browser interactions are not yet click-through tested.
- Configuration-dependent features (SMTP/SMS, Gemini key, OCR, production admission secret, payment stubs) remain configuration-dependent.
- `npm test` remains unsafe on live data because it includes mutating suites.
