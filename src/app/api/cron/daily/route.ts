import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { dayToDb, todayIn } from "@/domain/period";
import { db } from "@/server/db";
import { env } from "@/server/env";
import { ensureOccurrences } from "@/server/services/bills.service";
import { processDueRules } from "@/server/services/recurring.service";

/**
 * Daily job (Vercel Cron, see vercel.json): posts due recurring transactions and materialises
 * bill occurrences for every user. Idempotent, so retries and overlapping runs are safe.
 */
export async function GET(request: NextRequest) {
  const secret = env.CRON_SECRET;
  const given = request.headers.get("authorization") ?? "";
  const expected = `Bearer ${secret}`;
  if (!secret || given.length !== expected.length || !timingSafeEqual(Buffer.from(given), Buffer.from(expected))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Only users with something to do: due rules (checked per user's own "today") or active bills.
  const users = await db.user.findMany({
    where: {
      OR: [
        { recurring: { some: { status: "ACTIVE", nextOccurrence: { lte: dayToDb(todayIn("Pacific/Kiritimati")) } } } },
        { bills: { some: { status: "ACTIVE" } } },
      ],
    },
    select: { id: true, timezone: true, baseCurrency: true },
  });

  let posted = 0;
  const failures: string[] = [];
  for (const u of users) {
    const today = todayIn(u.timezone);
    try {
      posted += (await processDueRules({ userId: u.id, baseCurrency: u.baseCurrency }, today)).posted;
      await ensureOccurrences(u.id, today);
    } catch (err) {
      console.error("Daily job failed for a user", err);
      failures.push(u.id);
    }
  }
  return NextResponse.json({ users: users.length, posted, failed: failures.length });
}
