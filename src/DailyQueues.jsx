import { useEffect, useMemo, useState } from 'react';
import { ExternalLink } from 'lucide-react';
import { buildCustomerBase, coverageByCompany } from './customer-base.mjs';
import { useComprobantes, argentinaToday } from './CustomerBasePanel.jsx';
import { QUEUE_SIZE, logClientContact, matchesFamily, queueFamilies, newProspectsQueue, overdueMessage, overdueQueue, quoteMessage, quotedQueue, reactivationMessage, reactivationQueue } from './daily-queues.mjs';
import { blankTask } from './app-shared';
import { buildOutreachDraft } from './prospect-outreach.mjs';
import { outreachVariant, REJECTION_REASONS, possibleWhatsAppLink } from './prospect-model.mjs';
import { normalizePhoneAR } from './prospect-contact.mjs';
import { prospectLearning } from './assistant-team.mjs';
import { CLOSE_WINDOW_DAYS, quoteConversion } from './quote-conversion.mjs';

const pesos = (value) => `$ ${Math.round(value || 0).toLocaleString('es-AR')}`;
// Cotizaciones de Contabilium que terminaron en factura (22/10): el resultado que antes no se medía.
function QuoteConversionPanel({ stats }) {
  if (!stats?.quotes) return null;
  return (
    <section className="panel">
      <h3>Cotizaciones de Contabilium: cuántas se cierran (últimos 12 meses)</h3>
      <p>{stats.quotes} cotizaciones · <strong>{stats.closed} cerradas</strong> con factura en {CLOSE_WINDOW_DAYS} días{stats.crossCompany ? ` (${stats.crossCompany} compraron en otra empresa del grupo, mismo CUIT)` : ''} · {stats.lost} sin factura · {stats.pending} todavía en curso.{stats.rate != null ? <> Se cierra el <strong>{stats.rate} %</strong></> : ''}{stats.medianDays != null ? `, en ${stats.medianDays} días (mitad de los casos)` : ''}.</p>
      <p className="muted small">Cotizado {pesos(stats.quotedAmount)} · de eso se facturó {pesos(stats.closedAmount)} (montos tal como figuran en Contabilium).</p>
      <table className="learning-table">
        <thead><tr><th>Empresa</th><th>Cotizaciones</th><th>Cerradas</th><th>%</th></tr></thead>
        <tbody>{stats.byCompany.map((row) => <tr key={row.key}><td>{row.key}</td><td>{row.quotes}</td><td>{row.closed}</td><td>{row.rate != null ? `${row.rate} %` : '—'}</td></tr>)}</tbody>
      </table>
      <table className="learning-table">
        <thead><tr><th>Mes</th><th>Cotizaciones</th><th>Cerradas</th><th>%</th></tr></thead>
        <tbody>{stats.byMonth.map((row) => <tr key={row.key}><td>{row.key.split('-').reverse().join('/')}</td><td>{row.quotes}</td><td>{row.closed}</td><td>{row.rate != null ? `${row.rate} %` : 'en curso'}</td></tr>)}</tbody>
      </table>
      <p className="muted small">Cerrada = el mismo cliente tiene una factura dentro de los {CLOSE_WINDOW_DAYS} días de la cotización. Las de los últimos {CLOSE_WINDOW_DAYS} días sin factura cuentan como "en curso" y no entran en el porcentaje.</p>
    </section>
  );
}

