import { z } from "zod";
import { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import type { DbClient } from "./helpers";

const nextValueRows = z.array(z.object({ value: z.number().int() })).length(1);

export const numberSequenceRepository = {
  /**
   * Reserves the next number of a per-company sequence ("customer", "lead", …). One atomic statement, so two
   * requests never get the same number; call it inside the transaction that creates the record so a rolled-back
   * create does not leave a gap. Raw SQL (for INSERT … ON CONFLICT … RETURNING) filters `company_id` explicitly.
   */
  async next(companyId: string, key: string, client: DbClient = db): Promise<number> {
    const rows = await client.$queryRaw(Prisma.sql`
      INSERT INTO number_sequences (company_id, key, last_value, updated_at)
      VALUES (${companyId}::uuid, ${key}, 1, now())
      ON CONFLICT (company_id, key)
      DO UPDATE SET last_value = number_sequences.last_value + 1, updated_at = now()
      RETURNING last_value AS value`);
    const [row] = nextValueRows.parse(rows);
    if (!row) throw new Error(`Sequence ${key} returned no value`);
    return row.value;
  },
};
