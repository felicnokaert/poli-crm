import { normalizeCommissionFloor } from './sales-model.mjs';

const fmt = (value, currency) => new Intl.NumberFormat('es-AR', { style: 'currency', currency, maximumFractionDigits: 0 }).format(value || 0);

// Piso de comisión: desde cuánto vendido en el mes empieza a cobrarse. Lo edita cada comercial.
export default function CommissionFloorPanel({ floor, units, months, month, onChange }) {
  const value = normalizeCommissionFloor(floor);
  const unitNames = Object.keys(units || {});
  const set = (patch) => onChange({ ...(floor && typeof floor === 'object' ? floor : {}), ...patch });
  const toggleUnit = (name) => set({ units: value.units.includes(name) ? value.units.filter((item) => item !== name) : [...value.units, name] });
  const isExempt = (unit, point) => value.exempt.some((item) => item.unit === unit && item.point === point);
  const toggleExempt = (unit, point) => set({ exempt: isExempt(unit, point) ? value.exempt.filter((item) => !(item.unit === unit && item.point === point)) : [...value.exempt, { unit, point }] });
  const entry = months?.[month];
  return (
    <section className="panel floor-panel" id="piso-comision">
      <div className="panel-head">
        <div>
          <span className="eyebrow">Configuración</span>
          <h2>Piso de comisión</h2>
          <p>Desde cuánto vendido en el mes empezás a cobrar. Por debajo del piso la comisión es cero; al llegar, cobrás la comisión de todas las ventas del mes con el mismo porcentaje de siempre.</p>
        </div>
      </div>
      <label className="floor-switch"><input type="checkbox" checked={!!floor?.enabled} onChange={(event) => set({ enabled: event.target.checked })}/><span>Usar piso de comisión</span></label>
      <div className="floor-fields">
        <label>Piso mensual<input type="number" min="0" step="1" value={floor?.amount ?? ''} onChange={(event) => set({ amount: event.target.value })} placeholder="Ej. 10000"/></label>
        <label>En<select value={value.currency} onChange={(event) => set({ currency: event.target.value })}><option value="USD">Dólares (neto sin IVA)</option><option value="ARS">Pesos (neto sin IVA)</option></select></label>
        {value.currency === 'USD' && <label>Dólar para ventas en pesos<input type="number" min="0" step="1" value={floor?.fallbackRate ?? ''} onChange={(event) => set({ fallbackRate: event.target.value })} placeholder="Solo si hay ventas en pesos"/></label>}
      </div>
      <fieldset className="floor-group">
        <legend>Unidades a las que se les aplica (ninguna tildada = todas)</legend>
        {unitNames.map((name) => <label key={name} className="floor-chip"><input type="checkbox" checked={value.units.includes(name)} onChange={() => toggleUnit(name)}/><span>{name}</span></label>)}
      </fieldset>
      <fieldset className="floor-group">
        <legend>Puntos de venta que NO cuentan para el piso (cobran siempre)</legend>
        {unitNames.flatMap((name) => (units[name].invoicePoints || []).filter(Boolean).map((point) => (
          <label key={`${name}-${point}`} className="floor-chip"><input type="checkbox" checked={isExempt(name, point)} onChange={() => toggleExempt(name, point)}/><span>{name} · {point}</span></label>
        )))}
      </fieldset>
      {floor?.enabled && value.enabled && (
        <p className="muted">
          {entry
            ? `${month}: vendido ${fmt(entry.total, value.currency)} de ${fmt(value.amount, value.currency)}. ${entry.reached ? 'Llegaste al piso: se cobra la comisión del mes.' : `Te faltan ${fmt(entry.missing, value.currency)} para empezar a cobrar.`}`
            : `${month || 'Este período'}: todavía no hay ventas que cuenten para el piso.`}
        </p>
      )}
    </section>
  );
}
