-- CreateEnum
CREATE TYPE "AssetClass" AS ENUM ('STOCK', 'MUTUAL_FUND', 'BOND', 'SAVINGS_CERTIFICATE', 'FIXED_DEPOSIT', 'GOLD', 'CRYPTO', 'OTHER');

-- CreateEnum
CREATE TYPE "TradeSide" AS ENUM ('BUY', 'SELL');

-- CreateTable
CREATE TABLE "Holding" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "accountId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "symbol" TEXT,
    "assetClass" "AssetClass" NOT NULL DEFAULT 'STOCK',
    "notes" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Holding_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HoldingTrade" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "holdingId" UUID NOT NULL,
    "side" "TradeSide" NOT NULL,
    "date" DATE NOT NULL,
    "units" DECIMAL(24,8) NOT NULL,
    "amount" DECIMAL(19,4) NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HoldingTrade_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HoldingPrice" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "holdingId" UUID NOT NULL,
    "date" DATE NOT NULL,
    "price" DECIMAL(24,8) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HoldingPrice_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Holding_userId_idx" ON "Holding"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Holding_accountId_name_key" ON "Holding"("accountId", "name");

-- CreateIndex
CREATE INDEX "HoldingTrade_holdingId_date_idx" ON "HoldingTrade"("holdingId", "date");

-- CreateIndex
CREATE INDEX "HoldingTrade_userId_idx" ON "HoldingTrade"("userId");

-- CreateIndex
CREATE INDEX "HoldingPrice_userId_idx" ON "HoldingPrice"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "HoldingPrice_holdingId_date_key" ON "HoldingPrice"("holdingId", "date");

-- AddForeignKey
ALTER TABLE "Holding" ADD CONSTRAINT "Holding_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Holding" ADD CONSTRAINT "Holding_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HoldingTrade" ADD CONSTRAINT "HoldingTrade_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HoldingTrade" ADD CONSTRAINT "HoldingTrade_holdingId_fkey" FOREIGN KEY ("holdingId") REFERENCES "Holding"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HoldingPrice" ADD CONSTRAINT "HoldingPrice_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HoldingPrice" ADD CONSTRAINT "HoldingPrice_holdingId_fkey" FOREIGN KEY ("holdingId") REFERENCES "Holding"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ───────────── Integrity constraints ─────────────

ALTER TABLE "HoldingTrade"
  ADD CONSTRAINT "HoldingTrade_units_positive" CHECK ("units" > 0),
  ADD CONSTRAINT "HoldingTrade_amount_nonnegative" CHECK ("amount" >= 0);

ALTER TABLE "HoldingPrice"
  ADD CONSTRAINT "HoldingPrice_price_nonnegative" CHECK ("price" >= 0);

-- ───────────── Row Level Security (see init migration) ─────────────

ALTER TABLE "Holding" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "HoldingTrade" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "HoldingPrice" ENABLE ROW LEVEL SECURITY;
