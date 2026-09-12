import { useState } from "react";
import { supabase } from "./online";

const SIGNUP_DOMAIN = "@grupopoliplast.com.ar";

export function LoginScreen() {
  const [mode, setMode] = useState("signin"); // 'signin' | 'signup' | 'magic' | 'reset'
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");

  async function submitPassword(event) {
    event.preventDefault();
    if (mode === "signup" && !email.trim().toLocaleLowerCase().endsWith(SIGNUP_DOMAIN)) {
      setMessage(`Las cuentas nuevas se crean con un correo ${SIGNUP_DOMAIN}.`);
      return;
    }
    setMessage(mode === "signup" ? "Creando tu cuenta…" : "Ingresando…");
    const { error, data } =
      mode === "signup"
        ? await supabase.auth.signUp({
            email: email.trim(),
            password,
            options: { emailRedirectTo: window.location.origin },
          })
        : await supabase.auth.signInWithPassword({
            email: email.trim(),
            password,
          });
    if (error) {
      setMessage(
        error.message === "Invalid login credentials"
          ? "Correo o contraseña incorrectos."
          : error.message,
      );
      return;
    }
    setMessage(
      mode === "signup" && !data.session
        ? "Cuenta creada. Revisá tu correo para confirmarla y después ingresá."
        : "",
    );
  }

  async function submitReset(event) {
    event.preventDefault();
    setMessage("Enviando enlace…");
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: window.location.origin,
    });
    setMessage(
      error
        ? error.message
        : "Si ese correo tiene una cuenta, te llegó un enlace para elegir una contraseña nueva.",
    );
  }

  async function submitMagicLink(event) {
    event.preventDefault();
    setMessage("Enviando acceso…");
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: window.location.origin, shouldCreateUser: false },
    });
    setMessage(
      error
        ? "No se pudo enviar el acceso. Verificá que el usuario esté habilitado."
        : "Revisá tu correo y abrí el enlace de acceso.",
    );
  }

  return (
    <div className="login-shell">
      <section className="login-card">
        <img
          className="login-logo"
          src="/poliplast-logo.png"
          alt="Grupo Poliplast"
        />
        <span className="eyebrow">Acceso privado</span>
        <h1>Poliplast Sales Copilot</h1>
        <p>
          {mode === "signup"
            ? `Creá tu cuenta con un correo ${SIGNUP_DOMAIN} — cada usuario tiene su propio espacio de trabajo.`
            : mode === "magic"
              ? "Ingresá con el correo habilitado. No necesitás recordar una contraseña."
              : mode === "reset"
                ? "Ingresá tu correo y te mandamos un enlace para elegir una contraseña nueva."
                : "Ingresá con tu correo y contraseña."}
        </p>
        {mode === "reset" ? (
          <form onSubmit={submitReset}>
            <label>
              Correo
              <input
                type="email"
                required
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="nombre@grupopoliplast.com.ar"
              />
            </label>
            <button className="primary" type="submit">
              Enviar enlace
            </button>
          </form>
        ) : mode === "magic" ? (
          <form onSubmit={submitMagicLink}>
            <label>
              Correo
              <input
                type="email"
                required
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="nombre@empresa.com"
              />
            </label>
            <button className="primary" type="submit">
              Enviar enlace de acceso
            </button>
          </form>
        ) : (
          <form onSubmit={submitPassword}>
            <label>
              Correo
              <input
                type="email"
                required
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="nombre@grupopoliplast.com.ar"
              />
            </label>
            <label>
              Contraseña
              <input
                type="password"
                required
                minLength={6}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="••••••••"
              />
            </label>
            <button className="primary" type="submit">
              {mode === "signup" ? "Crear cuenta" : "Ingresar"}
            </button>
          </form>
        )}
        {message && <div className="system-message">{message}</div>}
        <div className="login-switch">
          {mode !== "signin" && (
            <button type="button" className="link-button" onClick={() => { setMode("signin"); setMessage(""); }}>
              Ya tengo cuenta
            </button>
          )}
          {mode !== "signup" && (
            <button type="button" className="link-button" onClick={() => { setMode("signup"); setMessage(""); }}>
              Crear cuenta nueva
            </button>
          )}
          {mode === "signin" && (
            <button type="button" className="link-button" onClick={() => { setMode("reset"); setMessage(""); }}>
              Olvidé mi contraseña
            </button>
          )}
          {mode !== "magic" && (
            <button type="button" className="link-button" onClick={() => { setMode("magic"); setMessage(""); }}>
              Prefiero un enlace por correo
            </button>
          )}
        </div>
        <div className="login-legal">
          <a href="/privacidad.html">Privacidad</a>
          <a href="/terminos.html">Términos</a>
          <a href="/eliminacion-datos.html">Eliminación de datos</a>
        </div>
      </section>
    </div>
  );
}
