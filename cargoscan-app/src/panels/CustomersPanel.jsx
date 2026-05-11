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

export default function CustomersPanel({ shipmentId }) {
  const [consignees, setConsignees] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!shipmentId) return;

    const token = localStorage.getItem("cs_token");
    if (!token) return;

    setLoading(true);
    fetch(`${API_BASE}/consignees?shipmentId=${shipmentId}`, {
      headers: { "Authorization": `Bearer ${token}` }
    })
      .then(r => r.json())
      .then(data => {
        if (Array.isArray(data)) setConsignees(data);
        setLoading(false);
      })
      .catch(err => {
        console.error("Failed to fetch consignees:", err);
        setLoading(false);
      });
  }, [shipmentId]);

  return (
    <div style={{ padding: 24, background: C.s1, borderRadius: 12, border: `1px solid ${C.bd}` }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
        <div>
          <h2 style={{ fontSize: 20, fontWeight: 800, letterSpacing: "-.03em", marginBottom: 4 }}>Customers (Consignees)</h2>
          <p style={{ color: C.mid, fontSize: 13 }}>Manage consignees attached to this shipment.</p>
        </div>
        <button style={{ background: C.blue, color: "#fff", border: "none", padding: "8px 16px", borderRadius: 6, fontWeight: 600, cursor: "pointer" }}>
          Add Consignee
        </button>
      </div>

      {loading && <p style={{ color: C.mid }}>Loading...</p>}

      {!loading && (
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ borderBottom: `1px solid ${C.bd}`, color: C.mid, fontSize: 12, textAlign: "left" }}>
              <th style={{ padding: "12px 8px" }}>Name</th>
              <th style={{ padding: "12px 8px" }}>Phone</th>
              <th style={{ padding: "12px 8px" }}>Email</th>
              <th style={{ padding: "12px 8px" }}>WhatsApp Opt-In</th>
            </tr>
          </thead>
          <tbody>
            {consignees.map(c => (
              <tr key={c.id} style={{ borderBottom: `1px solid ${C.bd}`, fontSize: 13 }}>
                <td style={{ padding: "12px 8px", fontWeight: 600 }}>{c.name}</td>
                <td style={{ padding: "12px 8px", color: C.mid }}>{c.phone}</td>
                <td style={{ padding: "12px 8px", color: C.mid }}>{c.email || "-"}</td>
                <td style={{ padding: "12px 8px" }}>
                  <span style={{ color: c.whatsappOptIn ? C.green : C.red }}>
                    {c.whatsappOptIn ? "✓ Opted In" : "✗ No"}
                  </span>
                </td>
              </tr>
            ))}
            {consignees.length === 0 && (
              <tr>
                <td colSpan="4" style={{ padding: "24px 8px", textAlign: "center", color: C.mid }}>No consignees found for this shipment.</td>
              </tr>
            )}
          </tbody>
        </table>
      )}
    </div>
  );
}
