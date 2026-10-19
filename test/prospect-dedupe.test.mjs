import { test } from 'node:test';
import assert from 'node:assert/strict';
import { matchProspect, nameKey, phoneKey, domainKey } from '../src/prospect-dedupe.mjs';
import { blankProspect, isCompetitor, familyIsActive, possibleWhatsAppLink } from '../src/prospect-model.mjs';

const prospect = (fields) => blankProspect({ id: 'p1', ...fields });

test('normaliza nombres sin formas societarias, teléfonos, CUIT y dominios', () => {
  assert.equal(nameKey('PIERANDREI S.A.'), 'pierandrei');
  assert.equal(nameKey('Silvacom S.R.L.'), 'silvacom');
  assert.equal(phoneKey('+54 9 343 15-4123456'), '54123456');
  assert.equal(phoneKey('12345'), '');
  assert.equal(domainKey('https://www.Ferreteria.com.ar/contacto'), 'ferreteria.com.ar');
});

test('Pierandrei ya existe como cliente "PIERANDREI S.A." en la misma localidad', () => {
  const clients = [{ id: 'c1', company: 'PIERANDREI S.A.', city: 'Paraná' }];
  const result = matchProspect(prospect({ company: 'Pierandrei', city: 'Parana' }), clients);
  assert.equal(result.status, 'Ya en el CRM');
  assert.equal(result.bestClient.id, 'c1');
});

test('mismo nombre sin localidad se muestra como posible duplicado, no se oculta', () => {
  const clients = [{ id: 'c1', company: 'Silvacom S.R.L.', city: '' }];
  const result = matchProspect(prospect({ company: 'SILVACOM', city: 'Concordia' }), clients);
  assert.equal(result.status, 'Posible duplicado');
});

test('coincidencia por CUIT, teléfono o sitio web es "Ya en el CRM"', () => {
  const clients = [{ id: 'c1', company: 'Chamtac', cuit: '30-71576484-5', phone: '0343 154123456', website: 'https://www.chamtac.com.ar' }];
  assert.equal(matchProspect(prospect({ company: 'Otro nombre', cuit: '30715764845' }), clients).status, 'Ya en el CRM');
  assert.equal(matchProspect(prospect({ company: 'Otro nombre', phone: '+54 9 343 154123456' }), clients).status, 'Ya en el CRM');
  assert.equal(matchProspect(prospect({ company: 'Otro nombre', website: 'chamtac.com.ar' }), clients).status, 'Ya en el CRM');
});

test('falso positivo: "Imperio Motorhome" no se confunde con "IMPERIO S.R.L."', () => {
  const clients = [{ id: 'c1', company: 'IMPERIO S.R.L.', city: 'Rosario' }];
  assert.equal(matchProspect(prospect({ company: 'Imperio Motorhome', city: 'Rosario' }), clients).status, 'Nuevo');
});

test('un sitio de redes sociales no cuenta como mismo sitio web', () => {
  const clients = [{ id: 'c1', company: 'Uno', website: 'https://facebook.com/uno' }];
  assert.equal(matchProspect(prospect({ company: 'Dos', website: 'https://facebook.com/dos' }), clients).status, 'Nuevo');
  assert.equal(matchProspect(prospect({ company: 'Tres', website: 'https://facebook.com/uno' }), clients).status, 'Nuevo');
});

test('detecta un prospecto repetido y nunca se compara consigo mismo', () => {
  const a = prospect({ id: 'a', company: 'Corralón Norte', city: 'Colón' });
  const b = prospect({ id: 'b', company: 'CORRALON NORTE S.A.', city: 'Colon' });
  assert.equal(matchProspect(a, [], [a, b]).status, 'Ya cargado');
  assert.equal(matchProspect(a, [], [a]).status, 'Nuevo');
});

