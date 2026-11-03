"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Archive, ArchiveRestore, MoreHorizontal, Pencil, Plus, Trash2 } from "lucide-react";
import { useEffect, useState, useTransition } from "react";
import { Controller, useForm, useWatch } from "react-hook-form";
import { toast } from "sonner";
import { ColorPicker, IconPicker } from "@/components/finance/appearance-picker";
import { FinanceIcon, ICON_NAMES } from "@/components/finance/finance-icon";
import { SectionCard } from "@/components/layout/page";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import type { CategoryDTO, CategoryGroupDTO } from "@/server/queries/categories.query";
import { archiveCategoryAction, createCategoryAction, deleteCategoryAction, updateCategoryAction } from "../actions";
import { categoryFormSchema, type CategoryFormInput, type CategoryFormValues } from "../schemas";

type Kind = "EXPENSE" | "INCOME";
const NO_PARENT = "__none__";

interface DialogState {
  open: boolean;
  id?: string;
  values: CategoryFormInput;
  hasChildren?: boolean;
}

function CategoryDialog({
  state,
  groups,
  onOpenChange,
}: {
  state: DialogState;
  groups: CategoryGroupDTO[];
  onOpenChange: (open: boolean) => void;
}) {
  const [pending, start] = useTransition();
  const form = useForm<CategoryFormInput, unknown, CategoryFormValues>({
    resolver: zodResolver(categoryFormSchema),
    defaultValues: state.values,
  });
  useEffect(() => {
    if (state.open) form.reset(state.values);
  }, [state, form]);

  const color = useWatch({ control: form.control, name: "color" });
  const parentOptions = groups.filter((g) => g.id !== state.id && !g.isArchived);

  const submit = form.handleSubmit((values) =>
    start(async () => {
      const r = state.id ? await updateCategoryAction({ id: state.id, values }) : await createCategoryAction(values);
      if (!r.ok) {
        for (const [k, m] of Object.entries(r.fieldErrors ?? {})) {
          form.setError(k.replace(/^values\./, "") as keyof CategoryFormInput, { message: m[0] });
        }
        toast.error(r.error);
        return;
      }
      toast.success(state.id ? "Category updated" : "Category added");
      onOpenChange(false);
    }),
  );

  return (
    <Dialog open={state.open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{state.id ? "Edit category" : "Add category"}</DialogTitle>
          <DialogDescription>Subcategories roll up into their group in budgets and reports.</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-5" noValidate>
          <div className="space-y-2">
            <Label htmlFor="cat-name">Name</Label>
            <Input id="cat-name" aria-invalid={!!form.formState.errors.name} {...form.register("name")} />
            {form.formState.errors.name && <p className="text-xs text-negative">{form.formState.errors.name.message}</p>}
          </div>
          <div className="space-y-2">
            <Label>Group</Label>
            <Controller
              control={form.control}
              name="parentId"
              render={({ field }) => (
                <Select
                  value={field.value ?? NO_PARENT}
                  onValueChange={(v) => field.onChange(v === NO_PARENT ? null : v)}
                  disabled={state.hasChildren}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="max-h-72">
                    <SelectItem value={NO_PARENT}>None (top-level group)</SelectItem>
                    {parentOptions.map((g) => (
                      <SelectItem key={g.id} value={g.id}>
                        {g.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
            {state.hasChildren && <p className="text-xs text-muted-foreground">Groups with subcategories stay top-level.</p>}
            {form.formState.errors.parentId && <p className="text-xs text-negative">{form.formState.errors.parentId.message}</p>}
          </div>
          <div className="space-y-2">
            <Label>Colour</Label>
            <Controller control={form.control} name="color" render={({ field }) => <ColorPicker value={field.value} onChange={field.onChange} />} />
          </div>
          <div className="space-y-2">
            <Label>Icon</Label>
            <Controller
              control={form.control}
              name="icon"
              render={({ field }) => <IconPicker value={field.value} onChange={field.onChange} color={color} icons={ICON_NAMES} />}
            />
          </div>
          {state.values.kind === "EXPENSE" && (
            <Controller
              control={form.control}
              name="isEssential"
              render={({ field }) => (
                <label className="flex items-start justify-between gap-4 rounded-lg border p-3">
                  <span>
                    <span className="block text-sm font-medium">Essential expense</span>
                    <span className="block text-xs text-muted-foreground">Used for the emergency fund target and Safe-to-Spend.</span>
                  </span>
                  <Switch checked={field.value} onCheckedChange={field.onChange} />
                </label>
              )}
            />
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "Saving…" : state.id ? "Save" : "Add category"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function CategoryRow({
  c,
  sub,
  onEdit,
  onAddChild,
  childCount,
}: {
  c: CategoryDTO;
  sub?: boolean;
  onEdit: () => void;
  onAddChild?: () => void;
  childCount: number;
}) {
  const [pending, start] = useTransition();
  const run = (fn: () => Promise<{ ok: boolean; error?: string }>, success: string) =>
    start(async () => {
      const r = await fn();
      if (r.ok) toast.success(success);
      else toast.error((r as { error: string }).error);
    });

  return (
    <li className={cn("flex items-center gap-3 py-2.5 pr-3", sub ? "pl-14" : "pl-5", c.isArchived && "opacity-60")} aria-busy={pending}>
      <FinanceIcon name={c.icon} color={c.color} size="sm" />
      <span className={cn("min-w-0 flex-1 truncate text-sm", !sub && "font-medium")}>
        {c.name}
        {c.isEssential && (
          <Badge variant="secondary" className="ml-2 align-middle text-[10px]">
            Essential
          </Badge>
        )}
        {c.isArchived && (
          <Badge variant="outline" className="ml-2 align-middle text-[10px]">
            Archived
          </Badge>
        )}
      </span>
      {c.transactionCount > 0 && <span className="hidden text-xs text-muted-foreground sm:inline">{c.transactionCount} txns</span>}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon-sm" aria-label={`Actions for ${c.name}`}>
            <MoreHorizontal />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={onEdit}>
            <Pencil /> Edit
          </DropdownMenuItem>
          {onAddChild && !c.isArchived && (
            <DropdownMenuItem onSelect={onAddChild}>
              <Plus /> Add subcategory
            </DropdownMenuItem>
          )}
          <DropdownMenuItem
            onSelect={() =>
              run(() => archiveCategoryAction({ id: c.id, archived: !c.isArchived }), c.isArchived ? "Category restored" : "Category archived")
            }
          >
            {c.isArchived ? <ArchiveRestore /> : <Archive />} {c.isArchived ? "Restore" : "Archive"}
          </DropdownMenuItem>
          {c.transactionCount === 0 && childCount === 0 && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem variant="destructive" onSelect={() => run(() => deleteCategoryAction({ id: c.id }), "Category deleted")}>
                <Trash2 /> Delete
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </li>
  );
}

function blank(kind: Kind, parent?: CategoryGroupDTO): CategoryFormInput {
  return {
    name: "",
    kind,
    parentId: parent?.id ?? null,
    icon: parent?.icon ?? "tag",
    color: parent?.color ?? "#4f46e5",
    isEssential: false,
  };
}

function toValues(c: CategoryDTO): CategoryFormInput {
  return { name: c.name, kind: c.kind, parentId: c.parentId, icon: c.icon, color: c.color, isEssential: c.isEssential };
}

function Tree({ kind, groups }: { kind: Kind; groups: CategoryGroupDTO[] }) {
  const [dialog, setDialog] = useState<DialogState>({ open: false, values: blank(kind) });
  return (
    <SectionCard
      title={kind === "EXPENSE" ? "Expense categories" : "Income categories"}
      description="Archived categories stay on past transactions but can’t be picked for new ones."
      actions={
        <Button size="sm" onClick={() => setDialog({ open: true, values: blank(kind) })}>
          <Plus /> Add
        </Button>
      }
    >
      {groups.length === 0 && (
        <div className="flex flex-col items-center px-6 py-12 text-center">
          <span className="grid size-12 place-items-center rounded-2xl bg-accent text-accent-foreground ring-1 ring-primary/10">
            <Plus className="size-5" aria-hidden />
          </span>
          <h3 className="mt-4 text-base font-semibold">Create your first {kind === "EXPENSE" ? "expense" : "income"} category</h3>
          <p className="mt-1.5 max-w-sm text-sm text-muted-foreground">
            {kind === "EXPENSE"
              ? "Start with a main category such as Food, then add subcategories inside it like Lunch and Dinner. Spending on a subcategory also counts towards its main category."
              : "For example Salary, Freelancing or Business. You can add subcategories inside any of them."}
          </p>
          <Button className="mt-6" onClick={() => setDialog({ open: true, values: blank(kind) })}>
            <Plus /> Add {kind === "EXPENSE" ? "expense" : "income"} category
          </Button>
        </div>
      )}
      <ul className="divide-y">
        {groups.map((g) => (
          <li key={g.id}>
            <ul className="divide-y">
              <CategoryRow
                c={g}
                childCount={g.children.length}
                onEdit={() => setDialog({ open: true, id: g.id, values: toValues(g), hasChildren: g.children.length > 0 })}
                onAddChild={() => setDialog({ open: true, values: blank(kind, g) })}
              />
              {g.children.map((c) => (
                <CategoryRow key={c.id} c={c} sub childCount={0} onEdit={() => setDialog({ open: true, id: c.id, values: toValues(c) })} />
              ))}
            </ul>
          </li>
        ))}
      </ul>
      <CategoryDialog state={dialog} groups={groups} onOpenChange={(open) => setDialog((d) => ({ ...d, open }))} />
    </SectionCard>
  );
}

export function CategoriesView({
  expense,
  income,
  initialTab = "EXPENSE",
}: {
  expense: CategoryGroupDTO[];
  income: CategoryGroupDTO[];
  initialTab?: Kind;
}) {
  return (
    <Tabs defaultValue={initialTab}>
      <TabsList>
        <TabsTrigger value="EXPENSE">Expenses</TabsTrigger>
        <TabsTrigger value="INCOME">Income</TabsTrigger>
      </TabsList>
      <TabsContent value="EXPENSE" className="mt-4">
        <Tree kind="EXPENSE" groups={expense} />
      </TabsContent>
      <TabsContent value="INCOME" className="mt-4">
        <Tree kind="INCOME" groups={income} />
      </TabsContent>
    </Tabs>
  );
}
