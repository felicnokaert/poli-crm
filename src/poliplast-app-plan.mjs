// Poliplast App (rama de prueba, 25/11): menú por grupos, roles como conjuntos de módulos y los módulos que todavía
// no existen (Logística y Administración) mostrados como «próximamente» con sus submódulos.
// Ver docs/PLAN_POLIPLAST_APP.md. Nada de esto toca datos: es cómo se vería.

// Submódulos de cada módulo (los que ya existen como pestañas y los nuevos).
export const SUBMODULES = {
  dashboard: ['Panel personal (tarjetas que cada uno ordena)'],
  sales: ['Ventas', 'Historial en gráficos', 'Piso de comisión'],
  quoter: ['Cotizar', 'Historial de cotizaciones', 'Plantillas'],
  prospecting: ['Cola del día', 'Prospectos', 'Orden de llamada', 'Limpieza', 'Respuestas rápidas', 'Bandeja de salida', 'Reglas', 'No contactar'],
  clients: ['Empresas', 'Contactos'],
  map: ['Ventas', 'Prospectos', 'Aplicadores (RAPYP)'],
  mercadolibre: ['Resumen', 'Publicaciones', 'Mercado (competencia y tendencias)', 'Dinero (stock, ganancia y publicidad)'],
  shopify: ['Resumen', 'Qué mejorar', 'Productos', 'Precios vs ML', 'Faltan en Shopify', 'Operación', 'Ordenar catálogo'],
  productos: ['Por SKU: cotizador, ML y Shopify'],
  mejoras: ['Qué atender hoy', 'Lista de mejoras'],
  entregas: ['Pedidos', 'Expedición hoy', 'Calendario', 'Tablero del depósito'],
  etiquetas: ['Escaneo', 'Pendientes', 'Devoluciones', 'Cortes'],
  conteo: ['Conteo de stock', 'Diferencias', 'Historial'],
  dosificado: ['Pedidos a dosificar', 'Fórmulas', 'Historial'],
  recibos: ['Cargar recibo', 'Recibos del día', 'Cobranzas por cliente'],
  facturacion: ['Comprobantes (Contabilium)', 'Saldos', 'Notas de crédito'],
  compras: ['Qué se termina', 'Proveedores sugeridos', 'Pedidos y negociación'],
  tasks: ['Tareas', 'Rutina / Cierre del día', 'Calendario', 'Automatizaciones'],
  academy: ['Productos', 'Práctica', 'Competencia', 'Equipo'],
  techdocs: ['Documentos', 'Qué productos tienen ficha', 'Catálogo ↔ Mercado Libre'],
  profile: ['Mis datos', 'Contraseña'],
  settings: ['Equipo y cuentas (roles y permisos)', 'Conexiones', 'Datos'],
};

// Módulos que todavía no existen dentro de la app: se muestran como «próximamente».
export const FUTURE_MODULES = {
  etiquetas: {
    label: 'Etiquetas',
    status: 'Hoy está en la app de conteo',
    text: 'Control de etiquetas de Mercado Libre: se escanea cada etiqueta al preparar, avisa si se repite o si el envío se canceló, y muestra lo pendiente por corte (8, 10 y 12).',
  },
  conteo: {
    label: 'Conteo',
    status: 'Hoy está en la app de conteo',
    text: 'Conteo de stock del depósito con el celular, diferencias contra lo esperado e historial de cada conteo.',
  },
  dosificado: {
    label: 'Dosificado',
    status: 'Hoy está en la app de conteo',
    text: 'Poliol e isocianato fraccionados por kilo: qué hay que dosificar, con qué fórmula y quién lo hizo.',
  },
  recibos: {
    label: 'Recibos',
    status: 'En armado (Poli-Recibos)',
    text: 'Cargar los recibos de cobranza desde el celular, verlos por día y por cliente.',
  },
  facturacion: {
    label: 'Facturación',
    status: 'Futuro',
    text: 'Los comprobantes de Contabilium (que hoy ya se copian para la ficha del cliente) en una pantalla propia: saldos, notas de crédito y facturas por empresa.',
  },
  compras: {
    label: 'Compras',
    status: 'Futuro',
    text: 'A partir del consumo de Contabilium y Mercado Libre: qué se está por terminar, quién lo vende, proveedores sugeridos y negociación por mail o WhatsApp siempre con aprobación de una persona.',
  },
};

// Roles = conjuntos de módulos (después se ajusta por persona en Equipo y cuentas). Perfil y Datos siempre.
const ALL = null;
export const ROLES = [
  { id: 'admin', label: 'Administrador', modules: ALL },
  {
    id: 'comercial', label: 'Comercial',
    modules: ['dashboard', 'sales', 'quoter', 'prospecting', 'clients', 'map', 'mercadolibre', 'shopify', 'productos', 'mejoras', 'entregas', 'tasks', 'academy', 'techdocs', 'settings'],
  },
  {
    id: 'deposito', label: 'Jefe de depósito',
    modules: ['dashboard', 'entregas', 'etiquetas', 'conteo', 'dosificado', 'tasks', 'techdocs', 'settings'],
  },
  {
    id: 'expedicion', label: 'Expedición',
    modules: ['dashboard', 'entregas', 'etiquetas', 'conteo', 'dosificado'],
  },
  {
    id: 'administrativo', label: 'Administrativo',
    modules: ['dashboard', 'clients', 'recibos', 'facturacion', 'compras', 'entregas', 'tasks', 'settings'],
  },
];

// Perfil siempre; Datos/Configuración no lo ve expedición (cuenta compartida).
export const ALWAYS = ['profile'];

export function roleAllows(roleId, moduleId) {
  const role = ROLES.find((item) => item.id === roleId);
  if (!role || role.modules === ALL) return true;
  return ALWAYS.includes(moduleId) || role.modules.includes(moduleId);
}

// Filtra los grupos del menú ([nombre, items]) según el rol que se está mirando; saca los grupos vacíos.
export function navForRole(groups, roleId) {
  return groups
    .map(([name, items]) => [name, items.filter(([id]) => roleAllows(roleId, id))])
    .filter(([, items]) => items.length > 0);
}

export const PREVIEW_ROLE_KEY = 'poliplast-app-preview-role';
