import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseProspectsText } from '../src/prospect-import.mjs';

test('lee un CSV con ; y mapea encabezados por nombre', () => {
  const { rows, ignored, error } = parseProspectsText('Empresa;Teléfono;Sitio web;Localidad;Provincia;Rubro\nCorralón Norte;0343 4231234;norte.com.ar;Paraná;Entre Ríos;corralón\n;sin nombre;;;;\n');
  assert.equal(error, '');
  assert.equal(ignored, 1);
  assert.deepEqual(rows[0], { company: 'Corralón Norte', phone: '0343 4231234', website: 'norte.com.ar', city: 'Paraná', province: 'Entre Ríos', rubro: 'corralón' });
});

test('detecta tabulaciones (pegado desde una planilla) y comillas con separadores adentro', () => {
  const { rows } = parseProspectsText('Nombre\tCiudad\tDirección\n"Ferretería ""El Clavo"", Hnos."\tColón\t"Calle 1, 23"');
  assert.equal(rows[0].company, 'Ferretería "El Clavo", Hnos.');
  assert.equal(rows[0].address, 'Calle 1, 23');
});

test('avisa cuando falta la columna de nombre o no hay filas', () => {
  assert.match(parseProspectsText('Teléfono;Ciudad\n1;2').error, /Empresa/);
  assert.match(parseProspectsText('solo una línea').error, /Pegá una tabla/);
});
