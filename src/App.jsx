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
import { loadOnlineState, mergeWorkspaceState, onlineConfigured, saveOnlineState, supabase, workspaceStatesEqual } from './online';
import { connectWhatsApp } from './meta-onboarding';
import { formatDate } from './utils.mjs';
import { buildCommercialCohort, mergeCommercialCohort } from './commercial-cohort';

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

function useModalEscape(onClose) {
  useEffect(() => {
    const handleKey = (event) => event.key === 'Escape' && onClose();
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onClose]);
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

function blankTask() {
  return { clientId: '', company: '', title: '', dueDate: today(), priority: 'Media', cadence: 'Seguimiento', trigger: '' };
}

export default function App() {
  const [data, setData] = useState(loadState);
  const [session, setSession] = useState(null);
  const [authReady, setAuthReady] = useState(!onlineConfigured);
  const [remoteReady, setRemoteReady] = useState(false);
  const [syncStatus, setSyncStatus] = useState(onlineConfigured ? 'Conectando…' : 'Modo local');
  const [readiness, setReadiness] = useState(null);
  const [view, setView] = useState('dashboard');
  const [showForm, setShowForm] = useState(false);
  const [showTaskForm, setShowTaskForm] = useState(false);
  const [taskForm, setTaskForm] = useState(blankTask);
  const [editingInteractionId, setEditingInteractionId] = useState(null);
  const [form, setForm] = useState(blankInteraction);
  const [inboxDraft, setInboxDraft] = useState(null);
  const [query, setQuery] = useState('');
  const [selectedInteractionId, setSelectedInteractionId] = useState(null);
  const [selectedClientId, setSelectedClientId] = useState(null);
  const [selectedTaskId, setSelectedTaskId] = useState(null);

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
    const workspaceChannel = supabase.channel('workspace-state').on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'workspace_states', filter: 'workspace_key=eq.grupo-poliplast' }, ({ new: row }) => {
      if (!row?.data || row.updated_by === session.user.id) return;
      setData((current) => {
        const merged = mergeWorkspaceState(current, row.data);
        return workspaceStatesEqual(current, merged) ? current : merged;
      });
      setSyncStatus(`Actualizado por ${row.updated_by_email || 'el equipo'}`);
    }).subscribe();
    return () => {
      active = false;
      supabase.removeChannel(channel);
      supabase.removeChannel(workspaceChannel);
    };
  }, [session?.user?.id]);

  useEffect(() => {
    if (!session?.access_token || syncStatus !== 'Sincronizado') return;
    fetch('/api/readiness', { headers: { Authorization: `Bearer ${session.access_token}` } })
      .then((response) => response.ok ? response.json() : null)
      .then((result) => result && setReadiness(result))
      .catch(() => setReadiness(null));
  }, [session?.access_token, syncStatus]);

  useEffect(() => {
    if (!onlineConfigured || !remoteReady || !session?.user?.id) return undefined;
    setSyncStatus('Guardando…');
    const timer = setTimeout(() => {
      saveOnlineState(session.user.id, session.user.email, data).then(() => setSyncStatus('Sincronizado')).catch(() => setSyncStatus('Error de sincronización'));
    }, 700);
    return () => clearTimeout(timer);
  }, [data, remoteReady, session?.user?.id]);

  useEffect(() => {
    if (!remoteReady) return;
    setData((current) => mergeCommercialCohort(current).state);
  }, [remoteReady]);

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
    const editingInteraction = editingInteractionId ? data.interactions.find((item) => item.id === editingInteractionId) : null;
    const existing = data.clients.find((client) => client.id === editingInteraction?.clientId)
      || data.clients.find((client) => client.company.toLowerCase() === form.company.trim().toLowerCase());
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
    const interaction = { ...editingInteraction, ...form, id: editingInteraction?.id || crypto.randomUUID(), clientId, createdAt: editingInteraction?.createdAt || stamp, updatedAt: stamp };
    const tasks = !editingInteraction && form.nextAction.trim()
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
            updatedAt: stamp,
          },
        ]
      : data.tasks;
    setData({
      ...data,
      clients: existing ? data.clients.map((item) => (item.id === clientId ? { ...item, ...client } : item)) : [...data.clients, client],
      interactions: editingInteraction ? data.interactions.map((item) => item.id === interaction.id ? interaction : item) : [interaction, ...data.interactions],
      tasks,
    });
    setForm(blankInteraction());
    setEditingInteractionId(null);
    setShowForm(false);
  }

  function editInteraction(interaction) {
    setForm({ ...blankInteraction(), ...interaction });
    setEditingInteractionId(interaction.id);
    setSelectedInteractionId(null);
    setShowForm(true);
  }

  function closeInteractionForm() {
    setForm(blankInteraction());
    setEditingInteractionId(null);
    setShowForm(false);
  }

  function startClientInteraction(client) {
    setForm({ ...blankInteraction(), company: client.company, contact: client.contact || '', family: client.family || 'Sin definir', temperature: client.temperature || 'Tibio', stage: client.stage || 'Conversación', clientType: client.clientType || 'Desconocido', industry: client.industry || 'Desconocida', fit: client.fit || 'A confirmar', urgency: client.urgency || 'A confirmar', potential: client.potential || 'Hipótesis media', currentSupplier: client.currentSupplier || '', decisionMaker: client.decisionMaker || '', repurchaseTrigger: client.repurchaseTrigger || '', repurchaseDate: client.repurchaseDate || '' });
    setSelectedClientId(null);
    setShowForm(true);
  }

  function startClientTask(client) {
    setTaskForm({ ...blankTask(), clientId: client.id, company: client.company });
    setSelectedClientId(null);
    setShowTaskForm(true);
  }

  function toggleTask(id) {
    const stamp = new Date().toISOString();
    setData({ ...data, tasks: data.tasks.map((task) => (task.id === id ? { ...task, done: !task.done, updatedAt: stamp } : task)) });
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
      createdAt: stamp, updatedAt: stamp, createdBy: session?.user?.email || '', trigger: 'Borrador confirmado desde WhatsApp',
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

  function updateClient(updatedClient) {
    const stamp = new Date().toISOString();
    setData((current) => ({
      ...current,
      clients: current.clients.map((client) => client.id === updatedClient.id ? { ...client, ...updatedClient, updatedAt: stamp } : client),
      tasks: current.tasks.map((task) => task.clientId === updatedClient.id ? { ...task, company: updatedClient.company || task.company, updatedAt: stamp } : task),
    }));
  }

  function updateTask(updatedTask) {
    const stamp = new Date().toISOString();
    setData((current) => ({ ...current, tasks: current.tasks.map((task) => task.id === updatedTask.id ? { ...task, ...updatedTask, updatedAt: stamp } : task) }));
  }

  function saveManualTask(event) {
    event.preventDefault();
    const stamp = new Date().toISOString();
    const client = data.clients.find((item) => item.id === taskForm.clientId);
    const task = { ...taskForm, id: crypto.randomUUID(), company: client?.company || taskForm.company.trim() || 'Sin empresa', done: false, createdAt: stamp, updatedAt: stamp };
    setData((current) => ({ ...current, tasks: [...current.tasks, task] }));
    setTaskForm(blankTask());
    setShowTaskForm(false);
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

  function displayedChannel(key) {
    const status = readiness?.channels?.[key];
    if (!status) return CHANNELS[key];
    if (status.inboundEvents > 0) return { ...CHANNELS[key], status: `Operativo · ${status.inboundEvents} mensajes recibidos`, statusTone: 'online' };
    if (status.configured) return { ...CHANNELS[key], status: 'Configurado · falta prueba entrante', statusTone: 'waiting' };
    return { ...CHANNELS[key], status: 'Conexión pendiente', statusTone: 'offline' };
  }

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
              <span className="channel-dot" style={{ background: displayedChannel(key).color }} />
              <div><strong>{displayedChannel(key).name}</strong><span>{displayedChannel(key).profile} · {displayedChannel(key).number}</span></div>
              <span className={`status ${displayedChannel(key).statusTone}`}>{displayedChannel(key).status}</span>
            </div>
          ))}
        </section>

        {view === 'dashboard' && <Dashboard metrics={metrics} tasks={data.tasks} interactions={data.interactions} onToggle={toggleTask} onOpenTask={setSelectedTaskId} onOpenInteraction={setSelectedInteractionId} />}
        {view === 'conversations' && <Conversations items={data.interactions} onOpen={setSelectedInteractionId} />}
        {view === 'inbox' && <WhatsAppInbox items={data.inbox} onClassify={classifyInbox} onDraft={openInboxDraft} />}
        {view === 'tasks' && <Tasks items={data.tasks} onToggle={toggleTask} onOpen={setSelectedTaskId} onNew={() => setShowTaskForm(true)} />}
        {view === 'pipeline' && <Pipeline clients={data.clients} onOpenClient={setSelectedClientId} />}
        {view === 'clients' && <Clients clients={filteredClients} query={query} setQuery={setQuery} onOpenClient={setSelectedClientId} />}
        {view === 'replies' && <QuickReplies />}
        {view === 'coach' && <Coach interactions={data.interactions} data={data} setData={setData} />}
        {view === 'settings' && <DataSettings data={data} setData={setData} session={session} syncStatus={syncStatus} />}
      </main>

      {showForm && <InteractionForm form={form} setForm={setForm} editing={Boolean(editingInteractionId)} onClose={closeInteractionForm} onSave={saveInteraction} />}
      {showTaskForm && <TaskForm form={taskForm} setForm={setTaskForm} clients={data.clients} onClose={() => { setTaskForm(blankTask()); setShowTaskForm(false); }} onSave={saveManualTask} />}
      {inboxDraft && <InboxDraftModal draft={inboxDraft} setDraft={setInboxDraft} onClose={() => setInboxDraft(null)} onConfirm={confirmInboxDraft} />}
      {selectedInteractionId && <InteractionDetail interaction={data.interactions.find((item) => item.id === selectedInteractionId)} client={data.clients.find((item) => item.id === data.interactions.find((entry) => entry.id === selectedInteractionId)?.clientId)} onClose={() => setSelectedInteractionId(null)} onEdit={editInteraction} onOpenClient={(clientId) => { setSelectedInteractionId(null); setSelectedClientId(clientId); }} />}
      {selectedClientId && <ClientDetail client={data.clients.find((item) => item.id === selectedClientId)} interactions={data.interactions.filter((item) => item.clientId === selectedClientId)} tasks={data.tasks.filter((item) => item.clientId === selectedClientId)} onClose={() => setSelectedClientId(null)} onOpenInteraction={setSelectedInteractionId} onNewInteraction={startClientInteraction} onNewTask={startClientTask} onSave={updateClient} />}
      {selectedTaskId && <TaskDetail task={data.tasks.find((item) => item.id === selectedTaskId)} client={data.clients.find((item) => item.id === data.tasks.find((task) => task.id === selectedTaskId)?.clientId)} onClose={() => setSelectedTaskId(null)} onToggle={(taskId) => { toggleTask(taskId); setSelectedTaskId(null); }} onSave={updateTask} onOpenClient={(clientId) => { setSelectedTaskId(null); setSelectedClientId(clientId); }} />}
    </div>
  );
}

