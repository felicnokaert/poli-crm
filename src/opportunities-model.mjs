export const SALES_METHOD_STAGES = ['Preparación', 'Apertura', 'Diagnóstico', 'Calificación', 'Recomendación', 'Objeción', 'Propuesta', 'Seguimiento', 'Negociación', 'Cierre', 'Posventa', 'Recompra'];
export const PRIORITY_CRITERIA = ['A confirmar', 'Urgencia explícita', 'Alto potencial', 'Buen encaje', 'Recompra próxima', 'Valor estimado', 'Cuenta estratégica'];

export function blankOpportunity(clientId = '') {
  return { clientId, title: '', stage: 'Preparación', probability: 20, expectedClose: '', nextAction: '', nextDate: '', outcome: 'Pendiente', objection: '', priorityCriterion: 'A confirmar', lossReason: '', notes: '', stageHistory: [], lines: [] };
}
