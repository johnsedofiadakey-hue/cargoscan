const { PrismaClient } = require("@prisma/client");

const prisma = global.__cargoscanPrisma || new PrismaClient();

if (process.env.NODE_ENV !== "production") {
  global.__cargoscanPrisma = prisma;
}

module.exports = prisma;
