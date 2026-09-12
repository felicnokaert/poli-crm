import { useEffect, useState } from "react";

const NAV_COLLAPSE_KEY = "poliplast-sales-copilot-nav-collapsed";

// Lógica pura de qué lista de grupos colapsados usar al arrancar, extraída
// para poder testearla sin localStorage ni React. `storedRaw` es el string
// crudo tal cual viene de localStorage.getItem (puede ser null).
//
// Un array vacío guardado no distingue "el usuario abrió todo a propósito"
// de "nunca tocó nada" (que es lo que pasaba antes de este cambio - el
// efecto de abajo ya guardaba [] solo). Se trata igual que "nada guardado
// todavía" para no dejar a nadie con el sidebar desplegado por un valor
// viejo que nadie eligió a mano.
export function resolveInitialCollapsedNavGroups(storedRaw, groupNames) {
  try {
    const stored = JSON.parse(storedRaw || "[]");
    if (Array.isArray(stored) && stored.length > 0) return stored;
  } catch {
    // sigue al default de abajo
  }
  return groupNames;
}

// Qué grupos del menú lateral están colapsados, persistido en localStorage.
// Arranca con todos los grupos colapsados - Felipe: "así está más limpio",
// que se vean los títulos primero y cada uno se abra al tocarlo, no todo
// desglosado de entrada. Una vez que el usuario toca algún grupo, lo que
// haya en localStorage manda (se respeta su elección).
export function useNavGroups(groupNames) {
  const [collapsedNavGroups, setCollapsedNavGroups] = useState(() =>
    resolveInitialCollapsedNavGroups(localStorage.getItem(NAV_COLLAPSE_KEY), groupNames),
  );
  useEffect(() => {
    localStorage.setItem(NAV_COLLAPSE_KEY, JSON.stringify(collapsedNavGroups));
  }, [collapsedNavGroups]);

  return [collapsedNavGroups, setCollapsedNavGroups];
}
