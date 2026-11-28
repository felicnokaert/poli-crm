import { Boxes, Building2, Calculator, ChevronRight, Menu, X, ClipboardList, Database, FileCheck2, GraduationCap, Inbox, LayoutDashboard, ListChecks, MapPin, MessageCircle, ReceiptText, Search, ShoppingBag, Store, Truck, UserCog, Tags, PackageSearch, FlaskConical, Receipt, FileText, ShoppingCart, Map as MapIcon, Users, MessageSquareWarning, PanelLeftClose, PanelLeftOpen, Warehouse } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { onlineConfigured } from "./online";
import { filterNav } from "./module-access.mjs";
import { ROLES } from "./poliplast-app-plan.mjs";
import { navForAccess } from "./team-access.mjs";
import { countUse, pinToggle, quickAccessIds, readQuick, saveQuick } from "./quick-access.mjs";
import { Star } from "lucide-react";
import { isChannelAdmin } from "./user-channels.mjs";

// Menú lateral de Poliplast App (rama de prueba, 25/11): 7 grupos según docs/PLAN_POLIPLAST_APP.md.
// Lo marcado como futuro (Etiquetas, Conteo, Dosificado, Recibos, Facturación, Compras) abre una vista «próximamente».
export const NAV_GROUPS = [
  // Inicio va suelto arriba (27/11, Felipe: «que no sea un menú»): el grupo no muestra título ni se pliega.
  ["Inicio", [
    ["dashboard", "Inicio", LayoutDashboard],
  ]],
  ["Ventas", [
    ["sales", "Ventas", ReceiptText],
    ["quoter", "Cotizador", Calculator],
    ["prospecting", "Prospección", Search],
    ["clients", "Clientes y contactos", Building2],
    ["inbox", "Por revisar", Inbox],
    ["conversations", "Historial", MessageCircle],
    ["map", "Mapa", MapPin],
  ]],
  ["Canales online", [
    ["mercadolibre", "Mercado Libre", Store],
    ["shopify", "Shopify", ShoppingBag],
    ["productos", "Productos", Boxes],
    ["mejoras", "Centro de mejoras", ListChecks],
  ]],
  ["Logística", [
    ["stock", "Stock", Warehouse],
    ["entregas", "Entregas", Truck],
    ["etiquetas", "Etiquetas", Tags],
    ["conteo", "Conteo", PackageSearch],
    ["dosificado", "Dosificado", FlaskConical],
  ]],
  ["Administración", [
    ["recibos", "Recibos", Receipt],
    ["facturacion", "Facturación", FileText],
    ["compras", "Compras", ShoppingCart],
  ]],
  ["Equipo", [
    ["tasks", "Tareas", ClipboardList],
    ["academy", "Academia", GraduationCap],
    ["techdocs", "Base técnica", FileCheck2],
  ]],
  ["Configuración", [
    ["plan", "Cómo queda la app", MapIcon],
    ["team", "Equipo y cuentas", Users],
    ["avisos", "Avisos del equipo", MessageSquareWarning],
    ["profile", "Perfil", UserCog],
    ["settings", "Datos y conexiones", Database],
  ]],
];

export const NAV_ITEMS = NAV_GROUPS.flatMap(([, items]) => items);
// Grupos que no se pliegan ni muestran título (Inicio).
export const SOLO_GROUPS = ["Inicio"];

// Atajos de la barra inferior del celular (con nombre, no solo ícono). Lo demás está en "Menú".
const QUICK_IDS = ["dashboard", "tasks", "sales", "clients"];

