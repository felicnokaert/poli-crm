// Poliplast App (25/11): qué ve cada persona = su ROL (conjunto de módulos) + lo que Felipe le suma o le saca
// a mano (overrides: { 'modulo': true/false, 'modulo.submodulo': false }). Solo administradores lo cambian.
import { OPT_IN, PERMISSION_ONLY, ROLES, SUBMODULES, roleAllows } from './poliplast-app-plan.mjs';
import { demoTeam } from './demo-data.mjs';
import { MODULES } from './module-access.mjs';

export const slug = (text = '') => String(text).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
// Los submódulos que ya existían (Mercado Libre, Shopify) usan las mismas claves que module_access hoy.
export const childKey = (module, label) => {
  const known = MODULES.find((item) => item.id === module)?.children?.find(([, name]) => name === label);
  return `${module}.${known ? known[0] : slug(label)}`;
};

export function accessAllows(access = {}, module, child = '') {
  const overrides = access.overrides || {};
  if (access.role === 'admin') return true;
  if (module === 'profile') return true;
  // Sin rol asignado (cuentas de antes): ve todo, como hoy; solo cuentan los módulos que se le sacaron.
  const base = module in overrides ? Boolean(overrides[module]) : (access.role ? roleAllows(access.role, module) : true);
  if (!base || !child) return base;
  const key = childKey(module, child);
  return key in overrides ? Boolean(overrides[key]) : !OPT_IN.has(key);
}

// Submódulos que son pestañas (sin los que son solo permiso).
export const tabSubs = (module) => (SUBMODULES[module] || []).filter((sub) => !PERMISSION_ONLY.has(childKey(module, sub)));

export function navForAccess(groups, access) {
  return groups
    .map(([name, items]) => [name, items.filter(([id]) => accessAllows(access, id))])
    .filter(([, items]) => items.length > 0);
}

// Cambiar el rol borra lo que se había tocado a mano (arranca limpio del conjunto del rol).
export function setRole(person, role) {
  return { ...person, role, overrides: {} };
}

// Prender/apagar un módulo o submódulo. Si queda igual que el rol, se borra la excepción.
export function toggleAccess(person, module, child = '') {
  const overrides = { ...(person.overrides || {}) };
  if (child) {
    const key = childKey(module, child);
    const byDefault = !OPT_IN.has(key);
    const next = !(key in overrides ? overrides[key] : byDefault);
    if (next === byDefault) delete overrides[key]; else overrides[key] = next;
  } else {
    const roleDefault = person.role ? roleAllows(person.role, module) : true;
    const now = module in overrides ? overrides[module] : roleDefault;
    if (!now === roleDefault) delete overrides[module]; else overrides[module] = !now;
  }
  return { ...person, overrides };
}

export function changesCount(person) {
  return Object.keys(person.overrides || {}).length;
}

export const CORPORATE = /@grupopoliplast\.com\.ar$/i;

export function newPerson({ email, name, role }) {
  const clean = String(email || '').trim().toLowerCase();
  if (!CORPORATE.test(clean)) return { error: 'El mail tiene que ser @grupopoliplast.com.ar.' };
  if (!ROLES.some((item) => item.id === role)) return { error: 'Elegí un rol.' };
  return { person: { email: clean, name: String(name || '').trim() || clean.split('@')[0], role, overrides: {}, registered: false } };
}

// Lista de módulos y submódulos para el panel, en el orden del menú.
export function moduleTree(groups) {
  return groups.map(([group, items]) => [group, items.filter(([id]) => !['plan', 'profile'].includes(id)).map(([id, label]) => ({ id, label, children: SUBMODULES[id] && SUBMODULES[id].length > 1 ? SUBMODULES[id] : [] }))]).filter(([, items]) => items.length);
}

// Guardado local (modo de prueba). En la app real va a las tablas app_user_roles y module_access.
export const TEAM_KEY = 'poliplast-app-team';
export function loadLocalTeam(storage = globalThis.localStorage) {
  try {
    const saved = JSON.parse(storage?.getItem(TEAM_KEY));
    if (Array.isArray(saved) && saved.length) return saved;
  } catch { /* copia rota: arranca de nuevo */ }
  return demoTeam().map((person) => ({ ...person, overrides: {} }));
}
export function saveLocalTeam(team, storage = globalThis.localStorage) {
  try { storage?.setItem(TEAM_KEY, JSON.stringify(team)); } catch { /* sin almacenamiento */ }
}

// Filas de module_access (allowed true/false) → overrides, y al revés (lo que hay que escribir para una persona).
export function overridesFromRows(rows = []) {
  return Object.fromEntries((rows || []).filter((row) => row && row.module).map((row) => [String(row.module), row.allowed !== false]));
}

export function overrideChanges(before = {}, after = {}) {
  const keys = new Set([...Object.keys(before || {}), ...Object.keys(after || {})]);
  const upserts = [];
  const deletes = [];
  for (const key of keys) {
    if (!(key in (after || {}))) deletes.push(key);
    else if ((before || {})[key] !== after[key]) upserts.push({ module: key, allowed: Boolean(after[key]) });
  }
  return { upserts, deletes };
}
