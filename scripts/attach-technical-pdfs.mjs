// Adjunta en bloque los PDFs que ya viven en la carpeta local de Drive a las
// fichas de Base técnica que todavía no tienen su archivo. Corre fuera del
// navegador, con la service role key (nunca la anon key), para no tener que
// loguearse en el CRM ni hacer 44 clicks: Felipe pidió expresamente no subir
// las fichas una por una ahora que son muchas.
//
// Nunca crea fichas nuevas ni reemplaza fichas ya adjuntas - solo completa
// las que están vacías, emparejando por source_file (la misma ruta relativa
// que ya usa el importador normal). Los .docx quedan afuera a propósito: el
// bucket solo acepta PDF.
//
// Uso:
//   1. Crear poliplast-sales-copilot/.env.local (nunca se commitea - ver
//      .gitignore) con dos líneas:
//        SUPABASE_URL=https://nghwmtccpovrdtzvllwe.supabase.co
//        SUPABASE_SERVICE_ROLE_KEY=<Supabase -> Project Settings -> API -> service_role>
//   2. Desde la carpeta del proyecto: node scripts/attach-technical-pdfs.mjs
//      (opcional, si la carpeta de fichas está en otro lado:
//       node scripts/attach-technical-pdfs.mjs "C:\ruta\a\FICHAS TECNICAS")
import fs from 'node:fs';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';

function loadDotEnvLocal() {
  const file = path.join(process.cwd(), '.env.local');
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (match && !process.env[match[1]]) process.env[match[1]] = match[2].trim();
  }
}
loadDotEnvLocal();

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('Falta SUPABASE_URL y/o SUPABASE_SERVICE_ROLE_KEY.');
  console.error('Creá poliplast-sales-copilot/.env.local con esas dos variables (ver el comentario al inicio de este archivo) y volvé a correr el script.');
  process.exit(1);
}

const DEFAULT_ROOT = 'C:\\Users\\felip\\OneDrive\\Desktop\\Poliplast\\GRUPO POLIPLAST\\FICHAS TÉCNICAS';
const root = process.argv[2] || DEFAULT_ROOT;
if (!fs.existsSync(root)) {
  console.error(`No encuentro la carpeta: ${root}`);
  console.error('Pasala como argumento: node scripts/attach-technical-pdfs.mjs "C:\\ruta\\a\\tu\\carpeta"');
  process.exit(1);
}

function listPdfsRecursive(dir, base = dir) {
  let out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out = out.concat(listPdfsRecursive(full, base));
    else if (/\.pdf$/i.test(entry.name)) out.push(path.relative(base, full).split(path.sep).join('/'));
  }
  return out;
}

// Mismo criterio que src/pdf-text.js (usado en el navegador) - acá corre
// sobre el build "legacy" de pdfjs-dist, pensado para Node sin DOM/worker.
async function extractPdfText(buffer) {
  const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(buffer), isEvalSupported: false }).promise;
  const pages = [];
  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const content = await page.getTextContent();
    pages.push(content.items.map((item) => item.str).join(' '));
  }
  return pages.join('\n');
}

async function main() {
  const supabase = createClient(SUPABASE_URL, SERVICE_KEY);
  const relativePaths = listPdfsRecursive(root);
  const bySourceFile = new Map(relativePaths.map((rel) => [rel, path.join(root, ...rel.split('/'))]));

  const { data: docs, error } = await supabase.from('technical_documents').select('id, title, source_file, storage_path');
  if (error) throw error;

  const pending = (docs || []).filter((doc) => !doc.storage_path && bySourceFile.has(doc.source_file));
  console.log(`Carpeta: ${root}`);
  console.log(`${relativePaths.length} PDF encontrados localmente · ${docs.length} fichas en Base técnica · ${pending.length} para adjuntar ahora.\n`);

  let attached = 0;
  let failed = 0;
  for (const doc of pending) {
    const localPath = bySourceFile.get(doc.source_file);
    try {
      const buffer = fs.readFileSync(localPath);
      const storagePath = `${doc.id}/${Date.now()}-${path.basename(localPath)}`;
      const { error: uploadError } = await supabase.storage
        .from('technical-documents')
        .upload(storagePath, buffer, { upsert: true, contentType: 'application/pdf' });
      if (uploadError) throw uploadError;
      let extractedText = null;
      try {
        extractedText = await extractPdfText(buffer);
      } catch {
        extractedText = null;
      }
      const { error: updateError } = await supabase
        .from('technical_documents')
        .update({ storage_path: storagePath, extracted_text: extractedText })
        .eq('id', doc.id);
      if (updateError) throw updateError;
      attached += 1;
      console.log(`OK    ${doc.title}${extractedText ? '' : ' (texto no se pudo leer, pero el PDF quedó adjunto)'}`);
    } catch (err) {
      failed += 1;
      console.log(`ERROR ${doc.title}: ${err.message || err}`);
    }
  }

  const stillMissingWord = docs.filter((doc) => !doc.storage_path && !/\.pdf$/i.test(doc.source_file || '')).length;
  console.log(`\n${attached} fichas quedaron con su PDF adjunto. ${failed} con error.`);
  if (stillMissingWord) {
    console.log(`${stillMissingWord} fichas siguen sin adjuntar porque su archivo original es Word (.docx) - convertilas a PDF y corré el script de nuevo, o usá "Adjuntar PDF" en esa ficha puntual.`);
  }
}

main().catch((err) => {
  console.error('\nFalló el script:', err.message || err);
  process.exit(1);
});