// "Qué aprendimos" (22/10): con lo que se anota en las colas, qué versión del mensaje, familia y zona
// responden mejor y por qué nos rechazan. Respeta el filtro de familia.
function LearningPanel({ stats, quotes }) {
  if (!stats.contacted && !stats.byQueue.length) return <><QuoteConversionPanel stats={quotes} /><p className="muted">Todavía no hay resultados anotados. A medida que marques Contactado, Con interés o el motivo de rechazo, acá vas a ver qué funciona.</p></>;
  const Table = ({ title, rows }) => rows.length > 0 && (
    <section className="panel">
      <h3>{title}</h3>
      <table className="learning-table">
        <thead><tr><th>Grupo</th><th>Contactados</th><th>Con interés</th><th>%</th></tr></thead>
        <tbody>{rows.map((row) => <tr key={row.key}><td>{row.key}</td><td>{row.contacted}</td><td>{row.interested}</td><td>{row.contacted >= 5 ? `${row.rate} %` : <span className="muted small">pocos datos</span>}</td></tr>)}</tbody>
      </table>
    </section>
  );
  const top = stats.reasons[0];
  return (
    <div className="daily-learning">
      <QuoteConversionPanel stats={quotes} />
      <p>Prospectos contactados: <strong>{stats.contacted}</strong> · con interés: <strong>{stats.interested}</strong> ({stats.rate} %).{top ? ` El motivo de rechazo más común es "${top.reason}" (${top.count}).` : ''}</p>
      <Table title="Por versión del mensaje" rows={stats.byVariant} />
      <Table title="Por familia" rows={stats.byFamily} />
      <Table title="Por zona" rows={stats.byZone} />
      <Table title="Clientes (Reactivar / Cotizaron)" rows={stats.byQueue} />
      {stats.reasons.length > 0 && (
        <section className="panel">
          <h3>Por qué nos rechazan</h3>
          <ul>{stats.reasons.map((row) => <li key={row.reason}>{row.reason}: {row.count}</li>)}</ul>
        </section>
      )}
      <p className="muted small">Con menos de 5 contactos por grupo el porcentaje todavía no dice mucho. El asistente también lo sabe: preguntale "¿qué mensaje funciona mejor?".</p>
    </div>
  );
}

// Cola del día: tres listas cortas con el mensaje listo para copiar (el CRM nunca envía nada) y el resultado en un toque.
const CLIENT_RESULTS = ['Respondió, sigue interesado', 'No respondió', ...REJECTION_REASONS.filter((reason) => reason !== 'No respondió')];

function CopyButton({ text, label = 'Copiar mensaje' }) {
  const [copied, setCopied] = useState(false);
  return (
    <button type="button" className="primary" onClick={async () => { try { await navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1800); } catch { setCopied(false); } }}>
      {copied ? 'Copiado ✓' : label}
    </button>
  );
}

function ContactLinks({ phone }) {
  if (!phone) return <span className="muted small">sin teléfono cargado</span>;
  const quality = normalizePhoneAR(phone);
  const whatsapp = possibleWhatsAppLink(phone) || quality.whatsapp || '';
  return (
    <span className="drawer-quick">
      <a className="secondary link-pill" href={`tel:${String(phone).replace(/[^\d+]/g, '')}`}>Llamar {phone}</a>
      {whatsapp && <a className="secondary link-pill" href={whatsapp} target="_blank" rel="noreferrer">WhatsApp (posible)</a>}
    </span>
  );
}

function ResultChips({ results, onPick }) {
  return (
    <div className="reason-chips" role="group" aria-label="Resultado en un toque">
      <span className="muted small">Resultado:</span>
      {results.map((result) => <button key={result} type="button" className="secondary chip" onClick={() => onPick(result)}>{result}</button>)}
    </div>
  );
}

function ClientQueueCard({ item, queue, message, onOpenClient, onResult, onTask }) {
  return (
    <article className="queue-card daily-item">
      <h3>{item.client.company}</h3>
      <p className="muted">{item.reason}{item.client.family ? ` · ${item.client.family}` : ''}</p>
      <ContactLinks phone={item.client.phone} />
      <textarea rows={4} readOnly aria-label={`Mensaje para ${item.client.company}`} value={message} />
      <div className="queue-actions">
        <CopyButton text={message} />
        <button type="button" className="secondary" onClick={() => onOpenClient(item.client.id)}><ExternalLink size={14} /> Abrir empresa</button>
        {onTask && <button type="button" className="secondary" onClick={onTask}>Crear tarea para mañana</button>}
      </div>
      <ResultChips results={CLIENT_RESULTS} onPick={(result) => onResult(item.client.id, queue, result)} />
    </article>
  );
}

