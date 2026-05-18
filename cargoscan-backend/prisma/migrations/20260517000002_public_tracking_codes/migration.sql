ALTER TABLE "Shipment" ADD COLUMN "trackingCode" TEXT;
ALTER TABLE "CargoItem" ADD COLUMN "trackingCode" TEXT;

UPDATE "Shipment"
SET "trackingCode" = 'SHP-' || upper(substr(md5(random()::text || "id"), 1, 10))
WHERE "trackingCode" IS NULL;

UPDATE "CargoItem"
SET "trackingCode" = 'PKG-' || upper(substr(md5(random()::text || "id"), 1, 10))
WHERE "trackingCode" IS NULL;

ALTER TABLE "Shipment" ALTER COLUMN "trackingCode" SET NOT NULL;
ALTER TABLE "CargoItem" ALTER COLUMN "trackingCode" SET NOT NULL;

CREATE UNIQUE INDEX "Shipment_trackingCode_key" ON "Shipment"("trackingCode");
CREATE UNIQUE INDEX "CargoItem_trackingCode_key" ON "CargoItem"("trackingCode");
