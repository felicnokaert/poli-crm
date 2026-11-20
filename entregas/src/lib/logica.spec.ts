import { candidatoGuia, elegirCodigo } from './leerGuia'
import { candidatosGuia, cuitsDelTexto, emparejarGuia } from './emparejarGuia'
import { duracion, leadTime, resumenLead } from './leadtime'
import { describe, expect, it } from 'vitest'
import { alertaDe, esRetiroDelCliente, faltantesDe, pasosRetiro, pelotaEn, puedeTransicionar, transicionesDisponibles } from './estados'
import { marcarRetirado } from './retiro'
import { diasHabilesEntre, horasHabilesEntre, sumarDiasHabiles } from './fechas'
import { aplicarFiltros, coincideTexto, FILTROS_DEFAULT, rangoDe } from './filtros'
import { guiaLegible, guiaSeCopia, linkSeguimiento, numeroSeguir, partesGuia, unirGuia, linkWhatsApp, mensajeCliente, mensajeGrupo, mensajeGrupoVarios, quienDespacho, resumenDelDia } from './mensajes'
import { contar } from './metricas'
import { adivinarExpreso, normalizarNumeroRemito, pareceGuiaDeExpreso, parseRemito } from './remitoParser'
import { CONFIG_DEFAULT, type Expreso, type Pedido } from './types'

const VIA: Expreso = { id: 'via', nombre: 'Via Cargo', tracking_url: 'https://track.example/{guia}', dias_esperados: 5, requiere_guia: true, activo: true, orden: 1 }
const RETIRA: Expreso = { id: 'ret', nombre: 'Retira el cliente', tracking_url: null, dias_esperados: 0, requiere_guia: false, activo: true, orden: 9 }

function pedido(extra: Partial<Pedido> = {}): Pedido {
  return {
    id: 'p1', codigo: 7, n_remito: '0006-00012345', fecha_remito: null, cliente: 'LACUS LATINA S.A.', cuit: null, direccion: 'Ruta 2 km 39',
    localidad: 'Berazategui', provincia: 'Buenos Aires', cp: '1884', telefono: '1132148987', contacto: null, nota: null, expreso_id: 'via',
    vendedor_id: 'v1', vendedor_email: 'juan@x', estado: 'cargado', estado_desde: '2026-11-09T12:00:00', impreso_at: null, bloqueo_motivo: null,
    bloqueo_detalle: null, stock_estimado: null, fecha_despacho: null, n_guia: null, bultos: null, fecha_entrega: null, incidencia_motivo: null,
    incidencia_detalle: null, items: [], remito_hash: null, created_at: '2026-11-09T12:00:00', updated_at: '2026-11-09T12:00:00',
    tiene_guia_archivo: false, tiene_comprobante: false, archivos: 1, ultima_actividad: null, ...extra,
  }
}

// Jueves 12/11/2026 a las 15 h
const JUEVES = new Date(2026, 10, 12, 15, 0, 0)

describe('transiciones por rol', () => {
  it('solo expedición (o admin) marca impreso', () => {
    expect(puedeTransicionar('cargado', 'impreso', 'expedicion', false)).toBe(true)
    expect(puedeTransicionar('cargado', 'impreso', 'vendedor', true)).toBe(false)
    expect(puedeTransicionar('cargado', 'impreso', 'admin', false)).toBe(true)
  })
  it('vendedor y expedición pueden despachar, entregar y frenar', () => {
    for (const rol of ['vendedor', 'expedicion'] as const) {
      expect(puedeTransicionar('impreso', 'despachado', rol, false)).toBe(true)
      expect(puedeTransicionar('despachado', 'entregado', rol, false)).toBe(true)
      expect(puedeTransicionar('cargado', 'bloqueado', rol, false)).toBe(true)
    }
  })
  it('no se puede saltar de cargado a entregado ni volver de entregado (salvo admin)', () => {
    expect(puedeTransicionar('cargado', 'entregado', 'expedicion', false)).toBe(false)
    expect(puedeTransicionar('entregado', 'despachado', 'vendedor', true)).toBe(false)
    expect(puedeTransicionar('entregado', 'despachado', 'admin', false)).toBe(true)
  })
  it('cancelar: solo el vendedor dueño (o admin)', () => {
    expect(puedeTransicionar('cargado', 'cancelado', 'vendedor', true)).toBe(true)
    expect(puedeTransicionar('cargado', 'cancelado', 'vendedor', false)).toBe(false)
    expect(puedeTransicionar('cargado', 'cancelado', 'expedicion', false)).toBe(false)
    expect(puedeTransicionar('despachado', 'cancelado', 'vendedor', true)).toBe(false)
  })
  it('lista las acciones disponibles', () => {
    expect(transicionesDisponibles(pedido({ estado: 'cargado' }), 'expedicion', 'e1')).toEqual(['impreso', 'bloqueado', 'despachado'])
    expect(transicionesDisponibles(pedido({ estado: 'cargado' }), 'vendedor', 'v1')).toEqual(['bloqueado', 'despachado', 'cancelado'])
  })
})

