// Solo administradores: expresos (link de seguimiento y plazos), quién es de expedición y umbrales de alerta.
import { Plus, Save, Trash2, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { mensajeError } from '../lib/api'
import { api } from '../lib/cliente'
import { useDatos } from '../lib/datos'
import { ROL_LABEL } from '../lib/estados'
import type { Config, Expreso, Rol, RolAsignado } from '../lib/types'
import { Empty, useToast } from './ui'
import { Lock } from 'lucide-react'

export function Ajustes() {
  const { yo } = useDatos()
  if (yo.rol !== 'admin') return <div className="page narrow"><Empty icono={Lock} titulo="Solo para administradores" /></div>
  return (
    <div className="page narrow">
      <div className="page-head">
        <div>
          <div className="eyebrow">Administración</div>
          <h1>Ajustes</h1>
        </div>
      </div>
      <div className="stack">
        <Expresos />
        <Equipo />
        <PersonasExpedicion />
        <Depositos />
        <Umbrales />
      </div>
    </div>
  )
}

function Expresos() {
  const { expresos, recargarCatalogos } = useDatos()
  const avisar = useToast()
  const [filas, setFilas] = useState<(Partial<Expreso> & { nombre: string })[]>([])
  useEffect(() => { setFilas(expresos.map((e) => ({ ...e }))) }, [expresos])

  const set = (i: number, k: keyof Expreso, v: unknown) => setFilas((f) => f.map((x, j) => (j === i ? { ...x, [k]: v } : x)))

  async function guardar(i: number) {
    const fila = filas[i]
    if (!fila.nombre.trim()) { avisar('Falta el nombre', true); return }
    try {
      await api.guardarExpreso(fila)
      await recargarCatalogos()
      avisar(`${fila.nombre} guardado`)
    } catch (e) {
      avisar(mensajeError(e), true)
    }
  }

  return (
    <section className="panel">
      <div className="panel-head">
        <h2>Expresos</h2>
        <button className="btn btn-sm" onClick={() => setFilas((f) => [...f, { nombre: '', dias_esperados: 5, requiere_guia: true, activo: true, orden: f.length + 1 }])}><Plus size={14} /> Agregar</button>
      </div>
      <div className="stack" style={{ padding: 18 }}>
        <p className="muted small" style={{ margin: 0 }}>
          Link de seguimiento: si la página del expreso acepta el número en el link, usá <span className="mono">{'{guia}'}</span> donde va
          (ej. <span className="mono">https://expreso.com/seguimiento?guia={'{guia}'}</span>). Si no, poné la página tal cual: al tocar
          "Seguir envío" la app copia la guía y abre la página para pegarla. Si el expreso no tiene página, dejalo vacío.
        </p>
        {filas.map((e, i) => (
          <div key={e.id ?? `nuevo-${i}`} className="stack" style={{ gap: 10, paddingBottom: 14, borderBottom: '1px solid var(--line-soft)' }}>
            <div className="grid-3">
              <label className="field"><span>Nombre</span><input className="control" value={e.nombre} onChange={(ev) => set(i, 'nombre', ev.target.value)} /></label>
              <label className="field"><span>Días hábiles esperados</span><input className="control" type="number" min={0} max={60} value={e.dias_esperados ?? 5} onChange={(ev) => set(i, 'dias_esperados', Number(ev.target.value))} /></label>
              <label className="field"><span>Orden</span><input className="control" type="number" value={e.orden ?? 0} onChange={(ev) => set(i, 'orden', Number(ev.target.value))} /></label>
            </div>
            <label className="field"><span>Link de seguimiento</span><input className="control mono" value={e.tracking_url ?? ''} onChange={(ev) => set(i, 'tracking_url', ev.target.value || null)} placeholder="https://…{guia}" /></label>
            <div className="row">
              <label className="row small"><input type="checkbox" checked={e.requiere_guia ?? true} onChange={(ev) => set(i, 'requiere_guia', ev.target.checked)} /> Lleva guía</label>
              <label className="row small"><input type="checkbox" checked={e.activo ?? true} onChange={(ev) => set(i, 'activo', ev.target.checked)} /> Activo (aparece al cargar)</label>
              <span className="spacer" />
              <button className="btn btn-sm btn-dark" onClick={() => void guardar(i)}><Save size={14} /> Guardar</button>
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}

function Equipo() {
  const { usuarios, recargarCatalogos } = useDatos()
  const avisar = useToast()
  const [email, setEmail] = useState('')
  const [nombre, setNombre] = useState('')
  const [rol, setRol] = useState<Rol>('expedicion')
  const [roles, setRoles] = useState<RolAsignado[]>([])
  const cargarRoles = () => api.listarRoles().then(setRoles).catch(() => setRoles([]))
  useEffect(() => { void cargarRoles() }, [])
  const emails = new Set(usuarios.map((u) => u.email))
  const pendientes = roles.filter((r) => !emails.has(r.email))
  const compartidas = new Set(roles.filter((r) => r.compartida).map((r) => r.email))

  async function asignar(e: string, r: Rol | null, n?: string) {
    try {
      await api.asignarRol(e, r, n)
      await Promise.all([recargarCatalogos(), cargarRoles()])
      avisar('Equipo actualizado')
    } catch (err) {
      avisar(mensajeError(err), true)
    }
  }

  return (
    <section className="panel">
      <div className="panel-head"><h2>Equipo y roles</h2></div>
      <div className="stack" style={{ padding: 18 }}>
        <p className="muted small" style={{ margin: 0 }}>
          Todos los usuarios del CRM entran como <b>vendedor</b>. Acá marcás quién es de <b>expedición</b> (imprime, prepara y despacha).
          La cuenta tiene que existir en el CRM (mismo login).
        </p>
        <table className="tabla">
          <thead><tr><th>Persona</th><th>Rol</th><th /></tr></thead>
          <tbody>
            {usuarios.map((u) => (
              <tr key={u.id}>
                <td><b>{u.nombre}</b><div className="muted small">{u.email}{compartidas.has(u.email) ? ' · cuenta compartida' : ''}</div></td>
                <td>
                  <select className="control" style={{ minHeight: 32, width: 'auto' }} value={u.rol} onChange={(ev) => void asignar(u.email, ev.target.value as Rol, u.nombre)}>
                    {(['vendedor', 'expedicion', 'admin'] as Rol[]).map((r) => <option key={r} value={r}>{ROL_LABEL[r]}</option>)}
                  </select>
                </td>
                <td className="r">
                  <button className="btn btn-ghost btn-sm" title="Quitar rol especial (vuelve a vendedor si es del CRM)" onClick={() => void asignar(u.email, null)}><Trash2 size={14} /></button>
                </td>
              </tr>
            ))}
            {pendientes.map((r) => (
              <tr key={r.email}>
                <td><b>{r.nombre || r.email.split('@')[0]}</b><div className="muted small">{r.email} · <span style={{ color: 'var(--t-alerta)' }}>todavía no tiene cuenta</span></div></td>
                <td>{ROL_LABEL[r.rol]}</td>
                <td className="r"><button className="btn btn-ghost btn-sm" title="Quitar" onClick={() => void asignar(r.email, null)}><Trash2 size={14} /></button></td>
              </tr>
            ))}
          </tbody>
        </table>
        {pendientes.length > 0 && (
          <p className="muted small" style={{ margin: 0 }}>
            Las cuentas "sin cuenta" ya tienen el rol listo: falta crear el usuario (email y contraseña) en Supabase → Authentication → Users → Add user.
            Apenas exista, entra con ese rol.
          </p>
        )}
        <div className="grid-3" style={{ alignItems: 'end' }}>
          <label className="field"><span>Email</span><input className="control" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="expedicion@grupopoliplast.com.ar" /></label>
          <label className="field"><span>Nombre</span><input className="control" value={nombre} onChange={(e) => setNombre(e.target.value)} /></label>
          <label className="field"><span>Rol</span>
            <select className="control" value={rol} onChange={(e) => setRol(e.target.value as Rol)}>
              {(['expedicion', 'vendedor', 'admin'] as Rol[]).map((r) => <option key={r} value={r}>{ROL_LABEL[r]}</option>)}
            </select>
          </label>
        </div>
        <div className="row"><span className="spacer" /><button className="btn btn-dark" disabled={!email.includes('@')} onClick={() => { void asignar(email, rol, nombre); setEmail(''); setNombre('') }}><Plus size={15} /> Agregar al equipo</button></div>
        <p className="muted small" style={{ margin: 0 }}>Los administradores del CRM son administradores acá siempre; cambiar su rol no les quita ese permiso.</p>
      </div>
    </section>
  )
}

function PersonasExpedicion() {
  return (
    <ListaConfig campo="operadores" titulo="Personas de expedición" guardado="Personas de expedición guardadas" placeholder="Nombre"
      ayuda={'Entran todos con la cuenta compartida de expedición. Cada celular pregunta una vez "¿Quién sos?" y lo que marcan queda a nombre de esa persona.'} />
  )
}

function Depositos() {
  return (
    <ListaConfig campo="depositos" titulo="Depósitos" guardado="Depósitos guardados" placeholder="Depósito"
      ayuda="Cada celular o compu de expedición elige desde qué depósito trabaja. Cada paso que marca queda con ese depósito (y el nombre de la persona)." />
  )
}

function ListaConfig({ campo, titulo, ayuda, guardado, placeholder }: { campo: 'operadores' | 'depositos'; titulo: string; ayuda: string; guardado: string; placeholder: string }) {
  const { config, recargarCatalogos } = useDatos()
  const avisar = useToast()
  const [lista, setLista] = useState<string[]>(config[campo])
  const [nuevo, setNuevo] = useState('')
  useEffect(() => setLista(config[campo]), [config, campo])

  async function guardar(l: string[]) {
    setLista(l)
    try {
      await api.guardarConfig({ ...config, [campo]: l })
      await recargarCatalogos()
      avisar(guardado)
    } catch (e) {
      avisar(mensajeError(e), true)
    }
  }
  function agregar() {
    const n = nuevo.trim()
    if (!n || lista.some((x) => x.toLowerCase() === n.toLowerCase())) return
    setNuevo('')
    void guardar([...lista, n])
  }

  return (
    <section className="panel">
      <div className="panel-head"><h2>{titulo}</h2></div>
      <div className="stack" style={{ padding: 18 }}>
        <p className="muted small" style={{ margin: 0 }}>{ayuda}</p>
        <div className="row" style={{ gap: 6 }}>
          {lista.map((n) => (
            <span key={n} className="chip tono-neutro" style={{ gap: 4 }}>
              {n}
              <button className="link-btn" style={{ color: 'var(--steel)' }} aria-label={`Quitar a ${n}`} onClick={() => void guardar(lista.filter((x) => x !== n))}><X size={13} /></button>
            </span>
          ))}
        </div>
        <div className="row">
          <input className="control" style={{ maxWidth: 260 }} value={nuevo} onChange={(e) => setNuevo(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && agregar()} placeholder={placeholder} />
          <button className="btn btn-dark" onClick={agregar} disabled={!nuevo.trim()}><Plus size={15} /> Agregar</button>
        </div>
      </div>
    </section>
  )
}

function Umbrales() {
  const { config, recargarCatalogos } = useDatos()
  const avisar = useToast()
  const [c, setC] = useState<Config>(config)
  useEffect(() => setC(config), [config])
  async function guardar() {
    try {
      await api.guardarConfig(c)
      await recargarCatalogos()
      avisar('Alertas guardadas')
    } catch (e) {
      avisar(mensajeError(e), true)
    }
  }
  return (
    <section className="panel">
      <div className="panel-head"><h2>Cuándo avisar</h2></div>
      <div className="stack" style={{ padding: 18 }}>
        <div className="grid-3">
          <label className="field"><span>Sin imprimir más de</span><input className="control" type="number" min={1} max={72} value={c.horas_sin_imprimir} onChange={(e) => setC({ ...c, horas_sin_imprimir: Number(e.target.value) })} /><span className="hint">horas hábiles (lun–vie 8 a 16)</span></label>
          <label className="field"><span>Impreso sin salir más de</span><input className="control" type="number" min={1} max={30} value={c.dias_sin_despachar} onChange={(e) => setC({ ...c, dias_sin_despachar: Number(e.target.value) })} /><span className="hint">días hábiles</span></label>
          <label className="field"><span>Frenado sin fecha más de</span><input className="control" type="number" min={1} max={60} value={c.dias_bloqueado} onChange={(e) => setC({ ...c, dias_bloqueado: Number(e.target.value) })} /><span className="hint">días hábiles</span></label>
        </div>
        <p className="muted small" style={{ margin: 0 }}>En viaje: se avisa cuando supera los días esperados de cada expreso (arriba).</p>
        <div className="row"><span className="spacer" /><button className="btn btn-dark" onClick={() => void guardar()}><Save size={15} /> Guardar</button></div>
      </div>
    </section>
  )
}
