import assert from 'node:assert/strict';
import test from 'node:test';
import { buildPhoneMap, envPhoneMap, fetchChannelRows, tablePhoneMap } from '../lib/channels.mjs';
import { channelsForEmail, isChannelAdmin, resolveChannels } from '../src/user-channels.mjs';
import { BASE_CHANNEL_KEYS, canDeleteChannel, parseMemberEmails, slugifyChannelKey, validateChannelDraft } from '../src/channel-admin.mjs';

const ENV = { WHATSAPP_GENERAL_PHONE_ID: '111111111', WHATSAPP_PENOSIL_PHONE_ID: '222222222', WHATSAPP_JUAN_PHONE_ID: '333333333' };

test('el mapa de telefonos del entorno sigue resolviendo los 3 canales historicos', () => {
  assert.deepEqual(envPhoneMap(ENV), { 111111111: 'general', 222222222: 'penosil', 333333333: 'juan' });
  assert.deepEqual(envPhoneMap({}), {});
});

test('la tabla suma canales nuevos y el entorno gana si hay conflicto', () => {
  const rows = [
    { channel_key: 'rapyp', phone_number_id: '444444444' },
    { channel_key: 'otro', phone_number_id: '111111111' },
    { channel_key: 'sin-id', phone_number_id: null },
  ];
  assert.deepEqual(tablePhoneMap(rows), { 444444444: 'rapyp', 111111111: 'otro' });
  const map = buildPhoneMap(ENV, rows);
  assert.equal(map['444444444'], 'rapyp');
  assert.equal(map['111111111'], 'general');
});

