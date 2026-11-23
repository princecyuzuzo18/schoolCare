# SchoolCare Production-Readiness Audit — Final Report

Date: 2026-11-23  
Repository: `/home/prince/Desktop/school`  
Target domain: `esrubengera.com` (purchase/DNS/TLS **not verified**)  

No deployment, DNS change, certificate issuance, service purchase, commit, revert, push, destructive data operation, or migration was performed. All pre-existing uncommitted work was preserved. `.env` was never printed.

---

## 1. Scope and method

The audit covered all 18 requested areas: project baseline, frontend, authentication, authorization, multi-school isolation, database, management modules, academics, report cards, finance, security, performance, UX, tests, production configuration, deployment preparation, bug fixing, and this final report.

Evidence came from:

- Static review of `server.ts`, all `server/*` modules, `src/*`, `mysql/*`, `scripts/*`, `package.json`, and `.env.example`.
- Five deep-dive audits: auth/security, database/migrations, frontend/UX, academics/finance/report cards, and API/isolation.
- Live API probes with real session cookies for parent, student, accountant, and staff roles.
- A production-mode smoke server on loopback, now stopped.
- Automated lint, production build, 16 test suites, database verification, dependency audit, hardening checks, backup creation, and archive inspection.

The JSON store remains authoritative for most modules; MariaDB is authoritative for credentials/sign-in and several mirrored records. This hybrid ownership model is a deployment constraint and is called out below.

---

## 2. Verification evidence

| Check | Status | Result |
|---|---|---|
| `npm run lint` | READY | PASS |
| `npm run build` | READY | PASS; warning: main chunk 1,395.07 kB / 373.96 kB gzip |
| `npm test` | READY | 16 suites / 626 checks PASS |
| `npm run test:db` | READY | 18/18 PASS |
| `npm audit --omit=dev` | READY | 0 vulnerabilities |
| `npm ls --depth=0` | READY | PASS |
| `npm run db:check` / `db:status` | READY | Connected to `schoolcare_db`; InnoDB; 48 tables; 9 migration records |
| Production smoke server | READY | `/`, `/about`, `/apply`, `/portal`, assets, manifest, logo, and `/api/health` served 200; protected APIs returned 401; hardening headers present |
| Backup integrity | READY | Fresh SQL dump and full archive created; `gzip -t` and `tar -tzf` PASS |
| Isolated signup suite | NOT TESTED | Dedicated signup test database unavailable to the app DB user |

Final verification logs: `/tmp/opencode/final-lint-ok.log`, `/tmp/opencode/verify-build.log`, `/tmp/opencode/final-test-ok.log`, `/tmp/opencode/final-dbtest.log`, `/tmp/opencode/final-audit.log`, `/tmp/opencode/final-backup.log`.

Suite breakdown: navigation 118, permissions 58, staff 19, API security 49, school isolation 24, school context 7, lifecycle 22, permission management 23, access reset 10, academics 60, role redirection 67, public site 46, combinations 69, hardening 13, AI assistant 41.

Backup artifacts created in this pass:

- `backups/schoolcare_db_2026-11-23T12-13-48-479Z.sql.gz` — 54 tables, integrity verified.
- `backups/schoolcare-full-20261123T121345Z.tar.gz` — contains `schoolcare_db.json`, `public_content.json`, public uploads, and admission upload directory under `data/`; listing verified.

---

## 3. Backend, auth, and authorization

**READY** for single-instance use.

- Login is MariaDB-backed with scrypt hashes; malformed stored hashes fail closed instead of returning HTTP 500.
- Login throttling is keyed by IP and normalized email; signup throttling is keyed by IP and route.
- Production fails closed without a strong `ADMISSION_TRACKING_SECRET`.
- Session cookies are `HttpOnly`, `SameSite=Lax`, and `Secure` in production.
- No hardcoded application login password or debug backdoor was found.
- `switchRole` is a no-op; no impersonation endpoint exists.
- Access reset rotates a strong temporary password, bumps credential epoch, invalidates sessions, and writes an audit entry.
- Live probes confirmed parent and student accounts receive `403` from `/api/reports/analytics`.
- `/api/schools/me` was added so the frontend gets the authenticated school instead of falling back to a public school list; fallback now occurs only on 401.
- Frontend deep links are preserved after login.
- Frontend RBAC now respects effective delegated permissions instead of short-circuiting on role-allowed tabs.
- Shared session-expiry dispatch was added across form/blob/XHR API transports.

**NEEDS ATTENTION**

