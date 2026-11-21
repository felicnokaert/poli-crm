// Remitos de PRUEBA con el mismo formato que Contabilium (A4, encabezado celeste, cliente en gris, tabla,
// pie gris con «Recibí conforme____» en x 353 / base 46,6, igual que los remitos reales que pasó Felipe el 21/11).
// Clientes, CUIT y montos INVENTADOS: los remitos reales no se guardan en el repo.
// Uso: node test-fixtures/remitos/generar.mjs  (desde entregas-app)
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'
import { writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const DIR = dirname(fileURLToPath(import.meta.url))
const gris = (v) => rgb(v / 255, v / 255, v / 255)

async function remito({ archivo, numero, cliente, cuit, items, hojas = 1, conRecibi = true, lleno = false }) {
  const d = await PDFDocument.create()
  const f = await d.embedFont(StandardFonts.Helvetica)
  const fb = await d.embedFont(StandardFonts.HelveticaBold)
  const porHoja = Math.ceil(items.length / hojas)
  for (let h = 0; h < hojas; h++) {
    const p = d.addPage([595, 842])
    const t = (s, x, y, size = 9, font = f, color = gris(30)) => p.drawText(s, { x, y, size, font, color })
    // encabezado celeste
    p.drawRectangle({ x: 20, y: 668, width: 555, height: 145, color: rgb(0.92, 0.95, 0.98) })
    t('poliplast', 50, 760, 30, fb, rgb(0.85, 0.1, 0.12)); t('POLIURETANO Y PLASTICO PROYECTADO', 50, 744, 7, fb, gris(90))
    t('R', 285, 790, 16); t('Remito', 538, 790, 10); t('Original', 538, 777, 8)
    t(`Nº: ${numero}`, 455, 753, 13); t('Fecha: 21/11/2026', 480, 738, 10)
    t('EMPRESA DE PRUEBA SRL', 27, 735); t('Calle Falsa 123', 27, 720); t('MAR DEL PLATA, Buenos Aires', 27, 705); t('Tel.: 11-0000-0000', 27, 690); t('Responsable Inscripto', 27, 675)
    t('CUIT: 30000000007', 510, 705); t('Inicio de actividades: 01/03/2018', 435, 675)
    // cliente en gris
    p.drawRectangle({ x: 20, y: 585, width: 555, height: 80, color: gris(217) })
    t(`Razón social: ${cliente}`, 27, 645); t('Domicilio: CALLE DE PRUEBA 456 - CP 7600. Tel:', 27, 630); t('Ubicación:  Buenos Aires', 27, 615); t('Condición de venta: Cuenta corriente', 27, 600)
    t(`CUIT: ${cuit}`, 330, 615); t('Condición de IVA: Responsable Inscripto', 330, 600)
    // tabla
    p.drawRectangle({ x: 20, y: 568, width: 555, height: 14, color: gris(110) })
    t('Cantidad', 27, 572, 9, f, gris(255)); t('Código', 82, 572, 9, f, gris(255)); t('Descripción', 222, 572, 9, f, gris(255))
    p.drawRectangle({ x: 20, y: 180, width: 555, height: 388, borderColor: gris(225), borderWidth: 0.6 })
    p.drawLine({ start: { x: 72, y: 180 }, end: { x: 72, y: 568 }, color: gris(225), thickness: 0.6 })
    p.drawLine({ start: { x: 142, y: 180 }, end: { x: 142, y: 568 }, color: gris(225), thickness: 0.6 })
    const mios = items.slice(h * porHoja, (h + 1) * porHoja)
    mios.forEach(([cant, cod, desc], i) => { t(String(cant), 60 - f.widthOfTextAtSize(String(cant), 7.5), 545 - i * 16, 7.5); t(cod, 78, 545 - i * 16, 7.5); t(desc, 150, 545 - i * 16, 7.5) })
    if (lleno) for (let y = 190; y < 530; y += 11) t('Observaciones de prueba '.repeat(5), 150, y, 7)
    // pie gris (solo en la última hoja)
    if (h === hojas - 1) {
      p.drawRectangle({ x: 20, y: 30, width: 555, height: 150, color: gris(242) })
      t(`Cantidad total: ${items.reduce((a, [c]) => a + c, 0)}`, 27, 172, 10); t('VPS: $ 1.000.000,00. Transporte: RETIRA', 27, 162, 10)
      if (conRecibi) t('Recibí conforme_________________________', 353, 46.6, 10, fb, gris(20))
      if (lleno) for (let y = 40; y < 150; y += 10) t('Texto legal de prueba '.repeat(7), 27, y, 7.5)
    } else {
      t('Continúa en la hoja siguiente', 27, 172, 9)
    }
    t('Powered by CONTABILIUM', 262, 12, 6, f, gris(120))
  }
  writeFileSync(join(DIR, archivo), await d.save({ useObjectStreams: false }))
}

const item = (n) => [((n * 7) % 40) + 1, `KT-6${String(n).padStart(2, '0')}-47`, `PRODUCTO DE PRUEBA NUMERO ${n} EN KIT X ${(n % 5) + 1}KG`]
await remito({ archivo: 'contabilium-1-item.pdf', numero: '0006-00009001', cliente: 'CLIENTE DE PRUEBA S.A.', cuit: '30000000015', items: [item(1)] })
await remito({ archivo: 'contabilium-varios.pdf', numero: '0003-00009002', cliente: 'PERSONA DE PRUEBA', cuit: '27000000020', items: Array.from({ length: 18 }, (_, i) => item(i + 1)) })
await remito({ archivo: 'contabilium-2-hojas.pdf', numero: '0006-00009003', cliente: 'OTRO CLIENTE DE PRUEBA SRL', cuit: '30000000031', items: Array.from({ length: 40 }, (_, i) => item(i + 1)), hojas: 2 })
await remito({ archivo: 'sin-recibi.pdf', numero: '0006-00009004', cliente: 'SIN RECIBI DE PRUEBA', cuit: '30000000040', items: [item(2), item(3)], conRecibi: false })
await remito({ archivo: 'lleno.pdf', numero: '0006-00009005', cliente: 'LLENO DE PRUEBA', cuit: '30000000058', items: [item(4)], lleno: true })
console.log('remitos de prueba generados en', DIR)
