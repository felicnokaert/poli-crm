import { currentListPrices } from "./assistant-prices.mjs";
import { readPaged } from "./ml-improve-data.js";
import { retailPrice } from "./ml-economics-view.mjs";

// 23/10: lo que necesita "Stock y ganancia" (y el asistente): ventas/comisión/envío por publicación, el SKU de
// cada publicación y el precio de lista vigente de ese SKU en el catálogo del cotizador.
const normSku = (value) => String(value || "").trim().toUpperCase().replace(/\s+/g, "");
const today = () => new Date(Date.now() - 3 * 3600000).toISOString().slice(0, 10);

export async function loadEconomics(supabase) {
  const [economics, skuRows] = await Promise.all([
    readPaged(() => supabase.from("ml_item_economics").select("*").order("id")),
    readPaged(() => supabase.from("ml_items").select("id,sku").eq("status", "active").neq("sku", "").order("id")),
  ]);
  const skus = Object.fromEntries(skuRows.map((row) => [row.id, normSku(row.sku)]));
  const listPrices = {};
  try {
    const wanted = [...new Set(Object.values(skus))];
    const variants = [];
    for (let index = 0; index < wanted.length; index += 150) {
      const { data } = await supabase.from("catalog_variants").select("id,sku,name,product_id,active").eq("active", true).in("sku", wanted.slice(index, index + 150));
      variants.push(...(data || []));
    }
    if (variants.length) {
      const prices = [];
      for (let index = 0; index < variants.length; index += 150) {
        const { data } = await supabase.from("variant_prices").select("price_list_id,variant_id,min_quantity,max_quantity,amount,status").in("variant_id", variants.slice(index, index + 150).map((variant) => variant.id));
        prices.push(...(data || []));
      }
      const { data: lists } = await supabase.from("price_lists").select("id,name,currency,vat_rate,valid_from,valid_until,status");
      for (const entry of currentListPrices({ variants, prices, lists: lists || [], today: today() })) {
        const row = retailPrice(entry);
        if (row) listPrices[normSku(entry.variant.sku)] = row;
      }
    }
  } catch {
    // Sin catálogo se muestra igual, sin la comparación con la lista.
  }
  return { economics, skus, listPrices };
}
