import { currentListPrices } from "./assistant-prices.mjs";
import { readPaged } from "./ml-improve-data.js";
import { retailPrice } from "./ml-economics-view.mjs";
import { buildProductHub, normSku } from "./product-hub.mjs";

// 20/11: todo lo que necesita Productos (y el asistente) en una sola lectura. Solo lee.
const ITEM_COLUMNS = "id,seller_id,title,permalink,status,price,listing_type,category_id,sold_quantity,available_quantity,visits_7d,visits_30d,thumbnail,sku,variation_skus";
const today = () => new Date(Date.now() - 3 * 3600000).toISOString().slice(0, 10);

const safe = (promise, fallback) => promise.then((value) => value, () => fallback);

export async function loadDollar(http = typeof fetch === "function" ? fetch : null) {
  if (!http) return null;
  try {
    const response = await http("/api/dolar");
    if (!response.ok) return null;
    const body = await response.json();
    return Number(body?.rate) > 0 ? { rate: Number(body.rate), source: body.source || "BNA", date: body.quotationDate || null } : null;
  } catch {
    return null;
  }
}

async function loadListPrices(supabase, variants) {
  const prices = [];
  for (let index = 0; index < variants.length; index += 150) {
    const { data } = await supabase.from("variant_prices").select("price_list_id,variant_id,min_quantity,max_quantity,amount,status").in("variant_id", variants.slice(index, index + 150).map((variant) => variant.id));
    prices.push(...(data || []));
  }
  const { data: lists } = await supabase.from("price_lists").select("id,name,currency,vat_rate,valid_from,valid_until,status");
  const out = {};
  for (const entry of currentListPrices({ variants, prices, lists: lists || [], today: today() })) {
    const row = retailPrice(entry);
    if (row) out[normSku(entry.variant.sku)] = row;
  }
  return out;
}

export async function loadProductHub(supabase, { http } = {}) {
  const [items, economics, health, catalog, questions, shopVariants, shopProducts, trendRows, names, variants, photos, products, dollar] = await Promise.all([
    readPaged(() => supabase.from("ml_items").select(ITEM_COLUMNS).eq("status", "active").order("id")),
    safe(readPaged(() => supabase.from("ml_item_economics").select("id,units_30d,revenue_30d,fees_30d,shipping_per_unit").order("id")), []),
    safe(readPaged(() => supabase.from("ml_item_health").select("id,quality_level,quality_score,px_color").order("id")), []),
    safe(readPaged(() => supabase.from("ml_catalog_status").select("item_id,status,winner_is_ours,price_to_win,winner_price,winner_nickname").order("item_id")), []),
    safe(readPaged(() => supabase.from("ml_questions").select("item_id").order("id")), []),
    safe(readPaged(() => supabase.from("shopify_variants").select("id,product_id,sku,price,compare_at_price,inventory_quantity").order("id")), []),
    safe(readPaged(() => supabase.from("shopify_products").select("id,title,status").order("id")), []),
    safe(readPaged(() => supabase.from("ml_trends").select("category_id,taken_on,keywords").order("taken_on", { ascending: false })), []),
    safe(supabase.rpc("ml_account_names"), { data: [] }),
    safe(readPaged(() => supabase.from("catalog_variants").select("id,sku,name,product_id,active").eq("active", true).order("id")), []),
    safe(readPaged(() => supabase.from("catalog_product_photos").select("product_id,url").order("product_id")), []),
    safe(readPaged(() => supabase.from("catalog_products").select("id,photo_path,status").order("id")), []),
    loadDollar(http),
  ]);
  const listPrices = variants.length ? await safe(loadListPrices(supabase, variants), {}) : {};
  const byId = (rows, key = "id") => Object.fromEntries(rows.map((row) => [row[key], row]));
  const questionCounts = {};
  for (const row of questions) questionCounts[row.item_id] = (questionCounts[row.item_id] || 0) + 1;
  const trends = {};
  for (const row of trendRows) if (!trends[row.category_id]) trends[row.category_id] = Array.isArray(row.keywords) ? row.keywords : [];
  const productById = byId(products);
  const photoByProduct = {};
  for (const row of photos) if (!photoByProduct[row.product_id]) photoByProduct[row.product_id] = row.url;
  // Los productos con foto propia (photo_path) cuentan como «con foto» aunque acá no se muestre la imagen.
  for (const product of products) if (!photoByProduct[product.id] && String(product.photo_path || "").trim()) photoByProduct[product.id] = "propia";
  const liveVariants = variants.filter((variant) => productById[variant.product_id]?.status !== "excluido");
  const shopProductById = byId(shopProducts);
  const shopify = shopVariants.map((variant) => ({ ...variant, status: shopProductById[variant.product_id]?.status || "", title: shopProductById[variant.product_id]?.title || "" }));
  const nickname = Object.fromEntries((names?.data || []).map((row) => [row.seller_id, row.nickname]));
  const rows = buildProductHub({
    variants: liveVariants, listPrices, photos: photoByProduct, items,
    economics: byId(economics), health: byId(health), catalog: byId(catalog, "item_id"),
    questions: questionCounts, shopify, trends, nickname, dollar: dollar?.rate || null,
  });
  return { rows, dollar, accounts: names?.data || [] };
}
