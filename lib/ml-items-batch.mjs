// 26/11: Mercado Libre niega /items?ids=… (varias a la vez) a cada vez más cuentas con
// "Resource deprecated - client no longer allowed to consume this resource" (POLIPLAST desde ~26/11).
// itemsBatch pide de a varias y, si ML responde eso, pide de a una (/items/{id}, de a 5 en paralelo),
// devolviendo la misma forma [{ code, body }]. `get(path, token)` es el lector de cada módulo (lanza si no es 200).
const DEPRECATED = /deprecated|no longer allowed/i;

function codeOf(error) {
  const text = String(error?.message || error || '');
  if (/\b403\b|forbidden/i.test(text)) return 403;
  if (/\b401\b|unauthorized/i.test(text)) return 401;
  return 404;
}

export async function itemsBatch(get, ids, attributes, token) {
  const fields = attributes ? `attributes=${attributes}` : '';
  try {
    return await get(`/items?ids=${ids.join(',')}${fields ? `&${fields}` : ''}`, token);
  } catch (error) {
    if (!DEPRECATED.test(String(error?.message || error))) throw error;
  }
  const out = [];
  for (let index = 0; index < ids.length; index += 5) {
    const group = ids.slice(index, index + 5);
    const answers = await Promise.all(group.map((id) => get(`/items/${encodeURIComponent(id)}${fields ? `?${fields}` : ''}`, token)
      .then((body) => ({ code: 200, body }), (error) => ({ code: codeOf(error), body: { id } }))));
    out.push(...answers);
  }
  return out;
}
