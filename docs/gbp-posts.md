# GBP posts

## What it does

Helps create **Google Business Profile post** copy (and optional AI images) for offers, updates, events, etc. Tracks weekly post activity on the dashboard when reporting is entitled.

## Feature gate

**`local_presence`**

## Frontend

`client/src/pages/PostAutomation.tsx` → `/posts`

| Action | API |
|--------|-----|
| Load business name | `GET /api/business` |
| Generate post copy | `POST /api/ai/post-copy` `{ postType, tone, businessName }` |
| Generate post image | `POST /api/ai/post-image` `{ postType }` |
| Log activity | `POST /api/dashboard/activity` |

## Backend connection

| Method | Endpoint | Feature | Purpose |
|--------|----------|---------|---------|
| `POST` | `/api/ai/post-copy` | `local_presence` | Text generation (Gemini text model) |
| `POST` | `/api/ai/post-image` | `local_presence` | Image generation (Gemini image model) |

Models (overridable):

- `GEMINI_TEXT_MODEL` (default `gemini-3.6-flash`)
- `GEMINI_IMAGE_MODEL` (default `gemini-3.1-flash-image`)

## External APIs needed

| API | Env |
|-----|-----|
| Google Gemini (text + image) | `GEMINI_API_KEY` |

This module **does not** push posts to Google Business Profile automatically — it generates assets for the host to publish.
