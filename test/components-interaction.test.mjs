// Tests de interacción real (click, escritura, cambio de estado) sobre
// componentes .jsx, usando @testing-library/react + jsdom.
//
// A diferencia de test/components-smoke.test.mjs (que solo confirma que un
// componente renderiza a HTML vía react-dom/server, sin DOM real ni
// eventos), acá se monta el componente en un DOM real (jsdom, precargado
// por test/setup-dom.mjs vía --import) y se dispara interacción de usuario
// de verdad: fireEvent.click, fireEvent.change. Esto ejercita hooks de
// estado (useState/useEffect) y callbacks tal como los usaría un usuario
// real, algo que renderToStaticMarkup no puede hacer.
//
// Igual que components-smoke.test.mjs, los componentes se cargan
// compilados a través de test/helpers/load-jsx.mjs (rolldown), no importados
// directo - ver ese archivo para el porqué.
import { test, describe, afterEach } from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { render, renderHook, screen, fireEvent, cleanup, act } from "@testing-library/react";
import { loadJsxModule } from "./helpers/load-jsx.mjs";

// @testing-library/react no limpia el DOM entre tests automáticamente fuera
// de un entorno con "test framework globals" (jest/vitest) - bajo
// `node --test` hay que llamar cleanup() a mano, o el segundo render() de
// un mismo describe pisa/duplica nodos del anterior.
afterEach(cleanup);

describe("Clients.jsx - interacción real", () => {
  // El filtro de revisión ("review") arranca en "Por validar", que solo
  // muestra clientes sin sourceType o con sourceType "A confirmar" - se deja
  // así a propósito en los fixtures (en vez de setear sourceType y tener que
  // cambiar ese select en cada test) para que los 3 clientes sean visibles
  // con los filtros por defecto, y así poder aislar el efecto del filtro de
  // familia que es lo que este test ejercita.
  const clients = [
    { id: "c1", company: "Envases del Sur SA", family: "envases", phone: "111" },
    { id: "c2", company: "Foam Norte SRL", family: "foam", phone: "222" },
    { id: "c3", company: "Envases Centro SA", family: "envases", phone: "333" },
  ];

  test("cambiar el filtro de familia reduce la lista visible a esa familia", async () => {
    const mod = await loadJsxModule("src/Clients.jsx");
    render(
      React.createElement(mod.Clients, {
        clients,
        query: "",
        setQuery: () => {},
        onOpenClient: () => {},
        onMergeClients: () => {},
      }),
    );
    // Antes de filtrar, los 3 clientes están montados.
    assert.ok(screen.getByText("Envases del Sur SA"));
    assert.ok(screen.getByText("Foam Norte SRL"));
    assert.ok(screen.getByText("Envases Centro SA"));

    // El select de familia es el tercero de los cuatro <select> del panel de
    // filtros (revisión, portfolio, familia, contacto) - se identifica por
    // sus opciones ("Todas" + families reales) en vez de un test-id nuevo.
    const familySelect = screen.getAllByRole("combobox").find((select) =>
      Array.from(select.options).some((option) => option.value === "envases"),
    );
    assert.ok(familySelect, "debería existir un <select> con la opción 'envases'");

    fireEvent.change(familySelect, { target: { value: "envases" } });

    assert.ok(screen.getByText("Envases del Sur SA"));
    assert.ok(screen.getByText("Envases Centro SA"));
    assert.equal(screen.queryByText("Foam Norte SRL"), null, "Foam Norte no debería seguir visible al filtrar por 'envases'");
  });

  test("escribir en el buscador llama a setQuery con el texto tipeado (el filtrado por texto lo hace App.jsx, no Clients)", async () => {
    const mod = await loadJsxModule("src/Clients.jsx");
    const calls = [];
    const setQuery = (value) => calls.push(value);
    render(
      React.createElement(mod.Clients, {
        clients,
        query: "",
        setQuery,
        onOpenClient: () => {},
        onMergeClients: () => {},
      }),
    );
    const searchInput = screen.getByPlaceholderText("Empresa, CUIT, contacto, teléfono…");
    fireEvent.change(searchInput, { target: { value: "Envases" } });
    assert.deepEqual(calls, ["Envases"]);
  });
});

