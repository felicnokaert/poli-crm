import assert from 'node:assert/strict';
import test from 'node:test';
import { buildMapClients, formatCuit, isoFromCrmDate, toMapClient } from '../src/map-clients-adapter.mjs';
import { deptoZona, jitter, normClave, nuevoCache, provinciaCanonica, ubicarClientes } from '../src/georef.mjs';

test('provinciaCanonica reconoce nombres sin tildes, alias y CABA', () => {
  assert.equal(provinciaCanonica('Cordoba').cod, '14');
  assert.equal(provinciaCanonica('Ciudad De Buenos Aires').cod, '02');
  assert.equal(provinciaCanonica('capital federal').cod, '02');
  assert.equal(provinciaCanonica('Entre Rios').nombre, 'Entre Ríos');
  assert.equal(provinciaCanonica('Narnia'), null);
  assert.equal(normClave('  Mar   del Plata '), 'MAR DEL PLATA');
  assert.equal(deptoZona('02014'), '02000');
  assert.equal(deptoZona('06427'), '06427');
});

test('isoFromCrmDate y formatCuit', () => {
  assert.equal(isoFromCrmDate('15/09/2026'), '2026-09-15');
  assert.equal(isoFromCrmDate('2026-09-15'), null);
  assert.equal(formatCuit('30709718661'), '30-70971866-1');
  assert.equal(formatCuit('12345678'), '12345678');
});

test('toMapClient usa polio8 facturado: compras, última fecha y productos', () => {
  const c = toMapClient({
    id: 'a', company: 'ACME', cuit: '30709718661', province: 'Cordoba', city: 'Villa Maria',
    email: 'a@acme.com', phone: '3535699820', lastPurchase: '01/08/2026',
    polio8: { invoiced: true, documents: 18, lastDate: '2026-08-24', products: [{ name: 'ISO PM TAMBOR', times: 17, qty: 7000, last: '2026-07-06' }] },
  });
  assert.equal(c.doc, '30709718661');
  assert.equal(c.cuit, '30-70971866-1');
  assert.equal(c.provincia_cod, '14');
  assert.equal(c.compro, true);
  assert.equal(c.ultima_compra, '2026-08-24'); // gana la más reciente
  assert.equal(c.n_facturas, 18);
  assert.deepEqual(c.productos, [{ producto: 'ISO PM TAMBOR', veces: 17, kg: 7000, ultima: '2026-07-06' }]);
  assert.equal(c.es_aplicador, null);
});

test('toMapClient: compra sin factura usa la última cotización como fecha aproximada', () => {
  const c = toMapClient({
    id: 'b', company: 'SIN FACTURA SRL', cuit: '20245395206', province: 'Buenos Aires', city: 'Lincoln',
    purchaseWithoutInvoice: true,
    polio8: { invoiced: false, documents: 20, lastDate: '2026-09-07', products: [{ name: '618 SP' }] },
  });
  assert.equal(c.compro, true);
  assert.equal(c.n_facturas, 0);
  assert.equal(c.n_cotizaciones, 20);
  assert.equal(c.ultima_compra, '2026-09-07');
  assert.equal(c.ultima_cotizacion, '2026-09-07');
});

test('toMapClient: cliente sin compras ni CUIT usa su id y no figura como comprador', () => {
  const c = toMapClient({ id: 'xyz', company: 'Prospecto', province: '', city: '' });
  assert.equal(c.doc, 'xyz');
  assert.equal(c.compro, false);
  assert.equal(c.provincia_cod, null);
});

test('buildMapClients descarta duplicados por documento y agrega la ubicación', () => {
  const crm = [
    { id: '1', company: 'A', cuit: '30-70971866-1' },
    { id: '2', company: 'A duplicado', cuit: '30709718661' },
  ];
  const geo = new Map([['30709718661', { lat: -34, lon: -58, depto_id: '06427', precision: 'localidad', motivo_aprox: null }]]);
  const salida = buildMapClients(crm, geo);
  assert.equal(salida.length, 1);
  assert.equal(salida[0].lat, -34);
  assert.equal(salida[0].precision, 'localidad');
});

function falsoGeoref() {
  const llamadas = [];
  const fetchImpl = async (url, init = {}) => {
    llamadas.push(url);
    const respuesta = (json) => ({ ok: true, json: async () => json });
    if (url.endsWith('/localidades')) {
      const consultas = JSON.parse(init.body).localidades;
      return respuesta({
        resultados: consultas.map((q) => ({
          localidades: q.nombre === 'Villa Maria'
            ? [{ nombre: 'Villa María', centroide: { lat: -32.4, lon: -63.2 }, departamento: { id: '14119' } }]
            : [],
        })),
      });
    }
    if (url.endsWith('/departamentos')) {
      const consultas = JSON.parse(init.body).departamentos;
      return respuesta({
        resultados: consultas.map((q) => ({
          departamentos: q.nombre === 'Concordia' ? [{ id: '30028', nombre: 'Concordia', centroide: { lat: -31.4, lon: -58 } }] : [],
        })),
      });
    }
    return respuesta({ provincias: [{ id: '14', centroide: { lat: -32, lon: -63.8 } }, { id: '30', centroide: { lat: -32.5, lon: -59 } }] });
  };
  return { fetchImpl, llamadas };
}

test('ubicarClientes: localidad, departamento, provincia y sin provincia', async () => {
  const { fetchImpl } = falsoGeoref();
  const cache = nuevoCache();
  const geo = await ubicarClientes([
    { doc: '1', provincia_cod: '14', localidad: 'Villa Maria' },
    { doc: '2', provincia_cod: '30', localidad: 'Concordia' },
    { doc: '3', provincia_cod: '14', localidad: 'Sin identificar' },
    { doc: '4', provincia_cod: '14', localidad: 'Lugar inventado' },
    { doc: '5', provincia_cod: null, localidad: 'Cordoba' },
  ], { fetchImpl, cache });
  assert.equal(geo.get('1').precision, 'localidad');
  assert.equal(geo.get('1').depto_id, '14119');
  assert.equal(geo.get('2').precision, 'departamento');
  assert.equal(geo.get('3').precision, 'provincia');
  assert.equal(geo.get('3').motivo_aprox, 'sin_localidad');
  assert.equal(geo.get('4').motivo_aprox, 'localidad_no_encontrada');
  assert.equal(geo.get('5').precision, null);
  assert.equal(geo.get('5').motivo_aprox, 'sin_provincia');
});

test('ubicarClientes usa el cache y no vuelve a consultar localidades ya resueltas', async () => {
  const { fetchImpl, llamadas } = falsoGeoref();
  const cache = nuevoCache();
  const clientes = [{ doc: '1', provincia_cod: '14', localidad: 'Villa Maria' }];
  await ubicarClientes(clientes, { fetchImpl, cache });
  const antes = llamadas.filter((u) => u.endsWith('/localidades')).length;
  await ubicarClientes(clientes, { fetchImpl, cache });
  assert.equal(llamadas.filter((u) => u.endsWith('/localidades')).length, antes);
});

test('jitter es determinista por documento y acotado', () => {
  assert.deepEqual(jitter('30709718661'), jitter('30709718661'));
  const [dx, dy] = jitter('20245395206');
  assert.ok(Math.hypot(dx, dy) <= 0.3 + 1e-9);
});
