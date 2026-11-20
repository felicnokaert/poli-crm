// Dos casilleros: N° de guía y N° de seguimiento (Credifin trae los dos; si hay uno solo, el otro queda vacío).
// Se guardan juntos en el mismo campo del pedido (ver partesGuia / unirGuia en lib/mensajes).
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { partesGuia, unirGuia } from '../lib/mensajes'

export function CamposGuia({ valor, onChange, pista, grande }: {
  valor: string | null | undefined
  onChange: (v: string) => void
  /** Texto chico al lado de «N° de guía» (p. ej. «leído de la foto: revisalo»). */
  pista?: ReactNode
  grande?: boolean
}) {
  const inicial = partesGuia(valor)
  const [guia, setGuia] = useState(inicial?.guia ?? '')
  const [seg, setSeg] = useState(inicial?.seguimiento ?? '')
  const ultimo = useRef(unirGuia(seg, guia))

  // Si el valor cambia desde afuera (lo leyó de la foto o del PDF), se reparte en los dos casilleros.
  useEffect(() => {
    const v = valor ?? ''
    if (v === ultimo.current) return
    const p = partesGuia(v)
    setGuia(p?.guia ?? '')
    setSeg(p?.seguimiento ?? '')
    ultimo.current = v
  }, [valor])

  function cambiar(g: string, s: string) {
    setGuia(g)
    setSeg(s)
    const v = unirGuia(s, g)
    ultimo.current = v
    onChange(v)
  }

  const estilo = grande ? { fontSize: 18 } : undefined
  return (
    <>
      <label className="field">
        <span>N° de guía {pista && <span className="hint">{pista}</span>}</span>
        <input className="control mono" style={estilo} value={guia} onChange={(e) => cambiar(e.target.value, seg)} inputMode="text" />
      </label>
      <label className="field">
        <span>N° de seguimiento <span className="hint">(si el expreso lo da aparte)</span></span>
        <input className="control mono" style={estilo} value={seg} onChange={(e) => cambiar(guia, e.target.value)} inputMode="text" />
      </label>
    </>
  )
}
