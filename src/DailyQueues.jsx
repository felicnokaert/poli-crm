import { useEffect, useMemo, useState } from 'react';
import { ExternalLink } from 'lucide-react';
import { buildCustomerBase, coverageByCompany } from './customer-base.mjs';
import { useComprobantes, argentinaToday } from './CustomerBasePanel.jsx';
import { QUEUE_SIZE, logClientContact, newProspectsQueue, quoteMessage, quotedQueue, reactivationMessage, reactivationQueue } from './daily-queues.mjs';
import { buildOutreachDraft } from './prospect-outreach.mjs';
import { outreachVariant, REJECTION_REASONS, possibleWhatsAppLink } from './prospect-model.mjs';
import { normalizePhoneAR } from './prospect-contact.mjs';

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

function ClientQueueCard({ item, queue, message, onOpenClient, onResult }) {
  return (
    <article className="queue-card daily-item">
      <h3>{item.client.company}</h3>
      <p className="muted">{item.reason}{item.client.family ? ` · ${item.client.family}` : ''}</p>
      <ContactLinks phone={item.client.phone} />
      <textarea rows={4} readOnly aria-label={`Mensaje para ${item.client.company}`} value={message} />
      <div className="queue-actions">
        <CopyButton text={message} />
        <button type="button" className="secondary" onClick={() => onOpenClient(item.client.id)}><ExternalLink size={14} /> Abrir empresa</button>
      </div>
      <ResultChips results={CLIENT_RESULTS} onPick={(result) => onResult(item.client.id, queue, result)} />
    </article>
  );
}

export function DailyQueues({ supabase, clients, prospects, checks, userEmail, defaultSender, setData, onOpenClient, onMarkProspect, onOpenProspect, skipped, onSkip }) {
  const [view, setView] = useState('reactivar');
  const [note, setNote] = useState('');
  const { status, rows, sync } = useComprobantes(supabase);
  const today = argentinaToday();
  const sender = useMemo(() => { try { return localStorage.getItem('poliplast-sender-name') || defaultSender || ''; } catch { return defaultSender || ''; } }, [defaultSender]);
  const { byClient } = useMemo(() => buildCustomerBase(rows, clients, { today }), [rows, clients, today]);
  const reactivar = useMemo(() => reactivationQueue({ clients, base: byClient, today }), [clients, byClient, today]);
  const cotizaron = useMemo(() => quotedQueue({ clients, base: byClient, today }), [clients, byClient, today]);
  const nuevos = useMemo(() => newProspectsQueue({ prospects, checks, skipped }), [prospects, checks, skipped]);
  const coverage = useMemo(() => coverageByCompany(rows), [rows]);
  const syncing = sync.filter((item) => !item.history_done).map((item) => item.company);

  function recordResult(clientId, queue, result) {
    const found = clients.find((client) => client.id === clientId);
    setData((current) => ({ ...current, clients: (current.clients || []).map((client) => (client.id === clientId ? logClientContact(client, { queue, outcome: result, user: userEmail }) : client)) }));
    setNote(`${found?.company || 'Cliente'}: ${result}. No vuelve a aparecer por 14 días.`);
  }

  const tabs = [['reactivar', 'Reactivar', reactivar.length], ['cotizaron', 'Cotizaron y no compraron', cotizaron.length], ['nuevos', 'Prospectos nuevos', nuevos.length]];
  const needsData = ['reactivar', 'cotizaron'].includes(view);
  return (
    <div className="daily-queues">
      <p className="muted">Lo que conviene contactar hoy: hasta {QUEUE_SIZE} por lista, con el mensaje listo para copiar y editar. El CRM no envía nada: lo mandás vos y anotás qué respondieron para que el sistema aprenda por qué falla cada mensaje.</p>
      <div className="segmented" role="tablist" aria-label="Colas del día">
        {tabs.map(([key, label, count]) => (
          <button key={key} type="button" role="tab" aria-selected={view === key} className={view === key ? 'selected' : ''} onClick={() => setView(key)}>{label} ({count})</button>
        ))}
      </div>
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

      {view === 'reactivar' && status === 'ready' && (reactivar.length === 0
        ? <p className="muted">No hay clientes recurrentes o grandes para reactivar hoy (o ya los trabajaste en los últimos 14 días).</p>
        : reactivar.map((item) => <ClientQueueCard key={item.client.id} item={item} queue="reactivar" message={reactivationMessage(item.client, item.info, sender)} onOpenClient={onOpenClient} onResult={recordResult} />))}

      {view === 'cotizaron' && status === 'ready' && (cotizaron.length === 0
        ? <p className="muted">No hay cotizaciones sin respuesta entre 3 y 90 días (o ya las trabajaste en los últimos 14 días).</p>
        : cotizaron.map((item) => <ClientQueueCard key={item.client.id} item={item} queue="cotizaron" message={quoteMessage(item.client, item.quote, sender)} onOpenClient={onOpenClient} onResult={recordResult} />))}

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