describe('de quién es la pelota', () => {
  it('según estado y motivo', () => {
    expect(pelotaEn(pedido({ estado: 'cargado' }))).toBe('expedicion')
    expect(pelotaEn(pedido({ estado: 'bloqueado', bloqueo_motivo: 'sin_stock' }))).toBe('expedicion')
    expect(pelotaEn(pedido({ estado: 'bloqueado', bloqueo_motivo: 'falta_pago' }))).toBe('vendedor')
    expect(pelotaEn(pedido({ estado: 'despachado' }))).toBe('expreso')
    expect(pelotaEn(pedido({ estado: 'incidencia', incidencia_motivo: 'direccion' }))).toBe('vendedor')
    expect(pelotaEn(pedido({ estado: 'entregado' }))).toBeNull()
  })
})

describe('días y horas hábiles', () => {
  it('no cuenta fines de semana', () => {
    // viernes 6/11 → lunes 9/11 = 1 día hábil
    expect(diasHabilesEntre(new Date(2026, 10, 6), new Date(2026, 10, 9))).toBe(1)
    expect(diasHabilesEntre(new Date(2026, 10, 9), new Date(2026, 10, 12))).toBe(3)
  })
  it('horas de jornada 8 a 16', () => {
    // viernes 15 h → lunes 10 h = 1 h (vie) + 2 h (lun)
    expect(horasHabilesEntre(new Date(2026, 10, 6, 15), new Date(2026, 10, 9, 10))).toBe(3)
  })
  it('suma días hábiles salteando el finde', () => {
    expect(sumarDiasHabiles(new Date(2026, 10, 12), 2).getDate()).toBe(16) // jue + 2 hábiles = lunes 16
  })
})

describe('alertas', () => {
  it('sin imprimir pasado el umbral de horas hábiles', () => {
    expect(alertaDe(pedido({ created_at: '2026-11-12T09:00:00' }), VIA, CONFIG_DEFAULT, JUEVES)?.tipo).toBe('sin_imprimir')
    expect(alertaDe(pedido({ created_at: '2026-11-12T13:00:00' }), VIA, CONFIG_DEFAULT, JUEVES)).toBeNull()
  })
  it('atrasado en el expreso cuando supera sus días esperados', () => {
    const p = pedido({ estado: 'despachado', fecha_despacho: '2026-11-03' })
    expect(alertaDe(p, VIA, CONFIG_DEFAULT, JUEVES)?.tipo).toBe('atrasado_expreso')
    expect(alertaDe(pedido({ estado: 'despachado', fecha_despacho: '2026-11-10' }), VIA, CONFIG_DEFAULT, JUEVES)).toBeNull()
  })
  it('stock con fecha estimada vencida', () => {
    const p = pedido({ estado: 'bloqueado', bloqueo_motivo: 'sin_stock', stock_estimado: '2026-11-10', estado_desde: '2026-11-11T10:00:00' })
    expect(alertaDe(p, VIA, CONFIG_DEFAULT, JUEVES)?.tipo).toBe('bloqueo_vencido')
  })
})

describe('faltantes', () => {
  it('despachado sin guía, salvo que el expreso no lleve guía', () => {
    expect(faltantesDe(pedido({ estado: 'despachado' }), VIA)).toEqual(['guia'])
    expect(faltantesDe(pedido({ estado: 'despachado', n_guia: '123' }), VIA)).toEqual([])
    expect(faltantesDe(pedido({ estado: 'despachado', tiene_guia_archivo: true }), VIA)).toEqual([])
    expect(faltantesDe(pedido({ estado: 'despachado' }), RETIRA)).toEqual([])
  })
  it('entregado: con la guía ya alcanza; sin guía pide el remito firmado', () => {
    expect(faltantesDe(pedido({ estado: 'entregado', n_guia: '1' }), VIA)).toEqual([])
    expect(faltantesDe(pedido({ estado: 'entregado', tiene_guia_archivo: true }), VIA)).toEqual([])
    expect(faltantesDe(pedido({ estado: 'entregado' }), RETIRA)).toEqual(['comprobante'])
    expect(faltantesDe(pedido({ estado: 'entregado', tiene_comprobante: true }), RETIRA)).toEqual([])
  })
})

