import "server-only";
import { incomeExpenseTotals } from "@/domain/ledger";
import { toMoneyString } from "@/domain/money";
import { dayToDb, dbToDay, type Day } from "@/domain/period";
import type { TransactionFilters } from "@/features/transactions/schemas";
import type { Prisma } from "@/generated/prisma/client";
import { db } from "../db";

export const PAGE_SIZE = 30;

export interface TxAccountRef {
  id: string;
  name: string;
  icon: string;
  color: string;
  currency: string;
}

export interface TransactionDTO {
  id: string;
  type: "INCOME" | "EXPENSE" | "TRANSFER";
  date: Day;
  description: string | null;
  notes: string | null;
  /** Positive, source currency. */
  amount: string;
  currency: string;
  exchangeRate: string;
  /** Positive, base currency. */
  baseAmount: string;
  isRefund: boolean;
  category: { id: string; name: string; icon: string; color: string; parentName: string | null } | null;
  /** INCOME/EXPENSE: the account. TRANSFER: the source. */
  account: TxAccountRef;
  /** TRANSFER only. */
  toAccount: TxAccountRef | null;
  /** TRANSFER only: positive amount received, destination currency. */
  toAmount: string | null;
  tags: string[];
}

const include = {
  category: { select: { id: true, name: true, icon: true, color: true, parent: { select: { name: true } } } },
  entries: {
    select: {
      amount: true,
      account: { select: { id: true, name: true, icon: true, color: true, currency: true } },
    },
  },
  tags: { select: { tag: { select: { name: true } } } },
} satisfies Prisma.TransactionInclude;

type Row = Prisma.TransactionGetPayload<{ include: typeof include }>;

export function toTransactionDTO(t: Row): TransactionDTO {
  const outgoing = t.entries.find((e) => e.amount.isNegative());
  const incoming = t.entries.find((e) => !e.amount.isNegative());
  const isTransfer = t.type === "TRANSFER";
  const source = isTransfer ? outgoing! : t.entries[0]!;
  return {
    id: t.id,
    type: t.type,
    date: dbToDay(t.date),
    description: t.description,
    notes: t.notes,
    amount: toMoneyString(t.amount),
    currency: t.currency,
    exchangeRate: t.exchangeRate.toString(),
    baseAmount: toMoneyString(t.baseAmount),
    isRefund: t.isRefund,
    category: t.category
      ? { id: t.category.id, name: t.category.name, icon: t.category.icon, color: t.category.color, parentName: t.category.parent?.name ?? null }
      : null,
    account: source.account,
    toAccount: isTransfer ? incoming!.account : null,
    toAmount: isTransfer ? toMoneyString(incoming!.amount) : null,
    tags: t.tags.map((x) => x.tag.name),
  };
}

async function whereFor(userId: string, f: Partial<TransactionFilters>): Promise<Prisma.TransactionWhereInput> {
  const and: Prisma.TransactionWhereInput[] = [{ userId }];
  if (f.type) and.push({ type: f.type });
  if (f.from) and.push({ date: { gte: dayToDb(f.from) } });
  if (f.to) and.push({ date: { lte: dayToDb(f.to) } });
  if (f.account) and.push({ entries: { some: { accountId: f.account, userId } } });
  if (f.category) {
    // A group filter includes its subcategories.
    const children = await db.category.findMany({ where: { userId, parentId: f.category }, select: { id: true } });
    and.push({ categoryId: { in: [f.category, ...children.map((c) => c.id)] } });
  }
  if (f.q) {
    and.push({
      OR: [
        { description: { contains: f.q, mode: "insensitive" } },
        { notes: { contains: f.q, mode: "insensitive" } },
        { category: { name: { contains: f.q, mode: "insensitive" } } },
        { tags: { some: { tag: { name: { contains: f.q, mode: "insensitive" } } } } },
      ],
    });
  }
  return { AND: and };
}

export interface DayGroup {
  date: Day;
  transactions: TransactionDTO[];
  /** Base currency, transfers excluded. */
  income: string;
  expenses: string;
}

export interface TransactionPage {
  groups: DayGroup[];
  total: number;
  page: number;
  pageCount: number;
  /** Totals over every transaction matching the filters (not just this page). */
  summary: { income: string; expenses: string; net: string; count: number };
}

export async function getTransactionPage(userId: string, filters: TransactionFilters): Promise<TransactionPage> {
  const where = await whereFor(userId, filters);
  const orderBy: Prisma.TransactionOrderByWithRelationInput[] =
    filters.sort === "date_asc"
      ? [{ date: "asc" }, { createdAt: "asc" }]
      : filters.sort === "amount_desc"
        ? [{ baseAmount: "desc" }, { date: "desc" }]
        : filters.sort === "amount_asc"
          ? [{ baseAmount: "asc" }, { date: "desc" }]
          : [{ date: "desc" }, { createdAt: "desc" }];

  const [total, rows, sums] = await Promise.all([
    db.transaction.count({ where }),
    db.transaction.findMany({ where, include, orderBy, skip: (filters.page - 1) * PAGE_SIZE, take: PAGE_SIZE }),
    db.transaction.groupBy({ by: ["type", "isRefund"], where, _sum: { baseAmount: true } }),
  ]);

  const totals = incomeExpenseTotals(
    sums.map((s) => ({ type: s.type, isRefund: s.isRefund, baseAmount: s._sum.baseAmount ?? 0 })),
  );

  // Group consecutive rows by day (keeps the chosen sort order).
  const groups: DayGroup[] = [];
  for (const row of rows) {
    const dto = toTransactionDTO(row);
    let group = groups.at(-1);
    if (!group || group.date !== dto.date) {
      group = { date: dto.date, transactions: [], income: "0", expenses: "0" };
      groups.push(group);
    }
    group.transactions.push(dto);
  }
  for (const g of groups) {
    const t = incomeExpenseTotals(g.transactions);
    g.income = toMoneyString(t.income);
    g.expenses = toMoneyString(t.expenses);
  }

  return {
    groups,
    total,
    page: filters.page,
    pageCount: Math.max(1, Math.ceil(total / PAGE_SIZE)),
    summary: {
      income: toMoneyString(totals.income),
      expenses: toMoneyString(totals.expenses),
      net: toMoneyString(totals.income.minus(totals.expenses)),
      count: total,
    },
  };
}

export async function getRecentTransactions(userId: string, take = 8): Promise<TransactionDTO[]> {
  const rows = await db.transaction.findMany({
    where: { userId },
    include,
    orderBy: [{ date: "desc" }, { createdAt: "desc" }],
    take,
  });
  return rows.map(toTransactionDTO);
}

export interface RateDTO {
  id: string;
  currency: string;
  date: Day;
  rate: string;
}

export async function getExchangeRates(userId: string): Promise<RateDTO[]> {
  const rows = await db.exchangeRate.findMany({ where: { userId }, orderBy: [{ currency: "asc" }, { date: "desc" }] });
  return rows.map((r) => ({ id: r.id, currency: r.currency, date: dbToDay(r.date), rate: r.rate.toString() }));
}
