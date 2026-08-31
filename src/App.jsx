import { useEffect, useMemo, useState } from 'react';
import {
  BarChart3,
  BookOpen,
  Building2,
  CalendarCheck,
  CheckCircle2,
  ChevronRight,
  CircleAlert,
  ClipboardList,
  LayoutDashboard,
  MessageCircle,
  Inbox,
  Plus,
  Search,
  Target,
  GraduationCap,
  Sparkles,
  Database,
  Download,
  Upload,
  X,
  Link2,
} from 'lucide-react';
import { CLASSIFICATIONS, QUICK_REPLIES, ROLE_PLAYS, RUBRIC, scoreBand } from './knowledge';
import { loadOnlineState, onlineConfigured, saveOnlineState, supabase } from './online';
import { connectWhatsApp } from './meta-onboarding';
import { formatDate } from './utils.mjs';

const CHANNELS = {
  general: {
    name: 'WhatsApp General',
    number: '+54 9 11 5262-7555',
    profile: 'POLIPLAST',
    color: '#0d7764',
    status: 'Meta aprobado · app conectada',
    statusTone: 'online',
  },
  penosil: {
    name: 'WhatsApp Penosil',
    number: '+54 9 11 7155-8957',
    profile: 'FOAM',
    color: '#d9792b',
    status: 'Meta aprobado · conexión pendiente',
    statusTone: 'offline',
  },
  call: { name: 'Llamada', number: '', profile: '', color: '#3b6d9b' },
  email: { name: 'Email', number: '', profile: '', color: '#6b5aa6' },
};

const PIPELINE = ['Nuevo', 'Contactado', 'Conversación', 'Calificado', 'Propuesta', 'Negociación', 'Ganado', 'Pausado', 'Perdido'];
const FAMILIES = ['Sin definir', 'Poliuretano', 'Poliurea', 'PURMAC', 'Penosil', 'PRFV', 'Carrozados', 'Resinplast', 'Imperpur', 'Foam Factory', 'Otra'];
const STORAGE_KEY = 'poliplast-sales-copilot-v1';

const initialState = { clients: [], interactions: [], tasks: [], inbox: [] };

function addDays(days) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

function draftFromWhatsApp(event) {
  const text = (event.text_body || '').trim();
  const lower = text.toLowerCase();
  const familyRules = [
    ['Penosil', ['penosil', 'easyspray', 'espuma aerosol']],
    ['Poliurea', ['poliurea']],
    ['Poliuretano', ['poliuretano', 'espuma rígida', 'espuma rigida', 'aislación', 'aislacion']],
    ['PURMAC', ['purmac', 'máquina', 'maquina', 'repuesto']],
    ['PRFV', ['prfv', 'fibra de vidrio', 'resina poliéster', 'resina poliester']],
    ['Carrozados', ['carrozado', 'furgón', 'furgon']],
    ['Resinplast', ['resinplast']],
    ['Imperpur', ['imperpur', 'impermeabil']],
  ];
  const family = familyRules.find(([, words]) => words.some((word) => lower.includes(word)))?.[0] || 'Sin definir';
  const urgent = /hoy|urgente|mañana|manana|esta semana|para el viernes|cuanto antes/.test(lower);
  const commercial = /precio|cotiz|comprar|necesito|kg|litros|unidades|cantidad|stock/.test(lower);
  return {
    company: event.customer_name || '',
    contact: event.customer_name || '',
    family,
    summary: text || `[${event.message_type || 'mensaje sin texto'}]`,
    need: text,
    temperature: urgent && commercial ? 'Caliente' : commercial ? 'Tibio' : 'Frío',
    stage: commercial ? 'Contactado' : 'Conversación',
    nextAction: commercial ? 'Responder y completar diagnóstico comercial' : 'Revisar conversación de WhatsApp',
    nextDate: urgent ? today() : addDays(commercial ? 1 : 2),
  };
}

