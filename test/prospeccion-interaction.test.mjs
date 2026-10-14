import { test, describe, afterEach } from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react";
import { loadJsxModule } from "./helpers/load-jsx.mjs";

afterEach(cleanup);

describe("Prospeccion.jsx - interacción real", () => {
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
    fireEvent.click(screen.getByText(/Pegar una lista de prospectos/));
    fireEvent.change(screen.getByLabelText("Lista de prospectos"), { target: { value: "Empresa;Localidad\nPierandrei;Parana\nFerretería Sur;Colón" } });
    fireEvent.click(screen.getByText("Cargar la lista"));
    await waitFor(() => screen.getByText("Ferretería Sur"));
    assert.ok(screen.getByText("Ya en el CRM"));
    assert.ok(screen.getByText("Nuevo"));
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
});
