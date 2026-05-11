const LIMITS = {
  TRIAL: {
    users: 2,
    shipmentsPerMonth: 5,
    itemsPerMonth: 50,
    apiKeys: 1,
    webhooks: 1,
    whatsapp: false,
    disputes: false,
  },
  STARTER: {
    users: 3,
    shipmentsPerMonth: 30,
    itemsPerMonth: Infinity,
    apiKeys: 5,
    webhooks: 5,
    whatsapp: false,
    disputes: false,
  },
  BUSINESS: {
    users: 10,
    shipmentsPerMonth: 200,
    itemsPerMonth: Infinity,
    apiKeys: 20,
    webhooks: 20,
    whatsapp: true,
    disputes: true,
  },
  ENTERPRISE: {
    users: Infinity,
    shipmentsPerMonth: Infinity,
    itemsPerMonth: Infinity,
    apiKeys: Infinity,
    webhooks: Infinity,
    whatsapp: true,
    disputes: true,
  },
};

module.exports = { LIMITS };
