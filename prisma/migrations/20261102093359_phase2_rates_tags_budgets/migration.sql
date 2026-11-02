-- CreateEnum
CREATE TYPE "BudgetPeriodType" AS ENUM ('WEEKLY', 'MONTHLY', 'ANNUAL', 'CUSTOM');

-- CreateEnum
CREATE TYPE "BudgetMethod" AS ENUM ('STANDARD', 'ZERO_BASED', 'FIFTY_THIRTY_TWENTY', 'SEVENTY_TWENTY_TEN');

-- CreateEnum
CREATE TYPE "BudgetIncomeSource" AS ENUM ('PLANNED', 'ACTUAL');

-- CreateEnum
CREATE TYPE "AllocationKind" AS ENUM ('EXPENSE_CATEGORY', 'SAVINGS', 'DEBT_REPAYMENT', 'INVESTMENT');

-- CreateTable
CREATE TABLE "Tag" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Tag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TransactionTag" (
    "transactionId" UUID NOT NULL,
    "tagId" UUID NOT NULL,

    CONSTRAINT "TransactionTag_pkey" PRIMARY KEY ("transactionId","tagId")
);

-- CreateTable
CREATE TABLE "ExchangeRate" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "rate" DECIMAL(18,8) NOT NULL,
    "date" DATE NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExchangeRate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Budget" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "periodType" "BudgetPeriodType" NOT NULL,
    "startDate" DATE NOT NULL,
    "endDate" DATE NOT NULL,
    "method" "BudgetMethod" NOT NULL DEFAULT 'STANDARD',
    "plannedIncome" DECIMAL(19,4),
    "incomeSource" "BudgetIncomeSource" NOT NULL DEFAULT 'PLANNED',
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Budget_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BudgetAllocation" (
    "id" UUID NOT NULL,
    "budgetId" UUID NOT NULL,
    "kind" "AllocationKind" NOT NULL,
    "categoryId" UUID,
    "label" TEXT,
    "allocatedAmount" DECIMAL(19,4) NOT NULL,
    "rolloverEnabled" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "BudgetAllocation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Tag_userId_name_key" ON "Tag"("userId", "name");

-- CreateIndex
CREATE INDEX "TransactionTag_tagId_idx" ON "TransactionTag"("tagId");

-- CreateIndex
CREATE INDEX "ExchangeRate_userId_currency_date_idx" ON "ExchangeRate"("userId", "currency", "date" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "ExchangeRate_userId_currency_date_key" ON "ExchangeRate"("userId", "currency", "date");

-- CreateIndex
CREATE INDEX "Budget_userId_startDate_endDate_idx" ON "Budget"("userId", "startDate", "endDate");

-- CreateIndex
CREATE INDEX "BudgetAllocation_categoryId_idx" ON "BudgetAllocation"("categoryId");

-- CreateIndex
CREATE UNIQUE INDEX "BudgetAllocation_budgetId_categoryId_key" ON "BudgetAllocation"("budgetId", "categoryId");

-- AddForeignKey
ALTER TABLE "Tag" ADD CONSTRAINT "Tag_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransactionTag" ADD CONSTRAINT "TransactionTag_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "Transaction"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransactionTag" ADD CONSTRAINT "TransactionTag_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "Tag"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExchangeRate" ADD CONSTRAINT "ExchangeRate_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Budget" ADD CONSTRAINT "Budget_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BudgetAllocation" ADD CONSTRAINT "BudgetAllocation_budgetId_fkey" FOREIGN KEY ("budgetId") REFERENCES "Budget"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BudgetAllocation" ADD CONSTRAINT "BudgetAllocation_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ───────────── Integrity constraints ─────────────

ALTER TABLE "ExchangeRate"
  ADD CONSTRAINT "ExchangeRate_rate_positive" CHECK ("rate" > 0);

ALTER TABLE "Budget"
  ADD CONSTRAINT "Budget_dates_ordered" CHECK ("endDate" >= "startDate"),
  ADD CONSTRAINT "Budget_planned_income_nonneg" CHECK ("plannedIncome" IS NULL OR "plannedIncome" >= 0);

ALTER TABLE "BudgetAllocation"
  ADD CONSTRAINT "BudgetAllocation_amount_nonneg" CHECK ("allocatedAmount" >= 0),
  ADD CONSTRAINT "BudgetAllocation_target_by_kind" CHECK (
    ("kind" = 'EXPENSE_CATEGORY' AND "categoryId" IS NOT NULL) OR
    ("kind" <> 'EXPENSE_CATEGORY' AND "categoryId" IS NULL AND "label" IS NOT NULL)
  );

-- ───────────── Row Level Security (see init migration) ─────────────

ALTER TABLE "Tag" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "TransactionTag" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ExchangeRate" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Budget" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "BudgetAllocation" ENABLE ROW LEVEL SECURITY;
