# SchoolCare Test Report

**Project:** SchoolCare – ES RUBENGERA RTB
**Report date:** 2026-11-24
**Repository baseline:** Existing project with pre-existing uncommitted user work preserved.
**Data safety:** No live student, parent, staff, exam, attendance, finance or audit record was deleted or modified by this work. Isolated test suites use temporary data directories.

---

## 1. Purpose

This report records the verification performed during the professionalisation work on SchoolCare. It covers the completed Headteacher dashboard, Headteacher navigation cleanup, high-risk API authorization gates, the read-only Smart Alert Center, accurate School Settings status, the professional admission academic/document workflow, the Teacher Marks Management workspace, and the existing safe regression suites.

It is not a claim that every browser interaction, external service, or production deployment path has been tested. Those gaps are listed in section 6.

---

## 2. Commands and results

All commands were run from the project root.

| Command | Result | Notes |
|---|---|---|
| `npm run lint` | PASS | `tsc --noEmit`; no type errors. |
| `npm run build` | PASS | Vite production build completed; 1,954 modules transformed. Large-chunk warning remains documented as a performance gap. |
| `npm run db:check` | PASS | MariaDB/InnoDB reachable at `127.0.0.1:3306`; database `schoolcare_db`. |
| `npm run db:status` | PASS | Migrations `001`–`013` recorded; 59 tables; staff governance tables present. |
| `npm run test:db` | PASS | 18/18 database checks. |
| `npm run test:navigation` | PASS | 180/180 checks for 12 roles, 43 navigation items and 43 routes. |
| `npm run test:permissions` | PASS | 58/58 permission and delegation checks. |
| `npm run test:staff` | PASS | 23/23 staff-management checks. |
| `npm run test:api` | PASS | 64/64 API security checks. |
| `npm run test:school-context` | PASS | 7/7 school-scope checks. |
| `npm run test:lifecycle` | PASS | 22/22 archive/restore checks. |
| `npm run test:permission-management` | PASS | 23/23 permission-group checks. |
| `npm run test:academics` | PASS | 60/60 academic-workflow checks. |
| `npm run test:admissions` | PASS | 58/58 admission academic-background, upload, mandatory-slip, validation, review, access-history and export checks. |
| `npm run test:teacher-marks` | PASS | 45/45 teacher marks navigation, assignment scope, draft/submit/review/return/approve/publish and results checks. |
| `npm run test:academic-structure` | PASS | 46/46 centralized structure, assignment validation/filtering, teacher isolation, marks chain, archive/restore and Apply-field checks. |
| `npm run test:role-redirection` | PASS | 95/95 role-login and redirect checks. |
| `npm run test:public-site` | PASS | 52/52 public website checks. |
| `npm run test:combinations` | PASS | 69/69 combination-management checks. |
| `npm run test:hardening` | PASS | 13/13 security-hardening checks. |
| `npm run test:headteacher` | PASS | 26/26 Headteacher dashboard and Alert Center checks. |
| `npm run test:activity` | PASS | 16/16 School Activity History privacy and permission checks. |
| `npm run test:reports` | PASS | 19/19 executive report export, scope, permission and CSV-safety checks. |
| `npm run test:meetings` | PASS | 29/29 meeting/collaboration storage, sanitization, permission and UI-contract checks. |
| `npm run test:profile` | PASS | 22/22 Headteacher self-profile allowlist, immutability, mirror, audit and bilingual-label checks. |

---

## 3. What the passing tests verify

### 3.1 Headteacher dashboard

`scripts/verify-headteacher-dashboard.ts` verifies:

- The endpoint requires authentication and rejects teachers.
- The authenticated Headteacher session still has role `HEAD_TEACHER`, email `esrubengera@gmail.com`, and personal name `MUNYENTWARI Olivier`.
- The response contains `generatedAt`, `schoolId`, `schoolName`, `academicPeriod`, `totals`, `attendance`, `academics`, `performance`, `approvals`, `attention`, `activities`, `notifications` and `events`.
- Expanded totals include students, staff, teachers, parents, active classes, archived students, pending admissions, published results and pending academic approvals.
- Attendance trend and class-performance rows are structurally valid and rates stay within 0–100.
- Examination completion and staff-task completion have explicit numeric shapes.
- Every attention item explains what happened, why it matters, what action is needed, who is responsible, its status, destination tab and permission.
- Pending admission and published-result totals match stored records.
- Approval totals agree with the approval queue and the pending academic-approval total matches marks plus report-card approvals.
- Browser-supplied school IDs cannot change the dashboard scope.
- Upcoming events are filtered to today or later.

