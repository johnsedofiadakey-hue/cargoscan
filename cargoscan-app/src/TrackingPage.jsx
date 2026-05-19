import React, { useState, useEffect } from "react";

const C = {
  blue: "#0A84FF",
  dark: "#000000",
  light: "#FFFFFF",
  gray: "#8E8E93",
  lightGray: "#F2F2F7",
  success: "#34C759",
  warning: "#FF9500",
  danger: "#FF3B30",
  bd: "rgba(0,0,0,0.05)",
  s2: "#F9F9FB",
  mid: "#555",
  mono: "SFMono-Regular, Consolas, 'Liberation Mono', Menlo, Courier, monospace"
};

export default function TrackingPage({ apiBase = import.meta.env.VITE_API_URL || "http://localhost:5000/api" }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [trackingData, setTrackingData] = useState(null);
  const [copied, setCopied] = useState(false);
  
  const code = window.location.pathname.split("/").pop();
  
  useEffect(() => {
    async function fetchTracking() {
      try {
        const res = await fetch(`${apiBase}/tracking/${code}`);
        const data = await res.json();
        
        if (!res.ok) {
          throw new Error(data.error || "Failed to fetch tracking data");
        }
        
        setTrackingData(data);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }
    
    if (code) {
      fetchTracking();
    } else {
      setLoading(false);
      setError("No tracking code provided");
    }
  }, [apiBase, code]);
  
  if (loading) {
    return (
      <div style={{ display: "flex", justifyContent: "center", alignItems: "center", height: "100vh", background: C.s2 }}>
        <div style={{ textAlign: "center" }}>
          <div className="spinner" style={{ width: 40, height: 40, border: `3px solid ${C.bd}`, borderTopColor: C.blue, borderRadius: "50%", animation: "spin 1s linear infinite", margin: "0 auto 16px" }} />
          <p style={{ color: C.mid, fontSize: 14 }}>Fetching tracking details...</p>
        </div>
        <style>{`
          @keyframes spin { to { transform: rotate(360deg); } }
        `}</style>
      </div>
    );
  }
  
  if (error) {
    return (
      <div style={{ display: "flex", justifyContent: "center", alignItems: "center", height: "100vh", background: C.s2, padding: 20 }}>
        <div style={{ background: "#fff", padding: "32px 24px", borderRadius: 16, width: "100%", maxWidth: 400, textAlign: "center", boxShadow: "0 4px 20px rgba(0,0,0,0.05)" }}>
          <div style={{ fontSize: 40, marginBottom: 16 }}>🔍</div>
          <h1 style={{ fontSize: 20, fontWeight: 700, marginBottom: 8 }}>Tracking Not Found</h1>
          <p style={{ color: C.mid, fontSize: 14, marginBottom: 24 }}>{error}</p>
          <a href="/" style={{ display: "inline-block", background: C.blue, color: "#fff", padding: "12px 24px", borderRadius: 8, fontSize: 14, fontWeight: 600, textDecoration: "none" }}>Go to Homepage</a>
        </div>
      </div>
    );
  }
  
  const { type, data } = trackingData;
  const isShipment = type === "shipment";
  async function shareLink() {
    await navigator.clipboard.writeText(window.location.href);
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  }
  const timeline = data.timeline?.length ? data.timeline : [{ status: data.status, note: "Latest update", timestamp: data.updatedAt || data.createdAt }];
  
  return (
    <div style={{ background: C.s2, minHeight: "100vh", padding: "20px 16px" }}>
      <div style={{ maxWidth: 600, margin: "0 auto" }}>
        
        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: C.blue, letterSpacing: "0.1em", textTransform: "uppercase" }}>CargoScan Tracking</div>
            <h1 style={{ fontSize: 24, fontWeight: 800, letterSpacing: "-.02em" }}>{isShipment ? "Shipment" : "Item"} Details</h1>
          </div>
          <div style={{ background: C.blue, color: "#fff", width: 40, height: 40, borderRadius: 10, display: "flex", justifyContent: "center", alignItems: "center", fontWeight: 800, fontSize: 20 }}>C</div>
        </div>
        
        {/* Main Card */}
        <div style={{ background: "#fff", borderRadius: 16, padding: 20, marginBottom: 16, boxShadow: "0 2px 12px rgba(0,0,0,0.03)", border: `1px solid ${C.bd}` }}>
          
          {/* Status */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20, paddingBottom: 16, borderBottom: `1px solid ${C.bd}` }}>
            <div>
              <div style={{ fontSize: 11, color: C.gray, textTransform: "uppercase", letterSpacing: ".05em" }}>Current Status</div>
              <div style={{ fontSize: 18, fontWeight: 700, color: data.status === "DELIVERED" ? C.success : C.blue }}>{data.status}</div>
            </div>
            <div style={{ fontFamily: C.mono, fontSize: 12, fontWeight: 700, background: C.lightGray, padding: "6px 12px", borderRadius: 6 }}>
              {isShipment ? data.code : (data.trackingCode || data.id).substring(0, 12)}
            </div>
          </div>
          <button onClick={shareLink} style={{ width: "100%", border: 0, background: copied ? C.success : C.blue, color: "#fff", padding: "12px 16px", borderRadius: 10, fontWeight: 700, marginBottom: 16 }}>
            {copied ? "Copied!" : "Share tracking link"}
          </button>
          {isShipment && data.damagedItems > 0 && (
            <div style={{ background: "#fff3cd", color: "#7a4b00", padding: 12, borderRadius: 10, marginBottom: 16, fontWeight: 700 }}>
              Damage reported on {data.damagedItems} item{data.damagedItems === 1 ? "" : "s"}.
            </div>
          )}
          
          {/* Details */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px 20px", marginBottom: 20 }}>
            <div>
              <div style={{ fontSize: 11, color: C.gray, textTransform: "uppercase" }}>Origin</div>
              <div style={{ fontSize: 14, fontWeight: 600 }}>{isShipment ? data.from : "Unknown"}</div>
            </div>
            <div>
              <div style={{ fontSize: 11, color: C.gray, textTransform: "uppercase" }}>Destination</div>
              <div style={{ fontSize: 14, fontWeight: 600 }}>{isShipment ? data.to : "Unknown"}</div>
            </div>
            <div>
              <div style={{ fontSize: 11, color: C.gray, textTransform: "uppercase" }}>Total CBM</div>
            <div style={{ fontSize: 14, fontWeight: 700, color: C.blue }}>{Number((isShipment ? data.cbm : data.cbm) || 0).toFixed(3)}</div>
            </div>
            <div>
              <div style={{ fontSize: 11, color: C.gray, textTransform: "uppercase" }}>Total Items</div>
              <div style={{ fontSize: 14, fontWeight: 600 }}>{isShipment ? data.items : 1}</div>
            </div>
          </div>
          
          {/* Timeline */}
          <div>
            <div style={{ fontSize: 11, color: C.gray, textTransform: "uppercase", marginBottom: 12 }}>Timeline</div>
            <div style={{ position: "relative", paddingLeft: 24 }}>
              <div style={{ position: "absolute", left: 7, top: 5, bottom: 5, width: 2, background: C.lightGray }} />
              
              {timeline.map((event, index) => (
                <div key={`${event.status}-${index}`} style={{ position: "relative", marginBottom: 16 }}>
                  <div style={{ position: "absolute", left: -21, top: 4, width: 10, height: 10, borderRadius: "50%", background: index === timeline.length - 1 ? C.success : C.blue }} />
                  <div style={{ fontSize: 14, fontWeight: 600 }}>{String(event.status).replaceAll("_", " ")}</div>
                  <div style={{ fontSize: 11, color: C.gray }}>{event.timestamp ? new Date(event.timestamp).toLocaleString() : "Timestamp pending"} · {event.note || "CargoScan update"}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
        
        {/* Items / Consignees */}
        {isShipment && data.cargoItems && data.cargoItems.length > 0 && (
          <div style={{ background: "#fff", borderRadius: 16, padding: 20, marginBottom: 16, boxShadow: "0 2px 12px rgba(0,0,0,0.03)", border: `1px solid ${C.bd}` }}>
            <div style={{ fontSize: 11, color: C.gray, textTransform: "uppercase", marginBottom: 12 }}>Cargo Items</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {data.cargoItems.map(item => (
                <div key={item.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 12px", background: C.s2, borderRadius: 8 }}>
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 600 }}>{item.description || `Item #${item.id.substring(0, 4)}`}</div>
                    <div style={{ fontSize: 10, color: C.gray, fontFamily: C.mono }}>
                      {[item.length, item.width, item.height].map((value) => value == null ? "?" : value).join("x")} cm
                    </div>
                  </div>
                  <div style={{ fontSize: 12, fontWeight: 700, color: C.blue }}>{Number(item.cbm || 0).toFixed(3)} CBM</div>
                </div>
              ))}
            </div>
          </div>
        )}
        
        {/* Footer */}
        <div style={{ textAlign: "center", padding: "20px 0", borderTop: `1px solid ${C.bd}` }}>
          <div style={{ fontSize: 12, color: C.gray, marginBottom: 4 }}>Verified scan data powered by LiDAR</div>
          <div style={{ fontSize: 10, color: C.gray }}>CargoScan · Freight Intelligence Platform</div>
        </div>
        
      </div>
    </div>
  );
}
