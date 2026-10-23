import { Building2, Calculator, ChevronRight, ClipboardList, Database, FileCheck2, GraduationCap, Inbox, LayoutDashboard, ListChecks, MapPin, MessageCircle, ReceiptText, Search, ShoppingBag, Store, UserCog } from "lucide-react";
import { onlineConfigured } from "./online";

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

export function AppSidebar({ view, onSelect, collapsedNavGroups, setCollapsedNavGroups, narrowScreen, overdueTaskCount, inboxSignalCount }) {
  return (
  <aside className="sidebar">
    <div className="brand">
      <img
        className="brand-logo"
        src="/poliplast-logo.png"
        alt="Grupo Poliplast"
      />
    </div>
    <nav>
      {NAV_GROUPS.map(([group, items]) => {
        // La sección donde estás parado se ve abierta sola, sin importar
        // si la habías colapsado antes - así nunca "desaparece" de
        // adentro tuyo la pantalla en la que estás. El resto respeta lo
        // que el usuario eligió.
        const isActiveGroup = items.some(([id]) => id === view);
        // En el celular los títulos de sección no se muestran, así que nunca se colapsa.
        const collapsed = collapsedNavGroups.includes(group) && !isActiveGroup && !narrowScreen;
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
  </aside>
  );
}