function Dashboard({ metrics, tasks, interactions, onToggle, onOpenTask, onOpenInteraction }) {
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
          <TaskList items={tasks.filter((task) => !task.done).sort((a, b) => (a.dueDate || '').localeCompare(b.dueDate || '')).slice(0, 6)} onToggle={onToggle} onOpen={onOpenTask} emptyText="Sin tareas por ahora. Registrá una conversación para que el copiloto te ayude a definir el próximo paso."/>
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
  const [query, setQuery] = useState('');
  const filtered = items.filter((item) => `${item.company || ''} ${item.contact || ''} ${item.summary || ''} ${item.need || ''} ${item.family || ''}`.toLowerCase().includes(query.toLowerCase()));
  return <section className="panel"><div className="panel-head"><div><span className="eyebrow">Memoria comercial</span><h2>Historial de conversaciones</h2></div><label className="search"><Search size={17}/><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar conversación…"/></label></div>{filtered.length ? filtered.map((item) => <InteractionRow item={item} key={item.id} expanded onOpen={onOpen} />) : <Empty text={items.length ? 'No hay conversaciones que coincidan con la búsqueda.' : 'Registrá la primera conversación para comenzar la memoria comercial.'} />}</section>;
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
  useModalEscape(onClose);
  const update = (name, value) => setDraft({ ...draft, form: { ...draft.form, [name]: value } });
  const form = draft.form;
  return <div className="modal-backdrop"><form className="modal" onSubmit={onConfirm}><div className="modal-head"><div><span className="eyebrow">Borrador automático · confirmar antes de guardar</span><h2>Convertir mensaje en oportunidad</h2><p>Revisá y corregí. El CRM no responde al cliente.</p></div><button type="button" className="icon-button" aria-label="Cerrar borrador" onClick={onClose}><X/></button></div><div className="source-message"><strong>Mensaje original</strong><p>{draft.event.text_body || `[${draft.event.message_type || 'mensaje sin texto'}]`}</p></div><div className="form-grid"><label>Empresa / cliente<input required value={form.company} onChange={(event) => update('company', event.target.value)} placeholder="Confirmar empresa" /></label><label>Persona / contacto<input value={form.contact} onChange={(event) => update('contact', event.target.value)} /></label><label>Familia<select value={form.family} onChange={(event) => update('family', event.target.value)}>{FAMILIES.map((item) => <option key={item}>{item}</option>)}</select></label><label>Temperatura<select value={form.temperature} onChange={(event) => update('temperature', event.target.value)}><option>Frío</option><option>Tibio</option><option>Caliente</option></select></label><label>Etapa<select value={form.stage} onChange={(event) => update('stage', event.target.value)}>{PIPELINE.map((item) => <option key={item}>{item}</option>)}</select></label><label>Fecha próxima<input type="date" value={form.nextDate} onChange={(event) => update('nextDate', event.target.value)} /></label><label className="span-2">Resumen<textarea value={form.summary} onChange={(event) => update('summary', event.target.value)} /></label><label className="span-2">Necesidad detectada<textarea value={form.need} onChange={(event) => update('need', event.target.value)} /></label><label className="span-2">Próxima acción<input value={form.nextAction} onChange={(event) => update('nextAction', event.target.value)} /></label></div><div className="modal-actions"><button type="button" className="secondary" onClick={onClose}>Cancelar</button><button className="primary" type="submit">Confirmar y crear seguimiento</button></div></form></div>;
}

