import { LogIn } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { mensajeError } from '../lib/api'
import { api, MAQUETA } from '../lib/cliente'
import { isEmbeddedInApp } from '../lib/embed'
import { ROL_LABEL } from '../lib/estados'

export function Login({ sinAcceso, onSalir }: { sinAcceso?: string | null; onSalir?: () => void }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)

  async function entrar(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setEnviando(true)
    try {
      await api.iniciarSesion(email, password)
    } catch (err) {
      setError(mensajeError(err))
    } finally {
      setEnviando(false)
    }
  }

  return (
    <div className="login-wrap">
      <div className="panel login">
        <div className="brand-dark">
          <img src={`${import.meta.env.BASE_URL}poliplast-isotipo-color.png`} alt="" />
          <div>
            <div className="eyebrow">Grupo Poliplast</div>
            <h1>Entregas</h1>
          </div>
        </div>

        {sinAcceso ? (
          <>
            <div className="aviso warn">
              La cuenta <b>{sinAcceso}</b> no tiene acceso a Entregas. Pedile a un administrador que te habilite.
            </div>
            <button className="btn" onClick={onSalir}>Entrar con otra cuenta</button>
          </>
        ) : MAQUETA ? (
          <>
            <p className="muted" style={{ margin: 0 }}>Maqueta con datos de ejemplo. Elegí con qué rol entrar:</p>
            <div className="opciones">
              {api.usuariosDePrueba?.map((u) => (
                <button key={u.id} className="opcion" onClick={() => void api.iniciarSesion(u.email, '')}>
                  <LogIn size={16} />
                  <span><b>{u.nombre}</b><small>{ROL_LABEL[u.rol]} · {u.email}</small></span>
                </button>
              ))}
            </div>
          </>
        ) : (
          <form onSubmit={entrar} className="stack" style={{ gap: 12 }}>
            {isEmbeddedInApp()
              ? <p className="muted" style={{ margin: 0 }}>Es la primera vez de Entregas en esta compu (o en esta ventana): entrá <b>una sola vez</b> con la cuenta de expedición. Después queda guardada y no lo vuelve a pedir.</p>
              : <p className="muted" style={{ margin: 0 }}>Entrá con el mismo usuario del CRM.</p>}
            <label className="field">
              <span>Email</span>
              <input className="control" type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} />
            </label>
            <label className="field">
              <span>Contraseña</span>
              <input className="control" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
            </label>
            {error && <div className="aviso err">{error}</div>}
            <button className="btn btn-primary" disabled={enviando}>{enviando ? 'Entrando…' : 'Entrar'}</button>
          </form>
        )}
      </div>
    </div>
  )
}
