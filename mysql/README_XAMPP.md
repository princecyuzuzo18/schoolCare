# 🐘 SCHOOLCARE — XAMPP & MySQL Database Setup Guide

Welcome to the **SchoolCare** MySQL & XAMPP database deployment guide for **ES RUBENGERA RTB** (Rwanda).

This platform is 100% configured for MySQL (version 5.7, 8.0+) and MariaDB (10.3+) running locally on **XAMPP**, **WampServer**, **Laragon**, or any Linux/Cloud MySQL instance.

---

## ⚡ Quick 3-Step Setup with XAMPP & phpMyAdmin

### Step 1: Start XAMPP Services
1. Open the **XAMPP Control Panel** on your computer.
2. Click **Start** next to **Apache**.
3. Click **Start** next to **MySQL** (default port `3306`).
   - Both indicators should turn green.

---

### Step 2: Import `schoolcare_db.sql` via phpMyAdmin
1. Open your web browser and navigate to:
   ```
   http://localhost/phpmyadmin
   ```
2. In the top navigation bar, click the **Import** tab.
3. Under **File to import**, click **Choose File** (or "Browse...").
4. Select the file:
   ```
   mysql/schoolcare_db.sql
   ```
   *(You can also download this file directly with 1 click inside the SchoolCare app under **Settings > MySQL & XAMPP Center**).*
5. Scroll to the bottom of the page and click **Import** (or **Go**).
6. phpMyAdmin will execute the script and display:
   ```
   Import has been successfully finished, queries executed.
   Database `schoolcare_db` created with its tables and initial seed data.
   ```

---

### Step 3: Configure Environment Variables
In your SchoolCare project root directory, copy `.env.example` to `.env` (or edit your existing `.env`):

```ini
# MySQL Database Configuration (Standard XAMPP defaults)
DB_HOST="localhost"
DB_PORT="3306"
DB_USER="root"
DB_PASSWORD=""
DB_NAME="schoolcare_db"
```

*Note: In default XAMPP installations, the user is `root` with no password (`DB_PASSWORD=""`). If you assigned a root password in phpMyAdmin User Accounts, enter it in `DB_PASSWORD`.*

---

## 📊 Database Schema Overview

The database `schoolcare_db` includes production-grade relational tables:

| Table | Description | Key Relationships |
|---|---|---|
| `schools` | School institution profile & emergency hotline | Multi-tenant root (ES RUBENGERA RTB) |
| `roles` | 9 RBAC roles (Super Admin, Nurse, Accountant, etc.) | Standardized role codes |
| `user_profiles` | Staff, parent, and student account logins | Foreign Key to `schools` and `roles` |
| `user_auth_credentials` | scrypt password hashes only (no plaintext passwords) | Primary/foreign key to `user_profiles.id` |
| `classes` | Class streams & combinations (SOD, CST, S3) | Foreign Key to `schools` |
| `subjects` | Academic course modules & credits | Foreign Key to `classes` |
| `students` | Official student enrollment dossier | Foreign Key to `classes` |
| `guardians` | Verified parent & guardian contact details | Multi-guardian support |
| `student_guardians` | Junction table for parent-child linking | Foreign Keys with `pickup_authorized` flag |
| `attendance` | Daily & lesson roll call (Present, Sick, Late, etc.) | Unique index per student per date |
| `health_incidents` | Infirmary emergencies, vital signs & hospital referrals | Emergency status, parent notification & response |
| `notifications` | SMS & WhatsApp parent delivery logs | Multi-channel delivery confirmation |
| `fee_structures` | Term tuition, boarding & ICT lab fees in RWF | Linked to academic term & classes |
| `invoices` | Student fee billing accounts | Foreign Key to `students` |
| `payments` | Cash, BK bank transfer, and MTN Mobile Money | Foreign Key to `invoices` with receipts |
| `timetable` | Weekly period schedules per combination | Foreign Key to `classes`, `subjects`, `staff` |
| `homework` | Class assignments, deadlines, and submissions | Foreign Key to `classes`, `subjects` |
| `events` | Academic calendar & parent-teacher assemblies | Audited event scheduler |
| `audit_logs` | Immutable audit trail for Rwanda Law No 058/2021 | Strict user action logging |

---

## 🛠️ Testing the MySQL Connection in Node.js

Start the SchoolCare server:
```bash
npm run dev
```

SchoolCare automatically attempts to connect to your local MySQL instance on port `3306`.
- If MySQL is running in XAMPP: SchoolCare connects directly to `schoolcare_db`.
- If MySQL is not running yet: application data can use the built-in disk database in `/data/schoolcare_db.json`; **sign-in and password verification still require MySQL**.

You can also check the live database status at any time in your browser:
```
http://localhost:3000/api/mysql/status
```

---

## 📥 Direct SQL Export Endpoint

Need a fresh copy of the SQL dump at any time?
You can download it anytime via:
```
http://localhost:3000/api/mysql/export
```
or via the **Download SQL Dump** button inside the SchoolCare Settings page.
