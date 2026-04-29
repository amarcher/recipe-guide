-- CreateTable
CREATE TABLE "PantryItem" (
    "id" TEXT NOT NULL,
    "familyId" TEXT NOT NULL,
    "slug" TEXT,
    "display" TEXT NOT NULL,
    "unit" TEXT,
    "quantity" TEXT,
    "mustUseBy" TIMESTAMP(3),
    "addedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "addedById" TEXT,
    "source" TEXT NOT NULL DEFAULT 'grocery',
    "groceryItemId" TEXT,

    CONSTRAINT "PantryItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PantryItem_groceryItemId_key" ON "PantryItem"("groceryItemId");

-- CreateIndex
CREATE INDEX "PantryItem_familyId_idx" ON "PantryItem"("familyId");

-- CreateIndex
CREATE INDEX "PantryItem_familyId_slug_idx" ON "PantryItem"("familyId", "slug");

-- CreateIndex
CREATE INDEX "PantryItem_familyId_addedAt_idx" ON "PantryItem"("familyId", "addedAt");

-- AddForeignKey
ALTER TABLE "PantryItem" ADD CONSTRAINT "PantryItem_familyId_fkey" FOREIGN KEY ("familyId") REFERENCES "Family"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PantryItem" ADD CONSTRAINT "PantryItem_addedById_fkey" FOREIGN KEY ("addedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PantryItem" ADD CONSTRAINT "PantryItem_groceryItemId_fkey" FOREIGN KEY ("groceryItemId") REFERENCES "GroceryItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;
