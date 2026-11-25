// Textos listos para pegar: el aviso al grupo de expedición y la respuesta al cliente.
import { duracion, resumenLead } from './leadtime'
import { MOTIVOS_BLOQUEO, MOTIVOS_INCIDENCIA, esRetiroDelCliente } from './estados'
import { fechaCorta, fechaLarga, hoyISO } from './fechas'
import type { Expreso, Pedido } from './types'

export function linkPedido(pedido: Pick<Pedido, 'codigo'>, base: string = baseUrl()): string {
  return `${base}#/p/${pedido.codigo}`
}

function baseUrl(): string {
  if (typeof window === 'undefined') return ''
  return `${window.location.origin}${window.location.pathname}`
}

// El pedido guarda en un solo campo el N° de guía y el N° de seguimiento: «seguimiento / guía» (Credifin trae los dos:
// «COZ07Z / 4120-00002980»). Si hay uno solo: «guía» o «seguimiento /». Los valores viejos de un solo número se
// reconocen: con letras es seguimiento (COZ07Z), solo números es guía.
export function partesGuia(n: string | null | undefined): { guia: string | null; seguimiento: string | null } | null {
  const s = String(n ?? '').trim()
  if (!s) return null
  if (s.includes('/')) {
    const [a, ...resto] = s.split('/')
    const seguimiento = a.trim() || null
    const guia = resto.join('/').trim() || null
    return seguimiento || guia ? { guia, seguimiento } : null
  }
  return /[A-Za-z]/.test(s) ? { guia: null, seguimiento: s } : { guia: s, seguimiento: null }
}

/** El número que pide la página del expreso: el de seguimiento si hay, si no el de guía. */
export function numeroSeguir(n: string | null | undefined): string | null {
  const g = partesGuia(n)
  return g ? g.seguimiento ?? g.guia : null
}

/** Para una línea: «guía 4120-00002980 · seguimiento COZ07Z» (solo lo que haya). */
export function guiaLegible(n: string | null | undefined): string {
  const g = partesGuia(n)
  if (!g) return ''
  return [g.guia && `guía ${g.guia}`, g.seguimiento && `seguimiento ${g.seguimiento}`].filter(Boolean).join(' · ')
}

