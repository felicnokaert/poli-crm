import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const migration = await readFile(new URL('../supabase/migrations/20260912024500_shared_quotes.sql', import.meta.url), 'utf8');

test('cotizaciones y renglones tienen RLS y no permiten borrado al equipo', () => {
  for (const table of ['sales_quotes', 'sales_quote_items']) {
    assert.match(migration, new RegExp(`create table if not exists public\\.${table}\\b`, 'i'));
    assert.match(migration, new RegExp(`alter table public\\.${table} enable row level security`, 'i'));
  }
  assert.match(migration, /revoke delete on public\.sales_quotes, public\.sales_quote_items from authenticated/i);
  assert.doesNotMatch(migration, /create policy[^;]+for delete/is);
});

test('cada renglón conserva snapshot comercial y vínculo al catálogo', () => {
  for (const field of ['variant_id', 'product_id', 'product_name', 'sku', 'brand', 'family', 'unit_amount', 'currency', 'vat_rate', 'price_source', 'line_snapshot']) {
    assert.match(migration, new RegExp(`\\b${field}\\b`, 'i'));
  }
  assert.match(migration, /unique index[^;]+\(quote_id, line_key\)/is);
});

test('la cotización registra propietario y último editor autenticado', () => {
  assert.match(migration, /owner_id uuid not null default auth\.uid\(\)/i);
  assert.match(migration, /updated_by uuid not null default auth\.uid\(\)/i);
  assert.match(migration, /updated_by = auth\.uid\(\)/i);
});
