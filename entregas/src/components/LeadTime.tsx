// Cronómetro del lead time (impreso → despachado). Si el pedido todavía no salió, corre en vivo.
import { Timer } from 'lucide-react'
import { useEffect, useState } from 'react'
import { duracion, LEAD_LIMITE_HORAS, LEAD_OK_HORAS, leadTime } from '../lib/leadtime'
import type { Pedido } from '../lib/types'

const TONO = { ok: 'tono-ok', alerta: 'tono-alerta', peligro: 'tono-peligro' } as const

/** Fuerza un redibujo cada `ms` mientras haga falta (para el reloj en vivo). */
function useAhora(activo: boolean, ms = 30_000): Date {
  const [ahora, setAhora] = useState(() => new Date())
  useEffect(() => {
    if (!activo) return
    const t = window.setInterval(() => setAhora(new Date()), ms)
    return () => window.clearInterval(t)
  }, [activo, ms])
  return ahora
}

export function RelojLead({ pedido, conTexto }: { pedido: Pedido; conTexto?: boolean }) {
  const corre = pedido.estado === 'impreso' && !!pedido.impreso_at
  const ahora = useAhora(corre)
  const l = leadTime(pedido, ahora)
  if (!l) return null
  const titulo = `Lead time: de impreso a despachado, en horas de jornada (lun a vie, 8 a 16). Verde hasta ${LEAD_OK_HORAS} h, amarillo hasta ${LEAD_LIMITE_HORAS} h.`
  return (
    <span className={`chip reloj ${TONO[l.tono]}${l.corriendo ? ' corriendo' : ''}`} title={titulo}>
      <Timer size={12} /> {conTexto ? (l.corriendo ? 'Preparando hace ' : 'Salió en ') : ''}{duracion(l.horas)}
    </span>
  )
}
