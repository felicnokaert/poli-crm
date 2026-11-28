import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { conteoDb } from './conteo-db.js';
import { useConfirm } from '../ConfirmDialog.jsx';
import { usePaged, Pager } from '../Pager.jsx';
import { getPersona, getDeposito, adminDeApp, setIdentidad, personaDeLaApp, elegirPersona } from './identidad.js';
import './dosificado.css';
import './etiquetas.css';
import Devoluciones from './Devoluciones.jsx';
import { cortesDeHoy, equipo } from './tableroCortes.mjs';

// Etiquetas NATIVA de Poliplast App (28/11, Felipe: «una sola app, como Contabilium»). Es la misma pantalla de la app de conteo
// (poliplast-app src/Etiquetas.jsx), con la misma base (etq_*) y la misma lógica: escáner con cámara, pendientes de Mercado
// Libre (función etiquetas-crm), Hecho, Devoluciones y Cortes. Cambia el marco: pestañas de la app arriba (sin barra abajo),
// quién sos y depósito de la app, administrador y «Productividad del equipo» según los permisos de Poliplast App.
const supabase = conteoDb();
let VER_PRODUCTIVIDAD = false; // «Qué ve cada persona» → Etiquetas → Productividad del equipo (lo fija la raíz)
function Splash({ texto }) { return <p className="dz-muted dz-cargando" role="status">{texto}…</p>; }

/* Etiquetas de Mercado Libre: el preparador escanea el código de la etiqueta (= número de envío) y queda registrado.
   La app NO habla con Mercado Libre: consulta al CRM a través de la función de servidor "etiquetas-crm" (la clave nunca llega acá). */

const PERSONAS_FALLBACK = ['Marcos', 'Jeremías', 'Neyen', 'Juan M.', 'Braian', 'Facundo'];
const LS_POR = 'etq_por';
const LS_COLA = 'etq_cola';
const TIPOS_ENVIO = { self_service: 'Flex', cross_docking: 'Colecta', drop_off: 'Punto de despacho', xd_drop_off: 'Punto de despacho', fulfillment: 'Full' };
export const tipoEnvio = (t) => TIPOS_ENVIO[t] || '';
const pad = (n) => String(n).padStart(2, '0');
/* fecha límite de despacho que manda Mercado Libre (vía CRM): texto y urgencia */
export function limiteDespacho(iso, ahora = Date.now()) {
  if (!iso) return null;
  const t = new Date(iso).getTime(); if (!Number.isFinite(t)) return null;
  const d = new Date(t); const h = (t - ahora) / 3600000;
  const mismoDia = new Date(ahora).toDateString() === d.toDateString();
  const txt = (mismoDia ? 'hoy ' : pad(d.getDate()) + '/' + pad(d.getMonth() + 1) + ' ') + pad(d.getHours()) + ':' + pad(d.getMinutes());
  return { txt, nivel: h < 0 ? 'vencido' : h < 2 ? 'urgente' : mismoDia ? 'hoy' : 'ok', t };
}
const hhmm = (iso) => { const d = new Date(iso); return pad(d.getHours()) + ':' + pad(d.getMinutes()); };
const lsGet = (k, fb) => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : fb; } catch (e) { return fb; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* sin storage */ } };

/* El QR trae {"id":"48485907441","t":"lm"}; el código de barras trae solo el número. */
export function extraerEnvio(texto) {
  const t = String(texto || '').trim();
  if (!t) return null;
  const valido = (x) => x.length >= 9 && x.length <= 14; // un envío de ML tiene ~11 dígitos; otros códigos de la etiqueta son más largos
  if (t.startsWith('{')) { try { const j = JSON.parse(t); if (j && j.id && /^\d+$/.test(String(j.id)) && valido(String(j.id))) return String(j.id); } catch (e) { /* sigue */ } }
  return (t.match(/\d+/g) || []).find(valido) || null;
}

export async function crm(body) {
  const { data, error } = await supabase.functions.invoke('etiquetas-crm', { body });
  if (error) {
    // si la función respondió con un cuerpo de error, intentar leerlo; si no, error de red
    try { const j = await error.context.json(); return j; } catch (e) { return { ok: false, error: 'sin conexión' }; }
  }
  return data;
}

async function cargarPersonas() {
  try {
    const { data } = await supabase.from('kv_store').select('value').eq('key', 'config').maybeSingle();
    const ops = data && data.value && Array.isArray(data.value.contadores) ? data.value.contadores.filter(Boolean) : [];
    return ops.length ? ops : PERSONAS_FALLBACK;
  } catch (e) { return PERSONAS_FALLBACK; }
}

async function cargarEscaneos() {
  const desde = new Date(Date.now() - 3 * 86400000).toISOString();
  const { data, error } = await supabase.from('etq_escaneos').select('envio,por,creado,estado,cuenta,lineas,aviso,origen,deposito').gte('creado', desde).order('creado', { ascending: false }).limit(1000);
  if (error) throw error;
  return data;
}

/* sonido corto distinto por resultado (el depósito es ruidoso): OK agudo, duplicado doble, error grave */
let audioCtx = null;
function sonar(tipo) {
  try {
    const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
    audioCtx = audioCtx || new AC(); if (audioCtx.state === 'suspended') audioCtx.resume();
    const notas = tipo === 'ok' ? [[880, 0, 0.12]] : tipo === 'dup' ? [[520, 0, 0.1], [520, 0.16, 0.1]] : [[200, 0, 0.35]];
    notas.forEach(([f, d, l]) => {
      const o = audioCtx.createOscillator(); const g = audioCtx.createGain();
      o.type = tipo === 'ok' ? 'sine' : 'square'; o.frequency.value = f; g.gain.value = 0.15;
      o.connect(g); g.connect(audioCtx.destination); const t0 = audioCtx.currentTime + d; o.start(t0); o.stop(t0 + l);
    });
  } catch (e) { /* sin audio */ }
}
const opcionesSku = (l) => (Array.isArray(l.sku_options) ? l.sku_options.filter(Boolean) : []);
const lineasTxt = (ls) => (ls || []).map((l) => (l.sku || (opcionesSku(l).length > 1 ? 'VARIOS SKU' : 'SIN SKU')) + ' × ' + l.qty).join(' · ');
/* link a la publicación en Mercado Libre a partir del número (MLA123 → articulo.mercadolibre.com.ar/MLA-123) */
const linkML = (item) => { const m = /^([A-Z]{3})(\d+)$/.exec(String(item || '')); return m ? 'https://articulo.mercadolibre.' + (m[1] === 'MLA' ? 'com.ar' : 'com') + '/' + m[1] + '-' + m[2] : null; };

