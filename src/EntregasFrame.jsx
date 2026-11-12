import { ENTREGAS_EMBED_URL, ENTREGAS_ORIGIN } from "./app-shared";
import { EmbeddedAppFrame } from "./EmbeddedAppFrame";

// Poli-Entregas (remitos, despachos y entregas) como pestaña del CRM. Es su propia aplicación (carpeta Entregas,
// misma base y mismos logins); expedición entra por el link directo. Adentro del CRM recibe la sesión del CRM;
// si en 5 segundos no le llega, muestra su propio login. Se ve como una sección más (sin barra ni marco).
export function EntregasFrame({ session }) {
  return (
    <EmbeddedAppFrame
      session={session}
      src={ENTREGAS_EMBED_URL}
      origin={ENTREGAS_ORIGIN}
      readyType="entregas:listo"
      title="Entregas"
      allow="clipboard-write"
      bare
    />
  );
}
