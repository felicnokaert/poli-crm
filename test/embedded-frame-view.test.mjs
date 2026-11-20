import test from "node:test";
import assert from "node:assert/strict";
import { visibleSlice } from "../src/embedded-frame-view.mjs";

const rect = (top, height, extra = {}) => ({ top, bottom: top + height, height, width: 1000, ...extra });

test("visibleSlice: iframe más alto que la pantalla, desplazado 300 px", () => {
  assert.deepEqual(visibleSlice({ rect: rect(-300, 3000), viewportHeight: 800 }), { top: 300, alto: 800 });
});

test("visibleSlice: el iframe empieza más abajo del principio de la pantalla", () => {
  assert.deepEqual(visibleSlice({ rect: rect(120, 3000), viewportHeight: 800 }), { top: 0, alto: 680 });
});

test("visibleSlice: en el celular descuenta la barra de arriba y la de abajo", () => {
  const slice = visibleSlice({
    rect: rect(-500, 4000, { width: 390 }),
    viewportHeight: 844,
    viewportWidth: 390,
    topBar: { top: 0, bottom: 56, width: 390, height: 56 },
    bottomBar: { top: 780, bottom: 844, width: 390, height: 64 },
  });
  assert.deepEqual(slice, { top: 556, alto: 724 });
});

test("visibleSlice: la columna lateral de la compu no cuenta como barra de arriba", () => {
  const slice = visibleSlice({ rect: rect(-200, 3000), viewportHeight: 900, viewportWidth: 1400, topBar: { top: 0, bottom: 900, width: 238, height: 900 } });
  assert.deepEqual(slice, { top: 200, alto: 900 });
});

test("visibleSlice: fuera de pantalla da alto 0", () => {
  assert.equal(visibleSlice({ rect: rect(-5000, 1000), viewportHeight: 800 }).alto, 0);
});
