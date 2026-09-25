# Deployment

## Requirements

- Node.js **22.12+** (see `.nvmrc`)
- PostgreSQL **15+**
- SMTP and S3-compatible storage — optional until the email and upload features ship

## Environment variables

Set every variable from `.env.example` in your hosting provider. The build **fails on purpose** if a
required variable is missing or malformed, and prints which one — values are never printed.

| Variable               | Required | Notes                                                                |
| ---------------------- | -------- | -------------------------------------------------------------------- |
| `DATABASE_URL`         | yes      | `postgresql://…` connection string                                   |
| `APP_URL`              | yes\*    | Public URL, e.g. `https://erp.example.com` (\*defaults to localhost) |
| `SMTP_*`, `EMAIL_FROM` | later    | Needed once email features ship                                      |
| `STORAGE_*`            | later    | Needed once file uploads ship                                        |

`SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD` are only used by `npm run db:seed`, never by the running app.

## Generic Node.js host

```bash
npm ci                 # installs dependencies and generates the Prisma client
npm run db:deploy      # apply database migrations
npm run db:seed        # first deployment only
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
