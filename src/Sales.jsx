import { useMemo, useRef, useState } from 'react';
import { AlertTriangle, CheckCircle2, Download, FileUp, Plus, ReceiptText, Target, Trash2, X } from 'lucide-react';
import { blankSale, computeGoalProgress, duplicateSale, GOAL_METRICS, netAmountInArs, normalizedSale, quarterKey, saleCommission, salesToCsv, SALES_UNITS } from './sales-model.mjs';

const money = (value) => new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 2 }).format(value || 0);
const monthKey = (date) => String(date || '').slice(0, 7);
const PDF_TIMEOUT_MS = 20000;

function exportSalesCsv(sales, month, unit) {
  const blob = new Blob([salesToCsv(sales)], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `ventas-${unit === 'Todas' ? 'todas' : unit.toLowerCase()}-${month || 'todos'}.csv`;
  anchor.click();
  URL.revokeObjectURL(url);
}

function draftFromParsedInvoice(parsed, fileName) {
  return {
    ...normalizedSale({
      ...blankSale(),
      unit: parsed.unit,
      date: parsed.date || blankSale().date,
      pointOfSale: parsed.pointOfSale,
      documentNumber: parsed.documentNumber,
      customer: parsed.customer,
      netAmount: parsed.netAmount,
      currency: parsed.currency,
      exchangeRate: parsed.currency === 'USD' ? (parsed.exchangeRate || '') : '',
      notes: parsed.internalTaxExcluded ? `Impuesto interno excluido de la comisión: ${money(parsed.internalTaxExcluded)}.` : '',
      // Se guardan los ítems para poder recordar precios por producto más
      // adelante (memoria de precios en Entrenamiento).
      items: (parsed.items || [])
        .filter((item) => !/impuesto\s+interno/i.test(item.description || ''))
        .map((item) => ({ description: item.description, code: item.code, unitPrice: item.unitPrice })),
    }),
    rowId: crypto.randomUUID(),
    sourceFile: fileName,
  };
}

function withTimeout(promise, ms) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), ms)),
  ]);
}

function blankGoalDraft(currentMonth, currentQuarter) {
  return { periodType: 'month', period: currentMonth, currentMonth, currentQuarter, metric: 'count', unit: 'Todas', pointOfSale: 'Todas', target: '' };
}

function GoalRow({ goal, current, onDelete }) {
  const format = GOAL_METRICS[goal.metric]?.format || String;
  const pct = goal.target > 0 ? Math.min(100, Math.round((current / goal.target) * 100)) : 0;
  const scopeLabel = [
    goal.unit !== 'Todas' ? goal.unit : '',
    goal.pointOfSale !== 'Todas' ? goal.pointOfSale : '',
  ].filter(Boolean).join(' · ') || 'Todas las unidades';
  return (
    <div className="goal-bar">
      <div className="goal-bar-head">
        <span>
          {GOAL_METRICS[goal.metric]?.label} · {goal.periodType === 'quarter' ? 'Trimestre' : 'Mes'} <strong>{goal.period}</strong> · {scopeLabel}
        </span>
        <span>{format(current)} de {format(goal.target)} <button type="button" className="icon-button" onClick={() => onDelete(goal.id)} aria-label="Eliminar objetivo"><X size={13}/></button></span>
      </div>
      <div className="goal-bar-track"><div className="goal-bar-fill" style={{ width: `${pct}%` }}/></div>
    </div>
  );
}

