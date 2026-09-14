// Índice estático de fichas técnicas reales de Grupo Poliplast (carpeta local
// "GRUPO POLIPLAST/FICHAS TÉCNICAS", fuera del repo — acá solo va metadata,
// nunca el PDF ni su texto). Se completó a mano el 07/09/2026 revisando la
// carpeta; quedaron afuera gráficas de redes, videos y archivos de diseño
// (.ai) porque no son fichas técnicas citables.
//
// "verified" indica si alguien de Poliplast ya leyó el documento completo y
// confirmó que los datos que cita son correctos y vigentes. Hasta que eso
// pase, ningún dato técnico (rendimiento, compatibilidad, dosificación,
// seguridad) se puede afirmar como cierto solo porque el nombre del archivo
// lo sugiere — ver suggestion-rules.mjs.
export const TECHNICAL_LIBRARY = [
  { id: 'purmac-airless-390', family: 'PURMAC', subfamily: 'Máquinas', product: 'Airless 390', docType: 'manual', sourceFile: 'MAQUINAS/Airless 390.pdf', version: null, verified: false },
  { id: 'purmac-pma-35', family: 'PURMAC', subfamily: 'Máquinas · Poliurea', product: 'PMA-35', docType: 'ficha_tecnica', sourceFile: 'MAQUINAS/MÁQUINA POLIUREA/PMA-35/PMA-35.docx', version: null, verified: false },
  { id: 'purmac-pma-d', family: 'PURMAC', subfamily: 'Máquinas · Poliurea', product: 'PMA-D', docType: 'ficha_tecnica', sourceFile: 'MAQUINAS/MÁQUINA POLIUREA/PMA-D/PMA-D.docx', version: null, verified: false },
  { id: 'purmac-pme-ua500', family: 'PURMAC', subfamily: 'Máquinas · Poliurea', product: 'PME-UA500', docType: 'ficha_tecnica', sourceFile: 'MAQUINAS/MÁQUINA POLIUREA/PME-UA500/PME-UA500.docx', version: null, verified: false },
  { id: 'purmac-pmh-400', family: 'PURMAC', subfamily: 'Máquinas · Poliurea', product: 'PMH-400', docType: 'ficha_tecnica', sourceFile: 'MAQUINAS/MÁQUINA POLIUREA/PMH-400/PMH-400.docx', version: null, verified: false },
  { id: 'purmac-pma-200-manual', family: 'PURMAC', subfamily: 'Máquinas · Poliuretano', product: 'PMA-200', docType: 'manual', sourceFile: 'MAQUINAS/MÁQUINA POLIURETANO/PMA-200/MANUAL PMA200 .pdf', version: null, verified: false },
  { id: 'purmac-pma-200-ficha', family: 'PURMAC', subfamily: 'Máquinas · Poliuretano', product: 'PMA-200', docType: 'ficha_tecnica', sourceFile: 'MAQUINAS/MÁQUINA POLIURETANO/PMA-200/PMA-200.docx', version: null, verified: false },
  { id: 'purmac-pme-20', family: 'PURMAC', subfamily: 'Máquinas · Poliuretano', product: 'PME-20', docType: 'ficha_tecnica', sourceFile: 'MAQUINAS/MÁQUINA POLIURETANO/PME-20/PME-20.docx', version: null, verified: false },
  { id: 'purmac-pme-8', family: 'PURMAC', subfamily: 'Máquinas · Poliuretano', product: 'PME-8', docType: 'ficha_tecnica', sourceFile: 'MAQUINAS/MÁQUINA POLIURETANO/PME-8/PME-8.docx', version: null, verified: false },
  { id: 'otra-agluplast-11289', family: 'Otra', subfamily: 'Agluplast', product: 'Agluplast 11289', docType: 'ficha_tecnica', sourceFile: 'PRODUCTOS/AGLUPLAST/Agluplast_11289-FT.pdf', version: null, verified: false },
  { id: 'poliuretano-isobunker-610-sp', family: 'Poliuretano', subfamily: 'Acústico', product: 'isoBUNKER 610-SP', docType: 'ficha_tecnica', sourceFile: 'PRODUCTOS/POLIURETANOS ACÚSTICOS/Ficha Técnica ACÚSTICA/isoBUNKER 610-SP-1.pdf', version: null, verified: false },
  { id: 'poliuretano-isobunker-608-sp', family: 'Poliuretano', subfamily: 'Termo-acústico', product: 'isoBUNKER 608-SP', docType: 'ficha_tecnica', sourceFile: 'PRODUCTOS/POLIURETANOS ACÚSTICOS/Ficha Técnica TERMO-ACÚSTICA/isoBUNKER 608-SP.pdf', version: null, verified: false },
  { id: 'poliuretano-inteplast-560', family: 'Poliuretano', subfamily: 'Flexible', product: 'IntePlast 560', docType: 'ficha_tecnica', sourceFile: 'PRODUCTOS/POLIURETANOS FLEXIBLES/Ficha Técnica INTEGRAL-PLAST/IntePlast 560.pdf', version: null, verified: false },
  { id: 'poliuretano-pur-40-bl', family: 'Poliuretano', subfamily: 'Rígido', product: 'isoBUNKER PUR 40 BL', docType: 'ficha_tecnica', sourceFile: 'PRODUCTOS/POLIURETANOS RIGIDOS/Ficha Técnica 40 BL/TDS isoBUNKER PUR 40 BL.pdf', version: null, verified: false },
  { id: 'poliuretano-isobunker-616-sp', family: 'Poliuretano', subfamily: 'Rígido', product: 'isoBUNKER 616-SP', docType: 'ficha_tecnica', sourceFile: 'PRODUCTOS/POLIURETANOS RIGIDOS/Ficha Técnica 616/isoBUNKER 616-SP.pdf', version: null, verified: false },
  { id: 'poliuretano-isobunker-618-sp', family: 'Poliuretano', subfamily: 'Rígido', product: 'isoBUNKER 618-SP', docType: 'ficha_tecnica', sourceFile: 'PRODUCTOS/POLIURETANOS RIGIDOS/Ficha Técnica 618 SP/isoBUNKER 618-SP - INTI.pdf', version: null, verified: false },
  { id: 'poliuretano-619-sp-fds', family: 'Poliuretano', subfamily: 'Rígido', product: 'poli-plus 619 SP', docType: 'fds', sourceFile: 'PRODUCTOS/POLIURETANOS RIGIDOS/Ficha Técnica 619 SP/FDS - poli-plus 619 SP (1).pdf', version: null, verified: false },
  { id: 'poliuretano-isobunker-619-sp-pds', family: 'Poliuretano', subfamily: 'Rígido', product: 'isoBUNKER 619-SP', docType: 'ficha_tecnica', sourceFile: 'PRODUCTOS/POLIURETANOS RIGIDOS/Ficha Técnica 619 SP/PDS isoBUNKER 619-SP.pdf', version: null, verified: false },
  { id: 'poliuretano-650-sp', family: 'Poliuretano', subfamily: 'Rígido', product: 'poli-plus 650 SP / iso-plus PM HFC', docType: 'ficha_tecnica', sourceFile: 'PRODUCTOS/POLIURETANOS RIGIDOS/Ficha Técnica 650/Hoja Tecnica poli-plus 650 SP - iso-plus PM HFC.pdf', version: null, verified: false },
  { id: 'poliuretano-660-sp-fds', family: 'Poliuretano', subfamily: 'Rígido', product: 'poli-plus 660 SP', docType: 'fds', sourceFile: 'PRODUCTOS/POLIURETANOS RIGIDOS/Ficha Técnica 660/fichadeseguridad_poli-plus 660 SP.pdf', version: null, verified: false },
  { id: 'poliuretano-isobunker-740-ir', family: 'Poliuretano', subfamily: 'Rígido', product: 'isoBUNKER 740-IR', docType: 'ficha_tecnica', sourceFile: 'PRODUCTOS/POLIURETANOS RIGIDOS/Ficha Técnica 740/isoBUNKER 740-IR-poliplast.pdf', version: null, verified: false },
  { id: 'poliuretano-isobunker-748-ir', family: 'Poliuretano', subfamily: 'Rígido', product: 'isoBUNKER 748-IR', docType: 'ficha_tecnica', sourceFile: 'PRODUCTOS/POLIURETANOS RIGIDOS/Ficha Técnica 748/isoBUNKER 748-IR.pdf', version: null, verified: false },
  { id: 'poliuretano-isobunker-760-ir', family: 'Poliuretano', subfamily: 'Rígido', product: 'isoBUNKER 760-IR', docType: 'ficha_tecnica', sourceFile: 'PRODUCTOS/POLIURETANOS RIGIDOS/Ficha Técnica 760/isoBUNKER 760-IR.docx.pdf', version: null, verified: false },
  { id: 'poliuretano-isobunker-770-ir', family: 'Poliuretano', subfamily: 'Rígido', product: 'isoBUNKER 770-IR', docType: 'ficha_tecnica', sourceFile: 'PRODUCTOS/POLIURETANOS RIGIDOS/Ficha Técnica 770/isoBUNKER 770-IR.pdf', version: null, verified: false },
  { id: 'poliuretano-uso-correcto-material', family: 'Poliuretano', subfamily: 'Boyas y señuelos', product: 'Uso correcto del material', docType: 'guia', sourceFile: 'PRODUCTOS/POLIURETANOS RIGIDOS/Ficha Técnica BOYAS Y SEÑUELOS/USO CORRECTO DEL MATERIAL.pdf', version: null, verified: false },
  { id: 'poliuretano-vo710', family: 'Poliuretano', subfamily: 'Boyas y señuelos', product: 'VO710', docType: 'ficha_tecnica', sourceFile: 'PRODUCTOS/POLIURETANOS RIGIDOS/Ficha Técnica BOYAS Y SEÑUELOS/VO710.pdf', version: null, verified: false },
  { id: 'purmac-bombas-trasvase', family: 'PURMAC', subfamily: 'Repuestos y accesorios', product: 'Bombas de trasvase', docType: 'ficha_tecnica', sourceFile: 'REPUESTOS-ACCESORIOS/BOMBAS TRASVASE/Bombas de trasvase.docx', version: null, verified: false },
  { id: 'purmac-pistola-fusion-ap', family: 'PURMAC', subfamily: 'Repuestos y accesorios', product: 'Pistola Fusion AP', docType: 'manual', sourceFile: 'REPUESTOS-ACCESORIOS/PISTOLA FUSION/INSTRUC.-PIEZAS-FUSION AP.pdf', version: null, verified: false },
  { id: 'purmac-pistola-pm3500', family: 'PURMAC', subfamily: 'Repuestos y accesorios', product: 'Pistola PM 3500 (Soft-Gun)', docType: 'manual', sourceFile: 'REPUESTOS-ACCESORIOS/PURMAC/Ficha Técnica Pistola PM3500/PISTOLA SOFT-GUN/MANUAL PISTOLA PM 3500 (1).pdf', version: null, verified: false },
  { id: 'poliuretano-guia-general', family: 'Poliuretano', subfamily: 'Guía general', product: 'Guía del Poliuretano', docType: 'guia', sourceFile: 'REPUESTOS-ACCESORIOS/PURMAC/PRE  VENTA PMA 200/PDF GUIA DEL POLIURETANO/Actualizacion GUÍA DEL POLIURETANO.pdf', version: null, verified: false },
];

const DOC_TYPE_LABELS = {
  ficha_tecnica: 'Ficha técnica',
  fds: 'Ficha de seguridad (FDS)',
  manual: 'Manual',
  guia: 'Guía técnica',
};

export function docTypeLabel(docType) {
  return DOC_TYPE_LABELS[docType] || docType;
}

export function documentsForFamily(family) {
  return TECHNICAL_LIBRARY.filter((doc) => doc.family === family);
}

export function findDocumentById(id) {
  return TECHNICAL_LIBRARY.find((doc) => doc.id === id) || null;
}
