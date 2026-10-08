/* Mapa de cobertura de aplicadores POLIOCHO. Front estático: lee data/*.json generados por etl/. */
const CLASES = {
  sobre:  { texto: "Sobresaturada",      color: "#3b6fb6" },
  ok:     { texto: "Equilibrada",        color: "#3c9d5d" },
  faltan: { texto: "Faltan aplicadores", color: "#d9534f" },
  sin:    { texto: "Sin clientes",       color: "#b9c1c9" },
};
const TIPOS = {
  aplicador:  { texto: "Aplicador",          color: "#7b3fe4" },
  inyeccion:  { texto: "Inyección",          color: "#0e9aa7" },
  fabricante: { texto: "Fabricante",         color: "#c2185b" },
  no_aplica:  { texto: "Compra y no aplica", color: "#8a6d3b" },
  otro:       { texto: "Otro",               color: "#5d6b7a" },
  sin:        { texto: "Sin clasificar",     color: "#9aa5b1" },
};
const PIN = { inactivo: "#b3bcc6" };
const tipoDe = (c) => c.tipo || "sin";
const expresionColorTipo = () => ["match", ["get", "tipo"], ...Object.entries(TIPOS).filter(([k]) => k !== "sin").flatMap(([k, v]) => [k, v.color]), TIPOS.sin.color];
const PRECISION = {
  direccion: "Ubicado por domicilio",
  localidad: "Ubicado en el centro de la localidad",
  departamento: "Ubicación aproximada (departamento)",
  provincia: "Ubicación aproximada (solo provincia)",
};
const MOTIVO = {
  sin_localidad: "no tiene localidad cargada",
  localidad_no_encontrada: "la localidad no se encontró en el nomenclador",
  sin_provincia: "no tiene provincia",
};
const ZOOM_DEPTOS = 5.6;
const $ = (id) => document.getElementById(id);
const nf0 = new Intl.NumberFormat("es-AR", { maximumFractionDigits: 0 });
const nf1 = new Intl.NumberFormat("es-AR", { maximumFractionDigits: 1, minimumFractionDigits: 1 });
const nf2 = new Intl.NumberFormat("es-AR", { maximumFractionDigits: 2, minimumFractionDigits: 2 });
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

const estado = { clientes: [], zonas: null, meta: null, provGeo: null, depGeo: null, metricas: { prov: new Map(), dep: new Map() } };

function fechaCorte(exportISO, meses) {
  const d = new Date(exportISO + "T00:00:00");
  d.setMonth(d.getMonth() - meses);
  return d.toISOString().slice(0, 10);
}
const fmtFecha = (iso) => (iso ? iso.split("-").reverse().join("/") : "—");

function parametros() {
  return {
    x: Math.max(1, Number($("p-x").value) || 200000),
    meses: Number($("p-meses").value),
    bajo: Number($("p-bajo").value),
    alto: Number($("p-alto").value),
    soloAplicadores: $("p-aplicador").checked,
    tipoPin: $("f-tipo").value,
    pines: $("p-pines").checked,
    nivel: $("p-nivel").value,
    radio: Math.min(500, Math.max(10, Number($("p-radio").value) || 100)),
    piso: Math.max(0, Number($("p-piso").value) || 0),
    producto: $("f-producto").value,
    provincia: $("f-provincia").value,
    estadoPin: $("f-estado").value,
    desde: $("f-desde").value,
    hasta: $("f-hasta").value,
  };
}

/** Clientes que pasan los filtros. modo "metricas": semáforo/ranking (opcionalmente solo aplicadores); modo "pines": filtro por tipo. */
function clientesFiltrados(modo = "pines") {
  const p = parametros();
  return estado.clientes.filter((c) => {
    if (modo === "metricas" && p.soloAplicadores && c.tipo !== "aplicador") return false;
    if (modo === "pines" && p.tipoPin && tipoDe(c) !== p.tipoPin) return false;
    if (p.producto && !c.productos.some((pr) => pr.producto === p.producto)) return false;
    if (p.desde && !(c.ultima_compra && c.ultima_compra >= p.desde)) return false;
    if (p.hasta && !(c.ultima_compra && c.ultima_compra <= p.hasta)) return false;
    return true;
  });
}

/** Kilos de un cliente (solo del producto filtrado, si hay uno). */
function kgCliente(c, producto) {
  return c.productos.reduce((s, pr) => s + (!producto || pr.producto === producto ? pr.kg : 0), 0);
}

function clasificar(z, p) {
  z.esperados = z.poblacion / p.x;
  const base = Math.max(z.esperados, p.piso);
  z.indice = base > 0 ? z.activos / base : 0;
  z.diferencia = z.activos - z.esperados; // < 0: faltan, > 0: sobran
  z.clase = z.activos === 0 ? "sin" : z.indice > p.alto ? "sobre" : z.indice >= p.bajo ? "ok" : "faltan";
}

/** Métricas por provincia y por departamento con los parámetros actuales. */
function calcular() {
  const p = parametros();
  const corte = fechaCorte(estado.meta.fecha_export, p.meses);
  const nuevo = (z, extra) => ({ id: z.id ?? z.cod, nombre: z.nombre, poblacion: z.poblacion, activos: 0, clientes: 0, kg: 0, ultima: null, ...extra });
  const prov = new Map(estado.zonas.provincias.map((z) => [z.cod, nuevo(z)]));
  const dep = new Map(estado.zonas.departamentos.map((z) => [z.id, nuevo(z, { provincia: prov.get(z.provincia_cod)?.nombre })]));
  for (const c of clientesFiltrados("metricas")) {
    if (!c.compro) continue;
    const kg = kgCliente(c, p.producto);
    const activo = c.ultima_compra >= corte;
    for (const z of [prov.get(c.provincia_cod), c.depto_id && dep.get(c.depto_id)]) {
      if (!z) continue;
      z.clientes++;
      z.kg += kg;
      if (!z.ultima || c.ultima_compra > z.ultima) z.ultima = c.ultima_compra;
      if (activo) z.activos++;
    }
  }
  for (const z of [...prov.values(), ...dep.values()]) clasificar(z, p);
  return { prov, dep, corte };
}

