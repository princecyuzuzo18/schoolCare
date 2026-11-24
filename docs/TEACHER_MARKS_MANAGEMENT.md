# Teacher Marks Management

**School:** ES RUBENGERA RTB  
**Date:** 2026-11-24  
**Scope:** Teacher Portal extension of the existing academic marks engine. No second marks database, no duplicate workflow engine, no rebuild of existing records.

---

## 1. Purpose

This document describes the complete Teacher Portal marks workspace. It reuses the existing server-authoritative academic module (`server/academics.ts`, `server/academicCore.ts`) and adds five focused pages to the teacher sidebar.

The legacy **My Academic Work** page remains available. The new pages give teachers dedicated views for classes, marks entry, results, subjects and submission history.

---

## 2. Teacher pages

| Navigation page | ID | What it does |
|---|---|---|
| My Classes | `teacher-my-classes` | Shows only classes and subjects assigned to the signed-in teacher for the selected year/term, with live workflow status and real dashboard counters. |
| Marks Management | `teacher-marks-management` | Reuses the marks-entry workspace: select an assigned pair, enter coursework/test/exam marks, save a draft, or submit complete marks. |
| Examination Results | `teacher-examination-results` | Shows calculated class average, subject average, totals, grades and ranks for an assigned class/subject. Unassigned combinations are rejected server-side. |
| My Subjects | `teacher-my-subjects` | Groups assignments by subject and lists the exact classes and levels attached to each subject. |
| Submitted Marks | `teacher-submitted-marks` | Lists only the teacher's submissions with status, return reason and recent workflow history; returned submissions can be resubmitted. |

These pages are visible to `TEACHER` and relevant academic staff roles. Parents and other non-academic roles are denied both the UI entry and the underlying API calls.

Each scope now follows the managed chain **Academic year → Term → Combination → Class level → Class → Subject → Assessment**. Options are derived from the teacher's active assignments; changing an earlier selection clears the dependent selections. If the selected scope has no active assignments, the exact message shown is:

> You have no active assignments for the selected academic year and term. Please contact the headteacher or academic administrator.

---

## 3. Access control and scope

Frontend navigation uses `academics.read` through `src/rbac.ts`. The server remains authoritative:

- `GET /api/academics/my-assignments` filters assignments to `teacherIds.includes(actor.id)`, active assignments, active classes and non-archived subjects. It also accepts `combinationId` and `levelId` filters.
- `GET /api/academics/marks-entry`, `POST /api/academics/marks/save` and `GET /api/academics/results` call `assertTeacherAssignment()` for non-managers.
- `POST /api/academics/marks/save` additionally rejects archived classes and archived subjects before any mark is written.
- A teacher cannot open another teacher's class/subject pair, even by crafting a request.
- Each saved mark is checked against the students registered in that class.
- `GET /api/academics/submissions` and `GET /api/academics/dashboard` filter non-reviewers to their own submissions.
- `marks.write` is required to save marks; `marks.review` or academic leadership is required to review, return, approve, reopen or publish.
- Teachers cannot approve or publish their own marks.

The role allowlist for marks workspaces is `SUPER_ADMIN`, `SCHOOL_ADMIN`, `HEAD_TEACHER`, `DEPUTY_HEAD` and `TEACHER`, with the normal permission checks still applied.

---

## 4. Marks workflow

| Status | Meaning |
|---|---|
| `DRAFT` | Marks can be edited. Incomplete values are allowed and remain visibly missing. |
| `SUBMITTED` | Complete marks sent for review. Editing is locked. |
| `UNDER_REVIEW` | Reviewer has formally started review. Added as an explicit, audited transition. |
| `RETURNED` | Reviewer required a correction; the teacher can edit and resubmit. Reason is stored. |
| `APPROVED` | Reviewer accepted the marks; approved results generate report cards. |
| `REOPENED` via `APPROVED → RETURNED` | An approved submission is reopened with a reason; dependent published report cards are unpublished. |

