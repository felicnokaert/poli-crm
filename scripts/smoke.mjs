import { createRequire } from 'node:module';

const runtimeRequire = createRequire('file:///C:/Users/felip/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.js');
const { chromium } = runtimeRequire('playwright');

const browser = await chromium.launch({
  headless: true,
  executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
});
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
await page.goto('http://127.0.0.1:5173/', { waitUntil: 'networkidle' });
await page.getByRole('button', { name: 'Registrar conversación' }).click();
await page.getByLabel('Empresa').fill('Cliente de prueba');
await page.getByLabel('Persona / cargo').fill('María · Compras');
await page.getByLabel('¿Qué hablaron?').fill('Consulta de validación del flujo local.');
await page.getByLabel('Necesidad detectada').fill('Validar memoria comercial.');
await page.getByLabel('Próxima acción').fill('Realizar seguimiento de prueba');
await page.getByRole('button', { name: 'Guardar y crear seguimiento' }).click();
await page.getByRole('button', { name: 'Pipeline' }).click();
await page.getByText('Cliente de prueba').waitFor();
await page.getByRole('button', { name: 'Respuestas' }).click();
await page.getByText('Biblioteca de respuestas rápidas').waitFor();
await page.getByRole('button', { name: 'Entrenador' }).click();
await page.getByText('14 criterios').waitFor();
await page.getByRole('button', { name: 'Datos' }).click();
await page.getByText('Datos y respaldos').waitFor();
const downloadPromise = page.waitForEvent('download');
await page.getByRole('button', { name: 'Descargar respaldo' }).click();
const download = await downloadPromise;
if (!download.suggestedFilename().endsWith('.json')) throw new Error('El respaldo no es JSON');
await page.screenshot({ path: 'tmp/smoke-data.png', fullPage: true });
console.log('SMOKE_OK');
await browser.close();
