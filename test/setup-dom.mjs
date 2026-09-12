// Precarga global de jsdom para toda la suite, vía `node --test --import`
// (configurado en el script "test" de package.json).
//
// Por qué --import y no un import manual repetido en cada archivo:
// - `node --test` no trae jsdom integrado: sin un DOM global, cualquier test
//   que use @testing-library/react (que necesita document/window para
//   montar y limpiar el árbol real) explota con "document is not defined".
// - La alternativa obvia es que cada archivo de test que necesite DOM haga
//   `import "./setup-dom.mjs"` como primera línea. Eso funciona, pero es
//   frágil: alguien crea test/nuevo-componente.test.mjs, se olvida esa
//   línea, y el error resultante (ReferenceError: document is not defined,
//   disparado adentro de testing-library) no dice "te faltó el import" -
//   hay que saber la causa de antemano para diagnosticarlo rápido.
// - `node --import test/setup-dom.mjs --test` precarga este módulo antes de
//   CADA archivo de test (documentado por Node: --import se aplica al
//   proceso completo, no por-archivo, así que corre una sola vez para toda
//   la corrida de `node --test`). Ningún archivo nuevo puede "olvidarse" de
//   esto porque no depende de que alguien se acuerde de escribir el import.
//
// Costo: los ~360 tests preexistentes (que no tocan DOM) ahora también
// cargan jsdom una vez al arrancar el proceso. jsdom no se instancia por
// archivo, solo una vez por proceso de test, así que el costo es fijo y
// chico - no un new JSDOM() por archivo.
import { JSDOM } from "jsdom";

const dom = new JSDOM("<!doctype html><html><body></body></html>", {
  url: "http://localhost/",
  pretendToBeVisual: true, // habilita requestAnimationFrame, que React usa
});

const { window } = dom;

// Copiar las propiedades del window de jsdom al global de Node, sin pisar
// las que Node ya define de forma nativa (ej. process, Buffer) y que jsdom
// no toca de todos modos. Es el mismo patrón que usa jsdom-global.
const keysToCopy = Object.getOwnPropertyNames(window).filter(
  (key) => !(key in globalThis),
);
for (const key of keysToCopy) {
  try {
    globalThis[key] = window[key];
  } catch {
    // algunas propiedades (ej. algunos getters de location) tiran al
    // reasignarse - no son necesarias para los tests, se ignoran.
  }
}

// Estas sí pueden pisar algo existente y las necesitamos explícitamente.
globalThis.window = window;
globalThis.document = window.document;
// Node 21+ define su propio `globalThis.navigator` (NavigatorNode, con
// solo `userAgent`) como getter-only - una asignación directa tira
// "Cannot set property navigator of #<Object> which has only a getter".
// Object.defineProperty lo reemplaza igual, sea cual sea su descriptor.
Object.defineProperty(globalThis, "navigator", {
  value: window.navigator,
  configurable: true,
  writable: true,
});

// jsdom no implementa matchMedia; algunos componentes/hoja de estilos lo
// consultan. Un stub simple evita "matchMedia is not a function".
if (!window.matchMedia) {
  window.matchMedia = () => ({
    matches: false,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  });
  globalThis.matchMedia = window.matchMedia;
}

// localStorage: jsdom lo implementa, pero solo si el documento no es
// "about:blank" (por eso se pasó `url` arriba). Se expone también en
// globalThis por si algún módulo lo usa sin pasar por window.
globalThis.localStorage = window.localStorage;
