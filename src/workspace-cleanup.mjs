// Limpieza de lo que se copió del espacio de Felipe al de otra cuenta (bug de remoteReady, arreglado
// el 16/10 en src/hooks/useWorkspaceSync.js: al iniciar sesión con otra cuenta sin cerrar la anterior,
// se guardaba el espacio de Felipe dentro del de la otra persona).
//
// Criterio (conservador, sin adivinar): los ids de los registros son aleatorios, así que un registro
// con el MISMO id que uno de Felipe vino de su espacio. Esos se sacan y quedan en deletedRecordIds para
// que ninguna pestaña vieja los vuelva a subir. Las empresas no se borran (el directorio es de todos):
// se les quitan solo los datos privados que son idénticos a los de Felipe (notas, compras, etapa...).
// Lo que cada persona cargó por su cuenta (ids propios) no se toca.
import { PUBLIC_FIELDS } from './shared-directory.mjs';
import { closedBySystem } from './day-review.mjs';

const COLLECTIONS = ['tasks', 'interactions', 'opportunities', 'sales', 'boardLists', 'boardCards', 'salesGoals', 'businessUnits', 'prospects', 'prospectSearches', 'researchJobs'];
const LOGS = ['mergeLogs', 'duplicateReviewDecisions'];
const SCALARS = ['profileName', 'weeklyTargets', 'prospectFocus', 'prospectSwitches', 'welcomeDismissed'];
const KEEP_ON_CLIENT = new Set([...PUBLIC_FIELDS, 'contacts', 'createdAt', 'updatedAt', 'source', 'sourceType', 'tipoCliente', 'tipoClienteNota', 'lat', 'lon']);

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const idsOf = (records = []) => new Set((records || []).map((item) => item?.id).filter(Boolean));

