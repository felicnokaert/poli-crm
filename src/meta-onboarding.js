const META_APP_ID = '857121580457426';
const META_CONFIG_ID = '2120012742251272';

let sdkPromise;

function loadMetaSdk() {
  if (window.FB) return Promise.resolve(window.FB);
  if (sdkPromise) return sdkPromise;
  sdkPromise = new Promise((resolve, reject) => {
    window.fbAsyncInit = () => {
      window.FB.init({ appId: META_APP_ID, cookie: true, xfbml: false, version: 'v23.0' });
      resolve(window.FB);
    };
    const script = document.createElement('script');
    script.src = 'https://connect.facebook.net/es_LA/sdk.js';
    script.async = true;
    script.defer = true;
    script.onerror = () => reject(new Error('No se pudo cargar Meta.'));
    document.head.appendChild(script);
  });
  return sdkPromise;
}

export async function connectWhatsApp(session) {
  const FB = await loadMetaSdk();
  let onboarding = {};
  const listener = (event) => {
    if (!['https://www.facebook.com', 'https://web.facebook.com'].includes(event.origin)) return;
    try {
      const payload = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;
      if (payload?.type === 'WA_EMBEDDED_SIGNUP' && payload.event === 'FINISH') onboarding = payload.data || {};
    } catch {
      // Meta also emits non-JSON messages; they are intentionally ignored.
    }
  };
  window.addEventListener('message', listener);
  try {
    const auth = await new Promise((resolve) => {
      FB.login(resolve, {
        config_id: META_CONFIG_ID,
        response_type: 'code',
        override_default_response_type: true,
        extras: {
          featureType: 'whatsapp_business_app_onboarding',
          sessionInfoVersion: '3',
        },
      });
    });
    if (!auth?.authResponse?.code) throw new Error('Meta no devolvió autorización.');
    const response = await fetch('/api/meta-onboarding', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify({ code: auth.authResponse.code, onboarding }),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'No se pudo completar la conexión.');
    return result;
  } finally {
    window.removeEventListener('message', listener);
  }
}
