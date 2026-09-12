import { useState } from "react";

// Qué ficha está abierta en cada momento (interacción / cliente / tarea) -
// son tres ids independientes porque los modales de detalle pueden convivir
// (ej. abrir un cliente desde el detalle de una interacción). Se agrupan acá
// solo porque viven juntos conceptualmente, no porque compartan lógica.
export function useSelectedRecords() {
  const [selectedInteractionId, setSelectedInteractionId] = useState(null);
  const [selectedClientId, setSelectedClientId] = useState(null);
  const [selectedTaskId, setSelectedTaskId] = useState(null);

  return {
    selectedInteractionId,
    setSelectedInteractionId,
    selectedClientId,
    setSelectedClientId,
    selectedTaskId,
    setSelectedTaskId,
  };
}