/** Junta seguimiento y N° de guía en el formato que se guarda. */
export function unirGuia(seguimiento: string | null | undefined, guia: string | null | undefined): string {
  const s = (seguimiento ?? '').trim().replace(/\//g, '-')
  const g = (guia ?? '').trim().replace(/\//g, '-')
  if (s && g) return s.replace(/\W/g, '') === g.replace(/\W/g, '') ? g : `${s} / ${g}`
  if (g) return g
  if (s) return /[A-Za-z]/.test(s) ? s : `${s} /`
  return ''
}

export function linkSeguimiento(expreso: Expreso | undefined, n_guia: string | null): string | null {
  const guia = numeroSeguir(n_guia)
  if (!expreso?.tracking_url) return null
  if (expreso.tracking_url.includes('{guia}')) return guia ? expreso.tracking_url.replaceAll('{guia}', encodeURIComponent(guia)) : null
  return expreso.tracking_url
}

/** La página del expreso no recibe la guía en el link: hay que pegarla a mano (la app la copia). */
export function guiaSeCopia(expreso: Expreso | undefined): boolean {
  return Boolean(expreso?.tracking_url && !expreso.tracking_url.includes('{guia}'))
}

function destino(p: Pedido): string {
  return [p.localidad, p.provincia].filter(Boolean).join(', ')
}

/** Aviso al grupo de WhatsApp de expedición cuando se carga un remito (vendedor null = no lo repite). */
export function mensajeGrupo(p: Pedido, expreso: Expreso | undefined, vendedor: string | null, link = linkPedido(p)): string {
  const lineas = [
    `📦 *Remito ${p.n_remito}* — ${p.cliente}`,
    `🚚 Va por: *${expreso?.nombre ?? 'A definir'}*`,
    p.deposito_salida ? `🏭 Sale de: *${p.deposito_salida}*` : '',
    destino(p) ? `📍 ${[p.direccion, destino(p)].filter(Boolean).join(' · ')}${p.cp ? ` (CP ${p.cp})` : ''}` : p.direccion ? `📍 ${p.direccion}` : '',
    p.telefono ? `📞 ${p.telefono}${p.contacto ? ` (${p.contacto})` : ''}` : '',
    p.nota ? `📝 ${p.nota}` : '',
    vendedor ? `👤 ${vendedor}` : '',
    `Seguimiento: ${link}`,
  ]
  return lineas.filter(Boolean).join('\n')
}

/** Un solo mensaje para el grupo cuando se cargan varios remitos juntos. */
export function mensajeGrupoVarios(ps: Pedido[], expresos: Map<string, Expreso>, vendedor: string): string {
  const exp = (p: Pedido) => (p.expreso_id ? expresos.get(p.expreso_id) : undefined)
  if (ps.length === 1) return mensajeGrupo(ps[0], exp(ps[0]), vendedor)
  return [`🗂️ *${ps.length} remitos nuevos* — 👤 ${vendedor}`, ...ps.map((p) => mensajeGrupo(p, exp(p), null))].join('\n\n')
}

/** Cierre del día para el grupo (a las 16, cuando corta el equipo): qué salió y qué queda pendiente. */
/** Quién despachó un pedido: la persona de expedición o, si fue otra cuenta, el nombre del mail. */
export function quienDespacho(p: Pick<Pedido, 'despacho_operador' | 'despacho_email'>): string {
  if (p.despacho_operador) return p.despacho_operador
  if (p.despacho_email) return p.despacho_email.split('@')[0].replace(/^\w/, (c) => c.toUpperCase())
  return ''
}

/** "Marcos 3 · Neyen 2" (de más a menos). */
function conteo(valores: string[]): string {
  const m = new Map<string, number>()
  for (const v of valores) if (v) m.set(v, (m.get(v) ?? 0) + 1)
  return [...m.entries()].sort((a, b) => b[1] - a[1]).map(([k, n]) => `${k} ${n}`).join(' · ')
}

export function resumenDelDia(pedidos: Pedido[], expresos: Map<string, Expreso>, ahora: Date = new Date(), base: string = baseUrl()): string {
  const hoy = hoyISO(ahora)
  const exp = (p: Pedido) => (p.expreso_id ? expresos.get(p.expreso_id) : undefined)
  const vivos = pedidos.filter((p) => p.estado !== 'cancelado')
  const tope = 15
  const lista = (titulo: string, ps: Pedido[], linea: (p: Pedido) => string) => {
    if (!ps.length) return ''
    const filas = ps.slice(0, tope).map((p) => `• ${linea(p)}`)
    if (ps.length > tope) filas.push(`• … y ${ps.length - tope} más`)
    return [`${titulo} (${ps.length})`, ...filas].join('\n')
  }
  const porAntiguedad = (a: Pedido, b: Pedido) => a.created_at.localeCompare(b.created_at)
  const salieron = vivos.filter((p) => p.fecha_despacho === hoy && (p.estado === 'despachado' || p.estado === 'entregado' || p.estado === 'incidencia'))
  const impresos = vivos.filter((p) => p.estado === 'impreso').sort(porAntiguedad)
  const sinImprimir = vivos.filter((p) => p.estado === 'cargado').sort(porAntiguedad)
  const frenados = vivos.filter((p) => p.estado === 'bloqueado').sort(porAntiguedad)
  const problemas = vivos.filter((p) => p.estado === 'incidencia')
  const sinGuia = salieron.filter((p) => !p.n_guia && !p.tiene_guia_archivo && exp(p)?.requiere_guia !== false)

  const bloques = [
    `📋 *Cierre de expedición — ${fechaLarga(hoy)}*`,
    salieron.length
      ? lista('✅ *Salieron hoy*', salieron, (p) => {
        const quien = quienDespacho(p)
        const desde = [quien, p.despacho_deposito].filter(Boolean).join(', ')
        return `${p.cliente} — ${exp(p)?.nombre ?? 'expreso'}${p.n_guia ? ` · ${guiaLegible(p.n_guia)}` : ''}${desde ? ` (${desde})` : ''}`
      })
      : '✅ Hoy no salió ningún pedido.',
    salieron.length && salieron.some((p) => p.despacho_deposito)
      ? `🏭 Por depósito: ${conteo(salieron.map((p) => p.despacho_deposito ?? 'sin depósito'))}`
      : '',
    salieron.length && salieron.some((p) => quienDespacho(p))
      ? `👷 Despacharon: ${conteo(salieron.map((p) => quienDespacho(p)))}`
      : '',
    salieron.length && resumenLead(salieron).promedio !== null
      ? `⏱️ Lead time (de impreso a despachado, horas de jornada): promedio ${duracion(resumenLead(salieron).promedio!)} · mediana ${duracion(resumenLead(salieron).mediana!)}`
      : '',
    lista('🖨️ *Impresos que quedan para mañana*', impresos, (p) => `${p.cliente} — ${exp(p)?.nombre ?? 'sin expreso'}`),
    lista('⏳ *Sin imprimir*', sinImprimir, (p) => `${p.cliente} (cargado ${fechaCorta(p.created_at)})`),
    lista('⛔ *Frenados*', frenados, (p) => `${p.cliente} — ${p.bloqueo_motivo ? MOTIVOS_BLOQUEO[p.bloqueo_motivo].label : 'frenado'}${p.stock_estimado ? ` (estimado ${fechaCorta(p.stock_estimado)})` : ''}`),
    lista('⚠️ *Con problema en el envío*', problemas, (p) => `${p.cliente} — ${p.incidencia_motivo ? MOTIVOS_INCIDENCIA[p.incidencia_motivo].label : 'incidencia'}`),
    sinGuia.length ? `📎 Salieron sin guía cargada: ${sinGuia.length}. Subila desde "Expedición hoy → Falta la guía".` : '',
    `Detalle: ${base}#/pedidos?vista=atencion`,
  ]
  return bloques.filter(Boolean).join('\n\n')
}

/** Dónde retira el cliente (Felipe, 25/11): dirección, horario y mapa de cada depósito. */
export const PUNTOS_RETIRO: Record<string, { direccion: string; mapa: string }> = {
  'villa dominico': { direccion: 'Magdalena 962, Villa Domínico', mapa: 'https://www.google.com/maps/search/?api=1&query=Magdalena+962+Villa+Dominico' },
  'mar del plata': { direccion: 'Depósito Mar del Plata', mapa: 'https://maps.app.goo.gl/p2wBAvncP8fCrzpU8' },
}
export const HORARIO_RETIRO = 'de lunes a viernes de 8 a 16 h'

function claveDeposito(d: string | null | undefined): string {
  return String(d ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim()
}

/** Líneas con dónde y cuándo retirar; vacío si el depósito no es uno conocido. */
export function lineasRetiro(deposito: string | null | undefined): string[] {
  const punto = PUNTOS_RETIRO[claveDeposito(deposito)]
  if (!punto) return [`Lo podés retirar ${HORARIO_RETIRO}.`]
  return [`📍 Retiro: *${punto.direccion}*`, `🕗 Horario: ${HORARIO_RETIRO}`, `Cómo llegar: ${punto.mapa}`]
}

/** Respuesta para el cliente según en qué está su pedido. */
export function mensajeCliente(p: Pedido, expreso: Expreso | undefined): string {
  const saludo = 'Hola! Te paso el estado de tu pedido'
  const ref = `(remito ${p.n_remito})`
  const seguimiento = linkSeguimiento(expreso, p.n_guia)
  switch (p.estado) {
    case 'cargado':
    case 'impreso':
      if (esRetiroDelCliente(expreso)) {
        return [`${saludo} ${ref}: ya está en preparación. Cuando esté listo lo podés pasar a retirar.`, ...lineasRetiro(p.deposito_salida)].join('\n')
      }
      return `${saludo} ${ref}: ya está en preparación en nuestro depósito. Apenas lo despachemos por ${expreso?.nombre ?? 'el expreso'} te paso el número de guía.`
    case 'bloqueado': {
      const motivo = p.bloqueo_motivo === 'sin_stock'
        ? `estamos esperando la reposición de stock${p.stock_estimado ? `, estimada para el ${fechaLarga(p.stock_estimado)}` : ''}`
        : p.bloqueo_motivo === 'falta_pago'
          ? 'queda pendiente la acreditación del pago para poder despacharlo'
          : p.bloqueo_motivo === 'datos_incompletos'
            ? 'necesitamos confirmar algunos datos de envío con vos'
            : (p.bloqueo_detalle || MOTIVOS_BLOQUEO.otro.label).toLowerCase()
      return `${saludo} ${ref}: ${motivo}. Te aviso apenas salga.`
    }
    case 'despachado':
      return [
        `${saludo} ${ref}: salió el ${fechaLarga(p.fecha_despacho)} por *${expreso?.nombre ?? 'expreso'}*.`,
        ...(() => {
          const g = partesGuia(p.n_guia)
          if (!g) return ['']
          return [g.guia ? `Número de guía: *${g.guia}*` : '', g.seguimiento ? `Número de seguimiento: *${g.seguimiento}*` : '']
        })(),
        p.bultos ? `Bultos: ${p.bultos}` : '',
        seguimiento
          ? guiaSeCopia(expreso) ? (p.n_guia ? `Podés seguirlo en ${seguimiento} con el ${partesGuia(p.n_guia)?.seguimiento ? 'número de seguimiento' : 'número de guía'}.` : '') : `Podés seguirlo acá: ${seguimiento}`
          : '',
        expreso?.dias_esperados ? `Tiempo estimado: ${expreso.dias_esperados} días hábiles.` : '',
      ].filter(Boolean).join('\n')
    case 'entregado':
      return `${saludo} ${ref}: figura entregado el ${fechaLarga(p.fecha_entrega)}. Cualquier cosa avisame!`
    case 'incidencia':
      return `${saludo} ${ref}: tuvimos un inconveniente con el envío (${(p.incidencia_motivo ? MOTIVOS_INCIDENCIA[p.incidencia_motivo].label : 'en el expreso').toLowerCase()}). Ya lo estamos resolviendo y te mantengo al tanto.`
    case 'cancelado':
      return `${saludo} ${ref}: quedó cancelado.`
  }
}

/** Resumen de una línea para listas y notificaciones. */
export function resumenEnvio(p: Pedido, expreso: Expreso | undefined): string {
  if (p.estado === 'despachado' || p.estado === 'entregado') {
    return `${expreso?.nombre ?? 'Expreso'} · ${fechaCorta(p.fecha_despacho)}${p.n_guia ? ` · ${guiaLegible(p.n_guia)}` : ''}`
  }
  return expreso?.nombre ?? 'Sin expreso'
}

/** Link de WhatsApp a un teléfono argentino (best effort: no corrige el "15" de celulares viejos). */
export function linkWhatsApp(telefono: string | null, texto: string): string {
  let d = (telefono ?? '').replace(/\D/g, '')
  if (d.startsWith('00')) d = d.slice(2)
  if (d && !d.startsWith('54')) d = `549${d.replace(/^0/, '')}`
  return `https://wa.me/${d}?text=${encodeURIComponent(texto)}`
}

/** El mismo mensaje sin el formato de WhatsApp (*negrita*), para el mail. */
export function textoPlano(texto: string): string {
  return texto.replace(/\*([^*\n]+)\*/g, '$1')
}

/** Asunto del mail al cliente según el estado. */
export function asuntoCliente(p: Pick<Pedido, 'n_remito' | 'estado'>): string {
  if (p.estado === 'despachado') return `Tu pedido salió · remito ${p.n_remito}`
  if (p.estado === 'entregado') return `Tu pedido fue entregado · remito ${p.n_remito}`
  return `Estado de tu pedido · remito ${p.n_remito}`
}

/** Link para abrir el mail con asunto y texto (el adjunto se agrega a mano o desde «Compartir»). */
export function linkMail(destino: string | null, asunto: string, texto: string): string {
  const to = (destino ?? '').trim()
  return `mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent(asunto)}&body=${encodeURIComponent(textoPlano(texto))}`
}
