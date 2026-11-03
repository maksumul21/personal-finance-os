import { ZERO, percentOf, sum, toMoney, type Money, type MoneyInput } from "./money";

/**
 * Reports & analytics (ROADMAP Phase 5, DECISIONS.md D-034). Pure helpers: category breakdowns
 * with comparison, percentage change and a CSV writer. Amounts come pre-aggregated from SQL.
 */

export interface CategoryInfo {
  id: string;
  name: string;
  parentId: string | null;
  color: string;
  icon: string;
}

/** Net amount per category: spending (or income) minus refunds, base currency. */
export interface CategoryAmount {
  categoryId: string;
  amount: MoneyInput;
}

export interface BreakdownNode {
  id: string;
  name: string;
  color: string;
  icon: string;
  amount: Money;
  previous: Money;
  /** % change vs previous; null when previous is zero or negative. */
  changePct: Money | null;
  /** Share of the period total; null when the total is zero. */
  sharePct: Money | null;
  children: Omit<BreakdownNode, "children">[];
}

/** % change from `before` to `now`; null when `before` isn't positive. */
export function pctChange(now: MoneyInput, before: MoneyInput): Money | null {
  const b = toMoney(before);
  if (!b.greaterThan(0)) return null;
  return toMoney(now).minus(b).div(b).times(100);
}

/**
 * Rolls category amounts up into groups (two levels, D-014). A group's own transactions show as a
 * "(general)" child when it also has subcategories with activity, so children always add up.
 */
export function categoryBreakdown(categories: CategoryInfo[], current: CategoryAmount[], previous: CategoryAmount[]): BreakdownNode[] {
  const byId = new Map(categories.map((c) => [c.id, c]));
  const total = (rows: CategoryAmount[]) => {
    const m = new Map<string, Money>();
    for (const r of rows) m.set(r.categoryId, (m.get(r.categoryId) ?? ZERO).plus(toMoney(r.amount)));
    return m;
  };
  const now = total(current);
  const before = total(previous);
  const grandTotal = sum([...now.values()]);

  const groups = new Map<string, { info: CategoryInfo; children: Map<string, { info: CategoryInfo; own: boolean }> }>();
  for (const id of new Set([...now.keys(), ...before.keys()])) {
    const c = byId.get(id);
    if (!c) continue;
    const groupInfo = c.parentId ? byId.get(c.parentId) : c;
    if (!groupInfo) continue;
    const g = groups.get(groupInfo.id) ?? { info: groupInfo, children: new Map() };
    g.children.set(c.id, { info: c, own: !c.parentId });
    groups.set(groupInfo.id, g);
  }

  const node = (id: string, name: string, info: CategoryInfo, amount: Money, prev: Money) => ({
    id,
    name,
    color: info.color,
    icon: info.icon,
    amount,
    previous: prev,
    changePct: pctChange(amount, prev),
    sharePct: grandTotal.isZero() ? null : percentOf(amount, grandTotal),
  });

  const out: BreakdownNode[] = [];
  for (const { info, children } of groups.values()) {
    const kids = [...children.values()].map(({ info: c, own }) =>
      node(c.id, own ? `${c.name} (general)` : c.name, c, now.get(c.id) ?? ZERO, before.get(c.id) ?? ZERO),
    );
    const amount = sum(kids.map((k) => k.amount));
    const prev = sum(kids.map((k) => k.previous));
    const onlyOwn = kids.length === 1 && !byId.get(kids[0].id)?.parentId;
    out.push({
      ...node(info.id, info.name, info, amount, prev),
      children: onlyOwn ? [] : kids.sort((a, b) => b.amount.comparedTo(a.amount) || b.previous.comparedTo(a.previous)),
    });
  }
  return out.sort((a, b) => b.amount.comparedTo(a.amount) || b.previous.comparedTo(a.previous));
}

/**
 * RFC 4180 CSV. Cells starting with = + - @ (or tab / CR) are prefixed with an apostrophe so a
 * spreadsheet can't run them as formulas (CSV injection). Plain numbers are written as-is.
 */
export function toCsv(rows: (string | number | null | undefined)[][]): string {
  const cell = (v: string | number | null | undefined) => {
    if (v === null || v === undefined) return "";
    let s = String(v);
    const numeric = /^-?\d+(\.\d+)?$/.test(s);
    if (!numeric && /^[=+\-@\t\r]/.test(s)) s = `'${s}`;
    return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return rows.map((r) => r.map(cell).join(",")).join("\r\n") + "\r\n";
}
