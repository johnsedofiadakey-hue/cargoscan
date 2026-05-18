const crypto = require("crypto");
const prisma = require("./prisma");

/**
 * Sorts object keys alphabetically to ensure consistent JSON stringification.
 */
function canonicalize(obj) {
  const keys = Object.keys(obj).sort();
  const sortedObj = {};
  keys.forEach(key => {
    sortedObj[key] = obj[key];
  });
  return sortedObj;
}

/**
 * Issues a tamper-proof scan certificate.
 * @param {object} params
 * @param {string} params.cargoItemId
 * @param {object} params.payload - The data to be certified
 */
async function issue({ cargoItemId, payload }) {
  const canonical = JSON.stringify(canonicalize(payload));
  const hash = crypto.createHash("sha256").update(canonical).digest("hex");
  
  return prisma.scanCertificate.upsert({
    where: { hash },
    update: {},
    create: {
      cargoItemId,
      hash,
      payload: canonical,
    },
  });
}

module.exports = { issue };
