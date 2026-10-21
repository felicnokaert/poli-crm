import { useEffect, useState } from "react";
import { searchKnowledge, withMercadoLibre } from "./knowledge-search.mjs";
import { PRODUCT_CATALOG } from "./product-catalog.mjs";
import { OBJECTIONS } from "./commercial-knowledge.mjs";

// Todo lo que sabe el CRM para buscar (Academia → Buscar y la ventana del asistente, 21/10): fichas
// vigentes (con su texto, que se trae recién al buscar), guías, competencia, productos, clientes y las
// preguntas respondidas de Mercado Libre (en la base, con una pausa mientras se escribe).
export function useKnowledge(supabase, query, { clients = [], sellers = [] } = {}) {
  const [docs, setDocs] = useState([]);
  const [competitors, setCompetitors] = useState([]);
  const [guides, setGuides] = useState([]);
  const [pendingDocs, setPendingDocs] = useState(0);
  const [textsLoaded, setTextsLoaded] = useState(false);
  const [mlRows, setMlRows] = useState([]);
  useEffect(() => {
    if (!supabase) return;
    supabase.from("technical_documents").select("id,title,family,product,sku,doc_type,status,notes").eq("status", "vigente").limit(500)
      .then(({ data }) => setDocs(data || []));
    supabase.from("technical_documents").select("id", { count: "exact", head: true }).neq("status", "vigente")
      .then(({ count }) => setPendingDocs(count || 0), () => {});
    supabase.from("competitors").select("id,name,kind,families,summary,caveats").then(({ data }) => setCompetitors(data || []));
    supabase.from("product_guides").select("id,family,product,summary,sections,status").then(({ data }) => setGuides(data || []), () => {});
  }, [supabase]);
  // El texto completo de las fichas pesa: se trae una sola vez, recién cuando alguien busca (17/10).
  const searching = query.trim().length > 2;
  useEffect(() => {
    if (!supabase || !searching || textsLoaded) return;
    setTextsLoaded(true);
    supabase.from("technical_documents").select("id,extracted_text").eq("status", "vigente").limit(500)
      .then(({ data }) => {
        const byId = new Map((data || []).map((row) => [row.id, row.extracted_text || ""]));
        setDocs((current) => current.map((doc) => ({ ...doc, extractedText: byId.get(doc.id) || "" })));
      }, () => {});
  }, [supabase, searching, textsLoaded]);
  useEffect(() => {
    if (!supabase || !searching) { setMlRows([]); return undefined; }
    let active = true;
    const timer = setTimeout(() => {
      supabase.rpc("search_ml_knowledge", { q: query.trim(), max_rows: 8 })
        .then(({ data, error }) => { if (active) setMlRows(error ? [] : data || []); }, () => {});
    }, 400);
    return () => { active = false; clearTimeout(timer); };
  }, [supabase, searching, query]);
  const sources = { products: PRODUCT_CATALOG, guides, docs, clients, sellers, objections: OBJECTIONS, competitors };
  return { result: withMercadoLibre(searchKnowledge(query, sources), mlRows), pendingDocs, guides };
}
