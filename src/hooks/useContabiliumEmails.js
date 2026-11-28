import { useEffect, useState } from 'react';

// Fichas de clientes de Contabilium (mail) y, para administradores, los FC/COT de 12 meses con el vendedor del comprobante.
// Solo lee. Se guarda en memoria mientras la app está abierta.
const cache = { clients: null, invoices: null };

async function pages(build, max = 15) {
  const out = [];
  for (let page = 0; page < max; page += 1) {
    const { data, error } = await build().range(page * 1000, page * 1000 + 999);
    if (error) throw new Error(error.message);
    out.push(...(data || []));
    if (!data || data.length < 1000) break;
  }
  return out;
}

export function useContabiliumEmails({ supabase = null, withInvoices = false } = {}) {
  const [state, setState] = useState({ clients: cache.clients, invoices: cache.invoices, error: '', loading: false });
  useEffect(() => {
    if (!supabase?.from) return undefined;
    if (cache.clients && (!withInvoices || cache.invoices)) { setState({ clients: cache.clients, invoices: cache.invoices, error: '', loading: false }); return undefined; }
    let alive = true;
    setState((current) => ({ ...current, loading: true }));
    (async () => {
      try {
        if (!cache.clients) cache.clients = await pages(() => supabase.from('contabilium_clientes').select('company,id,razon_social,cuit,telefono,email').order('company').order('id'));
        if (withInvoices && !cache.invoices) {
          const since = new Date(Date.now() - 365 * 86400000).toISOString().slice(0, 10);
          cache.invoices = await pages(() => supabase.from('contabilium_comprobantes').select('company,cliente_id,cliente,tipo,fecha,vendedor:raw->>IDVendedor').gte('fecha', since).or('tipo.ilike.FC%,tipo.ilike.COT%').order('fecha', { ascending: false }), 20);
        }
        if (alive) setState({ clients: cache.clients, invoices: cache.invoices, error: '', loading: false });
      } catch (error) {
        if (alive) setState({ clients: cache.clients, invoices: cache.invoices, error: `No se pudo leer Contabilium (${error.message}).`, loading: false });
      }
    })();
    return () => { alive = false; };
  }, [supabase, withInvoices]);
  return state;
}
