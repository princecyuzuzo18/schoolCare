# Academic Structure Management

**School:** ES RUBENGERA RTB  
**Date:** 2026-11-24  
**Scope:** Central configuration of the academic chain used by registration, class placement and teacher marks entry. This extends the existing Academic Administration page; it does not create a second structure module.

---

## 1. Purpose

The Headteacher (or an explicitly authorized academic administrator) now manages the school's academic structure in one place:

**Academic Year → Term → Combination → Class Level → Class → Subject → Assessment Category**

Teacher marks screens read those same records. Dropdowns are populated from the API, not hardcoded. A teacher can only enter marks for an active assignment that matches the selected year, term, combination, level, class and subject.

---

## 2. Where to configure it

1. Sign in as the Headteacher or an academic administrator with `academics.write`.
2. Open **Academic Administration → Structure**.
3. Configure records in this order:
   1. academic years and terms;
   2. combinations (existing **Combination Management** page remains the detailed editor);
   3. class levels;
   4. classes;
   5. subjects;
   6. teacher / class / subject assignments;
   7. assessment categories and grading scale.

The Structure tab also shows record counts for the whole chain and provides tables, edit actions, archive/deactivate confirmations and assignment history.

---

## 3. Managed entities

### 3.1 Class levels

A class level is a managed label such as `L3`, `L4`, `L5`, `Y1`, `Y2` or `Y3`. Each level can be linked to one or more combinations. Existing classes were normalized additively into levels without changing their IDs.

- Legacy Accounting classes keep their stable IDs and now use `Y1 Accounting`, `Y2 Accounting`, `Y3 Accounting`.
- Discontinued S3 and CST classes are `ARCHIVED`, not deleted.
- Archived levels are hidden from new selection lists but remain in historical records.

### 3.2 Classes

A class now stores its academic year, combination, level, class teacher, code, room and lifecycle status. Creating a class validates that the referenced combination and level exist. Duplicate codes and duplicate names in the same year/structure are rejected.

### 3.3 Subjects

A subject stores its active/inactive/archived status and optional links to combinations and levels. Empty link arrays mean "available broadly"; when links are present, an assignment must match them. Archived subjects can never be selected for new marks work.

### 3.4 Teacher assignments

An assignment records the year, term, class, subject, combination, level and one or more teachers. The server rejects:

- a combination that does not match the class;
- a class level that does not match the class;
- a subject that is not linked to the selected combination or level;
- an archived class or archived subject;
- an unknown teacher or a user outside the school;
- an empty teacher list;
- requests by non-managers.

Every create/update/deactivate action appends an in-record history event and an audited activity entry. Notifications are queued for teachers added to an assignment.

---

## 4. Teacher marks chain

The teacher marks entry page (and the teacher workspace scope controls) expose this sequence:

1. **Academic year**
2. **Term** — limited to the selected year.
3. **Combination** — derived from active assignments.
4. **Class level** — derived from assignments under the selected combination.
5. **Class** — derived from assignments under the selected combination and level.
6. **Subject** — derived from assignments for the selected class.
7. **Assessment** — active assessment categories from the selected marks sheet.

Changing an earlier selection clears all dependent selections and closes the marks sheet. Only active assignments are shown.

If a teacher has no usable assignments, the screen displays exactly:

> You have no active assignments for the selected academic year and term. Please contact the headteacher or academic administrator.

The same message is shown in My Classes, Marks Management, My Subjects, Submitted Marks and Examination Results when the selected scope has no assignments.

---

## 5. Backend enforcement

| Area | Rule |
|---|---|
| Management writes | `requireManager()` — school/head leadership or `academics.write`. |
| Full assignment list | Manager-only. Teachers use `/api/academics/my-assignments`. |
| Teacher workspace | `GET /api/academics/my-assignments` filters by the signed-in user ID, active assignments, active classes and non-archived subjects. |
| Marks entry | `assertTeacherAssignment()` checks the exact year/term/class/subject pair. The headteacher bypass is limited to real school leadership, not delegated academic permissions. |
| Marks save | Re-checks assignment, class status and subject status before writing marks. |
| Students | Every mark must belong to an active student registered in the selected class. |
| School scope | Browser-supplied `schoolId` values are ignored; all reads and writes use the session scope. |
| Audit | Structure changes, assignment changes and marks changes append append-only activity history. |

---

## 6. API reference

| Method | Endpoint | Purpose |
|---|---|---|
| `GET` | `/api/academics/class-levels` | Managed levels; optional `combinationId` and `activeOnly` filters. |
| `POST` | `/api/academics/class-levels` | Create a level (manager only). |
| `PATCH` | `/api/academics/class-levels/:id` | Rename, relink or activate/deactivate a level. |
| `GET` | `/api/academics/assignments` | Manager-only assignment administration; supports `yearId`, `termId`, `classId`, `subjectId`, `combinationId`, `levelId` and `includeInactive`. |
| `GET` | `/api/academics/assignments/:id/history` | Assignment history for managers, reviewers or an assigned teacher. |
| `POST` | `/api/academics/assignments` | Create or update an assignment for a unique year/term/class/subject pair. |
| `PATCH` | `/api/academics/assignments/:id` | Update teachers, status or structure links. |
| `GET` | `/api/academics/my-assignments` | Active assignments for the signed-in teacher; supports year, term, combination and level filters. |
| `PATCH` | `/api/academics/classes/:id/status` | Activate, deactivate or archive a class without deleting it. |
| `PATCH` | `/api/academics/subjects/:id/status` | Activate, deactivate or archive a subject without deleting it. |

Class and subject create/update endpoints are also used by the Structure tab. Combination creation and lifecycle endpoints remain in `server/combinations.ts`.

---

## 7. Data preservation and migrations

- The JSON store remains authoritative.
- `server/database.ts` performs additive normalization: missing collections are created, legacy classes receive additive links, and no existing class/subject/student/mark/report ID is changed.
- `mysql/migrations/013_academic_structure.sql` is an additive, idempotent mirror migration. It adds `class_levels`, new nullable columns and indexes; it contains no destructive `DROP TABLE`, `DROP COLUMN` or `DELETE FROM` statement.
- **Migration status:** applied in the local `schoolcare_db` through the backup-first `npm run db:migrate` flow (59 tables, migrations `001`–`013`). Run the same command after backup confirmation when deploying.

---

## 8. Verification

Run:

```bash
npm run test:academic-structure
```

The suite uses a temporary JSON store and disabled MariaDB mirrors. It verifies derived levels, preserved legacy records, manager-only writes, level/class/subject creation, assignment validation, combination/level filters, deactivation/reactivation, teacher isolation, marks draft/submit, archive/restore, audit history, the exact no-assignment message and the absence of the six removed public Apply fields.

Related suites:

```bash
npm run test:academics
npm run test:teacher-marks
npm run test:combinations
npm run test:admissions
```

---

## 9. Remaining work

- Apply migration `013` in the target deployment environment through the normal backup-first migration command.
- Verify JSON↔MariaDB parity after migration `013` is applied in that environment.
- Click through the Structure tab, teacher selectors and confirmation dialogs on desktop and mobile.
- Run accessibility and visual acceptance checks.
