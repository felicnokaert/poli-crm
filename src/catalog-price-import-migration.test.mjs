import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
const sql=await readFile(new URL('../supabase/migrations/20260912133000_catalog_price_import_rpc.sql',import.meta.url),'utf8')
test('cada importación crea lista y auditoría nuevas',()=>{assert.match(sql,/insert into public\.price_lists/);assert.match(sql,/catalog_import_jobs/);assert.match(sql,/catalog_import_rows/)})
test('revertir vence lista y precios sin borrarlos',()=>{const part=sql.slice(sql.indexOf('revert_catalog_price_import'));assert.match(part,/status='vencido'/);assert.match(part,/status='vencida'/);assert.doesNotMatch(part,/delete\s+from/i)})
test('solo authenticated puede ejecutar y la función valida admin',()=>{assert.match(sql,/is_poliplast_crm_admin/);assert.match(sql,/grant execute .* to authenticated/)})
