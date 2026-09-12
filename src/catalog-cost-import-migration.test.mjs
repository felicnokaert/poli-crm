import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const sql = await readFile(new URL('../supabase/migrations/20260912123000_catalog_cost_import_rpc.sql', import.meta.url), 'utf8')

test('la importación de costos es admin, atómica y deja auditoría', () => {
  assert.match(sql, /is_poliplast_crm_admin\(\)/)
  assert.match(sql, /catalog_import_jobs/)
  assert.match(sql, /catalog_import_rows/)
  assert.match(sql, /catalog_cost_revisions/)
  assert.match(sql, /security definer/)
})

test('la reversión vence revisiones sin borrarlas', () => {
  const revert = sql.slice(sql.indexOf('create or replace function public.revert_catalog_cost_import'))
  assert.match(revert, /set status = 'vencido'/)
  assert.doesNotMatch(revert, /delete\s+from\s+public\.catalog_cost_revisions/i)
  assert.match(revert, /status = 'revertido'/)
})

test('las funciones no son ejecutables por anon', () => {
  assert.match(sql, /revoke all on function public\.apply_catalog_cost_import\(text, text, jsonb\) from public, anon/)
  assert.match(sql, /grant execute on function public\.apply_catalog_cost_import\(text, text, jsonb\) to authenticated/)
})
