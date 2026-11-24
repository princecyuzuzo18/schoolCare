# SchoolCare Headteacher User Guide

**School:** ES RUBENGERA RTB
**Audience:** Headteacher MUNYENTWARI Olivier
**Guide date:** 2026-11-24

This guide explains the parts of SchoolCare that are currently implemented and verified. It uses the language shown in the application. Where a number comes from a school record, the dashboard labels the source.

---

## 1. Signing in

1. Open the SchoolCare portal login page.
2. Enter the school account email and password.
3. After sign-in, the application sends the Headteacher to the dashboard automatically. The browser address is not used to choose the destination.

If the account has been suspended or its access was reset, sign-in is blocked until an authorized administrator restores the account or issues new credentials.

---

## 2. The Headteacher dashboard

After sign-in, the dashboard shows:

> **Welcome, MUNYENTWARI Olivier**
> **Headteacher – ES RUBENGERA RTB**

Under the welcome text, the dashboard shows the current academic year, term, school name and the time the figures were generated. If the school record has no academic year or term, the dashboard says **No data available** instead of inventing a value.

### 2.1 School overview cards

Each card shows a number, a short explanation, the source of the data, and a link to the related module. The cards cover:

- Total Students
- Total Staff
- Total Teachers
- Total Classes
- Today's Attendance
- Students Absent Today
- Pending Admissions
- Published Academic Results
- Pending Academic Approvals
- Outstanding Fees

A blank or missing record is shown as **No data available**; it is not silently shown as zero.

### 2.2 Needs Your Attention

This section turns pending records into plain-language actions. Each item explains:

- what happened,
- why it matters,
- what action is needed,
- who is responsible,
- whether a deadline is recorded,
- which module to open.

Click **Take action** to open the related workspace. If all queues are clear, the section says that nothing needs attention right now.

### 2.3 Today's School Activity

This section lists records and notifications created today, with the responsible person, time and current status. Click an entry to open the related module. Use **View full history** to open School Activity History.

### 2.4 School performance overview

The performance section uses only recorded data:

- **Attendance trend** — last 7 or 14 days.
- **Class performance** — filter by class; shows evaluated report cards, average and pass rate.
- **Examination completion** — marks submissions by draft, submitted/under review, approved and returned.
- **Staff task completion** — invitations, activated accounts and invitations awaiting activation.
- **Finance summary** — billed, collected and outstanding amounts, when finance data is available for the account.

Subject-level performance appears only after subject marks are recorded.

### 2.5 Upcoming events and approval queue

The dashboard also shows upcoming school events and a count of approval items by type. The approval queue links to the Approval Center.

---

## 3. Headteacher navigation

The Headteacher sidebar is grouped into eight sections:

1. Dashboard
2. People Management
3. Academic Management
4. School Operations
5. Finance
6. Communication
7. Reports & Analytics
8. School Settings

**School Documents** is intentionally not shown in the Headteacher sidebar. The route and document features used elsewhere in the school are preserved; only this Headteacher navigation entry is hidden.

The **Dashboard** section also contains the **Approval Center** and the **Smart Alert Center**. Together these give a path from a school signal to the module where the decision is made.

If a menu item is not visible, it is either outside the Headteacher role or intentionally hidden. Do not rely on a hidden menu item as a security control — the backend also checks permissions.

---

## 4. Smart Alert Center

Open **Dashboard → Smart Alert Center** to see school signals in one place. The page reads existing records; it does not create a second approval system and it does not invent alerts.

### 4.1 Needs your attention

This list is the same server-generated attention information shown on the dashboard. Each item explains what happened, why it matters, the action needed, the responsible person and any recorded deadline.

Use the **priority** and **category** filters to narrow the list. **Open module** takes you to the page where the underlying record can be reviewed or actioned.

### 4.2 Urgent health and message signals

The page also shows unresolved urgent/emergency health incidents and urgent messages that have not been acknowledged. These come from the Health Center and Parent Communication records.

- **Open module** takes you to the original record.
- **Acknowledge** records your acknowledgement through the original module endpoint and is written to the activity trail.

The acknowledgement buttons are available only to accounts with the relevant health or communication permission. If a record is outside your permissions, the page does not expose it.

---

## 5. School Activity History

Open **Reports & Analytics → Audit Logs & Security** to review School Activity History. It is an append-only record: new actions are added, but earlier records are not rewritten or deleted.

### 5.1 Finding an action

Use the search box to look for an action, actor, entity or detail. The category buttons narrow the list to staff/access, academic, health, finance, communication, or security and permissions. **Today only** limits the list to the current day.

The table shows the timestamp, action, actor and role, related record, detail and IP address. Only the latest 100 matching records are displayed at a time; use filters to narrow a long history.

### 5.2 Privacy of activity details

SchoolCare does not copy passwords, activation tokens, phone numbers, email addresses or learner names into activity details. If a detail mentions a learner by name in an older record, treat that as legacy data and avoid sharing the screenshot. Open the related record in its own module when you need authorized details.

Access to this history requires the `audit.review` permission. Teachers and other staff without that permission cannot read it through the page or the API.

---

## 6. Reports and analytics

Open **Reports & Analytics → Executive Reports** to review school summaries. The page reads records stored in SchoolCare at the time it is opened; it is an internal draft until an authorized person signs the printed copy.

