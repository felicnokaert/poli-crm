// Tablero de Etiquetas (27/11, idea de la reunión de Diego): «Cortes de hoy» con colores y «Productividad del equipo».
// Todo sale de los escaneos (etq_escaneos) y de los pendientes del CRM; hora de Argentina.
const TZ = 'America/Argentina/Buenos_Aires';

export function partesAR(d) {
  const p = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false, weekday: 'short' }).formatToParts(d);
  const g = (t) => p.find((x) => x.type === t).value;
  return { fecha: g('year') + '-' + g('month') + '-' + g('day'), hora: Number(g('hour')) % 24, min: Number(g('minute')), dow: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(g('weekday')) };
}
const unidades = (e) => (e.lineas || []).reduce((s, l) => s + (Number(l.qty) || 0), 0);
const valido = (e) => e.estado !== 'cancelado';

/** Cortes de hoy: una tarjeta por corte con lo escaneado en su ventana (corte anterior, este corte] y el estado.
 *  estado: 'cerrado' (ya pasó la hora), 'ahora' (es la ventana en curso), 'proximo'. pendientesAhora va en la tarjeta en curso. */
export function cortesDeHoy(escaneos, cortes, ahora = new Date(), pendientesAhora = null) {
  const a = partesAR(ahora);
  const horas = [...new Set((cortes || []).map(Number))].filter((h) => h >= 0 && h <= 23).sort((x, y) => x - y);
  const deHoy = escaneos.filter((e) => valido(e) && partesAR(new Date(e.creado)).fecha === a.fecha);
  const horaDe = (e) => { const p = partesAR(new Date(e.creado)); return p.hora + p.min / 60; };
  const ahoraH = a.hora + a.min / 60;
  const tarjetas = horas.map((h, i) => {
    const desde = i === 0 ? -1 : horas[i - 1];
    const en = deHoy.filter((e) => { const x = horaDe(e); return x > desde && x <= h; });
    const estado = ahoraH >= h ? 'cerrado' : (i === 0 || ahoraH >= horas[i - 1]) ? 'ahora' : 'proximo';
    return { hora: h, envios: en.length, unidades: en.reduce((s, e) => s + unidades(e), 0), estado, pendientes: estado === 'ahora' ? pendientesAhora : null };
  });
  const despues = horas.length ? deHoy.filter((e) => horaDe(e) > horas[horas.length - 1]) : deHoy;
  const totalEnvios = deHoy.length;
  return {
    tarjetas,
    despues: { envios: despues.length, unidades: despues.reduce((s, e) => s + unidades(e), 0) },
    total: { envios: totalEnvios, unidades: deHoy.reduce((s, e) => s + unidades(e), 0), pendientes: pendientesAhora, avance: pendientesAhora === null ? null : (totalEnvios + pendientesAhora ? Math.round((100 * totalEnvios) / (totalEnvios + pendientesAhora)) : 100) },
  };
}

/** Productividad: por preparador, envíos y unidades de hoy y de la semana (hoy + 4 días hábiles anteriores), con su participación. */
export function equipo(escaneos, ahora = new Date()) {
  const a = partesAR(ahora);
  const dias = [a.fecha]; let d = new Date(ahora);
  while (dias.length < 5) { d = new Date(d.getTime() - 86400000); const p = partesAR(d); if (p.dow !== 0 && p.dow !== 6) dias.push(p.fecha); }
  const semana = new Set(dias);
  const m = new Map();
  escaneos.filter(valido).forEach((e) => {
    const f = partesAR(new Date(e.creado)).fecha;
    if (!semana.has(f)) return;
    const k = e.por || '¿?';
    const x = m.get(k) || { nombre: k, enviosHoy: 0, unidadesHoy: 0, enviosSemana: 0, unidadesSemana: 0, ultimo: null };
    const u = unidades(e);
    x.enviosSemana++; x.unidadesSemana += u;
    if (f === a.fecha) { x.enviosHoy++; x.unidadesHoy += u; }
    if (!x.ultimo || e.creado > x.ultimo) x.ultimo = e.creado;
    m.set(k, x);
  });
  const filas = [...m.values()].sort((x, y) => y.enviosSemana - x.enviosSemana || y.enviosHoy - x.enviosHoy);
  const max = Math.max(1, ...filas.map((f) => f.enviosSemana));
  const tot = filas.reduce((s, f) => s + f.enviosSemana, 0) || 1;
  return filas.map((f) => ({ ...f, barra: Math.round((100 * f.enviosSemana) / max), participacion: Math.round((100 * f.enviosSemana) / tot) }));
}

// 27/11: «Productividad del equipo». Suelta (link de Netlify): solo con sesión de administrador (PIN).
// Embebida en Poliplast App (?marco=poliplast): la decide el permiso «Qué ve cada persona» de Poliplast App, que manda
// ?productividad=1 o 0 (Felipe la tilda solo a Diego). Si falta el parámetro, oculta.
export function verProductividad(search, admin) {
  let q; try { q = new URLSearchParams(search || ''); } catch (e) { q = new URLSearchParams(); }
  return q.get('marco') === 'poliplast' ? q.get('productividad') === '1' : !!admin;
}
