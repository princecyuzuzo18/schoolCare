# Gemini API setup for SchoolCare AI Assistant

This guide configures the **existing** SchoolCare AI Assistant with a free-tier-friendly Google Gemini model. No new app, no paid billing, and no production/DNS changes are required.

---

## 1. Get a Gemini API key

1. Open [Google AI Studio](https://aistudio.google.com/) and sign in with the Google account for your school project.
2. Choose **Get API key** (or **API keys** in the left navigation) and create/select a key for the project.
3. Copy the key locally. Do **not** paste it into chat, source files, documentation, or the browser.

Google’s key may start with `AIza...` or a newer prefix such as `AQ.A...`. SchoolCare accepts both; only the server validates it with Google.

---

## 2. Verify free-tier eligibility (manual account check)

Google documents the Free tier as having limited model access, and actual limits are **per project**. Before going live:

1. In AI Studio, open **Rate limits** (or visit `https://aistudio.google.com/rate-limit`).
2. Select your project and confirm the tier shows **Free** (not Tier 1/2/3 and no linked billing account was added).
3. Confirm `gemini-3.5-flash-lite` is listed as available for that project.
4. Note the displayed **RPM** and **RPD** values and set `AI_RATE_LIMIT_PER_HOUR` below your project’s hourly equivalent.

SchoolCare currently defaults to `gemini-3.5-flash-lite`, which is present in Google’s current model documentation and in the live API model list. This was verified on 2026-11-23, but your project’s free-tier eligibility must be checked in your own AI Studio account. If it is not listed there, choose another model that is listed under Free and update `GEMINI_MODEL`.

---

## 3. Configure `.env`

Add or update these variables in the server `.env` file:

```dotenv
GEMINI_API_KEY="your_actual_api_key"
AI_PROVIDER="gemini"
GEMINI_MODEL="gemini-3.5-flash-lite"
AI_MODEL="gemini-3.5-flash-lite"
AI_ENABLED="true"
AI_DEFAULT_LANGUAGE="en"
AI_TIMEOUT_MS="25000"
AI_RATE_LIMIT_PER_HOUR="60"
AI_RETENTION_DAYS="180"
```

Variable rules:

- `GEMINI_API_KEY` — server-only secret; never exposed to the browser or returned by an API.
- `AI_PROVIDER` — only `gemini` is implemented. An unsupported value disables the assistant instead of silently switching providers.
- `GEMINI_MODEL` — preferred model setting. This wins over `AI_MODEL`.
- `AI_MODEL` — legacy fallback used only when `GEMINI_MODEL` is empty.
- `AI_ENABLED=false` — disables chat without deleting the key.
- `AI_RATE_LIMIT_PER_HOUR` — SchoolCare’s own per-user, per-school limit. Keep it below Google’s project quota.

`.env` is ignored by Git. Never commit it. `.env.example` contains placeholders only.

Restart the backend after changing any environment variable:

```bash
npm run dev
```

---

## 4. Database check

The AI tables are additive. If not already applied:

```bash
npm run db:migrate   # creates a full backup first
npm run db:status    # must list 009_ai_assistant and 010_ai_message_order
```

This does not replace the existing SchoolCare database.

---

## 5. Test the connection

### Offline suite (no API key or quota used)

```bash
npm run test:ai
```

This uses a test-only generator hook and verifies RBAC, school isolation, parent/student scope, prompt-injection defenses, conversation memory, rate limits, audit logging, and provider error mapping. It never calls Google.

### Real connection test (uses your key and quota)

```bash
npm run test:gemini
```

This prints only: provider, model, model source, whether a key is configured, whether the model appears in the live API model list, and a short model reply. It never prints the key. A passing run ends with:

```text
RESULT: WORKING - the configured key and model answered successfully.
```

A failing run reports a safe code such as `QUOTA_EXCEEDED`, `INVALID_KEY`, `NETWORK_ERROR`, `MODEL_UNAVAILABLE`, or `UNAVAILABLE`.

---

## 6. How the API works

All routes are behind SchoolCare’s existing session middleware:

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/api/ai/status` | Provider, model, availability, limits, suggestions |
| `GET/PUT` | `/api/ai/settings` | School settings (admin roles only) |
| `GET/POST` | `/api/ai/conversations` | List / create conversations |
| `GET/DELETE` | `/api/ai/conversations/:id` | Read / delete an owned conversation |
| `POST` | `/api/ai/chat` | Send a question and receive a grounded answer |
| `POST` | `/api/ai/regenerate` | Regenerate an assistant message in place |
| `POST` | `/api/ai/feedback` | Helpful / not-helpful feedback |
| `GET/POST/PATCH/DELETE` | `/api/ai/knowledge` | Official document management |
| `GET` | `/api/ai/usage` | Usage and error statistics |
| `POST` | `/api/ai/maintenance/purge` | Retention purge |

Identity, role, and school always come from `req.user`. Browser-supplied `schoolId`, `userId`, or `role` values are ignored for chat. Gemini receives only sanitized, authorized facts and official-document excerpts as tagged data; it cannot call tools, run SQL, or perform writes.

---

## 7. Monitor free-tier usage

1. Open the **Rate limits** page in AI Studio and select your project.
2. Watch requests per minute, requests per day, and token usage.
3. In SchoolCare, open **AI Assistant → Settings** to see service status, configured model, usage statistics, and recorded error codes.
4. `GET /api/ai/usage?days=30` returns admin-only aggregates, including `QUOTA_EXCEEDED` counts.

SchoolCare also enforces its own `AI_RATE_LIMIT_PER_HOUR`; a user can be limited before Google’s quota is reached.

---

## 8. Troubleshooting

| Symptom | Cause | What to do |
| --- | --- | --- |
| `NOT_CONFIGURED` / “unavailable” | Key missing or placeholder | Set a real `GEMINI_API_KEY` on the server and restart |
| `INVALID_KEY` | Google rejected the key | Check the key in AI Studio; do not expose it in the browser |
| `QUOTA_EXCEEDED` | Free-tier quota or project RPM/RPD reached | Wait for renewal, review AI Studio limits, or lower `AI_RATE_LIMIT_PER_HOUR` |
| `MODEL_UNAVAILABLE` | Model retired or not enabled for the project | Choose a model listed under Free for your project and set `GEMINI_MODEL` |
| `UNAVAILABLE` | Temporary Google capacity/503 error | Retry briefly; the provider already makes one bounded retry |
| `NETWORK_ERROR` | Server cannot reach Google | Check outbound HTTPS/DNS/firewall; do not change API keys |
| `TIMEOUT` | Provider exceeded `AI_TIMEOUT_MS` | Increase the timeout within allowed limits or retry |

No error response includes the API key, system instruction, database credentials, or raw upstream body.

---

## 9. Change models safely

1. In AI Studio, confirm the replacement model is available under **Free** for your project.
2. Set `GEMINI_MODEL` to the exact model code, for example `gemini-3.5-flash-lite`.
3. Keep `AI_MODEL` set to the same value as a fallback.
4. Restart the backend.
5. Run `npm run test:gemini`.
6. Run `npm run test:ai` to confirm no behaviour or security regression.

Never point `GEMINI_MODEL` at a Preview, Pro, or paid-only model unless you have explicitly decided to use paid billing. SchoolCare will not switch models automatically.

---

## 10. Manual steps still required by you

- Confirm in your own AI Studio account that the selected model is listed under **Free** and note your project’s RPM/RPD.
- Keep billing unlinked if you want to remain on the free tier.

Everything else is implemented in the repository and can be tested locally.
