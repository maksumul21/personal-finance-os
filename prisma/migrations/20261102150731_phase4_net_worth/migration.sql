-- CreateEnum
CREATE TYPE "ManualItemKind" AS ENUM ('ASSET', 'LIABILITY');

-- CreateEnum
CREATE TYPE "ManualItemCategory" AS ENUM ('PROPERTY', 'VEHICLE', 'VALUABLES', 'RECEIVABLE', 'BUSINESS', 'RETIREMENT', 'PERSONAL_DEBT', 'TAX', 'OTHER');

-- CreateTable
CREATE TABLE "ManualItem" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "kind" "ManualItemKind" NOT NULL,
    "category" "ManualItemCategory" NOT NULL DEFAULT 'OTHER',
    "currency" CHAR(3) NOT NULL,
    "notes" TEXT,
    "isArchived" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "ManualItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ManualValuation" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "itemId" UUID NOT NULL,
    "date" DATE NOT NULL,
    "value" DECIMAL(19,4) NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ManualValuation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ManualItem_userId_isArchived_idx" ON "ManualItem"("userId", "isArchived");

-- CreateIndex
CREATE UNIQUE INDEX "ManualItem_userId_name_key" ON "ManualItem"("userId", "name");

-- CreateIndex
CREATE INDEX "ManualValuation_userId_idx" ON "ManualValuation"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "ManualValuation_itemId_date_key" ON "ManualValuation"("itemId", "date");

-- AddForeignKey
ALTER TABLE "ManualItem" ADD CONSTRAINT "ManualItem_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ManualValuation" ADD CONSTRAINT "ManualValuation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ManualValuation" ADD CONSTRAINT "ManualValuation_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "ManualItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ───────────── Integrity constraints ─────────────

ALTER TABLE "ManualValuation"
  ADD CONSTRAINT "ManualValuation_value_nonnegative" CHECK ("value" >= 0);

-- ───────────── Row Level Security (see init migration) ─────────────

ALTER TABLE "ManualItem" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ManualValuation" ENABLE ROW LEVEL SECURITY;
