import { useEffect, useState } from 'react';
import { ExternalLink, RefreshCw, ShoppingBag } from 'lucide-react';

const EXPECTED = [
  { key: 'poliplast', label: 'POLIPLAST' },
  { key: 'foam', label: 'FOAM' },
];

function friendlyDate(value) {
  if (!value) return 'Todavía no sincronizada';
  return new Intl.DateTimeFormat('es-AR', { dateStyle: 'short', timeStyle: 'short', hour12: false }).format(new Date(value));
}

export default function MercadoLibre({ session }) {
  const [status, setStatus] = useState({ configured: false, accounts: [] });
  const [message, setMessage] = useState('');
  const [working, setWorking] = useState('');

  async function load() {
    if (!session?.access_token) return;
    const response = await fetch('/api/mercadolibre-accounts', { headers: { Authorization: `Bearer ${session.access_token}` } });
    const body = await response.json();
    if (response.ok) setStatus(body);
    else setMessage(body.error || 'No se pudo consultar Mercado Libre.');
  }

  useEffect(() => { load(); }, [session?.access_token]);

  async function connect(accountKey) {
    setWorking(accountKey);
    setMessage('Preparando autorización segura…');
    const response = await fetch('/api/mercadolibre-connect', {
      method: 'POST',
      headers: { Authorization: `Bearer ${session.access_token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ accountKey }),
    });
    const body = await response.json();
    if (response.ok) window.location.assign(body.authorizationUrl);
    else { setMessage(body.error || 'No se pudo iniciar la conexión.'); setWorking(''); }
  }

  async function sync(accountKey) {
    setWorking(accountKey);
    setMessage('Sincronizando publicaciones en modo lectura…');
    const response = await fetch('/api/mercadolibre-sync', {
      method: 'POST',
      headers: { Authorization: `Bearer ${session.access_token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ accountKey }),
    });
    const body = await response.json();
    setMessage(response.ok ? `${body.items} publicaciones sincronizadas.` : body.error || 'No se pudo sincronizar.');
    setWorking('');
    if (response.ok) await load();
  }

  return (
    <div className="content-stack">
      <section className="panel">
        <div className="panel-head">
          <div><span className="eyebrow">Canal oficial</span><h2>Mercado Libre</h2></div>
          <ShoppingBag size={23} />
        </div>
        <p className="section-copy">Una sola integración, con POLIPLAST y FOAM completamente separadas. Esta primera etapa solamente consulta y guarda información: no cambia publicaciones, precios ni stock.</p>
        {!status.configured && <div className="quality-note"><p>La base está preparada. Falta configurar la aplicación de Mercado Libre para habilitar las conexiones.</p></div>}
        <div className="meli-account-grid">
          {EXPECTED.map((expected) => {
            const account = status.accounts.find((item) => item.account_key === expected.key);
            return (
              <article className="meli-account" key={expected.key}>
                <div><strong>{expected.label}</strong><span>{account ? `${account.nickname} · Seller ${account.seller_id}` : 'Pendiente de conectar'}</span></div>
                <span className={`channel-pill ${account?.status === 'connected' ? 'online' : 'waiting'}`}>{account?.status === 'connected' ? 'Conectada' : account?.status === 'reauthorization_required' ? 'Reautorizar' : 'Pendiente'}</span>
                <p>Última sincronización: {friendlyDate(account?.last_synced_at)}</p>
                <div className="meli-actions">
                  <button className="secondary" disabled={Boolean(working)} onClick={() => connect(expected.key)}><ExternalLink size={16} />{account ? 'Reautorizar' : 'Conectar'}</button>
                  {account && <button className="primary" disabled={Boolean(working)} onClick={() => sync(expected.key)}><RefreshCw size={16} />Sincronizar</button>}
                </div>
              </article>
            );
          })}
        </div>
        {message && <div className="system-message">{message}</div>}
      </section>
    </div>
  );
}

