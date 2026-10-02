# Deployment

## Requirements

- Node.js **22.12+** (see `.nvmrc`)
- PostgreSQL **15+**
- SMTP and S3-compatible storage — optional until the email and upload features ship

## Environment variables

Set every variable from `.env.example` in your hosting provider. The build **fails on purpose** if a
required variable is missing or malformed, and prints which one — values are never printed.

| Variable                                                                                           | Required         | Notes                                                                                                                           |
| -------------------------------------------------------------------------------------------------- | ---------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `DATABASE_URL`                                                                                     | yes              | `postgresql://…` connection string                                                                                              |
| `APP_URL`                                                                                          | yes\*            | Public URL, e.g. `https://erp.example.com` (\*defaults to localhost)                                                            |
| `EMAIL_TRANSPORT`                                                                                  | no               | `smtp` (default in production) or `console` (prints emails with links — local/CI only)                                          |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_SECURE`, `EMAIL_FROM`                | yes with `smtp`  | Reset, verification and invitation emails; the app refuses to start in production without them                                  |
| `AUTH_ALLOW_REGISTRATION`                                                                          | no               | `true` lets anyone create a new company at `/register` (default: invitation only)                                               |
| `STORAGE_DRIVER`                                                                                   | no               | `s3` (default in production) or `local` (a folder; only for a single server with a persistent disk)                             |
| `STORAGE_ENDPOINT`, `STORAGE_BUCKET`, `STORAGE_ACCESS_KEY`, `STORAGE_SECRET_KEY`, `STORAGE_REGION` | yes with `s3`    | Any S3-compatible service (AWS S3, Cloudflare R2, MinIO). The bucket should be **private**; files are served through the app    |
| `STORAGE_LOCAL_DIR`                                                                                | no               | Folder for `local` storage (default `.storage`)                                                                                 |
| `DATA_ENCRYPTION_KEY`                                                                              | yes (production) | 32 random bytes, base64 (`openssl rand -base64 32`). Encrypts employee bank details; back it up — without it they can't be read |

| `CRON_SECRET` | no | At least 32 random characters (`openssl rand -hex 32`). Enables `POST /api/cron/notifications` for reminders and notification emails |

`SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD` are only used by `npm run db:seed`, never by the running app.

## Sending quotations and invoices

Documents are emailed with `EMAIL_TRANSPORT=smtp` (the PDF is attached; replies go to the company email from
Settings). WhatsApp sharing needs no configuration: it opens WhatsApp with a link to `APP_URL/api/share/<token>`,
so `APP_URL` must be the public address customers can reach.

## Scheduled notifications

Overdue-invoice and deadline reminders, and the delivery of notification emails, run on a schedule
(`docs/notifications.md`). Run it every 5–15 minutes with either:

- an HTTP cron (Vercel Cron, GitHub Actions, any cron service):
  `curl -fsS -X POST -H "Authorization: Bearer $CRON_SECRET" https://erp.example.com/api/cron/notifications`
- or, on a server with the code and database access: `npm run notifications:run` from a crontab.

Without a scheduler, in-app notifications for events still work; reminders and emails wait until the next run.

## Generic Node.js host

```bash
npm ci                 # installs dependencies and generates the Prisma client
npm run db:deploy      # apply database migrations
npm run db:seed        # first deployment, and after any release that adds permissions (e.g. phase 07)
npm run build
npm start              # serves on port 3000 (override with PORT)
```

## Vercel (planned target — finalized in phase 16)

1. Import the repository in Vercel; the framework is detected automatically.
2. Add the environment variables above (Production and Preview).
3. Set the build command to `prisma migrate deploy && next build` so migrations run before each deploy.
4. Use a pooled connection string (e.g. Neon/Supabase pooler) for `DATABASE_URL` — serverless
   functions open many short-lived connections.

## Continuous integration

`.github/workflows/ci.yml` runs on every pull request and every push to `main`:

1. `npm ci`
2. `prisma validate` and `prisma migrate deploy` against a fresh PostgreSQL 16 service
3. `npm run lint` (ESLint + Prettier check)
4. `npm run typecheck`
5. `npm run test` (unit + component tests)
6. `npm run build`
7. `npm run test:e2e` (Playwright against the production build)

A pull request should only be merged when CI is green.
