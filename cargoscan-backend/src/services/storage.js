// Note: Requires @supabase/supabase-js to be installed if using Supabase
let createClient;
try {
  createClient = require("@supabase/supabase-js").createClient;
} catch (e) {
  // Fallback if module not found (will fail at runtime if provider is supabase)
  createClient = null;
}

const requestedProvider = process.env.STORAGE_PROVIDER || "local";
let provider = requestedProvider;

let supabase;
if (requestedProvider === "supabase") {
  if (!createClient) {
    console.warn("[storage] @supabase/supabase-js unavailable, falling back to local upload storage");
    provider = "local";
  } else if (!process.env.SUPABASE_URL || !process.env.SUPABASE_KEY) {
    console.warn("[storage] SUPABASE_URL/SUPABASE_KEY missing, falling back to local upload storage");
    provider = "local";
  } else {
    supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);
  }
}

if (provider === "local" && process.env.NODE_ENV === "production" && requestedProvider === "local" && process.env.ALLOW_LOCAL_STORAGE !== "true") {
  throw new Error("Local scan photo storage is disabled in production. Configure Supabase/S3-compatible storage.");
}

const presignUpload = async ({ key, mimeType }) => {
  if (provider === "supabase") {
    if (!supabase) {
      throw new Error("Supabase client not initialized. Is @supabase/supabase-js installed?");
    }
    
    // Create signed upload URL (valid for 15 mins)
    const { data, error } = await supabase.storage
      .from("cargoscan-photos")
      .createSignedUploadUrl(key);

    if (error) throw error;

    return {
      uploadUrl: data.signedUrl,
      publicUrl: `${process.env.SUPABASE_URL}/storage/v1/object/public/cargoscan-photos/${key}`,
      expiresAt: new Date(Date.now() + 15 * 60 * 1000),
    };
  } else {
    // Local fallback
    const apiUrl = process.env.API_PUBLIC_URL || process.env.VITE_API_URL || "http://localhost:5000";
    const publicUrl = `${apiUrl}/api/scans/uploads/${encodeURIComponent(key)}`;
    return {
      uploadUrl: `${apiUrl}/api/scans/upload-local?key=${encodeURIComponent(key)}`,
      publicUrl,
      expiresAt: new Date(Date.now() + 15 * 60 * 1000),
    };
  }
};

const getPublicUrl = (key) => {
  if (provider === "supabase") {
    return `${process.env.SUPABASE_URL}/storage/v1/object/public/cargoscan-photos/${key}`;
  } else {
    const apiUrl = process.env.API_PUBLIC_URL || process.env.VITE_API_URL || "http://localhost:5000";
    return `${apiUrl}/api/scans/uploads/${encodeURIComponent(key)}`;
  }
};

module.exports = { presignUpload, getPublicUrl };
