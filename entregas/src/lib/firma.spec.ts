import { describe, expect, it } from 'vitest'
import { dniLegible, dniValido, firmaSuficiente, lineasConstancia, nombreArchivoFirma, nombreValido } from './firma'
import { asuntoCliente, linkMail, textoPlano } from './mensajes'

describe('firma digital del remito', () => {
  it('valida DNI y nombre', () => {
    expect(dniValido('27.421.977')).toBe('27421977')
    expect(dniValido('1234567')).toBe('1234567')
    expect(dniValido('12')).toBeNull()
    expect(dniValido('20274219778')).toBeNull()
    expect(dniLegible('27421977')).toBe('27.421.977')
    expect(nombreValido('  juan   pérez ')).toBe('juan pérez')
    expect(nombreValido('Juan')).toBeNull()
    expect(firmaSuficiente(3)).toBe(false)
    expect(firmaSuficiente(40)).toBe(true)
  })
  it('arma la constancia con remito, productos, aclaración, DNI y quién entregó', () => {
    const c = lineasConstancia({
      pedido: { n_remito: '0006-00006361', cliente: 'Aislaciones SRL', cuit: '20-27421977-8', codigo: 12, items: [{ cantidad: 2, codigo: 'RE-608-1', descripcion: 'Resina epoxi 1 kg' }] },
      nombre: 'Juan Pérez', dni: '27421977', entrego: 'Marcos', deposito: 'Villa Domínico', momento: new Date('2026-11-21T15:30:00Z'), modo: 'retiro',
    })
    expect(c.titulo).toBe('Constancia de retiro')
    expect(c.lineas.join('\n')).toContain('0006-00006361')
    expect(c.lineas.join('\n')).toContain('12:30')
    expect(c.items[0]).toBe('2 × RE-608-1 · Resina epoxi 1 kg')
    expect(c.pie).toContain('DNI: 27.421.977')
    expect(c.pie).toContain('Entregó: Marcos · Villa Domínico')
    expect(nombreArchivoFirma('0006-00006361')).toBe('remito-firmado-0006-00006361.jpg')
  })
  it('mail al cliente sin el formato de WhatsApp', () => {
    expect(textoPlano('Número de guía: *4120*')).toBe('Número de guía: 4120')
    expect(asuntoCliente({ n_remito: '0006-1', estado: 'despachado' })).toBe('Tu pedido salió · remito 0006-1')
    const link = linkMail(null, 'Hola', 'guía *1*')
    expect(link.startsWith('mailto:?subject=Hola&body=')).toBe(true)
    expect(decodeURIComponent(link)).toContain('guía 1')
  })
})
