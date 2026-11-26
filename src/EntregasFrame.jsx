import { ENTREGAS_EMBED_URL, ENTREGAS_ORIGIN } from "./app-shared";
import { EmbeddedAppFrame } from "./EmbeddedAppFrame";

// Poli-Entregas (remitos, despachos y entregas) como pestaña del CRM. Es su propia aplicación (carpeta Entregas,
// misma base y mismos logins); expedición entra por el link directo. Adentro del CRM recibe la sesión del CRM;
// si no le sirve, le pide al CRM que la renueve (nunca muestra su propio login adentro del CRM). Se ve como una sección más (sin barra ni marco).
export function EntregasFrame({ session }) {
  return (
    <EmbeddedAppFrame
      session={session}
      src={ENTREGAS_EMBED_URL}
      origin={ENTREGAS_ORIGIN}
      readyType="entregas:listo"
      heightType="entregas:alto"
      revealType="entregas:visible"
      title="Entregas"
      allow="clipboard-write; camera"
      loadingText="Cargando Entregas"
      bare
    />
  );
}