function GoalsPanel({ goals, sales, currentMonth, currentQuarter, onSaveGoal, onDeleteGoal }) {
  const [draft, setDraft] = useState(() => blankGoalDraft(currentMonth, currentQuarter));
  const updateDraft = (field, value) => setDraft((current) => {
    const next = { ...current, [field]: value };
    if (field === 'periodType') next.period = value === 'quarter' ? currentQuarter : currentMonth;
    if (field === 'unit' && value === 'Todas') next.pointOfSale = 'Todas';
    return next;
  });
  function addGoal(event) {
    event.preventDefault();
    if (!(Number(draft.target) > 0)) return;
    onSaveGoal({ id: crypto.randomUUID(), ...draft, target: Number(draft.target) });
    setDraft(blankGoalDraft(currentMonth, currentQuarter));
  }
  return (
    <section className="panel">
      <div className="panel-head">
        <div><span className="eyebrow">Vos elegís el parámetro</span><h2>Objetivos</h2><p>Por cantidad, por neto en pesos o por comisión — para todas las unidades o una en particular, y un punto de venta si querés afinar más.</p></div>
        <Target size={22}/>
      </div>
      {goals.map((goal) => (
        <GoalRow key={goal.id} goal={goal} current={computeGoalProgress(sales, goal)} onDelete={onDeleteGoal}/>
      ))}
      {!goals.length && <p className="empty-opportunities-inline">Todavía no armaste ningún objetivo.</p>}
      <form className="goal-form" onSubmit={addGoal}>
        <select value={draft.periodType} onChange={(e) => updateDraft('periodType', e.target.value)}>
          <option value="month">Este mes</option>
          <option value="quarter">Este trimestre</option>
        </select>
        <select value={draft.metric} onChange={(e) => updateDraft('metric', e.target.value)}>
          {Object.entries(GOAL_METRICS).map(([key, meta]) => <option key={key} value={key}>{meta.label}</option>)}
        </select>
        <select value={draft.unit} onChange={(e) => updateDraft('unit', e.target.value)}>
          <option value="Todas">Todas las unidades</option>
          {Object.keys(SALES_UNITS).map((name) => <option key={name} value={name}>{name}</option>)}
        </select>
        {draft.unit !== 'Todas' && (
          <select value={draft.pointOfSale} onChange={(e) => updateDraft('pointOfSale', e.target.value)}>
            <option value="Todas">Todos los puntos de venta</option>
            {SALES_UNITS[draft.unit].invoicePoints.map((point) => <option key={point} value={point}>{point}</option>)}
          </select>
        )}
        <input type="number" min="1" step="1" placeholder="meta" value={draft.target} onChange={(e) => updateDraft('target', e.target.value)}/>
        <button type="submit" className="secondary"><Plus size={15}/> Agregar objetivo</button>
      </form>
    </section>
  );
}

