// Tests de interacción real (Testing Library, no smoke) para Academy.jsx -
// ver test/components-interaction.test.mjs para la explicación general del
// enfoque (render en jsdom real + fireEvent, vía test/helpers/load-jsx.mjs).
//
// Academy es, de los cuatro componentes marcados sin tests de interacción
// en la auditoría de madurez (docs/AUDITORIA_MADUREZ_PRODUCTO_2026-09-15-
// octava.md), el más simple: no hace fetch propio al montar (a diferencia
// de TechnicalDocumentsAdmin) ni tiene operaciones async de red (a
// diferencia de DataSettings) - toda su interacción principal es el
// segmented control que cambia `section` (estado local con useState), así
// que se puede ejercitar de punta a punta sin mockear nada.
import { test, describe, afterEach } from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { loadJsxModule } from "./helpers/load-jsx.mjs";

afterEach(cleanup);

describe("Academy.jsx - interacción real", () => {
  // Props mínimas realistas: App.jsx (línea ~1683) pasa myChannels,
  // interactions=data.interactions, data y setData. `data` necesita
  // `clients` (lo usa Coach al buscar el cliente de la interacción) y
  // `sales` (PriceMemory, montado en la sección "coach").
  function renderAcademy(overrides = {}) {
    const data = {
      clients: [{ id: "c1", company: "Envases del Sur SA", family: "envases" }],
      interactions: [],
      sales: [],
      ...overrides.data,
    };
    const setDataCalls = [];
    const setData = (next) => setDataCalls.push(next);
    return { setDataCalls, data, setData };
  }

  test("arranca en Método y navega a cada sección al clickear el segmented control", async () => {
    const mod = await loadJsxModule("src/Academy.jsx");
    const { data, setData } = renderAcademy();
    render(
      React.createElement(mod.Academy, {
        myChannels: ["general"],
        interactions: [],
        data,
        setData,
      }),
    );

    // Sección inicial: "method" -> muestra el proceso E-C-E-R-A, no
    // objeciones ni perfiles.
    assert.ok(screen.getByText("Proceso y método E-C-E-R-A"));

    fireEvent.click(screen.getByText("Objeciones"));
    assert.ok(screen.getByText("Biblioteca única de objeciones"));
    // El buscador de objeciones solo aparece en esta sección.
    assert.ok(screen.getByPlaceholderText("Buscar objeción o respuesta…"));

    fireEvent.click(screen.getByText("Perfiles"));
    assert.ok(screen.getByText("Perfiles y playbooks"));
    assert.equal(screen.queryByPlaceholderText("Buscar objeción o respuesta…"), null);

    fireEvent.click(screen.getByText("Biblioteca y práctica"));
    // Sección "library" -> QuickReplies (encabezado propio, no el de
    // CommercialKnowledge).
    assert.ok(screen.getByText("Biblioteca de respuestas rápidas"));

    fireEvent.click(screen.getByText("Evaluar conversaciones"));
    // Sección "coach" -> sin interacciones registradas, Coach muestra el
    // Empty state en vez del formulario de evaluación.
    assert.ok(screen.getByText("Registrá una conversación para poder evaluarla."));

    // Volver a Método confirma que el estado no quedó pegado en la última
    // sección visitada.
    fireEvent.click(screen.getByText("Método"));
    assert.ok(screen.getByText("Proceso y método E-C-E-R-A"));
  });

  test("en Objeciones, escribir en el buscador filtra la lista visible", async () => {
    const mod = await loadJsxModule("src/Academy.jsx");
    const { data, setData } = renderAcademy();
    render(
      React.createElement(mod.Academy, {
        myChannels: ["general"],
        interactions: [],
        data,
        setData,
      }),
    );

    fireEvent.click(screen.getByText("Objeciones"));
    const totalBefore = screen.getAllByText("Objeción").length;
    assert.ok(totalBefore > 1, "debería haber más de una objeción listada por defecto");

    const search = screen.getByPlaceholderText("Buscar objeción o respuesta…");
    fireEvent.change(search, { target: { value: "zzz-ningunaobjecionexiste-zzz" } });

    assert.equal(screen.queryByText("Objeción"), null);
    assert.ok(screen.getByText("No encontramos una objeción con ese criterio."));
  });

  test("en Evaluar conversaciones, cambiar puntajes de la rúbrica y guardar llama a setData con la evaluación", async () => {
    const mod = await loadJsxModule("src/Academy.jsx");
    const interaction = {
      id: "i1",
      company: "Envases del Sur SA",
      clientId: "c1",
      family: "envases",
      createdAt: "2026-01-01T00:00:00.000Z",
      summary: "Consulta por espuma PU",
    };
    const { data, setData, setDataCalls } = renderAcademy({
      data: { interactions: [interaction] },
    });
    data.interactions = [interaction];
    render(
      React.createElement(mod.Academy, {
        myChannels: ["general"],
        interactions: [interaction],
        data,
        setData,
      }),
    );

    fireEvent.click(screen.getByText("Evaluar conversaciones"));
    assert.ok(screen.getByText("Envases del Sur SA"));

    // Antes de puntuar, el total mostrado es 0/28.
    const totalStrong = document.querySelector(".score-summary strong");
    assert.equal(totalStrong.textContent.trim(), "0/28");

    // Cada fila de la rúbrica tiene botones [0, 1, 2] - clickear el "2" de
    // la primera fila sube el puntaje total mostrado a 2/28.
    const firstRowScoreButtons = document.querySelectorAll(".rubric-row .score-buttons button");
    fireEvent.click(firstRowScoreButtons[2]);
    assert.equal(totalStrong.textContent.trim(), "2/28");

    fireEvent.click(screen.getByText("Guardar evaluación"));
    assert.equal(setDataCalls.length, 1);
    const saved = setDataCalls[0];
    const updatedInteraction = saved.interactions.find((item) => item.id === "i1");
    assert.ok(updatedInteraction.evaluation, "debería haberse adjuntado una evaluación a la interacción");
    assert.equal(updatedInteraction.evaluation.total, 2);
  });
});
