import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const migration = await readFile(new URL('../docs/MIGRACION_CATALOGO_COTIZADOR_INVENTARIO.sql', import.meta.url), 'utf8');

test('la migración separa identidad precio costo conteo y saldo aprobado', () => {
  for (const table of [
    'catalog_products', 'catalog_variants', 'catalog_cost_revisions', 'price_lists',
    'variant_prices', 'inventory_locations', 'inventory_counts',
    'inventory_count_lines', 'inventory_balances', 'catalog_import_jobs', 'catalog_import_rows',
  ]) {
    assert.match(migration, new RegExp(`create table if not exists public\\.${table}\\b`, 'i'));
    assert.match(migration, new RegExp(`alter table public\\.${table} enable row level security`, 'i'));
  }
});

test('el SKU normalizado es único y las importaciones conservan antes y después', () => {
  assert.match(migration, /unique index[^;]+upper\(btrim\(sku\)\)/is);
  assert.match(migration, /before_data jsonb/i);
  assert.match(migration, /after_data jsonb/i);
  assert.match(migration, /file_sha256 text not null/i);
});

test('costos e importaciones quedan limitados al administrador', () => {
  assert.match(migration, /"Admin lee costos"[\s\S]+is_poliplast_crm_admin\(\)/i);
  assert.match(migration, /"Admin administra importaciones"[\s\S]+is_poliplast_crm_admin\(\)/i);
  assert.doesNotMatch(migration, /"Equipo lee costos"/i);
});

test('el stock aprobado exige origen en un conteo y no admite cantidades negativas', () => {
  assert.match(migration, /approved_quantity numeric\(18,6\) not null check \(approved_quantity >= 0\)/i);
  assert.match(migration, /count_id uuid not null references public\.inventory_counts\(id\)/i);
  assert.match(migration, /approved_count_has_approver/i);
});
