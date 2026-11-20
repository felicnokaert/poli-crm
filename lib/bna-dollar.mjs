// Dólar billete vendedor del Banco Nación (mismo lector que el cotizador: api/bna-dollar.js de poliplast-cotizador).
// Lo usa Productos (precio de lista en USD → pesos). Dato público; se guarda 15 minutos en el CDN.
const BNA_URL = 'https://www.bna.com.ar/Personas';

function parseNumber(value) {
  const number = Number(String(value).replace(/\./g, '').replace(',', '.').trim());
  return Number.isFinite(number) && number > 0 ? number : null;
}

export function parseBnaHtml(html) {
  const section = String(html).match(/id=["']billetes["'][\s\S]*?<\/table>/i)?.[0];
  if (!section) return null;
  const quotationDate = section.match(/class=["']fechaCot["'][^>]*>\s*([^<]+)</i)?.[1]?.trim();
  const row = section.match(/<tr>\s*<td[^>]*>\s*Dolar U\.S\.A\s*<\/td>\s*<td[^>]*>\s*([^<]+)<\/td>\s*<td[^>]*>\s*([^<]+)<\/td>/i);
  const rate = row ? parseNumber(row[2]) : null;
  return rate ? { rate, quotationDate: quotationDate || null } : null;
}

export async function bnaDollarHandler(_request, response, http = fetch) {
  try {
    const upstream = await http(BNA_URL, { headers: { 'user-agent': 'Poliplast-CRM/1.0' } });
    if (!upstream.ok) throw new Error(`BNA respondió ${upstream.status}`);
    const parsed = parseBnaHtml(await upstream.text());
    if (!parsed) throw new Error('No se encontró la cotización vendedor billete');
    response.setHeader('Cache-Control', 's-maxage=900, stale-while-revalidate=3600');
    return response.status(200).json({ ...parsed, source: 'BNA · Dólar billete vendedor', fetchedAt: new Date().toISOString() });
  } catch (error) {
    return response.status(502).json({ error: error instanceof Error ? error.message : 'No se pudo consultar BNA' });
  }
}
