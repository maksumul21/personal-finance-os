"use client";

import { ChevronDown } from "lucide-react";
import { createContext, use, useCallback, useMemo, useState, useTransition } from "react";
import { Controller, useForm, useWatch, type Resolver } from "react-hook-form";
import { toast } from "sonner";
import { FinanceIcon } from "@/components/finance/finance-icon";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { currencySymbol } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { ComposerData } from "@/server/queries/composer.query";
import type { TransactionDTO } from "@/server/queries/transactions.query";
import { createTransactionAction, updateTransactionAction } from "../actions";
import { transactionFormSchema } from "../schemas";
import { NoCategoriesHint } from "@/features/categories/components/no-categories-hint";

type TxType = "EXPENSE" | "INCOME" | "TRANSFER";

/**
 * Flat form model shared by all three types; converted to the discriminated schema on submit.
 * Keeping one shape lets the user switch type without losing what they typed.
 */
interface FormModel {
  type: TxType;
  amount: string;
  accountId: string;
  toAccountId: string;
  categoryId: string;
  date: string;
  description: string;
  notes: string;
  tags: string;
  isRefund: boolean;
  exchangeRate: string;
  toAmount: string;
}

function toPayload(m: FormModel) {
  const common = {
    amount: m.amount,
    date: m.date,
    description: m.description,
    notes: m.notes,
    tags: m.tags.split(",").map((t) => t.trim()).filter(Boolean),
    exchangeRate: m.exchangeRate,
  };
  if (m.type === "TRANSFER") {
    return { type: "TRANSFER" as const, fromAccountId: m.accountId, toAccountId: m.toAccountId, toAmount: m.toAmount, ...common };
  }
  if (m.type === "EXPENSE") {
    return { type: "EXPENSE" as const, accountId: m.accountId, categoryId: m.categoryId, isRefund: m.isRefund, ...common };
  }
  return { type: "INCOME" as const, accountId: m.accountId, categoryId: m.categoryId, ...common };
}

/** Validates the flat model with the real schema and maps issues back onto flat field names. */
const resolver: Resolver<FormModel> = async (values) => {
  const parsed = transactionFormSchema.safeParse(toPayload(values));
  if (parsed.success) return { values, errors: {} };
  const errors: Record<string, { type: string; message: string }> = {};
  for (const issue of parsed.error.issues) {
    let key = String(issue.path[0] ?? "amount");
    if (key === "fromAccountId") key = "accountId";
    errors[key] ??= { type: issue.code, message: issue.message };
  }
  return { values: {}, errors };
};

interface OpenOptions {
  /** Edit this transaction. */
  edit?: TransactionDTO;
  /** Prefill from this transaction as a new one (duplicate). */
  copy?: TransactionDTO;
  type?: TxType;
  accountId?: string;
}

const ComposerContext = createContext<{ open: (o?: OpenOptions) => void } | null>(null);

export function useComposer() {
  const ctx = use(ComposerContext);
  if (!ctx) throw new Error("useComposer must be used inside <ComposerProvider>");
  return ctx;
}

function modelFrom(data: ComposerData, o: OpenOptions): FormModel {
  const src = o.edit ?? o.copy;
  const firstAsset = data.accounts.find((a) => !a.isArchived && !a.isLiability) ?? data.accounts.find((a) => !a.isArchived);
  if (src) {
    return {
      type: src.type,
      amount: src.amount,
      accountId: src.account.id,
      toAccountId: src.toAccount?.id ?? "",
      categoryId: src.category?.id ?? "",
      date: o.edit ? src.date : data.today,
      description: src.description ?? "",
      notes: src.notes ?? "",
      tags: src.tags.join(", "),
      isRefund: src.isRefund,
      exchangeRate: src.currency !== data.baseCurrency ? src.exchangeRate : "",
      toAmount: src.toAmount && src.toAccount?.currency !== src.currency ? src.toAmount : "",
    };
  }
  return {
    type: o.type ?? "EXPENSE",
    amount: "",
    accountId: o.accountId ?? firstAsset?.id ?? "",
    toAccountId: "",
    categoryId: "",
    date: data.today,
    description: "",
    notes: "",
    tags: "",
    isRefund: false,
    exchangeRate: "",
    toAmount: "",
  };
}

