# Public School Website — Deployment & Administration Guide

This document covers the public website added to SchoolCare for **ES RUBENGERA RTB**, and how to deploy it safely. The existing private SchoolCare portal is unchanged.

## 1. How the two sites are separated

| Surface | URL | Authentication |
|---|---|---|
| Public school website | `/`, `/about`, `/academics`, `/news`, `/events`, `/apply`, `/gallery`, `/contact` | None |
| Sitemap / robots | `/sitemap.xml`, `/robots.txt` | None |
| Public content APIs | `/api/public/site`, `/api/public/news`, `/api/public/events`, `/api/public/gallery` | None; approved content only |
| Private SchoolCare portal | `/portal#/login`, `/portal#/dashboard`, etc. | Existing session login |
| Private APIs | `/api/students`, `/api/notifications`, `/api/attendance`, `/api/users`, … | Existing session + RBAC |
| Public content administration | `/api/admin/public-content/*` | Existing session + `school:write` permission |

The public website is rendered by `server/publicSite.ts` and reads **only** from `server/publicContent.ts` (`data/public_content.json`). That store contains approved news, announcements, events and gallery images only. It has no connection to student, parent, staff, finance, health, message or internal-report data.

Legacy private-portal bookmarks such as `/#/dashboard` are redirected to `/portal#/dashboard` by a small script in the public page header, so existing users are not disrupted.

## 2. Local verification

```bash
npm install
npm run lint
npm test                 # includes the public website regression suite
npm run build
npm start
```

Open:

- `http://localhost:3010/` — public homepage
- `http://localhost:3010/portal#/login` — existing SchoolCare login

The public website regression suite (`npm run test:public-site`) checks SEO metadata, public page access, approved-content filtering, sitemap/robots, the Login link, publishing/scheduling/unpublishing rules, photo approval, and that private APIs still return 401 without a session. It uses a temporary content directory, so it never changes `data/public_content.json` or uploaded photos.

## 3. Environment variables

Add these to `.env` (never commit `.env`):

```dotenv
# Public canonical origin — set this to your real HTTPS domain before going live.
PUBLIC_SITE_URL="https://school.example.rw"

# Existing application form URL used by the public Apply page.
APP_URL="https://school.example.rw"

NODE_ENV="production"
PORT="3010"
```

All other existing secrets (`DB_PASSWORD`, `GEMINI_API_KEY`, `SMS_API_KEY`, `WHATSAPP_ACCESS_TOKEN`, `SMTP_PASS`, `ADMISSION_TRACKING_SECRET`) must remain **server-side only**. Do not expose them to the browser and do not commit them.

`PUBLIC_SITE_URL` drives canonical URLs, Open Graph URLs, sitemap entries and JSON-LD. Leaving it unset produces `http://localhost:<PORT>`, which is fine for local testing but **must be changed before deployment**.

## 4. Recommended deployment architecture

```
Internet (HTTPS)
      │
      ▼
Reverse proxy (Nginx/Caddy)  ── TLS termination, rate limiting, security headers
      │
      ▼
Node/Express on 127.0.0.1:3010
   ├── /                 public school website (anonymous)
   ├── /portal#/...      private React SchoolCare portal (session required for data)
   └── /api/...          APIs (public allowlist only where intentional)
      │
      ├── MariaDB 10.11  credentials + private relational data
      └── data/          JSON store, admission documents, public_content.json, public-uploads/
```

Suggested Nginx server block (replace domain and paths):

```nginx
server {
    listen 80;
    server_name school.example.rw www.school.example.rw;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl http2;
    server_name school.example.rw www.school.example.rw;

    ssl_certificate     /etc/letsencrypt/live/school.example.rw/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/school.example.rw/privkey.pem;

    add_header X-Content-Type-Options nosniff always;
    add_header X-Frame-Options SAMEORIGIN always;
    add_header Referrer-Policy strict-origin-when-cross-origin always;

    location / {
        proxy_pass http://127.0.0.1:3010;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto https;
    }
}
```

Run Node behind a process manager (systemd, pm2 or equivalent) bound to localhost, keep MariaDB on a private network/socket, and restrict file permissions on `data/` to the service account.

## 5. Backups

The public website content is a small JSON file and uploaded images:

- `data/public_content.json` — approved news/events/gallery metadata
- `data/public-uploads/` — approved uploaded photographs

Include both in the existing backup routine:

```bash
npm run db:backup          # MariaDB dump
tar -czf public-site-backup.tgz data/public_content.json data/public-uploads
```

Store backups off-server with restricted permissions. Do not back up `.env` into a public location.

## 6. Managing public news, announcements and events

