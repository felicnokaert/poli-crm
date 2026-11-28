// Pedidos nuevos de la tienda online (28/11, Felipe): tarjeta verde con los pasos Factura → Remito → Producción.
// Ya están pagados por Mercado Pago (no hay estados de pago). Al marcar el remito el pedido sale de la lista.
import { Check, ShoppingBag } from 'lucide-react'
import { useEffect, useState } from 'react'
import { api } from '../lib/cliente'
import { useDatos } from '../lib/datos'
import { hace } from '../lib/fechas'
import { mensajeError } from '../lib/api'
import type { PasoShopify, PedidoShopify } from '../lib/types'

const PASOS: { paso: PasoShopify; label: string }[] = [
  { paso: 'factura', label: 'Factura' },
  { paso: 'remito', label: 'Remito' },
  { paso: 'produccion', label: 'Producción' },
]
const ADMIN_SHOPIFY = 'https://admin.shopify.com/store/poliplastarg/orders/'
const pesos = (n: number | null) => (n == null ? '' : `$ ${n.toLocaleString('es-AR', { maximumFractionDigits: 0 })}`)

export function ShopifyPedidos() {
  const { yo, version } = useDatos()
  const [pedidos, setPedidos] = useState<PedidoShopify[] | null>(null)
  const [error, setError] = useState('')
  const [ocupado, setOcupado] = useState('')
  const disponible = typeof api.pedidosShopify === 'function' && yo.rol !== 'expedicion'

  useEffect(() => {
    if (!disponible) return
    let vivo = true
    api.pedidosShopify!().then((lista) => { if (vivo) setPedidos(lista) }).catch(() => { if (vivo) setPedidos([]) })
    return () => { vivo = false }
  }, [version, disponible])

  if (!disponible || !pedidos || pedidos.length === 0) return null

  async function marcar(p: PedidoShopify, paso: PasoShopify) {
    const hecho = !p[`${paso}_at`]
    if (paso === 'remito' && hecho && !window.confirm(`¿Ya está cargado el remito de ${p.name}? El pedido sale de esta lista.`)) return
    setOcupado(`${p.id}:${paso}`)
    setError('')
    try {
      await api.marcarPasoShopify!(p.id, paso, hecho)
      setPedidos((lista) => (lista ?? []).map((x) => (x.id === p.id ? { ...x, [`${paso}_at`]: hecho ? new Date().toISOString() : null } : x)).filter((x) => !x.remito_at))
    } catch (e) {
      setError(mensajeError(e))
    } finally {
      setOcupado('')
    }
  }

  return (
    <section className="panel shopify-pedidos" aria-label="Pedidos de Shopify">
      <div className="panel-head">
        <h2><ShoppingBag size={16} /> Pedidos de Shopify <span className="shopify-cuenta">{pedidos.length}</span></h2>
        <span className="muted small">pagados por Mercado Pago · se cierran con el remito</span>
      </div>
      {error && <div className="shopify-error" role="alert">{error}</div>}
      <div className="shopify-lista">
        {pedidos.map((p) => {
          const c = p.cliente ?? {}
          const quien = [c.nombre, c.empresa].filter(Boolean).join(' — ')
          const lugar = [c.localidad, c.provincia].filter(Boolean).join(', ')
          return (
            <article key={p.id} className="shopify-card">
              <div className="shopify-top">
                <a className="shopify-num" href={`${ADMIN_SHOPIFY}${p.id.split('/').pop()}`} target="_blank" rel="noreferrer">{p.name}</a>
                <span className="shopify-total">{pesos(p.total)}</span>
                <span className="muted small">{hace(p.created_at)}</span>
              </div>
              <div className="shopify-cliente">
                {quien || 'Cliente en Shopify'}
                {c.telefono && <> · <a href={`tel:${c.telefono.replace(/[^\d+]/g, '')}`}>{c.telefono}</a></>}
              </div>
              <div className="muted small">
                {p.delivery === 'PICK_UP' ? 'Retira en Villa Domínico' : p.delivery === 'SHIPPING' ? `Envío${lugar ? ` a ${lugar}` : ''}${p.shipping_title ? ` · ${p.shipping_title}` : ''}` : p.shipping_title}
              </div>
              <ul className="shopify-items">
                {p.items.map((it, i) => <li key={i}>{it.qty} × {it.title}{it.sku ? <span className="muted"> · {it.sku}</span> : null}</li>)}
              </ul>
              <div className="shopify-pasos" role="group" aria-label={`Pasos de ${p.name}`}>
                {PASOS.map(({ paso, label }) => {
                  const hecho = Boolean(p[`${paso}_at`])
                  return (
                    <button key={paso} type="button" className={`shopify-paso${hecho ? ' hecho' : ''}`} aria-pressed={hecho}
                      disabled={ocupado === `${p.id}:${paso}`} onClick={() => void marcar(p, paso)}>
                      {hecho && <Check size={13} />} {label}
                    </button>
                  )
                })}
              </div>
            </article>
          )
        })}
      </div>
    </section>
  )
}