/* seguimiento: por cada producto, SKU × cantidad, título y la publicación con su link */
function Publicaciones({ lineas }) {
  if (!lineas || !lineas.length) return <div className="etq-lineas">Sin datos todavía</div>;
  return (
    <div className="etq-pubs">
      {lineas.map((l, i) => (
        <div key={i} className="etq-pub">
          <div className="etq-lineas"><b>{l.sku || (opcionesSku(l).length > 1 ? 'Varios SKU posibles' : 'SIN SKU')}</b> × {l.qty}</div>
          {!l.sku && opcionesSku(l).length > 1 && <div className="etq-meta">Puede ser: {opcionesSku(l).join(' · ')}</div>}
          {l.description && <div className="etq-tit">{l.description}</div>}
          {l.item_id && (linkML(l.item_id)
            ? <a className="etq-link" href={linkML(l.item_id)} target="_blank" rel="noopener noreferrer">{l.item_id} ↗</a>
            : <span className="etq-meta">{l.item_id}</span>)}
        </div>
      ))}
    </div>
  );
}

const TABS_ETQ = [['escanear', 'Escanear'], ['pendientes', 'Pendientes'], ['historial', 'Hecho'], ['devoluciones', 'Devoluciones'], ['cortes', 'Cortes']];

/** Props: persona y deposito (quién sos de la app), admin ({nombre, pin} de la sesión de la app o null), productividad (permiso), tabs (ids permitidos). */
export default function Etiquetas({ persona = '', deposito = '', admin: adminApp = null, productividad = false, tabs = null, verMails = false }) {
  setIdentidad({ persona, deposito, admin: adminApp });
  VER_PRODUCTIVIDAD = !!productividad;
  const visibles = TABS_ETQ.filter(([id]) => !tabs || tabs.includes(id));
  const [, setElegido] = useState(0); // al elegir «¿Quién sos?» en la pantalla se vuelve a armar
  const [personas, setPersonas] = useState([]);
  const [cambiarQuien, setCambiarQuien] = useState(false);
  useEffect(() => { if (!personaDeLaApp()) cargarPersonas().then(setPersonas); }, []);
  const por = getPersona(); // quién escanea: el de Poliplast App, o el elegido acá si la app no lo sabe
  const [escaneos, setEscaneos] = useState([]);
  const [estado, setEstado] = useState('cargando');
  // link directo: #etiquetas/escanear | pendientes | hecho | devoluciones | cortes
  const [tabLocal, setTab] = useState(() => (visibles[0] || TABS_ETQ[0])[0]);
  const tab = visibles.some(([id]) => id === tabLocal) ? tabLocal : (visibles[0] || TABS_ETQ[0])[0];
  const [ultimo, setUltimo] = useState(null);
  const [cancelPend, setCancelPend] = useState(null);
  // El administrador lo da la sesión de Poliplast App (sin PIN ni botón propio).
  const admin = adminApp || adminDeApp();
  const [toast, setToast] = useState(null);
  const toastT = useRef(null);
  const ocupado = useRef(false);

  const avisar = useCallback((msg, err) => { clearTimeout(toastT.current); setToast({ msg, err }); toastT.current = setTimeout(() => setToast(null), 3200); }, []);

  const recargar = useCallback(async () => { try { setEscaneos(await cargarEscaneos()); } catch (e) { /* se reintenta */ } }, []);

  useEffect(() => {
    cargarEscaneos().then((e) => { setEscaneos(e); setEstado('ok'); }).catch(() => setEstado('error'));
  }, []);
  useEffect(() => { const t = setInterval(recargar, 15000); return () => clearInterval(t); }, [recargar]);

  const porId = useMemo(() => new Map(escaneos.map((e) => [e.envio, e])), [escaneos]);


  /* guarda un envío ya validado; la base decide si era duplicado (dos celulares a la vez) */
  const guardar = useCallback(async (envio, datos, origen, estadoEnvio, at) => {
    // el título y la publicación se guardan para el seguimiento (Pendientes, Hecho y reportes); al preparador no se le muestran al escanear
    const lineas = (datos && datos.lines ? datos.lines : []).map((l) => ({ sku: l.sku || null, qty: l.qty, item_id: l.item_id || null, description: l.description || null, sku_options: opcionesSku(l).length ? opcionesSku(l) : undefined }));
    const faltaSku = lineas.some((l) => !l.sku && opcionesSku(l).length < 2);
    const aviso = !datos ? 'sin_datos' : faltaSku ? 'sku_faltante' : null;
    const { data, error } = await supabase.rpc('etq_escanear', { p_envio: envio, p_por: por, p_estado: estadoEnvio, p_cuenta: datos ? datos.account || null : null, p_lineas: lineas, p_aviso: aviso, p_origen: origen, p_deposito: getDeposito() || null, p_at: at ? new Date(at).toISOString() : null });
    if (error || !data || !data.ok) return { tipo: 'error', envio, msg: 'No se pudo guardar. Probá de nuevo.' };
    if (data.duplicado) return { tipo: 'dup', envio, por: data.por, hora: hhmm(data.creado), estadoPrev: data.estado };
    return { tipo: estadoEnvio === 'cancelado' ? 'cancelado' : 'ok', envio, lineas, aviso, cuenta: datos ? datos.account : null };
  }, [por]);

  /* flujo completo de un escaneo (cámara, manual o masivo) */
  const procesar = useCallback(async (texto, origen, confirmaCancelado, at) => {
    const envio = extraerEnvio(texto);
    if (!envio) return { tipo: 'error', msg: /\d{6,}/.test(String(texto)) ? 'Este no es el código de envío. Probá con el otro código de la etiqueta.' : 'No reconozco ese código. Tiene que ser el número de envío.' };
    if (!por) return { tipo: 'error', msg: 'Primero elegí quién sos (arriba).' };
    const previo = porId.get(envio);
    if (previo) return { tipo: 'dup', envio, por: previo.por, hora: hhmm(previo.creado), estadoPrev: previo.estado };
    const r = await crm({ ruta: 'lookup', ids: [envio], desc: true });
    if (!r || !r.ok) {
      if (r && r.error === 'limite') return { tipo: 'error', msg: 'Muchas consultas juntas. Esperá un minuto y reintentá.' };
      // sin conexión o el CRM no responde: el escaneo no se pierde, queda en el celular y se manda solo (ver cola)
      return { tipo: 'red', envio, msg: 'No puedo consultar el sistema ahora (' + ((r && r.error) || 'sin conexión') + ').' };
    }
    const s = (r.shipments || [])[0];
    if (s && s.found) {
      if (s.full) return { tipo: 'full', envio, lineas: s.lines };
      if (s.cancelled && !confirmaCancelado) return { tipo: 'pide-cancelado', envio, datos: s, origen };
      return guardar(envio, s, origen, s.cancelled ? 'cancelado' : 'preparado', at);
    }
    // etiqueta nueva que el sistema todavía no tiene: se acepta igual y queda marcada
    return guardar(envio, null, origen, 'preparado', at);
  }, [por, porId, guardar]);

  const escanear = useCallback(async (texto, origen) => {
    if (ocupado.current) return null;
    ocupado.current = true;
    try {
      let r = await procesar(texto, origen);
      if (r.tipo === 'red' && origen !== 'masivo') {
        const cola = lsGet(LS_COLA, []);
        if (!cola.some((c) => c.envio === r.envio)) { cola.push({ envio: r.envio, origen, por, at: Date.now() }); lsSet(LS_COLA, cola); setEnCola(cola.length); }
        r = { tipo: 'cola', envio: r.envio, msg: 'Sin conexión: quedó guardada en este celular y se envía sola apenas vuelva.' };
      }
      if (r.tipo === 'pide-cancelado') setCancelPend(r); else setUltimo({ ...r, t: Date.now() });
      sonar(r.tipo === 'ok' || r.tipo === 'cancelado' ? 'ok' : r.tipo === 'dup' ? 'dup' : r.tipo === 'cola' ? 'dup' : 'err');
      if (r.tipo === 'ok' || r.tipo === 'cancelado') recargar();
      return r;
    } finally { ocupado.current = false; }
  }, [procesar, recargar, por]);

  /* cola sin conexión: reintenta de a uno cada 15 s; lo que ya se guardó o ya estaba se saca de la cola */
  const [enCola, setEnCola] = useState(() => lsGet(LS_COLA, []).length);
  const procesarRef = useRef(procesar); procesarRef.current = procesar;
  useEffect(() => {
    const t = setInterval(async () => {
      const cola = lsGet(LS_COLA, []);
      if (!cola.length || ocupado.current) return;
      ocupado.current = true;
      try {
        const it = cola[0];
        const r = await procesarRef.current(it.envio, it.origen, false, it.at);
        if (r.tipo === 'red') return; // sigue sin conexión
        const resto = lsGet(LS_COLA, []).filter((c) => c.envio !== it.envio);
        lsSet(LS_COLA, resto); setEnCola(resto.length);
        if (r.tipo === 'pide-cancelado') setCancelPend(r); else if (r.tipo === 'ok' || r.tipo === 'cancelado') { avisar('Se envió un escaneo guardado: ' + it.envio); recargar(); }
      } finally { ocupado.current = false; }
    }, 15000);
    return () => clearInterval(t);
  }, [avisar, recargar]);

  /* envíos escaneados que después se cancelaron en Mercado Libre: hay que frenarlos (se consulta cada 2 minutos) */
  const [canceladas, setCanceladas] = useState([]);
  const escRef = useRef(escaneos); escRef.current = escaneos;
  useEffect(() => {
    let vivo = true;
    const revisar = async () => {
      const desde = Date.now() - 36 * 3600000;
      const ids = escRef.current.filter((e) => e.estado === 'preparado' && e.aviso !== 'sin_datos' && new Date(e.creado).getTime() > desde).map((e) => e.envio).slice(0, 150);
      if (!ids.length) { if (vivo) setCanceladas([]); return; }
      const r = await crm({ ruta: 'lookup', ids });
      if (!vivo || !r || !r.shipments) return;
      setCanceladas(r.shipments.filter((s) => s.found && s.cancelled).map((s) => s.id));
    };
    const primero = setTimeout(revisar, 4000);
    const t = setInterval(revisar, 120000);
    return () => { vivo = false; clearTimeout(primero); clearInterval(t); };
  }, []);

  const confirmarCancelado = async () => {
    const c = cancelPend; setCancelPend(null);
    const r = await guardar(c.envio, c.datos, c.origen, 'cancelado');
    setUltimo({ ...r, t: Date.now() }); recargar();
  };

  if (estado === 'cargando') return <section className="panel logi-dosif logi-etq"><Splash texto="Cargando etiquetas" /></section>;
  if (estado === 'error') return <section className="panel logi-dosif logi-etq"><div className="form-notice logi-error">No se pudo cargar Etiquetas. Revisá la conexión y volvé a abrir la pantalla.</div></section>;

  const hoy = new Date(); hoy.setHours(0, 0, 0, 0);
  const deHoy = escaneos.filter((e) => new Date(e.creado) >= hoy);

  return (
    <section className="panel logi-dosif logi-etq etq-root">
      <div className="panel-head">
        <div><span className="eyebrow">Logística · Etiquetas</span><h2>{(TABS_ETQ.find(([id]) => id === tab) || TABS_ETQ[0])[1]}</h2></div>
      </div>
      {visibles.length > 1 && (
        <div className="segmented logi-tabs" role="tablist" aria-label="Etiquetas">
          {visibles.map(([id, l]) => <button type="button" key={id} role="tab" aria-selected={tab === id} className={tab === id ? 'selected' : ''} onClick={() => setTab(id)}>{l}</button>)}
        </div>
      )}
      <div className="dz-wrap">
        {!personaDeLaApp() && por && !cambiarQuien && (
          <div className="dz-panel dz-hdr-res etq-quien"><div className="dz-hdr-txt"><b>{por}</b>{getDeposito() ? <span>· {getDeposito()}</span> : null}</div><button type="button" className="dz-link" onClick={() => setCambiarQuien(true)}>Cambiar</button></div>
        )}
        {!personaDeLaApp() && (!por || cambiarQuien) && (
          <div className="dz-panel etq-quien">
            <div className="dz-label">¿Quién sos?</div>
            <div className="dz-chips">{(personas.length ? personas : PERSONAS_FALLBACK).map((n) => <button type="button" key={n} className={'dz-chip' + (por === n ? ' on' : '')} onClick={() => { elegirPersona(n); setCambiarQuien(false); setElegido((x) => x + 1); }}>{n}</button>)}</div>
          </div>
        )}
        {canceladas.length > 0 && (
          <div className="etq-banner canc" role="alert">
            <b>⚠ Se cancelaron después de escanearse: NO despachar</b>
            {canceladas.map((id) => { const e = porId.get(id); return <div key={id} className="etq-fila"><span className="etq-env">{id}</span><span>{e ? e.por + ' · ' + hhmm(e.creado) : ''}</span></div>; })}
          </div>
        )}
        {enCola > 0 && <div className="etq-banner cola" role="status">📶 {enCola} escaneo{enCola === 1 ? '' : 's'} guardado{enCola === 1 ? '' : 's'} sin conexión: se envían solos apenas vuelva internet.</div>}
        <div key={tab} className="dz-vista">
          {tab === 'escanear' && <Escanear por={por} escanear={escanear} ultimo={ultimo} hoyCant={deHoy.length} cerrarUltimo={() => setUltimo(null)} />}
          {tab === 'pendientes' && <Pendientes porId={porId} escaneos={escaneos} avisar={avisar} />}
          {tab === 'devoluciones' && <Devoluciones avisar={avisar} />}
          {tab === 'cortes' && <Cortes admin={admin} avisar={avisar} verMails={verMails} />}
          {tab === 'historial' &&<Historial por={por} canceladas={canceladas} escaneos={escaneos} admin={admin} recargar={recargar} avisar={avisar} escanear={escanear} />}
        </div>
      </div>

      {cancelPend && (
        <div className="dz-overlay">
          <div className="dz-modal etq-cancel">
            <h2 className="dz-h2">⚠ Envío cancelado</h2>
            <div className="dz-muted">El comprador canceló este envío. No hay que despacharlo.</div>
            <div className="etq-num">{cancelPend.envio}</div>
            <div className="etq-lineas">{lineasTxt(cancelPend.datos.lines)}</div>
            <button type="button" className="dz-btn dz-primary" onClick={confirmarCancelado}>Confirmo: cancelado</button>
            <button type="button" className="dz-btn dz-secondary" onClick={() => setCancelPend(null)}>Volver</button>
          </div>
        </div>
      )}

      {toast && <div className={'dz-toast' + (toast.err ? ' err' : '')} role="status">{toast.msg}</div>}
    </section>
  );
}

