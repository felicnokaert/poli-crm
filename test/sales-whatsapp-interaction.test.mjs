// Tests de interacción real para Sales.jsx y WhatsAppInbox.jsx: render con @testing-library/react
// sobre jsdom real y fireEvent para disparar eventos de usuario de verdad.
// (Pipeline.jsx se borró el 16/10: «Cuentas activas» ya no está en el menú.)
import { test, describe, afterEach } from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { loadJsxModule } from "./helpers/load-jsx.mjs";

afterEach(cleanup);

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

  // Cierra el hueco documentado en la décima auditoría de madurez
  // (AUDITORIA_MADUREZ_PRODUCTO_2026-09-16-decima.md, sección 5, Testing):
  // el flujo de SaleModal con el datalist/aviso de cliente no coincidente
  // (ver AUDITORIA_MADUREZ_PRODUCTO_2026-09-15-novena.md) solo estaba
  // probado indirectamente por tests de sales-model.mjs (lógica pura), sin
  // ejercitar la interacción real de abrir el modal, tipear y guardar.
  const clientsWithKnownCompany = [{ id: "c1", company: "Envases del Sur SA" }];

  test("abrir 'Registrar venta', tipear un cliente que no matchea muestra el aviso, y matchear uno existente lo saca", async () => {
    // SaleModal usa useConfirm() (aviso de venta duplicada) - necesita el
    // mismo fixture con <ConfirmProvider> que documenta
    // test/fixtures/technical-documents-with-confirm.jsx.
    const harness = await loadJsxModule("test/fixtures/sales-with-confirm.jsx");
    render(
      React.createElement(harness.SalesWithConfirm, {
        items: [],
        goals: [],
        businessUnits,
        clients: clientsWithKnownCompany,
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

    fireEvent.click(screen.getByText("Registrar venta"));
    assert.ok(screen.getByText("Ingresá el importe neto, sin IVA."), "debería abrirse el modal de venta");

    const customerInput = screen.getByPlaceholderText("Razón social o nombre");
    fireEvent.change(customerInput, { target: { value: "Cliente Nuevo SA" } });
    assert.ok(screen.getByText(/No coincide con ningún cliente de tu cartera/));

    fireEvent.change(customerInput, { target: { value: "Envases del Sur SA" } });
    assert.equal(
      screen.queryByText(/No coincide con ningún cliente de tu cartera/),
      null,
      "el aviso no debería mostrarse para un nombre que sí coincide con la cartera",
    );
  });

  test("guardar una venta nueva desde el modal llama a onSave con los datos cargados y cierra el modal", async () => {
    const harness = await loadJsxModule("test/fixtures/sales-with-confirm.jsx");
    const saveCalls = [];
    render(
      React.createElement(harness.SalesWithConfirm, {
        items: [],
        goals: [],
        businessUnits,
        clients: clientsWithKnownCompany,
        onSaveGoal: () => {},
        onDeleteGoal: () => {},
        onSaveBusinessUnit: () => {},
        onDeleteBusinessUnit: () => {},
        onSave: (value) => saveCalls.push(value),
        onSaveMany: () => {},
        onDelete: () => {},
        onDeleteMany: () => {},
      }),
    );

    fireEvent.click(screen.getByText("Registrar venta"));
    fireEvent.change(screen.getByPlaceholderText("Razón social o nombre"), { target: { value: "Envases del Sur SA" } });
    fireEvent.change(screen.getByLabelText("Número (últimos 5)"), { target: { value: "789" } });
    fireEvent.change(screen.getByLabelText("Importe neto sin IVA"), { target: { value: "5000" } });
    fireEvent.submit(screen.getByText("Guardar venta").closest("form"));

    assert.equal(saveCalls.length, 1);
    assert.equal(saveCalls[0].customer, "Envases del Sur SA");
    // normalizedSale() rellena el número de comprobante a 5 dígitos.
    assert.equal(saveCalls[0].documentNumber, "00789");
    assert.equal(Number(saveCalls[0].netAmount), 5000);
    assert.equal(screen.queryByText("Ingresá el importe neto, sin IVA."), null, "el modal debería cerrarse después de guardar");
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