function loadState() {
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY));
    return stored ? { ...initialState, ...stored, inbox: stored.inbox || [] } : initialState;
  } catch {
    return initialState;
  }
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function longToday() {
  return new Intl.DateTimeFormat('es-AR', { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date());
}

function blankInteraction() {
  return {
    company: '',
    contact: '',
    channel: 'general',
    family: 'Sin definir',
    summary: '',
    need: '',
    objection: '',
    temperature: 'Tibio',
    stage: 'Conversación',
    nextAction: '',
    nextDate: today(),
    clientType: 'Desconocido',
    industry: 'Desconocida',
    fit: 'A confirmar',
    urgency: 'A confirmar',
    potential: 'Hipótesis media',
    currentSupplier: '',
    decisionMaker: '',
    lossReason: '',
    repurchaseTrigger: '',
    repurchaseDate: '',
  };
}

export default function App() {
  const [data, setData] = useState(loadState);
  const [session, setSession] = useState(null);
  const [authReady, setAuthReady] = useState(!onlineConfigured);
  const [remoteReady, setRemoteReady] = useState(false);
  const [syncStatus, setSyncStatus] = useState(onlineConfigured ? 'Conectando…' : 'Modo local');
  const [view, setView] = useState('dashboard');
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(blankInteraction);
  const [inboxDraft, setInboxDraft] = useState(null);
  const [query, setQuery] = useState('');
  const [selectedInteractionId, setSelectedInteractionId] = useState(null);
  const [selectedClientId, setSelectedClientId] = useState(null);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  }, [data]);

  useEffect(() => {
    if (!onlineConfigured) return undefined;
    supabase.auth.getSession().then(({ data: authData }) => {
      setSession(authData.session);
      setAuthReady(true);
    });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      setAuthReady(true);
    });
    return () => listener.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!onlineConfigured || !session?.user?.id) {
      setRemoteReady(false);
      return undefined;
    }
    let active = true;
    setSyncStatus('Sincronizando…');
    loadOnlineState().then(({ state }) => {
      if (!active) return;
      setData({ ...initialState, ...state, inbox: state.inbox || [] });
      setRemoteReady(true);
      setSyncStatus('Sincronizado');
    }).catch(() => active && setSyncStatus('Error de sincronización'));

    const channel = supabase.channel('whatsapp-inbox').on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'whatsapp_events' }, ({ new: event }) => {
      if (event.direction === 'status') return;
      setData((current) => current.inbox.some((item) => item.event_id === event.event_id)
        ? current
        : { ...current, inbox: [{ ...event, classification_status: 'pending' }, ...current.inbox] });
    }).subscribe();
    return () => {
      active = false;
      supabase.removeChannel(channel);
    };
  }, [session?.user?.id]);

  useEffect(() => {
    if (!onlineConfigured || !remoteReady || !session?.user?.id) return undefined;
    setSyncStatus('Guardando…');
    const timer = setTimeout(() => {
      saveOnlineState(session.user.id, session.user.email, data).then(() => setSyncStatus('Sincronizado')).catch(() => setSyncStatus('Error de sincronización'));
    }, 700);
    return () => clearTimeout(timer);
  }, [data, remoteReady, session?.user?.id]);

  const metrics = useMemo(() => {
    const now = today();
    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);
    const recent = data.interactions.filter((item) => new Date(item.createdAt) >= weekAgo);
    return {
      clients: data.clients.length,
      contacts: recent.length,
      effective: recent.filter((item) => item.need || item.contact).length,
      proposals: data.clients.filter((item) => ['Propuesta', 'Negociación'].includes(item.stage)).length,
      wins: data.clients.filter((item) => item.stage === 'Ganado').length,
      overdue: data.tasks.filter((task) => !task.done && task.dueDate < now).length,
      dueToday: data.tasks.filter((task) => !task.done && task.dueDate === now).length,
    };
  }, [data]);

  if (!authReady) return <Splash text="Preparando acceso seguro…" />;
  if (onlineConfigured && !session) return <LoginScreen />;

  const filteredClients = data.clients.filter((client) =>
    `${client.company} ${client.contact} ${client.family}`.toLowerCase().includes(query.toLowerCase()),
  );

  function saveInteraction(event) {
    event.preventDefault();
    const stamp = new Date().toISOString();
    const existing = data.clients.find((client) => client.company.toLowerCase() === form.company.trim().toLowerCase());
    const clientId = existing?.id || crypto.randomUUID();
    const client = {
      id: clientId,
      company: form.company.trim(),
      contact: form.contact.trim(),
      family: form.family,
      temperature: form.temperature,
      stage: form.stage,
      clientType: form.clientType,
      industry: form.industry,
      fit: form.fit,
      urgency: form.urgency,
      potential: form.potential,
      currentSupplier: form.currentSupplier,
      decisionMaker: form.decisionMaker,
      lossReason: form.lossReason,
      repurchaseTrigger: form.repurchaseTrigger,
      repurchaseDate: form.repurchaseDate,
      lastContact: today(),
      updatedAt: stamp,
    };
    const interaction = { ...form, id: crypto.randomUUID(), clientId, createdAt: stamp };
    const tasks = form.nextAction.trim()
      ? [
          ...data.tasks,
          {
            id: crypto.randomUUID(),
            clientId,
            company: client.company,
            title: form.nextAction.trim(),
            dueDate: form.nextDate,
            cadence: 'Diaria',
            priority: form.temperature === 'Caliente' ? 'Alta' : 'Media',
            done: false,
            createdAt: stamp,
          },
        ]
      : data.tasks;
    setData({
      ...data,
      clients: existing ? data.clients.map((item) => (item.id === clientId ? { ...item, ...client } : item)) : [...data.clients, client],
      interactions: [interaction, ...data.interactions],
      tasks,
    });
    setForm(blankInteraction());
    setShowForm(false);
  }

  function toggleTask(id) {
    setData({ ...data, tasks: data.tasks.map((task) => (task.id === id ? { ...task, done: !task.done } : task)) });
  }

  function classifyInbox(eventId, decision) {
    const event = data.inbox.find((item) => item.event_id === eventId);
    if (!event) return;
    const stamp = new Date().toISOString();
    const status = decision === 'ignore' ? 'ignored' : decision;
    if (decision === 'ignore') {
      setData({ ...data, inbox: data.inbox.map((item) => item.event_id === eventId ? { ...item, classification_status: status, classifiedAt: stamp } : item) });
      return;
    }

    const company = event.customer_name || event.customer_wa_id || 'Contacto de WhatsApp';
    const existing = data.clients.find((client) => client.whatsappId === event.customer_wa_id);
    const clientId = existing?.id || crypto.randomUUID();
    const client = existing || {
      id: clientId,
      company,
      contact: event.customer_name || '',
      whatsappId: event.customer_wa_id,
      family: 'Sin definir',
      temperature: 'Tibio',
      stage: decision === 'followup' ? 'Contactado' : 'Conversación',
      clientType: 'Desconocido',
      industry: 'Desconocida',
      fit: 'A confirmar',
      urgency: 'A confirmar',
      potential: 'Hipótesis media',
      lastContact: today(),
      updatedAt: stamp,
    };
    const interaction = {
      id: crypto.randomUUID(),
      clientId,
      sourceEventId: event.event_id,
      company,
      contact: event.customer_name || '',
      channel: event.channel === 'penosil' ? 'penosil' : 'general',
      family: 'Sin definir',
      summary: event.text_body || `[${event.message_type || 'mensaje'}]`,
      need: '',
      objection: '',
      temperature: 'Tibio',
      stage: client.stage,
      authorization: decision,
      trainingAllowed: decision === 'training',
      createdAt: event.occurred_at || stamp,
    };
    const newTask = decision === 'followup' ? {
      id: crypto.randomUUID(), clientId, company, title: 'Revisar y responder conversación de WhatsApp',
      dueDate: today(), cadence: 'Diaria', priority: 'Media', done: false, createdAt: stamp,
    } : null;
    setData({
      ...data,
      clients: existing ? data.clients.map((item) => item.id === clientId ? { ...item, lastContact: today(), updatedAt: stamp } : item) : [...data.clients, client],
      interactions: [interaction, ...data.interactions],
      tasks: newTask ? [...data.tasks, newTask] : data.tasks,
      inbox: data.inbox.map((item) => item.event_id === eventId ? { ...item, classification_status: status, classifiedAt: stamp } : item),
    });
  }

  function openInboxDraft(eventId) {
    const event = data.inbox.find((item) => item.event_id === eventId);
    if (event) setInboxDraft({ event, form: draftFromWhatsApp(event) });
  }

  function confirmInboxDraft(event) {
    event.preventDefault();
    if (!inboxDraft) return;
    const source = inboxDraft.event;
    const draft = inboxDraft.form;
    const stamp = new Date().toISOString();
    const existing = data.clients.find((client) => client.whatsappId === source.customer_wa_id)
      || data.clients.find((client) => draft.company && client.company.toLowerCase() === draft.company.trim().toLowerCase());
    const clientId = existing?.id || crypto.randomUUID();
    const company = draft.company.trim() || source.customer_name || source.customer_wa_id || 'Contacto de WhatsApp';
    const client = {
      ...(existing || {}), id: clientId, company, contact: draft.contact.trim(), whatsappId: source.customer_wa_id,
      family: draft.family, temperature: draft.temperature, stage: draft.stage,
      clientType: existing?.clientType || 'Desconocido', industry: existing?.industry || 'Desconocida',
      fit: existing?.fit || 'A confirmar', urgency: draft.nextDate === today() ? 'Alta' : existing?.urgency || 'A confirmar',
      potential: existing?.potential || 'Hipótesis media', lastContact: today(), updatedAt: stamp,
      updatedBy: session?.user?.email || '',
    };
    const interaction = {
      id: crypto.randomUUID(), clientId, sourceEventId: source.event_id, company, contact: draft.contact.trim(),
      channel: source.channel === 'penosil' ? 'penosil' : 'general', family: draft.family,
      summary: draft.summary.trim(), need: draft.need.trim(), objection: '', temperature: draft.temperature,
      stage: draft.stage, authorization: 'confirmed-draft', trainingAllowed: false,
      createdAt: source.occurred_at || stamp, createdBy: session?.user?.email || '',
    };
    const task = draft.nextAction.trim() ? {
      id: crypto.randomUUID(), clientId, company, title: draft.nextAction.trim(), dueDate: draft.nextDate,
      cadence: 'Diaria', priority: draft.temperature === 'Caliente' ? 'Alta' : 'Media', done: false,
      createdAt: stamp, createdBy: session?.user?.email || '', trigger: 'Borrador confirmado desde WhatsApp',
    } : null;
    setData({
      ...data,
      clients: existing ? data.clients.map((item) => item.id === clientId ? client : item) : [...data.clients, client],
      interactions: [interaction, ...data.interactions],
      tasks: task ? [...data.tasks, task] : data.tasks,
      inbox: data.inbox.map((item) => item.event_id === source.event_id
        ? { ...item, classification_status: 'confirmed', classifiedAt: stamp, classifiedBy: session?.user?.email || '' }
        : item),
    });
    setInboxDraft(null);
  }

  const nav = [
    ['dashboard', 'Inicio', LayoutDashboard],
    ['conversations', 'Conversaciones', MessageCircle],
    ['inbox', 'Bandeja WhatsApp', Inbox],
    ['tasks', 'Tareas', ClipboardList],
    ['pipeline', 'Pipeline', Target],
    ['clients', 'Clientes', Building2],
    ['replies', 'Respuestas', BookOpen],
    ['coach', 'Entrenador', GraduationCap],
    ['settings', 'Datos', Database],
  ];

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">P</div>
          <div><strong>Sales Copilot</strong><span>Grupo Poliplast</span></div>
        </div>
        <nav>
          {nav.map(([id, label, Icon]) => (
            <button key={id} className={view === id ? 'active' : ''} onClick={() => setView(id)}>
              <Icon size={19} /> {label}
            </button>
          ))}
        </nav>
        <div className="sidebar-note">
          <span className="eyebrow">{onlineConfigured ? 'Equipo conectado' : 'MVP local'}</span>
          <p>{onlineConfigured ? 'La cartera se comparte con los usuarios autorizados.' : 'La información permanece en este navegador durante el piloto.'}</p>
          <div className="legal-links"><a href="/privacidad.html" target="_blank" rel="noreferrer">Privacidad</a><a href="/terminos.html" target="_blank" rel="noreferrer">Términos</a><a href="/eliminacion-datos.html" target="_blank" rel="noreferrer">Eliminar datos</a></div>
        </div>
      </aside>

      <main>
        <header className="topbar">
          <div>
            <span className="eyebrow">{longToday()}</span>
            <h1>{nav.find(([id]) => id === view)?.[1]}</h1>
          </div>
          <div className="top-actions">
            <span className={`sync-pill ${syncStatus === 'Sincronizado' ? 'ok' : ''}`}>{syncStatus}</span>
            <div className="profile-pill">FC</div>
            <button className="primary" onClick={() => setShowForm(true)}><Plus size={18} /> Registrar conversación</button>
          </div>
        </header>

        <section className="channel-strip">
          {['general', 'penosil'].map((key) => (
            <div className="channel-card" key={key}>
              <span className="channel-dot" style={{ background: CHANNELS[key].color }} />
              <div><strong>{CHANNELS[key].name}</strong><span>{CHANNELS[key].profile} · {CHANNELS[key].number}</span></div>
              <span className={`status ${CHANNELS[key].statusTone}`}>{CHANNELS[key].status}</span>
            </div>
          ))}
        </section>

        {view === 'dashboard' && <Dashboard metrics={metrics} tasks={data.tasks} interactions={data.interactions} onToggle={toggleTask} onOpenInteraction={setSelectedInteractionId} />}
        {view === 'conversations' && <Conversations items={data.interactions} onOpen={setSelectedInteractionId} />}
        {view === 'inbox' && <WhatsAppInbox items={data.inbox} onClassify={classifyInbox} onDraft={openInboxDraft} />}
        {view === 'tasks' && <Tasks items={data.tasks} onToggle={toggleTask} />}
        {view === 'pipeline' && <Pipeline clients={data.clients} onOpenClient={setSelectedClientId} />}
        {view === 'clients' && <Clients clients={filteredClients} query={query} setQuery={setQuery} onOpenClient={setSelectedClientId} />}
        {view === 'replies' && <QuickReplies />}
        {view === 'coach' && <Coach interactions={data.interactions} data={data} setData={setData} />}
        {view === 'settings' && <DataSettings data={data} setData={setData} session={session} syncStatus={syncStatus} />}
      </main>

      {showForm && <InteractionForm form={form} setForm={setForm} onClose={() => setShowForm(false)} onSave={saveInteraction} />}
      {inboxDraft && <InboxDraftModal draft={inboxDraft} setDraft={setInboxDraft} onClose={() => setInboxDraft(null)} onConfirm={confirmInboxDraft} />}
      {selectedInteractionId && <InteractionDetail interaction={data.interactions.find((item) => item.id === selectedInteractionId)} client={data.clients.find((item) => item.id === data.interactions.find((entry) => entry.id === selectedInteractionId)?.clientId)} onClose={() => setSelectedInteractionId(null)} onOpenClient={(clientId) => { setSelectedInteractionId(null); setSelectedClientId(clientId); }} />}
      {selectedClientId && <ClientDetail client={data.clients.find((item) => item.id === selectedClientId)} interactions={data.interactions.filter((item) => item.clientId === selectedClientId)} tasks={data.tasks.filter((item) => item.clientId === selectedClientId)} onClose={() => setSelectedClientId(null)} onOpenInteraction={setSelectedInteractionId} />}
    </div>
  );
}

