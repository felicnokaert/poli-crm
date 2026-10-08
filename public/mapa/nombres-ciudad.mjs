// Nombres de las ciudades tal como se dicen (no como figuran en el Censo). Lógica pura, sin DOM:
// la usa app.js (via window.NombresCiudad) y se testea en test/mapa-nombres.test.mjs.
//
// El Censo 2022 publica "gobiernos locales": en Buenos Aires son los partidos ("General Pueyrredón"
// en vez de "Mar del Plata") y en Santiago del Estero, Santa Cruz y otras provincias hay áreas
// rurales con nombres técnicos ("Copo (gobierno local 860056)"). Acá se limpian, sin tocar la
// población ni la ubicación.

// Municipio -> ciudad principal. Solo casos en los que la ciudad es, sin duda, como se la nombra.
export const NOMBRE_DE_CIUDAD = {
  '060357': 'Mar del Plata', // partido de General Pueyrredón
  '060182': 'Punta Alta', // partido de Coronel de Marina Leonardo Rosales
  '060648': 'Guernica', // partido de Presidente Perón
  '060260': 'Monte Grande', // partido de Esteban Echeverría
  '060252': 'Belén de Escobar', // partido de Escobar
  '060515': 'Los Polvorines', // partido de Malvinas Argentinas (Buenos Aires)
  '060280': 'Miramar', // partido de General Alvarado
  '060420': 'San Clemente del Tuyú', // partido de La Costa
};

const RURAL_SIN_GOBIERNO = /^(.*?):? zona sin gobierno local \(\d+\)$/;
const RURAL_CON_CODIGO = /^(.*?) \(gobierno local \d+\)$/;

// Devuelve { nombre, rural } para una ciudad del censo, sin desambiguar todavía.
export function limpiarNombre(ciudad) {
  const alias = NOMBRE_DE_CIUDAD[ciudad.id];
  if (alias) return { nombre: alias, rural: false };
  const sinGobierno = RURAL_SIN_GOBIERNO.exec(ciudad.nombre);
  if (sinGobierno) return { nombre: sinGobierno[1], rural: true };
  const conCodigo = RURAL_CON_CODIGO.exec(ciudad.nombre);
  if (conCodigo) return { nombre: conCodigo[1], rural: true };
  return { nombre: ciudad.nombre, rural: false };
}

// Lista nueva con `nombre` amigable, `muni` (el nombre del Censo) y `rural`. Los nombres que se repiten
// en el país (hay 128: "Rivadavia", "San Martín"...) llevan la provincia; las zonas rurales, "(rural)".
export function nombresAmigables(ciudades, nombreProvincia = () => '') {
  const limpias = ciudades.map((ciudad) => ({ ciudad, ...limpiarNombre(ciudad) }));
  const veces = new Map();
  for (const { nombre, rural } of limpias) {
    const clave = `${rural ? 'r' : 'c'}|${nombre}`;
    veces.set(clave, (veces.get(clave) || 0) + 1);
  }
  return limpias.map(({ ciudad, nombre, rural }) => {
    const provincia = nombreProvincia(ciudad.prov) || '';
    const repetido = veces.get(`${rural ? 'r' : 'c'}|${nombre}`) > 1;
    let visible = nombre;
    if (rural) {
      // "Copo (zona rural)"; si además hay otro igual en otra provincia, "Copo (zona rural, Chaco)".
      visible = `${nombre} (zona rural${repetido && provincia ? `, ${provincia}` : ''})`;
    } else if (repetido && provincia) {
      visible = `${nombre} (${provincia})`;
    }
    return { ...ciudad, nombre: visible, muni: ciudad.nombre, rural };
  });
}

if (typeof window !== 'undefined') window.NombresCiudad = { nombresAmigables, limpiarNombre, NOMBRE_DE_CIUDAD };
