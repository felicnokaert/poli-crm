import { COTIZADOR_ORIGIN, cotizadorUrl } from "./app-shared";
import { EmbeddedAppFrame } from "./EmbeddedAppFrame";

// El cotizador como pestaña del CRM. Sigue siendo su propia aplicación (repo poliplast-cotizador, misma
// base); acá se muestra adentro y se le pasa la sesión para no tener que entrar de nuevo.
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
    />
  );
}
