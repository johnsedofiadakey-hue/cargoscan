const admin = require("firebase-admin");

const getFirebaseAdmin = () => {
  if (admin.apps.length) return admin;

  const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  const projectId = process.env.FIREBASE_PROJECT_ID || "cargoscan-app-2026";

  if (serviceAccountJson) {
    admin.initializeApp({
      credential: admin.credential.cert(JSON.parse(serviceAccountJson)),
      projectId,
    });
  } else {
    admin.initializeApp({ projectId });
  }

  return admin;
};

const verifyFirebaseIdToken = async (idToken) => {
  const firebase = getFirebaseAdmin();
  return firebase.auth().verifyIdToken(idToken);
};

module.exports = { verifyFirebaseIdToken };
