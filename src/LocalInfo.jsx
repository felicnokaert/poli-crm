import { useEffect, useState } from "react";
import { MapPin } from "lucide-react";
import { DEFAULT_PLACES, HOME_TZ, geocodeUrl, parseGeocode, parseWeather, timeIn, weatherUrl } from "./local-info.mjs";

const STORE_KEY = "poliplast-custom-place";
const REFRESH_MS = 15 * 60 * 1000;

function readPlace() {
  try { return JSON.parse(localStorage.getItem(STORE_KEY) || "null"); } catch { return null; }
}
function writePlace(place) {
  try { place ? localStorage.setItem(STORE_KEY, JSON.stringify(place)) : localStorage.removeItem(STORE_KEY); } catch { /* sin almacenamiento */ }
}

export function LocalInfo({ fetcher = (...args) => fetch(...args) }) {
  const [now, setNow] = useState(() => new Date());
  const [custom, setCustom] = useState(readPlace);
  const [asking, setAsking] = useState(false);
  const [text, setText] = useState("");
  const [error, setError] = useState("");
  const [weather, setWeather] = useState({});
  const places = custom ? [...DEFAULT_PLACES, custom] : DEFAULT_PLACES;
  const placesKey = places.map((place) => place.name).join("|");

  useEffect(() => { const id = setInterval(() => setNow(new Date()), 20000); return () => clearInterval(id); }, []);
  useEffect(() => {
    let cancelled = false;
    async function load() {
      for (const place of places) {
        try {
          const response = await fetcher(weatherUrl(place));
          const parsed = parseWeather(await response.json());
          if (!cancelled && parsed) setWeather((current) => ({ ...current, [place.name]: parsed }));
        } catch { /* sin clima: se muestra solo el nombre */ }
      }
    }
    load();
    const id = setInterval(load, REFRESH_MS);
    return () => { cancelled = true; clearInterval(id); };
  }, [placesKey]);

  async function addPlace(event) {
    event.preventDefault();
    if (!text.trim()) return;
    setError("");
    try {
      const response = await fetcher(geocodeUrl(text));
      const place = parseGeocode(await response.json());
      if (!place) { setError("No encontré ese lugar."); return; }
      setCustom(place); writePlace(place); setAsking(false); setText("");
    } catch { setError("No se pudo buscar el lugar."); }
  }
  function removePlace() { setCustom(null); writePlace(null); }

  return (
    <span className="local-info" aria-label="Hora y clima">
      <span className="local-chip" title="Hora de Argentina">🕒 {timeIn(HOME_TZ, now)} <small>ART</small></span>
      {places.map((place) => {
        const w = weather[place.name];
        const isCustom = custom && place.name === custom.name;
        return (
          <span className="local-chip" key={place.name} title={w ? `${place.name}: ${w.label}` : place.name}>
            {place.name}{w ? <> {w.icon} {w.temp}°</> : null}{isCustom ? <> <small>{timeIn(place.timezone, now)}</small> <button type="button" className="link-button" aria-label={`Quitar ${place.name}`} onClick={removePlace}>×</button></> : null}
          </span>
        );
      })}
      {!custom && !asking && <button type="button" className="local-chip local-add" onClick={() => setAsking(true)}><MapPin size={12} /> ¿Dónde estás?</button>}
      {asking && (
        <form className="local-form" onSubmit={addPlace}>
          <input autoFocus value={text} onChange={(event) => setText(event.target.value)} placeholder="Ciudad…" aria-label="Ciudad" />
          <button type="submit" className="link-button">Ver</button>
          <button type="button" className="link-button" onClick={() => { setAsking(false); setError(""); }}>Cancelar</button>
        </form>
      )}
      {error && <span className="muted small">{error}</span>}
    </span>
  );
}
