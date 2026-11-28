import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { conteoDb } from './conteo-db.js';
import { useConfirm } from '../ConfirmDialog.jsx';
import { getPersona, getDeposito } from './identidad.js';

const supabase = conteoDb(); // Devoluciones dentro de Poliplast App (28/11): misma base que la app de conteo
import { Camara, crm } from './Etiquetas.jsx';

/* Devoluciones de Mercado Libre (todas las cuentas), pedido de Diego (25/11).
   1) Quién recibe = la barra de arriba (no se vuelve a preguntar).
   2) Se escanea la etiqueta de vuelta (Correo Argentino, OCA, Full Pack…) y la app trae la devolución de ML: cuenta, comprador, motivo y productos.
   3) Por producto: cuántos llegaron y en qué estado (Buen estado · Mal estado/dañado · Incompleto). Si no está bien: qué tiene + foto.
   4) Todo bien y completo → OK. Si no → «A revisar», lo toma Ventas ecommerce (Brenda y Yuliani), que la marca resuelta.
   Mientras el CRM no tenga la consulta de devoluciones, hay ETIQUETAS DE PRUEBA con datos simulados (se guardan marcadas como prueba). */

import { motivoML, ESTADOS_DEV, TXT_ESTADO, TRANSPORTES, VENTAS_ECOMMERCE, DEMO, numeroEtiqueta, resultadoDev, faltaDev } from './devolucionesLogica.mjs';

async function cargarDev() {
  const desde = new Date(Date.now() - 45 * 86400000).toISOString();
  const { data, error } = await supabase.from('etq_devoluciones').select('*').gte('creado', desde).order('creado', { ascending: false }).limit(300);
  if (error) throw error;
  return data || [];
}

/* foto achicada en el celular (máx. 1600 px, JPG) y subida al bucket «devoluciones» */
async function subirFoto(file) {
  let blob = file;
  try {
    const bmp = await createImageBitmap(file);
    const k = Math.min(1, 1600 / Math.max(bmp.width, bmp.height));
    const cv = document.createElement('canvas'); cv.width = Math.round(bmp.width * k); cv.height = Math.round(bmp.height * k);
    cv.getContext('2d').drawImage(bmp, 0, 0, cv.width, cv.height);
    blob = await new Promise((ok) => cv.toBlob((b) => ok(b || file), 'image/jpeg', 0.82));
  } catch (e) { /* HEIC u otro: se sube como vino */ }
  const id = (crypto.randomUUID ? crypto.randomUUID() : Date.now() + '-' + Math.random().toString(36).slice(2));
  const path = 'fotos/' + new Date().toISOString().slice(0, 10) + '/' + id + '.jpg';
  const { error } = await supabase.storage.from('devoluciones').upload(path, blob, { contentType: blob.type || 'image/jpeg', upsert: false });
  if (error) throw error;
  return supabase.storage.from('devoluciones').getPublicUrl(path).data.publicUrl;
}

const hhmm = (iso) => new Date(iso).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Argentina/Buenos_Aires' });
const fecha = (iso) => new Date(iso).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', timeZone: 'America/Argentina/Buenos_Aires' });
const lineaNueva = () => ({ sku: '', descripcion: '', esperado: null, recibido: 1, estado: '', nota: '' });

