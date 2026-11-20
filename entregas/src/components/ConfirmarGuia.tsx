// Después de subir la foto de la guía: busca el número en la imagen y pregunta si se carga.
import { ScanLine } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { mensajeError } from '../lib/api'
import { api } from '../lib/cliente'
import { detectarGuia } from '../lib/leerGuia'
import type { Pedido } from '../lib/types'
import { CamposGuia } from './CamposGuia'
import { Modal, useToast } from './ui'

export function useLeerGuia(onGuardada: () => Promise<void> | void): { revisar: (p: Pedido, f: File) => void; elemento: ReactNode } {
  const avisar = useToast()
  const [estado, setEstado] = useState<{ pedido: Pedido; numero: string; fuente: 'codigo' | 'texto' } | null>(null)
  const [guardando, setGuardando] = useState(false)

  function revisar(p: Pedido, f: File) {
    if (p.n_guia) return
    avisar('Buscando el N° de guía en el archivo…')
    void detectarGuia(f).then((r) => {
      if (r) setEstado({ pedido: p, numero: r.numero, fuente: r.fuente })
      else avisar('No encontré el número en la foto: cargalo a mano desde el pedido.')
    })
  }

  async function guardar() {
    if (!estado || !estado.numero.trim()) return
    setGuardando(true)
    try {
      await api.editarPedido(estado.pedido.id, { n_guia: estado.numero.trim() })
      avisar(`Guía ${estado.numero.trim()} cargada`)
      setEstado(null)
      await onGuardada()
    } catch (e) {
      avisar(mensajeError(e), true)
    } finally {
      setGuardando(false)
    }
  }

  const elemento = estado && (
    <Modal titulo="¿Son estos los números de la guía?" subtitulo={`${estado.pedido.cliente} · remito ${estado.pedido.n_remito}`} onClose={() => setEstado(null)}
      pie={<>
        <button className="btn" onClick={() => setEstado(null)}>No, lo cargo después</button>
        <button className="btn btn-primary" disabled={guardando || !estado.numero.trim()} onClick={() => void guardar()}>{guardando ? 'Guardando…' : 'Sí, cargarlo'}</button>
      </>}>
      <div className="aviso info"><ScanLine size={16} /> Lo leí {estado.fuente === 'codigo' ? 'del código de barras' : 'del texto'} de la foto. Revisalo antes de guardarlo.</div>
      <CamposGuia grande valor={estado.numero} onChange={(v) => setEstado({ ...estado, numero: v })} />
    </Modal>
  )
  return { revisar, elemento }
}