Published results are a separate, explicit, authorized action. Unapproved marks never become official report results.

Submission validation is transactional: if a `SUBMIT` is rejected because marks are missing, the previously saved mark snapshot is restored, so a failed submission cannot leave partial marks behind.

---

## 5. Real dashboard statistics

`GET /api/academics/dashboard` derives its counts from stored records for the selected year and term:

- assignments;
- assignments belonging to the signed-in teacher;
- draft submissions;
- submitted submissions, including those under review;
- approved submissions;
- returned submissions;
- published reports;
- incomplete reports.

The teacher pages display these values directly; no hardcoded student, class or mark totals are used.

---

## 6. API reference

| Method | Endpoint | Purpose |
|---|---|---|
| `GET` | `/api/academics/my-assignments` | Assigned pairs and workflow status. |
| `GET` | `/api/academics/marks-entry` | Students, categories, marks, missing entries and editability for one assigned pair. |
| `POST` | `/api/academics/marks/save` | Save draft or submit complete marks. |
| `GET` | `/api/academics/submissions` | Own submissions for teachers; all visible submissions for reviewers/managers. |
| `POST` | `/api/academics/submissions/:id/submit` | Submit a draft or returned submission. |
| `POST` | `/api/academics/submissions/:id/review` | Move `SUBMITTED` marks to `UNDER_REVIEW`. Reviewer only. |
| `POST` | `/api/academics/submissions/:id/return` | Return submitted or under-review marks with a reason. Reviewer only. |
| `POST` | `/api/academics/submissions/:id/approve` | Approve complete marks and generate report cards. Reviewer only. |
| `POST` | `/api/academics/submissions/:id/reopen` | Reopen approved marks with a reason and unpublish dependent reports. |
| `GET` | `/api/academics/results` | Calculated results, restricted to an assigned class/subject for teachers. |
| `GET` | `/api/academics/dashboard` | Record-derived dashboard counters. |

---

## 7. Usage instructions

### Teacher

1. Sign in with a teacher account.
2. Open **My Classes** and choose the academic year and term. Only your active assignments appear.
3. Narrow by combination and class level, then choose the assigned class and subject.
4. Open **My Subjects** to see subjects and the exact classes/levels attached to them.
5. Open **Marks Management**, select an assigned class/subject pair, optionally narrow the assessment, and fill the coursework, test and exam columns.
6. Choose **Save draft** while working, or **Submit** when all marks are complete. Missing marks block submission.
7. Open **Submitted Marks** to track review status. If marks are returned, read the reason, correct them, and resubmit.
8. Open **Examination Results** to view calculated totals, grades and ranks after selecting an assigned pair.

### Reviewer / academic lead

1. Open **Academic Administration → Review**.
2. Start review on a newly submitted pair, or return/approve a submission directly.
3. Returning requires a reason. Approving complete marks generates report cards.
4. Publishing remains a separate action in the reports workflow and is audited.

---

## 8. Verification and safety

- Verification command: `npm run test:teacher-marks` (45 checks passed at implementation time).
- Managed-chain verification: `npm run test:academic-structure` (46 checks passed at implementation time).
- Existing marks verification: `npm run test:academics`.
- Navigation verification: `npm run test:navigation`.
- Checks include teacher-only visibility, denied parent access, assignment isolation, draft save, incomplete-submit rejection, locked submitted marks, self-approval denial, under-review transition, return reason, resubmission, approval, report-card generation, publication permission, calculated results and unassigned-combination rejection.
- No student, mark, submission or report-card record was deleted or rewritten outside isolated test directories.
- No schema migration was required for Part B.

Remaining configuration: school academic years, terms, combinations, class levels, classes, subjects, teacher assignments, assessment categories and grading scale must be present and active in **Academic Administration → Structure** before teachers can use these pages. See `docs/ACADEMIC_STRUCTURE_MANAGEMENT.md`. Migration `013_academic_structure.sql` is applied in the local `schoolcare_db`; run `npm run db:migrate` in the deployment environment after backup confirmation.