function Dashboard({ metrics, tasks, interactions, onToggle, onOpenInteraction }) {
  const cards = [
    ['Contactos esta semana', metrics.contacts, 'Meta: 15', MessageCircle],
    ['Contactos efectivos', metrics.effective, 'Meta: 8–10', CheckCircle2],
    ['Propuestas activas', metrics.proposals, 'Meta: 2–3', BarChart3],
    ['Seguimientos vencidos', metrics.overdue, metrics.dueToday ? `${metrics.dueToday} para hoy` : 'Ninguno para hoy', CircleAlert],
  ];
  return (
    <div className="content-stack">
      <section className="metric-grid">
        {cards.map(([label, value, note, Icon]) => <article className="metric-card" key={label}><Icon size={20}/><span>{label}</span><strong>{value}</strong><small>{note}</small></article>)}
      </section>
      <section className="two-columns">
        <article className="panel">
          <div className="panel-head"><div><span className="eyebrow">Prioridad</span><h2>Próximas acciones</h2></div><CalendarCheck size={22}/></div>
          <TaskList items={tasks.filter((task) => !task.done).sort((a, b) => a.dueDate.localeCompare(b.dueDate)).slice(0, 6)} onToggle={onToggle} emptyText="Sin tareas por ahora. Registrá una conversación para que el copiloto te ayude a definir el próximo paso."/>
        </article>
        <article className="panel">
          <div className="panel-head"><div><span className="eyebrow">Actividad</span><h2>Últimas conversaciones</h2></div><MessageCircle size={22}/></div>
          {interactions.length ? interactions.slice(0, 5).map((item) => <InteractionRow item={item} key={item.id} onOpen={onOpenInteraction}/>) : <Empty text="Todavía no hay conversaciones registradas. La primera que cargues inicia la memoria comercial." />}
        </article>
      </section>
      <section className="panel goals">
        <div className="panel-head"><div><span className="eyebrow">Plan comercial</span><h2>Cadencia de resultados</h2></div><Target size={22}/></div>
        <div className="goal-grid">
          <Goal title="Diario" text="Conversar, registrar y definir el próximo paso." />
          <Goal title="Semanal" text="15 nuevos · 8–10 efectivos · 2–3 propuestas." />
          <Goal title="Mensual" text="Clientes nuevos, conversión, recompra y cross-selling." />
          <Goal title="Trimestral" text="10–15 clientes nuevos e incremento outbound." />
        </div>
      </section>
    </div>
  );
}