test('si la tabla falla o no existe, el webhook sigue con el entorno', async () => {
  const env = { ...ENV, SUPABASE_URL: 'https://x.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'k' };
  assert.deepEqual(await fetchChannelRows(env, async () => ({ ok: false })), []);
  assert.deepEqual(await fetchChannelRows(env, async () => { throw new Error('red'); }), []);
  assert.deepEqual(await fetchChannelRows(env, async () => ({ ok: true, json: async () => ({ error: 'x' }) })), []);
  assert.deepEqual(await fetchChannelRows({}, async () => { throw new Error('no deberia llamar'); }), []);
  assert.deepEqual(buildPhoneMap(ENV, []), envPhoneMap(ENV));
});

test('fetchChannelRows pide solo canales con ID usando la clave de servicio', async () => {
  const calls = [];
  const rows = await fetchChannelRows({ SUPABASE_URL: 'https://x.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'k' }, async (url, options) => {
    calls.push({ url, options });
    return { ok: true, json: async () => [{ channel_key: 'rapyp', phone_number_id: '5' }] };
  });
  assert.equal(rows.length, 1);
  assert.match(calls[0].url, /whatsapp_channels\?select=channel_key,phone_number_id&phone_number_id=not\.is\.null/);
  assert.equal(calls[0].options.headers.apikey, 'k');
});

test('resolveChannels: las cuentas historicas ven lo mismo con o sin tabla', () => {
  assert.deepEqual(resolveChannels('felipe@grupopoliplast.com.ar', []), ['general']);
  assert.deepEqual(resolveChannels('felipe@grupopoliplast.com.ar', [{ channel_key: 'general' }]), ['general']);
  assert.deepEqual(resolveChannels('juan@grupopoliplast.com.ar', undefined), ['juan']);
  assert.deepEqual(resolveChannels('info@grupopoliplast.com.ar', null), ['penosil']);
});

test('resolveChannels: un comercial nuevo recibe el canal que le asignan en la tabla', () => {
  assert.deepEqual(resolveChannels('vendedor@grupopoliplast.com.ar', []), []);
  assert.deepEqual(resolveChannels('vendedor@grupopoliplast.com.ar', [{ channel_key: 'rapyp' }]), ['rapyp']);
  assert.deepEqual(resolveChannels('felipe@grupopoliplast.com.ar', [{ channel_key: 'rapyp' }]), ['general', 'rapyp']);
  assert.deepEqual(channelsForEmail('vendedor@grupopoliplast.com.ar'), []);
});

test('solo Felipe ve el panel de administracion de canales', () => {
  assert.equal(isChannelAdmin('felipe@grupopoliplast.com.ar'), true);
  assert.equal(isChannelAdmin(' FelipeCnokaert@gmail.com '), true);
  assert.equal(isChannelAdmin('juan@grupopoliplast.com.ar'), false);
  assert.equal(isChannelAdmin('cowork@grupopoliplast.com.ar'), false);
  assert.equal(isChannelAdmin(undefined), false);
});

test('slugifyChannelKey arma claves validas y sin repetir', () => {
  assert.equal(slugifyChannelKey('WhatsApp RAPYP'), 'rapyp');
  assert.equal(slugifyChannelKey('WhatsApp Ventas Córdoba'), 'ventas-cordoba');
  assert.equal(slugifyChannelKey('WhatsApp RAPYP', ['rapyp']), 'rapyp-2');
  assert.equal(slugifyChannelKey('???'), 'canal');
  assert.equal(slugifyChannelKey('A'), 'a-1');
  for (const label of ['WhatsApp RAPYP', 'Ñandú', 'x'.repeat(80), '#1']) {
    assert.match(slugifyChannelKey(label), /^[a-z0-9][a-z0-9_-]{1,29}$/);
  }
});

test('parseMemberEmails separa, pasa a minuscula y saca repetidos', () => {
  assert.deepEqual(parseMemberEmails(' Ana@GrupoPoliplast.com.ar, beto@grupopoliplast.com.ar;ana@grupopoliplast.com.ar\n'), ['ana@grupopoliplast.com.ar', 'beto@grupopoliplast.com.ar']);
  assert.deepEqual(parseMemberEmails(''), []);
});

test('validateChannelDraft rechaza lo que la base rechazaria y lo explica', () => {
  const existing = [{ channel_key: 'rapyp', phone_number_id: '123456789' }];
  const good = validateChannelDraft({ label: 'WhatsApp X', phoneNumberId: '987654321', membersText: 'a@grupopoliplast.com.ar', color: '#0d7764' }, { existing });
  assert.deepEqual(good.errors, []);
  assert.deepEqual(good.members, ['a@grupopoliplast.com.ar']);
  const bad = validateChannelDraft({ label: '', phoneNumberId: '12ab', membersText: 'x@gmail.com, roto', color: 'rojo' }, { existing });
  assert.equal(bad.errors.length, 5);
  assert.ok(validateChannelDraft({ label: 'Y', phoneNumberId: '123456789' }, { existing }).errors.some((e) => /ya está asignado/.test(e)));
  assert.deepEqual(validateChannelDraft({ label: 'Y', phoneNumberId: '123456789' }, { existing, editingKey: 'rapyp' }).errors, []);
  assert.deepEqual(validateChannelDraft({ label: 'Y', membersText: 'felipecnokaert@gmail.com' }).errors, []);
});

test('los canales historicos no se pueden eliminar desde la pantalla', () => {
  for (const key of BASE_CHANNEL_KEYS) assert.equal(canDeleteChannel(key), false);
  assert.equal(canDeleteChannel('rapyp'), true);
});

test('el panel ChannelsAdmin renderiza su formulario y la ayuda sin explotar', async () => {
  const React = (await import('react')).default;
  const { renderToStaticMarkup } = await import('react-dom/server');
  const { loadJsxModule } = await import('./helpers/load-jsx.mjs');
  const mod = await loadJsxModule('test/fixtures/channels-admin-with-confirm.jsx');
  const html = renderToStaticMarkup(React.createElement(mod.ChannelsAdminWithConfirm));
  assert.match(html, /Canales de WhatsApp/);
  assert.match(html, /Crear canal/);
  assert.match(html, /Quién lo usa/);
});
