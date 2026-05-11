import React, { useState, useEffect } from "react";

const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:3000/api";

const C = {
  bg: "#030609", s1: "#070B12", s2: "#0C1219", s3: "#101820",
  bd: "#152030", bd2: "#1C2D42",
  blue: "#2F7EFF", blueHov: "#1A6AEE", blueGlow: "rgba(47,126,255,.18)",
  green: "#00D48A", greenD: "#00A86D",
  red: "#FF2D55", amber: "#FFB020", purple: "#8B5FFF", cyan: "#00CCDD",
  orange: "#FF6B2B",
  txt: "#E8F0FF", mid: "#4E6080", muted: "#2A3A50", dim: "#0A1018",
  font: "'Instrument Sans',sans-serif",
  mono: "'Fira Code',monospace",
};

export default function DevelopersPanel() {
  const [activeTab, setActiveTab] = useState("keys");
  const [keys, setKeys] = useState([]);
  const [webhooks, setWebhooks] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const token = localStorage.getItem("cs_token");
    if (!token) return;

    setLoading(true);
    Promise.all([
      fetch(`${API_BASE}/apiKeys`, { headers: { "Authorization": `Bearer ${token}` } }).then(r => r.json()),
      fetch(`${API_BASE}/webhooks`, { headers: { "Authorization": `Bearer ${token}` } }).then(r => r.json())
    ]).then(([keysData, webhooksData]) => {
      if (Array.isArray(keysData)) setKeys(keysData);
      if (Array.isArray(webhooksData)) setWebhooks(webhooksData);
      setLoading(false);
    }).catch(err => {
      console.error("Failed to fetch dev data:", err);
      setLoading(false);
    });
  }, []);

  return (
    <div style={{ padding: 24, background: C.s1, borderRadius: 12, border: `1px solid ${C.bd}` }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
        <div>
          <h2 style={{ fontSize: 24, fontWeight: 800, letterSpacing: "-.03em", marginBottom: 4 }}>Developer Settings</h2>
          <p style={{ color: C.mid, fontSize: 13 }}>Manage API keys and webhooks for your organization.</p>
        </div>
      </div>

      {/* Sub-tabs */}
      <div style={{ display: "flex", gap: 16, borderBottom: `1px solid ${C.bd}`, marginBottom: 24 }}>
        {[
          { id: "keys", label: "API Keys" },
          { id: "webhooks", label: "Webhooks" },
          { id: "docs", label: "Documentation" }
        ].map(t => (
          <div
            key={t.id}
            onClick={() => setActiveTab(t.id)}
            style={{
              padding: "12px 4px",
              fontSize: 14,
              fontWeight: 600,
              color: activeTab === t.id ? C.blue : C.mid,
              borderBottom: `2px solid ${activeTab === t.id ? C.blue : "transparent"}`,
              cursor: "pointer",
              transition: "all 0.2s"
            }}
          >
            {t.label}
          </div>
        ))}
      </div>

      {loading && <p style={{ color: C.mid }}>Loading...</p>}

      {!loading && activeTab === "keys" && (
        <div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
            <h3 style={{ fontSize: 16, fontWeight: 700 }}>Active API Keys</h3>
            <button style={{ background: C.blue, color: "#fff", border: "none", padding: "8px 16px", borderRadius: 6, fontWeight: 600, cursor: "pointer" }}>
              Create Key
            </button>
          </div>

          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ borderBottom: `1px solid ${C.bd}`, color: C.mid, fontSize: 12, textAlign: "left" }}>
                <th style={{ padding: "12px 8px" }}>Name</th>
                <th style={{ padding: "12px 8px" }}>Key</th>
                <th style={{ padding: "12px 8px" }}>Scopes</th>
                <th style={{ padding: "12px 8px" }}>Created</th>
              </tr>
            </thead>
            <tbody>
              {keys.map(k => (
                <tr key={k.id} style={{ borderBottom: `1px solid ${C.bd}`, fontSize: 13 }}>
                  <td style={{ padding: "12px 8px", fontWeight: 600 }}>{k.name}</td>
                  <td style={{ padding: "12px 8px", fontFamily: C.mono }}>{k.prefix}...</td>
                  <td style={{ padding: "12px 8px" }}>
                    <span style={{ background: `${C.blue}20`, color: C.blue, padding: "2px 6px", borderRadius: 4, fontSize: 11 }}>{k.scopes}</span>
                  </td>
                  <td style={{ padding: "12px 8px", color: C.mid }}>{new Date(k.createdAt).toLocaleDateString()}</td>
                </tr>
              ))}
              {keys.length === 0 && (
                <tr>
                  <td colSpan="4" style={{ padding: "24px 8px", textAlign: "center", color: C.mid }}>No API keys found.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {!loading && activeTab === "webhooks" && (
        <div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
            <h3 style={{ fontSize: 16, fontWeight: 700 }}>Configured Endpoints</h3>
            <button style={{ background: C.blue, color: "#fff", border: "none", padding: "8px 16px", borderRadius: 6, fontWeight: 600, cursor: "pointer" }}>
              Add Endpoint
            </button>
          </div>

          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ borderBottom: `1px solid ${C.bd}`, color: C.mid, fontSize: 12, textAlign: "left" }}>
                <th style={{ padding: "12px 8px" }}>Name</th>
                <th style={{ padding: "12px 8px" }}>URL</th>
                <th style={{ padding: "12px 8px" }}>Events</th>
                <th style={{ padding: "12px 8px" }}>Created</th>
              </tr>
            </thead>
            <tbody>
              {webhooks.map(w => (
                <tr key={w.id} style={{ borderBottom: `1px solid ${C.bd}`, fontSize: 13 }}>
                  <td style={{ padding: "12px 8px", fontWeight: 600 }}>{w.name}</td>
                  <td style={{ padding: "12px 8px", color: C.mid }}>{w.url}</td>
                  <td style={{ padding: "12px 8px" }}>
                    <span style={{ background: `${C.purple}20`, color: C.purple, padding: "2px 6px", borderRadius: 4, fontSize: 11 }}>{w.eventFilter}</span>
                  </td>
                  <td style={{ padding: "12px 8px", color: C.mid }}>{new Date(w.createdAt).toLocaleDateString()}</td>
                </tr>
              ))}
              {webhooks.length === 0 && (
                <tr>
                  <td colSpan="4" style={{ padding: "24px 8px", textAlign: "center", color: C.mid }}>No webhooks configured.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {!loading && activeTab === "docs" && (
        <div>
          <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 16 }}>API Documentation</h3>
          <p style={{ color: C.mid, fontSize: 14, lineHeight: 1.6 }}>
            To access the CargoScan API, you need to include your API key in the <code>Authorization</code> header of your requests:
          </p>
          <pre style={{ background: C.s2, padding: 12, borderRadius: 6, fontFamily: C.mono, fontSize: 12, color: C.blue, marginTop: 8 }}>
            Authorization: Bearer ck_live_...
          </pre>
          <p style={{ color: C.mid, fontSize: 14, lineHeight: 1.6, marginTop: 16 }}>
            Refer to the full documentation at <code>docs.cargoscan.app</code> for more details.
          </p>
        </div>
      )}
    </div>
  );
}