function InteractionRow({ item, expanded = false, onOpen }) {
  const content = <><span className="channel-dot" style={{ background: CHANNELS[item.channel]?.color || '#7d8790' }} /><div><strong>{item.company}</strong><span>{item.contact || CHANNELS[item.channel]?.name || 'Contacto sin identificar'} · {new Date(item.createdAt).toLocaleString('es-AR')}</span>{expanded && <p>{item.summary || item.need || 'Sin resumen'}</p>}</div><div className="row-tail"><span className={`temp ${(item.temperature || 'Tibio').toLowerCase()}`}>{item.temperature || 'Tibio'}</span><ChevronRight size={17}/></div></>;
  return onOpen ? <button className={`interaction-row ${expanded ? 'expanded' : ''}`} onClick={() => onOpen(item.id)}>{content}</button> : <div className={`interaction-row ${expanded ? 'expanded' : ''}`}>{content}</div>;
}

function InteractionDetail({ interaction, client, onClose, onEdit, onOpenClient }) {
  useModalEscape(onClose);
  if (!interaction) return null;
  return <div className="modal-backdrop"><section className="modal interaction-detail"><div className="modal-head"><div><span className="eyebrow">Conversación registrada</span><h2>{interaction.company}</h2><p>{interaction.contact || 'Contacto sin identificar'} · {formatDate(interaction.createdAt)}</p></div><button type="button" className="icon-button" aria-label="Cerrar conversación" onClick={onClose}><X/></button></div><div className="conversation-detail-grid"><Fact label="Canal" value={CHANNELS[interaction.channel]?.name}/><Fact label="Familia" value={interaction.family}/><Fact label="Temperatura" value={interaction.temperature}/><Fact label="Etapa" value={interaction.stage}/></div><div className="detail-block"><span>Qué hablaron</span><p>{interaction.summary || 'Sin resumen registrado.'}</p></div><div className="detail-block"><span>Necesidad detectada</span><p>{interaction.need || 'Necesidad pendiente de confirmar.'}</p></div><div className="detail-block"><span>Próxima acción</span><p>{interaction.nextAction || 'Sin próxima acción definida.'}{interaction.nextDate ? ` · ${formatDate(interaction.nextDate)}` : ''}</p></div><div className="modal-actions"><button className="secondary" type="button" onClick={onClose}>Cerrar</button><button className="secondary" type="button" onClick={() => onEdit(interaction)}>Editar</button>{client && <button className="primary" type="button" onClick={() => onOpenClient(client.id)}>Ver ficha del cliente</button>}</div></section></div>;
}

