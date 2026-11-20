# SchoolCare on Zorin OS — MariaDB setup guide

This guide is for the SchoolCare installation at `/home/prince/Desktop/school`
running on **Zorin OS with MariaDB 10.11.14**. It is written for someone who is
still learning database administration, so every command is explained.

> The older `mysql/README_XAMPP.md` is kept for Windows/XAMPP users. This file
> is the guide for your Zorin computer.

---

## 1. Current status

| Item | Status |
|---|---|
| Operating system | Zorin OS (Ubuntu-based) |
| MariaDB server | 10.11.14-MariaDB, installed and running |
| Connection from this project | `127.0.0.1:3306` (reachable) |
| Database `schoolcare_db` | Created by the setup script below |
| Application database user | `schoolcare_user` (never `root`) |
| Driver used by Node.js | `mysql2` (already installed; compatible with MariaDB) |
| Existing demo data in `data/` | Preserved; used as the offline fallback |

SchoolCare uses **two storage layers**:

- **MariaDB** stores sign-in password hashes, student records (when the database
  is online), and a copy of every public admission application.
- **The JSON file** `data/schoolcare_db.json` remains the source of truth for
  attendance, health, finance, notifications, and the other modules. It is also
  the fallback when MariaDB is offline. Nothing in `data/` was deleted.

This is intentional: it keeps every existing feature working while adding MariaDB.

---

## 2. Check that MariaDB is running (in your terminal)

Type these commands in a normal terminal on your Zorin desktop. Your Linux
password will be requested by `sudo` — type it in the terminal, not in chat.

```bash
sudo systemctl status mariadb
sudo mariadb -e "SELECT VERSION();"
```

The second command should print something like `10.11.14-MariaDB`.

If the service is stopped, start it with:

```bash
sudo systemctl start mariadb
```

---

## 3. Create the database and application user

From the project folder, run:

```bash
cd /home/prince/Desktop/school
npm run db:setup
```

The script will:

1. Ask for your **Linux password** (so it can use `sudo`).
2. Ask you to type a **new database password** twice. Nothing is shown on screen
   while you type it. Use 12–128 letters, digits or `_ @ # % + = . -`.
   **Remember this password** — you will put it in `.env` in the next step.
3. Create `schoolcare_db` **only if it does not already exist**.
4. Create `schoolcare_user` for `localhost` and `127.0.0.1` **only if missing**.
5. Give that user only the permissions it needs **on `schoolcare_db.*`**:
   `SELECT, INSERT, UPDATE, DELETE, CREATE, ALTER, INDEX, REFERENCES`.
   No root access, no global privileges.

The script will **not** drop a database, drop a table, or change the password of
a user that already exists. If you see a message saying a user already exists
and you do not know its password, ask your administrator rather than resetting it.

---

## 4. Put the password in `.env`

A `.env` file already exists in the project (it is ignored by Git, so it will
never be committed). Open it and change only this line:

```ini
DB_PASSWORD="CHANGE_ME"
```

Replace `CHANGE_ME` with the password you typed in step 3. The other database
lines should look like this:

```ini
DB_HOST="127.0.0.1"
DB_PORT="3306"
DB_NAME="schoolcare_db"
DB_USER="schoolcare_user"
DB_PASSWORD="your-private-password"
DB_CONNECTION_LIMIT=10
DB_CONNECT_TIMEOUT_MS=5000
DB_QUEUE_LIMIT=10
```

Never put this password in source code, in `public/`, in a screenshot, or in chat.
The backend never sends it to the browser.

---

## 5. Import the schema (first time only)

```bash
npm run db:init
```

This imports the **existing** file `mysql/schoolcare_db.sql` and then applies the
three migrations in `mysql/migrations/`. It creates the school, roles, user
profiles, classes, students, guardians, attendance, health, finance tables,
audit log, admission tables, and staff governance tables, together with the
sample data from that file.

**Important safety rule:** the SQL dump contains `DROP TABLE IF EXISTS`
statements for its core tables. That is why the script first counts the tables in
`schoolcare_db`. If it finds **even one table**, it stops and changes nothing.

- If the database already has SchoolCare tables, use `npm run db:migrate` instead
  of `npm run db:init`.
- If a database you do not recognise is found, stop and investigate. Do not
  delete anything to make the import work.

Migration files live in `mysql/migrations/`. The migration runner records each
one in a table called `schema_migrations`, together with a checksum. If you edit
a migration that was already applied, the runner refuses to run it again and asks
you to review the situation manually. That prevents duplicate migrations.

`npm run db:migrate` and `npm run db:status` use `DB_USER` and `DB_PASSWORD` from
`.env`; they do **not** ask for root access or print the password. The migration
files are additive: they never drop a table, drop a column or delete a row.

