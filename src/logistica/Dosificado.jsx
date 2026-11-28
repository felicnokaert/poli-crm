import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { conteoDb } from './conteo-db.js';
import { getPersona, getDeposito, setDeposito as setDepositoCompartido, setIdentidad } from './identidad.js';
import './dosificado.css';

// Dosificado NATIVO de Poliplast App (28/11, Felipe: «una sola app, como Contabilium»). Es la misma pantalla de la app de
// conteo (poliplast-app src/Dosificado.jsx), con la misma base y la misma lógica: guardado en vivo, kits, registros y resumen.
// Cambia solo el marco: quién sos, depósito y administrador los da Poliplast App (sin PIN propio ni barra de pestañas abajo).
const supabase = conteoDb();
const setPersona = () => {}; // el operario de cada planilla se elige en la pantalla; no cambia el usuario de la app
function Splash({ texto }) { return <p className="dz-muted dz-cargando" role="status">{texto}…</p>; }

const DEPOSITOS_FALLBACK = ['Villa Domínico', 'Mar del Plata'];
const OPERARIOS_FALLBACK = ['Marcos', 'Jeremías', 'Neyen', 'Juan M.', 'Braian'];
const LS_PLANILLA = 'dosif_planilla_actual';

/* ---------------- utilidades ---------------- */
const pad = (n) => String(n).padStart(2, '0');
const hoyISO = () => { const d = new Date(); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); };
const horaStr = () => { const d = new Date(); return pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds()); };
const fechaAR = (iso) => { if (!iso) return ''; const [y, m, d] = iso.split('-'); return d + '/' + m + '/' + y; };
const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
const num = (v) => { const n = parseFloat(String(v).replace(',', '.')); return Number.isFinite(n) ? n : NaN; };
const n0 = (v) => { const n = num(v); return Number.isFinite(n) ? n : 0; };
const fmt = (n) => (n === null || n === undefined || n === '' || Number.isNaN(Number(n)) ? '' : Number(n).toLocaleString('es-AR', { maximumFractionDigits: 3 }));
const lsGet = (k, fb) => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : fb; } catch (e) { return fb; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* sin storage */ } };
const lsDel = (k) => { try { localStorage.removeItem(k); } catch (e) { /* sin storage */ } };
const uid = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now() + '-' + Math.random().toString(16).slice(2));
const unidadDe = (c) => c.unidad || 'kg'; // 'kg' (químico a granel) | 'L' (litros) | 'u' (envases y accesorios)
const kgKit = (comps) => (comps || []).filter((c) => unidadDe(c) === 'kg').reduce((a, c) => a + n0(c.kg), 0);
const qTxt = (q, c) => fmt(q) + ' ' + unidadDe(c);
/* lo que lleva el kit además de los kg: litros y unidades de envase/accesorio */
const extrasKit = (comps) => { const o = {}; (comps || []).forEach((c) => { const u = unidadDe(c); if (u !== 'kg') o[u] = (o[u] || 0) + n0(c.kg); }); return Object.entries(o).map(([u, q]) => fmt(q) + ' ' + u).join(' · '); };
const esValida = (l) => n0(l.cant) > 0 && (l.tipo !== 'kit' || (l.componentes || []).length > 0); // solo importa la cantidad

/* consumo de materia prima de una línea: kit = cada componente × cantidad; producto = su propio peso × cantidad */
function consumosDe(l) {
  const cant = n0(l.cant);
  if (l.tipo === 'kit') return (l.componentes || []).map((c) => ({ sku: c.sku, descripcion: c.descripcion, kg: n0(c.kg) * cant, unidad: unidadDe(c) }));
  return [{ sku: l.sku, descripcion: l.descripcion, kg: n0(l.peso) * cant, unidad: 'kg' }];
}

/* ¿pantalla de celular? (listas en vez de tablas) */
function useMovil() {
  const q = '(max-width: 700px)';
  const [m, setM] = useState(() => (typeof window !== 'undefined' && window.matchMedia ? window.matchMedia(q).matches : false));
  useEffect(() => {
    if (!window.matchMedia) return undefined;
    const mq = window.matchMedia(q); const f = () => setM(mq.matches);
    mq.addEventListener('change', f); return () => mq.removeEventListener('change', f);
  }, []);
  return m;
}
const DIAS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
const diaTxt = (iso) => { const [y, m, dd] = iso.split('-').map(Number); return DIAS[new Date(y, m - 1, dd).getDay()] + ' ' + pad(dd) + '/' + pad(m); };

/* la base entrega como máximo 1.000 filas por consulta: se pide por tandas hasta traer todo */
async function traerTodo(armar) {
  const todo = [];
  for (let i = 0; i < 100000; i += 1000) {
    const { data, error } = await armar().range(i, i + 999);
    if (error) throw error;
    todo.push(...data);
    if (data.length < 1000) break;
  }
  return todo;
}

async function cargarCatalogo() {
  const todo = [];
  for (let desde = 0; ; desde += 1000) {
    const { data, error } = await supabase.from('dosif_catalogo').select('sku,descripcion,tipo,componentes,activo').order('sku').range(desde, desde + 999);
    if (error) throw error;
    todo.push(...data);
    if (data.length < 1000) break;
  }
  return todo;
}

async function cargarConfig() {
  try {
    const { data } = await supabase.from('kv_store').select('value').eq('key', 'config').maybeSingle();
    const v = data && data.value;
    const deps = v && Array.isArray(v.deps) ? v.deps.map((d) => d.nombre).filter(Boolean) : [];
    const ops = v && Array.isArray(v.contadores) ? v.contadores.filter(Boolean) : [];
    return { depositos: deps.length ? deps : DEPOSITOS_FALLBACK, operarios: ops.length ? ops : OPERARIOS_FALLBACK };
  } catch (e) { return { depositos: DEPOSITOS_FALLBACK, operarios: OPERARIOS_FALLBACK }; }
}

/* ---------------- módulo ---------------- */
const TABS = [['cargar', 'Cargar'], ['registros', 'Registros'], ['resumen', 'Resumen'], ['kits', 'Kits']];
const TITULOS = { cargar: 'Dosificado en curso', registros: 'Registros de dosificado', resumen: 'Resumen de logística', kits: 'Kits y recetas' };

/** Props: tab/onTab (si la app maneja las pestañas desde su menú), persona y deposito (quién sos de la app), admin ({nombre, pin} de la sesión de la app o null). */
export default function Dosificado({ tab: tabApp = '', onTab = null, persona = '', deposito = '', admin = null, tabs = null }) {
  setIdentidad({ persona, deposito, admin });
  const visibles = TABS.filter(([id]) => !tabs || tabs.includes(id));
  const [tabLocal, setTabLocal] = useState(() => (visibles[0] || TABS[0])[0]);
  const tab = visibles.some(([id]) => id === tabApp) ? tabApp : visibles.some(([id]) => id === tabLocal) ? tabLocal : (visibles[0] || TABS[0])[0];
  const setTab = (t) => { setTabLocal(t); if (onTab) onTab(t); };
  const [catalogo, setCatalogo] = useState([]);
  const [cfg, setCfg] = useState(null);
  const [estado, setEstado] = useState('cargando'); // cargando | ok | error
  const [toast, setToast] = useState(null);
  const [kitEditor, setKitEditor] = useState(null); // null | {sku?,...}
  const adminSes = admin;
  const toastT = useRef(null);

  const avisar = useCallback((msg, err) => { clearTimeout(toastT.current); setToast({ msg, err }); toastT.current = setTimeout(() => setToast(null), 3200); }, []);

  useEffect(() => {
    Promise.all([cargarCatalogo(), cargarConfig()]).then(([c, k]) => { setCatalogo(c); setCfg(k); setEstado('ok'); }).catch(() => setEstado('error'));
  }, []);

  const guardarEnCatalogo = useCallback((it) => setCatalogo((c) => [...c.filter((x) => x.sku !== it.sku), it].sort((a, b) => a.sku.localeCompare(b.sku))), []);
  const guardarVarios = useCallback((items) => setCatalogo((c) => { const m = new Map(c.map((x) => [x.sku, x])); items.forEach((i) => m.set(i.sku, { ...(m.get(i.sku) || {}), ...i })); return [...m.values()].sort((a, b) => a.sku.localeCompare(b.sku)); }), []);

  return (
    <section className="panel logi-dosif">
      <div className="panel-head">
        <div><span className="eyebrow">Logística · Dosificado</span><h2>{TITULOS[tab]}</h2></div>
      </div>
      {!onTab && visibles.length > 1 && (
        <div className="segmented logi-tabs" role="tablist" aria-label="Dosificado">
          {visibles.map(([id, label]) => <button key={id} type="button" role="tab" aria-selected={tab === id} className={tab === id ? 'selected' : ''} onClick={() => setTab(id)}>{label}</button>)}
        </div>
      )}
      {estado === 'cargando' && <Splash texto="Cargando dosificado" />}
      {estado === 'error' && <div className="form-notice logi-error">No se pudo cargar el dosificado. Revisá la conexión y volvé a abrir la pantalla.</div>}
      {estado === 'ok' && (
        <div key={tab} className="dz-vista">
          {tab === 'cargar' && <Cargar catalogo={catalogo} cfg={cfg} avisar={avisar} guardarEnCatalogo={guardarEnCatalogo} irKits={(sku) => { setKitEditor({ sku: sku || '' }); setTab('kits'); }} irRegistros={() => setTab('registros')} />}
          {tab === 'registros' && <Registros avisar={avisar} cfg={cfg} admin={!!adminSes} adminSes={adminSes} />}
          {tab === 'resumen' && <Resumen avisar={avisar} cfg={cfg} catalogo={catalogo} admin={!!adminSes} />}
          {tab === 'kits' && <Kits catalogo={catalogo} avisar={avisar} guardarEnCatalogo={guardarEnCatalogo} guardarVarios={guardarVarios} admin={!!adminSes} editor={kitEditor} setEditor={setKitEditor} />}
        </div>
      )}
      {toast && <div className={'dz-toast' + (toast.err ? ' err' : '')} role="status">{toast.msg}</div>}
    </section>
  );
}

/* ---------------- buscador reutilizable ---------------- */
function useBusqueda(catalogo, soloSimples) {
  const [q, setQ] = useState('');
  const resultados = useMemo(() => {
    const t = norm(q).split(/\s+/).filter(Boolean);
    if (!t.length) return [];
    const out = [];
    for (const it of catalogo) {
      if (it.activo === false) continue;
      if (soloSimples && it.tipo === 'kit') continue;
      const sku = norm(it.sku); const hay = sku + ' ' + norm(it.descripcion);
      if (t.every((x) => hay.includes(x))) out.push({ it, rank: (sku.startsWith(t[0]) ? 0 : 2) + (it.tipo === 'kit' ? 0 : 1) });
      if (out.length > 400) break;
    }
    out.sort((a, b) => a.rank - b.rank || a.it.sku.localeCompare(b.it.sku));
    return out.slice(0, 40).map((x) => x.it);
  }, [q, catalogo, soloSimples]);
  return [q, setQ, resultados];
}

