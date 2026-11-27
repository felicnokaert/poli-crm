// Felipe 27/11: al cargar un remito es OBLIGATORIO elegir desde dónde sale (Villa Domínico, Mar del Plata u «Otro» escrito).
export const FALTA_DEPOSITO = 'Elegí desde dónde sale (Villa Domínico, Mar del Plata u Otro).'

export function faltaDeposito(valor: string | null | undefined): string | null {
  return valor && valor.trim() ? null : FALTA_DEPOSITO
}
