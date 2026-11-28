// Poliplast App (26/11): guardar cotizaciones del cotizador propio en las tablas que ya existían en la base
// (sales_quotes + sales_quote_items; cada vendedor ve solo las suyas por las reglas de la base). Una cotización
// NO es una venta. Cada renglón guarda la «foto» del precio (line_snapshot): al abrirla, los precios quedan como
// se cotizaron, salvo que se toque «Actualizar precios de hoy».
import { lineTotals, quoteTotals } from "./quote-model.mjs";

export const STATUSES = [["borrador", "Borrador"], ["enviada", "Enviada"], ["aceptada", "Aceptada"], ["rechazada", "Rechazada"]];

export function quoteNumber(now = new Date(), rand = Math.random) {
  const ar = new Date(now.getTime() - 3 * 3600000).toISOString();
  return `PA-${ar.slice(2, 4)}${ar.slice(5, 7)}${ar.slice(8, 10)}-${Math.floor(rand() * 9000 + 1000)}`;
}

const PRICE_MODE = { minorista: "consumidor_final", mayorista: "mayorista" };
const MODE_BACK = { consumidor_final: "minorista", mayorista: "mayorista", automatico: "minorista" };

export function quoteRow({ id, number, userId, client, mode, payment, validDays, dollar, status = "borrador" }) {
  return {
    ...(id ? { id } : {}),
    quote_number: number,
    owner_id: userId,
    updated_by: userId,
    client_name: client || "",
    payment_method: payment?.id || "transferencia",
    price_mode: PRICE_MODE[mode] || "automatico",
    valid_days: Number(validDays) || 7,
    discount_percent: Number(payment?.discount_percent) || 0,
    surcharge_percent: Number(payment?.surcharge_percent) || 0,
    exchange_rate: Number(dollar?.rate) || 0,
    output_currency: "USD",
    status,
    updated_at: new Date().toISOString(),
  };
}

export function itemRows(quoteId, lines = []) {
  return lines.filter((line) => line.row).map((line, index) => ({
    quote_id: quoteId,
    line_key: `${index + 1}-${line.id || line.sku || "x"}`,
    variant_id: line.id || null,
    product_id: line.product_id || null,
    product_name: line.name || "Producto",
    sku: line.sku || "",
    brand: line.brand || "",
    family: line.family || "",
    unit: line.unit || "unidad",
    quantity: Number(line.quantity) || 1,
    unit_amount: line.row.gross,
    currency: line.row.currency === "ARS" ? "ARS" : "USD",
    vat_rate: Number.isFinite(line.row.vat) ? line.row.vat : 0.21,
    price_source: line.row.list || "",
    line_snapshot: { mode: line.mode, row: line.row, rows: line.rows || [], photo: line.photo || "", refs: line.refs || null },
  }));
}

// Renglones guardados → renglones del cotizador (con el precio congelado).
export function linesFromItems(items = []) {
  return items.filter((item) => item.active !== false).map((item) => ({
    key: `${item.id}`,
    id: item.variant_id,
    product_id: item.product_id,
    name: item.product_name,
    sku: item.sku,
    brand: item.brand,
    family: item.family,
    unit: item.unit,
    quantity: Number(item.quantity) || 1,
    mode: item.line_snapshot?.mode || "minorista",
    rows: item.line_snapshot?.rows || [],
    frozenRow: item.line_snapshot?.row || null,
    photo: item.line_snapshot?.photo || "",
    refs: item.line_snapshot?.refs || null,
    loading: false,
  }));
}

export function quoteSummary(quote, items = []) {
  const lines = items.filter((item) => item.active !== false).map((item) => ({ quantity: Number(item.quantity) || 0, row: item.line_snapshot?.row || { gross: Number(item.unit_amount) || 0, net: (Number(item.unit_amount) || 0) / (1 + (Number(item.vat_rate) || 0.21)) } }));
  const totals = quoteTotals(lines, { payment: { discount_percent: quote.discount_percent, surcharge_percent: quote.surcharge_percent } });
  const issued = String(quote.issued_at || quote.created_at || "").slice(0, 10);
  const expires = issued ? new Date(Date.parse(`${issued}T12:00:00Z`) + (Number(quote.valid_days) || 7) * 86400000).toISOString().slice(0, 10) : "";
  return { totals, lines: lines.length, issued, expires, mode: MODE_BACK[quote.price_mode] || "minorista", first: items[0]?.product_name || "" };
}

export async function saveQuote(supabase, { quote, lines }) {
  const { data: saved, error } = await supabase.from("sales_quotes").upsert(quote).select("id,quote_number,status").single();
  if (error) throw error;
  // Renglones: se reemplazan (se apagan los viejos y se insertan los de ahora).
  await supabase.from("sales_quote_items").update({ active: false, updated_at: new Date().toISOString() }).eq("quote_id", saved.id);
  const rows = itemRows(saved.id, lines).map((row, index) => ({ ...row, line_key: `${Date.now()}-${index + 1}` }));
  if (rows.length) {
    const { error: itemsError } = await supabase.from("sales_quote_items").insert(rows);
    if (itemsError) throw itemsError;
  }
  return saved;
}

export async function listQuotes(supabase, limit = 60) {
  const { data: quotes, error } = await supabase.from("sales_quotes").select("*").order("updated_at", { ascending: false }).limit(limit);
  if (error) throw error;
  if (!quotes?.length) return [];
  const { data: items } = await supabase.from("sales_quote_items").select("*").in("quote_id", quotes.map((quote) => quote.id)).eq("active", true);
  const byQuote = new Map();
  for (const item of items || []) byQuote.set(item.quote_id, [...(byQuote.get(item.quote_id) || []), item]);
  return quotes.map((quote) => ({ quote, items: byQuote.get(quote.id) || [], summary: quoteSummary(quote, byQuote.get(quote.id) || []) }));
}

export async function setQuoteStatus(supabase, id, status, userId) {
  const { error } = await supabase.from("sales_quotes").update({ status, updated_by: userId, updated_at: new Date().toISOString() }).eq("id", id);
  if (error) throw error;
}

export { lineTotals };