function Conversations({ items, onOpen }) {
  return <section className="panel"><div className="panel-head"><div><span className="eyebrow">Memoria comercial</span><h2>Historial de conversaciones</h2></div></div>{items.length ? items.map((item) => <InteractionRow item={item} key={item.id} expanded onOpen={onOpen} />) : <Empty text="Registrá la primera conversación para comenzar la memoria comercial." />}</section>;
}

function WhatsAppInbox({ items, onClassify, onDraft }) {
  const pending = items.filter((item) => item.classification_status === 'pending');
  const processed = items.filter((item) => item.classification_status !== 'pending');
  return <div className="content-stack"><section className="panel"><div className="panel-head"><div><span className="eyebrow">Autorización humana</span><h2>Mensajes pendientes</h2></div><span className="inbox-count">{pending.length}</span></div>{pending.length ? pending.map((item) => <InboxRow item={item} onClassify={onClassify} onDraft={onDraft} key={item.event_id}/>) : <Empty text="No hay mensajes esperando clasificación." />}</section>{processed.length > 0 && <section className="panel"><div className="panel-head"><div><span className="eyebrow">Trazabilidad</span><h2>Procesados recientemente</h2></div></div>{processed.slice(0, 12).map((item) => <InboxRow item={item} key={item.event_id}/>)}</section>}</div>;
}

function InboxRow({ item, onClassify, onDraft }) {
  const pending = item.classification_status === 'pending';
  const labels = { ignored: 'No requiere acción', memory: 'Contexto guardado', followup: 'Tarea creada', training: 'Enviado al entrenador', confirmed: 'Borrador confirmado' };
  return <article className="inbox-row"><div className="inbox-message"><span className="channel-dot" style={{ background: CHANNELS[item.channel]?.color || '#7d8790' }}/><div><strong>{item.customer_name || item.customer_wa_id || 'Contacto sin identificar'}</strong><span>{CHANNELS[item.channel]?.name || 'WhatsApp'} · {new Date(item.occurred_at).toLocaleString('es-AR')}</span><p>{item.text_body || `[${item.message_type || 'mensaje sin texto'}]`}</p></div></div>{pending ? <div className="decision-buttons"><button onClick={() => onDraft(item.event_id)} className="recommended">Revisar borrador</button><button onClick={() => onClassify(item.event_id, 'ignore')}>No requiere acción</button><button onClick={() => onClassify(item.event_id, 'memory')}>Solo contexto</button><button onClick={() => onClassify(item.event_id, 'training')}>Entrenador</button></div> : <span className={`decision-tag ${item.classification_status}`}>{labels[item.classification_status] || item.classification_status}</span>}</article>;
}

