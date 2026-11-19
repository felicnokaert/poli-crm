import { Building2, Calculator, ChevronRight, Menu, X, ClipboardList, Database, FileCheck2, GraduationCap, Inbox, LayoutDashboard, ListChecks, MapPin, MessageCircle, ReceiptText, Search, ShoppingBag, Store, UserCog } from "lucide-react";
import { useEffect, useState } from "react";
import { onlineConfigured } from "./online";
import { filterNav } from "./module-access.mjs";

// Menú lateral: 6 grupos (Hoy, Ventas, Canales online, Cartera, Aprender, Más). Salió de App.jsx (QA 16/10).
export const NAV_GROUPS = [
  ["Hoy", [
    ["dashboard", "Inicio", LayoutDashboard],
    ["inbox", "Por revisar", Inbox],
    ["tasks", "Tareas", ClipboardList],
  ]],
  ["Ventas", [
    ["sales", "Ventas", ReceiptText],
    ["quoter", "Cotizador", Calculator],
    ["prospecting", "Prospección", Search],
    ["conversations", "Historial", MessageCircle],
  ]],
  ["Canales online", [
    ["mejoras", "Centro de mejoras", ListChecks],
    ["mercadolibre", "Mercado Libre", Store],
    ["shopify", "Shopify", ShoppingBag],
  ]],
  ["Cartera", [
    ["clients", "Empresas y contactos", Building2],
    ["map", "Mapa", MapPin],
  ]],
  ["Aprender", [
    ["academy", "Academia comercial", GraduationCap],
    ["techdocs", "Base técnica", FileCheck2],
  ]],
  ["Más", [
    ["profile", "Perfil", UserCog],
    ["settings", "Datos", Database],
  ]],
];

export const NAV_ITEMS = NAV_GROUPS.flatMap(([, items]) => items);

// Atajos de la barra inferior del celular (con nombre, no solo ícono). Lo demás está en "Menú".
const QUICK_IDS = ["dashboard", "tasks", "sales", "clients"];

