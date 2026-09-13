// Tests de interacción real para Pipeline.jsx, Sales.jsx y WhatsAppInbox.jsx —
// ver test/components-interaction.test.mjs para el patrón general (render con
// @testing-library/react sobre jsdom real, fireEvent para disparar eventos de
// usuario de verdad, no smoke test de renderToStaticMarkup).
//
// Board.jsx queda deliberadamente afuera: no se agregan tests porque, según
// src/App.jsx (línea ~1645-1647), la vista "board" en realidad renderiza
// `ProjectBoardGateway` (definido en src/Dashboard.jsx), no el componente
// exportado por src/Board.jsx. Una búsqueda de "Board" en src/App.jsx confirma
// que Board.jsx no se importa ni se usa desde ningún lado del código de
// producción — es código muerto. Agregarle tests de interacción no aportaría
// cobertura real (nadie ejercita ese código al usar la app) y quedaría como
// mantenimiento sin beneficio.
import { test, describe, afterEach } from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { loadJsxModule } from "./helpers/load-jsx.mjs";

afterEach(cleanup);

describe("Pipeline.jsx - interacción real", () => {
  const clients = [
    { id: "c1", company: "Envases del Sur SA", family: "envases", contact: "Juan", stage: "Preparación" },
    { id: "c2", company: "Foam Norte SRL", family: "foam", contact: "Ana", stage: "Apertura" },
  ];

  test("arrastrar una tarjeta a otra columna llama a onChangeStage con el id y la nueva etapa", async () => {
    const mod = await loadJsxModule("src/Pipeline.jsx");
    const calls = [];
    render(
      React.createElement(mod.Pipeline, {
        clients,
        onOpenClient: () => {},
        onChangeStage: (id, stage) => calls.push([id, stage]),
        onDelete: () => {},
        onAdd: () => {},
      }),
    );
    const card = screen.getByText("Envases del Sur SA").closest("article");
    assert.ok(card, "debería existir la tarjeta de Envases del Sur SA");
    // La columna destino ("Apertura") se identifica por su <header><strong>.
    const targetColumn = screen.getByText("Apertura").closest("section");
    assert.ok(targetColumn, "debería existir la columna 'Apertura'");

    fireEvent.dragStart(card);
    fireEvent.drop(targetColumn);

    assert.deepEqual(calls, [["c1", "Apertura"]]);
  });

  test("click en 'Cuenta' abre el formulario, y enviarlo llama a onAdd con el nombre y la etapa de esa columna", async () => {
    const mod = await loadJsxModule("src/Pipeline.jsx");
    const calls = [];
    render(
      React.createElement(mod.Pipeline, {
        clients,
        onOpenClient: () => {},
        onChangeStage: () => {},
        onDelete: () => {},
        onAdd: (name, stage) => calls.push([name, stage]),
      }),
    );
    // Todas las columnas comparten el mismo botón "Cuenta" - se toma el de la
    // columna "Preparación" (la primera, ya que hay una tarjeta en ella).
    const preparacionColumn = screen.getByText("Preparación").closest("section");
    const addButton = preparacionColumn.querySelector("button.board-add-card");
    fireEvent.click(addButton);

    const input = preparacionColumn.querySelector("input[placeholder='Nombre de la empresa']");
    assert.ok(input, "debería aparecer el input para el nombre de la empresa");
    fireEvent.change(input, { target: { value: "Nueva Cuenta SA" } });
    fireEvent.submit(preparacionColumn.querySelector("form.board-add-card-form"));

    assert.deepEqual(calls, [["Nueva Cuenta SA", "Preparación"]]);
  });

  test("click en el botón de eliminar llama a onDelete con el id de esa cuenta, sin abrir la ficha", async () => {
    const mod = await loadJsxModule("src/Pipeline.jsx");
    const deleteCalls = [];
    const openCalls = [];
    render(
      React.createElement(mod.Pipeline, {
        clients,
        onOpenClient: (id) => openCalls.push(id),
        onChangeStage: () => {},
        onDelete: (id) => deleteCalls.push(id),
        onAdd: () => {},
      }),
    );
    // Hay una tarjeta por cliente - tomamos el primer botón "Eliminar cuenta"
    // (el de Envases del Sur SA, que va primero en `clients`).
    fireEvent.click(screen.getAllByLabelText("Eliminar cuenta")[0]);
    assert.deepEqual(deleteCalls, ["c1"]);
    assert.deepEqual(openCalls, [], "no debería abrir la ficha del cliente al eliminar");
  });
});