function InboxDraftModal({ draft, setDraft, onClose, onConfirm }) {
  const update = (name, value) => setDraft({ ...draft, form: { ...draft.form, [name]: value } });
  const form = draft.form;
  return <div className="modal-backdrop"><form className="modal" onSubmit={onConfirm}><div className="modal-head"><div><span className="eyebrow">Borrador automático · confirmar antes de guardar</span><h2>Convertir mensaje en oportunidad</h2><p>Revisá y corregí. El CRM no responde al cliente.</p></div><button type="button" className="icon-button" aria-label="Cerrar borrador" onClick={onClose}><X/></button></div><div className="source-message"><strong>Mensaje original</strong><p>{draft.event.text_body || `[${draft.event.message_type || 'mensaje sin texto'}]`}</p></div><div className="form-grid"><label>Empresa / cliente<input required value={form.company} onChange={(event) => update('company', event.target.value)} placeholder="Confirmar empresa" /></label><label>Persona / contacto<input value={form.contact} onChange={(event) => update('contact', event.target.value)} /></label><label>Familia<select value={form.family} onChange={(event) => update('family', event.target.value)}>{FAMILIES.map((item) => <option key={item}>{item}</option>)}</select></label><label>Temperatura<select value={form.temperature} onChange={(event) => update('temperature', event.target.value)}><option>Frío</option><option>Tibio</option><option>Caliente</option></select></label><label>Etapa<select value={form.stage} onChange={(event) => update('stage', event.target.value)}>{PIPELINE.map((item) => <option key={item}>{item}</option>)}</select></label><label>Fecha próxima<input type="date" value={form.nextDate} onChange={(event) => update('nextDate', event.target.value)} /></label><label className="span-2">Resumen<textarea value={form.summary} onChange={(event) => update('summary', event.target.value)} /></label><label className="span-2">Necesidad detectada<textarea value={form.need} onChange={(event) => update('need', event.target.value)} /></label><label className="span-2">Próxima acción<input value={form.nextAction} onChange={(event) => update('nextAction', event.target.value)} /></label></div><div className="modal-actions"><button type="button" className="secondary" onClick={onClose}>Cancelar</button><button className="primary" type="submit">Confirmar y crear seguimiento</button></div></form></div>;
}

function InteractionRow({ item, expanded = false, onOpen }) {
  const content = <><span className="channel-dot" style={{ background: CHANNELS[item.channel]?.color || '#7d8790' }} /><div><strong>{item.company}</strong><span>{item.contact || CHANNELS[item.channel]?.name || 'Contacto sin identificar'} · {new Date(item.createdAt).toLocaleString('es-AR')}</span>{expanded && <p>{item.summary || item.need || 'Sin resumen'}</p>}</div><div className="row-tail"><span className={`temp ${(item.temperature || 'Tibio').toLowerCase()}`}>{item.temperature || 'Tibio'}</span><ChevronRight size={17}/></div></>;
  return onOpen ? <button className={`interaction-row ${expanded ? 'expanded' : ''}`} onClick={() => onOpen(item.id)}>{content}</button> : <div className={`interaction-row ${expanded ? 'expanded' : ''}`}>{content}</div>;
}

function InteractionDetail({ interaction, client, onClose, onOpenClient }) {
  if (!interaction) return null;
  return <div className="modal-backdrop"><section className="modal interaction-detail"><div className="modal-head"><div><span className="eyebrow">Conversación registrada</span><h2>{interaction.company}</h2><p>{interaction.contact || 'Contacto sin identificar'} · {formatDate(interaction.createdAt)}</p></div><button type="button" className="icon-button" aria-label="Cerrar conversación" onClick={onClose}><X/></button></div><div className="conversation-detail-grid"><Fact label="Canal" value={CHANNELS[interaction.channel]?.name}/><Fact label="Familia" value={interaction.family}/><Fact label="Temperatura" value={interaction.temperature}/><Fact label="Etapa" value={interaction.stage}/></div><div className="detail-block"><span>Qué hablaron</span><p>{interaction.summary || 'Sin resumen registrado.'}</p></div><div className="detail-block"><span>Necesidad detectada</span><p>{interaction.need || 'Necesidad pendiente de confirmar.'}</p></div><div className="detail-block"><span>Próxima acción</span><p>{interaction.nextAction || 'Sin próxima acción definida.'}{interaction.nextDate ? ` · ${formatDate(interaction.nextDate)}` : ''}</p></div><div className="modal-actions"><button className="secondary" type="button" onClick={onClose}>Cerrar</button>{client && <button className="primary" type="button" onClick={() => onOpenClient(client.id)}>Ver ficha del cliente</button>}</div></section></div>;
}

function Tasks({ items, onToggle }) {
  const ordered = [...items].sort((a, b) => Number(a.done) - Number(b.done) || (a.dueDate || '').localeCompare(b.dueDate || ''));
  return <section className="panel"><div className="panel-head"><div><span className="eyebrow">Agenda única</span><h2>Tareas comerciales</h2></div></div><TaskList items={ordered} onToggle={onToggle}/></section>;
}

function TaskList({ items, onToggle, emptyText = 'No hay tareas pendientes.' }) {
  if (!items.length) return <Empty text={emptyText} />;
  return items.map((task) => <button className={`task-row ${task.done ? 'done' : ''}`} key={task.id} onClick={() => onToggle(task.id)}><span className="task-check">{task.done && <CheckCircle2 size={18}/>}</span><div><strong>{task.title}</strong><span>{task.company} · {formatDate(task.dueDate)}{task.trigger ? ` · ${task.trigger}` : ''}</span></div><span className={`priority ${task.priority.toLowerCase()}`}>{task.priority}</span></button>);
}

function Pipeline({ clients, onOpenClient }) {
  return <div className="kanban">{PIPELINE.map((stage) => { const list = clients.filter((client) => client.stage === stage); return <section className={`kanban-column ${['Pausado','Perdido'].includes(stage) ? 'inactive' : ''}`} key={stage}><header><strong>{stage}</strong><span>{list.length}</span></header>{list.map((client) => <button className="deal-card" key={client.id} onClick={() => onOpenClient(client.id)}><strong>{client.company}</strong><span>{client.family}</span><small>{client.contact || 'Contacto pendiente'}</small>{client.lossReason && <small className="loss-reason">{client.lossReason}</small>}</button>)}{!list.length && <div className="empty-slot">Sin cuentas</div>}</section>; })}</div>;
}

