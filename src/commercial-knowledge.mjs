export const KNOWLEDGE_META = Object.freeze({
  version: '2026-09-10.v1',
  source: 'docs/SISTEMA_COMERCIAL_GRUPO_POLIPLAST.md',
  status: 'aprobado',
});

export const ECERA = Object.freeze([
  { id: 'escuchar', label: 'Escuchar', guidance: 'Dejar terminar y no defenderse.' },
  { id: 'confirmar', label: 'Confirmar', guidance: 'Demostrar que se entendió la inquietud.' },
  { id: 'explorar', label: 'Explorar', guidance: 'Encontrar la causa real con una pregunta calibrada.' },
  { id: 'responder', label: 'Responder', guidance: 'Usar evidencia, alternativa o un límite honesto.' },
  { id: 'acordar', label: 'Acordar', guidance: 'Cerrar con un siguiente paso verificable.' },
]);

export const COMMERCIAL_STAGES = Object.freeze([
  ['preparacion', 'Preparación', 'Llegar al contacto con contexto real.', 'Canal válido y ángulo de apertura claro.'],
  ['apertura', 'Apertura', 'Lograr una primera respuesta real.', 'El contacto muestra apertura o hace una pregunta concreta.'],
  ['diagnostico', 'Diagnóstico', 'Entender necesidad, volumen, frecuencia y situación actual.', 'Se comprende qué necesita y para qué.'],
  ['calificacion', 'Calificación', 'Decidir si merece inversión comercial ahora.', 'Volumen, decisor y momento resultan viables.'],
  ['recomendacion', 'Recomendación', 'Presentar una o dos soluciones apoyadas en el diagnóstico.', 'Acepta la alternativa o solicita cotización.'],
  ['objecion', 'Objeción', 'Resolver la causa real mediante E-C-E-R-A.', 'La inquietud queda respondida o transformada en próximo paso.'],
  ['propuesta', 'Propuesta', 'Formalizar alcance, evidencia, condiciones y próximo paso.', 'La propuesta fue recibida y tiene responsable y fecha.'],
  ['seguimiento', 'Seguimiento', 'Mantener viva la conversación aportando algo concreto.', 'Responde, retoma o se reclasifica con una fecha.'],
  ['negociacion', 'Negociación', 'Cerrar brechas sin resignar rentabilidad automáticamente.', 'Las condiciones quedan acordadas.'],
  ['cierre', 'Cierre', 'Formalizar pedido, pago/orden y despacho.', 'Existe pedido confirmado, no una aceptación blanda.'],
  ['posventa', 'Posventa', 'Confirmar recepción, uso y problemas.', 'La entrega y experiencia quedan verificadas.'],
  ['recompra', 'Recompra', 'Anticipar recurrencia, venta cruzada y referencias.', 'Existe fecha o disparador de próxima compra.'],
].map(([id, label, objective, advanceWhen]) => ({ id, label, objective, advanceWhen, source: KNOWLEDGE_META.source, status: 'aprobado' })));

export const OBJECTIONS = Object.freeze([
  ['precio', 'Es caro / precio', 'No percibe diferencia, compara mal o no tiene presupuesto.', '¿Con qué lo estás comparando y qué incluye?', 'Construir valor total, respaldo técnico y reducción de riesgo; no bajar precio primero.'],
  ['proveedor', 'Ya tengo proveedor', 'Inercia, confianza o una insatisfacción no expresada.', '¿Qué valorás de él y qué mejorarías si pudieras?', 'Proponer una prueba puntual y complementaria; nunca criticar al proveedor.'],
  ['informacion', 'Mandame información', 'Interés bajo o necesita compartir con otra persona.', '¿Qué decisión querés poder tomar con esa información?', 'Enviar material breve y específico, no el catálogo completo.'],
  ['pensar', 'Lo tengo que pensar / consultar', 'Falta información, confianza o autoridad para decidir.', '¿Qué parte necesitás evaluar o qué te van a preguntar?', 'Resolver el punto pendiente, dar material compartible y acordar retoma.'],
  ['momento', 'No es el momento', 'La prioridad es insuficiente o el proyecto aún no comenzó.', '¿Qué tendría que ocurrir para que pase a ser prioridad?', 'Nutrir con un disparador real; nunca fabricar urgencia.'],
  ['rendimiento', 'No sé si sirve / rendimiento técnico', 'Percibe riesgo técnico o tuvo una mala experiencia.', '¿Qué condición de uso te preocupa más?', 'Validar con especialista y ficha; no prometer rendimiento de memoria.'],
  ['escala', 'Necesito poco / escala baja', 'Puede ser prueba, uso único o consumo pequeño recurrente.', '¿Es una prueba, consumo recurrente o uso único?', 'Ofrecer presentación adecuada o derivar al canal minorista correspondiente.'],
  ['marca', 'No conozco la marca / desconfianza', 'Falta confianza en marca, producto o canal.', '¿Qué evidencia necesitás para evaluarla?', 'Usar casos, certificaciones, reseñas o demostraciones reales.'],
  ['decisor', 'Lo decide otra persona', 'El contacto influye pero no autoriza.', '¿Cómo podemos ayudarte a presentárselo correctamente?', 'Incorporar al decisor sin desplazar al contacto original.'],
  ['entrega', 'Necesito entrega inmediata', 'Tiene una fecha límite y riesgo operativo.', '¿Cuál es la fecha límite real y qué ocurre después?', 'Verificar stock y logística antes de comprometer una fecha.'],
  ['pago', 'Condiciones de pago', 'Tiene una restricción de liquidez o busca mejor condición.', '¿Qué condición te funciona mejor para este pedido?', 'Validar margen y autorización antes de comprometer financiación.'],
  ['prueba', 'Necesidad de prueba', 'Quiere reducir el riesgo antes de un pedido mayor.', '¿Qué cantidad te permitiría probar sin un compromiso grande?', 'Armar prueba acotada con seguimiento posventa.'],
  ['silencio', 'Silencio después de cotizar', 'Perdió prioridad, compara o algo no cerró.', '¿Cambió algo de lo que necesitabas o seguís evaluando?', 'Aportar información nueva; no repetir “¿alguna novedad?”.'],
].map(([id, label, meaning, explore, response]) => ({ id, label, meaning, explore, response, source: KNOWLEDGE_META.source, status: 'aprobado' })));

