# Photos / media optimization

## What it does

Generates category-based **photo / media suggestions** (AI images) to improve GBP visual presence (e.g. storefront, team, products).

## Feature gate

**`local_presence`**

## Frontend

`client/src/pages/MediaOptimization.tsx` → `/media`

- `POST /api/ai/media-generate` `{ category }`
- `POST /api/dashboard/activity` on success

## Backend connection

| Method | Endpoint | Feature | Purpose |
|--------|----------|---------|---------|
| `POST` | `/api/ai/media-generate` | `local_presence` | Generate media for a category |

Uses Gemini image model (`GEMINI_IMAGE_MODEL`).

## External APIs needed

| API | Env |
|-----|-----|
| Google Gemini | `GEMINI_API_KEY` |

Like GBP posts, output is for the user to download/upload — no direct GBP Media API publish in this codebase.
