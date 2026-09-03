import { useMemo, useState } from 'react';
import { Copy, Search, Tags } from 'lucide-react';
import { buildPriceMemory, findPriceMatches, quotePrice } from './price-memory.mjs';

const money = (value, currency) =>
  currency === 'USD'
    ? `USD ${new Intl.NumberFormat('es-AR', { maximumFractionDigits: 2 }).format(value || 0)}`
    : new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 2 }).format(value || 0);

export default function PriceMemory({ sales }) {
  const [query, setQuery] = useState('');
  const [quantity, setQuantity] = useState(1);
  const [copied, setCopied] = useState(false);
  const memory = useMemo(() => buildPriceMemory(sales), [sales]);
  const matches = useMemo(() => findPriceMatches(memory, query), [memory, query]);
  const best = matches[0];
  const quote = best ? quotePrice(best, quantity) : null;

  async function copyQuote() {
    if (!quote || !best) return;
    const text = `${best.description}: ${quantity} x ${money(quote.unitPrice, quote.currency)} = ${money(quote.total, quote.currency)}`;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  }

  return (
    <section className="panel">
      <div className="panel-head">
        <div>
          <span className="eyebrow">Se aprende de cada venta cargada</span>
          <h2>Memoria de precios</h2>
          <p>Buscá un producto que ya cotizaste (viene de las facturas subidas en Ventas) y calculá el total para otra cantidad.</p>
        </div>
        <Tags size={22} />
      </div>
      <div className="list-toolbar">
        <label className="search">
          <Search size={17} />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Ej: kit de poliuretano"/>
        </label>
        <input type="number" min="1" step="1" value={quantity} onChange={(e) => setQuantity(Number(e.target.value) || 1)} style={{ maxWidth: 90 }}/>
      </div>
      {query && !matches.length && (
        <p className="form-warning">No encontré ese producto en ventas cargadas todavía. A medida que subas facturas, se va a poder buscar.</p>
      )}
      {best && quote && (
        <div className="price-memory-result">
          <div>
            <strong>{best.description}</strong>
            <span>Última vez: {best.customer || 'sin nombre'} · {best.date || 'sin fecha'} · {best.unit}</span>
          </div>
          <div>
            <span>{quantity} x {money(quote.unitPrice, quote.currency)}</span>
            <strong>{money(quote.total, quote.currency)}</strong>
          </div>
          <button type="button" className="secondary" onClick={copyQuote}><Copy size={15}/> {copied ? 'Copiado ✓' : 'Copiar para WhatsApp'}</button>
        </div>
      )}
      {matches.length > 1 && (
        <p className="price-memory-more">También coincide con: {matches.slice(1).map((item) => item.description).join(', ')}.</p>
      )}
    </section>
  );
}
