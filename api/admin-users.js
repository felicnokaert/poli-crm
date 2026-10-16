import { deleteUser } from '../lib/admin-users.mjs';
import { cleanupWorkspaces } from '../lib/workspace-cleanup-admin.mjs';

// Una sola función para las tareas de administrador (el plan de Vercel limita la cantidad de funciones):
// borrar un usuario, o revisar/limpiar espacios con datos de Felipe copiados (action: 'cleanup').
export default async function handler(request, response) {
  if (request.method !== 'POST') return response.status(405).json({ error: 'Método no permitido.' });
  const result = request.body?.action === 'cleanup' ? await cleanupWorkspaces(request) : await deleteUser(request);
  return response.status(result.status).json(result.body);
}