function datosPines(corte) {
  const p = parametros();
  return {
    type: "FeatureCollection",
    features: clientesFiltrados().filter((c) => {
      if (c.lat == null) return false;
      if (p.provincia && c.provincia_cod !== p.provincia) return false;
      const activo = c.compro && c.ultima_compra >= corte;
      return !p.estadoPin || (p.estadoPin === "activo") === activo;
    }).map((c) => ({
      type: "Feature",
      geometry: { type: "Point", coordinates: [c.lon, c.lat] },
      properties: {
        doc: c.doc,
        tipo: tipoDe(c),
        activo: c.compro && c.ultima_compra >= corte ? 1 : 0,
        aprox: c.precision === "provincia" || c.precision === "departamento" ? 1 : 0,
      },
    })),
  };
}

function pintar() {
  const m = calcular();
  estado.metricas = m;
  for (const f of estado.provGeo.features) Object.assign(f.properties, m.prov.get(f.properties.zid) || { clase: "sin" });
  for (const f of estado.depGeo.features) Object.assign(f.properties, m.dep.get(f.properties.zid) || { clase: "sin" });
  const map = estado.map;
  map.getSource("provincias").setData(estado.provGeo);
  map.getSource("departamentos").setData(estado.depGeo);
  map.getSource("clientes").setData(datosPines(m.corte));
  renderAlcance(m.corte);
  aplicarVisibilidad();
  renderResumen(m);
}

function aplicarVisibilidad() {
  const p = parametros();
  const map = estado.map;
  const alcance = p.nivel === "alc";
  const usaDeptos = !alcance && (p.nivel === "dep" || (p.nivel === "auto" && map.getZoom() >= ZOOM_DEPTOS));
  map.setLayoutProperty("prov-relleno", "visibility", usaDeptos ? "none" : "visible");
  map.setLayoutProperty("dep-relleno", "visibility", usaDeptos ? "visible" : "none");
  map.setLayoutProperty("dep-borde", "visibility", usaDeptos ? "visible" : "none");
  // En "Alcance" las provincias quedan de fondo neutro para que se vean la zona y las ciudades.
  map.setPaintProperty("prov-relleno", "fill-color", alcance ? "#eef2f6" : expresionColorClase());
  for (const id of ["alc-zona", "alc-zona-borde", "ciudades"]) map.setLayoutProperty(id, "visibility", alcance ? "visible" : "none");
  for (const id of ["pines", "pines-cluster", "pines-cluster-n"]) map.setLayoutProperty(id, "visibility", p.pines ? "visible" : "none");
  $("seccion-alcance").hidden = !alcance;
  estado.nivelActual = usaDeptos ? "dep" : "prov";
}

/* ---- Alcance por ciudades (ver alcance.mjs): aplicadores activos, radio en linea recta ---- */
const COLOR_ALCANCE = { sin: "#d9534f", uno: "#f0a30a", varios: "#3c9d5d" };
const expresionColorClase = () => ["match", ["get", "clase"], "sobre", CLASES.sobre.color, "ok", CLASES.ok.color, "faltan", CLASES.faltan.color, CLASES.sin.color];

function unionCirculos(aplicadores, radioKm) {
  const vistos = new Set();
  const circulos = [];
  for (const a of aplicadores) {
    const clave = a.lat.toFixed(2) + "," + a.lon.toFixed(2); // mismos puntos casi identicos: un solo circulo
    if (vistos.has(clave)) continue;
    vistos.add(clave);
    circulos.push(turf.circle([a.lon, a.lat], radioKm, { steps: 48, units: "kilometers" }));
  }
  if (!circulos.length) return { type: "FeatureCollection", features: [] };
  try {
    let zona = circulos[0];
    for (let i = 1; i < circulos.length; i++) zona = turf.union(zona, circulos[i]) || zona;
    return { type: "FeatureCollection", features: [zona] };
  } catch (e) {
    console.warn("union de circulos fallo, se dibujan por separado", e);
    return { type: "FeatureCollection", features: circulos };
  }
}

function renderAlcance(corte) {
  const p = parametros();
  if (!estado.ciudades || !window.Alcance || p.nivel !== "alc") return;
  const aplicadores = estado.clientes.filter((c) => window.Alcance.esAplicadorQueCuenta(c, corte)).map((c) => ({ lat: c.lat, lon: c.lon }));
  const res = window.Alcance.calcularAlcance(estado.ciudades, aplicadores, p.radio);
  estado.alcance = res;
  const zona = unionCirculos(aplicadores, p.radio);
  estado.map.getSource("alc-zona").setData(zona);
  estado.map.getSource("ciudades").setData({
    type: "FeatureCollection",
    features: res.ciudades.filter((c) => c.ubicada).map((c) => ({
      type: "Feature", geometry: { type: "Point", coordinates: [c.lon, c.lat] },
      properties: { id: c.id, nombre: c.nombre, pob: c.pob, n: c.n, clase: window.Alcance.claseAlcance(c.n), aprox: c.aprox || 0 },
    })),
  });
  const r = res.resumen;
  $("alc-resumen").innerHTML = [
    ["Aplicadores activos que cuentan", nf0.format(r.aplicadores)],
    ["Radio de alcance", `${nf0.format(r.radioKm)} km (línea recta)`],
    ["Población cubierta", `${nf1.format(r.pctCubierta)} %`],
    ["Habitantes cubiertos", nf0.format(r.pobCubierta)],
    ["Habitantes sin cobertura", nf0.format(r.pobSinCobertura)],
    ["Ciudades cubiertas", `${nf0.format(r.ciudadesCubiertas)} de ${nf0.format(r.ciudadesUbicadas)}`],
    ["Sin ubicar (no cuentan)", nf0.format(r.pobSinUbicar) + " hab."],
  ].map(([a, b]) => `<dt>${a}</dt><dd>${b}</dd>`).join("");
  const sin = window.Alcance.rankingSinCobertura(res, { limite: 15 });
  $("alc-ranking").innerHTML = sin.map((c) => `<li data-lon="${c.lon}" data-lat="${c.lat}"><b>${esc(c.nombre)}</b>
    <small>${esc((estado.zonas.provincias.find((z) => z.cod === c.prov) || {}).nombre || "")} · ${nf0.format(c.pob)} hab.</small></li>`).join("") || "<li>Todas las ciudades tienen cobertura</li>";
}

