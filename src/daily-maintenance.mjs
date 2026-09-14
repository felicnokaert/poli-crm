import { completeTasksThrough } from './workspace.mjs';
import { findStaleHotLeads } from './hot-leads-radar.mjs';
import { buildRepurchaseRadar } from './repurchase-radar.mjs';
import { findColdQuotes } from './cold-quotes.mjs';
import { findStaleClients } from './stale-clients-radar.mjs';
import { findExpiredQuotes } from './quoted-clients-radar.mjs';
import { findClientByWhatsApp } from './client-contacts.mjs';
import { whatsappContactIdentity } from './whatsapp-threads.mjs';

const EMPTY_STATE = { tasks: [], tasksClosedThrough: '' };

// Marca las tareas que crea el sistema (nunca una persona) para poder
// distinguirlas al buscar duplicados. Nunca se usa para nada más.
export const AUTO_HOT_LEAD_TASK_SOURCE = 'auto-hot-lead';

// Segunda señal habilitada para auto-followup (ver nota larga más abajo,
// junto a buildAutoFollowupTasks): source distinto a propósito, así el
// filtro `task.source === X` de cada señal nunca mezcla sus tareas abiertas
// ni su deduplicación con las de la otra.
export const AUTO_COLD_QUOTE_TASK_SOURCE = 'auto-cold-quote';

// Tercera señal habilitada para auto-followup (ver findStaleClients en
// stale-clients-radar.mjs): mismo motivo de source separado que las dos
// anteriores.
export const AUTO_STALE_CLIENT_TASK_SOURCE = 'auto-stale-client';

// Quinta señal (ver findExpiredQuotes en quoted-clients-radar.mjs): mismo
// motivo de source separado que las anteriores.
export const AUTO_EXPIRED_QUOTE_TASK_SOURCE = 'auto-expired-quote';

function normalizedIdentity(value = '') {
  return String(value).trim().toLocaleLowerCase('es-AR');
}

// Clave de deduplicación estable entre corridas: mismo canal + mismo
// contacto (el mismo criterio que ya usa whatsappContactIdentity en
// hot-leads-radar.mjs para agrupar mensajes de un mismo contacto). No
// usamos eventId porque un lead que sigue sin respuesta al día siguiente es
// el MISMO evento (el más reciente sin clasificar de ese contacto) y no
// queremos una tarea nueva por cada corrida del cron mientras siga abierto.
function hotLeadAutoKey(hotLead) {
  return `${normalizedIdentity(hotLead.channel || 'unknown')}:${normalizedIdentity(hotLead.customer || 'unknown')}`;
}

// Misma idea que hotLeadAutoKey, pero findColdQuotes no expone `channel` (no
// lo necesita para su propio cálculo) - resolvemos la identidad del contacto
// a partir del evento original de la bandeja (mismo criterio que usa
// findColdQuotes internamente para agrupar mensajes de un contacto).
function coldQuoteAutoKey(coldQuote, event) {
  return event ? whatsappContactIdentity(event) : normalizedIdentity(coldQuote.customer || 'unknown');
}

// A diferencia de las otras dos señales (identidad por contacto de
// WhatsApp), un cliente sin contacto ya tiene un id estable y único en la
// cartera - se usa directo, sin normalizar nada.
function staleClientAutoKey(staleClient) {
  return String(staleClient.clientId || '');
}

// Igual que staleClientAutoKey: identidad por id de cliente, estable entre
// corridas.
function expiredQuoteAutoKey(expiredQuote) {
  return String(expiredQuote.clientId || '');
}

// Mantenimiento diario que hoy solo corre client-side cuando alguien abre el
// CRM (ver src/App.jsx, TASKS_CLOSED_THROUGH). Esta función es la misma
// lógica extraída para poder correrla también desde un cron server-side
// (api/cron-daily-maintenance.js) sin depender de que alguien tenga la
// pestaña abierta.
//
// Criterio de cutoff: usamos `nowISO` completo (no solo la fecha) como
// cutoff, igual que hace App.jsx con su constante TASKS_CLOSED_THROUGH.
// completeTasksThrough() solo usa los primeros 10 caracteres (la fecha) para
// decidir qué tareas cerrar, pero guarda el cutoff completo en
// `tasksClosedThrough` - así, al comparar con `>=` la próxima corrida (con un
// ISO de otro día, lexicográficamente mayor) vuelve a disparar el cierre.
export function buildDailyMaintenanceUpdate(state = EMPTY_STATE, nowISO = new Date().toISOString()) {
  const before = Array.isArray(state.tasks) ? state.tasks : [];
  const beforeDoneIds = new Set(before.filter((task) => task.done).map((task) => task.id));
  const nextState = completeTasksThrough(state, nowISO);
  if (nextState === state) {
    return { changed: false, nextState: state, summary: { tasksClosed: 0, cutoff: nowISO } };
  }
  const tasksClosed = (nextState.tasks || []).filter((task) => task.done && !beforeDoneIds.has(task.id)).length;
  return {
    changed: true,
    nextState,
    summary: { tasksClosed, cutoff: nowISO },
  };
}

