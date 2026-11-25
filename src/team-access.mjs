// Poliplast App (25/11): qué ve cada persona = su ROL (conjunto de módulos) + lo que Felipe le suma o le saca
// a mano (overrides: { 'modulo': true/false, 'modulo.submodulo': false }). Solo administradores lo cambian.
import { ROLES, SUBMODULES, roleAllows } from './poliplast-app-plan.mjs';
import { demoTeam } from './demo-data.mjs';

export const slug = (text = '') => String(text).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
export const childKey = (module, label) => `${module}.${slug(label)}`;

export function accessAllows(access = {}, module, child = '') {
  const overrides = access.overrides || {};
  if (access.role === 'admin') return true;
  if (module === 'profile') return true;
  const base = module in overrides ? Boolean(overrides[module]) : roleAllows(access.role || 'comercial', module);
  if (!base || !child) return base;
  const key = childKey(module, child);
  return key in overrides ? Boolean(overrides[key]) : true;
}

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
    const now = key in overrides ? overrides[key] : true;
    if (now) overrides[key] = false; else delete overrides[key];
  } else {
    const roleDefault = roleAllows(person.role, module);
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
