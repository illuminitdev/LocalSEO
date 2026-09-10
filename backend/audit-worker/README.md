# Full Audit worker (Local SEO–owned)

Docker Lambda for admin Full Audit / deep crawl jobs. Stack: `ZappsitesAuditWorker-{stage}`.

- Reuses SQS `zappsites-{stage}-audit-jobs`; shared RDS `audits` / `audit_jobs`
- **DataForSEO** Maps SERP enriches `gbpLookup.localRank` before score + Gemini report
- **Gemini** + **Google Places** from Secrets Manager / deploy `.env`
- Build: `npm install && npm run build`
- Deploy (Docker required): from `backend/` → `npm run deploy:worker:prod`
