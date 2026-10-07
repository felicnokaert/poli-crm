import { memo, useEffect, useMemo, useRef, useState } from "react";
import { MapPin } from "lucide-react";
import { buildMapClients, clientsToLocate } from "./map-clients-adapter.mjs";
import { nuevoCache, ubicarClientes } from "./georef.mjs";

const CACHE_KEY = "poli-georef-cache-v1";

// El cache de Georef (localidad -> coordenadas) no es sensible (son nombres de
// localidades, no clientes) y evita volver a consultar en cada visita.
function leerCache() {
  try {
    const guardado = JSON.parse(localStorage.getItem(CACHE_KEY) || "null");
    if (guardado?.localidades && guardado?.provincias) return guardado;
  } catch {
    // sin cache: se rearma
  }
  return nuevoCache();
}

function guardarCache(cache) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
  } catch {
    // cuota llena o storage bloqueado: el mapa funciona igual
  }
}

// Mapa de cobertura dentro del CRM (sesión iniciada). El mapa vive en
// /mapa/ (estático, con su propia CSP); los clientes se calculan acá, con la
// sesión, y se le mandan por postMessage - nunca hay un archivo público con
// CUIT, teléfonos o emails. Ver public/mapa/app.js (esperarClientes).
function MapaCoberturaBase({ clients }) {
  const iframeRef = useRef(null);
  const [listo, setListo] = useState(false);
  const [estado, setEstado] = useState({ fase: "ubicando", detalle: "Ubicando clientes…" });
  const [mapClients, setMapClients] = useState(null);

  const base = useMemo(() => buildMapClients(clients || []), [clients]);

  useEffect(() => {
    let activo = true;
    (async () => {
      try {
        const cache = leerCache();
        const geo = await ubicarClientes(clientsToLocate(base), { cache });
        guardarCache(cache);
        if (!activo) return;
        const completos = buildMapClients(clients || [], geo);
        setMapClients(completos);
        setEstado({ fase: "ok", detalle: "" });
      } catch (error) {
        if (!activo) return;
        // Sin Georef igual mostramos el mapa por provincia (sin pines precisos).
        setMapClients(buildMapClients(clients || []));
        setEstado({ fase: "aviso", detalle: `No se pudo consultar Georef (${error.message}). Se muestran solo las zonas.` });
      }
    })();
    return () => { activo = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [base]);

  useEffect(() => {
    function alMensaje(event) {
      if (event.origin !== window.location.origin) return;
      if (event.source !== iframeRef.current?.contentWindow) return;
      if (event.data?.tipo === "mapa:listo") setListo(true);
    }
    window.addEventListener("message", alMensaje);
    return () => window.removeEventListener("message", alMensaje);
  }, []);

  useEffect(() => {
    if (!listo || !mapClients) return;
    iframeRef.current?.contentWindow?.postMessage(
      { tipo: "mapa:clientes", clientes: mapClients, fecha_export: new Date().toISOString().slice(0, 10) },
      window.location.origin,
    );
  }, [listo, mapClients]);

  const conPin = mapClients ? mapClients.filter((c) => c.lat != null).length : 0;
  const compradores = base.filter((c) => c.compro).length;

  return (
    <div className="content-stack">
      <section className="panel">
        <div className="panel-head">
          <div>
            <span className="eyebrow">Solo para el equipo · requiere sesión</span>
            <h2>Mapa de cobertura</h2>
            <p>
              {base.length} clientes ({compradores} con compra) · {mapClients ? `${conPin} con ubicación` : "ubicando…"}
              {estado.detalle ? ` · ${estado.detalle}` : ""}
            </p>
          </div>
          <MapPin size={22} />
        </div>
        <iframe
          ref={iframeRef}
          title="Mapa de cobertura de aplicadores"
          src="/mapa/index.html"
          className="mapa-cobertura-frame"
        />
      </section>
    </div>
  );
}

export const MapaCobertura = memo(MapaCoberturaBase);
