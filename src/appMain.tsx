import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AuthProvider } from "@/context/AuthContext";
import { isNative } from "@/lib/native";
import { ProfileProvider } from "@/context/ProfileContext";
import { SocialProvider } from "@/context/SocialContext";
import { ChannelsUiProvider } from "@/context/ChannelsUiContext";
import { DownloadsProvider } from "@/context/DownloadsContext";
import App from "./App";

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false, staleTime: 3 * 60_000 } },
});

// No app não precisa de service worker (os arquivos já estão dentro do APK)

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <ProfileProvider>
            <SocialProvider>
              <ChannelsUiProvider>
                <DownloadsProvider>
                  <App />
                </DownloadsProvider>
              </ChannelsUiProvider>
            </SocialProvider>
          </ProfileProvider>
        </AuthProvider>
      </QueryClientProvider>
    </BrowserRouter>
  </StrictMode>
);