/* ---------------- pantalla: escanear ---------------- */
function Escanear({ por, escanear, ultimo, hoyCant, cerrarUltimo }) {
  const [camara, setCamara] = useState(false);
  const [manual, setManual] = useState('');
  const [ocup, setOcup] = useState(false);

  const enviarManual = async (e) => {
    e.preventDefault();
    const t = manual.trim(); if (!t) return;
    setOcup(true); const r = await escanear(t, 'manual'); setOcup(false);
    if (r && (r.tipo === 'ok' || r.tipo === 'cancelado' || r.tipo === 'dup')) setManual('');
  };
  const alLeer = useCallback(async (texto) => { await escanear(texto, 'camara'); }, [escanear]);

  return (
    <div className="dz-wrap etq-pad0">
      <div className="dz-panel">
        <div className="etq-hoy"><b>{hoyCant}</b> escaneadas hoy</div>
        {camara
          ? <Camara onLeer={alLeer} onCerrar={() => setCamara(false)} />
          : <button type="button" className="dz-btn dz-primary etq-cam-btn" disabled={!por} onClick={() => setCamara(true)}>📷 Escanear con la cámara</button>}
        <form className="etq-manual" onSubmit={enviarManual}>
          <input className="dz-inp" inputMode="numeric" autoComplete="off" placeholder="o escribí el N° de envío" aria-label="Número de envío" value={manual} onChange={(e) => setManual(e.target.value)} />
          <button type="submit" className="dz-btn dz-secondary etq-ok" disabled={ocup || !por}>{ocup ? '…' : 'Cargar'}</button>
        </form>
        {!por && <div className="dz-muted">Elegí quién sos arriba para empezar.</div>}
      </div>
      {ultimo && <Resultado r={ultimo} cerrar={cerrarUltimo} />}
    </div>
  );
}