test('competidores conocidos se reconocen; Pisos y Almohadas están pausadas por defecto', () => {
  assert.equal(isCompetitor('Argenpur S.A.'), true);
  assert.equal(isCompetitor('Ferretería Sulfibra Hnos'), true);
  assert.equal(isCompetitor('Corralón Norte'), false);
  assert.equal(isCompetitor('MAS-TIN S.A.'), false); // socio: Poliplast lo distribuye
  assert.equal(isCompetitor('Fana Química'), true);
  assert.equal(familyIsActive('Pisos'), false);
  assert.equal(familyIsActive('Almohadas'), false);
  assert.equal(familyIsActive('Penosil'), true);
  assert.equal(familyIsActive('Pisos', { Pisos: true }), true);
});

test('WhatsApp solo se ofrece para celulares argentinos', () => {
  assert.equal(possibleWhatsAppLink('+54 9 11 6856-5952'), 'https://wa.me/5491168565952');
  assert.equal(possibleWhatsAppLink('0343 4231234'), '');
  assert.equal(possibleWhatsAppLink(''), '');
});

test('matchSignature no cambia al clasificar (solo estado) y sí al cambiar un dato que se compara', async () => {
  const { matchSignature } = await import('../src/prospect-dedupe.mjs');
  const clients = [{ id: 'c1', company: 'Aislaciones Norte', contacts: [{ phone: '1144445555' }] }];
  const before = [{ id: 'p1', company: 'Espumas Sur', phone: '3514445555', state: 'No contactado' }];
  const sig = matchSignature(before, clients);
  assert.equal(matchSignature([{ ...before[0], state: 'Contactado', notes: 'llamé' }], clients), sig);
  assert.notEqual(matchSignature([{ ...before[0], phone: '1144445555' }], clients), sig);
  assert.notEqual(matchSignature(before, [...clients, { id: 'c2', company: 'Nueva' }]), sig);
});

test('createMatcher da lo mismo que matchProspect, también después de cambios (convertir, editar, borrar)', async () => {
  const { createMatcher, matchProspect } = await import('../src/prospect-dedupe.mjs');
  const words = ['poli', 'poly', 'espuma', 'espumas', 'norte', 'sur', 'aislaciones', 'techos', 'sa', 'frio', 'rosario'];
  let seed = 7;
  const r = (n) => { seed = (seed * 9301 + 49297) % 233280; return Math.floor((seed / 233280) * n); };
  const name = () => Array.from({ length: 1 + r(3) }, () => words[r(words.length)]).join(' ');
  let clients = Array.from({ length: 60 }, (_, i) => ({ id: `c${i}`, company: name(), legalName: r(2) ? name() : '', contacts: [{ phone: `11${4000000 + r(80)}` }], website: r(3) ? `www.e${r(20)}.com` : '', city: ['Rosario', ''][r(2)] }));
  let prospects = Array.from({ length: 40 }, (_, i) => ({ id: `p${i}`, company: name(), phone: `11${4000000 + r(80)}`, website: r(3) ? `e${r(20)}.com` : '', city: ['Rosario', 'Cordoba', ''][r(3)], state: 'No contactado' }));
  const matcher = createMatcher();
  const same = () => {
    const got = matcher(prospects, clients);
    for (const p of prospects) assert.deepEqual(got.get(p.id), matchProspect(p, clients, prospects), p.id);
  };
  same();
  clients = [...clients, { id: 'nuevo', company: prospects[3].company, phone: prospects[3].phone, contacts: [], city: '' }];
  prospects = prospects.map((p, i) => (i === 3 ? { ...p, state: 'Contactado', linkedClientId: 'nuevo' } : p));
  same();
  prospects = prospects.map((p, i) => (i === 5 ? { ...p, company: clients[0].company } : p));
  clients = clients.map((c, i) => (i === 2 ? { ...c, website: 'www.e1.com' } : c));
  same();
  clients = clients.filter((c, i) => i !== 0);
  prospects = [...prospects.filter((p, i) => i !== 1), { id: 'pn', company: name(), phone: `11${4000000 + r(80)}` }];
  same();
});