export default function Sales({ items, goals, onSaveGoal, onDeleteGoal, onSave, onDelete }) {
  const currentMonth = new Date().toISOString().slice(0, 7);
  const [month, setMonth] = useState(currentMonth);
  const [unit, setUnit] = useState('Todas');
  const [editing, setEditing] = useState(null);
  const [bulkDrafts, setBulkDrafts] = useState([]);
  const [bulkFailed, setBulkFailed] = useState([]);
  const [bulkSelected, setBulkSelected] = useState([]);
  const [importing, setImporting] = useState(false);
  const [importProgress, setImportProgress] = useState(null);
  const fileInputRef = useRef(null);
  const filtered = useMemo(() => items.filter((item) =>
    (!month || monthKey(item.date) === month) && (unit === 'Todas' || item.unit === unit)
  ).sort((a, b) => String(b.date || '').localeCompare(String(a.date || ''))), [items, month, unit]);
  const net = filtered.reduce((sum, item) => sum + netAmountInArs(item), 0);
  const commission = filtered.reduce((sum, item) => sum + saleCommission(item), 0);
  const collectedCommission = filtered.filter((item) => item.collected).reduce((sum, item) => sum + saleCommission(item), 0);
  const currentQuarter = quarterKey(currentMonth + '-01');

  async function handlePdfSelected(event) {
    const files = [...(event.target.files || [])];
    event.target.value = '';
    if (!files.length) return;
    setBulkDrafts([]);
    setBulkFailed([]);
    setImporting(true);
    const { extractPdfText } = await import('./pdf-text.js');
    const { parseInvoiceText } = await import('./invoice-parser.mjs');
    const drafts = [];
    const failed = [];
    for (let index = 0; index < files.length; index += 1) {
      const file = files[index];
      setImportProgress({ done: index, total: files.length, name: file.name });
      try {
        // Un PDF corrupto o inválido puede colgar la extracción sin nunca
        // resolver ni rechazar la promesa; sin este límite, un solo archivo
        // roto trababa todo el lote y ninguno de los demás se procesaba.
        const text = await withTimeout(extractPdfText(file), PDF_TIMEOUT_MS);
        const parsed = parseInvoiceText(text);
        if (parsed.recognized) {
          drafts.push(draftFromParsedInvoice(parsed, file.name));
        } else if (parsed.documentTypeRejected) {
          failed.push({ name: file.name, reason: `es un ${parsed.documentTypeRejected}, no una Factura` });
        } else {
          failed.push({ name: file.name, reason: 'no pude leer los datos (punto de venta, número o ítems)' });
        }
      } catch (error) {
        failed.push({ name: file.name, reason: error?.message === 'timeout' ? 'tardó demasiado en leerse (¿archivo dañado?)' : 'no se pudo abrir como PDF' });
      }
    }
    setImportProgress(null);
    setImporting(false);
    setBulkDrafts(drafts);
    setBulkFailed(failed);
    // No preseleccionamos las que quedaron en USD sin tipo de cambio: mejor
    // forzar a completarlo a mano que dejar guardar una comisión mal
    // calculada por descuido.
    setBulkSelected(drafts.filter((draft) => !(draft.currency === 'USD' && !(Number(draft.exchangeRate) > 0))).map((draft) => draft.rowId));
  }

  async function handleHistoricalJsonSelected(event) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    let rows;
    try {
      rows = JSON.parse(await file.text());
    } catch {
      setBulkFailed((current) => [...current, { name: file.name, reason: 'no es un JSON válido' }]);
      return;
    }
    if (!Array.isArray(rows)) {
      setBulkFailed((current) => [...current, { name: file.name, reason: 'el JSON debe ser una lista de ventas' }]);
      return;
    }
    const drafts = rows.map((row) => ({
      ...normalizedSale({ ...blankSale(), ...row }),
      rowId: crypto.randomUUID(),
      sourceFile: row._sheet ? `${file.name} · ${row._sheet}` : file.name,
    }));
    setBulkDrafts((current) => [...current, ...drafts]);
    setBulkSelected((current) => [
      ...current,
      ...drafts.filter((draft) => !(draft.currency === 'USD' && !(Number(draft.exchangeRate) > 0))).map((draft) => draft.rowId),
    ]);
  }

  function updateBulkDraft(rowId, field, value) {
    setBulkDrafts((current) => current.map((row) => (row.rowId === rowId ? { ...row, [field]: value } : row)));
  }

  function toggleBulkSelected(rowId) {
    setBulkSelected((current) => current.includes(rowId) ? current.filter((id) => id !== rowId) : [...current, rowId]);
  }

  function saveBulkSelected() {
    for (const row of bulkDrafts) {
      if (!bulkSelected.includes(row.rowId)) continue;
      onSave(normalizedSale(row));
    }
    const remaining = bulkDrafts.filter((row) => !bulkSelected.includes(row.rowId));
    setBulkDrafts(remaining);
    setBulkSelected([]);
  }

  function discardBulkDraft(rowId) {
    setBulkDrafts((current) => current.filter((row) => row.rowId !== rowId));
    setBulkSelected((current) => current.filter((id) => id !== rowId));
  }

  return <div className="content-stack">
    <section className="metrics-grid">
      <article className="metric-card"><span>Ventas registradas</span><strong>{filtered.length}</strong></article>
      <article className="metric-card"><span>Neto en pesos</span><strong>{money(net)}</strong></article>
      <article className="metric-card"><span>Comisión estimada</span><strong>{money(commission)}</strong></article>
      <article className="metric-card"><span>Comisión cobrada</span><strong>{money(collectedCommission)}</strong></article>
      <article className="metric-card"><span>Período</span><strong>{month || 'Todos'}</strong></article>
    </section>
    <GoalsPanel goals={Array.isArray(goals) ? goals : []} sales={items} currentMonth={currentMonth} currentQuarter={currentQuarter} onSaveGoal={onSaveGoal} onDeleteGoal={onDeleteGoal}/>
    <section className="panel">
      <div className="panel-head">
        <div><span className="eyebrow">Resultado comercial</span><h2>Ventas realizadas</h2><p>Registro manual de Facturas y COT, o subí uno o varios PDF: los vas a poder revisar y editar todos juntos en una tabla antes de guardar. La comisión se calcula sobre el importe neto sin IVA (sin impuesto interno) convertido a pesos si la factura vino en dólares.</p></div>
        <div className="panel-head-actions">
          <input ref={fileInputRef} type="file" accept="application/pdf" multiple hidden onChange={handlePdfSelected}/>
          <button type="button" className="secondary" onClick={() => fileInputRef.current?.click()} disabled={importing}><FileUp size={17}/> {importing ? 'Leyendo PDF…' : 'Subir facturas (PDF)'}</button>
          <label className="secondary upload-button">
            <FileUp size={17}/> Importar histórico (JSON)
            <input type="file" accept="application/json,.json" hidden onChange={handleHistoricalJsonSelected}/>
          </label>
          <button className="primary" onClick={() => setEditing(blankSale())}><Plus size={17}/> Registrar venta</button>
        </div>
      </div>
      {importProgress && <p className="form-notice">Leyendo {importProgress.done + 1} de {importProgress.total}: {importProgress.name}</p>}
      {bulkFailed.length > 0 && (
        <p className="form-warning">
          <AlertTriangle size={15}/> No pude importar {bulkFailed.length}: {bulkFailed.map((item) => `${item.name} (${item.reason})`).join('; ')}.
        </p>
      )}
      {bulkDrafts.length > 0 && (
        <BulkReviewTable
          rows={bulkDrafts}
          selected={bulkSelected}
          existingSales={items}
          onToggle={toggleBulkSelected}
          onToggleAll={() => setBulkSelected(bulkSelected.length === bulkDrafts.length ? [] : bulkDrafts.map((row) => row.rowId))}
          onChange={updateBulkDraft}
          onDiscard={discardBulkDraft}
          onSaveSelected={saveBulkSelected}
        />
      )}
      <div className="list-toolbar"><input type="month" value={month} onChange={(event) => setMonth(event.target.value)}/><select value={unit} onChange={(event) => setUnit(event.target.value)}><option>Todas</option><option>Poliplast</option><option>Poliocho</option></select><button type="button" className="secondary" onClick={() => exportSalesCsv(filtered, month, unit)} disabled={!filtered.length}><Download size={15}/> Exportar CSV</button></div>
      <div className="opportunity-list">{filtered.map((item) => <button className="opportunity-row" key={item.id} onClick={() => setEditing(item)}><div><strong>{item.customer}</strong><span>{item.unit} · {item.documentType}{item.pointOfSale ? ` ${item.pointOfSale}-${item.documentNumber}` : ` ${item.documentNumber}`}</span></div><span className="opportunity-stage">{item.date}</span><div><strong>{item.currency === 'USD' ? `USD ${item.netAmount}` : money(item.netAmount)}</strong><span>Comisión {money(saleCommission(item))}{item.collected ? ' · Cobrada' : ''}</span></div></button>)}{!filtered.length && <div className="empty-opportunities"><ReceiptText/><p>No hay ventas registradas en este período.</p></div>}</div>
    </section>
    {editing && (
      <SaleModal
        key={editing.id || 'new'}
        value={editing}
        sales={items}
        onClose={() => setEditing(null)}
        onSave={(value) => { onSave(normalizedSale(value)); setEditing(null); }}
        onDelete={editing.id ? () => { onDelete(editing.id); setEditing(null); } : null}
      />
    )}
  </div>;
}

