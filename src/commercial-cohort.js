const SOURCE = 'BASE_COMERCIAL_IA_GRUPO_POLIPLAST · Seguimiento · 27/08/2026';

const rows = [
  ['Felipe','Carrozados','Automotores El Triángulo S.A. / AST-PRA','Alta','Placas PRFV, núcleos/plancha PU, adhesivos y herrajes para unidades térmicas.','https://www.ast-pra.com.ar/'],
  ['Felipe','Carrozados','Carrocería Argentina','Alta','Paquete carrocero: placas PRFV, plancha PU, Adheplast, herrajes y burletes.','https://carroceriaargentina.com.ar/'],
  ['Felipe','Carrozados','Ferref Refrigeración','Alta','PRFV, sistema PU, adhesivos, herrajes y accesorios de panel.','https://ferrefrefrigeracion.com.ar/furgones'],
  ['Felipe','Carrozados','La Carrocera S.R.L.','Alta','Placas PRFV, plancha/sistema PU, cierres, burletes y adhesivos.','https://lacarrocera.com.ar/productos-furgones-termicos.php'],
  ['Felipe','Carrozados','Metalúrgica Bonano','Alta','PRFV, aislación PU, herrajes, cierres, burletes y materiales de reparación.','https://www.bonano.com.ar/'],
  ['Felipe','Carrozados','Termax Argentina','Alta','Oferta integral directa: PRFV, PU, Adheplast, herrajes, burletes y revestimiento.','https://termax.com.ar/empresa/'],
  ['Ezequiel','Resinplast','Astillero Avalon','Alta','Resinas náuticas, gel coats, fibras/tejidos, catalizadores y desmoldantes.','https://www.avalonsportboats.com/'],
  ['Ezequiel','Resinplast','Indusplast Piscinas','Alta','Sistema de laminación: resina, gel coat, fibras/tejidos, cargas y accesorios.','https://www.indusplast.com/'],
  ['Ezequiel','Resinplast','NAWi Piscinas','Alta','Sistema completo de laminación y terminación para producción seriada.','https://nawipiscinas.com.ar/'],
  ['Ezequiel','Resinplast','Piscinas Hernán Plast','Alta','Resinas, gel coats, fibras, catalizadores, rodillos y accesorios.','https://www.hernanplast.com/'],
  ['Ezequiel','Resinplast','Piscinas IPC','Alta','Resina poliéster, gel coat, fibra 300/450, roving, catalizadores y desmoldantes.','https://piscinasipc.com/'],
  ['Ezequiel','Resinplast','Polifibra S.R.L.','Alta','Resinas según medio químico, fibra/roving, catalizadores, cargas y gel coats.','https://polifibrasrl.com.ar/'],
  ['Ezequiel','Resinplast','PSJ Industria','Alta','Resina, fibra/roving, gel coat, catalizadores y cargas para gran volumen.','https://psjindustria.com.ar/psj-industria/'],
  ['Felipe','PURMAC','AislaPro','Alta','Mantas calefactoras de tambor/IBC, dosificadoras PURMAC, repuestos','https://aislapro.com.ar/'],
  ['Felipe','PURMAC','Apliancor','Alta','Pistolas de proyección Fusion, repuestos dosificadoras, mantas calefactoras','https://apliancor.com.ar/'],
  ['Felipe','PURMAC','Argenpur','Alta','Máquinas de inyección PU, repuestos PM 3500, mantas calefactoras IBC/tambor','+54 237 468-0000 / info@argenpur.com.ar | https://www.argenpur.com.ar/'],
  ['Felipe','PURMAC','Astillero Arco Iris (Lanchas Eclipse)','Alta','Sistemas Airless de gelcoat, pistolas de aspersión de resina, repuestos','https://lanchaseclipse.com/'],
  ['Felipe','PURMAC','Astillero Regnicoli','Alta','Equipos de inyección/transferencia RTM, mantas calefactoras','https://www.astilleroregnicoli.com/'],
  ['Felipe','PURMAC','Chamtac (Impermeabilizaciones de Techos)','Alta','Dosificadoras de alta presión, equipos Fusion, mantas calefactoras','https://www.impermeabilizacionesdetechos.com/'],
  ['Felipe','PURMAC','Comenco','Alta','Dosificadoras PU, repuestos Fusion, mantas calefactoras de tambor','https://www.comenco.com.ar/'],
  ['Felipe','PURMAC','Eboplast','Alta','Inyectoras de poliuretano PURMAC, mantas calefactoras, Spray Up','https://eboplast.com.ar/'],
  ['Felipe','PURMAC','Gisbert Heladeras','Alta','Dosificadoras e inyectoras industriales de PU, mantas calefactoras','https://www.gisbertheladeras.com.ar/'],
  ['Felipe','PURMAC','Indusplast','Alta','Equipos de proyección Spray Up industriales, pistolas Airless, mantas','ventas@indusplast.com | https://www.indusplast.com/'],
  ['Felipe','PURMAC','Integral Buenos Aires','Alta','Equipos móviles de proyección PU, mantas calefactoras tambor/IBC','http://integralbuenosaires.com/'],
  ['Felipe','PURMAC','Poliuretanos del Norte','Alta','Máquinas PURMAC, repuestos pistolas Fusion, mantas calefactoras','https://poliuretanosdelnorte.com.ar/'],
  ['Felipe','PURMAC','Silat','Alta','Repuestos pistolas Fusion, mantas calefactoras de tambor, dosificadoras','https://silat.com.ar/'],
  ['Felipe','PURMAC','Solterm','Alta','Equipos de proyección PU/Poliurea, mantas calefactoras tambor/IBC','+54 11 4864-3101 / +54 11 4958-3111 | https://solterm.com.ar/'],
  ['Felipe','PURMAC','Tanques Argenplast','Alta','Equipos de aspersión/pulverización, pistolas airless, repuestos','https://tanquesargenplast.com/'],
  ['Felipe','PURMAC','Tarco S.A.','Alta','Equipos de aspersión de resina, mantas calefactoras para curado y tambores','https://tarco.com.ar/'],
  ['Felipe','Carrozados','ITATI Rodantes','Media','Materiales para paneles, aislación, revestimiento, adhesivos y herrajes.','https://www.itatigroup.com.ar/'],
  ['Felipe','Carrozados','Friolatina S.A.','Alta','Sistemas PU, insumos técnicos y soluciones complementarias','info@grupoltn.com | (0351) 679-9088 | https://www.acerolatina.com/friolatina/'],
  ['Felipe','Carrozados','Friopanel','Alta','PRFV, sistemas PU, adhesivos y soluciones de panel','friopanel@outlook.com | 11 6688-1611 | https://friopanel.com.ar/'],
  ['Felipe','Poliurea','MC Aislaciones','Alta','Poliurea, sistemas PU, repuestos y soporte técnico','mcaislaciones@gmail.com | +54 9 2941 545111 | https://mcaislaciones.com/'],
  ['Felipe','Poliurea','NogSec','Alta','Poliurea, sistemas PU y soporte técnico','https://nogsec.com.ar/'],
];

