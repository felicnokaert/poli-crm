// Convierte los clientes del CRM al contrato que lee el mapa de cobertura
// (public/mapa/app.js; ver mapa-cobertura/docs/INTEGRACION_CRM.md). Las compras
// salen de `client.polio8` (importación POLIOCHO) o, si no hay, de los campos
// lastPurchase/totalPurchases que ya traía la base.
import { normClave, provinciaCanonica } from './georef.mjs';

const soloDigitos = (valor) => String(valor ?? '').replace(/\D/g, '');

export function formatCuit(doc) {
  return doc.length === 11 ? `${doc.slice(0, 2)}-${doc.slice(2, 10)}-${doc.slice(10)}` : doc;
}

// El CRM guarda lastPurchase como DD/MM/AAAA; el mapa espera ISO (AAAA-MM-DD).
export function isoFromCrmDate(texto) {
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(String(texto ?? '').trim());
  return match ? `${match[3]}-${match[2]}-${match[1]}` : null;
}

function mayorFecha(...fechas) {
  return fechas.filter(Boolean).sort().pop() || null;
}

function productosDe(polio8) {
  return (polio8?.products || [])
    .filter((p) => p?.name)
    .map((p) => ({ producto: p.name, veces: Number(p.times) || 0, kg: Number(p.qty) || 0, ultima: p.last || null }));
}

// Antes de ubicar: arma el cliente con todos los campos menos lat/lon/depto_id/precision.
export function toMapClient(crm = {}) {
  const doc = soloDigitos(crm.cuit) || String(crm.id || '');
  if (!doc) return null;
  const polio8 = crm.polio8 || null;
  const facturado = polio8 ? polio8.invoiced === true : true;
  const fechaPolio = polio8?.lastDate ? String(polio8.lastDate).slice(0, 10) : null;
  const ultimaCompra = mayorFecha(isoFromCrmDate(crm.lastPurchase), facturado ? fechaPolio : null);
  const nCompras = (facturado ? Number(polio8?.documents) : 0) || Number(crm.totalPurchases) || 0;
  const compro = Boolean(ultimaCompra) || (polio8 && !facturado && crm.purchaseWithoutInvoice === true);
  const provincia = provinciaCanonica(crm.province);
  const sinFactura = polio8 && !facturado;
  return {
    doc,
    cuit: formatCuit(doc),
    tipo_doc: doc.length === 11 ? 'CUIT' : 'DNI',
    razon_social: String(crm.legalName || crm.company || '').trim() || 'Sin nombre',
    email: crm.email || '',
    telefono: crm.phone || '',
    domicilio: crm.address || '',
    cp: crm.postalCode || '',
    provincia_cod: provincia?.cod || null,
    provincia: provincia?.nombre || String(crm.province || ''),
    localidad: String(crm.city || '').trim(),
    compro: Boolean(compro),
    // Compra sin factura: la fecha de la última cotización hace de última compra (aproximada).
    ultima_compra: ultimaCompra || (sinFactura ? fechaPolio : null),
    n_facturas: nCompras,
    n_cotizaciones: sinFactura ? Number(polio8.documents) || 0 : 0,
    ultima_cotizacion: sinFactura ? fechaPolio : null,
    productos: productosDe(polio8),
    es_aplicador: crm.esAplicador === 'si' || crm.esAplicador === 'no' ? crm.esAplicador : null,
  };
}

export function buildMapClients(crmClients = [], geoPorDoc = new Map()) {
  const vistos = new Set();
  const salida = [];
  for (const crm of crmClients) {
    const base = toMapClient(crm);
    if (!base || vistos.has(base.doc)) continue;
    vistos.add(base.doc);
    const geo = geoPorDoc.get(base.doc) || {};
    salida.push({
      ...base,
      lat: geo.lat ?? null,
      lon: geo.lon ?? null,
      depto_id: geo.depto_id ?? null,
      precision: geo.precision ?? null,
      motivo_aprox: geo.motivo_aprox ?? null,
    });
  }
  return salida;
}

// Solo lo que el mapa necesita para ubicar (para pasarle a ubicarClientes).
export function clientsToLocate(mapClients) {
  return mapClients.map((c) => ({ doc: c.doc, provincia_cod: c.provincia_cod, localidad: normClave(c.localidad) ? c.localidad : '' }));
}
