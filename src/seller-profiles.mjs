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
      'Vista "Para seguimiento": conversaciones respondidas sin novedades de 3 a 14 días.',
      'Consultas con más de 24 h de espera, marcadas en rojo.',
      'Carga por persona en la Bandeja del equipo para repartir mejor.',
    ],
    habit: 'Revisar cada mañana las consultas en rojo y repartir las que no tienen dueño.',
  },
  {
    id: 'brenda',
    name: 'Brenda',
    role: 'Poliplast y e-commerce',
    area: 'Consultas generales y las que llegan desde las tiendas online.',
    receives: 'Consultas de tiendas online, mayormente de público general.',
    risk: 'Casi no prospecta ni hace posventa: las consultas se enfrían sin seguimiento y se pierden ventas grandes.',
    assist: [
      'Respuesta sugerida en la Bandeja para contestar rápido y con el mismo tono.',
      'Vista "Para seguimiento" para retomar a quien no volvió a escribir.',
      'Rutina de posventa: preguntar a los 7 días cómo les fue con el producto.',
    ],
    habit: 'Antes de cerrar el día, pasar por "Para seguimiento" y retomar al menos 3 conversaciones.',
  },
  {
    id: 'ezequiel',
    name: 'Ezequiel',
    role: 'Resinplast e Imperpur',
    area: 'Resinas, fibra de vidrio e impermeabilización.',
    receives: 'Consultas técnicas y de precio de sus dos marcas.',
    risk: 'Igual que Brenda: poco seguimiento, y cada cotización sin respuesta es una venta que se escapa.',
    assist: [
      'Reparto automático de lo que menciona Resinplast, Imperpur, fibra de vidrio o gel coat.',
      'Respuesta sugerida con datos a validar antes de enviar (precio, ficha, stock).',
      'Recordatorio de seguimiento a cotizaciones sin respuesta.',
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
      'Reparto automático de máquina, repuesto, Purmac, proyectar e inyección.',
      'Batalla de competencia (Academia) para responder cuando preguntan "¿por qué ustedes?".',
      'Resumen de carga por persona para decidir qué delegar.',
    ],
    habit: 'Una revisión corta al día de la Bandeja: solo lo que está en rojo.',
  },
  {
    id: 'david',
    name: 'David',
    role: 'Dueño',
    area: 'Máquinas, sistemas de poliuretano y repuestos.',
    receives: 'Lo que decide derivar; la idea es que delegue más y se ocupe menos del día a día.',
    risk: 'Que las consultas le lleguen directo y se acumulen sin pasar por el reparto.',
    assist: [
      'Derivar desde la Bandeja a quien corresponda, con una nota.',
      'Vista de carga y de espera para ver el estado sin entrar en cada chat.',
    ],
    habit: 'Derivar apenas llega la consulta y volver a mirar solo lo que está en rojo.',
  },
];

export function sellerByName(name = '') {
  const first = String(name).trim().toLowerCase().split(/\s+/)[0];
  return SELLER_PROFILES.find((profile) => profile.id === first) || null;
}