/* ---------------- pantalla: cargar (guardado automático en vivo) ---------------- */
function Cargar({ catalogo, cfg, avisar, guardarEnCatalogo, irKits, irRegistros }) {
  const [deposito, setDeposito] = useState(() => { const d = getDeposito() || lsGet('dosif_deposito', ''); return cfg.depositos.includes(d) ? d : ''; });
  const [operario, setOperario] = useState(() => getPersona() || lsGet('dosif_operario', ''));
  const [extras, setExtras] = useState(() => lsGet('dosif_operarios_extra', []));
  const [fecha, setFecha] = useState(hoyISO());
  const [q, setQ, resultados] = useBusqueda(catalogo, false);
  const [lineas, setLineas] = useState([]);
  const [nuevoSku, setNuevoSku] = useState(null);
  const [cargando, setCargando] = useState(!!lsGet(LS_PLANILLA, null));
  const [editHdr, setEditHdr] = useState(false);
  const [foco, setFoco] = useState(null);
  const [abiertas, setAbiertas] = useState({});
  const [frecuentes, setFrecuentes] = useState([]);
  const operarios = [...cfg.operarios, ...extras.filter((e) => !cfg.operarios.includes(e))];

  const lineasRef = useRef(lineas); lineasRef.current = lineas;
  const hdrRef = useRef({}); hdrRef.current = { deposito, operario, fecha };
  const planillaRef = useRef(null);
  const hdrGuardado = useRef(null);
  const creandoRef = useRef(null);
  const timers = useRef({});
  const colas = useRef({});

  useEffect(() => { lsSet('dosif_deposito', deposito); setDepositoCompartido(deposito); }, [deposito]);
  useEffect(() => { lsSet('dosif_operario', operario); setPersona(operario); }, [operario]);

  /* al agregar un producto, llevar el cursor a su cantidad (en el celular abre el teclado numérico) */
  useEffect(() => {
    if (!foco) return undefined;
    const t = setTimeout(() => { const el = document.querySelector('[data-qty="' + foco + '"]'); if (el) { el.focus(); try { el.scrollIntoView({ block: 'center', behavior: 'smooth' }); } catch (e) { /* sin scroll */ } } setFoco(null); }, 90);
    return () => clearTimeout(t);
  }, [foco]);

  /* "usados seguido": lo más cargado últimamente, a un toque */
  useEffect(() => {
    let vivo = true;
    supabase.from('dosif_lineas').select('sku,descripcion,tipo').order('created_at', { ascending: false }).limit(400).then(({ data }) => {
      if (!vivo || !data) return;
      const m = new Map(); data.forEach((x) => m.set(x.sku, { sku: x.sku, descripcion: x.descripcion || '', tipo: x.tipo, n: ((m.get(x.sku) || {}).n || 0) + 1 }));
      setFrecuentes([...m.values()].sort((a, b) => b.n - a.n).slice(0, 8));
    });
    return () => { vivo = false; };
  }, []);

  /* retomar la planilla en curso de este dispositivo (si es de hoy) */
  useEffect(() => {
    const id = lsGet(LS_PLANILLA, null);
    if (!id) return undefined;
    let vivo = true;
    (async () => {
      const { data: p } = await supabase.from('dosif_planillas').select('*').eq('id', id).maybeSingle();
      if (!vivo) return;
      if (!p || p.fecha !== hoyISO()) { lsDel(LS_PLANILLA); setCargando(false); return; }
      const { data: ls } = await supabase.from('dosif_lineas').select('*').eq('planilla_id', id).order('created_at');
      if (!vivo) return;
      planillaRef.current = id;
      hdrGuardado.current = p.deposito + '|' + p.operario + '|' + p.fecha;
      setDeposito(p.deposito); setOperario(p.operario); setFecha(p.fecha);
      setLineas((ls || []).map((l) => ({ key: l.id, dbId: l.id, sku: l.sku, descripcion: l.descripcion || '', tipo: l.tipo || 'simple', componentes: l.componentes || null, peso: l.tipo === 'kit' ? '' : String(l.peso_kg ?? ''), cant: String(l.cantidad ?? ''), estado: 'ok' })));
      setCargando(false);
    })().catch(() => setCargando(false));
    return () => { vivo = false; };
  }, []);

  const setEstadoLinea = (key, estado) => setLineas((ls) => ls.map((l) => (l.key === key ? { ...l, estado } : l)));

  async function asegurarPlanilla() {
    if (planillaRef.current) return planillaRef.current;
    if (!creandoRef.current) {
      const h = hdrRef.current;
      creandoRef.current = supabase.from('dosif_planillas').insert({ fecha: h.fecha, hora: horaStr(), deposito: h.deposito, operario: h.operario }).select('id').single()
        .then(({ data, error }) => { creandoRef.current = null; if (error) throw error; planillaRef.current = data.id; hdrGuardado.current = h.deposito + '|' + h.operario + '|' + h.fecha; lsSet(LS_PLANILLA, data.id); return data.id; })
        .catch((e) => { creandoRef.current = null; throw e; });
    }
    return creandoRef.current;
  }

  async function sincronizarUna(key) {
    const l = lineasRef.current.find((x) => x.key === key);
    if (!l) return;
    const h = hdrRef.current;
    if (!esValida(l) || !h.deposito || !h.operario) return;
    setEstadoLinea(key, 'guardando');
    try {
      const pid = await asegurarPlanilla();
      const row = { planilla_id: pid, sku: l.sku, descripcion: l.descripcion, tipo: l.tipo, componentes: l.tipo === 'kit' ? l.componentes : null, peso_kg: null, cantidad: n0(l.cant) };
      const actual = lineasRef.current.find((x) => x.key === key);
      if (!actual) return; // se eliminó mientras tanto
      const crear = async () => {
        const { data, error } = await supabase.from('dosif_lineas').insert(row).select('id').single();
        if (error) throw error;
        setLineas((ls) => ls.map((x) => (x.key === key ? { ...x, dbId: data.id } : x)));
        lineasRef.current = lineasRef.current.map((x) => (x.key === key ? { ...x, dbId: data.id } : x));
      };
      if (actual.dbId) {
        const { data, error } = await supabase.from('dosif_lineas').update(row).eq('id', actual.dbId).select('id');
        if (error) throw error;
        if (!data || !data.length) {
          // 0 filas modificadas: o la borraron desde otro lado (se vuelve a crear) o no hay permiso (error)
          const { data: existe } = await supabase.from('dosif_lineas').select('id').eq('id', actual.dbId).maybeSingle();
          if (existe) throw new Error('no se pudo modificar');
          await crear();
        }
      } else {
        await crear();
      }
      setEstadoLinea(key, 'ok');
    } catch (e) { setEstadoLinea(key, 'error'); }
  }

  function programar(key) {
    clearTimeout(timers.current[key]);
    timers.current[key] = setTimeout(() => { colas.current[key] = (colas.current[key] || Promise.resolve()).then(() => sincronizarUna(key)); }, 600);
  }
  function reintentarTodas() { lineasRef.current.forEach((l) => { if (l.estado === 'error' || l.estado === 'pendiente') programar(l.key); }); }

  /* cambios de encabezado → actualizar la planilla ya creada y re-enviar sus líneas */
  useEffect(() => {
    if (!planillaRef.current) return undefined;
    const firma = deposito + '|' + operario + '|' + fecha;
    if (hdrGuardado.current === null || hdrGuardado.current === firma) { hdrGuardado.current = firma; return undefined; }
    const t = setTimeout(async () => {
      hdrGuardado.current = firma;
      const { data, error } = await supabase.from('dosif_planillas').update({ fecha, deposito, operario }).eq('id', planillaRef.current).select('id');
      if (error || !data || !data.length) { avisar('No se pudo actualizar el depósito/operario de la planilla.', true); return; }
      await supabase.rpc('dosif_resync_planilla', { pid: planillaRef.current });
    }, 500);
    return () => clearTimeout(t);
  }, [deposito, operario, fecha]);

  /* al elegir depósito/operario, guardar lo que estuviera completo y esperando */
  useEffect(() => { if (deposito && operario) reintentarTodas(); /* eslint-disable-next-line */ }, [deposito, operario]);

  function agregar(it) {
    const kit = it.tipo === 'kit';
    const key = uid();
    setLineas((ls) => [...ls, { key, dbId: null, sku: it.sku, descripcion: it.descripcion, tipo: kit ? 'kit' : 'simple', componentes: kit ? it.componentes : null, peso: '', cant: '', estado: 'borrador' }]);
    setQ(''); setFoco(key);
  }
  function editar(key, campo, v) {
    setLineas((ls) => ls.map((l) => {
      if (l.key !== key) return l;
      const n = { ...l, [campo]: v };
      n.estado = esValida(n) ? 'pendiente' : 'borrador';
      return n;
    }));
    programar(key);
  }
  async function quitar(key) {
    const l = lineasRef.current.find((x) => x.key === key);
    clearTimeout(timers.current[key]);
    setLineas((ls) => ls.filter((x) => x.key !== key));
    if (l && l.dbId) {
      const { data, error } = await supabase.from('dosif_lineas').delete().eq('id', l.dbId).select('id');
      if (error || !data || !data.length) avisar('No se pudo quitar la línea guardada. Eliminala desde Registros.', true);
    }
  }

  function agregarOperario() {
    const n = (window.prompt('Nombre del operario:') || '').trim();
    if (!n) return;
    if (!operarios.some((o) => norm(o) === norm(n))) { const e = [...extras, n]; setExtras(e); lsSet('dosif_operarios_extra', e); }
    setOperario(n);
  }

  async function guardarSkuNuevo() {
    const sku = nuevoSku.sku.trim().toUpperCase();
    const descripcion = nuevoSku.descripcion.trim();
    if (!sku || !descripcion) { avisar('Completá SKU y descripción.', true); return; }
    const it = { sku, descripcion, tipo: 'simple', componentes: null, activo: true };
    const { error } = await supabase.from('dosif_catalogo').upsert(it);
    if (error) { avisar('No se pudo guardar el SKU.', true); return; }
    guardarEnCatalogo(it); agregar(it); setNuevoSku(null);
    avisar('SKU ' + sku + ' agregado al catálogo.');
  }

  function nuevaPlanilla() {
    const pendientes = lineas.filter((l) => l.estado === 'pendiente' || l.estado === 'guardando' || l.estado === 'error');
    if (pendientes.length && !window.confirm('Hay ' + pendientes.length + ' línea(s) sin guardar o incompletas. Se van a descartar. ¿Seguir?')) return;
    Object.values(timers.current).forEach(clearTimeout);
    lsDel(LS_PLANILLA); planillaRef.current = null; hdrGuardado.current = null; creandoRef.current = null; colas.current = {};
    setLineas([]); setQ(''); setFecha(hoyISO());
    avisar('Listo, empezás una planilla nueva.');
  }

  const guardadas = lineas.filter((l) => l.estado === 'ok').length;
  const hayError = lineas.some((l) => l.estado === 'error');
  const faltaHdr = !deposito || !operario;
  const esperandoHdr = faltaHdr && lineas.some((l) => esValida(l) && l.estado !== 'ok');
  const guardando = lineas.some((l) => l.estado === 'guardando' || (l.estado === 'pendiente' && !faltaHdr));
  const incompletas = lineas.some((l) => l.estado === 'borrador');
  const totalUni = lineas.reduce((a, l) => a + n0(l.cant), 0);

  if (cargando) return <div className="dz-wrap"><div className="dz-centro-bloque"><Splash texto="Retomando tu planilla" /></div></div>;

  return (
    <div className="dz-wrap">
      {!faltaHdr && !editHdr ? (
        <div className="dz-panel dz-hdr-res">
          <div className="dz-hdr-txt"><b>{deposito}</b><span>· {operario}</span>{fecha !== hoyISO() && <span className="dz-badge">{fechaAR(fecha)}</span>}</div>
          <button type="button" className="dz-link" onClick={() => setEditHdr(true)}>Cambiar</button>
        </div>
      ) : (
        <div className="dz-panel">
          <div>
            <div className="dz-label">¿Dónde se dosifica?</div>
            <div className="dz-chips">{cfg.depositos.map((d) => <button type="button" key={d} className={'dz-chip' + (deposito === d ? ' on' : '')} onClick={() => setDeposito(d)}>{d}</button>)}</div>
          </div>
          <div>
            <div className="dz-label">¿Quién dosifica?</div>
            <div className="dz-chips">
              {operarios.map((o) => <button type="button" key={o} className={'dz-chip' + (operario === o ? ' on' : '')} onClick={() => setOperario(o)}>{o}</button>)}
              <button type="button" className="dz-chip" onClick={agregarOperario}>＋ Otro</button>
            </div>
          </div>
          <div>
            <div className="dz-label">Fecha</div>
            <input aria-label="Fecha del dosificado" className="dz-inp" type="date" value={fecha} max={hoyISO()} onChange={(e) => setFecha(e.target.value || hoyISO())} />
          </div>
          {!faltaHdr && <button type="button" className="dz-btn dz-primary dz-sm" onClick={() => setEditHdr(false)}>Listo</button>}
        </div>
      )}

      <div className="dz-panel">
        <div className="dz-label">Buscar kit o producto por SKU o descripción (ej: KT-740, poliol, MEK)</div>
        <input aria-label="Buscar kit o producto por SKU o descripción" className="dz-inp" placeholder="Escribí el SKU o parte del nombre…" value={q} onChange={(e) => setQ(e.target.value)} autoCapitalize="characters" />
        {!q.trim() && frecuentes.length > 0 && (
          <div>
            <div className="dz-label" style={{ marginTop: 4 }}>Usados seguido</div>
            <div className="dz-chips dz-chips-mini">
              {frecuentes.map((f) => <button type="button" key={f.sku} className="dz-chip dz-chip-sm" title={f.descripcion} onClick={() => agregar(catalogo.find((c) => c.sku === f.sku) || { sku: f.sku, descripcion: f.descripcion, tipo: 'simple', componentes: null })}>{f.sku}</button>)}
            </div>
          </div>
        )}
        {q.trim() && (
          <div className="dz-results">
            {resultados.map((it) => (
              <div key={it.sku} className="dz-res" onClick={() => agregar(it)}>
                <div className="dz-sku">{it.sku}{it.tipo === 'kit' && <span className="dz-badge">KIT</span>}</div>
                <div className="dz-desc">{it.descripcion}</div>
              </div>
            ))}
            <div className="dz-res" onClick={() => irKits(q.trim().toUpperCase())}><div className="dz-desc">{resultados.length ? 'No es ninguno → ' : 'No encontré nada → '}<b>armar un kit nuevo</b></div></div>
            <div className="dz-res" onClick={() => setNuevoSku({ sku: q.trim().toUpperCase(), descripcion: '' })}><div className="dz-desc"><b>＋ Producto simple nuevo</b> (se carga por cantidad)</div></div>
          </div>
        )}
      </div>

      <div>
        <div className="dz-label dz-fila">
          <span>Dosificado ({lineas.length})</span>
          <span className={'dz-live' + (hayError || esperandoHdr ? ' err' : guardando || incompletas ? ' wait' : '')}>
            {hayError ? '⚠ Hay líneas sin guardar' : esperandoHdr ? '⚠ Falta depósito u operario' : guardando ? 'Guardando…' : incompletas ? 'Completá las líneas marcadas' : guardadas ? '● Guardado en vivo' : 'Se guarda solo'}
          </span>
        </div>
        {faltaHdr && lineas.length > 0 && <div className="dz-aviso">Elegí {!deposito ? 'el depósito' : 'quién dosifica'} para que empiece a guardarse solo.</div>}
        {!lineas.length && <div className="dz-vacio">Buscá un kit o producto y tocalo para sumarlo. Cada línea se guarda sola apenas la completás.</div>}
        <div className="dz-lista dz-lista-compacta">
          {lineas.map((l) => {
            const kit = l.tipo === 'kit';
            const marca = l.estado === 'ok' ? '✓' : l.estado === 'guardando' ? '…' : l.estado === 'error' ? '!' : l.estado === 'pendiente' ? '•' : '';
            const ayuda = l.estado === 'ok' ? 'Guardado' : l.estado === 'guardando' ? 'Guardando…' : l.estado === 'error' ? 'No se pudo guardar. Tocá para reintentar' : l.estado === 'pendiente' ? 'Por guardar' : 'Poné la cantidad';
            return (
              <div key={l.key} className={'dz-item ' + l.estado}>
                <div className="dz-item-main">
                  <div className="dz-item-sku">
                    <span className="dz-sku">{l.sku}</span>
                    {kit && <button type="button" className="dz-badge dz-badge-btn" aria-expanded={!!abiertas[l.key]} onClick={() => setAbiertas((a) => ({ ...a, [l.key]: !a[l.key] }))}>KIT {abiertas[l.key] ? '▴' : '▾'}</button>}
                  </div>
                  <div className="dz-item-desc" title={l.descripcion}>{l.descripcion}</div>
                </div>
                <input className="dz-qty" data-qty={l.key} inputMode="decimal" placeholder="Cant." aria-label={'Cantidad de ' + l.sku} value={l.cant} onChange={(e) => editar(l.key, 'cant', e.target.value)} />
                <button type="button" className={'dz-mark ' + l.estado} title={ayuda} aria-label={ayuda} onClick={() => { if (l.estado === 'error') programar(l.key); }}>{marca}</button>
                <button type="button" className="dz-x" onClick={() => quitar(l.key)} aria-label={'Quitar ' + l.sku}>✕</button>
                {kit && abiertas[l.key] && <div className="dz-item-receta">{(l.componentes || []).map((c, i) => <span key={i}>{c.descripcion} <b>{qTxt(c.kg, c)}</b></span>)}</div>}
              </div>
            );
          })}
        </div>
      </div>

      {lineas.length > 0 && <div className="dz-panel dz-resumen-vivo"><div><span className="dz-label">Esta planilla</span><div><b>{lineas.length}</b> líneas · <b>{fmt(totalUni)}</b> unidades · {guardadas} guardadas</div></div></div>}
      <div className="dz-fila-btns">
        <button type="button" className="dz-btn dz-secondary dz-sm" onClick={nuevaPlanilla}>＋ Planilla nueva</button>
        <button type="button" className="dz-btn dz-secondary dz-sm" onClick={irRegistros}>Ver registros →</button>
      </div>

      {nuevoSku && (
        <div className="dz-overlay" onClick={() => setNuevoSku(null)}>
          <div className="dz-modal" onClick={(e) => e.stopPropagation()}>
            <h2 className="dz-h2">Producto simple nuevo</h2>
            <div className="dz-muted">Queda guardado en el catálogo para la próxima vez.</div>
            <div><div className="dz-label">SKU</div><input className="dz-inp" value={nuevoSku.sku} onChange={(e) => setNuevoSku({ ...nuevoSku, sku: e.target.value })} autoCapitalize="characters" /></div>
            <div><div className="dz-label">Descripción</div><input className="dz-inp" placeholder="ej: MEK en envase" value={nuevoSku.descripcion} onChange={(e) => setNuevoSku({ ...nuevoSku, descripcion: e.target.value })} /></div>
            <button type="button" className="dz-btn dz-primary" onClick={guardarSkuNuevo}>Guardar y agregar</button>
            <button type="button" className="dz-btn dz-secondary" onClick={() => setNuevoSku(null)}>Cancelar</button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ---------------- pantalla: kits y recetas ---------------- */
function Kits({ catalogo, avisar, guardarEnCatalogo, guardarVarios, admin, editor, setEditor }) {
  const [importar, setImportar] = useState(false);
  const [bk, setBk] = useState('');
  const todosKits = catalogo.filter((c) => c.tipo === 'kit' && c.activo !== false);
  const tk = norm(bk).split(/s+/).filter(Boolean);
  const filtrados = todosKits.filter((c) => !tk.length || tk.every((x) => norm(c.sku + ' ' + c.descripcion).includes(x)));
  const kits = filtrados.slice(0, 60);
  const archivados = catalogo.filter((c) => c.tipo === 'kit' && c.activo === false);

  async function archivar(k) {
    if (!window.confirm('¿Archivar el kit ' + k.sku + '? Deja de aparecer en el buscador (el historial se conserva).')) return;
    const { data, error } = await supabase.from('dosif_catalogo').update({ activo: false }).eq('sku', k.sku).select('sku');
    if (error || !data || !data.length) { avisar('No se pudo archivar.', true); return; }
    guardarEnCatalogo({ ...k, activo: false }); avisar('Kit archivado.');
  }
  async function restaurar(k) {
    const { data, error } = await supabase.from('dosif_catalogo').update({ activo: true }).eq('sku', k.sku).select('sku');
    if (error || !data || !data.length) { avisar('No se pudo restaurar.', true); return; }
    guardarEnCatalogo({ ...k, activo: true }); avisar('Kit restaurado.');
  }

  return (
    <div className="dz-wrap">
      <div className="dz-muted">Un kit es una receta: cuánto de cada materia prima lleva (por ejemplo 22 kg de poliol + 25 kg de isocianato). Al dosificar, la app calcula sola cuánto se consume de cada tambor.</div>
      <div className="dz-fila-btns">
        <button type="button" className="dz-btn dz-primary dz-sm" onClick={() => setEditor({ sku: '' })}>＋ Nuevo kit</button>
        {admin && <button type="button" className="dz-btn dz-secondary dz-sm" onClick={() => setImportar(true)}>⬆ Importar CSV</button>}
        {admin && <button type="button" className="dz-btn dz-secondary dz-sm" onClick={() => exportarCatalogoCSV(catalogo)}>⬇ Exportar CSV</button>}
      </div>
      {todosKits.length > 8 && <input aria-label="Buscar kit" className="dz-inp" placeholder={'Buscar entre los ' + todosKits.length + ' kits (SKU o nombre)…'} value={bk} onChange={(e) => setBk(e.target.value)} />}
      {!todosKits.length && <div className="dz-vacio">Todavía no hay kits. Armá el primero.</div>}
      {todosKits.length > 0 && !filtrados.length && <div className="dz-vacio">No hay kits con esa búsqueda.</div>}
      <div className="dz-lista">
        {kits.map((k) => (
          <div key={k.sku} className="dz-card dz-linea">
            <div className="dz-top">
              <div><div className="dz-sku">{k.sku}<span className="dz-badge">KIT</span></div><div className="dz-desc">{k.descripcion}</div></div>
            </div>
            <div className="dz-receta">{(k.componentes || []).map((c, i) => <span key={i}>{c.descripcion} <b>{qTxt(c.kg, c)}</b></span>)}</div>
            <div className="dz-fila-btns">
              <button type="button" className="dz-btn dz-secondary dz-sm" onClick={() => setEditor({ ...k, existente: true })}>Editar</button>
              <button type="button" className="dz-btn dz-secondary dz-sm dz-peligro" onClick={() => archivar(k)}>Archivar</button>
            </div>
          </div>
        ))}
      </div>
      {filtrados.length > kits.length && <div className="dz-muted">Mostrando {kits.length} de {filtrados.length}. Escribí en el buscador para ver el resto.</div>}
      {archivados.length > 0 && (
        <details className="dz-detalles"><summary>Kits archivados ({archivados.length})</summary>
          {archivados.map((k) => <div key={k.sku} className="dz-arch"><span className="dz-sku">{k.sku}</span> {k.descripcion} <button type="button" className="dz-link" onClick={() => restaurar(k)}>Restaurar</button></div>)}
        </details>
      )}
      {admin && importar && <ImportarCSV catalogo={catalogo} avisar={avisar} guardarVarios={guardarVarios} onCerrar={() => setImportar(false)} />}
      {editor && <KitEditor catalogo={catalogo} inicial={editor} onCerrar={() => setEditor(null)} avisar={avisar} guardarEnCatalogo={guardarEnCatalogo} />}
    </div>
  );
}

function KitEditor({ catalogo, inicial, onCerrar, avisar, guardarEnCatalogo }) {
  const [sku, setSku] = useState(inicial.sku || '');
  const [descripcion, setDescripcion] = useState(inicial.descripcion || '');
  const [comps, setComps] = useState(() => (inicial.componentes && inicial.componentes.length ? inicial.componentes.map((c) => ({ ...c, kg: String(c.kg), unidad: unidadDe(c) })) : [{ sku: '', descripcion: '', kg: '', unidad: 'kg' }, { sku: '', descripcion: '', kg: '', unidad: 'kg' }]));
  const [buscando, setBuscando] = useState(null); // índice de la fila
  const [q, setQ, resultados] = useBusqueda(catalogo, true);
  const [guardando, setGuardando] = useState(false);
  const nQuim = comps.filter((c) => n0(c.kg) > 0).length;

  const setComp = (i, parche) => setComps((cs) => cs.map((c, j) => (j === i ? { ...c, ...parche } : c)));

  async function guardar() {
    const s = sku.trim().toUpperCase();
    if (!s) { avisar('Poné el SKU del kit.', true); return; }
    if (!descripcion.trim()) { avisar('Poné una descripción.', true); return; }
    const limpias = comps.filter((c) => c.descripcion.trim() || c.sku.trim() || n0(c.kg) > 0);
    if (!limpias.length || limpias.some((c) => !(n0(c.kg) > 0) || !(c.descripcion.trim() || c.sku.trim()))) { avisar('Cada componente necesita nombre y cantidad.', true); return; }
    const existente = catalogo.find((c) => c.sku === s);
    if (!inicial.existente && existente && !window.confirm('Ya existe ' + s + (existente.tipo === 'kit' ? ' como kit' : ' como producto') + '. ¿Reemplazarlo?')) return;
    const it = { sku: s, descripcion: descripcion.trim(), tipo: 'kit', activo: true, componentes: limpias.map((c) => ({ sku: c.sku.trim().toUpperCase(), descripcion: c.descripcion.trim() || c.sku.trim(), kg: n0(c.kg), unidad: unidadDe(c) })) };
    setGuardando(true);
    const { error } = await supabase.from('dosif_catalogo').upsert(it);
    setGuardando(false);
    if (error) { avisar('No se pudo guardar el kit.', true); return; }
    guardarEnCatalogo(it); avisar('Kit ' + s + ' guardado.'); onCerrar();
  }

  return (
    <div className="dz-overlay" onClick={onCerrar}>
      <div className="dz-modal dz-modal-ancho" onClick={(e) => e.stopPropagation()}>
        <h2 className="dz-h2">{inicial.existente ? 'Editar kit' : 'Nuevo kit'}</h2>
        <div className="dz-row2">
          <div><div className="dz-label">SKU del kit</div><input className="dz-inp" placeholder="ej: KT-740-47" value={sku} disabled={!!inicial.existente} onChange={(e) => setSku(e.target.value)} autoCapitalize="characters" /></div>
          <div><div className="dz-label">Descripción</div><input className="dz-inp" placeholder="ej: Poliuretano 740 kit 47 kg" value={descripcion} onChange={(e) => setDescripcion(e.target.value)} /></div>
        </div>
        <div className="dz-label">Químicos que lleva (por cada kit)</div>
        {comps.map((c, i) => (
          <div key={i} className="dz-comp">
            <div className="dz-comp-main">
              {c.descripcion ? (
                <div className="dz-comp-sel"><div className="dz-sku">{c.sku}</div><div className="dz-desc">{c.descripcion}</div><button type="button" className="dz-link" onClick={() => { setComp(i, { sku: '', descripcion: '' }); setBuscando(i); setQ(''); }}>cambiar</button></div>
              ) : (
                <>
                  <input className="dz-inp" placeholder="Buscar materia prima (ej: poliol 740, isocianato)…" value={buscando === i ? q : ''} onFocus={() => { setBuscando(i); setQ(''); }} onChange={(e) => { setBuscando(i); setQ(e.target.value); }} />
                  {buscando === i && q.trim() && (
                    <div className="dz-results">
                      {resultados.map((it) => <div key={it.sku} className="dz-res" onClick={() => { setComp(i, { sku: it.sku, descripcion: it.descripcion }); setBuscando(null); setQ(''); }}><div className="dz-sku">{it.sku}</div><div className="dz-desc">{it.descripcion}</div></div>)}
                      <div className="dz-res" onClick={() => { setComp(i, { sku: '', descripcion: q.trim() }); setBuscando(null); setQ(''); }}><div className="dz-desc">Usar «<b>{q.trim()}</b>» tal cual (sin SKU)</div></div>
                    </div>
                  )}
                </>
              )}
            </div>
            <div className="dz-comp-kg"><input className="dz-inp" inputMode="decimal" placeholder="cant." aria-label="Cantidad" value={c.kg} onChange={(e) => setComp(i, { kg: e.target.value })} /><select className="dz-inp dz-un" aria-label="Unidad" value={unidadDe(c)} onChange={(e) => setComp(i, { unidad: e.target.value })}><option value="kg">kg</option><option value="L">L</option></select></div>
            <button type="button" className="dz-x" onClick={() => setComps((cs) => (cs.length > 1 ? cs.filter((_, j) => j !== i) : cs))} aria-label="Quitar componente">✕</button>
          </div>
        ))}
        <button type="button" className="dz-btn dz-secondary dz-sm" onClick={() => setComps((cs) => [...cs, { sku: '', descripcion: '', kg: '', unidad: 'kg' }])}>＋ Otro componente</button>
        <div className="dz-consumo">Químicos en la receta: <b>{nQuim}</b></div>
        <button type="button" className="dz-btn dz-primary" disabled={guardando} onClick={guardar}>{guardando ? 'Guardando…' : 'Guardar kit'}</button>
        <button type="button" className="dz-btn dz-secondary" onClick={onCerrar}>Cancelar</button>
      </div>
    </div>
  );
}

/* ---------------- pantalla: registros (en vivo) ---------------- */
function Registros({ avisar, cfg, admin, adminSes }) {
  const [filas, setFilas] = useState(null);
  const [error, setError] = useState(false);
  const [vivo, setVivo] = useState(false);
  const [desde, setDesde] = useState('');
  const [hasta, setHasta] = useState('');
  const [dep, setDep] = useState('');
  const [op, setOp] = useState('');
  const [txt, setTxt] = useState('');
  const [ver, setVer] = useState(null);
  const [exportando, setExportando] = useState(false);
  const refetchT = useRef(null);
  const movil = useMovil();

  const cargar = useCallback(async () => {
    let data;
    try {
      data = await traerTodo(() => supabase.from('dosif_lineas').select('id,sku,descripcion,tipo,componentes,peso_kg,cantidad,created_at,planilla:dosif_planillas(id,fecha,hora,deposito,operario)').order('created_at', { ascending: false }).order('id'));
    } catch (err) { setError(true); return; }
    setError(false);
    const plano = data.filter((r) => r.planilla).map((r) => ({
      id: r.id, planillaId: r.planilla.id, fecha: r.planilla.fecha, hora: r.planilla.hora, deposito: r.planilla.deposito,
      operario: r.planilla.operario, sku: r.sku, descripcion: r.descripcion || '', tipo: r.tipo || 'simple', componentes: r.componentes || null,
      peso: r.peso_kg === null ? null : Number(r.peso_kg), cant: Number(r.cantidad),
    }));
    plano.sort((a, b) => (b.fecha + b.hora).localeCompare(a.fecha + a.hora) || a.sku.localeCompare(b.sku));
    setFilas(plano);
  }, []);

  useEffect(() => {
    cargar();
    const canal = supabase.channel('dosif-vivo')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'dosif_lineas' }, () => { clearTimeout(refetchT.current); refetchT.current = setTimeout(cargar, 350); })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'dosif_planillas' }, () => { clearTimeout(refetchT.current); refetchT.current = setTimeout(cargar, 350); })
      .subscribe((s) => setVivo(s === 'SUBSCRIBED'));
    return () => { clearTimeout(refetchT.current); supabase.removeChannel(canal); };
  }, [cargar]);

  const filtradas = useMemo(() => {
    if (!filas) return [];
    const t = norm(txt).split(/\s+/).filter(Boolean);
    return filas.filter((f) =>
      (!desde || f.fecha >= desde) && (!hasta || f.fecha <= hasta) && (!dep || f.deposito === dep) && (!op || f.operario === op) &&
      (!t.length || t.every((x) => norm(f.sku + ' ' + f.descripcion + ' ' + f.operario).includes(x))));
  }, [filas, desde, hasta, dep, op, txt]);

  const operariosEnDatos = useMemo(() => [...new Set((filas || []).map((f) => f.operario))].sort(), [filas]);
  const depositosEnDatos = useMemo(() => [...new Set([...cfg.depositos, ...(filas || []).map((f) => f.deposito)])], [filas, cfg]);
  const distintos = new Set(filtradas.map((f) => f.sku)).size;
  const totalUni = filtradas.reduce((a, f) => a + f.cant, 0);

  const consumo = useMemo(() => {
    const m = new Map();
    filtradas.forEach((f) => {
      consumosDe({ tipo: f.tipo, componentes: f.componentes, sku: f.sku, descripcion: f.descripcion, peso: f.peso, cant: f.cant }).forEach((c) => {
        const k = (c.sku || '') + '|' + c.descripcion + '|' + c.unidad;
        const a = m.get(k) || { sku: c.sku, descripcion: c.descripcion, unidad: c.unidad, kg: 0 };
        a.kg += c.kg; m.set(k, a);
      });
    });
    return [...m.values()].filter((c) => c.kg > 0).sort((a, b) => b.kg - a.kg);
  }, [filtradas]);

  async function exportar() {
    if (!filtradas.length) { avisar('No hay registros para exportar.', true); return; }
    setExportando(true);
    try {
      const ExcelJS = (await import('exceljs')).default;
      const wb = new ExcelJS.Workbook();
      const estilo = (ws, ultCol) => {
        const h = ws.getRow(1);
        h.font = { bold: true, color: { argb: 'FFFFFFFF' } };
        h.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF292929' } };
        ws.views = [{ state: 'frozen', ySplit: 1 }];
        ws.autoFilter = { from: 'A1', to: ultCol + '1' };
      };
      const ws = wb.addWorksheet('Dosificado');
      ws.columns = [
        { header: 'Fecha', key: 'fecha', width: 12 }, { header: 'Hora', key: 'hora', width: 8 }, { header: 'Depósito', key: 'dep', width: 16 },
        { header: 'Operario', key: 'op', width: 14 }, { header: 'Tipo', key: 'tipo', width: 10 }, { header: 'SKU', key: 'sku', width: 22 },
        { header: 'Descripción', key: 'desc', width: 40 }, { header: 'Cantidad', key: 'cant', width: 10 }, 
      ];
      filtradas.forEach((f) => {
        const pu = f.tipo === 'kit' ? kgKit(f.componentes) : n0(f.peso);
        const comp = f.tipo === 'kit' ? (f.componentes || []).map((c) => c.descripcion + ' ' + qTxt(n0(c.kg) * f.cant, c)).join(' + ') : '';
        const r = ws.addRow({ fecha: fechaAR(f.fecha), hora: String(f.hora).slice(0, 5), dep: f.deposito, op: f.operario, tipo: f.tipo === 'kit' ? 'Kit' : 'Producto', sku: f.sku, desc: f.descripcion, cant: f.cant });
      });
      estilo(ws, 'H');
      const wc = wb.addWorksheet('Consumo');
      wc.columns = [{ header: 'SKU materia prima', key: 'sku', width: 24 }, { header: 'Materia prima', key: 'desc', width: 46 }, { header: 'Cantidad consumida', key: 'kg', width: 18 }, { header: 'Unidad', key: 'un', width: 10 }];
      consumo.forEach((c) => wc.addRow({ sku: c.sku, desc: c.descripcion, kg: Math.round(c.kg * 1000) / 1000, un: c.unidad }));
      estilo(wc, 'D');
      const buf = await wb.xlsx.writeBuffer();
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
      a.download = 'dosificado_' + hoyISO() + '.xlsx';
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    } catch (e) { avisar('No se pudo generar el Excel.', true); }
    finally { setExportando(false); }
  }

  async function eliminarLinea(f) {
    if (!window.confirm('¿Eliminar esta línea (' + f.sku + ')? No se puede deshacer.')) return;
    const { data: del, error: err } = await supabase.from('dosif_lineas').delete().eq('id', f.id).select('id');
    if (err || !del || !del.length) { avisar('No se pudo eliminar.', true); cargar(); return; }
    setVer(null); avisar('Línea eliminada.'); cargar();
  }
  async function eliminarPlanilla(f) {
    if (!window.confirm('¿Eliminar TODA la planilla (' + f.deposito + ', ' + fechaAR(f.fecha) + ', ' + f.operario + ') con todas sus líneas? No se puede deshacer.')) return;
    const { data: del, error: err } = await supabase.from('dosif_planillas').delete().eq('id', f.planillaId).select('id');
    if (err || !del || !del.length) { avisar('No se pudo eliminar.', true); cargar(); return; }
    setVer(null); avisar('Planilla eliminada.'); cargar();
  }

  return (
    <div className="dz-wrap">
      <div className="dz-panel">
        <div className="dz-label dz-fila"><span>Filtros</span><span className={'dz-live' + (vivo ? '' : ' wait')}>{vivo ? '● En vivo' : 'Conectando…'}</span></div>
        <div className="dz-filters">
          <div><div className="dz-label">Desde</div><input aria-label="Desde" className="dz-inp" type="date" value={desde} onChange={(e) => setDesde(e.target.value)} /></div>
          <div><div className="dz-label">Hasta</div><input aria-label="Hasta" className="dz-inp" type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} /></div>
          <div><div className="dz-label">Depósito</div><select aria-label="Depósito" className="dz-inp" value={dep} onChange={(e) => setDep(e.target.value)}><option value="">Todos</option>{depositosEnDatos.map((d) => <option key={d}>{d}</option>)}</select></div>
          <div><div className="dz-label">Operario</div><select aria-label="Operario" className="dz-inp" value={op} onChange={(e) => setOp(e.target.value)}><option value="">Todos</option>{operariosEnDatos.map((o) => <option key={o}>{o}</option>)}</select></div>
        </div>
        <input aria-label="Buscar en los registros" className="dz-inp" placeholder="Buscar por SKU, descripción u operario…" value={txt} onChange={(e) => setTxt(e.target.value)} />
      </div>
      <div className="dz-metrics">
        <div className="dz-metric"><span>Líneas</span><strong>{fmt(filtradas.length) || 0}</strong></div>
        <div className="dz-metric"><span>Unidades</span><strong>{fmt(totalUni) || 0}</strong></div>
        <div className="dz-metric is-urgent"><span>Productos distintos</span><strong>{distintos}</strong></div>
      </div>
      {admin && (
        <div className="dz-fila-btns">
          <button type="button" className="dz-btn dz-dark dz-sm" disabled={exportando} onClick={exportar}>{exportando ? 'Generando…' : '⬇ Descargar Excel'}</button>
          <button type="button" className="dz-btn dz-secondary dz-sm" onClick={async () => { const { data } = await supabase.rpc('dosif_planilla_url', { p_nombre: adminSes.nombre, p_pin: adminSes.pin }); if (data) window.open(data, '_blank', 'noopener'); else avisar('No se pudo abrir la planilla.', true); }}>Abrir planilla en Drive ↗</button>
        </div>
      )}

      {error && <div className="dz-card dz-alerta">No se pudieron cargar los registros. <button type="button" className="dz-link" onClick={cargar}>Reintentar</button></div>}
      {!error && filas === null && <div className="dz-centro-bloque"><Splash texto="Cargando registros" /></div>}
      {filas && !filtradas.length && <div className="dz-vacio">No hay registros con esos filtros.</div>}

      {consumo.length > 0 && (
        <details className="dz-detalles dz-det-consumo">
          <summary>Consumo de químicos de lo filtrado (opcional)</summary>
          <div className="dz-tablewrap">
            <table className="dz-table dz-table-chica"><thead><tr><th>SKU</th><th>Materia prima</th><th>Consumido</th></tr></thead>
              <tbody>{consumo.map((c) => <tr key={c.sku + c.descripcion + c.unidad}><td className="dz-sku">{c.sku}</td><td className="dz-td-desc" title={c.descripcion}>{c.descripcion}</td><td className="dz-num">{fmt(c.kg)} {c.unidad}</td></tr>)}</tbody></table>
          </div>
        </details>
      )}

      {filtradas.length > 0 && (
        <div>
          <div className="dz-label">Detalle</div>
          {movil ? (
            <div className="dz-lm">
              {filtradas.slice(0, 300).map((f) => (
                <button type="button" key={f.id} className="dz-lm-row" onClick={() => setVer(f)}>
                  <div className="dz-lm-top"><span className="dz-sku">{f.sku}{f.tipo === 'kit' && <span className="dz-badge">KIT</span>}</span><b className="dz-lm-num">×{fmt(f.cant)}</b></div>
                  <div className="dz-lm-desc">{f.descripcion}</div>
                  <div className="dz-lm-meta">{fechaAR(f.fecha).slice(0, 5)} {String(f.hora).slice(0, 5)} · {f.operario} · {f.deposito}</div>
                </button>
              ))}
            </div>
          ) : (
            <div className="dz-tablewrap">
              <table className="dz-table dz-denso">
                <thead><tr><th>Fecha</th><th>Hora</th><th>Depósito</th><th>Operario</th><th>SKU</th><th>Descripción</th><th>Cant.</th><th></th></tr></thead>
                <tbody>
                  {filtradas.slice(0, 1000).map((f) => (
                    <tr key={f.id}>
                      <td>{fechaAR(f.fecha)}</td><td>{String(f.hora).slice(0, 5)}</td><td>{f.deposito}</td><td>{f.operario}</td>
                      <td className="dz-sku">{f.sku}{f.tipo === 'kit' && <span className="dz-badge">KIT</span>}</td>
                      <td className="dz-td-desc" title={f.descripcion}>{f.descripcion}</td>
                      <td className="dz-num dz-strong">{fmt(f.cant)}</td>
                      <td><button type="button" className="dz-link" onClick={() => setVer(f)}>Detalle</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
      {filtradas.length > 1000 && <div className="dz-muted">Se muestran las primeras 1000 líneas; el Excel incluye todas las filtradas.</div>}

      {ver && (
        <div className="dz-overlay" onClick={() => setVer(null)}>
          <div className="dz-modal" onClick={(e) => e.stopPropagation()}>
            <h2 className="dz-h2">{ver.sku}</h2>
            <div className="dz-desc">{ver.descripcion}</div>
            <div className="dz-muted">{ver.deposito} · {fechaAR(ver.fecha)} {String(ver.hora).slice(0, 5)} · dosificó {ver.operario}</div>
            <div className="dz-consumo"><b>{fmt(ver.cant)}</b> {ver.tipo === 'kit' ? 'kits' : 'unidades'}</div>
            {ver.tipo === 'kit' && <div className="dz-receta">{(ver.componentes || []).map((c, i) => <span key={i}>{c.descripcion} <b>{qTxt(n0(c.kg) * ver.cant, c)}</b></span>)}</div>}
            <button type="button" className="dz-btn dz-secondary" onClick={() => setVer(null)}>Cerrar</button>
            <button type="button" className="dz-btn dz-secondary dz-peligro" onClick={() => eliminarLinea(ver)}>Eliminar esta línea</button>
            <button type="button" className="dz-btn dz-secondary dz-peligro" onClick={() => eliminarPlanilla(ver)}>Eliminar toda la planilla</button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ---------------- pantalla: resumen para logística (stock dosificado, rotación, quién dosifica) ---------------- */
const PERIODOS = [
  { id: 'hoy', label: 'Hoy' }, { id: '7', label: '7 días' }, { id: '30', label: '30 días' }, { id: '90', label: '90 días' }, { id: 'todo', label: 'Todo' },
];
const MOV_TXT = { salida: 'Salida', ajuste: 'Ajuste (+)', merma: 'Merma (−)' };
const MOV_AYUDA = { salida: 'Se vendió o se envió', ajuste: 'Stock inicial o corrección a favor', merma: 'Se perdió o se descartó' };
const hace = (dias) => { const dt = new Date(); dt.setDate(dt.getDate() - dias); return dt.getFullYear() + '-' + pad(dt.getMonth() + 1) + '-' + pad(dt.getDate()); };
const desdePeriodo = (p) => (p === 'todo' ? '' : p === 'hoy' ? hoyISO() : hace(parseInt(p, 10)));

function Resumen({ avisar, cfg, catalogo, admin }) {
  const movil = useMovil();
  const [lineas, setLineas] = useState(null);
  const [movs, setMovs] = useState([]);
  const [error, setError] = useState(false);
  const [vivo, setVivo] = useState(false);
  const [dep, setDep] = useState('');
  const [per, setPer] = useState('30');
  const [orden, setOrden] = useState('dosif');
  const [txt, setTxt] = useState('');
  const [diasVis, setDiasVis] = useState(7);
  const [modal, setModal] = useState(false);
  const [exportando, setExportando] = useState(false);
  const rt = useRef(null);

  const cargar = useCallback(async () => {
    let la; let lb;
    try {
      [la, lb] = await Promise.all([
        traerTodo(() => supabase.from('dosif_lineas').select('id,sku,descripcion,tipo,cantidad,planilla:dosif_planillas(fecha,hora,deposito,operario)').order('id')),
        traerTodo(() => supabase.from('dosif_movimientos').select('*').order('created_at', { ascending: false }).order('id')),
      ]);
    } catch (err) { setError(true); return; }
    setError(false);
    setLineas(la.filter((r) => r.planilla).map((r) => ({ id: r.id, sku: r.sku, descripcion: r.descripcion || '', tipo: r.tipo || 'simple', cant: Number(r.cantidad), fecha: r.planilla.fecha, hora: r.planilla.hora, deposito: r.planilla.deposito, operario: r.planilla.operario })));
    setMovs(lb.map((m) => ({ ...m, cantidad: Number(m.cantidad) })));
  }, []);

  useEffect(() => {
    cargar();
    const refrescar = () => { clearTimeout(rt.current); rt.current = setTimeout(cargar, 400); };
    const canal = supabase.channel('dosif-resumen')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'dosif_lineas' }, refrescar)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'dosif_planillas' }, refrescar)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'dosif_movimientos' }, refrescar)
      .subscribe((s) => setVivo(s === 'SUBSCRIBED'));
    return () => { clearTimeout(rt.current); supabase.removeChannel(canal); };
  }, [cargar]);

  const desde = desdePeriodo(per);
  const enDep = (x) => !dep || x.deposito === dep;
  const enPer = (x) => !desde || x.fecha >= desde;

  /* stock = todo lo dosificado − salidas − mermas + ajustes (histórico); el resto, en el período elegido */
  const productos = useMemo(() => {
    if (!lineas) return [];
    const m = new Map();
    const get = (sku, descripcion, tipo) => { if (!m.has(sku)) m.set(sku, { sku, descripcion, tipo, dosif: 0, salidas: 0, stock: 0, veces: 0, ultima: '' }); return m.get(sku); };
    lineas.filter(enDep).forEach((l) => {
      const p = get(l.sku, l.descripcion, l.tipo);
      p.stock += l.cant;
      if ((l.fecha + ' ' + l.hora) > p.ultima) p.ultima = l.fecha + ' ' + l.hora;
      if (enPer(l)) { p.dosif += l.cant; p.veces += 1; }
    });
    movs.filter(enDep).forEach((mv) => {
      const cat = catalogo.find((c) => c.sku === mv.sku);
      const p = get(mv.sku, mv.descripcion || (cat && cat.descripcion) || '', cat ? cat.tipo : 'simple');
      if (mv.tipo === 'ajuste') p.stock += mv.cantidad; else p.stock -= mv.cantidad;
      if (mv.tipo !== 'ajuste' && enPer(mv)) p.salidas += mv.cantidad;
    });
    const t = norm(txt).split(/\s+/).filter(Boolean);
    const lista = [...m.values()].filter((p) => !t.length || t.every((x) => norm(p.sku + ' ' + p.descripcion).includes(x)));
    const cmp = { dosif: (a, b) => b.dosif - a.dosif, stock: (a, b) => b.stock - a.stock, salidas: (a, b) => b.salidas - a.salidas, ultima: (a, b) => b.ultima.localeCompare(a.ultima) }[orden];
    return lista.sort((a, b) => cmp(a, b) || a.sku.localeCompare(b.sku));
  }, [lineas, movs, dep, per, txt, orden, catalogo]); // eslint-disable-line react-hooks/exhaustive-deps

  /* qué se dosificó cada día y quién (ej: "Vie 14/11 — Braian: 10 × KT-REPOXI-1…, 20 × KT-740-47…") */
  const porDia = useMemo(() => {
    if (!lineas) return [];
    const dias = new Map();
    lineas.filter((l) => enDep(l) && enPer(l)).forEach((l) => {
      const dd = dias.get(l.fecha) || { fecha: l.fecha, total: 0, ops: new Map() };
      const o = dd.ops.get(l.operario) || { operario: l.operario, total: 0, items: new Map() };
      const it = o.items.get(l.sku) || { sku: l.sku, descripcion: l.descripcion, cant: 0 };
      it.cant += l.cant; o.items.set(l.sku, it); o.total += l.cant; dd.total += l.cant;
      dd.ops.set(l.operario, o); dias.set(l.fecha, dd);
    });
    return [...dias.values()].sort((a, b) => b.fecha.localeCompare(a.fecha)).map((dd) => ({
      fecha: dd.fecha, total: dd.total,
      operarios: [...dd.ops.values()].sort((a, b) => b.total - a.total).map((o) => ({ operario: o.operario, total: o.total, items: [...o.items.values()].sort((a, b) => b.cant - a.cant) })),
    }));
  }, [lineas, dep, per]); // eslint-disable-line react-hooks/exhaustive-deps

  const operarios = useMemo(() => {
    if (!lineas) return [];
    const m = new Map();
    lineas.filter((l) => enDep(l) && enPer(l)).forEach((l) => {
      const o = m.get(l.operario) || { operario: l.operario, lineas: 0, unidades: 0, skus: new Set(), ultima: '' };
      o.lineas += 1; o.unidades += l.cant; o.skus.add(l.sku);
      if ((l.fecha + ' ' + l.hora) > o.ultima) o.ultima = l.fecha + ' ' + l.hora;
      m.set(l.operario, o);
    });
    return [...m.values()].sort((a, b) => b.unidades - a.unidades);
  }, [lineas, dep, per]); // eslint-disable-line react-hooks/exhaustive-deps

  const depositos = useMemo(() => {
    if (!lineas) return [];
    return cfg.depositos.map((dp) => {
      const ls = lineas.filter((l) => l.deposito === dp); const ms = movs.filter((x) => x.deposito === dp);
      const dosif = ls.filter(enPer).reduce((a, l) => a + l.cant, 0);
      const sal = ms.filter((x) => x.tipo !== 'ajuste' && enPer(x)).reduce((a, x) => a + x.cantidad, 0);
      const stock = ls.reduce((a, l) => a + l.cant, 0) + ms.reduce((a, x) => a + (x.tipo === 'ajuste' ? x.cantidad : -x.cantidad), 0);
      return { deposito: dp, dosif, salidas: sal, stock };
    });
  }, [lineas, movs, per, cfg]); // eslint-disable-line react-hooks/exhaustive-deps

  const ultimos = useMemo(() => {
    if (!lineas) return [];
    const a = lineas.filter(enDep).map((l) => ({ k: 'l' + l.id, cuando: l.fecha + ' ' + l.hora, fecha: l.fecha, hora: l.hora, tipo: 'Dosificado', signo: 1, deposito: l.deposito, sku: l.sku, descripcion: l.descripcion, cant: l.cant, quien: l.operario }));
    const b = movs.filter(enDep).map((x) => ({ k: 'm' + x.id, id: x.id, cuando: x.fecha + ' ' + x.hora, fecha: x.fecha, hora: x.hora, tipo: MOV_TXT[x.tipo], signo: x.tipo === 'ajuste' ? 1 : -1, deposito: x.deposito, sku: x.sku, descripcion: x.descripcion || '', cant: x.cantidad, quien: x.operario || '', nota: x.nota }));
    return [...a, ...b].sort((x, y) => y.cuando.localeCompare(x.cuando)).slice(0, 40);
  }, [lineas, movs, dep]); // eslint-disable-line react-hooks/exhaustive-deps

  const totStock = productos.reduce((a, p) => a + p.stock, 0);
  const totDosif = productos.reduce((a, p) => a + p.dosif, 0);
  const totSal = productos.reduce((a, p) => a + p.salidas, 0);
  const activos = productos.filter((p) => p.dosif > 0).length;

  async function quitarMov(m) {
    if (!window.confirm('¿Quitar este movimiento (' + m.tipo + ' de ' + fmt(m.cant) + ' · ' + m.sku + ')?')) return;
    const { data, error: err } = await supabase.from('dosif_movimientos').delete().eq('id', m.id).select('id');
    if (err || !data || !data.length) { avisar('No se pudo quitar.', true); return; }
    avisar('Movimiento quitado.'); cargar();
  }

  async function exportar() {
    setExportando(true);
    try {
      const ExcelJS = (await import('exceljs')).default;
      const wb = new ExcelJS.Workbook();
      const hoja = (nombre, cols, filas) => {
        const ws = wb.addWorksheet(nombre); ws.columns = cols; filas.forEach((f) => ws.addRow(f));
        const h = ws.getRow(1); h.font = { bold: true, color: { argb: 'FFFFFFFF' } }; h.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF292929' } };
        ws.views = [{ state: 'frozen', ySplit: 1 }]; ws.autoFilter = { from: 'A1', to: String.fromCharCode(64 + cols.length) + '1' };
      };
      hoja('Por día', [{ header: 'Fecha', key: 'f', width: 12 }, { header: 'Quién', key: 'q', width: 16 }, { header: 'SKU', key: 's', width: 24 }, { header: 'Descripción', key: 'd', width: 56 }, { header: 'Cantidad', key: 'c', width: 12 }],
        porDia.flatMap((dd) => dd.operarios.flatMap((o) => o.items.map((it) => ({ f: fechaAR(dd.fecha), q: o.operario, s: it.sku, d: it.descripcion, c: it.cant })))));
      hoja('Stock por producto', [{ header: 'SKU', key: 'sku', width: 24 }, { header: 'Descripción', key: 'd', width: 56 }, { header: 'Dosificado (período)', key: 'a', width: 20 }, { header: 'Salidas (período)', key: 'b', width: 18 }, { header: 'Stock actual', key: 's', width: 14 }, { header: 'Veces dosificado', key: 'v', width: 16 }, { header: 'Última dosificación', key: 'u', width: 20 }],
        productos.map((p) => ({ sku: p.sku, d: p.descripcion, a: p.dosif, b: p.salidas, s: p.stock, v: p.veces, u: p.ultima ? fechaAR(p.ultima.slice(0, 10)) + ' ' + p.ultima.slice(11, 16) : '' })));
      hoja('Por operario', [{ header: 'Operario', key: 'o', width: 18 }, { header: 'Líneas', key: 'l', width: 10 }, { header: 'Unidades', key: 'u', width: 12 }, { header: 'Productos distintos', key: 'p', width: 20 }, { header: 'Última carga', key: 'c', width: 20 }],
        operarios.map((o) => ({ o: o.operario, l: o.lineas, u: o.unidades, p: o.skus.size, c: fechaAR(o.ultima.slice(0, 10)) + ' ' + o.ultima.slice(11, 16) })));
      hoja('Movimientos', [{ header: 'Fecha', key: 'f', width: 12 }, { header: 'Hora', key: 'h', width: 8 }, { header: 'Tipo', key: 't', width: 14 }, { header: 'Depósito', key: 'd', width: 16 }, { header: 'SKU', key: 's', width: 24 }, { header: 'Descripción', key: 'x', width: 46 }, { header: 'Cantidad', key: 'c', width: 12 }, { header: 'Quién', key: 'q', width: 14 }, { header: 'Nota', key: 'n', width: 30 }],
        ultimos.map((u) => ({ f: fechaAR(u.fecha), h: String(u.hora).slice(0, 5), t: u.tipo, d: u.deposito, s: u.sku, x: u.descripcion, c: u.signo * u.cant, q: u.quien, n: u.nota || '' })));
      const buf = await wb.xlsx.writeBuffer();
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
      a.download = 'resumen_dosificado_' + hoyISO() + '.xlsx';
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    } catch (e) { avisar('No se pudo generar el Excel.', true); }
    finally { setExportando(false); }
  }

  return (
    <div className="dz-wrap">
      <div className="dz-panel">
        <div className="dz-label dz-fila"><span>Qué mirar</span><span className={'dz-live' + (vivo ? '' : ' wait')}>{vivo ? '● En vivo' : 'Conectando…'}</span></div>
        <div className="dz-chips">{PERIODOS.map((p) => <button type="button" key={p.id} className={'dz-chip dz-chip-sm' + (per === p.id ? ' on' : '')} onClick={() => setPer(p.id)}>{p.label}</button>)}</div>
        <div className="dz-chips">
          <button type="button" className={'dz-chip dz-chip-sm' + (!dep ? ' on' : '')} onClick={() => setDep('')}>Todos los depósitos</button>
          {cfg.depositos.map((dp) => <button type="button" key={dp} className={'dz-chip dz-chip-sm' + (dep === dp ? ' on' : '')} onClick={() => setDep(dp)}>{dp}</button>)}
        </div>
      </div>

      {error && <div className="dz-card dz-alerta">No se pudo cargar el resumen. <button type="button" className="dz-link" onClick={cargar}>Reintentar</button></div>}
      {!error && lineas === null && <div className="dz-centro-bloque"><Splash texto="Armando el resumen" /></div>}

      {lineas !== null && (
        <>
          <div className="dz-metrics dz-metrics4">
            <div className="dz-metric is-urgent"><span>Stock dosificado</span><strong className={totStock < 0 ? 'dz-neg' : ''}>{fmt(totStock) || 0}</strong></div>
            <div className="dz-metric"><span>Dosificado</span><strong>{fmt(totDosif) || 0}</strong></div>
            <div className="dz-metric"><span>Salidas</span><strong>{fmt(totSal) || 0}</strong></div>
            <div className="dz-metric"><span>Productos</span><strong>{activos}</strong></div>
          </div>
          <div className="dz-fila-btns">
            <button type="button" className="dz-btn dz-primary dz-sm" onClick={() => setModal(true)}>＋ Salida / ajuste</button>
            {admin && <button type="button" className="dz-btn dz-dark dz-sm" disabled={exportando} onClick={exportar}>{exportando ? 'Generando…' : '⬇ Excel'}</button>}
          </div>
          <div className="dz-muted dz-nota">Stock acumulado = dosificado − salidas − mermas + ajustes. Dosificado, salidas y rotación son del período elegido.</div>

          <div>
            <div className="dz-label">Qué se dosificó cada día</div>
            {!porDia.length && <div className="dz-vacio">Sin dosificados en este período.</div>}
            {porDia.slice(0, diasVis).map((dd) => (
              <div key={dd.fecha} className="dz-dia">
                <div className="dz-dia-head"><b>{diaTxt(dd.fecha)}</b><span>{fmt(dd.total)} u.</span></div>
                {dd.operarios.map((o) => (
                  <div key={o.operario} className="dz-dia-op">
                    <div className="dz-dia-quien"><span>{o.operario}</span><span>{fmt(o.total)}</span></div>
                    {o.items.map((it) => (
                      <div key={it.sku} className="dz-dia-item"><b>{fmt(it.cant)}</b><span className="dz-sku">{it.sku}</span><span className="dz-dia-desc" title={it.descripcion}>{it.descripcion}</span></div>
                    ))}
                  </div>
                ))}
              </div>
            ))}
            {porDia.length > diasVis && <button type="button" className="dz-btn dz-secondary dz-sm" onClick={() => setDiasVis((n) => n + 14)}>Ver días anteriores</button>}
          </div>

          <div>
            <div className="dz-label">Stock y rotación por producto ({productos.length})</div>
            <div className="dz-panel dz-panel-fila">
              <input aria-label="Buscar producto" className="dz-inp" placeholder="Buscar kit o producto…" value={txt} onChange={(e) => setTxt(e.target.value)} />
              <select aria-label="Ordenar por" className="dz-inp" value={orden} onChange={(e) => setOrden(e.target.value)}>
                <option value="dosif">Más dosificados</option><option value="salidas">Más salidas (rotan más)</option><option value="stock">Mayor stock</option><option value="ultima">Última dosificación</option>
              </select>
            </div>
            {!productos.length && <div className="dz-vacio">Todavía no hay dosificados en este filtro.</div>}
            {productos.length > 0 && (movil ? (
              <div className="dz-lm">
                {productos.slice(0, 200).map((p) => (
                  <div key={p.sku} className="dz-lm-row">
                    <div className="dz-lm-top"><span className="dz-sku">{p.sku}</span><b className={'dz-lm-num' + (p.stock < 0 ? ' dz-neg' : '')}>{fmt(p.stock)}</b></div>
                    <div className="dz-lm-desc">{p.descripcion}</div>
                    <div className="dz-lm-meta">Dosif. {fmt(p.dosif)} · Salidas {fmt(p.salidas)} · {p.veces} {p.veces === 1 ? 'vez' : 'veces'}{p.ultima ? ' · últ. ' + fechaAR(p.ultima.slice(0, 10)).slice(0, 5) : ''}</div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="dz-tablewrap">
                <table className="dz-table dz-denso">
                  <thead><tr><th>SKU</th><th>Descripción</th><th>Dosificado</th><th>Salidas</th><th>Stock</th><th>Veces</th><th>Última</th></tr></thead>
                  <tbody>
                    {productos.slice(0, 300).map((p) => (
                      <tr key={p.sku}>
                        <td className="dz-sku">{p.sku}</td><td className="dz-td-desc" title={p.descripcion}>{p.descripcion}</td>
                        <td className="dz-num">{fmt(p.dosif)}</td><td className="dz-num">{fmt(p.salidas)}</td>
                        <td className={'dz-num dz-strong' + (p.stock < 0 ? ' dz-neg' : '')}>{fmt(p.stock)}</td><td className="dz-num">{p.veces}</td>
                        <td>{p.ultima ? fechaAR(p.ultima.slice(0, 10)) : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))}
          </div>

          <div>
            <div className="dz-label">Quién dosifica</div>
            {!operarios.length ? <div className="dz-vacio">Sin cargas en este período.</div> : (
              <div className="dz-tablewrap">
                <table className="dz-table dz-table-chica dz-denso">
                  <thead><tr><th>Operario</th><th>Líneas</th><th>Unid.</th><th>Prod.</th><th>Última</th></tr></thead>
                  <tbody>{operarios.map((o) => <tr key={o.operario}><td>{o.operario}</td><td className="dz-num">{o.lineas}</td><td className="dz-num dz-strong">{fmt(o.unidades)}</td><td className="dz-num">{o.skus.size}</td><td>{fechaAR(o.ultima.slice(0, 10)).slice(0, 5)} {o.ultima.slice(11, 16)}</td></tr>)}</tbody>
                </table>
              </div>
            )}
          </div>

          <div>
            <div className="dz-label">Por depósito</div>
            <div className="dz-tablewrap">
              <table className="dz-table dz-table-chica dz-denso">
                <thead><tr><th>Depósito</th><th>Dosificado</th><th>Salidas</th><th>Stock</th></tr></thead>
                <tbody>{depositos.map((dp) => <tr key={dp.deposito}><td>{dp.deposito}</td><td className="dz-num">{fmt(dp.dosif)}</td><td className="dz-num">{fmt(dp.salidas)}</td><td className={'dz-num dz-strong' + (dp.stock < 0 ? ' dz-neg' : '')}>{fmt(dp.stock)}</td></tr>)}</tbody>
              </table>
            </div>
          </div>

          <div>
            <div className="dz-label">Últimos movimientos</div>
            {!ultimos.length ? <div className="dz-vacio">Todavía no hay movimientos.</div> : (movil ? (
              <div className="dz-lm">
                {ultimos.map((u) => (
                  <div key={u.k} className="dz-lm-row">
                    <div className="dz-lm-top"><span><span className={u.tipo === 'Dosificado' ? 'dz-badge' : 'dz-tipo'}>{u.tipo}</span> <span className="dz-sku">{u.sku}</span></span><b className={'dz-lm-num ' + (u.signo < 0 ? 'dz-neg' : 'dz-pos')}>{u.signo < 0 ? '−' : '+'}{fmt(u.cant)}</b></div>
                    <div className="dz-lm-desc">{u.descripcion}{u.nota ? ' · ' + u.nota : ''}</div>
                    <div className="dz-lm-meta">{fechaAR(u.fecha).slice(0, 5)} {String(u.hora).slice(0, 5)} · {u.quien || '—'} · {u.deposito}{u.id ? <button type="button" className="dz-link dz-link-chico" onClick={() => quitarMov(u)}>Quitar</button> : null}</div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="dz-tablewrap">
                <table className="dz-table dz-denso">
                  <thead><tr><th>Fecha</th><th>Tipo</th><th>Depósito</th><th>SKU</th><th>Descripción</th><th>Cant.</th><th>Quién</th><th></th></tr></thead>
                  <tbody>
                    {ultimos.map((u) => (
                      <tr key={u.k}>
                        <td>{fechaAR(u.fecha)} {String(u.hora).slice(0, 5)}</td>
                        <td>{u.tipo === 'Dosificado' ? <span className="dz-badge">Dosificado</span> : u.tipo}</td>
                        <td>{u.deposito}</td><td className="dz-sku">{u.sku}</td>
                        <td className="dz-td-desc" title={u.descripcion + (u.nota ? ' · ' + u.nota : '')}>{u.descripcion}{u.nota ? <span className="dz-muted"> · {u.nota}</span> : null}</td>
                        <td className={'dz-num dz-strong ' + (u.signo < 0 ? 'dz-neg' : 'dz-pos')}>{u.signo < 0 ? '−' : '+'}{fmt(u.cant)}</td><td>{u.quien}</td>
                        <td>{u.id ? <button type="button" className="dz-link" onClick={() => quitarMov(u)}>Quitar</button> : null}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))}
          </div>
        </>
      )}

      {modal && <MovimientoModal catalogo={catalogo} cfg={cfg} depInicial={dep} avisar={avisar} onCerrar={() => setModal(false)} onGuardado={() => { setModal(false); cargar(); }} />}
    </div>
  );
}


function MovimientoModal({ catalogo, cfg, depInicial, avisar, onCerrar, onGuardado }) {
  const [tipo, setTipo] = useState('salida');
  const [deposito, setDeposito] = useState(depInicial || getDeposito() || lsGet('dosif_deposito', '') || '');
  const [operario, setOperario] = useState(getPersona() || lsGet('dosif_operario', '') || '');
  const [prod, setProd] = useState(null);
  const [cant, setCant] = useState('');
  const [nota, setNota] = useState('');
  const [q, setQ, resultados] = useBusqueda(catalogo, false);
  const [guardando, setGuardando] = useState(false);

  async function guardar() {
    if (!deposito) { avisar('Elegí el depósito.', true); return; }
    if (!prod) { avisar('Elegí el producto.', true); return; }
    if (!(num(cant) > 0)) { avisar('Poné una cantidad mayor a 0.', true); return; }
    setGuardando(true);
    const { error } = await supabase.from('dosif_movimientos').insert({ fecha: hoyISO(), hora: horaStr(), deposito, operario: operario || null, sku: prod.sku, descripcion: prod.descripcion, tipo, cantidad: num(cant), nota: nota.trim() || null });
    setGuardando(false);
    if (error) { avisar('No se pudo guardar el movimiento.', true); return; }
    avisar(MOV_TXT[tipo] + ' registrada: ' + fmt(num(cant)) + ' × ' + prod.sku + '.'); onGuardado();
  }

  return (
    <div className="dz-overlay" onClick={onCerrar}>
      <div className="dz-modal dz-modal-ancho" onClick={(e) => e.stopPropagation()}>
        <h2 className="dz-h2">Registrar movimiento de stock</h2>
        <div>
          <div className="dz-label">Tipo</div>
          <div className="dz-chips">{Object.keys(MOV_TXT).map((t) => <button type="button" key={t} className={'dz-chip' + (tipo === t ? ' on' : '')} onClick={() => setTipo(t)}>{MOV_TXT[t]}</button>)}</div>
          <div className="dz-muted" style={{ marginTop: 6 }}>{MOV_AYUDA[tipo]}</div>
        </div>
        <div>
          <div className="dz-label">Depósito</div>
          <div className="dz-chips">{cfg.depositos.map((d) => <button type="button" key={d} className={'dz-chip' + (deposito === d ? ' on' : '')} onClick={() => setDeposito(d)}>{d}</button>)}</div>
        </div>
        <div>
          <div className="dz-label">Producto</div>
          {prod ? (
            <div className="dz-comp-sel"><div className="dz-sku">{prod.sku}</div><div className="dz-desc">{prod.descripcion}</div><button type="button" className="dz-link" onClick={() => { setProd(null); setQ(''); }}>cambiar</button></div>
          ) : (
            <>
              <input aria-label="Buscar producto" className="dz-inp" placeholder="Buscar kit o producto por SKU o nombre…" value={q} onChange={(e) => setQ(e.target.value)} autoCapitalize="characters" />
              {q.trim() && <div className="dz-results">{resultados.map((it) => <div key={it.sku} className="dz-res" onClick={() => { setProd(it); setQ(''); }}><div className="dz-sku">{it.sku}{it.tipo === 'kit' && <span className="dz-badge">KIT</span>}</div><div className="dz-desc">{it.descripcion}</div></div>)}{!resultados.length && <div className="dz-res"><div className="dz-desc">No encontré nada.</div></div>}</div>}
            </>
          )}
        </div>
        <div className="dz-row2">
          <div><div className="dz-label">Cantidad</div><input aria-label="Cantidad" className="dz-inp" inputMode="decimal" placeholder="ej: 10" value={cant} onChange={(e) => setCant(e.target.value)} /></div>
          <div><div className="dz-label">Quién</div><select aria-label="Quién" className="dz-inp" value={operario} onChange={(e) => setOperario(e.target.value)}><option value="">—</option>{cfg.operarios.map((o) => <option key={o}>{o}</option>)}</select></div>
        </div>
        <div><div className="dz-label">Nota (opcional)</div><input aria-label="Nota" className="dz-inp" placeholder="ej: pedido de Mercado Libre, stock inicial…" value={nota} onChange={(e) => setNota(e.target.value)} /></div>
        <button type="button" className="dz-btn dz-primary" disabled={guardando} onClick={guardar}>{guardando ? 'Guardando…' : 'Guardar movimiento'}</button>
        <button type="button" className="dz-btn dz-secondary" onClick={onCerrar}>Cancelar</button>
      </div>
    </div>
  );
}

/* ---------------- importar / exportar kits y productos (CSV) ---------------- */
const FAMILIAS_QUIMICAS = [/^KT-(420|560|618|619|628|710|740)-/, /^KT-GC\d/, /^KT-R29-/, /^KT-REPOXI-/, /^KT-KRYPTON-/, /^KT-PM778-/, /^KIT-4KG-FV/, /^RE-608-/, /^RD-130-/, /^SL-/, /^DP-/, /^MEK-/, /^MH1001/, /^MONOMERO/, /^ADHEPLAST-/, /^DM-010530/, /^KR-IMPERMAX/, /^KR-IMPRIMACION/, /^PG-F/, /^PG-SET/];
const ENVASE_RE = /^(BL|BT|B5C|B2\.|B\d|BAL|BIDON|\d{2}X\d{2}X\d{2}|BOLSA|JERINGA|LIJA|POTE|PC-|SG-|DL-|JE|GU|PAR|PS-|TAPA|PM\d|JUNTA|CAJA|MEZCLADOR|VASOMEDIDOR|TELA|FV-)/i;
const ENVASE_NOM_RE = /BALDE|BOTELLA|BIDON|BIDÓN|CAJA|BOLSA|POTE|JERINGA|LIJA|GUANTE|TAPA|ENVASE|PINCEL|ROLLO|MEZCLADOR|VASO MEDIDOR|TELA|PISTOLA|DILUYENTE DE LIMPIEZA|FIBRA DE/i;

/* unidad y cantidad normalizadas de un componente cuando el archivo no las trae (ej: export de Contabilium) */
function unidadYCant(cod, item, cant) {
  const c = String(cod || ''); const it = String(item || '');
  if (ENVASE_RE.test(c) || ENVASE_NOM_RE.test(it)) return { unidad: 'u', qty: cant };
  const g = (c + ' ' + it).match(/(?:^|[-\s])(\d+(?:[.,]\d+)?)\s?(?:G|GR|GRS)(?![A-Za-z0-9])/i);
  if (g && !/AL 2%/.test(it)) return { unidad: 'kg', qty: Math.round(cant * parseFloat(g[1].replace(',', '.')) / 1000 * 1e5) / 1e5 };
  const cc = (c + ' ' + it).match(/(\d+)\s?CM3/i);
  if (cc) return { unidad: 'L', qty: Math.round(cant * parseInt(cc[1], 10) / 1000 * 1e5) / 1e5 };
  if (/^DM-010530$/.test(c)) return { unidad: 'L', qty: cant };
  return { unidad: 'kg', qty: Math.round(cant * 1e5) / 1e5 };
}

function parseCSV(texto) {
  const t = texto.replace(/^﻿/, '');
  const prim = t.split(/\r?\n/, 1)[0] || '';
  const delim = [';', '\t', ','].map((x) => [x, prim.split(x).length]).sort((a, b) => b[1] - a[1])[0][0];
  const filas = []; let fila = []; let cel = ''; let q = false;
  for (let i = 0; i < t.length; i++) {
    const ch = t[i];
    if (q) { if (ch === '"') { if (t[i + 1] === '"') { cel += '"'; i++; } else q = false; } else cel += ch; }
    else if (ch === '"') q = true;
    else if (ch === delim) { fila.push(cel); cel = ''; }
    else if (ch === '\n' || ch === '\r') { if (ch === '\r' && t[i + 1] === '\n') i++; fila.push(cel); cel = ''; if (fila.some((x) => x.trim() !== '')) filas.push(fila); fila = []; }
    else cel += ch;
  }
  if (cel !== '' || fila.length) { fila.push(cel); if (fila.some((x) => x.trim() !== '')) filas.push(fila); }
  return filas;
}

const hnorm = (s) => norm(s).replace(/[^a-z0-9]/g, '');
const ALIAS = {
  sku: ['sku', 'skukit', 'skucombo', 'codigokit'], nombre: ['nombre', 'nombrekit', 'descripcionkit'], desc: ['descripcion'], tipo: ['tipo'], activo: ['activo', 'estado'],
  csku: ['skucomponente', 'codigo', 'codigocomponente'], cdesc: ['descripcioncomponente', 'item', 'nombrecomponente'], cant: ['cantidad', 'cant'], unidad: ['unidad'],
};
const firmaItem = (x) => JSON.stringify([x.descripcion || '', x.tipo === 'kit' ? 'kit' : 'simple', x.activo !== false, (x.tipo === 'kit' ? (x.componentes || []) : []).map((c) => [c.sku || '', c.descripcion || '', Number(c.kg), unidadDe(c)])]);

function analizarCSV(filas, catalogo, opts) {
  if (!filas || filas.length < 2) return { error: 'El archivo está vacío o solo tiene encabezados.' };
  const H = filas[0].map(hnorm); const idx = {};
  Object.keys(ALIAS).forEach((k) => { idx[k] = H.findIndex((h) => ALIAS[k].includes(h)); });
  if (idx.sku < 0) return { error: 'No encuentro la columna del SKU (tiene que llamarse "SKU" o "SKU Combo").' };
  const conta = H.includes('skucombo');
  const grupos = new Map(); const errores = [];
  filas.slice(1).forEach((f, i) => {
    const fila = i + 2; const g = (k) => (idx[k] >= 0 ? String(f[idx[k]] === undefined ? '' : f[idx[k]]).trim() : '');
    const sku = g('sku');
    if (!sku) { errores.push({ fila, msg: 'Falta el SKU.' }); return; }
    const gr = grupos.get(sku) || { sku, descripcion: '', tipoTxt: '', activoTxt: '', comps: [], filas: [] };
    gr.filas.push(fila);
    gr.descripcion = gr.descripcion || (conta ? (g('nombre') || g('desc')) : (g('desc') || g('nombre')));
    gr.tipoTxt = gr.tipoTxt || g('tipo').toLowerCase(); gr.activoTxt = gr.activoTxt || g('activo').toLowerCase();
    const cs = g('csku'); const cd = g('cdesc');
    if (cs || cd) {
      const cant = num(g('cant'));
      if (!(cant > 0)) { errores.push({ fila, msg: 'Cantidad inválida en el componente ' + (cs || cd) + '.' }); grupos.set(sku, gr); return; }
      let un = g('unidad').toLowerCase(); let qty = cant;
      if (un === 'kgs') un = 'kg';
      if (!['kg', 'l', 'u'].includes(un)) { const r = unidadYCant(cs, cd, cant); un = r.unidad; qty = r.qty; } else if (un === 'l') un = 'L';
      const cat = cs ? catalogo.find((x) => x.sku === cs) : null;
      gr.comps.push({ sku: cs, descripcion: cd || (cat && cat.descripcion) || cs, kg: qty, unidad: un });
    }
    grupos.set(sku, gr);
  });
  const existentes = new Map(catalogo.map((c) => [c.sku, c]));
  const items = []; let ignorados = 0;
  grupos.forEach((gr) => {
    if (opts.soloQuimicos && conta && !FAMILIAS_QUIMICAS.some((re) => re.test(gr.sku))) { ignorados++; return; }
    let comps = gr.comps;
    if (opts.sinEnvases) comps = comps.filter((c) => c.unidad !== 'u');
    let tipo = ['kit'].includes(gr.tipoTxt) ? 'kit' : ['producto', 'simple'].includes(gr.tipoTxt) ? 'simple' : (gr.comps.length ? 'kit' : 'simple');
    if (tipo === 'kit' && !comps.length) { errores.push({ fila: gr.filas[0], msg: gr.sku + ': el kit no tiene químicos (revisá las filas de componentes).' }); return; }
    const activo = !['no', 'false', '0', 'inactivo', 'archivado'].includes(gr.activoTxt);
    const nuevo = { sku: gr.sku, descripcion: gr.descripcion || gr.sku, tipo, activo, componentes: tipo === 'kit' ? comps : null };
    const ex = existentes.get(gr.sku);
    nuevo.estado = !ex ? 'nuevo' : (firmaItem(ex) === firmaItem(nuevo) ? 'igual' : 'cambia');
    if (!gr.descripcion) errores.push({ fila: gr.filas[0], msg: gr.sku + ': sin descripción (se usó el SKU).', aviso: true });
    items.push(nuevo);
  });
  return { items, errores, ignorados, conta, total: grupos.size };
}

function descargarTexto(nombre, texto) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([texto], { type: 'text/csv;charset=utf-8' }));
  a.download = nombre; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}
const celdaCSV = (v) => { const s = String(v === null || v === undefined ? '' : v); return /[";\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
const CAB_CSV = ['SKU', 'Descripción', 'Tipo', 'Activo', 'SKU componente', 'Descripción componente', 'Cantidad', 'Unidad'];
function exportarCatalogoCSV(catalogo) {
  const filas = [];
  catalogo.slice().sort((a, b) => (a.tipo === b.tipo ? a.sku.localeCompare(b.sku) : a.tipo === 'kit' ? -1 : 1)).forEach((c) => {
    const base = [c.sku, c.descripcion, c.tipo === 'kit' ? 'kit' : 'producto', c.activo === false ? 'no' : 'si'];
    if (c.tipo === 'kit' && (c.componentes || []).length) c.componentes.forEach((x) => filas.push([...base, x.sku, x.descripcion, String(x.kg).replace('.', ','), unidadDe(x)]));
    else filas.push([...base, '', '', '', '']);
  });
  descargarTexto('kits_y_productos_' + hoyISO() + '.csv', '﻿' + [CAB_CSV, ...filas].map((r) => r.map(celdaCSV).join(';')).join('\r\n'));
}
function descargarPlantillaCSV() {
  const filas = [
    ['KT-EJEMPLO-10', 'Kit de ejemplo X 10 KG', 'kit', 'si', 'ISO PM TAM', 'ISO PM', '5', 'kg'],
    ['KT-EJEMPLO-10', 'Kit de ejemplo X 10 KG', 'kit', 'si', 'SP-618', '618 SP', '5', 'kg'],
    ['MEK-EJEMPLO', 'Producto simple de ejemplo', 'producto', 'si', '', '', '', ''],
  ];
  descargarTexto('plantilla_kits.csv', '﻿' + [CAB_CSV, ...filas].map((r) => r.map(celdaCSV).join(';')).join('\r\n'));
}

function ImportarCSV({ catalogo, avisar, guardarVarios, onCerrar }) {
  const [filas, setFilas] = useState(null);
  const [nombre, setNombre] = useState('');
  const [sinEnvases, setSinEnvases] = useState(true);
  const [soloQuimicos, setSoloQuimicos] = useState(true);
  const [aplicando, setAplicando] = useState(false);
  const [errLectura, setErrLectura] = useState('');
  const res = useMemo(() => (filas ? analizarCSV(filas, catalogo, { sinEnvases, soloQuimicos }) : null), [filas, catalogo, sinEnvases, soloQuimicos]);

  async function leer(e) {
    const f = e.target.files && e.target.files[0]; e.target.value = '';
    if (!f) return;
    setErrLectura(''); setNombre(f.name);
    try {
      const buf = await f.arrayBuffer();
      let t = new TextDecoder('utf-8').decode(buf);
      if (t.includes('�')) t = new TextDecoder('windows-1252').decode(buf);
      setFilas(parseCSV(t));
    } catch (err) { setErrLectura('No se pudo leer el archivo.'); setFilas(null); }
  }

  const items = res && res.items ? res.items : [];
  const nuevos = items.filter((x) => x.estado === 'nuevo'); const cambian = items.filter((x) => x.estado === 'cambia'); const iguales = items.filter((x) => x.estado === 'igual');
  const errores = res && res.errores ? res.errores.filter((x) => !x.aviso) : []; const avisos = res && res.errores ? res.errores.filter((x) => x.aviso) : [];

  async function aplicar() {
    const aplicables = [...nuevos, ...cambian];
    if (!aplicables.length) return;
    if (!window.confirm('Se van a crear ' + nuevos.length + ' y actualizar ' + cambian.length + ' (las recetas de los que cambian se reemplazan completas). ¿Seguir?')) return;
    setAplicando(true);
    try {
      for (let i = 0; i < aplicables.length; i += 100) {
        const lote = aplicables.slice(i, i + 100).map((x) => ({ sku: x.sku, descripcion: x.descripcion, tipo: x.tipo, componentes: x.componentes, activo: x.activo }));
        const { error } = await supabase.from('dosif_catalogo').upsert(lote);
        if (error) throw error;
      }
      guardarVarios(aplicables.map((x) => ({ sku: x.sku, descripcion: x.descripcion, tipo: x.tipo, componentes: x.componentes, activo: x.activo })));
      avisar('Importado: ' + nuevos.length + ' nuevos y ' + cambian.length + ' actualizados.'); onCerrar();
    } catch (e) { avisar('No se pudo importar. No se aplicó todo: revisá y probá de nuevo.', true); }
    finally { setAplicando(false); }
  }

  return (
    <div className="dz-overlay" onClick={onCerrar}>
      <div className="dz-modal dz-modal-ancho" onClick={(e) => e.stopPropagation()}>
        <h2 className="dz-h2">Importar kits y productos (CSV)</h2>
        <div className="dz-muted">Una fila por componente. Columnas: <b>SKU, Descripción, Tipo, Activo, SKU componente, Descripción componente, Cantidad, Unidad</b>. También acepta el export de <b>Combos de Contabilium</b> tal cual. Mismo SKU = se actualiza; SKU nuevo = se crea.</div>
        <div className="dz-fila-btns">
          <button type="button" className="dz-btn dz-secondary dz-sm" onClick={descargarPlantillaCSV}>Descargar plantilla</button>
          <button type="button" className="dz-btn dz-secondary dz-sm" onClick={() => exportarCatalogoCSV(catalogo)}>Exportar lo actual</button>
        </div>
        <label className="dz-btn dz-dark dz-sm dz-archivo">{filas ? 'Cambiar archivo' : 'Elegir archivo CSV'}<input type="file" accept=".csv,.txt,text/csv" hidden onChange={leer} /></label>
        {errLectura && <div className="dz-card dz-alerta">{errLectura}</div>}
        {nombre && <div className="dz-muted">Archivo: <b>{nombre}</b></div>}
        {res && res.error && <div className="dz-card dz-alerta">{res.error}</div>}
        {res && !res.error && (
          <>
            <label className="dz-check"><input type="checkbox" checked={sinEnvases} onChange={(e) => setSinEnvases(e.target.checked)} /> Ignorar envases y accesorios (cajas, botellas, baldes, bidones…)</label>
            {res.conta && <label className="dz-check"><input type="checkbox" checked={soloQuimicos} onChange={(e) => setSoloQuimicos(e.target.checked)} /> Solo combos químicos (ignora almohadas, baldes, guantes, repuestos…)</label>}
            <div className="dz-metrics dz-metrics4">
              <div className="dz-metric is-urgent"><span>Nuevos</span><strong>{nuevos.length}</strong></div>
              <div className="dz-metric"><span>Cambian</span><strong>{cambian.length}</strong></div>
              <div className="dz-metric"><span>Sin cambios</span><strong>{iguales.length}</strong></div>
              <div className="dz-metric"><span>Con error</span><strong className={errores.length ? 'dz-neg' : ''}>{errores.length}</strong></div>
            </div>
            {res.ignorados > 0 && <div className="dz-muted">{res.ignorados} combos ignorados por no ser químicos.</div>}
            {[...nuevos, ...cambian].length > 0 && (
              <div className="dz-lm dz-lm-corto">
                {[...nuevos, ...cambian].slice(0, 12).map((x) => (
                  <div key={x.sku} className="dz-lm-row"><div className="dz-lm-top"><span className="dz-sku">{x.sku}</span><span className={x.estado === 'nuevo' ? 'dz-badge' : 'dz-tipo'}>{x.estado === 'nuevo' ? 'NUEVO' : 'CAMBIA'}</span></div><div className="dz-lm-desc">{x.descripcion}</div><div className="dz-lm-meta">{x.tipo === 'kit' ? (x.componentes || []).map((c) => c.descripcion + ' ' + qTxt(c.kg, c)).join(' + ') : 'Producto'}</div></div>
                ))}
                {[...nuevos, ...cambian].length > 12 && <div className="dz-lm-row"><div className="dz-lm-desc">… y {[...nuevos, ...cambian].length - 12} más</div></div>}
              </div>
            )}
            {errores.length > 0 && <div className="dz-card dz-alerta dz-errores"><b>Filas con error (no se importan):</b>{errores.slice(0, 8).map((x, i) => <div key={i}>Fila {x.fila}: {x.msg}</div>)}{errores.length > 8 && <div>… y {errores.length - 8} más</div>}</div>}
            {avisos.length > 0 && <div className="dz-muted">{avisos.length} sin descripción (se usa el SKU como nombre).</div>}
            <button type="button" className="dz-btn dz-primary" disabled={aplicando || (!nuevos.length && !cambian.length)} onClick={aplicar}>{aplicando ? 'Importando…' : (nuevos.length + cambian.length ? 'Aplicar ' + (nuevos.length + cambian.length) + ' cambios' : 'No hay nada para aplicar')}</button>
          </>
        )}
        <button type="button" className="dz-btn dz-secondary" onClick={onCerrar}>Cerrar</button>
      </div>
    </div>
  );
}
