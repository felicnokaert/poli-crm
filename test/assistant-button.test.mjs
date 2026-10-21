import { test } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { loadJsxModule } from './helpers/load-jsx.mjs';

const { AssistantButton } = await loadJsxModule('src/AssistantButton.jsx');

test('el botón del asistente abre la ventana con sugerencias y se cierra con Escape', async () => {
  try {
    render(React.createElement(AssistantButton, { supabase: null, clients: [] }));
    fireEvent.click(screen.getByLabelText('Abrir el asistente'));
    await waitFor(() => screen.getByRole('dialog', { name: 'Asistente' }));
    await waitFor(() => screen.getByLabelText('Preguntale al asistente'));
    fireEvent.click(screen.getByText('rendimiento epoxi'));
    assert.equal(screen.getByLabelText('Preguntale al asistente').value, 'rendimiento epoxi');
    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() => screen.getByLabelText('Abrir el asistente'));
  } finally { cleanup(); }
});
