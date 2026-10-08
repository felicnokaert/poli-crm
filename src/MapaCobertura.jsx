import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { MapPin, Share2 } from "lucide-react";
import { useConfirm } from "./ConfirmDialog";
import { buildMapClients, clientsToLocate } from "./map-clients-adapter.mjs";
import { nuevoCache, ubicarClientes } from "./georef.mjs";
import { OPCIONES_POR_DEFECTO, buildPublicSnapshot, generateShareToken, hashTokenHex } from "./map-share.mjs";
import { onlineConfigured, supabase } from "./online.js";

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

const fechaCorta = (iso) => (iso ? new Date(iso).toLocaleDateString("es-AR") : "");

// Compartir el mapa con un link publico: se publica una "foto" sin CUIT, telefonos ni
// emails (ver map-share.mjs), con un link secreto que se puede revocar. Nada se publica
// hasta apretar "Publicar y crear link".
function CompartirMapa({ mapClients, userEmail }) {
  const confirm = useConfirm();
  const [opciones, setOpciones] = useState(OPCIONES_POR_DEFECTO);
  const [shares, setShares] = useState([]);
  const [mensaje, setMensaje] = useState("");
  const [esError, setEsError] = useState(false);
  const [linkNuevo, setLinkNuevo] = useState("");
  const [copiado, setCopiado] = useState(false);
  const [trabajando, setTrabajando] = useState(false);

  const cantidad = useMemo(
    () => (mapClients ? buildPublicSnapshot(mapClients, opciones).clientes.length : 0),
    [mapClients, opciones],
  );

  const cargarShares = useCallback(async () => {
    if (!onlineConfigured) return;
    const { data, error } = await supabase
      .from("map_shares")
      .select("id,label,options,client_count,created_at,revoked_at,created_by_email")
      .order("created_at", { ascending: false })
      .limit(20);
    if (error) {
      setEsError(true);
      setMensaje(/map_shares/.test(error.message || "") ? "Todavía no está creada la tabla map_shares en la base (falta aplicar la migración)." : `No se pudo leer los links: ${error.message}`);
      return;
    }
    setShares(data || []);
  }, []);

  useEffect(() => { cargarShares(); }, [cargarShares]);

  const cambiar = (clave) => (event) => setOpciones((actual) => ({ ...actual, [clave]: event.target.checked }));

  async function publicar() {
    if (!mapClients || !cantidad) return;
    setTrabajando(true);
    setMensaje("");
    setEsError(false);
    try {
      const token = generateShareToken();
      const snapshot = buildPublicSnapshot(mapClients, opciones);
      const { error } = await supabase.from("map_shares").insert({
        token_hash: await hashTokenHex(token),
        label: `Mapa del ${fechaCorta(new Date().toISOString())}`,
        options: opciones,
        snapshot,
        client_count: snapshot.clientes.length,
        created_by_email: userEmail || null,
      });
      if (error) throw error;
      setLinkNuevo(`${window.location.origin}/mapa?t=${token}`);
      setCopiado(false);
      await cargarShares();
    } catch (error) {
      setEsError(true);
      setMensaje(`No se pudo publicar: ${error.message || error}`);
    } finally {
      setTrabajando(false);
    }
  }

  async function copiar() {
    try {
      await navigator.clipboard.writeText(linkNuevo);
      setCopiado(true);
    } catch {
      setCopiado(false);
    }
  }

  async function dejarDeCompartir(share) {
    if (!(await confirm(`¿Dejar de compartir "${share.label}"? El link va a dejar de funcionar para todos, de inmediato.`, { danger: true, confirmLabel: "Dejar de compartir" }))) return;
    const { error } = await supabase.from("map_shares").update({ revoked_at: new Date().toISOString() }).eq("id", share.id);
    if (error) {
      setEsError(true);
      setMensaje(`No se pudo revocar: ${error.message}`);
      return;
    }
    await cargarShares();
  }

  return (
    <div className="mapa-share">
      <p className="sub">
        Crea un link que <b>cualquiera con el link puede ver</b>, sin entrar al CRM. Publica una foto de hoy: si después
        cambian los clientes, hay que publicar de nuevo. <b>Nunca incluye CUIT, teléfonos, emails ni domicilios</b>, y
        solo entran clientes que compraron y tienen ubicación.
      </p>
      <label className="check"><input type="checkbox" checked={opciones.nombres} onChange={cambiar("nombres")} /> Mostrar nombres de empresas</label>
      <label className="check"><input type="checkbox" checked={opciones.nombresPersonas} onChange={cambiar("nombresPersonas")} /> Mostrar también nombres de personas físicas (por defecto, ocultos)</label>
      <label className="check"><input type="checkbox" checked={opciones.productos} onChange={cambiar("productos")} /> Mostrar productos, kilos y facturas</label>
      <label className="check"><input type="checkbox" checked={opciones.soloAplicadores} onChange={cambiar("soloAplicadores")} /> Publicar solo aplicadores</label>
      <div className="list-toolbar">
        <button type="button" className="primary" onClick={publicar} disabled={trabajando || !mapClients || !cantidad}>
          {trabajando ? "Publicando…" : `Publicar y crear link (${cantidad} clientes)`}
        </button>
      </div>
      {linkNuevo && (
        <div className="system-message" role="status">
          <p><b>Link creado.</b> Guardalo ahora: por seguridad no se puede volver a mostrar. Si lo perdés, publicá uno nuevo y dejá de compartir el viejo.</p>
          <input readOnly value={linkNuevo} onFocus={(event) => event.target.select()} style={{ width: "100%" }} />
          <button type="button" className="secondary" onClick={copiar}>{copiado ? "Copiado" : "Copiar link"}</button>
        </div>
      )}
      {mensaje && <div className={`system-message ${esError ? "error" : ""}`} role="status">{mensaje}</div>}
      {shares.length > 0 && (
        <table className="mapa-share-lista">
          <thead><tr><th>Publicado</th><th>Por</th><th>Clientes</th><th>Estado</th><th /></tr></thead>
          <tbody>
            {shares.map((share) => (
              <tr key={share.id}>
                <td>{fechaCorta(share.created_at)}</td>
                <td>{share.created_by_email || "—"}</td>
                <td>{share.client_count}</td>
                <td>{share.revoked_at ? `Dejó de compartirse el ${fechaCorta(share.revoked_at)}` : "Activo"}</td>
                <td>{!share.revoked_at && <button type="button" className="danger-link" onClick={() => dejarDeCompartir(share)}>Dejar de compartir</button>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

// Mapa de cobertura dentro del CRM (sesión iniciada). El mapa vive en
// /mapa/ (estático, con su propia CSP); los clientes se calculan acá, con la
// sesión, y se le mandan por postMessage - nunca hay un archivo público con
// CUIT, teléfonos o emails. Ver public/mapa/app.js (esperarClientes).
function MapaCoberturaBase({ clients, onSetClientType, userEmail }) {
  const iframeRef = useRef(null);
  const [listo, setListo] = useState(false);
  const [estado, setEstado] = useState({ fase: "ubicando", detalle: "Ubicando clientes…" });
  const [mapClients, setMapClients] = useState(null);
  const [compartirAbierto, setCompartirAbierto] = useState(false);

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
      // El mapa avisa una correccion manual de tipo; se guarda en la ficha del cliente.
      if (event.data?.tipo === "mapa:tipo" && typeof event.data.doc === "string") {
        onSetClientType?.(event.data.doc, String(event.data.tipoCliente || ""), String(event.data.nota || ""));
      }
    }
    window.addEventListener("message", alMensaje);
    return () => window.removeEventListener("message", alMensaje);
  }, [onSetClientType]);

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
          <div className="panel-head-actions">
            {onlineConfigured && (
              <button type="button" className="secondary" onClick={() => setCompartirAbierto((abierto) => !abierto)}>
                <Share2 size={15} /> Compartir mapa
              </button>
            )}
            <MapPin size={22} />
          </div>
        </div>
        {compartirAbierto && <CompartirMapa mapClients={mapClients} userEmail={userEmail} />}
        <iframe
          ref={iframeRef}
          title="Mapa de cobertura de aplicadores"
          src="/mapa"
          className="mapa-cobertura-frame"
        />
      </section>
    </div>
  );
}

export const MapaCobertura = memo(MapaCoberturaBase);
