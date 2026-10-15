// Guía de conversación frente a un competidor, armada solo con datos verificados de su ficha
// y con principios de venta de Academia: no hablar mal, no afirmar lo que no sabemos.
const FAMILY_LINES = {
  Penosil: 'selladores, espumas y adhesivos Penosil',
  Carrozados: 'poliuretano y fibra de vidrio para carrocerías',
  'Carrozados Imperpur': 'Imperpur',
  Planchas: 'planchas de poliuretano',
  Resinplast: 'resinas, gel coat y fibra de vidrio',
  PURMAC: 'equipos y repuestos Purmac y sistemas de poliuretano',
  Poliurea: 'poliurea',
  Poliuretano: 'sistemas de poliuretano',
  Química: 'químicos industriales',
};

const ASK_BY_KIND = {
  equipos: [
    '¿Qué máquina usan hoy y hace cuánto la tienen?',
    '¿Cómo les va con los repuestos y el servicio técnico?',
    '¿Qué le pedirían a su proveedor de equipos que hoy no les da?',
  ],
  default: [
    '¿Qué compran hoy y cada cuánto?',
    '¿Qué es lo que más valoran de su proveedor actual (plazo, calidad, atención, condiciones)?',
    '¿Qué le mejorarían, si pudieran?',
  ],
};

export function buildBattlecard(competitor = {}) {
  const families = (competitor.families || []).filter((name) => FAMILY_LINES[name]);
  const kind = competitor.kind === 'equipos' ? 'equipos' : 'default';
  const known = String(competitor.summary || '').trim();
  const unknown = [String(competitor.caveats || '').trim(), 'Precios, plazos y condiciones de pago: averiguarlos con el propio cliente, sin dar por cierto lo que no esté en la ficha.'].filter(Boolean);
  return {
    name: competitor.name || '',
    known,
    unknown,
    overlap: families.map((name) => `${name}: ${FAMILY_LINES[name]}`),
    ask: ASK_BY_KIND[kind],
    open: `Está muy bien que ya trabajes con ${competitor.name || 'tu proveedor actual'}. Si te parece, vemos qué necesitás y lo comparamos sin compromiso, para que tengas otra opción.`,
    avoid: [
      'No hables mal del competidor ni lo descalifiques.',
      'No afirmes precios, plazos ni características de ellos si no están en la ficha.',
      'No ofrezcas precio ni descuento antes de entender aplicación y volumen.',
    ],
  };
}
