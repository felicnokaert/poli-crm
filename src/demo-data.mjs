// Poliplast App (prueba, 25/11): datos INVENTADOS para el link de prueba. Ninguno es real (empresas, personas,
// teléfonos y montos salen de listas y números al azar). Solo se cargan en el modo de prueba, nunca en la app real.
import { arToday } from './ar-date.mjs';

const addDays = (day, days) => new Date(Date.parse(`${day}T12:00:00Z`) + days * 86400000).toISOString().slice(0, 10);

// Números al azar pero siempre los mismos (así la prueba se ve igual cada vez).
export function seeded(seed = 7) {
  let value = seed >>> 0;
  return () => {
    value = (value * 1664525 + 1013904223) >>> 0;
    return value / 4294967296;
  };
}

const pick = (rand, list) => list[Math.floor(rand() * list.length)];
const between = (rand, min, max) => Math.round(min + rand() * (max - min));

const FIRST = ['Martín', 'Lucía', 'Diego', 'Carla', 'Pablo', 'Sofía', 'Hernán', 'Valeria', 'Gustavo', 'Paula', 'Nicolás', 'Florencia', 'Ramiro', 'Julieta', 'Sergio'];
const LAST = ['Gómez', 'Fernández', 'López', 'Martínez', 'Pereyra', 'Sosa', 'Romero', 'Acosta', 'Benítez', 'Medina', 'Herrera', 'Ruiz', 'Castro', 'Ojeda'];
const KIND = ['Aislaciones', 'Impermeabilizaciones', 'Náutica', 'Carpintería', 'Colchones', 'Refrigeración', 'Construcciones', 'Ferretería', 'Corralón', 'Talleres', 'Paneles', 'Fibra de vidrio'];
const NAME = ['del Sur', 'Patagonia', 'Litoral', 'Norte', 'Delta', 'Andina', 'Pampa', 'Atlántica', 'Central', 'del Plata', 'Río', 'Sierra'];
const CITIES = [['Quilmes', 'Buenos Aires'], ['La Plata', 'Buenos Aires'], ['Mar del Plata', 'Buenos Aires'], ['Rosario', 'Santa Fe'], ['Córdoba', 'Córdoba'], ['Mendoza', 'Mendoza'], ['Neuquén', 'Neuquén'], ['Paraná', 'Entre Ríos'], ['Tucumán', 'Tucumán'], ['Bahía Blanca', 'Buenos Aires'], ['CABA', 'CABA'], ['Avellaneda', 'Buenos Aires']];
const FAMILIES = ['Poliuretano', 'Poliurea', 'Penosil', 'Carrozados', 'Resinplast', 'Baldes', 'PURMAC', 'EPP'];
const STAGES = ['Preparación', 'Apertura', 'Diagnóstico', 'Propuesta', 'Negociación', 'Posventa', 'Seguimiento'];
const TEMPS = ['Frío', 'Tibio', 'Caliente'];
const PRODUCTS = [
  ['618-SP', 'Poliol 618-SP x 220 kg'], ['ISO-250', 'Isocianato x 250 kg'], ['RE-608-1.5', 'Resina poliéster 608 x 1,5 kg'],
  ['EASYSPRAY-1', 'Easyspray x 1'], ['PU-46', 'Espuma PU-46 750 ml'], ['BL-10L-AZ', 'Balde plástico 10 L azul'],
  ['KR-IMP-15', 'Imprimación GC 15 kg'], ['3M-6200', 'Semimáscara 3M 6200'], ['PM-595', 'Máquina PM-595'], ['FV-450', 'Manta fibra de vidrio 450 g'],
];
export const DEMO_SELLERS = ['Brenda', 'Ezequiel', 'Juan', 'Yuliani', 'Felipe'];
const OPERATORS = ['Braian', 'Matías', 'Leandro', 'Diego'];

const phone = (rand) => `+54 9 11 ${between(rand, 2000, 6999)}-${between(rand, 1000, 9999)}`;
const company = (rand) => `${pick(rand, KIND)} ${pick(rand, NAME)}${rand() < 0.4 ? ' SRL' : ''}`;