Sign in to the private portal with an account holding `school:write` (for example Headteacher or School Admin) and open **System → Public Website**. The page lets authorised staff create and edit articles, publish or unpublish them, schedule a future `publishAt` time, upload photographs and approve them for public display.

The same actions are available through the admin API if needed. Example using `curl` from the same machine:

```bash
# Create a draft
curl -X POST https://school.example.rw/api/admin/public-content/articles \
  -H 'Content-Type: application/json' \
  -b cookies.txt \
  -d '{
    "title": "School open day",
    "summary": "Families are invited to our annual open day.",
    "body": "Join us for classroom visits and a tour of the facilities.",
    "category": "EVENT",
    "status": "DRAFT",
    "approved": false,
    "eventDate": "2026-12-10T09:00:00Z",
    "location": "ES Rubengera RTB campus"
  }'

# Publish and approve it (only then does it appear publicly)
curl -X PATCH https://school.example.rw/api/admin/public-content/articles/<article-id> \
  -H 'Content-Type: application/json' -b cookies.txt \
  -d '{"status":"PUBLISHED","approved":true,"publishAt":"2026-11-20T08:00:00Z"}'
```

Rules enforced by the backend:

- `status` must be `PUBLISHED` **and** `approved` must be `true` to appear publicly.
- `publishAt` in the future schedules the announcement; it appears automatically at that time.
- Anonymous users cannot read drafts or internal records.
- `GET /api/public/news`, `/api/public/events` and the rendered pages return only a fixed public DTO. Internal fields (`status`, `approved`, `createdBy`, `publishAt`) are never returned.

### Uploading an approved photograph

```bash
curl -X POST https://school.example.rw/api/admin/public-content/gallery/upload \
  -b cookies.txt \
  -F 'image=@campus.jpg' \
  -F 'alt=Students working in the school library' \
  -F 'caption=Reading time in the library' \
  -F 'category=Facilities'
```

The image starts **unapproved**. Approve it with:

```bash
curl -X PATCH https://school.example.rw/api/admin/public-content/gallery/<image-id>/approval \
  -H 'Content-Type: application/json' -b cookies.txt \
  -d '{"approved":true}'
```

Only JPG, PNG, WEBP and GIF files up to 5 MB are accepted, with magic-byte validation. Descriptive alt text is required. Do not upload photos that identify individual learners without proper authorization.

## 7. Privacy guarantees

- No public endpoint reads `data/schoolcare_db.json`, the `students`, `guardians`, `attendance_records`, `health_incidents`, `invoices`, `payments`, `user_profiles`, `user_auth_credentials`, `audit_logs`, or admissions tables.
- `POST /api/public/admissions/*` remains unchanged and never returns applicant personal data.
- Private APIs still require a session and the existing role/permission checks.
- The public pages intentionally omit staff names, student names, results, attendance, medical details, finances and internal reports.

## 8. Connecting a domain

1. Point DNS for `school.example.rw` (and `www`) to the server's public IP with an `A` record.
2. Issue a TLS certificate (for example `certbot --nginx -d school.example.rw -d www.school.example.rw`).
3. Set `PUBLIC_SITE_URL` and `APP_URL` to `https://school.example.rw` and restart the app.
4. Confirm `https://school.example.rw/` shows the public site and `https://school.example.rw/portal#/login` shows the existing login page.
5. Confirm `https://school.example.rw/sitemap.xml` uses `https://` URLs.

## 9. Google Search Console (after deployment)

Google indexing is not immediate; these steps prepare the site and request indexing.

1. Go to <https://search.google.com/search-console> and add the property `https://school.example.rw`.
2. Verify ownership using the DNS TXT record method (recommended), or add the uniquely named HTML verification file that Google gives you to `public/`, rebuild and confirm `https://school.example.rw/google<verification-code>.html` returns HTTP 200.
3. Open **Sitemaps**, enter `sitemap.xml`, and submit.
4. Use **URL Inspection** on the homepage, then click **Request indexing**. Repeat for key pages such as `/apply` and `/contact`.
5. Check **Pages** after a few days for crawl errors and confirm canonical URLs are correct.
6. Ensure the site is reachable over HTTPS, returns HTTP 200, and is not blocked by `robots.txt` (it currently allows all).

## 10. Remaining deployment requirements

- A registered domain and DNS control.
- TLS certificate and HTTPS reverse proxy.
- A production MariaDB instance with restricted network access and regular backups.
- A process manager/service unit for the Node application.
- Off-server backup storage for `data/`, including `data/public_content.json` and `data/public-uploads/`.
- Real, authorized school photographs added through the admin upload flow (the current gallery uses illustrative SVGs).
- Review of all public copy by school leadership before going live, especially leadership and application wording.
