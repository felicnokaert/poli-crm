// Cierre del día para el grupo de WhatsApp (16 h, cuando corta el equipo).
import { ClipboardCheck, Copy, MessageCircle } from 'lucide-react'
import { useState } from 'react'
import { useDatos } from '../lib/datos'
import { esHabil } from '../lib/fechas'
import { resumenDelDia } from '../lib/mensajes'
import { Modal, useCopiar } from './ui'

/** Botón que abre el resumen listo para copiar. */
export function BotonResumen({ className = 'btn', texto = 'Cierre del día' }: { className?: string; texto?: string }) {
  const [abierto, setAbierto] = useState(false)
  return (
    <>
      <button className={className} onClick={() => setAbierto(true)}><ClipboardCheck size={16} /> {texto}</button>
      {abierto && <ModalResumen onClose={() => setAbierto(false)} />}
    </>
  )
}

function ModalResumen({ onClose }: { onClose: () => void }) {
  const { pedidos, expresosPorId } = useDatos()
  const copiar = useCopiar()
  const msg = resumenDelDia(pedidos, expresosPorId)
  return (
    <Modal titulo="Cierre del día" subtitulo="Para el grupo de WhatsApp: qué salió hoy y qué queda pendiente." onClose={onClose}
      pie={<>
        <button className="btn btn-primary" onClick={() => void copiar(msg, 'Resumen copiado: pegalo en el grupo')}><Copy size={16} /> Copiar</button>
        <a className="btn" href={`https://wa.me/?text=${encodeURIComponent(msg)}`} target="_blank" rel="noreferrer"><MessageCircle size={16} /> Abrir WhatsApp</a>
      </>}>
      <div className="mensaje-preview" style={{ maxHeight: '55vh', overflow: 'auto' }}>{msg}</div>
    </Modal>
  )
}

/** Aviso en Inicio a partir de las 15:30 de un día hábil, para expedición y administradores. */
export function AvisoCierre() {
  const { yo } = useDatos()
  const ahora = new Date()
  const minutos = ahora.getHours() * 60 + ahora.getMinutes()
  if (yo.rol === 'vendedor' || !esHabil(ahora) || minutos < 15 * 60 + 30 || minutos > 19 * 60) return null
  return (
    <div className="aviso info" style={{ marginBottom: 14, alignItems: 'center' }}>
      <ClipboardCheck size={16} />
      <span style={{ flex: 1 }}>A las 16 corta el equipo: mandá el cierre del día al grupo.</span>
      <BotonResumen className="btn btn-sm btn-dark" texto="Armar cierre" />
    </div>
  )
}
