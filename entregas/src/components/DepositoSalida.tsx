// «¿Desde dónde sale?»: el depósito de salida del pedido. Dos fijos y «Otro» para escribirlo
// (a veces sale desde Mas Tin, MAGMA u otro lugar). Los depósitos son los de Ajustes (Villa Domínico, Mar del Plata).
// Todas las opciones en una fila, sin una suelta abajo.
import { useEffect, useState, type CSSProperties } from 'react'
import { useDatos } from '../lib/datos'

const POR_DEFECTO = ['Villa Domínico', 'Mar del Plata']

export function DepositoSalida({ valor, onChange, titulo = '¿Desde dónde sale?', compacto }: {
  valor: string | null
  onChange: (v: string | null) => void
  titulo?: string
  compacto?: boolean
}) {
  const { config } = useDatos()
  const DEPOSITOS_SALIDA = config.depositos?.length ? config.depositos : POR_DEFECTO
  const esOtro = !!valor && !DEPOSITOS_SALIDA.includes(valor)
  const [otro, setOtro] = useState(esOtro)
  const [texto, setTexto] = useState(esOtro ? valor ?? '' : '')

  // Si el valor cambia desde afuera (p. ej. «todos desde…»), acompañar.
  useEffect(() => {
    if (valor && DEPOSITOS_SALIDA.includes(valor)) setOtro(false)
    else if (valor) { setOtro(true); setTexto((t) => (t.trim() === valor ? t : valor)) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [valor])

  return (
    <div className="field">
      {titulo && <span>{titulo}</span>}
      <div className={`expresos-pick depositos-pick${compacto ? ' compacto' : ''}`} style={{ '--n': DEPOSITOS_SALIDA.length + 1 } as CSSProperties}>
        {DEPOSITOS_SALIDA.map((d) => (
          <button key={d} type="button" className="expreso-opt" aria-pressed={!otro && valor === d} onClick={() => { setOtro(false); onChange(d) }}>
            <b>{d}</b>
          </button>
        ))}
        <button type="button" className="expreso-opt" aria-pressed={otro} onClick={() => { setOtro(true); onChange(texto.trim() || null) }}>
          <b>Otro</b>
        </button>
      </div>
      {otro && (
        <input className="control" aria-label="Otro depósito de salida" placeholder="¿Desde dónde? (ej.: Mas Tin, MAGMA)" value={texto} autoFocus={!texto}
          onChange={(e) => { setTexto(e.target.value); onChange(e.target.value.trim() || null) }} />
      )}
    </div>
  )
}
