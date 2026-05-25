import React, { useState, useEffect } from "react";

/* ─── Design tokens (mirror App.css) ─── */
const T = {
  bg:        "#060c18",
  bg2:       "#0b1526",
  bg3:       "#0f1d35",
  glass:     "rgba(255,255,255,0.035)",
  glassB:    "rgba(255,255,255,0.075)",
  glassB2:   "rgba(255,255,255,0.14)",
  brand:     "#0ecfb0",
  brandDim:  "rgba(14,207,176,0.14)",
  indigo:    "#6d6aff",
  indigoDim: "rgba(109,106,255,0.15)",
  text:      "#eef4ff",
  text2:     "#7e9bc0",
  text3:     "#3d5373",
  green:     "#10d9a0",
  greenDim:  "rgba(16,217,160,0.12)",
  amber:     "#f5b731",
  amberDim:  "rgba(245,183,49,0.12)",
  red:       "#ff6b6b",
  redDim:    "rgba(255,107,107,0.12)",
  r:         "14px",
  rSm:       "10px",
  mono:      "SFMono-Regular, Consolas, 'Liberation Mono', Menlo, Courier, monospace",
};

const STATUS_COLORS = {
  DELIVERED:   { bg: T.greenDim, border: "rgba(16,217,160,0.25)", text: T.green },
  IN_TRANSIT:  { bg: T.brandDim, border: "rgba(14,207,176,0.25)", text: T.brand },
  ARRIVED:     { bg: T.brandDim, border: "rgba(14,207,176,0.25)", text: T.brand },
  SEALED:      { bg: T.indigoDim, border: "rgba(109,106,255,0.25)", text: T.indigo },
  LOADING:     { bg: T.indigoDim, border: "rgba(109,106,255,0.25)", text: T.indigo },
  OPEN:        { bg: "rgba(92,164,255,0.10)", border: "rgba(92,164,255,0.22)", text: "#5ca4ff" },
  DEFAULT:     { bg: T.glass, border: T.glassB, text: T.text2 },
};

function statusColor(status) {
  return STATUS_COLORS[status] || STATUS_COLORS.DEFAULT;
}

