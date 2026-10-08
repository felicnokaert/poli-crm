// Tipo de cliente segun lo que compra (aplicador, inyeccion, fabricante...), con
// correccion manual. Port de mapa-cobertura/etl/clasificacion.py: misma regla, en
// este orden. Una correccion manual (client.tipoCliente) SIEMPRE manda sobre la regla.
export const TIPOS_CLIENTE = ['aplicador', 'inyeccion', 'fabricante', 'no_aplica', 'otro'];

const SP = /(^|[\s\d])SP[A-Z]?\s*$/i;
const IR = /(^|\s)IR(\s|$)/i;

const esProductoSp = (nombre) => SP.test(String(nombre).trim());
const esIsocianato = (nombre) => String(nombre).trim().toUpperCase().startsWith('ISO');

// productos: [{ producto }] -> 'aplicador' | 'inyeccion' | 'fabricante' | 'otro' | null
export function sugerirTipo(productos = []) {
  const nombres = productos.map((p) => String(p?.producto ?? '')).filter(Boolean);
  if (nombres.some(esProductoSp)) return 'aplicador';
  if (nombres.some((n) => IR.test(n))) return 'inyeccion';
  if (nombres.some((n) => n.toUpperCase().includes('VISCO'))) return 'fabricante';
  if (nombres.some((n) => !esIsocianato(n))) return 'otro';
  return null; // solo isocianatos (los compran todos) o sin productos
}

export function tipoAEsAplicador(tipo) {
  return tipo ? (tipo === 'aplicador' ? 'si' : 'no') : null;
}

// manual: { tipoCliente, tipoClienteNota } del registro del CRM.
export function resolverTipo(productos, manual = {}) {
  const auto = sugerirTipo(productos);
  const elegido = TIPOS_CLIENTE.includes(manual?.tipoCliente) ? manual.tipoCliente : null;
  const tipo = elegido || auto;
  return {
    tipo,
    tipo_auto: auto,
    tipo_origen: elegido ? 'manual' : (auto ? 'auto' : null),
    tipo_nota: String(manual?.tipoClienteNota ?? ''),
    es_aplicador: tipoAEsAplicador(tipo),
  };
}

// Aplica una correccion del mapa (tipo vacio = volver al automatico) al registro de
// cliente del CRM. Devuelve un cliente nuevo; no muta el original.
export function conTipoManual(cliente, tipoCliente, nota = '') {
  const siguiente = { ...cliente };
  if (TIPOS_CLIENTE.includes(tipoCliente)) siguiente.tipoCliente = tipoCliente;
  else delete siguiente.tipoCliente;
  const textoNota = String(nota ?? '').trim().slice(0, 300);
  if (textoNota) siguiente.tipoClienteNota = textoNota;
  else delete siguiente.tipoClienteNota;
  siguiente.updatedAt = new Date().toISOString();
  return siguiente;
}
