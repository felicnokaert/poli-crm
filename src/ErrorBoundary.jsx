import { Component } from "react";
import { reportClientError } from "./error-report.mjs";

// Red de seguridad para errores de pantalla (16/10). Antes, un error en cualquier pantalla dejaba toda
// la app en blanco (pasó con "Limpiar" y "Borrar usuario"). Ahora falla solo esa parte, se avisa y se
// puede reintentar; los datos no se tocan.
export class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error("Error de pantalla", error, info?.componentStack);
    reportClientError(error, { view: this.props.view || (this.props.full ? "app" : "") });
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    const full = this.props.full;
    return (
      <section className={`panel error-boundary${full ? " error-boundary-full" : ""}`} role="alert">
        <h2>{full ? "Algo falló en el CRM" : "Algo falló en esta pantalla"}</h2>
        <p>No se perdió nada: tus datos siguen guardados. {full ? "Recargá la página." : "Probá de nuevo, o andá a otra sección desde el menú."}</p>
        <p className="muted small">Si se repite, pasale este detalle a Felipe: {String(error?.message || error).slice(0, 200)}</p>
        <div className="panel-head-actions">
          {!full && <button type="button" className="secondary" onClick={() => this.setState({ error: null })}>Reintentar</button>}
          <button type="button" className="primary" onClick={() => window.location.reload()}>Recargar la página</button>
        </div>
      </section>
    );
  }
}
