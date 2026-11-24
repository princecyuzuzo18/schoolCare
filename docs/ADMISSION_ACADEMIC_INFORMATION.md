# Admission Academic Information and Document Review

**School:** ES RUBENGERA RTB  
**Date:** 2026-11-24  
**Scope:** Public application form, admissions staff review, configurable document categories, secure pre-submission uploads, MariaDB mirror only (no database replacement).

---

## 1. Purpose

This document describes the professional academic-background workflow added to the existing SchoolCare admissions module. It extends the current application form and review screen; it does not create a second admissions application or replace existing records.

The JSON store remains authoritative. New MariaDB tables and columns are mirrors of the same records, written with parameterized helpers. The applied migration is `mysql/migrations/012_admission_academic_background.sql`.

---

## 2. What applicants now provide

The public **Apply Here** form includes a titled **Previous Academic Background** section in the details step.

| Field | Rules and source |
|---|---|
| Previous class or level | Free text, bounded length. |
| School identification | Free text, bounded length. |
| Performance marks | Number up to 100, at most two decimal places. |
| Performance grade | Selected from the school's active grading scale. |
| Performance description | Short bounded explanation. |
| Subject rows | Repeater with subject name, marks and grade. Marks are validated as numbers up to 100. |
| Previous school details | Name and location; transfer applications keep their existing current-school fields. |

The following fields are intentionally **not collected** in the public application form: academic year completed, year of Senior 3 completion, Senior 3 completion status, previous combination or subjects, requested admission level, and preferred academic combination. They are not required to submit an application. The API still reads and displays these values for applications created before this change, but the Apply page no longer asks for them or sends them.

The existing Senior 3 result-slip upload and OCR review flow remains intact. Structured data is stored in `application.academicBackground`; OCR-extracted and applicant-reviewed result-slip data remains in `admission_senior3_results`.

---

## 3. Public configuration

`GET /api/public/admissions/settings` now returns:

- `academicYears` — real academic years from the academic module.
- `previousCombinations` — configured combinations with id, name and code.
- `preferredCombinations` — only active, non-archived combinations with available capacity.
- `grading` — grading scale name, pass mark and grade boundaries from the active academic scale.
- `documentCategories` — staff-configured categories, or safe defaults before configuration.
- `resultSlipRequired` — always `true`; a Senior 3 result slip is mandatory for new Senior 4 applicants. Legacy exception notes are no longer exposed.

Validation happens on the server with these options; frontend validation alone is never trusted.

---

## 4. Document categories and secure uploads

### 4.1 Configurable categories

Default categories are:

- `PREVIOUS_REPORT` — Previous school report (available to new Senior 4, transfer, and Other Admission applicants).
- `ACADEMIC_TRANSCRIPT` — Academic transcript.
- `TRANSFER_LETTER` — Transfer letter.
- `STUDENT_ID` — Student or school ID.
- `SUPPORTING_DOCUMENT` — Other supporting document.
- `OTHER` — Other supporting document.

Admissions staff can rename categories and enable/disable them in **Admissions Management → Admission document categories**. The authenticated API also accepts `key`, `label`, `active`, `required` and `applicationTypes` for each category. `PREVIOUS_REPORT` is always active for all three application types. Public applicants only see active categories relevant to their application type.

### 4.2 Upload flow

1. Applicant selects a category card and a PDF, JPG or PNG file of at most 5 MB.
2. `POST /api/public/admissions/documents` stores the file under the private upload root (`.documents/`) with directory mode `0700` and file mode `0600`.
3. Only a short-lived capability token is returned. The token is hashed in storage; it is not a public document URL.
4. `POST /api/public/admissions/documents/preview` streams the file inline with `no-store`, `nosniff` and a restrictive content-security policy.
5. Applicants can replace or remove a file before submitting. Replaced/removed files are invalidated and deleted.
6. On final application submission, `documentTokens` are verified, copied into the application's private directory, and consumed. The response never returns internal upload tokens.

Same-origin checks, rate limits, file-type checks and magic-byte validation are applied to document and result-slip uploads.

---

## 5. Staff review workflow

Admissions staff open **Admissions Management**, select an application, and see:

