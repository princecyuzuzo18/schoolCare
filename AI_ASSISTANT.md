# SchoolCare AI Assistant

A role-aware, bilingual (English / Ikinyarwanda) assistant embedded in SchoolCare. It answers general educational questions and school-specific questions using **only** verified data that the backend is allowed to give the authenticated user. It never invents records, never exposes secrets, and never performs writes.

---

## 1. What is included

- Floating launcher on every authenticated page, plus a contextual “Ask AI about this page” button.
- Full-page assistant at `AI Assistant` in the navigation (all 12 roles).
- Chat / Knowledge Base / Settings tabs, with the latter two restricted by role.
- Conversation list, new chat, delete chat, follow-up questions, copy, regenerate, and thumbs up/down feedback.
- English/Kinyarwanda auto-detection and a manual language selector.
- Source citations for database facts and official documents.
- Optional Smart Insights for authorized administrators, built only from verified backend aggregates.
- Loading, unavailable, rate-limited, quota-exceeded, and error states — no fabricated answers.
- Per-user/per-school rate limiting, retention purge, and audit logging.

---

## 2. Configuration

Copy `.env.example` to `.env` and set the AI section. Two providers are supported: **OpenAI** and **Gemini**.

```dotenv
# OpenAI (recommended)
AI_PROVIDER="openai"
OPENAI_API_KEY="sk-proj-..."           # placeholder = assistant unavailable
OPENAI_MODEL="gpt-4.1-mini"            # optional; e.g. gpt-4.1, gpt-5-mini, gpt-5

# Gemini (alternative — uncomment and comment out the OpenAI lines above)
# AI_PROVIDER="gemini"
# GEMINI_API_KEY="MY_GEMINI_API_KEY"
# GEMINI_MODEL="gemini-3.5-flash-lite"  # preferred; wins over AI_MODEL
# AI_MODEL="gemini-3.5-flash-lite"      # legacy fallback

AI_ENABLED="true"
AI_DEFAULT_LANGUAGE="en"              # en or rw
AI_TIMEOUT_MS="25000"
AI_RATE_LIMIT_PER_HOUR="60"
AI_RETENTION_DAYS="180"
```

See [`docs/GEMINI_SETUP.md`](./docs/GEMINI_SETUP.md) for Gemini setup. To verify the OpenAI key and model, run `npm run test:openai` (makes a small live request).

Rules:

1. The key matching `AI_PROVIDER` must be real: `OPENAI_API_KEY` for `openai`, `GEMINI_API_KEY` for `gemini`. Placeholders and short/invalid values are rejected.
2. The key is read **only on the server**. It is never sent to the browser or stored in the database.
3. `AI_ENABLED=false` or a missing/invalid key makes `/api/ai/chat` return HTTP 503 with `code: DISABLED` or `code: NOT_CONFIGURED`. The UI shows an “unavailable” state. It never fakes a reply.
4. For OpenAI, `OPENAI_MODEL` defaults to `gpt-4.1-mini`; for Gemini, `GEMINI_MODEL` wins over the legacy `AI_MODEL` fallback. A stale model override from the other provider is ignored when switching providers. The installed SDKs are `openai` and `@google/genai`.
5. Values are read at request time, so changing `.env` requires a server restart.

### Database migration

The assistant stores conversations, messages, feedback, usage, settings, and knowledge documents in additive MariaDB tables. Run once before using the feature:

```bash
npm run db:migrate     # takes a full backup first
npm run db:status      # must list 009_ai_assistant and 010_ai_message_order
```

The JSON runtime store remains authoritative for SchoolCare application data; the AI tables are independent and are never used to override it.

---

## 3. Roles and permission model

All 12 roles can use the chat:

`SUPER_ADMIN`, `SCHOOL_ADMIN`, `HEAD_TEACHER`, `DEPUTY_HEAD`, `TEACHER`, `NURSE`, `ACCOUNTANT`, `DISCIPLINE_OFFICER`, `SCHOOL_IT`, `ANIMATEUR`, `PARENT`, `STUDENT`.

Identity, role, and school always come from the server session (`req.user`) — never from the request body or browser. A browser-supplied `schoolId`, `role`, or `userId` is ignored for chat. `SUPER_ADMIN` may target an explicit existing school **only** for settings and knowledge administration; chat is always confined to the actor’s own `schoolId`.

