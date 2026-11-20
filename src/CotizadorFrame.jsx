import { COTIZADOR_ORIGIN, cotizadorUrl } from "./app-shared";
import { EmbeddedAppFrame } from "./EmbeddedAppFrame";

// El cotizador como pestaña del CRM. Sigue siendo su propia aplicación (repo poliplast-cotizador, misma
// base); acá se muestra como una sección más (sin barra ni recuadro) y con la sesión del CRM: no pide entrar de nuevo.
export function CotizadorFrame({ session, client }) {
  return (
    <EmbeddedAppFrame
      session={session}
      src={cotizadorUrl(client?.company || "", client?.phone || "", { embed: true })}
      origin={COTIZADOR_ORIGIN}
      readyType="cotizador:listo"
      openUrl={cotizadorUrl(client?.company || "", client?.phone || "")}
      title="Cotizador comercial"
      allow="clipboard-write"
      bare
    />
  );
}
