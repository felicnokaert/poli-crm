import { deleteUser } from '../lib/admin-users.mjs';

export default async function handler(request, response) {
  if (request.method !== 'POST') return response.status(405).json({ error: 'Método no permitido.' });
  const result = await deleteUser(request);
  return response.status(result.status).json(result.body);
}
