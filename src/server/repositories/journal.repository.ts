import { z } from "zod";
import { Prisma, type TransactionType } from "@/generated/prisma/client";
import { parseRecordNumber } from "@/config/records";
import { dateOnlyToDate } from "@/lib/date-range";
import { db } from "@/lib/db";
import { pageArgs, toPage, type ActorId, type DbClient, type PageQuery } from "./helpers";

export interface JournalLineData {
  accountId: string;
  debit: string;
  credit: string;
  description: string | null;
}

export interface JournalEntryData {
  type: TransactionType;
  entryDate: Date;
  description: string;
  reference: string | null;
  postingKey: string | null;
  sourceType: string;
  sourceId: string | null;
  reversalOfId: string | null;
}

const lineSelect = {
  id: true,
  position: true,
  debit: true,
  credit: true,
  description: true,
  account: { select: { id: true, code: true, name: true, type: true } },
} as const;

const entrySelect = {
  id: true,
  number: true,
  type: true,
  entryDate: true,
  description: true,
  reference: true,
  postingKey: true,
  sourceType: true,
  sourceId: true,
  reversalOfId: true,
  createdAt: true,
  createdBy: { select: { name: true } },
  reversals: { select: { id: true, number: true } },
  lines: { select: lineSelect, orderBy: { position: "asc" } },
} as const;

/** Calendar-date bounds, "YYYY-MM-DD": from ≤ date < to. Either side optional. */
export interface DateBounds {
  from?: string;
  to?: string;
}

function dateFilter({ from, to }: DateBounds): Prisma.DateTimeFilter | undefined {
  if (!from && !to) return undefined;
  return { ...(from ? { gte: dateOnlyToDate(from) } : {}), ...(to ? { lt: dateOnlyToDate(to) } : {}) };
}

const monthlyRows = z.array(
  z.object({ month: z.string(), type: z.string(), debit: z.string(), credit: z.string() }),
);

export const journalRepository = {
  create(
    companyId: string,
    number: number,
    data: JournalEntryData,
    lines: readonly JournalLineData[],
    actorId: ActorId,
    client: DbClient,
  ) {
    return client.journalEntry.create({
      data: {
        ...data,
        number,
        companyId,
        createdById: actorId,
        // Nested lines take company_id from the entry (composite foreign key).
        lines: { createMany: { data: lines.map((line, position) => ({ ...line, position })) } },
      },
      select: entrySelect,
    });
  },

  findById(companyId: string, id: string, client: DbClient = db) {
    return client.journalEntry.findFirst({ where: { id, companyId }, select: entrySelect });
  },

  /** Entries posted automatically for one source record (e.g. an expense), oldest first. */
  listBySource(companyId: string, sourceType: string, sourceId: string, client: DbClient = db) {
    return client.journalEntry.findMany({
      where: { companyId, sourceType, sourceId },
      select: { id: true, number: true, type: true, entryDate: true, description: true },
      orderBy: { number: "asc" },
    });
  },

  findByPostingKey(companyId: string, postingKey: string, client: DbClient = db) {
    return client.journalEntry.findUnique({
      where: { companyId_postingKey: { companyId, postingKey } },
      select: entrySelect,
    });
  },

  async list(
    companyId: string,
    query: PageQuery & { type?: TransactionType; accountId?: string; search?: string; dates: DateBounds },
    client: DbClient = db,
  ) {
    const number = query.search ? parseRecordNumber("journal", query.search) : undefined;
    const where: Prisma.JournalEntryWhereInput = {
      companyId,
      ...(query.type ? { type: query.type } : {}),
      ...(query.accountId ? { lines: { some: { accountId: query.accountId } } } : {}),
      ...(dateFilter(query.dates) ? { entryDate: dateFilter(query.dates) } : {}),
      ...(query.search
        ? {
            OR: [
              { description: { contains: query.search, mode: "insensitive" } },
              { reference: { contains: query.search, mode: "insensitive" } },
              ...(number === undefined ? [] : [{ number }]),
            ],
          }
        : {}),
    };
    const [items, total] = await Promise.all([
      client.journalEntry.findMany({
        where,
        select: entrySelect,
        orderBy: [{ entryDate: "desc" }, { number: "desc" }],
        ...pageArgs(query),
      }),
      client.journalEntry.count({ where }),
    ]);
    return toPage(items, total, query);
  },

  /** Σ debit and Σ credit per account for entries dated within `dates`. */
  async totalsByAccount(companyId: string, dates: DateBounds, client: DbClient = db) {
    const filter = dateFilter(dates);
    const rows = await client.journalLine.groupBy({
      by: ["accountId"],
      where: { companyId, ...(filter ? { entry: { entryDate: filter } } : {}) },
      _sum: { debit: true, credit: true },
    });
    return rows.map((row) => ({
      accountId: row.accountId,
      debit: row._sum.debit?.toString() ?? "0",
      credit: row._sum.credit?.toString() ?? "0",
    }));
  },

  /** Σ debit / credit per transaction type for one set of accounts (e.g. cash and bank) within `dates`. */
  async totalsByTypeForAccounts(
    companyId: string,
    accountIds: readonly string[],
    dates: DateBounds,
    client: DbClient = db,
  ) {
    const filter = dateFilter(dates);
    const lines = await client.journalLine.findMany({
      where: {
        companyId,
        accountId: { in: [...accountIds] },
        ...(filter ? { entry: { entryDate: filter } } : {}),
      },
      select: { debit: true, credit: true, entry: { select: { type: true } } },
    });
    return lines.map((line) => ({
      type: line.entry.type,
      debit: line.debit.toString(),
      credit: line.credit.toString(),
    }));
  },

  /** An account's lines in date order, for its ledger (running balance is computed by the service). */
  accountLines(companyId: string, accountId: string, dates: DateBounds, client: DbClient = db) {
    const filter = dateFilter(dates);
    return client.journalLine.findMany({
      where: { companyId, accountId, ...(filter ? { entry: { entryDate: filter } } : {}) },
      select: {
        id: true,
        debit: true,
        credit: true,
        description: true,
        entry: { select: { id: true, number: true, type: true, entryDate: true, description: true } },
      },
      orderBy: [{ entry: { entryDate: "asc" } }, { entry: { number: "asc" } }, { position: "asc" }],
      take: 2000,
    });
  },

  /**
   * Σ debit / credit per month ("YYYY-MM") and account type (REVENUE / EXPENSE) — for the dashboard chart. Raw SQL
   * for GROUP BY month; company scoped explicitly.
   */
  async monthlyByType(companyId: string, dates: Required<DateBounds>, client: DbClient = db) {
    const rows = await client.$queryRaw(Prisma.sql`
      SELECT to_char(e.entry_date, 'YYYY-MM') AS month, a.type::text AS type,
             sum(l.debit)::text AS debit, sum(l.credit)::text AS credit
      FROM journal_lines l
      JOIN journal_entries e ON e.id = l.entry_id AND e.company_id = l.company_id
      JOIN accounts a ON a.id = l.account_id AND a.company_id = l.company_id
      WHERE l.company_id = ${companyId}::uuid
        AND a.type IN ('REVENUE', 'EXPENSE')
        AND e.entry_date >= ${dates.from}::date
        AND e.entry_date < ${dates.to}::date
      GROUP BY 1, 2
      ORDER BY 1`);
    return monthlyRows.parse(rows);
  },
};

export type { TransactionType };
export type JournalActor = ActorId;