### 3.2 API authorization

`scripts/verify-api-security.ts` verifies:

- Anonymous requests to protected staff endpoints receive 401.
- Teachers cannot list staff accounts, review audit logs, grant permissions, create invitations or publish events.
- The Headteacher cannot self-grant, cannot promote another user to Headteacher, and cannot grant sensitive permissions.
- Delegated staff creation is scoped by role and revoked permissions take effect immediately.
- Invitation responses never expose a token hash; revoked invitations cannot be activated.
- Audit records exist for staff permission, role, invitation and account-status actions.
- Analytics redacts academic, health and finance sections according to module permissions.
- Newly gated routes deny unauthorized roles:
  - Teacher: guardian directory, health incidents, finance invoices, staff directory, health-incident creation, event creation.
  - Nurse: academic classes, homework.
  - Accountant: academic subjects, timetable.
- Legitimate access still works:
  - Parent: guardian records and linked invoices.
  - Nurse: health incidents.
  - Teacher: academic classes.
  - Headteacher: events and staff activity.

### 3.3 Navigation

`scripts/verify-navigation.ts` verifies:

- 43 navigation items map to 43 registered routes without duplicates.
- Every role reaches only authorized pages.
- All 12 role dashboards are routable and never fall back to the public landing page.
- Headteacher navigation uses the eight requested sections.
- `documents` is intentionally hidden from the Headteacher sidebar but remains registered for other roles.
- The Smart Alert Center is in the Headteacher Dashboard section and is limited to school leadership roles.

### 3.4 Smart Alert Center

The Headteacher verification script additionally checks that:

- The Headteacher can read the health-incident and notification records used as alert signals.
- Every attention item has a supported severity, a destination tab and an action description that the page can render.

The Alert Center itself is a read-only aggregation of existing records. It does not create alerts, duplicate the approval queue, or store new state. Acknowledging a health incident or message calls the original module endpoint; those actions remain permission-gated and audited by the server.

### 3.5 School Activity History

`scripts/verify-activity-history.ts` verifies:

- A new activity record is appended without removing earlier records.
- Passwords, long tokens, phone numbers and email addresses are redacted from audit details before they are stored.
- Redaction markers are present while the actor and action remain useful.
- Details are length-bounded.
- Anonymous and teacher requests for activity history are rejected; the Headteacher can read it.
- The API response contains the redacted text, not the original secrets.
- The staff activity view remains filtered to staff-related actions.

The UI adds category filters, a today-only filter, an empty state and a visible privacy note. It uses the existing `audit.review`-protected endpoint; no second activity store was created.

### 3.6 Executive reports and Excel-compatible export

`scripts/verify-report-exports.ts` verifies:

- Anonymous export requests are rejected, and a teacher without `reports.read` is denied.
- Term and trade filters are applied to academic report cards in both JSON and CSV.
- Scope metadata is included in the export, and the default report explicitly has no trade filter.
- The export is UTF-8 CSV with a BOM, an attachment filename and no path traversal in that filename.
- A section hidden by module permissions exports a `RESTRICTED` notice and the withheld section names instead of misleading empty figures.
- CSV formula-looking cells are neutralised and quoted cells are escaped.
- Each export is appended to activity history without learner names.

The UI now labels the report as an internal draft, states the scope of the filters, and replaces unverified benchmark/reconciliation claims with record-based wording. Print layout targets A4 with signature blocks; visual PDF fidelity remains unverified.

### 3.7 Academic workflow

`scripts/verify-academics.ts` verifies the existing no-AI, no-auto-publish workflow:

- Teachers save drafts, submit complete marks, and cannot approve their own marks.
- Reviewers return marks with a reason; corrected marks can be resubmitted.
- Report cards are generated only after all subjects are approved.
- Publication is an explicit authorized action.
- Parents and students see only linked/own published report cards.
- Reopening approved marks invalidates stale report cards and resets distribution.
- All major workflow transitions are audited.

### 3.8 Meetings and collaboration

`scripts/verify-meetings.ts` verifies:

- Anonymous and unauthorized-role reads are rejected, while a teacher can read shared records.
- The structured workspace replaces the previous generic CRUD forms.
- Invitees, agendas, tasks and responses survive the generic module API; top-level identity and school fields cannot be spoofed.
- Status and task progress can be updated, and the record stays within the actor’s school.
- Unsafe external links are stored but are not rendered as clickable links.
- Legacy generic records with `attendees` or `participants` remain readable.
- Meeting and collaboration creation/updates are appended to activity history.

### 3.9 Headteacher self-profile

