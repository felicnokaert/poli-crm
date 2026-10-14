import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { MapPin, Minus, Plus } from 'lucide-react';
import { PROSPECT_FAMILIES, PROSPECT_STATES } from './prospect-model.mjs';
import { buildCityIndex, deficitRanking, familyPoints, locateCity } from './prospect-coverage.mjs';
import { MAP_SIZE, STATE_COLORS, UNITS, clusterPoints, familiesForUnit, filterPoints, mapPoints, project, provincePaths, salesByProvince } from './prospect-map.mjs';
import { toMapClient } from './map-clients-adapter.mjs';

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
  const [showClients, setShowClients] = useState(true);
  const [showProspects, setShowProspects] = useState(true);
  const [gapFamily, setGapFamily] = useState('Penosil');
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

  // Los aplicadores (RAPYP) tienen su propio mapa: acá no entran.
  const isApplicator = useMemo(() => (client) => toMapClient(client)?.tipo === 'aplicador', []);
  const index = useMemo(() => buildCityIndex(cities), [cities]);
  const paths = useMemo(() => provincePaths(geo), [geo]);
  const locate = useMemo(() => (item) => {
    if (Number.isFinite(item.lat) && Number.isFinite(item.lon)) return { lat: item.lat, lon: item.lon };
    const city = locateCity(index, item.city, item.province, provinces);
    return city ? { lat: city.lat, lon: city.lon } : null;
  }, [index, provinces]);

  const { points, unlocated, applicators } = useMemo(() => mapPoints({ prospects, clients, includeClients: showClients, includeProspects: showProspects, isApplicator, locate }), [prospects, clients, showClients, showProspects, locate]);
  const shown = useMemo(() => filterPoints(points, filters), [points, filters]);
  const scale = MAP_SIZE.width / view.w;
  const clusters = useMemo(() => clusterPoints(shown, 14 / scale), [shown, scale]);

  const byProvince = useMemo(() => salesByProvince(shown), [shown]);
  // Ciudades grandes sin ningún cliente ni prospecto de la familia en 50 km: dónde falta presencia.
  const gaps = useMemo(() => {
    if (!cities.length) return [];
    const pts = familyPoints(gapFamily, { clients: clients.filter((client) => !isApplicator(client)), prospects, cities, provinces, index });
    return deficitRanking(gapFamily, cities, pts).zones.filter((row) => row.n === 0).sort((a, b) => b.zone.pob - a.zone.pob).slice(0, 12);
  }, [gapFamily, cities, clients, prospects, provinces, index, isApplicator]);

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
          <h2>Mapa de ventas</h2>
          <p>Dónde vendés (clientes que no son aplicadores) y dónde buscaste (prospectos). Los aplicadores están en su propio mapa, el de RAPYP.</p>
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
          <option>Cliente</option>
        </select>
        <select aria-label="Provincia del mapa" value={filters.province} onChange={(event) => set('province', event.target.value)}>
          <option value="">Todas las provincias</option>
          {Object.values(provinces).sort((a, b) => a.localeCompare(b, 'es')).map((item) => <option key={item}>{item}</option>)}
        </select>
        <input aria-label="Localidad del mapa" placeholder="Localidad" value={filters.city} onChange={(event) => set('city', event.target.value)} />
        <label className="checkbox-field"><input type="checkbox" checked={showClients} onChange={(event) => setShowClients(event.target.checked)} /> Clientes</label>
        <label className="checkbox-field"><input type="checkbox" checked={showProspects} onChange={(event) => setShowProspects(event.target.checked)} /> Prospectos</label>
        <label>Desde <input type="date" aria-label="Desde" value={filters.from} onChange={(event) => set('from', event.target.value)} /></label>
        <label>Hasta <input type="date" aria-label="Hasta" value={filters.to} onChange={(event) => set('to', event.target.value)} /></label>
      </div>
      <p className="muted">
        {shown.length} pines{applicators ? ` · ${applicators} aplicadores no se muestran (están en el mapa de RAPYP)` : ''}{unlocated ? ` · ${unlocated} sin ubicar (les falta la localidad o no se reconoce)` : ''}.
        {' '}{Object.entries(STATE_COLORS).map(([state, color]) => (
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
            <p key={item.id} style={{ overflowWrap: 'anywhere' }}>
              <strong>{item.name}</strong> · {item.family} · {item.state}{item.city ? ` · ${item.city}` : ''}
              {item.linkedClientId && <> · <button type="button" className="link-button" onClick={() => onOpenClient?.(item.linkedClientId)}>Abrir ficha</button></>}
            </p>
          ))}
          <button type="button" className="secondary" onClick={() => setSelected(null)}>Cerrar</button>
        </div>
      )}

      <h3>Dónde vendo</h3>
      <p className="muted">Clientes y prospectos por provincia, con los filtros de arriba.</p>
      <table>
        <thead><tr><th>Provincia</th><th>Clientes</th><th>Prospectos</th></tr></thead>
        <tbody>{byProvince.slice(0, 24).map((row) => <tr key={row.province}><td>{row.province}</td><td>{row.clients}</td><td>{row.prospects}</td></tr>)}</tbody>
      </table>

      <h3>Ciudades grandes sin presencia</h3>
      <label>Familia
        <select aria-label="Familia de las zonas sin presencia" value={gapFamily} onChange={(event) => setGapFamily(event.target.value)}>
          {PROSPECT_FAMILIES.map((item) => <option key={item.key}>{item.key}</option>)}
        </select>
      </label>
      <p className="muted">Ciudades sin ningún cliente ni prospecto de la familia en 50 km, de mayor a menor población. Sirve para decidir dónde prospectar.</p>
      <table>
        <thead><tr><th>Ciudad</th><th>Provincia</th><th>Población</th></tr></thead>
        <tbody>{gaps.map((row) => <tr key={row.zone.id}><td>{row.zone.nombre}</td><td>{provinces[row.zone.prov] || ''}</td><td>{fmt(row.zone.pob)}</td></tr>)}</tbody>
      </table>
    </section>
  );
}

export const ProspeccionMapa = memo(ProspeccionMapaBase);
