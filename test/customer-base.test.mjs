import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildCustomerBase, parseArNumber, nameKey, customerStatus, coverageByCompany, comprobanteAmount } from '../src/customer-base.mjs';
import { reactivationQueue, quotedQueue, newProspectsQueue, reactivationMessage, quoteMessage, logClientContact, recentlyWorked } from '../src/daily-queues.mjs';
import { blankProspect } from '../src/prospect-model.mjs';

const TODAY = '2026-10-21';
const clients = [
  { id: 'c1', company: 'Carrocerías Norte S.A.', contact: 'marta gómez', mainProduct: 'Resina epoxi' },
  { id: 'c2', company: 'Juan Pérez' },
  { id: 'c3', company: 'Frío Sur SRL' },
  { id: 'c4', company: 'Sin comprobantes' },
];
const fc = (cliente, fecha, total, company = 'COMARG', tipo = 'FCA') => ({ company, tipo, fecha, cliente, total });

test('los importes de Contabilium vienen con formato argentino', () => {
  assert.equal(parseArNumber('39.025,52'), 39025.52);
  assert.equal(parseArNumber('179.618,42'), 179618.42);
  assert.equal(parseArNumber(1200), 1200);
  assert.equal(parseArNumber(''), null);
  assert.equal(comprobanteAmount({ total: null, raw: { ImporteTotalNeto: '16.800,00' } }), 16800);
});

test('los nombres se emparejan sin acentos, signos ni forma societaria, y en cualquier orden', () => {
  assert.equal(nameKey('Carrocerías Norte S.A.'), nameKey('CARROCERIAS NORTE'));
  assert.equal(nameKey('PÉREZ JUAN'), nameKey('Juan Pérez'));
  assert.notEqual(nameKey('Frío Sur SRL'), nameKey('Frío Norte SRL'));
});

test('estado según los días desde la última compra', () => {
  assert.equal(customerStatus(30), 'activo');
  assert.equal(customerStatus(91), 'dormido');
  assert.equal(customerStatus(366), 'inactivo');
  assert.equal(customerStatus(null), 'sin compras registradas');
});

test('arma la ficha del cliente: última compra, cantidad, frecuencia, estado, grande y razones sociales', () => {
  const rows = [
    fc('CARROCERIAS NORTE', '2026-01-10', '100.000,00'),
    fc('Carrocerías Norte S.A.', '2026-03-10', '120.000,00', 'POLIPLAST'),
    fc('CARROCERIAS NORTE', '2026-05-10', '110.000,00'),
    fc('CARROCERIAS NORTE', '2026-05-12', '500,00', 'COMARG', 'NCA'), // nota de crédito: no es compra
    fc('Juan Pérez', '2026-10-01', '5.000,00'),
    fc('Frío Sur SRL', '2023-01-01', '9.000,00'),
    fc('Alguien que no está en el CRM', '2026-10-01', '1.000,00'),
  ];
  const { byClient, unmatchedCount } = buildCustomerBase(rows, clients, { today: TODAY });
  const norte = byClient.get('c1');
  assert.equal(norte.purchaseCount, 3);
  assert.equal(norte.lastPurchase, '2026-05-10');
  assert.equal(norte.daysSince, 164);
  assert.equal(norte.status, 'dormido');
  assert.equal(norte.recurrent, true);
  assert.equal(norte.big, true);
  assert.equal(norte.frequencyDays, 60);
  assert.equal(norte.total24, 330000);
  assert.deepEqual(norte.razonesSociales, ['CARROCERIAS NORTE', 'Carrocerías Norte S.A.']);
  assert.deepEqual(norte.companies, ['COMARG', 'POLIPLAST']);
  assert.equal(byClient.get('c2').status, 'activo');
  assert.equal(byClient.get('c3').status, 'inactivo');
  assert.equal(byClient.has('c4'), false, 'sin comprobantes no se inventa nada');
  assert.equal(unmatchedCount, 1);
});

test('la cobertura dice de qué a qué fecha hay datos por empresa', () => {
  const cover = coverageByCompany([fc('a', '2025-02-12', 1), fc('b', '2026-10-21', 1), fc('c', '2020-05-05', 1, 'FOAMFACTORY')]);
  assert.deepEqual(cover.COMARG, { from: '2025-02-12', to: '2026-10-21', count: 2 });
  assert.equal(cover.FOAMFACTORY.from, '2020-05-05');
});