- Sessions and throttles remain process-local. Restarts log users out; multiple app instances cannot share them.
- Password self-service reset is intentionally disabled (`503`); administrator provisioning is the supported path.

**BLOCKED**

- HA/multi-instance deployment until sessions and rate limits move to a shared store.

---

## 4. Multi-school isolation

**READY** for private application APIs; **NEEDS ATTENTION** for the public site.

- 24/24 isolation checks pass.
- Browser-supplied `schoolId` values are ignored or overwritten for ordinary staff.
- No confirmed cross-school student, guardian, health, finance, academic, report-card, or notification IDOR remains.
- School settings updates are whitelisted; identity keys and counters cannot be changed through the API.
- Notification recipient scoping was fixed: parent/student hubs now see only their own account, linked students, linked guardians, linked health incidents, and intentional broadcasts. Staff keep school-wide visibility.
- Notification sending now resolves recipient identity and contact details from same-school records instead of trusting client-supplied names/phones.
- Notification acknowledgement is subject to the same visibility rule.
- Payment creation now resolves the student name from the school record, validates the payment method, and no longer stores the fake phone number `+250 788 000 000`.
- A parent explanation can now only convert an `ABSENT` record to `EXCUSED`; verified attendance, late, sick, and authorized-leave records cannot be rewritten.

**NEEDS ATTENTION**

- Public CMS content is global and the public site has a hardcoded school identity. A school admin can currently overwrite content visible on every tenant's public site. This requires a product decision: either declare the public site single-tenant or add `school_id` to public content, articles, gallery records, and settings.
- Public signup/admissions bind to `db.getSchools()[0]`. In a real multi-school deployment this needs an explicit tenant-selection mechanism or a documented single-public-school configuration.
- `admission_settings` has no `school_id`.

No architectural guess was made for these three items.

---

## 5. Database and migrations

**NEEDS ATTENTION.**

- Live DB is internally clean: no SQL injection found, no FK orphans or cross-school FK mismatches in verified checks, all applied migration checksums match, `CHECK TABLE` clean, and no `DROP`/`TRUNCATE` in migrations.
- `npm run test:db` now checks migrations 001–008 and reports 18/18.
- DB config parsing was fixed so values like `"10abc"` are rejected; pool idle timeout/keepalive were corrected; racy connection/query timers were removed.
- JSON store writes are now atomic (`fsync` + rename), and a corrupt store is preserved as `.corrupt-*` instead of silently reseeded.
- Backup scripts now source `.env`, honor all data/upload directories, use bounded env parsing and safe identifier quoting, and clean up streams on failure.
- Restore instructions were corrected to use the `data/` prefix and correct filenames.

**NEEDS ATTENTION**

- Migration ledger contains duplicate `005_academic_marks_report_cards` and `005_record_lifecycle` prefixes. They were left untouched because they are already applied; the runner now warns.
- `mysql/migrations/009_ai_assistant.sql` is untracked and unapplied locally.
- Migration runner still lacks advisory locking, transactional/partial-failure state, and post-migration assertions.
- `mysql/schoolcare_db.sql` is a seed/destructive dump, not a restore artifact.
- Missing FK enforcement remains on several columns, including `payments.invoice_id`, `messages.recipient_id`, `health_incidents.guardian_id`, `audit_logs.user_id`, admission slip links, and `classes.combination_id`.
- Live drift remains: MariaDB has 8 students vs JSON 6; notifications 2 vs 6; audit logs 2 vs 30; staff accounts 0 vs 7; report cards 0 vs 1; credentials exist only in MariaDB.
- Four stale `classes.student_count` values, two non-seed student rows, one extra credential, and a DDL-capable app DB user were previously identified and left unchanged.

No DDL, row correction, deletion, or migration was performed without approval.

---

## 6. Academics and report cards

**NEEDS ATTENTION.** Core workflow is **READY**; official report content completeness is not.

- 60/60 academic workflow checks pass.
- Marks save → submit → return → approve → generate → publish → distribute → reopen was exercised.
- Missing marks block submission, all-excused marks are rejected, failed submissions roll back, and approved marks are required for report generation.
- Parent/student portals only receive published, linked report cards.
- Regenerating a report card now preserves `publishedAt`/`publishedBy`, so a published card no longer silently disappears.
- Qualitative fields now survive regeneration.
- Analytics was scoped by module permission: `reports:read` no longer exposes unpublished academic details, health cases, finance, attendance, or communication to roles without those module grants. Empty sections now report zero instead of a misleading 100%.

**NEEDS ATTENTION**