describe('lector de remitos Contabilium', () => {
  const TEXTO = `
GRUPO POLIPLAST CUIT: 30-71234567-8
R
Remito
Nº: 0013-00005802
Fecha: 03/09/2026
Razón social: ESTEBAN JOSE SARTORI
Domicilio: PERITO MORENO 446 - CP 6450. Tel: 2396 15-445566
Ubicación: PEHUAJO, Buenos Aires CUIT: 20244088245
Condición de venta: Cuenta corriente Condición de IVA: Responsable Inscripto
2 PMRAC-V-521 PMRAC-V 521
1 IMP INTERNO IMPUESTO INTERNO
10 740T POLI-PLUS 740 IR
Cantidad total: 13
VPS: $ 60.272,71. Transporte: VIA CARGO
`
  it('saca número, cliente, dirección, localidad, teléfono e ítems', () => {
    const r = parseRemito(TEXTO)
    expect(r.esRemito).toBe(true)
    expect(r.n_remito).toBe('0013-00005802')
    expect(r.fecha_remito).toBe('2026-09-03')
    expect(r.cliente).toBe('ESTEBAN JOSE SARTORI')
    expect(r.direccion).toBe('PERITO MORENO 446')
    expect(r.cp).toBe('6450')
    expect(r.telefono).toBe('2396 15-445566')
    expect(r.localidad).toBe('PEHUAJO')
    expect(r.provincia).toBe('Buenos Aires')
    expect(r.cuit).toBe('20244088245')
    expect(r.transporte).toBe('VIA CARGO')
    expect(r.items).toEqual([
      { cantidad: 2, codigo: 'PMRAC-V-521', descripcion: 'PMRAC-V 521' },
      { cantidad: 10, codigo: '740T', descripcion: 'POLI-PLUS 740 IR' },
    ])
  })
  it('detecta que es una factura y no un remito', () => {
    const r = parseRemito('FACTURA\nNº: 0006-00011202\nRazón social: LACUS LATINA S.A.\nDomicilio: RUTA 2 KM. 39 0 - CP 1884. Tel: 1132148987')
    expect(r.esRemito).toBe(false)
    expect(r.tipoDetectado).toBe('Factura')
    expect(r.telefono).toBe('1132148987')
  })
  it('tolera un texto vacío (PDF escaneado)', () => {
    expect(parseRemito('').camposLeidos).toBe(0)
  })
  it('normaliza números escritos a mano', () => {
    expect(normalizarNumeroRemito('13-5802')).toBe('0013-00005802')
    expect(normalizarNumeroRemito('0006 00012345')).toBe('0006-00012345')
  })
  it('reconoce el expreso del campo Transporte', () => {
    expect(adivinarExpreso('VIA CARGO S.A.', [VIA, RETIRA])?.id).toBe('via')
    expect(adivinarExpreso('Andreani', [VIA, RETIRA])).toBeNull()
  })
  it('«retira en depósito» y parecidos van a «Retira el cliente»', () => {
    for (const t of ['RETIRA EN DEPOSITO', 'Retiro en planta', 'Lo busca el cliente', 'Retira en depósito Villa Domínico']) {
      expect(adivinarExpreso(t, [VIA, RETIRA])?.id).toBe(RETIRA.id)
    }
    expect(adivinarExpreso('VIA CARGO - retira en sucursal', [VIA, RETIRA])?.id).toBe('via')
  })
  it('reconoce una guía del expreso cargada por error como remito (Mainero, Credifin)', () => {
    const guia = 'SPEED BUSINESS S.A. | GUÍA DE TRANSPORTE | FECHA: 13/11/2026 | Remitente | POLIURETANO Y PLASTICO PROYECTADO S.R.L. | '
      + 'Destinatario | MAINERO LUCAS FABIAN | GUIA: 4120-00002980 | Comprobante: FC A-4120-00002161 | Remito/s Nro: 0006-00006361 | Seguimiento: COZ07Z'
    expect(pareceGuiaDeExpreso(guia)).toBe(true)
    expect(pareceGuiaDeExpreso('CONSTANCIA DE ENVÍO | Remitente: X | Destinatario: Y')).toBe(true)
    expect(pareceGuiaDeExpreso('Remitente: Poliplast | Destinatario: Juan Pérez | Guía N°: 123456789')).toBe(true)
    expect(pareceGuiaDeExpreso(TEXTO)).toBe(false)
    expect(pareceGuiaDeExpreso('')).toBe(false)
  })
})

