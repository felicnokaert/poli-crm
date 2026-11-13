// Respuestas rápidas para WhatsApp (3/11, pedido de Felipe: «respuestas rápidas a todo, lo de Academia comercial,
// proceso y método E-C-E-R-A»). Textos listos para copiar y editar. Reglas: no inventan precios, stock, plazos ni
// condiciones; primero se entiende (Escuchar-Confirmar-Explorar) y recién después se responde y se acuerda.
// {nombre} se reemplaza por el nombre del contacto; {yo} por el de quien escribe.
export const QUICK_GROUPS = Object.freeze([
  ['foco', 'Foco de venta (poliuretano, PRFV, planchas, cortina)'],
  ['apertura', 'Abrir la charla'],
  ['diagnostico', 'Entender qué necesita'],
  ['objecion', 'Objeciones (E-C-E-R-A)'],
  ['revendedor', 'Revendedores'],
  ['seguimiento', 'Seguimiento'],
  ['cierre', 'Acordar el próximo paso'],
  ['derivar', 'Pasarlo con alguien'],
  ['salida', 'Cuando no es por ahí'],
]);

const r = (group, title, text, tip = '') => ({ id: `${group}-${title}`.toLowerCase().replace(/[^a-z0-9áéíóúñ]+/g, '-'), group, title, text, tip });