function Clients({ clients, query, setQuery, onOpenClient }) {
  return <section className="panel"><div className="panel-head"><div><span className="eyebrow">Cartera</span><h2>Clientes y prospectos</h2></div><label className="search"><Search size={17}/><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar…" /></label></div>{clients.length ? <div className="client-table">{clients.map((client) => <button className="client-row" onClick={() => onOpenClient(client.id)} key={client.id}><div className="avatar">{client.company.slice(0, 2).toUpperCase()}</div><div><strong>{client.company}</strong><span>{client.contact || 'Sin contacto identificado'}</span></div><span>{client.family}</span><span className={`temp ${(client.temperature || 'Tibio').toLowerCase()}`}>{client.temperature || 'Tibio'}</span><strong>{client.stage}</strong></button>)}</div> : <Empty text="Todavía no hay clientes en la cartera. Se sumarán automáticamente al registrar conversaciones." />}</section>;
}

function ClientDetail({ client, interactions, tasks, onClose, onOpenInteraction }) {
  if (!client) return null;
  const latest = interactions[0];
  const nextTask = tasks.filter((item) => !item.done).sort((a, b) => a.dueDate.localeCompare(b.dueDate))[0];
  return <div className="modal-backdrop"><section className="modal client-detail"><div className="modal-head"><div><span className="eyebrow">Antes de llamar</span><h2>{client.company}</h2><p>{client.contact || 'Contacto pendiente'} · {client.temperature || 'Tibio'} · {client.stage}</p></div><button type="button" className="icon-button" aria-label="Cerrar ficha" onClick={onClose}><X/></button></div><div className="call-brief"><article><span>Última conversación</span><strong>{latest?.summary || 'Sin resumen registrado'}</strong><p>{latest?.need || 'Necesidad a confirmar'}</p></article><article><span>Próximo paso</span><strong>{nextTask?.title || 'Sin seguimiento pendiente'}</strong><p>{nextTask ? formatDate(nextTask.dueDate) : 'Definir en el próximo contacto'}</p></article></div><div className="client-facts"><Fact label="Familia" value={client.family}/><Fact label="Proveedor actual" value={client.currentSupplier}/><Fact label="Decisor" value={client.decisionMaker}/><Fact label="Urgencia" value={client.urgency}/><Fact label="Potencial" value={client.potential}/><Fact label="Recompra" value={client.repurchaseDate ? `${formatDate(client.repurchaseDate)} · ${client.repurchaseTrigger || 'sin disparador'}` : client.repurchaseTrigger}/>{client.lossReason && <Fact label="Motivo de pausa/pérdida" value={client.lossReason}/>}</div><div className="history"><h3>Historial</h3>{interactions.length ? interactions.map((item) => <InteractionRow item={item} expanded key={item.id} onOpen={(id) => { onClose(); onOpenInteraction(id); }} />) : <Empty text="Sin conversaciones registradas."/>}</div></section></div>;
}

function Fact({ label, value }) { return <div><span>{label}</span><strong>{value || 'A confirmar'}</strong></div>; }

function QuickReplies() {
  const [channel, setChannel] = useState('general');
  return <div className="content-stack"><section className="panel"><div className="panel-head"><div><span className="eyebrow">Sugerencias editables</span><h2>Biblioteca de respuestas rápidas</h2></div><div className="segmented"><button className={channel === 'general' ? 'selected' : ''} onClick={() => setChannel('general')}>General</button><button className={channel === 'penosil' ? 'selected' : ''} onClick={() => setChannel('penosil')}>Penosil</button></div></div><div className="reply-grid">{QUICK_REPLIES[channel].map(([title, guidance], index) => <article className="reply-card" key={title}><span>{String(index + 1).padStart(2, '0')}</span><h3>{title}</h3><p>{guidance}</p><button onClick={() => navigator.clipboard?.writeText(guidance)}>Copiar criterio</button></article>)}</div><div className="quality-note"><CircleAlert size={19}/><p>Estas entradas orientan la conversación. Nunca envían mensajes automáticamente. Todo dato técnico, precio, stock, descuento o plazo debe validarse.</p></div></section><Training /></div>;
}

function Coach({ interactions, data, setData }) {
  const [selected, setSelected] = useState(interactions[0]?.id || '');
  const interaction = interactions.find((item) => item.id === selected);
  const [scores, setScores] = useState(Object.fromEntries(RUBRIC.map(([id]) => [id, 0])));
  const [feedback, setFeedback] = useState({ good: '', missing: '', risk: '', suggested: '', learning: '' });
  const total = Object.values(scores).reduce((sum, value) => sum + Number(value), 0);
  const band = scoreBand(total);

  useEffect(() => {
    if (interaction?.evaluation) {
      setScores(interaction.evaluation.scores);
      setFeedback(interaction.evaluation.feedback);
      return;
    }
    setScores(Object.fromEntries(RUBRIC.map(([id]) => [id, 0])));
    setFeedback({ good: '', missing: '', risk: '', suggested: '', learning: '' });
  }, [selected]);

  function saveEvaluation() {
    if (!interaction) return;
    const evaluation = { scores, total, band: band.label, feedback, evaluatedAt: new Date().toISOString() };
    setData({ ...data, interactions: data.interactions.map((item) => item.id === interaction.id ? { ...item, evaluation } : item) });
  }

  if (!interactions.length) return <section className="panel"><Empty text="Registrá una conversación para poder evaluarla." /></section>;
  return <div className="coach-layout"><section className="panel"><div className="panel-head"><div><span className="eyebrow">Conversación</span><h2>Entrenador comercial</h2></div><Sparkles size={22}/></div><label className="coach-select">Elegir conversación<select value={selected} onChange={(e) => setSelected(e.target.value)}>{interactions.map((item) => <option key={item.id} value={item.id}>{item.company} · {new Date(item.createdAt).toLocaleDateString('es-AR')}</option>)}</select></label>{interaction && <div className="conversation-brief"><strong>{interaction.company}</strong><span>{interaction.contact || 'Contacto sin identificar'} · {interaction.family}</span><p>{interaction.summary || interaction.need || 'Sin resumen'}</p></div>}<div className="score-summary"><div><strong>{total}<small>/28</small></strong><span className={band.tone}>{band.label}</span></div><p>0–14 reforzar · 15–21 aceptable · 22–28 modelo</p></div></section><section className="panel rubric-panel"><div className="panel-head"><div><span className="eyebrow">Rúbrica Claude</span><h2>14 criterios</h2></div></div><div className="rubric-list">{RUBRIC.map(([id, label, question]) => <div className="rubric-row" key={id}><div><strong>{label}</strong><span>{question}</span></div><div className="score-buttons">{[0,1,2].map((value) => <button className={scores[id] === value ? 'selected' : ''} onClick={() => setScores({ ...scores, [id]: value })} key={value}>{value}</button>)}</div></div>)}</div></section><section className="panel feedback-panel"><div className="panel-head"><div><span className="eyebrow">Devolución</span><h2>Aprendizaje de la conversación</h2></div></div><div className="feedback-grid">{[['good','Qué se hizo bien'],['missing','Qué faltó preguntar'],['risk','Riesgo detectado'],['suggested','Próximo mensaje sugerido'],['learning','Aprendizaje reutilizable']].map(([id,label]) => <label key={id}>{label}<textarea value={feedback[id]} onChange={(e) => setFeedback({ ...feedback, [id]: e.target.value })}/></label>)}</div><button className="primary" onClick={saveEvaluation}>Guardar evaluación</button></section></div>;
}

