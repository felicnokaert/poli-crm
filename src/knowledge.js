export const RUBRIC = [
  ['apertura', 'Apertura', '¿Abrió con una hipótesis específica y no con el catálogo?'],
  ['identificacion', 'Identificación', '¿Confirmó empresa, rubro y persona/rol?'],
  ['necesidad', 'Necesidad', '¿Entendió el problema real antes de ofrecer?'],
  ['aplicacion', 'Aplicación', '¿Registró el uso concreto del producto?'],
  ['volumen', 'Volumen', '¿Confirmó cantidad y frecuencia?'],
  ['urgencia', 'Urgencia', '¿Confirmó fecha o plazo real?'],
  ['proveedor', 'Proveedor actual', '¿Conoció proveedor y motivo de posible cambio?'],
  ['decisor', 'Decisor', '¿Identificó quién decide y cómo se aprueba?'],
  ['escucha', 'Escucha', '¿Respondió a lo que el cliente realmente dijo?'],
  ['propuesta', 'Propuesta', '¿Fue específica y respaldada cuando correspondía?'],
  ['objecion', 'Objeción', '¿Identificó y trató la objeción real?'],
  ['proximo_paso', 'Próximo paso', '¿Quedó una acción concreta y responsable?'],
  ['seguimiento', 'Seguimiento', '¿Quedó fecha o disparador agendado?'],
  ['tono', 'Tono y claridad', '¿Fue claro y adaptado al interlocutor?'],
];

export const QUICK_REPLIES = {
  general: [
    ['Primera respuesta', 'Agradecer y preguntar por el uso o proyecto. No enviar lista de precios primero.'],
    ['Diagnóstico', 'Confirmar aplicación, volumen aproximado y plazo en un mensaje breve.'],
    ['Datos técnicos', 'Solicitar únicamente datos respaldados por la ficha de la familia. Requiere validación técnica.'],
    ['Volumen', 'Preguntar cantidad y si la compra es única o recurrente antes de cotizar.'],
    ['Derivación técnica', 'Explicar qué debe revisar el técnico y confirmar cuándo se retomará la conversación.'],
    ['Envío de ficha', 'Enviar una ficha vigente ya existente; nunca redactarla desde el chat.'],
    ['Preparar cotización', 'Confirmar aplicación, volumen, plazo y destino. El copiloto no fija precios.'],
    ['Falta de stock', 'Comunicar el plazo confirmado y ofrecer alternativa solo si está validada.'],
    ['Seguimiento', 'Retomar el punto exacto y aportar algo nuevo; evitar “¿alguna novedad?”.'],
    ['Cierre', 'Confirmar producto, cantidad, plazo y condiciones autorizadas por escrito.'],
    ['Postventa', 'Confirmar recepción y consultar si hubo inconvenientes de aplicación.'],
    ['Recompra', 'Contactar por un disparador real o estimado, nunca con un mensaje masivo.'],
  ],
  penosil: [
    ['Identificar producto', 'Confirmar qué producto Penosil consulta antes de responder.'],
    ['Superficie y aplicación', 'Preguntar superficie, contexto y objetivo de la aplicación.'],
    ['Rendimiento', 'Responder solo con ficha oficial vigente. Requiere validación técnica.'],
    ['Preparación', 'Usar únicamente pasos de ficha o manual. Requiere validación técnica.'],
    ['Compatibilidad', 'Confirmar con documentación; derivar si no está respaldado.'],
    ['Modo de uso', 'Dar instrucciones básicas documentadas y derivar casos no estándar.'],
    ['Consulta técnica', 'Derivar formulación, comportamiento químico, garantía o fallas.'],
    ['Ficha o video', 'Elegir material vigente acorde al caso; no describir de memoria.'],
    ['Precio o cotización', 'Confirmar volumen y condiciones vigentes. Requiere validación comercial.'],
    ['Seguimiento', 'Retomar el punto técnico específico y aportar material o pregunta útil.'],
    ['Postventa', 'Confirmar la aplicación y derivar problemas sin diagnosticar por chat.'],
    ['Complementarios', 'Sugerir después de una aplicación o compra exitosa confirmada.'],
  ],
};

export const ROLE_PLAYS = [
  ['Solo pide precio', 'Redirigir a aplicación y volumen sin sonar evasivo.'],
  ['Ya tiene proveedor', 'Descubrir el motivo real de apertura sin atacar al competidor.'],
  ['Problema técnico', 'Derivar correctamente sin prometer un diagnóstico por WhatsApp.'],
  ['Penosil sin contexto', 'Confirmar producto, superficie y aplicación antes de responder.'],
  ['Dejó de responder', 'Aportar valor nuevo y decidir si seguir o pausar.'],
];

export const CLASSIFICATIONS = {
  clientTypes: ['Desconocido', 'Aplicador', 'Fabricante', 'Carrocero', 'Refrigeración industrial', 'Constructora', 'Distribuidor', 'Consumidor final'],
  industries: ['Desconocida', 'Construcción', 'Frío industrial', 'Automotriz / carrocero', 'Náutica', 'Packaging', 'Otra'],
  fit: ['A confirmar', 'Bajo', 'Medio', 'Alto'],
  urgency: ['A confirmar', 'Sin plazo', '7–30 días', 'Inmediata (<7 días)'],
  potential: ['Hipótesis baja', 'Hipótesis media', 'Hipótesis alta', 'Confirmado por volumen/recurrencia'],
};

export function scoreBand(score) {
  if (score <= 14) return { label: 'A reforzar', tone: 'danger' };
  if (score <= 21) return { label: 'Aceptable', tone: 'warning' };
  return { label: 'Modelo', tone: 'success' };
}
