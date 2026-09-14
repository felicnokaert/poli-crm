import test from 'node:test';
import assert from 'node:assert/strict';
import { loadJsxModule } from './helpers/load-jsx.mjs';

// technical-documents-repo.mjs importa online.js (Supabase), que bajo test
// (sin VITE_SUPABASE_URL, ver load-jsx.mjs) siempre corre en modo
// "no configurado" - exactamente el mismo modo local/demo en el que Felipe
// encontró el bug real: abrir Base técnica tiraba un TypeError crudo
// ("Cannot read properties of null (reading 'from')") en vez de un mensaje
// explicable. Se usa loadJsxModule (no un import directo) porque este
// archivo depende transitivamente de import.meta.env, que no existe bajo
// `node --test` sin pasar por el mismo bundling que ya resuelve ese caso
// para los .jsx.
test('fetchTechnicalDocuments da un mensaje explicable en modo local (sin Supabase), no un TypeError crudo', async () => {
  const { fetchTechnicalDocuments } = await loadJsxModule('src/technical-documents-repo.mjs');
  await assert.rejects(fetchTechnicalDocuments(), (error) => {
    assert.match(error.message, /Supabase configurada/);
    assert.doesNotMatch(error.message, /Cannot read properties/);
    return true;
  });
});
