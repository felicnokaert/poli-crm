import { test, describe, afterEach } from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react";
import { loadJsxModule } from "./helpers/load-jsx.mjs";

afterEach(cleanup);

describe("Prospeccion.jsx - interacción real", () => {
  async function mount(initial) {
    const mod = await loadJsxModule("src/Prospeccion.jsx");
    const snapshots = [];
    function Wrapper() {
      const [state, setState] = React.useState(initial);
      const setData = (next) => setState((previous) => {
        const value = typeof next === "function" ? next(previous) : next;
        snapshots.push(value);
        return value;
      });
      return React.createElement(mod.Prospeccion, { data: state, setData, userEmail: "marketing@grupopoliplast.com.ar", onOpenClient: () => {} });
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
});
