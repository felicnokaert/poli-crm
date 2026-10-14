import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { MapPin, Minus, Plus } from 'lucide-react';
import { PROSPECT_FAMILIES, PROSPECT_STATES } from './prospect-model.mjs';
import { buildCityIndex, deficitRanking, familyPoints, locateCity } from './prospect-coverage.mjs';
import { MAP_SIZE, STATE_COLORS, UNITS, clusterPoints, familiesForUnit, filterPoints, mapPoints, project, provincePaths } from './prospect-map.mjs';

const EMPTY = [];
const fmt = (value) => Math.round(value).toLocaleString('es-AR');

function ProspeccionMapaBase({ data, onOpenClient, cities: citiesProp, provincesGeo: geoProp }) {
  const prospects = Array.isArray(data.prospects) ? data.prospects : EMPTY;
  const clients = Array.isArray(data.clients) ? data.clients : EMPTY;
  const [cities, setCities] = useState(citiesProp || []);
  const [provinces, setProvinces] = useState({});
  const [geo, setGeo] = useState(geoProp || null);
  const [filters, setFilters] = useState({ unit: '', family: '', state: '', province: '', city: '', from: '', to: '' });
  const [view, setView] = useState({ x: 0, y: 0, w: MAP_SIZE.width });
  const [selected, setSelected] = useState(null);
  const [deficitFamily, setDeficitFamily] = useState('Penosil');
  const drag = useRef(null);

  useEffect(() => {
    if ((citiesProp && geoProp) || typeof fetch !== 'function') return undefined;
    let cancelled = false;
    Promise.all([
      fetch('/mapa/data/ciudades.json').then((response) => response.json()),
      fetch('/mapa/data/zonas.json').then((response) => response.json()),
      fetch('/mapa/data/provincias.geojson').then((response) => response.json()),
    ]).then(([citiesFile, zonesFile, geojson]) => {
      if (cancelled) return;
      setCities(citiesFile.ciudades || []);
      setProvinces(Object.fromEntries((zonesFile.provincias || []).map((item) => [item.cod, item.nombre])));
      setGeo(geojson);
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [citiesProp, geoProp]);

  const index = useMemo(() => buildCityIndex(cities), [cities]);
  const paths = useMemo(() => provincePaths(geo), [geo]);
  const locate = useMemo(() => (item) => {
    if (Number.isFinite(item.lat) && Number.isFinite(item.lon)) return { lat: item.lat, lon: item.lon };
    const city = locateCity(index, item.city, item.province, provinces);
    return city ? { lat: city.lat, lon: city.lon } : null;
  }, [index, provinces]);

  const { points, unlocated } = useMemo(() => mapPoints({ prospects, locate }), [prospects, locate]);
  const shown = useMemo(() => filterPoints(points, filters), [points, filters]);
  const scale = MAP_SIZE.width / view.w;
  const clusters = useMemo(() => clusterPoints(shown, 14 / scale), [shown, scale]);

  const deficit = useMemo(() => {
    if (!cities.length) return null;
    const pts = familyPoints(deficitFamily, { clients, prospects, cities, provinces, index });
    return { hasData: pts.length > 0, ...deficitRanking(deficitFamily, cities, pts) };
  }, [deficitFamily, cities, clients, prospects, provinces, index]);

  const set = (key, value) => setFilters((current) => ({ ...current, [key]: value, ...(key === 'unit' ? { family: '' } : {}) }));
  const zoom = (factor, center = null) => setView((current) => {
    const w = Math.min(MAP_SIZE.width, Math.max(MAP_SIZE.width / 40, current.w * factor));
    const h = w * (MAP_SIZE.height / MAP_SIZE.width);
    const cx = center?.x ?? current.x + current.w / 2;
    const cy = center?.y ?? current.y + (current.w * (MAP_SIZE.height / MAP_SIZE.width)) / 2;
    return { x: Math.min(Math.max(0, cx - w / 2), MAP_SIZE.width - w), y: Math.min(Math.max(0, cy - h / 2), MAP_SIZE.height - h), w };
  });
  const viewBox = `${view.x} ${view.y} ${view.w} ${view.w * (MAP_SIZE.height / MAP_SIZE.width)}`;

  const onPointerDown = (event) => { drag.current = { x: event.clientX, y: event.clientY, view }; };
  const onPointerMove = (event) => {
    if (!drag.current) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const ratio = drag.current.view.w / (rect.width || 1);
    const h = drag.current.view.w * (MAP_SIZE.height / MAP_SIZE.width);
    setView({
      w: drag.current.view.w,
      x: Math.min(Math.max(0, drag.current.view.x - (event.clientX - drag.current.x) * ratio), MAP_SIZE.width - drag.current.view.w),
      y: Math.min(Math.max(0, drag.current.view.y - (event.clientY - drag.current.y) * ratio), MAP_SIZE.height - h),
    });
  };
  const onPointerUp = () => { drag.current = null; };

  return (
    <section className="panel">
      <div className="panel-head">
        <div>
          <span className="eyebrow">Cartera</span>
          <h2>Mapa de prospección</h2>
          <p>Dónde buscaste y qué pasó con cada prospecto. Muestra solo prospectos de las demás familias; los clientes y aplicadores de POLIOCHO siguen en el mapa de cobertura, sin mezclarse.</p>
        </div>
        <MapPin size={20} />
      </div>

      <div className="panel-head-actions">
        <select aria-label="Unidad de negocio" value={filters.unit} onChange={(event) => set('unit', event.target.value)}>
          <option value="">Todas las unidades</option>
          {UNITS.map((item) => <option key={item}>{item}</option>)}
        </select>
        <select aria-label="Familia del mapa" value={filters.family} onChange={(event) => set('family', event.target.value)}>
          <option value="">Todas las familias</option>
          {familiesForUnit(filters.unit).map((item) => <option key={item}>{item}</option>)}
        </select>
        <select aria-label="Estado del mapa" value={filters.state} onChange={(event) => set('state', event.target.value)}>
          <option value="">Todos los estados</option>
          {PROSPECT_STATES.map((item) => <option key={item}>{item}</option>)}
        </select>
        <select aria-label="Provincia del mapa" value={filters.province} onChange={(event) => set('province', event.target.value)}>
          <option value="">Todas las provincias</option>
          {Object.values(provinces).sort((a, b) => a.localeCompare(b, 'es')).map((item) => <option key={item}>{item}</option>)}
        </select>
        <input aria-label="Localidad del mapa" placeholder="Localidad" value={filters.city} onChange={(event) => set('city', event.target.value)} />
        <label>Desde <input type="date" aria-label="Desde" value={filters.from} onChange={(event) => set('from', event.target.value)} /></label>
        <label>Hasta <input type="date" aria-label="Hasta" value={filters.to} onChange={(event) => set('to', event.target.value)} /></label>
      </div>
      <p className="muted">
        {shown.length} pines{unlocated ? ` · ${unlocated} prospectos sin ubicar (les falta la localidad o no se reconoce)` : ''}.
        {' '}{Object.entries(STATE_COLORS).filter(([state]) => state !== 'Cliente').map(([state, color]) => (
          <span key={state}><i style={{ background: color, display: 'inline-block', width: 10, height: 10, borderRadius: 5, margin: '0 4px 0 10px' }} />{state}</span>
        ))}
      </p>

      <div className="panel-head-actions">
        <button type="button" className="secondary" aria-label="Acercar" onClick={() => zoom(0.6)}><Plus size={14} /></button>
        <button type="button" className="secondary" aria-label="Alejar" onClick={() => zoom(1 / 0.6)}><Minus size={14} /></button>
        <button type="button" className="secondary" onClick={() => setView({ x: 0, y: 0, w: MAP_SIZE.width })}>Ver todo el país</button>
      </div>
      <svg
        role="img" aria-label="Mapa de prospección" viewBox={viewBox} style={{ width: '100%', maxHeight: 640, background: 'var(--surface-2, #f1f5f9)', borderRadius: 8, touchAction: 'none' }}
        onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerLeave={onPointerUp}
      >
        {paths.map((item) => <path key={item.id} d={item.d} fill="#e2e8f0" stroke="#94a3b8" strokeWidth={0.4} />)}
        {clusters.map((cluster) => (
          <g key={`${cluster.x.toFixed(1)}:${cluster.y.toFixed(1)}`} style={{ cursor: 'pointer' }} onClick={() => (cluster.count > 1 && scale < 30 ? zoom(0.4, { x: cluster.x, y: cluster.y }) : setSelected(cluster.items))}>
            <circle cx={cluster.x} cy={cluster.y} r={(cluster.count > 1 ? 4 + Math.sqrt(cluster.count) * 1.4 : 2.6) / Math.sqrt(scale)} fill={STATE_COLORS[cluster.state]} stroke="#fff" strokeWidth={0.5 / Math.sqrt(scale)} opacity={0.9} />
            {cluster.count > 1 && <text x={cluster.x} y={cluster.y + 1.4 / Math.sqrt(scale)} textAnchor="middle" fontSize={4 / Math.sqrt(scale)} fill="#fff">{cluster.count}</text>}
          </g>
        ))}
      </svg>

      {selected && (
        <div className="panel">
          <h3>{selected.length === 1 ? selected[0].name : `${selected.length} en esta zona`}</h3>
          {selected.slice(0, 10).map((item) => (
            <p key={item.id}>
              <strong>{item.name}</strong> · {item.family} · {item.state}{item.city ? ` · ${item.city}` : ''}
              {item.linkedClientId && <> · <button type="button" className="link-button" onClick={() => onOpenClient?.(item.linkedClientId)}>Abrir ficha</button></>}
            </p>
          ))}
          <button type="button" className="secondary" onClick={() => setSelected(null)}>Cerrar</button>
        </div>
      )}

      <h3>Zonas con más déficit de cobertura</h3>
      <label>Familia
        <select aria-label="Familia del déficit" value={deficitFamily} onChange={(event) => setDeficitFamily(event.target.value)}>
          {PROSPECT_FAMILIES.map((item) => <option key={item.key}>{item.key}</option>)}
        </select>
      </label>
      {deficit && (
        <>
          <p className="muted">{deficit.hasData ? 'Habitantes por cliente o prospecto de la familia en un radio de 50 km (mismo cálculo del mapa de cobertura).' : 'Esta familia todavía no tiene datos: se ordena por población.'}</p>
          <table>
            <thead><tr><th>Zona</th><th>Provincia</th><th>Población</th><th>Puntos cerca</th><th>Hab. por punto</th></tr></thead>
            <tbody>
              {deficit.zones.slice(0, 10).map((row) => (
                <tr key={row.zone.id}><td>{row.zone.nombre}</td><td>{provinces[row.zone.prov] || ''}</td><td>{fmt(row.zone.pob)}</td><td>{deficit.hasData ? row.n : '–'}</td><td>{deficit.hasData ? fmt(row.habPorPunto) : '–'}</td></tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </section>
  );
}

export const ProspeccionMapa = memo(ProspeccionMapaBase);
