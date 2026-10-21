import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildImportPlan, parseProspectsText, normalizeFit, normalizeZone, parseScore } from '../src/prospect-import.mjs';
import { markProspect, followUpDate } from '../src/prospect-convert.mjs';
import { blankProspect, outreachVariant, PROSPECT_OUTCOMES, REJECTION_REASONS } from '../src/prospect-model.mjs';
import { buildQueue, prospectScore, sheetBonus } from '../src/prospect-queue.mjs';
import { buildOutreachDraft } from '../src/prospect-outreach.mjs';

const ids = (prefix = 'id') => { let n = 0; return () => `${prefix}-${(n += 1)}`; };
const sheet = 'Empresa;Teléfono;Familia;Puntaje;Encaje;Zona;Fuente\nFerretería Sur;0343 4231234;Penosil;82,5;alto;Zona A;Google Maps\nCorralón Norte;0343 4000000;Penosil;40;media;B;Referido\nBarraca Este;;Penosil;sin dato;rara;X;';

test('el importador lee Puntaje, Encaje, Zona y respeta la Fuente de la planilla', () => {
  const { rows, error } = parseProspectsText(sheet);
  assert.equal(error, '');
  const plan = buildImportPlan(rows, [], [], { makeId: ids() });
  const [sur, norte, este] = plan.toImport;
  assert.equal(sur.sheetScore, 82.5);
  assert.equal(sur.fitLevel, 'Alto');
  assert.equal(sur.zone, 'A');
  assert.equal(sur.source, 'Google Maps');
  assert.equal(norte.zone, 'B');
  assert.equal(norte.fitLevel, 'Medio');
  // Lo que no se entiende no se inventa: queda vacío y el texto original se guarda aparte.
  assert.equal(este.sheetScore, null);
  assert.equal(este.zone, '');
  assert.equal(este.imported.zoneRaw, 'X');
  assert.equal(este.imported.scoreRaw, 'sin dato');
  assert.equal(este.source, 'importado');
});

test('volver a importar la misma planilla no duplica y completa puntaje, encaje y zona vacíos', () => {
  const first = buildImportPlan(parseProspectsText('Empresa;Teléfono\nFerretería Sur;0343 4231234').rows, [], [], { makeId: ids() });
  const existing = first.toImport;
  const again = buildImportPlan(parseProspectsText(sheet).rows, [], existing, { makeId: ids('otra') });
  assert.equal(again.items[0].status, 'Ya existe');
  assert.equal(again.toImport.some((item) => item.company === 'Ferretería Sur'), false);
  assert.deepEqual(again.updates.find((update) => update.id === existing[0].id).fill, { sheetScore: 82.5, fitLevel: 'Alto', zone: 'A', family: 'Penosil' });
});

test('normalizadores de puntaje, zona y encaje', () => {
  assert.equal(parseScore('8,2 / 10'), 8.2);
  assert.equal(parseScore('nada'), null);
  assert.equal(normalizeZone('zona c'), 'C');
  assert.equal(normalizeZone('A - cerca'), 'A');
  assert.equal(normalizeZone('Anexo'), '');
  assert.equal(normalizeFit('Alta'), 'Alto');
  assert.equal(normalizeFit('baja'), 'Bajo');
});

test('encaje alto, zona A y buen puntaje suben al prospecto en la cola', () => {
  const plain = blankProspect({ id: 'a', company: 'A', phone: '1' }, { now: '2026-10-01' });
  const strong = blankProspect({ id: 'b', company: 'B', phone: '1', fitLevel: 'Alto', zone: 'A', sheetScore: 90 }, { now: '2026-10-02' });
  assert.equal(sheetBonus(plain), 0);
  assert.equal(sheetBonus(strong), 4 + 3 + 2);
  assert.ok(prospectScore(strong) > prospectScore(plain));
  assert.deepEqual(buildQueue([plain, strong]), ['b', 'a']);
});

test('hay motivos de rechazo para precio, mínimo de USD 1.800, dólar y espuma', () => {
  for (const reason of ['Precio', 'No llega al mínimo de USD 1.800', 'Dólar', 'No vende ni usa espuma', 'Ya tiene proveedor', 'No respondió']) {
    assert.ok(PROSPECT_OUTCOMES.includes(reason), reason);
    assert.ok(REJECTION_REASONS.includes(reason), reason);
  }
});

