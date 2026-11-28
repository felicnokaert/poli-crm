import React, { useState, useEffect, useRef, useCallback, createContext, useContext } from 'react';
import { agendaHoy, agendaDe, alternar, DIAS } from './agendaConteo.mjs';
import { conteoDb } from './conteo-db.js';
import { getPersona, getDeposito, setDeposito, adminDeApp, setIdentidad } from './identidad.js';
import './conteo.css';

// Conteo NATIVO de Poliplast App (28/11, Felipe: «una sola app, como Contabilium»). Es la misma pantalla de la app de conteo
// (poliplast-app src/App.jsx), con la misma base (kv_store) y la misma lógica. Cambia el marco: sin logo ni barra de abajo
// propios, «Contar / Administración» arriba (solo administradores de la app, sin PIN) y el estilo encerrado en .logi-conteo.
const supabase = conteoDb();
const setPersona = () => {}; // quién cuenta se elige en la pantalla; no cambia el usuario de la app
function Splash({ texto }) { return <p className="cargando-txt" role="status">{texto}…</p>; }
const NavConteo = createContext(null);

/* ============================= conexión Supabase (persistencia real, en vez de window.storage) ============================= */

/* ============================= CATÁLOGO BASE (desde Excel) ============================= */
const CATALOGO_KEY = 'catalogo:base';
let CATALOGO_BASE = { CATS: [], ITEMS: [], CATS_PROD: [], ITEMS_PROD: [] };


// El PIN de administrador ya no vive en la app ni en la tabla pública: se verifica en la base (función verificar_pin).
const CONFIG_DEFAULT = {
  contadores: ['Marcos', 'Jeremías', 'Neyen', 'Juan M.', 'Braian'],
  deps: [
    { id: 'bera', nombre: 'Berazategui', catalogo: 'principal' },
    { id: 'mardel', nombre: 'Mar del Plata', catalogo: 'principal' },
    { id: 'prod', nombre: 'Producción', catalogo: 'produccion' },
  ],
};
const UNIDADES = ['Tambor', 'Tira', 'Rollo', 'Caja', 'Kilo', 'Unidad'];

const CONFIG_KEY = 'config';
const OVERRIDES_KEY = 'catalogo_overrides';
const EXTRA_KEY = 'catalogo_extra';
const conteoKey = (depId, contador) => 'conteo:' + depId + ':' + contador;
const logKey = (depId, contador, fechaISO) => 'log:' + depId + ':' + contador + ':' + fechaISO;

/* ============================= helpers puros (catálogo editable) ============================= */
function slugify(s) {
  return String(s).normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-+|-+$/g, '').toLowerCase();
}
function defaultOverrides() { return { presentacion: {}, clasificacion: { principal: {}, produccion: {} } }; }
function defaultExtra() { return { agregados: [], eliminados: [], categoriasExtra: { principal: [], produccion: [] }, subsExtra: {} }; }
function normalizarOverrides(ov) {
  const base = defaultOverrides();
  if (!ov || typeof ov !== 'object') return base;
  if (ov.presentacion && typeof ov.presentacion === 'object' && ov.clasificacion && typeof ov.clasificacion === 'object') {
    return {
      presentacion: { ...ov.presentacion },
      clasificacion: { principal: { ...((ov.clasificacion && ov.clasificacion.principal) || {}) }, produccion: { ...((ov.clasificacion && ov.clasificacion.produccion) || {}) } },
    };
  }
  // forma antigua (de una versión anterior): objeto plano sku -> {unidad,cap}. Se migra sola.
  return { presentacion: { ...ov }, clasificacion: { principal: {}, produccion: {} } };
}
function normalizarExtra(ex) {
  const base = defaultExtra();
  if (!ex || typeof ex !== 'object') return base;
  return {
    agregados: Array.isArray(ex.agregados) ? ex.agregados : [],
    eliminados: Array.isArray(ex.eliminados) ? ex.eliminados : [],
    categoriasExtra: {
      principal: Array.isArray(ex.categoriasExtra && ex.categoriasExtra.principal) ? ex.categoriasExtra.principal : [],
      produccion: Array.isArray(ex.categoriasExtra && ex.categoriasExtra.produccion) ? ex.categoriasExtra.produccion : [],
    },
    subsExtra: (ex.subsExtra && typeof ex.subsExtra === 'object') ? ex.subsExtra : {},
  };
}

function baseItems(dep) { return dep.catalogo === 'produccion' ? CATALOGO_BASE.ITEMS_PROD : CATALOGO_BASE.ITEMS; }
function baseCats(dep) { return dep.catalogo === 'produccion' ? CATALOGO_BASE.CATS_PROD : CATALOGO_BASE.CATS; }

