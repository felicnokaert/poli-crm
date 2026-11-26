import { HelpCircle, MessageSquareWarning, Plus, Search } from "lucide-react";
import { Spinner } from "./ui-primitives";
import { CHANNELS, longToday, profileInitials } from "./app-shared";
import { applyTheme, nextTheme } from "./theme.mjs";
import { LocalInfo } from "./LocalInfo.jsx";

// Barra de arriba: fecha, clima, título, canal, estado del guardado, tema, búsqueda (Ctrl+K) y atajos.
// Salió de App.jsx (QA 16/10), sin cambios de comportamiento.
function displayedChannel(readiness, key) {
  const status = readiness?.channels?.[key];
  // Un canal sin ficha (no deberia pasar: registerChannels las completa)
  // no debe tirar abajo la pantalla entera.
  if (!CHANNELS[key]) return { name: key, number: "", color: "#475569", status: "Sin configurar", statusTone: "offline" };
  if (!status) return CHANNELS[key];
  if (status.inboundEvents > 0)
    return {
      ...CHANNELS[key],
      status: `${status.source === "browser-bridge" ? "Memoria activa" : "Operativo"} · ${status.inboundEvents} mensajes reales`,
      statusTone: "online",
    };
  if (status.configured)
    return {
      ...CHANNELS[key],
      status: "Configurado · falta prueba entrante",
      statusTone: "waiting",
    };
  return {
    ...CHANNELS[key],
    status: "Conexión pendiente",
    statusTone: "offline",
  };
}

export function AppTopbar({ title, myChannels, primaryChannel, readiness, syncStatus, onRetrySave, theme, onThemeChange, onOpenPalette, onOpenShortcuts, onReport = null, notifications = null, profileLabel, onLogConversation }) {
  return (
    <header className="topbar">
      <div>
        <span className="eyebrow">{longToday()}</span>
        <LocalInfo />
        <h1>{title}</h1>
      </div>
      <div className="top-actions">
        {myChannels.length > 0 && (() => {
          const activeChannel = myChannels.includes(primaryChannel) ? primaryChannel : myChannels[0];
          const channelInfo = displayedChannel(readiness, activeChannel);
          return (
            <span
              className={`channel-pill ${channelInfo.statusTone}`}
              title={`${channelInfo.name} · ${channelInfo.number} · ${channelInfo.status}`}
            >
              <span className="channel-dot" style={{ background: channelInfo.color }} />
              {channelInfo.statusTone === "online" ? "Conectado" : channelInfo.statusTone === "waiting" ? "Configurado" : "No conectado"}
            </span>
          );
        })()}
        <span
          className={`sync-pill ${syncStatus === "Sincronizado" ? "ok" : ""} ${syncStatus === "Error de sincronización" ? "error" : ""}`}
          role="status"
          aria-live="polite"
        >
          {(syncStatus === "Guardando…" || syncStatus === "Sincronizando…" || syncStatus === "Conectando…") && (
            <Spinner size={11} />
          )}
          {syncStatus}
          {syncStatus === "Error de sincronización" && (
            <button
              type="button"
              className="sync-retry"
              onClick={onRetrySave}
            >
              Reintentar
            </button>
          )}
        </span>
        <button
          type="button"
          className="icon-button theme-toggle"
          aria-label={`Tema: ${theme}. Tocá para cambiar`}
          title={`Tema: ${theme} (automático, claro u oscuro)`}
          onClick={() => { const next = nextTheme(theme); applyTheme(next); onThemeChange(next); }}
        >
          {theme === "oscuro" ? "🌙" : theme === "claro" ? "☀️" : "🌓"}
        </button>
        <button
          type="button"
          className="icon-button"
          aria-label="Buscar en toda la app"
          title="Buscar en toda la app (Ctrl+K)"
          onClick={onOpenPalette}
        >
          <Search size={18} />
        </button>
        {notifications}
        {onReport && (
          <button type="button" className="icon-button report-button" aria-label="Algo no anda: avisar" title="Algo no anda: avisar" onClick={onReport}>
            <MessageSquareWarning size={18} />
          </button>
        )}
        <button
          type="button"
          className="icon-button"
          aria-label="Ayuda: guía de la app y atajos"
          title="Ayuda: guía de la app y atajos"
          onClick={onOpenShortcuts}
        >
          <HelpCircle size={18} />
        </button>
        <div
          className="profile-pill"
          title={profileLabel}
        >
          {profileInitials(profileLabel)}
        </div>
        {onLogConversation && (
          <button className="primary" onClick={onLogConversation}>
            <Plus size={18} /> Registrar conversación
          </button>
        )}
      </div>
    </header>
  );
}