function Resultado({ r, cerrar }) {
  const tipos = {
    ok: { cls: 'ok', tit: '✓ Cargada', },
    cancelado: { cls: 'warn', tit: '⚠ Cancelado confirmado' },
    dup: { cls: 'dup', tit: 'Ya estaba escaneada' },
    full: { cls: 'warn', tit: 'Es Full: no va en este despacho' },
    cola: { cls: 'warn', tit: '📶 Guardada sin conexión' },
    error: { cls: 'err', tit: 'No se pudo' },
  };
  const t = tipos[r.tipo] || tipos.error;
  return (
    <div className={'etq-res ' + t.cls} role="status" onClick={cerrar}>
      <div className="etq-res-tit">{t.tit}</div>
      {r.envio && <div className="etq-num">{r.envio}</div>}
      {r.tipo === 'dup' && <div className="etq-lineas">La escaneó {r.por} a las {r.hora}. No se suma de nuevo.{r.estadoPrev === 'cancelado' ? ' (estaba cancelada)' : ''}</div>}
      {r.lineas && r.lineas.length > 0 && <div className="etq-lineas">{lineasTxt(r.lineas)}</div>}
      {r.aviso === 'sku_faltante' && <div className="etq-alerta">Falta el SKU en Mercado Libre. Avisá a Diego.</div>}
      {r.aviso === 'sin_datos' && <div className="etq-alerta">Etiqueta nueva: el sistema todavía no la tiene. Quedó guardada igual.</div>}
      {r.msg && <div className="etq-lineas">{r.msg}</div>}
    </div>
  );
}

