import { test } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { render, waitFor, cleanup, act } from '@testing-library/react';
import { loadJsxModule } from './helpers/load-jsx.mjs';

const { EmbeddedAppFrame } = await loadJsxModule('src/EmbeddedAppFrame.jsx');

// jsdom no deja poner source en MessageEvent: se arma el evento a mano.
function message(data, origin, source) {
  const event = new window.Event('message');
  Object.defineProperties(event, { data: { value: data }, origin: { value: origin }, source: { value: source } });
  return event;
}

// 20/11: el cotizador y Entregas volvían a pedir usuario y contraseña porque el CRM ya no les mandaba la sesión.
test('el CRM le pasa la sesión a la app de adentro cuando avisa que está lista', async () => {
  try {
    const origin = 'https://app.example.com';
    const { container } = render(React.createElement(EmbeddedAppFrame, {
      session: { access_token: 'acc', refresh_token: 'ref' },
      src: `${origin}/?embed=1`, origin, readyType: 'app:listo', title: 'Prueba', bare: true,
    }));
    const frame = container.querySelector('iframe');
    const sent = [];
    frame.contentWindow.postMessage = (data, target) => { if (data.tipo === 'crm:sesion') sent.push({ data, target }); };
    await act(async () => {
      window.dispatchEvent(message({ tipo: 'app:listo' }, origin, frame.contentWindow));
    });
    await waitFor(() => assert.equal(sent.length, 1));
    assert.deepEqual(sent[0], { data: { tipo: 'crm:sesion', access_token: 'acc', refresh_token: 'ref' }, target: origin });
  } finally { cleanup(); }
});

test('no le pasa la sesión a un mensaje de otro origen', async () => {
  try {
    const origin = 'https://app.example.com';
    const { container } = render(React.createElement(EmbeddedAppFrame, {
      session: { access_token: 'acc', refresh_token: 'ref' },
      src: `${origin}/?embed=1`, origin, readyType: 'app:listo', title: 'Prueba', bare: true,
    }));
    const frame = container.querySelector('iframe');
    const sent = [];
    frame.contentWindow.postMessage = (data) => { if (data.tipo === 'crm:sesion') sent.push(data); };
    await act(async () => {
      window.dispatchEvent(message({ tipo: 'app:listo' }, 'https://otro.example.com', frame.contentWindow));
    });
    assert.equal(sent.length, 0);
  } finally { cleanup(); }
});

test('si la app de adentro avisa «lista» otra vez (se recargó), le vuelve a mandar la sesión', async () => {
  try {
    const origin = 'https://app.example.com';
    const { container } = render(React.createElement(EmbeddedAppFrame, {
      session: { access_token: 'acc', refresh_token: 'ref' },
      src: `${origin}/?embed=1`, origin, readyType: 'app:listo', title: 'Prueba', bare: true,
    }));
    const frame = container.querySelector('iframe');
    const sent = [];
    frame.contentWindow.postMessage = (data) => { if (data.tipo === 'crm:sesion') sent.push(data); };
    await act(async () => { window.dispatchEvent(message({ tipo: 'app:listo' }, origin, frame.contentWindow)); });
    await act(async () => { window.dispatchEvent(message({ tipo: 'app:listo' }, origin, frame.contentWindow)); });
    assert.equal(sent.length, 2);
    assert.equal(sent[1].tipo, 'crm:sesion');
  } finally { cleanup(); }
});

// 21/11: mientras la app de adentro arranca se ve la P del CRM (no su «Cargando…»), y se destapa al pasarle la sesión.
test('con loadingText muestra la P del CRM hasta pasarle la sesión', async () => {
  try {
    const origin = 'https://app.example.com';
    const { container } = render(React.createElement(EmbeddedAppFrame, { session: { access_token: 'a', refresh_token: 'r' }, src: `${origin}/?embed=1`, origin, readyType: 'app:listo', title: 'App', bare: true, loadingText: 'Cargando App' }));
    assert.ok(Boolean(container.querySelector('.embedded-splash')), 'se ve la P');
    const frame = container.querySelector('iframe');
    frame.contentWindow.postMessage = () => {};
    await act(async () => { window.dispatchEvent(message({ tipo: 'app:listo' }, origin, frame.contentWindow)); });
    await waitFor(() => assert.ok(!container.querySelector('.embedded-splash')), { timeout: 2000 });
  } finally { cleanup(); }
});

// 21/11: el tema del CRM viaja a la app de adentro (en la dirección y por mensaje).
test('le pasa el tema del CRM en la dirección y por mensaje', async () => {
  try {
    document.documentElement.dataset.theme = 'dark';
    const origin = 'https://app.example.com';
    const { container } = render(React.createElement(EmbeddedAppFrame, { session: { access_token: 'a', refresh_token: 'r' }, src: `${origin}/?embed=1`, origin, readyType: 'app:listo', title: 'App', bare: true }));
    const frame = container.querySelector('iframe');
    assert.match(frame.getAttribute('src'), /tema=dark/);
    const sent = [];
    frame.contentWindow.postMessage = (data) => { sent.push(data); };
    await act(async () => { window.dispatchEvent(message({ tipo: 'app:listo' }, origin, frame.contentWindow)); });
    assert.ok(sent.some((data) => data.tipo === 'crm:tema' && data.tema === 'dark'));
    await act(async () => { document.documentElement.dataset.theme = 'light'; await new Promise((resolve) => setTimeout(resolve, 20)); });
    assert.ok(sent.some((data) => data.tipo === 'crm:tema' && data.tema === 'light'), 'al cambiar el tema lo vuelve a mandar');
  } finally { cleanup(); delete document.documentElement.dataset.theme; }
});
