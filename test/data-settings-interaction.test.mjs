// Tests de interacción real (Testing Library, no smoke) para DataSettings.jsx.
//
// DataSettings es grande y con muchas operaciones async (import CSV,
// backup, WhatsApp, cartera maestra vía Supabase, fichas técnicas). Se
// prioriza acá la importación de clientes por CSV: es la única operación
// completa (analizar -> vista previa -> confirmar) que no depende de red
// ni de Supabase - `mergeClientsCsv` (src/client-csv.mjs) y
// `readFileSmart`/`file.arrayBuffer()` (src/text-decode.mjs) son puro
// JS/jsdom, así que se puede ejercitar de punta a punta con un File real,
// sin mocks frágiles. Ver el reporte final para lo que se dejó afuera
// (export CSV/backup por `URL.createObjectURL` no implementado en jsdom,
// y todo lo que toca Supabase/fetch: cartera maestra, sincronizar
// WhatsApp, importar fichas técnicas).
import { test, describe, afterEach } from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react";
import { loadJsxModule } from "./helpers/load-jsx.mjs";

afterEach(cleanup);

describe("DataSettings.jsx - interacción real", () => {
  // Props mínimas realistas: App.jsx (línea ~1704) pasa data, setData,
  // session y syncStatus. `data` necesita clients/interactions/tasks/inbox
  // (usados en el resumen "Contenido guardado" y en el merge de CSV).
  function baseData() {
    return {
      clients: [{ id: "old", company: "Viejo nombre", cuit: "30-999", family: "Otra" }],
      interactions: [],
      tasks: [],
      inbox: [],
    };
  }

  test("importar un CSV de clientes muestra la vista previa y, al confirmar, actualiza data.clients", async () => {
    const mod = await loadJsxModule("src/DataSettings.jsx");
    let data = baseData();
    const setDataCalls = [];
    function Wrapper() {
      const [state, setState] = React.useState(data);
      return React.createElement(mod.DataSettings, {
        data: state,
        setData: (next) => {
          setDataCalls.push(next);
          setState(next);
        },
        session: { user: { email: "felipe@grupopoliplast.com.ar" } },
        syncStatus: "Sincronizado",
      });
    }
    render(React.createElement(Wrapper));

    assert.ok(screen.getByText("Importar clientes CSV"));

    // CSV real (mismo formato validado en test/client-csv.test.mjs): una
    // fila nueva y una que actualiza el cliente existente por CUIT.
    const csvText =
      "Empresa;CUIT;Familia;Teléfono\r\n" +
      "Empresa Nueva;30-123;Penosil;111\r\n" +
      "Nombre actualizado;30-999;PURMAC;222";
    const file = new File([csvText], "clientes.csv", { type: "text/csv" });
    const analyzeInput = screen.getByText("Analizar CSV").closest("label").querySelector("input[type=file]");
    fireEvent.change(analyzeInput, { target: { files: [file] } });

    await waitFor(() => screen.getByText(/Vista previa lista: 1 empresas nuevas, 1 actualizadas y 0 filas omitidas/));

    fireEvent.click(screen.getByText("Confirmar importación"));

    assert.equal(setDataCalls.length, 1);
    assert.equal(setDataCalls[0].clients.length, 2);
    assert.ok(setDataCalls[0].clients.find((client) => client.company === "Empresa Nueva"));
    assert.equal(setDataCalls[0].clients.find((client) => client.id === "old").company, "Nombre actualizado");
    await waitFor(() => screen.getByText(/CSV incorporado: 1 empresas nuevas, 1 actualizadas y 0 filas omitidas/));
  });

  test("un CSV sin columna Empresa/Razón social muestra un error y no modifica data", async () => {
    const mod = await loadJsxModule("src/DataSettings.jsx");
    const data = baseData();
    const setDataCalls = [];
    render(
      React.createElement(mod.DataSettings, {
        data,
        setData: (next) => setDataCalls.push(next),
        session: { user: { email: "felipe@grupopoliplast.com.ar" } },
        syncStatus: "Sincronizado",
      }),
    );

    const csvText = "Teléfono;Familia\r\n111;Penosil";
    const file = new File([csvText], "sin-empresa.csv", { type: "text/csv" });
    const analyzeInput = screen.getByText("Analizar CSV").closest("label").querySelector("input[type=file]");
    fireEvent.change(analyzeInput, { target: { files: [file] } });

    await waitFor(() => screen.getByText("Falta la columna Empresa o Razón social."));
    assert.equal(setDataCalls.length, 0, "no debería llamarse setData mientras solo hay un error de análisis");
    assert.equal(screen.queryByText("Confirmar importación"), null);
  });

  test("cambiar la familia del selector de exportación actualiza el valor seleccionado", async () => {
    const mod = await loadJsxModule("src/DataSettings.jsx");
    const data = {
      ...baseData(),
      clients: [
        { id: "c1", company: "Envases del Sur SA", family: "Penosil" },
        { id: "c2", company: "Foam Norte SRL", family: "PURMAC" },
      ],
    };
    render(
      React.createElement(mod.DataSettings, {
        data,
        setData: () => {},
        session: { user: { email: "felipe@grupopoliplast.com.ar" } },
        syncStatus: "Sincronizado",
      }),
    );

    const exportSelect = screen.getAllByRole("combobox").find((select) =>
      Array.from(select.options).some((option) => option.value === "Todas"),
    );
    assert.ok(exportSelect);
    assert.equal(exportSelect.value, "Todas");

    fireEvent.change(exportSelect, { target: { value: "PURMAC" } });
    assert.equal(exportSelect.value, "PURMAC");
  });
});