/* ---------------- cámara: BarcodeDetector del celular; si no existe, ZXing cargado recién cuando hace falta ---------------- */
export function Camara({ onLeer, onCerrar }) {
  const videoRef = useRef(null);
  const [error, setError] = useState('');
  const ultimo = useRef({ t: '', at: 0 });
  const leer = useRef(onLeer); leer.current = onLeer;

  useEffect(() => {
    let parar = false; let stream = null; let ctrlZx = null; let raf = 0;
    const lectura = (txt) => {
      const ahora = Date.now();
      if (ultimo.current.t === txt && ahora - ultimo.current.at < 4000) return; // el mismo código a la vista no se repite
      ultimo.current = { t: txt, at: ahora };
      if (navigator.vibrate) navigator.vibrate(60);
      leer.current(txt);
    };
    (async () => {
      try {
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) { setError('Este navegador no permite usar la cámara. Cargá el número a mano.'); return; }
        if ('BarcodeDetector' in window) {
          const det = new window.BarcodeDetector({ formats: ['qr_code', 'code_128', 'code_39', 'ean_13', 'itf', 'codabar'] });
          stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false });
          if (parar) { stream.getTracks().forEach((t) => t.stop()); return; }
          const v = videoRef.current; v.srcObject = stream; await v.play();
          const ciclo = async () => {
            if (parar) return;
            try { const codes = await det.detect(v); if (codes.length) lectura(codes[0].rawValue); } catch (e) { /* frame sin código */ }
            raf = setTimeout(ciclo, 180);
          };
          ciclo();
        } else {
          const { BrowserMultiFormatReader } = await import('@zxing/browser');
          const lector = new BrowserMultiFormatReader();
          ctrlZx = await lector.decodeFromConstraints({ video: { facingMode: { ideal: 'environment' } }, audio: false }, videoRef.current, (res) => { if (res) lectura(res.getText()); });
          if (parar) ctrlZx.stop();
        }
      } catch (e) {
        setError(e && e.name === 'NotAllowedError' ? 'Permití el uso de la cámara en el navegador, o cargá el número a mano.' : 'No pude abrir la cámara. Cargá el número a mano.');
      }
    })();
    return () => { parar = true; clearTimeout(raf); if (stream) stream.getTracks().forEach((t) => t.stop()); if (ctrlZx) ctrlZx.stop(); };
  }, []);

  return (
    <div className="etq-camara">
      {error ? <div className="dz-card dz-alerta">{error}</div> : <video ref={videoRef} playsInline muted className="etq-video" />}
      {!error && <div className="etq-mira" aria-hidden="true" />}
      <button type="button" className="dz-btn dz-secondary" onClick={onCerrar}>Cerrar cámara</button>
    </div>
  );
}

/* ---------------- pantalla: pendientes (lo que el CRM dice que está listo y aún no se escaneó) ---------------- */
function Pendientes({ porId, escaneos, avisar }) {
  const [datos, setDatos] = useState(null);
  const [err, setErr] = useState('');
  const [act, setAct] = useState(null);
  const [filtroTipo, setFiltroTipo] = useState('');
  const cargar = useCallback(async () => {
    const r = await crm({ ruta: 'pending' });
    if (r && r.ok) { setDatos(r.shipments || []); setErr(''); setAct(new Date()); } else { setErr('No puedo consultar el sistema ahora.'); }
  }, []);
  useEffect(() => { cargar(); const t = setInterval(cargar, 60000); return () => clearInterval(t); }, [cargar]);

  // títulos de los pendientes (una consulta con descripción, solo para los que todavía no se tienen)
  const [descs, setDescs] = useState({});
  const pedidos = useRef(new Set());
  useEffect(() => {
    if (!datos) return;
    const ids = datos.filter((s) => !s.full && !s.cancelled && !porId.has(s.id) && !pedidos.current.has(s.id)).map((s) => s.id).slice(0, 150);
    if (!ids.length) return;
    ids.forEach((i) => pedidos.current.add(i));
    crm({ ruta: 'lookup', ids, desc: true }).then((r) => {
      if (!r || !r.shipments) { ids.forEach((i) => pedidos.current.delete(i)); return; }
      setDescs((d) => { const n = { ...d }; r.shipments.forEach((s) => { if (s.lines) n[s.id] = s.lines; }); return n; });
    });
  }, [datos, porId]);

  if (!datos && !err) return <div className="dz-centro-bloque"><Splash texto="Consultando pendientes" /></div>;
  const reales = (datos || []).filter((s) => !s.full && !s.cancelled);
  // los más urgentes primero (fecha límite de despacho de Mercado Libre); sin fecha, al final
  const todasFaltan = reales.filter((s) => !porId.has(s.id)).sort((a, b) => (limiteDespacho(a.dispatch_by)?.t ?? Infinity) - (limiteDespacho(b.dispatch_by)?.t ?? Infinity));
  const tiposPresentes = [...new Set(todasFaltan.map((s) => s.logistic_type).filter((t) => tipoEnvio(t)))];
  const faltan = filtroTipo ? todasFaltan.filter((s) => s.logistic_type === filtroTipo) : todasFaltan;
  const vencidas = todasFaltan.filter((s) => limiteDespacho(s.dispatch_by)?.nivel === 'vencido').length;
  const hechas = reales.length - faltan.length;
  const sinSku = [...(datos || []).filter((s) => (s.lines || []).some((l) => !l.sku && opcionesSku(l).length < 2)), ...escaneos.filter((e) => e.aviso === 'sku_faltante').map((e) => ({ id: e.envio, lines: e.lineas, cuenta: e.cuenta }))];
  const vistos = new Set(); const alertasSku = sinSku.filter((s) => (vistos.has(s.id) ? false : (vistos.add(s.id), true)));

  return (
    <div className="dz-wrap etq-pad0">
      {err && <div className="dz-card dz-alerta">{err} <button type="button" className="dz-link" onClick={cargar}>Reintentar</button></div>}
      <div className="etq-resumen">
        <div className="dz-metric etq-m"><div className="etq-m-n">{todasFaltan.length}</div><div className="dz-label">Pendientes</div></div>
        <div className="dz-metric etq-m"><div className="etq-m-n ok">{hechas}</div><div className="dz-label">Ya escaneadas</div></div>
      </div>
      {alertasSku.length > 0 && (
        <div className="dz-card etq-alerta-box">
          <div className="dz-label">⚠ Falta el SKU en Mercado Libre</div>
          {alertasSku.map((s) => (
            <div key={s.id} className="etq-fila"><span className="etq-env">{s.id}</span><span>{(s.lines || []).filter((l) => !l.sku && opcionesSku(l).length < 2).map((l) => (l.item_id || 'publicación') + ' × ' + l.qty).join(' · ')}</span></div>
          ))}
        </div>
      )}
      {vencidas > 0 && <div className="dz-card etq-alerta-box" role="alert"><b>⏰ {vencidas} {vencidas === 1 ? 'envío pasó' : 'envíos pasaron'} la hora límite de despacho.</b> Escanealos primero.</div>}
      {tiposPresentes.length > 1 && (
        <div className="dz-chips">
          <button type="button" className={'dz-chip dz-chip-sm' + (!filtroTipo ? ' on' : '')} onClick={() => setFiltroTipo('')}>Todos · {todasFaltan.length}</button>
          {tiposPresentes.map((t) => <button type="button" key={t} className={'dz-chip dz-chip-sm' + (filtroTipo === t ? ' on' : '')} onClick={() => setFiltroTipo(t)}>{tipoEnvio(t)} · {todasFaltan.filter((s) => s.logistic_type === t).length}</button>)}
        </div>
      )}
      <div className="dz-label">Faltan escanear · los más urgentes primero</div>
      {!faltan.length ? <div className="dz-vacio">No hay nada pendiente. 🎉</div> : (
        <div className="dz-lista">
          {faltan.map((s) => (
            <div key={s.id} className="dz-card etq-item">
              {limiteDespacho(s.dispatch_by) && <div className={'etq-limite ' + limiteDespacho(s.dispatch_by).nivel}>{limiteDespacho(s.dispatch_by).nivel === 'vencido' ? '⏰ Venció: ' : 'Despachar antes de '}{limiteDespacho(s.dispatch_by).txt}</div>}
              <div className="etq-item-top"><span className="etq-env">{s.id}</span><span>{tipoEnvio(s.logistic_type) && <span className="etq-emp etq-log">{tipoEnvio(s.logistic_type)}</span>} {s.account && <span className="etq-emp">{s.account}</span>}</span></div>
              <Publicaciones lineas={descs[s.id] || s.lines} />
            </div>
          ))}
        </div>
      )}
      {act && <div className="etq-meta" role="status">Última actualización: {act.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}</div>}
      <button type="button" className="dz-btn dz-secondary" onClick={() => { cargar(); avisar('Actualizado.'); }}>Actualizar ahora</button>
    </div>
  );
}