describe("Tasks.jsx / TaskList - interacción real", () => {
  const tasks = [
    { id: "t1", title: "Llamar a Cliente Uno", company: "Cliente Uno SA", done: false, dueDate: "2026-09-10" },
    { id: "t2", title: "Enviar cotización a Cliente Dos", company: "Cliente Dos SRL", done: false, dueDate: "2026-09-12" },
  ];

  test("click en el checkbox de una tarea llama a onToggle con el id correcto", async () => {
    const mod = await loadJsxModule("src/Tasks.jsx");
    const calls = [];
    const onToggle = (id) => calls.push(id);
    render(
      React.createElement(mod.TaskList, {
        items: tasks,
        onToggle,
        onOpen: () => {},
      }),
    );
    const checkbox = screen.getByLabelText("Completar Enviar cotización a Cliente Dos");
    fireEvent.click(checkbox);
    assert.deepEqual(calls, ["t2"]);
  });

  test("Tasks: escribir en el buscador filtra la lista visible de tareas", async () => {
    const mod = await loadJsxModule("src/Tasks.jsx");
    render(
      React.createElement(mod.Tasks, {
        items: tasks,
        onToggle: () => {},
        onOpen: () => {},
        onNew: () => {},
      }),
    );
    assert.ok(screen.getByText("Llamar a Cliente Uno"));
    assert.ok(screen.getByText("Enviar cotización a Cliente Dos"));

    const searchInput = screen.getByPlaceholderText("Buscar tarea…");
    fireEvent.change(searchInput, { target: { value: "cotización" } });

    assert.ok(screen.getByText("Enviar cotización a Cliente Dos"));
    assert.equal(screen.queryByText("Llamar a Cliente Uno"), null);
  });

  test("Tasks: cambiar el segmentado a 'Completadas' muestra solo tareas hechas", async () => {
    const mod = await loadJsxModule("src/Tasks.jsx");
    const mixed = [
      { id: "t1", title: "Tarea pendiente", company: "A", done: false, dueDate: "2026-09-10" },
      { id: "t2", title: "Tarea completada", company: "B", done: true, dueDate: "2026-09-05" },
    ];
    render(
      React.createElement(mod.Tasks, {
        items: mixed,
        onToggle: () => {},
        onOpen: () => {},
        onNew: () => {},
      }),
    );
    // Por defecto el filtro es "pending": solo se ve la pendiente.
    assert.ok(screen.getByText("Tarea pendiente"));
    assert.equal(screen.queryByText("Tarea completada"), null);

    fireEvent.click(screen.getByText("Completadas"));

    assert.ok(screen.getByText("Tarea completada"));
    assert.equal(screen.queryByText("Tarea pendiente"), null);
  });
});

describe("useSelectedRecords - renderHook", () => {
  test("cada setter actualiza únicamente su propio id seleccionado", async () => {
    const mod = await loadJsxModule("src/hooks/useSelectedRecords.js");
    const { result } = renderHook(() => mod.useSelectedRecords());

    assert.equal(result.current.selectedInteractionId, null);
    assert.equal(result.current.selectedClientId, null);
    assert.equal(result.current.selectedTaskId, null);

    act(() => result.current.setSelectedClientId("c42"));
    assert.equal(result.current.selectedClientId, "c42");
    assert.equal(result.current.selectedInteractionId, null, "no debe afectar a los otros ids");
    assert.equal(result.current.selectedTaskId, null, "no debe afectar a los otros ids");

    act(() => result.current.setSelectedInteractionId("i7"));
    act(() => result.current.setSelectedTaskId("t9"));
    assert.equal(result.current.selectedInteractionId, "i7");
    assert.equal(result.current.selectedTaskId, "t9");
    assert.equal(result.current.selectedClientId, "c42", "sigue como se dejó antes");

    act(() => result.current.setSelectedClientId(null));
    assert.equal(result.current.selectedClientId, null);
  });
});

describe("useNavGroups - renderHook", () => {
  afterEach(() => {
    localStorage.clear();
  });

  test("arranca con todos los grupos colapsados cuando no hay nada guardado", async () => {
    localStorage.clear();
    const mod = await loadJsxModule("src/hooks/useNavGroups.js");
    const groupNames = ["Comercial", "Inventario", "Reportes"];
    const { result } = renderHook(() => mod.useNavGroups(groupNames));
    const [collapsed] = result.current;
    assert.deepEqual(collapsed, groupNames);
  });

  test("setCollapsedNavGroups actualiza el estado y lo persiste en localStorage", async () => {
    localStorage.clear();
    const mod = await loadJsxModule("src/hooks/useNavGroups.js");
    const groupNames = ["Comercial", "Inventario", "Reportes"];
    const { result } = renderHook(() => mod.useNavGroups(groupNames));

    act(() => {
      const [, setCollapsed] = result.current;
      setCollapsed(["Inventario"]);
    });

    const [collapsedAfter] = result.current;
    assert.deepEqual(collapsedAfter, ["Inventario"]);
    // El efecto que persiste a localStorage corre de forma síncrona dentro
    // de act(), así que ya debería estar guardado.
    assert.equal(
      localStorage.getItem("poliplast-sales-copilot-nav-collapsed"),
      JSON.stringify(["Inventario"]),
    );
  });

  test("respeta lo guardado en localStorage al montar, en vez de arrancar todo colapsado", async () => {
    localStorage.clear();
    localStorage.setItem("poliplast-sales-copilot-nav-collapsed", JSON.stringify(["Reportes"]));
    const mod = await loadJsxModule("src/hooks/useNavGroups.js");
    const { result } = renderHook(() => mod.useNavGroups(["Comercial", "Inventario", "Reportes"]));
    const [collapsed] = result.current;
    assert.deepEqual(collapsed, ["Reportes"]);
  });
});
