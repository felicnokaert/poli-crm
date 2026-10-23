import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { loadJsxModule } from './helpers/load-jsx.mjs';

afterEach(cleanup);

const FOAM = `Presupuesto compartido total activo: $160.100/día | ACOS global: 11,48% | ROAS global: 8,71x | Inversión 30d: $2.510.372 | Ingresos 30d: $21.869.161
Alerta del panel: “Perdés 114 ventas extras al mes por falta de presupuesto” → Campaña varios 25/09
ACTIVAS (3)
Campaña\tPresupuesto/día\tROAS Obj\tVentas\tROAS real\tACOS\tvs objetivo
Activa 1 general\t$40.000\t10x\t61\t6,41x\t15,6%\t🔴 Por debajo
Activa 2 baldes\t$15.000\t15x\t296\t15,01x\t6,7%\t✅ En objetivo
Campaña varios 25/09\t$10.100\t4,5x\t59\t6,23x\t16,0%\t✅ Por encima
PAUSADAS (1)
Campaña b2\t$0\t4x\t0\t\t\t`;

test('Publicidad: se pega la tabla, se analiza contra el objetivo, se guarda por cuenta y se muestra la vigilancia', async () => {
  const { MlAds } = await loadJsxModule('src/MlAds.jsx');
  const saved = [];
  const accounts = [{ seller_id: 1, nickname: 'POLIPLAST' }, { seller_id: 2, nickname: 'FOAM FACTORY' }];
  const view = render(React.createElement(MlAds, { ads: {}, accounts, onSave: (next) => saved.push(next) }));
  fireEvent.click(screen.getByRole('tab', { name: 'FOAM FACTORY' }));
  fireEvent.change(screen.getByLabelText(/Pegar la tabla de FOAM FACTORY/), { target: { value: FOAM } });
  fireEvent.click(screen.getByRole('button', { name: 'Analizar' }));
  assert.ok(screen.getByText(/se pierden 114 ventas al mes por falta de presupuesto en “Campaña varios 25\/09”/));
  assert.ok(screen.getByText(/Candidatas a más presupuesto/));
  assert.match(screen.getByText(/Candidatas a más presupuesto/).parentElement.textContent, /Campaña varios 25\/09/);
  assert.match(screen.getByText(/Por debajo del objetivo/, { selector: 'strong' }).parentElement.textContent, /Activa 1 general/);
  assert.ok(screen.getByText('Por encima del objetivo'));
  fireEvent.click(screen.getByRole('button', { name: /Guardar para FOAM FACTORY \(4 campañas\)/ }));
  assert.equal(saved.length, 1);
  assert.equal(Object.keys(saved[0]).join(), 'FOAM FACTORY');
  assert.equal(saved[0]['FOAM FACTORY'].campaigns.length, 4);
  view.unmount();
  // Lo guardado se vuelve a mostrar, con la lista de vigilancia (b2 pausada, Activa 2 baldes activa).
  render(React.createElement(MlAds, { ads: saved[0], accounts, onSave() {} }));
  fireEvent.click(screen.getByRole('tab', { name: 'FOAM FACTORY' }));
  const html = document.body.textContent;
  assert.match(html, /Activa 2 baldes/);
  assert.match(html, /b2/);
  assert.match(html, /Pausada/);
});

test('si no hay campañas en lo pegado avisa y no guarda nada', async () => {
  const { MlAds } = await loadJsxModule('src/MlAds.jsx');
  const saved = [];
  render(React.createElement(MlAds, { ads: {}, accounts: [], onSave: (next) => saved.push(next) }));
  fireEvent.change(screen.getByLabelText(/Pegar la tabla de/), { target: { value: 'hola, esto no es una tabla' } });
  fireEvent.click(screen.getByRole('button', { name: 'Analizar' }));
  assert.ok(screen.getByText(/No encontré campañas/));
  assert.equal(saved.length, 0);
});