/* ---------------- pantalla: hecho (historial) + carga masiva de respaldo + borrado de administrador ---------------- */
function Historial({ por, canceladas, escaneos, admin, recargar, avisar, escanear }) {
  const confirm = useConfirm();
  const [masivo, setMasivo] = useState('');
  const [prog, setProg] = useState(null);
  const [filtro, setFiltro] = useState('');

  const cargarMasivo = async () => {
    const todos = masivo.match(/\d+/g) || [];
    const ids = [...new Set(todos.filter((x) => x.length >= 9 && x.length <= 14))];
    if (!ids.length) { avisar('No encontré números de envío.', true); return; }
    if (ids.length < todos.length) avisar((todos.length - ids.length) + ' número(s) ignorado(s): no tienen largo de envío.', true);
    let ok = 0; let dup = 0; let mal = 0; setProg({ n: 0, de: ids.length });
    for (let i = 0; i < ids.length; i++) {
      // eslint-disable-next-line no-await-in-loop
      const r = await escanear(ids[i], 'masivo');
      if (r && (r.tipo === 'ok' || r.tipo === 'cancelado')) ok++; else if (r && r.tipo === 'dup') dup++; else mal++;
      setProg({ n: i + 1, de: ids.length });
    }
    setProg(null); setMasivo(''); recargar();
    avisar(ok + ' cargadas' + (dup ? ' · ' + dup + ' ya estaban' : '') + (mal ? ' · ' + mal + ' con problemas' : ''), mal > 0);
  };

  const borrar = async (envio) => {
    if (!await confirm('¿Borrar el escaneo ' + envio + '?')) return;
    const { data } = await supabase.rpc('etq_borrar', { p_nombre: admin.nombre, p_pin: admin.pin, p_envio: envio });
    if (data === true) { avisar('Borrado.'); recargar(); } else avisar('No se pudo borrar.', true);
  };

  const deshacer = async (envio) => {
    if (!await confirm('¿Deshacer el escaneo ' + envio + '?')) return;
    const { data } = await supabase.rpc('etq_deshacer', { p_envio: envio, p_por: por });
    if (data === true) { avisar('Deshecho.'); recargar(); } else avisar('Ya pasaron más de 10 minutos: pedile a un administrador.', true);
  };

  const lista = escaneos.filter((e) => !filtro || e.envio.includes(filtro) || (e.por || '').toLowerCase().includes(filtro.toLowerCase()));
  const listaPag = usePaged(lista, 25, filtro);
  return (
    <div className="dz-wrap etq-pad0">
      <div className="dz-panel">
        <div className="dz-label">Carga masiva (respaldo)</div>
        <div className="dz-muted">Pegá varios números de envío (uno por línea, o separados por coma). Se procesan de a uno, con las mismas reglas.</div>
        <textarea className="dz-inp etq-area" rows={4} placeholder={'48485907441\n48577159608'} value={masivo} onChange={(e) => setMasivo(e.target.value)} />
        <button type="button" className="dz-btn dz-primary" disabled={!!prog || !masivo.trim()} onClick={cargarMasivo}>{prog ? 'Cargando ' + prog.n + ' de ' + prog.de + '…' : 'Cargar lista'}</button>
      </div>
      <div className="etq-admin-fila">
        <input className="dz-inp" placeholder="Buscar por número o nombre" aria-label="Buscar" value={filtro} onChange={(e) => setFiltro(e.target.value)} />
      </div>
      {!lista.length ? <div className="dz-vacio">Todavía no hay escaneos.</div> : (
        <div className="dz-lista">
          {listaPag.rows.map((e) => (
            <div key={e.envio} className={'dz-card etq-item' + (e.estado === 'cancelado' || canceladas.includes(e.envio) ? ' canc' : '')}>
              <div className="etq-item-top"><span className="etq-env">{e.envio}</span><span className="etq-meta">{e.por} · {hhmm(e.creado)}{e.estado === 'cancelado' ? ' · CANCELADO' : ''}</span></div>
              <div>{e.cuenta && <span className="etq-emp">{e.cuenta}</span>} {e.deposito && <span className="etq-emp">{e.deposito}</span>}</div>
              <Publicaciones lineas={e.lineas} />
              {e.aviso === 'sku_faltante' && <div className="etq-alerta">Falta SKU en Mercado Libre</div>}
              {canceladas.includes(e.envio) && <div className="etq-alerta">⚠ Cancelada después de escanearse: no despachar</div>}
              {!admin && e.por === por && Date.now() - new Date(e.creado).getTime() < 10 * 60000 && <button type="button" className="dz-link dz-link-chico" onClick={() => deshacer(e.envio)}>Deshacer (me equivoqué)</button>}
              {admin && <button type="button" className="dz-link dz-link-chico" onClick={() => borrar(e.envio)}>Borrar</button>}
            </div>
          ))}
        </div>
      )}
      <Pager paged={listaPag} label="escaneos" />
    </div>
  );
}