export function AppSidebar({ view, onSelect, collapsedNavGroups, setCollapsedNavGroups, narrowScreen, overdueTaskCount, inboxSignalCount, email = "", denied = null }) {
  const groups = filterNav(NAV_GROUPS, email, denied);
  const [sheet, setSheet] = useState(false);
  const allowed = groups.flatMap(([, items]) => items);
  const quick = QUICK_IDS.map((id) => allowed.find(([itemId]) => itemId === id)).filter(Boolean);
  const current = allowed.find(([id]) => id === view)?.[1] || "Menú";
  const badgeFor = (id) => (id === "tasks" ? overdueTaskCount : id === "inbox" ? inboxSignalCount : 0);
  const pick = (id) => { setSheet(false); onSelect(id); };
  useEffect(() => {
    if (!sheet) return undefined;
    const onKey = (event) => { if (event.key === "Escape") setSheet(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [sheet]);
  // Al entrar a una pantalla se abre su sección; después se puede cerrar igual (23/10, Felipe: "Canales online
  // no deja minimizarlo": antes la sección donde estabas parado quedaba siempre abierta y el botón no hacía nada).
  useEffect(() => {
    const group = NAV_GROUPS.find(([, items]) => items.some(([id]) => id === view))?.[0];
    if (group) setCollapsedNavGroups((current) => (current.includes(group) ? current.filter((item) => item !== group) : current));
  }, [view, setCollapsedNavGroups]);
  return (
  <aside className="sidebar">
    <div className="brand">
      <img
        className="brand-logo"
        src="/poliplast-logo.png"
        alt="Grupo Poliplast"
      />
      <button type="button" className="mobile-menu-button" onClick={() => setSheet(true)} aria-haspopup="dialog" aria-expanded={sheet}>
        <Menu size={20} /> <span>{current}</span>
      </button>
    </div>
    <nav>
      {groups.map(([group, items]) => {
        // En el celular los títulos de sección no se muestran, así que nunca se colapsa.
        const collapsed = collapsedNavGroups.includes(group) && !narrowScreen;
        return (
          <div className={`nav-group ${collapsed ? "collapsed" : ""}`} key={group}>
            <button
              type="button"
              className="nav-group-title"
              onClick={() =>
                setCollapsedNavGroups((current) =>
                  current.includes(group)
                    ? current.filter((item) => item !== group)
                    : [...current, group],
                )
              }
            >
              <ChevronRight size={12} className="nav-group-caret" />
              {group}
              {collapsed && <span className="nav-group-count">{items.length}</span>}
            </button>
            {!collapsed &&
              items.map(([id, label, Icon]) => (
                <button
                  key={id}
                  className={view === id ? "active" : ""}
                  onClick={() => onSelect(id)}
                >
                  <Icon size={19} /> {label}
                  {id === "tasks" && overdueTaskCount > 0 && (
                    <span className="nav-badge" aria-label={`${overdueTaskCount} tareas vencidas`}>
                      {overdueTaskCount}
                    </span>
                  )}
                  {id === "inbox" && inboxSignalCount > 0 && (
                    <span className="nav-badge" aria-label={`${inboxSignalCount} leads calientes o cotizaciones frías sin atender`}>
                      {inboxSignalCount}
                    </span>
                  )}
                </button>
              ))}
          </div>
        );
      })}
    </nav>
    <div className="sidebar-note">
      <span className="eyebrow">
        {onlineConfigured ? "Equipo conectado" : "MVP local"}
      </span>
      <p>
        {onlineConfigured
          ? "La cartera se comparte con los usuarios autorizados."
          : "La información permanece en este navegador durante el piloto."}
      </p>
      <div className="legal-links">
        <a href="/privacidad.html" target="_blank" rel="noreferrer">
          Privacidad
        </a>
        <a href="/terminos.html" target="_blank" rel="noreferrer">
          Términos
        </a>
        <a href="/eliminacion-datos.html" target="_blank" rel="noreferrer">
          Eliminar datos
        </a>
      </div>
    </div>
    <nav className="mobile-tabbar" aria-label="Accesos rápidos">
      {quick.map(([id, label, Icon]) => (
        <button key={id} type="button" className={view === id ? "active" : ""} onClick={() => pick(id)} aria-current={view === id ? "page" : undefined}>
          <Icon size={21} /><span>{label === "Empresas y contactos" ? "Empresas" : label}</span>
          {badgeFor(id) > 0 && <b className="nav-badge" aria-label={`${badgeFor(id)} pendientes`}>{badgeFor(id)}</b>}
        </button>
      ))}
      <button type="button" className={!quick.some(([id]) => id === view) ? "active" : ""} onClick={() => setSheet(true)} aria-haspopup="dialog">
        <Menu size={21} /><span>Menú</span>
        {(badgeFor("inbox") > 0) && <b className="nav-badge" aria-label="Hay algo por revisar">{badgeFor("inbox")}</b>}
      </button>
    </nav>
    {sheet && (
      <div className="mobile-sheet" role="dialog" aria-modal="true" aria-label="Menú de la app">
        <div className="mobile-sheet-head">
          <strong>¿Adónde vas?</strong>
          <button type="button" onClick={() => setSheet(false)} aria-label="Cerrar menú"><X size={22} /> Cerrar</button>
        </div>
        <div className="mobile-sheet-body">
          {groups.map(([group, items]) => (
            <section key={group}>
              <h3>{group}</h3>
              <div className="mobile-sheet-list">
                {items.map(([id, label, Icon]) => (
                  <button key={id} type="button" className={view === id ? "active" : ""} onClick={() => pick(id)}>
                    <Icon size={22} /><span>{label}</span>
                    {badgeFor(id) > 0 && <b className="nav-badge">{badgeFor(id)}</b>}
                  </button>
                ))}
              </div>
            </section>
          ))}
        </div>
      </div>
    )}
  </aside>
  );
}
