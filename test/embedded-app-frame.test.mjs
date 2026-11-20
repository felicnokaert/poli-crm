import { test } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { render, waitFor, cleanup, act } from '@testing-library/react';
import { loadJsxModule } from './helpers/load-jsx.mjs';

const { EmbeddedAppFrame } = await loadJsxModule('src/EmbeddedAppFrame.jsx');

const ORIGIN = 'https://poli-entregas.vercel.app';
const session = { access_token: 'acceso-de-prueba', refresh_token: 'renovar-de-prueba' };

function montar() {
  const { container } = render(React.createElement(EmbeddedAppFrame, {
    session, src: `${ORIGIN}/?embed=1#/`, origin: ORIGIN, readyType: 'entregas:listo', heightType: 'entregas:alto', title: 'Entregas', bare: true,
  }));
  const iframe = container.querySelector('iframe');
  const enviados = [];
  iframe.contentWindow.postMessage = (data, origin) => enviados.push({ data, origin });
  const desdeLaApp = (data, origin = ORIGIN) => act(() => {
    // jsdom no acepta como `source` la ventana del iframe (otro reino): se arma el evento a mano.
    const ev = new window.Event('message');
    Object.defineProperties(ev, { data: { value: data }, origin: { value: origin }, source: { value: iframe.contentWindow } });
    window.dispatchEvent(ev);
  });
  return { iframe, enviados, desdeLaApp };
}

// 20/11: al sumar el alto automático se borró sin querer el envío de la sesión y Entregas pedía login dentro del CRM.
test('EmbeddedAppFrame: cuando la app avisa que está lista, le manda la sesión del CRM a su origen', async () => {
  try {
    const { enviados, desdeLaApp } = montar();
    desdeLaApp({ tipo: 'entregas:listo' });
    await waitFor(() => assert.ok(enviados.some((m) => m.data.tipo === 'crm:sesion')));
    const msg = enviados.find((m) => m.data.tipo === 'crm:sesion');
    assert.equal(msg.origin, ORIGIN);
    assert.equal(msg.data.access_token, 'acceso-de-prueba');
    assert.equal(msg.data.refresh_token, 'renovar-de-prueba');
  } finally { cleanup(); }
});

test('EmbeddedAppFrame: no manda la sesión a otro origen ni si el aviso viene de otro lado', async () => {
  try {
    const { enviados, desdeLaApp } = montar();
    desdeLaApp({ tipo: 'entregas:listo' }, 'https://otro-sitio.example');
    await new Promise((r) => setTimeout(r, 30));
    assert.equal(enviados.filter((m) => m.data.tipo === 'crm:sesion').length, 0);
  } finally { cleanup(); }
});

test('EmbeddedAppFrame: con el alto que avisa la app, el iframe toma ese alto y le cuenta qué parte se ve', async () => {
  try {
    const { iframe, enviados, desdeLaApp } = montar();
    desdeLaApp({ tipo: 'entregas:listo' });
    desdeLaApp({ tipo: 'entregas:alto', alto: 1234.4 });
    await waitFor(() => assert.equal(iframe.style.height, '1235px'));
    assert.ok(iframe.classList.contains('auto-height'));
    await waitFor(() => assert.ok(enviados.some((m) => m.data.tipo === 'crm:vista')));
    assert.ok(enviados.some((m) => m.data.tipo === 'crm:sesion'), 'la sesión sigue llegando con el alto automático');
  } finally { cleanup(); }
});