- Official report cards are generated with blank conduct score, class-teacher remarks, head-teacher remarks, strengths, and areas for improvement. No safe setter workflow exists, and the rendered sheet still shows “Not recorded” and a literal stamp/signature placeholder area after the hardcoded names/seal were removed. Publishing an “official” card with substantive qualitative content requires a product-approved editor and signing workflow.
- Report card logo embedding is missing from the HTML/PDF header.
- Subject ranks do not share ties while overall ranks do; ranking policy needs documentation.
- Extreme PDF pagination and non-ASCII glyph fidelity were **NOT TESTED**.

---

## 7. Finance

**NEEDS ATTENTION.** Recording integrity is **READY**; provider-backed payment is not implemented.

- Parent self-payment remains deliberately disabled (`503`) to prevent false receipts.
- Staff recording validates student, invoice ownership, positive amount, balance, reference uniqueness, and now the method allowlist.
- Student names and payer details are resolved/sanitized server-side; no fake payer phone is stored.
- `db.recordPayment()` revalidates school/student/balance and handles duplicates.
- Finance analytics is only returned to roles with `finance.read`.

**NEEDS ATTENTION**

- Manual payments are immediately marked `COMPLETED` without provider verification, refund, cancellation, or reconciliation.
- There is no provider callback workflow. Do not enable online parent payments until one exists.

---

## 8. Health, attendance, and communication

**READY** for local record keeping; **NEEDS ATTENTION** for delivery claims.

- Health incidents no longer fabricate vitals or actions; class is derived from the student; guardian alerts require a verified link.
- Health Center previously showed a hardcoded 100% “multi-channel delivery verified” KPI. It now shows the actual recorded acknowledgment rate and explicitly says acknowledgments are from school records.
- Communication i18n no longer claims carrier/WhatsApp delivery verification; it states that messages remain queued until a provider is configured.
- Gemini API key in admissions OCR was moved from the URL query string to `x-goog-api-key`, and upstream error bodies are no longer logged.

**NEEDS ATTENTION**

- Notifications are still local queue records only. No SMS/WhatsApp/email provider dispatcher or callback verification exists.
- Attendance supports only one record per student per day; per-period attendance is not representable.
- Events are create-only; timetable and homework are read-only; homework submission is not implemented.

---

## 9. Frontend and UX

**READY** with follow-ups.

- All routes, navigation items, and role redirections were checked: 118 navigation checks and 67 role-redirection checks pass.
- Private deep links survive login.
- RBAC short-circuit was fixed.
- Session expiry is handled consistently across API transports.
- False claims were removed from student ID QR, reports CSV, communication report, executive names/seal, and parent guardian status.
- Native dialogs remain in several CRUD/report actions; several pages set `loading` without rendering it; generic CRUD lacks consistent validation/pagination.
- No global React error boundary was added.
- A zero-byte `public/school-classroom-scene.svg` was noted; the broken asset reference was corrected to `/school-classroom.svg`.
- Dead parent-payment modal/handler code remains unreachable in `ParentPortalPage.tsx`.
- Demo landing metrics/social links still need owner-approved real content.

**NOT TESTED**

- Exhaustive browser-level accessibility and responsive testing.
- PDF rendering across all target browsers.

---

## 10. AI assistant

**READY** after concurrent-work stabilization.

- The previously untracked `server/ai/` module is now wired and exercised by 41 automated checks.
- Chat history ordering was fixed with time-ordered message IDs; no new DB column or migration is required for ordering.
- System instructions now include verified data source titles and explicitly treat `<knowledge_document>` text as untrusted data.
- Prompt-injection isolation, school/user scoping, role-based data access, language detection, feedback ownership, regenerate, retention purge, and rate limiting are covered.
- One test expectation was corrected: provider `messages` contain two history turns plus the current question (3 entries), not 4, because the system instruction is passed separately.

**NEEDS ATTENTION**

- Migration 009 is still unapplied locally; deploy it only after the owner approves and a backup exists.
- Real Gemini provider behavior is **NOT TESTED**; the suite uses an injected deterministic generator.

---

## 11. Security hardening

**READY.**

- `X-Powered-By` disabled; security headers present; HSTS in production.
- JSON `/api/health` does not expose database/configuration details.
- Unknown API paths return JSON, not the SPA shell.
- Explicit port-conflict failure; production secret guard; production demo reset disabled.
- Safe file streaming via `stream/pipeline`; final Express error handler.
- `/api/mysql/export` is super-admin only and `/api/mysql/status` is sanitized.
- SMTP/SMS/provider choices remain a deployment decision, not an application defect.

---

## 12. Performance

**NEEDS ATTENTION.**