describe('mensajes', () => {
  it('mensaje al grupo con link al pedido', () => {
    const m = mensajeGrupo(pedido(), VIA, 'Juan', 'https://app/#/p/7')
    expect(m).toContain('Remito 0006-00012345')
    expect(m).toContain('Via Cargo')
    expect(m).toContain('https://app/#/p/7')
  })
  it('el mensaje al grupo dice desde dónde sale, solo si se indicó', () => {
    expect(mensajeGrupo(pedido({ deposito_salida: 'Mar del Plata' }), VIA, null, 'x')).toContain('Sale de: *Mar del Plata*')
    expect(mensajeGrupo(pedido(), VIA, null, 'x')).not.toContain('Sale de')
  })
  it('respuesta al cliente con guía y link de seguimiento', () => {
    const m = mensajeCliente(pedido({ estado: 'despachado', fecha_despacho: '2026-11-12', n_guia: 'AB 12' }), VIA)
    expect(m).toContain('AB 12')
    expect(m).toContain('https://track.example/AB%2012')
  })
  it('sin stock con fecha estimada', () => {
    expect(mensajeCliente(pedido({ estado: 'bloqueado', bloqueo_motivo: 'sin_stock', stock_estimado: '2026-11-20' }), VIA)).toMatch(/reposición de stock, estimada para el vie 20 nov/)
  })
  it('link de seguimiento sin guía no se arma si la URL la necesita', () => {
    expect(linkSeguimiento(VIA, null)).toBeNull()
    expect(linkSeguimiento({ ...VIA, tracking_url: 'https://x/seguimiento' }, null)).toBe('https://x/seguimiento')
  })
  it('expreso cuya página no recibe la guía: el mensaje pide usar el número', () => {
    const via = { ...VIA, tracking_url: 'https://viacargo.com.ar/seguimiento-de-envio/' }
    expect(guiaSeCopia(via)).toBe(true)
    expect(guiaSeCopia(VIA)).toBe(false)
    const m = mensajeCliente(pedido({ estado: 'despachado', fecha_despacho: '2026-11-12', n_guia: '999' }), via)
    expect(m).toContain('Podés seguirlo en https://viacargo.com.ar/seguimiento-de-envio/ con el número de guía')
  })
  it('varios remitos: un solo mensaje para el grupo, sin repetir el vendedor', () => {
    const m = mensajeGrupoVarios([pedido({ codigo: 1 }), pedido({ id: 'z', codigo: 2, n_remito: '0006-00000002' })], new Map([[VIA.id, VIA]]), 'Brenda')
    expect(m).toMatch(/^🗂️ \*2 remitos nuevos\* — 👤 Brenda/)
    expect(m.match(/👤/g)).toHaveLength(1)
    expect(m).toContain('#/p/2')
  })
  it('WhatsApp con prefijo argentino', () => {
    expect(linkWhatsApp('011 4444-5555', 'hola')).toBe('https://wa.me/5491144445555?text=hola')
    expect(linkWhatsApp('+54 9 341 555 1234', 'x')).toContain('wa.me/5493415551234')
  })
})

