-- CreateEnum
CREATE TYPE "GoalType" AS ENUM ('GOAL', 'EMERGENCY_FUND', 'SINKING_FUND');

-- CreateEnum
CREATE TYPE "GoalStatus" AS ENUM ('ACTIVE', 'ACHIEVED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "GoalPriority" AS ENUM ('LOW', 'MEDIUM', 'HIGH');

-- CreateEnum
CREATE TYPE "ContributionDirection" AS ENUM ('DEPOSIT', 'WITHDRAWAL');

-- CreateEnum
CREATE TYPE "RepeatUnit" AS ENUM ('DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY');

-- CreateEnum
CREATE TYPE "ScheduleStatus" AS ENUM ('ACTIVE', 'PAUSED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "OccurrenceState" AS ENUM ('PENDING', 'PAID', 'SKIPPED');

-- CreateTable
CREATE TABLE "SavingsGoal" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "goalType" "GoalType" NOT NULL DEFAULT 'GOAL',
    "targetAmount" DECIMAL(19,4) NOT NULL,
    "targetDate" DATE,
    "description" TEXT,
    "icon" TEXT NOT NULL DEFAULT 'piggy-bank',
    "color" TEXT NOT NULL DEFAULT '#0d9488',
    "priority" "GoalPriority" NOT NULL DEFAULT 'MEDIUM',
    "linkedAccountId" UUID,
    "essentialMonthly" DECIMAL(19,4),
    "targetMonths" SMALLINT,
    "status" "GoalStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "SavingsGoal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GoalContribution" (
    "id" UUID NOT NULL,
    "goalId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "direction" "ContributionDirection" NOT NULL,
    "amount" DECIMAL(19,4) NOT NULL,
    "date" DATE NOT NULL,
    "notes" TEXT,
    "transactionId" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GoalContribution_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RecurringRule" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "type" "TransactionType" NOT NULL,
    "amount" DECIMAL(19,4) NOT NULL,
    "categoryId" UUID,
    "accountId" UUID NOT NULL,
    "toAccountId" UUID,
    "toAmount" DECIMAL(19,4),
    "description" TEXT,
    "unit" "RepeatUnit" NOT NULL,
    "interval" SMALLINT NOT NULL DEFAULT 1,
    "startDate" DATE NOT NULL,
    "endDate" DATE,
    "nextOccurrence" DATE,
    "status" "ScheduleStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "RecurringRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Bill" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "amount" DECIMAL(19,4) NOT NULL,
    "categoryId" UUID NOT NULL,
    "paymentAccountId" UUID NOT NULL,
    "unit" "RepeatUnit",
    "interval" SMALLINT NOT NULL DEFAULT 1,
    "firstDueDate" DATE NOT NULL,
    "endDate" DATE,
    "isSubscription" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "status" "ScheduleStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Bill_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BillOccurrence" (
    "id" UUID NOT NULL,
    "billId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "dueDate" DATE NOT NULL,
    "amount" DECIMAL(19,4) NOT NULL,
    "state" "OccurrenceState" NOT NULL DEFAULT 'PENDING',
    "transactionId" UUID,
    "paidAt" DATE,

    CONSTRAINT "BillOccurrence_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SavingsGoal_userId_status_idx" ON "SavingsGoal"("userId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "GoalContribution_transactionId_key" ON "GoalContribution"("transactionId");

-- CreateIndex
CREATE INDEX "GoalContribution_goalId_date_idx" ON "GoalContribution"("goalId", "date");

-- CreateIndex
CREATE INDEX "GoalContribution_userId_idx" ON "GoalContribution"("userId");

-- CreateIndex
CREATE INDEX "RecurringRule_status_nextOccurrence_idx" ON "RecurringRule"("status", "nextOccurrence");

-- CreateIndex
CREATE INDEX "RecurringRule_userId_idx" ON "RecurringRule"("userId");

-- CreateIndex
CREATE INDEX "Bill_userId_status_idx" ON "Bill"("userId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "BillOccurrence_transactionId_key" ON "BillOccurrence"("transactionId");

-- CreateIndex
CREATE INDEX "BillOccurrence_userId_dueDate_idx" ON "BillOccurrence"("userId", "dueDate");

-- CreateIndex
CREATE UNIQUE INDEX "BillOccurrence_billId_dueDate_key" ON "BillOccurrence"("billId", "dueDate");

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_recurringRuleId_fkey" FOREIGN KEY ("recurringRuleId") REFERENCES "RecurringRule"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SavingsGoal" ADD CONSTRAINT "SavingsGoal_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SavingsGoal" ADD CONSTRAINT "SavingsGoal_linkedAccountId_fkey" FOREIGN KEY ("linkedAccountId") REFERENCES "Account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GoalContribution" ADD CONSTRAINT "GoalContribution_goalId_fkey" FOREIGN KEY ("goalId") REFERENCES "SavingsGoal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GoalContribution" ADD CONSTRAINT "GoalContribution_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "Transaction"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecurringRule" ADD CONSTRAINT "RecurringRule_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecurringRule" ADD CONSTRAINT "RecurringRule_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecurringRule" ADD CONSTRAINT "RecurringRule_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecurringRule" ADD CONSTRAINT "RecurringRule_toAccountId_fkey" FOREIGN KEY ("toAccountId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Bill" ADD CONSTRAINT "Bill_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Bill" ADD CONSTRAINT "Bill_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Bill" ADD CONSTRAINT "Bill_paymentAccountId_fkey" FOREIGN KEY ("paymentAccountId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BillOccurrence" ADD CONSTRAINT "BillOccurrence_billId_fkey" FOREIGN KEY ("billId") REFERENCES "Bill"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BillOccurrence" ADD CONSTRAINT "BillOccurrence_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "Transaction"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ───────────── Integrity constraints ─────────────

ALTER TABLE "SavingsGoal"
  ADD CONSTRAINT "SavingsGoal_target_positive" CHECK ("targetAmount" > 0),
  ADD CONSTRAINT "SavingsGoal_emergency_inputs" CHECK (
    "goalType" <> 'EMERGENCY_FUND' OR ("essentialMonthly" > 0 AND "targetMonths" BETWEEN 1 AND 24)
  );

ALTER TABLE "GoalContribution"
  ADD CONSTRAINT "GoalContribution_amount_positive" CHECK ("amount" > 0);

ALTER TABLE "RecurringRule"
  ADD CONSTRAINT "RecurringRule_amount_positive" CHECK ("amount" > 0),
  ADD CONSTRAINT "RecurringRule_interval_positive" CHECK ("interval" BETWEEN 1 AND 366),
  ADD CONSTRAINT "RecurringRule_end_after_start" CHECK ("endDate" IS NULL OR "endDate" >= "startDate"),
  ADD CONSTRAINT "RecurringRule_shape_by_type" CHECK (
    ("type" = 'TRANSFER' AND "toAccountId" IS NOT NULL AND "categoryId" IS NULL AND "toAccountId" <> "accountId") OR
    ("type" <> 'TRANSFER' AND "toAccountId" IS NULL AND "categoryId" IS NOT NULL)
  );

ALTER TABLE "Bill"
  ADD CONSTRAINT "Bill_amount_positive" CHECK ("amount" > 0),
  ADD CONSTRAINT "Bill_interval_positive" CHECK ("interval" BETWEEN 1 AND 366),
  ADD CONSTRAINT "Bill_end_after_first" CHECK ("endDate" IS NULL OR "endDate" >= "firstDueDate");

ALTER TABLE "BillOccurrence"
  ADD CONSTRAINT "BillOccurrence_amount_positive" CHECK ("amount" > 0),
  ADD CONSTRAINT "BillOccurrence_paid_consistency" CHECK (("state" = 'PAID') = ("paidAt" IS NOT NULL));

-- ───────────── Row Level Security (see init migration) ─────────────

ALTER TABLE "SavingsGoal" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "GoalContribution" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "RecurringRule" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Bill" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "BillOccurrence" ENABLE ROW LEVEL SECURITY;
