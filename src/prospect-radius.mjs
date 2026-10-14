// Radio de búsqueda según el tamaño de la ciudad (misma regla que usa el servidor).
export function radiusForPopulation(population = 0) {
  if (population >= 500000) return 18;
  if (population >= 100000) return 12;
  if (population >= 30000) return 8;
  return 5;
}