export const QUICK_REPLIES = Object.freeze([
  // Foco de venta (13/11, reunión de Felipe): poliuretano para colchones, sillones, inyección y aberturas; dosificado; PRFV; planchas; cortina Cristal
  r('foco', 'Poliuretano dosificado (colchones, sillones, muebles)', 'Hola {nombre}, soy {yo} de Grupo Poliplast. Les vendemos poliol e isocianato por kilo, dosificado, sin tener que comprar un tambor entero. ¿Hoy fabrican espuma propia para colchones o sillones, o la compran ya hecha?', 'Pregunta clave: si hace su espuma, es cliente; si la compra hecha, no.'),
  r('foco', 'Poliuretano rígido por kilo (inyección: heladeras, frío, aberturas)', 'Hola {nombre}, soy {yo} de Grupo Poliplast. Tenemos sistema de poliuretano rígido para inyección (aislación de heladeras, equipos de frío, aberturas), y lo vendemos por kilo, en la cantidad que necesiten. ¿Qué usan hoy para inyectar y cuánto consumen por mes?', 'Producto + consumo mensual = calificado.'),
  r('foco', 'Poliuretano para piezas ortopédicas', 'Hola {nombre}, soy {yo} de Grupo Poliplast. Vendemos poliuretano en pequeñas cantidades para hacer piezas y plantillas ortopédicas. ¿Con qué material trabajan hoy y qué volumen usan por mes?', ''),
  r('foco', 'Resinas fraccionadas (epoxi, poliéster)', 'Hola {nombre}, soy {yo} de Grupo Poliplast. Vendemos resinas (epoxi y poliéster) fraccionadas, desde kilos, en baldes y envases chicos. ¿Qué trabajos hacen (reparación, moldes, fibra) y cuánto resina usan por mes?', 'Somos revendedores: nuestro fuerte es lo fraccionado, no el tambor.'),
  r('foco', 'PRFV importado (carroceros, remolques)', 'Hola {nombre}, soy {yo} de Grupo Poliplast. Importamos placas de PRFV para carrocerías y cajas. ¿Cuánto PRFV usan por mes y de qué espesores? Te cuento qué tenemos.', ''),
  r('foco', 'Planchas de poliuretano (carrozados, frío, módulos)', 'Hola {nombre}, soy {yo} de Grupo Poliplast. Tenemos planchas de poliuretano para cajas aisladas, frío y módulos. ¿Qué espesores y cuántas planchas usan por mes?', ''),
  r('foco', 'Rollos de cortina Cristal', 'Hola {nombre}, soy {yo} de Grupo Poliplast. Tenemos rollos de cortina de PVC Cristal. ¿Hoy compran cortina para frío, divisiones o portones? Te cuento medidas y espesores que tenemos.', 'Para quienes ya compraron cortinas o bandas PVC.'),
  r('foco', 'Reactivar cliente con dosificado', 'Hola {nombre}, ¿cómo andás? Soy {yo} de Grupo Poliplast. Hace tiempo que no nos comprás y quería contarte que ahora vendemos poliuretano y resinas dosificado, por kilo. ¿Te sirve para lo que estás haciendo?', ''),
  // Abrir la charla
  r('apertura', 'Primer contacto (aplicador / fabricante)', 'Hola {nombre}, soy {yo} de Grupo Poliplast. Vi que trabajan con espumas, resinas y sistemas de poliuretano y quería preguntarte algo rápido: ¿hoy compran ese tipo de materiales o los trabajan con otro proveedor?', 'Una sola pregunta y fácil de contestar.'),
  r('apertura', 'Primer contacto (revendedor)', 'Hola {nombre}, soy {yo} de Grupo Poliplast. Vi que venden productos de este rubro. ¿Tienen una línea de resinas, selladores o espumas, o les interesaría sumar productos con rotación?', 'Si no fabrica, no es su cliente directo: se lo trata como revendedor.'),
  r('apertura', 'Primer contacto corto (directo)', 'Hola {nombre}, soy {yo} de Grupo Poliplast. ¿Con quién puedo hablar de compras de materiales (espumas, resinas, sellantes)?', 'Cuando no sabés quién decide.'),
  r('apertura', 'Si preguntan «¿quién sos / de dónde sacaste mi número?»', 'Soy {yo}, de Grupo Poliplast. Los contacto porque su empresa figura en [su web / el mapa] como parte del rubro. Si prefieren que no los escriba, me avisan y no los molesto más.', 'Respuesta honesta y breve; si piden que no, marcá «No contactar nunca».'),
  r('apertura', 'Si preguntan «¿qué venden?»', 'Grupo Poliplast tiene espumas de poliuretano, resinas epoxi y poliéster (Resinplast), selladores y adhesivos (Penosil), y la red de aplicadores RAPYP. ¿Qué es lo que más usan ustedes? Así te cuento lo que tenga sentido.', 'No tires el catálogo: preguntá qué usan.'),
  // Entender qué necesita
  r('diagnostico', 'Qué usa hoy', '¿Qué producto usan hoy para eso y cuánto aproximadamente por mes?', 'Producto + volumen es lo mínimo para calificar.'),
  r('diagnostico', 'Para qué lo necesita', '¿Para qué trabajo o aplicación lo necesitás? (superficie, medidas, espesor)', 'Con eso se recomienda el producto correcto.'),
  r('diagnostico', 'Cada cuánto compra', '¿Es una compra puntual para una obra o algo que compran seguido?', 'Distingue prueba, obra única y consumo recurrente.'),
  r('diagnostico', 'Quién decide', '¿Quién decide las compras de materiales en la empresa? Así te paso la información a la persona correcta.', 'Sin desplazar al contacto original.'),
  r('diagnostico', 'Para cuándo', '¿Para cuándo lo necesitarías?', 'Antes de prometer fecha, se verifica stock y logística.'),
  r('diagnostico', 'Qué le preocupa del proveedor actual', '¿Qué es lo que más valorás de tu proveedor actual y qué mejorarías si pudieras?', 'Nunca criticar al proveedor.'),
  // Objeciones: confirmar + explorar + responder + acordar
  r('objecion', 'Es caro / precio', 'Te entiendo, el precio importa. ¿Con qué lo estás comparando y qué incluye esa otra opción? Así te muestro qué incluye el nuestro (respaldo técnico, ficha, soporte) y vemos si cierra.', 'No bajar el precio primero.'),
  r('objecion', 'Ya tengo proveedor', 'Qué bueno que ya tengas quien te provea. ¿Qué valorás de él y qué te gustaría mejorar? Si querés, podés probarnos con un pedido chico y complementario, sin cambiar nada de lo que hoy te funciona.', 'Proponer prueba puntual; no criticar al proveedor.'),
  r('objecion', 'Mandame información', 'Dale, te la mando. Para que te sirva y no sea un catálogo entero: ¿qué decisión querés poder tomar con esa información? (producto, precio, ficha técnica)', 'Material breve y específico.'),
  r('objecion', 'Lo tengo que pensar / consultar', 'Perfecto, es una decisión importante. ¿Qué parte querés evaluar o qué te van a preguntar? Si quieres, te dejo un resumen para compartir y quedamos en hablar [día].', 'Resolver el punto pendiente y acordar retoma.'),
  r('objecion', 'No es el momento', 'Entendido. ¿Qué tendría que pasar para que sea prioridad? Cuando llegue ese momento acá estamos. ¿Te escribo en [mes] para ver cómo va?', 'Nunca fabricar urgencia.'),
  r('objecion', 'No sé si sirve / rendimiento', 'Es una duda válida. ¿Qué condición de uso te preocupa más (superficie, temperatura, exposición)? Con ese dato te paso la ficha técnica y lo validamos con el área técnica antes de que compres.', 'No prometer rendimiento de memoria.'),
  r('objecion', 'Necesito poco', 'Perfecto. ¿Es una prueba, un trabajo puntual o un consumo chico pero seguido? Con eso te digo qué presentación te conviene.', 'Ofrecer presentación adecuada o canal minorista.'),
  r('objecion', 'No los conozco', 'Tiene sentido pedir referencias. Somos Grupo Poliplast y también trabajamos con Mercado Libre y tienda online. ¿Qué te daría más confianza para evaluarnos: fichas técnicas, trabajos hechos o empezar con un pedido chico?', 'Usar evidencia real, no inventar casos.'),
  r('objecion', 'Lo decide otra persona', 'Gracias por contarme. ¿Cómo te puedo ayudar a presentárselo? Si querés, armo un resumen corto o hablo directamente con esa persona con vos en copia.', 'No desplazar al contacto original.'),
  r('objecion', 'Necesito entrega inmediata', 'Entendido. ¿Cuál es la fecha límite real y qué pasa después de esa fecha? Verifico stock y logística antes de confirmarte una fecha.', 'No comprometer fecha sin verificar.'),
  r('objecion', 'Condiciones de pago', 'Claro. ¿Qué condición te funcionaría mejor para este pedido? Lo consulto con el área comercial y te respondo.', 'Validar antes de comprometer financiación.'),
  r('objecion', 'Quiero probar antes', 'Buena idea. ¿Qué cantidad te permitiría probar sin un compromiso grande? Armamos una prueba chica y vemos juntos cómo te va.', 'Prueba acotada con seguimiento.'),
  // Revendedores
  r('revendedor', 'Ya revendo otra marca', 'Perfecto, no hace falta cambiar lo que tenés. Podrías sumar una línea inicial chica y complementaria (3 a 5 productos con rotación) y ver cómo responde tu cliente. ¿Qué es lo que más se te vende hoy?', 'Surtido complementario, sin inventar condiciones.'),
  r('revendedor', 'Pregunta por mínimos y márgenes', 'Eso lo define el área comercial según el surtido. Si me decís qué productos te interesan y qué volumen mensual manejás, lo consulto y te paso las condiciones por escrito.', 'No inventar mínimos ni descuentos.'),
  r('revendedor', 'No fabrica ni aplica (no es el perfil)', 'Gracias por contarme. Si en algún momento suman línea de resinas o selladores, me escribís y vemos. Mientras tanto no te molesto más.', 'Y marcarlo como no prioritario en el CRM.'),
  // Seguimiento
  r('seguimiento', 'Sin respuesta (a los 3 días)', 'Hola {nombre}, te escribí hace unos días. ¿Pudiste ver el mensaje? Si hoy no es prioridad, decime y lo dejamos para más adelante.', 'Aporta una salida fácil.'),
  r('seguimiento', 'Retomar con algo nuevo', 'Hola {nombre}, te escribo porque [novedad concreta: ficha, producto, rendimiento, caso]. Pensé que te podía servir para lo que me contaste de [tema].', 'Siempre algo nuevo; no repetir «¿alguna novedad?».'),
  r('seguimiento', 'Después de cotizar', 'Hola {nombre}, ¿pudiste revisar la cotización? Si cambió algo de lo que necesitabas o querés ajustar cantidades o presentación, lo vemos.', 'Preguntar qué cambió, no apurar.'),
  r('seguimiento', 'Cierre del ciclo (día 7)', 'Hola {nombre}, no quiero molestarte. Dejo esto por acá y, si más adelante te sirve, me escribís. ¡Gracias por tu tiempo!', 'Cierra sin presión.'),
  // Acordar el próximo paso
  r('cierre', 'Pedir los datos para cotizar', 'Para pasarte precio necesito: producto o aplicación, cantidad, y si es retiro o envío (localidad). Con eso te lo preparo.', 'Datos mínimos.'),
  r('cierre', 'Enviar ficha técnica', 'Te mando la ficha técnica de [producto]. Si después de leerla te quedan dudas, me decís y lo vemos con el área técnica.', 'Adjuntá la ficha validada.'),
  r('cierre', 'Acordar día y hora', 'Perfecto. ¿Te viene bien que te llame [día] a las [hora] para verlo? Si preferís por acá, lo seguimos por WhatsApp.', 'Próximo paso con fecha.'),
  r('cierre', 'Confirmar lo acordado', 'Quedamos así: [resumen]. Yo me encargo de [mi parte] para el [fecha]. ¿Te parece bien?', 'Cada acuerdo con responsable y fecha.'),
  r('cierre', 'Agradecer y cerrar un pedido', '¡Gracias por la compra, {nombre}! Cualquier duda con el uso del producto, escribime y lo resolvemos.', 'Posventa: confirmar recepción y uso.'),
  // Pasarlo con alguien
  r('derivar', 'Máquinas, poliuretano, repuestos → Juan', 'Para máquinas, sistemas de poliuretano y repuestos te paso con Juan, que es quien lo ve. Le dejo tu consulta para que te escriba.', 'Y creá la tarea para Juan.'),
  r('derivar', 'Resinplast / Imperpur → Ezequiel', 'Para resinas e impermeabilizantes te paso con Ezequiel, que es el especialista. Le dejo tu consulta para que te contacte.', ''),
  r('derivar', 'Tiendas online / envíos → Brenda', 'Eso lo ve Brenda, que atiende la tienda online y los envíos. Le dejo tu consulta para que te responda hoy.', ''),
  r('derivar', 'Condiciones comerciales → Yuliani', 'Las condiciones comerciales las define Yuliani. Le paso tu consulta y te escribe con la propuesta.', ''),
  r('derivar', 'Consulta técnica → área técnica', 'Esa consulta técnica la valida el área técnica. La dejo anotada y te respondemos con un dato confirmado, no de memoria.', 'No inventar datos técnicos.'),
  // Cuando no es por ahí
  r('salida', 'No me interesa', 'Gracias por contestar, {nombre}. No te molesto más. Si algún día necesitás algo de este rubro, acá estamos.', 'Marcalo y, si lo pide, «No contactar nunca».'),
  r('salida', 'No escriban más', 'Perfecto, tomo nota y no te escribimos más. Disculpá la molestia.', 'Marcar «No contactar nunca» en seguida.'),
  r('salida', 'Escribió a un número equivocado', 'Disculpá la confusión, {nombre}. Ya lo corrijo. ¡Que tengas un buen día!', ''),
]);

export function fillReply(text = '', { nombre = '', yo = '' } = {}) {
  return String(text).replace(/\{nombre\}/g, nombre.trim() || 'hola').replace(/\{yo\}/g, yo.trim() || 'el equipo');
}

export function searchReplies(query = '', group = '') {
  const term = String(query).trim().toLocaleLowerCase('es-AR');
  return QUICK_REPLIES.filter((item) => (!group || item.group === group) && (!term || `${item.title} ${item.text}`.toLocaleLowerCase('es-AR').includes(term)));
}