| Area | Allowed roles |
| --- | --- |
| Chat and conversations | All 12 roles |
| Knowledge upload/edit/archive/delete | `SUPER_ADMIN`, `SCHOOL_ADMIN`, `HEAD_TEACHER`, `DEPUTY_HEAD` |
| AI settings and usage/retention | `SUPER_ADMIN`, `SCHOOL_ADMIN`, `HEAD_TEACHER` |

Data scope highlights:

- **Parent**: only linked children, and only published report cards.
- **Student**: only their own published report cards.
- **Teacher**: assigned classes only (class-subject and class-teacher assignments), never other classes.
- **Finance**: only users with `finance.read`; teachers and parents never receive invoice/payment facts.
- **Leadership**: school-wide aggregates, still strictly inside their own school.
- **Nurse / Discipline / IT / Animateur**: guidance and drafts, with no access to records outside their permission set.

---

## 4. Safety design

- Deterministic backend intent detection selects a small, authorized data tool. The model cannot call tools or run SQL.
- Sanitized facts are injected inside `<verified_schooldata>` tags and labelled as data, not instructions.
- Official documents are injected inside `<knowledge_document>` tags and must be cited by title.
- User questions are wrapped in `<user_question>` tags; the system instruction explicitly ignores instructions inside data/user tags.
- Control characters are stripped; messages are length-limited; prompts are size-capped.
- API keys, DB credentials, session tokens, system instructions, and implementation details are forbidden outputs.
- Health answers are non-diagnostic. Discipline answers are drafts for human review. No final decision is presented as executed.
- Writes are never performed by the assistant. Anything sensitive goes through the existing SchoolCare workflow and requires explicit human confirmation in the normal UI.
- Provider failures return 502/503/504 and are not persisted as assistant messages; no fallback text is generated.

---

## 5. API surface

All routes require an authenticated session.

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/api/ai/status` | Availability, model, limits, role suggestions |
| `GET/PUT` | `/api/ai/settings` | School settings (admin roles) |
| `GET/POST` | `/api/ai/conversations` | List / create conversations |
| `GET/DELETE` | `/api/ai/conversations/:id` | Read / delete owned conversation |
| `POST` | `/api/ai/chat` | Send a question, get an answer |
| `POST` | `/api/ai/regenerate` | Regenerate an assistant message in place |
| `POST` | `/api/ai/feedback` | Helpful / not-helpful feedback |
| `GET/POST/PATCH/DELETE` | `/api/ai/knowledge` | Knowledge document management |
| `GET` | `/api/ai/usage` | Usage and error statistics (admin roles) |
| `POST` | `/api/ai/maintenance/purge` | Retention purge (admin roles) |

---

## 6. Verification

```bash
npm run lint       # TypeScript check
npm run test:ai    # dedicated offline AI suite (no key or quota)
npm run test:gemini # optional live connection test (uses your key)
npm test           # full suite, now includes test:ai
npm run build      # production client bundle
```

The AI suite uses a test-only provider hook, so it needs **no real API key** and makes **no live Gemini calls**. It checks:

- unauthenticated rejection and all-12-role availability;
- English and Kinyarwanda detection and explicit language override;
- verified school-scoped facts and source citations;
- follow-up history, regenerate, feedback, and conversation isolation;
- cross-school and cross-user denial, including forged `schoolId`;
- parent-child, student-own-record, teacher class scope, and finance restrictions;
- prompt-injection isolation, secret hygiene, and knowledge-document trust labels;
- provider failure, disabled configuration, and missing-key behaviour;
- settings/knowledge authorization, rate limiting, audit logging, usage, and purge.

Live answer quality requires a real `GEMINI_API_KEY` and is deliberately not simulated by tests.

---

## 7. Known limits

- Conversations are stored only in MariaDB AI tables; the in-memory session store still invalidates on server restart.
- Only `.txt`, `.md`, `.csv`, and `.json` documents up to 2 MB are accepted.
- Retrieval is lexical (token overlap), not a vector index.
- No deployment, DNS, or production configuration changes are made by this feature.
