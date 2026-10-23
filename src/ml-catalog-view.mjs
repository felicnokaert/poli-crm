// Competencia por catálogo (23/10): lo que guarda lib/ml-catalog.mjs en ml_catalog_status, listo para mostrar y
// para el asistente. Primero lo que perdemos (con cuánto habría que bajar), después lo que compartimos y ganamos.
const STATUS = {
  competing: { label: 'Perdemos', tone: 'bad', order: 0 },
  sharing_first_place: { label: 'Compartimos el 1.º', tone: 'warn', order: 1 },
  winning: { label: 'Ganamos', tone: 'good', order: 2 },
  listed: { label: 'Sin competir', tone: 'muted', order: 3 },
};
const statusOf = (value) => STATUS[value] || { label: 'Sin dato', tone: 'muted', order: 4 };
const pct = (part, whole) => (part != null && whole ? Math.round(((part - whole) / whole) * 1000) / 10 : null);

export function catalogView(rows = [], { nickname = {} } = {}) {
  const view = rows.map((row) => {
    const state = statusOf(row.status);
    const ourPrice = row.our_price == null ? null : Number(row.our_price);
    const toWin = row.price_to_win == null ? null : Number(row.price_to_win);
    const cheapest = row.cheapest_price == null ? null : Number(row.cheapest_price);
    return {
      ...row,
      state,
      account: nickname[row.seller_id] || '',
      winner: row.winner_is_ours ? `nosotros${nickname[row.winner_seller_id] ? ` (${nickname[row.winner_seller_id]})` : ''}` : row.winner_nickname || (row.winner_seller_id ? `vendedor ${row.winner_seller_id}` : ''),
      // Cuánto habría que bajar para ganar (solo si perdemos o compartimos y ML da el precio).
      cut: state.order <= 1 && toWin != null && ourPrice != null && toWin < ourPrice ? { amount: ourPrice - toWin, pct: pct(toWin, ourPrice) } : null,
      vsCheapest: cheapest != null && ourPrice != null ? pct(ourPrice, cheapest) : null,
    };
  });
  view.sort((a, b) => a.state.order - b.state.order || (a.cut?.pct ?? 0) - (b.cut?.pct ?? 0) || String(a.product_name).localeCompare(String(b.product_name)));
  const counts = { total: view.length, losing: 0, sharing: 0, winning: 0, alone: 0 };
  for (const row of view) {
    if (row.status === 'competing') counts.losing += 1;
    else if (row.status === 'sharing_first_place') counts.sharing += 1;
    else if (row.status === 'winning') counts.winning += 1;
    else if (row.status === 'listed') counts.alone += 1;
  }
  return { rows: view, counts };
}

export function catalogContext(view, { max = 12 } = {}) {
  if (!view?.rows?.length) return '';
  const money = (value) => (value == null ? '—' : `$ ${Math.round(Number(value)).toLocaleString('es-AR')}`);
  const { counts } = view;
  const lines = [`CATÁLOGO DE MERCADO LIBRE (nuestras publicaciones que compiten en una misma página de producto; dato de Mercado Libre, se revisa una vez por día): ${counts.total} en total, perdemos ${counts.losing}, compartimos el primer lugar en ${counts.sharing}, ganamos ${counts.winning}${counts.alone ? `, sin competencia ${counts.alone}` : ''}.`];
  for (const row of view.rows.filter((entry) => entry.state.order <= 1).slice(0, max)) {
    lines.push(`- ${String(row.product_name).slice(0, 70)}${row.account ? ` (${row.account})` : ''}: ${row.state.label.toLowerCase()}; nuestro precio ${money(row.our_price)}${row.price_to_win != null ? `, precio para ganar ${money(row.price_to_win)}` : ''}${row.winner ? `, gana ${row.winner}${row.winner_price != null ? ` a ${money(row.winner_price)}` : ''}` : ''}.`);
  }
  return lines.join('\n');
}