// El espacio de trabajo de prueba: clientes, tareas, ventas, prospectos y conversaciones.
export function demoWorkspace(seed = 11, today = arToday()) {
  const rand = seeded(seed);
  const used = new Set();
  const clients = [];
  for (let index = 0; clients.length < 36 && index < 200; index += 1) {
    const name = company(rand);
    if (used.has(name)) continue;
    used.add(name);
    const [city, province] = pick(rand, CITIES);
    const contact = `${pick(rand, FIRST)} ${pick(rand, LAST)}`;
    const id = `demo-c${clients.length + 1}`;
    clients.push({
      id, company: name, contact, phone: phone(rand), email: `${contact.split(' ')[0].toLowerCase()}@${name.split(' ')[0].toLowerCase()}.com.ar`,
      family: pick(rand, FAMILIES), stage: pick(rand, STAGES), temperature: pick(rand, TEMPS), city, province,
      lastPurchase: rand() < 0.7 ? addDays(today, -between(rand, 3, 300)) : '', nextAction: pick(rand, ['Llamar', 'Pasar precio', 'Visitar', 'Mandar ficha técnica']),
      nextDate: addDays(today, between(rand, -5, 12)), notes: 'Dato de prueba (inventado).', source: 'Prueba', pipelineActive: rand() < 0.6,
      createdAt: `${addDays(today, -between(rand, 30, 400))}T12:00:00.000Z`, updatedAt: `${today}T12:00:00.000Z`,
    });
  }
  const tasks = Array.from({ length: 16 }, (_, index) => {
    const client = pick(rand, clients);
    const due = addDays(today, between(rand, -4, 10));
    return {
      id: `demo-t${index + 1}`, clientId: client.id, company: client.company,
      title: `${pick(rand, ['Llamar a', 'Pasar precio a', 'Seguimiento de cotización:', 'Visitar a', 'Mandar ficha a'])} ${client.contact}`,
      dueDate: due, priority: pick(rand, ['Alta', 'Media', 'Media', 'Baja']), cadence: 'Seguimiento', trigger: '', done: index % 5 === 4,
      source: 'prueba', createdAt: `${today}T10:00:00.000Z`, updatedAt: `${today}T10:00:00.000Z`,
    };
  });
  const sales = Array.from({ length: 60 }, (_, index) => {
    const client = pick(rand, clients);
    return {
      id: `demo-s${index + 1}`, date: addDays(today, -between(rand, 0, 330)), unit: pick(rand, ['Poliplast', 'Resinplast', 'Imperpur']),
      documentType: 'Factura', pointOfSale: '0006', documentNumber: String(11000 + index).padStart(8, '0'), customer: client.company, clientId: client.id,
      family: client.family, netAmount: String(between(rand, 80, 4200) * 1000), currency: 'ARS', exchangeRate: '', notes: 'Venta inventada', collected: rand() < 0.7,
      seller: pick(rand, DEMO_SELLERS),
    };
  });
  const prospects = Array.from({ length: 28 }, (_, index) => {
    const [city, province] = pick(rand, CITIES);
    return {
      id: `demo-p${index + 1}`, name: company(rand), family: pick(rand, FAMILIES), city, province, phone: phone(rand),
      status: pick(rand, ['Sin contactar', 'Sin contactar', 'Contactado', 'Con interés']), source: 'Prueba', createdAt: `${today}T09:00:00.000Z`, updatedAt: `${today}T09:00:00.000Z`,
    };
  });
  const interactions = Array.from({ length: 14 }, (_, index) => {
    const client = pick(rand, clients);
    return {
      id: `demo-i${index + 1}`, clientId: client.id, company: client.company, contact: client.contact, channel: 'general', family: client.family,
      intent: pick(rand, ['Precio / cotización', 'Consulta técnica', 'Compra', 'Recompra']), summary: 'Conversación inventada para la prueba.',
      temperature: pick(rand, TEMPS), stage: pick(rand, STAGES), outcome: 'Abierto', nextAction: 'Seguimiento', nextDate: addDays(today, between(rand, 0, 7)),
      date: addDays(today, -between(rand, 0, 6)), createdAt: `${addDays(today, -between(rand, 0, 6))}T15:00:00.000Z`,
    };
  });
  return { clients, tasks, sales, prospects, interactions, profileName: 'Felipe (prueba)', demo: true };
}

