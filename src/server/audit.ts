import "server-only";
import type { DbTx } from "./db";

/** Plain-JSON copy (Decimals serialise to strings, Dates to ISO). */
function snapshot(value: unknown) {
  return value === undefined || value === null ? undefined : JSON.parse(JSON.stringify(value));
}

export async function audit(
  tx: DbTx,
  userId: string,
  action: string,
  entityType: string,
  entityId: string,
  before?: unknown,
  after?: unknown,
) {
  await tx.auditLog.create({
    data: { userId, action, entityType, entityId, before: snapshot(before), after: snapshot(after) },
  });
}