// Las 3 señales de negocio (leads calientes sin respuesta, cotizaciones
// frías, radar de recompra) hoy se calculan client-side cada vez que alguien
// abre el CRM (ver src/Dashboard.jsx). Si nadie abre la app por unos días,
// esas señales no se calculan ni se guardan en ningún lado. Esta función
// corre las mismas 3 funciones puras server-side y persiste el resultado en
// `state.dailySignals`, con un timestamp de cuándo se calculó, para que la
// señal exista aunque nadie haya abierto el CRM ese día.
export function buildDailySignalsUpdate(state = EMPTY_STATE, nowISO = new Date().toISOString()) {
  const inbox = Array.isArray(state.inbox) ? state.inbox : [];
  const sales = Array.isArray(state.sales) ? state.sales : [];
  const clients = Array.isArray(state.clients) ? state.clients : [];
  const now = new Date(nowISO);

  const hotLeads = findStaleHotLeads(inbox, { today: now });
  const coldQuotes = findColdQuotes(inbox, sales, { today: now });
  const repurchase = buildRepurchaseRadar(sales, now);
  const staleClients = findStaleClients(clients, sales, inbox, { today: now });
  const expiredQuotes = findExpiredQuotes(clients, sales, { today: now });

  const dailySignals = {
    calculatedAt: nowISO,
    hotLeadsCount: hotLeads.length,
    coldQuotesCount: coldQuotes.length,
    repurchaseCount: repurchase.length,
    staleClientsCount: staleClients.length,
    expiredQuotesCount: expiredQuotes.length,
    hotLeads,
    coldQuotes,
    repurchase,
    staleClients,
    expiredQuotes,
  };

  return {
    changed: true,
    nextState: { ...state, dailySignals },
    summary: {
      hotLeadsCount: hotLeads.length,
      coldQuotesCount: coldQuotes.length,
      repurchaseCount: repurchase.length,
      staleClientsCount: staleClients.length,
      expiredQuotesCount: expiredQuotes.length,
      calculatedAt: nowISO,
    },
  };
}

