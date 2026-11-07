import { isNative } from "@/lib/native";
import "./styles/style.css";
import "./styles/theme.css";
import "./styles/header.css";
import "./styles/home.css";
import "./styles/details.css";
import "./styles/search.css";
import "./styles/auth.css";
import "./styles/profiles.css";
import "./styles/player.css";
import "./styles/plans.css";
import "./styles/downloads.css";
import "./styles/avisos.css";
import "./styles/account.css";
import "./styles/immersive.css";
import "./styles/salas.css";
import "./styles/sala.css";
import "./styles/social.css";
import "./styles/legal.css";
import "./styles/cookie.css";
import "./styles/native.css";
import "./styles/native-m3.css";
import "./styles/updater.css";
import "./styles/netflix.css"; // visual estilo Netflix
import "./styles/ultra.css"; // upgrade ultra (Laura IA, mensagens, notificações, app)
import "./styles/redesign.css"; // detalhes, episódios, download e carregamento do player — sempre por último
import "./web/web.css"; // só tem regras do site (prefixo wb- e html.wb-site): não afeta o app

// O site (navegador) é só informação e download do app: carrega a versão leve (sem login nem player).
// O aplicativo carrega o app completo. O CSS é o mesmo nos dois e vem na ordem original.
if (isNative) {
  void import("./appMain");
} else {
  document.documentElement.classList.add("wb-site");
  void import("./webMain");
}