export default function Devoluciones({ avisar }) {
  const por = getPersona();
  const deposito = getDeposito();
  const [lista, setLista] = useState(null);
  const [carga, setCarga] = useState(null); // devolución que se está recibiendo
  const [camara, setCamara] = useState(false);
  const [manual, setManual] = useState('');
  const [buscando, setBuscando] = useState(false);
  const [aviso, setAviso] = useState(null); // {tipo, texto}
  const [ver, setVer] = useState('revisar'); // revisar | hoy | todas
  const [resolver, setResolver] = useState(null);

  const recargar = useCallback(async () => { try { setLista(await cargarDev()); } catch (e) { setLista((l) => l || []); } }, []);
  useEffect(() => { recargar(); const t = setInterval(recargar, 20000); return () => clearInterval(t); }, [recargar]);

  const buscar = useCallback(async (texto, origen) => {
    const n = numeroEtiqueta(texto);
    if (!n) { setAviso({ tipo: 'err', texto: 'No reconozco ese código. Escribí el número de la etiqueta.' }); return; }
    setBuscando(true); setAviso(null);
    const r = await crm({ ruta: 'devolucion', id: n });
    setBuscando(false); setCamara(false);
    const demo = DEMO[n];
    if (r && r.ok && r.conectado && r.encontrada && r.devolucion) {
      const d = r.devolucion;
      setCarga({ etiqueta: n, origen: 'ml', leido: origen, transportista: d.carrier || d.transportista || '', cuenta: d.account || d.cuenta || '', comprador: d.buyer || d.comprador || '', motivo: motivoML(d.reason || d.motivo || ''), devolucion_ml: String(d.claim_id || d.id || d.return_id || ''), lineas: (d.lines || d.lineas || []).map((l) => ({ ...lineaNueva(), sku: l.sku || '', descripcion: l.description || l.descripcion || '', esperado: Number(l.qty || l.cantidad || 1), recibido: Number(l.qty || l.cantidad || 1) })), fotos: [], nota: '', prueba: false });
    } else if (demo) {
      setCarga({ etiqueta: n, origen: 'ml', leido: origen, ...demo, lineas: demo.lineas.map((l) => ({ ...lineaNueva(), ...l, recibido: l.esperado })), fotos: [], nota: '', prueba: true });
    } else {
      // no está en ML (o el CRM todavía no tiene la consulta): se carga a mano y va a revisar
      setCarga({ etiqueta: n, origen: 'otra', leido: origen, transportista: '', cuenta: '', comprador: '', motivo: '', devolucion_ml: '', lineas: [lineaNueva()], fotos: [], nota: '', prueba: false,
        explicacion: r && r.ok && r.motivo === 'envio_sin_reclamo' ? 'Es un envío de ' + (r.cuenta || 'Mercado Libre') + ' pero no tiene un reclamo o devolución abierta en Mercado Libre. Cargala a mano: queda «A revisar».' : r && r.ok && r.conectado === false ? 'Todavía no está conectada la búsqueda de devoluciones en Mercado Libre. Cargala a mano: queda «A revisar» para Ventas ecommerce.' : r && r.ok ? 'No encontré esa etiqueta en ninguna cuenta de Mercado Libre. Cargala a mano: queda «A revisar».' : 'No pude consultar Mercado Libre ahora. Cargala a mano: queda «A revisar».' });
    }
  }, []);

  const alLeer = useCallback((t) => { if (!buscando) buscar(t, 'camara'); }, [buscar, buscando]);

  const hoy = new Date(); hoy.setHours(0, 0, 0, 0);
  const l = lista || [];
  const aRevisar = l.filter((d) => d.resultado === 'revisar' && !d.resuelto_at);
  const deHoy = l.filter((d) => new Date(d.creado) >= hoy);
  const mostrar = ver === 'revisar' ? aRevisar : ver === 'hoy' ? deHoy : l;

  if (carga) return <Recibir carga={carga} setCarga={setCarga} por={por} deposito={deposito} alGuardar={(r) => { setCarga(null); setAviso({ tipo: r.resultado === 'ok' ? 'ok' : 'warn', texto: r.resultado === 'ok' ? '✓ Devolución OK: guardada.' : 'Guardada como «A revisar»: la toma Ventas ecommerce (' + VENTAS_ECOMMERCE + ').' }); recargar(); }} />;

  return (
    <div className="dz-wrap etq-pad0">
      <div className="dz-panel dev-panel">
        <div className="dev-recibe">Recibe: <b>{por || '—'}</b>{deposito ? ' · ' + deposito : ''}</div>
        {!por && <div className="dz-muted">Elegí quién sos arriba (en Escanear) para empezar.</div>}
        {camara
          ? <Camara onLeer={alLeer} onCerrar={() => setCamara(false)} />
          : <button type="button" className="dz-btn dz-primary etq-cam-btn" disabled={!por || buscando} onClick={() => setCamara(true)}>📷 Escanear etiqueta de devolución</button>}
        <form className="etq-manual" onSubmit={(e) => { e.preventDefault(); if (manual.trim()) buscar(manual, 'manual'); }}>
          <input className="dz-inp" autoComplete="off" placeholder="o escribí el N° de etiqueta" aria-label="Número de la etiqueta de devolución" value={manual} onChange={(e) => setManual(e.target.value)} />
          <button type="submit" className="dz-btn dz-secondary etq-ok" disabled={buscando || !por}>{buscando ? '…' : 'Buscar'}</button>
        </form>
        <button type="button" className="dz-link dev-sin" disabled={!por} onClick={() => setCarga({ etiqueta: '', origen: 'otra', leido: 'manual', transportista: '', cuenta: '', comprador: '', motivo: '', devolucion_ml: '', lineas: [lineaNueva()], fotos: [], nota: '', prueba: false, explicacion: 'Sin etiqueta de Mercado Libre: cargá lo que llegó. Queda «A revisar» para Ventas ecommerce.' })}>No tiene etiqueta / no la encuentro</button>
        {aviso && <div className={'etq-res ' + (aviso.tipo === 'ok' ? 'ok' : aviso.tipo === 'err' ? 'err' : 'warn')} role="status" onClick={() => setAviso(null)}><div className="etq-res-tit">{aviso.texto}</div></div>}
        <details className="dev-demo">
          <summary>Etiquetas de prueba (datos simulados)</summary>
          <div className="dz-muted">Para practicar: tocá una. Se guarda marcada como PRUEBA y no cuenta en los reportes.</div>
          <div className="dz-chips">{Object.entries(DEMO).map(([n, d]) => <button type="button" key={n} className="dz-chip" disabled={!por || buscando} onClick={() => buscar(n, 'prueba')}>{d.transportista} · {n}</button>)}</div>
        </details>
      </div>

      <div className="dev-filtros" role="tablist">
        {[['revisar', 'A revisar', aRevisar.length], ['hoy', 'Recibidas hoy', deHoy.length], ['todas', 'Últimos 45 días', l.length]].map(([id, t, n]) => (
          <button type="button" key={id} role="tab" aria-selected={ver === id} className={'dz-chip' + (ver === id ? ' on' : '')} onClick={() => setVer(id)}>{t} <b>{n}</b></button>
        ))}
      </div>
      {lista === null ? <div className="dz-muted">Cargando…</div>
        : !mostrar.length ? <div className="dz-card dz-muted">{ver === 'revisar' ? 'No hay devoluciones para revisar. 👍' : 'Todavía no hay devoluciones acá.'}</div>
        : <div className="dev-lista">{mostrar.map((d) => <Tarjeta key={d.id} d={d} onResolver={() => setResolver(d)} />)}</div>}

      {resolver && <Resolver d={resolver} por={por} cerrar={() => setResolver(null)} listo={() => { setResolver(null); avisar('Marcada como resuelta.'); recargar(); }} />}
    </div>
  );
}

