// PARCHE CONTEO (25/11, Felipe): filtro por depósito de salida en Pedidos y Expedición («Todos · V. Domínico · Mar del Plata»).
// Se combina con el buscador y los demás filtros. Cada equipo recuerda lo último que eligió.
import { useState } from 'react'
import type { Pedido } from '../lib/types'
import { tonoDeposito } from './ui'

export type FiltroDep = '' | 'vd' | 'mdp'
const CLAVE = 'entregas-filtro-deposito'
const leer = (): FiltroDep => { try { const v = localStorage.getItem(CLAVE); return v === 'vd' || v === 'mdp' ? v : '' } catch { return '' } }

export function useFiltroDeposito(): [FiltroDep, (v: FiltroDep) => void, <T extends Pick<Pedido, 'deposito_salida'>>(l: T[]) => T[]] {
  const [valor, setValor] = useState<FiltroDep>(leer)
  const set = (v: FiltroDep) => { setValor(v); try { localStorage.setItem(CLAVE, v) } catch { /* sin storage */ } }
  const aplicar = <T extends Pick<Pedido, 'deposito_salida'>>(l: T[]) => (valor ? l.filter((p) => tonoDeposito(p.deposito_salida) === valor) : l)
  return [valor, set, aplicar]
}

export function FiltroDeposito({ valor, onChange }: { valor: FiltroDep; onChange: (v: FiltroDep) => void }) {
  const ops: [FiltroDep, string][] = [['', 'Todos los depósitos'], ['vd', 'V. Domínico'], ['mdp', 'Mar del Plata']]
  return (
    <div className="filtro-dep" role="group" aria-label="Depósito de salida">
      {ops.map(([v, t]) => (
        <button key={v || 'todos'} type="button" className={`chip${v ? ' dep-' + v : ''}${valor === v ? ' on' : ''}`} aria-pressed={valor === v} onClick={() => onChange(v)}>{t}</button>
      ))}
    </div>
  )
}
