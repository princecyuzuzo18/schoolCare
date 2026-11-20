# SchoolCare — Smart School. Connected Parents. Better Education.

A comprehensive Secondary School Management & Parent Communication Platform built for **ES RUBENGERA RTB** (Karongi District, Western Province, Rwanda), architected for expansion across Rwandan secondary and TVET institutions.

---

## 🌟 Key Features

1. **Health & Emergency Infirmary Center**
   - Immediate incident triage (Routine, Urgent, Critical Emergency).
   - Records vital signs (Temperature, Pulse), observations, and immediate actions taken.
   - Dispatches emergency notifications to verified parents/guardians with real-time acknowledgment tracking.
   - Logs medical referrals to Rubengera Health Center or Kibuye Referral Hospital.
   - Full timeline audit trail for student safety.

2. **Daily Attendance & Roll Call Tracking**
   - Lesson and daily roll call (Present, Absent, Late, Excused, Sick, Authorized Leave).
   - Duplicate prevention per student per day.
   - Automated parent SMS / WhatsApp notification for unexplained absences.
   - Dedicated Parent Absence Explanation portal.
   - One-click CSV attendance export.

3. **Parent Communication Hub (SMS & WhatsApp API)**
   - Multi-channel support: SMS (MTN & Airtel Rwanda), WhatsApp Business Cloud API, In-App Portal, and Email.
   - Dual-language templates (English & Ikinyarwanda).
   - Strict delivery integrity: messages are only marked delivered upon confirmed carrier callback.
   - Parent acknowledgment tracking.

4. **REB & RTB-Standard Academic Management**
   - Class and TVET combinations (Level 4 & 5 Software Development SOD, Building Construction CST, O-Level S3).
   - CAT continuous assessments (30%) and Terminal Examinations (70%).
   - Conduct and discipline scores (/40 - *Imyitwarire Myiza*).
   - Official printable report cards (*Indangamanota*) with class ranks and head teacher decisions.

5. **Fees & Bursar Administration (RWF)**
   - Term fee structures in Rwandan Francs (RWF).
   - Partial payment handling, outstanding balance tracking, and invoice management.
   - MTN Mobile Money (*182#), Airtel Money, Bank of Kigali (BK), and Cash receipts.
   - Printable official payment receipts (*Inyemezabwishyu*).

6. **Student ID Cards with QR Code**
   - Instant printable student ID cards with encrypted verification QR code for gate admission and authorized parent pickup passes.

7. **English & Ikinyarwanda**
   - Switch between English and Ikinyarwanda; the selected language is restored after refresh.

8. **Authenticated Role-Based Access**
   - School accounts use their assigned role: Super Admin, School Admin, Head Teacher, Deputy Head, Teacher, Nurse, Accountant, Parent, or Student.
   - API requests use server-managed sessions and enforce role permissions.

---

## 🚀 Running the Application

### Development
```bash
# Start full-stack Express server with Vite middleware on port 3010
npm run dev
```

### Production Build
```bash
# Build the client bundle
npm run build

# Start the full-stack server
npm run start
```

### Account setup and sign-in

Seeded user profiles do not include passwords. On **Zorin/Linux**, verify the `.env` `DB_*` values and run `npm run auth:provision-account` in an interactive terminal (see `/mysql/README_ZORIN.md`). On **Windows/XAMPP**, first start MySQL in the XAMPP Control Panel, open **PowerShell as Administrator**, change to the project folder, and run:

```powershell
Set-Location 'D:\PROJECT\schoolcare (1)'
npm run auth:provision-account
```

The command verifies that PowerShell is elevated, lists active accounts from the existing MySQL `user_profiles` table, and lets the administrator select one. It creates the `user_auth_credentials` table if needed, prompts twice for an initial password without echoing it, and inserts only a scrypt hash. Passwords must be 12–128 characters. The table’s `user_id` is a primary/foreign key to `user_profiles.id`, so the command cannot create duplicate user accounts or provision the same account twice. Run it again for each account that needs access. Do not pass passwords as command arguments, paste them into chat, or run the command in a non-elevated terminal. There is no public registration or demo-role sign-in.

The same `user_auth_credentials` table is included in `mysql/schoolcare_db.sql`. The CLI creates it non-destructively for an already-imported XAMPP database; it does not drop or modify existing accounts. Password login reads the hash from this table, so MySQL must remain available for authentication.

The server issues an HttpOnly, SameSite=Lax session cookie with a 12-hour lifetime. Sessions are held in memory and are invalidated when the server restarts. In production, serve the application over HTTPS so the session cookie is marked Secure.

Password-recovery email delivery is not implemented/configured. Users who forget their password must contact a school administrator, who can set a new password with the same local command. Do not claim that a reset email was sent.

---

## 🗄️ Database & MySQL / XAMPP Setup

SchoolCare is fully architected for **MySQL (5.7+, 8.0+)** and **MariaDB (10.3+)** running with **XAMPP & phpMyAdmin**:

- Complete SQL Dump: `/mysql/schoolcare_db.sql` (relational InnoDB tables, foreign keys, and seed data)
- Setup Guide (XAMPP/Windows): `/mysql/README_XAMPP.md`
- Setup Guide (Zorin OS / MariaDB 10.11): `/mysql/README_ZORIN.md` — use this on Linux
- Direct Download Endpoint: `GET /api/mysql/export` (Download SQL dump directly in your browser)
- MySQL Health Status: `GET /api/mysql/status` (Live connection monitoring)

### XAMPP 3-Step Quick Start:
1. Start **Apache** and **MySQL** in the **XAMPP Control Panel**.
2. Open **phpMyAdmin** at `http://localhost/phpmyadmin` and import `mysql/schoolcare_db.sql`.
3. Set your credentials in `.env` (`DB_HOST="localhost"`, `DB_PORT="3306"`, `DB_USER="root"`, `DB_PASSWORD=""`, `DB_NAME="schoolcare_db"`).

*Note: SchoolCare can fall back to its built-in JSON store for application data when MySQL is offline, but sign-in and password verification require the configured MySQL database.*
