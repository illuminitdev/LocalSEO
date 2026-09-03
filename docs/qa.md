# Q&A auto-responder

## What it does

Drafts answers to **Google Business Profile Q&A**-style questions using a knowledge base / notes the host provides, plus AI.

## Feature gate

**`local_presence`**

## Frontend

`client/src/pages/QAAutoResponder.tsx` → `/qa`

- `POST /api/ai/qa-answer` `{ question, kb }`
- `POST /api/dashboard/activity` when saving/logging

## Backend connection

| Method | Endpoint | Feature | Purpose |
|--------|----------|---------|---------|
| `POST` | `/api/ai/qa-answer` | `local_presence` | Generate answer from question + KB |

## External APIs needed

| API | Env |
|-----|-----|
| Google Gemini | `GEMINI_API_KEY` |

Does not call Google’s Q&A API; drafts are for manual paste into GBP.
