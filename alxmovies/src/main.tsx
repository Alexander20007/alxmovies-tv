import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AuthProvider } from "@/context/AuthContext";
import { isNative } from "@/lib/native";
import { ProfileProvider } from "@/context/ProfileContext";
import { SocialProvider } from "@/context/SocialContext";
import { ChannelsUiProvider } from "@/context/ChannelsUiContext";
import App from "./App";
import "./styles/style.css";
import "./styles/theme.css";
import "./styles/header.css";
import "./styles/home.css";
import "./styles/details.css";
import "./styles/search.css";
import "./styles/auth.css";
import "./styles/profiles.css";
import "./styles/player.css";
import "./styles/account.css";
import "./styles/immersive.css";
import "./styles/salas.css";
import "./styles/sala.css";
import "./styles/social.css";
import "./styles/legal.css";
import "./styles/cookie.css";
import "./styles/native.css";
import "./styles/native-m3.css";

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } },
});

// No app não precisa de service worker (os arquivos já estão dentro do APK)
if ("serviceWorker" in navigator && import.meta.env.PROD && !isNative) {
  navigator.serviceWorker.register("/sw.js").catch(() => {});
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <ProfileProvider>
            <SocialProvider>
              <ChannelsUiProvider>
                <App />
              </ChannelsUiProvider>
            </SocialProvider>
          </ProfileProvider>
        </AuthProvider>
      </QueryClientProvider>
    </BrowserRouter>
  </StrictMode>
);
