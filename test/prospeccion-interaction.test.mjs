import { test, describe, afterEach } from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react";
import { loadJsxModule } from "./helpers/load-jsx.mjs";

afterEach(cleanup);

describe("Prospeccion.jsx - interacción real", () => {
  const paragraph = (pattern) => screen.getByText((_, node) => node.tagName === "P" && pattern.test(node.textContent.replace(/\s+/g, " ")));
  async function mount(initial, extra = {}) {
    const mod = await loadJsxModule("src/Prospeccion.jsx");
    const snapshots = [];
    function Wrapper() {
      const [state, setState] = React.useState(initial);
      const setData = (next) => setState((previous) => {
        const value = typeof next === "function" ? next(previous) : next;
        snapshots.push(value);
        return value;
      });
      return React.createElement(mod.Prospeccion, { data: state, setData, userEmail: "marketing@grupopoliplast.com.ar", onOpenClient: () => {}, ...extra });
    }
    render(React.createElement(Wrapper));
    return snapshots;
  }

  test("una cuenta nueva arranca vacía y puede cargar un prospecto a mano", async () => {
    const snapshots = await mount({ clients: [], prospects: [] });
    assert.ok(screen.getByText("Todavía no cargaste prospectos."));
    fireEvent.click(screen.getByText("Cargar prospecto"));
    fireEvent.change(screen.getByLabelText("Empresa"), { target: { value: "Corralón Norte" } });
    fireEvent.click(screen.getByText("Guardar prospecto"));
    await waitFor(() => screen.getByText("Corralón Norte"));
    assert.equal(snapshots.at(-1).prospects.length, 1);
    assert.equal(snapshots.at(-1).prospects[0].state, "No contactado");
  });

  test("pegar una lista etiqueta como 'Ya en el CRM' al que ya es cliente", async () => {
    await mount({ clients: [{ id: "c1", company: "PIERANDREI S.A.", city: "Paraná" }], prospects: [] });
    fireEvent.click(screen.getByText(/Importar o pegar una lista de prospectos/));
    fireEvent.change(screen.getByLabelText("Lista de prospectos"), { target: { value: "Empresa;Localidad\nPierandrei;Parana\nFerretería Sur;Colón" } });
    fireEvent.click(screen.getByText("Revisar lista"));
    await waitFor(() => paragraph(/2 filas: 1 nuevas, 1 ya en el CRM, 0 posibles duplicadas/));
    fireEvent.click(screen.getByText("Confirmar importación (1)"));
    await waitFor(() => screen.getByText("Ferretería Sur"));
    assert.equal(screen.queryByText(/^Pierandrei$/), null, "la que ya es cliente no se carga como prospecto");
  });

  test("marcar Contactado pasa el prospecto a Empresas y no se duplica al repetir", async () => {
    const snapshots = await mount({ clients: [], prospects: [{ id: "p1", company: "Ferretería Sur", family: "Penosil", state: "No contactado", source: "Carga manual", city: "Colón" }] });
    fireEvent.click(screen.getAllByText("Contactado").find((node) => node.tagName === "BUTTON"));
    await waitFor(() => assert.equal(snapshots.at(-1).clients.length, 1));
    assert.equal(snapshots.at(-1).clients[0].family, "Penosil");
    assert.equal(snapshots.at(-1).prospects[0].linkedClientId, snapshots.at(-1).clients[0].id);
    fireEvent.click(screen.getAllByText("Con interés").find((node) => node.tagName === "BUTTON"));
    await waitFor(() => assert.equal(snapshots.at(-1).prospects[0].state, "Con interés"));
    assert.equal(snapshots.at(-1).clients.length, 1);
  });

  test("la lista del día excluye competidores, duplicados y familias pausadas", async () => {
    await mount({
      clients: [{ id: "c1", company: "Ya Cliente S.A.", city: "Paraná" }],
      prospects: [
        { id: "a", company: "Nuevo Uno", family: "Penosil", state: "No contactado", source: "x", phone: "1" },
        { id: "b", company: "Ya Cliente", family: "Penosil", state: "No contactado", source: "x", city: "Paraná" },
        { id: "c", company: "Argenpur Sur", family: "Penosil", state: "No contactado", source: "x", competitor: true },
        { id: "d", company: "Alm Pausada", family: "Almohadas", state: "No contactado", source: "x" },
      ],
    });
    fireEvent.click(screen.getByText("Generar mi lista del día"));
    await waitFor(() => screen.getByText(/Lista del día: 1 prospectos/));
    assert.ok(screen.getByText("Nuevo Uno"));
    assert.equal(screen.queryByText("Argenpur Sur"), null);
    assert.equal(screen.queryByText("Alm Pausada"), null);
  });

  const CITIES = [
    { id: "1", nombre: "Córdoba", prov: "14", pob: 1505250, lat: -31.41, lon: -64.18 },
    { id: "2", nombre: "Paraná", prov: "30", pob: 250000, lat: -31.73, lon: -60.52 },
  ];

  test("la lupa busca en la zona elegida, carga lo nuevo, anota la búsqueda y no repite lo ya cargado", async () => {
    const original = globalThis.fetch;
    const calls = [];
    const results = [
      { company: "Ferretería El Clavo", family: "Penosil", rubro: "ferretería", city: "Córdoba", province: "Córdoba", phone: "+54 351 4000000", osmId: "node/1", source: "OpenStreetMap" },
      { company: "Corralón Norte", family: "Penosil", rubro: "corralón", city: "Córdoba", province: "Córdoba", osmId: "way/2", source: "OpenStreetMap" },
    ];
    globalThis.fetch = async (url, options) => {
      calls.push({ url, body: JSON.parse(options.body) });
      return { ok: true, json: async () => ({ ok: true, count: results.length, truncated: false, stats: { returned: 2, withPhone: 1, withWebsite: 0 }, ms: 3400, attempts: 1, endpoint: "overpass-api.de", results }) };
    };
    try {
      const snapshots = await mount({ clients: [], prospects: [], prospectSearches: [], prospectSwitches: {} }, { cities: CITIES, session: { access_token: "t" } });
      fireEvent.change(screen.getByLabelText("Familia de hoy"), { target: { value: "Penosil" } });
      fireEvent.click(await waitFor(() => screen.getByText(/^Córdoba · Pendiente/)));
      fireEvent.click(screen.getByText("Buscar en Córdoba"));
      await waitFor(() => assert.equal(snapshots.at(-1).prospects.length, 2));
      assert.equal(calls[0].url, "/api/prospeccion");
      assert.deepEqual(calls[0].body.rubros.slice(0, 2), ["ferretería", "corralón"]);
      assert.equal(calls[0].body.family, "Penosil");
      assert.equal(snapshots.at(-1).prospectSearches.length, 1);
      assert.equal(snapshots.at(-1).prospectSearches[0].zoneId, "1");
      assert.equal(snapshots.at(-1).prospectSearches[0].found, 2);
      assert.ok(screen.getByText("Córdoba · OpenStreetMap devolvió 2 (1 con teléfono, 0 con sitio web) · 2 nuevos, 0 repetidos · 3,4 s."));
      assert.equal(snapshots.at(-1).prospectSearches[0].ms, 3400);
      assert.equal(snapshots.at(-1).prospectSearches[0].endpoint, "overpass-api.de");
      fireEvent.click(screen.getByText(/Historial de búsquedas \(1\)/));
      assert.ok(screen.getByText("3,4 s"));

      // misma zona otra vez: lo ya cargado no se duplica
      fireEvent.click(screen.getByText("Buscar en Córdoba"));
      await waitFor(() => assert.equal(snapshots.at(-1).prospectSearches.length, 2));
      assert.equal(snapshots.at(-1).prospects.length, 2);
      assert.ok(screen.getByText(/OpenStreetMap devolvió 2 \(1 con teléfono, 0 con sitio web\) · 0 nuevos, 2 repetidos/));
      const second = snapshots.at(-1).prospectSearches.at(-1);
      assert.deepEqual([second.returned, second.withPhone, second.withWebsite, second.fresh, second.repeated], [2, 1, 0, 0, 2]);
    } finally {
      globalThis.fetch = original;
    }
  });

  test("si la búsqueda falla se muestra el motivo, queda en el historial y la zona sigue pendiente", async () => {
    const original = globalThis.fetch;
    const reason = "OpenStreetMap tardó demasiado en responder. Probá con una zona más chica, con menos rubros o un poco más tarde. (se probaron 2 servidores)";
    globalThis.fetch = async () => ({ ok: false, json: async () => ({ error: reason, kind: "timeout", attempts: 2, ms: 26000 }) });
    try {
      const snapshots = await mount({ clients: [], prospects: [], prospectSearches: [] }, { cities: CITIES, session: { access_token: "t" } });
      fireEvent.change(screen.getByLabelText("Familia de hoy"), { target: { value: "Penosil" } });
      fireEvent.click(await waitFor(() => screen.getAllByText(/· Pendiente/)[0]));
      fireEvent.click(screen.getByText(/^Buscar en /));
      await waitFor(() => assert.ok(screen.getAllByText((text) => text.includes(reason)).length >= 1));
      const logged = snapshots.at(-1).prospectSearches[0];
      assert.deepEqual([logged.status, logged.failed, logged.ms], ["error", true, 26000]);
      assert.equal(snapshots.at(-1).prospects.length, 0);
      assert.ok(screen.getAllByText(/· Pendiente/).length > 0, "la zona sigue pendiente");
      fireEvent.click(screen.getByText(/Historial de búsquedas \(1\)/));
      assert.ok(screen.getAllByText(/^Error: OpenStreetMap tardó demasiado/).length >= 1);
    } finally {
      globalThis.fetch = original;
    }
  });

  test("'Terminé esta zona' la deja agotada y deja de sugerirse", async () => {
    const snapshots = await mount({ clients: [], prospects: [], prospectSearches: [] }, { cities: CITIES, session: { access_token: "t" } });
    fireEvent.change(screen.getByLabelText("Familia de hoy"), { target: { value: "Penosil" } });
    fireEvent.click(await waitFor(() => screen.getByText(/^Córdoba · Pendiente/)));
    fireEvent.click(screen.getByText("Terminé esta zona (por ahora)"));
    await waitFor(() => assert.equal(snapshots.at(-1).prospectSearches[0].exhausted, true));
    assert.equal(screen.queryByText(/^Córdoba · /), null);
    assert.ok(screen.getByText(/^Paraná · Pendiente/));
  });

  test("el foco vigente se ve en el plan y se puede fijar una familia para la semana", async () => {
    const snapshots = await mount({ clients: [], prospects: [], prospectSearches: [] }, { cities: CITIES });
    assert.ok(screen.getByText(/Foco vigente: rotación diaria, hoy: /));
    fireEvent.change(screen.getByLabelText("Foco de la semana"), { target: { value: "Resinplast" } });
    await waitFor(() => screen.getByText(/Foco vigente: esta semana: Resinplast/));
    assert.equal(snapshots.at(-1).prospectFocus.family, "Resinplast");
    assert.equal(screen.getByLabelText("Familia de hoy").value, "Resinplast");
  });

  test("las familias pausadas no se ofrecen en el plan y Baldes arranca pausada", async () => {
    await mount({ clients: [], prospects: [], prospectSearches: [] }, { cities: CITIES });
    const options = () => [...screen.getByLabelText("Familia de hoy").querySelectorAll("option")].map((node) => node.textContent);
    assert.ok(!options().includes("Baldes") && !options().includes("Pisos") && !options().includes("Almohadas"));
    assert.ok(options().includes("Resinplast"));
    fireEvent.click(screen.getByLabelText(/^Resinplast/));
    await waitFor(() => assert.ok(!options().includes("Resinplast")));
    fireEvent.click(screen.getByLabelText(/^Baldes/));
    await waitFor(() => assert.ok(options().includes("Baldes")));
  });

  test("pausar una familia no borra su avance de cobertura", async () => {
    const searches = [{ id: "s1", family: "Penosil", zoneId: "1", zoneName: "Córdoba", date: "2026-10-14", found: 12 }];
    const prospectsList = [{ id: "p1", company: "Ferretería Uno", family: "Penosil", city: "Córdoba", state: "Contactado", source: "x" }];
    const snapshots = await mount({ clients: [], prospects: prospectsList, prospectSearches: searches }, { cities: CITIES });
    fireEvent.click(screen.getByLabelText(/^Penosil/));
    await waitFor(() => assert.equal(snapshots.at(-1).prospectSwitches.Penosil, false));
    assert.equal(snapshots.at(-1).prospects.length, 1);
    assert.equal(snapshots.at(-1).prospectSearches.length, 1);
    assert.ok(screen.getByText("Ferretería Uno"));
    assert.ok(screen.getByText("Cobertura por familia y localidad"));
  });

  const RELEVAMIENTO = [
    "Nombre empresa;Familia;Subfamilia;provincia;ciudad;Maquina;Proveedor;telefono;email;Estado;Comercial;Contacto;observaciones;Fecha de seguimiento;Tipo entidad;Producto / propuesta;Estado comercial;Valor potencial;Próxima acción;Fecha próxima acción",
    "Optimall;Planchas de PUR;Aislantes;Buenos Aires;Mar del Plata;Pegadora;Argenpur;+54 223 4000000;ventas@optimall.com;Relevado;Felipe;Marcos;Compra por pallet;2026-10-20;Fabricante;Plancha 1000x1100;Prospecto;USD 5000;Llamar;2026-10-21",
    "Astori Estructuras;PRFV;;Santa Fe;Rosario;;;;;;;;;;;;;;;",
  ].join("\n");

  test("la importación muestra la vista previa con las columnas de RELEVAMIENTO y recién al confirmar carga los prospectos", async () => {
    const snapshots = await mount({ clients: [], prospects: [] }, { cities: CITIES });
    fireEvent.click(screen.getByText(/Importar o pegar una lista de prospectos/));
    fireEvent.change(screen.getByLabelText("Lista de prospectos"), { target: { value: RELEVAMIENTO } });
    fireEvent.click(screen.getByText("Revisar lista"));
    await waitFor(() => paragraph(/2 filas: 2 nuevas, 0 ya en el CRM, 0 posibles duplicadas, 0 ya cargadas como prospecto/));
    assert.equal(snapshots.length, 0, "todavía no se guardó nada");
    fireEvent.click(screen.getByText("Confirmar importación (2)"));
    await waitFor(() => assert.equal(snapshots.at(-1).prospects.length, 2));
    const [optimall, astori] = snapshots.at(-1).prospects;
    assert.deepEqual([optimall.state, optimall.source, optimall.family], ["No contactado", "importado", "Planchas"]);
    assert.equal(astori.family, "Resinplast", "PRFV se prospecta bajo Resinplast");
    assert.equal(optimall.contact, "Marcos");
    assert.equal(optimall.currentSupplier, "Argenpur");
    assert.equal(optimall.imported.proposal, "Plancha 1000x1100");
    assert.equal(optimall.competitor, false);
  });

  test("la importación detecta repetidas dentro del archivo, posibles duplicadas y ya cargadas", async () => {
    await mount({
      clients: [{ id: "c1", company: "Silvacom S.R.L.", city: "" }],
      prospects: [{ id: "p0", company: "Corralón Norte", family: "Penosil", city: "Colón", state: "No contactado", source: "x" }],
    }, { cities: CITIES });
    fireEvent.click(screen.getByText(/Importar o pegar una lista de prospectos/));
    fireEvent.change(screen.getByLabelText("Lista de prospectos"), {
      target: { value: "Empresa;Ciudad\nSILVACOM;Concordia\nCorralón Norte S.A.;Colón\nFerretería Sur;Paraná\nFerretería Sur S.R.L.;Paraná" },
    });
    fireEvent.click(screen.getByText("Revisar lista"));
    await waitFor(() => paragraph(/4 filas: 1 nuevas, 0 ya en el CRM, 1 posibles duplicadas, 2 ya cargadas como prospecto/));
    fireEvent.click(screen.getByText("Confirmar importación (2)"));
    await waitFor(() => screen.getByText(/Se importaron 2 prospectos como "No contactado" \(fuente: importado\)\. Se omitieron 2/));
  });

  test("también se puede subir un archivo CSV y ver la misma vista previa", async () => {
    await mount({ clients: [], prospects: [] }, { cities: CITIES });
    fireEvent.click(screen.getByText(/Importar o pegar una lista de prospectos/));
    const file = new File(["Nombre empresa;Familia;ciudad\r\nFerretería Uno;Penosil;Paraná\r\nCorralón Dos;Penosil;Colón"], "relevamiento.csv", { type: "text/csv" });
    fireEvent.change(screen.getByLabelText("Archivo de prospectos"), { target: { files: [file] } });
    await waitFor(() => paragraph(/2 filas: 2 nuevas/));
    assert.ok(screen.getByText("Confirmar importación (2)"));
    fireEvent.click(screen.getByText("Cancelar"));
    assert.equal(screen.queryByText("Confirmar importación (2)"), null);
  });
});

