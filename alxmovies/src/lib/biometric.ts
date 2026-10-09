const CRED_KEY = "alxmovies_biometric_cred_";
const ENABLED_KEY = "alxmovies_biometric_enabled_";
const UNLOCKED_KEY = "alxmovies_biometric_unlocked_tab";

export const isWebAuthnSupported = () => typeof window !== "undefined" && !!window.PublicKeyCredential && !!navigator.credentials;

export async function isPlatformAuthenticatorAvailable() {
  if (!isWebAuthnSupported()) return false;
  try { return await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable(); } catch { return false; }
}

const challenge = () => crypto.getRandomValues(new Uint8Array(32));
const toB64 = (buf: ArrayBuffer) => btoa(String.fromCharCode(...new Uint8Array(buf)));
const fromB64 = (b64: string) => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));

export function isBiometricEnabled(userId?: string | null) {
  if (!userId) return false;
  return localStorage.getItem(ENABLED_KEY + userId) === "1" && !!localStorage.getItem(CRED_KEY + userId);
}

export async function registerBiometric(user: { id: string; email?: string | null }) {
  if (!isWebAuthnSupported()) throw new Error("Este navegador não suporta biometria (WebAuthn).");
  const credential = (await navigator.credentials.create({
    publicKey: {
      challenge: challenge(),
      rp: { name: "ALXmovies" },
      user: { id: new TextEncoder().encode(user.id), name: user.email || "usuario", displayName: user.email || "Usuário ALXmovies" },
      pubKeyCredParams: [{ type: "public-key", alg: -7 }, { type: "public-key", alg: -257 }],
      authenticatorSelection: { authenticatorAttachment: "platform", userVerification: "required" },
      timeout: 60000, attestation: "none",
    },
  })) as PublicKeyCredential | null;
  if (!credential) throw new Error("Não foi possível registrar a biometria.");
  localStorage.setItem(CRED_KEY + user.id, toB64(credential.rawId));
  localStorage.setItem(ENABLED_KEY + user.id, "1");
}

export function disableBiometric(userId: string) {
  localStorage.removeItem(CRED_KEY + userId);
  localStorage.removeItem(ENABLED_KEY + userId);
}

export async function verifyBiometric(userId: string) {
  const id = localStorage.getItem(CRED_KEY + userId);
  if (!id) throw new Error("Nenhuma biometria cadastrada neste dispositivo.");
  const assertion = await navigator.credentials.get({
    publicKey: { challenge: challenge(), allowCredentials: [{ id: fromB64(id), type: "public-key" }], userVerification: "required", timeout: 60000 },
  });
  if (!assertion) throw new Error("Verificação biométrica falhou.");
  sessionStorage.setItem(UNLOCKED_KEY, "1");
}

export const isUnlockedThisTab = () => sessionStorage.getItem(UNLOCKED_KEY) === "1";
