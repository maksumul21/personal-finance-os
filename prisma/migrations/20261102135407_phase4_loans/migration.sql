-- CreateTable
CREATE TABLE "LoanTerms" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "accountId" UUID NOT NULL,
    "principal" DECIMAL(19,4) NOT NULL,
    "annualRate" DECIMAL(7,4) NOT NULL,
    "termMonths" SMALLINT NOT NULL,
    "firstPaymentDate" DATE NOT NULL,
    "emiAmount" DECIMAL(19,4) NOT NULL,
    "paymentAccountId" UUID NOT NULL,
    "interestCategoryId" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "LoanTerms_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LoanPayment" (
    "id" UUID NOT NULL,
    "loanId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "date" DATE NOT NULL,
    "principal" DECIMAL(19,4) NOT NULL,
    "interest" DECIMAL(19,4) NOT NULL,
    "principalTransactionId" UUID,
    "interestTransactionId" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LoanPayment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "LoanTerms_accountId_key" ON "LoanTerms"("accountId");

-- CreateIndex
CREATE INDEX "LoanTerms_userId_idx" ON "LoanTerms"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "LoanPayment_principalTransactionId_key" ON "LoanPayment"("principalTransactionId");

-- CreateIndex
CREATE UNIQUE INDEX "LoanPayment_interestTransactionId_key" ON "LoanPayment"("interestTransactionId");

-- CreateIndex
CREATE INDEX "LoanPayment_loanId_date_idx" ON "LoanPayment"("loanId", "date");

-- CreateIndex
CREATE INDEX "LoanPayment_userId_idx" ON "LoanPayment"("userId");

-- AddForeignKey
ALTER TABLE "LoanTerms" ADD CONSTRAINT "LoanTerms_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LoanTerms" ADD CONSTRAINT "LoanTerms_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LoanTerms" ADD CONSTRAINT "LoanTerms_paymentAccountId_fkey" FOREIGN KEY ("paymentAccountId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LoanTerms" ADD CONSTRAINT "LoanTerms_interestCategoryId_fkey" FOREIGN KEY ("interestCategoryId") REFERENCES "Category"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LoanPayment" ADD CONSTRAINT "LoanPayment_loanId_fkey" FOREIGN KEY ("loanId") REFERENCES "LoanTerms"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LoanPayment" ADD CONSTRAINT "LoanPayment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LoanPayment" ADD CONSTRAINT "LoanPayment_principalTransactionId_fkey" FOREIGN KEY ("principalTransactionId") REFERENCES "Transaction"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LoanPayment" ADD CONSTRAINT "LoanPayment_interestTransactionId_fkey" FOREIGN KEY ("interestTransactionId") REFERENCES "Transaction"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ───────────── Integrity constraints ─────────────

ALTER TABLE "LoanTerms"
  ADD CONSTRAINT "LoanTerms_principal_positive" CHECK ("principal" > 0),
  ADD CONSTRAINT "LoanTerms_rate_range" CHECK ("annualRate" >= 0 AND "annualRate" <= 100),
  ADD CONSTRAINT "LoanTerms_term_range" CHECK ("termMonths" BETWEEN 1 AND 600),
  ADD CONSTRAINT "LoanTerms_emi_positive" CHECK ("emiAmount" > 0),
  ADD CONSTRAINT "LoanTerms_payment_not_self" CHECK ("paymentAccountId" <> "accountId");

ALTER TABLE "LoanPayment"
  ADD CONSTRAINT "LoanPayment_principal_positive" CHECK ("principal" > 0),
  ADD CONSTRAINT "LoanPayment_interest_nonnegative" CHECK ("interest" >= 0);

-- ───────────── Row Level Security (see init migration) ─────────────

ALTER TABLE "LoanTerms" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "LoanPayment" ENABLE ROW LEVEL SECURITY;
