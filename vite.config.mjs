import { defineConfig } from "vite";

// Poliplast App (28/11): los módulos nativos traen código de carpetas con su propio node_modules (entregas/).
// Se fuerza UNA sola copia de cada librería compartida (dos React rompen todo; dos Supabase pisan la sesión).
export default defineConfig({
  resolve: {
    dedupe: ["react", "react-dom", "@supabase/supabase-js", "lucide-react", "pdfjs-dist", "pdf-lib", "tesseract.js"],
  },
});
