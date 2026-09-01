export function inferIntent(text = '') {
  const value = text.toLowerCase();
  if (/reclamo|queja|vino mal|lleg[oó] roto|no funciona|problema con el pedido/.test(value)) return 'Reclamo';
  if (/ya compr[eé]|compramos|pedido anterior|garant[ií]a|factura|env[ií]o|entrega/.test(value)) return 'Postventa';
  if (/volver a comprar|reponer|reposici[oó]n|otra vez|mismo pedido/.test(value)) return 'Recompra';
  if (/ficha t[eé]cnica|rendimiento|aplicaci[oó]n|sirve para|compatib|temperatura|curado/.test(value)) return 'Consulta técnica';
  if (/precio|cotiz|cu[aá]nto sale|valor|presupuesto/.test(value)) return 'Precio / cotización';
  if (/quiero comprar|necesito comprar|confirmo|haceme el pedido|stock|cu[aá]ntas unidades/.test(value)) return 'Compra';
  if (/m[aá]s informaci[oó]n|informaci[oó]n|consulta|quisiera saber|quiero saber/.test(value)) return 'Información';
  return 'A confirmar';
}