describe('filtros e indicadores', () => {
  const lista = [
    pedido({ id: 'a', estado: 'cargado' }),
    pedido({ id: 'b', estado: 'entregado', n_remito: '0006-00099999', cliente: 'OTRO', fecha_despacho: '2026-11-02', fecha_entrega: '2026-11-05', vendedor_id: 'v2' }),
    pedido({ id: 'c', estado: 'despachado', fecha_despacho: '2026-11-12', n_guia: 'G-77' }),
  ]
  const mapa = new Map([[VIA.id, VIA]])
  it('vista "en curso" excluye cerrados', () => {
    expect(aplicarFiltros(lista, FILTROS_DEFAULT, mapa, CONFIG_DEFAULT, JUEVES).map((p) => p.id)).toEqual(['a', 'c'])
  })
  it('busca por número de remito parcial y por guía', () => {
    expect(coincideTexto(lista[1], '99999')).toBe(true)
    expect(coincideTexto(lista[2], 'g-77')).toBe(true)
    expect(coincideTexto(lista[0], 'berazategui lacus')).toBe(true)
  })
  it('filtra por período según fecha de entrega', () => {
    const f = { ...FILTROS_DEFAULT, vista: 'todos' as const, periodo: 'semana' as const, campoFecha: 'entrega' as const }
    expect(aplicarFiltros(lista, f, mapa, CONFIG_DEFAULT, new Date(2026, 10, 5)).map((p) => p.id)).toEqual(['b'])
  })
  it('rango de mes', () => {
    expect(rangoDe('mes', JUEVES)).toEqual(['2026-11-01', '2026-11-30'])
  })
  it('cuenta para el inicio', () => {
    const c = contar(lista, mapa, CONFIG_DEFAULT, JUEVES)
    expect(c.sinImprimir).toBe(1)
    expect(c.enTransito).toBe(1)
    expect(c.despachadosHoy).toBe(1)
    expect(c.entregadosMes).toBe(1)
    expect(c.sinComprobante).toBe(1)
  })
  it('"Salieron hoy" no cuenta los que volvieron a la cola', () => {
    const vuelto = pedido({ id: 'd', estado: 'impreso', fecha_despacho: '2026-11-12' })
    expect(contar([...lista, vuelto], mapa, CONFIG_DEFAULT, JUEVES).despachadosHoy).toBe(1)
  })
})

describe('cierre del día', () => {
  it('lista lo que salió hoy y lo pendiente', () => {
    const hoy = new Date(2026, 10, 12, 16)
    const ps = [
      pedido({ id: 's', cliente: 'SALIO SA', estado: 'despachado', fecha_despacho: '2026-11-12', n_guia: '7001' }),
      pedido({ id: 'i', cliente: 'IMPRESO SRL', estado: 'impreso' }),
      pedido({ id: 'b', cliente: 'FRENADO', estado: 'bloqueado', bloqueo_motivo: 'sin_stock', stock_estimado: '2026-11-20' }),
      pedido({ id: 'x', cliente: 'CANCELADO', estado: 'cancelado' }),
    ]
    const m = resumenDelDia(ps, new Map([[VIA.id, VIA]]), hoy, 'https://app/')
    expect(m).toContain('Cierre de expedición — jue 12 nov')
    expect(m).toContain('SALIO SA — Via Cargo · guía 7001')
    expect(m).toContain('Impresos que quedan para mañana* (1)')
    expect(m).toContain('FRENADO — Sin stock (estimado 20/11)')
    expect(m).not.toContain('CANCELADO')
    expect(m).toContain('https://app/#/pedidos?vista=atencion')
  })
})

