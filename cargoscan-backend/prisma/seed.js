const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcrypt');
const prisma = new PrismaClient();

async function main() {
  console.log('Seeding database...');

  // Clear in dependency order
  await prisma.scanCertificate.deleteMany({});
  await prisma.scanResult.deleteMany({});
  await prisma.notificationLog.deleteMany({});
  await prisma.webhookDelivery.deleteMany({});
  await prisma.webhook.deleteMany({});
  await prisma.apiKey.deleteMany({});
  await prisma.auditLog.deleteMany({});
  await prisma.dispute.deleteMany({});
  await prisma.cargoItem.deleteMany({});
  await prisma.consignee.deleteMany({});
  await prisma.shipment.deleteMany({});
  await prisma.subscription.deleteMany({});
  await prisma.warehouse.deleteMany({});
  await prisma.user.deleteMany({});
  await prisma.organization.deleteMany({});

  // ─── Stormglide Logistics (BUSINESS) ─────────────────────────────────────
  const stormglide = await prisma.organization.create({
    data: {
      name: 'Stormglide Logistics',
      slug: 'stormglide',
      country: 'Ghana',
      city: 'Accra',
      plan: 'BUSINESS',
      defaultCbmRate: 85.0,
    },
  });

  await prisma.user.create({
    data: {
      email: 'john@stormglide.com',
      name: 'John Mensah',
      password: await bcrypt.hash('Admin1234!', 10),
      role: 'ADMIN',
      organizationId: stormglide.id,
    },
  });
  await prisma.user.create({
    data: {
      email: 'ama@stormglide.com',
      name: 'Ama Owusu',
      password: await bcrypt.hash('Ama12345!', 10),
      role: 'SUPERVISOR',
      organizationId: stormglide.id,
    },
  });
  await prisma.user.create({
    data: {
      email: 'james@stormglide.com',
      name: 'James Asante',
      password: await bcrypt.hash('Ops12345!', 10),
      role: 'OPERATOR',
      organizationId: stormglide.id,
    },
  });

  const wh1 = await prisma.warehouse.create({
    data: { name: 'Accra Warehouse', organizationId: stormglide.id },
  });

  const shipment = await prisma.shipment.create({
    data: {
      code: 'SHP-2026-001',
      from: 'Guangzhou',
      to: 'Tema',
      cbmCapacity: 67.2,
      status: 'OPEN',
      organizationId: stormglide.id,
      warehouseId: wh1.id,
    },
  });

  await prisma.cargoItem.createMany({
    data: [
      { length: 1.2, width: 1.0, height: 1.5, cbm: 1.8,   scanConfidence: 0.98, shipmentId: shipment.id },
      { length: 0.8, width: 0.8, height: 0.8, cbm: 0.512, scanConfidence: 0.95, shipmentId: shipment.id },
      { length: 2.0, width: 1.2, height: 1.0, cbm: 2.4,   scanConfidence: 0.92, shipmentId: shipment.id },
      { length: 0.5, width: 0.5, height: 0.5, cbm: 0.125, scanConfidence: 0.99, shipmentId: shipment.id },
    ],
  });

  // ─── FastFreight GH (TRIAL — 7 days left) ────────────────────────────────
  const fastfreight = await prisma.organization.create({
    data: {
      name: 'FastFreight GH',
      slug: 'fastfreight',
      country: 'Ghana',
      city: 'Kumasi',
      plan: 'TRIAL',
      planExpiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      defaultCbmRate: 85.0,
    },
  });

  await prisma.user.create({
    data: {
      email: 'eric@fastfreight.com',
      name: 'Eric Boateng',
      password: await bcrypt.hash('Eric1234!', 10),
      role: 'ADMIN',
      organizationId: fastfreight.id,
    },
  });

  const wh2 = await prisma.warehouse.create({
    data: { name: 'Kumasi Warehouse', organizationId: fastfreight.id },
  });

  // ─── Guangzhou Premier (ENTERPRISE) ──────────────────────────────────────
  const guangzhou = await prisma.organization.create({
    data: {
      name: 'Guangzhou Premier',
      slug: 'guangzhou-premier',
      country: 'China',
      city: 'Guangzhou',
      plan: 'ENTERPRISE',
      defaultCbmRate: 90.0,
    },
  });

  await prisma.user.create({
    data: {
      email: 'wei@guangzhou.com',
      name: 'Wei Zhang',
      password: await bcrypt.hash('WeiAdmin99!', 10),
      role: 'ADMIN',
      organizationId: guangzhou.id,
    },
  });

  const wh3 = await prisma.warehouse.create({
    data: { name: 'Guangzhou Hub', organizationId: guangzhou.id },
  });

  console.log('Seeding complete!');
  console.log('');
  console.log('Demo accounts:');
  console.log('  john@stormglide.com  /  Admin1234!  (ADMIN, BUSINESS)');
  console.log('  ama@stormglide.com   /  Ama12345!   (SUPERVISOR, BUSINESS)');
  console.log('  james@stormglide.com /  Ops12345!   (OPERATOR, BUSINESS)');
  console.log('  eric@fastfreight.com /  Eric1234!   (ADMIN, TRIAL)');
  console.log('  wei@guangzhou.com    /  WeiAdmin99! (ADMIN, ENTERPRISE)');
  console.log('');
  console.log('Shipment: SHP-2026-001 (stormglide)');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
