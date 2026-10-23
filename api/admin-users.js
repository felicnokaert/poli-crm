import { alertsAdmin, alertsCron } from '../lib/crm-alerts.mjs';
import { deleteUser } from '../lib/admin-users.mjs';
import { cleanupWorkspaces } from '../lib/workspace-cleanup-admin.mjs';
import { technicalAdmin } from '../lib/technical-admin.mjs';
import { listClientErrors, logClientError } from '../lib/error-log.mjs';
import { mercadoLibreAdmin, mercadoLibreCron, mercadoLibreMarketCron } from '../lib/mercadolibre.mjs';
import { runIntegrationCron } from '../lib/integration-crons.mjs';
import { contabiliumAdmin, contabiliumCron } from '../lib/contabilium.mjs';
import { assistantAi } from '../lib/assistant-ai.mjs';
import { shopifyAdmin, shopifyCron } from '../lib/shopify.mjs';

// Una sola función para las tareas de administrador (el plan de Vercel limita la cantidad de funciones):
// borrar un usuario, revisar/limpiar espacios con datos de Felipe copiados (action: 'cleanup') o
// Base técnica: borrar en tanda y permitir más tipos de archivo (action: 'technical'); Mercado Libre
// (action: 'mercadolibre', solo lectura de publicaciones y preguntas respondidas); Contabilium
// (action: 'contabilium', prueba de conexión y copia de comprobantes). Los GET ?cron=mercadolibre y
// ?cron=contabilium son las actualizaciones diarias. action 'assistant': la IA del asistente (todo el
// equipo, no solo administradores).
// Actualizaciones diarias (vercel.json → crons): cada una deja constancia de cómo terminó (lib/integration-crons.mjs)
// y Más → Datos → Conexiones ("Actualizaciones automáticas") lo muestra.
const CRONS = {
  mercadolibre: mercadoLibreCron,
  'mercadolibre-mercado': mercadoLibreMarketCron,
  contabilium: contabiliumCron,
  shopify: shopifyCron,
  alertas: alertsCron,
};

export default async function handler(request, response) {
  const cron = request.method === 'GET' ? CRONS[request.query?.cron] : null;
  if (cron) {
    const result = await runIntegrationCron(request.query.cron, (req) => cron(req), request);
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
    : action === 'shopify' ? await shopifyAdmin(request)
    : action === 'alerts' ? await alertsAdmin(request)
    : action === 'assistant' ? await assistantAi(request)
    : await deleteUser(request);
  return response.status(result.status).json(result.body);
}