function htmlCiudad(f) {
  const n = f.properties.n;
  const texto = n === 0 ? "Sin aplicadores al alcance" : n === 1 ? "1 aplicador al alcance" : `${n} aplicadores al alcance`;
  return `<div class="cliente"><h3>${esc(f.properties.nombre)}</h3>
    <span class="estado" style="background:${COLOR_ALCANCE[f.properties.clase]}">${texto}</span>
    <table><tr><td>Población</td><td>${nf0.format(f.properties.pob)}</td></tr>
    <tr><td>Radio</td><td>${nf0.format(parametros().radio)} km en línea recta</td></tr></table>
    ${f.properties.aprox ? '<p class="aprox">Ubicación aproximada (centro del departamento).</p>' : ""}</div>`;
}

function renderLeyenda() {
  const p = parametros();
  if (p.nivel === "alc") {
    $("leyenda").innerHTML = [
      ["#d9534f", "Ciudad sin aplicadores al alcance"], ["#f0a30a", "Ciudad con 1 aplicador al alcance"], ["#3c9d5d", "Ciudad con 2 o más aplicadores"],
    ].map(([c, t]) => `<li><i class="pin" style="background:${c}"></i>${t}</li>`).join("") +
      `<li><i style="background:#3c9d5d;opacity:.35"></i>Zona de cobertura (${nf0.format(p.radio)} km en línea recta)</li>` +
      Object.values(TIPOS).map((t) => `<li><i class="pin" style="background:${t.color}"></i>Pin activo: ${t.texto}</li>`).join("");
    return;
  }
  const t = {
    sobre: `Sobresaturada (índice > ${nf2.format(p.alto)})`,
    ok: `Equilibrada (${nf2.format(p.bajo)} a ${nf2.format(p.alto)})`,
    faltan: `Faltan aplicadores (< ${nf2.format(p.bajo)})`,
    sin: "Sin clientes activos (0)",
  };
  $("leyenda").innerHTML = Object.entries(CLASES).map(([k, v]) => `<li><i style="background:${v.color}"></i>${t[k]}</li>`).join("") +
    Object.values(TIPOS).map((t) => `<li><i class="pin" style="background:${t.color}"></i>Pin activo: ${t.texto}</li>`).join("") +
    `<li><i class="pin" style="background:${PIN.inactivo}"></i>Pin de cliente inactivo (cualquier tipo)</li>`;
}

function renderResumen({ prov, dep }) {
  const z = [...prov.values()];
  const suma = (k) => z.reduce((s, v) => s + v[k], 0);
  const cuenta = (c) => z.filter((v) => v.clase === c).length;
  const filas = [
    ["Población (Censo 2022)", nf0.format(suma("poblacion"))],
    ["Aplicadores esperados", nf0.format(suma("esperados"))],
    ["Clientes activos", nf0.format(suma("activos"))],
    ["Clientes con alguna compra", nf0.format(suma("clientes"))],
    ["Provincias sobresaturadas", cuenta("sobre")],
    ["Provincias equilibradas", cuenta("ok")],
    ["Provincias que faltan", cuenta("faltan")],
    ["Provincias sin clientes", cuenta("sin")],
  ];
  $("resumen").innerHTML = filas.map(([a, b]) => `<dt>${a}</dt><dd>${b}</dd>`).join("");
  renderUbicacion();
  renderRanking();
}

/* ---- Ranking de zonas ---- */
function zonasRanking() {
  const p = parametros();
  const nivel = estado.nivelActual || "prov";
  let zonas = [...estado.metricas[nivel].values()].filter((z) => z.poblacion > 0);
  if (p.provincia) zonas = zonas.filter((z) => (nivel === "prov" ? z.id : estado.zonas.departamentos.find((d) => d.id === z.id)?.provincia_cod) === p.provincia);
  const deficit = zonas.filter((z) => z.diferencia < 0).sort((a, b) => a.diferencia - b.diferencia);
  const sobre = zonas.filter((z) => z.clase === "sobre").sort((a, b) => b.diferencia - a.diferencia);
  return { nivel, deficit, sobre };
}

function renderRanking() {
  const { nivel, deficit, sobre } = zonasRanking();
  const verDeficit = $("tab-deficit").classList.contains("activa");
  const lista = (verDeficit ? deficit : sobre).slice(0, 10);
  $("ranking").innerHTML = lista.map((z) => `<li data-id="${esc(z.id)}"><b>${esc(z.nombre)}</b>${z.provincia && nivel === "dep" ? ` <small>${esc(z.provincia)}</small>` : ""}
    <small>${verDeficit ? "Faltan" : "Sobran"} ${nf1.format(Math.abs(z.diferencia))} · reales ${z.activos} / esperados ${nf1.format(z.esperados)} · pob. ${nf0.format(z.poblacion)}</small></li>`).join("")
    || "<li>Sin zonas para mostrar</li>";
}

