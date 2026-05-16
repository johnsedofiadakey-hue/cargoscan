CREATE TABLE "Container" (
    "id" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT '40HQ',
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "capacityCbm" DOUBLE PRECISION NOT NULL,
    "destination" TEXT,
    "vessel" TEXT,
    "bookingNumber" TEXT,
    "sealNumber" TEXT,
    "departureDate" TIMESTAMP(3),
    "organizationId" TEXT NOT NULL,
    "shipmentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Container_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Container_organizationId_number_key" ON "Container"("organizationId", "number");

ALTER TABLE "Container" ADD CONSTRAINT "Container_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Container" ADD CONSTRAINT "Container_shipmentId_fkey" FOREIGN KEY ("shipmentId") REFERENCES "Shipment"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CargoItem" ADD COLUMN "containerId" TEXT;
ALTER TABLE "CargoItem" ADD CONSTRAINT "CargoItem_containerId_fkey" FOREIGN KEY ("containerId") REFERENCES "Container"("id") ON DELETE SET NULL ON UPDATE CASCADE;