function Tasks({ items, onToggle, onOpen, onNew }) {
  const [filter, setFilter] = useState('pending');
  const [query, setQuery] = useState('');
  const ordered = [...items].sort((a, b) => Number(a.done) - Number(b.done) || (a.dueDate || '').localeCompare(b.dueDate || ''));
  const filtered = ordered.filter((task) => (filter === 'all' || (filter === 'pending' ? !task.done : task.done)) && `${task.title || ''} ${task.company || ''} ${task.trigger || ''}`.toLowerCase().includes(query.toLowerCase()));
  return <section className="panel"><div className="panel-head"><div><span className="eyebrow">Agenda única</span><h2>Tareas comerciales</h2></div><button className="primary" type="button" onClick={onNew}><Plus size={17}/> Nueva tarea</button></div><div className="list-toolbar"><label className="search"><Search size={17}/><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar tarea…"/></label><div className="segmented"><button className={filter === 'pending' ? 'selected' : ''} onClick={() => setFilter('pending')}>Pendientes</button><button className={filter === 'done' ? 'selected' : ''} onClick={() => setFilter('done')}>Completadas</button><button className={filter === 'all' ? 'selected' : ''} onClick={() => setFilter('all')}>Todas</button></div></div><TaskList items={filtered} onToggle={onToggle} onOpen={onOpen} emptyText={items.length ? 'No hay tareas que coincidan con este filtro.' : 'Todavía no hay tareas. Creá la primera acción comercial.'}/></section>;
}

function TaskList({ items, onToggle, onOpen, emptyText = 'No hay tareas pendientes.' }) {
  if (!items.length) return <Empty text={emptyText} />;
  return items.map((task) => <article className={`task-row ${task.done ? 'done' : ''}`} key={task.id}>
    <button className="task-check" type="button" aria-label={task.done ? `Marcar ${task.title} como pendiente` : `Completar ${task.title}`} onClick={() => onToggle(task.id)}>{task.done && <CheckCircle2 size={18}/>}</button>
    <button className="task-main" type="button" onClick={() => onOpen?.(task.id)}><strong>{task.title}</strong><span>{task.company} · {formatDate(task.dueDate)}{task.trigger ? ` · ${task.trigger}` : ''}</span></button>
    <span className={`priority ${(task.priority || 'Media').toLowerCase()}`}>{task.priority || 'Media'}</span>
  </article>);
}