// Datos de los módulos que todavía no existen adentro de la app (Logística y Administración).
export function demoModules(seed = 23, today = arToday()) {
  const rand = seeded(seed);
  const accounts = ['POLIPLAST SRL', 'FOAMFACTORY', 'COMARG', 'PURMAC'];
  const etiquetas = Array.from({ length: 24 }, (_, index) => {
    const [sku, title] = pick(rand, PRODUCTS);
    const scanned = rand() < 0.55;
    return {
      id: String(48600000000 + between(rand, 100000, 999999)), account: pick(rand, accounts), sku, title, qty: between(rand, 1, 4),
      cut: pick(rand, ['8:00', '10:00', '12:00']), logistic: pick(rand, ['Colecta', 'Colecta', 'Flex']),
      status: index === 7 ? 'Cancelado' : scanned ? 'Preparado' : 'Pendiente', by: scanned ? pick(rand, OPERATORS) : '', at: scanned ? `${between(rand, 7, 11)}:${String(between(rand, 0, 59)).padStart(2, '0')}` : '',
      returned: index % 9 === 3,
    };
  });
  const conteo = PRODUCTS.map(([sku, title]) => {
    const expected = between(rand, 0, 120);
    const counted = rand() < 0.75 ? expected + (rand() < 0.3 ? between(rand, -6, 4) : 0) : null;
    return { sku, title, deposit: pick(rand, ['Villa Domínico', 'Mar del Plata']), expected, counted, by: counted === null ? '' : pick(rand, OPERATORS) };
  });
  const dosificado = Array.from({ length: 9 }, (_, index) => {
    const client = company(rand);
    return {
      id: `D-${1200 + index}`, client, formula: pick(rand, ['618-SP 100:110', '770-IR 100:110', 'Poliurea 1:1', 'Resina 608 + catalizador']),
      kg: between(rand, 5, 60), due: addDays(today, between(rand, 0, 4)), status: pick(rand, ['Para dosificar', 'Para dosificar', 'Dosificado', 'Entregado']),
      by: rand() < 0.5 ? pick(rand, OPERATORS) : '',
    };
  });
  const recibos = Array.from({ length: 18 }, (_, index) => ({
    id: `R-${String(3400 + index).padStart(6, '0')}`, date: addDays(today, -between(rand, 0, 20)), client: company(rand),
    amount: between(rand, 50, 2500) * 1000, method: pick(rand, ['Transferencia', 'Efectivo', 'Cheque', 'Echeq']), by: pick(rand, DEMO_SELLERS),
  }));
  const facturacion = Array.from({ length: 30 }, (_, index) => {
    const total = between(rand, 60, 5000) * 1000;
    const paid = rand() < 0.65 ? total : rand() < 0.5 ? Math.round(total / 2) : 0;
    return {
      id: `FCA 0006-${String(11400 + index).padStart(8, '0')}`, date: addDays(today, -between(rand, 0, 75)), company: pick(rand, ['POLIPLAST', 'COMARG', 'FOAMFACTORY']),
      client: company(rand), type: index % 11 === 5 ? 'Nota de crédito' : 'Factura', total, balance: total - paid,
    };
  });
  const compras = PRODUCTS.slice(0, 8).map(([sku, title]) => {
    const stock = between(rand, 0, 60);
    const perWeek = between(rand, 3, 25);
    return {
      sku, title, stock, perWeek, weeksLeft: perWeek ? Math.round((stock / perWeek) * 10) / 10 : null,
      supplier: pick(rand, ['Proveedor A (Brasil)', 'Proveedor B (China)', 'Distribuidor local C', 'Fabricante D']), lastPrice: between(rand, 4, 900),
    };
  });
  const entregas = Array.from({ length: 14 }, (_, index) => ({
    id: `P-${780 + index}`, remito: `0006-${String(6300 + index).padStart(8, '0')}`, client: company(rand),
    status: pick(rand, ['cargado', 'impreso', 'despachado', 'entregado', 'cargado']), deposit: pick(rand, ['Villa Domínico', 'Villa Domínico', 'Mar del Plata']),
    expreso: pick(rand, ['Retira el cliente', 'Expreso Rápido', 'Transporte Sur', 'Moto']), seller: pick(rand, DEMO_SELLERS), date: addDays(today, between(rand, -2, 3)),
  }));
  return { etiquetas, conteo, dosificado, recibos, facturacion, compras, entregas };
}

// El equipo de prueba para «Equipo y cuentas»: personas inventadas con su rol.
export function demoTeam() {
  return [
    { email: 'felipe@grupopoliplast.com.ar', name: 'Felipe', role: 'admin', registered: true },
    { email: 'brenda.prueba@grupopoliplast.com.ar', name: 'Brenda (prueba)', role: 'comercial', registered: true },
    { email: 'ezequiel.prueba@grupopoliplast.com.ar', name: 'Ezequiel (prueba)', role: 'comercial', registered: true },
    { email: 'diego.prueba@grupopoliplast.com.ar', name: 'Diego (prueba)', role: 'deposito', registered: true },
    { email: 'expedicion.prueba@grupopoliplast.com.ar', name: 'Expedición (prueba)', role: 'expedicion', registered: true },
    { email: 'administracion.prueba@grupopoliplast.com.ar', name: 'Administración (prueba)', role: 'administrativo', registered: false },
  ];
}
