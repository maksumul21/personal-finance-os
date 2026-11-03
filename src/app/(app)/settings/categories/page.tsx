import type { Metadata } from "next";
import { CategoriesView } from "@/features/categories/components/categories-view";
import { requireUser } from "@/server/auth";
import { getCategoryTree } from "@/server/queries/categories.query";

export const metadata: Metadata = { title: "Categories" };

export default async function CategoriesPage(props: PageProps<"/settings/categories">) {
  const user = await requireUser();
  const tab = (await props.searchParams).tab === "INCOME" ? "INCOME" : "EXPENSE";
  const [expense, income] = await Promise.all([getCategoryTree(user.id, "EXPENSE"), getCategoryTree(user.id, "INCOME")]);
  return <CategoriesView expense={expense} income={income} initialTab={tab} />;
}