describe('número de guía en la foto', () => {
  it('Credifin: guarda seguimiento y N° de guía; si falta uno, el otro solo', () => {
    expect(candidatoGuia('GUIA: 4120-00002980\nComprobante: FC A-4120-00002161\nRemito/s Nro: 0006-00006361\nSeguimiento: COZ07Z'))
      .toBe('COZ07Z / 4120-00002980')
    expect(candidatoGuia('Remito/s Nro: 0006-00006361\nSeguimiento: COZ07Z')).toBe('COZ07Z')
  })
  it('N° de guía y N° de seguimiento: los dos, uno solo o ninguno', () => {
    expect(partesGuia('COZ07Z / 4120-00002980')).toEqual({ guia: '4120-00002980', seguimiento: 'COZ07Z' })
    expect(partesGuia('999012345678')).toEqual({ guia: '999012345678', seguimiento: null })
    expect(partesGuia('COZ07Z')).toEqual({ guia: null, seguimiento: 'COZ07Z' })
    expect(partesGuia('123456 /')).toEqual({ guia: null, seguimiento: '123456' })
    expect(partesGuia(null)).toBeNull()
    expect(numeroSeguir('COZ07Z / 4120-00002980')).toBe('COZ07Z')
    expect(numeroSeguir('999012345678')).toBe('999012345678')
    expect(guiaLegible('COZ07Z / 4120-00002980')).toBe('guía 4120-00002980 · seguimiento COZ07Z')
    expect(guiaLegible('999012345678')).toBe('guía 999012345678')
    expect(guiaLegible('COZ07Z')).toBe('seguimiento COZ07Z')
    expect(unirGuia('COZ07Z', '4120-00002980')).toBe('COZ07Z / 4120-00002980')
    expect(unirGuia('', '4120-00002980')).toBe('4120-00002980')
    expect(unirGuia('COZ07Z', '')).toBe('COZ07Z')
    expect(unirGuia('123456', '')).toBe('123456 /')
    expect(unirGuia('', '')).toBe('')
    // Ida y vuelta: lo que se guarda se vuelve a leer igual
    for (const [s, g] of [['COZ07Z', '4120-00002980'], ['', '777'], ['123456', ''], ['AB1', '']]) {
      const p = partesGuia(unirGuia(s, g))
      expect([p?.seguimiento ?? '', p?.guia ?? '']).toEqual([s, g])
    }
  })
  it('toma el número que sigue a "Guía"', () => {
    expect(candidatoGuia('VIA CARGO\nGuía N°: 9990 1234 5678\nCUIT 30711122233')).toBe('999012345678')
    expect(candidatoGuia('Nro de guia 000123456789 Bultos 3')).toBe('000123456789')
  })
  it('sin etiqueta: la secuencia más larga que no sea CUIT ni teléfono', () => {
    expect(candidatoGuia('CUIT 30711122233 Tel 1155550000 Envío 4501234567890 fecha 12/11/2026')).toBe('4501234567890')
    expect(candidatoGuia('CUIT 30711122233')).toBeNull()
  })
  it('del código de barras prefiere el valor numérico más largo', () => {
    expect(elegirCodigo(['ABC', '999012345678', 'https://x'])).toBe('999012345678')
  })
})

describe('impresión en tanda', () => {
  it('arma una hoja por página, en orden, sin salto después de la última', async () => {
    const { htmlImpresion } = await import('./impresion')
    const html = htmlImpresion(['data:image/jpeg;base64,AAA', 'https://x.example/b.jpg'])
    expect(html.match(/<img/g)).toHaveLength(2)
    expect(html.indexOf('AAA')).toBeLessThan(html.indexOf('b.jpg'))
    expect(html).toContain('img:last-child')
  })
})

describe('transportes con página de seguimiento sin número en el link (OCA, Correo Argentino)', () => {
  const OCA: Expreso = { id: 'oca', nombre: 'OCA', tracking_url: 'https://www.oca.com.ar/Busquedas/Envios', dias_esperados: 5, requiere_guia: true, activo: true, orden: 4 }
  it('abre la página y copia la guía para pegarla', () => {
    expect(linkSeguimiento(OCA, '123')).toBe('https://www.oca.com.ar/Busquedas/Envios')
    expect(guiaSeCopia(OCA)).toBe(true)
  })
})

describe('quién despachó y desde qué depósito', () => {
  it('el cierre del día dice quién despachó, desde dónde, y los totales', () => {
    const hoy = new Date('2026-11-20T15:00:00-03:00')
    const ps = [
      pedido({ id: 'a', cliente: 'UNO', estado: 'despachado', fecha_despacho: '2026-11-20', expreso_id: VIA.id, despacho_operador: 'Marcos', despacho_deposito: 'Villa Domínico' }),
      pedido({ id: 'b', cliente: 'DOS', estado: 'despachado', fecha_despacho: '2026-11-20', expreso_id: VIA.id, despacho_operador: 'Neyen', despacho_deposito: 'Mar del Plata' }),
      pedido({ id: 'c', cliente: 'TRES', estado: 'despachado', fecha_despacho: '2026-11-20', expreso_id: VIA.id, despacho_operador: 'Marcos', despacho_deposito: 'Villa Domínico' }),
    ]
    const m = resumenDelDia(ps, new Map([[VIA.id, VIA]]), hoy, 'https://app/')
    expect(m).toContain('UNO — Via Cargo (Marcos, Villa Domínico)')
    expect(m).toContain('Por depósito: Villa Domínico 2 · Mar del Plata 1')
    expect(m).toContain('Despacharon: Marcos 2 · Neyen 1')
  })
  it('si lo despachó una cuenta personal, usa el nombre del mail', () => {
    expect(quienDespacho({ despacho_operador: null, despacho_email: 'diegoraul@grupopoliplast.com.ar' })).toBe('Diegoraul')
  })
})

