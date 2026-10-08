import { useMemo, useRef, useState } from "react";
import { Download, Upload } from "lucide-react";
import { formatCuit } from "./map-clients-adapter.mjs";
import {
  decodificarTexto, filasPlanilla, leerUbicaciones, pendientesDeUbicacion, planearUbicaciones, resumenPendientes,
} from "./client-location.mjs";

const LIBRERIA = "/mapa/vendor/xlsx.full.min.js"; // la misma que usa el mapa; se carga solo al usarla

let cargaLibreria = null;
function cargarPlanillas() {
  if (window.XLSX) return Promise.resolve(window.XLSX);
  if (!cargaLibreria) {
    cargaLibreria = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = LIBRERIA;
      script.onload = () => resolve(window.XLSX);
      script.onerror = () => { cargaLibreria = null; reject(new Error("No se pudo cargar el lector de planillas.")); };
      document.head.appendChild(script);
    });
  }
  return cargaLibreria;
}

const fechaCorta = (iso) => (iso ? iso.split("-").reverse().join("/") : "—");
const PASO = 25;

// Qué clientes no se pueden ubicar en el mapa y cómo completarlos de a muchos: se baja una planilla
// con los CUIT pendientes (o se carga el export de Contabilium) y se completan SOLO los campos vacíos.
export function PendientesUbicacion({ clients, onApplyLocations }) {
  const entradaRef = useRef(null);
  const [visibles, setVisibles] = useState(PASO);
  const [plan, setPlan] = useState(null);
  const [aviso, setAviso] = useState({ texto: "", error: false });
  const [trabajando, setTrabajando] = useState(false);

  const pendientes = useMemo(() => pendientesDeUbicacion(clients || []), [clients]);
  const resumen = useMemo(() => resumenPendientes(pendientes), [pendientes]);

  async function descargarPlanilla() {
    setTrabajando(true);
    try {
      const XLSX = await cargarPlanillas();
      const filas = filasPlanilla(pendientes);
      const hoja = XLSX.utils.aoa_to_sheet(filas);
      hoja["!cols"] = [{ wch: 14 }, { wch: 40 }, { wch: 14 }, { wch: 30 }, { wch: 22 }, { wch: 22 }, { wch: 12 }, { wch: 18 }, { wch: 28 }];
      const libro = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(libro, hoja, "Pendientes");
      const bytes = XLSX.write(libro, { bookType: "xlsx", type: "array" });
      const enlace = document.createElement("a");
      enlace.href = URL.createObjectURL(new Blob([bytes], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
      enlace.download = `clientes-pendientes-de-ubicacion-${new Date().toISOString().slice(0, 10)}.xlsx`;
      enlace.click();
      setTimeout(() => URL.revokeObjectURL(enlace.href), 4000);
      setAviso({ texto: `Planilla descargada con ${filas.length - 1} clientes. Completá Domicilio, Localidad y Provincia y volvé a cargarla acá.`, error: false });
    } catch (error) {
      setAviso({ texto: error.message, error: true });
    } finally {
      setTrabajando(false);
    }
  }

  async function leerArchivo(event) {
    const archivo = event.target.files?.[0];
    event.target.value = ""; // permite volver a elegir el mismo archivo
    if (!archivo) return;
    setTrabajando(true);
    setPlan(null);
    setAviso({ texto: "", error: false });
    try {
      const XLSX = await cargarPlanillas();
      const bytes = await archivo.arrayBuffer();
      // CSV: se decodifica a texto (tildes bien); Excel (.xlsx/.xls): la librería lee los bytes.
      const libro = /\.(csv|txt)$/i.test(archivo.name) ? XLSX.read(decodificarTexto(bytes), { type: "string", raw: true }) : XLSX.read(bytes, { type: "array", raw: true });
      const hoja = libro.Sheets[libro.SheetNames[0]];
      const filas = XLSX.utils.sheet_to_json(hoja, { header: 1, raw: false, defval: "" });
      const lectura = leerUbicaciones(filas);
      if (lectura.error) throw new Error(lectura.error);
      if (!lectura.registros.length) throw new Error("La planilla no tiene filas con CUIT.");
      setPlan({ ...planearUbicaciones(clients || [], lectura.registros), nombreArchivo: archivo.name, filas: lectura.registros.length, sinDocumento: lectura.sinDocumento });
    } catch (error) {
      setAviso({ texto: `No se pudo leer la planilla: ${error.message}`, error: true });
    } finally {
      setTrabajando(false);
    }
  }

  function aplicar() {
    if (!plan?.cambios.length) return;
    onApplyLocations(plan.cambios);
    setAviso({ texto: `Listo: se completaron ${plan.cambios.length} clientes. El mapa se vuelve a ubicar solo.`, error: false });
    setPlan(null);
  }

  return (
    <div className="mapa-share">
      <p className="sub">
        Estos clientes <b>no se pueden ubicar bien en el mapa</b> porque les falta la provincia o la ciudad. Primero van los que ya compraron.
        Para completarlos de a muchos: cargá acá el <b>export de clientes de Contabilium</b> (Excel o CSV con CUIT, localidad y provincia) o bajá
        la planilla, completala y volvé a subirla. <b>Solo se completan campos vacíos</b>: nunca se pisa lo que ya cargaste.
      </p>
      <p>
        <b>{resumen.total}</b> pendientes · {resumen.sinProvincia} sin provincia · {resumen.sinCiudad} sin ciudad · {resumen.compradores} ya compraron
        {resumen.sinDocumento > 0 && ` · ${resumen.sinDocumento} sin CUIT (se completan a mano en su ficha, no por planilla)`}
      </p>
      <div className="list-toolbar">
        <button type="button" className="secondary" onClick={descargarPlanilla} disabled={trabajando || pendientes.length === resumen.sinDocumento}>
          <Download size={15} /> Bajar planilla para completar
        </button>
        <button type="button" className="primary" onClick={() => entradaRef.current?.click()} disabled={trabajando}>
          <Upload size={15} /> Cargar ubicaciones (Excel / CSV)
        </button>
        <input ref={entradaRef} type="file" accept=".xlsx,.xls,.csv" hidden onChange={leerArchivo} aria-label="Planilla con ubicaciones" />
      </div>
      {aviso.texto && <div className={`system-message ${aviso.error ? "error" : ""}`} role="status">{aviso.texto}</div>}
      {plan && (
        <div className="system-message" role="status">
          <p><b>Vista previa de «{plan.nombreArchivo}»</b> (todavía no se guardó nada)</p>
          <ul>
            <li>{plan.filas} filas con CUIT en la planilla.</li>
            <li><b>{plan.cambios.length}</b> clientes se van a completar
              {Object.keys(plan.porCampo).length > 0 && ` (${Object.entries(plan.porCampo).map(([campo, n]) => `${n} ${campo}`).join(", ")})`}.</li>
            <li>{plan.sinNovedad} ya tenían esos datos.</li>
            {plan.sinCliente.length > 0 && <li>{plan.sinCliente.length} CUIT de la planilla no están en el CRM (se ignoran).</li>}
            {plan.sinDocumento > 0 && <li>{plan.sinDocumento} filas sin CUIT válido (se ignoran).</li>}
            {plan.provinciasDesconocidas.length > 0 && (
              <li>Provincias que no reconozco (esas filas se completan sin provincia): {plan.provinciasDesconocidas.slice(0, 6).map((p) => `${p.nombre} (${p.cantidad})`).join(", ")}.</li>
            )}
          </ul>
          <div className="list-toolbar">
            <button type="button" className="primary" onClick={aplicar} disabled={!plan.cambios.length}>Completar {plan.cambios.length} clientes</button>
            <button type="button" className="secondary" onClick={() => setPlan(null)}>Cancelar</button>
          </div>
        </div>
      )}
      {pendientes.length > 0 && (
        <>
          <table className="mapa-share-lista">
            <thead><tr><th>Cliente</th><th>CUIT</th><th>Última compra</th><th>Falta</th></tr></thead>
            <tbody>
              {pendientes.slice(0, visibles).map((p) => (
                <tr key={p.doc}>
                  <td>{p.nombre}</td>
                  <td>{p.conDocumento ? formatCuit(p.doc) : "—"}</td>
                  <td>{fechaCorta(p.ultimaCompra)}</td>
                  <td>{[p.sinProvincia && "provincia", p.sinCiudad && "ciudad"].filter(Boolean).join(" y ")}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {visibles < pendientes.length && (
            <button type="button" className="secondary" onClick={() => setVisibles((n) => n + PASO * 4)}>
              Ver más ({pendientes.length - visibles} restantes)
            </button>
          )}
        </>
      )}
    </div>
  );
}
