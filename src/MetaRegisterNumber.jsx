import { useState } from "react";

// 10/11: devolver el número General a la API de WhatsApp (el CRM vuelve a recibir en Por revisar).
// Pasos: pedir código → poner el código → elegir PIN de 6 números. Solo administradores.
export default function MetaRegisterNumber({ session }) {
  const [step, setStep] = useState(0); // 0 inicio, 1 esperando código, 2 pedir PIN, 3 listo
  const [code, setCode] = useState("");
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function send(body) {
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/meta-subscribe", {
        method: "POST",
        headers: { Authorization: `Bearer ${session.access_token}`, "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "Meta no aceptó el paso.");
      return payload;
    } catch (error) {
      setMessage(error.message || "No se pudo hacer este paso.");
      return null;
    } finally {
      setBusy(false);
    }
  }

  async function askCode(method) {
    if (step === 0 && !window.confirm("Al devolver el número a la API, la aplicación de WhatsApp Business y WhatsApp Web dejan de funcionar con ese número. ¿Seguro?")) return;
    const result = await send({ action: "phone-code", method });
    if (result) { setStep(1); setMessage(method === "VOICE" ? "Te van a llamar al número para dictarte el código." : "Te mandaron un SMS con el código al número."); }
  }

  async function verify() {
    const result = await send({ action: "phone-verify", code });
    if (result) { setStep(2); setMessage("Código correcto. Ahora elegí un PIN de 6 números (anotalo)."); }
  }

  async function register() {
    const result = await send({ action: "phone-register", pin });
    if (result) {
      setStep(3);
      setMessage(result.subscribed === false ? `Número registrado, pero la suscripción falló: ${result.subscribeError}. Tocá «Reparar recepción de mensajes».` : "Listo: el número volvió a la API. Mandá un mensaje de prueba desde otro celular y mirá Por revisar.");
    }
  }

  return (
    <div className="panel" style={{ marginTop: 12 }}>
      <strong>Volver a registrar el número General en la API</strong>
      <p className="muted small">Hacelo si el diagnóstico dice <code>ON_PREMISE</code>: el número está en la aplicación y el CRM no recibe mensajes. Necesitás poder recibir el código por SMS o llamada en ese número.</p>
      {step === 0 && (
        <p>
          <button type="button" className="secondary" disabled={busy} onClick={() => askCode("SMS")}>1. Pedir código por SMS</button>{" "}
          <button type="button" className="secondary" disabled={busy} onClick={() => askCode("VOICE")}>o por llamada</button>
        </p>
      )}
      {step === 1 && (
        <p>
          <input value={code} onChange={(event) => setCode(event.target.value)} placeholder="Código de 6 números" inputMode="numeric" aria-label="Código de verificación" />{" "}
          <button type="button" className="primary" disabled={busy || !code} onClick={verify}>2. Verificar</button>{" "}
          <button type="button" className="secondary" disabled={busy} onClick={() => askCode("SMS")}>Pedir otro código</button>
        </p>
      )}
      {step === 2 && (
        <p>
          <input value={pin} onChange={(event) => setPin(event.target.value.replace(/\D/g, "").slice(0, 6))} placeholder="PIN de 6 números" inputMode="numeric" aria-label="PIN de 6 números" />{" "}
          <button type="button" className="primary" disabled={busy || pin.length !== 6} onClick={register}>3. Registrar</button>
        </p>
      )}
      {message && <p className="muted small">{message}</p>}
    </div>
  );
}