describe('emparejar una guía con su pedido', () => {
  const A = pedido({ id: 'a', cliente: 'PINTURERIA CENTRO S.R.L.', cuit: '30-71234567-9', telefono: '351 422-1100', direccion: 'Av. Colón 1234', estado: 'despachado' })
  const B = pedido({ id: 'b', cliente: 'IMPERMEABILIZACIONES NORTE', cuit: null, telefono: '387 444-2211', direccion: 'Belgrano 55', estado: 'despachado' })
  const C = pedido({ id: 'c', cliente: 'Constructora del Sur SRL', cuit: null, telefono: null, direccion: 'San Martín 900', estado: 'impreso' })
  const D = pedido({ id: 'd', cliente: 'FERRETERIA LOS ANDES', cuit: null, telefono: null, direccion: 'Mitre 450', estado: 'despachado' })
  const todos = [A, B, C, D]
  // Texto típico de una guía: remitente Poliplast con su CUIT y teléfono, y el destinatario.
  const remitente = 'REMITENTE: POLIPLAST SRL CUIT 30-70000000-1 Tel 11 4200-0000 GUIA N° 0123-45678901 '

  it('lee CUIT con y sin guiones', () => {
    expect([...cuitsDelTexto('CUIT: 30-71234567-9 y 20123456786')]).toEqual(['30712345679', '20123456786'])
  })
  it('primero por CUIT, aunque también coincida el nombre de otro', () => {
    const r = emparejarGuia(remitente + 'DESTINATARIO: FERRETERIA LOS ANDES CUIT 30712345679', todos)
    expect(r?.por).toBe('cuit')
    expect(r?.pedidos.map((p) => p.id)).toEqual(['a'])
  })
  it('sin CUIT, por teléfono (escrito de otra forma)', () => {
    const r = emparejarGuia(remitente + 'DEST: Juan Perez - Tel: (0387) 15-444-2211', todos)
    expect(r?.por).toBe('telefono')
    expect(r?.pedidos[0].id).toBe('b')
  })
  it('sin CUIT ni teléfono, por razón social (sin S.R.L., mayúsculas ni tildes)', () => {
    const r = emparejarGuia(remitente + 'Destinatario: CONSTRUCTORA DEL SUR S.R.L. Rosario', todos)
    expect(r?.por).toBe('razon')
    expect(r?.pedidos[0].id).toBe('c')
  })
  it('por último, por dirección (calle y número)', () => {
    const r = emparejarGuia(remitente + 'Entregar en MITRE 450 - Mendoza', todos)
    expect(r?.por).toBe('direccion')
    expect(r?.pedidos[0].id).toBe('d')
  })
  it('el mismo cliente con dos pedidos: propone los dos, primero el que ya salió', () => {
    const A2 = { ...A, id: 'a2', estado: 'impreso' as const }
    const r = emparejarGuia('CUIT 30-71234567-9', [A2, A])
    expect(r?.pedidos.map((p) => p.id)).toEqual(['a', 'a2'])
  })
  it('primero por N° de remito (las guías de Credifin lo traen), aunque el nombre esté al revés', () => {
    const texto = 'GUIA: 4120-00009999\nRemito/s Nro: 0006-00012777\nDestinatario\n270914 SARTORI ESTEBAN JOSE\nSeguimiento: ABX12Z'
    const r = emparejarGuia(texto, [pedido({ id: 'r', n_remito: '0006-00012777', cliente: 'ESTEBAN SARTORI', cuit: null, telefono: null }), A])
    expect(r?.por).toBe('remito')
    expect(r?.pedidos.map((p) => p.id)).toEqual(['r'])
    expect(candidatoGuia(texto)).toBe('ABX12Z / 4120-00009999')
  })
  it('si el pedido tiene DNI, lo encuentra dentro del CUIT de la guía', () => {
    const r = emparejarGuia('DNI/CUIT: 20371718339', [pedido({ id: 'dni', cuit: '37171833', telefono: null }), A])
    expect(r?.por).toBe('cuit')
    expect(r?.pedidos.map((p) => p.id)).toEqual(['dni'])
  })
  it('la razón social tiene que estar en un mismo renglón (no palabras sueltas)', () => {
    const r = emparejarGuia('CLIENTE\nMAINERO LUCAS FABIAN\n... renunciando a otro fuero', [pedido({ id: 'o', cliente: 'OTRO CLIENTE', telefono: null }), pedido({ id: 'l', cliente: 'LUCAS MAINERO', telefono: null })])
    expect(r?.pedidos.map((p) => p.id)).toEqual(['l'])
  })
  it('si no coincide nada no inventa', () => {
    expect(emparejarGuia(remitente + 'DEST: OTRO CLIENTE Calle Falsa 123', todos)).toBeNull()
  })
  it('solo propone pedidos sin guía y no cancelados', () => {
    const conGuia = pedido({ id: 'g', n_guia: '999' })
    const cancelado = pedido({ id: 'x', estado: 'cancelado' })
    expect(candidatosGuia([A, conGuia, cancelado]).map((p) => p.id)).toEqual(['a'])
  })
})