test('cada marca queda en el historial con motivo, quién y versión del mensaje', () => {
  const prospect = blankProspect({ id: 'p1', company: 'Ferretería Sur', family: 'Penosil' }, { now: '2026-10-14T10:00:00.000Z' });
  const state = { clients: [], prospects: [prospect], tasks: [] };
  const first = markProspect(state, 'p1', 'Sin interés', { outcome: 'Precio', user: 'felipe', taskId: 't1', now: '2026-10-20T15:00:00.000Z' });
  const history = first.state.prospects[0].history;
  assert.equal(history.length, 1);
  assert.deepEqual({ ...history[0], variant: undefined }, { at: '2026-10-20T15:00:00.000Z', state: 'Sin interés', outcome: 'Precio', user: 'felipe', variant: undefined, family: 'Penosil', zone: '' });
  assert.match(history[0].variant, /^[AB]$/);
  assert.equal(first.state.tasks.length, 0, 'un rechazo no crea recordatorio');
});

test('el primer "Contactado" deja una tarea de seguimiento a los 2 días hábiles y no se repite', () => {
  const prospect = blankProspect({ id: 'p1', company: 'Ferretería Sur', family: 'Penosil', phone: '+54 9 343 4000000' }, { now: '2026-10-14T10:00:00.000Z' });
  const state = { clients: [], prospects: [prospect], tasks: [] };
  // Jueves 22/10 al mediodía (hora de Argentina) → el seguimiento cae el lunes 26/10, no un sábado.
  const first = markProspect(state, 'p1', 'Contactado', { user: 'felipe', newClientId: 'c1', taskId: 't1', now: '2026-10-22T15:00:00.000Z' });
  assert.equal(first.state.tasks.length, 1);
  const [task] = first.state.tasks;
  assert.equal(task.dueDate, '2026-10-26');
  assert.equal(task.source, 'prospect-followup');
  assert.equal(task.clientId, 'c1');
  assert.equal(task.done, false);
  assert.equal(first.followUpTaskId, 't1');
  // Marcar otra vez (por ejemplo "Con interés") no crea otra tarea.
  const second = markProspect(first.state, 'p1', 'Con interés', { user: 'felipe', newClientId: 'c2', taskId: 't2', now: '2026-10-23T15:00:00.000Z' });
  assert.equal(second.state.tasks.length, 1);
});

test('la fecha de seguimiento salta el fin de semana y usa la hora de Argentina', () => {
  assert.equal(followUpDate('2026-10-19T15:00:00.000Z'), '2026-10-21'); // lunes → miércoles
  assert.equal(followUpDate('2026-10-21T15:00:00.000Z'), '2026-10-23'); // miércoles → viernes
  assert.equal(followUpDate('2026-10-23T15:00:00.000Z'), '2026-10-26'); // viernes → lunes
  assert.equal(followUpDate('2026-10-24T01:00:00.000Z'), '2026-10-26'); // viernes 22:00 en Argentina → lunes
});

test('dos versiones del mensaje: se alternan por empresa y se puede fijar a mano', () => {
  const ids = ['a1', 'a2', 'a3', 'a4', 'b1', 'b2'];
  const variants = ids.map((id) => outreachVariant({ id }));
  assert.ok(variants.includes('A') && variants.includes('B'));
  assert.equal(outreachVariant({ id: 'a1', variant: 'B' }), 'B');
  const prospect = blankProspect({ id: 'x', company: 'Ferretería Sur', family: 'Penosil', rubro: 'ferretería', city: 'Paraná' });
  const a = buildOutreachDraft(prospect, { sender: 'Felipe', variant: 'A' });
  const b = buildOutreachDraft(prospect, { sender: 'Felipe', variant: 'B' });
  assert.notEqual(a.whatsapp, b.whatsapp);
  assert.ok(b.whatsapp.length < a.whatsapp.length, 'la versión B es más corta');
  assert.match(b.whatsapp, /Una pregunta rápida: ¿Qué /);
  assert.match(a.whatsapp, /EasySpray/);
  assert.equal(a.variant, 'A');
  assert.equal(b.variant, 'B');
});
