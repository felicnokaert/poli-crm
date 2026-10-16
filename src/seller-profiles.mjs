// Fichas de los vendedores: cómo trabaja cada uno y qué asistencia le damos.
// Borrador armado con lo que contó Felipe (16/10/2026): cada persona lo corrige y lo completa.
export const SELLER_PROFILES_META = {
  status: 'Borrador',
  note: 'Armado con lo que contó Felipe. Cada persona tiene que corregirlo y completarlo con su forma real de trabajar.',
};

export const SELLER_PROFILES = [
  {
    id: 'yuliani',
    name: 'Yuliani',
    role: 'Jefa de ventas',
    area: 'Apoya a Brenda y coordina al equipo comercial.',
    receives: 'Consultas derivadas y casos que necesitan una decisión comercial.',
    risk: 'Que todo pase por ella y se convierta en cuello de botella.',
    assist: [
      'Cierre del día: qué quedó sin hacer y qué se postergó, para repartir mejor.',
      'Búsqueda global (Ctrl+K) para encontrar al instante empresas, tareas y prospectos.',
      'Directorio de empresas compartido, para derivar sin buscar.',
    ],
    habit: 'Cada mañana, revisar Cuentas activas y el Cierre del día del equipo.',
  },
  {
    id: 'brenda',
    name: 'Brenda',
    role: 'Poliplast y e-commerce',
    area: 'Consultas generales y las que llegan desde las tiendas online.',
    receives: 'Consultas de tiendas online, mayormente de público general.',
    risk: 'Casi no prospecta ni hace posventa: las consultas se enfrían sin seguimiento y se pierden ventas grandes.',
    assist: [
      'Respuestas tipo en Academia (Biblioteca y práctica) para contestar rápido y con el mismo tono.',
      'Tareas con fecha de seguimiento: cada consulta sin respuesta queda recordada.',
      'Rutina de posventa: preguntar a los 7 días cómo les fue con el producto.',
    ],
    habit: 'Antes de cerrar el día, retomar al menos 3 conversaciones que quedaron sin respuesta.',
  },
  {
    id: 'ezequiel',
    name: 'Ezequiel',
    role: 'Resinplast e Imperpur',
    area: 'Resinas, fibra de vidrio e impermeabilización.',
    receives: 'Consultas técnicas y de precio de sus dos marcas.',
    risk: 'Igual que Brenda: poco seguimiento, y cada cotización sin respuesta es una venta que se escapa.',
    assist: [
      'Buscador de la Academia: productos, fichas técnicas y usos de Resinplast e Imperpur en un solo lugar.',
      'Respuestas tipo con datos a validar antes de enviar (precio, ficha, stock).',
      'Radar de cotizaciones frías en Inicio, para no dejar escapar presupuestos sin respuesta.',
    ],
    habit: 'Toda cotización enviada queda con una fecha de seguimiento a 3 días.',
  },
  {
    id: 'juan',
    name: 'Juan',
    role: 'Gerente general y de operaciones',
    area: 'Máquinas, sistemas de poliuretano y repuestos; además mira todo el negocio.',
    receives: 'Consultas de máquinas, repuestos y proyectado, más lo que se deriva de arriba.',
    risk: 'Sabe todo y vende, pero opera sobre muchas cosas a la vez: lo comercial puede quedar relegado.',
    assist: [
      'Competencia en Academia: cómo hablar frente a Satch, Spinna o Integral cuando preguntan "¿por qué ustedes?".',
      'Mapa de aplicadores para ver dónde hay cobertura y dónde falta.',
      'Cierre del día para ver de un vistazo qué quedó pendiente.',
    ],
    habit: 'Una revisión corta al día de Cuentas activas: solo lo que lleva más de 3 días sin movimiento.',
  },
  {
    id: 'david',
    name: 'David',
    role: 'Dueño',
    area: 'Máquinas, sistemas de poliuretano y repuestos.',
    receives: 'Lo que decide derivar; la idea es que delegue más y se ocupe menos del día a día.',
    risk: 'Que las consultas le lleguen directo y se acumulen sin pasar por el reparto.',
    assist: [
      'Directorio compartido y Cuentas activas para ver el estado sin entrar en cada chat.',
      'Cierre del día para revisar lo pendiente en un minuto y delegar lo demás.',
    ],
    habit: 'Derivar apenas llega la consulta y volver a mirar solo lo que sigue sin respuesta.',
  },
];

export function sellerByName(name = '') {
  const first = String(name).trim().toLowerCase().split(/\s+/)[0];
  return SELLER_PROFILES.find((profile) => profile.id === first) || null;
}
