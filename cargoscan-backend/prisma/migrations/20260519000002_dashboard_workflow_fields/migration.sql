ALTER TABLE "Organization" ADD COLUMN "logoUrl" TEXT;

ALTER TABLE "CargoItem" ADD COLUMN "assignedOperatorId" TEXT;
ALTER TABLE "CargoItem" ADD COLUMN "damagePhotoUrl" TEXT;

ALTER TABLE "CargoItem"
ADD CONSTRAINT "CargoItem_assignedOperatorId_fkey"
FOREIGN KEY ("assignedOperatorId") REFERENCES "User"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "ShipmentEvent" (
  "id" TEXT NOT NULL,
  "shipmentId" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "note" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "ShipmentEvent_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "ShipmentEvent"
ADD CONSTRAINT "ShipmentEvent_shipmentId_fkey"
FOREIGN KEY ("shipmentId") REFERENCES "Shipment"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX "ShipmentEvent_shipmentId_createdAt_idx"
ON "ShipmentEvent"("shipmentId", "createdAt");
