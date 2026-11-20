// Cuenta compartida de expedición: el dispositivo ya está conectado; solo hay que decir quién lo usa y desde
// qué depósito. Queda guardado en el dispositivo y todo lo que se marque queda a nombre de esa persona y depósito.
import { LogOut, UserRound, Warehouse } from 'lucide-react'
import { useEffect, useState } from 'react'
import { api } from '../lib/cliente'
import { depositoActual, depositoDePersona, operadorActual, setDeposito, setOperador } from '../lib/operador'
import { CONFIG_DEFAULT } from '../lib/types'

export function QuienSos({ onCancelar }: { onCancelar?: () => void }) {
  const [nombres, setNombres] = useState<string[] | null>(null)
  const [depositos, setDepositos] = useState<string[]>([])
  const [deposito, setDep] = useState<string | null>(depositoActual())
  const [falta, setFalta] = useState(false)
  // Si no se toca un depósito, sale solo de la persona (Braian → Mar del Plata, el resto → Villa Domínico).
  const [aMano, setAMano] = useState(false)
  const actual = operadorActual()

  useEffect(() => {
    api.obtenerConfig()
      .then((c) => {
        setNombres(c.operadores?.length ? c.operadores : CONFIG_DEFAULT.operadores)
        setDepositos(c.depositos?.length ? c.depositos : CONFIG_DEFAULT.depositos)
      })
      .catch(() => { setNombres(CONFIG_DEFAULT.operadores); setDepositos(CONFIG_DEFAULT.depositos) })
  }, [])

  // Un solo depósito: no hace falta elegir. Si el guardado ya no existe, se vuelve a elegir.
  useEffect(() => {
    if (!depositos.length) return
    if (depositos.length === 1) setDep(depositos[0])
    else if (deposito && !depositos.includes(deposito)) setDep(null)
  }, [depositos, deposito])

  function elegirPersona(n: string) {
    const d = (aMano ? deposito : depositoDePersona(n, depositos)) ?? deposito
    if (!d) { setFalta(true); return }
    setDeposito(d)
    setOperador(n)
    onCancelar?.()
  }

  return (
    <div className="login-wrap">
      <div className="panel login">
        <div className="brand-dark">
          <img src="/poliplast-isotipo-color.png" alt="" />
          <div>
            <div className="eyebrow">Expedición</div>
            <h1>¿Quién sos?</h1>
          </div>
        </div>

        {depositos.length > 1 && (
          <div className="stack" style={{ gap: 8 }}>
            <b className="small">¿Desde qué depósito? <span className="muted" style={{ fontWeight: 400 }}>(se elige solo según tu nombre; tocalo solo si hoy estás en otro)</span></b>
            <div className="row" style={{ gap: 8 }}>
              {depositos.map((d) => (
                <button key={d} className="chip-btn" aria-pressed={d === deposito} onClick={() => { setDep(d); setAMano(true); setFalta(false) }}>
                  <Warehouse size={14} /> {d}
                </button>
              ))}
            </div>
            {falta && <span className="small" style={{ color: 'var(--t-peligro)' }}>Elegí primero el depósito.</span>}
          </div>
        )}

        <p className="muted" style={{ margin: 0 }}>Tocá tu nombre. Queda guardado en este dispositivo y todo lo que marques queda a tu nombre{depositos.length > 1 ? ' y con ese depósito' : ''}.</p>
        <div className="opciones">
          {(nombres ?? []).map((n) => (
            <button key={n} className="opcion quien" aria-pressed={n === actual} onClick={() => elegirPersona(n)}>
              <UserRound size={18} />
              <span><b>{n}</b></span>
            </button>
          ))}
          {!nombres && [1, 2, 3].map((i) => <div key={i} className="skeleton" style={{ height: 52 }} />)}
        </div>
        {onCancelar && <button className="btn btn-ghost" onClick={onCancelar}>Volver</button>}
        <button className="link-btn small muted" style={{ justifySelf: 'center' }}
          onClick={() => { if (confirm('¿Desconectar este dispositivo? Para volver a entrar hace falta la contraseña de expedición.')) { setOperador(null); void api.cerrarSesion() } }}>
          <LogOut size={13} /> Desconectar este dispositivo
        </button>
      </div>
    </div>
  )
}
