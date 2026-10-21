// Logo del asistente (elegido por Felipe el 21/10, propuesta "Anillo con chispa"): el anillo del isologo
// de Poliplast con una chispa de IA en lugar de la P. Mismo dibujo en public/asistente-logo.svg.
const SPARK = "M20 0 C21.6 13 27 18.4 40 20 C27 21.6 21.6 27 20 40 C18.4 27 13 21.6 0 20 C13 18.4 18.4 13 20 0 Z";

export function AssistantLogo({ size = 40, title = "" }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" role={title ? "img" : undefined} aria-label={title || undefined} aria-hidden={title ? undefined : true}>
      <path d="M94.3 42.2 A45 45 0 1 0 95 50 L78 50" fill="none" stroke="#ed1c24" strokeWidth="6.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M14.5 43.7 A36 36 0 0 1 85.5 43.7" fill="none" stroke="#bcbec0" strokeWidth="3.6" strokeLinecap="round" />
      <path d="M14.5 56.3 A36 36 0 0 0 85.5 56.3" fill="none" stroke="#bcbec0" strokeWidth="3.6" strokeLinecap="round" />
      <path d={SPARK} fill="#ed1c24" transform="translate(31 31) scale(0.95)" />
      <path d={SPARK} fill="#bcbec0" transform="translate(59 26) scale(0.275)" />
    </svg>
  );
}