function Tarjeta({ d, onResolver }) {
  const ok = d.resultado === 'ok';
  return (
    <div className={'dz-card dev-card ' + (ok ? 'ok' : d.resuelto_at ? 'resuelta' : 'revisar')}>
      <div className="dev-card-top">
        <span className={'dev-res ' + (ok ? 'ok' : d.resuelto_at ? 'resuelta' : 'revisar')}>{ok ? '✓ OK' : d.resuelto_at ? 'Resuelta' : 'A revisar'}</span>
        {d.prueba && <span className="dev-prueba">PRUEBA</span>}
        <span className="dz-muted">{fecha(d.creado)} {hhmm(d.creado)} · {d.por}{d.deposito ? ' · ' + d.deposito : ''}</span>
      </div>
      <div className="dev-meta">{[d.transportista, d.cuenta, d.etiqueta ? 'Etiqueta ' + d.etiqueta : 'Sin etiqueta de ML', d.motivo ? '«' + d.motivo + '»' : ''].filter(Boolean).join(' · ')}</div>
      {(d.lineas || []).map((x, i) => (
        <div key={i} className="dev-linea">
          <b>{x.recibido}{x.esperado != null && Number(x.esperado) !== Number(x.recibido) ? ' de ' + x.esperado : ''}×</b> {x.sku ? x.sku + ' · ' : ''}{x.descripcion}
          <span className={'dev-est ' + x.estado}>{TXT_ESTADO[x.estado] || x.estado}</span>
          {x.nota && <div className="dz-muted">{x.nota}</div>}
        </div>
      ))}
      {d.nota && <div className="dz-muted">Nota: {d.nota}</div>}
      {d.fotos && d.fotos.length > 0 && <div className="dev-fotos">{d.fotos.map((u) => <a key={u} href={u} target="_blank" rel="noopener"><img src={u} alt="Foto de la devolución" loading="lazy" /></a>)}</div>}
      {!ok && !d.resuelto_at && <div className="dev-asig">Para: Ventas ecommerce ({VENTAS_ECOMMERCE}) <button type="button" className="dz-btn dz-secondary dz-sm" onClick={onResolver}>Marcar resuelta</button></div>}
      {d.resuelto_at && <div className="dz-muted">Resuelta por {d.resuelto_por} el {fecha(d.resuelto_at)}: {d.resolucion}</div>}
    </div>
  );
}

