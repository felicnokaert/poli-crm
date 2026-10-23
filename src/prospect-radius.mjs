// Radio de búsqueda según el tamaño de la ciudad (misma regla que usa el servidor). Los valores de fábrica son 10/9/7/5 km;
// desde el 24/10 se pueden cambiar desde la pantalla (src/prospect-rules.mjs) y el navegador manda el radio ya calculado.
import { DEFAULT_RULES } from './prospect-rules.mjs';

export function radiusForPopulation(population = 0, rules = DEFAULT_RULES) {
  if (population >= rules.populationBig) return rules.radiusBig;
  if (population >= rules.populationLarge) return rules.radiusLarge;
  if (population >= rules.populationMedium) return rules.radiusMedium;
  return rules.radiusSmall;
}