/* ---------------- pantalla: cortes y calendario (los edita un administrador) ---------------- */
const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
const ESTADOS = { '': 'Normal', con: 'Con corte', sin: 'Sin corte', feriado: 'Feriado' };
const SIGUIENTE = { '': 'con', con: 'sin', sin: 'feriado', feriado: '' };

/* 27/11 (idea de la reunión de Diego): «Cortes de hoy» con colores y «Productividad del equipo». Lo ven todos; se actualiza solo cada minuto. */
function Tablero({ cortes, admin }) {
  const [esc, setEsc] = useState(null);
  const [pend, setPend] = useState(null);
  const [ahora, setAhora] = useState(() => new Date());
  const cargar = useCallback(async () => {
    const desde = new Date(Date.now() - 8 * 86400000).toISOString();
    const { data } = await supabase.from('etq_escaneos').select('envio,por,creado,estado,lineas').gte('creado', desde).order('creado', { ascending: false }).limit(5000);
    const lista = data || [];
    setEsc(lista); setAhora(new Date());
    const r = await crm({ ruta: 'pending' });
    if (r && r.ok) { const hechos = new Set(lista.map((e) => e.envio)); setPend((r.shipments || []).filter((x) => !x.full && !x.cancelled && !hechos.has(x.id)).length); }
  }, []);
  useEffect(() => { cargar(); const t = setInterval(cargar, 60000); return () => clearInterval(t); }, [cargar]);
  if (!esc) return <div className="dz-panel"><div className="dz-muted">Cargando el tablero…</div></div>;
  const c = cortesDeHoy(esc, cortes, ahora, pend);
  const eq = equipo(esc, ahora);
  const ETQ = { cerrado: ['etq-tc-ok', '✓ Cerrado'], ahora: ['etq-tc-ahora', '● En preparación'], proximo: ['etq-tc-prox', 'Próximo'] };
  return (
    <>
      <div className="dz-panel">
        <div className="dz-label">Hoy</div>
        <div className="etq-kpis">
          <div><b>{c.total.envios}</b><span>Etiquetas escaneadas</span></div>
          <div><b>{c.total.unidades}</b><span>Unidades</span></div>
          <div className={pend ? 'mal' : ''}><b>{pend === null ? '…' : pend}</b><span>Falta escanear</span></div>
        </div>
        {c.total.avance !== null && <div className="etq-barra"><i style={{ width: c.total.avance + '%' }} className={c.total.avance === 100 ? 'ok' : ''} /></div>}
        {c.total.avance !== null && <div className="dz-muted">{c.total.envios} de {c.total.envios + (pend || 0)} etiquetas de hoy ({c.total.avance}%)</div>}
      </div>
      <div className="dz-panel">
        <div className="dz-label">Cortes de hoy</div>
        <div className="etq-tcortes">
          {c.tarjetas.map((t) => (
            <div key={t.hora} className={'etq-tc ' + ETQ[t.estado][0]}>
              <div className="etq-tc-top"><b>Corte {pad(t.hora)}:00</b><span>{ETQ[t.estado][1]}</span></div>
              <div className="etq-tc-num"><div><b>{t.envios}</b><span>etiquetas</span></div><div><b>{t.unidades}</b><span>unidades</span></div></div>
              {t.estado === 'ahora' && t.pendientes !== null && <div className={'etq-tc-pend' + (t.pendientes ? ' mal' : '')}>{t.pendientes ? '⏳ ' + t.pendientes + ' sin escanear' : '✓ Nada pendiente'}</div>}
            </div>
          ))}
          {c.despues.envios > 0 && <div className="etq-tc etq-tc-prox"><div className="etq-tc-top"><b>Después del último corte</b></div><div className="etq-tc-num"><div><b>{c.despues.envios}</b><span>etiquetas</span></div><div><b>{c.despues.unidades}</b><span>unidades</span></div></div></div>}
        </div>
      </div>
      {/* 27/11 (Felipe): productividad por persona, nunca para operarios (ver verProductividad en tableroCortes.mjs) */}
      {VER_PRODUCTIVIDAD && <div className="dz-panel">
        <div className="dz-label">Productividad del equipo</div>
        <div className="dz-muted">Etiquetas escaneadas por cada uno. Semana = hoy y los 4 días hábiles anteriores.</div>
        {!eq.length ? <div className="dz-muted">Todavía no hay escaneos esta semana.</div> : (
          <table className="etq-equipo">
            <thead><tr><th>Preparador</th><th>Hoy</th><th>Semana</th><th className="etq-eq-bar">Participación</th></tr></thead>
            <tbody>{eq.map((f) => (
              <tr key={f.nombre}>
                <td><b>{f.nombre}</b></td>
                <td>{f.enviosHoy} <small>({f.unidadesHoy} u.)</small></td>
                <td>{f.enviosSemana} <small>({f.unidadesSemana} u.)</small></td>
                <td className="etq-eq-bar"><div className="etq-barra chica"><i style={{ width: f.barra + '%' }} /></div><small>{f.participacion}%</small></td>
              </tr>
            ))}</tbody>
          </table>
        )}
      </div>}
    </>
  );
}
const iso = (y, m, d) => y + '-' + pad(m + 1) + '-' + pad(d);

