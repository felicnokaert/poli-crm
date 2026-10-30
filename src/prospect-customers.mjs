// «Ya es cliente de Contabilium» (señal 9 de Harvey, 31/10): un prospecto que ya nos compró sale de la cola y pasa a cartera.
// Se empareja con las fichas de Contabilium (contabilium_clientes) por teléfono (últimos 8 dígitos), CUIT o nombre. Puro y testeado.
import { cuitKey, nameKey, phoneKey } from './customer-base.mjs';

// rows: filas de contabilium_clientes ({razon_social, cuit, telefono}). Devuelve el conjunto de claves.
export function customerKeys(rows = []) {
  const keys = new Set();
  for (const row of rows || []) {
    for (const key of [nameKey(row.razon_social), cuitKey(row.cuit), phoneKey(row.telefono)]) if (key) keys.add(key);
  }
  return keys;
}

export function isBillingCustomer(prospect = {}, keys = null) {
  if (!keys || !keys.size) return false;
  const name = nameKey(prospect.company);
  return Boolean((name && keys.has(name)) || (phoneKey(prospect.phone) && keys.has(phoneKey(prospect.phone))));
}
