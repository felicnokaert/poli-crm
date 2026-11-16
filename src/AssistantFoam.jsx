const fmt = (value) => Number(value).toLocaleString("es-AR", { maximumFractionDigits: 1 });

// Cuánto poliol e isocianato hace falta para llenar N piezas (fórmula y datos de la ficha técnica).
export function AssistantFoam({ quote }) {
  if (!quote) return null;
  const { ask, ficha } = quote;
  return (
    <section className="assistant-answer" aria-label="Cálculo de material">
      <span className="assistant-group-label">Material · {fmt(ask.count)} × {fmt(ask.volumeM3)} m³</span>
      <p className="muted small">Kg de mezcla = volumen × densidad moldeada{ficha?.ratio ? `, repartido ${ficha.ratio.poliol} : ${ficha.ratio.iso} (ficha ${ficha.title})` : ""}. Pérdidas: {quote.lossPct} %{quote.lossAssumed ? " (supuesto, decime si es otro)" : ""}.</p>
      {quote.rows.length > 0 && (
        <div className="table-scroll"><table className="sales-history-table">
          <thead><tr><th>Densidad</th><th>Por pieza</th><th>Total</th><th>Con pérdidas</th><th>Poliol</th><th>Isocianato</th>{quote.rows.some((row) => row.kits) && <th>Juegos</th>}</tr></thead>
          <tbody>{quote.rows.map((row) => (
            <tr key={row.density}>
              <td>{fmt(row.density)} kg/m³<br /><span className="muted small">{row.source}</span></td>
              <td>{fmt(row.perPieceKg)} kg</td><td>{fmt(row.totalKg)} kg</td><td><strong>{fmt(row.withLossKg)} kg</strong></td>
              <td>{row.loss ? `${fmt(row.loss.poliol)} kg` : "—"}</td><td>{row.loss ? `${fmt(row.loss.iso)} kg` : "—"}</td>
              {quote.rows.some((item) => item.kits) && <td>{row.kits ? <><strong>{row.kits.withLoss}</strong><br /><span className="muted small">{row.kits.exact} sin pérdidas{row.kits.limiting ? ` · manda el ${row.kits.limiting}` : ""}</span></> : "—"}</td>}
            </tr>
          ))}</tbody>
        </table></div>
      )}
      <ul className="assistant-rivals">{quote.notes.map((line) => <li key={line}>{line}</li>)}</ul>
      <span className="muted small">Sin precios. Confirmá con el área técnica antes de comprometer un trabajo grande.</span>
    </section>
  );
}