function Cortes({ admin, avisar, verMails = false }) {
  const [cortes, setCortes] = useState(null);
  const [cal, setCal] = useState({});
  const [mes, setMes] = useState(() => { const h = new Date(); return { y: h.getFullYear(), m: h.getMonth() }; });
  const [nuevo, setNuevo] = useState('');

  useEffect(() => {
    supabase.from('etq_config').select('key,value').then(({ data }) => {
      const c = {}; (data || []).forEach((r) => { c[r.key] = r.value; });
      setCortes(Array.isArray(c.cortes) ? c.cortes : [8, 10, 12]);
      setCal(c.calendario && typeof c.calendario === 'object' ? c.calendario : {});
    });
  }, []);

  const guardar = async (key, value, anterior, setear) => {
    setear(value);
    const { data } = await supabase.rpc('etq_guardar_config', { p_nombre: admin.nombre, p_pin: admin.pin, p_key: key, p_value: value });
    if (data !== true) { setear(anterior); avisar('No se pudo guardar.', true); } else avisar('Guardado.');
  };
  const agregarCorte = () => {
    const h = Number(nuevo);
    if (!Number.isInteger(h) || h < 0 || h > 23) { avisar('Poné una hora entre 0 y 23.', true); return; }
    if (cortes.includes(h)) { setNuevo(''); return; }
    guardar('cortes', [...cortes, h].sort((a, b) => a - b), cortes, setCortes); setNuevo('');
  };
  const quitarCorte = (h) => guardar('cortes', cortes.filter((x) => x !== h), cortes, setCortes);
  const tocarDia = (f) => {
    const sig = SIGUIENTE[cal[f] || ''];
    const nuevoCal = { ...cal }; if (sig) nuevoCal[f] = sig; else delete nuevoCal[f];
    guardar('calendario', nuevoCal, cal, setCal);
  };

  const [envios, setEnvios] = useState([]);
  const [trabajando, setTrabajando] = useState(false);
  const cargarEnvios = useCallback(async () => {
    const { data } = await supabase.from('etq_cortes').select('slot,tipo,creado,ok,error,asunto').order('creado', { ascending: false }).limit(10);
    setEnvios(data || []);
  }, []);
  useEffect(() => { if (verMails) cargarEnvios(); }, [cargarEnvios, verMails]);
  const llamarCorte = async (body, okMsg) => {
    setTrabajando(true);
    const { data, error } = await supabase.functions.invoke('etiquetas-corte', { body: { ...body, nombre: admin.nombre, pin: admin.pin } });
    setTrabajando(false);
    if (error || !data || !data.ok) avisar('No se pudo enviar' + (data && data.error ? ': ' + data.error : '.'), true); else avisar(okMsg);
    cargarEnvios();
  };

  if (!cortes) return <div className="dz-centro-bloque"><Splash texto="Cargando cortes" /></div>;
  const tablero = <Tablero cortes={cortes} admin={admin} />;
  const primero = new Date(mes.y, mes.m, 1);
  const offset = (primero.getDay() + 6) % 7; // semana desde el lunes
  const dias = new Date(mes.y, mes.m + 1, 0).getDate();
  const celdas = [...Array(offset).fill(null), ...Array.from({ length: dias }, (_, i) => i + 1)];
  const claseDia = (f, dow) => { const s = cal[f]; if (s) return s; return dow === 0 || dow === 6 ? 'finde' : ''; };

  return (
    <div className="dz-wrap etq-pad0">
      {tablero}
      <div className="dz-panel">
        <div className="dz-label">Horarios de corte</div>
        <div className="dz-muted">A cada hora de corte, Diego recibe un mail con lo que falta escanear (solo los días con corte).</div>
        <div className="dz-chips">{cortes.map((h) => <span key={h} className="dz-chip on etq-corte">{pad(h)}:00{admin && <button type="button" aria-label={'Quitar corte de las ' + h} onClick={() => quitarCorte(h)}>✕</button>}</span>)}{!cortes.length && <span className="dz-muted">Sin cortes.</span>}</div>
        {admin && (
          <div className="etq-manual">
            <input className="dz-inp" inputMode="numeric" placeholder="Agregar hora (0 a 23)" aria-label="Nueva hora de corte" value={nuevo} onChange={(e) => setNuevo(e.target.value)} />
            <button type="button" className="dz-btn dz-secondary etq-ok" onClick={agregarCorte}>Agregar</button>
          </div>
        )}
      </div>
      <div className="dz-panel">
        <div className="etq-cal-top">
          <button type="button" className="dz-chip" aria-label="Mes anterior" onClick={() => setMes((x) => (x.m === 0 ? { y: x.y - 1, m: 11 } : { y: x.y, m: x.m - 1 }))}>‹</button>
          <div className="dz-h2">{MESES[mes.m]} {mes.y}</div>
          <button type="button" className="dz-chip" aria-label="Mes siguiente" onClick={() => setMes((x) => (x.m === 11 ? { y: x.y + 1, m: 0 } : { y: x.y, m: x.m + 1 }))}>›</button>
        </div>
        <div className="etq-cal">
          {['L', 'M', 'M', 'J', 'V', 'S', 'D'].map((l, i) => <div key={i} className="etq-cal-h">{l}</div>)}
          {celdas.map((d, i) => {
            if (!d) return <div key={'v' + i} />;
            const f = iso(mes.y, mes.m, d); const dow = new Date(mes.y, mes.m, d).getDay();
            const cls = claseDia(f, dow);
            return <button type="button" key={f} disabled={!admin} className={'etq-dia ' + cls} aria-label={d + ' de ' + MESES[mes.m] + ': ' + (ESTADOS[cal[f] || ''])} onClick={() => tocarDia(f)}>{d}</button>;
          })}
        </div>
        <div className="etq-leyenda">
          <span><i className="etq-dia" /> Normal (lun a vie con corte)</span>
          <span><i className="etq-dia con" /> Con corte</span>
          <span><i className="etq-dia sin" /> Sin corte</span>
          <span><i className="etq-dia feriado" /> Feriado</span>
        </div>
        {admin && <div className="dz-muted">Tocá un día para cambiarlo: Normal → Con corte → Sin corte → Feriado.</div>}
      </div>
      {/* 28/11 (Felipe): solo en la sesión de Diego y solo los últimos 10. */}
      {verMails && <div className="dz-panel">
        <div className="dz-label">Últimos 10 mails que te llegaron</div>
        {!envios.length ? <div className="dz-muted">Todavía no se envió ningún corte.</div> : (
          <div className="dz-lista">
            {envios.map((e) => (
              <div key={e.slot} className={'etq-envio' + (e.ok === false ? ' mal' : '')}>
                <div><div className="etq-envio-t">{e.asunto}</div><div className="etq-meta">{new Date(e.creado).toLocaleString('es-AR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false })} · {e.ok ? 'enviado ✓' : e.ok === false ? 'FALLÓ: ' + (e.error || 'error') : 'pendiente'}</div></div>
                {admin && e.ok !== true && <button type="button" className="dz-btn dz-secondary etq-ok" disabled={trabajando} onClick={() => llamarCorte({ accion: 'reenviar', slot: e.slot }, 'Reenviado.')}>Reenviar</button>}
              </div>
            ))}
          </div>
        )}
        {admin && <button type="button" className="dz-btn dz-secondary" disabled={trabajando} onClick={() => llamarCorte({ accion: 'prueba' }, 'Corte de prueba enviado a Diego.')}>{trabajando ? 'Enviando…' : 'Enviar corte de prueba ahora'}</button>}
      </div>}
    </div>
  );
}

