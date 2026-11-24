# SchoolCare — Production Deployment Preparation

This document prepares the **existing** SchoolCare application for online deployment. It does **not** deploy anything, purchase services, change DNS, or expose private data.

Target domain (not verified as purchased/configured): `esrubengera.com` (with `www.esrubengera.com`).

---

## 1. Architecture that will be deployed

```
Internet (HTTPS, port 443)
   │
   ▼
Reverse proxy (Nginx or Caddy) — TLS termination, HTTP→HTTPS redirect,
rate limiting, static-file limits, security headers
   │  http://127.0.0.1:3010
   ▼
Node.js / Express (tsx runtime) + built React bundle (dist/)
   │
   ├── MariaDB 10.11+  (credentials, relational mirrors, admissions)
   └── data/           (authoritative JSON store, public content, uploads)
```

**Important:** the application's primary runtime store for most modules is `data/schoolcare_db.json`. MariaDB is required for sign-in (`user_auth_credentials`) and mirrors several modules, but it is **not yet a complete replacement** for the JSON store. Backups and any future horizontal scaling must account for this.

### Compatibility

- Node.js 22+ (verified locally on Node 26.13.1).
- MariaDB 10.3+ / MySQL 5.7+ (verified against local MariaDB, 48 tables).
- Single Node process is currently required: sessions are held in memory.
- The app serves both the public website (`/`, `/about`, `/apply`, …) and the private portal (`/portal#/login`) from one Express process.

---

## 2. Pre-deployment checklist (must be completed by the owner)