function TaskDetail({ task, client, onClose, onToggle, onSave, onOpenClient }) {
  useModalEscape(onClose);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(task || {});
  useEffect(() => setDraft(task || {}), [task?.id]);
  if (!task) return null;
  function submit(event) {
    event.preventDefault();
    onSave({ ...draft, title: draft.title.trim() });
    setEditing(false);
  }
  return <div className="modal-backdrop"><section className="modal interaction-detail"><div className="modal-head"><div><span className="eyebrow">Tarea comercial</span><h2>{task.title}</h2><p>{task.company || 'Sin empresa vinculada'}</p></div><button type="button" className="icon-button" aria-label="Cerrar tarea" onClick={onClose}><X/></button></div>{editing ? <form onSubmit={submit}><div className="form-grid"><label className="span-2">Acción<input required value={draft.title || ''} onChange={(event) => setDraft({ ...draft, title: event.target.value })}/></label><label>Vencimiento<input required type="date" value={draft.dueDate || ''} onChange={(event) => setDraft({ ...draft, dueDate: event.target.value })}/></label><label>Prioridad<select value={draft.priority || 'Media'} onChange={(event) => setDraft({ ...draft, priority: event.target.value })}><option>Alta</option><option>Media</option><option>Baja</option></select></label><label className="span-2">Disparador / contexto<input value={draft.trigger || ''} onChange={(event) => setDraft({ ...draft, trigger: event.target.value })}/></label></div><div className="modal-actions"><button className="secondary" type="button" onClick={() => { setDraft(task); setEditing(false); }}>Cancelar</button><button className="primary" type="submit">Guardar cambios</button></div></form> : <><div className="conversation-detail-grid"><Fact label="Vencimiento" value={formatDate(task.dueDate)}/><Fact label="Prioridad" value={task.priority || 'Media'}/><Fact label="Cadencia" value={task.cadence || 'Seguimiento'}/><Fact label="Estado" value={task.done ? 'Completada' : 'Pendiente'}/></div>{task.trigger && <div className="detail-block"><span>Por qué aparece hoy</span><p>{task.trigger}</p></div>}<div className="modal-actions"><button className="secondary" type="button" onClick={onClose}>Cerrar</button>{client && <button className="secondary" type="button" onClick={() => onOpenClient(client.id)}>Ver cliente</button>}<button className="secondary" type="button" onClick={() => setEditing(true)}>Editar</button><button className="primary" type="button" onClick={() => onToggle(task.id)}>{task.done ? 'Marcar pendiente' : 'Completar tarea'}</button></div></>}</section></div>;
}

function TaskForm({ form, setForm, clients, onClose, onSave }) {
  useModalEscape(onClose);
  const field = (name) => ({ value: form[name] || '', onChange: (event) => setForm({ ...form, [name]: event.target.value }) });
  return <div className="modal-backdrop"><form className="modal interaction-detail" onSubmit={onSave}><div className="modal-head"><div><span className="eyebrow">Agenda comercial</span><h2>Nueva tarea</h2><p>Definí una acción concreta, una fecha y por qué debe hacerse.</p></div><button type="button" className="icon-button" aria-label="Cerrar tarea" onClick={onClose}><X/></button></div><div className="form-grid"><label>Cliente<select {...field('clientId')}><option value="">Sin cliente vinculado</option>{clients.map((client) => <option key={client.id} value={client.id}>{client.company}</option>)}</select></label>{!form.clientId && <label>Empresa / referencia<input {...field('company')} placeholder="Opcional"/></label>}<label className="span-2">Acción<input required {...field('title')} placeholder="Ej. llamar para confirmar consumo mensual"/></label><label>Vencimiento<input required type="date" {...field('dueDate')}/></label><label>Prioridad<select {...field('priority')}><option>Alta</option><option>Media</option><option>Baja</option></select></label><label className="span-2">Disparador / contexto<input {...field('trigger')} placeholder="Ej. pasaron 7 días desde la propuesta"/></label></div><div className="modal-actions"><button className="secondary" type="button" onClick={onClose}>Cancelar</button><button className="primary" type="submit">Crear tarea</button></div></form></div>;
}

function Pipeline({ clients, onOpenClient }) {
  return <div className="kanban">{PIPELINE.map((stage) => { const list = clients.filter((client) => client.stage === stage); return <section className={`kanban-column ${['Pausado','Perdido'].includes(stage) ? 'inactive' : ''}`} key={stage}><header><strong>{stage}</strong><span>{list.length}</span></header>{list.map((client) => <button className="deal-card" key={client.id} onClick={() => onOpenClient(client.id)}><strong>{client.company}</strong><span>{client.family}</span><small>{client.contact || 'Contacto pendiente'}</small>{client.lossReason && <small className="loss-reason">{client.lossReason}</small>}</button>)}{!list.length && <div className="empty-slot">Sin cuentas</div>}</section>; })}</div>;
}