### 6.1 Choosing a report

Use the focus tabs to switch between academic, attendance, health, finance and communication summaries. The **Term** and **Trade** filters apply to academic report cards. Other sections summarize all stored records; the page states this above the report so the scope is clear.

If your account cannot read an underlying module, that section is hidden and named in the restriction notice. The export uses the same permission rules as the screen.

### 6.2 Printing and exporting

**Print Report for Review** uses an A4 print layout with signature blocks. **Export Excel-ready CSV** downloads a UTF-8 file generated by the server from the same data as the page, including the applied filters and restriction status. Numbers are not copied from a stale browser page. Each export is recorded in School Activity History without learner names.

The report does not approve or publish results. Academic results still follow the existing approval workflow in the Academics module.

---

## 7. Academic results and approvals

SchoolCare does **not** use AI to grade learners and does **not** publish unapproved results.

The academic workflow is:

1. A teacher saves marks as a draft.
2. Complete marks are submitted for review.
3. An authorized reviewer approves the submission or returns it with a reason.
4. Report cards are generated only after all required subjects are approved.
5. An authorized user explicitly publishes report cards.
6. Distribution and collection are recorded separately.

Reopening approved marks invalidates stale report cards and resets distribution, so families cannot continue seeing an outdated result.

---

## 8. Staff accounts and invitations

Staff management allows the Headteacher to:

- create staff invitations for allowed roles,
- assign a role and professional details,
- see whether an invitation is awaiting activation,
- resend an invitation (this rotates the activation token),
- revoke an invitation,
- suspend, reactivate, archive and restore staff accounts,
- review staff activity.

Passwords and activation tokens are not shown as reusable plain text in staff listings. If email or SMS delivery is not configured, the system reports the delivery as pending rather than claiming that a message was sent.

### 8.1 Secure handover of an activation link

1. After creating or resending an invitation, copy the link from the amber **Activation link** panel. The panel now appears in both the **Add Staff** and **Pending Invitations** sections, and it shows the expiry date.
2. Verify the recipient’s identity through an approved channel before giving them the link. Copy it before leaving the page; the system does not store a reusable plain-text copy for later viewing.
3. The recipient opens the link and sets their password within seven days. If it expires or is lost, use **Resend / refresh link**. Resending invalidates the earlier link.
4. The invitations list shows **Expired** for an unconsumed invitation whose seven-day window has passed. Resend or revoke it rather than relying on the old link.

The Headteacher account cannot be created, modified or promoted through the ordinary staff API. Only a Platform Super Admin can appoint a Headteacher.

---

## 9. Meetings and collaboration

Open **Meetings** or **Collaboration** from the Headteacher navigation. Both pages use a structured workspace over the existing school records; they do not create a second database or depend on an external meeting service.

For each record you can capture a date, time, invitees, an external meeting link, agenda items, notes, minutes, responses and follow-up tasks. Existing records can be searched, filtered as **Open** or **Done**, reopened, marked done, and printed on an A4 sheet for review.

External links are only clickable when they use `http:` or `https:`. An unsafe value is still preserved in the record but is shown as text and is never opened automatically.

The workspace honours your module permissions. If you cannot read the underlying collaboration module, the page reports that instead of showing empty figures. Saving a record is appended to School Activity History with field names rather than the full meeting content.

---

## 10. Safety rules

- Do not delete learner, parent, staff, exam, attendance or finance records to “clean up” the system. Records are archived instead so history is preserved.
- Do not treat the old hardcoded school totals as verified. Use the dashboard counts, which come from school records.
- Do not share activation links or one-time passwords in ordinary chat.
- If a figure is labelled **No data available**, leave it that way until the source record is entered.
- If something is missing from the menu, check whether the related record or permission exists before assuming the feature is broken.

---

## 11. Configuration-dependent features

Some parts of SchoolCare need external services or secrets before they can work:

- Email and SMS delivery (SMTP/SMS configuration).
- Gemini AI Assistant (`GEMINI_API_KEY`).
- Result-slip OCR.
- Production admission tracking secret.
- Parent online payment (currently a disabled 503 stub).
- Password reset (currently a disabled 503 stub).

The application reports these states rather than presenting them as working features. In **School Settings**, communication delivery is labelled **Not verified in this view** until the relevant credentials are configured.

---

## 12. Editing your Headteacher profile

Open **School Settings → My SchoolCare Profile**. The Headteacher can update only their display name, phone number and photo URL. The endpoint uses the signed-in session to identify the account; it does not accept an account id, school id or role from the browser.

The form labels and confirmation messages follow the language selected in the application. Role, email address, school, account status, credentials, delegated permissions and Platform Super Admin rights cannot be changed from this page. The server also mirrors name and phone changes into the MariaDB profile row when the database is available. If that mirror is unavailable, the page reports it honestly instead of implying the secondary record was updated. The edit is recorded in School Activity History with field names only, not the new values.

---

## 13. Where to get more detail

- Full system audit: `docs/SCHOOLCARE_FULL_SYSTEM_AUDIT.md`
- Verification results: `docs/SCHOOLCARE_TEST_REPORT.md`
- Implementation status: `docs/SCHOOLCARE_FINAL_IMPLEMENTATION_REPORT.md`

This guide will be extended as the remaining usability, localization and delivery work is implemented and verified.