function exportarExcel() {
  const p = parametros();
  const { nivel, deficit, sobre } = zonasRanking();
  const fila = (z, i) => ({
    "#": i + 1, "Zona": z.nombre, "Provincia": nivel === "dep" ? z.provincia : z.nombre,
    "Población": z.poblacion, "Aplicadores esperados": Number(z.esperados.toFixed(2)), "Aplicadores reales (activos)": z.activos,
    "Diferencia (reales - esperados)": Number(z.diferencia.toFixed(2)), "Índice": Number(z.indice.toFixed(2)),
    "Estado": CLASES[z.clase].texto, "Kg facturados": Math.round(z.kg), "Última compra": fmtFecha(z.ultima),
  });
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(deficit.map(fila)), "Mayor déficit");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(sobre.map(fila)), "Sobresaturadas");
  const params = [
    ["Nivel", nivel === "dep" ? "Departamentos" : "Provincias"], ["Datos al", fmtFecha(estado.meta.fecha_export)],
    ["Habitantes por aplicador (X)", p.x], ["Cliente activo (meses)", p.meses], ["Umbral faltan (<)", p.bajo], ["Umbral sobresaturada (>)", p.alto],
    ["Piso de esperados", p.piso], ["Producto", p.producto || "Todos"], ["Provincia", p.provincia ? estado.zonas.provincias.find((x) => x.cod === p.provincia).nombre : "Todas"],
    ["Solo aplicadores", p.soloAplicadores ? "Sí" : "No"], ["Fuente población", estado.zonas.fuente],
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(params), "Parámetros");
  XLSX.writeFile(wb, `ranking_cobertura_${nivel}_${estado.meta.fecha_export}.xlsx`);
}

/* ---- Revisión de clasificación (correcciones manuales) ---- */
/* La correccion manual se guarda en el CRM (no en el navegador): se la avisamos a la
 * pagina que nos contiene y ella la escribe en la ficha del cliente. Un tipo vacio
 * significa "volver al automatico". */
function cambiarTipo(doc, tipo, nota) {
  const c = estado.porDoc.get(doc);
  if (window.parent !== window) window.parent.postMessage({ tipo: "mapa:tipo", doc, tipoCliente: tipo || "", nota: nota || "" }, location.origin);
  c.tipo = tipo || c.tipo_auto || null;
  c.tipo_origen = tipo ? "manual" : (c.tipo_auto ? "auto" : null);
  c.tipo_nota = nota;
  clearTimeout(estado.tRev);
  estado.tRev = setTimeout(pintar, 250);
}

function renderRevisar() {
  const q = $("rev-buscar").value.trim().toUpperCase();
  const qd = q.replace(/\D/g, "");
  const filtro = $("rev-filtro").value;
  const lista = estado.clientes.filter((c) => c.compro)
    .filter((c) => !q || c.razon_social.toUpperCase().includes(q) || (qd.length >= 3 && c.doc.includes(qd)))
    .filter((c) => !filtro || (filtro === "sin" ? !c.tipo : filtro === "manual" ? c.tipo_origen === "manual" : c.tipo_origen === "auto"))
    .map((c) => ({ c, kg: kgCliente(c) })).sort((a, b) => b.kg - a.kg);
  const opciones = (sel) => `<option value="">(automático)</option>` +
    Object.entries(TIPOS).filter(([k]) => k !== "sin").map(([k, v]) => `<option value="${k}"${k === sel ? " selected" : ""}>${v.texto}</option>`).join("");
  $("rev-info").textContent = `${lista.length} clientes con compras, ordenados por kilos. Lo que elijas queda marcado como manual y no lo pisa la regla automática.`;
  $("rev-filas").innerHTML = lista.slice(0, 400).map(({ c, kg }) => `<tr class="${c.tipo_origen === "manual" ? "manual" : ""}" data-doc="${esc(c.doc)}">
    <td><b>${esc(c.razon_social)}</b><br><small>${esc(c.cuit)} · ${esc(c.localidad || "sin localidad")}, ${esc(c.provincia)}</small></td>
    <td>${c.productos.slice(0, 3).map((p) => esc(p.producto)).join(", ")}</td>
    <td class="num">${nf0.format(kg)}</td><td>${fmtFecha(c.ultima_compra)}</td>
    <td><select>${opciones(c.tipo_origen === "manual" ? c.tipo : "")}</select><small>${c.tipo_origen !== "manual" ? "Auto: " + (TIPOS[tipoDe(c)].texto) : ""}</small></td>
    <td><input type="text" value="${esc(c.tipo_nota || "")}" placeholder="Motivo (opcional)"></td></tr>`).join("");
}

