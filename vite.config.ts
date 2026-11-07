import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  // Proxy DESLIGADO por padrão (tudo normal/direto). Só liga com VITE_USE_PROXY=true.
  const useProxy = (process.env.VITE_USE_PROXY ?? env.VITE_USE_PROXY) === "true";
  return {
    plugins: [react()],
    resolve: { alias: { "@": path.resolve(__dirname, "src") } },
    // Constante de build (true só se VITE_USE_PROXY=true).
    define: { __USE_PROXY__: JSON.stringify(useProxy) },
    build: {
      rollupOptions: {
        output: {
          manualChunks: {
            vendor: ["react", "react-dom", "react-router-dom"],
            supabase: ["@supabase/supabase-js"],
          },
        },
      },
    },
  };
});