function Clients({ clients, query, setQuery, onOpenClient }) {
  return <section className="panel"><div className="panel-head"><div><span className="eyebrow">Cartera</span><h2>Clientes y prospectos</h2></div><label className="search"><Search size={17}/><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar…" /></label></div>{clients.length ? <div className="client-table">{clients.map((client) => <button className="client-row" onClick={() => onOpenClient(client.id)} key={client.id}><div className="avatar">{client.company.slice(0, 2).toUpperCase()}</div><div><strong>{client.company}</strong><span>{client.contact || 'Sin contacto identificado'}</span></div><span>{client.family}</span><span className={`temp ${(client.temperature || 'Tibio').toLowerCase()}`}>{client.temperature || 'Tibio'}</span><strong>{client.stage}</strong></button>)}</div> : <Empty text="Todavía no hay clientes en la cartera. Se sumarán automáticamente al registrar conversaciones." />}</section>;
}

function ClientDetail({ client, interactions, tasks, onClose, onOpenInteraction, onNewInteraction, onNewTask, onSave }) {
  useModalEscape(onClose);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(client || {});
  useEffect(() => setDraft(client || {}), [client?.id]);
  if (!client) return null;
  const latest = interactions[0];
  const nextTask = tasks.filter((item) => !item.done).sort((a, b) => (a.dueDate || '').localeCompare(b.dueDate || ''))[0];
  const field = (name) => ({ value: draft[name] || '', onChange: (event) => setDraft({ ...draft, [name]: event.target.value }) });
  function submit(event) {
    event.preventDefault();
    onSave({ ...draft, company: draft.company.trim(), contact: draft.contact?.trim() || '' });
    setEditing(false);
  }
  return <div className="modal-backdrop"><section className="modal client-detail"><div className="modal-head"><div><span className="eyebrow">Antes de llamar</span><h2>{client.company}</h2><p>{client.contact || 'Contacto pendiente'} · {client.temperature || 'Tibio'} · {client.stage}</p></div><button type="button" className="icon-button" aria-label="Cerrar ficha" onClick={onClose}><X/></button></div>{editing ? <form onSubmit={submit}><div className="form-grid"><label>Empresa<input required {...field('company')}/></label><label>Persona / cargo<input {...field('contact')}/></label><label>Familia<select {...field('family')}>{FAMILIES.map((item) => <option key={item}>{item}</option>)}</select></label><label>Temperatura<select {...field('temperature')}><option>Frío</option><option>Tibio</option><option>Caliente</option></select></label><label>Etapa<select {...field('stage')}>{PIPELINE.map((item) => <option key={item}>{item}</option>)}</select></label><label>Proveedor actual<input {...field('currentSupplier')}/></label><label>Decisor / quién aprueba<input {...field('decisionMaker')}/></label><label>Fecha estimada de recompra<input type="date" {...field('repurchaseDate')}/></label><label className="span-2">Disparador de recompra<input {...field('repurchaseTrigger')}/></label>{['Pausado','Perdido'].includes(draft.stage) && <label className="span-2">Motivo de {draft.stage.toLowerCase()}<input required {...field('lossReason')}/></label>}</div><div className="modal-actions"><button className="secondary" type="button" onClick={() => { setDraft(client); setEditing(false); }}>Cancelar</button><button className="primary" type="submit">Guardar cambios</button></div></form> : <><div className="call-brief"><article><span>Última conversación</span><strong>{latest?.summary || 'Sin resumen registrado'}</strong><p>{latest?.need || 'Necesidad a confirmar'}</p></article><article><span>Próximo paso</span><strong>{nextTask?.title || 'Sin seguimiento pendiente'}</strong><p>{nextTask ? formatDate(nextTask.dueDate) : 'Definir en el próximo contacto'}</p></article></div><div className="client-facts"><Fact label="Familia" value={client.family}/><Fact label="Proveedor actual" value={client.currentSupplier}/><Fact label="Decisor" value={client.decisionMaker}/><Fact label="Urgencia" value={client.urgency}/><Fact label="Potencial" value={client.potential}/><Fact label="Recompra" value={client.repurchaseDate ? `${formatDate(client.repurchaseDate)} · ${client.repurchaseTrigger || 'sin disparador'}` : client.repurchaseTrigger}/>{client.lossReason && <Fact label="Motivo de pausa/pérdida" value={client.lossReason}/>}</div><div className="modal-actions client-actions"><button className="secondary" type="button" onClick={onClose}>Cerrar</button><button className="secondary" type="button" onClick={() => setEditing(true)}>Editar ficha</button><button className="secondary" type="button" onClick={() => onNewTask(client)}>Nueva tarea</button><button className="primary" type="button" onClick={() => onNewInteraction(client)}>Registrar conversación</button></div><div className="history"><h3>Historial</h3>{interactions.length ? interactions.map((item) => <InteractionRow item={item} expanded key={item.id} onOpen={(id) => { onClose(); onOpenInteraction(id); }} />) : <Empty text="Sin conversaciones registradas."/>}</div></>}</section></div>;
}

