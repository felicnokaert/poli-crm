import { memo, useMemo, useRef, useState } from 'react';
import { AlertTriangle, CalendarCheck, CheckCircle2, Download, FileUp, Pencil, Plus, ReceiptText, Target, Trash2, X } from 'lucide-react';
import { blankSale, computeGoalProgress, defaultBusinessUnits, duplicateSale, GOAL_METRICS, netAmountInArs, normalizedSale, pointOfSaleMapFrom, quarterKey, saleCommission, salesToCsv, unitsMapFrom } from './sales-model.mjs';
import { FAMILIES } from './families.mjs';
import { useConfirm } from './ConfirmDialog';

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

function draftFromParsedInvoice(parsed, fileName, units) {
  const excludedNotes = [
    parsed.internalTaxExcluded ? `Impuesto interno excluido de la comisión: ${money(parsed.internalTaxExcluded)}.` : '',
    parsed.shippingExcluded ? `Envío/flete excluido de la comisión: ${money(parsed.shippingExcluded)}.` : '',
  ].filter(Boolean);
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
      notes: excludedNotes.join(' '),
      // Se guardan los ítems para poder recordar precios por producto más
      // adelante (memoria de precios en Entrenamiento) y para estimar
      // consumo/frecuencia de recompra por cliente y producto (radar de
      // reposición en Inicio). Envío/flete no es un producto - no debe
      // ensuciar ninguna de esas dos cosas.
      items: (parsed.items || [])
        .filter((item) => !/impuesto\s+interno/i.test(item.description || ''))
        .filter((item) => !/env[ií]os?|flete/i.test(item.description || ''))
        .map((item) => ({ description: item.description, code: item.code, unitPrice: item.unitPrice, quantity: item.quantity })),
    }, units),
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
  return { id: '', periodType: 'month', period: currentMonth, currentMonth, currentQuarter, metric: 'count', unit: 'Todas', pointOfSale: 'Todas', family: 'Todas', target: '', fallbackRate: '' };
}

function draftFromGoal(goal, currentMonth, currentQuarter) {
  return {
    id: goal.id,
    periodType: goal.periodType || 'month',
    period: goal.period || currentMonth,
    currentMonth,
    currentQuarter,
    metric: goal.metric || 'count',
    unit: goal.unit || 'Todas',
    pointOfSale: goal.pointOfSale || 'Todas',
    family: goal.family || 'Todas',
    target: goal.target ?? '',
    fallbackRate: goal.fallbackRate ?? '',
  };
}

function GoalRow({ goal, current, onEdit, onDelete }) {
  const confirm = useConfirm();
  const format = GOAL_METRICS[goal.metric]?.format || String;
  const pct = goal.target > 0 ? Math.min(100, Math.round((current / goal.target) * 100)) : 0;
  const scopeLabel = [
    goal.unit !== 'Todas' ? goal.unit : '',
    goal.pointOfSale !== 'Todas' ? goal.pointOfSale : '',
    goal.family && goal.family !== 'Todas' ? goal.family : '',
  ].filter(Boolean).join(' · ') || 'Todas las unidades';
  const label = `${GOAL_METRICS[goal.metric]?.label || 'este objetivo'} de ${goal.periodType === 'quarter' ? 'trimestre' : 'mes'} ${goal.period}`;
  async function handleDelete() {
    if (!(await confirm(`¿Eliminar el objetivo "${label}"? Esto no se puede deshacer.`, { danger: true, confirmLabel: "Eliminar" }))) return;
    onDelete(goal.id);
  }
  return (
    <div className="goal-bar">
      <div className="goal-bar-head">
        <span>
          {GOAL_METRICS[goal.metric]?.label} · {goal.periodType === 'quarter' ? 'Trimestre' : 'Mes'} <strong>{goal.period}</strong> · {scopeLabel}
        </span>
        <span>
          {format(current)} de {format(goal.target)}{" "}
          <button type="button" className="icon-button" onClick={() => onEdit(goal)} aria-label="Editar objetivo"><Pencil size={13}/></button>
          <button type="button" className="icon-button" onClick={handleDelete} aria-label="Eliminar objetivo"><X size={13}/></button>
        </span>
      </div>
      <div className="goal-bar-track"><div className="goal-bar-fill" style={{ width: `${pct}%` }}/></div>
    </div>
  );
}

