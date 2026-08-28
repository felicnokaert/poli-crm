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
  Plus,
  Search,
  Target,
  GraduationCap,
  Sparkles,
  X,
} from 'lucide-react';
import { CLASSIFICATIONS, QUICK_REPLIES, ROLE_PLAYS, RUBRIC, scoreBand } from './knowledge';

const CHANNELS = {
  general: {
    name: 'WhatsApp General',
    number: '+54 9 11 5262-7555',
    profile: 'POLIPLAST',
    color: '#0d7764',
  },
  penosil: {
    name: 'WhatsApp Penosil',
    number: '+54 9 11 7155-8957',
    profile: 'FOAM',
    color: '#d9792b',
  },
  call: { name: 'Llamada', number: '', profile: '', color: '#3b6d9b' },
  email: { name: 'Email', number: '', profile: '', color: '#6b5aa6' },
};

const PIPELINE = ['Nuevo', 'Contactado', 'Conversación', 'Calificado', 'Propuesta', 'Negociación', 'Ganado'];
const FAMILIES = ['Sin definir', 'Poliuretano', 'Poliurea', 'PURMAC', 'Penosil', 'PRFV', 'Carrozados', 'Resinplast', 'Imperpur', 'Foam Factory', 'Otra'];
const STORAGE_KEY = 'poliplast-sales-copilot-v1';

const initialState = { clients: [], interactions: [], tasks: [] };

function loadState() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || initialState;
  } catch {
    return initialState;
  }
}

function formatDate(value) {
  if (!value) return 'Sin fecha';
  return new Intl.DateTimeFormat('es-AR', { day: '2-digit', month: 'short' }).format(new Date(`${value}T12:00:00`));
}

function today() {
  return new Date().toISOString().slice(0, 10);
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
  };
}

export default function App() {
  const [data, setData] = useState(loadState);
  const [view, setView] = useState('dashboard');
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(blankInteraction);
  const [query, setQuery] = useState('');

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  }, [data]);

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

  const nav = [
    ['dashboard', 'Inicio', LayoutDashboard],
    ['conversations', 'Conversaciones', MessageCircle],
    ['tasks', 'Tareas', ClipboardList],
    ['pipeline', 'Pipeline', Target],
    ['clients', 'Clientes', Building2],
    ['replies', 'Respuestas', BookOpen],
    ['coach', 'Entrenador', GraduationCap],
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
          <span className="eyebrow">MVP local</span>
          <p>La información permanece en este navegador durante el piloto.</p>
        </div>
      </aside>

      <main>
        <header className="topbar">
          <div>
            <span className="eyebrow">Viernes 28 de agosto</span>
            <h1>{nav.find(([id]) => id === view)?.[1]}</h1>
          </div>
          <div className="top-actions">
            <div className="profile-pill">FC</div>
            <button className="primary" onClick={() => setShowForm(true)}><Plus size={18} /> Registrar conversación</button>
          </div>
        </header>

        <section className="channel-strip">
          {['general', 'penosil'].map((key) => (
            <div className="channel-card" key={key}>
              <span className="channel-dot" style={{ background: CHANNELS[key].color }} />
              <div><strong>{CHANNELS[key].name}</strong><span>{CHANNELS[key].profile} · {CHANNELS[key].number}</span></div>
              <span className="status">Disponible</span>
            </div>
          ))}
        </section>

        {view === 'dashboard' && <Dashboard metrics={metrics} tasks={data.tasks} interactions={data.interactions} onToggle={toggleTask} />}
        {view === 'conversations' && <Conversations items={data.interactions} />}
        {view === 'tasks' && <Tasks items={data.tasks} onToggle={toggleTask} />}
        {view === 'pipeline' && <Pipeline clients={data.clients} />}
        {view === 'clients' && <Clients clients={filteredClients} query={query} setQuery={setQuery} />}
        {view === 'replies' && <QuickReplies />}
        {view === 'coach' && <Coach interactions={data.interactions} data={data} setData={setData} />}
      </main>

      {showForm && <InteractionForm form={form} setForm={setForm} onClose={() => setShowForm(false)} onSave={saveInteraction} />}
    </div>
  );
}

