// Lectura compartida por "Qué mejorar" y el asistente: la calidad y experiencia de compra guardadas.
export const HEALTH_COLUMNS = "id,seller_id,quality_score,quality_level,quality_pending,px_color,px_score,px_label,px_problems,checked_at";
export const IMPROVE_ITEM_COLUMNS = "id,seller_id,title,permalink,status,sold_quantity,visits_30d,clips_count,pictures_count,description_length";

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
