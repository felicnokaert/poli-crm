import { describe, expect, it } from 'vitest'
import { camaraPendiente, limpiarCamara, marcarCamara } from './camaraPendiente'

describe('cámara pendiente', () => {
  it('recuerda el pedido mientras la cámara está abierta y vence a los 10 minutos', () => {
    marcarCamara(41, 'remito_firmado')
    expect(camaraPendiente()?.codigo).toBe(41)
    expect(camaraPendiente(Date.now() + 11 * 60 * 1000)).toBeNull()
    marcarCamara(41, 'remito_firmado')
    limpiarCamara()
    expect(camaraPendiente()).toBeNull()
  })
})