function GoalsPanel({ goals, sales, businessUnits, currentMonth, currentQuarter, onSaveGoal, onDeleteGoal }) {
  const [draft, setDraft] = useState(() => blankGoalDraft(currentMonth, currentQuarter));
  const units = unitsMapFrom(businessUnits);
  const updateDraft = (field, value) => setDraft((current) => {
    const next = { ...current, [field]: value };
    if (field === 'unit' && value === 'Todas') next.pointOfSale = 'Todas';
    return next;
  });
  function selectPeriodType(value) {
    setDraft((current) => ({ ...current, periodType: value, period: value === 'quarter' ? currentQuarter : currentMonth }));
  }
  function editGoal(goal) {
    setDraft(draftFromGoal(goal, currentMonth, currentQuarter));
  }
  function cancelEdit() {
    setDraft(blankGoalDraft(currentMonth, currentQuarter));
  }
  function addGoal(event) {
    event.preventDefault();
    if (!(Number(draft.target) > 0)) return;
    // Editar reemplaza el objetivo existente (mismo id) en vez de duplicarlo.
    // El progreso nunca se guarda en el objetivo - se recalcula en vivo desde
    // las ventas - así que cambiar el tipo de cambio u otro filtro no pierde
    // nada de lo ya cargado.
    onSaveGoal({ ...draft, id: draft.id || crypto.randomUUID(), target: Number(draft.target) });
    setDraft(blankGoalDraft(currentMonth, currentQuarter));
  }
  return (
    <section className="panel">
      <div className="panel-head">
        <div><span className="eyebrow">Vos elegís el parámetro</span><h2>Objetivos</h2><p>Por cantidad, neto en pesos/dólares o comisión — filtrado por unidad, punto de venta y/o familia si querés afinar más.</p></div>
        <Target size={22}/>
      </div>
      {goals.map((goal) => (
        <GoalRow key={goal.id} goal={goal} current={computeGoalProgress(sales, goal, units)} onEdit={editGoal} onDelete={onDeleteGoal}/>
      ))}
      {!goals.length && <p className="empty-opportunities-inline">Todavía no armaste ningún objetivo.</p>}
      {draft.id && (
        <p className="empty-opportunities-inline">
          Editando el objetivo seleccionado.{" "}
          <button type="button" className="icon-button" onClick={cancelEdit}>Cancelar edición</button>
        </p>
      )}
      <form className="goal-form" onSubmit={addGoal}>
        <select value={draft.periodType} onChange={(e) => selectPeriodType(e.target.value)}>
          <option value="month">Este mes</option>
          <option value="quarter">Este trimestre</option>
        </select>
        <select value={draft.metric} onChange={(e) => updateDraft('metric', e.target.value)}>
          {Object.entries(GOAL_METRICS).map(([key, meta]) => <option key={key} value={key}>{meta.label}</option>)}
        </select>
        <select value={draft.unit} onChange={(e) => updateDraft('unit', e.target.value)}>
          <option value="Todas">Todas las unidades</option>
          {Object.keys(units).map((name) => <option key={name} value={name}>{name}</option>)}
        </select>
        {draft.unit !== 'Todas' && (
          <select value={draft.pointOfSale} onChange={(e) => updateDraft('pointOfSale', e.target.value)}>
            <option value="Todas">Todos los puntos de venta</option>
            {(units[draft.unit]?.invoicePoints || []).map((point) => <option key={point} value={point}>{point}</option>)}
          </select>
        )}
        <select value={draft.family} onChange={(e) => updateDraft('family', e.target.value)}>
          <option value="Todas">Todas las familias</option>
          {FAMILIES.map((item) => <option key={item} value={item}>{item}</option>)}
        </select>
        {draft.metric === 'netUsd' && (
          <input type="number" min="0" step="0.01" placeholder="T. cambio para ventas en $" value={draft.fallbackRate} onChange={(e) => updateDraft('fallbackRate', e.target.value)} title="Tipo de cambio para convertir a USD las ventas que se facturaron en pesos"/>
        )}
        <input type="number" min="1" step="1" placeholder="meta" value={draft.target} onChange={(e) => updateDraft('target', e.target.value)}/>
        <button type="submit" className="secondary">{draft.id ? <><Pencil size={15}/> Guardar cambios</> : <><Plus size={15}/> Agregar objetivo</>}</button>
      </form>
    </section>
  );
}

