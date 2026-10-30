import { useEffect, useState } from "react";
import { customerKeys } from "../prospect-customers.mjs";

const PAGE = 1000;

// Claves (nombre, CUIT, teléfono) de los clientes que ya facturaron según Contabilium. Se piden una sola vez, cuando hay cuenta en línea;
// sin cuenta o si falla, queda vacío y la cola funciona como siempre.
export function useBillingCustomers(supabase) {
  const [keys, setKeys] = useState(null);
  useEffect(() => {
    if (!supabase) return undefined;
    let cancelled = false;
    (async () => {
      const rows = [];
      for (let from = 0; from < 50000; from += PAGE) {
        const { data, error } = await supabase.from("contabilium_clientes").select("razon_social,cuit,telefono").order("id").range(from, from + PAGE - 1);
        if (error) return;
        rows.push(...(data || []));
        if (!data || data.length < PAGE) break;
      }
      if (!cancelled) setKeys(customerKeys(rows));
    })().catch(() => {});
    return () => { cancelled = true; };
  }, [supabase]);
  return keys;
}
