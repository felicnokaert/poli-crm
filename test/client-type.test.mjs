import assert from 'node:assert/strict';
import test from 'node:test';
import { conTipoManual, resolverTipo, sugerirTipo, tipoAEsAplicador } from '../src/client-type.mjs';
import { docDe, toMapClient } from '../src/map-clients-adapter.mjs';

const prods = (...nombres) => nombres.map((producto) => ({ producto }));

test('sugerirTipo: productos terminados en SP son aplicador aunque compren otras familias', () => {
  assert.equal(sugerirTipo(prods('618 SP', 'ISO PM TAMBOR')), 'aplicador');
  assert.equal(sugerirTipo(prods('660SP')), 'aplicador');
  assert.equal(sugerirTipo(prods('616 SPB', '770 IR')), 'aplicador');
  assert.equal(sugerirTipo(prods('770 IR', '618 SP', '426 POLIOL VISCO MOL')), 'aplicador');
});

test('sugerirTipo: IR es inyeccion, VISCO es fabricante, otros productos son otro', () => {
  assert.equal(sugerirTipo(prods('770 IR', 'ISO PM TAMBOR')), 'inyeccion');
  assert.equal(sugerirTipo(prods('773 IR PANEL')), 'inyeccion');
  assert.equal(sugerirTipo(prods('1517 ISO VISCO MOL', '426 POLIOL VISCO MOL')), 'fabricante');
  assert.equal(sugerirTipo(prods('500 PA GRIS LATA 20 KG', 'ISO PM TAMBOR')), 'otro');
});

test('sugerirTipo: solo isocianatos o sin productos queda sin clasificar', () => {
  assert.equal(sugerirTipo(prods('ISO PM TAMBOR', 'ISO PM')), null);
  assert.equal(sugerirTipo([]), null);
  assert.equal(sugerirTipo(undefined), null);
});

test('sugerirTipo no confunde "IR" dentro de otra palabra ni SP en medio del nombre', () => {
  assert.equal(sugerirTipo(prods('SPRAY X')), 'otro');
  assert.equal(sugerirTipo(prods('FIRME')), 'otro');
});

test('resolverTipo: la correccion manual siempre manda sobre la regla', () => {
  const r = resolverTipo(prods('618 SP'), { tipoCliente: 'no_aplica', tipoClienteNota: 'compra pero no aplica' });
  assert.equal(r.tipo, 'no_aplica');
  assert.equal(r.tipo_auto, 'aplicador');
  assert.equal(r.tipo_origen, 'manual');
  assert.equal(r.tipo_nota, 'compra pero no aplica');
  assert.equal(r.es_aplicador, 'no');
});

test('resolverTipo: sin correccion usa la regla, y un tipo manual invalido se ignora', () => {
  assert.equal(resolverTipo(prods('618 SP')).tipo_origen, 'auto');
  assert.equal(resolverTipo(prods('618 SP'), { tipoCliente: 'inventado' }).tipo, 'aplicador');
  const sin = resolverTipo(prods('ISO PM'));
  assert.equal(sin.tipo, null);
  assert.equal(sin.tipo_origen, null);
  assert.equal(sin.es_aplicador, null);
  assert.equal(tipoAEsAplicador('aplicador'), 'si');
  assert.equal(tipoAEsAplicador('otro'), 'no');
});

test('conTipoManual guarda y quita la correccion sin mutar el original', () => {
  const original = { id: 'a', company: 'ACME' };
  const corregido = conTipoManual(original, 'no_aplica', ' motivo ');
  assert.equal(corregido.tipoCliente, 'no_aplica');
  assert.equal(corregido.tipoClienteNota, 'motivo');
  assert.ok(corregido.updatedAt);
  assert.equal(original.tipoCliente, undefined);
  const vuelto = conTipoManual(corregido, '', '');
  assert.equal('tipoCliente' in vuelto, false);
  assert.equal('tipoClienteNota' in vuelto, false);
  assert.equal(conTipoManual(original, 'invalido').tipoCliente, undefined);
});

test('toMapClient: tipo automatico y manual llegan al contrato del mapa', () => {
  const crm = {
    id: 'x', company: 'APLICA SRL', cuit: '30709718661', province: 'Cordoba', city: 'Villa Maria',
    polio8: { invoiced: true, documents: 3, lastDate: '2026-09-01', products: [{ name: '618 SP', times: 3, qty: 660, last: '2026-09-01' }] },
  };
  const auto = toMapClient(crm);
  assert.equal(auto.tipo, 'aplicador');
  assert.equal(auto.tipo_origen, 'auto');
  assert.equal(auto.es_aplicador, 'si');
  const manual = toMapClient({ ...crm, tipoCliente: 'inyeccion', tipoClienteNota: 'hace paneles' });
  assert.equal(manual.tipo, 'inyeccion');
  assert.equal(manual.tipo_auto, 'aplicador');
  assert.equal(manual.tipo_origen, 'manual');
  assert.equal(manual.tipo_nota, 'hace paneles');
  assert.equal(manual.es_aplicador, 'no');
});

test('toMapClient: sin productos queda sin clasificar, y esAplicador viejo se respeta', () => {
  const c = toMapClient({ id: 'y', company: 'PUR', cuit: '30000000001', esAplicador: 'si' });
  assert.equal(c.tipo, null);
  assert.equal(c.es_aplicador, 'si');
  assert.equal(docDe({ cuit: '30-00000000-1', id: 'z' }), '30000000001');
  assert.equal(docDe({ id: 'z' }), 'z');
});