function Resolver({ d, por, cerrar, listo }) {
  const [txt, setTxt] = useState('');
  const [quien, setQuien] = useState(por || '');
  const [err, setErr] = useState('');
  const [ocup, setOcup] = useState(false);
  const enviar = async () => {
    setOcup(true); setErr('');
    const { data, error } = await supabase.rpc('etq_devolucion_resolver', { p_id: d.id, p_por: quien, p_resolucion: txt });
    setOcup(false);
    if (error || !data || !data.ok) { setErr((data && data.error) || 'No se pudo guardar. Probá de nuevo.'); return; }
    listo();
  };
  return (
    <div className="dz-overlay" onClick={cerrar}>
      <div className="dz-modal" onClick={(e) => e.stopPropagation()}>
        <h2 className="dz-h2">Resolver devolución</h2>
        <div className="dz-muted">{[d.cuenta, d.etiqueta, (d.lineas || []).map((x) => x.descripcion).join(', ')].filter(Boolean).join(' · ')}</div>
        <label className="dz-label">¿Quién la resuelve?<input className="dz-inp" value={quien} onChange={(e) => setQuien(e.target.value)} placeholder="Brenda / Yuliani" /></label>
        <label className="dz-label">¿Qué se hizo?<textarea className="dz-inp" rows={3} value={txt} onChange={(e) => setTxt(e.target.value)} placeholder="Ej.: se reclamó a ML, se reintegró al stock, se devolvió el dinero…" /></label>
        {err && <div className="etq-alerta">{err}</div>}
        <button type="button" className="dz-btn dz-primary" disabled={ocup || txt.trim().length < 3 || !quien.trim()} onClick={enviar}>{ocup ? 'Guardando…' : 'Guardar'}</button>
        <button type="button" className="dz-btn dz-secondary" onClick={cerrar}>Volver</button>
      </div>
    </div>
  );
}

