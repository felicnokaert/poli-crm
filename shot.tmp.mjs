import { chromium } from '/opt/node-tools/node_modules/playwright-core/index.mjs';
const S='/tmp/claude-0/-home-user-poli-crm/81656635-de2e-52d6-a7ff-492437e2e608/scratchpad';
const b = await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});
const p = await b.newPage({viewport:{width:1300,height:900}});
const errs=[]; p.on('pageerror',e=>errs.push('PAGE: '+e.message)); p.on('console',m=>{ if(m.type()==='error') errs.push('CONSOLE: '+m.text()); });
await p.goto('http://localhost:4173'); await p.waitForTimeout(1500);
for (const g of ['Ventas','Organización','Cartera','Recursos','Sistema']) { await p.getByText(new RegExp('^'+g+'$','i')).first().click().catch(()=>{}); await p.waitForTimeout(200); }
const items = await p.locator('aside nav button, nav button').allInnerTexts();
const names=[...new Set(items.map(t=>t.split('\n')[0].trim()).filter(Boolean))];
console.log('menu:', names.join(' | '));
let i=0;
for (const n of names) {
  const btn = p.locator('nav button').filter({hasText:n}).first();
  if(!(await btn.count())) continue;
  const before=errs.length;
  await btn.click().catch(()=>{}); await p.waitForTimeout(700);
  const h = await p.locator('h1,h2').first().innerText().catch(()=>'?');
  const blank = (await p.locator('main, .content, body').first().innerText()).trim().length<30;
  await p.screenshot({path:`${S}/v${String(i++).padStart(2,'0')}.png`});
  console.log(n.padEnd(24),'->',h.slice(0,40).padEnd(40), blank?'EN BLANCO':'ok', errs.length>before?'ERRORES':'');
}
console.log('errores totales:', errs.length); errs.slice(0,10).forEach(e=>console.log(e));
await b.close();
