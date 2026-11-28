import { createClient } from "@supabase/supabase-js";

// Logística (28/11, Felipe: «una sola app»): Etiquetas, Conteo y Dosificado son pantallas propias de Poliplast App y siguen
// leyendo y escribiendo su base de siempre (Supabase coldwrbfxpdfutbekysr), con la misma clave pública que usaba la app
// de conteo. Cliente aparte, sin sesión propia (no se mezcla con el login de la app). Unificar las bases queda para después.
export const CONTEO_URL = "https://coldwrbfxpdfutbekysr.supabase.co";
export const CONTEO_ANON = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNvbGR3cmJmeHBkZnV0YmVreXNyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODgzNjE0MzAsImV4cCI6MjEwMzkzNzQzMH0.7CloDCuNcsm4E3TcEO712RNZdTUvL_BmCrmXWHRRrrc";

let client = null;
export function conteoDb() {
  if (!client) client = createClient(CONTEO_URL, CONTEO_ANON, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false, storageKey: "poliplast-conteo-db" } });
  return client;
}
