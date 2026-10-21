import { useEffect, useMemo, useState } from 'react';
import { buildCustomerBase } from './customer-base.mjs';

// Lectura de la copia de comprobantes de Contabilium (solo lectura, tabla contabilium_comprobantes). Se lee una vez
// por sesión y se comparte entre la Cola del día y la ficha de cada empresa.
const PAGE = 1000;
const SALE_FILTER = 'tipo.like.FC%,tipo.like.NC%,tipo.eq.COT';
const CACHE_MS = 10 * 60 * 1000;
const cache = new WeakMap();

export const argentinaToday = (now = Date.now()) => new Date(now - 3 * 3600000).toISOString().slice(0, 10);

async function loadComprobantes(supabase) {
  const rows = [];
  for (let from = 0; from < 50000; from += PAGE) {
    const { data, error } = await supabase.from('contabilium_comprobantes').select('company,tipo,fecha,cliente,total,neto:raw->>ImporteTotalNeto').or(SALE_FILTER).order('fecha', { ascending: false }).range(from, from + PAGE - 1);
    if (error) throw error;
    rows.push(...data);
    if (data.length < PAGE) break;
  }
  const { data: sync } = await supabase.from('contabilium_sync').select('company,history_done,cursor_date');
  return { rows, sync: sync || [] };
}

export function useComprobantes(supabase) {
  const [state, setState] = useState({ status: supabase ? 'loading' : 'offline', rows: [], sync: [] });
  useEffect(() => {
    if (!supabase) return undefined;
    let alive = true;
    let entry = cache.get(supabase);
    if (!entry || Date.now() - entry.at > CACHE_MS) {
      entry = { at: Date.now(), promise: loadComprobantes(supabase) };
      cache.set(supabase, entry);
    }
    entry.promise
      .then((result) => { if (alive) setState({ status: 'ready', ...result }); })
      .catch(() => { cache.delete(supabase); if (alive) setState({ status: 'error', rows: [], sync: [] }); });
    return () => { alive = false; };
  }, [supabase]);
  return state;
}

const STATUS_TEXT = { activo: 'Activo', dormido: 'Dormido', inactivo: 'Inactivo' };
const money = (value) => `$ ${Number(value || 0).toLocaleString('es-AR')}`;
const dateText = (value) => String(value || '').split('-').reverse().join('/');

// Base limpia dentro de la ficha de la empresa, calculada desde la facturación (no se edita a mano).
export function CustomerBasePanel({ supabase, client, allClients }) {
  const { status, rows, sync } = useComprobantes(supabase);
  const today = argentinaToday();
  const { byClient } = useMemo(() => (status === 'ready' ? buildCustomerBase(rows, allClients?.length ? allClients : [client], { today }) : { byClient: new Map() }), [status, rows, allClients, client, today]);
  if (!supabase || status === 'offline') return null;
  const info = byClient.get(client.id);
  const syncing = sync.filter((item) => !item.history_done).map((item) => item.company);
  return (
    <section className="customer-base" aria-label="Facturación en Contabilium">
      <strong>Facturación (Contabilium)</strong>
      {status === 'loading' && <p className="muted small">Leyendo la facturación…</p>}
      {status === 'error' && <p className="muted small">No se pudo leer la facturación.</p>}
      {status === 'ready' && !info && (
        <p className="muted small">No encontré facturas con el nombre de esta empresa{client.legalName ? '' : ' (si en Contabilium figura con otra razón social, cargala en "Razón social" y aparece acá)'}.{syncing.length > 0 && ` Todavía se está copiando el historial de ${syncing.join(', ')}.`}</p>
      )}
      {status === 'ready' && info && (
        <>
          <p>
            <em className={`badge ${info.status === 'activo' ? 'ok' : info.status === 'dormido' ? 'warn' : ''}`}>{STATUS_TEXT[info.status] || info.status}</em>
            {info.big && <em className="badge ok"> Cliente grande</em>}
            {info.recurrent && <em className="badge"> Recurrente</em>}
          </p>
          <ul className="muted small customer-base-list">
            <li>Última compra: <strong>{dateText(info.lastPurchase)}</strong>{info.daysSince !== null && ` (hace ${info.daysSince} días)`}</li>
            <li>Compras registradas: <strong>{info.purchaseCount}</strong> · en los últimos 24 meses: {info.purchases24} por {money(info.total24)}</li>
            {info.frequencyDays && <li>Compra cada ~{info.frequencyDays} días</li>}
            <li>Familia principal: {client.family || 'sin definir'} (de la ficha: las facturas no traen productos)</li>
            <li>Razones sociales en Contabilium: {info.razonesSociales.join(' · ') || '–'} ({info.companies.join(', ')})</li>
          </ul>
          {syncing.length > 0 && <p className="muted small">Todavía se está copiando el historial de {syncing.join(', ')}: el estado puede cambiar.</p>}
        </>
      )}
    </section>
  );
}
