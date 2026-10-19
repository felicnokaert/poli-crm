import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react";
import { loadJsxModule } from "./helpers/load-jsx.mjs";
import { filterGuides, guideFamilies, guideToText } from "../src/product-guides.mjs";
import { searchKnowledge } from "../src/knowledge-search.mjs";

afterEach(cleanup);

const guides = [
  { id: "g1", family: "Resinplast", product: "Resina UV", summary: "Cura con lámpara", sections: [{ title: "Datos", items: ["Capas de 2 mm"] }], sources: [{ title: "FICHA UV" }], status: "borrador" },
  { id: "g2", family: "Poliuretano", product: "Espuma 770", summary: "Para techos", sections: [{ title: "Usos", items: ["Galpones y techos"] }], sources: [], status: "validada" },
];

test("filtra por familia y palabras, ordena por familia, pesa más el nombre", () => {
  assert.deepEqual(guideFamilies(guides), ["Poliuretano", "Resinplast"]);
  assert.deepEqual(filterGuides(guides).map((g) => g.id), ["g2", "g1"]);
  assert.deepEqual(filterGuides(guides, { family: "Resinplast" }).map((g) => g.id), ["g1"]);
  assert.deepEqual(filterGuides(guides, { query: "techos" }).map((g) => g.id), ["g2"]);
  assert.deepEqual(filterGuides(guides, { query: "techos lámpara" }), []);
});

test("el texto para copiar lleva fuentes y aviso de borrador", () => {
  const text = guideToText(guides[0]);
  assert.match(text, /Capas de 2 mm/);
  assert.match(text, /Fuente: FICHA UV/);
  assert.match(text, /Borrador sin validar/);
  assert.doesNotMatch(guideToText(guides[1]), /Borrador/);
});

test("el buscador de Academia encuentra las guías", () => {
  const r = searchKnowledge("galpones", { guides });
  assert.deepEqual(r.groups.guias.map((i) => i.id), ["g2"]);
});

function fakeSupabase(rows, updates) {
  return {
    from: () => ({
      select: () => Promise.resolve({ data: rows, error: null }),
      update: (patch) => ({ eq: (_c, id) => ({ select: () => { updates.push({ id, patch }); return Promise.resolve({ data: [{ id }], error: null }); } }) }),
    }),
  };
}

test("muestra las guías, abre una y Felipe la valida", async () => {
  const { ProductGuides } = await loadJsxModule("src/ProductGuides.jsx");
  const updates = [];
  render(React.createElement(ProductGuides, { supabase: fakeSupabase(guides, updates), isAdmin: true, userEmail: "f@x" }));
  await screen.findByText("Resina UV");
  fireEvent.click(screen.getByText("Resina UV"));
  assert.ok(screen.getByText("Capas de 2 mm"));
  fireEvent.click(screen.getByRole("button", { name: "Validar" }));
  await waitFor(() => assert.equal(updates.length, 1));
  assert.equal(updates[0].patch.status, "validada");
  await screen.findByRole("button", { name: "Volver a borrador" });
});

test("el resto del equipo no ve los botones de validar", async () => {
  const { ProductGuides } = await loadJsxModule("src/ProductGuides.jsx");
  render(React.createElement(ProductGuides, { supabase: fakeSupabase(guides, []), isAdmin: false }));
  fireEvent.click(await screen.findByText("Resina UV"));
  assert.equal(screen.queryByRole("button", { name: "Validar" }), null);
});
