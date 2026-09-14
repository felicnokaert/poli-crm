// Tests de interacción real para MercadoLibre.jsx — ver
// test/pipeline-sales-whatsapp-interaction.test.mjs para el patrón general.
//
// A diferencia de esos componentes, MercadoLibre.jsx habla directo con
// `fetch` (no recibe los datos por props) - se mockea global.fetch con el
// mismo patrón ya usado en test/cron-daily-maintenance-retry.test.mjs
// (guardar el original, restaurarlo en `finally`), diferenciando por
// método/URL en vez de asumir un único endpoint.
import { test, describe, afterEach } from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react";
import { loadJsxModule } from "./helpers/load-jsx.mjs";

afterEach(cleanup);

describe("MercadoLibre.jsx - interacción real", () => {
  const session = { access_token: "test-token" };

  test("carga las cuentas al montar: POLIPLAST conectada, FOAM pendiente", async () => {
    const originalFetch = global.fetch;
    global.fetch = async (url) => {
      assert.match(String(url), /\/api\/mercadolibre-accounts$/);
      return {
        ok: true,
        json: async () => ({
          configured: true,
          accounts: [{ account_key: "poliplast", nickname: "POLIPLAST OFICIAL", seller_id: "123", status: "connected", last_synced_at: null }],
        }),
      };
    };
    try {
      const mod = await loadJsxModule("src/MercadoLibre.jsx");
      render(React.createElement(mod.default, { session }));

      await waitFor(() => screen.getByText(/POLIPLAST OFICIAL/));
      assert.ok(screen.getByText(/Seller 123/));
      assert.ok(screen.getByText("Conectada"));
      assert.ok(screen.getByText("Pendiente de conectar"), "FOAM no tiene cuenta devuelta por el mock, debería verse pendiente");
      assert.ok(screen.getByText("Pendiente"));
    } finally {
      global.fetch = originalFetch;
    }
  });

  test("sincronizar una cuenta conectada llama a /api/mercadolibre-sync y muestra el resultado", async () => {
    const originalFetch = global.fetch;
    const calls = [];
    global.fetch = async (url, options) => {
      const method = options?.method || "GET";
      calls.push([String(url), method]);
      if (String(url).endsWith("/api/mercadolibre-accounts")) {
        return {
          ok: true,
          json: async () => ({
            configured: true,
            accounts: [{ account_key: "poliplast", nickname: "POLIPLAST OFICIAL", seller_id: "123", status: "connected", last_synced_at: null }],
          }),
        };
      }
      if (String(url).endsWith("/api/mercadolibre-sync")) {
        assert.equal(method, "POST");
        assert.equal(JSON.parse(options.body).accountKey, "poliplast");
        return { ok: true, json: async () => ({ items: 42 }) };
      }
      throw new Error(`fetch inesperado: ${url}`);
    };
    try {
      const mod = await loadJsxModule("src/MercadoLibre.jsx");
      render(React.createElement(mod.default, { session }));

      await waitFor(() => screen.getByText(/POLIPLAST OFICIAL/));
      fireEvent.click(screen.getByText("Sincronizar"));

      await waitFor(() => screen.getByText("42 publicaciones sincronizadas."));
      // load() se llama una vez al montar y otra vez después de sincronizar.
      const accountFetches = calls.filter(([url]) => url.endsWith("/api/mercadolibre-accounts"));
      assert.equal(accountFetches.length, 2);
    } finally {
      global.fetch = originalFetch;
    }
  });

  test("un fallo de red al cargar muestra un mensaje de error en vez de dejar la pantalla en blanco", async () => {
    const originalFetch = global.fetch;
    global.fetch = async () => {
      throw new Error("network down");
    };
    try {
      const mod = await loadJsxModule("src/MercadoLibre.jsx");
      render(React.createElement(mod.default, { session }));

      await waitFor(() => screen.getByText("No se pudo conectar con el servidor. Revisá tu conexión e intentá de nuevo."));
    } finally {
      global.fetch = originalFetch;
    }
  });
});