test('Reactivar: recurrentes o grandes que dejaron de comprar, con motivo y sin los ya trabajados', () => {
  const rows = [
    fc('CARROCERIAS NORTE', '2026-01-10', '100.000,00'), fc('CARROCERIAS NORTE', '2026-03-10', '120.000,00'), fc('CARROCERIAS NORTE', '2026-05-10', '110.000,00'),
    fc('Juan Pérez', '2026-10-01', '5.000,00'),
    fc('Frío Sur SRL', '2025-09-01', '9.000,00'),
  ];
  const { byClient } = buildCustomerBase(rows, clients, { today: TODAY });
  let queue = reactivationQueue({ clients, base: byClient, today: TODAY });
  assert.deepEqual(queue.map((item) => item.client.id), ['c1']);
  assert.match(queue[0].reason, /cliente grande/);
  assert.match(queue[0].reason, /3 compras en 24 meses/);
  const worked = clients.map((client) => (client.id === 'c1' ? logClientContact(client, { queue: 'reactivar', outcome: 'No respondió', user: 'felipe', now: '2026-10-15T12:00:00.000Z' }) : client));
  assert.equal(recentlyWorked(worked[0], 'reactivar', TODAY), true);
  queue = reactivationQueue({ clients: worked, base: byClient, today: TODAY });
  assert.equal(queue.length, 0, 'ya trabajado hace menos de 14 días');
});

test('Cotizaron y no compraron: cotización (Contabilium o marcada) sin factura posterior', () => {
  const rows = [
    fc('Juan Pérez', '2026-10-10', '8.000,00', 'COMARG', 'COT'),
    fc('Frío Sur SRL', '2026-09-01', '8.000,00', 'COMARG', 'COT'),
    fc('Frío Sur SRL', '2026-09-20', '8.000,00'), // compró después de cotizar
    fc('CARROCERIAS NORTE', '2026-10-20', '8.000,00', 'COMARG', 'COT'), // pronto: 1 día
  ];
  const marked = clients.map((client) => (client.id === 'c4' ? { ...client, lastQuotedAt: '2026-10-05T10:00:00.000Z' } : client));
  const { byClient } = buildCustomerBase(rows, marked, { today: TODAY });
  const queue = quotedQueue({ clients: marked, base: byClient, today: TODAY });
  assert.deepEqual(queue.map((item) => item.client.id), ['c2', 'c4']);
  assert.equal(queue[0].days, 11);
  assert.match(queue[1].reason, /cotizó hace 16 días/);
});

test('mensajes listos: sin precios ni promesas, con lo que sí sabemos', () => {
  const reactivar = reactivationMessage(clients[0], { lastPurchase: '2026-05-10' }, 'Felipe');
  assert.match(reactivar, /Hola Marta/);
  assert.match(reactivar, /mayo de 2026, Resina epoxi/);
  assert.doesNotMatch(reactivar, /\$|USD|descuento/);
  const quote = quoteMessage(clients[1], { date: '2026-10-10' }, 'Felipe');
  assert.match(quote, /Hola Juan Pérez/);
  assert.match(quote, /10\/10\/2026/);
});

test('Prospectos nuevos: encaje y puntaje altos primero', () => {
  const a = blankProspect({ id: 'a', company: 'A', phone: '1' }, { now: '2026-10-01' });
  const b = blankProspect({ id: 'b', company: 'B', phone: '1', fitLevel: 'Alto', sheetScore: 80, zone: 'A' }, { now: '2026-10-02' });
  assert.deepEqual(newProspectsQueue({ prospects: [a, b] }).map((item) => item.id), ['b', 'a']);
});

test('empareja por CUIT o teléfono de la ficha de Contabilium aunque el nombre difiera (22/10)', async () => {
  const { buildCustomerBase } = await import('../src/customer-base.mjs');
  const clients = [{ id: 'a', company: 'Aislaciones Lavopa', cuit: '20-22575469-2' }, { id: 'b', company: 'Espumas Norte', phone: '+54 9 11 6832-5335' }];
  const rows = [
    { company: 'POLIPLAST', tipo: 'FCA', fecha: '2026-09-01', cliente: 'ROLANDO MAXIMILIANO LAVOPA', total: 1000, cuit: '20225754692' },
    { company: 'POLIPLAST', tipo: 'FCA', fecha: '2026-09-05', cliente: 'OTRO NOMBRE SRL', total: 500, tel: '011 6832 5335' },
  ];
  const { byClient } = buildCustomerBase(rows, clients, { today: '2026-10-22' });
  assert.equal(byClient.get('a').purchaseCount, 1);
  assert.equal(byClient.get('b').purchaseCount, 1);
});

test('lo trabajado a la noche (después de las 21:00 argentinas, ya es el día siguiente en UTC) también queda enfriado 14 días', () => {
  const worked = logClientContact({ id: 'c1' }, { queue: 'reactivar', outcome: 'Precio', now: '2026-10-22T01:30:00.000Z' }); // 22:30 del 21/10 en Argentina
  assert.equal(worked.lastContact, '2026-10-21');
  assert.equal(recentlyWorked(worked, 'reactivar', '2026-10-21'), true, 'el mismo día argentino ya cuenta como trabajado');
  assert.equal(recentlyWorked(worked, 'reactivar', '2026-11-04'), true);
  assert.equal(recentlyWorked(worked, 'reactivar', '2026-11-06'), false);
});