function descargarCorrecciones() {
  const filas = [["doc", "razon_social", "tipo", "nota"]];
  for (const c of estado.clientes) {
    if (c.tipo_origen === "manual") filas.push([c.doc, c.razon_social, c.tipo, c.tipo_nota || ""]);
  }
  const csv = filas.map((f) => f.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\r\n");
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" }));
  a.download = "clasificacion_clientes.csv";
  a.click();
  URL.revokeObjectURL(a.href);
}

/* ---- Filtros y buscador ---- */
function poblarFiltros() {
  const kgPorProd = new Map();
  for (const c of estado.clientes) for (const pr of c.productos) kgPorProd.set(pr.producto, (kgPorProd.get(pr.producto) || 0) + pr.kg);
  const prods = [...kgPorProd.entries()].sort((a, b) => b[1] - a[1]).map(([n]) => n);
  $("f-producto").innerHTML = '<option value="">Todos</option>' + prods.map((n) => `<option>${esc(n)}</option>`).join("");
  $("f-provincia").innerHTML = '<option value="">Todas</option>' + estado.zonas.provincias.map((z) => `<option value="${z.cod}">${esc(z.nombre)}</option>`).join("");
}

function limites(geom) {
  const b = [Infinity, Infinity, -Infinity, -Infinity];
  const rec = (a) => (typeof a[0] === "number" ? (b[0] = Math.min(b[0], a[0]), b[1] = Math.min(b[1], a[1]), b[2] = Math.max(b[2], a[0]), b[3] = Math.max(b[3], a[1])) : a.forEach(rec));
  rec(geom.coordinates);
  return b;
}

function irAProvincia() {
  const cod = $("f-provincia").value;
  if (!cod) return estado.map.fitBounds([[-74, -56], [-53, -21.5]], { padding: 20 });
  const f = estado.provGeo.features.find((x) => x.properties.zid === cod);
  if (f) { const b = limites(f.geometry); estado.map.fitBounds([[b[0], b[1]], [b[2], b[3]]], { padding: 40 }); }
}

function abrirCliente(c) {
  if (c.lat == null) return;
  estado.map.flyTo({ center: [c.lon, c.lat], zoom: Math.max(estado.map.getZoom(), 10) });
  abrirFicha(c.doc, [c.lon, c.lat]);
  $("app").classList.remove("abierto");
}

function buscar() {
  const q = $("f-buscar").value.trim().toUpperCase();
  const qd = q.replace(/\D/g, "");
  const res = q.length < 2 ? [] : estado.clientes.filter((c) => c.razon_social.toUpperCase().includes(q) || (qd.length >= 3 && c.doc.includes(qd))).slice(0, 8);
  $("resultados").innerHTML = res.map((c) => `<li data-doc="${esc(c.doc)}"><b>${esc(c.razon_social)}</b><small>${esc(c.cuit)} · ${esc(c.localidad || "sin localidad")}, ${esc(c.provincia)}</small></li>`).join("");
}

function renderUbicacion() {
  const cl = clientesFiltrados();
  const por = (f) => cl.filter(f).length;
  const aprox = cl.filter((c) => c.precision === "provincia" || c.precision === "departamento" || !c.precision);
  const motivos = {};
  for (const c of aprox) if (c.motivo_aprox) motivos[c.motivo_aprox] = (motivos[c.motivo_aprox] || 0) + 1;
  const detalle = Object.entries(motivos).map(([k, n]) => `${n} ${MOTIVO[k]}`).join("; ");
  $("ubicacion").innerHTML = `
    <dt>Por domicilio</dt><dd>${por((c) => c.precision === "direccion")}</dd>
    <dt>Por localidad</dt><dd>${por((c) => c.precision === "localidad")}</dd>
    <dt>Aproximada (provincia/depto.)</dt><dd>${aprox.length}</dd>`;
  $("ubicacion-motivo").textContent = aprox.length ? `Ubicación aproximada: ${detalle}.` : "";
}

function htmlTooltip(z) {
  const c = CLASES[z.clase];
  const dif = z.diferencia < 0 ? `Faltan ${nf1.format(-z.diferencia)}` : `Sobran ${nf1.format(z.diferencia)}`;
  return `<h3>${esc(z.nombre)}</h3>
    ${z.provincia ? `<div class="sub">${esc(z.provincia)}</div>` : ""}
    <span class="estado" style="background:${c.color}">${c.texto}</span>
    <table>
      <tr><td>Población</td><td>${nf0.format(z.poblacion)}</td></tr>
      <tr><td>Aplicadores esperados</td><td>${nf1.format(z.esperados)}</td></tr>
      <tr><td>Aplicadores reales</td><td>${nf0.format(z.activos)}</td></tr>
      <tr><td>Diferencia</td><td>${dif}</td></tr>
      <tr><td>Índice</td><td>${nf2.format(z.indice)}</td></tr>
      ${veProductos() ? `<tr><td>Kg facturados</td><td>${nf0.format(z.kg)}</td></tr>` : ""}
      <tr><td>Última compra</td><td>${fmtFecha(z.ultima)}</td></tr>
    </table>`;
}

function mostrarTooltip(e, z) {
  const t = $("tooltip");
  t.innerHTML = htmlTooltip(z);
  t.hidden = false;
  const caja = $("map").getBoundingClientRect();
  const x = Math.min(e.point.x + 14, caja.width - t.offsetWidth - 8);
  const y = Math.min(e.point.y + 14, caja.height - t.offsetHeight - 8);
  t.style.left = Math.max(8, x) + "px";
  t.style.top = Math.max(8, y) + "px";
}

/* Mapa compartido (?t=TOKEN): estado.publico = { nombres, productos } viene de la foto publicada. */
const veProductos = () => !estado.publico || estado.publico.productos;

function htmlCliente(c) {
  const activo = c.compro && c.ultima_compra >= estado.metricas.corte;
  const productos = c.productos.slice(0, 4).map((p) => `${esc(p.producto)} (${nf0.format(p.kg)} kg, ${p.veces}×)`).join("<br>");
  const aprox = c.precision === "provincia" || c.precision === "departamento";
  const tel = c.telefono ? `<a href="tel:${esc(c.telefono.replace(/[^\d+]/g, ""))}">${esc(c.telefono)}</a>` : "—";
  const mail = c.email ? `<a href="mailto:${esc(c.email)}">${esc(c.email)}</a>` : "—";
  return `<div class="cliente">
    <h3>${esc(c.razon_social)}</h3>
    <span class="estado" style="background:${activo ? "#3c9d5d" : PIN.inactivo}">${c.compro ? (activo ? "Activo" : "Inactivo") : "Solo cotizó"}</span>
    <span class="estado" style="background:${TIPOS[tipoDe(c)].color}">${TIPOS[tipoDe(c)].texto}${c.tipo_origen === "manual" ? " (manual)" : ""}</span>
    <table>
      ${estado.publico ? "" : `<tr><td>CUIT/DNI</td><td>${esc(c.cuit)}</td></tr>
      <tr><td>Teléfono</td><td>${tel}</td></tr>
      <tr><td>Email</td><td>${mail}</td></tr>`}
      <tr><td>Localidad</td><td>${esc(c.localidad || "—")}, ${esc(c.provincia)}</td></tr>
      <tr><td>Última compra</td><td>${fmtFecha(c.ultima_compra)}</td></tr>
      ${veProductos() ? `<tr><td>Facturas</td><td>${c.n_facturas}</td></tr>
      <tr><td>Productos</td><td>${productos || "—"}</td></tr>` : ""}
    </table>
    ${c.tipo_nota && !estado.publico ? `<p class="nota">${esc(c.tipo_nota)}</p>` : ""}
    <p class="${aprox ? "aprox" : "nota"}">${PRECISION[c.precision] || "Sin ubicación"}${aprox && c.motivo_aprox ? ": " + MOTIVO[c.motivo_aprox] : ""}.</p>
  </div>`;
}

/** Ficha de un cliente en un popup. */
function abrirFicha(doc, lngLat) {
  const c = estado.porDoc.get(doc);
  if (!c) return;
  if (estado.popup) estado.popup.remove();
  estado.popup = new maplibregl.Popup({ maxWidth: "320px", offset: 10 }).setLngLat(lngLat).setHTML(htmlCliente(c)).addTo(estado.map);
}

/** Lista de varios clientes en el mismo lugar; tocar uno abre su ficha. */
function abrirLista(docs, lngLat) {
  const corte = estado.metricas.corte;
  const clientes = docs.map((d) => estado.porDoc.get(d)).filter(Boolean)
    .sort((a, b) => (b.ultima_compra || "").localeCompare(a.ultima_compra || ""));
  const filas = clientes.map((c) => {
    const kg = c.productos.reduce((s, p) => s + p.kg, 0);
    const activo = c.compro && c.ultima_compra >= corte;
    return `<li data-doc="${esc(c.doc)}"><i style="background:${activo ? TIPOS[tipoDe(c)].color : PIN.inactivo}"></i>
      <span><b>${esc(c.razon_social)}</b><small>${TIPOS[tipoDe(c)].texto} · ${esc(c.localidad || "sin localidad")} · últ. compra ${fmtFecha(c.ultima_compra)}${veProductos() ? ` · ${nf0.format(kg)} kg` : ""}</small></span></li>`;
  }).join("");
  if (estado.popup) estado.popup.remove();
  const popup = new maplibregl.Popup({ maxWidth: "340px", offset: 10 }).setLngLat(lngLat)
    .setHTML(`<div class="lista"><h3>${clientes.length} clientes en este lugar</h3><ul>${filas}</ul></div>`).addTo(estado.map);
  popup.getElement().querySelector("ul").addEventListener("click", (e) => {
    const li = e.target.closest("li[data-doc]");
    if (li) abrirFicha(li.dataset.doc, lngLat);
  });
  estado.popup = popup;
}

function iniciarMapa() {
  // CSP del CRM: nada de CDNs ni blobs - el worker y las tipografias salen del propio sitio.
  const base = document.baseURI;
  maplibregl.setWorkerUrl(base + "vendor/maplibre-gl-csp-worker.js");
  const map = new maplibregl.Map({
    container: "map",
    style: { version: 8, sources: {}, glyphs: base + "fonts/{fontstack}/{range}.pbf", layers: [{ id: "fondo", type: "background", paint: { "background-color": "#dfe7ee" } }] },
    bounds: [[-74, -56], [-53, -21.5]],
    fitBoundsOptions: { padding: 20 },
    attributionControl: { compact: true, customAttribution: "Límites: IGN · Población: INDEC Censo 2022" },
  });
  estado.map = map;
  map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
  new ResizeObserver(() => map.resize()).observe($("map"));
  const colorClase = ["match", ["get", "clase"], "sobre", CLASES.sobre.color, "ok", CLASES.ok.color, "faltan", CLASES.faltan.color, CLASES.sin.color];

  map.on("load", () => {
    map.resize();
    map.fitBounds([[-74, -56], [-53, -21.5]], { padding: 20, animate: false });
    map.addSource("provincias", { type: "geojson", data: estado.provGeo });
    map.addSource("departamentos", { type: "geojson", data: estado.depGeo });
    map.addSource("clientes", { type: "geojson", data: { type: "FeatureCollection", features: [] }, cluster: true, clusterMaxZoom: 14, clusterRadius: 38 });
    map.addLayer({ id: "prov-relleno", type: "fill", source: "provincias", paint: { "fill-color": colorClase, "fill-opacity": 0.85 } });
    map.addLayer({ id: "dep-relleno", type: "fill", source: "departamentos", paint: { "fill-color": colorClase, "fill-opacity": 0.85 } });
    map.addLayer({ id: "dep-borde", type: "line", source: "departamentos", paint: { "line-color": "#ffffff", "line-width": 0.4 } });
    map.addLayer({ id: "prov-borde", type: "line", source: "provincias", paint: { "line-color": "#ffffff", "line-width": ["interpolate", ["linear"], ["zoom"], 3, 0.8, 7, 2] } });
    map.addLayer({ id: "zona-hover", type: "line", source: "provincias", paint: { "line-color": "#1c2733", "line-width": 2.5 }, filter: ["==", ["get", "zid"], ""] });
    // Alcance por ciudades: zona (union de circulos) y una ciudad = un punto, tamano por poblacion.
    map.addSource("alc-zona", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
    map.addSource("ciudades", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
    map.addLayer({ id: "alc-zona", type: "fill", source: "alc-zona", layout: { visibility: "none" }, paint: { "fill-color": "#3c9d5d", "fill-opacity": 0.2 } });
    map.addLayer({ id: "alc-zona-borde", type: "line", source: "alc-zona", layout: { visibility: "none" }, paint: { "line-color": "#2f7d49", "line-width": 1.4 } });
    map.addLayer({
      id: "ciudades", type: "circle", source: "ciudades", layout: { visibility: "none" },
      paint: {
        "circle-color": ["match", ["get", "clase"], "sin", COLOR_ALCANCE.sin, "uno", COLOR_ALCANCE.uno, COLOR_ALCANCE.varios],
        "circle-radius": ["interpolate", ["linear"], ["sqrt", ["get", "pob"]], 0, 2.5, 100, 3.5, 300, 7, 800, 14, 1250, 22],
        "circle-opacity": 0.85, "circle-stroke-width": 1, "circle-stroke-color": "#ffffff",
      },
    });
    map.addLayer({
      id: "pines-cluster", type: "circle", source: "clientes", filter: ["has", "point_count"],
      paint: { "circle-color": "#1c2733", "circle-opacity": 0.8, "circle-radius": ["step", ["get", "point_count"], 12, 10, 16, 40, 22], "circle-stroke-color": "#fff", "circle-stroke-width": 1.5 },
    });
    map.addLayer({
      id: "pines-cluster-n", type: "symbol", source: "clientes", filter: ["has", "point_count"],
      layout: { "text-field": ["get", "point_count_abbreviated"], "text-size": 12, "text-font": ["Noto Sans Regular"] },
      paint: { "text-color": "#fff" },
    });
    map.addLayer({
      id: "pines", type: "circle", source: "clientes", filter: ["!", ["has", "point_count"]],
      paint: {
        "circle-color": ["case", ["==", ["get", "activo"], 1], expresionColorTipo(), PIN.inactivo],
        "circle-radius": 6.5, "circle-stroke-width": 2,
        "circle-stroke-color": ["case", ["==", ["get", "aprox"], 1], "#f0a30a", "#ffffff"],
        "circle-opacity": ["case", ["==", ["get", "aprox"], 1], 0.65, 1],
      },
    });

    const sobreZona = (e) => {
      if (map.queryRenderedFeatures(e.point, { layers: ["pines", "pines-cluster"] }).length) return; // los pines tienen prioridad
      const f = e.features && e.features[0];
      if (!f) return;
      const z = estado.metricas[estado.nivelActual].get(f.properties.zid);
      map.getCanvas().style.cursor = "pointer";
      const src = estado.nivelActual === "dep" ? "departamentos" : "provincias";
      map.setFilter("zona-hover", ["==", ["get", "zid"], f.properties.zid]);
      map.setLayoutProperty("zona-hover", "visibility", "visible");
      if (z) mostrarTooltip(e, z);
    };
    const salirZona = () => {
      map.getCanvas().style.cursor = "";
      map.setFilter("zona-hover", ["==", ["get", "zid"], ""]);
      $("tooltip").hidden = true;
    };
    for (const capa of ["prov-relleno", "dep-relleno"]) {
      map.on("mousemove", capa, sobreZona);
      map.on("click", capa, sobreZona); // en celular: tocar la zona
      map.on("mouseleave", capa, salirZona);
    }
    map.on("click", "pines-cluster", (e) => {
      const f = map.queryRenderedFeatures(e.point, { layers: ["pines-cluster"] })[0];
      const src = map.getSource("clientes");
      src.getClusterExpansionZoom(f.properties.cluster_id).then((z) => {
        if (z <= 11) return map.easeTo({ center: f.geometry.coordinates, zoom: z + 0.5 });
        // no se separan más: listar todos los clientes del grupo
        src.getClusterLeaves(f.properties.cluster_id, 200, 0).then((hojas) => abrirLista(hojas.map((h) => h.properties.doc), f.geometry.coordinates));
      });
    });
    map.on("click", "pines", (e) => {
      const r = 8; // pines casi superpuestos: se listan todos
      const cerca = map.queryRenderedFeatures([[e.point.x - r, e.point.y - r], [e.point.x + r, e.point.y + r]], { layers: ["pines"] });
      const docs = [...new Set(cerca.map((f) => f.properties.doc))];
      $("tooltip").hidden = true;
      if (docs.length > 1) return abrirLista(docs, e.features[0].geometry.coordinates);
      abrirFicha(docs[0], e.features[0].geometry.coordinates);
    });
    for (const id of ["pines", "pines-cluster"]) {
      map.on("mouseenter", id, () => { map.getCanvas().style.cursor = "pointer"; $("tooltip").hidden = true; });
      map.on("mouseleave", id, () => { map.getCanvas().style.cursor = ""; });
    }
    map.on("click", "ciudades", (e) => {
      if (map.queryRenderedFeatures(e.point, { layers: ["pines", "pines-cluster"] }).length) return; // los pines tienen prioridad
      new maplibregl.Popup({ maxWidth: "300px", offset: 8 }).setLngLat(e.features[0].geometry.coordinates).setHTML(htmlCiudad(e.features[0])).addTo(map);
    });
    map.on("mouseenter", "ciudades", () => { map.getCanvas().style.cursor = "pointer"; });
    map.on("mouseleave", "ciudades", () => { map.getCanvas().style.cursor = ""; });
    map.on("zoomend", () => { if (parametros().nivel === "auto") { aplicarVisibilidad(); renderRanking(); } });
    pintar();
  });
}

/* Los clientes NUNCA vienen de un archivo publico:
 *  - Dentro del CRM (iframe del mismo origen): el CRM los manda por postMessage con la sesion ya iniciada.
 *  - Link compartido (?t=TOKEN): se piden a /api/mapa-publico, que devuelve solo la foto que Felipe publico. */
function esperarClientes() {
  const token = new URLSearchParams(location.search).get("t");
  if (token) {
    return fetch("/api/mapa-publico?t=" + encodeURIComponent(token), { cache: "no-store" })
      .then((r) => { if (!r.ok) throw new Error(r.status === 404 ? "este mapa ya no está disponible" : "http " + r.status); return r.json(); })
      .then((foto) => { estado.publico = foto.publico || { nombres: false, productos: false }; document.body.classList.add("publico"); return foto; });
  }
  return new Promise((resolve, reject) => {
    const limite = setTimeout(() => reject(new Error("el CRM no envió los datos")), 20000);
    window.addEventListener("message", (e) => {
      if (e.origin !== location.origin || !e.data || e.data.tipo !== "mapa:clientes") return;
      clearTimeout(limite);
      const recibido = { clientes: e.data.clientes, fecha_export: e.data.fecha_export };
      // La primera vez arranca el mapa; despues, cada cambio en el CRM (un cliente nuevo, uno
      // marcado como aplicador, una ciudad editada) llega aca y actualiza los pines sin recargar.
      if (estado.cargado) actualizarClientes(recibido); else resolve(recibido);
    });
    if (window.parent !== window) window.parent.postMessage({ tipo: "mapa:listo" }, location.origin);
  });
}

function actualizarClientes(recibido) {
  estado.clientes = recibido.clientes;
  estado.meta = { fecha_export: recibido.fecha_export };
  estado.porDoc = new Map(estado.clientes.map((c) => [c.doc, c]));
  $("meta-export").textContent = `datos al ${fmtFecha(estado.meta.fecha_export)}`;
  $("fila-aplicador").hidden = !estado.clientes.some((c) => c.tipo);
  if (estado.map && estado.map.isStyleLoaded()) {
    clearTimeout(estado.tActualizar);
    estado.tActualizar = setTimeout(pintar, 200);
  }
}

async function cargar() {
  const leer = (u) => fetch(u).then((r) => { if (!r.ok) throw new Error(u); return r.json(); });
  let prov, dep, recibido, ciudades;
  [recibido, estado.zonas, prov, dep, ciudades] = await Promise.all([
    esperarClientes(), leer("data/zonas.json"),
    leer("data/provincias.geojson"), leer("data/departamentos.geojson"), leer("data/ciudades.json"),
  ]);
  estado.ciudades = ciudades.ciudades;
  estado.clientes = recibido.clientes;
  estado.meta = { fecha_export: recibido.fecha_export };
  for (const f of prov.features) f.properties.zid = f.properties.in1;
  for (const f of dep.features) f.properties.zid = f.properties.id;
  estado.provGeo = prov;
  estado.depGeo = dep;
  estado.porDoc = new Map(estado.clientes.map((c) => [c.doc, c]));
  $("meta-export").textContent = `datos al ${fmtFecha(estado.meta.fecha_export)}`;
  $("fila-aplicador").hidden = !estado.clientes.some((c) => c.tipo);
  poblarFiltros();
  renderLeyenda();
  iniciarMapa();
  estado.cargado = true;
}

$("abrir-revisar").addEventListener("click", () => { renderRevisar(); $("revisar").hidden = false; });
$("rev-cerrar").addEventListener("click", () => { $("revisar").hidden = true; });
$("revisar").addEventListener("click", (e) => { if (e.target.id === "revisar") $("revisar").hidden = true; });
$("rev-buscar").addEventListener("input", renderRevisar);
$("rev-filtro").addEventListener("change", renderRevisar);
$("rev-csv").addEventListener("click", descargarCorrecciones);
$("rev-filas").addEventListener("change", (e) => {
  const tr = e.target.closest("tr[data-doc]");
  if (!tr) return;
  cambiarTipo(tr.dataset.doc, tr.querySelector("select").value, tr.querySelector("input").value.trim());
  tr.classList.toggle("manual", !!tr.querySelector("select").value);
});
$("f-buscar").addEventListener("input", buscar);
$("resultados").addEventListener("click", (e) => { const li = e.target.closest("li"); if (li) abrirCliente(estado.porDoc.get(li.dataset.doc)); });
$("tab-deficit").addEventListener("click", () => { $("tab-deficit").classList.add("activa"); $("tab-sobre").classList.remove("activa"); renderRanking(); });
$("tab-sobre").addEventListener("click", () => { $("tab-sobre").classList.add("activa"); $("tab-deficit").classList.remove("activa"); renderRanking(); });
$("exportar").addEventListener("click", exportarExcel);
$("f-provincia").addEventListener("change", irAProvincia);
$("f-limpiar").addEventListener("click", () => {
  for (const id of ["f-producto", "f-provincia", "f-estado", "f-tipo", "f-desde", "f-hasta"]) $(id).value = "";
  irAProvincia(); renderLeyenda(); pintar();
});
$("ranking").addEventListener("click", (e) => {
  const li = e.target.closest("li[data-id]");
  if (!li) return;
  const src = estado.nivelActual === "dep" ? estado.depGeo : estado.provGeo;
  const f = src.features.find((x) => x.properties.zid === li.dataset.id);
  if (f) { const b = limites(f.geometry); estado.map.fitBounds([[b[0], b[1]], [b[2], b[3]]], { padding: 60, maxZoom: 9 }); $("app").classList.remove("abierto"); }
});
$("alc-ranking").addEventListener("click", (e) => {
  const li = e.target.closest("li[data-lon]");
  if (li) { estado.map.flyTo({ center: [Number(li.dataset.lon), Number(li.dataset.lat)], zoom: 8 }); $("app").classList.remove("abierto"); }
});
for (const id of ["p-x", "p-meses", "p-bajo", "p-alto", "p-aplicador", "p-pines", "p-nivel", "p-radio", "p-piso", "f-producto", "f-provincia", "f-estado", "f-desde", "f-hasta"]) {
  $(id).addEventListener("input", () => { if (estado.map && estado.map.isStyleLoaded()) { renderLeyenda(); pintar(); } });
}
$("toggle-panel").addEventListener("click", () => $("app").classList.toggle("abierto"));
cargar().catch((err) => { $("meta-export").textContent = "error al cargar datos (" + err.message + ")"; console.error(err); });