`scripts/verify-headteacher-profile.ts` uses a deliberately unavailable test database name so no live MariaDB row is touched. It verifies:

- Anonymous edits are rejected and a teacher receives 403.
- Only full name, phone and photo URL are accepted.
- The full name is split consistently into first and last names.
- Submitted role, email, school id, status, credential timestamp, delegated permissions and professional fields are ignored.
- JSON, staff account and staff directory mirrors are updated consistently.
- A failed MariaDB mirror is reported as unavailable instead of being silently claimed as successful.
- The audit record contains field names only, not the new name or phone number.
- Empty, overlong, non-text and privileged-only payloads are rejected.

### 3.10 Admission academic information and documents

`scripts/verify-admissions.ts` verifies:

- Public settings expose real academic years, all previous combinations, only open preferred combinations, the configured grading scale and document categories. These options are retained for compatibility and legacy records; the public Apply form no longer asks for academic year completed, Senior completion year/status, previous combination, requested level or preferred combination.
- Staff cannot waive the Senior 3 result slip requirement but can still change document categories; public settings reflect both rules.
- Other Admission accepts a result slip and a previous school report, and stores the slip in the same verification record.
- Non-admissions staff roles are denied list, settings and export endpoints.
- PDF/JPG/PNG magic-byte uploads are accepted only for configured, application-type-appropriate categories.
- Invalid document types, invalid categories and mismatched file content are rejected.
- Temporary uploads can be previewed inline, replaced and removed; removed capability tokens stop working.
- A valid submission stores structured academic background and subject rows, consumes the upload token and never exposes internal tokens.
- A submission succeeds without the removed Senior 3/academic-year/combination fields, confirming they are not required.
- Invalid academic year, combinations, grading grade and numeric marks return HTTP 400.
- Staff application detail exposes the structured background and attached document.
- All six review statuses are accepted with actor metadata; negative statuses require reasons and `DOCUMENTS_REQUIRED` requires requested types.
- Status history preserves earlier values while appending every decision.
- Staff preview/download stream bytes and append actor-aware access history; parents cannot preview documents.
- CSV export includes academic-background fields and the reference number.

MariaDB mirrors are intentionally unavailable in this suite (`DB_PORT=1`); the script verifies that the JSON-first flow remains safe and reports mirror failures honestly.

### 3.11 Teacher Marks Management

`scripts/verify-teacher-marks.ts` verifies:

- All five teacher pages have routes, are visible to teachers and are hidden from parents.
- Assigned classes/subjects load only for the signed-in teacher and dashboard counters come from stored records.
- Unassigned class/subject combinations are rejected with HTTP 403.
- Marks entry returns only students in the assigned class.
- Teachers can save incomplete drafts, cannot submit incomplete marks and cannot edit submitted marks.
- Teachers cannot approve, return or review their own marks.
- Submitted Marks lists only the teacher's own submissions; parents cannot list submissions.
- A reviewer can move `SUBMITTED` marks to `UNDER_REVIEW`, return them with a reason, and the teacher can resubmit.
- Approval generates report cards from approved marks only.
- Teachers cannot publish official results; authorized reviewers can.
- Calculated results load for assigned pairs and reject unassigned pairs.

### 3.12 Centralized academic structure

`scripts/verify-academic-structure.ts` verifies:

- The public Apply form omits all six requested fields.
- Teacher screens use the exact no-assignment message, API-backed searchable selectors, dependent clearing and the registered route id.
- Academic Administration exposes managed levels, classes, subjects, assignments, confirmations and history.
- Migration `013` is additive and idempotent.
- Legacy class IDs, links and archived status are preserved; levels are derived from existing records.
- Managers can create levels, classes and subjects; duplicate/invalid links are rejected; teachers and parents are denied management and teacher-workspace endpoints.
- Assignments validate combination, level, subject and teacher scope; history is appended; combination/level filters work for both manager and teacher lists.
- Deactivated/archived assignments, classes and subjects disappear from teacher selectors and cannot accept new marks.
- Marks entry loads enrolled students and active assessments, enforces teacher isolation, saves drafts and permits submission only when marks are complete.
- Submitted marks and legacy records survive archive/restore changes, and structure/marks actions are audited.

---

## 4. Data safety notes

