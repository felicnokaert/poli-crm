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


// Mensajes listos para copiar y editar (voseo, sin precios ni datos técnicos inventados).
// Los corchetes se completan a mano. Nunca se envían desde el CRM.
export const REPLY_TEMPLATES = {
  general: {
    'Primera respuesta': 'Hola [nombre], gracias por escribirnos. Para ayudarte bien: ¿para qué lo vas a usar o qué proyecto tenés? Con eso te digo qué te conviene.',
    'Diagnóstico': 'Perfecto, [nombre]. Para recomendarte bien necesito confirmar tres cosas: ¿qué aplicación es, qué cantidad aproximada necesitás y para cuándo lo precisás?',
    'Datos técnicos': 'Buena pregunta, [nombre]. Para no darte un dato que no esté respaldado, lo reviso con la ficha vigente y te confirmo hoy. ¿Me contás en qué aplicación lo vas a usar?',
    'Volumen': '[nombre], para ver la mejor opción: ¿es una compra puntual o la vas a repetir? ¿Y qué cantidad aproximada manejás?',
    'Derivación técnica': '[nombre], esto lo tiene que revisar el equipo técnico para no equivocarnos. Les paso tu consulta y te respondo [cuándo] con lo que digan.',
    'Envío de ficha': '[nombre], te paso la ficha vigente de [producto]. Si después de leerla te queda alguna duda sobre tu aplicación, decime y lo vemos.',
    'Preparar cotización': 'Gracias, [nombre]. Para preparar la cotización necesito confirmar: aplicación, cantidad, plazo y destino de entrega. Con eso te la armamos.',
    'Falta de stock': '[nombre], hoy no tenemos [producto] disponible. El plazo confirmado de reposición es [plazo]. Si te sirve, te aviso apenas ingrese.',
    'Seguimiento': 'Hola [nombre], retomo lo que hablamos sobre [tema puntual]. Te comparto [dato o material nuevo]. ¿Cómo lo ves?',
    'Cierre': 'Perfecto, [nombre]. Confirmo: [producto], [cantidad], entrega [plazo], condiciones [las autorizadas por escrito]. Si está todo bien, avanzamos.',
    'Postventa': 'Hola [nombre], ¿cómo te fue con [producto]? ¿Llegó todo bien y pudiste aplicarlo sin inconvenientes?',
    'Recompra': 'Hola [nombre], por lo que me contaste, a esta altura te estaría quedando poco [producto]. ¿Querés que lo preparemos para la próxima?',
  },
  penosil: {
    'Identificar producto': 'Hola [nombre], gracias por escribir. ¿Cuál de los productos Penosil estás consultando? Si me pasás el nombre o una foto del envase, te ayudo mejor.',
    'Superficie y aplicación': '[nombre], ¿sobre qué superficie lo vas a aplicar, es interior o exterior y qué querés lograr (sellar, pegar, aislar)?',
    'Rendimiento': 'Para darte el dato correcto lo tomo de la ficha oficial vigente y te lo confirmo, [nombre]. ¿Para qué aplicación lo necesitás?',
    'Preparación': '[nombre], los pasos de preparación están en la ficha del producto. Te los paso tal cual para que no haya errores.',
    'Compatibilidad': 'Para confirmarte la compatibilidad lo reviso en la documentación, [nombre]. ¿Con qué material o superficie lo vas a usar?',
    'Modo de uso': '[nombre], el modo de uso básico es el que figura en el envase y en la ficha. Si tu caso es particular, lo consulto con el equipo técnico y te aviso.',
    'Consulta técnica': 'Gracias por el detalle, [nombre]. Esto lo tiene que ver el equipo técnico; les paso tu consulta y te respondo con lo que indiquen.',
    'Ficha o video': '[nombre], te paso [la ficha / el video] de [producto] que explica justo lo que preguntás. Cualquier duda me avisás.',
    'Precio o cotización': '[nombre], ¿qué cantidad necesitás y es compra única o recurrente? Con eso te confirmo condiciones vigentes.',
    'Seguimiento': 'Hola [nombre], ¿pudiste probar [producto] en [aplicación]? Si te quedó alguna duda técnica, contame y la vemos.',
    'Postventa': '[nombre], ¿cómo salió la aplicación? Si tuviste algún problema, contame qué pasó y lo derivo al equipo técnico.',
    'Complementarios': 'Qué bueno que te funcionó, [nombre]. Para esa misma tarea, mucha gente suele usar también [producto complementario]. ¿Te cuento?',
  },
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
