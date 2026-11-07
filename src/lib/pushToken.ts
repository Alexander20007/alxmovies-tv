import { deviceNotify } from "./deviceNotify";
import { isNative } from "./native";
import { supabase } from "./supabase";

let current = "";

/** Registra este aparelho (token do Firebase) para o perfil ativo, para o servidor mandar push com o app fechado. Melhor esforço. */
export async function registerPushToken(profileId: string) {
  if (!isNative) return;
  try {
    const token = await deviceNotify.getPushToken();
    if (!token) return; // APK sem Firebase
    current = token;
    await supabase.rpc("push_register_token", { p_token: token, p_profile_id: profileId });
  } catch { /* push é opcional */ }
}

/** Ao sair da conta: este aparelho para de receber push dessa conta. */
export async function unregisterPushToken() {
  if (!isNative) return;
  try {
    const token = current || (await deviceNotify.getPushToken());
    if (token) await supabase.rpc("push_unregister_token", { p_token: token });
  } catch { /* ignora */ }
  current = "";
}
