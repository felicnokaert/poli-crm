// Lectura compartida por "Qué mejorar" y el asistente: la calidad y experiencia de compra guardadas.
export const HEALTH_COLUMNS = "id,seller_id,quality_score,quality_level,quality_pending,px_color,px_score,px_label,px_problems,checked_at";
export const IMPROVE_ITEM_COLUMNS = "id,seller_id,title,permalink,status,price,available_quantity,sold_quantity,visits_30d,clips_count,pictures_count,description_length";

export async function readPaged(query) {
  const rows = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await query().range(from, from + 999);
    if (error) throw error;
    rows.push(...(data || []));
    if (!data || data.length < 1000) break;
  }
  return rows;
}

export const loadHealth = (supabase) => readPaged(() => supabase.from("ml_item_health").select(HEALTH_COLUMNS).order("id"));
export const loadActiveItems = (supabase) => readPaged(() => supabase.from("ml_items").select(IMPROVE_ITEM_COLUMNS).eq("status", "active").order("id"));

// 23/10: competencia y tendencias (últimos 40 días de fotos).
export async function loadCompetition(supabase) {
  const since = new Date(Date.now() - 40 * 86400000).toISOString().slice(0, 10);
  const [competitors, snapshots, trends, catalog] = await Promise.all([
    readPaged(() => supabase.from("ml_competitor_items").select("*").order("id")),
    readPaged(() => supabase.from("ml_competitor_snapshots").select("item_id,taken_on,price,sold_quantity").gte("taken_on", since).order("item_id")),
    readPaged(() => supabase.from("ml_trends").select("category_id,taken_on,category_name,path,keywords").gte("taken_on", since).order("category_id")),
    readPaged(() => supabase.from("ml_catalog_status").select("*").order("item_id")).catch(() => []),
  ]);
  return { competitors, snapshots, trends, catalog };
}