function Fact({ label, value }) { return <div><span>{label}</span><strong>{value || 'A confirmar'}</strong></div>; }

function QuickReplies() {
  const [channel, setChannel] = useState('general');
  const [copied, setCopied] = useState('');
  async function copyReply(title, guidance) {
    try {
      await navigator.clipboard.writeText(guidance);
      setCopied(title);
      setTimeout(() => setCopied(''), 1800);
    } catch {
      setCopied('error');
    }
  }
  return <div className="content-stack"><section className="panel"><div className="panel-head"><div><span className="eyebrow">Sugerencias editables</span><h2>Biblioteca de respuestas rápidas</h2></div><div className="segmented"><button className={channel === 'general' ? 'selected' : ''} onClick={() => setChannel('general')}>General</button><button className={channel === 'penosil' ? 'selected' : ''} onClick={() => setChannel('penosil')}>Penosil</button></div></div><div className="reply-grid">{QUICK_REPLIES[channel].map(([title, guidance], index) => <article className="reply-card" key={title}><span>{String(index + 1).padStart(2, '0')}</span><h3>{title}</h3><p>{guidance}</p><button onClick={() => copyReply(title, guidance)}>{copied === title ? 'Copiado ✓' : 'Copiar criterio'}</button></article>)}</div>{copied === 'error' && <div className="system-message">No se pudo copiar automáticamente. Seleccioná el texto manualmente.</div>}<div className="quality-note"><CircleAlert size={19}/><p>Estas entradas orientan la conversación. Nunca envían mensajes automáticamente. Todo dato técnico, precio, stock, descuento o plazo debe validarse.</p></div></section><Training /></div>;
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

  function importCommercialCohort() {
    const cohort = buildCommercialCohort();
    const result = mergeCommercialCohort(data);
    setData(result.state);
    setMessage(`Cohorte comercial verificada: ${result.addedClients} clientes y ${result.addedTasks} tareas nuevas. ${cohort.clients.length - result.addedClients} cuentas existentes fueron preservadas sin cambios.`);
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

  return <div className="content-stack"><section className="panel"><div className="panel-head"><div><span className="eyebrow">Canales oficiales</span><h2>Conectar WhatsApp Business</h2></div><Link2 size={22}/></div><p>Autoriza un número existente mediante el registro oficial de Meta. El teléfono conserva WhatsApp Business y el CRM recibe los mensajes para clasificarlos; nunca responde automáticamente.</p><button className="primary" disabled={connecting} onClick={startWhatsAppConnection}>{connecting ? 'Conectando…' : 'Conectar número con Meta'}</button>{message && <div className="system-message">{message}</div>}</section><section className="panel"><div className="panel-head"><div><span className="eyebrow">Inicio de Ventas</span><h2>Cohorte comercial vigente</h2></div><Target size={22}/></div><p>Las 34 cuentas operativas de Seguimiento se incorporan automáticamente. La base de inteligencia completa de 195 empresas continúa en Google Sheets y no se mezcla con la cartera activa.</p><button className="secondary" type="button" onClick={importCommercialCohort}>Verificar cohorte de Seguimiento</button></section><section className="panel"><div className="panel-head"><div><span className="eyebrow">Portabilidad</span><h2>Datos y respaldos</h2></div><Database size={22}/></div><div className="data-cards"><article><Download size={24}/><h3>Exportar respaldo</h3><p>Descarga clientes, conversaciones, tareas, evaluaciones y bandeja en un archivo JSON versionado.</p><button className="primary" onClick={exportBackup}>Descargar respaldo</button></article><article><Upload size={24}/><h3>Importar respaldo</h3><p>Restaura un respaldo del copiloto en este navegador. Reemplaza el estado actual.</p><label className="secondary upload-button">Elegir archivo<input type="file" accept="application/json,.json" onChange={importBackup}/></label></article><article><Inbox size={24}/><h3>Importar eventos WhatsApp</h3><p>Prueba la bandeja con eventos normalizados. Deduplica por ID y omite estados técnicos.</p><label className="secondary upload-button">Elegir eventos<input type="file" accept="application/json,.json" onChange={importWebhookEvents}/></label></article></div></section><section className="panel"><div className="panel-head"><div><span className="eyebrow">{onlineConfigured ? 'Estado online' : 'Estado local'}</span><h2>Contenido guardado</h2></div></div><div className="storage-summary"><div><strong>{data.clients.length}</strong><span>Clientes</span></div><div><strong>{data.interactions.length}</strong><span>Conversaciones</span></div><div><strong>{data.tasks.length}</strong><span>Tareas</span></div><div><strong>{data.inbox.filter((item) => item.classification_status === 'pending').length}</strong><span>WhatsApp pendientes</span></div></div><div className="quality-note"><CircleAlert size={19}/><p>{onlineConfigured ? `${syncStatus}. Usuario: ${session?.user?.email || 'sin identificar'}. Los cambios se guardan online y siguen teniendo respaldo local.` : 'Modo local de prueba. Exportá un respaldo al terminar cada jornada; al configurar la base, el mismo CRM activará acceso y sincronización online.'}</p></div>{onlineConfigured && <button className="secondary signout" onClick={() => supabase.auth.signOut()}>Cerrar sesión</button>}</section></div>;
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

function InteractionForm({ form, setForm, editing = false, onClose, onSave }) {
  useModalEscape(onClose);
  const field = (name) => ({ value: form[name], onChange: (event) => setForm({ ...form, [name]: event.target.value }) });
  return <div className="modal-backdrop"><form className="modal" onSubmit={onSave}><div className="modal-head"><div><span className="eyebrow">{editing ? 'Corrección de registro' : 'Registro posterior'}</span><h2>{editing ? 'Editar conversación' : 'Nueva conversación'}</h2><p>{editing ? 'Corregí el registro sin crear una conversación duplicada.' : 'Guardá lo esencial. La clasificación avanzada es opcional.'}</p></div><button type="button" className="icon-button" aria-label="Cerrar" onClick={onClose}><X/></button></div><div className="form-grid"><label>Empresa<input required {...field('company')} placeholder="Nombre del cliente" /></label><label>Persona / cargo<input {...field('contact')} placeholder="Ej. María · Compras" /></label><label>Canal<select {...field('channel')}>{Object.entries(CHANNELS).map(([key, item]) => <option value={key} key={key}>{item.name}</option>)}</select></label><label>Familia<select {...field('family')}>{FAMILIES.map((item) => <option key={item}>{item}</option>)}</select></label><label className="span-2">¿Qué hablaron?<textarea {...field('summary')} placeholder="Resumen breve y factual" /></label><label className="span-2">Necesidad detectada<textarea {...field('need')} placeholder="Problema, aplicación, volumen o urgencia" /></label><label>Temperatura comercial<select {...field('temperature')}><option>Frío</option><option>Tibio</option><option>Caliente</option></select></label><label>Etapa<select {...field('stage')}>{PIPELINE.map((item) => <option key={item}>{item}</option>)}</select></label><label>Fecha próxima<input type="date" {...field('nextDate')} /></label><label className="span-2">Próxima acción<input {...field('nextAction')} placeholder="Ej. llamar para confirmar consumo" /></label>{['Pausado','Perdido'].includes(form.stage) && <label className="span-2">Motivo de {form.stage.toLowerCase()}<input required {...field('lossReason')} placeholder="Motivo concreto para aprender o retomar" /></label>}</div><details className="advanced-fields"><summary>Agregar clasificación comercial, proveedor y recompra</summary><div className="form-grid"><label>Tipo de cliente<select {...field('clientType')}>{CLASSIFICATIONS.clientTypes.map((item) => <option key={item}>{item}</option>)}</select></label><label>Industria<select {...field('industry')}>{CLASSIFICATIONS.industries.map((item) => <option key={item}>{item}</option>)}</select></label><label>Encaje<select {...field('fit')}>{CLASSIFICATIONS.fit.map((item) => <option key={item}>{item}</option>)}</select></label><label>Urgencia<select {...field('urgency')}>{CLASSIFICATIONS.urgency.map((item) => <option key={item}>{item}</option>)}</select></label><label>Potencial<select {...field('potential')}>{CLASSIFICATIONS.potential.map((item) => <option key={item}>{item}</option>)}</select></label><label>Objeción<input {...field('objection')} placeholder="Ej. ya tiene proveedor" /></label><label>Proveedor actual<input {...field('currentSupplier')} placeholder="Nombre o sin proveedor" /></label><label>Decisor / quién aprueba<input {...field('decisionMaker')} placeholder="Persona, cargo o a confirmar" /></label><label>Fecha estimada de recompra<input type="date" {...field('repurchaseDate')} /></label><label>Disparador de recompra<input {...field('repurchaseTrigger')} placeholder="Ej. consumo mensual, fin de obra" /></label></div></details><div className="modal-actions"><button type="button" className="secondary" onClick={onClose}>Cancelar</button><button className="primary" type="submit">{editing ? 'Guardar cambios' : 'Guardar conversación'}</button></div></form></div>;
}

function Goal({ title, text }) { return <div><strong>{title}</strong><p>{text}</p></div>; }
function Empty({ text }) { return <div className="empty"><MessageCircle size={24}/><p>{text}</p></div>; }