- Production build succeeds but the main bundle is ~1.40 MB / 374 kB gzip, above the 500 kB warning threshold.
- No profiling or load test was performed.
- The single-node, in-memory session model is adequate for a small pilot but not HA.

**NOT TESTED**

- Concurrent user load, large-class marks entry, large report-card sets, and long-running backup/restore under production traffic.

---

## 13. Deployment preparation

**READY as documentation; BLOCKED as action.**

`PRODUCTION_DEPLOYMENT.md` covers MariaDB setup, `.env`, migrations, backup/restore, systemd, Nginx/HTTPS, loopback binding, `TRUST_PROXY=1` behind exactly one trusted hop, post-deploy checks, and constraints. Restore instructions were corrected for the archive layout.

Deployment remains **BLOCKED** pending explicit owner approval and provision of:

- Purchased/configured `esrubengera.com`, DNS, VPS, TLS certificate.
- Production secrets and real account passwords.
- SMTP/SMS or messaging provider choices, if delivery is required.
- Account provisioning and owner acceptance of documented limitations.
- Session durability decision if more than one instance will run.

---

## 14. Fixes applied in this audit

Confirmed and tested fixes include:

- Authenticated `/api/schools/me` and frontend school context fallback correction.
- Private deep-link preservation and frontend RBAC permission-order fix.
- Shared session-expiry dispatch; atomic JSON persistence; corrupt-store preservation.
- DB config parsing, pool settings, and removal of racy timers.
- Hardened backup/restore tooling and corrected restore documentation.
- Extended database verification for migrations 006–008.
- Notification recipient scoping, send validation, and acknowledgement protection.
- Analytics module-permission redaction and honest zero-value metrics.
- Report-card publication preservation on regeneration.
- Attendance explanation restricted to absence records.
- Honest health acknowledgment KPI and communication copy.
- Gemini API key moved out of URL query strings; upstream error bodies no longer logged.
- Payment method allowlist, server-resolved student name, and removal of fake payer phone.
- AI chat history ordering, prompt source titles, knowledge-data isolation wording, and corrected test expectation.
- Removal of several false product claims from UI/copy.

---

## 15. Status ledger

**READY**
- Lint, production build, 16 suites / 626 checks, 18/18 DB checks, 0 production vulnerabilities, hardening checks.
- Single-instance private API authorization, school isolation, core academics, report workflow, finance recording integrity, health/attendance records, backup creation, documented deployment plan.
- AI assistant internal tests and the production-mode smoke probe.

**NEEDS ATTENTION**
- Global public CMS and hardcoded public school identity.
- Public signup/admissions tenant binding and global admission settings.
- Report-card qualitative content/signing workflow and logo embedding.
- Provider-backed payments, notification delivery, refunds/reconciliation.
- In-memory sessions/throttles and disabled password reset.
- Database governance: duplicate 005 prefixes, unapplied 009, drift, missing FKs/unique keys, stale counters, DDL-capable app user.
- Frontend bundle size, native dialogs, loading states, validation/pagination, error boundary, dead parent-payment code, demo content.
- Attendance period model, ranking tie policy, read-only timetable/homework, create-only events.
- Applicant-to-student conversion after admissions approval.

**BLOCKED**
- Deployment, DNS, TLS, purchases, publishing, and any production change without explicit owner approval.
- HA/multi-instance operation until sessions and throttles are shared.
- Fully automated parent online payments until provider callbacks/reconciliation exist.
- True multi-tenant public site until tenant-scoped content/settings are designed and implemented.

**NOT TESTED**
- Isolated signup suite.
- Staging restore drill.
- Real Gemini provider responses.
- Extreme PDF pagination/non-ASCII rendering.
- Browser-level accessibility and load/performance testing.

---

## 16. Conclusion

**CONDITIONALLY READY.**

The existing SchoolCare codebase is functionally sound for a **single-instance** pilot and passes all executed verification: clean lint and build, 16 suites / 626 checks, 18/18 database checks, zero production dependency vulnerabilities, a clean production-mode smoke probe, and verified backups. The fixes made in this working tree close the confirmed integrity, isolation, hardening, notification, analytics, attendance, payment-recording, and AI-assistant issues without deleting features or changing live data.

It is **NOT READY** for HA/multi-instance operation, fully automated parent online payments, a genuinely multi-tenant public website, or publication without the owner accepting the documented limitations and completing the preflight checklist.

Deployment remains **BLOCKED** until the owner explicitly approves it and provisions the domain, VPS, TLS, secrets, accounts, and provider decisions. No live system was changed by this audit.
