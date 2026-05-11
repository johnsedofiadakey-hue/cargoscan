// Note: Requires @supabase/supabase-js to be installed if using Supabase
let createClient;
try {
  createClient = require("@supabase/supabase-js").createClient;
} catch (e) {
  // Fallback if module not found (will fail at runtime if provider is supabase)
  createClient = null;
}

const provider = process.env.STORAGE_PROVIDER || "local";

let supabase;
if (provider === "supabase" && createClient) {
  supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);
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
    const publicUrl = `${process.env.VITE_API_URL || "http://localhost:5000"}/uploads/${key}`;
    return {
      uploadUrl: `${process.env.VITE_API_URL || "http://localhost:5000"}/api/scans/upload-local?key=${key}`,
      publicUrl,
      expiresAt: new Date(Date.now() + 15 * 60 * 1000),
    };
  }
};

const getPublicUrl = (key) => {
  if (provider === "supabase") {
    return `${process.env.SUPABASE_URL}/storage/v1/object/public/cargoscan-photos/${key}`;
  } else {
    return `${process.env.VITE_API_URL || "http://localhost:5000"}/uploads/${key}`;
  }
};

module.exports = { presignUpload, getPublicUrl };
