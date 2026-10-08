import assert from 'node:assert/strict';
import test from 'node:test';
import { provinciaCanonica } from '../src/georef.mjs';
import {
  aplicarUbicaciones, ciudadVacia, columnasDe, decodificarTexto, filasPlanilla, leerUbicaciones, pendientesDeUbicacion, planearUbicaciones, resumenPendientes,
} from '../src/client-location.mjs';

const cliente = (extra) => ({ id: `c-${extra.cuit || extra.legalName}`, legalName: 'Cliente', ...extra });

test('pendientes: solo los que no tienen provincia o ciudad; primero los que compraron, el más reciente antes', () => {
  const lista = pendientesDeUbicacion([
    cliente({ cuit: '30-11111111-1', legalName: 'Completo', province: 'Buenos Aires', city: 'Mar del Plata', lastPurchase: '01/10/2026' }),
    cliente({ cuit: '30-22222222-2', legalName: 'Sin nada, vieja compra', lastPurchase: '01/01/2025' }),
    cliente({ cuit: '30-33333333-3', legalName: 'Sin ciudad, reciente', province: 'Santa Fe', lastPurchase: '05/10/2026' }),
    cliente({ cuit: '30-44444444-4', legalName: 'Nunca compró' }),
    cliente({ cuit: '30-55555555-5', legalName: 'Ciudad a confirmar', province: 'Córdoba', city: 'A confirmar', lastPurchase: '02/10/2026' }),
  ]);
  assert.deepEqual(lista.map((p) => p.nombre), ['Sin ciudad, reciente', 'Ciudad a confirmar', 'Sin nada, vieja compra', 'Nunca compró']);
  assert.deepEqual(resumenPendientes(lista), { total: 4, sinProvincia: 2, sinCiudad: 4, compradores: 3, sinDocumento: 0 });
  assert.equal(lista[0].sinProvincia, false);
});

test('pendientes: no repite un mismo CUIT y descarta registros sin identificación', () => {
  const lista = pendientesDeUbicacion([cliente({ cuit: '30-22222222-2' }), cliente({ cuit: '30222222222', legalName: 'Repetido' }), { legalName: 'Sin id ni cuit' }]);
  assert.equal(lista.length, 1);
});

test('sin CUIT: cuenta como pendiente pero no entra a la planilla (su "documento" es el id interno)', () => {
  const lista = pendientesDeUbicacion([cliente({ cuit: '30-22222222-2', legalName: 'Con CUIT' }), { id: 'prospecto-77', legalName: 'Prospecto' }]);
  assert.equal(resumenPendientes(lista).sinDocumento, 1);
  assert.equal(filasPlanilla(lista).length, 2); // encabezado + el que tiene CUIT
});

test('decodificarTexto: UTF-8 con y sin BOM, y Windows-1252 de Excel, con las tildes bien', () => {
  const texto = 'Teléfono;Razón social;Ñandú';
  assert.equal(decodificarTexto(new TextEncoder().encode(texto)), texto);
  assert.equal(decodificarTexto(Uint8Array.from([0xef, 0xbb, 0xbf, ...new TextEncoder().encode(texto)])), texto);
  assert.equal(decodificarTexto(Uint8Array.from([0x54, 0x65, 0x6c, 0xe9, 0x66, 0x6f, 0x6e, 0x6f])), 'Teléfono'); // é en Windows-1252
});

test('ciudades vacías: "A confirmar" y compañía cuentan como sin ciudad', () => {
  for (const vacia of ['', 'A confirmar', ' a CONFIRMAR ', 'S/D', undefined]) assert.equal(ciudadVacia(vacia), true);
  assert.equal(ciudadVacia('Miramar'), false);
});

test('planilla para completar: encabezados + una fila por pendiente con el CUIT solo con dígitos', () => {
  const filas = filasPlanilla(pendientesDeUbicacion([cliente({ cuit: '30-22222222-2', legalName: 'Uno', phone: '11 5555-1234', lastPurchase: '01/10/2026' })]));
  assert.equal(filas[0][0], 'CUIT');
  assert.deepEqual(filas[1].slice(0, 3), ['30222222222', 'Uno', '2026-10-01']);
  assert.equal(filas[1][7], '11 5555-1234');
});

test('columnas: reconoce los nombres de Contabilium y de una planilla propia, y no confunde "Estado" con provincia', () => {
  const c = columnasDe(['Razón Social', 'CUIT/CUIL', 'Estado', 'Domicilio', 'Localidad', 'Provincia', 'CP', 'Teléfono', 'E-mail']);
  assert.deepEqual(c, { doc: 1, address: 3, city: 4, province: 5, postalCode: 6, phone: 7, email: 8 });
  const d = columnasDe(['Nombre', 'Nro. Documento', 'Dirección', 'Ciudad', 'Provincia']);
  assert.equal(d.doc, 1);
  assert.equal(d.city, 3);
  assert.equal(columnasDe(['Estado']).province, undefined);
});

