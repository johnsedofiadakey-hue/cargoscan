import { useCallback, useEffect, useMemo, useState } from "react";
import { initializeApp, getApps } from "firebase/app";
import { getAuth, GoogleAuthProvider, signInWithPopup } from "firebase/auth";
import "./App.css";
import TrackingPage from "./TrackingPage";

const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:5000/api";
const IOS_TESTFLIGHT_URL = import.meta.env.VITE_IOS_TESTFLIGHT_URL || "";
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || "AIzaSyDj52I2LmZS4RifzDB_EvFwMsg-NWBasUU",
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || "cargoscan-app-2026.firebaseapp.com",
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || "cargoscan-app-2026",
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || "cargoscan-app-2026.firebasestorage.app",
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "655859091408",
  appId: import.meta.env.VITE_FIREBASE_APP_ID || "1:655859091408:web:ed821125f7e0605daf5bd5",
};
const firebaseApp = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
const firebaseAuth = getAuth(firebaseApp);

const emptyShipment = { code: "", from: "Guangzhou", to: "Tema", cbmCapacity: "67.2" };
const emptyItem = { shipmentId: "", consigneeId: "", description: "", length: "", width: "", height: "", isDamaged: false };
const emptyConsignee = { name: "", phone: "", email: "", shipmentId: "", whatsappOptIn: true };
const emptyContainer = { number: "", type: "40HQ", capacityCbm: "76", destination: "Tema", vessel: "", bookingNumber: "", sealNumber: "", shipmentId: "" };

function authHeaders() {
  const token = localStorage.getItem("cs_token");
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function api(path, options = {}) {
  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...authHeaders(),
      ...(options.headers || {}),
    },
  });
  const text = await response.text();
  const data = text ? JSON.parse(text) : null;
  if (!response.ok) throw new Error(data?.error || `Request failed (${response.status})`);
  return data;
}

