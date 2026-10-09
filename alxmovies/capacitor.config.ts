import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  // ⚠ O appId identifica o app no Android/Play Store e NÃO pode mudar depois de publicado.
  appId: "com.alxmovies.app",
  appName: "ALXmovies",
  webDir: "dist",
  backgroundColor: "#0b0b10",

  // O app carrega os arquivos locais, mas o WebView "acha" que está em https://alxmovies.netlify.app.
  // Assim o cabeçalho Origin das requisições é o do seu site, e o CORS do Supabase (e das outras APIs) aceita.
  server: {
    hostname: "alxmovies.netlify.app",
    androidScheme: "https",
  },

  android: {
    allowMixedContent: false,
    webContentsDebuggingEnabled: false,
  },

  plugins: {
    // Tela de abertura: o NativeShell fecha assim que o app inicia; se algo travar, some sozinha em 2,5 s.
    SplashScreen: { launchAutoHide: true, launchShowDuration: 2500, backgroundColor: "#0b0b10", showSpinner: false },
    // Android moderno é "borda a borda": o conteúdo vai por baixo das barras; as margens vêm do CSS
    // (--safe-area-inset-*) que o Capacitor injeta.
    SystemBars: { insetsHandling: "css", style: "DARK", hidden: false },
  },
};

export default config;
