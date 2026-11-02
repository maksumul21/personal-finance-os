import type { Metadata } from "next";
import { PageContainer } from "@/components/layout/page";
import { TransactionsView } from "@/features/transactions/components/transactions-view";
import { transactionFiltersSchema } from "@/features/transactions/schemas";
import { requireUser } from "@/server/auth";
import { getComposerData } from "@/server/queries/composer.query";
import { getPreferences } from "@/server/queries/settings.query";
import { getTransactionPage } from "@/server/queries/transactions.query";

export const metadata: Metadata = { title: "Transactions" };

export default async function TransactionsPage(props: PageProps<"/transactions">) {
  const user = await requireUser();
  const filters = transactionFiltersSchema.parse(await props.searchParams);
  const [page, prefs, data] = await Promise.all([
    getTransactionPage(user.id, filters),
    getPreferences(user.id),
    getComposerData(user.id, user.baseCurrency, user.timezone),
  ]);
  return (
    <PageContainer className="max-w-4xl">
      <TransactionsView page={page} filters={filters} data={data} pref={prefs.numberFormat} />
    </PageContainer>
  );
}