- The test scripts set `SCHOOLCARE_DATA_DIR` to an OS temporary directory before importing the server, so JSON module writes are isolated from `data/schoolcare_db.json`.
- `test:profile` also points `DB_DATABASE`/`DB_NAME` at an unused database name, so the MariaDB profile mirror fails closed and no live account row is changed.
- The consolidated `npm test` chain and the separate `test:db`, `test:activity`, `test:reports`, `test:meetings` and `test:profile` suites were run. All scripted suites set an isolated temporary `SCHOOLCARE_DATA_DIR` before importing the server; `test:admissions` also uses an isolated upload directory.
- The first `npm test` run was stopped by the harness timeout during `test:ai`; it was rerun with a longer timeout. No test failure was caused by the timeout.
- `test:signup` was not run against the live database. It requires `DB_DATABASE=schoolcare_signup_test` and `DB_NAME=schoolcare_signup_test`.
- `test:openai` reports `QUOTA_EXCEEDED`; `test:gemini` reports `INVALID_KEY` while `AI_PROVIDER=openai`. These are external service failures, not application logic failures.
- Fresh backups were created before the admission schema migration: `backups/schoolcare_db_2026-11-24T15-57-01-015Z.sql.gz`, `backups/schoolcare-full-20261124T155658Z.tar.gz`, `backups/schoolcare_db_2026-11-24T16-01-11-465Z.sql.gz` and `backups/schoolcare-full-20261124T160107Z.tar.gz`.
- Phase 2 destructive cleanup remains blocked until record classification and explicit owner confirmation are available.

---

## 5. Changes covered by this verification

- `server/headteacherDashboard.ts` — expanded server-authoritative dashboard data.
- `src/pages/DashboardPage.tsx` — professional Headteacher overview, exact welcome text, attention/activity/performance sections, duplicate legacy section suppression.
- `src/types/index.ts` — expanded dashboard view and attention-item types.
- `src/navigation.ts` — Headteacher sectioning and hidden `documents` item.
- `scripts/verify-navigation.ts` — hidden-item and route-preservation checks.
- `scripts/verify-headteacher-dashboard.ts` — new dashboard-field and consistency assertions.
- `server.ts` — 23 permission gates on previously global-auth-only routes.
- `scripts/verify-api-security.ts` — denied and allowed authorization checks for the newly gated routes.
- `src/pages/AlertCenterPage.tsx` — read-only alert aggregation using existing dashboard, health and notification APIs.
- `src/routes.tsx`, `src/rbac.ts`, `src/i18n/en.ts`, `src/i18n/rw.ts` — Alert Center route, leadership-role access and bilingual labels.
- `src/pages/SettingsPage.tsx` — accurate communication-delivery status and read-only signed-in profile card.
- `README.md`, `PRODUCTION_DEPLOYMENT.md` — corrected stale registration/test/binding claims.
- `server/database.ts` — central audit-detail redaction applied to every append-only activity record.
- `server.ts`, `server/reportPrinting.ts`, `server/academicCore.ts`, `server/academics.ts` — removed learner/recipient names from audit detail strings.
- `src/pages/AuditPage.tsx` — School Activity History filters, empty state, accurate status text and bilingual labels.
- `scripts/verify-activity-history.ts` — redaction and permission-gate checks.
- `server/reportAnalytics.ts` — shared permission-aware analytics and CSV builder.
- `server.ts` — scoped analytics endpoint, gated CSV export endpoint and export audit record.
- `src/services/api.ts` — client method for server-generated exports.
- `src/pages/ReportsPage.tsx` — record-based captions, scope notice, export status and A4-ready print content.
- `src/index.css` — A4 page size and margins for printing.
- `scripts/verify-report-exports.ts` — export permission, parity, restriction, filename and CSV-safety checks.
- `src/pages/MeetingWorkspacePage.tsx`, `src/utils/meetings.ts` — structured meetings/collaboration workspace and normalization helpers.
- `src/routes.tsx`, `src/navigation.ts`, `src/index.css` — workspace routes, professional labels and A4 print sheet rules.
- `server.ts` — bounded structured module payload sanitization and the self-profile route.
- `scripts/verify-meetings.ts` — meeting persistence, permission, sanitization and audit checks.
- `src/pages/StaffManagementPage.tsx` — activation-link panel after create/resend and expiry/expired states.
- `scripts/verify-staff-management.ts` — staff handoff UI-contract checks added to the existing token-security suite.
- `server/profileSync.ts`, `server/staffAdministration.ts`, `server/database.ts` — guarded self-profile update and MariaDB mirror.
- `src/services/api.ts`, `src/contexts/AuthContext.tsx`, `src/pages/SettingsPage.tsx` — client method, session refresh and allowlisted profile form.
- `scripts/verify-headteacher-profile.ts` — immutable-field, validation, mirror and audit checks.
- `mysql/migrations/012_admission_academic_background.sql` — additive admission status, background, document and decision mirrors.
- `server/admissionConfig.ts`, `server/admissions.ts`, `server/admissionsMysql.ts`, `server/database.ts`, `server.ts` — configurable categories, real public options, structured validation, secure uploads, review decisions and CSV fields.
- `src/pages/AdmissionsPortalPage.tsx`, `src/pages/AdmissionsManagementPage.tsx`, `src/services/api.ts`, `src/i18n/admissions.ts`, `src/types/index.ts` — applicant form, staff review UI, client methods, copy and types.
- `scripts/verify-admissions.ts` — end-to-end admission verification.
- `server/academics.ts` — explicit `UNDER_REVIEW` transition and role-scoped marks workspace readers.
- `src/pages/TeacherMarksPages.tsx`, `src/pages/TeacherAcademicsPage.tsx`, `src/pages/AcademicAdminPage.tsx`, `src/navigation.ts`, `src/routes.tsx`, `src/rbac.ts` — five teacher pages, reuse of marks entry and review controls.
- `scripts/verify-teacher-marks.ts` — end-to-end teacher marks verification.
- `src/pages/AdmissionsPortalPage.tsx`, `server/admissions.ts` — six Apply fields removed from the applicant UI and server-side required validation.
- `src/types/index.ts`, `server/database.ts`, `server/academics.ts`, `mysql/migrations/013_academic_structure.sql` — managed class levels, enriched classes/subjects/assignments, additive normalization, permission gates, filters and mirror schema.
- `src/components/SearchableSelect.tsx`, `src/teacherMarksMessages.ts` — shared API-backed searchable selector and exact no-assignment message.
- `src/pages/TeacherAcademicsPage.tsx`, `src/pages/TeacherMarksPages.tsx`, `src/pages/AcademicAdminPage.tsx`, `src/services/api.ts` — full managed chain in teacher screens and structure management in Academic Administration.
- `scripts/verify-academic-structure.ts` — end-to-end academic structure verification.
- `docs/ADMISSION_ACADEMIC_INFORMATION.md`, `docs/TEACHER_MARKS_MANAGEMENT.md`, `docs/ACADEMIC_STRUCTURE_MANAGEMENT.md` — usage documentation for the three workflows.

