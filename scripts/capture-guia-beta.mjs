import { chromium } from '/opt/node-tools/node_modules/playwright-core/index.mjs';
const OUT = '/tmp/claude-0/guide';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const p = await b.newPage({ viewport: { width: 1280, height: 760 }, deviceScaleFactor: 1 });
await p.addInitScript(() => { localStorage.setItem('poliplast-theme', 'claro'); localStorage.setItem('poliplast-simulate-member', '1'); });
await p.goto('http://localhost:4173'); await p.waitForTimeout(1200);
await p.getByText('Ya entendí, ocultar esto').click().catch(() => {});
const shot = async (name) => { await p.waitForTimeout(900); await p.screenshot({ path: `${OUT}/${name}.jpg`, type: 'jpeg', quality: 72 }); console.log('ok', name); };
async function go(label) {
  const sel = () => p.locator('nav button:not(.nav-group-title)').filter({ hasText: label }).first();
  if (!(await sel().count())) for (const g of ['Hoy','Ventas', 'Cartera', 'Aprender', 'Más']) { await p.locator('nav button.nav-group-title').filter({ hasText: g }).click().catch(() => {}); if (await sel().count()) break; }
  await sel().click({ timeout: 4000 });
}
const tab = async (name) => p.getByRole('tab', { name }).first().click().catch(() => p.getByRole('button', { name }).first().click().catch(() => {}));
await shot('01-inicio');
await go('Por revisar'); await shot('02-por-revisar');
await go('Tareas'); await shot('03-tareas');
await tab('Cierre del día'); await shot('04-rutina');
await tab('Calendario'); await shot('05-calendario');
await go('Cuentas activas'); await shot('06-cuentas');
await go('Ventas'); await shot('07-ventas');
await go('Prospección'); await shot('08-prospeccion');
await tab('Buscar con IA'); await shot('09-prospeccion-buscar');
await tab('Competencia'); await shot('10-competencia');
await go('Historial'); await shot('11-historial');
await go('Empresas y contactos'); await shot('12-empresas');
await tab('Personas de contacto'); await shot('13-contactos');
await go('Mapa'); await shot('14-mapa');
await go('Academia'); await shot('15-academia-buscar');
for (const [n, t] of [['16-academia-metodo', 'Método'], ['17-academia-objeciones', 'Objeciones'], ['18-academia-competencia', 'Competencia'], ['19-academia-equipo', 'Equipo'], ['20-academia-practica', 'Biblioteca y práctica'], ['21-academia-evaluar', 'Evaluar conversaciones']]) {
  await p.locator('.academy-hero .segmented button').filter({ hasText: t }).first().click().catch(() => {}); await shot(n);
}
await go('Base técnica'); await shot('22-base-tecnica');
await go('Perfil'); await shot('23-perfil');
await go('Datos'); await shot('24-datos');
await p.keyboard.press('Control+k'); await p.keyboard.type('corral'); await shot('25-busqueda-global'); await p.keyboard.press('Escape');
await p.evaluate(() => { document.documentElement.dataset.theme = 'dark'; }); await go('Inicio'); await shot('26-modo-oscuro');
await b.close();
