// Quién está usando Logística dentro de Poliplast App: lo decide la app (usuario, «quién sos» de Expedición y depósito) y
// si es administrador de Logística (sesión firmada por la app: app-sesion → token que las funciones de la base aceptan como PIN).
// Las pantallas portadas de la app de conteo leen de acá en vez de su franja «quién sos» propia.
const KD = "poliplast-logistica-deposito";
const leer = (k) => { try { return localStorage.getItem(k) || ""; } catch { return ""; } };
const guardar = (k, v) => { try { if (v) localStorage.setItem(k, v); } catch { /* sin storage */ } };

const canonDep = (v) => (String(v || "").normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toLowerCase() === "villa dominico" ? "Villa Domínico" : v);

let actual = { persona: "", deposito: "", admin: null };
export function setIdentidad({ persona = "", deposito = "", admin = null } = {}) {
  actual = { persona: String(persona || ""), deposito: canonDep(deposito || leer(KD)), admin };
}
export const getPersona = () => actual.persona;
export const getDeposito = () => actual.deposito || canonDep(leer(KD));
export const setDeposito = (d) => { const v = canonDep(d); actual = { ...actual, deposito: v }; guardar(KD, v); };
/** {nombre, pin} para las funciones de administrador de la base (el «pin» es el token de la sesión de la app), o null. */
export const adminDeApp = () => actual.admin;