---

## 6. Known coverage gaps

The following were not executed and must not be claimed as verified:

- Browser click-through testing on desktop and mobile viewports.
- Accessibility testing with a screen reader or automated a11y scanner.
- Load/performance testing, including the large frontend bundle.
- Visual PDF fidelity, pagination, logo placement, Kinyarwanda glyph rendering and print preview.
- Browser click-through of meeting invitation, agenda, task and minute forms (API/storage and UI-contract checks are verified).
- Browser click-through of Smart Alert Center filters and acknowledgement buttons (API-level signal access is verified; the rendered UI is not).
- Browser click-through of School Activity History category and date filters (the data and permission gates are verified).
- Browser click-through of report filters, print preview and CSV download (API/data parity and CSV contents are verified).
- JSON↔MariaDB parity tests.
- Live SMTP/SMS delivery, OpenAI credits, Gemini connectivity, OCR, production admission secret, or online payment tests.
- Browser click-through of the new admission academic/document cards, the five teacher marks pages, the Academic Administration Structure tab, searchable selectors and confirmation/history dialogs.
- JSON↔MariaDB parity for the new admission and academic structure mirror tables.
- Applying migration `013` in the target deployment environment after backup confirmation, then verifying parity. It has been applied in the local `schoolcare_db` (59 tables, migrations `001`–`013`).
- Role-by-role exhaustive endpoint matrix beyond the representative gates in `verify-api-security.ts`.

---

## 7. Conclusion

The current implementation passes all executed application checks, including the consolidated `npm test` chain. The most important verified outcomes are that the Headteacher dashboard is server-authoritative and explanatory, the Headteacher sidebar no longer shows School Documents while the route is preserved, sensitive API routes are permission-gated, the Smart Alert Center is limited to leadership roles and reads only existing records, activity history redacts sensitive fields, executive report exports come from the same permission-scoped server data as the page, meeting records persist in the existing module store with sanitized external links, the Headteacher self-profile endpoint ignores privileged fields, the admission academic/document workflow validates real configuration and protects private documents, and the Teacher Marks workspace preserves assignment isolation, approval integrity and no automatic publication of unapproved results.

External OpenAI/Gemini connection diagnostics remain blocked by credits/provider configuration, and browser/visual/accessibility acceptance is still outstanding. The consolidated delivery status, including blocked and unverified items, is recorded in `docs/SCHOOLCARE_FINAL_IMPLEMENTATION_REPORT.md`.
