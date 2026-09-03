import { useMemo, useState } from 'react';
import { Download, Plus, ReceiptText, Trash2, X } from 'lucide-react';
import { blankSale, normalizedSale, saleCommission, salesToCsv, SALES_UNITS } from './sales-model.mjs';

const money = (value) => new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 2 }).format(value || 0);
const monthKey = (date) => String(date || '').slice(0, 7);

function exportSalesCsv(sales, month, unit) {
  const blob = new Blob([salesToCsv(sales)], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `ventas-${unit === 'Todas' ? 'todas' : unit.toLowerCase()}-${month || 'todos'}.csv`;
  anchor.click();
  URL.revokeObjectURL(url);
}

export default function Sales({ items, onSave, onDelete }) {
  const currentMonth = new Date().toISOString().slice(0, 7);
  const [month, setMonth] = useState(currentMonth);
  const [unit, setUnit] = useState('Todas');
  const [editing, setEditing] = useState(null);
  const filtered = useMemo(() => items.filter((item) =>
    (!month || monthKey(item.date) === month) && (unit === 'Todas' || item.unit === unit)
  ).sort((a, b) => String(b.date || '').localeCompare(String(a.date || ''))), [items, month, unit]);
  const net = filtered.reduce((sum, item) => sum + Number(item.netAmount || 0), 0);
  const commission = filtered.reduce((sum, item) => sum + saleCommission(item), 0);
  return <div className="content-stack">
    <section className="metrics-grid">
      <article className="metric-card"><span>Ventas registradas</span><strong>{filtered.length}</strong></article>
      <article className="metric-card"><span>Neto sin IVA</span><strong>{money(net)}</strong></article>
      <article className="metric-card"><span>Comisión estimada</span><strong>{money(commission)}</strong></article>
      <article className="metric-card"><span>Período</span><strong>{month || 'Todos'}</strong></article>
    </section>
    <section className="panel">
      <div className="panel-head"><div><span className="eyebrow">Resultado comercial</span><h2>Ventas realizadas</h2><p>Registro manual de Facturas y COT. La comisión se calcula sobre el importe neto sin IVA.</p></div><button className="primary" onClick={() => setEditing(blankSale())}><Plus size={17}/> Registrar venta</button></div>
      <div className="list-toolbar"><input type="month" value={month} onChange={(event) => setMonth(event.target.value)}/><select value={unit} onChange={(event) => setUnit(event.target.value)}><option>Todas</option><option>Poliplast</option><option>Poliocho</option></select><button type="button" className="secondary" onClick={() => exportSalesCsv(filtered, month, unit)} disabled={!filtered.length}><Download size={15}/> Exportar CSV</button></div>
      <div className="opportunity-list">{filtered.map((item) => <button className="opportunity-row" key={item.id} onClick={() => setEditing(item)}><div><strong>{item.customer}</strong><span>{item.unit} · {item.documentType}{item.pointOfSale ? ` ${item.pointOfSale}-${item.documentNumber}` : ` ${item.documentNumber}`}</span></div><span className="opportunity-stage">{item.date}</span><div><strong>{money(item.netAmount)}</strong><span>Comisión {money(saleCommission(item))}</span></div></button>)}{!filtered.length && <div className="empty-opportunities"><ReceiptText/><p>No hay ventas registradas en este período.</p></div>}</div>
    </section>
    {editing && <SaleModal value={editing} onClose={() => setEditing(null)} onSave={(value) => { onSave(normalizedSale(value)); setEditing(null); }} onDelete={editing.id ? () => { onDelete(editing.id); setEditing(null); } : null}/>} 
  </div>;
}

function SaleModal({ value, onClose, onSave, onDelete }) {
  const [form, setForm] = useState(value);
  const update = (name, value) => setForm((current) => ({ ...current, [name]: value }));
  const changeUnit = (unit) => setForm((current) => ({ ...current, unit, pointOfSale: current.documentType === 'Factura' ? SALES_UNITS[unit].invoicePoints[0] : '' }));
  return <div className="modal-backdrop"><form className="modal" onSubmit={(event) => { event.preventDefault(); onSave(form); }}>
    <div className="modal-head"><div><span className="eyebrow">Venta concretada</span><h2>{form.id ? 'Editar venta' : 'Registrar venta'}</h2><p>Ingresá el importe neto, sin IVA.</p></div><button type="button" className="icon-button" onClick={onClose} aria-label="Cerrar"><X/></button></div>
    <div className="form-grid">
      <label>Fecha<input required type="date" value={form.date} onChange={(e) => update('date', e.target.value)}/></label>
      <label>Unidad<select value={form.unit} onChange={(e) => changeUnit(e.target.value)}><option>Poliplast</option><option>Poliocho</option></select></label>
      <label>Comprobante<select value={form.documentType} onChange={(e) => setForm((current) => ({ ...current, documentType: e.target.value, pointOfSale: e.target.value === 'Factura' ? SALES_UNITS[current.unit].invoicePoints[0] : '' }))}><option>Factura</option><option>COT</option></select></label>
      {form.documentType === 'Factura' && <label>Punto de venta<select value={form.pointOfSale} onChange={(e) => update('pointOfSale', e.target.value)}>{SALES_UNITS[form.unit].invoicePoints.map((item) => <option key={item}>{item}</option>)}</select></label>}
      <label>Número (últimos 5)<input required inputMode="numeric" pattern="[0-9]{1,5}" maxLength="5" value={form.documentNumber} onChange={(e) => update('documentNumber', e.target.value.replace(/\D/g, '').slice(0, 5))}/></label>
      <label>Cliente<input required value={form.customer} onChange={(e) => update('customer', e.target.value)} placeholder="Razón social o nombre"/></label>
      <label>Importe neto sin IVA<input required type="number" min="0" step="0.01" value={form.netAmount} onChange={(e) => update('netAmount', e.target.value)}/></label>
      <label>Comisión calculada<input readOnly value={money(saleCommission(form))}/></label>
      <label className="span-2">Notas<textarea value={form.notes || ''} onChange={(e) => update('notes', e.target.value)}/></label>
    </div>
    <div className="modal-actions">{onDelete && <button type="button" className="danger-link" onClick={onDelete}><Trash2 size={15}/> Eliminar venta</button>}<button type="button" className="secondary" onClick={onClose}>Cancelar</button><button className="primary">Guardar venta</button></div>
  </form></div>;
}