function FieldError({ message }: { message?: string }) {
  return message ? <p className="text-xs text-negative">{message}</p> : null;
}

const TYPE_LABELS: Record<TxType, string> = { EXPENSE: "Expense", INCOME: "Income", TRANSFER: "Transfer" };

function ComposerForm({ data, options, onDone }: { data: ComposerData; options: OpenOptions; onDone: () => void }) {
  const editing = options.edit;
  const [pending, startTransition] = useTransition();
  const [showMore, setShowMore] = useState(Boolean(options.edit?.notes || options.edit?.tags.length || options.copy?.notes));
  const form = useForm<FormModel>({ resolver, defaultValues: modelFrom(data, options) });
  const { control, register, handleSubmit, setValue, setError, formState } = form;
  const e = formState.errors;

  const type = useWatch({ control, name: "type" });
  const accountId = useWatch({ control, name: "accountId" });
  const toAccountId = useWatch({ control, name: "toAccountId" });
  const categoryId = useWatch({ control, name: "categoryId" });

  // Archived accounts/categories stay selectable only when the edited transaction already uses them.
  const keepIds = new Set([options.edit?.account.id, options.edit?.toAccount?.id, options.edit?.category?.id].filter(Boolean));
  const accounts = data.accounts.filter((a) => !a.isArchived || keepIds.has(a.id));
  const sourceAccounts = type === "INCOME" ? accounts.filter((a) => !a.isLiability) : accounts;
  const kind = type === "INCOME" ? "INCOME" : "EXPENSE";
  const categories = data.categories.filter((c) => c.kind === kind && (!c.isArchived || keepIds.has(c.id)));

  const source = data.accounts.find((a) => a.id === accountId);
  const dest = data.accounts.find((a) => a.id === toAccountId);
  const needsRate = source && source.currency !== data.baseCurrency;
  const crossCurrency = type === "TRANSFER" && source && dest && source.currency !== dest.currency;
  const isCardPayment = type === "TRANSFER" && dest?.isLiability;

  const switchType = (t: TxType) => {
    setValue("type", t);
    // A category only fits one kind; clear it when switching between income and expense.
    const cat = data.categories.find((c) => c.id === categoryId);
    if (cat && cat.kind !== (t === "INCOME" ? "INCOME" : "EXPENSE")) setValue("categoryId", "");
    if (t === "INCOME" && source?.isLiability) setValue("accountId", "");
  };

  const onSubmit = handleSubmit((model) => {
    startTransition(async () => {
      const payload = toPayload(model);
      const result = editing
        ? await updateTransactionAction({ id: editing.id, values: payload })
        : await createTransactionAction(payload);
      if (!result.ok) {
        for (const [field, messages] of Object.entries(result.fieldErrors ?? {})) {
          const key = field.replace(/^values\./, "").replace("fromAccountId", "accountId") as keyof FormModel;
          setError(key, { message: messages[0] });
        }
        toast.error(result.error);
        return;
      }
      toast.success(editing ? "Transaction updated" : `${TYPE_LABELS[model.type]} added`);
      onDone();
    });
  });

  const accountSelect = (name: "accountId" | "toAccountId", list = accounts, placeholder = "Choose account") => (
    <Controller
      control={control}
      name={name}
      render={({ field }) => (
        <Select value={field.value} onValueChange={field.onChange}>
          <SelectTrigger className="w-full" aria-invalid={!!e[name]}>
            <SelectValue placeholder={placeholder} />
          </SelectTrigger>
          <SelectContent className="max-h-72">
            {list.map((a) => (
              <SelectItem key={a.id} value={a.id}>
                <FinanceIcon name={a.icon} color={a.color} size="sm" className="size-5 rounded-md" />
                {a.name}
                {a.currency !== data.baseCurrency && <span className="text-muted-foreground"> · {a.currency}</span>}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
    />
  );

  return (
    <form onSubmit={onSubmit} className="space-y-5" noValidate>
      <div role="tablist" aria-label="Transaction type" className="grid grid-cols-3 gap-1 rounded-lg bg-muted p-1">
        {(Object.keys(TYPE_LABELS) as TxType[]).map((t) => (
          <button
            key={t}
            type="button"
            role="tab"
            aria-selected={type === t}
            onClick={() => switchType(t)}
            className={cn(
              "h-8 rounded-md text-sm font-medium transition-colors",
              type === t ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {TYPE_LABELS[t]}
          </button>
        ))}
      </div>

      <div className="space-y-2">
        <Label htmlFor="tx-amount">Amount{source ? ` (${source.currency})` : ""}</Label>
        <div className="relative">
          <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-lg text-muted-foreground">
            {currencySymbol(source?.currency ?? data.baseCurrency).trim()}
          </span>
          <Input
            id="tx-amount"
            inputMode="decimal"
            autoComplete="off"
            autoFocus={!editing}
            placeholder="0.00"
            className="tabular h-12 pl-10 text-xl font-semibold"
            aria-invalid={!!e.amount}
            {...register("amount")}
          />
        </div>
        <FieldError message={e.amount?.message} />
      </div>

      {type === "TRANSFER" ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label>From</Label>
            {accountSelect("accountId", accounts, "Money leaves")}
            <FieldError message={e.accountId?.message} />
          </div>
          <div className="space-y-2">
            <Label>To</Label>
            {accountSelect("toAccountId", accounts.filter((a) => a.id !== accountId), "Money arrives")}
            <FieldError message={e.toAccountId?.message} />
          </div>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label>Category</Label>
            {categories.length === 0 ? (
              <NoCategoriesHint kind={kind} />
            ) : (
              <Controller
                control={control}
                name="categoryId"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger className="w-full" aria-invalid={!!e.categoryId}>
                      <SelectValue placeholder="Choose category" />
                    </SelectTrigger>
                    <SelectContent className="max-h-80">
                      {categories
                        .filter((c) => c.group === null)
                        .map((g) => {
                          const children = categories.filter((c) => c.group === g.name);
                          return (
                            <SelectGroup key={g.id}>
                              {children.length > 0 && <SelectLabel>{g.name}</SelectLabel>}
                              <SelectItem value={g.id}>
                                <FinanceIcon name={g.icon} color={g.color} size="sm" className="size-5 rounded-md" />
                                {children.length > 0 ? `${g.name} (general)` : g.name}
                              </SelectItem>
                              {children.map((c) => (
                                <SelectItem key={c.id} value={c.id} className="pl-4">
                                  <FinanceIcon name={c.icon} color={c.color} size="sm" className="size-5 rounded-md" />
                                  {c.name}
                                </SelectItem>
                              ))}
                            </SelectGroup>
                          );
                        })}
                    </SelectContent>
                  </Select>
                )}
              />
            )}
            <FieldError message={e.categoryId?.message} />
          </div>
          <div className="space-y-2">
            <Label>{type === "INCOME" ? "Received in" : "Paid from"}</Label>
            {accountSelect("accountId", sourceAccounts)}
            <FieldError message={e.accountId?.message} />
          </div>
        </div>
      )}

      {isCardPayment && (
        <p className="rounded-md bg-accent px-3 py-2 text-xs text-accent-foreground">
          Paying a card or loan is a transfer: it lowers what you owe and is not counted as a second expense.
        </p>
      )}

      {(needsRate || crossCurrency) && (
        <div className="grid gap-4 sm:grid-cols-2">
          {needsRate && (
            <div className="space-y-2">
              <Label htmlFor="tx-rate">
                Rate: 1 {source!.currency} = ? {data.baseCurrency}
              </Label>
              <Input id="tx-rate" inputMode="decimal" className="tabular" placeholder="Use recorded rate" {...register("exchangeRate")} />
              <p className="text-xs text-muted-foreground">Leave empty to use the rate recorded in Settings.</p>
              <FieldError message={e.exchangeRate?.message} />
            </div>
          )}
          {crossCurrency && (
            <div className="space-y-2">
              <Label htmlFor="tx-to-amount">Amount received ({dest!.currency})</Label>
              <Input id="tx-to-amount" inputMode="decimal" className="tabular" {...register("toAmount")} />
              <FieldError message={e.toAmount?.message} />
            </div>
          )}
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="tx-desc">Description</Label>
          <Input id="tx-desc" placeholder={type === "TRANSFER" ? "e.g. Card payment" : "e.g. Shwapno"} {...register("description")} />
          <FieldError message={e.description?.message} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="tx-date">Date</Label>
          <Input id="tx-date" type="date" aria-invalid={!!e.date} {...register("date")} />
          <FieldError message={e.date?.message} />
        </div>
      </div>

      {type === "EXPENSE" && (
        <Controller
          control={control}
          name="isRefund"
          render={({ field }) => (
            <label className="flex items-center justify-between gap-4 rounded-lg border px-3 py-2.5">
              <span>
                <span className="block text-sm font-medium">This is a refund</span>
                <span className="block text-xs text-muted-foreground">Money back into the account; reduces spending in this category.</span>
              </span>
              <Switch checked={field.value} onCheckedChange={field.onChange} />
            </label>
          )}
        />
      )}

      <div>
        <button
          type="button"
          onClick={() => setShowMore((v) => !v)}
          className="flex items-center gap-1 text-sm font-medium text-muted-foreground hover:text-foreground"
          aria-expanded={showMore}
        >
          <ChevronDown className={cn("size-4 transition-transform", showMore && "rotate-180")} /> Notes and tags
        </button>
        {showMore && (
          <div className="mt-3 space-y-4">
            <div className="space-y-2">
              <Label htmlFor="tx-notes">Notes</Label>
              <Textarea id="tx-notes" rows={2} {...register("notes")} />
              <FieldError message={e.notes?.message} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="tx-tags">Tags</Label>
              <Input id="tx-tags" placeholder="Comma separated, e.g. work, travel" {...register("tags")} />
              <FieldError message={e.tags?.message} />
            </div>
          </div>
        )}
      </div>

      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : editing ? "Save changes" : `Add ${TYPE_LABELS[type].toLowerCase()}`}
        </Button>
      </DialogFooter>
    </form>
  );
}

/** Mount once in the app layout. Any component can open the add/edit form via useComposer(). */
export function ComposerProvider({ data, children }: { data: ComposerData; children: React.ReactNode }) {
  const [state, setState] = useState<{ open: boolean; options: OpenOptions; key: number }>({
    open: false,
    options: {},
    key: 0,
  });
  const open = useCallback((options: OpenOptions = {}) => setState((s) => ({ open: true, options, key: s.key + 1 })), []);
  const value = useMemo(() => ({ open }), [open]);
  const hasAccounts = data.accounts.some((a) => !a.isArchived);

  return (
    <ComposerContext value={value}>
      {children}
      <Dialog open={state.open} onOpenChange={(o) => setState((s) => ({ ...s, open: o }))}>
        <DialogContent className="max-h-[94dvh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{state.options.edit ? "Edit transaction" : "New transaction"}</DialogTitle>
            <DialogDescription>
              {hasAccounts ? "Transfers between your accounts never count as income or expense." : "Add an account first."}
            </DialogDescription>
          </DialogHeader>
          {hasAccounts ? (
            <ComposerForm
              key={state.key}
              data={data}
              options={state.options}
              onDone={() => setState((s) => ({ ...s, open: false }))}
            />
          ) : (
            <Button asChild>
              <a href="/accounts">Go to Accounts</a>
            </Button>
          )}
        </DialogContent>
      </Dialog>
    </ComposerContext>
  );
}
