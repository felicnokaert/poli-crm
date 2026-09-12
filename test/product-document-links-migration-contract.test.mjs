import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const migration = await readFile(new URL('../supabase/migrations/20260912113000_product_document_links.sql', import.meta.url), 'utf8');

test('el vínculo exige un único alcance explícito y una justificación', () => {
  assert.match(migration, /scope_type text not null check \(scope_type in \('product','variant','subfamily'\)\)/i);
  assert.match(migration, /constraint product_document_link_scope check/i);
  assert.match(migration, /constraint product_document_link_reason check \(btrim\(reason\) <> ''\)/i);
});

test('solo el administrador modifica vínculos y el equipo puede leerlos', () => {
  assert.match(migration, /"Equipo lee vinculos tecnicos"[\s\S]+is_poliplast_crm_user\(\)/i);
  assert.match(migration, /"Admin administra vinculos tecnicos"[\s\S]+is_poliplast_crm_admin\(\)/i);
});

test('no admite dos veces el mismo documento para el mismo alcance', () => {
  assert.match(migration, /unique index[^;]+document_id, product_id/is);
  assert.match(migration, /unique index[^;]+document_id, variant_id/is);
  assert.match(migration, /unique index[^;]+document_id, lower\(btrim\(family\)\), lower\(btrim\(subfamily\)\)/is);
});
