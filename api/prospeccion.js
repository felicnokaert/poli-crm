import { authenticatedCorporateUser } from '../lib/corporate-auth.mjs';
import { enrichWebsite } from '../lib/prospect-enrich.mjs';
import { discoverCandidates, researchWebsite } from '../lib/prospect-research.mjs';
import { researchCompetitor } from '../lib/competitor-research.mjs';
import { googleConfig, normalizeGoogle, searchGoogle, takeQuota } from '../lib/prospect-google.mjs';
import { OVERPASS_ENDPOINTS, STAGE_TIMEOUTS_MS, buildOverpassStages, normalizeOverpass, radiusForPopulation, safeWord, searchOverpass, summarizeResults } from '../lib/prospect-osm.mjs';

// Lupa de Prospección: busca comercios en OpenStreetMap por zona y rubros y
// devuelve prospectos listos para cargar. Solo lecturas; no guarda nada.
export default async function handler(request, response) {
  if (request.method !== 'POST') return response.status(405).json({ error: 'Método no permitido.' });
  const user = await authenticatedCorporateUser(request);
  if (!user) return response.status(401).json({ error: 'Acceso corporativo requerido.' });

  const body = request.body || {};
  if (body.action === 'sources') {
    const google = googleConfig();
    return response.status(200).json({ ok: true, sources: ['OpenStreetMap', ...(google.enabled ? ['Google Maps'] : [])], googleDailyCap: google.enabled ? google.cap : 0 });
  }
  if (body.action === 'enrich') {
    const result = await enrichWebsite(String(body.website || ''));
    return response.status(result.ok ? 200 : 422).json(result);
  }
  if (body.action === 'discover') {
    const found = await discoverCandidates({
      rubros: (Array.isArray(body.rubros) ? body.rubros : []).map(String).slice(0, 4),
      city: String(body.city || '').slice(0, 80), province: String(body.province || '').slice(0, 80), family: String(body.family || '').slice(0, 40),
    });
    return response.status(200).json({ ok: true, ...found });
  }
  if (body.action === 'competitor') {
    // Competidor nuevo: lee su sitio (o lo busca por el nombre) y devuelve la ficha armada. No guarda nada.
    const result = await researchCompetitor({ name: String(body.name || '').slice(0, 120), website: String(body.website || '').slice(0, 300), family: String(body.family || '').slice(0, 40), kind: String(body.kind || '').slice(0, 20) });
    return response.status(result.ok ? 200 : 422).json(result);
  }
  if (body.action === 'research') {
    const result = await researchWebsite({ website: String(body.website || ''), family: String(body.family || ''), rubros: Array.isArray(body.rubros) ? body.rubros.map(String).slice(0, 8) : [] });
    return response.status(result.ok ? 200 : 422).json(result);
  }
  const lat = Number(body.lat);
  const lon = Number(body.lon);
  // Cajón aproximado de Argentina: evita consultas fuera del país por error.
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || lat < -56 || lat > -21 || lon < -74 || lon > -53) {
    return response.status(400).json({ error: 'La zona no es válida.' });
  }
  const rubros = Array.isArray(body.rubros) ? body.rubros.map(safeWord).filter(Boolean).slice(0, 12) : [];
  if (!rubros.length) return response.status(400).json({ error: 'Elegí al menos un rubro.' });

  const radiusKm = Math.min(Number(body.radiusKm) || radiusForPopulation(Number(body.population)), 30);
  if (body.source === 'Google Maps') {
    // Apagado por defecto: sin configuración completa no se consulta nada.
    if (!googleConfig().enabled) return response.status(403).json({ error: 'La búsqueda en Google Maps está desactivada.', kind: 'off' });
    const quota = await takeQuota();
    if (!quota.ok) {
      const error = quota.reason === 'cap' ? `Se alcanzó el tope diario de ${quota.cap} búsquedas en Google Maps. Mañana se renueva; mientras tanto usá OpenStreetMap.` : 'No se pudo verificar el tope diario de Google Maps, así que no se consultó.';
      return response.status(429).json({ error, kind: 'cap' });
    }
    const found = await searchGoogle({ query: rubros.join(' OR '), lat, lon, radiusKm });
    if (!found.ok) return response.status(502).json({ error: found.error, kind: 'network', attempts: 1, ms: found.ms });
    const googleResults = normalizeGoogle(found.data, { zoneName: safeWord(body.zoneName || ''), province: safeWord(body.province || ''), family: safeWord(body.family || '') });
    return response.status(200).json({ ok: true, source: 'Google Maps', radiusKm, count: googleResults.length, truncated: false, stats: summarizeResults(googleResults), attempts: 1, ms: found.ms, endpoint: 'places.googleapis.com', results: googleResults });
  }
  const stages = buildOverpassStages({ lat, lon, radiusKm, rubros });
  // Las dos etapas corren a la vez y cada una prueba los 3 servidores (10 s cada uno): máximo ~30 s.
  const runs = await Promise.all(['tags', 'names'].filter((name) => stages[name]).map(async (name) => ({ name, result: await searchOverpass(stages[name], fetch, OVERPASS_ENDPOINTS, STAGE_TIMEOUTS_MS[name]) })));
  const worked = runs.filter((run) => run.result.ok);
  const attempts = runs.reduce((sum, run) => sum + run.result.attempts, 0);
  const ms = runs.reduce((sum, run) => sum + run.result.ms, 0);
  if (!worked.length) {
    const last = runs.at(-1).result;
    return response.status(502).json({ error: last.error, kind: last.kind, attempts, ms });
  }
  const seen = new Set();
  const elements = worked.flatMap((run) => run.result.data?.elements || []).filter((element) => { const key = `${element.type}/${element.id}`; if (seen.has(key)) return false; seen.add(key); return true; });
  const failedStage = runs.find((run) => !run.result.ok);
  const result = { data: { elements }, attempts, ms, endpoint: worked[0].result.endpoint };

  const results = normalizeOverpass(result.data, {
    zoneName: safeWord(body.zoneName || ''),
    province: safeWord(body.province || ''),
    family: safeWord(body.family || ''),
  });
  return response.status(200).json({
    ok: true, source: 'OpenStreetMap', radiusKm, count: results.length, truncated: (result.data?.elements || []).length >= 200,
    stats: summarizeResults(results), attempts: result.attempts, ms: result.ms, endpoint: result.endpoint, results,
    warning: failedStage ? `La búsqueda por nombre no respondió a tiempo (${failedStage.name === 'names' ? 'solo se usaron los rubros con etiqueta' : 'solo se usaron las palabras del nombre'}). Probá de nuevo más tarde para completar.` : '',
  });
}
