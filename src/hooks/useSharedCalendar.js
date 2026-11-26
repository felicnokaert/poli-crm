import { useEffect, useState } from 'react';
import { FALLBACK, normalizeHolidays } from '../../lib/feriados.mjs';

// Calendario único (26/11): lo COMPARTIDO del mes visible. Lo personal (tareas y eventos) ya está en el espacio de
// cada uno y no pasa por acá.
// - Feriados: /api/feriados/AAAA (servidor; respaldo 2026 si no responde).
// - Entregas: entregas_pedidos del rango (solo si la persona tiene el módulo; la base lo protege igual con su RLS).
// - Cortes de etiquetas: etq_config de la app de conteo (horarios y días con/sin corte), con su clave pública.
const CONTEO_URL = 'https://coldwrbfxpdfutbekysr.supabase.co';
const CONTEO_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNvbGR3cmJmeHBkZnV0YmVreXNyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODgzNjE0MzAsImV4cCI6MjEwMzkzNzQzMH0.7CloDCuNcsm4E3TcEO712RNZdTUvL_BmCrmXWHRRrrc';
const holidayCache = new Map();

async function loadHolidays(year) {
  if (holidayCache.has(year)) return holidayCache.get(year);
  let list = FALLBACK[year] || [];
  try {
    const response = await fetch(`/api/feriados/${year}`);
    if (response.ok) { const body = await response.json(); if (body?.holidays?.length) list = normalizeHolidays(body.holidays); }
  } catch { /* sin servidor (local): respaldo */ }
  holidayCache.set(year, list);
  return list;
}

async function loadCortes() {
  const response = await fetch(`${CONTEO_URL}/rest/v1/etq_config?select=key,value&key=in.(cortes,calendario)`, { headers: { apikey: CONTEO_ANON, Authorization: `Bearer ${CONTEO_ANON}` } });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const rows = await response.json();
  const get = (key) => rows.find((row) => row.key === key)?.value;
  return { cortes: get('cortes') || [8, 10, 12], calendario: get('calendario') || {} };
}

function demoEntregas(days) {
  const names = ['Astillero Sur', 'Termotanques del Plata', 'Corralón Norte', 'Náutica Quilmes', 'Paneles Frío SRL'];
  return days.filter((_, index) => index % 3 === 1).slice(0, 12).map((day, index) => ({
    id: `demo-${day}`, cliente: names[index % names.length], codigo: `R-${1200 + index}`,
    estado: index % 4 === 0 ? 'cargado' : 'despachado', fecha_remito: day, fecha_despacho: index % 4 === 0 ? null : day,
    deposito_salida: index % 2 ? 'Mar del Plata' : 'Villa Domínico',
  }));
}

export function useSharedCalendar({ days = [], supabase = null, allows = () => true, demo = false } = {}) {
  const [state, setState] = useState({ holidays: [], entregas: [], cortes: null, loading: true, problems: [] });
  const from = days[0];
  const to = days[days.length - 1];
  const wantEntregas = allows('entregas');
  const wantCortes = allows('etiquetas');
  useEffect(() => {
    if (!from) return undefined;
    let alive = true;
    const problems = [];
    const years = [...new Set([from.slice(0, 4), to.slice(0, 4)])].map(Number);
    const tasks = [
      Promise.all(years.map(loadHolidays)).then((lists) => lists.flat()),
      !wantEntregas ? Promise.resolve([]) : demo ? Promise.resolve(demoEntregas(days)) : !supabase?.from ? Promise.resolve([]) :
        Promise.resolve(supabase.from('entregas_pedidos')
          .select('id,codigo,cliente,estado,fecha_remito,fecha_despacho,fecha_entrega,deposito_salida,n_guia')
          .neq('estado', 'cancelado')
          .or(`and(fecha_despacho.gte.${from},fecha_despacho.lte.${to}),and(fecha_entrega.gte.${from},fecha_entrega.lte.${to}),and(fecha_remito.gte.${from},fecha_remito.lte.${to})`)
          .limit(800))
          .then(({ data, error }) => { if (error) { problems.push('Entregas'); return []; } return data || []; }),
      !wantCortes ? Promise.resolve(null) : loadCortes().catch(() => { if (demo) return { cortes: [8, 10, 12], calendario: {} }; problems.push('Cortes de etiquetas'); return null; }),
    ];
    Promise.all(tasks).then(([holidays, entregas, cortes]) => { if (alive) setState({ holidays, entregas, cortes, loading: false, problems }); })
      .catch(() => { if (alive) setState((current) => ({ ...current, loading: false })); });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [from, to, supabase, wantEntregas, wantCortes, demo]);
  return state;
}