function Training() {
  return <section className="panel"><div className="panel-head"><div><span className="eyebrow">Formación</span><h2>Role-play semanal</h2></div><GraduationCap size={22}/></div><div className="role-grid">{ROLE_PLAYS.map(([title, goal], index) => <article key={title}><span>Ejercicio {index + 1}</span><strong>{title}</strong><p>{goal}</p></article>)}</div><div className="cadence-grid"><Goal title="Diaria · 5 min" text="Revisar puntajes bajos y riesgos."/><Goal title="Semanal · 30 min" text="Un role-play y 2–3 conversaciones."/><Goal title="Mensual · 60 min" text="Tendencias, recompra y ajustes."/></div></section>;
}

function DataSettings({ data, setData, session, syncStatus }) {
  const [message, setMessage] = useState('');
  const [connecting, setConnecting] = useState(false);

  async function startWhatsAppConnection() {
    setConnecting(true);
    setMessage('Abriendo conexión segura con Meta…');
    try {
      const result = await connectWhatsApp(session);
      setMessage(`WhatsApp conectado${result.phoneNumberId ? ` · Phone ID ${result.phoneNumberId}` : ''}. El CRM ya puede recibir eventos del número autorizado.`);
    } catch (error) {
      setMessage(error.message || 'No se pudo completar la conexión con Meta.');
    } finally {
      setConnecting(false);
    }
  }

  function exportBackup() {
    const payload = { schemaVersion: 1, exportedAt: new Date().toISOString(), channels: CHANNELS, data };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `poliplast-sales-copilot-${today()}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
    setMessage('Respaldo exportado correctamente.');
  }

  async function importBackup(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const payload = JSON.parse(await file.text());
      if (payload.schemaVersion !== 1 || !payload.data?.clients || !payload.data?.interactions || !payload.data?.tasks) throw new Error('Formato inválido');
      setData({ ...initialState, ...payload.data, inbox: payload.data.inbox || [] });
      setMessage(`Respaldo importado: ${payload.data.clients.length} clientes y ${payload.data.interactions.length} conversaciones.`);
    } catch {
      setMessage('No se pudo importar: el archivo no corresponde a un respaldo válido.');
    } finally {
      event.target.value = '';
    }
  }

  async function importWebhookEvents(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const payload = JSON.parse(await file.text());
      const incoming = Array.isArray(payload) ? payload : payload.events;
      if (!Array.isArray(incoming)) throw new Error('Formato inválido');
      const known = new Set(data.inbox.map((item) => item.event_id));
      const valid = incoming.filter((item) => item.event_id && !known.has(item.event_id) && item.direction !== 'status');
      setData({ ...data, inbox: [...valid.map((item) => ({ ...item, classification_status: item.classification_status || 'pending' })), ...data.inbox] });
      setMessage(`${valid.length} mensajes nuevos incorporados a la bandeja; ${incoming.length - valid.length} duplicados o eventos de sistema omitidos.`);
    } catch {
      setMessage('No se pudo importar: se esperaba un arreglo de eventos normalizados del webhook.');
    } finally {
      event.target.value = '';
    }
  }

  return <div className="content-stack"><section className="panel"><div className="panel-head"><div><span className="eyebrow">Canales oficiales</span><h2>Conectar WhatsApp Business</h2></div><Link2 size={22}/></div><p>Autoriza un número existente mediante el registro oficial de Meta. El teléfono conserva WhatsApp Business y el CRM recibe los mensajes para clasificarlos; nunca responde automáticamente.</p><button className="primary" disabled={connecting} onClick={startWhatsAppConnection}>{connecting ? 'Conectando…' : 'Conectar número con Meta'}</button>{message && <div className="system-message">{message}</div>}</section><section className="panel"><div className="panel-head"><div><span className="eyebrow">Portabilidad</span><h2>Datos y respaldos</h2></div><Database size={22}/></div><div className="data-cards"><article><Download size={24}/><h3>Exportar respaldo</h3><p>Descarga clientes, conversaciones, tareas, evaluaciones y bandeja en un archivo JSON versionado.</p><button className="primary" onClick={exportBackup}>Descargar respaldo</button></article><article><Upload size={24}/><h3>Importar respaldo</h3><p>Restaura un respaldo del copiloto en este navegador. Reemplaza el estado actual.</p><label className="secondary upload-button">Elegir archivo<input type="file" accept="application/json,.json" onChange={importBackup}/></label></article><article><Inbox size={24}/><h3>Importar eventos WhatsApp</h3><p>Prueba la bandeja con eventos normalizados. Deduplica por ID y omite estados técnicos.</p><label className="secondary upload-button">Elegir eventos<input type="file" accept="application/json,.json" onChange={importWebhookEvents}/></label></article></div></section><section className="panel"><div className="panel-head"><div><span className="eyebrow">{onlineConfigured ? 'Estado online' : 'Estado local'}</span><h2>Contenido guardado</h2></div></div><div className="storage-summary"><div><strong>{data.clients.length}</strong><span>Clientes</span></div><div><strong>{data.interactions.length}</strong><span>Conversaciones</span></div><div><strong>{data.tasks.length}</strong><span>Tareas</span></div><div><strong>{data.inbox.filter((item) => item.classification_status === 'pending').length}</strong><span>WhatsApp pendientes</span></div></div><div className="quality-note"><CircleAlert size={19}/><p>{onlineConfigured ? `${syncStatus}. Usuario: ${session?.user?.email || 'sin identificar'}. Los cambios se guardan online y siguen teniendo respaldo local.` : 'Modo local de prueba. Exportá un respaldo al terminar cada jornada; al configurar la base, el mismo CRM activará acceso y sincronización online.'}</p></div>{onlineConfigured && <button className="secondary signout" onClick={() => supabase.auth.signOut()}>Cerrar sesión</button>}</section></div>;
}

function LoginScreen() {
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  async function submit(event) {
    event.preventDefault();
    setMessage('Enviando acceso…');
    const { error } = await supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: window.location.origin, shouldCreateUser: false } });
    setMessage(error ? 'No se pudo enviar el acceso. Verificá que el usuario esté habilitado.' : 'Revisá tu correo y abrí el enlace de acceso.');
  }
  return <div className="login-shell"><section className="login-card"><div className="brand-mark">P</div><span className="eyebrow">Acceso privado</span><h1>Poliplast Sales Copilot</h1><p>Ingresá con el correo habilitado. No necesitás recordar una contraseña.</p><form onSubmit={submit}><label>Correo<input type="email" required value={email} onChange={(event) => setEmail(event.target.value)} placeholder="nombre@empresa.com" /></label><button className="primary" type="submit">Enviar enlace de acceso</button></form>{message && <div className="system-message">{message}</div>}<div className="login-legal"><a href="/privacidad.html">Privacidad</a><a href="/terminos.html">Términos</a><a href="/eliminacion-datos.html">Eliminación de datos</a></div></section></div>;
}

function Splash({ text }) { return <div className="login-shell"><section className="login-card"><div className="brand-mark">P</div><h1>Poliplast Sales Copilot</h1><p>{text}</p></section></div>; }

function InteractionForm({ form, setForm, onClose, onSave }) {
  const field = (name) => ({ value: form[name], onChange: (event) => setForm({ ...form, [name]: event.target.value }) });
  return <div className="modal-backdrop"><form className="modal" onSubmit={onSave}><div className="modal-head"><div><span className="eyebrow">Registro posterior</span><h2>Nueva conversación</h2><p>Guardá lo esencial. La clasificación avanzada es opcional.</p></div><button type="button" className="icon-button" aria-label="Cerrar" onClick={onClose}><X/></button></div><div className="form-grid"><label>Empresa<input required {...field('company')} placeholder="Nombre del cliente" /></label><label>Persona / cargo<input {...field('contact')} placeholder="Ej. María · Compras" /></label><label>Canal<select {...field('channel')}>{Object.entries(CHANNELS).map(([key, item]) => <option value={key} key={key}>{item.name}</option>)}</select></label><label>Familia<select {...field('family')}>{FAMILIES.map((item) => <option key={item}>{item}</option>)}</select></label><label className="span-2">¿Qué hablaron?<textarea {...field('summary')} placeholder="Resumen breve y factual" /></label><label className="span-2">Necesidad detectada<textarea {...field('need')} placeholder="Problema, aplicación, volumen o urgencia" /></label><label>Temperatura comercial<select {...field('temperature')}><option>Frío</option><option>Tibio</option><option>Caliente</option></select></label><label>Etapa<select {...field('stage')}>{PIPELINE.map((item) => <option key={item}>{item}</option>)}</select></label><label>Fecha próxima<input type="date" {...field('nextDate')} /></label><label className="span-2">Próxima acción<input {...field('nextAction')} placeholder="Ej. llamar para confirmar consumo" /></label>{['Pausado','Perdido'].includes(form.stage) && <label className="span-2">Motivo de {form.stage.toLowerCase()}<input required {...field('lossReason')} placeholder="Motivo concreto para aprender o retomar" /></label>}</div><details className="advanced-fields"><summary>Agregar clasificación comercial, proveedor y recompra</summary><div className="form-grid"><label>Tipo de cliente<select {...field('clientType')}>{CLASSIFICATIONS.clientTypes.map((item) => <option key={item}>{item}</option>)}</select></label><label>Industria<select {...field('industry')}>{CLASSIFICATIONS.industries.map((item) => <option key={item}>{item}</option>)}</select></label><label>Encaje<select {...field('fit')}>{CLASSIFICATIONS.fit.map((item) => <option key={item}>{item}</option>)}</select></label><label>Urgencia<select {...field('urgency')}>{CLASSIFICATIONS.urgency.map((item) => <option key={item}>{item}</option>)}</select></label><label>Potencial<select {...field('potential')}>{CLASSIFICATIONS.potential.map((item) => <option key={item}>{item}</option>)}</select></label><label>Objeción<input {...field('objection')} placeholder="Ej. ya tiene proveedor" /></label><label>Proveedor actual<input {...field('currentSupplier')} placeholder="Nombre o sin proveedor" /></label><label>Decisor / quién aprueba<input {...field('decisionMaker')} placeholder="Persona, cargo o a confirmar" /></label><label>Fecha estimada de recompra<input type="date" {...field('repurchaseDate')} /></label><label>Disparador de recompra<input {...field('repurchaseTrigger')} placeholder="Ej. consumo mensual, fin de obra" /></label></div></details><div className="modal-actions"><button type="button" className="secondary" onClick={onClose}>Cancelar</button><button className="primary" type="submit">Guardar conversación</button></div></form></div>;
}

function Goal({ title, text }) { return <div><strong>{title}</strong><p>{text}</p></div>; }
function Empty({ text }) { return <div className="empty"><MessageCircle size={24}/><p>{text}</p></div>; }
