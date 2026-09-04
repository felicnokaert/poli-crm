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
Son Dolares DOS MIL OCHOCIENTOS OCHENTA Y CINCO con OCHENTA Y CINCO.
FACTURA POR CUENTA Y ORDEN DE MAS-TIN SA CUIT 30-54921610-9.- La presente factura equivale
a $ 4.415.350,50 , de ser cancelada en pesos argentinos deberá hacerse al tipo de cambio
oficial del día anterior a la acreditación del pago. Cotización del Dolar $ 1.530,00.
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
  assert.equal(result.currency, 'USD');
});

test('parses a real Poliocho (point of sale 0003) invoice', () => {
  const result = parseInvoiceText(POLIOCHO_INVOICE);
  assert.equal(result.unit, 'Poliocho');
  assert.equal(result.pointOfSale, '0003');
  assert.equal(result.documentNumber, '01643');
  assert.equal(result.netAmount, 2385);
  assert.equal(result.currency, 'USD');
  assert.equal(result.exchangeRate, 1530);
});

test('detects an ARS invoice without an exchange rate', () => {
  const arsInvoice = `
Nº: 0006-00055555
Fecha: 05/09/2026
Razón social: CLIENTE EN PESOS
5 740T POLI-PLUS 740 IR 100,00 21,00 % 0,00 % 500,00
Importe Neto Gravado: $500,00
`;
  const result = parseInvoiceText(arsInvoice);
  assert.equal(result.currency, 'ARS');
  assert.equal(result.exchangeRate, null);
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

test('finds the exchange rate even when the PDF wraps mid-word across two lines ("Coti" / "zación")', () => {
  const wrapped = `
Nº: 0006-00012345
Fecha: 05/09/2026
Razón social: CLIENTE WRAPPED
5 740T POLI-PLUS 740 IR 100,00 21,00 % 0,00 % 500,00
Importe Neto Gravado: U$S500,00
La presente factura equivale a $ 765.000,00 , de ser cancelada en pesos argentinos deberá hacerse al tipo de cambio oficial de la fecha efectiva de la acreditación del pago. Coti
zación del Dolar $ 1.530,00.
`;
  const result = parseInvoiceText(wrapped);
  assert.equal(result.exchangeRate, 1530);
});

test('parses a real invoice with per-item Bonificación (BALTICO CONSTRUCCIONES) and uses the discounted unit price for memory', () => {
  const withBonif = `
Nº: 0013-00000184
Fecha: 02/09/2026
Razón social: BALTICO CONSTRUCCIONES
10 PM-DMF-1 DMF REMOVEDOR EXTRA 15,00 21,00 % 10,00 % 135,00
10 PCLEAN-1 POLICLEAN 9,90 21,00 % 10,00 % 89,10
1 PM309550ZAG PISTOLA FUSION AP COMPLETA 2.125,00 21,00 % 15,00 % 1.806,25
Importe Neto Gravado: U$S2.030,35
`;
  const result = parseInvoiceText(withBonif);
  assert.equal(result.unit, 'Poliplast');
  assert.equal(result.netAmount, 2030.35);
  assert.equal(result.items[2].listUnitPrice, 2125);
  // El precio "de memoria" es el efectivamente cobrado (con el 15% de
  // bonificación ya aplicado), no el de lista.
  assert.equal(result.items[2].unitPrice, 1806.25);
  assert.equal(result.items[0].unitPrice, 13.5);
});

test('parses a real invoice with no Bonificación column at all (ESTEBAN JOSE SARTORI, X document) instead of silently returning $0', () => {
  const noBonifColumn = `
X Documento no válido como factura
Nº: 0013-00000049
Fecha: 03/09/2026
Razón social: ESTEBAN JOSE SARTORI
2 PMRAC-V-521 PMRAC-V 521 27.272,72 0,00 % 54.545,44
1 IMP INTERNO IMPUESTO INTERNO 5.727,27 0,00 % 5.727,27
Importe Total: $60.272,71
`;
  const result = parseInvoiceText(noBonifColumn);
  assert.equal(result.recognized, true);
  assert.equal(result.currency, 'ARS');
  assert.equal(result.items.length, 2);
  // Antes de este fix, la falta de columna Bonif. hacía que el regex nunca
  // matcheara estas líneas: netAmount quedaba en 0 sin avisar.
  assert.equal(result.netAmount, 54545.44);
  assert.equal(result.internalTaxExcluded, 5727.27);
});
