import { useEffect, useState } from "react";
import { accessAllows } from "../team-access.mjs";
import { conteoDb } from "./conteo-db.js";
import Dosificado from "./Dosificado.jsx";
import Conteo from "./Conteo.jsx";
import Etiquetas from "./Etiquetas.jsx";
import "./theme-dark.css";

// Logística nativa (28/11): las pantallas de la app de conteo, ya dentro de Poliplast App (sin iframes). Acá se resuelve lo
// que antes hacía el marco: quién sos y depósito (de la app) y si es administrador de Logística: la app firma
// (getFirma → action app-firma) y la base de conteo lo canjea por una sesión (función app-sesion), cuyo token sirve como PIN
// en las funciones de administrador. Sin sesión o sin firma, la pantalla anda igual, sin las opciones de administrador.
export function useAdminLogistica(getFirma, persona, deposito) {
  const [admin, setAdmin] = useState(null);
  useEffect(() => {
    if (!getFirma) { setAdmin(null); return undefined; }
    let vivo = true;
    (async () => {
      try {
        const firma = await getFirma({ persona, deposito });
        if (!firma) return;
        const { data } = await conteoDb().functions.invoke("app-sesion", { body: { firma } });
        if (vivo && data?.ok && data.admin && data.token) setAdmin({ nombre: data.persona || persona, pin: data.token });
      } catch { /* sin admin: la pantalla sigue igual */ }
    })();
    return () => { vivo = false; };
  }, [getFirma, persona, deposito]);
  return admin;
}

const DOSIF_TABS = { cargar: "Cargar", kits: "Kits", registros: "Registros", resumen: "Resumen" };

export function DosificadoNativo({ access = null, who = null, me = "", getFirma = null }) {
  const persona = who?.who || me || "";
  const deposito = who?.deposit || "";
  const admin = useAdminLogistica(getFirma, persona, deposito);
  const tabs = Object.keys(DOSIF_TABS).filter((id) => !access || accessAllows(access, "dosificado", DOSIF_TABS[id]));
  return <Dosificado persona={persona} deposito={deposito} admin={admin} tabs={tabs} />;
}

export function ConteoNativo({ access = null, who = null, me = "", getFirma = null }) {
  const persona = who?.who || me || "";
  const deposito = who?.deposit || "";
  const admin = useAdminLogistica(getFirma, persona, deposito);
  const puedeAdmin = !access || accessAllows(access, "conteo", "Administración");
  return <Conteo persona={persona} deposito={deposito} admin={puedeAdmin ? admin : null} />;
}

const ETQ_TABS = { escanear: "Escanear", pendientes: "Pendientes", historial: "Hecho", devoluciones: "Devoluciones", cortes: "Cortes" };

// 28/11 (Felipe): «Mails enviados a Diego» solo en la sesión de Diego (los últimos 10).
const MAIL_DIEGO = "diegoraul@grupopoliplast.com.ar";

export function EtiquetasNativa({ access = null, who = null, me = "", getFirma = null, email = "" }) {
  const persona = who?.who || me || "";
  const deposito = who?.deposit || "";
  const admin = useAdminLogistica(getFirma, persona, deposito);
  const tabs = Object.keys(ETQ_TABS).filter((id) => !access || accessAllows(access, "etiquetas", ETQ_TABS[id]));
  // «Productividad del equipo»: permiso aparte que arranca apagado (OPT_IN); solo quien lo tiene tildado.
  const productividad = access ? accessAllows(access, "etiquetas", "Productividad del equipo") : false;
  const verMails = String(email || "").trim().toLowerCase() === MAIL_DIEGO;
  return <Etiquetas persona={persona} deposito={deposito} admin={admin} productividad={productividad} tabs={tabs} verMails={verMails} />;
}
