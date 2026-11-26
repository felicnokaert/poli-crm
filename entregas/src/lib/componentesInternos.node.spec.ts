// 26/11: un componente definido ADENTRO de otro (`const Subir = (...) => <input type="file" …/>` dentro del render) se
// desmonta en cada refresco de la pantalla: con el selector de archivos o la cámara abiertos, la foto elegida se perdía
// (remito firmado de URBANTEC). Esta prueba frena ese patrón en las pantallas: funciones que devuelven JSX sí,
// componentes (nombre con mayúscula) definidos con sangría dentro de otra función, no.
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const DIR = join(__dirname, '..', 'components')
const INTERNO = /^\s{2,}const ([A-Z][A-Za-z0-9]*) = (?:\(|React\.memo|memo\()/gm

describe('pantallas sin componentes internos', () => {
  for (const archivo of readdirSync(DIR).filter((f) => f.endsWith('.tsx'))) {
    it(archivo, () => {
      const texto = readFileSync(join(DIR, archivo), 'utf8')
      const encontrados = [...texto.matchAll(INTERNO)].map((m) => m[1])
      expect(encontrados, `Definí ${encontrados.join(', ')} afuera del componente o como función que devuelve JSX`).toEqual([])
    })
  }
})
