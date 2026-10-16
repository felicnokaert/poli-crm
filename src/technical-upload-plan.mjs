// Plan de una subida a Base técnica, antes de guardar nada (puro, sin Supabase). Como el explorador de
// Windows al copiar: si en la carpeta de destino ya hay un archivo con el mismo nombre, se pregunta si
// reemplazarlo, conservar los dos (el nuevo queda "nombre (1).pdf") u omitirlo. Si el mismo archivo
// (mismo contenido, por su huella SHA-256) ya está en la base, se avisa dónde y por defecto se omite.
import { folderFromSourceFile, moveDocumentToFolder } from './technical-documents-mapping.mjs';

export const CHOICES = Object.freeze({ replace: 'Reemplazar', keepBoth: 'Conservar los dos', skip: 'Omitir' });

const fileNameOf = (path = '') => String(path).split('/').filter(Boolean).at(-1) || '';
const sameName = (a, b) => a.normalize('NFC').toLocaleLowerCase('es-AR') === b.normalize('NFC').toLocaleLowerCase('es-AR');
const inFolder = (name, folder) => moveDocumentToFolder(name, folder === 'Sin carpeta' ? '' : folder);
const cleanSegments = (folder = '') => String(folder).split(/\s*\/\s*/).map((part) => part.trim()).filter(Boolean);

// "Ficha 618.pdf" -> "Ficha 618 (1).pdf" -> "(2)"... el primero que no esté usado en esa carpeta.
export function nextFreeName(fileName, takenNames = []) {
  const taken = new Set(takenNames.map((name) => name.normalize('NFC').toLocaleLowerCase('es-AR')));
  const match = String(fileName).match(/^(.*?)(\.[^.]+)?$/);
  const base = match[1].replace(/ \(\d+\)$/, '');
  const extension = match[2] || '';
  for (let n = 1; n < 1000; n += 1) {
    const candidate = `${base} (${n})${extension}`;
    if (!taken.has(candidate.toLocaleLowerCase('es-AR'))) return candidate;
  }
  return `${base} (${Date.now()})${extension}`;
}

// Carpeta final de un archivo: la elegida como destino, más (si se subió una carpeta entera y se pidió
// mantener su estructura) las subcarpetas que traía.
export function targetPathFor(file, { destination = '', keepStructure = true } = {}) {
  const relative = String(file.relativePath || file.name || '');
  const parts = relative.split('/').filter(Boolean);
  const inner = keepStructure ? parts.slice(0, -1) : [];
  const folder = [...cleanSegments(destination), ...inner].join(' / ');
  return moveDocumentToFolder(fileNameOf(relative) || file.name, folder);
}

// files: [{ key, name, relativePath, sha256, size }]; existing: documentos de Base técnica.
export function planUpload(files = [], existing = [], options = {}) {
  const byHash = new Map(existing.filter((doc) => doc.sha256).map((doc) => [doc.sha256, doc]));
  const namesByFolder = new Map();
  const remember = (sourceFile, doc) => {
    const folder = folderFromSourceFile(sourceFile);
    namesByFolder.set(folder, [...(namesByFolder.get(folder) || []), { name: fileNameOf(sourceFile), doc }]);
  };
  for (const doc of existing) remember(doc.sourceFile || doc.title || '', doc);
  const seenHashes = new Map();
  return files.map((file) => {
    const target = targetPathFor(file, options);
    const folder = folderFromSourceFile(target);
    const name = fileNameOf(target);
    const sameContent = (file.sha256 && byHash.get(file.sha256)) || (file.sha256 && seenHashes.get(file.sha256)) || null;
    const clash = (namesByFolder.get(folder) || []).find((entry) => sameName(entry.name, name));
    const taken = (namesByFolder.get(folder) || []).map((entry) => entry.name);
    const item = { key: file.key, fileName: name, folder, target, existing: null, conflict: null, choice: null, keepBothName: null };
    if (sameContent) {
      Object.assign(item, { conflict: 'mismo_archivo', existing: sameContent, choice: 'skip', keepBothName: clash ? nextFreeName(name, taken) : name });
    } else if (clash) {
      Object.assign(item, { conflict: 'mismo_nombre', existing: clash.doc, choice: 'keepBoth', keepBothName: nextFreeName(name, taken) });
    }
    // Lo que entra en esta misma subida también cuenta para los siguientes (dos "Ficha.pdf" en el lote).
    const finalName = item.choice === 'keepBoth' ? item.keepBothName : name;
    if (item.choice !== 'skip' && item.choice !== 'replace') {
      namesByFolder.set(folder, [...(namesByFolder.get(folder) || []), { name: finalName, doc: null }]);
      if (file.sha256) seenHashes.set(file.sha256, { title: finalName, sourceFile: inFolder(finalName, folder) });
    }
    return item;
  });
}

// Con las elecciones de la persona: qué se crea (con su ruta final), qué se reemplaza y qué se omite.
export function resolveUpload(items = [], choices = {}) {
  const result = { create: [], replace: [], skip: [] };
  for (const item of items) {
    const choice = choices[item.key] || item.choice || 'create';
    if (choice === 'skip') result.skip.push(item);
    else if (choice === 'replace' && item.existing?.id) result.replace.push(item);
    else if (choice === 'keepBoth') result.create.push({ ...item, target: inFolder(item.keepBothName, item.folder), fileName: item.keepBothName });
    else result.create.push(item);
  }
  return result;
}

// Carpetas existentes (para elegir destino), ordenadas.
export function folderOptions(documents = []) {
  return [...new Set(documents.map((doc) => folderFromSourceFile(doc.sourceFile)).filter((folder) => folder && folder !== 'Sin carpeta'))].sort((a, b) => a.localeCompare(b, 'es-AR'));
}
