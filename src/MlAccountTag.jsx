import { accountTone } from "./ml-board.mjs";

// Nombre de una cuenta de Mercado Libre con su color (POLIPLAST rojo, FOAMFACTORY azul, COMARG ámbar).
export function AccountTag({ name, className = "" }) {
  const label = String(name || "cuenta");
  return <span className={`acct-tag acct-${accountTone(label)} ${className}`.trim()}><i aria-hidden="true" />{label}</span>;
}
