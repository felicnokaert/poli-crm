import test from 'node:test';
import assert from 'node:assert/strict';
import { parseInvoiceText } from '../src/invoice-parser.mjs';

const POLIPLAST_INVOICE = `
FACTURA
Nº: 0006-00011202
Fecha: 03/09/2026
Vencimiento: 03/10/2026
Razón social: LACUS LATINA S.A.
Domicilio: RUTA 2 KM. 39 0 - CP 1884. Tel: 1132148987
Ubicación: BERAZATEGUI, Buenos Aires CUIT: 30712314946
Condición de venta: Cuenta corriente Condición de IVA: Responsable Inscripto
25 740T POLI-PLUS 740 IR 10,50 21,00 % 0,00 % 262,50
25 ISO PM TAM ISO PM 10,50 21,00 % 0,00 % 262,50
Importe Neto Gravado: U$S525,00
IVA 21%: U$S110,25
Importe Total: U$S635,25
`;

const POLIOCHO_INVOICE = `
FACTURA
Nº: 0003-00001643
Fecha: 01/09/2026
Razón social: LUIS DARIO MONTERO
Domicilio: PERITO MORENO 446 - CP 6450. Tel:
Ubicación: PEHUAJO, Buenos Aires CUIT: 20244088245
Condición de venta: Cuenta corriente Condición de IVA: Responsable Inscripto
220 SP-618 618 SP 5,50 21,00 % 0,00 % 1.210,00
250 ISO PM TAM ISO PM 4,70 21,00 % 0,00 % 1.175,00
Importe Neto Gravado: U$S2.385,00
IVA 21%: U$S500,85
Importe Total: U$S2.885,85
`;

test('parses a real Poliplast (point of sale 0006) invoice', () => {
  const result = parseInvoiceText(POLIPLAST_INVOICE);
  assert.equal(result.unit, 'Poliplast');
  assert.equal(result.pointOfSale, '0006');
  assert.equal(result.documentNumber, '11202');
  assert.equal(result.date, '2026-09-03');
  assert.equal(result.customer, 'LACUS LATINA S.A.');
  assert.equal(result.netAmount, 525);
  assert.equal(result.recognized, true);
});

test('parses a real Poliocho (point of sale 0003) invoice', () => {
  const result = parseInvoiceText(POLIOCHO_INVOICE);
  assert.equal(result.unit, 'Poliocho');
  assert.equal(result.pointOfSale, '0003');
  assert.equal(result.documentNumber, '01643');
  assert.equal(result.netAmount, 2385);
});

test('excludes "Impuesto Interno" line items from the commission base', () => {
  const withInternalTax = `
Nº: 0006-00099999
Fecha: 05/09/2026
Razón social: CLIENTE DE PRUEBA
5 740T POLI-PLUS 740 IR 100,00 21,00 % 0,00 % 500,00
1 IMP-INT Impuesto Interno 50,00 0,00 % 0,00 % 50,00
Importe Neto Gravado: U$S550,00
`;
  const result = parseInvoiceText(withInternalTax);
  assert.equal(result.netAmount, 500);
  assert.equal(result.internalTaxExcluded, 50);
  assert.equal(result.netGravadoTotal, 550);
});

test('marks unrecognized text as not recognized', () => {
  const result = parseInvoiceText('esto no es una factura');
  assert.equal(result.recognized, false);
});