function BulkReviewTable({ rows, selected, existingSales, onToggle, onToggleAll, onChange, onDiscard, onSaveSelected }) {
  return (
    <div className="bulk-import">
      <div className="bulk-import-head">
        <label className="checkbox-field"><input type="checkbox" checked={selected.length === rows.length && rows.length > 0} onChange={onToggleAll}/> {selected.length} de {rows.length} seleccionadas</label>
        <button type="button" className="primary" disabled={!selected.length} onClick={onSaveSelected}><CheckCircle2 size={15}/> Guardar seleccionadas</button>
      </div>
      <div className="bulk-import-scroll">
        <table className="bulk-import-table">
          <thead>
            <tr>
              <th></th>
              <th>Archivo</th>
              <th>Fecha</th>
              <th>Unidad</th>
              <th>Cliente</th>
              <th>Comprobante</th>
              <th>Neto</th>
              <th>Moneda</th>
              <th>T. cambio</th>
              <th>Comisión</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const duplicate = duplicateSale(existingSales, row);
              const missingRate = row.currency === 'USD' && !(Number(row.exchangeRate) > 0);
              return (
                <tr key={row.rowId} className={duplicate ? 'duplicate' : ''}>
                  <td><input type="checkbox" checked={selected.includes(row.rowId)} onChange={() => onToggle(row.rowId)}/></td>
                  <td className="bulk-file-cell" title={row.sourceFile}>{row.sourceFile}{duplicate && <span className="bulk-duplicate-tag" title={`Ya existe: ${duplicate.customer}`}>duplicada</span>}</td>
                  <td><input type="date" value={row.date} onChange={(e) => onChange(row.rowId, 'date', e.target.value)}/></td>
                  <td>
                    <select value={row.unit} onChange={(e) => onChange(row.rowId, 'unit', e.target.value)}>
                      <option>Poliplast</option><option>Poliocho</option>
                    </select>
                  </td>
                  <td><input value={row.customer} onChange={(e) => onChange(row.rowId, 'customer', e.target.value)}/></td>
                  <td>{row.pointOfSale}-{row.documentNumber}</td>
                  <td><input type="number" min="0" step="0.01" value={row.netAmount} onChange={(e) => onChange(row.rowId, 'netAmount', Number(e.target.value) || 0)}/></td>
                  <td>
                    <select value={row.currency} onChange={(e) => onChange(row.rowId, 'currency', e.target.value)}>
                      <option value="ARS">ARS</option><option value="USD">USD</option>
                    </select>
                  </td>
                  <td>{row.currency === 'USD' ? <input className={missingRate ? 'bulk-missing' : ''} type="number" min="0" step="0.01" value={row.exchangeRate || ''} placeholder="falta" onChange={(e) => onChange(row.rowId, 'exchangeRate', Number(e.target.value) || 0)}/> : '—'}</td>
                  <td>{missingRate ? <span className="bulk-missing-label" title="La factura no traía el tipo de cambio. Completalo o la comisión va a salir mal.">falta t. cambio</span> : money(saleCommission(row))}</td>
                  <td><button type="button" className="icon-button" onClick={() => onDiscard(row.rowId)} aria-label="Descartar"><X size={14}/></button></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function SaleModal({ value, sales, onClose, onSave, onDelete }) {
  const [form, setForm] = useState(value);
  const update = (name, value) => setForm((current) => ({ ...current, [name]: value }));
  const changeUnit = (unit) => setForm((current) => ({ ...current, unit, pointOfSale: current.documentType === 'Factura' ? SALES_UNITS[unit].invoicePoints[0] : '' }));
  const duplicate = duplicateSale(sales, form);
  return <div className="modal-backdrop"><form className="modal" onSubmit={(event) => { event.preventDefault(); onSave(form); }}>
    <div className="modal-head"><div><span className="eyebrow">Venta concretada</span><h2>{form.id ? 'Editar venta' : 'Registrar venta'}</h2><p>Ingresá el importe neto, sin IVA.</p></div><button type="button" className="icon-button" onClick={onClose} aria-label="Cerrar"><X/></button></div>
    {duplicate && <p className="form-warning"><AlertTriangle size={15}/> Ya existe una venta con este mismo comprobante ({duplicate.customer}, {money(duplicate.netAmount)}). Revisá antes de guardar para no duplicarla.</p>}
    <div className="form-grid">
      <label>Fecha<input required type="date" value={form.date} onChange={(e) => update('date', e.target.value)}/></label>
      <label>Unidad<select value={form.unit} onChange={(e) => changeUnit(e.target.value)}><option>Poliplast</option><option>Poliocho</option></select></label>
      <label>Comprobante<select value={form.documentType} onChange={(e) => setForm((current) => ({ ...current, documentType: e.target.value, pointOfSale: e.target.value === 'Factura' ? SALES_UNITS[current.unit].invoicePoints[0] : '' }))}><option>Factura</option><option>COT</option></select></label>
      {form.documentType === 'Factura' && <label>Punto de venta<select value={form.pointOfSale} onChange={(e) => update('pointOfSale', e.target.value)}>{SALES_UNITS[form.unit].invoicePoints.map((item) => <option key={item}>{item}</option>)}</select></label>}
      <label>Número (últimos 5)<input required inputMode="numeric" pattern="[0-9]{1,5}" maxLength="5" value={form.documentNumber} onChange={(e) => update('documentNumber', e.target.value.replace(/\D/g, '').slice(0, 5))}/></label>
      <label>Cliente<input required value={form.customer} onChange={(e) => update('customer', e.target.value)} placeholder="Razón social o nombre"/></label>
      <label>Moneda de la factura<select value={form.currency || 'ARS'} onChange={(e) => update('currency', e.target.value)}><option value="ARS">Pesos</option><option value="USD">Dólares</option></select></label>
      <label>Importe neto sin IVA{form.currency === 'USD' ? ' (USD)' : ''}<input required type="number" min="0" step="0.01" value={form.netAmount} onChange={(e) => update('netAmount', e.target.value)}/></label>
      {form.currency === 'USD' && <label>Tipo de cambio de la factura<input required type="number" min="0" step="0.01" value={form.exchangeRate || ''} onChange={(e) => update('exchangeRate', e.target.value)} placeholder="Ej: 1530"/></label>}
      {form.currency === 'USD' && <label>Equivalente en pesos<input readOnly value={money(netAmountInArs(form))}/></label>}
      <label>Comisión calculada (en pesos)<input readOnly value={money(saleCommission(form))}/></label>
      <label className="checkbox-field"><input type="checkbox" checked={!!form.collected} onChange={(e) => update('collected', e.target.checked)}/> ¿Se cobró la comisión?</label>
      <label className="span-2">Notas<textarea value={form.notes || ''} onChange={(e) => update('notes', e.target.value)}/></label>
    </div>
    <div className="modal-actions">{onDelete && <button type="button" className="danger-link" onClick={onDelete}><Trash2 size={15}/> Eliminar venta</button>}<button type="button" className="secondary" onClick={onClose}>Cancelar</button><button className="primary">Guardar venta</button></div>
  </form></div>;
}
