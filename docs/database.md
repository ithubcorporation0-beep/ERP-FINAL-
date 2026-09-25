# Database

- PostgreSQL 15+, managed through Prisma (`prisma/schema.prisma`).
- **Multi-tenancy:** shared database, shared schema. Every top-level business table has an
  `organizationId` column with an index; child tables (e.g. `InvoiceItem`, `JournalLine`) inherit
  the tenant through their parent.
- **Money:** `Decimal(14,2)`, never floats. Quantities use `Decimal(14,3)`.
- **Soft delete:** `deletedAt` on master data (customers so far); transactional records are voided, not deleted.
- **Accounting:** double entry via `JournalEntry` + `JournalLine`. The sum of debits must equal the sum of
  credits per entry; this is enforced in the accounting service.
- **Document numbers** (`Invoice.number`, `Purchase.number`) are unique per organization.

## Workflow

```bash
npm run db:migrate    # create/apply a migration in development
npm run db:deploy     # apply migrations in production
npm run db:seed       # seed demo organization, roles, chart of accounts, admin user
```