describe("Sales.jsx - interacción real", () => {
  // Sales.jsx es grande (objetivos, unidades de negocio, importación de PDF,
  // importación de histórico JSON, tabla de revisión masiva). Mockear todo
  // ese árbol de forma estable sería frágil y de bajo valor comparado con
  // ejercitar 1-2 interacciones simples y representativas: cambiar el filtro
  // de unidad de negocio (selector ya presente sin depender de props extra)
  // y ver que la tabla de ventas visibles se actualiza en consecuencia. Se
  // deja explícitamente afuera: importación de PDF (requiere mockear
  // pdf-text.js/invoice-parser.mjs con extracción real de texto) y el flujo
  // de alta/edición de venta en el modal (múltiples campos interdependientes
  // de moneda/tipo de cambio) - se puede agregar en una ronda futura si hace
  // falta más cobertura ahí.
  const businessUnits = [
    { id: "u1", name: "Poliplast", legalName: "Grupo Poliplast SRL", cuit: "", ratePct: 5, invoicePoints: ["0001"] },
    { id: "u2", name: "Foam", legalName: "Foam SRL", cuit: "", ratePct: 3, invoicePoints: ["0002"] },
  ];
  const today = new Date().toISOString().slice(0, 10);
  const sales = [
    { id: "s1", date: today, unit: "Poliplast", documentType: "Factura", pointOfSale: "0001", documentNumber: "123", customer: "Envases del Sur SA", netAmount: 1000, currency: "ARS", collected: false },
    { id: "s2", date: today, unit: "Foam", documentType: "Factura", pointOfSale: "0002", documentNumber: "456", customer: "Foam Norte SRL", netAmount: 2000, currency: "ARS", collected: false },
  ];

  test("cambiar el filtro de unidad de negocio a 'Foam' deja visible solo esa venta", async () => {
    const mod = await loadJsxModule("src/Sales.jsx");
    render(
      React.createElement(mod.default, {
        items: sales,
        goals: [],
        businessUnits,
        onSaveGoal: () => {},
        onDeleteGoal: () => {},
        onSaveBusinessUnit: () => {},
        onDeleteBusinessUnit: () => {},
        onSave: () => {},
        onSaveMany: () => {},
        onDelete: () => {},
        onDeleteMany: () => {},
      }),
    );
    // Antes de filtrar, ambas ventas están visibles (el mes por defecto es
    // el actual y ambas fechas son "hoy").
    assert.ok(screen.getByText("Envases del Sur SA"));
    assert.ok(screen.getByText("Foam Norte SRL"));

    // El <select> de unidad es el único con una opción "Foam" además de
    // "Todas" (el de Objetivos filtra por unidad también, pero ese vive en
    // un formulario de "agregar objetivo" y su opción no está seleccionada
    // por defecto en este flujo) - se ubica por el toolbar de listado.
    const unitSelect = screen.getAllByRole("combobox").find((select) =>
      Array.from(select.options).some((option) => option.value === "Todas") &&
      Array.from(select.options).some((option) => option.value === "Foam") &&
      select.closest(".list-toolbar"),
    );
    assert.ok(unitSelect, "debería existir el <select> de unidad dentro del toolbar de listado");

    fireEvent.change(unitSelect, { target: { value: "Foam" } });

    assert.ok(screen.getByText("Foam Norte SRL"));
    assert.equal(screen.queryByText("Envases del Sur SA"), null, "Envases del Sur no debería seguir visible al filtrar por Foam");
  });

  test("escribir en el buscador de clientes filtra la tabla de ventas visibles", async () => {
    const mod = await loadJsxModule("src/Sales.jsx");
    render(
      React.createElement(mod.default, {
        items: sales,
        goals: [],
        businessUnits,
        onSaveGoal: () => {},
        onDeleteGoal: () => {},
        onSaveBusinessUnit: () => {},
        onDeleteBusinessUnit: () => {},
        onSave: () => {},
        onSaveMany: () => {},
        onDelete: () => {},
        onDeleteMany: () => {},
      }),
    );
    const searchInput = screen.getByPlaceholderText("Buscar cliente…");
    fireEvent.change(searchInput, { target: { value: "Foam" } });

    assert.ok(screen.getByText("Foam Norte SRL"));
    assert.equal(screen.queryByText("Envases del Sur SA"), null);
  });
});