function SalesBase({ items, goals, businessUnits, clients, onSaveGoal, onDeleteGoal, onSaveBusinessUnit, onDeleteBusinessUnit, onSave, onSaveMany, onDelete, onDeleteMany }) {
  const currentMonth = new Date().toISOString().slice(0, 7);
  const units = unitsMapFrom(businessUnits);
  const unitNames = Object.keys(units);
  const [month, setMonth] = useState(currentMonth);
  const [unit, setUnit] = useState('Todas');
  const [periodMode, setPeriodMode] = useState('month');
  const currentQuarter = quarterKey(currentMonth + '-01');
  const [quarter, setQuarter] = useState(currentQuarter);
  const [search, setSearch] = useState('');
  const [selectedIds, setSelectedIds] = useState([]);
  const [editing, setEditing] = useState(null);
  const [bulkDrafts, setBulkDrafts] = useState([]);
  const [bulkFailed, setBulkFailed] = useState([]);
  const [bulkSelected, setBulkSelected] = useState([]);
  const [importing, setImporting] = useState(false);
  const [importProgress, setImportProgress] = useState(null);
  const fileInputRef = useRef(null);
  const quarterOptions = useMemo(() => {
    const set = new Set(items.map((item) => quarterKey(item.date)).filter(Boolean));
    set.add(currentQuarter);
    return [...set].sort().reverse();
  }, [items, currentQuarter]);
  const toggleSelectedId = (id) => setSelectedIds((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  const filtered = useMemo(() => {
    const normalizedSearch = search.trim().toLocaleLowerCase('es-AR');
    return items.filter((item) =>
      (periodMode === 'all' || (periodMode === 'month' ? (!month || monthKey(item.date) === month) : quarterKey(item.date) === quarter)) &&
      (unit === 'Todas' || item.unit === unit) &&
      (!normalizedSearch || (item.customer || '').toLocaleLowerCase('es-AR').includes(normalizedSearch))
    ).sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));
  }, [items, month, unit, periodMode, quarter, search]);
  const net = filtered.reduce((sum, item) => sum + netAmountInArs(item), 0);
  const commission = filtered.reduce((sum, item) => sum + saleCommission(item, units), 0);
  const collectedCommission = filtered.filter((item) => item.collected).reduce((sum, item) => sum + saleCommission(item, units), 0);

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
        const parsed = parseInvoiceText(text, pointOfSaleMapFrom(units));
        if (parsed.recognized) {
          drafts.push(draftFromParsedInvoice(parsed, file.name, units));
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
      ...normalizedSale({ ...blankSale(), ...row }, units),
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
    const toSave = bulkDrafts.filter((row) => bulkSelected.includes(row.rowId)).map((row) => normalizedSale(row, units));
    if (toSave.length) onSaveMany(toSave);
    const remaining = bulkDrafts.filter((row) => !bulkSelected.includes(row.rowId));
    setBulkDrafts(remaining);
    setBulkSelected([]);
  }

  function discardBulkDraft(rowId) {
    setBulkDrafts((current) => current.filter((row) => row.rowId !== rowId));
    setBulkSelected((current) => current.filter((id) => id !== rowId));
  }

  return <div className="content-stack">
    <section className="metric-grid sales-metric-grid">
      <article className="metric-card"><ReceiptText size={20}/><span>Ventas registradas</span><strong>{filtered.length}</strong></article>
      <article className="metric-card"><Target size={20}/><span>Neto en pesos</span><strong>{money(net)}</strong></article>
      <article className="metric-card"><CheckCircle2 size={20}/><span>Comisión estimada</span><strong>{money(commission)}</strong></article>
      <article className="metric-card"><CheckCircle2 size={20}/><span>Comisión cobrada</span><strong>{money(collectedCommission)}</strong></article>
      <article className="metric-card"><CalendarCheck size={20}/><span>Período</span><strong>{month || 'Todos'}</strong></article>
    </section>
    <GoalsPanel goals={Array.isArray(goals) ? goals : []} sales={items} businessUnits={businessUnits} currentMonth={currentMonth} currentQuarter={currentQuarter} onSaveGoal={onSaveGoal} onDeleteGoal={onDeleteGoal}/>
    <BusinessUnitsPanel businessUnits={businessUnits} onSave={onSaveBusinessUnit} onDelete={onDeleteBusinessUnit}/>
    <section className="panel">
      <div className="panel-head">
        <div><span className="eyebrow">Resultado comercial</span><h2>Ventas realizadas</h2><p>Registro manual de Facturas y COT, o subí uno o varios PDF: los vas a poder revisar y editar todos juntos en una tabla antes de guardar. La comisión se calcula sobre el importe neto sin IVA (sin impuesto interno) convertido a pesos si la factura vino en dólares.</p></div>
        <div className="panel-head-actions">
          <input ref={fileInputRef} type="file" accept="application/pdf" multiple hidden onChange={handlePdfSelected}/>
          <button type="button" className="secondary" onClick={() => fileInputRef.current?.click()} disabled={importing}><FileUp size={16}/> {importing ? 'Leyendo…' : 'Subir PDF'}</button>
          <label className="secondary upload-button">
            <FileUp size={16}/> Importar histórico
            <input type="file" accept="application/json,.json" hidden onChange={handleHistoricalJsonSelected}/>
          </label>
          <button className="primary" onClick={() => setEditing(blankSale(unitNames[0], units[unitNames[0]]?.invoicePoints[0]))}><Plus size={16}/> Registrar venta</button>
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
          units={units}
          unitNames={unitNames}
          onToggle={toggleBulkSelected}
          onToggleAll={() => setBulkSelected(bulkSelected.length === bulkDrafts.length ? [] : bulkDrafts.map((row) => row.rowId))}
          onChange={updateBulkDraft}
          onDiscard={discardBulkDraft}
          onSaveSelected={saveBulkSelected}
        />
      )}
      <div className="list-toolbar">
        <select value={periodMode} onChange={(event) => setPeriodMode(event.target.value)}>
          <option value="month">Por mes</option>
          <option value="quarter">Por trimestre</option>
          <option value="all">Todo el histórico</option>
        </select>
        {periodMode === 'month' && <input type="month" value={month} onChange={(event) => setMonth(event.target.value)}/>}
        {periodMode === 'quarter' && (
          <select value={quarter} onChange={(event) => setQuarter(event.target.value)}>
            {quarterOptions.map((q) => <option key={q} value={q}>{q}</option>)}
          </select>
        )}
        <select value={unit} onChange={(event) => setUnit(event.target.value)}><option>Todas</option>{unitNames.map((name) => <option key={name}>{name}</option>)}</select>
        <input type="search" placeholder="Buscar cliente…" value={search} onChange={(event) => setSearch(event.target.value)}/>
        <button type="button" className="secondary" onClick={() => exportSalesCsv(filtered, month, unit)} disabled={!filtered.length}><Download size={15}/> Exportar CSV</button>
      </div>
      {selectedIds.length > 0 && (
        <div className="bulk-import-head">
          <span>{selectedIds.length} venta{selectedIds.length === 1 ? '' : 's'} seleccionada{selectedIds.length === 1 ? '' : 's'}</span>
          <button type="button" className="danger-link" onClick={() => { onDeleteMany(selectedIds); setSelectedIds([]); }}><Trash2 size={15}/> Eliminar seleccionadas</button>
        </div>
      )}
      <div className="opportunity-list">{filtered.map((item) => (
        <div className={`opportunity-row sale-row${selectedIds.includes(item.id) ? ' is-selected' : ''}`} key={item.id}>
          <label className="sale-row-check" onClick={(e) => e.stopPropagation()}>
            <input type="checkbox" checked={selectedIds.includes(item.id)} onChange={() => toggleSelectedId(item.id)}/>
          </label>
          <button type="button" className="sale-row-main" onClick={() => setEditing(item)}>
            <div><strong>{item.customer}</strong><span>{item.unit} · {item.documentType}{item.pointOfSale ? ` ${item.pointOfSale}-${item.documentNumber}` : ` ${item.documentNumber}`}</span></div>
            <span className="opportunity-stage">{item.date}</span>
            <div><strong>{item.currency === 'USD' ? `USD ${item.netAmount}` : money(item.netAmount)}</strong><span>Comisión {money(saleCommission(item, units))}{item.collected ? ' · Cobrada' : ''}</span></div>
          </button>
        </div>
      ))}{!filtered.length && <div className="empty-opportunities"><ReceiptText/><p>No hay ventas registradas en este período.</p></div>}</div>
    </section>
    {editing && (
      <SaleModal
        key={editing.id || 'new'}
        value={editing}
        sales={items}
        units={units}
        unitNames={unitNames}
        clients={clients}
        onClose={() => setEditing(null)}
        onSave={(value) => { onSave(normalizedSale(value, units)); setEditing(null); }}
        onDelete={editing.id ? () => { onDelete(editing.id); setEditing(null); } : null}
      />
    )}
  </div>;
}

