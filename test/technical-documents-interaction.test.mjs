// Tests de interacción real (Testing Library, no smoke) para
// TechnicalDocuments.jsx.
//
// TechnicalDocumentsAdmin (el componente que App.jsx monta - línea ~1693)
// hace fetch de Supabase al montarse (fetchTechnicalDocuments, en
// src/technical-documents-repo.mjs), sin credenciales configuradas en el
// entorno de test eso siempre termina en el estado de error ("no se pudo
// cargar la base técnica") con `documents` vacío - mockear ese fetch
// requeriría interceptar un import() dinámico ya empaquetado por
// test/helpers/load-jsx.mjs, algo frágil para el valor que aporta. En vez
// de forzar ese mock, el test de la interacción real que importa acá - el
// filtro/agrupado por carpeta cambiando la lista visible - se hace sobre
// `TechnicalDocumentGroups` (named export, sin fetch propio), con
// documentos de fixture reales; y un segundo test cubre, sobre el
// componente completo montado igual que en App.jsx, que el toggle
// "Agrupar por carpeta" es una interacción real que no rompe nada incluso
// con la carga fallida (fetch sin Supabase configurado).
import { test, describe, afterEach } from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react";
import { loadJsxModule } from "./helpers/load-jsx.mjs";

afterEach(cleanup);

describe("TechnicalDocuments.jsx - interacción real", () => {
  const rowPropsStub = {
    titleDrafts: {},
    setTitleDrafts: () => {},
    saveTitle: () => {},
    draftFor: (doc) => ({ status: doc.status, notes: "", replacedBy: doc.replacedBy || "" }),
    updateDraft: () => {},
    saveStatus: () => {},
    isAdmin: false,
    attachFile: () => {},
    viewFile: () => {},
    deleteDocument: () => {},
    deleteFolder: () => {},
    renameFolderTo: () => {},
    moveDocumentToFolder: () => {},
  };

  test("TechnicalDocumentGroups: agrupar por carpeta muestra carpetas colapsables; desagrupar vuelve a una lista plana ordenada", async () => {
    const mod = await loadJsxModule("src/TechnicalDocuments.jsx");
    const documents = [
      { id: "d1", title: "Ficha Zeta", family: "envases", status: "vigente", sourceFile: "PRODUCTOS/ENVASES/Ficha Zeta.pdf" },
      { id: "d2", title: "Ficha Alfa", family: "envases", status: "inventariado", sourceFile: "PRODUCTOS/ENVASES/Ficha Alfa.pdf" },
      { id: "d3", title: "Manual suelto", family: "foam", status: "inventariado", sourceFile: "Manual suelto.pdf" },
    ];

    function Wrapper() {
      const [groupByFolder, setGroupByFolder] = React.useState(true);
      return React.createElement(
        React.Fragment,
        null,
        React.createElement("label", null,
          React.createElement("input", {
            type: "checkbox",
            checked: groupByFolder,
            onChange: (event) => setGroupByFolder(event.target.checked),
          }),
          "Agrupar por carpeta",
        ),
        React.createElement(mod.TechnicalDocumentGroups, {
          documents,
          groupByFolder,
          ...rowPropsStub,
        }),
      );
    }
    render(React.createElement(Wrapper));

    // TechnicalDocumentGroups resuelve `buildFolderTree` con un import()
    // dinámico en un useEffect - hay que esperar a que ese estado se
    // asiente antes de que aparezca la carpeta "PRODUCTOS" (Ficha Zeta y
    // Ficha Alfa cuelgan de PRODUCTOS/ENVASES; Manual suelto no tiene
    // carpeta, así que siempre queda a la raíz, agrupado o no).
    // Tanto el nombre de la carpeta como el título de cada ficha son
    // <input value=...> editables (ver TechnicalDocumentFolderNode /
    // TechnicalDocumentRow), no texto plano - se buscan por su valor.
    await waitFor(() => screen.getByDisplayValue("PRODUCTOS"));
    assert.ok(screen.getByDisplayValue("ENVASES"));
    assert.ok(screen.getByDisplayValue("Ficha Alfa"));
    assert.ok(screen.getByDisplayValue("Ficha Zeta"));
    assert.ok(screen.getByDisplayValue("Manual suelto"));

    // Desagrupar (checkbox real) vuelve a una lista plana ordenada
    // alfabéticamente por título - sin ninguna carpeta.
    fireEvent.click(screen.getByLabelText("Agrupar por carpeta"));
    assert.equal(screen.queryByDisplayValue("PRODUCTOS"), null);
    assert.equal(screen.queryByDisplayValue("ENVASES"), null);
    const titlesInOrder = [...document.querySelectorAll(".technical-document-title-input")].map(
      (input) => input.value,
    );
    assert.deepEqual(titlesInOrder, ["Ficha Alfa", "Ficha Zeta", "Manual suelto"]);
  });

  test("TechnicalDocumentsAdmin: sin Supabase configurado, carga en estado de error y el toggle 'Agrupar por carpeta' sigue siendo interactivo", async () => {
    // useConfirm (usado por deleteDocument/deleteFolder) requiere estar
    // dentro de un <ConfirmProvider> - igual que en App.jsx, que envuelve
    // toda la app con él. Se usa un fixture que importa ambos desde un
    // único entry (ver ese archivo) para que comparta la misma instancia
    // del Context - dos loadJsxModule por separado, uno para
    // TechnicalDocuments.jsx y otro para ConfirmDialog.jsx, generarían dos
    // Context distintos y el provider no matchearía.
    const harness = await loadJsxModule("test/fixtures/technical-documents-with-confirm.jsx");
    render(
      React.createElement(harness.TechnicalDocumentsAdminWithConfirm, {
        session: { user: { email: "felipe@grupopoliplast.com.ar" } },
      }),
    );

    assert.ok(screen.getByText("Base técnica"));
    // Sin credenciales de Supabase en el entorno de test, el fetch inicial
    // falla y documents queda vacío - se ve el Empty state, no un crash.
    await waitFor(() => screen.getByText(/No hay documentos importados todavía/));

    const groupToggle = screen.getByLabelText("Agrupar por carpeta (como en Drive)");
    assert.equal(groupToggle.checked, true, "arranca marcado (groupByFolder=true) según el estado inicial del componente");
    fireEvent.click(groupToggle);
    assert.equal(groupToggle.checked, false);
  });
});