const globalStyles = `
  @import url("https://api.fontshare.com/v2/css?f[]=satoshi@700,800,900&display=swap");
  @import url("https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap");

  @keyframes spin { to { transform: rotate(360deg); } }
  @keyframes fadeUp { from { opacity: 0; transform: translateY(16px); } to { opacity: 1; transform: translateY(0); } }
  @keyframes shimmer { 0%,100% { opacity: 0.6; } 50% { opacity: 1; } }
  @keyframes pulseGlow {
    0%,100% { box-shadow: 0 0 0 0 rgba(14,207,176,0); }
    50%      { box-shadow: 0 0 20px 4px rgba(14,207,176,0.22); }
  }
  @keyframes scanLine {
    0%   { transform: translateY(-100%); opacity: 0; }
    10%  { opacity: 1; }
    90%  { opacity: 1; }
    100% { transform: translateY(100vh); opacity: 0; }
  }

  .tracking-root * { box-sizing: border-box; margin: 0; padding: 0; }
  .tracking-root {
    font-family: "Inter", system-ui, sans-serif;
    background:
      radial-gradient(ellipse 80% 60% at 20% -10%, rgba(14,207,176,0.08), transparent 50%),
      radial-gradient(ellipse 70% 50% at 90% 110%, rgba(109,106,255,0.10), transparent 55%),
      ${T.bg};
    min-height: 100vh;
    color: ${T.text};
    overflow-x: hidden;
  }

  .track-inner {
    max-width: 620px;
    margin: 0 auto;
    padding: 32px 16px 64px;
    animation: fadeUp 0.5s ease both;
  }

  /* ── Header ── */
  .track-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 32px;
  }
  .track-brand {
    display: flex;
    align-items: center;
    gap: 10px;
  }
  .track-brand-mark {
    width: 40px;
    height: 40px;
    border-radius: 12px;
    background: linear-gradient(135deg, ${T.brand}, ${T.indigo});
    display: flex;
    align-items: center;
    justify-content: center;
    font-family: "Satoshi", sans-serif;
    font-weight: 900;
    font-size: 17px;
    color: #fff;
    box-shadow: 0 0 24px rgba(14,207,176,0.28);
  }
  .track-brand-label strong {
    display: block;
    font-family: "Satoshi", sans-serif;
    font-size: 15px;
    font-weight: 900;
    color: ${T.text};
    letter-spacing: -0.03em;
  }
  .track-brand-label span {
    font-size: 10.5px;
    font-weight: 700;
    color: ${T.brand};
    letter-spacing: 0.1em;
    text-transform: uppercase;
  }
  .track-type-badge {
    padding: 5px 14px;
    border-radius: 99px;
    font-size: 11px;
    font-weight: 800;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    background: ${T.indigoDim};
    border: 1px solid rgba(109,106,255,0.25);
    color: ${T.indigo};
  }

  /* ── Glass card ── */
  .track-card {
    background: ${T.glass};
    backdrop-filter: blur(24px);
    -webkit-backdrop-filter: blur(24px);
    border: 1px solid ${T.glassB};
    border-radius: ${T.r};
    padding: 24px;
    margin-bottom: 16px;
  }

  /* ── Status hero ── */
  .track-status-hero {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    padding-bottom: 20px;
    margin-bottom: 20px;
    border-bottom: 1px solid ${T.glassB};
  }
  .track-status-pill {
    display: inline-flex;
    align-items: center;
    gap: 7px;
    padding: 6px 14px 6px 10px;
    border-radius: 99px;
    font-size: 12px;
    font-weight: 800;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    border: 1px solid;
  }
  .track-status-dot {
    width: 8px;
    height: 8px;
    border-radius: 99px;
    animation: pulseGlow 2s ease-in-out infinite;
    flex-shrink: 0;
  }
  .track-code {
    font-family: ${T.mono};
    font-size: 11.5px;
    font-weight: 700;
    color: ${T.text2};
    background: rgba(255,255,255,0.04);
    border: 1px solid ${T.glassB};
    padding: 6px 12px;
    border-radius: 8px;
    letter-spacing: 0.08em;
  }

  /* ── Share button ── */
  .track-share-btn {
    width: 100%;
    min-height: 44px;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    border-radius: ${T.rSm};
    font-size: 13.5px;
    font-weight: 700;
    transition: all 200ms;
    margin-bottom: 20px;
    cursor: pointer;
    border: 1px solid;
  }
  .track-share-btn.default {
    background: linear-gradient(135deg, ${T.brand}, ${T.indigo});
    border-color: transparent;
    color: #fff;
    box-shadow: 0 4px 20px rgba(14,207,176,0.22);
  }
  .track-share-btn.default:hover { transform: translateY(-1px); box-shadow: 0 8px 28px rgba(14,207,176,0.32); }
  .track-share-btn.copied {
    background: ${T.greenDim};
    border-color: rgba(16,217,160,0.30);
    color: ${T.green};
  }

  /* ── Damage warning ── */
  .track-damage-warn {
    display: flex;
    align-items: flex-start;
    gap: 10px;
    padding: 12px 14px;
    border-radius: ${T.rSm};
    background: ${T.amberDim};
    border: 1px solid rgba(245,183,49,0.25);
    color: ${T.amber};
    font-size: 13px;
    font-weight: 700;
    margin-bottom: 20px;
  }
  .track-damage-icon { font-size: 18px; flex-shrink: 0; line-height: 1; }

  /* ── Info grid ── */
  .track-info-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 16px 24px;
    margin-bottom: 24px;
  }
  .track-info-cell label {
    display: block;
    font-size: 10px;
    font-weight: 700;
    color: ${T.text3};
    letter-spacing: 0.1em;
    text-transform: uppercase;
    margin-bottom: 4px;
  }
  .track-info-cell .val {
    font-size: 15px;
    font-weight: 700;
    color: ${T.text};
  }
  .track-info-cell .val.accent {
    color: ${T.brand};
    font-family: "Satoshi", sans-serif;
    font-weight: 900;
  }

  /* ── Timeline ── */
  .track-timeline-head {
    font-size: 10px;
    font-weight: 700;
    color: ${T.text3};
    letter-spacing: 0.1em;
    text-transform: uppercase;
    margin-bottom: 16px;
  }
  .track-timeline {
    position: relative;
    padding-left: 26px;
  }
  .track-timeline-line {
    position: absolute;
    left: 8px;
    top: 8px;
    bottom: 8px;
    width: 1.5px;
    background: linear-gradient(to bottom, ${T.brand}, rgba(109,106,255,0.3));
    border-radius: 2px;
  }
  .track-tl-event {
    position: relative;
    margin-bottom: 20px;
    animation: fadeUp 0.4s ease both;
  }
  .track-tl-event:last-child { margin-bottom: 0; }
  .track-tl-dot {
    position: absolute;
    left: -22px;
    top: 4px;
    width: 12px;
    height: 12px;
    border-radius: 99px;
    border: 2px solid;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .track-tl-dot.latest {
    border-color: ${T.brand};
    background: ${T.brandDim};
    box-shadow: 0 0 10px rgba(14,207,176,0.4);
  }
  .track-tl-dot.past {
    border-color: ${T.text3};
    background: rgba(255,255,255,0.04);
  }
  .track-tl-status {
    font-size: 13.5px;
    font-weight: 700;
    color: ${T.text};
    margin-bottom: 2px;
  }
  .track-tl-meta {
    font-size: 11px;
    color: ${T.text2};
  }
  .track-tl-meta time { font-family: ${T.mono}; font-size: 10.5px; }

  /* ── Cargo items list ── */
  .track-items-head {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 14px;
  }
  .track-items-head span {
    font-size: 10px;
    font-weight: 700;
    color: ${T.text3};
    letter-spacing: 0.1em;
    text-transform: uppercase;
  }
  .track-items-count {
    padding: 3px 10px;
    border-radius: 99px;
    background: ${T.glass};
    border: 1px solid ${T.glassB};
    font-size: 10.5px;
    font-weight: 700;
    color: ${T.text2};
  }
  .track-items-list {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .track-item-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 12px 14px;
    background: rgba(255,255,255,0.02);
    border: 1px solid ${T.glassB};
    border-radius: ${T.rSm};
    transition: background 180ms, border-color 180ms;
  }
  .track-item-row:hover {
    background: rgba(255,255,255,0.045);
    border-color: ${T.glassB2};
  }
  .track-item-desc {
    font-size: 13px;
    font-weight: 600;
    color: ${T.text};
    margin-bottom: 3px;
  }
  .track-item-dims {
    font-family: ${T.mono};
    font-size: 10px;
    color: ${T.text3};
    letter-spacing: 0.04em;
  }
  .track-item-cbm {
    font-size: 13px;
    font-weight: 800;
    color: ${T.brand};
    white-space: nowrap;
    font-family: "Satoshi", sans-serif;
  }

  /* ── Footer ── */
  .track-footer {
    text-align: center;
    padding-top: 28px;
    border-top: 1px solid ${T.glassB};
    margin-top: 4px;
  }
  .track-footer-powered {
    font-size: 11.5px;
    color: ${T.text3};
    margin-bottom: 4px;
    font-weight: 600;
  }
  .track-footer-brand {
    font-size: 10.5px;
    color: ${T.text3};
    letter-spacing: 0.06em;
    font-weight: 700;
    text-transform: uppercase;
  }

  /* ── Full-screen states ── */
  .track-center {
    min-height: 100vh;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 24px;
  }
  .track-spinner {
    width: 44px;
    height: 44px;
    border: 3px solid rgba(255,255,255,0.06);
    border-top-color: ${T.brand};
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
    margin: 0 auto 16px;
  }
  .track-loading-text {
    font-size: 13.5px;
    color: ${T.text2};
    font-weight: 600;
    text-align: center;
  }
  .track-error-card {
    text-align: center;
    background: ${T.glass};
    backdrop-filter: blur(24px);
    border: 1px solid ${T.glassB};
    border-radius: ${T.r};
    padding: 40px 32px;
    max-width: 420px;
    width: 100%;
  }
  .track-error-icon { font-size: 48px; margin-bottom: 16px; }
  .track-error-title { font-family: "Satoshi", sans-serif; font-size: 22px; font-weight: 900; margin-bottom: 8px; color: ${T.text}; }
  .track-error-msg { font-size: 14px; color: ${T.text2}; margin-bottom: 24px; line-height: 1.5; }
  .track-home-link {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    background: linear-gradient(135deg, ${T.brand}, ${T.indigo});
    color: #fff;
    padding: 12px 24px;
    border-radius: ${T.rSm};
    font-size: 14px;
    font-weight: 700;
    text-decoration: none;
    transition: transform 200ms, box-shadow 200ms;
    box-shadow: 0 4px 20px rgba(14,207,176,0.22);
  }
  .track-home-link:hover { transform: translateY(-1px); box-shadow: 0 8px 28px rgba(14,207,176,0.32); }

  /* Responsive */
  @media (max-width: 480px) {
    .track-inner { padding: 20px 12px 48px; }
    .track-info-grid { grid-template-columns: 1fr; gap: 12px; }
    .track-header { flex-direction: column; align-items: flex-start; gap: 12px; }
  }
`;

function ShareIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/>
      <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/>
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12"/>
    </svg>
  );
}

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
        if (!res.ok) throw new Error(data.error || "Failed to fetch tracking data");
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

  async function shareLink() {
    await navigator.clipboard.writeText(window.location.href);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  }

  if (loading) {
    return (
      <div className="tracking-root">
        <style>{globalStyles}</style>
        <div className="track-center">
          <div>
            <div className="track-spinner" />
            <p className="track-loading-text">Fetching tracking details…</p>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="tracking-root">
        <style>{globalStyles}</style>
        <div className="track-center">
          <div className="track-error-card">
            <div className="track-error-icon">🔍</div>
            <h1 className="track-error-title">Shipment not found</h1>
            <p className="track-error-msg">{error}</p>
            <a href="/" className="track-home-link">Go to homepage</a>
          </div>
        </div>
      </div>
    );
  }

  const { type, data } = trackingData;
  const isShipment = type === "shipment";
  const sc = statusColor(data.status);
  const timeline = data.timeline?.length
    ? data.timeline
    : [{ status: data.status, note: "Latest update", timestamp: data.updatedAt || data.createdAt }];
  const displayCode = isShipment ? data.code : (data.trackingCode || data.id || "").substring(0, 16);
  const totalCbm = Number((isShipment ? data.cbm : data.cbm) || 0).toFixed(3);

  return (
    <div className="tracking-root">
      <style>{globalStyles}</style>
      <div className="track-inner">

        {/* ── Header ── */}
        <header className="track-header">
          <div className="track-brand">
            <div className="track-brand-mark">C</div>
            <div className="track-brand-label">
              <strong>CargoScan</strong>
              <span>Freight Intelligence</span>
            </div>
          </div>
          <div className="track-type-badge">{isShipment ? "Shipment" : "Item"} Tracker</div>
        </header>

        {/* ── Main card ── */}
        <div className="track-card">

          {/* Status hero */}
          <div className="track-status-hero">
            <div
              className="track-status-pill"
              style={{ background: sc.bg, borderColor: sc.border, color: sc.text }}
            >
              <span className="track-status-dot" style={{ background: sc.text }} />
              {String(data.status).replaceAll("_", " ")}
            </div>
            <div className="track-code">{displayCode}</div>
          </div>

          {/* Share */}
          <button
            className={`track-share-btn ${copied ? "copied" : "default"}`}
            onClick={shareLink}
          >
            {copied ? <CheckIcon /> : <ShareIcon />}
            {copied ? "Link copied!" : "Share tracking link"}
          </button>

          {/* Damage warning */}
          {isShipment && data.damagedItems > 0 && (
            <div className="track-damage-warn">
              <span className="track-damage-icon">⚠️</span>
              <span>
                Damage reported on <strong>{data.damagedItems} item{data.damagedItems === 1 ? "" : "s"}</strong>.
                Contact your freight agent for details.
              </span>
            </div>
          )}

          {/* Info grid */}
          <div className="track-info-grid">
            <div className="track-info-cell">
              <label>Origin</label>
              <div className="val">{isShipment ? (data.from || "—") : "—"}</div>
            </div>
            <div className="track-info-cell">
              <label>Destination</label>
              <div className="val">{isShipment ? (data.to || "—") : "—"}</div>
            </div>
            <div className="track-info-cell">
              <label>Total CBM</label>
              <div className="val accent">{totalCbm} m³</div>
            </div>
            <div className="track-info-cell">
              <label>Cargo items</label>
              <div className="val">{isShipment ? (data.items ?? data.cargoItems?.length ?? "—") : "1"}</div>
            </div>
          </div>

          {/* Timeline */}
          <div className="track-timeline-head">Timeline</div>
          <div className="track-timeline">
            <div className="track-timeline-line" />
            {[...timeline].reverse().map((event, index) => {
              const isLatest = index === 0;
              return (
                <div key={`${event.status}-${index}`} className="track-tl-event" style={{ animationDelay: `${index * 60}ms` }}>
                  <div className={`track-tl-dot ${isLatest ? "latest" : "past"}`} />
                  <div className="track-tl-status">{String(event.status).replaceAll("_", " ")}</div>
                  <div className="track-tl-meta">
                    {event.timestamp && (
                      <time dateTime={event.timestamp}>
                        {new Date(event.timestamp).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}
                      </time>
                    )}
                    {event.note && <> · {event.note}</>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* ── Cargo items card ── */}
        {isShipment && data.cargoItems?.length > 0 && (
          <div className="track-card">
            <div className="track-items-head">
              <span>Cargo manifest</span>
              <span className="track-items-count">{data.cargoItems.length} items</span>
            </div>
            <div className="track-items-list">
              {data.cargoItems.map((item) => (
                <div key={item.id} className="track-item-row">
                  <div>
                    <div className="track-item-desc">
                      {item.description || `Item #${item.id.substring(0, 8)}`}
                    </div>
                    <div className="track-item-dims">
                      {[item.length, item.width, item.height]
                        .map((v) => v == null ? "?" : v)
                        .join(" × ")} cm
                    </div>
                  </div>
                  <div className="track-item-cbm">{Number(item.cbm || 0).toFixed(3)} m³</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Footer ── */}
        <footer className="track-footer">
          <div className="track-footer-powered">Verified scan data powered by LiDAR + AI Quality Control</div>
          <div className="track-footer-brand">CargoScan · Freight Intelligence Platform</div>
        </footer>

      </div>
    </div>
  );
}
