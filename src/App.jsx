import React, { useState, useMemo, useEffect } from "react";
import { MapContainer, TileLayer, Marker, useMapEvents, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

if (typeof window !== "undefined") {
  delete L.Icon.Default.prototype._getIconUrl;
  L.Icon.Default.mergeOptions({
    iconRetinaUrl: "https://unpkg.com/leaflet@1.7.1/dist/images/marker-icon-2x.png",
    iconUrl: "https://unpkg.com/leaflet@1.7.1/dist/images/marker-icon.png",
    shadowUrl: "https://unpkg.com/leaflet@1.7.1/dist/images/marker-shadow.png"
  });
}

const MUSIC_OPTIONS = ["swing", "jazz", "blues", "funk", "latin"];
const DANCE_OPTIONS = ["lindy hop", "blues", "salsa", "bachata"];
const EVENT_TYPE_OPTIONS = ["social", "class", "festival", "practica"];
const PRICE_OPTIONS = ["free", "paid"];
const FLOOR_OPTIONS = ["rough", "normal", "slippery"];

const DEFAULT_FORM = {
  name: "",
  venue: "",
  city: "",
  type: "social",
  price: "free",
  floor: "normal",
  music: [],
  dance: [],
  people: 50,
  url: "",
  notes: "",
  date: "",
  hoursStart: "",
  hoursEnd: ""
};

function mergeFormFromPin(pin) {
  if (!pin) return { ...DEFAULT_FORM };
  const { hours: _legacyHours, music, dance, hoursStart, hoursEnd, ...rest } = pin;
  return {
    ...DEFAULT_FORM,
    ...rest,
    music: music ?? [],
    dance: dance ?? [],
    hoursStart: hoursStart ?? "",
    hoursEnd: hoursEnd ?? ""
  };
}

function formatHoursLabel(pin) {
  if (pin.hoursStart && pin.hoursEnd) return `${pin.hoursStart} – ${pin.hoursEnd}`;
  if (pin.hoursStart) return `${pin.hoursStart} onwards`;
  if (pin.hoursEnd) return `until ${pin.hoursEnd}`;
  if (pin.hours) return pin.hours;
  return "—";
}

async function reverseGeocode(lat, lon) {
  try {
    const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}`);
    const data = await res.json();
    return {
      country: data.address?.country || "",
      address: data.display_name || "",
      street: data.address?.road || "",
      city: data.address?.city || data.address?.town || data.address?.village || ""
    };
  } catch {
    return { country: "", address: "", street: "", city: "" };
  }
}

function FlyToPin({ focus }) {
  const map = useMap();
  useEffect(() => {
    if (!focus?.position) return;
    const [lat, lng] = focus.position;
    map.flyTo([lat, lng], Math.max(map.getZoom(), 11), { duration: 0.7 });
  }, [focus?.id, focus?.position, map]);
  return null;
}

function AddPinHandler({ onAdd }) {
  useMapEvents({
    click: async (e) => {
      const { lat, lng } = e.latlng;
      const geo = await reverseGeocode(lat, lng);
      onAdd({ lat, lng, geo });
    }
  });
  return null;
}

function TagSelector({ options, selected, toggle }) {
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
      {options.map(opt => (
        <div
          key={opt}
          onClick={() => toggle(opt)}
          style={{
            padding: "4px 10px",
            borderRadius: 20,
            cursor: "pointer",
            background: selected.includes(opt) ? "#333" : "#ddd",
            color: selected.includes(opt) ? "white" : "black",
            fontSize: 12
          }}
        >
          {opt}
        </div>
      ))}
    </div>
  );
}

const FILTER_DEFAULTS = {
  search: "",
  music: [],
  dance: [],
  type: "",
  price: "",
  floor: ""
};

function filterPins(pins, f) {
  const q = f.search.trim().toLowerCase();
  return pins.filter((pin) => {
    if (q) {
      const hay = [pin.name, pin.venue, pin.city, pin.notes, pin.country, pin.street]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      if (!hay.includes(q)) return false;
    }
    if (f.music.length && !f.music.some((m) => pin.music?.includes(m))) return false;
    if (f.dance.length && !f.dance.some((d) => pin.dance?.includes(d))) return false;
    if (f.type && pin.type !== f.type) return false;
    if (f.price && pin.price !== f.price) return false;
    if (f.floor && pin.floor !== f.floor) return false;
    return true;
  });
}

export default function App() {
  const [pins, setPins] = useState([]);
  const [selectedPin, setSelectedPin] = useState(null);
  const [editing, setEditing] = useState(false);
  const [pendingPin, setPendingPin] = useState(null);
  const [form, setForm] = useState(DEFAULT_FORM);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [filters, setFilters] = useState(FILTER_DEFAULTS);
  const [mapFocus, setMapFocus] = useState(null);
  const [showTimeline, setShowTimeline] = useState(false);

  const filteredPins = useMemo(() => filterPins(pins, filters), [pins, filters]);

  function setFilterField(field, value) {
    setFilters((prev) => ({ ...prev, [field]: value }));
  }

  function toggleFilterTag(field, value) {
    setFilters((prev) => ({
      ...prev,
      [field]: prev[field].includes(value)
        ? prev[field].filter((v) => v !== value)
        : [...prev[field], value]
    }));
  }

  function handleAdd({ lat, lng, geo }) {
    setForm({ ...DEFAULT_FORM, city: geo.city || "" });
    setPendingPin({ lat, lng, geo });
  }

  function toggleMulti(field, value) {
    setForm(f => ({
      ...f,
      [field]: f[field].includes(value)
        ? f[field].filter(v => v !== value)
        : [...f[field], value]
    }));
  }

  function savePin() {
    const newPin = {
      id: Date.now(),
      position: [pendingPin.lat, pendingPin.lng],
      ...form,
      city: form.city || pendingPin.geo.city || "",
      country: pendingPin.geo.country,
      street: pendingPin.geo.street,
      address: pendingPin.geo.address
    };
    setPins(p => [...p, newPin]);
    setPendingPin(null);
  }

  function updatePin() {
    setPins(pins.map(p => p.id === selectedPin.id ? { ...p, ...form } : p));
    setSelectedPin({ ...selectedPin, ...form });
    setEditing(false);
  }

  function Field(label, value, editor, readOnly=false) {
    return (
      <>
        <b style={{ textAlign: "right" }}>{label}</b>
        {readOnly ? <span>{value || "-"}</span> : (editing ? editor : <span>{value || "-"}</span>)}
      </>
    );
  }

  function openEventFromList(pin) {
    setSelectedPin(pin);
    setForm(mergeFormFromPin(pin));
    setMapFocus({ id: pin.id, position: pin.position });
  }

  const timelinePins = useMemo(() => {
    return [...pins].sort((a, b) => {
      const ad = a.date ? new Date(a.date).getTime() : NaN;
      const bd = b.date ? new Date(b.date).getTime() : NaN;
      const aOk = !Number.isNaN(ad);
      const bOk = !Number.isNaN(bd);
      if (aOk && bOk && ad !== bd) return ad - bd;
      if (aOk && !bOk) return -1;
      if (!aOk && bOk) return 1;
      return String(a.name || "").localeCompare(String(b.name || ""), undefined, { sensitivity: "base" });
    });
  }, [pins]);

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-slate-100">

      {/* SIDEBAR */}
      {sidebarOpen ? (
        <aside className="flex w-80 shrink-0 flex-col border-r border-slate-200 bg-white/95 shadow-sm backdrop-blur-sm">
          <div className="flex items-center justify-between border-b border-slate-200 px-3 py-2">
            <h2 className="text-sm font-semibold tracking-tight text-slate-800">Events</h2>
            <button
              type="button"
              className="rounded-md px-2 py-1 text-xs text-slate-600 hover:bg-slate-100"
              onClick={() => setSidebarOpen(false)}
              aria-label="Collapse sidebar"
            >
              Hide
            </button>
          </div>

          <div className="flex-1 overflow-y-auto px-3 py-3">
            <label className="block text-xs font-medium text-slate-500">Search</label>
            <input
              className="mt-1 w-full rounded-md border border-slate-200 px-2 py-1.5 text-sm outline-none focus:border-slate-400"
              placeholder="Name, venue, notes…"
              value={filters.search}
              onChange={(e) => setFilterField("search", e.target.value)}
            />

            <div className="mt-3">
              <span className="text-xs font-medium text-slate-500">Music (any)</span>
              <div className="mt-1">
                <TagSelector
                  options={MUSIC_OPTIONS}
                  selected={filters.music}
                  toggle={(v) => toggleFilterTag("music", v)}
                />
              </div>
            </div>

            <div className="mt-3">
              <span className="text-xs font-medium text-slate-500">Dance (any)</span>
              <div className="mt-1">
                <TagSelector
                  options={DANCE_OPTIONS}
                  selected={filters.dance}
                  toggle={(v) => toggleFilterTag("dance", v)}
                />
              </div>
            </div>

            <div className="mt-3 grid grid-cols-3 gap-2">
              <div>
                <label className="text-xs font-medium text-slate-500">Type</label>
                <select
                  className="mt-1 w-full rounded-md border border-slate-200 px-1 py-1 text-xs"
                  value={filters.type}
                  onChange={(e) => setFilterField("type", e.target.value)}
                >
                  <option value="">All</option>
                  {EVENT_TYPE_OPTIONS.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-slate-500">Price</label>
                <select
                  className="mt-1 w-full rounded-md border border-slate-200 px-1 py-1 text-xs"
                  value={filters.price}
                  onChange={(e) => setFilterField("price", e.target.value)}
                >
                  <option value="">All</option>
                  {PRICE_OPTIONS.map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-slate-500">Floor</label>
                <select
                  className="mt-1 w-full rounded-md border border-slate-200 px-1 py-1 text-xs"
                  value={filters.floor}
                  onChange={(e) => setFilterField("floor", e.target.value)}
                >
                  <option value="">All</option>
                  {FLOOR_OPTIONS.map((fl) => (
                    <option key={fl} value={fl}>
                      {fl}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <button
              type="button"
              className="mt-3 text-xs text-slate-500 underline decoration-slate-300 hover:text-slate-700"
              onClick={() => setFilters({ ...FILTER_DEFAULTS })}
            >
              Clear filters
            </button>

            <p className="mt-4 text-xs text-slate-500">
              Showing <span className="font-medium text-slate-700">{filteredPins.length}</span>
              {pins.length !== filteredPins.length ? (
                <span> of {pins.length}</span>
              ) : null}
            </p>

            <ul className="mt-2 space-y-2 pb-4">
              {filteredPins.length === 0 ? (
                <li className="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-3 py-6 text-center text-sm text-slate-500">
                  No events match these filters.
                </li>
              ) : (
                filteredPins.map((p) => (
                  <li key={p.id}>
                    <button
                      type="button"
                      className={`w-full rounded-lg border px-3 py-2 text-left text-sm transition hover:border-slate-300 hover:bg-slate-50 ${
                        selectedPin?.id === p.id
                          ? "border-slate-400 bg-slate-100"
                          : "border-slate-200 bg-white"
                      }`}
                      onClick={() => openEventFromList(p)}
                    >
                      <div className="font-medium text-slate-900">{p.name || "Untitled"}</div>
                      <div className="text-xs text-slate-500">
                        {[p.date, p.city, p.venue].filter(Boolean).join(" · ") || "No date or place"}
                      </div>
                      {(p.music?.length || p.dance?.length) ? (
                        <div className="mt-1 flex flex-wrap gap-1">
                          {p.music?.map((m) => (
                            <span key={m} className="rounded bg-slate-200/80 px-1.5 py-0.5 text-[10px] text-slate-700">
                              {m}
                            </span>
                          ))}
                          {p.dance?.map((d) => (
                            <span key={d} className="rounded bg-indigo-100 px-1.5 py-0.5 text-[10px] text-indigo-800">
                              {d}
                            </span>
                          ))}
                        </div>
                      ) : null}
                    </button>
                  </li>
                ))
              )}
            </ul>
          </div>
        </aside>
      ) : (
        <button
          type="button"
          className="absolute left-0 top-20 z-[1000] rounded-r-lg border border-l-0 border-slate-200 bg-white/95 px-2 py-3 text-xs font-medium text-slate-700 shadow-sm backdrop-blur-sm hover:bg-slate-50"
          onClick={() => setSidebarOpen(true)}
          aria-label="Open events sidebar"
        >
          Events
        </button>
      )}

      <div className="relative min-h-0 min-w-0 flex-1">
        {/* TOP BUTTONS */}
        <div
          className="absolute z-[1000] flex gap-2"
          style={{ top: 20, left: sidebarOpen ? 12 : 56 }}
        >
          <button
            type="button"
            className="rounded-md border border-slate-200 bg-white/90 px-3 py-1.5 text-sm shadow-sm backdrop-blur-sm hover:bg-white"
            onClick={() => setShowTimeline((v) => !v)}
          >
            Timeline
          </button>
        </div>

        {/* MAP */}
        <MapContainer
          center={[20, 0]}
          zoom={2}
          minZoom={2}
          maxBounds={[[-85, -180], [85, 180]]}
          maxBoundsViscosity={1.0}
          worldCopyJump
          className="h-full w-full min-h-0"
        >
          <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
          <FlyToPin focus={mapFocus} />
          <AddPinHandler onAdd={handleAdd} />

          {pins.map((p) => (
            <Marker
              key={p.id}
              position={p.position}
              eventHandlers={{
                click: () => {
                  setSelectedPin(p);
                  setForm(mergeFormFromPin(p));
                }
              }}
            />
          ))}
        </MapContainer>

      {/* INFO PANEL */}
      {selectedPin && (
        <div style={{ position:"absolute", top:20, right:20, backdropFilter:"blur(12px)", background:"rgba(255,255,255,0.8)", padding:16, borderRadius:16, zIndex:1000, maxWidth:340 }}>
          <button onClick={()=>setEditing(!editing)}>{editing ? "Cancel" : "Edit"}</button>

          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10, marginTop:10 }}>
            {Field("Name", selectedPin.name, <input value={form.name} onChange={e=>setForm({...form,name:e.target.value})}/>)}
            {Field("Venue", selectedPin.venue, <input value={form.venue} onChange={e=>setForm({...form,venue:e.target.value})}/>)}
            {Field("City", selectedPin.city, <input value={form.city} onChange={e=>setForm({...form,city:e.target.value})}/>)}
            {Field("Date", selectedPin.date, <input type="date" value={form.date} onChange={e=>setForm({...form,date:e.target.value})}/>)}
            {Field(
              "Hours",
              formatHoursLabel(selectedPin),
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
                <input
                  type="time"
                  step={300}
                  value={form.hoursStart}
                  onChange={(e) => setForm({ ...form, hoursStart: e.target.value })}
                  aria-label="Start time"
                />
                <span style={{ color: "#666" }}>to</span>
                <input
                  type="time"
                  step={300}
                  value={form.hoursEnd}
                  onChange={(e) => setForm({ ...form, hoursEnd: e.target.value })}
                  aria-label="End time"
                />
              </div>
            )}
            {Field("Country", selectedPin.country, null, true)}
            {Field("Street", selectedPin.street, null, true)}

            {Field("People", selectedPin.people,
              <input type="range" min="0" max="200" value={form.people} onChange={e=>setForm({...form,people:Number(e.target.value)})}/>
            )}

            {Field("Music", selectedPin.music?.join(", "),
              <TagSelector options={MUSIC_OPTIONS} selected={form.music} toggle={(v)=>toggleMulti("music",v)}/>
            )}

            {Field("Dance", selectedPin.dance?.join(", "),
              <TagSelector options={DANCE_OPTIONS} selected={form.dance} toggle={(v)=>toggleMulti("dance",v)}/>
            )}
          </div>

          {editing && <button style={{ marginTop:10 }} onClick={updatePin}>Save</button>}
        </div>
      )}

      {/* MODAL */}
      {pendingPin && (
        <div style={{ position:"absolute", inset:0, background:"rgba(0,0,0,0.4)", display:"flex", alignItems:"center", justifyContent:"center", zIndex:2000 }}>
          <div style={{ background:"white", padding:20, borderRadius:16, width:340 }}>
            <h3>New Event</h3>

            <input placeholder="Event name" value={form.name} onChange={e=>setForm({...form,name:e.target.value})}/>
            <input placeholder="Venue name" value={form.venue} onChange={e=>setForm({...form,venue:e.target.value})}/>
            <input placeholder="City" value={form.city} onChange={e=>setForm({...form,city:e.target.value})}/>
            <input type="date" value={form.date} onChange={e=>setForm({...form,date:e.target.value})}/>
            <div style={{ marginTop: 8, display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
              <span style={{ fontSize: 12, color: "#444" }}>From</span>
              <input type="time" step={300} value={form.hoursStart} onChange={e=>setForm({...form,hoursStart:e.target.value})} aria-label="Start time" />
              <span style={{ fontSize: 12, color: "#444" }}>to</span>
              <input type="time" step={300} value={form.hoursEnd} onChange={e=>setForm({...form,hoursEnd:e.target.value})} aria-label="End time" />
            </div>

            <div style={{ marginTop:10 }}>
              <b>Music</b>
              <TagSelector options={MUSIC_OPTIONS} selected={form.music} toggle={(v)=>toggleMulti("music",v)}/>
            </div>

            <div style={{ marginTop:10 }}>
              <b>Dance</b>
              <TagSelector options={DANCE_OPTIONS} selected={form.dance} toggle={(v)=>toggleMulti("dance",v)}/>
            </div>

            <div style={{ marginTop:10 }}>
              <b>People</b>
              <input type="range" min="0" max="200" value={form.people} onChange={e=>setForm({...form,people:Number(e.target.value)})}/>
            </div>

            <div style={{ marginTop:12, display:"flex", justifyContent:"space-between" }}>
              <button onClick={()=>setPendingPin(null)}>Cancel</button>
              <button onClick={savePin}>Save</button>
            </div>
          </div>
        </div>
      )}

      {/* TIMELINE */}
      {showTimeline && (
        <div
          style={{
            position: "absolute",
            bottom: 0,
            left: 0,
            right: 0,
            minHeight: 120,
            maxHeight: "32vh",
            backdropFilter: "blur(10px)",
            background: "rgba(255,255,255,0.92)",
            zIndex: 1000,
            borderTop: "1px solid rgba(0,0,0,0.08)",
            display: "flex",
            flexDirection: "column",
            boxSizing: "border-box"
          }}
        >
          <div style={{ padding: "8px 12px 0", fontSize: 12, color: "#64748b" }}>
            {timelinePins.length === 0
              ? "No events yet — add pins on the map."
              : "Chronological (events without a date appear at the end). Click a card to focus on the map."}
          </div>
          <div style={{ flex: 1, overflowX: "auto", overflowY: "hidden", display: "flex", gap: 10, padding: 10, alignItems: "stretch" }}>
            {timelinePins.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => openEventFromList(p)}
                style={{
                  minWidth: 140,
                  maxWidth: 200,
                  flex: "0 0 auto",
                  padding: 10,
                  background: selectedPin?.id === p.id ? "#e2e8f0" : "#f1f5f9",
                  borderRadius: 10,
                  border: "1px solid #cbd5e1",
                  cursor: "pointer",
                  textAlign: "left",
                  font: "inherit"
                }}
              >
                <div style={{ fontWeight: 700, fontSize: 13, color: "#0f172a" }}>{p.name || "Untitled"}</div>
                <div style={{ fontSize: 11, color: "#475569", marginTop: 4 }}>{p.date || "No date"}</div>
                {(p.city || p.venue) ? (
                  <div style={{ fontSize: 11, color: "#64748b", marginTop: 4, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {[p.city, p.venue].filter(Boolean).join(" · ")}
                  </div>
                ) : null}
              </button>
            ))}
          </div>
        </div>
      )}

      </div>
    </div>
  );
}