- applicant and guardian details;
- structured academic background and subject rows;
- original Senior 3 OCR data and applicant-reviewed data side by side;
- configured document categories and uploaded files;
- preview/download actions with access history;
- status history and decision history, including actor name, role and timestamp.

Supported statuses:

| Status | Meaning |
|---|---|
| `DRAFT` | Not yet submitted. Preserved for existing/future workflows. |
| `SUBMITTED` | Initial application state. |
| `UNDER_REVIEW` | Staff have started formal review. |
| `DOCUMENTS_REQUIRED` | Applicant must supply named document categories. Requires a reason and at least one requested type. |
| `ADDITIONAL_INFO_REQUIRED` | Applicant must supply another explanation or record. Requires a reason. |
| `APPROVED` | Application accepted. |
| `REJECTED` | Application declined. Requires a reason. |
| `WAITLISTED` | Application held for a later decision. Requires a reason. |

All pre-existing status values remain available. Negative decisions require a short explanation; notifications include that explanation. Every accepted decision appends both a `statusHistory` entry and an `AdmissionReviewDecision` record and is written to the audit log.

CSV export from **Admissions Management → Export CSV** includes reference number plus academic-background summary columns.

---

## 6. API reference

| Method | Endpoint | Access |
|---|---|---|
| `GET` | `/api/public/admissions/settings` | Public |
| `POST` | `/api/public/admissions/documents` | Public, same origin, rate limited |
| `POST` | `/api/public/admissions/documents/preview` | Public capability token, rate limited |
| `POST` | `/api/public/admissions/documents/remove` | Public capability token, rate limited |
| `POST` | `/api/public/admissions/applications` | Public, same origin, rate limited |
| `GET` | `/api/admissions/settings` | Admissions read role |
| `PATCH` | `/api/admissions/settings` | Admissions write role |
| `GET` | `/api/admissions/applications` | Admissions read role |
| `POST` | `/api/admissions/applications/:id/status` | Admissions write role |
| `GET` | `/api/admissions/applications/:id/documents/:documentId/preview` | Admissions read role |
| `GET` | `/api/admissions/applications/:id/documents/:documentId/download` | Admissions read role |
| `GET` | `/api/admissions/export` | Admissions read role |

Private document paths are never returned to public callers. Staff preview/download endpoints log `PREVIEW` and `DOWNLOAD` access events.

---

## 7. Usage instructions

### Configure before accepting applications

1. Sign in with an admissions staff account.
2. Open **Admissions Management**.
3. Rename or disable document category cards as needed; the Senior 3 result slip requirement is fixed for new Senior 4 applications.
4. Select **Save settings**.

### Apply

1. Open the public site and choose **Apply Here**.
2. Complete applicant and guardian details.
3. Complete school details and the **Previous Academic Background** section.
4. Upload the Senior 3 result slip (required for new Senior 4, optional for Other Admission), plus each required document.
5. For Other Admission, upload the report from the previous school using **Previous school report**.
6. Review the summary and submit. Save the reference number shown on the confirmation screen.

### Review an application

1. Sign in and open **Admissions Management**.
2. Filter by type, status or academic year and open an application.
3. Inspect background, subject rows, documents and OCR data.
4. Preview or download documents; access is recorded.
5. Choose a decision. For `DOCUMENTS_REQUIRED`, enter a reason and tick the requested document categories. For other negative decisions, enter a reason.
6. Submit the decision. The applicant notification, history and MariaDB mirror are updated together where the mirror is available.

---

## 8. Verification and safety

- Verification command: `npm run test:admissions` (58 checks passed, covering mandatory slips, Other Admission uploads, submission without the removed Senior 3 fields, validation, review and export).
- Migration: `mysql/migrations/012_admission_academic_background.sql`, applied and recorded by `npm run db:status`.
- Backups were created before schema changes under `backups/`.
- The migration only appends enum values, adds JSON columns and creates new tables. Its reversible statements are documented at the bottom of the migration file.
- No applicant, staff, academic or existing admission record was deleted or rewritten by the implementation.

Remaining configuration: production `ADMISSION_TRACKING_SECRET`, notification delivery, and working OCR/AI credentials if automatic result-slip extraction is required. The current OpenAI key authenticates but has no credits, and the existing Gemini key is invalid.