export function DailyQueues({ rules, supabase, clients: allClients = [], prospects: allProspects = [], checks, userEmail, defaultSender, setData, onOpenClient, onMarkProspect, onOpenProspect, skipped, onSkip }) {
  // Desde Inicio ("Se pasaron de su frecuencia") se abre directo en esa lista.
  const [view, setView] = useState(() => { try { const wanted = sessionStorage.getItem('poliplast-queue-view'); sessionStorage.removeItem('poliplast-queue-view'); return wanted || 'reactivar'; } catch { return 'reactivar'; } });
  const [note, setNote] = useState('');
  // 22/10: filtro por familia ("hoy quiero reactivar clientes de espuma"), para las tres listas.
  const [family, setFamily] = useState('');
  const families = useMemo(() => queueFamilies(allClients, allProspects), [allClients, allProspects]);
  const clients = useMemo(() => allClients.filter((client) => matchesFamily(client, family)), [allClients, family]);
  const prospects = useMemo(() => allProspects.filter((prospect) => matchesFamily(prospect, family)), [allProspects, family]);
  const { status, rows, sync } = useComprobantes(supabase);
  const today = argentinaToday();
  const sender = useMemo(() => { try { return localStorage.getItem('poliplast-sender-name') || defaultSender || ''; } catch { return defaultSender || ''; } }, [defaultSender]);
  const { byClient } = useMemo(() => buildCustomerBase(rows, clients, { today }), [rows, clients, today]);
  const reactivar = useMemo(() => reactivationQueue({ clients, base: byClient, today }), [clients, byClient, today]);
  const cotizaron = useMemo(() => quotedQueue({ clients, base: byClient, today }), [clients, byClient, today]);
  const atrasados = useMemo(() => overdueQueue({ clients, base: byClient, today }), [clients, byClient, today]);
  const nuevos = useMemo(() => newProspectsQueue({ prospects, checks, skipped, rules }), [prospects, checks, skipped, rules]);
  const coverage = useMemo(() => coverageByCompany(rows), [rows]);
  const syncing = sync.filter((item) => !item.history_done).map((item) => item.company);
  const learning = useMemo(() => prospectLearning({ prospects, clients }), [prospects, clients]);
  const quoteStats = useMemo(() => (status === 'ready' ? quoteConversion(rows, { today }) : null), [status, rows, today]);

  // Tarea para llamarlo mañana (22/10, clientes atrasados): queda en Tareas con el cliente vinculado.
  function createTask(item) {
    const stamp = new Date().toISOString();
    const due = new Date(Date.parse(`${today}T12:00:00`) + 86400000).toISOString().slice(0, 10);
    setData((current) => ({ ...current, tasks: [...(current.tasks || []), { ...blankTask(), id: crypto.randomUUID(), clientId: item.client.id, company: item.client.company, title: `Llamar: se pasó de su frecuencia de compra (${item.late} días)`, dueDate: due, priority: item.info.big ? 'Alta' : 'Media', source: 'cola-atrasados', done: false, createdAt: stamp, updatedAt: stamp }] }));
    setNote(`${item.client.company}: tarea creada para mañana.`);
  }

  function recordResult(clientId, queue, result) {
    const found = clients.find((client) => client.id === clientId);
    setData((current) => ({ ...current, clients: (current.clients || []).map((client) => (client.id === clientId ? logClientContact(client, { queue, outcome: result, user: userEmail }) : client)) }));
    setNote(`${found?.company || 'Cliente'}: ${result}. No vuelve a aparecer por 14 días.`);
  }

  const tabs = [['atrasados', 'Se pasaron de su frecuencia', atrasados.length], ['reactivar', 'Reactivar', reactivar.length], ['cotizaron', 'Cotizaron y no compraron', cotizaron.length], ['nuevos', 'Prospectos nuevos', nuevos.length], ['aprendido', 'Qué aprendimos', learning.contacted]];
  const needsData = ['atrasados', 'reactivar', 'cotizaron'].includes(view);
  return (
    <div className="daily-queues">
      <p className="muted">Lo que conviene contactar hoy: hasta {QUEUE_SIZE} por lista, con el mensaje listo para copiar y editar. El CRM no envía nada: lo mandás vos y anotás qué respondieron para que el sistema aprenda por qué falla cada mensaje.</p>
      <div className="segmented" role="tablist" aria-label="Colas del día">
        {tabs.map(([key, label, count]) => (
          <button key={key} type="button" role="tab" aria-selected={view === key} className={view === key ? 'selected' : ''} onClick={() => setView(key)}>{label} ({count})</button>
        ))}
      </div>
      {families.length > 0 && (
        <label className="ml-sort muted small">Familia{' '}
          <select value={family} onChange={(event) => setFamily(event.target.value)} aria-label="Filtrar por familia">
            <option value="">Todas</option>
            {families.map((name) => <option key={name} value={name}>{name}</option>)}
          </select>
        </label>
      )}
      {note && <p className="muted small" role="status">{note}</p>}

      {needsData && status === 'offline' && <p className="muted">Estas dos listas usan la facturación de Contabilium, que se lee desde la cuenta en línea. Entrá con tu cuenta para verlas.</p>}
      {needsData && status === 'loading' && <p className="muted">Leyendo la facturación de Contabilium…</p>}
      {needsData && status === 'error' && <p className="muted">No se pudo leer la facturación de Contabilium. Probá recargar la página.</p>}
      {needsData && status === 'ready' && (
        <p className="muted small">
          Facturación leída: {Object.entries(coverage).map(([company, range]) => `${company} ${range.from.slice(0, 4)}–${range.to.slice(0, 7)} (${range.count})`).join(' · ') || 'sin comprobantes todavía'}.
          {syncing.length > 0 && ` Todavía se está copiando el historial de ${syncing.join(', ')}: los estados pueden cambiar.`}
          {' '}Activo: compró hace 90 días o menos · dormido: hasta 1 año · inactivo: más de 1 año.
        </p>
      )}

      {view === 'atrasados' && status === 'ready' && (atrasados.length === 0
        ? <p className="muted">Ningún cliente frecuente se pasó de su frecuencia de compra (o ya los trabajaste en los últimos 14 días).</p>
        : atrasados.map((item) => <ClientQueueCard key={item.client.id} item={item} queue="atrasados" message={overdueMessage(item.client, item.info, sender)} onOpenClient={onOpenClient} onResult={recordResult} onTask={() => createTask(item)} />))}

      {view === 'reactivar' && status === 'ready' && (reactivar.length === 0
        ? <p className="muted">No hay clientes recurrentes o grandes para reactivar hoy (o ya los trabajaste en los últimos 14 días).</p>
        : reactivar.map((item) => <ClientQueueCard key={item.client.id} item={item} queue="reactivar" message={reactivationMessage(item.client, item.info, sender)} onOpenClient={onOpenClient} onResult={recordResult} />))}

      {view === 'cotizaron' && status === 'ready' && (cotizaron.length === 0
        ? <p className="muted">No hay cotizaciones sin respuesta entre 3 y 90 días (o ya las trabajaste en los últimos 14 días).</p>
        : cotizaron.map((item) => <ClientQueueCard key={item.client.id} item={item} queue="cotizaron" message={quoteMessage(item.client, item.quote, sender)} onOpenClient={onOpenClient} onResult={recordResult} />))}

      {view === 'aprendido' && <LearningPanel stats={learning} quotes={quoteStats} />}
      {view === 'nuevos' && (nuevos.length === 0
        ? <p className="muted">No quedan prospectos nuevos pendientes. Importá la planilla de prospección desde la pestaña Prospectos.</p>
        : nuevos.map((prospect) => {
          const draft = buildOutreachDraft(prospect, { sender });
          const reason = [prospect.zone && `Zona ${prospect.zone}`, prospect.fitLevel && `Encaje ${prospect.fitLevel}`, prospect.sheetScore != null && `Puntaje ${prospect.sheetScore}`, [prospect.family, prospect.rubro, prospect.city].filter(Boolean).join(' · ')].filter(Boolean).join(' · ');
          return (
            <article key={prospect.id} className="queue-card daily-item">
              <h3>{prospect.company}</h3>
              <p className="muted">{reason || 'Sin datos de rubro o zona'} · mensaje versión {outreachVariant(prospect)}</p>
              <ContactLinks phone={prospect.phone} />
              <textarea rows={5} readOnly aria-label={`Mensaje para ${prospect.company}`} value={draft.whatsapp} />
              <div className="queue-actions">
                <CopyButton text={draft.whatsapp} />
                <button type="button" className="primary" onClick={() => onMarkProspect(prospect.id, 'Contactado', '')}>Contactado</button>
                <button type="button" className="secondary" onClick={() => onMarkProspect(prospect.id, 'Con interés', '')}>Con interés</button>
                <button type="button" className="secondary" onClick={() => onSkip(prospect.id)}>Saltar por hoy</button>
                <button type="button" className="secondary" onClick={() => onOpenProspect(prospect.id)}>Abrir ficha</button>
              </div>
              <ResultChips results={REJECTION_REASONS} onPick={(result) => onMarkProspect(prospect.id, 'Sin interés', result)} />
            </article>
          );
        }))}
    </div>
  );
}