| # | Task | Status |
|---|---|---|
| 1 | Domain `esrubengera.com` purchased and DNS controlled | **BLOCKED — verify** |
| 2 | Server/VPS with a public IPv4 address, SSH access and firewall | **BLOCKED — provision** |
| 3 | TLS certificate (Let's Encrypt or commercial) | **BLOCKED — provision** |
| 4 | MariaDB installed, bound to `127.0.0.1`, with a dedicated app user | **BLOCKED — provision** |
| 5 | Long random values generated for `DB_PASSWORD` and `ADMISSION_TRACKING_SECRET` | **BLOCKED — generate** |
| 6 | SMTP/SMS/WhatsApp credentials only if those notifications are wanted | NEEDS DECISION |
| 7 | School approves which demo/seed accounts remain active and provisions passwords | NEEDS DECISION |
| 8 | Decision on session durability (see §9) | NEEDS DECISION |
| 9 | DNS A/AAAA records pointed to the server **after** the app is verified | **BLOCKED — approval required** |

---

## 3. Server preparation

```bash
# Example for Debian/Ubuntu
sudo apt update
sudo apt install -y nodejs npm mariadb-server nginx certbot python3-certbot-nginx
sudo systemctl enable --now mariadb nginx
sudo mysql_secure_installation
```

Create the database and a least-privilege user (run interactively as a MariaDB admin):

```sql
CREATE DATABASE IF NOT EXISTS schoolcare_db
  CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER IF NOT EXISTS 'schoolcare_user'@'127.0.0.1' IDENTIFIED BY '<long-random-password>';
GRANT SELECT, INSERT, UPDATE, DELETE, CREATE, INDEX, ALTER, REFERENCES
  ON schoolcare_db.* TO 'schoolcare_user'@'127.0.0.1';
FLUSH PRIVILEGES;
```

`CREATE`/`ALTER` are needed only for the additive migration runner and the credential table bootstrap; remove them after all migrations are applied if you want stricter privileges.

---

## 4. Application installation

```bash
sudo mkdir -p /opt/schoolcare
sudo chown -R $USER:$USER /opt/schoolcare
cd /opt/schoolcare
git clone <your-private-repository-url> .
npm ci --omit=dev        # tsx is a production dependency (required by npm start)
npm run build            # produces dist/
```

Copy and edit `.env` (never commit it):

```bash
cp .env.example .env
chmod 600 .env
nano .env
```

Production values:

```dotenv
NODE_ENV="production"
APP_URL="https://esrubengera.com"
PUBLIC_SITE_URL="https://esrubengera.com"
PORT=3010
# Set to 1 only when Node is behind exactly one trusted Nginx/Caddy hop.
TRUST_PROXY=1

DB_HOST="127.0.0.1"
DB_PORT="3306"
DB_NAME="schoolcare_db"
DB_USER="schoolcare_user"
DB_PASSWORD="<long-random-password>"
DB_CONNECTION_LIMIT=10
DB_CONNECT_TIMEOUT_MS=5000
DB_QUEUE_LIMIT=10

ALLOW_DEMO_RESET="false"
# REQUIRED in production, minimum 32 characters. Generate with: openssl rand -hex 32
ADMISSION_TRACKING_SECRET="<long-random-secret-64-chars>"
ADMISSION_UPLOAD_DIR="/var/lib/schoolcare/admission-documents"
```

Production startup **fails closed** if `NODE_ENV=production` and `ADMISSION_TRACKING_SECRET` is missing or shorter than 32 characters. Do not reuse the development fallback.

Leave notification secrets empty until the corresponding gateway is configured; the application does not simulate deliveries.

**Security cookie note:** `NODE_ENV=production` marks the session cookie `Secure`. It must be served over HTTPS; do not set `NODE_ENV=production` on a plain-HTTP test host.

---

## 5. Database setup, migrations and verification

```bash
npm run db:check          # connection, tables, engine
npm run db:status         # migration ledger
npm run db:migrate        # FULL BACKUP first, then additive migrations
npm run test:db           # schema and migration assertions
```

`npm run db:migrate` always runs `scripts/full-backup.sh` first; `npm run db:migrate:safe` is retained as an alias. All shipped migrations are additive; none drops tables, columns or data. If a future migration contains `DROP`, `TRUNCATE` or destructive `UPDATE`, **stop and obtain explicit approval** before running it.

Seed passwords are not stored in the repository. Provision each real account with:

```bash
npm run auth:provision-account
```

---

## 6. Backup and restore

### Backup

```bash
npm run db:backup
```

This creates two artifacts in `backups/` (permissions `0600`):

- `schoolcare_db_<timestamp>.sql.gz` — MariaDB dump (schema + data).
- `schoolcare-full-<timestamp>.tar.gz` — authoritative `data/schoolcare_db.json`, public content and uploads.

Copy both off-server to separate storage. A MariaDB dump alone is **not** sufficient.

### Restore

```bash
# 1. Stop the application so nothing writes during restore.
sudo systemctl stop schoolcare

# 2. Restore MariaDB into an EMPTY database. The generated dump is additive
#    (CREATE TABLE IF NOT EXISTS + INSERT); it never issues DROP TABLE.
gunzip -c backups/schoolcare_db_<timestamp>.sql.gz | mysql -u schoolcare_user -p schoolcare_db

# 3. Restore the JSON store and uploads.
# The archive contains a top-level schoolcare-<stamp>/data/ directory.
tar -xzf backups/schoolcare-full-<timestamp>.tar.gz -C /tmp
cp /tmp/schoolcare-<stamp>/data/schoolcare_db.json data/schoolcare_db.json
cp /tmp/schoolcare-<stamp>/data/public_content.json data/public_content.json
cp -a /tmp/schoolcare-<stamp>/data/public-uploads/. data/public-uploads/
# Only if admission uploads were configured outside the project directory:
cp -a /tmp/schoolcare-<stamp>/data/admission-documents/. /var/lib/schoolcare/admission-documents/

# 4. Restart and verify.
sudo systemctl start schoolcare
curl -fsS https://esrubengera.com/api/health
npm run db:check
```

Test the restore procedure on a staging copy before relying on it.

Schedule a daily backup with `cron`, e.g. `0 2 * * * cd /opt/schoolcare && npm run db:backup >> /var/log/schoolcare-backup.log 2>&1`.

---

## 7. Process management (systemd)

```ini
# /etc/systemd/system/schoolcare.service
[Unit]
Description=SchoolCare
After=network.target mariadb.service
Requires=mariadb.service

[Service]
Type=simple
User=schoolcare
WorkingDirectory=/opt/schoolcare
EnvironmentFile=/opt/schoolcare/.env
ExecStart=/usr/bin/npm start
Restart=on-failure
RestartSec=5
TimeoutStopSec=15

[Install]
WantedBy=multi-user.target
```

```bash
sudo useradd --system --home /opt/schoolcare --shell /usr/sbin/nologin schoolcare
sudo chown -R schoolcare:schoolcare /opt/schoolcare/data /opt/schoolcare/backups /var/lib/schoolcare
sudo systemctl daemon-reload
sudo systemctl enable --now schoolcare
sudo journalctl -u schoolcare -f
```

The Node process currently binds to `0.0.0.0:3010`, not loopback. Do not expose port 3010 publicly: restrict it at the firewall or security group so only the reverse proxy can reach it, and terminate HTTPS at Nginx. If loopback-only binding is required, add a `HOST` setting to the server and bind it to `127.0.0.1`.

---

## 8. Nginx + HTTPS

```nginx
server {
    listen 80;
    server_name esrubengera.com www.esrubengera.com;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl http2;
    server_name esrubengera.com www.esrubengera.com;

    ssl_certificate     /etc/letsencrypt/live/esrubengera.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/esrubengera.com/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;

    add_header X-Content-Type-Options nosniff always;
    add_header X-Frame-Options SAMEORIGIN always;
    add_header Referrer-Policy strict-origin-when-cross-origin always;
    add_header Permissions-Policy "camera=(), microphone=(), geolocation=()" always;

    client_max_body_size 6m;

    location / {
        proxy_pass http://127.0.0.1:3010;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto https;
    }
}
```

```bash
sudo certbot --nginx -d esrubengera.com -d www.esrubengera.com
sudo nginx -t && sudo systemctl reload nginx
```

DNS (only after approval): A record `esrubengera.com` and `www` → server IPv4; optionally AAAA → IPv6. Add SPF/DKIM/DMARC if school email is sent from the domain.

---

## 9. Known deployment constraints requiring a decision

1. **Sessions are in-memory.** Server restarts invalidate all sessions; multiple Node instances would not share logins. Deployment must use one instance until persistent sessions are implemented. If high availability is required, this is **BLOCKED**.
2. **JSON store is authoritative for most modules.** MariaDB-only failover/restore loses data. Single-node deployment with full backups is required. Migrating fully to MariaDB is a separate project.
3. **Password self-service reset is not implemented.** `/api/auth/password-reset/request` returns HTTP 503 with an honest message. Password changes are handled by an administrator via `npm run auth:provision-account`.
4. **Login rate limiting is per-process** (5 attempts / 15 min, keyed by IP and account email). Set `TRUST_PROXY=1` behind one reverse proxy hop so client IPs are preserved. A shared persistent limiter/WAF is still required for multi-instance or high-risk deployments.
5. **Online parent self-payment is disabled.** `/api/portal/payments` returns HTTP 503. Parents pay through the bursar/bank/MTN/Airtel and staff record the official receipt; no payment-provider callback is wired.
6. **Frontend bundle is ~1.35 MB** (363 kB gzipped). Acceptable for a first launch; code-splitting is a safe later optimization.
7. **Admission settings are global.** `admission_settings` has no `school_id`; the live single-school deployment is unaffected, but adding a second school requires a reviewed data migration before exposing public admissions to both. **NEEDS ATTENTION.**
8. **Database governance is incomplete.** The app DB user still has `CREATE/ALTER/INDEX/REFERENCES` for migrations and runtime credential bootstrapping. Live data has no FK orphans and all 9 migration checksums match, but duplicate `005_*` prefixes, admission-table column/index drift, missing school-scoped unique keys/FKs, 4 stale `classes.student_count` values and 2 non-seed student rows require owner review. **NEEDS ATTENTION — no destructive or DDL changes were made during this audit.**
9. **Public signup verification script was not run.** The dedicated `schoolcare_signup_test` database does not exist and `schoolcare_user` lacks `CREATE DATABASE`; the script refuses to run against the live database. **NOT TESTED.**
10. **Report PDFs use a client-side renderer.** Pagination/truncation of very long comments and non-ASCII glyph fidelity were not exhaustively verified across all browsers. Print HTML uses the same data model. **NOT TESTED** for extreme content.
11. **Demo reset is now hard-disabled in production** even if `ALLOW_DEMO_RESET=true` is set accidentally. Generated sign-in emails are still predictable from phone/admission number (passwords remain required). Raw staff invitation tokens are still returned to privileged callers when created. **NEEDS ATTENTION** for token hygiene.
12. **Same-origin checks on public forms allow a missing `Origin` header and use `Host` as part of the allowlist.** Cookie-authenticated admin routes are unaffected and sessions use `SameSite=Lax`. Tightening this is a recommended follow-up. **NEEDS ATTENTION.**
13. **A new untracked AI helper module (`server/ai/`) appeared during final verification.** Its TypeScript errors were corrected so `npm run lint` passes, but it is not yet wired into the API and was not functionally exercised. Wiring it in later requires its own authorization and data-scope review. **NOT TESTED.**

---

## 10. Post-deployment verification checklist

```bash
curl -fsS https://esrubengera.com/api/health          # {"status":"ok",...}
curl -fsS https://esrubengera.com/                    # public site
curl -s -o /dev/null -w '%{http_code}\n' https://esrubengera.com/api/students   # expect 401
npm run lint && npm run build && npm run db:check && npm run test:api && npm run test:headteacher && npm run test:navigation
```

Manual checks:

- [ ] Login with a provisioned account; confirm the role-specific dashboard.
- [ ] Refresh the page — the session survives.
- [ ] Logout — protected pages redirect to login.
- [ ] Headteacher cannot see another school's students (if a second school exists).
- [ ] Teacher sees only assigned classes/subjects.
- [ ] Parent sees only linked children; student sees only their own record.
- [ ] Marks entry → submit → approve → generate → publish → parent view.
- [ ] Unapproved results are absent from published reports.
- [ ] Report card PDF/print uses the school logo and A4 layout.
- [ ] Admissions form submit + tracking code + admin review.
- [ ] Uploaded documents are not publicly downloadable without authorization.
- [ ] Confirm backups appear off-server and a restore was rehearsed.
- [ ] Browser console has no errors on the main dashboards.

---

## 11. Verification evidence from this audit

All commands were run locally against the existing working tree; no deployment, DNS change, purchase, commit, revert or destructive database operation was performed. These figures are historical audit evidence. Current verified results are in [`docs/SCHOOLCARE_TEST_REPORT.md`](./docs/SCHOOLCARE_TEST_REPORT.md); the aggregate `npm test` command is no longer recommended on live data because it includes mutating suites.

| Check | Result |
|---|---|
| `npm run lint` | PASS |
| `npm run build` | PASS (one >500 kB chunk warning) |
| `npm test` | 14 suites / 569 checks PASS (log: `/tmp/opencode/schoolcare-tests-final4.log`) |
| `npm run test:db` | 12/12 PASS |
| `npm audit --omit=dev` | 0 vulnerabilities |
| `npm run db:check` / `db:status` | connected; 48 tables; 9 migrations recorded |
| `gzip -t` + `tar -tzf` on newest backups | OK |
| Production secret guard probe | fails closed without `ADMISSION_TRACKING_SECRET`; starts with a valid 64-char secret |
| `DB_DATABASE=schoolcare_signup_test npm run test:signup:init` | NOT TESTED — isolated database absent and app user lacks `CREATE DATABASE` |

Backup artifacts retained (not replaced or deleted): `backups/schoolcare_db_2026-11-22T17-44-06-137Z.sql.gz`, `backups/schoolcare-full-20261122T180750Z.tar.gz`, `backups/schoolcare_db_2026-11-22T18-11-39-070Z.sql.gz`. Older dumps made before the backup-script fix still contain `DROP TABLE`; restore only into an empty database and keep the artifacts.

### Fixes included in this working tree

- Production dependency/build fixes (`tsx` in `dependencies`, explicit `NODE_ENV`, `TRUST_PROXY`, HMAC secret guard).
- Hardening: hidden `X-Powered-By`, 10 MB urlencoded limit, global security headers and HSTS, public JSON health probe, explicit `PORT` conflict error, safe file streaming, final Express error handler.
- Auth/security: IP+path signup limiter, IP+email login limiter, masked signup status and resend responses, malformed credential hashes fail closed, demo reset disabled in production, `/api/mysql/export` super-admin only, sanitized `/api/mysql/status`, non-super-admin UI hides export/template.
- Finance/health integrity: parent self-payment returns 503, staff payments validate school/student/invoice/balance/reference, no fabricated vitals, linked guardian required for health alerts, cross-school acknowledgement blocked.
- Academics/report cards: all-EXCUSED marks incomplete, failed SUBMIT restores marks, comment requirement enforced, signature filtered by year, per-student attendance on generated/printed report cards, qualitative fields preserved on regeneration.
- Multi-school: combination mirror cleans stale links, two-school isolation tests extended to 17 checks, school settings updates whitelisted to editable fields, admissions tab RBAC aligned with backend roles.
- Migration tooling: `db:migrate` always takes a full backup first; helper enforces `NNN_description.sql` and numeric ordering, warns about the two already-applied `005_*` files; no applied migration was edited.