describe('lead time (impreso → despachado, horas de jornada)', () => {
  it('mide solo las horas de jornada: impreso el viernes 15 h, salió el lunes 9 h = 2 h', () => {
    const p = pedido({ estado: 'despachado', impreso_at: new Date(2026, 10, 13, 15, 0).toISOString(), estado_desde: new Date(2026, 10, 16, 9, 0).toISOString() })
    expect(leadTime(p)).toMatchObject({ horas: 2, corriendo: false, tono: 'ok' })
  })
  it('usa la fecha del despacho aunque ya esté entregado', () => {
    const p = pedido({ estado: 'entregado', impreso_at: new Date(2026, 10, 12, 8, 0).toISOString(), despacho_at: new Date(2026, 10, 12, 14, 30).toISOString() })
    expect(leadTime(p)).toMatchObject({ horas: 6.5, tono: 'alerta' })
  })
  it('impreso y sin salir: el reloj corre', () => {
    const p = pedido({ estado: 'impreso', impreso_at: new Date(2026, 10, 12, 8, 0).toISOString() })
    expect(leadTime(p, JUEVES)).toMatchObject({ horas: 7, corriendo: true })
  })
  it('sin imprimir no hay lead time', () => {
    expect(leadTime(pedido({ estado: 'cargado' }))).toBeNull()
  })
  it('formato y promedio', () => {
    expect(duracion(0.75)).toBe('45 min')
    expect(duracion(2.5)).toBe('2 h 30 min')
    expect(duracion(12)).toBe('12 h')
    const a = pedido({ estado: 'despachado', impreso_at: new Date(2026, 10, 12, 8, 0).toISOString(), estado_desde: new Date(2026, 10, 12, 9, 0).toISOString() })
    const b = pedido({ estado: 'despachado', impreso_at: new Date(2026, 10, 12, 8, 0).toISOString(), estado_desde: new Date(2026, 10, 12, 11, 0).toISOString() })
    expect(resumenLead([a, b])).toEqual({ cantidad: 2, promedio: 2, mediana: 2 })
  })
})

describe('«Lo retiró» (retira el cliente)', () => {
  it('solo para «Retira el cliente» y antes de entregado', () => {
    expect(esRetiroDelCliente(RETIRA)).toBe(true)
    expect(esRetiroDelCliente(VIA)).toBe(false)
    expect(pasosRetiro(pedido({ estado: 'impreso' }), RETIRA, 'expedicion', 'x')).toEqual(['despachado', 'entregado'])
    expect(pasosRetiro(pedido({ estado: 'cargado' }), RETIRA, 'vendedor', 'x')).toEqual(['despachado', 'entregado'])
    expect(pasosRetiro(pedido({ estado: 'despachado' }), RETIRA, 'expedicion', 'x')).toEqual(['entregado'])
    expect(pasosRetiro(pedido({ estado: 'impreso' }), VIA, 'expedicion', 'x')).toEqual([])
    expect(pasosRetiro(pedido({ estado: 'entregado' }), RETIRA, 'expedicion', 'x')).toEqual([])
    expect(pasosRetiro(pedido({ estado: 'bloqueado' }), RETIRA, 'expedicion', 'x')).toEqual([])
  })
  it('deja despachado y entregado con la fecha de hoy', async () => {
    const llamadas: unknown[][] = []
    await marcarRetirado({ cambiarEstado: async (...a: unknown[]) => { llamadas.push(a) } }, { id: 'p1' }, ['despachado', 'entregado'], '2026-11-20')
    expect(llamadas).toEqual([
      ['p1', 'despachado', { fecha_despacho: '2026-11-20' }, 'Lo retiró el cliente'],
      ['p1', 'entregado', { fecha_entrega: '2026-11-20' }, 'Lo retiró el cliente'],
    ])
  })
})