function aplicarOverride(item, dep, overrides) {
  let it = item;
  const pres = overrides.presentacion && overrides.presentacion[item.sku];
  if (pres) it = Object.assign({}, it, { unidad: pres.unidad, cap: pres.cap, nombre: pres.nombre || it.nombre });
  const clasMap = overrides.clasificacion && overrides.clasificacion[dep.catalogo];
  const clas = clasMap && clasMap[item.sku];
  if (clas) it = Object.assign({}, it, { cat: clas.cat, sub: clas.sub });
  return it;
}
function catsDe(dep, extra) {
  const withSubsExtra = (cats) => cats.map((c) => {
    const extraSubs = (extra.subsExtra[dep.catalogo + '|' + c.id]) || [];
    return Object.assign({}, c, { subs: c.subs.concat(extraSubs) });
  });
  const base = withSubsExtra(baseCats(dep));
  const extraCats = withSubsExtra(extra.categoriasExtra[dep.catalogo] || []);
  return base.concat(extraCats);
}
function itemsDe(dep, overrides, extra) {
  const eliminados = new Set(extra.eliminados);
  const base = baseItems(dep).filter((i) => !eliminados.has(i.sku)).map((i) => aplicarOverride(i, dep, overrides));
  const seen = new Set(base.map((i) => i.sku));
  const agregados = extra.agregados
    .filter((i) => i.catalogo === dep.catalogo && !eliminados.has(i.sku) && !seen.has(i.sku))
    .map((i) => aplicarOverride(i, dep, overrides));
  return base.concat(agregados);
}
function catById(dep, catId, extra) { return catsDe(dep, extra).find((c) => c.id === catId) || null; }
function subNombreDe(dep, catId, subId, extra) {
  if (!subId) return null;
  const c = catById(dep, catId, extra);
  if (!c) return null;
  const s = c.subs.find((x) => x.id === subId);
  return s ? s.nombre : null;
}
function skusDe(dep, catId, subId, overrides, extra) {
  return itemsDe(dep, overrides, extra).filter((i) => i.cat === catId && (subId ? i.sub === subId : true));
}
function itemBySku(dep, sku, overrides, extra) {
  return itemsDe(dep, overrides, extra).find((i) => i.sku === sku) || null;
}
function catalogosDeSku(sku, extra) {
  const out = [];
  ['principal', 'produccion'].forEach((tipo) => {
    const base = tipo === 'produccion' ? CATALOGO_BASE.ITEMS_PROD : CATALOGO_BASE.ITEMS;
    const enBase = base.some((i) => i.sku === sku);
    const enAgregados = extra.agregados.some((i) => i.sku === sku && i.catalogo === tipo);
    if (enBase || enAgregados) out.push(tipo);
  });
  return out;
}
function existeSku(sku, extra) {
  const s = sku.trim().toLowerCase();
  const enBase = CATALOGO_BASE.ITEMS.some((i) => i.sku.toLowerCase() === s) || CATALOGO_BASE.ITEMS_PROD.some((i) => i.sku.toLowerCase() === s);
  const enAgregados = extra.agregados.some((i) => i.sku.toLowerCase() === s);
  return enBase || enAgregados;
}
function n(v) { return Number(v || 0).toLocaleString('es-AR'); }
function medida(it) {
  if (!it || !it.cap) return '';
  const u = String(it.unidad || '').toLowerCase();
  if (u === 'tambor' || u === 'kilo' || u === 'caja') return n(it.cap) + ' kg';
  if (u === 'tira' || u === 'rollo') return n(it.cap) + ' m';
  return n(it.cap) + ' c/u';
}
function presentacionTxt(it) {
  if (!it) return '';
  const m = medida(it);
  return m ? it.unidad + ' de ' + m : 'Se cuenta por ' + String(it.unidad || '').toLowerCase();
}
function hoyISO() { return new Date().toISOString().slice(0, 10); }
function hoyStr() { return new Date().toLocaleDateString('es-AR'); }
function ahoraStr() { return new Date().toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', hour12: false }); }
function buildCSV(entries) {
  const cols = ['Fecha', 'Hora', 'Contador', 'Deposito', 'Categoria', 'Subcategoria', 'SKU', 'Nombre del producto', 'Unidad de medida', 'Presentacion (peso/medida)', 'Conteo', 'Tipo de carga'];
  function e(v) {
    const t = String(v === null || v === undefined ? '' : v);
    return /["\n;]/.test(t) ? '"' + t.replace(/"/g, '""') + '"' : t;
  }
  const filas = entries.map((r) => [r.fecha, r.hora, r.contador, r.depNombre, r.catNombre || '', r.subNombre || '', r.sku, r.nombre, r.unidad, r.cap || '', r.cant, r.modo === 'sumar' ? 'Suma' : r.modo === 'reemplazar' ? 'Reemplazo' : 'Conteo']);
  return '\uFEFF' + [cols].concat(filas).map((f) => f.map(e).join(';')).join('\r\n');
}

/* ============================= wrappers de almacenamiento compartido (Supabase) =============================
   Misma firma que antes (getShared/setShared/listShared/deleteShared) para no tocar el resto del código.
   Tabla: kv_store(key text primary key, value jsonb, updated_at timestamptz).
   Seguridad: cualquiera puede leer, y los contadores pueden escribir solo conteo:* y log:*.
   Las claves de administrador (config, catálogo, ajustes) y los borrados solo se aceptan con el PIN,
   que se verifica dentro de la base mediante funciones (guardar_admin, borrar_admin, verificar_pin, cambiar_pin). */
const CLAVES_ADMIN = ['config', 'catalogo_overrides', 'catalogo_extra', 'catalogo:base'];
let ADMIN_PIN_SESION = null; // se guarda solo en memoria, mientras el administrador está dentro del panel

async function getShared(key, fallback) {
  try {
    const { data, error } = await supabase.from('kv_store').select('value').eq('key', key).maybeSingle();
    if (error || !data) return fallback;
    return data.value;
  } catch (e) { return fallback; }
}
async function setShared(key, value) {
  if (CLAVES_ADMIN.includes(key)) {
    const { data, error } = await supabase.rpc('guardar_admin', { p_pin: ADMIN_PIN_SESION || '', p_key: key, p_value: value });
    if (error || data !== true) throw new Error('No se pudo guardar');
    return true;
  }
  const { error } = await supabase.from('kv_store').upsert({ key, value, updated_at: new Date().toISOString() });
  if (error) throw new Error('No se pudo guardar');
  return true;
}
async function listShared(prefix) {
  try {
    const { data, error } = await supabase.from('kv_store').select('key').like('key', prefix + '%');
    if (error || !data) return [];
    return data.map((r) => r.key);
  } catch (e) { return []; }
}
async function deleteShared(key) {
  try { await supabase.rpc('borrar_admin', { p_pin: ADMIN_PIN_SESION || '', p_key: key }); } catch (e) {}
}

/* ============================= componente ============================= */
function ConteoInterno({ admin = null }) {
  const [appState, setAppState] = useState('loading'); // loading | ready | error
  const [config, setConfig] = useState(CONFIG_DEFAULT);
  const [overrides, setOverrides] = useState(defaultOverrides());
  const [extra, setExtra] = useState(defaultExtra());
  const [screen, setScreen] = useState('setup');
  const [setupContador, setSetupContador] = useState(() => getPersona() || null); // el nombre elegido en otra pestaña ya viene marcado (se valida contra la lista abajo)
  const [setupDepId, setSetupDepId] = useState(null);
  // 25/11 (Felipe): si ya eligió quién es y el depósito en la barra de arriba, NO se vuelve a preguntar: entra directo a contar.
  // Se valida contra la lista REAL (antes se comparaba con la lista por defecto mientras cargaba y se borraba el nombre).
  const autoInicio = useRef(false);
  const [sesion, setSesion] = useState(null); // {depId, contador, fecha, hora}
  const [conteoActual, setConteoActual] = useState({}); // {sku:qty} del contador+dep actual
  const [conteosPorDep, setConteosPorDep] = useState({}); // {depId: {contador:{sku:qty}}}
  const [progresoLoading, setProgresoLoading] = useState({});
  const [catSel, setCatSel] = useState(null);
  const [subSel, setSubSel] = useState(null);
  const [sheet, setSheet] = useState(null); // {sku, modo}
  const [sheetCant, setSheetCant] = useState('');
  const [modal, setModal] = useState(null);
  const [toastMsg, setToastMsg] = useState(null);
  const [busy, setBusy] = useState(false);
  const [nuevoContador, setNuevoContador] = useState('');
  const [filtroPres, setFiltroPres] = useState('');
  const [editPres, setEditPres] = useState(null); // {sku, unidad, cap}
  const [nuevoDepNombre, setNuevoDepNombre] = useState('');
  const [nuevoDepCatalogo, setNuevoDepCatalogo] = useState('principal');
  const [informeEntries, setInformeEntries] = useState(null); // null=no cargado, []=vacio
  const [informeLoading, setInformeLoading] = useState(false);
  const [copiado, setCopiado] = useState(false);
  const [adminUnlocked, setAdminUnlocked] = useState(() => { if (admin) ADMIN_PIN_SESION = admin.pin; return !!admin; });
  useEffect(() => { if (admin) { ADMIN_PIN_SESION = admin.pin; setAdminUnlocked(true); } }, [admin]);
  const [pinInput, setPinInput] = useState('');
  const [nuevoPin, setNuevoPin] = useState('');
  const [productoNuevo, setProductoNuevo] = useState(null); // form de alta de producto
  const [mostrarEliminados, setMostrarEliminados] = useState(false);
  const toastTimer = useRef(null);

  const dep = (depId) => config.deps.find((d) => d.id === depId);

  const [intento, setIntento] = useState(0); // «Reintentar» vuelve a cargar sin recargar toda la app
  useEffect(() => {
    let vivo = true;
    // 28/11 (QA): sin red la carga no termina nunca; a los 15 s se muestra el aviso con «Reintentar» (como Etiquetas y Dosificado).
    const limite = setTimeout(() => { if (vivo) setAppState((e) => (e === 'loading' ? 'error' : e)); }, 15000);
    (async () => {
      try {
        let cfg = await getShared(CONFIG_KEY, null);
        if (!cfg) cfg = CONFIG_DEFAULT; // la config la crea y guarda el administrador desde el panel
        const cat = await getShared(CATALOGO_KEY, null);
        if (!cat) throw new Error('catalogo no disponible');
        CATALOGO_BASE = cat;
        const ov = await getShared(OVERRIDES_KEY, defaultOverrides());
        const ex = await getShared(EXTRA_KEY, defaultExtra());
        setConfig(cfg);
        setOverrides(normalizarOverrides(ov));
        setExtra(normalizarExtra(ex));
        if (vivo) setAppState('ready');
      } catch (e) {
        if (vivo) setAppState('error');
      } finally { clearTimeout(limite); }
    })();
    return () => { vivo = false; clearTimeout(limite); };
  }, [intento]);

  function showToast(msg) {
    clearTimeout(toastTimer.current);
    setToastMsg(msg);
    toastTimer.current = setTimeout(() => setToastMsg(null), 2800);
  }

  async function conBusy(fn) {
    setBusy(true);
    try { await fn(); } catch (e) { showToast('No se pudo guardar. Probá de nuevo.'); }
    finally { setBusy(false); }
  }

  async function refreshProgresoDep(depId) {
    setProgresoLoading((p) => ({ ...p, [depId]: true }));
    const keys = await listShared('conteo:' + depId + ':');
    const porContador = {};
    for (const k of keys) {
      const contador = k.slice(('conteo:' + depId + ':').length);
      const mapa = await getShared(k, {});
      porContador[contador] = mapa;
    }
    setConteosPorDep((prev) => ({ ...prev, [depId]: porContador }));
    setProgresoLoading((p) => ({ ...p, [depId]: false }));
  }

  useEffect(() => {
    if (appState === 'ready' && (screen === 'setup' || screen === 'admin')) {
      config.deps.forEach((d) => refreshProgresoDep(d.id));
    }
    // eslint-disable-next-line
  }, [appState, screen]);

  function skusDepContados(depId) {
    const acc = {};
    const porContador = conteosPorDep[depId] || {};
    Object.keys(porContador).forEach((c) => Object.keys(porContador[c] || {}).forEach((sku) => { acc[sku] = true; }));
    return Object.keys(acc);
  }
  function contadoresActivosDep(depId) {
    const porContador = conteosPorDep[depId] || {};
    return Object.keys(porContador).filter((c) => Object.keys(porContador[c] || {}).length)
      .map((c) => ({ contador: c, n: Object.keys(porContador[c]).length }));
  }
  function pctDep(depId) {
    const d = dep(depId);
    if (!d) return 0;
    const total = itemsDe(d, overrides, extra).length;
    return total ? Math.round((skusDepContados(depId).length / total) * 100) : 0;
  }

  function cntSesion() { return conteoActual; }
  function faltan(catId, subId) {
    const d = dep(sesion.depId);
    const c = cntSesion();
    return skusDe(d, catId, subId, overrides, extra).filter((i) => c[i.sku] === undefined).length;
  }

  async function comenzar() {
    if (!setupContador || !setupDepId) return;
    await conBusy(async () => {
      const mapa = await getShared(conteoKey(setupDepId, setupContador), {});
      setConteoActual(mapa);
      setSesion({ depId: setupDepId, contador: setupContador, fecha: hoyStr(), hora: ahoraStr() });
      setCatSel(null); setSubSel(null);
      setScreen('cats');
    });
  }
  // nombre y depósito de la barra de arriba (sin acentos: «Villa Dominico» = «Villa Domínico»)
  useEffect(() => {
    if (appState !== 'ready') return;
    const sa = (x) => String(x || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
    const p = config.contadores.find((c) => sa(c) === sa(getPersona()));
    const d = config.deps.find((x) => sa(x.nombre) === sa(getDeposito()));
    if (setupContador && !config.contadores.includes(setupContador)) setSetupContador(p || null);
    else if (!setupContador && p) setSetupContador(p);
    if (!setupDepId && d) setSetupDepId(d.id);
  }, [appState, config, setupContador, setupDepId]);
  useEffect(() => {
    if (autoInicio.current || appState !== 'ready' || screen !== 'setup') return;
    if (!setupContador || !setupDepId) return;
    autoInicio.current = true;
    comenzar();
  }, [appState, screen, setupContador, setupDepId]); // eslint-disable-line react-hooks/exhaustive-deps

  function abrirCat(catId) {
    const c = catById(dep(sesion.depId), catId, extra);
    setCatSel(catId); setSubSel(null);
    setScreen(c.subs.length ? 'subs' : 'skus');
  }
  function abrirSub(subId) { setSubSel(subId); setScreen('skus'); }

  function intentarSalir(destino, catId, subId) {
    const f = faltan(catId, subId);
    if (f === 0) { setScreen(destino); return; }
    const d = dep(sesion.depId);
    const c = catById(d, catId, extra);
    const sub = subNombreDe(d, catId, subId, extra);
    setModal({ tipo: 'salir', destino, faltan: f, donde: sub ? c.nombre + ' · ' + sub : c.nombre });
  }
  function volver() {
    if (screen === 'subs') { intentarSalir('cats', catSel, null); return; }
    if (screen === 'skus') {
      const c = catById(dep(sesion.depId), catSel, extra);
      intentarSalir(c.subs.length ? 'subs' : 'cats', catSel, subSel);
      return;
    }
    if (screen === 'informe') { setScreen(sesion ? 'cats' : 'admin'); return; }
    if (['admin-contadores', 'admin-presentaciones', 'admin-depositos', 'admin-agenda'].includes(screen)) { setScreen('admin'); return; }
    setScreen('cats');
  }

  function tocarSku(sku) {
    const c = cntSesion();
    if (c[sku] !== undefined) setModal({ tipo: 'existente', sku });
    else { setSheet({ sku, modo: 'nuevo' }); setSheetCant(''); }
  }
  function teclaSheet(k) {
    if (k === 'del') setSheetCant((s) => s.slice(0, -1));
    else if (k === 'c') setSheetCant('');
    else setSheetCant((s) => {
      if (s.length >= 7) return s;
      if (k === '0' && s === '0') return s;
      return s === '0' ? k : s + k;
    });
  }

  async function guardarConteo() {
    if (!sheet || sheetCant === '' || !sesion) return;
    const d = dep(sesion.depId);
    const it = itemBySku(d, sheet.sku, overrides, extra);
    const valor = parseInt(sheetCant, 10);
    const prev = conteoActual[sheet.sku];
    const final = sheet.modo === 'sumar' && prev !== undefined ? prev + valor : valor;
    const hora = ahoraStr();
    await conBusy(async () => {
      const nuevoMapa = { ...conteoActual, [sheet.sku]: final };
      await setShared(conteoKey(sesion.depId, sesion.contador), nuevoMapa);
      const catN = catById(d, it.cat, extra);
      const entry = {
        fecha: sesion.fecha, hora, contador: sesion.contador, depId: sesion.depId, depNombre: d.nombre,
        sku: sheet.sku, nombre: it.nombre, unidad: it.unidad, cap: it.cap || '',
        catNombre: catN ? catN.nombre : '', subNombre: subNombreDe(d, it.cat, it.sub, extra) || '',
        cant: final, modo: sheet.modo,
      };
      const lk = logKey(sesion.depId, sesion.contador, hoyISO());
      const dia = await getShared(lk, []);
      dia.push(entry);
      await setShared(lk, dia);
      setConteoActual(nuevoMapa);
      setSheet(null); setSheetCant('');
      const verbo = sheet.modo === 'sumar' ? 'Sumado' : sheet.modo === 'reemplazar' ? 'Reemplazado' : 'Contado';
      showToast(verbo + ': ' + it.sku + ' = ' + n(final) + ' ' + it.unidad + '.');
    });
  }

  function cerrarConteo() {
    const contados = Object.keys(conteoActual).length;
    const d = dep(sesion.depId);
    setModal({ tipo: 'cerrar', contados, faltan: itemsDe(d, overrides, extra).length - contados });
  }
  function finalizar() {
    const contados = Object.keys(conteoActual).length;
    setSesion(null); setConteoActual({}); setCatSel(null); setSubSel(null); setModal(null); setSetupContador(null);
    setScreen('setup');
    showToast('Conteo cerrado con ' + contados + (contados === 1 ? ' SKU contado.' : ' SKU contados.'));
  }

  async function resetearDep(depId) {
    await conBusy(async () => {
      const keys = await listShared('conteo:' + depId + ':');
      for (const k of keys) await deleteShared(k);
      setConteosPorDep((prev) => ({ ...prev, [depId]: {} }));
      setModal(null);
      if (sesion && sesion.depId === depId) { setSesion(null); setConteoActual({}); setSetupContador(null); setScreen('setup'); }
      showToast('Avance de ' + dep(depId).nombre + ' reseteado a 0%. El informe conserva las cargas.');
    });
  }

  async function cargarInforme() {
    setInformeLoading(true);
    const keys = await listShared('log:');
    let all = [];
    for (const k of keys) {
      const dia = await getShared(k, []);
      all = all.concat(dia);
    }
    all.sort((a, b) => (a.fecha + a.hora).localeCompare(b.fecha + b.hora));
    setInformeEntries(all);
    setInformeLoading(false);
  }

  function exportarCSV() {
    if (!informeEntries || !informeEntries.length) { showToast('Todavía no hay conteos para exportar.'); return; }
    const csv = buildCSV(informeEntries);
    try {
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = 'seguimiento-conteos-' + hoyISO() + '.csv';
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
      showToast('Archivo descargado: ' + informeEntries.length + ' líneas.');
    } catch (e) {
      showToast('No se pudo descargar. Usá "Copiar" y pegalo en Excel.');
    }
  }
  async function copiarCSV() {
    if (!informeEntries || !informeEntries.length) { showToast('Todavía no hay conteos para copiar.'); return; }
    const csv = buildCSV(informeEntries);
    try {
      await navigator.clipboard.writeText(csv);
      setCopiado(true);
      showToast('Copiado. Pegalo en una hoja de Excel en blanco.');
      setTimeout(() => setCopiado(false), 2000);
    } catch (e) { showToast('No se pudo copiar. Probá descargar el archivo.'); }
  }

  /* ---- admin: contadores ---- */
  async function agregarContador() {
    const nombre = nuevoContador.trim();
    if (!nombre) return;
    if (config.contadores.some((c) => c.toLowerCase() === nombre.toLowerCase())) { showToast('Ya existe ese nombre.'); return; }
    await conBusy(async () => {
      const cfg = { ...config, contadores: [...config.contadores, nombre] };
      await setShared(CONFIG_KEY, cfg);
      setConfig(cfg); setNuevoContador('');
      showToast(nombre + ' agregado.');
    });
  }
  async function quitarContador(nombre) {
    await conBusy(async () => {
      const cfg = { ...config, contadores: config.contadores.filter((c) => c !== nombre) };
      await setShared(CONFIG_KEY, cfg);
      setConfig(cfg); setModal(null);
      showToast(nombre + ' se quitó de la lista. El historial de sus conteos queda intacto.');
    });
  }

  /* ---- admin: depósitos ---- */
  async function agregarDep() {
    const nombre = nuevoDepNombre.trim();
    if (!nombre) return;
    const id = 'dep-' + Date.now().toString(36);
    await conBusy(async () => {
      const cfg = { ...config, deps: [...config.deps, { id, nombre, catalogo: nuevoDepCatalogo }] };
      await setShared(CONFIG_KEY, cfg);
      setConfig(cfg); setNuevoDepNombre('');
      showToast('Depósito "' + nombre + '" agregado.');
    });
  }
  async function renombrarDep(depId, nombre) {
    if (!nombre.trim()) return;
    await conBusy(async () => {
      const cfg = { ...config, deps: config.deps.map((d) => d.id === depId ? { ...d, nombre: nombre.trim() } : d) };
      await setShared(CONFIG_KEY, cfg);
      setConfig(cfg);
      showToast('Nombre actualizado.');
    });
  }

  /* ---- admin: catálogo de productos (alta, baja, edición, recategorización) ---- */
  function todosLosProductosVivos() {
    const eliminados = new Set(extra.eliminados);
    const map = new Map();
    [...CATALOGO_BASE.ITEMS, ...CATALOGO_BASE.ITEMS_PROD, ...extra.agregados].forEach((i) => {
      if (!eliminados.has(i.sku) && !map.has(i.sku)) map.set(i.sku, i);
    });
    return [...map.values()];
  }
  function buscarSkus(q) {
    if (!q || q.trim().length < 2) return [];
    const t = q.trim().toLowerCase();
    const arr = todosLosProductosVivos().filter((i) => i.sku.toLowerCase().includes(t) || i.nombre.toLowerCase().includes(t));
    return arr.slice(0, 40);
  }
  function productosEliminados() {
    const set = new Set(extra.eliminados);
    const map = new Map();
    [...CATALOGO_BASE.ITEMS, ...CATALOGO_BASE.ITEMS_PROD, ...extra.agregados].forEach((i) => { if (set.has(i.sku) && !map.has(i.sku)) map.set(i.sku, i); });
    return [...map.values()];
  }
  function abrirEditor(sku) {
    const disponibleEn = catalogosDeSku(sku, extra);
    const tipoInicial = disponibleEn[0] || 'principal';
    const depFicticio = { catalogo: tipoInicial };
    const it = itemBySku(depFicticio, sku, overrides, extra);
    setEditPres({
      sku, nombre: it ? it.nombre : sku, unidad: it ? it.unidad : 'Unidad', cap: it && it.cap ? it.cap : '',
      disponibleEn, catalogoTipo: tipoInicial, catId: it ? it.cat : '', subId: (it && it.sub) || '',
    });
  }
  function cambiarTabCatalogoEditor(tipo) {
    const depFicticio = { catalogo: tipo };
    const it = itemBySku(depFicticio, editPres.sku, overrides, extra);
    setEditPres({ ...editPres, catalogoTipo: tipo, catId: it ? it.cat : '', subId: (it && it.sub) || '' });
  }
  async function guardarProducto() {
    if (!editPres) return;
    const { sku, nombre, unidad, cap, catalogoTipo, catId, subId } = editPres;
    await conBusy(async () => {
      const ov = { ...overrides, presentacion: { ...overrides.presentacion, [sku]: { unidad, cap: cap === '' ? undefined : Number(cap), nombre } } };
      if (catId) {
        ov.clasificacion = { ...ov.clasificacion, [catalogoTipo]: { ...ov.clasificacion[catalogoTipo], [sku]: { cat: catId, sub: subId || undefined } } };
      }
      await setShared(OVERRIDES_KEY, ov);
      setOverrides(ov); setEditPres(null);
      showToast(sku + ' actualizado.');
    });
  }
  function pedirEliminarProducto(sku) { setModal({ tipo: 'eliminar-producto', sku }); }
  async function eliminarProducto(sku) {
    await conBusy(async () => {
      const ex = { ...extra, eliminados: extra.eliminados.includes(sku) ? extra.eliminados : [...extra.eliminados, sku] };
      await setShared(EXTRA_KEY, ex);
      setExtra(ex); setModal(null); setEditPres(null);
      showToast(sku + ' dado de baja. Podés restaurarlo desde "Productos eliminados".');
    });
  }
  async function restaurarProducto(sku) {
    await conBusy(async () => {
      const ex = { ...extra, eliminados: extra.eliminados.filter((s) => s !== sku) };
      await setShared(EXTRA_KEY, ex);
      setExtra(ex);
      showToast(sku + ' restaurado.');
    });
  }
  function abrirAltaProducto() {
    setProductoNuevo({ sku: '', nombre: '', catalogoTipo: 'principal', catId: '', catNueva: '', subId: '', subNueva: '', unidad: 'Unidad', cap: '' });
  }
  async function guardarProductoNuevo() {
    const p = productoNuevo;
    if (!p.sku.trim() || !p.nombre.trim()) { showToast('Falta el SKU o el nombre.'); return; }
    if (existeSku(p.sku, extra)) { showToast('Ya existe un producto con ese SKU.'); return; }
    if (!p.catId && !p.catNueva.trim()) { showToast('Elegí una categoría o escribí una nueva.'); return; }
    await conBusy(async () => {
      let ex = { ...extra, categoriasExtra: { ...extra.categoriasExtra }, subsExtra: { ...extra.subsExtra }, agregados: [...extra.agregados] };
      let catIdFinal = p.catId;
      if (p.catNueva.trim()) {
        catIdFinal = slugify(p.catNueva);
        const lista = ex.categoriasExtra[p.catalogoTipo] || [];
        if (!lista.some((c) => c.id === catIdFinal)) ex.categoriasExtra[p.catalogoTipo] = [...lista, { id: catIdFinal, nombre: p.catNueva.trim(), subs: [] }];
      }
      let subIdFinal = p.subId || undefined;
      if (p.subNueva.trim()) {
        subIdFinal = slugify(p.subNueva);
        const key = p.catalogoTipo + '|' + catIdFinal;
        const lista = ex.subsExtra[key] || [];
        if (!lista.some((s) => s.id === subIdFinal)) ex.subsExtra[key] = [...lista, { id: subIdFinal, nombre: p.subNueva.trim() }];
      }
      ex.agregados = [...ex.agregados, { sku: p.sku.trim(), nombre: p.nombre.trim(), catalogo: p.catalogoTipo, cat: catIdFinal, sub: subIdFinal, unidad: p.unidad, cap: p.cap === '' ? undefined : Number(p.cap) }];
      await setShared(EXTRA_KEY, ex);
      setExtra(ex); setProductoNuevo(null);
      showToast(p.sku.trim() + ' agregado al catálogo.');
    });
  }

  /* ---- acceso de administrador ---- */
  function pedirPin() {
    const a = adminDeApp(); // dentro de Poliplast App: administrador sin PIN (la sesión hace de PIN)
    if (a) { ADMIN_PIN_SESION = a.pin; setAdminUnlocked(true); setModal(null); setScreen('admin'); return; }
    setPinInput(''); setModal({ tipo: 'pin' });
  }
  async function verificarPin() {
    const intento = pinInput;
    setPinInput('');
    try {
      const { data, error } = await supabase.rpc('verificar_pin', { p_pin: intento });
      if (!error && data === true) {
        ADMIN_PIN_SESION = intento;
        setAdminUnlocked(true); setModal(null);
        setScreen('admin');
        return;
      }
      showToast(error ? 'No se pudo verificar el PIN. Probá de nuevo.' : 'PIN incorrecto.');
    } catch (e) { showToast('No se pudo verificar el PIN. Probá de nuevo.'); }
  }
  async function cambiarPin() {
    const nuevo = nuevoPin.trim();
    if (nuevo.length < 4) { showToast('El PIN tiene que tener al menos 4 dígitos.'); return; }
    await conBusy(async () => {
      const { data, error } = await supabase.rpc('cambiar_pin', { p_actual: ADMIN_PIN_SESION || '', p_nuevo: nuevo });
      if (error || data !== true) throw new Error('No se pudo cambiar el PIN');
      ADMIN_PIN_SESION = nuevo; setNuevoPin('');
      showToast('PIN actualizado.');
    });
  }

  /* ============================= render helpers ============================= */
  function progresoCat(catId, subId) {
    const d = dep(sesion.depId);
    const arr = skusDe(d, catId, subId, overrides, extra);
    const c = cntSesion();
    const hechos = arr.filter((i) => c[i.sku] !== undefined).length;
    return { sub: hechos + ' de ' + arr.length + (arr.length === 1 ? ' contado' : ' contados'), pct: arr.length ? Math.round((hechos / arr.length) * 100) : 0, completo: hechos === arr.length && arr.length > 0 };
  }

  if (appState === 'loading') {
    return (<div className="pantalla-centro">
      <Splash texto="Cargando catálogo" />
    </div>);
  }
  if (appState === 'error') {
    return (<div className="pantalla-centro">
      <div className="cargando-txt">No se pudo cargar el conteo. Revisá la conexión y probá de nuevo.</div>
      <button type="button" className="primary" style={{ marginTop: 16 }} onClick={() => { setAppState('loading'); setIntento((n) => n + 1); }}>Reintentar</button>
    </div>);
  }

  const enConteo = ['setup', 'cats', 'subs', 'skus'].includes(screen);
  const enAdmin = ['admin', 'admin-contadores', 'admin-presentaciones', 'admin-depositos', 'admin-agenda', 'informe'].includes(screen);
  // Agenda de conteo (27/11, Diego): «hoy te toca contar…»
  const nombreCat = (id) => (CATALOGO_BASE.CATS.find((c) => c.id === id) || {}).nombre || id;
  const hoyAg = agendaHoy(config, (sesion && sesion.contador) || setupContador || getPersona());
  const bannerAgenda = hoyAg && (
    <div className={'agenda' + (hoyAg.meToca ? ' metoca' : '')}>
      📅 <b>{hoyAg.dia}:</b> {hoyAg.meToca ? <><b>hoy te toca contar</b>{hoyAg.familias.length ? <>: {hoyAg.familias.map(nombreCat).join(', ')}.</> : '. Diego todavía no eligió las familias.'}</> : <>hoy cuenta{hoyAg.personas.length > 1 ? 'n' : ''} {hoyAg.personas.join(' y ') || '—'}{hoyAg.familias.length ? <> · {hoyAg.familias.map(nombreCat).join(', ')}</> : ''}.</>}
    </div>
  );
  async function alternarAgenda(dia, campo, valor) {
    await conBusy(async () => {
      const cfg = { ...config, agenda: alternar(config.agenda, Number(dia), campo, valor) };
      await setShared(CONFIG_KEY, cfg);
      setConfig(cfg);
    });
  }

  return (
    <NavConteo.Provider value={{ enConteo, enAdmin, setScreen, sesion, adminUnlocked }}>
    <div className="app">
      

      {screen === 'setup' && (<>
        <Header kicker="Conteo físico" titulo="Nuevo conteo" />
        <div className="scr">
          {bannerAgenda}
          <div className="lead">Tocá tu nombre y el depósito que vas a contar. Todo lo que cargues queda firmado con esos datos, y lo ve cualquiera que abra este mismo link.</div>
          <div className="block">
            <div className="label">¿Quién cuenta?</div>
            <div className="wrap">
              {config.contadores.map((c) => (
                <div key={c} className={'chip' + (setupContador === c ? ' chipon' : '')} onClick={() => { setSetupContador(c); setPersona(c); }}>{c}</div>
              ))}
            </div>
          </div>
          <div className="block">
            <div className="label">¿Qué depósito?</div>
            <div className="row3">
              {config.deps.map((d) => (
                <div key={d.id} className={'depcard' + (setupDepId === d.id ? ' depon' : '')} onClick={() => { setSetupDepId(d.id); setDeposito(d.nombre); }}>
                  <div className="depnombre">{d.nombre}</div>
                  <div className="depsub">{progresoLoading[d.id] ? '…' : pctDep(d.id) + '% contado'}</div>
                </div>
              ))}
            </div>
          </div>
          <div className={'btn ' + (setupContador && setupDepId ? 'btnmarca' : 'btnoff')} onClick={comenzar}>
            {setupContador && setupDepId ? 'Comenzar conteo' : 'Elegí tu nombre y el depósito'}
          </div>
          {adminDeApp() && !adminUnlocked && <div className="linksutil" onClick={pedirPin}>Administración</div>}
        </div>
        <Tabs enConteo={enConteo} enAdmin={enAdmin} setScreen={setScreen} sesion={sesion} adminUnlocked={adminUnlocked} onPedirPin={pedirPin} />
        {modal && modal.tipo === 'pin' && <PinGate pinInput={pinInput} setPinInput={setPinInput} onEntrar={verificarPin} onCerrar={() => setModal(null)} />}
      </>)}

      {screen === 'cats' && sesion && (<>
        <Header kicker={'Contando en ' + dep(sesion.depId).nombre} titulo="Elegí categoría" sesion={sesion} conteoActual={conteoActual} totalDep={itemsDe(dep(sesion.depId), overrides, extra).length} />
        <div className="scr">
          {bannerAgenda}
          {catsDe(dep(sesion.depId), extra).map((c) => {
            const p = progresoCat(c.id, null);
            const deHoy = !!hoyAg && hoyAg.familias.includes(c.id);
            return (
              <div key={c.id} className="itemcard" onClick={() => abrirCat(c.id)}>
                <div className="itemmain">
                  <div className="itemnombre">{c.nombre}{deHoy && <span className="hoytag">Hoy</span>}</div>
                  <div className="itemsub">{p.sub}</div>
                  <div className="barra"><div className="barrafill" style={{ width: p.pct + '%', background: p.completo ? 'var(--verde)' : 'var(--rojo)' }} /></div>
                </div>
                <div className="itemestado" style={{ color: p.completo ? 'var(--verde)' : 'rgba(0,0,0,.45)' }}>{p.completo ? 'listo' : (p.pct === 0 ? '' : p.pct + '%')}</div>
              </div>
            );
          })}
          <div className="btn btndark" onClick={cerrarConteo}>Cerrar conteo</div>
        </div>
        <Tabs enConteo={enConteo} enAdmin={enAdmin} setScreen={setScreen} sesion={sesion} adminUnlocked={adminUnlocked} />
        {modal && <Modal modal={modal} onClose={() => setModal(null)} onSalirSi={() => setScreen(modal.destino)} onResetSi={() => resetearDep(modal.dep)} onCerrarSi={finalizar} onReemplazar={() => { const sku = modal.sku; setModal(null); setSheet({ sku, modo: 'reemplazar' }); setSheetCant(''); }} onSumar={() => { const sku = modal.sku; setModal(null); setSheet({ sku, modo: 'sumar' }); setSheetCant(''); }} itemBySku={(sku) => itemBySku(dep(sesion.depId), sku, overrides, extra)} conteoActual={conteoActual} depNombre={(id) => dep(id).nombre} busy={busy} />}
      </>)}

      {screen === 'subs' && sesion && (() => {
        const d = dep(sesion.depId); const cat = catById(d, catSel, extra);
        return (<>
          <Header kicker={'Contando en ' + d.nombre} titulo={cat.nombre} mostrarVolver onVolver={volver} sesion={sesion} conteoActual={conteoActual} totalDep={itemsDe(d, overrides, extra).length} />
          <div className="scr">
            {cat.subs.map((sb) => {
              const p = progresoCat(cat.id, sb.id);
              return (
                <div key={sb.id} className="itemcard" onClick={() => abrirSub(sb.id)}>
                  <div className="itemmain">
                    <div className="itemnombre">{sb.nombre}</div>
                    <div className="itemsub">{p.sub}</div>
                    <div className="barra"><div className="barrafill" style={{ width: p.pct + '%', background: p.completo ? 'var(--verde)' : 'var(--rojo)' }} /></div>
                  </div>
                  <div className="itemestado" style={{ color: p.completo ? 'var(--verde)' : 'rgba(0,0,0,.45)' }}>{p.completo ? 'listo' : (p.pct === 0 ? '' : p.pct + '%')}</div>
                </div>
              );
            })}
          </div>
          <Tabs enConteo={enConteo} enAdmin={enAdmin} setScreen={setScreen} sesion={sesion} adminUnlocked={adminUnlocked} />
          {modal && <Modal modal={modal} onClose={() => setModal(null)} onSalirSi={() => { setScreen(modal.destino); setModal(null); }} busy={busy} />}
        </>);
      })()}

      {screen === 'skus' && sesion && (() => {
        const d = dep(sesion.depId); const cat = catById(d, catSel, extra);
        const subNom = subNombreDe(d, catSel, subSel, extra);
        const arr = skusDe(d, catSel, subSel, overrides, extra);
        const c = cntSesion();
        const pendientes = arr.filter((i) => c[i.sku] === undefined);
        const contados = arr.filter((i) => c[i.sku] !== undefined);
        return (<>
          <Header kicker={'Contando en ' + d.nombre} titulo={subNom || cat.nombre} mostrarVolver onVolver={volver} sesion={sesion} conteoActual={conteoActual} totalDep={itemsDe(d, overrides, extra).length} />
          <div className="scr">
            <div className="block">
              <div className="labelrow"><div className="label">Falta contar</div><div className="count">{pendientes.length} de {arr.length}</div></div>
              <div className="stack">
                {pendientes.length === 0 && <div className="vacio"><div className="vaciotit">Todo contado acá</div><div className="vaciosub">No quedan SKU pendientes en esta selección.</div></div>}
                {pendientes.map((p) => (
                  <div key={p.sku} className="skucard" onClick={() => tocarSku(p.sku)}>
                    <div className="itemmain">
                      <div className="skucode">{p.sku}</div>
                      <div className="itemnombre">{p.nombre}</div>
                      <div className="tagpres">{presentacionTxt(p)}</div>
                    </div>
                    <div className="btncontar">Contar</div>
                  </div>
                ))}
              </div>
            </div>
            <div className="block">
              <div className="labelrow"><div className="label" style={{ color: 'var(--verde)' }}>Contados</div><div className="count">{contados.length}</div></div>
              <div className="stack">
                {contados.length === 0 && <div className="vaciodashed">Lo que vayas contando aparece acá abajo.</div>}
                {contados.map((it) => (
                  <div key={it.sku} className="skucard skucardok" onClick={() => tocarSku(it.sku)}>
                    <div className="itemmain">
                      <div className="skucode">{it.sku}</div>
                      <div className="itemnombre">{it.nombre}</div>
                      <div className="itemsub">{sesion.contador} · {sesion.hora}</div>
                    </div>
                    <div className="skucant"><div className="skucantnum" style={{ color: 'var(--verde)' }}>{n(c[it.sku])}</div><div className="skucantunidad">{it.unidad}</div></div>
                  </div>
                ))}
              </div>
            </div>
          </div>
          <Tabs enConteo={enConteo} enAdmin={enAdmin} setScreen={setScreen} sesion={sesion} adminUnlocked={adminUnlocked} />
          {sheet && <Sheet sheet={sheet} sheetCant={sheetCant} item={itemBySku(d, sheet.sku, overrides, extra)} prev={conteoActual[sheet.sku]} onTecla={teclaSheet} onGuardar={guardarConteo} onCerrar={() => { setSheet(null); setSheetCant(''); }} busy={busy} />}
          {modal && <Modal modal={modal} onClose={() => setModal(null)} onSalirSi={() => { setScreen(modal.destino); setModal(null); }} onReemplazar={() => { const sku = modal.sku; setModal(null); setSheet({ sku, modo: 'reemplazar' }); setSheetCant(''); }} onSumar={() => { const sku = modal.sku; setModal(null); setSheet({ sku, modo: 'sumar' }); setSheetCant(''); }} itemBySku={(sku) => itemBySku(d, sku, overrides, extra)} conteoActual={conteoActual} busy={busy} />}
        </>);
      })()}

      {screen === 'admin' && (<>
        <Header kicker="Administrador" titulo="Panel de admin" />
        <div className="scr">
          <div className="block">
            <div className="label">Avance del conteo por depósito</div>
            <div className="stack">
              {config.deps.map((d) => {
                const pct = pctDep(d.id);
                const hechos = skusDepContados(d.id).length;
                const quienes = contadoresActivosDep(d.id).map((x) => x.contador + ' ' + x.n).join(' · ') || 'sin cargas todavía';
                return (
                  <div key={d.id} className="depadmin">
                    <div className="depadmintop">
                      <div>
                        <div className="depadminnombre">{d.nombre}</div>
                        <div className="depadmindetalle">{progresoLoading[d.id] ? 'actualizando…' : hechos + ' de ' + itemsDe(d, overrides, extra).length + ' SKU contados'}</div>
                        <div className="depadminquienes">{quienes}</div>
                      </div>
                      <div className="depadminpct">{pct}%</div>
                    </div>
                    <div className="barra"><div className="barrafill" style={{ width: pct + '%', background: pct === 100 ? 'var(--verde)' : 'var(--rojo)' }} /></div>
                    {hechos ? <div className="btnreset" onClick={() => setModal({ tipo: 'reset', dep: d.id, hechos })}>Resetear a cero</div> : <div className="btnresetoff">Resetear a cero</div>}
                  </div>
                );
              })}
            </div>
          </div>
          <div className="block">
            <div className="label">Configuración</div>
            <div className="navcard" onClick={() => setScreen('admin-agenda')}><div><div className="navtit">Agenda de conteo</div><div className="navsub">Qué día cuenta quién y qué familias</div></div><div className="chevdark">›</div></div>
            <div className="navcard" onClick={() => setScreen('admin-contadores')}><div><div className="navtit">Contadores</div><div className="navsub">{config.contadores.length} personas cargando conteos</div></div><div className="chevdark">›</div></div>
            <div className="navcard" onClick={() => setScreen('admin-presentaciones')}><div><div className="navtit">Productos</div><div className="navsub">Agregar, dar de baja, recategorizar y editar pesos</div></div><div className="chevdark">›</div></div>
            <div className="navcard" onClick={() => setScreen('admin-depositos')}><div><div className="navtit">Depósitos</div><div className="navsub">{config.deps.length} depósitos configurados</div></div><div className="chevdark">›</div></div>
          </div>
          <div className="block">
            <div className="label">PIN de administrador</div>
            <div className="lead" style={{ fontSize: 12.5 }}>Es lo único que separa a un contador de este panel. Por seguridad no se muestra en pantalla. Cambialo si sospechás que alguien más lo tiene.</div>
            <div className="agregarbox">
              <input className="input" type="text" inputMode="numeric" placeholder="Nuevo PIN (mínimo 4 dígitos)" value={nuevoPin} onChange={(e) => setNuevoPin(e.target.value)} />
              <div className={'btn ' + (nuevoPin.trim().length >= 4 ? 'btndark' : 'btnoff')} style={{ height: 48 }} onClick={cambiarPin}>Guardar</div>
            </div>
          </div>
          <div className="informecard" onClick={() => { setScreen('informe'); cargarInforme(); }}>
            <div><div className="informetit">Informe de conteos</div><div className="informesub">Ver todo lo cargado y exportar a Excel</div></div>
            <div className="chev">›</div>
          </div>
        </div>
        <Tabs enConteo={enConteo} enAdmin={enAdmin} setScreen={setScreen} sesion={sesion} adminUnlocked={adminUnlocked} />
        {modal && <Modal modal={modal} onClose={() => setModal(null)} onResetSi={() => resetearDep(modal.dep)} depNombre={(id) => dep(id).nombre} busy={busy} />}
      </>)}

      {screen === 'admin-contadores' && (<>
        <Header kicker="Administrador" titulo="Contadores" mostrarVolver onVolver={volver} />
        <div className="scr">
          <div className="lead">Los contadores que ves acá son los que aparecen para elegir al empezar un conteo. Sacar a alguien no borra lo que ya contó.</div>
          <div className="stack">
            {config.contadores.map((c) => (
              <div key={c} className="rowedit">
                <div className="rowedittxt">{c}</div>
                <div className="rowbtnquitar" onClick={() => setModal({ tipo: 'quitar-contador', nombre: c })}>Quitar</div>
              </div>
            ))}
          </div>
          <div className="agregarbox">
            <input className="input" placeholder="Nombre del nuevo contador" value={nuevoContador} onChange={(e) => setNuevoContador(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') agregarContador(); }} />
            <div className={'btn ' + (nuevoContador.trim() ? 'btndark' : 'btnoff')} style={{ height: 48 }} onClick={agregarContador}>Agregar</div>
          </div>
        </div>
        <Tabs enConteo={enConteo} enAdmin={enAdmin} setScreen={setScreen} sesion={sesion} adminUnlocked={adminUnlocked} />
        {modal && modal.tipo === 'quitar-contador' && (
          <Modal modal={{ tipo: 'confirmar', titulo: '¿Quitar a ' + modal.nombre + '?', texto: 'Ya no va a aparecer en la lista para elegir. Su historial de conteos no se borra.', boton: 'Quitar', color: 'naranja' }} onClose={() => setModal(null)} onConfirmar={() => quitarContador(modal.nombre)} busy={busy} />
        )}
      </>)}

      {screen === 'admin-agenda' && (<>
        <Header kicker="Administrador" titulo="Agenda de conteo" mostrarVolver onVolver={volver} />
        <div className="scr">
          <div className="lead">Elegí qué día cuenta cada uno y qué familias completas. Ese día, al entrar a Conteo, le aparece «Hoy te toca contar…» y las familias marcadas con «Hoy». Se guarda al tocar.</div>
          {Object.entries(agendaDe(config)).map(([d, x]) => (
            <div key={d} className="block">
              <div className="label">{DIAS[d]}</div>
              <div className="dz-muted" style={{ fontSize: 12, margin: '2px 0 6px' }}>Quién cuenta</div>
              <div className="wrap">
                {config.contadores.map((c) => (
                  <div key={c} className={'chip' + (x.personas.includes(c) ? ' chipon' : '')} onClick={() => alternarAgenda(d, 'personas', c)}>{c}</div>
                ))}
              </div>
              {x.personas.length > 0 && (
                <>
                <div className="dz-muted" style={{ fontSize: 12, margin: '10px 0 6px' }}>Qué familias (completas)</div>
                <div className="wrap">
                  {CATALOGO_BASE.CATS.map((c) => (
                    <div key={c.id} className={'chip' + (x.familias.includes(c.id) ? ' chipon' : '')} style={{ fontSize: 12.5 }} onClick={() => alternarAgenda(d, 'familias', c.id)}>{c.nombre}</div>
                  ))}
                </div>
                </>
              )}
            </div>
          ))}
        </div>
        <Tabs enConteo={enConteo} enAdmin={enAdmin} setScreen={setScreen} sesion={sesion} adminUnlocked={adminUnlocked} />
      </>)}

      {screen === 'admin-depositos' && (<>
        <Header kicker="Administrador" titulo="Depósitos" mostrarVolver onVolver={volver} />
        <div className="scr">
          <div className="lead">Podés renombrar un depósito o agregar uno nuevo. El catálogo de productos que usa cada uno depende de si es un depósito "normal" o de producción.</div>
          <div className="stack">
            {config.deps.map((d) => <DepRow key={d.id} d={d} onRenombrar={renombrarDep} busy={busy} />)}
          </div>
          <div className="block">
            <div className="label">Agregar depósito</div>
            <input className="input" placeholder="Nombre del depósito" value={nuevoDepNombre} onChange={(e) => setNuevoDepNombre(e.target.value)} />
            <div className="wrap">
              <div className={'chip' + (nuevoDepCatalogo === 'principal' ? ' chipon' : '')} onClick={() => setNuevoDepCatalogo('principal')}>Catálogo general</div>
              <div className={'chip' + (nuevoDepCatalogo === 'produccion' ? ' chipon' : '')} onClick={() => setNuevoDepCatalogo('produccion')}>Catálogo producción</div>
            </div>
            <div className={'btn ' + (nuevoDepNombre.trim() ? 'btndark' : 'btnoff')} onClick={agregarDep}>Agregar depósito</div>
          </div>
        </div>
        <Tabs enConteo={enConteo} enAdmin={enAdmin} setScreen={setScreen} sesion={sesion} adminUnlocked={adminUnlocked} />
      </>)}

      {screen === 'admin-presentaciones' && (<>
        <Header kicker="Administrador" titulo="Productos" mostrarVolver onVolver={volver} />
        <div className="scr">
          <div className="lead">Buscá un producto para cambiar su peso/presentación, recategorizarlo o darlo de baja. También podés sumar productos nuevos al catálogo.</div>
          <div className="btn btnmarca" onClick={abrirAltaProducto}>+ Agregar producto nuevo</div>
          <input className="input" placeholder="Buscar por SKU o nombre…" value={filtroPres} onChange={(e) => setFiltroPres(e.target.value)} />
          <div className="stack">
            {filtroPres.trim().length < 2 && <div className="vaciodashed">Escribí al menos 2 letras para buscar entre los {todosLosProductosVivos().length} productos activos.</div>}
            {buscarSkus(filtroPres).map((it0) => {
              const ov = overrides.presentacion[it0.sku];
              const it = ov ? { ...it0, ...ov } : it0;
              const esNuevo = extra.agregados.some((a) => a.sku === it0.sku);
              return (
                <div key={it0.sku} className="skucard" onClick={() => abrirEditor(it0.sku)}>
                  <div className="itemmain">
                    <div className="skucode">{it0.sku}{ov && <span className="badgemod">editado</span>}{esNuevo && <span className="badgemod">nuevo</span>}</div>
                    <div className="itemnombre">{it.nombre}</div>
                    <div className="tagpres">{presentacionTxt(it)}</div>
                  </div>
                  <div className="btncontar">Editar</div>
                </div>
              );
            })}
          </div>
          <div className="navcard" onClick={() => setMostrarEliminados(!mostrarEliminados)}>
            <div><div className="navtit">Productos eliminados</div><div className="navsub">{productosEliminados().length} dado(s) de baja — podés restaurarlos</div></div>
            <div className="chevdark">{mostrarEliminados ? '︿' : '›'}</div>
          </div>
          {mostrarEliminados && (
            <div className="stack">
              {productosEliminados().length === 0 && <div className="vaciodashed">No hay productos eliminados.</div>}
              {productosEliminados().map((it) => (
                <div key={it.sku} className="rowedit">
                  <div className="rowedittxt">{it.sku} — {it.nombre}</div>
                  <div className="rowbtnquitar" onClick={() => restaurarProducto(it.sku)}>Restaurar</div>
                </div>
              ))}
            </div>
          )}
        </div>
        <Tabs enConteo={enConteo} enAdmin={enAdmin} setScreen={setScreen} sesion={sesion} adminUnlocked={adminUnlocked} />
        {editPres && (() => {
          const catalogoActivo = { catalogo: editPres.catalogoTipo };
          const catsDisponibles = catsDe(catalogoActivo, extra);
          const catActual = catsDisponibles.find((c) => c.id === editPres.catId);
          const subsDisponibles = catActual ? catActual.subs : [];
          return (
            <div className="overlay">
              <div className="sheet">
                <div className="sheettop">
                  <div><div className="skucode">{editPres.sku}</div><div className="sheetnombre">{editPres.nombre}</div></div>
                  <div className="btnvolver" onClick={() => setEditPres(null)}>Cancelar</div>
                </div>
                <div className="block">
                  <div className="label">Nombre del producto</div>
                  <input className="input" value={editPres.nombre} onChange={(e) => setEditPres({ ...editPres, nombre: e.target.value })} />
                </div>
                <div className="block">
                  <div className="label">Se cuenta por</div>
                  <div className="wrap">
                    {UNIDADES.map((u) => (<div key={u} className={'chip' + (editPres.unidad === u ? ' chipon' : '')} onClick={() => setEditPres({ ...editPres, unidad: u })}>{u}</div>))}
                  </div>
                </div>
                <div className="block">
                  <div className="label">{editPres.unidad === 'Unidad' ? 'Cuántas piezas trae el bulto (opcional)' : editPres.unidad === 'Tira' || editPres.unidad === 'Rollo' ? 'Metros por bulto cerrado' : 'Kilos por bulto cerrado'}</div>
                  <input className="input" type="number" inputMode="decimal" placeholder="Ej: 220" value={editPres.cap} onChange={(e) => setEditPres({ ...editPres, cap: e.target.value })} />
                </div>
                {editPres.disponibleEn.length > 1 && (
                  <div className="block">
                    <div className="label">Clasificación en el catálogo</div>
                    <div className="wrap">
                      {editPres.disponibleEn.map((tipo) => (<div key={tipo} className={'chip' + (editPres.catalogoTipo === tipo ? ' chipon' : '')} onClick={() => cambiarTabCatalogoEditor(tipo)}>{tipo === 'produccion' ? 'Producción' : 'General'}</div>))}
                    </div>
                  </div>
                )}
                <div className="block">
                  <div className="label">Categoría ({editPres.catalogoTipo === 'produccion' ? 'catálogo Producción' : 'catálogo General'})</div>
                  <select className="input" value={editPres.catId} onChange={(e) => setEditPres({ ...editPres, catId: e.target.value, subId: '' })}>
                    <option value="">Elegir categoría…</option>
                    {catsDisponibles.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                  </select>
                </div>
                {subsDisponibles.length > 0 && (
                  <div className="block">
                    <div className="label">Subcategoría</div>
                    <select className="input" value={editPres.subId} onChange={(e) => setEditPres({ ...editPres, subId: e.target.value })}>
                      <option value="">Sin subcategoría</option>
                      {subsDisponibles.map((s) => <option key={s.id} value={s.id}>{s.nombre}</option>)}
                    </select>
                  </div>
                )}
                <div className="btn btnverde" onClick={guardarProducto}>Guardar cambios</div>
                <div className="btn btnnaranja" onClick={() => pedirEliminarProducto(editPres.sku)}>Dar de baja este producto</div>
              </div>
            </div>
          );
        })()}
        {productoNuevo && (() => {
          const catalogoActivo = { catalogo: productoNuevo.catalogoTipo };
          const catsDisponibles = catsDe(catalogoActivo, extra);
          const catActual = catsDisponibles.find((c) => c.id === productoNuevo.catId);
          const subsDisponibles = catActual ? catActual.subs : [];
          return (
            <div className="overlay">
              <div className="sheet">
                <div className="sheettop">
                  <div><div className="sheetnombre">Producto nuevo</div></div>
                  <div className="btnvolver" onClick={() => setProductoNuevo(null)}>Cancelar</div>
                </div>
                <div className="block">
                  <div className="label">¿En qué catálogo va?</div>
                  <div className="wrap">
                    <div className={'chip' + (productoNuevo.catalogoTipo === 'principal' ? ' chipon' : '')} onClick={() => setProductoNuevo({ ...productoNuevo, catalogoTipo: 'principal', catId: '', subId: '' })}>General</div>
                    <div className={'chip' + (productoNuevo.catalogoTipo === 'produccion' ? ' chipon' : '')} onClick={() => setProductoNuevo({ ...productoNuevo, catalogoTipo: 'produccion', catId: '', subId: '' })}>Producción</div>
                  </div>
                </div>
                <div className="block"><div className="label">SKU (código único)</div><input className="input" value={productoNuevo.sku} onChange={(e) => setProductoNuevo({ ...productoNuevo, sku: e.target.value })} /></div>
                <div className="block"><div className="label">Nombre del producto</div><input className="input" value={productoNuevo.nombre} onChange={(e) => setProductoNuevo({ ...productoNuevo, nombre: e.target.value })} /></div>
                <div className="block">
                  <div className="label">Categoría</div>
                  <select className="input" value={productoNuevo.catId} onChange={(e) => setProductoNuevo({ ...productoNuevo, catId: e.target.value, catNueva: '', subId: '' })}>
                    <option value="">Elegir categoría existente…</option>
                    {catsDisponibles.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                  </select>
                  <input className="input" placeholder="…o escribí una categoría nueva" value={productoNuevo.catNueva} onChange={(e) => setProductoNuevo({ ...productoNuevo, catNueva: e.target.value, catId: '' })} />
                </div>
                {(subsDisponibles.length > 0 || productoNuevo.catNueva.trim()) && (
                  <div className="block">
                    <div className="label">Subcategoría (opcional)</div>
                    {subsDisponibles.length > 0 && (
                      <select className="input" value={productoNuevo.subId} onChange={(e) => setProductoNuevo({ ...productoNuevo, subId: e.target.value, subNueva: '' })}>
                        <option value="">Sin subcategoría</option>
                        {subsDisponibles.map((s) => <option key={s.id} value={s.id}>{s.nombre}</option>)}
                      </select>
                    )}
                    <input className="input" placeholder="…o escribí una subcategoría nueva" value={productoNuevo.subNueva} onChange={(e) => setProductoNuevo({ ...productoNuevo, subNueva: e.target.value, subId: '' })} />
                  </div>
                )}
                <div className="block">
                  <div className="label">Se cuenta por</div>
                  <div className="wrap">
                    {UNIDADES.map((u) => (<div key={u} className={'chip' + (productoNuevo.unidad === u ? ' chipon' : '')} onClick={() => setProductoNuevo({ ...productoNuevo, unidad: u })}>{u}</div>))}
                  </div>
                </div>
                <div className="block">
                  <div className="label">Kilos/metros por bulto cerrado (opcional)</div>
                  <input className="input" type="number" inputMode="decimal" value={productoNuevo.cap} onChange={(e) => setProductoNuevo({ ...productoNuevo, cap: e.target.value })} />
                </div>
                <div className="btn btnmarca" onClick={guardarProductoNuevo}>Agregar al catálogo</div>
              </div>
            </div>
          );
        })()}
        {modal && modal.tipo === 'eliminar-producto' && (
          <Modal modal={{ tipo: 'confirmar', titulo: '¿Dar de baja ' + modal.sku + '?', texto: 'Deja de aparecer para contar. Su historial de conteos anteriores no se borra, y podés restaurarlo cuando quieras desde "Productos eliminados".', boton: 'Dar de baja', color: 'naranja' }} onClose={() => setModal(null)} onConfirmar={() => eliminarProducto(modal.sku)} busy={busy} />
        )}
      </>)}

      {screen === 'informe' && (<>
        <Header kicker="Administrador" titulo="Informe de conteos" mostrarVolver onVolver={volver} />
        <div className="scr">
          {informeLoading && <div className="vaciodashed">Reuniendo los conteos de todos los depósitos…</div>}
          {!informeLoading && informeEntries && informeEntries.length === 0 && (
            <div className="vacio"><div className="vaciotit">Todavía no hay conteos</div><div className="vaciosub">Cuando alguien cargue cantidades, cada carga aparece acá con contador, depósito, fecha y hora.</div></div>
          )}
          {!informeLoading && informeEntries && informeEntries.length > 0 && (
            <div className="stack">
              {informeEntries.slice().reverse().slice(0, 200).map((r, idx) => (
                <div key={idx} className="filareg">
                  <div><div className="filameta">{r.sku} · {r.contador} · {r.depNombre} · {r.fecha} {r.hora}</div><div className="itemnombre">{r.nombre}</div></div>
                  <div className="filacant"><div className="filacantnum">{n(r.cant)}</div><div className="filacantunidad">{r.unidad}</div></div>
                </div>
              ))}
              {informeEntries.length > 200 && <div className="notaexport">Mostrando las últimas 200 cargas de {informeEntries.length}. El Excel exportado incluye todas.</div>}
            </div>
          )}
          <div className="block">
            <div className="btn btnexport" onClick={exportarCSV}>Descargar seguimiento para Excel</div>
            <div className="btn btnexport" onClick={copiarCSV}>{copiado ? 'Copiado ✓' : 'Copiar como texto (si no descarga)'}</div>
            <div className="notaexport">Una fila por carga con fecha, hora, contador, depósito, categoría, SKU, nombre, unidad y conteo. Se abre directo en Excel.</div>
          </div>
        </div>
        <Tabs enConteo={enConteo} enAdmin={enAdmin} setScreen={setScreen} sesion={sesion} adminUnlocked={adminUnlocked} />
      </>)}

      {toastMsg && <div className="toastbox">{toastMsg}</div>}
    </div>
    </NavConteo.Provider>
  );
}

/** Conteo dentro de Poliplast App. Props: persona y deposito (quién sos de la app) y admin ({nombre, pin} de la sesión de la app o null). */
export default function Conteo({ persona = '', deposito = '', admin = null }) {
  setIdentidad({ persona, deposito, admin });
  return <section className="panel logi-conteo"><ConteoInterno admin={admin} /></section>;
}

function Header({ kicker, titulo, mostrarVolver, onVolver, sesion, conteoActual, totalDep }) {
  const nav = useContext(NavConteo);
  return (
    <div className="hdr">
      {nav && nav.adminUnlocked && (
        <div className="segmented logi-tabs" role="tablist" aria-label="Conteo">
          <button type="button" role="tab" aria-selected={nav.enConteo} className={nav.enConteo ? 'selected' : ''} onClick={() => nav.setScreen(nav.sesion ? 'cats' : 'setup')}>Contar</button>
          <button type="button" role="tab" aria-selected={nav.enAdmin} className={nav.enAdmin ? 'selected' : ''} onClick={() => nav.setScreen('admin')}>Administración</button>
        </div>
      )}
      <div className="hdrtop">
        <div className="hdrmarca">
          <div className="hdrtxt"><div className="kicker">{kicker}</div><div className="titulo">{titulo}</div></div>
        </div>
        {mostrarVolver && <div className="btnvolver" onClick={onVolver}>Volver</div>}
      </div>
      {sesion && conteoActual && (
        <div className="sesionbar">
          <div className="sesioninfo"><div className="sesiondep">{sesion.contador}</div><div className="sesionmeta">{sesion.fecha} {sesion.hora}</div></div>
          <div className="sesionpct">{Object.keys(conteoActual).length}/{totalDep}</div>
        </div>
      )}
    </div>
  );
}

function Tabs() {
  return null; // en Poliplast App «Contar / Administración» va arriba (Header)
}
function TabsViejas({ enConteo, enAdmin, setScreen, sesion, adminUnlocked }) {
  if (!adminUnlocked) return null;
  return (
    <div className="tabs">
      <div className={'tab' + (enConteo ? ' on' : '')} onClick={() => setScreen(sesion ? 'cats' : 'setup')} style={adminUnlocked ? undefined : { flex: 1 }}>
        <div className="tabico" aria-hidden="true">📒</div><div>Conteo</div>
      </div>
      {adminUnlocked && (
        <div className={'tab' + (enAdmin ? ' on' : '')} onClick={() => setScreen('admin')}>
          <div className="tabico" aria-hidden="true">⚙️</div><div>Admin</div>
        </div>
      )}
    </div>
  );
}

function PinGate({ pinInput, setPinInput, onEntrar, onCerrar }) {
  return (
    <div className="overlay">
      <div className="modalbox">
        <div className="modaltit">Acceso administrador</div>
        <div className="modaltxt">Ingresá el PIN para ver el panel de admin.</div>
        <input
          className="input" type="password" inputMode="numeric" autoFocus placeholder="PIN"
          value={pinInput} onChange={(e) => setPinInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') onEntrar(); }}
        />
        <div className="modalbtns">
          <div className="mbtn mbtndark" onClick={onEntrar}>Entrar</div>
          <div className="mbtn mbtnlight" onClick={onCerrar}>Cancelar</div>
        </div>
      </div>
    </div>
  );
}

function Sheet({ sheet, sheetCant, item, prev, onTecla, onGuardar, onCerrar, busy }) {
  const nota = sheet.modo === 'sumar' ? 'Suma a los ' + n(prev) + ' ya contados'
    : sheet.modo === 'reemplazar' ? 'Reemplaza los ' + n(prev) + ' ya contados'
    : 'Si no hay nada, cargá 0';
  const listo = sheetCant !== '' && !busy;
  const teclas = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'c', '0', 'del'];
  return (
    <div className="overlay">
      <div className="sheet">
        <div className="sheettop">
          <div><div className="skucode">{item.sku}</div><div className="sheetnombre">{item.nombre}</div><div className="tagpres">{presentacionTxt(item)}</div></div>
          <div className="btnvolver" onClick={onCerrar}>Cancelar</div>
        </div>
        <div className="sheetcant">
          <div className="sheetcantrow"><div className="sheetcantnum">{sheetCant === '' ? '0' : n(parseInt(sheetCant, 10))}</div><div className="sheetcantunidad">{item.unidad}</div></div>
          <div className="sheetnota">{nota}</div>
        </div>
        <div className="keypad">
          {teclas.map((k) => (
            <div key={k} className={'tecla' + (k === 'c' || k === 'del' ? ' teclamuted' : '')} onClick={() => onTecla(k)}>{k === 'del' ? '⌫' : k === 'c' ? 'C' : k}</div>
          ))}
        </div>
        <div className={'btn ' + (listo ? 'btnverde' : 'btnoff')} onClick={onGuardar}>
          {busy ? 'Guardando…' : listo ? (sheet.modo === 'sumar' ? 'Sumar al conteo' : 'Guardar conteo') : 'Cargá la cantidad (0 vale)'}
        </div>
      </div>
    </div>
  );
}

function Modal({ modal, onClose, onSalirSi, onResetSi, onCerrarSi, onReemplazar, onSumar, onConfirmar, itemBySku, conteoActual, depNombre, busy }) {
  let titulo = '', texto = '', botones = null;
  if (modal.tipo === 'existente') {
    const it = itemBySku(modal.sku);
    const prev = conteoActual[modal.sku];
    titulo = it.sku + ' ya lo contaste vos';
    texto = 'Tenés ' + n(prev) + ' ' + it.unidad + ' cargados en este conteo. ¿Qué hacemos con el nuevo?';
    botones = (<>
      <div className="mbtn mbtndark" onClick={onReemplazar}>Reemplazar el valor</div>
      <div className="mbtn mbtnlight" onClick={onSumar}>Sumar a lo contado</div>
      <div className="mbtn mbtnghost" onClick={onClose}>Cancelar</div>
    </>);
  } else if (modal.tipo === 'salir') {
    titulo = modal.faltan === 1 ? 'Falta contar 1 SKU' : 'Faltan contar ' + modal.faltan + ' SKU';
    texto = (modal.faltan === 1 ? 'Todavía queda 1 sin contar en ' : 'Todavía quedan ' + modal.faltan + ' sin contar en ') + modal.donde + '. ¿Querés salir igual?';
    botones = (<>
      <div className="mbtn mbtnnaranja" onClick={onSalirSi}>Salir igual</div>
      <div className="mbtn mbtnlight" onClick={onClose}>Seguir contando</div>
    </>);
  } else if (modal.tipo === 'reset') {
    titulo = '¿Resetear el conteo de ' + depNombre(modal.dep) + '?';
    texto = 'El avance vuelve a 0%: ' + (modal.hechos === 1 ? 'el SKU contado queda otra vez pendiente' : 'los ' + modal.hechos + ' SKU contados quedan otra vez pendientes') + ' para todos los contadores. El informe conserva todas las cargas ya hechas.';
    botones = (<>
      <div className="mbtn mbtnnaranja" onClick={onResetSi}>{busy ? 'Reseteando…' : 'Resetear a cero'}</div>
      <div className="mbtn mbtnlight" onClick={onClose}>Cancelar</div>
    </>);
  } else if (modal.tipo === 'cerrar') {
    titulo = '¿Cerrar el conteo?';
    texto = modal.faltan === 0
      ? 'Contaste los ' + modal.contados + ' SKU. Se guarda el informe con tu nombre, fecha y hora.'
      : 'Contaste ' + modal.contados + ' de ' + (modal.contados + modal.faltan) + ' SKU. Quedan ' + modal.faltan + ' sin contar y no van a figurar en el informe.';
    botones = (<>
      <div className="mbtn mbtndark" onClick={onCerrarSi}>Cerrar y guardar</div>
      <div className="mbtn mbtnlight" onClick={onClose}>Seguir contando</div>
    </>);
  } else if (modal.tipo === 'confirmar') {
    titulo = modal.titulo; texto = modal.texto;
    botones = (<>
      <div className={'mbtn ' + (modal.color === 'naranja' ? 'mbtnnaranja' : 'mbtndark')} onClick={onConfirmar}>{busy ? 'Guardando…' : modal.boton}</div>
      <div className="mbtn mbtnlight" onClick={onClose}>Cancelar</div>
    </>);
  }
  return (
    <div className="overlay">
      <div className="modalbox">
        <div className="modaltit">{titulo}</div><div className="modaltxt">{texto}</div>
        <div className="modalbtns">{botones}</div>
      </div>
    </div>
  );
}

function DepRow({ d, onRenombrar, busy }) {
  const [editando, setEditando] = useState(false);
  const [valor, setValor] = useState(d.nombre);
  if (!editando) {
    return (
      <div className="rowedit">
        <div className="rowedittxt">{d.nombre} <span className="badgemod">{d.catalogo === 'produccion' ? 'producción' : 'general'}</span></div>
        <div className="rowbtnquitar" onClick={() => { setValor(d.nombre); setEditando(true); }}>Renombrar</div>
      </div>
    );
  }
  return (
    <div className="agregarbox">
      <input className="input" value={valor} onChange={(e) => setValor(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { onRenombrar(d.id, valor); setEditando(false); } }} autoFocus />
      <div className="btn btndark" style={{ height: 48 }} onClick={() => { onRenombrar(d.id, valor); setEditando(false); }}>{busy ? '…' : 'Guardar'}</div>
    </div>
  );
}


