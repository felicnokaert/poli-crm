import { alertsAdmin, alertsCron } from '../lib/crm-alerts.mjs';
import { trelloPlanAdmin, trelloPlanCron } from '../lib/trello-plan.mjs';
import { deleteUser, isAdminEmail } from '../lib/admin-users.mjs';
import { authenticatedCorporateUser } from '../lib/corporate-auth.mjs';
import { whatsappAutoAdmin } from '../lib/whatsapp-autoreply.mjs';
import { automationPauseAdmin } from '../lib/automation-pause.mjs';
import { trainingAdmin, trainingCron } from '../lib/ai-training.mjs';
import { cleanupWorkspaces } from '../lib/workspace-cleanup-admin.mjs';
import { technicalAdmin } from '../lib/technical-admin.mjs';
import { listClientErrors, logClientError } from '../lib/error-log.mjs';
import { mercadoLibreAccountCron, mercadoLibreAdmin, mercadoLibreAdsCron, mercadoLibreCron, mercadoLibreMarketCron, mercadoLibreClipsCron, mercadoLibreSalesCron } from '../lib/mercadolibre.mjs';
import { runIntegrationCron } from '../lib/integration-crons.mjs';
import { contabiliumAdmin, contabiliumCron } from '../lib/contabilium.mjs';
import { assistantAi } from '../lib/assistant-ai.mjs';
import { appReportsAdmin } from '../lib/app-reports.mjs';
import { appFirmaAdmin, publicKeyHandler } from '../lib/app-firma.mjs';
import { feriadosHandler } from '../lib/feriados.mjs';
import { shopifyAdmin, shopifyCron } from '../lib/shopify.mjs';
import { etiquetasHandler } from '../lib/etiquetas.mjs';
import { entregasApiHandler } from '../lib/entregas-api.mjs';
import { bnaDollarHandler } from '../lib/bna-dollar.mjs';
import { gmailAdmin, gmailAutoSendCron, gmailCallback } from '../lib/gmail-service.mjs';

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
  'mercadolibre-1': mercadoLibreAccountCron(0),
  'mercadolibre-2': mercadoLibreAccountCron(1),
  'mercadolibre-3': mercadoLibreAccountCron(2),
  'mercadolibre-4': mercadoLibreAccountCron(3),
  'mercadolibre-5': mercadoLibreAccountCron(4),
  'mercadolibre-6': mercadoLibreAccountCron(5),
  'mercadolibre-mercado': mercadoLibreMarketCron,
  'mercadolibre-clips-1': mercadoLibreClipsCron,
  'mercadolibre-clips-2': mercadoLibreClipsCron,
  'mercadolibre-clips-3': mercadoLibreClipsCron,
  'mercadolibre-clips-4': mercadoLibreClipsCron,
  'mercadolibre-clips-5': mercadoLibreClipsCron,
  'mercadolibre-clips-6': mercadoLibreClipsCron,
  'mercadolibre-clips-7': mercadoLibreClipsCron,
  'mercadolibre-clips-8': mercadoLibreClipsCron,
  'mercadolibre-clips-9': mercadoLibreClipsCron,
  'mercadolibre-clips-10': mercadoLibreClipsCron,
  'mercadolibre-ventas-1': mercadoLibreSalesCron(0),
  'mercadolibre-ventas-2': mercadoLibreSalesCron(1),
  'mercadolibre-ventas-3': mercadoLibreSalesCron(2),
  'mercadolibre-ventas-4': mercadoLibreSalesCron(3),
  'mercadolibre-ventas-5': mercadoLibreSalesCron(4),
  'mercadolibre-ventas-6': mercadoLibreSalesCron(5),
  'mercadolibre-publicidad': mercadoLibreAdsCron,
  contabilium: contabiliumCron,
  shopify: shopifyCron,
  alertas: alertsCron,
  'trello-plan': trelloPlanCron,
  'gmail-envios': gmailAutoSendCron,
  // 21/11: entrenamiento intensivo del asistente (hasta el 25/11), una tanda por horario.
  'entrenamiento-1': trainingCron,
  'entrenamiento-2': trainingCron,
  'entrenamiento-3': trainingCron,
  'entrenamiento-4': trainingCron,
  'entrenamiento-5': trainingCron,
  'entrenamiento-6': trainingCron,
  'entrenamiento-7': trainingCron,
  'entrenamiento-8': trainingCron,
  'entrenamiento-9': trainingCron,
  'entrenamiento-10': trainingCron,
  'entrenamiento-11': trainingCron,
  'entrenamiento-12': trainingCron,
  'entrenamiento-13': trainingCron,
  'entrenamiento-14': trainingCron,
  'entrenamiento-15': trainingCron,
  'entrenamiento-16': trainingCron,
};

export default async function handler(request, response) {
  // Vuelta de Google al conectar Gmail: /api/gmail-callback se reescribe a /api/admin-users?gmail=callback (vercel.json).
  if (request.method === 'GET' && request.query?.gmail === 'callback') return gmailCallback(request, response);
  // Control de etiquetas (19/11): /api/etiquetas/<ruta> se reescribe a ?etiquetas=<ruta> (vercel.json). Solo consulta, con clave X-Api-Key.
  if (request.query?.etiquetas) return etiquetasHandler(request, response);
  // Entregas para expedición sin login (20/11): /api/entregas/<ruta> → ?entregas=<ruta>. Clave ENTREGAS_API_KEY en X-Api-Key.
  if (request.query?.entregas) return entregasApiHandler(request, response);
  if (request.query?.dolar) return bnaDollarHandler(request, response);
  if (request.query?.feriados) return feriadosHandler(request, response);
  if (request.query?.['app-firma-publica']) return publicKeyHandler(request, response);
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
    : action === 'trello-plan' ? await trelloPlanAdmin(request)
    : action === 'whatsapp-auto' ? await whatsappAutoAdmin(request, process.env, fetch, { authenticate: authenticatedCorporateUser, isAdmin: isAdminEmail })
    : action === 'automation-pause' ? await automationPauseAdmin(request, process.env, fetch, { authenticate: authenticatedCorporateUser, isAdmin: isAdminEmail })
    : action === 'app-firma' ? await appFirmaAdmin(request, process.env, fetch, { authenticate: authenticatedCorporateUser, isAdmin: isAdminEmail })
    : action === 'app-report' ? await appReportsAdmin(request, process.env, fetch, { authenticate: authenticatedCorporateUser, isAdmin: isAdminEmail })
    : action === 'gmail' ? await gmailAdmin(request)
    : action === 'training' ? await trainingAdmin(request, process.env, fetch, { authenticate: authenticatedCorporateUser, isAdmin: isAdminEmail })
    : action === 'assistant' ? await assistantAi(request)
    : await deleteUser(request);
  return response.status(result.status).json(result.body);
}
