import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { render, screen, cleanup, waitFor, fireEvent } from '@testing-library/react';
import { loadJsxModule } from './helpers/load-jsx.mjs';

afterEach(cleanup);

const PRODUCTS = [
  { id: 'p1', name: 'AIRLESS SPRAYER BLUE PURMAC 220 V 490', photo_path: '', status: 'vigente' },
  { id: 'p2', name: 'BALDE 10 LITROS AZUL', photo_path: '', status: 'vigente' },
  { id: 'p3', name: 'SEMI MASCARA 3M 6200', photo_path: 'ya.png', status: 'vigente' },
];
const VARIANTS = [{ id: 'v1', product_id: 'p1', sku: 'PM490', active: true }, { id: 'v2', product_id: 'p2', sku: 'BLAZ-10-1', active: true }, { id: 'v3', product_id: 'p3', sku: '3M-6200-1', active: true }];

function fakeSupabase(products = PRODUCTS, variants = VARIANTS) {
  const uploads = []; const upserts = [];
  const table = (rows) => { const b = { select: () => b, range: () => Promise.resolve({ data: rows, error: null }), upsert: (payload) => { upserts.push(payload); return Promise.resolve({ error: null }); } }; return b; };
  return {
    uploads, upserts,
    from: (name) => (name === 'catalog_products' ? table(products) : name === 'catalog_variants' ? table(variants) : table([])),
    storage: { from: () => ({ upload: (path) => { uploads.push(path); return Promise.resolve({ error: null }); }, getPublicUrl: (path) => ({ data: { publicUrl: `https://cdn.test/product-photos/${path}` } }) }) },
  };
}

const file = (name) => new File([new Uint8Array([1, 2, 3])], name, { type: 'image/jpeg' });

test('empareja las fotos por SKU, marca lo seguro, las sube y las deja aprobadas por quien las sube', async () => {
  globalThis.URL.createObjectURL = () => 'blob:x';
  globalThis.URL.revokeObjectURL = () => {};
  const { PhotoBulkUpload } = await loadJsxModule('src/PhotoBulkUpload.jsx');
  const supabase = fakeSupabase();
  const { container } = render(React.createElement(PhotoBulkUpload, { supabase, isAdmin: true, userEmail: 'marketing@grupopoliplast.com.ar' }));
  await waitFor(() => assert.ok(screen.getByText(/Hoy faltan fotos en 2 productos/)));
  const input = container.querySelector('input[type=file]');
  fireEvent.change(input, { target: { files: [file('PM490.jpg'), file('BLAZ-10-1_foto.png'), file('3M-6200-1.jpg'), file('cualquiera.jpg'), file('notas.txt')] } });
  await waitFor(() => assert.ok(screen.getByText(/4 fotos: 3 por SKU, 0 por nombre, 0 con varios posibles, 1 sin coincidencia/)));
  assert.ok(screen.getByText(/ya tiene foto propia en el catálogo \(no se reemplaza\)/));
  assert.ok(screen.getByRole('button', { name: 'Subir 2 fotos' }));
  fireEvent.click(screen.getByRole('button', { name: 'Subir 2 fotos' }));
  await waitFor(() => assert.ok(screen.getByText(/Se subieron 2 fotos y ya las usa el cotizador/)));
  assert.equal(supabase.uploads.length, 2);
  const [saved] = supabase.upserts;
  assert.deepEqual(saved.map((row) => row.product_id).sort(), ['p1', 'p2']);
  assert.ok(saved.every((row) => row.approved_by === 'marketing@grupopoliplast.com.ar' && row.source === 'carga-masiva' && row.url.startsWith('https://cdn.test/product-photos/crm-')));
});

test('solo la ven los administradores y sin cuenta en línea avisa', async () => {
  const { PhotoBulkUpload } = await loadJsxModule('src/PhotoBulkUpload.jsx');
  render(React.createElement(PhotoBulkUpload, { supabase: fakeSupabase(), isAdmin: false }));
  await waitFor(() => assert.ok(screen.getByText(/La carga de fotos la hacen los administradores/)));
  cleanup();
  render(React.createElement(PhotoBulkUpload, { supabase: null, isAdmin: true }));
  assert.ok(screen.getByText(/entrá con tu cuenta/));
});

test('una foto para varios productos: filtra por palabras, saca los que tienen cierta palabra y la sube una sola vez', async () => {
  globalThis.URL.createObjectURL = () => 'blob:x';
  globalThis.URL.revokeObjectURL = () => {};
  const { PhotoBulkUpload } = await loadJsxModule('src/PhotoBulkUpload.jsx');
  const products = [
    { id: 'a1', name: 'ALMOHADA DE VELLON 60 X 35 CLASICA', photo_path: '', status: 'vigente', family: 'Almohadas', subfamily: '' },
    { id: 'a2', name: 'ALMOHADA VISCOELASTICA RECTA 60X35 AZUL', photo_path: '', status: 'vigente', family: 'Almohadas', subfamily: '' },
    { id: 'a3', name: 'ALMOHADA VISCOELASTICA CERVICAL 60X35', photo_path: '', status: 'vigente', family: 'Almohadas', subfamily: '' },
    { id: 'a4', name: 'ALMOHADA VISCOELASTICA RECTA 60X35 BLANCA', photo_path: 'ya.png', status: 'vigente', family: 'Almohadas', subfamily: '' },
  ];
  const supabase = fakeSupabase(products, []);
  const { container } = render(React.createElement(PhotoBulkUpload, { supabase, isAdmin: true, userEmail: 'marketing@grupopoliplast.com.ar' }));
  await waitFor(() => assert.ok(screen.getByRole('tab', { name: 'Una foto para varios productos' })));
  fireEvent.click(screen.getByRole('tab', { name: 'Una foto para varios productos' }));
  fireEvent.change(container.querySelector('input[type=file]'), { target: { files: [file('almohada.jpg')] } });
  fireEvent.change(screen.getByLabelText('Palabras del nombre'), { target: { value: 'almohada' } });
  fireEvent.change(screen.getByLabelText('Sacar los que tengan'), { target: { value: 'cervical' } });
  assert.ok(screen.getByText(/3 productos coinciden/));
  assert.ok(screen.getByText(/ya tiene foto propia \(no se reemplaza\)/));
  fireEvent.click(screen.getByRole('button', { name: 'Usar esta foto en 2 productos' }));
  await waitFor(() => assert.ok(screen.getByText(/La foto quedó en 2 productos/)));
  assert.equal(supabase.uploads.length, 1, 'se sube una sola vez');
  const [saved] = supabase.upserts;
  assert.deepEqual(saved.map((row) => row.product_id).sort(), ['a1', 'a2']);
  assert.equal(new Set(saved.map((row) => row.url)).size, 1);
  assert.ok(saved.every((row) => row.approved_by === 'marketing@grupopoliplast.com.ar' && row.source === 'una-foto-varios'));
});
