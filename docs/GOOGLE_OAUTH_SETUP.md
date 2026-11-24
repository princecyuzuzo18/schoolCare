# Google sign-in / sign-up for SchoolCare

Google sign-in is **optional**. It is hidden on the login page until a real Google OAuth client is configured. It supports both returns and new accounts:

- Existing email → signed straight into its existing role and dashboard.
- New, verified Google email → a `PARENT` account is created immediately in the first configured school. No admin approval step (this was the requested behavior). Privileged roles are never created this way; use staff invitations for those.

## 1. The Authorized redirect URI

This is the URL Google must redirect back to. In Google Cloud Console it is called an **Authorized redirect URI** (not the homepage URL).

Local development:

```text
http://localhost:3010/api/auth/google/callback
```

Production (replace with your real origin):

```text
https://esrubengera.com/api/auth/google/callback
```

The value sent to Google is `GOOGLE_REDIRECT_URI` in `.env`. If you leave it unset, the server derives it from `APP_URL` (or `http://localhost:PORT`).

## 2. Google Cloud Console steps

1. Open https://console.cloud.google.com/apis/credentials.
2. Create (or select) a project.
3. Configure the **OAuth consent screen** → User Type: External (or Internal for a school Workspace domain) → add the `openid`, `email`, and `profile` scopes → add test users while in Testing.
4. **Create credentials → OAuth client ID → Application type: Web application.**
5. Under **Authorized redirect URIs**, click *Add URI* and paste the exact URI from section 1. Trailing slashes matter.
6. Copy the **Client ID** and **Client secret**.

## 3. Configure `.env`

```dotenv
APP_URL="http://localhost:3010"
GOOGLE_CLIENT_ID="your-client-id.apps.googleusercontent.com"
GOOGLE_CLIENT_SECRET="your-client-secret"
GOOGLE_REDIRECT_URI="http://localhost:3010/api/auth/google/callback"
```

Restart the server (`npm run dev`). The **Continue with Google** button appears on the login page automatically.

Verify without a browser:

```bash
npm run test:oauth
```

## 4. How it stays safe

- `state` is a 32-byte random value checked against an `HttpOnly; SameSite=Lax` cookie in constant time; mismatches are rejected.
- The authorization code is exchanged server-side; the ID token is verified with Google's `tokeninfo` endpoint, including `aud`, `email_verified`, and expiry checks.
- Tokens and secrets are never logged, returned to the browser, or stored in the database.
- The callback issues the app's normal `schoolcare_session` cookie and redirects to the server-authoritative role dashboard (`/portal#/<dashboard>`).
- New accounts get a random, unguessable password hash so password login cannot be used until an administrator issues a real one.

## 5. Troubleshooting

| Symptom | Fix |
| --- | --- |
| Button does not appear | `GOOGLE_CLIENT_ID` or `GOOGLE_CLIENT_SECRET` is still a placeholder, or the server was not restarted. |
| `redirect_uri_mismatch` | The URI in `.env` must exactly match an Authorized redirect URI in Google Cloud. |
| `403: access_denied` | Add your Google account as a test user on the OAuth consent screen. |
| Redirected to login with an error | Check the server console for `[OAuth]`; raw provider details are intentionally not shown to users. |
