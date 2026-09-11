// Adjunta en bloque los PDFs que ya viven en la carpeta local de Drive a las
// fichas de Base técnica que todavía no tienen su archivo. Corre fuera del
// navegador para no tener que hacer 44 clicks: Felipe pidió expresamente no
// subir las fichas una por una ahora que son muchas.
//
// Usa tu mismo usuario y contraseña del CRM (te los pide acá, en tu propia
// terminal) - nunca un service_role key ni ninguna otra clave especial de
// Supabase. El login sirve solo para que RLS te reconozca como
// is_poliplast_crm_user(), igual que cuando entrás por el navegador.
//
// Nunca crea fichas nuevas ni reemplaza fichas ya adjuntas - solo completa
// las que están vacías, emparejando por source_file (la misma ruta relativa
// que ya usa el importador normal). Los .docx quedan afuera a propósito: el
// bucket solo acepta PDF.
//
// Uso:
//   node scripts/attach-technical-pdfs.mjs
//   (opcional, si la carpeta de fichas está en otro lado:
//    node scripts/attach-technical-pdfs.mjs "C:\ruta\a\FICHAS TECNICAS")
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
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

// La anon key es pública por diseño (RLS es lo que protege los datos) - es
// la misma que ya usa la app en el navegador, por eso viene con un default
// y no hace falta ir a buscarla a ningún lado.
const DEFAULT_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5naHdtdGNjcG92cmR0enZsbHdlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODc5NDA2ODcsImV4cCI6MjEwMzUxNjY4N30.Q3_alw1wsDmXeb_MLeaiCVhVq7oNk521GwICiWbtaQo';
const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || 'https://nghwmtccpovrdtzvllwe.supabase.co';
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || DEFAULT_ANON_KEY;

// Itera las líneas de a una en vez de encadenar dos rl.question() - con
// question() encadenado, si las dos respuestas llegan juntas (pasa con
// entrada no interactiva, y no está probado que nunca pase en Windows) la
// segunda se pierde porque todavía no hay nadie escuchando ese evento.
// Iterando así no depende de ese timing. Sin ocultar la contraseña a
// propósito: enmascarar el tipeo depende del modo "raw" de la terminal, que
// se comporta distinto entre PowerShell/cmd/Git Bash - es un script
// personal, una sola corrida, que se vea mientras la tipeás es un costo
// aceptable a cambio de que funcione siempre.
async function askEmailAndPassword() {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const answers = [];
  process.stdout.write('Email del CRM: ');
  for await (const line of rl) {
    answers.push(line.trim());
    if (answers.length === 1) process.stdout.write('Contraseña: ');
    else break;
  }
  rl.close();
  return { email: answers[0] || '', password: answers[1] || '' };
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
  const { email, password } = await askEmailAndPassword();

  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  const { error: authError } = await supabase.auth.signInWithPassword({ email, password });
  if (authError) {
    console.error('No se pudo iniciar sesión:', authError.message);
    // process.exitCode (no process.exit) - llamar a exit() justo después de
    // cerrar el readline puede tirar un crash de libuv cosmético
    // (UV_HANDLE_CLOSING) en Windows mientras el handle todavía está
    // terminando de cerrarse. Dejar que Node salga solo evita eso.
    process.exitCode = 1;
    return;
  }
  console.log('Sesión iniciada.\n');

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
      // Storage rechaza tildes/ñ en la ruta del objeto (InvalidKey) - casi
      // todos los nombres de fichas las tienen. Espacios y paréntesis sí
      // están permitidos, no hace falta tocarlos.
      const safeName = path.basename(localPath).normalize('NFD').replace(/[̀-ͯ]/g, '');
      const storagePath = `${doc.id}/${Date.now()}-${safeName}`;
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
