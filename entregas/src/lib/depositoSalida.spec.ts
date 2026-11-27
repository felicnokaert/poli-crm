import { describe, expect, it } from 'vitest'
import { FALTA_DEPOSITO, faltaDeposito } from './depositoSalida'

describe('depósito de salida obligatorio', () => {
  it('sin depósito no deja guardar', () => {
    expect(faltaDeposito(null)).toBe(FALTA_DEPOSITO)
    expect(faltaDeposito(undefined)).toBe(FALTA_DEPOSITO)
    expect(faltaDeposito('   ')).toBe(FALTA_DEPOSITO)
  })
  it('con depósito (de la lista u «Otro» escrito) sí', () => {
    expect(faltaDeposito('Villa Domínico')).toBeNull()
    expect(faltaDeposito('Mar del Plata')).toBeNull()
    expect(faltaDeposito('MAGMA')).toBeNull()
  })
})
