// Crear productos en Shopify SIEMPRE como BORRADOR (24/10, Felipe: "no publicar nada, dejarlo en borrador para que yo vea y confirme").
// Es lo único que el CRM escribe en la tienda: no edita ni borra productos que ya existen, no cambia precios ni stock de nada
// publicado, y ningún producto sale con otro estado que DRAFT. Necesita que la app tenga el permiso write_products (y, si se
// quiere el stock constante de 999, write_inventory); sin eso devuelve un mensaje claro y no intenta nada.
import { shopifyGraphql } from './shopify.mjs';

const MAX_PRODUCTS = 8;
const MAX_VARIANTS = 100;
const STOCK_CONSTANT = 999;
const clean = (value, max) => String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
const money = (value) => { const n = Number(value); return Number.isFinite(n) && n > 0 ? n.toFixed(2) : null; };
// Tipos de metacampo que puede crear el CRM: texto de una línea (atributos de ML), texto de varias líneas y listas (secciones de la descripción).
const META_TYPES = new Set(['single_line_text_field', 'multi_line_text_field', 'list.single_line_text_field']);
function metaValue(type, value) {
  if (type === 'single_line_text_field') return clean(value, 255);
  if (type === 'multi_line_text_field') return String(value ?? '').replace(/\r\n?/g, '\n').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim().slice(0, 5000);
  let list = value;
  if (typeof list === 'string') { try { list = JSON.parse(list); } catch { list = [list]; } }
  const items = (Array.isArray(list) ? list : [list]).map((item) => clean(item, 255)).filter(Boolean).slice(0, 25);
  return items.length ? JSON.stringify(items) : '';
}
const httpsOnly = (url) => (/^https:\/\//i.test(String(url || '')) ? String(url) : '');

export class ShopifyWriteError extends Error {
  constructor(message, code = 'error') { super(message); this.code = code; }
}

const SCOPES_QUERY = 'query { currentAppInstallation { accessScopes { handle } } }';
const LOCATION_QUERY = 'query { locations(first: 1) { nodes { id } } }';
const SKU_QUERY = `query($query: String!) { productVariants(first: 20, query: $query) { nodes { sku product { id title } } } }`;
const SOURCE_QUERY = `query($id: ID!) { product(id: $id) { descriptionHtml vendor productType tags seo { title description } media(first: 10) { nodes { ... on MediaImage { alt image { url } } } } } }`;
const PRODUCT_SET = `mutation($input: ProductSetInput!) {
  productSet(input: $input, synchronous: true) {
    product { id handle title status }
    userErrors { field message code }
  }
}`;

export async function grantedScopes(environment, http) {
  const data = await shopifyGraphql(environment, http, SCOPES_QUERY);
  return (data?.currentAppInstallation?.accessScopes || []).map((scope) => scope.handle);
}

// Pasa lo que manda el navegador a un ProductSetInput de Shopify. Todo se limpia y se limita; el estado es siempre DRAFT.
export function buildProductSet(spec = {}, { locationId = '', stockable = false, source = null } = {}) {
  const title = clean(spec.title, 255);
  if (!title) throw new ShopifyWriteError('Falta el título del producto.', 'invalido');
  const options = (Array.isArray(spec.options) ? spec.options : []).slice(0, 3)
    .map((option) => ({ name: clean(option.name, 255), values: [...new Set((option.values || []).map((value) => clean(value, 255)).filter(Boolean))] }))
    .filter((option) => option.name && option.values.length);
  const simple = options.length === 0;
  const productOptions = simple ? [{ name: 'Title', values: [{ name: 'Default Title' }] }] : options.map((option, index) => ({ name: option.name, position: index + 1, values: option.values.map((name) => ({ name })) }));
  const names = productOptions.map((option) => option.name);
  const variants = (Array.isArray(spec.variants) ? spec.variants : []).slice(0, MAX_VARIANTS).map((variant) => {
    const optionValues = simple
      ? [{ optionName: 'Title', name: 'Default Title' }]
      : names.map((optionName, index) => ({ optionName, name: clean(variant.optionValues?.[index], 255) || '—' }));
    const sku = clean(variant.sku, 255);
    const out = { optionValues, price: money(variant.price) || '0.00' };
    if (sku) out.sku = sku;
    const compare = money(variant.compareAtPrice);
    if (compare) out.compareAtPrice = compare;
    if (variant.stock && stockable && locationId) {
      out.inventoryItem = { tracked: true };
      out.inventoryQuantities = [{ locationId, name: 'available', quantity: STOCK_CONSTANT }];
    } else out.inventoryItem = { tracked: variant.stock ? false : true };
    return out;
  });
  if (!variants.length) throw new ShopifyWriteError(`«${title}» no tiene variantes.`, 'invalido');
  const tags = [...new Set([...(spec.tags || []), ...(source?.tags || [])].map((tag) => clean(tag, 255)).filter(Boolean))].slice(0, 30);
  const images = [...(Array.isArray(spec.images) ? spec.images : []), ...(source?.images || [])].map(httpsOnly).filter(Boolean);
  const metafields = (Array.isArray(spec.metafields) ? spec.metafields : []).slice(0, 14)
    .map((field) => {
      const type = META_TYPES.has(field.type) ? field.type : 'single_line_text_field';
      return { namespace: 'custom', key: clean(field.key, 64).toLowerCase().replace(/[^a-z0-9_-]+/g, '_'), type, value: metaValue(type, field.value) };
    })
    .filter((field) => field.key.length >= 2 && field.value);
  const seoTitle = clean(spec.seoTitle ?? source?.seo?.title, 70);
  const seoDescription = clean(spec.seoDescription ?? source?.seo?.description, 320);
  return {
    title,
    status: 'DRAFT',
    vendor: clean(spec.vendor || source?.vendor || 'Poliplast', 255),
    ...(clean(spec.productType || source?.productType, 255) ? { productType: clean(spec.productType || source?.productType, 255) } : {}),
    ...((spec.descriptionHtml || source?.descriptionHtml) ? { descriptionHtml: String(spec.descriptionHtml || source.descriptionHtml).slice(0, 60000) } : {}),
    ...(tags.length ? { tags } : {}),
    ...(seoTitle || seoDescription ? { seo: { ...(seoTitle ? { title: seoTitle } : {}), ...(seoDescription ? { description: seoDescription } : {}) } } : {}),
    productOptions,
    variants,
    ...(images.length ? { files: [...new Set(images)].slice(0, 10).map((originalSource) => ({ originalSource, contentType: 'IMAGE', alt: title })) } : {}),
    ...(metafields.length ? { metafields } : {}),
  };
}

async function existingSkus(environment, http, skus) {
  const found = new Map();
  for (let index = 0; index < skus.length; index += 10) {
    const query = skus.slice(index, index + 10).map((sku) => `sku:"${sku.replace(/"/g, '')}"`).join(' OR ');
    const data = await shopifyGraphql(environment, http, SKU_QUERY, { query });
    for (const node of data?.productVariants?.nodes || []) if (node.sku) found.set(String(node.sku).toUpperCase(), node.product?.title || '');
  }
  return found;
}

// specs: hasta 8 productos. Devuelve un resultado por producto; nunca toca los que ya existen.
export async function createDrafts(environment, http, specs = []) {
  if (!Array.isArray(specs) || !specs.length) throw new ShopifyWriteError('No hay productos para crear.', 'invalido');
  if (specs.length > MAX_PRODUCTS) throw new ShopifyWriteError(`Se pueden crear hasta ${MAX_PRODUCTS} productos por vez.`, 'invalido');
  const scopes = await grantedScopes(environment, http);
  if (!scopes.includes('write_products')) {
    throw new ShopifyWriteError('La app de Shopify todavía no tiene el permiso write_products. Agregalo en el Dev Dashboard (nueva versión) y aceptalo en la tienda; después vuelve a funcionar acá.', 'sin_permiso');
  }
  const stockable = scopes.includes('write_inventory');
  let locationId = '';
  if (stockable) locationId = (await shopifyGraphql(environment, http, LOCATION_QUERY))?.locations?.nodes?.[0]?.id || '';
  const results = [];
  for (const spec of specs) {
    const title = clean(spec?.title, 255);
    try {
      if (!spec?.allowExistingSku) {
        const skus = (spec.variants || []).map((variant) => clean(variant.sku, 255).toUpperCase()).filter(Boolean);
        const found = await existingSkus(environment, http, skus);
        if (found.size) throw new ShopifyWriteError(`Ya existe en la tienda: ${[...found].map(([sku, product]) => `${sku} (${product})`).slice(0, 3).join(', ')}. No se creó para no duplicar.`, 'duplicado');
      }
      let source = null;
      if (spec?.copyFrom && /^gid:\/\/shopify\/Product\/\d+$/.test(String(spec.copyFrom))) {
        const product = (await shopifyGraphql(environment, http, SOURCE_QUERY, { id: spec.copyFrom }))?.product;
        if (product) source = { ...product, images: (product.media?.nodes || []).map((node) => node?.image?.url).filter(Boolean) };
      }
      const input = buildProductSet(spec, { locationId, stockable, source });
      const data = await shopifyGraphql(environment, http, PRODUCT_SET, { input });
      const errors = data?.productSet?.userErrors || [];
      if (errors.length) throw new ShopifyWriteError(errors.map((error) => error.message).join('; ').slice(0, 300), 'rechazado');
      const product = data?.productSet?.product;
      results.push({ title, ok: true, id: product?.id, handle: product?.handle, status: product?.status, stock: stockable && locationId ? 'Stock 999 cargado donde ML tenía stock.' : 'Sin write_inventory: los que tenían stock quedaron sin seguimiento de stock (siempre disponibles).' });
    } catch (error) {
      results.push({ title, ok: false, code: error.code || 'error', error: String(error?.message || error).slice(0, 300) });
      if (error.code === 'sin_permiso') break;
    }
  }
  return { ok: results.every((result) => result.ok), results };
}