const Sales = memo(SalesBase);
export default Sales;

function BulkReviewTable({ rows, selected, existingSales, units, unitNames, onToggle, onToggleAll, onChange, onDiscard, onSaveSelected }) {
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
              // Los borradores todavía no tienen id propio (comparten '' hasta
              // guardarse), así que duplicateSale() no sirve para compararlos
              // entre sí: comparamos por rowId en su lugar.
              const duplicate = duplicateSale(existingSales, row) || rows.find((item) =>
                item.rowId !== row.rowId &&
                item.unit === row.unit &&
                item.documentType === row.documentType &&
                String(item.pointOfSale || '') === String(row.pointOfSale || '') &&
                String(item.documentNumber || '') === String(row.documentNumber || ''),
              );
              const missingRate = row.currency === 'USD' && !(Number(row.exchangeRate) > 0);
              return (
                <tr key={row.rowId} className={duplicate ? 'duplicate' : ''}>
                  <td><input type="checkbox" checked={selected.includes(row.rowId)} onChange={() => onToggle(row.rowId)}/></td>
                  <td className="bulk-file-cell" title={row.sourceFile}>{row.sourceFile}{duplicate && <span className="bulk-duplicate-tag" title={`Ya existe: ${duplicate.customer}`}>duplicada</span>}</td>
                  <td><input type="date" value={row.date} onChange={(e) => onChange(row.rowId, 'date', e.target.value)}/></td>
                  <td>
                    <select value={row.unit} onChange={(e) => onChange(row.rowId, 'unit', e.target.value)}>
                      {unitNames.map((name) => <option key={name}>{name}</option>)}
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
                  <td>{missingRate ? <span className="bulk-missing-label" title="La factura no traía el tipo de cambio. Completalo o la comisión va a salir mal.">falta t. cambio</span> : money(saleCommission(row, units))}</td>
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

function SaleModal({ value, sales, units, unitNames, clients, onClose, onSave, onDelete }) {
  const confirm = useConfirm();
  const [form, setForm] = useState(value);
  const update = (name, value) => setForm((current) => ({ ...current, [name]: value }));
  const changeUnit = (unit) => setForm((current) => ({ ...current, unit, pointOfSale: current.documentType === 'Factura' ? (units[unit]?.invoicePoints[0] || '') : '' }));
  const duplicate = duplicateSale(sales, form);
  const clientNames = useMemo(() => [...new Set((clients || []).flatMap((client) => [client.company, client.legalName]).filter(Boolean))], [clients]);
  const customerTyped = (form.customer || '').trim();
  const matchesKnownClient = !customerTyped
    || clientNames.some((name) => name.trim().toLocaleLowerCase('es-AR') === customerTyped.toLocaleLowerCase('es-AR'));
  async function submit(event) {
    event.preventDefault();
    if (duplicate && !(await confirm(`Ya existe una venta con este mismo comprobante para ${duplicate.customer} (${money(duplicate.netAmount)}). ¿Guardar de todas formas?`))) return;
    onSave(form);
  }
  return <div className="modal-backdrop"><form className="modal" onSubmit={submit}>
    <div className="modal-head"><div><span className="eyebrow">Venta concretada</span><h2>{form.id ? 'Editar venta' : 'Registrar venta'}</h2><p>Ingresá el importe neto, sin IVA.</p></div><button type="button" className="icon-button" onClick={onClose} aria-label="Cerrar"><X/></button></div>
    {duplicate && <p className="form-warning"><AlertTriangle size={15}/> Ya existe una venta con este mismo comprobante ({duplicate.customer}, {money(duplicate.netAmount)}). Revisá antes de guardar para no duplicarla.</p>}
    <div className="form-grid">
      <label>Fecha<input required type="date" value={form.date} onChange={(e) => update('date', e.target.value)}/></label>
      <label>Unidad<select value={form.unit} onChange={(e) => changeUnit(e.target.value)}>{unitNames.map((name) => <option key={name}>{name}</option>)}</select></label>
      <label>Comprobante<select value={form.documentType} onChange={(e) => setForm((current) => ({ ...current, documentType: e.target.value, pointOfSale: e.target.value === 'Factura' ? (units[current.unit]?.invoicePoints[0] || '') : '' }))}><option>Factura</option><option>COT</option></select></label>
      {form.documentType === 'Factura' && <label>Punto de venta<select value={form.pointOfSale} onChange={(e) => update('pointOfSale', e.target.value)}>{(units[form.unit]?.invoicePoints || []).map((item) => <option key={item}>{item}</option>)}</select></label>}
      <label>Número (últimos 5)<input required inputMode="numeric" pattern="[0-9]{1,5}" maxLength="5" value={form.documentNumber} onChange={(e) => update('documentNumber', e.target.value.replace(/\D/g, '').slice(0, 5))}/></label>
      <label>Cliente<input required list="sale-customer-options" value={form.customer} onChange={(e) => update('customer', e.target.value)} placeholder="Razón social o nombre"/>
        <datalist id="sale-customer-options">{clientNames.map((name) => <option key={name} value={name}/>)}</datalist>
        {customerTyped && !matchesKnownClient && clientNames.length > 0 && (
          <small className="field-hint">No coincide con ningún cliente de tu cartera — revisá el nombre para que la venta se vincule a su ficha.</small>
        )}
      </label>
      <label>Familia<select value={form.family || ''} onChange={(e) => update('family', e.target.value)}><option value="">Sin definir</option>{FAMILIES.filter((item) => item !== 'Sin definir').map((item) => <option key={item}>{item}</option>)}</select></label>
      <label>Moneda de la factura<select value={form.currency || 'ARS'} onChange={(e) => update('currency', e.target.value)}><option value="ARS">Pesos</option><option value="USD">Dólares</option></select></label>
      <label>Importe neto sin IVA{form.currency === 'USD' ? ' (USD)' : ''}<input required type="number" min="0" step="0.01" value={form.netAmount} onChange={(e) => update('netAmount', e.target.value)}/></label>
      {form.currency === 'USD' && <label>Tipo de cambio de la factura<input required type="number" min="0" step="0.01" value={form.exchangeRate || ''} onChange={(e) => update('exchangeRate', e.target.value)} placeholder="Ej: 1530"/></label>}
      {form.currency === 'USD' && <label>Equivalente en pesos<input readOnly value={money(netAmountInArs(form))}/></label>}
      <label>Comisión calculada (en pesos)<input readOnly value={money(saleCommission(form, units))}/></label>
      <label className="checkbox-field"><input type="checkbox" checked={!!form.collected} onChange={(e) => update('collected', e.target.checked)}/> ¿Se cobró la comisión?</label>
      <label className="span-2">Notas<textarea value={form.notes || ''} onChange={(e) => update('notes', e.target.value)}/></label>
    </div>
    <div className="modal-actions">{onDelete && <button type="button" className="danger-link" onClick={onDelete}><Trash2 size={15}/> Eliminar venta</button>}<button type="button" className="secondary" onClick={onClose}>Cancelar</button><button className="primary">Guardar venta</button></div>
  </form></div>;
}

function blankBusinessUnit() {
  return { id: crypto.randomUUID(), name: '', legalName: '', cuit: '', ratePct: '', invoicePoints: [] };
}

function BusinessUnitsPanel({ businessUnits, onSave, onDelete }) {
  const units = Array.isArray(businessUnits) && businessUnits.length ? businessUnits : defaultBusinessUnits();
  const [editing, setEditing] = useState(null);
  const [pointDraft, setPointDraft] = useState('');

  function startEdit(unit) {
    setEditing({ ...unit });
    setPointDraft('');
  }
  function addPoint() {
    const point = pointDraft.trim().padStart(4, '0');
    if (!point || editing.invoicePoints.includes(point)) return;
    setEditing({ ...editing, invoicePoints: [...editing.invoicePoints, point] });
    setPointDraft('');
  }
  function removePoint(point) {
    setEditing({ ...editing, invoicePoints: editing.invoicePoints.filter((item) => item !== point) });
  }
  function save(event) {
    event.preventDefault();
    if (!editing.name.trim()) return;
    onSave({ ...editing, name: editing.name.trim(), ratePct: Number(editing.ratePct) || 0 });
    setEditing(null);
  }

  return (
    <section className="panel">
      <div className="panel-head">
        <div><span className="eyebrow">Configuración</span><h2>Unidades de negocio</h2><p>CUIT, razón social, nombre fantasía, comisión y puntos de venta de cada unidad — se usan en Ventas y Objetivos.</p></div>
      </div>
      <div className="units-list">
        {units.map((unit) => (
          <article className="unit-card" key={unit.id}>
            <div>
              <strong>{unit.name}</strong>
              <span>{unit.legalName || 'Sin razón social'}{unit.cuit ? ` · CUIT ${unit.cuit}` : ''}</span>
              <span>{unit.ratePct}% comisión · puntos de venta: {unit.invoicePoints?.length ? unit.invoicePoints.join(', ') : 'sin definir'}</span>
            </div>
            <div className="unit-card-actions">
              <button type="button" className="secondary" onClick={() => startEdit(unit)}>Editar</button>
              <button type="button" className="icon-button" aria-label="Eliminar unidad" onClick={() => onDelete(unit.id)}><Trash2 size={14}/></button>
            </div>
          </article>
        ))}
      </div>
      {!editing ? (
        <button type="button" className="secondary" onClick={() => startEdit(blankBusinessUnit())}><Plus size={15}/> Agregar unidad</button>
      ) : (
        <form className="form-grid" onSubmit={save}>
          <label>Nombre fantasía<input required value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} placeholder="Ej: Poliplast"/></label>
          <label>Razón social<input value={editing.legalName} onChange={(e) => setEditing({ ...editing, legalName: e.target.value })} placeholder="Ej: Grupo Poliplast S.R.L."/></label>
          <label>CUIT<input value={editing.cuit} onChange={(e) => setEditing({ ...editing, cuit: e.target.value })} placeholder="30-12345678-9"/></label>
          <label>Comisión (%)<input type="number" min="0" step="0.01" value={editing.ratePct} onChange={(e) => setEditing({ ...editing, ratePct: e.target.value })}/></label>
          <label className="span-2">
            Puntos de venta
            <div className="unit-points-editor">
              {editing.invoicePoints.map((point) => (
                <span className="unit-point-tag" key={point}>{point}<button type="button" onClick={() => removePoint(point)} aria-label={`Quitar ${point}`}><X size={11}/></button></span>
              ))}
              <input value={pointDraft} onChange={(e) => setPointDraft(e.target.value)} placeholder="0006" maxLength={4}/>
              <button type="button" className="secondary" onClick={addPoint}>Agregar</button>
            </div>
          </label>
          <div className="modal-actions span-2">
            <button type="button" className="secondary" onClick={() => setEditing(null)}>Cancelar</button>
            <button type="submit" className="primary">Guardar unidad</button>
          </div>
        </form>
      )}
    </section>
  );
}