// ownerStates: espacios de las cuentas de Felipe. allowedChannels: canales de WhatsApp de la persona.
export function cleanCopiedWorkspace(state = {}, ownerStates = [], { allowedChannels = [], stamp = new Date().toISOString() } = {}) {
  const owner = (key) => ownerStates.flatMap((item) => (Array.isArray(item?.[key]) ? item[key] : []));
  const next = { ...state };
  const removed = {};
  const deletedRecordIds = { ...(state.deletedRecordIds || {}) };

  for (const collection of COLLECTIONS) {
    // También cuenta lo que Felipe ya borró de su espacio: la copia pudo ser anterior.
    const ownerIds = new Set([...idsOf(owner(collection)), ...ownerStates.flatMap((item) => item?.deletedRecordIds?.[collection] || [])]);
    const records = Array.isArray(state[collection]) ? state[collection] : [];
    const copied = records.filter((item) => ownerIds.has(item?.id));
    if (!copied.length) continue;
    next[collection] = records.filter((item) => !ownerIds.has(item?.id));
    deletedRecordIds[collection] = [...new Set([...(deletedRecordIds[collection] || []), ...copied.map((item) => item.id)])].sort();
    removed[collection] = copied.length;
  }
  if (Object.keys(removed).length) next.deletedRecordIds = deletedRecordIds;

  for (const key of LOGS) {
    const ownerIds = idsOf(owner(key));
    const records = Array.isArray(state[key]) ? state[key] : [];
    const kept = records.filter((item) => !ownerIds.has(item?.id));
    if (kept.length !== records.length) { next[key] = kept; removed[key] = records.length - kept.length; }
  }

  // Empresas: se conserva la ficha (nombre, rubro, ubicación, contactos, clasificación) y se le quitan
  // los datos privados que son exactamente los de la ficha de Felipe con el mismo id.
  const ownerClients = new Map(owner('clients').filter((item) => item?.id).map((item) => [item.id, item]));
  let clientsCleaned = 0;
  if (Array.isArray(state.clients)) {
    next.clients = state.clients.map((client) => {
      const source = ownerClients.get(client?.id);
      if (!source) return client;
      const kept = {};
      let changed = false;
      for (const [key, value] of Object.entries(client)) {
        if (!KEEP_ON_CLIENT.has(key) && key in source && same(value, source[key])) { changed = true; continue; }
        kept[key] = value;
      }
      // Queda como empresa del directorio, fuera del pipeline de la persona: así no le genera tareas
      // automáticas de "Retomar contacto" por cuentas que no trabaja.
      if (!changed && client.pipelineActive === false) return client;
      clientsCleaned += 1;
      return { ...kept, pipelineActive: false, source: 'Directorio del equipo', updatedAt: stamp };
    });
    if (clientsCleaned) removed.clientPrivateData = clientsCleaned;
    // Empresas que se copiaron de Felipe y que él después borró o fusionó: ya no existen en su cuenta,
    // así que se sacan también de la copia.
    const ownerDeleted = new Set(ownerStates.flatMap((item) => item?.deletedRecordIds?.clients || []));
    const gone = next.clients.filter((client) => ownerDeleted.has(client?.id));
    if (gone.length) {
      next.clients = next.clients.filter((client) => !ownerDeleted.has(client?.id));
      const base = next.deletedRecordIds || deletedRecordIds;
      next.deletedRecordIds = { ...base, clients: [...new Set([...(base.clients || []), ...gone.map((client) => client.id)])].sort() };
      removed.deletedClients = gone.length;
    }
  }

  // Tareas automáticas que el proceso diario creó por algo copiado de Felipe (sus empresas o los chats
  // de su número): no son de la persona, se sacan todas.
  const ownerClientIds = new Set(ownerClients.keys());
  // Solo números de WhatsApp (los nombres sueltos coincidirían de más).
  const ownerContactKeys = new Set(owner('inbox').map((event) => String(event?.customer_wa_id || '').replace(/\D/g, '')).filter((digits) => digits.length >= 8));
  // Hechas o no: también las que el sistema cerró solo, que aparecían en su Cierre del día.
  // También las de "Retomar contacto" / cotización vencida de empresas que la persona no trabaja (fuera
  // de su pipeline o que ya no están): las que quedaban en el Cierre del día de Juan.
  const workedIds = new Set((Array.isArray(next.clients) ? next.clients : []).filter((client) => client?.pipelineActive !== false).map((client) => client.id));
  const aboutUnworkedClient = (task) => ['auto-stale-client', 'auto-expired-quote'].includes(task?.source) && !workedIds.has(task.clientId || task.autoKey);
  // Y las automáticas que el sistema ya cerró solo: no las hizo nadie y solo ensucian sus Tareas.
  const autoFromOwner = (task) => String(task?.source || '').startsWith('auto-')
    && (closedBySystem(task) || ownerClientIds.has(task.clientId) || ownerClientIds.has(task.autoKey) || aboutUnworkedClient(task) || [...ownerContactKeys].some((key) => String(task.autoKey || '').includes(key)));
  const tasksNow = Array.isArray(next.tasks) ? next.tasks : [];
  const autoCopied = tasksNow.filter(autoFromOwner);
  if (autoCopied.length) {
    next.tasks = tasksNow.filter((task) => !autoFromOwner(task));
    next.deletedRecordIds = { ...(next.deletedRecordIds || deletedRecordIds), tasks: [...new Set([...((next.deletedRecordIds || deletedRecordIds).tasks || []), ...autoCopied.map((task) => task.id)])].sort() };
    removed.automaticTasks = autoCopied.length;
  }

  // "Por revisar": solo mensajes de los canales propios.
  if (Array.isArray(state.inbox)) {
    const mine = state.inbox.filter((item) => allowedChannels.includes(item?.channel));
    if (mine.length !== state.inbox.length) { next.inbox = mine; removed.inbox = state.inbox.length - mine.length; }
  }

  const ownerIgnored = new Set(owner('ignoredWhatsAppContacts').map((item) => item?.key).filter(Boolean));
  if (Array.isArray(state.ignoredWhatsAppContacts)) {
    const kept = state.ignoredWhatsAppContacts.filter((item) => !ownerIgnored.has(item?.key));
    if (kept.length !== state.ignoredWhatsAppContacts.length) { next.ignoredWhatsAppContacts = kept; removed.ignoredWhatsAppContacts = state.ignoredWhatsAppContacts.length - kept.length; }
  }
  const ownerDismissed = new Set(owner('dismissedInboxEventIds'));
  if (Array.isArray(state.dismissedInboxEventIds)) {
    const kept = state.dismissedInboxEventIds.filter((id) => !ownerDismissed.has(id));
    if (kept.length !== state.dismissedInboxEventIds.length) { next.dismissedInboxEventIds = kept; removed.dismissedInboxEventIds = state.dismissedInboxEventIds.length - kept.length; }
  }

  // Rutina de Felipe: marcas con las mismas claves que en su espacio.
  const ownerChecks = new Set(ownerStates.flatMap((item) => Object.keys(item?.planChecks || {})));
  const checks = state.planChecks || {};
  const keptChecks = Object.fromEntries(Object.entries(checks).filter(([key]) => !ownerChecks.has(key)));
  if (Object.keys(keptChecks).length !== Object.keys(checks).length) {
    next.planChecks = keptChecks;
    removed.planChecks = Object.keys(checks).length - Object.keys(keptChecks).length;
  }

  for (const key of SCALARS) {
    if (state[key] === undefined || state[key] === '') continue;
    if (ownerStates.some((item) => item?.[key] !== undefined && same(item[key], state[key]))) {
      delete next[key];
      removed[key] = 1;
    }
  }

  return { state: next, removed, changed: Object.keys(removed).length > 0 };
}

// Cuántas tareas automáticas (las crea el proceso diario con los WhatsApp de la propia cuenta) quedan:
// no son un error, pero sirve para explicar "tareas que nunca cargué".
export function automaticTaskCount(state = {}) {
  return (state.tasks || []).filter((task) => !task.done && (String(task.source || '').startsWith('auto-') || task.origin)).length;
}