function Dashboard({ metrics, tasks, interactions, onToggle }) {
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
          <TaskList items={tasks.filter((task) => !task.done).sort((a, b) => a.dueDate.localeCompare(b.dueDate)).slice(0, 6)} onToggle={onToggle}/>
        </article>
        <article className="panel">
          <div className="panel-head"><div><span className="eyebrow">Actividad</span><h2>Últimas conversaciones</h2></div><MessageCircle size={22}/></div>
          {interactions.length ? interactions.slice(0, 5).map((item) => <InteractionRow item={item} key={item.id}/>) : <Empty text="Todavía no registramos conversaciones." />}
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

function Conversations({ items }) {
  return <section className="panel"><div className="panel-head"><div><span className="eyebrow">Memoria comercial</span><h2>Historial de conversaciones</h2></div></div>{items.length ? items.map((item) => <InteractionRow item={item} key={item.id} expanded />) : <Empty text="Registrá la primera conversación para comenzar la memoria comercial." />}</section>;
}

function InteractionRow({ item, expanded = false }) {
  return <div className={`interaction-row ${expanded ? 'expanded' : ''}`}><span className="channel-dot" style={{ background: CHANNELS[item.channel]?.color }} /><div><strong>{item.company}</strong><span>{item.contact || CHANNELS[item.channel]?.name} · {new Date(item.createdAt).toLocaleString('es-AR')}</span>{expanded && <p>{item.summary || item.need || 'Sin resumen'}</p>}</div><div className="row-tail"><span className={`temp ${item.temperature.toLowerCase()}`}>{item.temperature}</span><ChevronRight size={17}/></div></div>;
}

function Tasks({ items, onToggle }) {
  return <section className="panel"><div className="panel-head"><div><span className="eyebrow">Agenda única</span><h2>Tareas comerciales</h2></div></div><TaskList items={items.sort((a, b) => Number(a.done) - Number(b.done) || a.dueDate.localeCompare(b.dueDate))} onToggle={onToggle}/></section>;
}

function TaskList({ items, onToggle }) {
  if (!items.length) return <Empty text="No hay tareas pendientes." />;
  return items.map((task) => <button className={`task-row ${task.done ? 'done' : ''}`} key={task.id} onClick={() => onToggle(task.id)}><span className="task-check">{task.done && <CheckCircle2 size={18}/>}</span><div><strong>{task.title}</strong><span>{task.company} · {formatDate(task.dueDate)}</span></div><span className={`priority ${task.priority.toLowerCase()}`}>{task.priority}</span></button>);
}

function Pipeline({ clients }) {
  return <div className="kanban">{PIPELINE.map((stage) => { const list = clients.filter((client) => client.stage === stage); return <section className="kanban-column" key={stage}><header><strong>{stage}</strong><span>{list.length}</span></header>{list.map((client) => <article className="deal-card" key={client.id}><strong>{client.company}</strong><span>{client.family}</span><small>{client.contact || 'Contacto pendiente'}</small></article>)}{!list.length && <div className="empty-slot">Sin cuentas</div>}</section>; })}</div>;
}

function Clients({ clients, query, setQuery }) {
  return <section className="panel"><div className="panel-head"><div><span className="eyebrow">Cartera</span><h2>Clientes y prospectos</h2></div><label className="search"><Search size={17}/><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar…" /></label></div>{clients.length ? <div className="client-table">{clients.map((client) => <div className="client-row" key={client.id}><div className="avatar">{client.company.slice(0, 2).toUpperCase()}</div><div><strong>{client.company}</strong><span>{client.contact || 'Sin contacto identificado'}</span></div><span>{client.family}</span><span className={`temp ${client.temperature.toLowerCase()}`}>{client.temperature}</span><strong>{client.stage}</strong></div>)}</div> : <Empty text="No hay clientes registrados con ese criterio." />}</section>;
}

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
    if (!interaction?.evaluation) return;
    setScores(interaction.evaluation.scores);
    setFeedback(interaction.evaluation.feedback);
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

function InteractionForm({ form, setForm, onClose, onSave }) {
  const field = (name) => ({ value: form[name], onChange: (event) => setForm({ ...form, [name]: event.target.value }) });
  return <div className="modal-backdrop"><form className="modal" onSubmit={onSave}><div className="modal-head"><div><span className="eyebrow">Registro posterior</span><h2>Nueva conversación</h2></div><button type="button" className="icon-button" onClick={onClose}><X/></button></div><div className="form-grid"><label>Empresa<input required {...field('company')} placeholder="Nombre del cliente" /></label><label>Persona / cargo<input {...field('contact')} placeholder="Ej. María · Compras" /></label><label>Canal<select {...field('channel')}>{Object.entries(CHANNELS).map(([key, item]) => <option value={key} key={key}>{item.name}</option>)}</select></label><label>Familia<select {...field('family')}>{FAMILIES.map((item) => <option key={item}>{item}</option>)}</select></label><label>Tipo de cliente<select {...field('clientType')}>{CLASSIFICATIONS.clientTypes.map((item) => <option key={item}>{item}</option>)}</select></label><label>Industria<select {...field('industry')}>{CLASSIFICATIONS.industries.map((item) => <option key={item}>{item}</option>)}</select></label><label>Encaje<select {...field('fit')}>{CLASSIFICATIONS.fit.map((item) => <option key={item}>{item}</option>)}</select></label><label>Urgencia<select {...field('urgency')}>{CLASSIFICATIONS.urgency.map((item) => <option key={item}>{item}</option>)}</select></label><label>Potencial<select {...field('potential')}>{CLASSIFICATIONS.potential.map((item) => <option key={item}>{item}</option>)}</select></label><label>Temperatura<select {...field('temperature')}><option>Frío</option><option>Tibio</option><option>Caliente</option></select></label><label className="span-2">¿Qué hablaron?<textarea {...field('summary')} placeholder="Resumen breve y factual" /></label><label className="span-2">Necesidad detectada<textarea {...field('need')} placeholder="Problema, aplicación, volumen o urgencia" /></label><label>Objeción<input {...field('objection')} placeholder="Ej. ya tiene proveedor" /></label><label>Etapa<select {...field('stage')}>{PIPELINE.map((item) => <option key={item}>{item}</option>)}</select></label><label>Fecha próxima<input type="date" {...field('nextDate')} /></label><label className="span-2">Próxima acción<input {...field('nextAction')} placeholder="Ej. llamar para confirmar consumo" /></label></div><div className="modal-actions"><button type="button" className="secondary" onClick={onClose}>Cancelar</button><button className="primary" type="submit">Guardar y crear seguimiento</button></div></form></div>;
}

function Goal({ title, text }) { return <div><strong>{title}</strong><p>{text}</p></div>; }
function Empty({ text }) { return <div className="empty"><MessageCircle size={24}/><p>{text}</p></div>; }