describe("Prospeccion.jsx - enriquecimiento", () => {
  test("el botón lee el sitio y completa Instagram sin pisar lo cargado", async () => {
    const mod = await loadJsxModule("src/Prospeccion.jsx");
    const original = globalThis.fetch;
    globalThis.fetch = async (url, options) => {
      if (String(url) === "/api/prospeccion") {
        assert.equal(JSON.parse(options.body).action, "enrich");
        return new Response(JSON.stringify({ ok: true, facebook: "", instagram: "https://www.instagram.com/norte", emails: ["x@y.com"], whatsapp: null }), { status: 200 });
      }
      return new Response("{}", { status: 200 });
    };
    try {
      const snapshots = [];
      function Wrapper() {
        const [state, setState] = React.useState({ clients: [], prospects: [{ id: "p1", company: "Norte", family: "Penosil", state: "No contactado", source: "OpenStreetMap", website: "norte.com.ar", email: "mio@norte.com.ar" }] });
        const setData = (next) => setState((previous) => { const value = typeof next === "function" ? next(previous) : next; snapshots.push(value); return value; });
        return React.createElement(mod.Prospeccion, { data: state, setData, userEmail: "a@b.com", session: { access_token: "t" }, onOpenClient: () => {} });
      }
      render(React.createElement(Wrapper));
      fireEvent.click(screen.getByText("Buscar redes y contacto en su sitio"));
      await waitFor(() => screen.getByText(/Agregado desde su sitio: Instagram\./));
      const saved = snapshots.at(-1).prospects[0];
      assert.equal(saved.instagram, "https://www.instagram.com/norte");
      assert.equal(saved.email, "mio@norte.com.ar");
    } finally { globalThis.fetch = original; }
  });
});
