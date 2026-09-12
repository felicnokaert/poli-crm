export const FAMILIES = [
  "Sin definir",
  "Poliuretano",
  "Poliurea",
  "PURMAC",
  "Penosil",
  "Carrozados",
  "Resinplast",
  "Baldes",
  "Pisos",
  "EPP",
  "Almohadas",
  "PRFV",
  "Imperpur",
  "Foam Factory",
  "Otra",
];

const FAMILY_ALIASES = { poliuretanos: "Poliuretano" };

function normalizedFamilyKey(value = "") {
  return String(value).trim().toLocaleLowerCase("es-AR");
}

// Algunas importaciones (relevamiento comercial, cruces de Excel) cargaron
// `family` en mayúsculas ("CARROZADOS") o en variantes menores ("POLIURETANOS"
// en vez de "Poliuretano"). Eso rompía la comparación exacta que usaban el
// filtro de Empresas y el <select> de edición de ficha: esos clientes
// quedaban invisibles al filtrar, y el <select> de edición no mostraba
// ninguna opción seleccionada (riesgo real de pisar la familia sin querer al
// guardar). Esta función mapea cualquier variante conocida a su forma
// canónica de FAMILIES, sin tocar los datos guardados.
export function canonicalFamily(value) {
  if (!value) return value;
  const key = normalizedFamilyKey(value);
  const alias = FAMILY_ALIASES[key];
  if (alias) return alias;
  const known = FAMILIES.find((item) => normalizedFamilyKey(item) === key);
  return known || value;
}