function stableId(prefix, company) {
  return `${prefix}-${company.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')}`;
}

export function buildCommercialCohort() {
  const stamp = new Date().toISOString();
  const clients = rows.map(([owner, family, company, priority, product, contact]) => ({
    id: stableId('base', company), company, contact, family, temperature: priority === 'Alta' ? 'Caliente' : 'Tibio',
    stage: 'Nuevo', clientType: 'A confirmar', industry: 'Desconocida', fit: 'A confirmar', urgency: 'A confirmar',
    potential: priority === 'Alta' ? 'Hipótesis alta' : 'Hipótesis media', owner, productPotential: product,
    source: SOURCE, pipelineActive: true, lastContact: '', createdAt: stamp, updatedAt: stamp,
  }));
  const tasks = clients.map((client) => ({
    id: stableId('tarea-inicial', client.company), clientId: client.id, company: client.company,
    title: 'Preparar contacto personalizado', dueDate: '', cadence: 'Primera cohorte',
    priority: client.temperature === 'Caliente' ? 'Alta' : 'Media', done: false,
    trigger: `Cuenta incorporada desde ${SOURCE}`, createdAt: stamp, updatedAt: stamp,
  }));
  return { clients, tasks, source: SOURCE };
}

export function mergeCommercialCohort(state) {
  const cohort = buildCommercialCohort();
  const normalize = (value) => (value || '').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const existingNames = new Set((state.clients || []).map((item) => normalize(item.company)));
  const newClients = cohort.clients.filter((item) => !existingNames.has(normalize(item.company)));
  if (!newClients.length) return { state, addedClients: 0, addedTasks: 0 };
  const newIds = new Set(newClients.map((item) => item.id));
  const newTasks = cohort.tasks.filter((item) => newIds.has(item.clientId));
  return {
    state: { ...state, clients: [...(state.clients || []), ...newClients], tasks: [...(state.tasks || []), ...newTasks] },
    addedClients: newClients.length,
    addedTasks: newTasks.length,
  };
}
