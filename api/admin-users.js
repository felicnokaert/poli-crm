import { deleteUser } from '../lib/admin-users.mjs';
import { cleanupWorkspaces } from '../lib/workspace-cleanup-admin.mjs';
import { technicalAdmin } from '../lib/technical-admin.mjs';
import { listClientErrors, logClientError } from '../lib/error-log.mjs';
import { mercadoLibreAdmin, mercadoLibreCron } from '../lib/mercadolibre.mjs';
import { contabiliumAdmin, contabiliumCron } from '../lib/contabilium.mjs';
import { assistantAi } from '../lib/assistant-ai.mjs';

// Una sola función para las tareas de administrador (el plan de Vercel limita la cantidad de funciones):
// borrar un usuario, revisar/limpiar espacios con datos de Felipe copiados (action: 'cleanup') o
// Base técnica: borrar en tanda y permitir más tipos de archivo (action: 'technical'); Mercado Libre
// (action: 'mercadolibre', solo lectura de publicaciones y preguntas respondidas); Contabilium
// (action: 'contabilium', prueba de conexión y copia de comprobantes). Los GET ?cron=mercadolibre y
// ?cron=contabilium son las actualizaciones diarias. action 'assistant': la IA del asistente (todo el
// equipo, no solo administradores).
export default async function handler(request, response) {
  if (request.method === 'GET' && request.query?.cron === 'mercadolibre') {
    const result = await mercadoLibreCron(request);
    return response.status(result.status).json(result.body);
  }
  if (request.method === 'GET' && request.query?.cron === 'contabilium') {
    const result = await contabiliumCron(request);
    return response.status(result.status).json(result.body);
  }
  if (request.method !== 'POST') return response.status(405).json({ error: 'Método no permitido.' });
  const action = request.body?.action;
  const result = action === 'cleanup' ? await cleanupWorkspaces(request)
    : action === 'technical' ? await technicalAdmin(request)
    : action === 'logError' ? await logClientError(request)
    : action === 'listErrors' ? await listClientErrors(request)
    : action === 'mercadolibre' ? await mercadoLibreAdmin(request)
    : action === 'contabilium' ? await contabiliumAdmin(request)
    : action === 'assistant' ? await assistantAi(request)
    : await deleteUser(request);
  return response.status(result.status).json(result.body);
}