test('leer planilla: pide que haya columna de CUIT y cuenta las filas sin documento', () => {
  assert.match(leerUbicaciones([['Nombre', 'Localidad'], ['A', 'B']]).error, /CUIT/);
  const { registros, sinDocumento } = leerUbicaciones([
    ['CUIT', 'Localidad', 'Provincia'],
    ['30-22222222-2', 'Miramar', 'Bs. As.'],
    ['', 'Rosario', 'Santa Fe'],
    [null, null, null],
    [30333333333, 'Esperanza', 'Santa Fe'],
  ]);
  assert.deepEqual(registros.map((r) => r.doc), ['30222222222', '30333333333']);
  assert.equal(sinDocumento, 1);
});

test('variantes de provincia: Bs. As., CABA y Capital Federal se reconocen', () => {
  assert.equal(provinciaCanonica('Bs. As.').cod, '06');
  assert.equal(provinciaCanonica('Pcia. de Buenos Aires').cod, '06');
  assert.equal(provinciaCanonica('Ciudad Autónoma de Buenos Aires').cod, '02');
  assert.equal(provinciaCanonica('C.A.B.A.').cod, '02');
});

test('plan: completa solo los campos vacíos y nunca pisa lo cargado a mano', () => {
  const clients = [
    cliente({ cuit: '30-22222222-2', legalName: 'Uno', phone: '11 1111-1111' }),
    cliente({ cuit: '30-33333333-3', legalName: 'Dos', province: 'Santa Fe', city: 'Rosario', address: 'Mitre 100' }),
    cliente({ cuit: '30-44444444-4', legalName: 'Tres', province: 'Córdoba', city: 'A confirmar' }),
  ];
  const plan = planearUbicaciones(clients, [
    { doc: '30222222222', province: 'Bs. As.', city: 'Miramar', address: 'Calle 1', postalCode: '7607', phone: '2291 41-2293', email: 'a@b.com' },
    { doc: '30333333333', province: 'Córdoba', city: 'Córdoba', address: 'Otra 5' }, // todo ya cargado: no cambia
    { doc: '30444444444', province: 'Tucumán', city: 'Tafí' },
    { doc: '30999999999', province: 'Salta', city: 'Salta' }, // no está en el CRM
    { doc: '30222222222', province: 'Jujuy', city: 'Otra' }, // CUIT repetido en la planilla: vale la primera fila
  ]);
  const uno = plan.cambios.find((c) => c.doc === '30222222222').nuevo;
  assert.deepEqual(uno, { province: 'Buenos Aires', city: 'Miramar', address: 'Calle 1', postalCode: '7607', email: 'a@b.com' }); // el teléfono ya estaba
  assert.deepEqual(plan.cambios.find((c) => c.doc === '30444444444').nuevo, { city: 'Tafí' }); // la provincia ya estaba
  assert.equal(plan.sinNovedad, 1);
  assert.deepEqual(plan.sinCliente, ['30999999999']);
  assert.equal(plan.porCampo.localidad, 2);
});

test('plan: avisa las provincias que no reconoce y no las usa', () => {
  const plan = planearUbicaciones([cliente({ cuit: '30-22222222-2' })], [{ doc: '30222222222', province: 'Narnia', city: 'Cair Paravel' }]);
  assert.deepEqual(plan.provinciasDesconocidas, [{ nombre: 'Narnia', cantidad: 1 }]);
  assert.deepEqual(plan.cambios[0].nuevo, { city: 'Cair Paravel' });
});

test('aplicar: devuelve una lista nueva, marca updatedAt solo en lo modificado y deja el resto igual', () => {
  const clients = [cliente({ cuit: '30-22222222-2', updatedAt: 'viejo' }), cliente({ cuit: '30-33333333-3', updatedAt: 'viejo' })];
  const plan = planearUbicaciones(clients, [{ doc: '30222222222', province: 'Santa Fe', city: 'Rosario' }]);
  const nueva = aplicarUbicaciones(clients, plan.cambios, '2026-10-08T12:00:00.000Z');
  assert.equal(nueva[0].province, 'Santa Fe');
  assert.equal(nueva[0].updatedAt, '2026-10-08T12:00:00.000Z');
  assert.equal(nueva[1], clients[1]);
  assert.equal(clients[0].province, undefined);
});
