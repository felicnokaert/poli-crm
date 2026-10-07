/* Mapa de cobertura de aplicadores POLIOCHO. Front estático: lee data/*.json generados por etl/. */
const CLASES = {
  sobre:  { texto: "Sobresaturada",      color: "#3b6fb6" },
  ok:     { texto: "Equilibrada",        color: "#3c9d5d" },
  faltan: { texto: "Faltan aplicadores", color: "#d9534f" },
  sin:    { texto: "Sin clientes",       color: "#b9c1c9" },
};
const PIN = { activo: "#7b3fe4", inactivo: "#6b7785" };
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
    pines: $("p-pines").checked,
    nivel: $("p-nivel").value,
    piso: Math.max(0, Number($("p-piso").value) || 0),
    producto: $("f-producto").value,
    provincia: $("f-provincia").value,
    estadoPin: $("f-estado").value,
    desde: $("f-desde").value,
    hasta: $("f-hasta").value,
  };
}

/** Clientes que pasan los filtros de producto, rango de última compra y aplicador (afectan métricas y pines). */
function clientesFiltrados() {
  const p = parametros();
  return estado.clientes.filter((c) => {
    if (p.soloAplicadores && c.es_aplicador !== "si") return false;
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
  for (const c of clientesFiltrados()) {
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
  aplicarVisibilidad();
  renderResumen(m);
}

function aplicarVisibilidad() {
  const p = parametros();
  const map = estado.map;
  const usaDeptos = p.nivel === "dep" || (p.nivel === "auto" && map.getZoom() >= ZOOM_DEPTOS);
  map.setLayoutProperty("prov-relleno", "visibility", usaDeptos ? "none" : "visible");
  map.setLayoutProperty("dep-relleno", "visibility", usaDeptos ? "visible" : "none");
  map.setLayoutProperty("dep-borde", "visibility", usaDeptos ? "visible" : "none");
  for (const id of ["pines", "pines-cluster", "pines-cluster-n"]) map.setLayoutProperty(id, "visibility", p.pines ? "visible" : "none");
  estado.nivelActual = usaDeptos ? "dep" : "prov";
}

function renderLeyenda() {
  const p = parametros();
  const t = {
    sobre: `Sobresaturada (índice > ${nf2.format(p.alto)})`,
    ok: `Equilibrada (${nf2.format(p.bajo)} a ${nf2.format(p.alto)})`,
    faltan: `Faltan aplicadores (< ${nf2.format(p.bajo)})`,
    sin: "Sin clientes activos (0)",
  };
  $("leyenda").innerHTML = Object.entries(CLASES).map(([k, v]) => `<li><i style="background:${v.color}"></i>${t[k]}</li>`).join("") +
    `<li><i class="pin" style="background:${PIN.activo}"></i>Cliente activo (pin)</li>` +
    `<li><i class="pin" style="background:${PIN.inactivo}"></i>Cliente inactivo (pin)</li>`;
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
  new maplibregl.Popup({ maxWidth: "320px", offset: 10 }).setLngLat([c.lon, c.lat]).setHTML(htmlCliente(c)).addTo(estado.map);
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
      <tr><td>Kg facturados</td><td>${nf0.format(z.kg)}</td></tr>
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

function htmlCliente(c) {
  const activo = c.compro && c.ultima_compra >= estado.metricas.corte;
  const productos = c.productos.slice(0, 4).map((p) => `${esc(p.producto)} (${nf0.format(p.kg)} kg, ${p.veces}×)`).join("<br>");
  const aprox = c.precision === "provincia" || c.precision === "departamento";
  const tel = c.telefono ? `<a href="tel:${esc(c.telefono.replace(/[^\d+]/g, ""))}">${esc(c.telefono)}</a>` : "—";
  const mail = c.email ? `<a href="mailto:${esc(c.email)}">${esc(c.email)}</a>` : "—";
  return `<div class="cliente">
    <h3>${esc(c.razon_social)}</h3>
    <span class="estado" style="background:${activo ? PIN.activo : PIN.inactivo}">${c.compro ? (activo ? "Activo" : "Inactivo") : "Solo cotizó"}</span>
    ${c.es_aplicador === "si" ? '<span class="estado" style="background:#3c9d5d">Aplicador</span>' : ""}
    <table>
      <tr><td>CUIT/DNI</td><td>${esc(c.cuit)}</td></tr>
      <tr><td>Teléfono</td><td>${tel}</td></tr>
      <tr><td>Email</td><td>${mail}</td></tr>
      <tr><td>Localidad</td><td>${esc(c.localidad || "—")}, ${esc(c.provincia)}</td></tr>
      <tr><td>Última compra</td><td>${fmtFecha(c.ultima_compra)}</td></tr>
      <tr><td>Facturas</td><td>${c.n_facturas}</td></tr>
      <tr><td>Productos</td><td>${productos || "—"}</td></tr>
    </table>
    <p class="${aprox ? "aprox" : "nota"}">${PRECISION[c.precision] || "Sin ubicación"}${aprox && c.motivo_aprox ? ": " + MOTIVO[c.motivo_aprox] : ""}.</p>
  </div>`;
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
    map.addSource("clientes", { type: "geojson", data: { type: "FeatureCollection", features: [] }, cluster: true, clusterMaxZoom: 9, clusterRadius: 38 });
    map.addLayer({ id: "prov-relleno", type: "fill", source: "provincias", paint: { "fill-color": colorClase, "fill-opacity": 0.85 } });
    map.addLayer({ id: "dep-relleno", type: "fill", source: "departamentos", paint: { "fill-color": colorClase, "fill-opacity": 0.85 } });
    map.addLayer({ id: "dep-borde", type: "line", source: "departamentos", paint: { "line-color": "#ffffff", "line-width": 0.4 } });
    map.addLayer({ id: "prov-borde", type: "line", source: "provincias", paint: { "line-color": "#ffffff", "line-width": ["interpolate", ["linear"], ["zoom"], 3, 0.8, 7, 2] } });
    map.addLayer({ id: "zona-hover", type: "line", source: "provincias", paint: { "line-color": "#1c2733", "line-width": 2.5 }, filter: ["==", ["get", "zid"], ""] });
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
        "circle-color": ["case", ["==", ["get", "activo"], 1], PIN.activo, PIN.inactivo],
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
      map.getSource("clientes").getClusterExpansionZoom(f.properties.cluster_id).then((z) => map.easeTo({ center: f.geometry.coordinates, zoom: z + 0.5 }));
    });
    map.on("click", "pines", (e) => {
      const c = estado.porDoc.get(e.features[0].properties.doc);
      if (!c) return;
      $("tooltip").hidden = true;
      new maplibregl.Popup({ maxWidth: "320px", offset: 10 }).setLngLat(e.features[0].geometry.coordinates).setHTML(htmlCliente(c)).addTo(map);
    });
    for (const id of ["pines", "pines-cluster"]) {
      map.on("mouseenter", id, () => { map.getCanvas().style.cursor = "pointer"; $("tooltip").hidden = true; });
      map.on("mouseleave", id, () => { map.getCanvas().style.cursor = ""; });
    }
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
      .then((r) => { if (!r.ok) throw new Error(r.status === 404 ? "este mapa ya no está disponible" : "http " + r.status); return r.json(); });
  }
  return new Promise((resolve, reject) => {
    const limite = setTimeout(() => reject(new Error("el CRM no envió los datos")), 20000);
    window.addEventListener("message", (e) => {
      if (e.origin !== location.origin || !e.data || e.data.tipo !== "mapa:clientes") return;
      clearTimeout(limite);
      resolve({ clientes: e.data.clientes, fecha_export: e.data.fecha_export });
    });
    if (window.parent !== window) window.parent.postMessage({ tipo: "mapa:listo" }, location.origin);
  });
}

async function cargar() {
  const leer = (u) => fetch(u).then((r) => { if (!r.ok) throw new Error(u); return r.json(); });
  let prov, dep, recibido;
  [recibido, estado.zonas, prov, dep] = await Promise.all([
    esperarClientes(), leer("data/zonas.json"),
    leer("data/provincias.geojson"), leer("data/departamentos.geojson"),
  ]);
  estado.clientes = recibido.clientes;
  estado.meta = { fecha_export: recibido.fecha_export };
  for (const f of prov.features) f.properties.zid = f.properties.in1;
  for (const f of dep.features) f.properties.zid = f.properties.id;
  estado.provGeo = prov;
  estado.depGeo = dep;
  estado.porDoc = new Map(estado.clientes.map((c) => [c.doc, c]));
  $("meta-export").textContent = `datos al ${fmtFecha(estado.meta.fecha_export)}`;
  $("fila-aplicador").hidden = !estado.clientes.some((c) => c.es_aplicador);
  poblarFiltros();
  renderLeyenda();
  iniciarMapa();
}

$("f-buscar").addEventListener("input", buscar);
$("resultados").addEventListener("click", (e) => { const li = e.target.closest("li"); if (li) abrirCliente(estado.porDoc.get(li.dataset.doc)); });
$("tab-deficit").addEventListener("click", () => { $("tab-deficit").classList.add("activa"); $("tab-sobre").classList.remove("activa"); renderRanking(); });
$("tab-sobre").addEventListener("click", () => { $("tab-sobre").classList.add("activa"); $("tab-deficit").classList.remove("activa"); renderRanking(); });
$("exportar").addEventListener("click", exportarExcel);
$("f-provincia").addEventListener("change", irAProvincia);
$("f-limpiar").addEventListener("click", () => {
  for (const id of ["f-producto", "f-provincia", "f-estado", "f-desde", "f-hasta"]) $(id).value = "";
  irAProvincia(); renderLeyenda(); pintar();
});
$("ranking").addEventListener("click", (e) => {
  const li = e.target.closest("li[data-id]");
  if (!li) return;
  const src = estado.nivelActual === "dep" ? estado.depGeo : estado.provGeo;
  const f = src.features.find((x) => x.properties.zid === li.dataset.id);
  if (f) { const b = limites(f.geometry); estado.map.fitBounds([[b[0], b[1]], [b[2], b[3]]], { padding: 60, maxZoom: 9 }); $("app").classList.remove("abierto"); }
});
for (const id of ["p-x", "p-meses", "p-bajo", "p-alto", "p-aplicador", "p-pines", "p-nivel", "p-piso", "f-producto", "f-provincia", "f-estado", "f-desde", "f-hasta"]) {
  $(id).addEventListener("input", () => { if (estado.map && estado.map.isStyleLoaded()) { renderLeyenda(); pintar(); } });
}
$("toggle-panel").addEventListener("click", () => $("app").classList.toggle("abierto"));
cargar().catch((err) => { $("meta-export").textContent = "error al cargar datos (" + err.message + ")"; console.error(err); });