describe("WhatsAppInbox.jsx - interacción real", () => {
  // Un solo mensaje pendiente, reciente (no "stale") y sin evento de status
  // que indique que ya se respondió afuera - así queda en "Por revisar" con
  // los filtros por defecto, que es lo que este test necesita ejercitar.
  const items = [
    {
      event_id: "e1",
      customer_wa_id: "5491100000000",
      customer_name: "Cliente Uno",
      channel: "general",
      message_type: "text",
      text_body: "Hola, necesito precio de bidones de 20L",
      classification_status: "pending",
      occurred_at: new Date().toISOString(),
    },
  ];

  test("click en 'Acciones' despliega los botones de decisión, y 'No requiere acción' llama a onClassify con el event_id y 'ignore'", async () => {
    const mod = await loadJsxModule("src/WhatsAppInbox.jsx");
    const calls = [];
    render(
      React.createElement(mod.WhatsAppInbox, {
        items,
        statusEvents: [],
        clients: [],
        onClassify: (id, action) => calls.push([id, action]),
        onDraft: () => {},
        onOpen: () => {},
        onArchive: () => {},
        onRestore: () => {},
        onDelete: () => {},
        onDeleteLegacy: () => {},
        onDeleteAllLegacy: () => {},
        onExclude: () => {},
        onRestoreCommercial: () => {},
        onBatchClassify: () => {},
        onBatchArchive: () => {},
        onBatchExclude: () => {},
        onBatchDelete: () => {},
      }),
    );
    assert.ok(screen.getByText("Cliente Uno"));

    fireEvent.click(screen.getByText("Acciones"));
    // Dentro del panel de decisión (pending) hay un botón "No requiere
    // acción" distinto del ícono rápido de tilde (row-quick-ignore), que
    // dispara la misma acción — cualquiera de los dos sirve para este caso,
    // se toma el texto explícito del panel desplegado.
    const decisionButtons = screen.getAllByText("No requiere acción");
    fireEvent.click(decisionButtons[decisionButtons.length - 1]);

    assert.deepEqual(calls, [["e1", "ignore"]]);
  });

  test("clasificar como 'Equipo interno' desde el select de exclusión llama a onExclude con el event_id y esa categoría", async () => {
    const mod = await loadJsxModule("src/WhatsAppInbox.jsx");
    const calls = [];
    render(
      React.createElement(mod.WhatsAppInbox, {
        items,
        statusEvents: [],
        clients: [],
        onClassify: () => {},
        onDraft: () => {},
        onOpen: () => {},
        onArchive: () => {},
        onRestore: () => {},
        onDelete: () => {},
        onDeleteLegacy: () => {},
        onDeleteAllLegacy: () => {},
        onExclude: (id, category) => calls.push([id, category]),
        onRestoreCommercial: () => {},
        onBatchClassify: () => {},
        onBatchArchive: () => {},
        onBatchExclude: () => {},
        onBatchDelete: () => {},
      }),
    );
    fireEvent.click(screen.getByText("Acciones"));
    const exclusionSelect = screen.getByLabelText("Marcar Cliente Uno como contacto no comercial");
    fireEvent.change(exclusionSelect, { target: { value: "Equipo interno" } });

    assert.deepEqual(calls, [["e1", "Equipo interno"]]);
  });
});
