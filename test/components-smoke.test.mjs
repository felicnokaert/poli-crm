// Smoke tests de componentes de presentación reales (.jsx), usando
// react-dom/server (SSR puro, sin DOM/jsdom) para poder ejecutarlos bajo
// `node --test`. Ver test/helpers/load-jsx.mjs para cómo se resuelve el JSX.
//
// Objetivo: hoy 0% de los .jsx del proyecto se ejecutan en algún test. Estos
// tests no reemplazan tests de interacción (no hay click, no hay estado) —
// sólo verifican que el componente renderiza sin explotar y que el HTML
// resultante contiene lo mínimo esperable. Es un piso, no un techo.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { loadJsxModule } from "./helpers/load-jsx.mjs";

describe("node --test puede ejecutar JSX real compilado con rolldown", () => {
  test("un componente trivial (<div>hola</div>) renderiza a HTML esperado", async () => {
    const mod = await loadJsxModule("test/fixtures/trivial-component.jsx");
    const html = renderToStaticMarkup(React.createElement(mod.Trivial, { text: "hola" }));
    assert.match(html, /hola/);
  });
});

describe("ui-primitives.jsx", () => {
  let ui;
  test("carga el módulo", async () => {
    ui = await loadJsxModule("src/ui-primitives.jsx");
    assert.equal(typeof ui.Empty, "function");
  });

  test("Empty renderiza el texto recibido", () => {
    const html = renderToStaticMarkup(React.createElement(ui.Empty, { text: "Sin resultados" }));
    assert.match(html, /Sin resultados/);
  });

  test("Fact usa 'A confirmar' cuando no hay value", () => {
    const html = renderToStaticMarkup(React.createElement(ui.Fact, { label: "Rubro" }));
    assert.match(html, /A confirmar/);
  });

  test("Fact muestra el value cuando viene provisto", () => {
    const html = renderToStaticMarkup(React.createElement(ui.Fact, { label: "Rubro", value: "Envases" }));
    assert.match(html, /Envases/);
    assert.doesNotMatch(html, /A confirmar/);
  });

  test("Goal renderiza title y text", () => {
    const html = renderToStaticMarkup(React.createElement(ui.Goal, { title: "Meta", text: "Vender 10" }));
    assert.match(html, /Meta/);
    assert.match(html, /Vender 10/);
  });

  test("Loading usa el texto por defecto si no se pasa uno", () => {
    const html = renderToStaticMarkup(React.createElement(ui.Loading, {}));
    assert.match(html, /Cargando/);
  });

  test("Splash renderiza el isologo animado y el texto de estado", () => {
    const html = renderToStaticMarkup(React.createElement(ui.Splash, { text: "Sincronizando…" }));
    assert.match(html, /poliplast-isotipo-negro\.png/);
    assert.match(html, /Sincronizando/);
  });

  test("Spinner no explota sin props", () => {
    const html = renderToStaticMarkup(React.createElement(ui.Spinner, {}));
    assert.match(html, /spinner/);
  });
});

describe("Clients.jsx", () => {
  let mod;
  const clients = [
    { id: "c1", company: "Cliente Uno SA", family: "envases", sourceType: "Cliente activo", phone: "123" },
    { id: "c2", company: "Cliente Dos SRL", family: "foam", sourceType: "Relevamiento activo" },
    // duplicado plausible del primero, para ejercitar detectDuplicateClientCandidates
    { id: "c3", company: "Cliente Uno S.A.", family: "envases", sourceType: "A confirmar" },
  ];

  test("carga el módulo", async () => {
    mod = await loadJsxModule("src/Clients.jsx");
    // Clients está envuelto en React.memo (optimización de renders), así que
    // el export es un objeto memo, no una función plana - lo que importa acá
    // es que sea un tipo de componente React válido.
    assert.ok(React.isValidElement(React.createElement(mod.Clients, {})));
  });

  test("Clients renderiza la lista y el contador de duplicados sin excepción", () => {
    const html = renderToStaticMarkup(
      React.createElement(mod.Clients, {
        clients,
        query: "",
        setQuery: () => {},
        onOpenClient: () => {},
        onMergeClients: () => {},
      }),
    );
    assert.match(html, /Empresas y prospectos/);
    assert.match(html, /Posibles duplicados/);
  });
});

describe("Tasks.jsx", () => {
  let mod;
  const tasks = [
    { id: "t1", title: "Llamar a Cliente Uno", company: "Cliente Uno SA", done: false, dueDate: "2026-09-10" },
    { id: "t2", title: "Enviar cotización", company: "Cliente Dos SRL", done: true, dueDate: "2026-09-05" },
  ];

  test("carga el módulo", async () => {
    mod = await loadJsxModule("src/Tasks.jsx");
    // Tasks está envuelto en React.memo (optimización de renders), así que
    // el export es un objeto memo, no una función plana.
    assert.ok(React.isValidElement(React.createElement(mod.Tasks, {})));
    assert.equal(typeof mod.TaskList, "function");
  });

  test("Tasks renderiza el encabezado y las tareas pendientes", () => {
    const html = renderToStaticMarkup(
      React.createElement(mod.Tasks, { items: tasks, onToggle: () => {}, onOpen: () => {}, onNew: () => {} }),
    );
    assert.match(html, /Tareas comerciales/);
    assert.match(html, /Llamar a Cliente Uno/);
  });

  test("TaskList muestra el estado vacío cuando no hay tareas", () => {
    const html = renderToStaticMarkup(
      React.createElement(mod.TaskList, { items: [], onToggle: () => {}, onOpen: () => {} }),
    );
    assert.match(html, /No hay tareas pendientes/);
  });
});

// Dashboard.jsx queda deliberadamente fuera de este archivo: recibe una
// cantidad grande de props/callbacks interdependientes (estado de
// workspace, canales, tareas, cotizaciones, etc.) y armar un mock plausible
// de todo eso sería un mock gigante y frágil que se rompería con cada
// cambio de forma de props, sin aportar mucha señal real. Se prioriza
// cobertura en los componentes de presentación más chicos y estables.
