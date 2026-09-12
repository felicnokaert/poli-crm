import { MessageCircle } from "lucide-react";

export function Goal({ title, text }) {
  return (
    <div>
      <strong>{title}</strong>
      <p>{text}</p>
    </div>
  );
}

export function Empty({ text }) {
  return (
    <div className="empty">
      <MessageCircle size={24} />
      <p>{text}</p>
    </div>
  );
}

export function Fact({ label, value }) {
  return (
    <div>
      <span>{label}</span>
      <strong>{value || "A confirmar"}</strong>
    </div>
  );
}

export function Splash({ text }) {
  return (
    <div className="login-shell">
      <section className="login-card">
        <div className="brand-mark">P</div>
        <h1>Poliplast Sales Copilot</h1>
        <p>{text}</p>
      </section>
    </div>
  );
}
