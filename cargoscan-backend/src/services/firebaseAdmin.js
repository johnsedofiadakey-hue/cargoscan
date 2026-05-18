const https = require("node:https");
const jwt = require("jsonwebtoken");

const PROJECT_ID = process.env.FIREBASE_PROJECT_ID || "cargoscan-app-2026";
const CERTS_URL = "https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com";
const ISSUER = `https://securetoken.google.com/${PROJECT_ID}`;

let cachedCerts = null;
let cachedCertsExpiry = 0;

function fetchJson(url) {
  return new Promise((resolve, reject) => {
    https
      .get(url, (res) => {
        const chunks = [];
        res.on("data", (chunk) => chunks.push(chunk));
        res.on("end", () => {
          try {
            const body = Buffer.concat(chunks).toString("utf8");
            resolve({
              statusCode: res.statusCode || 0,
              headers: res.headers,
              body,
            });
          } catch (error) {
            reject(error);
          }
        });
      })
      .on("error", reject);
  });
}

async function loadCerts(forceRefresh = false) {
  const now = Date.now();
  if (!forceRefresh && cachedCerts && cachedCertsExpiry > now) {
    return cachedCerts;
  }

  const response = await fetchJson(CERTS_URL);
  if (response.statusCode < 200 || response.statusCode >= 300) {
    throw new Error(`Unable to load Firebase certs (${response.statusCode})`);
  }

  cachedCerts = JSON.parse(response.body);

  const cacheControl = response.headers["cache-control"] || "";
  const maxAgeMatch = /max-age=(\d+)/i.exec(Array.isArray(cacheControl) ? cacheControl.join(",") : cacheControl);
  const ttlMs = maxAgeMatch ? Number(maxAgeMatch[1]) * 1000 : 60 * 60 * 1000;
  cachedCertsExpiry = now + ttlMs;

  return cachedCerts;
}

async function verifyFirebaseIdToken(idToken) {
  const decoded = jwt.decode(idToken, { complete: true });
  if (!decoded || !decoded.header || !decoded.header.kid) {
    throw new Error("Invalid Firebase token");
  }

  const certs = await loadCerts();
  let cert = certs[decoded.header.kid];

  if (!cert) {
    const refreshedCerts = await loadCerts(true);
    cert = refreshedCerts[decoded.header.kid];
  }

  if (!cert) {
    throw new Error("Firebase certificate not found");
  }

  return jwt.verify(idToken, cert, {
    algorithms: ["RS256"],
    audience: PROJECT_ID,
    issuer: ISSUER,
  });
}

module.exports = { verifyFirebaseIdToken };
