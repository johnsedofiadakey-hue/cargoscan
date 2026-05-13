-- DropForeignKey
ALTER TABLE "ScanResult" DROP CONSTRAINT "ScanResult_operatorId_fkey";

-- AlterTable
ALTER TABLE "AuditLog" ADD COLUMN     "target" TEXT,
ADD COLUMN     "targetId" TEXT;

-- AlterTable
ALTER TABLE "ScanResult" ALTER COLUMN "operatorId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "Webhook" ADD COLUMN     "active" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "WebhookDelivery" ADD COLUMN     "event" TEXT,
ADD COLUMN     "responseBody" TEXT,
ADD COLUMN     "responseStatus" INTEGER,
ALTER COLUMN "status" SET DATA TYPE TEXT;

-- AddForeignKey
ALTER TABLE "ScanResult" ADD CONSTRAINT "ScanResult_operatorId_fkey" FOREIGN KEY ("operatorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
