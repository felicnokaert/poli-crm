// Detalle corto de un día del calendario: qué salió, qué se entregó, qué llega y qué stock se espera.
// Se abre al tocar el día (o «+N más»), así no queda nada escondido.
import { guiaLegible } from '../lib/mensajes'
import { ChevronRight } from 'lucide-react'
import { useDatos } from '../lib/datos'
import { desdeISO, fechaCorta } from '../lib/fechas'
import { CAPAS, type Capa, type EventoDia } from './Calendario'
import { RelojLead } from './LeadTime'
import { Modal } from './ui'

const NOMBRE: Record<Capa, [string, string]> = {
  despacho: ['despacho', 'despachos'],
  entrega: ['entrega', 'entregas'],
  estimada: ['llega', 'llegan'],
  stock: ['stock esperado', 'stock esperado'],
}

function tituloDia(iso: string): string {
  const t = new Intl.DateTimeFormat('es-AR', { weekday: 'long', day: 'numeric', month: 'long' }).format(desdeISO(iso))
  return t.charAt(0).toUpperCase() + t.slice(1).replace(',', '')
}

export function DetalleDia({ iso, eventos, onClose }: { iso: string; eventos: EventoDia[]; onClose: () => void }) {
  const { expresosPorId, usuariosPorId } = useDatos()
  const grupos = CAPAS.map((c) => ({ ...c, lista: eventos.filter((e) => e.capa === c.id) })).filter((g) => g.lista.length)
  const resumen = grupos.map((g) => `${g.lista.length} ${NOMBRE[g.id][g.lista.length === 1 ? 0 : 1]}`).join(' · ')

  return (
    <Modal titulo={tituloDia(iso)} subtitulo={resumen || 'Sin movimientos'} onClose={onClose}
      pie={<button className="btn" onClick={onClose}>Cerrar</button>}>
      {grupos.map((g) => (
        <section key={g.id} className="dia-grupo">
          <h3 className="dia-titulo"><span className={`chip ${g.tono}`}>{g.label}</span> <span className="muted">{g.lista.length}</span></h3>
          <div className="dia-lista">
            {g.lista.map(({ p }) => {
              const exp = p.expreso_id ? expresosPorId.get(p.expreso_id)?.nombre : null
              const vend = usuariosPorId.get(p.vendedor_id)?.nombre
              const datos: string[] = [p.n_remito]
              if (exp) datos.push(exp)
              if (g.id === 'despacho' || g.id === 'estimada') {
                datos.push(p.n_guia ? guiaLegible(p.n_guia) : 'sin guía')
                if (p.bultos) datos.push(`${p.bultos} bulto${p.bultos === 1 ? '' : 's'}`)
              }
              if (g.id === 'estimada' && p.fecha_despacho) datos.push(`salió el ${fechaCorta(p.fecha_despacho)}`)
              if (g.id === 'entrega' && p.fecha_despacho) datos.push(`salió el ${fechaCorta(p.fecha_despacho)}`)
              if (g.id === 'stock' && p.bloqueo_detalle) datos.push(p.bloqueo_detalle)
              const quien = g.id === 'despacho' && p.despacho_operador
                ? `despachó ${p.despacho_operador}${p.despacho_deposito ? ` (${p.despacho_deposito})` : ''}`
                : null
              return (
                <a key={p.id} className="dia-fila" href={`#/p/${p.codigo}`}>
                  <span className="dia-info">
                    <b>{p.cliente}</b>
                    <span className="small muted">{datos.join(' · ')}</span>
                    <span className="small muted">{[vend && `vendió ${vend}`, quien].filter(Boolean).join(' · ')}</span>
                  </span>
                  {g.id === 'despacho' && <RelojLead pedido={p} />}
                  <ChevronRight size={16} className="muted" />
                </a>
              )
            })}
          </div>
        </section>
      ))}
    </Modal>
  )
}