export function AppSidebar({ view, onSelect, collapsedNavGroups, setCollapsedNavGroups, narrowScreen, overdueTaskCount, inboxSignalCount, email = "", denied = null, previewRole = "admin", previewAccess = null, previewName = "", onPreviewRole = null, mini = false, onToggleMini = null }) {
  const baseGroups = navForAccess(filterNav(NAV_GROUPS, email, denied), previewAccess || { role: previewRole });
  // Acceso rápido (26/11): lo que más usás (se cuenta solo) y lo que fijás con la estrella. Se guarda en este equipo.
  const [quick, setQuick] = useState(() => readQuick());
  const allowedItems = baseGroups.flatMap(([, items]) => items);
  const quickIds = quickAccessIds(quick, allowedItems.map(([id]) => id));
  const quickItems = quickIds.map((id) => allowedItems.find(([itemId]) => itemId === id)).filter(Boolean);
  // Inicio queda primero, arriba de Acceso rápido.
  const soloGroups = baseGroups.filter(([name]) => SOLO_GROUPS.includes(name));
  const restGroups = baseGroups.filter(([name]) => !SOLO_GROUPS.includes(name));
  // 28/11 (Felipe: «recordá lo de acceso rápido»): el grupo se ve siempre; vacío, explica cómo fijar.
  const groups = [...soloGroups, ...(quickItems.length || !mini ? [["Acceso rápido", quickItems]] : []), ...restGroups];
  const togglePin = (id) => setQuick((current) => { const next = pinToggle(current, id); saveQuick(next); return next; });
  useEffect(() => { if (view && view !== "plan") setQuick((current) => { const next = countUse(current, view); saveQuick(next); return next; }); }, [view]);
  const [sheet, setSheet] = useState(false);
  // Menú minimizado: el nombre aparece al pasar el mouse (cartelito fijo, no lo corta el desplazamiento del menú).
  const [tip, setTip] = useState(null);
  const showTip = (event, label) => { if (!mini) return; const rect = event.currentTarget.getBoundingClientRect(); setTip({ label, top: rect.top + rect.height / 2, left: rect.right + 10 }); };
  const allowed = baseGroups.flatMap(([, items]) => items);
  const tabbar = QUICK_IDS.map((id) => allowed.find(([itemId]) => itemId === id)).filter(Boolean);
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
    if (group) setCollapsedNavGroups((current) => (current.includes(group) ? NAV_GROUPS.map(([name]) => name).filter((name) => name !== group) : current));
  }, [view, setCollapsedNavGroups]);
  // Sin barra de desplazamiento (27/11, Felipe): si lo abierto no entra en el alto de la pantalla, se cierran solos
  // los grupos que no son el de la pantalla actual (primero Acceso rápido), de a uno, hasta que entre.
  const navRef = useRef(null);
  useLayoutEffect(() => {
    const nav = navRef.current;
    if (!nav || narrowScreen || mini || nav.clientHeight === 0) return;
    if (nav.scrollHeight <= nav.clientHeight + 1) return;
    const activeGroup = groups.find(([name, items]) => name !== "Acceso rápido" && items.some(([id]) => id === view))?.[0];
    const open = groups.map(([name]) => name).filter((name) => !SOLO_GROUPS.includes(name) && !collapsedNavGroups.includes(name));
    const candidate = open.find((name) => name === "Acceso rápido" && activeGroup) || open.find((name) => name !== activeGroup && name !== "Acceso rápido");
    if (candidate) setCollapsedNavGroups((current) => (current.includes(candidate) ? current : [...current, candidate]));
  });
  useEffect(() => {
    const onResize = () => setCollapsedNavGroups((current) => [...current]);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [setCollapsedNavGroups]);
  return (
  <aside className="sidebar">
    <div className="brand">
      <img
        className="brand-logo"
        src="/poliplast-logo.png"
        alt="Grupo Poliplast"
      />
      <img className="brand-iso" src="/poliplast-isotipo-blanco.png" alt="" aria-hidden="true" />
      {onToggleMini && (
        <button type="button" className="nav-mini-toggle" onClick={onToggleMini} aria-pressed={mini} aria-label={mini ? "Abrir el menú" : "Minimizar el menú"} title={mini ? "Abrir el menú" : "Minimizar el menú"}>
          {mini ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}
        </button>
      )}
      <button type="button" className="mobile-menu-button" onClick={() => setSheet(true)} aria-haspopup="dialog" aria-expanded={sheet}>
        <Menu size={20} /> <span>{current}</span>
      </button>
    </div>
    <nav ref={navRef}>
      {groups.map(([group, items]) => {
        // En el celular los títulos de sección no se muestran, así que nunca se colapsa.
        // Minimizado: se ven todos los íconos (sin títulos de grupo, con una línea entre grupos).
        const solo = SOLO_GROUPS.includes(group);
        const collapsed = !solo && collapsedNavGroups.includes(group) && !narrowScreen && !mini;
        return (
          <div className={`nav-group ${collapsed ? "collapsed" : ""}${solo ? " nav-solo" : ""}`} key={group}>
            {!solo && <button
              type="button"
              className="nav-group-title"
              onClick={() =>
                // Acordeón (26/11, Felipe): al abrir un grupo se cierran los demás.
                setCollapsedNavGroups((current) =>
                  current.includes(group)
                    ? groups.map(([name]) => name).filter((name) => name !== group && name !== "Acceso rápido" && !SOLO_GROUPS.includes(name))
                    : [...current, group],
                )
              }
            >
              <ChevronRight size={12} className="nav-group-caret" />
              {group}
              {collapsed && <span className="nav-group-count">{items.length}</span>}
            </button>}
            {!collapsed && group === "Acceso rápido" && items.length === 0 && (
              <p className="nav-hint">Tocá la <Star size={11} /> de cualquier pantalla para fijarla acá. Lo que más usás aparece solo.</p>
            )}
            {!collapsed &&
              items.map(([id, label, Icon]) => (
                <button
                  key={id}
                  className={view === id ? "active" : ""}
                  onClick={() => onSelect(id)}
                  aria-label={mini ? label : undefined}
                  onMouseEnter={(event) => showTip(event, label)}
                  onMouseLeave={() => setTip(null)}
                  onFocus={(event) => showTip(event, label)}
                  onBlur={() => setTip(null)}
                >
                  <Icon size={19} /> <span className="nav-label">{label}</span>
                  {!mini && <span role="button" tabIndex={-1} className={`nav-pin${(quick.pins || []).includes(id) ? " is-pinned" : ""}`} title={(quick.pins || []).includes(id) ? "Sacar de Acceso rápido" : "Fijar en Acceso rápido"} onClick={(event) => { event.stopPropagation(); togglePin(id); }}><Star size={13} /></span>}
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
    {mini && tip && createPortal(<div className="nav-tip" role="tooltip" style={{ top: tip.top, left: tip.left }}>{tip.label}</div>, document.body)}
    <div className="sidebar-note">
      {/* Poliplast App (prueba): ver el menú como lo vería cada rol. Solo cambia lo que se muestra, no los permisos. */}
      {onPreviewRole && (!onlineConfigured || isChannelAdmin(email)) && (
        <label className="preview-role">
          <span className="eyebrow">Ver como</span>
          <select value={previewRole} onChange={(event) => onPreviewRole(event.target.value)}>
            {ROLES.map((role) => <option key={role.id} value={role.id}>{role.label}</option>)}
            {previewRole.startsWith("person:") && <option value={previewRole}>{previewName || "Persona"}</option>}
          </select>
        </label>
      )}
      <div className="legal-links" title={onlineConfigured ? "Equipo conectado: la cartera se comparte con los usuarios autorizados." : "Modo local: la información queda en este navegador."}>
        <span className={`sidebar-status${onlineConfigured ? " on" : ""}`}>{onlineConfigured ? "Conectado" : "Local"}</span>
        <a href="/privacidad.html" target="_blank" rel="noreferrer">
          Privacidad
        </a>
        <a href="/terminos.html" target="_blank" rel="noreferrer">
          Términos
        </a>
        <a href="/eliminacion-datos.html" target="_blank" rel="noreferrer">
          Datos
        </a>
      </div>
    </div>
    <nav className="mobile-tabbar" aria-label="Accesos rápidos">
      {tabbar.map(([id, label, Icon]) => (
        <button key={id} type="button" className={view === id ? "active" : ""} onClick={() => pick(id)} aria-current={view === id ? "page" : undefined}>
          <Icon size={21} /><span>{label === "Clientes y contactos" ? "Clientes" : label}</span>
          {badgeFor(id) > 0 && <b className="nav-badge" aria-label={`${badgeFor(id)} pendientes`}>{badgeFor(id)}</b>}
        </button>
      ))}
      <button type="button" className={!tabbar.some(([id]) => id === view) ? "active" : ""} onClick={() => setSheet(true)} aria-haspopup="dialog">
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