export const PLAYBOOKS = Object.freeze([
  ['aplicadores', 'Aplicadores', ['POLIURETANOS', 'POLIUREA', 'PURMAC', 'EPP'], 'Continuidad de insumo, máquina confiable y respaldo técnico.', 'Ya tengo proveedor / soporte técnico.', 'Llamada técnica breve para relevar qué usa hoy.'],
  ['fabricantes', 'Fabricantes', ['POLIURETANOS', 'RESINPLAST', 'CARROZADOS'], 'Previsibilidad de suministro, calidad y plazo.', 'Consistencia entre lotes y condiciones por volumen.', 'Relevar volumen/especificación y proponer prueba de lote.'],
  ['distribuidores', 'Distribuidores y revendedores', ['POLIURETANOS', 'RESINPLAST', 'PENOSIL'], 'Margen y productos con rotación.', 'Ya revendo otra marca.', 'Proponer una línea inicial complementaria de 3 a 5 productos.'],
  ['constructoras', 'Constructoras y aislaciones', ['POLIURETANOS', 'CARROZADOS', 'PENOSIL'], 'Cumplimiento técnico y confianza en obra.', 'Norma o especificación exigida.', 'Dimensionar obra, sustrato y condiciones antes de cotizar.'],
  ['frigorificas', 'Cámaras frigoríficas y panelería', ['POLIURETANOS', 'CARROZADOS'], 'Especificación técnica bajo condiciones exigentes.', 'Rendimiento y dato duro.', 'Derivación técnica antes de cotizar.'],
  ['carrozados', 'Carrozados', ['CARROZADOS', 'RESINPLAST'], 'Consolidar varios insumos en un proveedor.', 'Compras fragmentadas entre proveedores.', 'Armar pedido tipo kit y detectar venta cruzada PRFV.'],
  ['prfv', 'PRFV náutico e industrial', ['RESINPLAST'], 'Combinación completa y asesoramiento técnico.', 'Stock de resina, catalizador y refuerzo compatibles.', 'Preguntar primero qué fabrica o repara.'],
  ['penosil', 'Ferreterías y mayoristas Penosil', ['PENOSIL'], 'Margen, volumen y diferenciación de línea.', 'Precio y condición para llegar al mínimo.', 'Calcular surtido y escalón de volumen sin inventar condiciones.'],
  ['b2c', 'Consultas B2C', ['ESPUMA PU', 'RESINPLAST', 'PENOSIL'], 'Claridad de uso y confianza en compra online.', 'No sabe si sirve o desconfía del canal propio.', 'Dar guía simple y derivar a tienda/marketplace adecuado.'],
  ['mercadolibre', 'Clientes de Mercado Libre', ['MULTIFAMILIA'], 'Precio, confianza, reputación y despacho.', 'Comparación directa con otra publicación.', 'Responder la duda y corregir la publicación si revela un gap repetido.'],
].map(([id, label, families, motivation, typicalObjection, nextStep]) => ({ id, label, families, motivation, typicalObjection, nextStep, source: KNOWLEDGE_META.source, status: 'aprobado' })));

export function findObjections(query = '') {
  const term = String(query).trim().toLocaleLowerCase('es-AR');
  if (!term) return OBJECTIONS;
  return OBJECTIONS.filter((item) => [item.label, item.meaning, item.explore, item.response].join(' ').toLocaleLowerCase('es-AR').includes(term));
}

export function playbooksForFamily(family = '') {
  const target = String(family).trim().toLocaleUpperCase('es-AR');
  return PLAYBOOKS.filter((item) => item.families.includes('MULTIFAMILIA') || item.families.some((value) => target.includes(value) || value.includes(target)));
}