// Primer paso de "el sistema actúa, no solo calcula" (ver auditorías de
// madurez, Automatización 50/100 y luego 66/100): en vez de dejar los hot
// leads y las cotizaciones frías solo visibles en el Dashboard para que
// alguien los note, el cron crea una tarea de seguimiento interna por cada
// señal detectada.
//
// Extendido de "solo hot leads" a hot leads + cold quotes (ver
// AUDITORIA_MADUREZ_PRODUCTO_2026-09-14-tarde.md) una vez validado en
// producción el patrón con la señal más inequívoca de las 3. Repurchase
// queda afuera a propósito: ahí "actuar" significaría sugerir una compra
// específica (qué producto, cuánto), un criterio bastante más ambiguo que
// "respondé este mensaje" o "retomá esta cotización" - generar esa tarea
// sin ese detalle sería ruido, no ayuda.
//
// Cold quotes SÍ se suma porque el criterio de acción es igual de concreto
// que el de hot leads: alguien preguntó precio (inferIntent === "Precio /
// cotización" en findColdQuotes), pasaron >= minDays y no hay una venta
// registrada a su nombre después - "retomar el contacto y preguntar si
// sigue interesado" es una acción clara y de bajo riesgo, igual que
// "responder el mensaje pendiente" para hot leads. La única diferencia real
// es de urgencia (cold quotes no es un mensaje urgente sin contestar), por
// eso su tarea sale con prioridad "Media" en vez de "Alta".
//
// Cuarta señal (ver findStaleClients en stale-clients-radar.mjs): un
// cliente activo sin venta ni mensaje en 30+ días también tiene una acción
// concreta y de bajo riesgo ("retomar contacto"), igual de inequívoca que
// las dos anteriores - no sugiere qué vender, solo que alguien lo llame o
// le escriba. Prioridad "Media", igual que cold quotes: no es un mensaje
// urgente sin contestar, es una cuenta que se está enfriando.
//
// Quinta señal (ver findExpiredQuotes en quoted-clients-radar.mjs): a
// diferencia de las 4 anteriores, esta depende de que Felipe marque el
// botón "Marqué que coticé hoy" en la ficha del cliente (client.
// lastQuotedAt) - no se infiere de ningún dato automático. Se optó por
// este dato manual mínimo en vez de tracking de cambio de etapa del
// pipeline (no existe todavía) o de adjuntar el presupuesto real de
// Contabilium (decisión explícita de Felipe: sería tedioso y pesa la base
// de datos sin necesidad - un timestamp alcanza).
//
// Anti-duplicado (igual para las 5 señales, pero SEPARADO por tipo): cada
// tarea auto-generada lleva `source` (AUTO_HOT_LEAD_TASK_SOURCE,
// AUTO_COLD_QUOTE_TASK_SOURCE, AUTO_STALE_CLIENT_TASK_SOURCE o
// AUTO_EXPIRED_QUOTE_TASK_SOURCE) y un `autoKey` estable (identidad del
// contacto, o el id del cliente para las dos últimas señales). Al buscar duplicados siempre se filtra por
// `task.source === <ese tipo>` antes de mirar `autoKey`, así una tarea de
// hot-lead y una de cold-quote para el mismo contacto nunca se pisan entre
// sí ni se cuentan como "la misma". Si ya existe una tarea ABIERTA
// (done: false) con esa combinación source+autoKey, no se crea una segunda
// - así una señal que sigue activa varios días solo genera una tarea (la
// primera vez que se detecta), no una por día. Si la tarea existente ya se
// marcó `done`, se entiende que alguien la atendió y, si la señal vuelve a
// aparecer más adelante, se puede crear una tarea nueva.
export function buildAutoFollowupTasks(state = EMPTY_STATE, nowISO = new Date().toISOString()) {
  const inbox = Array.isArray(state.inbox) ? state.inbox : [];
  const sales = Array.isArray(state.sales) ? state.sales : [];
  const clients = Array.isArray(state.clients) ? state.clients : [];
  const tasks = Array.isArray(state.tasks) ? state.tasks : [];
  const now = new Date(nowISO);
  const today = nowISO.slice(0, 10);

  const hotLeads = findStaleHotLeads(inbox, { today: now });
  const coldQuotes = findColdQuotes(inbox, sales, { today: now });
  const staleClients = findStaleClients(clients, sales, inbox, { today: now });
  const expiredQuotes = findExpiredQuotes(clients, sales, { today: now });
  if (!hotLeads.length && !coldQuotes.length && !staleClients.length && !expiredQuotes.length) {
    return { changed: false, nextState: state, summary: { autoFollowupTasksCreated: 0 } };
  }

  const openKeysBySource = (source) => new Set(
    tasks
      .filter((task) => task.source === source && !task.done)
      .map((task) => task.autoKey)
      .filter(Boolean),
  );
  const openHotLeadKeys = openKeysBySource(AUTO_HOT_LEAD_TASK_SOURCE);
  const openColdQuoteKeys = openKeysBySource(AUTO_COLD_QUOTE_TASK_SOURCE);
  const openStaleClientKeys = openKeysBySource(AUTO_STALE_CLIENT_TASK_SOURCE);
  const openExpiredQuoteKeys = openKeysBySource(AUTO_EXPIRED_QUOTE_TASK_SOURCE);

  const newTasks = [];
  for (const hotLead of hotLeads) {
    const autoKey = hotLeadAutoKey(hotLead);
    if (openHotLeadKeys.has(autoKey)) continue;
    openHotLeadKeys.add(autoKey); // evita crear dos tareas para el mismo contacto en la misma corrida

    const event = inbox.find((item) => item.event_id === hotLead.eventId);
    const client = event ? findClientByWhatsApp(clients, event) : undefined;

    newTasks.push({
      id: crypto.randomUUID(),
      clientId: client?.id,
      company: hotLead.customer || client?.company || 'Contacto de WhatsApp',
      title: `Responder a ${hotLead.customer || 'contacto'} - lleva ${hotLead.daysSince} días sin respuesta`,
      dueDate: today,
      cadence: 'Diaria',
      priority: 'Alta',
      trigger: 'Lead caliente sin respuesta (detección automática)',
      done: false,
      createdAt: nowISO,
      updatedAt: nowISO,
      createdBy: 'sistema',
      source: AUTO_HOT_LEAD_TASK_SOURCE,
      autoKey,
    });
  }

  for (const coldQuote of coldQuotes) {
    const event = inbox.find((item) => item.event_id === coldQuote.eventId);
    const autoKey = coldQuoteAutoKey(coldQuote, event);
    if (openColdQuoteKeys.has(autoKey)) continue;
    openColdQuoteKeys.add(autoKey);

    const client = event ? findClientByWhatsApp(clients, event) : undefined;

    newTasks.push({
      id: crypto.randomUUID(),
      clientId: client?.id,
      company: coldQuote.customer || client?.company || 'Contacto de WhatsApp',
      title: `Retomar cotización de ${coldQuote.customer || 'contacto'} - lleva ${coldQuote.daysSince} días sin cerrar`,
      dueDate: today,
      cadence: 'Diaria',
      priority: 'Media',
      trigger: 'Cotización fría sin seguimiento (detección automática)',
      done: false,
      createdAt: nowISO,
      updatedAt: nowISO,
      createdBy: 'sistema',
      source: AUTO_COLD_QUOTE_TASK_SOURCE,
      autoKey,
    });
  }

  for (const staleClient of staleClients) {
    const autoKey = staleClientAutoKey(staleClient);
    if (!autoKey || openStaleClientKeys.has(autoKey)) continue;
    openStaleClientKeys.add(autoKey);

    newTasks.push({
      id: crypto.randomUUID(),
      clientId: staleClient.clientId,
      company: staleClient.company || 'Cliente sin nombre',
      title: `Retomar contacto con ${staleClient.company || 'este cliente'} - lleva ${staleClient.daysSince} días sin actividad`,
      dueDate: today,
      cadence: 'Diaria',
      priority: 'Media',
      trigger: 'Cliente activo sin contacto (detección automática)',
      done: false,
      createdAt: nowISO,
      updatedAt: nowISO,
      createdBy: 'sistema',
      source: AUTO_STALE_CLIENT_TASK_SOURCE,
      autoKey,
    });
  }

  for (const expiredQuote of expiredQuotes) {
    const autoKey = expiredQuoteAutoKey(expiredQuote);
    if (!autoKey || openExpiredQuoteKeys.has(autoKey)) continue;
    openExpiredQuoteKeys.add(autoKey);

    newTasks.push({
      id: crypto.randomUUID(),
      clientId: expiredQuote.clientId,
      company: expiredQuote.company || 'Cliente sin nombre',
      title: `Hacer seguimiento de la cotización a ${expiredQuote.company || 'este cliente'} - lleva ${expiredQuote.daysSince} días sin cerrar`,
      dueDate: today,
      cadence: 'Diaria',
      priority: 'Media',
      trigger: 'Cotización marcada como vencida (detección automática)',
      done: false,
      createdAt: nowISO,
      updatedAt: nowISO,
      createdBy: 'sistema',
      source: AUTO_EXPIRED_QUOTE_TASK_SOURCE,
      autoKey,
    });
  }

  if (!newTasks.length) {
    return { changed: false, nextState: state, summary: { autoFollowupTasksCreated: 0 } };
  }

  return {
    changed: true,
    nextState: { ...state, tasks: [...tasks, ...newTasks] },
    summary: { autoFollowupTasksCreated: newTasks.length },
  };
}

// Combina el cierre de tareas vencidas, el cálculo/persistencia de las
// señales diarias y la creación de tareas automáticas de seguimiento, para
// que api/cron-daily-maintenance.js llame una sola función por fila de
// workspace_states.
export function buildFullDailyMaintenanceUpdate(state = EMPTY_STATE, nowISO = new Date().toISOString()) {
  const tasksUpdate = buildDailyMaintenanceUpdate(state, nowISO);
  const signalsUpdate = buildDailySignalsUpdate(tasksUpdate.nextState, nowISO);
  const followupUpdate = buildAutoFollowupTasks(signalsUpdate.nextState, nowISO);
  return {
    changed: tasksUpdate.changed || signalsUpdate.changed || followupUpdate.changed,
    nextState: followupUpdate.nextState,
    summary: { ...tasksUpdate.summary, ...signalsUpdate.summary, ...followupUpdate.summary },
  };
}
