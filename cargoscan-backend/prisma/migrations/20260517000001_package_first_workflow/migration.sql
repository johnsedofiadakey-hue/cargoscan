ALTER TABLE "CargoItem" ALTER COLUMN "length" DROP NOT NULL;
ALTER TABLE "CargoItem" ALTER COLUMN "width" DROP NOT NULL;
ALTER TABLE "CargoItem" ALTER COLUMN "height" DROP NOT NULL;
ALTER TABLE "CargoItem" ALTER COLUMN "cbm" DROP NOT NULL;
ALTER TABLE "CargoItem" ALTER COLUMN "scanConfidence" DROP NOT NULL;
ALTER TABLE "CargoItem" ALTER COLUMN "status" SET DEFAULT 'WAITING_FOR_SCAN';

UPDATE "CargoItem"
SET "status" = 'WAITING_FOR_SCAN'
WHERE "status" = 'SCANNED'
  AND (
    "scanConfidence" IS NULL
    OR "scanConfidence" >= 99
  )
  AND NOT EXISTS (
    SELECT 1 FROM "ScanResult"
    WHERE "ScanResult"."cargoItemId" = "CargoItem"."id"
  );