function Recibir({ carga, setCarga, por, deposito, alGuardar }) {
  const confirm = useConfirm();
  const [ocup, setOcup] = useState(false);
  const [subiendo, setSubiendo] = useState(0);
  const [err, setErr] = useState('');
  const set = (k, v) => setCarga((c) => ({ ...c, [k]: v }));
  const setLinea = (i, k, v) => setCarga((c) => ({ ...c, lineas: c.lineas.map((x, j) => (j === i ? { ...x, [k]: v } : x)) }));
  const res = useMemo(() => resultadoDev(carga.lineas, carga.origen), [carga]);
  const falta = faltaDev(carga.lineas, carga.fotos);
  const hayMal = carga.lineas.some((x) => x.estado && x.estado !== 'buen');

  const fotos = async (files) => {
    const lista = [...(files || [])].slice(0, 6);
    if (!lista.length) return;
    setSubiendo((n) => n + lista.length); setErr('');
    for (const f of lista) {
      try { const u = await subirFoto(f); setCarga((c) => ({ ...c, fotos: [...c.fotos, u] })); } catch (e) { setErr('No se pudo subir una foto. Revisá internet y probá de nuevo.'); }
      setSubiendo((n) => n - 1);
    }
  };

  const guardar = async (forzar = false) => {
    setOcup(true); setErr('');
    const p = { por, deposito, etiqueta: carga.etiqueta, origen: carga.origen, transportista: carga.transportista, cuenta: carga.cuenta, comprador: carga.comprador, motivo: carga.motivo, devolucion_ml: carga.devolucion_ml,
      lineas: carga.lineas.map((x) => ({ sku: String(x.sku || '').trim() || null, descripcion: String(x.descripcion || '').trim(), esperado: x.esperado, recibido: Number(x.recibido), estado: x.estado, nota: String(x.nota || '').trim() || null })),
      fotos: carga.fotos, nota: carga.nota, prueba: carga.prueba, forzar };
    const { data, error } = await supabase.rpc('etq_devolucion_guardar', { p });
    setOcup(false);
    if (error) { setErr('No se pudo guardar. Revisá internet y probá de nuevo.'); return; }
    if (data && data.duplicado) {
      if (await confirm('Esta etiqueta ya la recibió ' + data.por + ' el ' + fecha(data.creado) + ' a las ' + hhmm(data.creado) + '. ¿Es otra devolución distinta y la querés cargar igual?')) guardar(true);
      return;
    }
    if (!data || !data.ok) { setErr((data && data.error) || 'No se pudo guardar.'); return; }
    alGuardar(data);
  };

  return (
    <div className="dz-wrap etq-pad0 dev-recibir">
      <div className="dz-panel">
        <div className="dev-card-top">
          <h2 className="dz-h2" style={{ margin: 0 }}>Recibir devolución</h2>
          {carga.prueba && <span className="dev-prueba">PRUEBA · datos simulados</span>}
        </div>
        {carga.explicacion && <div className="etq-alerta-box">{carga.explicacion}</div>}
        {carga.origen === 'ml' ? (
          <div className="dev-datos">
            <div><span>Transporte</span><b>{carga.transportista || '—'}</b></div>
            <div><span>Cuenta de ML</span><b>{carga.cuenta || '—'}</b></div>
            <div><span>Comprador</span><b>{carga.comprador || '—'}</b></div>
            <div><span>Motivo del comprador</span><b>{carga.motivo || '—'}</b></div>
            <div><span>Etiqueta</span><b>{carga.etiqueta}</b></div>
          </div>
        ) : (
          <div className="dev-datos form">
            <label className="dz-label">Transporte<select className="dz-inp" value={carga.transportista} onChange={(e) => set('transportista', e.target.value)}><option value="">Elegí…</option>{TRANSPORTES.map((t) => <option key={t}>{t}</option>)}</select></label>
            <label className="dz-label">¿De qué empresa / cuenta? (si se sabe)<input className="dz-inp" value={carga.cuenta} onChange={(e) => set('cuenta', e.target.value)} placeholder="Ej.: POLIPLAST SRL, FOAMFACTORY…" /></label>
            <label className="dz-label">N° de etiqueta o remito (si tiene)<input className="dz-inp" value={carga.etiqueta} onChange={(e) => set('etiqueta', e.target.value)} /></label>
          </div>
        )}
      </div>

      {carga.lineas.map((x, i) => (
        <div key={i} className="dz-panel dev-prod">
          {carga.origen === 'ml' ? (
            <div className="dev-prod-tit"><b>{x.descripcion}</b><span className="dz-muted">{x.sku}{x.esperado != null ? ' · venían ' + x.esperado : ''}</span></div>
          ) : (
            <div className="dev-prod-form">
              <input className="dz-inp" placeholder="Producto (nombre o SKU)" aria-label="Producto" value={x.descripcion} onChange={(e) => setLinea(i, 'descripcion', e.target.value)} />
              {carga.lineas.length > 1 && <button type="button" className="dz-link" onClick={() => setCarga((c) => ({ ...c, lineas: c.lineas.filter((_, j) => j !== i) }))}>Quitar</button>}
            </div>
          )}
          <div className="dev-cant">
            <span>¿Cuántos llegaron?</span>
            <button type="button" className="dz-btn dz-secondary" aria-label="Uno menos" onClick={() => setLinea(i, 'recibido', Math.max(0, Number(x.recibido) - 1))}>−</button>
            <input className="dz-inp" inputMode="numeric" aria-label="Cantidad recibida" value={x.recibido} onChange={(e) => setLinea(i, 'recibido', e.target.value.replace(/\D/g, '').slice(0, 4) || '0')} />
            <button type="button" className="dz-btn dz-secondary" aria-label="Uno más" onClick={() => setLinea(i, 'recibido', Number(x.recibido) + 1)}>+</button>
          </div>
          {x.esperado != null && Number(x.recibido) !== Number(x.esperado) && <div className="etq-alerta">Venían {x.esperado} y llegaron {x.recibido}: queda a revisar.</div>}
          <div className="dev-estados" role="radiogroup" aria-label="Estado">
            {ESTADOS_DEV.map(([id, t]) => <button type="button" key={id} role="radio" aria-checked={x.estado === id} className={'dev-estbtn ' + id + (x.estado === id ? ' on' : '')} onClick={() => setLinea(i, 'estado', id)}>{t}</button>)}
          </div>
          {x.estado && x.estado !== 'buen' && (
            <textarea className="dz-inp" rows={2} value={x.nota} onChange={(e) => setLinea(i, 'nota', e.target.value)} placeholder={x.estado === 'incompleto' ? '¿Qué falta?' : '¿Qué tiene? (roto, abierto, mojado…)'} aria-label="Descripción" />
          )}
        </div>
      ))}
      {carga.origen === 'otra' && <button type="button" className="dz-btn dz-secondary" onClick={() => setCarga((c) => ({ ...c, lineas: [...c.lineas, lineaNueva()] }))}>+ Otro producto</button>}

      <div className="dz-panel">
        {(hayMal || carga.fotos.length > 0) && (
          <div className="dev-foto-zona">
            <label className="dz-btn dz-secondary dev-foto-btn">📷 {carga.fotos.length ? 'Agregar otra foto' : 'Sacar foto de lo que no está bien'}
              <input type="file" accept="image/*" capture="environment" multiple hidden onChange={(e) => { fotos(e.target.files); e.target.value = ''; }} />
            </label>
            {subiendo > 0 && <div className="dz-muted">Subiendo {subiendo} foto{subiendo === 1 ? '' : 's'}…</div>}
            {carga.fotos.length > 0 && <div className="dev-fotos">{carga.fotos.map((u) => <span key={u} className="dev-foto"><img src={u} alt="Foto cargada" /><button type="button" aria-label="Quitar foto" onClick={() => set('fotos', carga.fotos.filter((z) => z !== u))}>×</button></span>)}</div>}
          </div>
        )}
        <textarea className="dz-inp" rows={2} value={carga.nota} onChange={(e) => set('nota', e.target.value)} placeholder="Nota (opcional)" aria-label="Nota" />
        <div className={'dev-resultado ' + res}>{res === 'ok' ? '✓ Queda OK' : 'Queda «A revisar» → Ventas ecommerce (' + VENTAS_ECOMMERCE + ')'}</div>
        {err && <div className="etq-alerta">{err}</div>}
        <button type="button" className="dz-btn dz-primary" disabled={ocup || subiendo > 0 || !!falta || !por} onClick={() => guardar(false)}>{ocup ? 'Guardando…' : falta || 'Guardar devolución'}</button>
        <button type="button" className="dz-btn dz-secondary" onClick={async () => { if (await confirm('¿Salir sin guardar?')) setCarga(null); }}>Cancelar</button>
      </div>
    </div>
  );
}
