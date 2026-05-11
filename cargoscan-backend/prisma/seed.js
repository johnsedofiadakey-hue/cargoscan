const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcrypt');
const prisma = new PrismaClient();

async function main() {
  console.log('Seeding database...');

  // Clear existing data
  await prisma.cargoItem.deleteMany({});
  await prisma.shipment.deleteMany({});
  await prisma.warehouse.deleteMany({});
  await prisma.user.deleteMany({});
  await prisma.organization.deleteMany({});

  const passwordHash = await bcrypt.hash('password123', 10);

  // 1. Create Organizations
  const stormglide = await prisma.organization.create({
    data: {
      name: 'Stormglide Freight',
      slug: 'stormglide',
      country: 'Ghana',
      city: 'Accra',
      plan: 'BUSINESS',
    },
  });

  const fastfreight = await prisma.organization.create({
    data: {
      name: 'FastFreight Solutions',
      slug: 'fastfreight',
      country: 'China',
      city: 'Guangzhou',
      plan: 'TRIAL',
    },
  });

  const wei = await prisma.organization.create({
    data: {
      name: 'Wei International',
      slug: 'wei',
      country: 'Ghana',
      city: 'Tema',
      plan: 'STARTER',
    },
  });

  // 2. Create Users
  const user1 = await prisma.user.create({
    data: {
      email: 'admin@stormglide.com',
      name: 'John Doe',
      password: passwordHash,
      role: 'ADMIN',
      organizationId: stormglide.id,
    },
  });

  const user2 = await prisma.user.create({
    data: {
      email: 'op@stormglide.com',
      name: 'Operator 1',
      password: passwordHash,
      role: 'OPERATOR',
      organizationId: stormglide.id,
    },
  });

  const user3 = await prisma.user.create({
    data: {
      email: 'manager@fastfreight.com',
      name: 'Manager Smith',
      password: passwordHash,
      role: 'SUPERVISOR',
      organizationId: fastfreight.id,
    },
  });

  // 3. Create Warehouses
  const wh1 = await prisma.warehouse.create({
    data: {
      name: 'Accra Central Hub',
      organizationId: stormglide.id,
    },
  });

  // 4. Create Shipment
  const shipment = await prisma.shipment.create({
    data: {
      code: 'SHP-2026-001',
      from: 'Guangzhou',
      to: 'Tema',
      cbmCapacity: 68.0, // 40HC container approx
      status: 'OPEN',
      organizationId: stormglide.id,
      warehouseId: wh1.id,
    },
  });

  // 5. Create Cargo Items
  await prisma.cargoItem.createMany({
    data: [
      {
        length: 1.2,
        width: 1.0,
        height: 1.5,
        cbm: 1.8,
        scanConfidence: 0.98,
        shipmentId: shipment.id,
      },
      {
        length: 0.8,
        width: 0.8,
        height: 0.8,
        cbm: 0.512,
        scanConfidence: 0.95,
        shipmentId: shipment.id,
      },
      {
        length: 2.0,
        width: 1.2,
        height: 1.0,
        cbm: 2.4,
        scanConfidence: 0.92,
        shipmentId: shipment.id,
      },
      {
        length: 0.5,
        width: 0.5,
        height: 0.5,
        cbm: 0.125,
        scanConfidence: 0.99,
        shipmentId: shipment.id,
      },
    ],
  });

  console.log('Seeding complete!');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
