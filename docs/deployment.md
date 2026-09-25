# Deployment

## Requirements

- Node.js 22
- PostgreSQL 15+
- S3-compatible storage and SMTP (optional until those modules ship)

## Steps

```bash
cp .env.example .env      # fill in real values
npm ci
npm run db:deploy
npm run db:seed           # first deploy only
npm run build
npm start
```

## CI

`.github/workflows/ci.yml` runs on every PR and on pushes to `main`:
install → `prisma validate` → lint → typecheck → unit tests → build.
