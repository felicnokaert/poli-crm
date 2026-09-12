// Helper para poder importar componentes .jsx reales dentro de `node --test`,
// sin agregar jsdom/testing-library/vitest al proyecto.
//
// `node --test` no sabe parsear JSX (falla con ERR_UNKNOWN_FILE_EXTENSION /
// SyntaxError apenas ve un `<div>` dentro de un .jsx). Vite 8 ya trae
// `rolldown` como dependencia (motor de bundling en Rust con soporte de JSX
// vía oxc) — lo reutilizamos en frío, sin instalar nada nuevo, para compilar
// cada componente a un .mjs plano (JSX -> React.createElement) y después
// importarlo normalmente. React y react-dom se dejan `external`: el bundle
// resultante los sigue resolviendo como paquetes de node_modules normales.
//
// El archivo compilado se escribe a disco (test/.jsx-cache) en vez de usar
// un `data:` URL porque la resolución de specifiers "bare" (react, lucide-react)
// en un módulo ESM necesita poder caminar hacia arriba por el filesystem
// buscando node_modules, y eso requiere que el módulo tenga una URL de
// archivo real dentro del proyecto.
import { rolldown } from "rolldown";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { pathToFileURL } from "node:url";

const CACHE_DIR = path.resolve(import.meta.dirname, "..", ".jsx-cache");
mkdirSync(CACHE_DIR, { recursive: true });

const EXTERNAL = new Set([
  "react",
  "react/jsx-runtime",
  "react/jsx-dev-runtime",
  "react-dom",
  "react-dom/server",
  "lucide-react",
  "@supabase/supabase-js",
]);

// src/online.js lee `import.meta.env.VITE_SUPABASE_URL` / `..._ANON_KEY`
// (variables que Vite inyecta en build time). Bajo Node puro `import.meta.env`
// no existe, y acceder a una propiedad de `undefined` tira TypeError apenas
// se carga el módulo. Se reemplazan por `undefined` acá (igual que Vite haría
// en un entorno sin esas env vars seteadas) para que cualquier módulo que
// importe transitivamente `online.js` cargue en modo "sin Supabase" —
// exactamente el comportamiento real cuando no hay credenciales configuradas.
const DEFINE = {
  "import.meta.env.VITE_SUPABASE_URL": "undefined",
  "import.meta.env.VITE_SUPABASE_ANON_KEY": "undefined",
};

/**
 * Compila un .jsx (o .js con JSX) a un módulo ESM plano y lo importa.
 * @param {string} srcRelPath ruta relativa a la raíz del repo, ej. "src/ui-primitives.jsx"
 * @returns {Promise<any>} el namespace del módulo (sus exports)
 */
export async function loadJsxModule(srcRelPath) {
  const entry = path.resolve(import.meta.dirname, "..", "..", srcRelPath);
  const bundle = await rolldown({
    input: entry,
    external: (id) => EXTERNAL.has(id) || id.startsWith("node:"),
    resolve: { extensions: [".jsx", ".js", ".mjs"] },
    transform: { define: DEFINE },
    onwarn: () => {}, // los warnings de rolldown (ej. "use client") no aportan nada acá
  });
  const { output } = await bundle.generate({ format: "esm" });
  await bundle.close();
  const code = output[0].code;

  const hash = crypto.createHash("sha1").update(srcRelPath).digest("hex").slice(0, 10);
  const outFile = path.join(CACHE_DIR, `${path.basename(srcRelPath, path.extname(srcRelPath))}.${hash}.mjs`);
  writeFileSync(outFile, code, "utf8");

  return import(pathToFileURL(outFile).href + `?t=${Date.now()}`);
}
