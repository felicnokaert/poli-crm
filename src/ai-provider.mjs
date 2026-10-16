// Interfaz agnóstica de proveedor de IA para el copiloto de ventas.
//
// Fase 1 (07/09/2026): no hay ninguna cuenta ni API key de pago conectada,
// a pedido explícito de Felipe. Este módulo no hace ninguna llamada de red
// y no lee ningún secreto — existe solo para que, el día que se autorice un
// costo, conectar Anthropic/OpenAI/un modelo local sea agregar un adapter
// acá, sin tocar el resto del CRM.
export const AI_PROVIDERS = ['none', 'anthropic', 'openai', 'local'];

// Fase 1: siempre 'none'. Cuando Felipe autorice un proveedor pago, esta
// función pasa a leer una variable de entorno (ej. AI_PROVIDER) en vez de
// devolver un valor fijo.
export function getActiveProvider() {
  return 'none';
}

export function isProviderConfigured() {
  return getActiveProvider() !== 'none';
}

// No hace ninguna llamada de red. Si no hay proveedor configurado (siempre,
// en esta fase) devuelve un resultado explícito en vez de tirar una
// excepción genérica, para que la UI pueda mostrar el botón "Preparar
// consulta para IA" como alternativa manual sin costo.
export async function draftReplyWithProvider() {
  return { ok: false, provider: 'none', reason: 'Sin proveedor de IA configurado. Usá "Preparar consulta para IA" para copiar el contexto y pegarlo manualmente en Claude o ChatGPT.' };
}

// Arma el texto plano que el botón "Preparar consulta para IA" copia al
// portapapeles. Sin datos personales innecesarios (no incluye teléfono
// completo del cliente) y sin ningún secreto (no incluye tokens ni claves).
export function prepareManualQuery({ family, intent, temperature, missingQuestions = [], recommendedDocs = [], customerMessage = '' } = {}) {
  const lines = [
    'Contexto para redactar una respuesta comercial (Grupo Poliplast):',
    `Familia detectada: ${family || 'Sin definir'}`,
    `Intención detectada: ${intent || 'A confirmar'}`,
    `Temperatura: ${temperature || 'A confirmar'}`,
  ];
  if (customerMessage) lines.push('', 'Mensaje del cliente:', customerMessage);
  if (missingQuestions.length > 0) lines.push('', 'Preguntas que todavía faltan confirmar:', ...missingQuestions.map((q) => `- ${q}`));
  if (recommendedDocs.length > 0) lines.push('', 'Fichas técnicas de referencia (nombre solamente, contenido sin validar):', ...recommendedDocs.map((doc) => `- ${doc.product}`));
  lines.push('', 'No inventes rendimiento, compatibilidad, precio ni stock: si no está confirmado arriba, pedí ese dato en la respuesta.');
  return lines.join('\n');
}