function Field({ label, value, onChange, type = "text", required = false, placeholder = "" }) {
  return (
    <label className="field">
      <span>{label}</span>
      <input
        type={type}
        value={value}
        required={required}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}

function SelectField({ label, value, onChange, options, required = false }) {
  return (
    <label className="field">
      <span>{label}</span>
      <select value={value} required={required} onChange={(event) => onChange(event.target.value)}>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function Notice({ type = "info", children }) {
  if (!children) return null;
  return <div className={`notice ${type}`}>{children}</div>;
}

function Login({ onLogin }) {
  const [mode, setMode] = useState("login");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [authNote, setAuthNote] = useState("");
  const [login, setLogin] = useState({ email: "", password: "" });
  const [signup, setSignup] = useState({
    name: "",
    email: "",
    password: "",
    company: "",
    country: "Ghana",
    city: "Accra",
    cbmRate: "85",
  });

  async function googleSignIn() {
    setLoading(true);
    setError("");
    setAuthNote("");
    try {
      if (mode === "signup" && (!signup.company || !signup.country || !signup.city)) {
        setAuthNote("Fill company, country, and city first, then continue with Google to create the pilot organization.");
        return;
      }

      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({ prompt: "select_account" });
      const result = await signInWithPopup(firebaseAuth, provider);
      const idToken = await result.user.getIdToken();
      const payload = mode === "signup"
        ? {
            idToken,
            mode: "signup",
            company: signup.company,
            country: signup.country,
            city: signup.city,
            cbmRate: signup.cbmRate,
          }
        : { idToken, mode: "login" };

      const data = await api("/auth/firebase", {
        method: "POST",
        body: JSON.stringify(payload),
      });

      localStorage.setItem("cs_token", data.token);
      if (data.refreshToken) localStorage.setItem("cs_refresh_token", data.refreshToken);
      onLogin({ user: data.user, organization: data.organization });
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function submit(event) {
    event.preventDefault();
    setLoading(true);
    setError("");
    try {
      const payload = mode === "login" ? login : signup;
      const data = await api(`/auth/${mode === "login" ? "login" : "signup"}`, {
        method: "POST",
        body: JSON.stringify(payload),
      });
      localStorage.setItem("cs_token", data.token);
      if (data.refreshToken) localStorage.setItem("cs_refresh_token", data.refreshToken);
      onLogin({ user: data.user, organization: data.organization });
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="auth-shell">
      <section className="auth-hero" aria-label="CargoScan product overview">
        <div className="auth-orbit">
          <div className="scan-frame">
            <div className="scan-line" />
            <div className="box-wire box-a" />
            <div className="box-wire box-b" />
            <span className="scan-tag tag-top">LiDAR locked</span>
            <span className="scan-tag tag-bottom">76.4% container full</span>
          </div>
        </div>
        <div className="auth-copy">
          <div className="brand-row">
            <div className="brand-mark">CS</div>
            <span>CargoScan Pilot</span>
          </div>
          <h1>Scan cargo, build manifests, and load containers with confidence.</h1>
          <p>Capture dimensions on LiDAR iPhones, review scan quality, assign packages to containers, and keep customers updated from one dashboard.</p>
          <div className="feature-grid">
            <article><strong>LiDAR + AI QC</strong><span>Operator guidance, photos, CBM, and quality scores.</span></article>
            <article><strong>Warehouse inventory</strong><span>Every package tied to image, customer, shipment, and status.</span></article>
            <article><strong>Container loading</strong><span>Move items into containers and watch utilization in real time.</span></article>
            <article><strong>Developer-ready</strong><span>API keys, webhooks, and Enterprise tracking hooks.</span></article>
          </div>
        </div>
      </section>

      <section className="auth-card">
        <div className="auth-card-header">
          <span>{mode === "login" ? "Welcome back" : "Start pilot"}</span>
          <h2>{mode === "login" ? "Sign in to dashboard" : "Create your workspace"}</h2>
        </div>
        <Notice type="error">{error}</Notice>
        <Notice type="info">{authNote}</Notice>
        <button className="google-button" type="button" onClick={googleSignIn}>
          <span className="google-mark">G</span>
          Continue with Google
        </button>
        <div className="auth-divider"><span>or use email</span></div>
        <form onSubmit={submit}>
          {mode === "signup" && (
            <>
              <Field label="Full name" value={signup.name} required onChange={(value) => setSignup({ ...signup, name: value })} />
              <Field label="Company" value={signup.company} required onChange={(value) => setSignup({ ...signup, company: value })} />
              <div className="form-grid">
                <Field label="Country" value={signup.country} required onChange={(value) => setSignup({ ...signup, country: value })} />
                <Field label="City" value={signup.city} required onChange={(value) => setSignup({ ...signup, city: value })} />
              </div>
              <Field label="Default CBM rate" type="number" value={signup.cbmRate} required onChange={(value) => setSignup({ ...signup, cbmRate: value })} />
            </>
          )}
          <Field
            label="Email"
            type="email"
            value={mode === "login" ? login.email : signup.email}
            required
            onChange={(value) => (mode === "login" ? setLogin({ ...login, email: value }) : setSignup({ ...signup, email: value }))}
          />
          <Field
            label="Password"
            type="password"
            value={mode === "login" ? login.password : signup.password}
            required
            onChange={(value) => (mode === "login" ? setLogin({ ...login, password: value }) : setSignup({ ...signup, password: value }))}
          />
          <button className="primary auth-primary" disabled={loading}>{loading ? "Working..." : mode === "login" ? "Enter dashboard" : "Create pilot org"}</button>
        </form>
        <button className="link-button" onClick={() => {
          setError("");
          setAuthNote("");
          setMode(mode === "login" ? "signup" : "login");
        }}>
          {mode === "login" ? "Create a pilot organization" : "Back to sign in"}
        </button>
        <div className="install-strip">
          <strong>Mobile install lives here</strong>
          <span>Operators scan the dashboard QR code to install the LiDAR app through TestFlight.</span>
        </div>
      </section>
    </main>
  );
}

function Metric({ label, value }) {
  return (
    <div className="metric">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function ShipmentsTab({ data, reload, setMessage }) {
  const [form, setForm] = useState(emptyShipment);
  const [item, setItem] = useState(emptyItem);

  const shipmentOptions = useMemo(() => [
    { value: "", label: "Select shipment" },
    ...data.shipments.map((shipment) => ({ value: shipment.id, label: shipment.code })),
  ], [data.shipments]);

  const consigneeOptions = useMemo(() => [
    { value: "", label: "No consignee" },
    ...data.consignees.map((consignee) => ({ value: consignee.id, label: consignee.name })),
  ], [data.consignees]);

  async function createShipment(event) {
    event.preventDefault();
    await api("/shipments", { method: "POST", body: JSON.stringify({ ...form, cbmCapacity: Number(form.cbmCapacity) }) });
    setForm(emptyShipment);
    setMessage("Shipment created.");
    reload();
  }

  async function createItem(event) {
    event.preventDefault();
    await api("/items", {
      method: "POST",
      body: JSON.stringify({
        ...item,
        consigneeId: item.consigneeId || null,
        length: Number(item.length),
        width: Number(item.width),
        height: Number(item.height),
      }),
    });
    setItem(emptyItem);
    setMessage("Cargo item created.");
    reload();
  }

  async function saveManualScan(cargoItem) {
    await api("/scans", {
      method: "POST",
      body: JSON.stringify({
        cargoItemId: cargoItem.id,
        length: Number(cargoItem.length),
        width: Number(cargoItem.width),
        height: Number(cargoItem.height),
        cbm: Number(cargoItem.cbm),
        confidence: 0.8,
        scannerDevice: "Web manual entry",
        source: "MANUAL",
      }),
    });
    setMessage("Manual scan saved.");
    reload();
  }

  return (
    <div className="tab-grid">
      <section className="panel">
        <h2>Create shipment</h2>
        <form onSubmit={createShipment}>
          <Field label="Code" value={form.code} required placeholder="SHP-2026-002" onChange={(value) => setForm({ ...form, code: value })} />
          <div className="form-grid">
            <Field label="From" value={form.from} required onChange={(value) => setForm({ ...form, from: value })} />
            <Field label="To" value={form.to} required onChange={(value) => setForm({ ...form, to: value })} />
          </div>
          <Field label="CBM capacity" type="number" value={form.cbmCapacity} required onChange={(value) => setForm({ ...form, cbmCapacity: value })} />
          <button className="primary">Create shipment</button>
        </form>
      </section>

      <section className="panel">
        <h2>Create cargo item</h2>
        <form onSubmit={createItem}>
          <SelectField label="Shipment" value={item.shipmentId} required options={shipmentOptions} onChange={(value) => setItem({ ...item, shipmentId: value })} />
          <SelectField label="Consignee" value={item.consigneeId} options={consigneeOptions} onChange={(value) => setItem({ ...item, consigneeId: value })} />
          <Field label="Description" value={item.description} onChange={(value) => setItem({ ...item, description: value })} />
          <div className="form-grid">
            <Field label="Length" type="number" value={item.length} required onChange={(value) => setItem({ ...item, length: value })} />
            <Field label="Width" type="number" value={item.width} required onChange={(value) => setItem({ ...item, width: value })} />
            <Field label="Height" type="number" value={item.height} required onChange={(value) => setItem({ ...item, height: value })} />
          </div>
          <button className="primary">Create item</button>
        </form>
      </section>

      <section className="panel wide">
        <h2>Shipments</h2>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Code</th><th>Route</th><th>Status</th><th>Items</th><th>CBM</th><th>Tracking</th></tr></thead>
            <tbody>
              {data.shipments.map((shipment) => (
                <tr key={shipment.id}>
                  <td>{shipment.code}</td>
                  <td>{shipment.from} → {shipment.to}</td>
                  <td>{shipment.status}</td>
                  <td>{shipment.itemsCount}</td>
                  <td>{Number(shipment.totalCbm || 0).toFixed(3)}</td>
                  <td><a href={`/tracking/${shipment.code}`} target="_blank" rel="noreferrer">Open</a></td>
                </tr>
              ))}
            </tbody>
          </table>
          {!data.shipments.length && <p className="empty">No shipments yet.</p>}
        </div>
      </section>

      <section className="panel wide">
        <h2>Cargo items</h2>
        <div className="cards">
          {data.items.map((cargoItem) => (
            <article key={cargoItem.id} className="item-card">
              {(() => {
                const latestScan = cargoItem.scanResults?.[0];
                return latestScan?.qualityStatus ? (
                  <span className={`quality-pill quality-${latestScan.qualityStatus.toLowerCase()}`}>
                    {latestScan.qualityStatus} · {Math.round(Number(latestScan.qualityScore || 0) * 100)}%
                  </span>
                ) : null;
              })()}
              <strong>{cargoItem.description || cargoItem.id.slice(0, 8)}</strong>
              <span>{cargoItem.shipment?.code} · {Number(cargoItem.cbm).toFixed(3)} CBM · {cargoItem.status}</span>
              {cargoItem.scanResults?.[0]?.qualityReason && (
                <small>{cargoItem.scanResults[0].qualityReason}</small>
              )}
              <div className="button-row">
                <button onClick={() => saveManualScan(cargoItem)}>Save manual scan</button>
                <a href={`/tracking/${cargoItem.id}`} target="_blank" rel="noreferrer">Track item</a>
              </div>
            </article>
          ))}
          {!data.items.length && <p className="empty">No cargo items yet.</p>}
        </div>
      </section>
    </div>
  );
}

function CustomersTab({ data, reload, setMessage }) {
  const [form, setForm] = useState(emptyConsignee);
  const shipmentOptions = [
    { value: "", label: "No shipment" },
    ...data.shipments.map((shipment) => ({ value: shipment.id, label: shipment.code })),
  ];

  async function createConsignee(event) {
    event.preventDefault();
    await api("/consignees", { method: "POST", body: JSON.stringify({ ...form, shipmentId: form.shipmentId || null }) });
    setForm(emptyConsignee);
    setMessage("Customer created.");
    reload();
  }

  return (
    <div className="tab-grid">
      <section className="panel">
        <h2>Add customer</h2>
        <form onSubmit={createConsignee}>
          <Field label="Name" value={form.name} required onChange={(value) => setForm({ ...form, name: value })} />
          <Field label="Phone" value={form.phone} required onChange={(value) => setForm({ ...form, phone: value })} />
          <Field label="Email" type="email" value={form.email} onChange={(value) => setForm({ ...form, email: value })} />
          <SelectField label="Shipment" value={form.shipmentId} options={shipmentOptions} onChange={(value) => setForm({ ...form, shipmentId: value })} />
          <label className="check-row">
            <input type="checkbox" checked={form.whatsappOptIn} onChange={(event) => setForm({ ...form, whatsappOptIn: event.target.checked })} />
            WhatsApp opt-in
          </label>
          <button className="primary">Add customer</button>
        </form>
      </section>
      <section className="panel wide">
        <h2>Customers</h2>
        <div className="cards">
          {data.consignees.map((consignee) => (
            <article key={consignee.id} className="item-card">
              <strong>{consignee.name}</strong>
              <span>{consignee.phone} · {consignee.email || "No email"} · {consignee.whatsappOptIn ? "WhatsApp enabled" : "WhatsApp off"}</span>
            </article>
          ))}
          {!data.consignees.length && <p className="empty">No customers yet.</p>}
        </div>
      </section>
    </div>
  );
}

function ContainersTab({ data, reload, setMessage, setError }) {
  const [form, setForm] = useState(emptyContainer);
  const [selectedContainerId, setSelectedContainerId] = useState("");
  const [selectedItemId, setSelectedItemId] = useState("");

  const shipmentOptions = [
    { value: "", label: "No linked shipment" },
    ...data.shipments.map((shipment) => ({ value: shipment.id, label: shipment.code })),
  ];
  const containerOptions = [
    { value: "", label: "Select container" },
    ...data.containers.map((container) => ({ value: container.id, label: `${container.number} · ${container.type}` })),
  ];
  const availableItems = data.items.filter((item) => !item.containerId);
  const itemOptions = [
    { value: "", label: "Select scanned package" },
    ...availableItems.map((item) => ({
      value: item.id,
      label: `${item.description || item.id.slice(0, 8)} · ${Number(item.cbm || 0).toFixed(3)} CBM · ${item.consignee?.name || "No customer"}`,
    })),
  ];

  async function createContainer(event) {
    event.preventDefault();
    await api("/containers", {
      method: "POST",
      body: JSON.stringify({
        ...form,
        capacityCbm: Number(form.capacityCbm),
        shipmentId: form.shipmentId || null,
      }),
    });
    setForm(emptyContainer);
    setMessage("Container created.");
    reload();
  }

  async function assignItem(event) {
    event.preventDefault();
    await api(`/containers/${selectedContainerId}/items`, {
      method: "POST",
      body: JSON.stringify({ cargoItemId: selectedItemId }),
    });
    setSelectedItemId("");
    setMessage("Package moved to container.");
    reload();
  }

  async function removeItem(containerId, itemId) {
    await api(`/containers/${containerId}/items/${itemId}`, { method: "DELETE" });
    setMessage("Package removed from container.");
    reload();
  }

  async function checkLiveTracking(containerId) {
    try {
      const result = await api(`/containers/${containerId}/tracking`);
      setMessage(result.message || `Tracking status: ${result.status}`);
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div className="tab-grid">
      <section className="panel">
        <h2>Create container</h2>
        <form onSubmit={createContainer}>
          <Field label="Container number" value={form.number} required placeholder="MSCU1234567" onChange={(value) => setForm({ ...form, number: value.toUpperCase() })} />
          <div className="form-grid">
            <SelectField label="Type" value={form.type} onChange={(value) => setForm({ ...form, type: value, capacityCbm: value === "20FT" ? "33" : value === "40FT" ? "67" : "76" })} options={[
              { value: "20FT", label: "20ft" },
              { value: "40FT", label: "40ft" },
              { value: "40HQ", label: "40HQ" },
            ]} />
            <Field label="Capacity CBM" type="number" value={form.capacityCbm} required onChange={(value) => setForm({ ...form, capacityCbm: value })} />
          </div>
          <SelectField label="Shipment" value={form.shipmentId} options={shipmentOptions} onChange={(value) => setForm({ ...form, shipmentId: value })} />
          <Field label="Destination" value={form.destination} onChange={(value) => setForm({ ...form, destination: value })} />
          <div className="form-grid">
            <Field label="Vessel" value={form.vessel} onChange={(value) => setForm({ ...form, vessel: value })} />
            <Field label="Booking number" value={form.bookingNumber} onChange={(value) => setForm({ ...form, bookingNumber: value })} />
          </div>
          <Field label="Seal number" value={form.sealNumber} onChange={(value) => setForm({ ...form, sealNumber: value })} />
          <button className="primary">Create container</button>
        </form>
      </section>

      <section className="panel">
        <h2>Move package to container</h2>
        <form onSubmit={assignItem}>
          <SelectField label="Container" value={selectedContainerId} required options={containerOptions} onChange={setSelectedContainerId} />
          <SelectField label="Package" value={selectedItemId} required options={itemOptions} onChange={setSelectedItemId} />
          <button className="primary" disabled={!selectedContainerId || !selectedItemId}>Move package</button>
        </form>
        <p className="empty">{availableItems.length} scanned packages waiting for loading.</p>
      </section>

      <section className="panel wide">
        <h2>Containers</h2>
        <div className="cards">
          {data.containers.map((container) => (
            <article key={container.id} className="item-card manifest-card">
              <strong>{container.number} · {container.type}</strong>
              <span>{container.status} · {Number(container.totalCbm || 0).toFixed(3)} / {Number(container.capacityCbm || 0).toFixed(1)} CBM · {container.utilization || 0}% full</span>
              <div className="progress"><span style={{ width: `${Math.min(container.utilization || 0, 100)}%` }} /></div>
              <small>{container.destination || "No destination"} · {container.itemsCount || 0} packages · {container.customerCount || 0} customers</small>
              <div className="button-row">
                <button onClick={() => checkLiveTracking(container.id)}>Live tracking</button>
              </div>
              <div className="manifest-list">
                {(container.cargoItems || []).map((item) => (
                  <div key={item.id} className="manifest-row">
                    <span>{item.description || item.id.slice(0, 8)} · {Number(item.cbm || 0).toFixed(3)} CBM · {item.consignee?.name || "No customer"}</span>
                    <button onClick={() => removeItem(container.id, item.id)}>Remove</button>
                  </div>
                ))}
              </div>
            </article>
          ))}
          {!data.containers.length && <p className="empty">No containers yet.</p>}
        </div>
      </section>
    </div>
  );
}

function TeamTab({ data, reload, setMessage }) {
  const [form, setForm] = useState({ name: "", email: "", role: "OPERATOR" });

  async function createUser(event) {
    event.preventDefault();
    const result = await api("/users", { method: "POST", body: JSON.stringify(form) });
    setForm({ name: "", email: "", role: "OPERATOR" });
    setMessage(`User created. Temporary password: ${result.tempPassword}`);
    reload();
  }

  return (
    <div className="tab-grid">
      <section className="panel">
        <h2>Invite team member</h2>
        <form onSubmit={createUser}>
          <Field label="Name" value={form.name} required onChange={(value) => setForm({ ...form, name: value })} />
          <Field label="Email" type="email" value={form.email} required onChange={(value) => setForm({ ...form, email: value })} />
          <SelectField label="Role" value={form.role} onChange={(value) => setForm({ ...form, role: value })} options={[
            { value: "OPERATOR", label: "Operator" },
            { value: "SUPERVISOR", label: "Supervisor" },
            { value: "ADMIN", label: "Admin" },
          ]} />
          <button className="primary">Create user</button>
        </form>
      </section>
      <section className="panel wide">
        <h2>Team</h2>
        <div className="cards">
          {data.users.map((user) => (
            <article key={user.id} className="item-card">
              <strong>{user.name}</strong>
              <span>{user.email} · {user.role} · {user.active ? "Active" : "Disabled"}</span>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}

function DevelopersTab({ data, reload, setMessage }) {
  const [keyForm, setKeyForm] = useState({ name: "", scopes: "items:write,scans:write", environment: "test" });
  const [webhookForm, setWebhookForm] = useState({ name: "", url: "", events: "scan.created,shipment.status_changed" });

  async function createKey(event) {
    event.preventDefault();
    const result = await api("/keys", { method: "POST", body: JSON.stringify(keyForm) });
    setMessage(`API key created. Secret: ${result.secret}`);
    setKeyForm({ name: "", scopes: "items:write,scans:write", environment: "test" });
    reload();
  }

  async function createWebhook(event) {
    event.preventDefault();
    await api("/webhooks", { method: "POST", body: JSON.stringify(webhookForm) });
    setMessage("Webhook created.");
    setWebhookForm({ name: "", url: "", events: "scan.created,shipment.status_changed" });
    reload();
  }

  return (
    <div className="tab-grid">
      <section className="panel">
        <h2>Create API key</h2>
        <form onSubmit={createKey}>
          <Field label="Name" value={keyForm.name} required onChange={(value) => setKeyForm({ ...keyForm, name: value })} />
          <Field label="Scopes" value={keyForm.scopes} required onChange={(value) => setKeyForm({ ...keyForm, scopes: value })} />
          <SelectField label="Environment" value={keyForm.environment} onChange={(value) => setKeyForm({ ...keyForm, environment: value })} options={[
            { value: "test", label: "Test" },
            { value: "live", label: "Live" },
          ]} />
          <button className="primary">Create key</button>
        </form>
      </section>
      <section className="panel">
        <h2>Create webhook</h2>
        <form onSubmit={createWebhook}>
          <Field label="Name" value={webhookForm.name} required onChange={(value) => setWebhookForm({ ...webhookForm, name: value })} />
          <Field label="URL" type="url" value={webhookForm.url} required onChange={(value) => setWebhookForm({ ...webhookForm, url: value })} />
          <Field label="Events" value={webhookForm.events} required onChange={(value) => setWebhookForm({ ...webhookForm, events: value })} />
          <button className="primary">Create webhook</button>
        </form>
      </section>
      <section className="panel wide">
        <h2>Developer resources</h2>
        <div className="cards two">
          {data.keys.map((key) => <article key={key.id} className="item-card"><strong>{key.name}</strong><span>{key.prefix}... · {key.scopes}</span></article>)}
          {data.webhooks.map((webhook) => <article key={webhook.id} className="item-card"><strong>{webhook.name}</strong><span>{webhook.url} · {webhook.eventFilter}</span></article>)}
          {!data.keys.length && !data.webhooks.length && <p className="empty">No API keys or webhooks yet.</p>}
        </div>
      </section>
    </div>
  );
}

function MobileAppTab({ session }) {
  const installUrl = IOS_TESTFLIGHT_URL;
  const qrUrl = installUrl
    ? `https://api.qrserver.com/v1/create-qr-code/?size=220x220&margin=14&data=${encodeURIComponent(installUrl)}`
    : "";

  return (
    <div className="tab-grid install-grid">
      <section className="panel install-hero-panel">
        <div>
          <span className="section-kicker">Operator app</span>
          <h2>Install CargoScan LiDAR on warehouse iPhones</h2>
          <p>The mobile app is for operators scanning cargo. The desktop dashboard stays here for admins, manifests, customers, containers, billing, and API setup.</p>
        </div>
        <div className="install-status-row">
          <span className="status-dot live" /> Dashboard connected
          <span className="status-dot pending" /> TestFlight pending
        </div>
      </section>

      <section className="panel qr-panel">
        <h2>Download QR</h2>
        {qrUrl ? (
          <>
            <img className="qr-code" src={qrUrl} alt="CargoScan iOS TestFlight QR code" />
            <a className="primary install-link" href={installUrl} target="_blank" rel="noreferrer">Open TestFlight link</a>
          </>
        ) : (
          <div className="qr-placeholder" aria-label="TestFlight QR code not configured">
            <span />
            <strong>QR appears after TestFlight setup</strong>
          </div>
        )}
        <small>{installUrl ? "Operators scan this with a LiDAR-enabled iPhone." : "Next step: upload the iOS build to TestFlight and add VITE_IOS_TESTFLIGHT_URL before deployment."}</small>
      </section>

      <section className="panel">
        <h2>Supported devices</h2>
        <div className="install-checklist">
          <span>iPhone Pro with LiDAR, iPhone 12 Pro or newer Pro models</span>
          <span>Camera and motion permissions enabled</span>
          <span>Operator has a CargoScan user account</span>
          <span>Backend API points to Render production</span>
        </div>
      </section>

      <section className="panel">
        <h2>Install flow</h2>
        <div className="install-steps">
          <span>1. Admin opens this dashboard page.</span>
          <span>2. Operator scans the QR code.</span>
          <span>3. TestFlight installs CargoScan Mobile.</span>
          <span>4. Operator logs in and scans linked cargo items.</span>
        </div>
      </section>

      <section className="panel wide">
        <h2>Workspace install profile</h2>
        <div className="cards three">
          <article className="item-card">
            <strong>{session.organization?.name || "CargoScan"}</strong>
            <span>Tenant workspace</span>
          </article>
          <article className="item-card">
            <strong>{session.organization?.plan || "TRIAL"}</strong>
            <span>Current plan</span>
          </article>
          <article className="item-card">
            <strong>iOS Pilot</strong>
            <span>{installUrl ? "Ready for operator install" : "Waiting for TestFlight link"}</span>
          </article>
        </div>
      </section>
    </div>
  );
}

function BillingTab({ organization, setMessage }) {
  async function upgrade(plan) {
    const result = await api("/billing/init", { method: "POST", body: JSON.stringify({ plan }) });
    setMessage(`Paystack checkout initialized for ${plan}.`);
    if (result.authorization_url) window.location.href = result.authorization_url;
  }

  return (
    <section className="panel">
      <h2>Billing</h2>
      <p>Your current plan is <strong>{organization?.plan || "TRIAL"}</strong>.</p>
      <div className="cards three">
        {["STARTER", "BUSINESS", "ENTERPRISE"].map((plan) => (
          <article key={plan} className="price-card">
            <strong>{plan}</strong>
            <span>{plan === "STARTER" ? "$29" : plan === "BUSINESS" ? "$79" : "$199"} / month</span>
            <small>{plan === "ENTERPRISE" ? "Includes live container tracking and custom integrations." : plan === "BUSINESS" ? "Includes WhatsApp, disputes, and higher limits." : "For small pilot teams."}</small>
            <button onClick={() => upgrade(plan)}>Upgrade</button>
          </article>
        ))}
      </div>
    </section>
  );
}

function AdminDashboard({ session, onLogout }) {
  const [orgs, setOrgs] = useState([]);
  const [subs, setSubs] = useState([]);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      const [organizations, subscriptions] = await Promise.all([
        api("/admin/organizations"),
        api("/admin/subscriptions"),
      ]);
      setOrgs(organizations);
      setSubs(subscriptions);
    } catch (err) {
      setError(err.message);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  return (
    <main className="app-shell">
      <header className="topbar">
        <div><strong>CargoScan Admin</strong><span>{session.user.email}</span></div>
        <button onClick={onLogout}>Logout</button>
      </header>
      <Notice type="error">{error}</Notice>
      <section className="metrics">
        <Metric label="Organizations" value={orgs.length} />
        <Metric label="Subscriptions" value={subs.length} />
        <Metric label="Active pilots" value={orgs.filter((org) => org.plan !== "TRIAL").length} />
      </section>
      <section className="panel">
        <h2>Organizations</h2>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Name</th><th>Slug</th><th>Plan</th><th>Users</th><th>Shipments</th></tr></thead>
            <tbody>
              {orgs.map((org) => (
                <tr key={org.id}><td>{org.name}</td><td>{org.slug}</td><td>{org.plan}</td><td>{org.usage?.users}</td><td>{org.usage?.ships}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}

function Dashboard({ session, setSession }) {
  const [active, setActive] = useState("shipments");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [data, setData] = useState({ shipments: [], items: [], consignees: [], containers: [], users: [], keys: [], webhooks: [] });

  const isAdmin = session.user.role === "ADMIN";

  const load = useCallback(async () => {
    try {
      const baseCalls = [api("/shipments"), api("/items"), api("/consignees"), api("/containers")];
      const adminCalls = isAdmin ? [api("/users"), api("/keys"), api("/webhooks")] : [Promise.resolve([]), Promise.resolve([]), Promise.resolve([])];
      const [shipments, items, consignees, containers, users, keys, webhooks] = await Promise.all([...baseCalls, ...adminCalls]);
      setData({ shipments, items, consignees, containers, users, keys, webhooks });
      setError("");
    } catch (err) {
      setError(err.message);
    }
  }, [isAdmin]);

  useEffect(() => { load(); }, [load]);

  function logout() {
    localStorage.removeItem("cs_token");
    localStorage.removeItem("cs_refresh_token");
    setSession(null);
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <div>
          <strong>{session.organization?.name || "CargoScan"}</strong>
          <span>{session.user.name} · {session.user.role} · {session.organization?.plan}</span>
        </div>
        <button onClick={logout}>Logout</button>
      </header>

      <section className="metrics">
        <Metric label="Shipments" value={data.shipments.length} />
        <Metric label="Cargo items" value={data.items.length} />
        <Metric label="Containers" value={data.containers.length} />
        <Metric label="Customers" value={data.consignees.length} />
      </section>

      <nav className="tabs">
        {["shipments", "containers", "customers", "mobile app", "team", "developers", "billing"].map((tab) => (
          <button key={tab} className={active === tab ? "active" : ""} disabled={!isAdmin && ["team", "developers", "billing"].includes(tab)} onClick={() => setActive(tab)}>
            {tab}
          </button>
        ))}
      </nav>

      <Notice type="success">{message}</Notice>
      <Notice type="error">{error}</Notice>

      {active === "shipments" && <ShipmentsTab data={data} reload={load} setMessage={setMessage} />}
      {active === "containers" && <ContainersTab data={data} reload={load} setMessage={setMessage} setError={setError} />}
      {active === "customers" && <CustomersTab data={data} reload={load} setMessage={setMessage} />}
      {active === "mobile app" && <MobileAppTab session={session} />}
      {active === "team" && isAdmin && <TeamTab data={data} reload={load} setMessage={setMessage} />}
      {active === "developers" && isAdmin && <DevelopersTab data={data} reload={load} setMessage={setMessage} />}
      {active === "billing" && isAdmin && <BillingTab organization={session.organization} setMessage={setMessage} />}
    </main>
  );
}

export default function App() {
  const [session, setSession] = useState(null);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem("cs_token");
    if (!token) {
      setChecking(false);
      return;
    }
    api("/auth/me")
      .then((data) => setSession({ user: data.user, organization: data.organization }))
      .catch(() => {
        localStorage.removeItem("cs_token");
        localStorage.removeItem("cs_refresh_token");
      })
      .finally(() => setChecking(false));
  }, []);

  if (window.location.pathname.startsWith("/tracking/") || window.location.pathname.startsWith("/track/")) {
    return <TrackingPage apiBase={API_BASE} />;
  }

  if (checking) return <main className="auth-shell"><p>Loading CargoScan...</p></main>;
  if (!session) return <Login onLogin={setSession} />;
  if (session.user.role === "SUPER_ADMIN") return <AdminDashboard session={session} onLogout={() => setSession(null)} />;
  return <Dashboard session={session} setSession={setSession} />;
}
