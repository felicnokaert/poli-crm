import { authenticatedCorporateUser } from '../lib/corporate-auth.mjs';
import { enrichWebsite } from '../lib/prospect-enrich.mjs';
import { buildOverpassQuery, normalizeOverpass, radiusForPopulation, safeWord, searchOverpass, summarizeResults } from '../lib/prospect-osm.mjs';

// Lupa de Prospección: busca comercios en OpenStreetMap por zona y rubros y
// devuelve prospectos listos para cargar. Solo lecturas; no guarda nada.
export default async function handler(request, response) {
  if (request.method !== 'POST') return response.status(405).json({ error: 'Método no permitido.' });
  const user = await authenticatedCorporateUser(request);
  if (!user) return response.status(401).json({ error: 'Acceso corporativo requerido.' });

  const body = request.body || {};
  if (body.action === 'enrich') {
    const result = await enrichWebsite(String(body.website || ''));
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
  const query = buildOverpassQuery({ lat, lon, radiusKm, rubros });
  const result = await searchOverpass(query);
  if (!result.ok) return response.status(502).json({ error: result.error, kind: result.kind, attempts: result.attempts, ms: result.ms });

  const results = normalizeOverpass(result.data, {
    zoneName: safeWord(body.zoneName || ''),
    province: safeWord(body.province || ''),
    family: safeWord(body.family || ''),
  });
  return response.status(200).json({
    ok: true, source: 'OpenStreetMap', radiusKm, count: results.length, truncated: (result.data?.elements || []).length >= 200,
    stats: summarizeResults(results), attempts: result.attempts, ms: result.ms, endpoint: result.endpoint, results,
  });
}
