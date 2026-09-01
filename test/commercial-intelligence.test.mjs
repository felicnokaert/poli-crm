import assert from 'node:assert/strict';
import test from 'node:test';
import { inferIntent } from '../src/commercial-intelligence.mjs';

test('classifies common WhatsApp sales intentions', () => {
  assert.equal(inferIntent('Hola. ¿Puedo obtener más información sobre esto?'), 'Información');
  assert.equal(inferIntent('¿Cuánto sale? Necesito cotización'), 'Precio / cotización');
  assert.equal(inferIntent('¿Sirve para aplicar sobre chapa?'), 'Consulta técnica');
  assert.equal(inferIntent('Quiero volver a comprar el mismo pedido'), 'Recompra');
  assert.equal(inferIntent('El producto llegó roto, quiero hacer un reclamo'), 'Reclamo');
});