`003_staff_governance.sql` adds the three staff roles, changes only the two
approved legacy account role values, and creates `staff_accounts`,
`staff_invitations` and `permission_grants`.

Useful read-only commands:

```bash
npm run db:status   # table count, migration history and staff table presence
npm run test:db     # verify roles, role assignments and staff governance schema
npm run db:backup   # make a compressed backup first (see section 8)
```

---

## 6. Test the connection

Without starting the web server:

```bash
npm run db:check
```

A successful result ends with `connected: yes` and shows the number of tables.
A failed result explains the problem in plain language and exits with an error
code. The password is never printed.

After starting SchoolCare, an administrator can also open:

```
http://localhost:3010/api/health/database
```

This endpoint requires an admin sign-in session. It returns only `ok`, `status`,
`engine`, `latencyMs`, `checkedAt`, and (when down) a generic error message. It
does not reveal the host, user, database name, or credentials. The older
`/api/mysql/status` endpoint is kept for the existing Settings page.

---

## 7. Start SchoolCare

```bash
npm run dev      # Express + React/Vite on http://localhost:3010
```

If port 3010 is busy, the server automatically tries 3000, 3011, 3012 or 3020
and prints the chosen address.

Production build:

```bash
npm run lint     # TypeScript check
npm test         # navigation/RBAC/API security checks
npm run test:db  # MariaDB schema and role checks
npm run build    # build the React client into dist/
npm run start    # serve the built app
```

### Signing in

Seeded accounts have **no password until you provision one**. In an interactive
terminal (no Windows administrator rights are needed on Linux), run:

```bash
npm run auth:provision-account
```

It lists the accounts in `user_profiles`, asks you to choose one, then asks for
an initial password twice **without showing what you type**. It stores only a
scrypt hash in `user_auth_credentials`. It will not overwrite an account that
already has a password.

Password-recovery email is not implemented. If a password is forgotten, an
administrator must use the local command above (or reset the hash deliberately).

---

## 8. Backup and restore

### Back up

```bash
npm run db:backup
```

This writes `backups/schoolcare_db_YYYYMMDD_HHMMSS.sql.gz` with file permissions
`0600`. The `backups/` folder is ignored by Git. Copy this file to safe external
storage. Do it before any manual database change.

### Restore safely (test database first)

Never restore directly over a live database. First check the backup by loading
it into a **separate** database:

```bash
sudo mariadb -e "CREATE DATABASE IF NOT EXISTS schoolcare_restore_test CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
gunzip -c backups/schoolcare_db_YYYYMMDD_HHMMSS.sql.gz | sudo mariadb schoolcare_restore_test
sudo mariadb -e "SHOW TABLES FROM schoolcare_restore_test;"
```

When you are satisfied the backup is good, restoring the real database is a
deliberate administrator action: stop SchoolCare, make a fresh backup, then
import into `schoolcare_db`. Do **not** use `DROP DATABASE`; the import can be
done into a freshly created, empty database instead. If you are unsure, stop and
ask someone experienced before continuing.

---

## 9. Common problems

| Symptom | Likely cause | What to do |
|---|---|---|
| `Access denied for user 'schoolcare_user'` | Wrong `DB_PASSWORD` in `.env`, or user missing | Check the password you chose; rerun `npm run db:setup`; run `npm run db:check` |
| `MariaDB is not accepting connections` | MariaDB service stopped | `sudo systemctl start mariadb` |
| `The configured database does not exist` | `schoolcare_db` was not created | `npm run db:setup` |
| `Sign-in requires MariaDB` | Password lookup could not reach the DB | Run `npm run db:check`; fix `.env`; restart the app |
| `Refusing to import the schema dump` | Database already has tables | Good — nothing was changed. Use `npm run db:migrate` or `npm run db:status` |
| `migration ... changed after it was applied` | A recorded migration file was edited | Do not re-run blindly; inspect the file and the `schema_migrations` table |
| App works but some modules show sample data | Those modules intentionally use the JSON fallback | This is expected in the hybrid setup; no data was lost |
| Port already in use | Another service holds 3010 | Let the server pick a fallback port, or change `PORT` in `.env` |

---

## 10. Quick command reference

| Command | Purpose |
|---|---|
| `npm run db:setup` | Create `schoolcare_db` and `schoolcare_user` (asks for sudo + DB password) |
| `npm run db:init` | Import schema into an empty database, then apply migrations |
| `npm run db:migrate` | Apply pending migrations to an existing database (backs up first) |
| `npm run db:status` | Show database and migration status (read-only) |
| `npm run db:backup` | Create a compressed, private backup |
| `npm run db:check` | Test the application's MariaDB connection from Node.js |
| `npm run auth:provision-account` | Set an initial password for an existing seeded account |
| `npm run dev` | Start the full-stack application |
