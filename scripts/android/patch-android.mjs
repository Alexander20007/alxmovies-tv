// Ajusta o projeto Android que o Capacitor gera (rodado pelo GitHub Actions depois de `cap add android`).
// Não precisa rodar na sua máquina.
import fs from "node:fs";
import path from "node:path";

const androidDir = path.join(process.cwd(), "android");
// Proxy: mesma chave do app (padrão DESLIGADO). Só com VITE_USE_PROXY=true o verificador de versão nativo usa o proxy.
const useProxy = process.env.VITE_USE_PROXY === "true";
const proxyUrl = String(process.env.VITE_PROXY_URL || "https://alx-proxy.alexander221alex.workers.dev").replace(/\/+$/, "");
const releaseApi = useProxy ? `${proxyUrl}/release` : "https://api.github.com/repos/Alexander20007/alxmovies-tv/releases/latest";
const manifestPath = path.join(androidDir, "app/src/main/AndroidManifest.xml");
const gradlePath = path.join(androidDir, "app/build.gradle");

if (!fs.existsSync(manifestPath) || !fs.existsSync(gradlePath)) {
  console.error("✗ Projeto Android não encontrado. Rode `npx cap add android` antes.");
  process.exit(1);
}

const log = (msg) => console.log("•", msg);

// ---------- AndroidManifest.xml ----------
let manifest = fs.readFileSync(manifestPath, "utf8");

for (const perm of ["android.permission.INTERNET", "android.permission.ACCESS_NETWORK_STATE", "android.permission.WAKE_LOCK"]) {
  if (!manifest.includes(perm)) {
    manifest = manifest.replace(/<application/, `<uses-permission android:name="${perm}" />\n    <application`);
    log(`permissão ${perm}`);
  }
}
// Canais de TV usam links http:// (sem https). O Android bloqueia isso por padrão, então o player nativo não abriria esses canais.
if (!/usesCleartextTraffic/.test(manifest)) {
  manifest = manifest.replace(/<application/, `<application\n        android:usesCleartextTraffic="true"`);
  log("tráfego HTTP liberado (canais de TV com link http://)");
}
// O app é em retrato; o player gira para paisagem sozinho (plugin Screen Orientation).
if (!/android:screenOrientation/.test(manifest)) {
  manifest = manifest.replace(/<activity\b/, `<activity\n            android:screenOrientation="portrait"`);
  log("orientação padrão: retrato");
}
// Links compartilhados do site (detalhes, canal, sala…) abrem o APP quando ele está instalado (Android App Links).
// A página inicial e as políticas continuam abrindo no navegador.
// Precisa de /.well-known/assetlinks.json no site com a impressão digital (SHA-256) da chave que assina o APK.
if (!/android:autoVerify/.test(manifest)) {
  const host = process.env.APP_HOST || "alxmovies.netlify.app";
  manifest = manifest.replace(/<\/activity>/, `    <intent-filter android:autoVerify="true">
                <action android:name="android.intent.action.VIEW" />
                <category android:name="android.intent.category.DEFAULT" />
                <category android:name="android.intent.category.BROWSABLE" />
                <data android:scheme="https" android:host="${host}" />
                <data android:pathPrefix="/details" />
                <data android:pathPrefix="/info" />
                <data android:pathPrefix="/episodes" />
                <data android:pathPrefix="/watch" />
                <data android:pathPrefix="/person" />
                <data android:pathPrefix="/canal" />
                <data android:pathPrefix="/sala" />
            </intent-filter>
        </activity>`);
  log(`links https://${host} abrem o app (App Links)`);
}
// Evita recarregar a página quando o app muda de tamanho/densidade (ex.: girar a tela)
manifest = manifest.replace(/android:configChanges="([^"]*)"/, (all, v) =>
  v.includes("density") ? all : `android:configChanges="${v}|density"`);
fs.writeFileSync(manifestPath, manifest);

// ---------- app/build.gradle: versão ----------
let gradle = fs.readFileSync(gradlePath, "utf8");
const code = Number(process.env.VERSION_CODE || 1);
const name = process.env.VERSION_NAME || "1.0.0";
gradle = gradle.replace(/versionCode\s*=?\s*\d+/, `versionCode ${code}`);
gradle = gradle.replace(/versionName\s*=?\s*"[^"]*"/, `versionName "${name}"`);
// R8 (ofuscação/compactação do código Java) no release. NÃO usamos shrinkResources: o ícone da notificação é
// procurado pelo nome ("ic_stat_alx") e seria removido. As regras "keep" abaixo protegem o Capacitor e os plugins do app.
if (/minifyEnabled\s+false/.test(gradle)) {
  gradle = gradle.replace(/minifyEnabled\s+false/, "minifyEnabled true");
  log("R8 ativado no release (minifyEnabled true)");
} else {
  console.warn("⚠ minifyEnabled não encontrado no build.gradle; R8 não foi ativado.");
}
fs.writeFileSync(gradlePath, gradle);
log(`versão ${name} (código ${code})`);
{
  const rules = path.join(androidDir, "app/proguard-rules.pro");
  const keep = `
# ===== ALXmovies: regras para o R8 (Capacitor + plugins próprios) =====
-keep class com.getcapacitor.** { *; }
-keep @com.getcapacitor.annotation.CapacitorPlugin class * { *; }
-keep class * extends com.getcapacitor.Plugin { *; }
-keep class * extends com.getcapacitor.BridgeActivity { *; }
-keepclassmembers class * { @com.getcapacitor.PluginMethod <methods>; }
-keepclassmembers class * { @android.webkit.JavascriptInterface <methods>; }
-keep public class * extends android.app.Activity
-keep public class * extends android.webkit.WebViewClient
-keep class * extends androidx.work.ListenableWorker { public <init>(...); }
-keep class * extends com.google.firebase.messaging.FirebaseMessagingService { *; }
-keep class com.alxmovies.app.** { *; }
-keepattributes *Annotation*,Signature,InnerClasses,EnclosingMethod,SourceFile,LineNumberTable
-renamesourcefileattribute SourceFile
-dontwarn org.slf4j.**
`;
  const cur = fs.existsSync(rules) ? fs.readFileSync(rules, "utf8") : "";
  if (!cur.includes("ALXmovies: regras para o R8")) fs.writeFileSync(rules, cur + keep);
}


// ---------- Atualização automática dentro do app (plugin nativo "AppUpdater") ----------
// Baixa o APK novo (com progresso) e abre o instalador do Android. O lado React está em src/lib/updater.ts.
{
  const javaRoot = path.join(androidDir, "app/src/main/java");
  const findFile = (dir, name) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) { const r = findFile(full, name); if (r) return r; }
      else if (e.name === name) return full;
    }
    return null;
  };
  const mainJava = fs.existsSync(javaRoot) ? findFile(javaRoot, "MainActivity.java") : null;
  if (!mainJava) {
    console.error("✗ MainActivity.java não encontrada (atualização automática não instalada).");
    process.exit(1);
  }
  const pkg = /package\s+([\w.]+);/.exec(fs.readFileSync(mainJava, "utf8"))[1];
  const pkgDir = path.dirname(mainJava);

  fs.writeFileSync(path.join(pkgDir, "UpdateFileProvider.java"),
`package ${pkg};

import androidx.core.content.FileProvider;

/** FileProvider próprio do atualizador (não conflita com o do Capacitor). */
public class UpdateFileProvider extends FileProvider {}
`);

  fs.writeFileSync(path.join(pkgDir, "AppUpdaterPlugin.java"),
`package ${pkg};

import android.content.Intent;
import android.content.pm.PackageInfo;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;
import androidx.core.content.FileProvider;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;

/** Baixa o APK novo para o cache do app, mostra progresso e chama o instalador do Android. */
@CapacitorPlugin(name = "AppUpdater")
public class AppUpdaterPlugin extends Plugin {
  private volatile boolean cancelled = false;

  private File updatesDir() {
    File d = new File(getContext().getCacheDir(), "updates");
    if (!d.exists()) d.mkdirs();
    return d;
  }

  private void wipe() {
    File[] files = updatesDir().listFiles();
    if (files != null) for (File f : files) f.delete();
  }

  @PluginMethod
  public void download(final PluginCall call) {
    final String url = call.getString("url");
    final long expected = call.getData().optLong("size", 0);
    if (url == null || !url.startsWith("https://")) { call.reject("Endereço de download inválido."); return; }
    cancelled = false;

    new Thread(() -> {
      HttpURLConnection conn = null;
      try {
        wipe();
        File part = new File(updatesDir(), "update.apk.part");
        File out = new File(updatesDir(), "update.apk");

        conn = (HttpURLConnection) new URL(url).openConnection();
        conn.setConnectTimeout(15000);
        conn.setReadTimeout(30000);
        conn.setInstanceFollowRedirects(true);
        conn.setRequestProperty("Accept", "application/octet-stream");
        int code = conn.getResponseCode();
        if (code != 200) throw new Exception("Servidor respondeu " + code);

        long total = conn.getContentLengthLong();
        if (total <= 0) total = expected;
        long received = 0;
        int lastPercent = -1;
        long lastEmit = 0;

        try (InputStream in = conn.getInputStream(); OutputStream os = new FileOutputStream(part)) {
          byte[] buf = new byte[32 * 1024];
          int n;
          while ((n = in.read(buf)) != -1) {
            if (cancelled) { part.delete(); call.reject("cancelled"); return; }
            os.write(buf, 0, n);
            received += n;
            int percent = total > 0 ? (int) (received * 100 / total) : -1;
            long now = System.currentTimeMillis();
            if (percent != lastPercent && now - lastEmit > 120) {
              lastPercent = percent; lastEmit = now;
              JSObject p = new JSObject();
              p.put("received", received);
              p.put("total", total);
              p.put("percent", percent);
              notifyListeners("downloadProgress", p);
            }
          }
        }

        if (total > 0 && received != total) { part.delete(); throw new Exception("Download incompleto."); }
        if (!part.renameTo(out)) throw new Exception("Não foi possível salvar o arquivo.");

        // Segurança: só aceita um APK do próprio ALXmovies.
        PackageInfo info = getContext().getPackageManager().getPackageArchiveInfo(out.getAbsolutePath(), 0);
        if (info == null || !getContext().getPackageName().equals(info.packageName)) {
          out.delete();
          throw new Exception("O arquivo baixado não é um APK válido do ALXmovies.");
        }

        JSObject ret = new JSObject();
        ret.put("path", out.getAbsolutePath());
        call.resolve(ret);
      } catch (Exception e) {
        call.reject(e.getMessage() == null ? "Falha no download." : e.getMessage());
      } finally {
        if (conn != null) conn.disconnect();
      }
    }).start();
  }

  @PluginMethod
  public void cancel(PluginCall call) {
    cancelled = true;
    call.resolve();
  }

  @PluginMethod
  public void canInstall(PluginCall call) {
    boolean ok = Build.VERSION.SDK_INT < Build.VERSION_CODES.O
      || getContext().getPackageManager().canRequestPackageInstalls();
    JSObject ret = new JSObject();
    ret.put("allowed", ok);
    call.resolve(ret);
  }

  @PluginMethod
  public void openInstallSettings(PluginCall call) {
    Intent i = new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:" + getContext().getPackageName()));
    i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
    getContext().startActivity(i);
    call.resolve();
  }

  @PluginMethod
  public void install(PluginCall call) {
    File apk = new File(updatesDir(), "update.apk");
    if (!apk.exists()) { call.reject("Arquivo de atualização não encontrado."); return; }
    try {
      Uri uri = FileProvider.getUriForFile(getContext(), getContext().getPackageName() + ".updater", apk);
      Intent i = new Intent(Intent.ACTION_VIEW);
      i.setDataAndType(uri, "application/vnd.android.package-archive");
      i.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);
      getContext().startActivity(i);
      call.resolve();
    } catch (Exception e) {
      call.reject(e.getMessage() == null ? "Não foi possível abrir o instalador." : e.getMessage());
    }
  }

  /** Apaga APKs antigos (chamado quando o app abre). */
  @PluginMethod
  public void cleanup(PluginCall call) {
    wipe();
    call.resolve();
  }
}
`);

  // plugin que informa a altura real da barra de status / navegação (usado pelo CSS: --sat / --sab)
  fs.writeFileSync(path.join(pkgDir, "EdgeInsetsPlugin.java"),
`package ${pkg};

import android.view.View;
import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowInsetsCompat;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/** Devolve as margens das barras do sistema (em px de CSS) para o app desenhar por baixo delas (borda a borda). */
@CapacitorPlugin(name = "EdgeInsets")
public class EdgeInsetsPlugin extends Plugin {
  @PluginMethod
  public void get(final PluginCall call) {
    getActivity().runOnUiThread(() -> {
      JSObject ret = new JSObject();
      try {
        View decor = getActivity().getWindow().getDecorView();
        WindowInsetsCompat wi = ViewCompat.getRootWindowInsets(decor);
        float d = getContext().getResources().getDisplayMetrics().density;
        if (wi == null) {
          ret.put("ready", false);
        } else {
          Insets in = wi.getInsets(WindowInsetsCompat.Type.systemBars() | WindowInsetsCompat.Type.displayCutout());
          ret.put("ready", true);
          ret.put("top", Math.round(in.top / d));
          ret.put("bottom", Math.round(in.bottom / d));
          ret.put("left", Math.round(in.left / d));
          ret.put("right", Math.round(in.right / d));
        }
      } catch (Exception e) {
        ret.put("ready", false);
      }
      call.resolve(ret);
    });
  }
}
`);

  // registra os plugins na MainActivity e liga o modo borda a borda (status bar transparente, desenha por trás)
  fs.writeFileSync(mainJava,
`package ${pkg};

import android.graphics.Color;
import android.os.Build;
import android.os.Bundle;
import android.view.Window;
import android.view.WindowManager;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsControllerCompat;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
  @Override
  public void onCreate(Bundle savedInstanceState) {
    registerPlugin(AppUpdaterPlugin.class);
    registerPlugin(EdgeInsetsPlugin.class);
    registerPlugin(AlxNotifyPlugin.class);
    registerPlugin(AlxDownloadPlugin.class);
    registerPlugin(AlxPlayerPlugin.class);
    registerPlugin(AlxRoomPlayerPlugin.class);
    registerPlugin(AlxAdsPlugin.class);
    registerPlugin(AlxDownloadsPlugin.class);
    super.onCreate(savedInstanceState);
    enableEdgeToEdge();
    // guarda o motivo de um fechamento inesperado para aparecer em Minha conta > Diagnóstico
    final Thread.UncaughtExceptionHandler prevHandler = Thread.getDefaultUncaughtExceptionHandler();
    Thread.setDefaultUncaughtExceptionHandler((t, e) -> {
      try {
        java.io.StringWriter sw = new java.io.StringWriter();
        e.printStackTrace(new java.io.PrintWriter(sw));
        getSharedPreferences("alx_crash", 0).edit().putString("trace", sw.toString()).putLong("at", System.currentTimeMillis()).commit();
      } catch (Throwable ignored) {}
      if (prevHandler != null) prevHandler.uncaughtException(t, e);
    });
    AlxUpdateWorker.schedule(this);
  }

  @Override
  public void onResume() {
    super.onResume();
    enableEdgeToEdge();
  }

  /** O app desenha por trás da status bar e da barra de navegação, que ficam transparentes com ícones claros. */
  private void enableEdgeToEdge() {
    Window w = getWindow();
    WindowCompat.setDecorFitsSystemWindows(w, false);
    w.setStatusBarColor(Color.TRANSPARENT);
    w.setNavigationBarColor(Color.TRANSPARENT);
    if (Build.VERSION.SDK_INT >= 29) {
      w.setStatusBarContrastEnforced(false);
      w.setNavigationBarContrastEnforced(false);
    }
    if (Build.VERSION.SDK_INT >= 28) {
      WindowManager.LayoutParams lp = w.getAttributes();
      lp.layoutInDisplayCutoutMode = WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES;
      w.setAttributes(lp);
    }
    WindowInsetsControllerCompat c = WindowCompat.getInsetsController(w, w.getDecorView());
    c.setAppearanceLightStatusBars(false);
    c.setAppearanceLightNavigationBars(false);
  }
}
`);
  log("modo borda a borda (status bar transparente) + plugin EdgeInsets");


  // ---------- Firebase (push com o app fechado) — só entra se o google-services.json existir (secret GOOGLE_SERVICES_JSON) ----------
  const hasFirebase = fs.existsSync(path.join(androidDir, "app/google-services.json"));
  const tokenMethod = hasFirebase
    ? `  /** Token FCM deste aparelho (o JS registra no Supabase para o servidor poder mandar push). */
  @PluginMethod
  public void getPushToken(final PluginCall call) {
    try {
      com.google.firebase.messaging.FirebaseMessaging.getInstance().getToken().addOnCompleteListener(task -> {
        JSObject r = new JSObject();
        r.put("token", task.isSuccessful() && task.getResult() != null ? task.getResult() : "");
        call.resolve(r);
      });
    } catch (Exception e) {
      JSObject r = new JSObject();
      r.put("token", "");
      call.resolve(r);
    }
  }`
    : `  /** Este APK foi compilado sem Firebase: sem push com o app fechado. */
  @PluginMethod
  public void getPushToken(final PluginCall call) {
    JSObject r = new JSObject();
    r.put("token", "");
    call.resolve(r);
  }`;

  // ---------- Notificações do aparelho (mensagens / pedidos de amizade) com resposta direto pela barra ----------
  // Plugin nativo "AlxNotify": o JS manda mostrar a notificação; os botões "Responder", "Aceitar", "Recusar" e
  // "Marcar como lida" são tratados por um BroadcastReceiver que chama o Supabase direto (sem abrir o app).
  const iconDir = path.join(androidDir, "app/src/main/res/drawable");
  fs.mkdirSync(iconDir, { recursive: true });
  fs.writeFileSync(path.join(iconDir, "ic_stat_alx.xml"),
`<?xml version="1.0" encoding="utf-8"?>
<vector xmlns:android="http://schemas.android.com/apk/res/android"
    android:width="24dp" android:height="24dp" android:viewportWidth="24" android:viewportHeight="24">
    <path android:fillColor="#FFFFFFFF" android:pathData="M8,5v14l11,-7z"/>
</vector>
`);

  fs.writeFileSync(path.join(pkgDir, "AlxNotifyHelper.java"),
`package ${pkg};

import android.annotation.SuppressLint;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.os.Build;
import android.service.notification.StatusBarNotification;
import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;
import androidx.core.app.Person;
import androidx.core.app.RemoteInput;
import androidx.core.content.ContextCompat;

/** Monta e publica as notificações do ALXmovies (usado pelo plugin e pelo receiver das ações). */
final class AlxNotifyHelper {
  private AlxNotifyHelper() {}

  /** true enquanto o app está na tela (aí o push não mostra nada: o app já mostra por dentro). */
  static volatile boolean appVisible = false;

  /** Evita notificar duas vezes a mesma coisa (tempo real do app + push do Firebase). Guarda as últimas 40 chaves. */
  static synchronized boolean firstTime(Context c, String key) {
    android.content.SharedPreferences sp = c.getSharedPreferences("alx_seen", Context.MODE_PRIVATE);
    String cur = sp.getString("ids", "");
    String[] parts = cur.isEmpty() ? new String[0] : cur.split(",");
    for (String p : parts) if (p.equals(key)) return false;
    StringBuilder sb = new StringBuilder();
    for (int i = Math.max(0, parts.length - 39); i < parts.length; i++) sb.append(parts[i]).append(',');
    sb.append(key);
    sp.edit().putString("ids", sb.toString()).apply();
    return true;
  }

  static final String PREFS = "alx_notify";
  static final String CH_MESSAGES = "alx_messages";
  static final String CH_SOCIAL = "alx_social";
  static final String CH_SENDING = "alx_sending";
  static final String CH_UPDATES = "alx_updates";
  static final String CH_AVISOS = "alx_avisos";
  static final String KEY_REPLY = "alx_reply";
  static final String ACT_REPLY = "alxmovies.notify.REPLY";
  static final String ACT_READ = "alxmovies.notify.READ";
  static final String ACT_ACCEPT = "alxmovies.notify.ACCEPT";
  static final String ACT_DECLINE = "alxmovies.notify.DECLINE";

  static void ensureChannels(Context c) {
    if (Build.VERSION.SDK_INT < 26) return;
    NotificationManager nm = c.getSystemService(NotificationManager.class);
    if (nm == null) return;
    NotificationChannel m = new NotificationChannel(CH_MESSAGES, "Mensagens", NotificationManager.IMPORTANCE_HIGH);
    m.setDescription("Mensagens dos seus amigos");
    NotificationChannel s = new NotificationChannel(CH_SOCIAL, "Pedidos de amizade", NotificationManager.IMPORTANCE_DEFAULT);
    s.setDescription("Pedidos de amizade novos e aceitos");
    nm.createNotificationChannel(m);
    NotificationChannel q = new NotificationChannel(CH_SENDING, "Enviando respostas", NotificationManager.IMPORTANCE_LOW);
    q.setDescription("Aparece por instantes enquanto sua resposta é enviada");
    nm.createNotificationChannel(s);
    nm.createNotificationChannel(q);
    NotificationChannel u = new NotificationChannel(CH_UPDATES, "Atualizações do app", NotificationManager.IMPORTANCE_DEFAULT);
    u.setDescription("Avisa quando existe uma versão nova do ALXmovies");
    nm.createNotificationChannel(u);
    NotificationChannel av = new NotificationChannel(CH_AVISOS, "Avisos do ALXmovies", NotificationManager.IMPORTANCE_HIGH);
    av.setDescription("Comunicados e novidades enviados pela equipe do ALXmovies");
    nm.createNotificationChannel(av);
  }

  static int idFor(String key) { return key.hashCode() & 0x7fffffff; }

  static int smallIcon(Context c) {
    int id = c.getResources().getIdentifier("ic_stat_alx", "drawable", c.getPackageName());
    return id != 0 ? id : c.getApplicationInfo().icon;
  }

  private static boolean canPost(Context c) {
    if (Build.VERSION.SDK_INT >= 33
        && ContextCompat.checkSelfPermission(c, "android.permission.POST_NOTIFICATIONS") != PackageManager.PERMISSION_GRANTED) return false;
    return NotificationManagerCompat.from(c).areNotificationsEnabled();
  }

  @SuppressLint("MissingPermission")
  private static void post(Context c, int nid, Notification n) {
    if (!canPost(c)) return;
    try { NotificationManagerCompat.from(c).notify(nid, n); } catch (SecurityException ignored) {}
  }

  private static Notification active(Context c, int nid) {
    if (Build.VERSION.SDK_INT < 23) return null;
    try {
      NotificationManager nm = c.getSystemService(NotificationManager.class);
      if (nm == null) return null;
      for (StatusBarNotification sbn : nm.getActiveNotifications()) if (sbn.getId() == nid) return sbn.getNotification();
    } catch (Exception ignored) {}
    return null;
  }

  private static PendingIntent openIntent(Context c, int nid, String kind, String fid) {
    Intent i = new Intent(c, MainActivity.class);
    i.setAction(Intent.ACTION_MAIN);
    i.addCategory(Intent.CATEGORY_LAUNCHER);
    i.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
    i.putExtra("alx_kind", kind);
    if (fid != null) i.putExtra("alx_fid", fid);
    return PendingIntent.getActivity(c, nid, i, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
  }

  private static PendingIntent actionIntent(Context c, int nid, String action, String fid, String pid, String name, boolean mutable) {
    Intent i = new Intent(c, AlxNotifyReceiver.class);
    i.setAction(action);
    i.putExtra("nid", nid);
    i.putExtra("fid", fid);
    i.putExtra("pid", pid);
    i.putExtra("name", name);
    int flags = PendingIntent.FLAG_UPDATE_CURRENT;
    if (mutable && Build.VERSION.SDK_INT >= 31) flags |= PendingIntent.FLAG_MUTABLE;
    else flags |= PendingIntent.FLAG_IMMUTABLE;
    return PendingIntent.getBroadcast(c, nid, i, flags);
  }

  /** Resposta: abre uma tela invisível (o app fica em primeiro plano por instantes e o Android libera a rede), envia e fecha sozinha. */
  private static PendingIntent replyIntent(Context c, int nid, String fid, String pid, String name) {
    Intent i = new Intent(c, AlxReplyActivity.class);
    i.setAction(ACT_REPLY);
    i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_NO_ANIMATION | Intent.FLAG_ACTIVITY_EXCLUDE_FROM_RECENTS);
    i.putExtra("nid", nid);
    i.putExtra("fid", fid);
    i.putExtra("pid", pid);
    i.putExtra("name", name);
    int flags = PendingIntent.FLAG_UPDATE_CURRENT;
    if (Build.VERSION.SDK_INT >= 31) flags |= PendingIntent.FLAG_MUTABLE;
    return PendingIntent.getActivity(c, nid + 7, i, flags);
  }

  /** Conversa: acumula as mensagens do mesmo amigo numa notificação só. "incoming" = nova mensagem dele; "mine" = resposta enviada pela barra. */
  static void showMessage(Context c, String fid, String pid, String name, String incoming, long ts, String mine, boolean quiet) {
    ensureChannels(c);
    int nid = idFor("m:" + fid);
    Person me = new Person.Builder().setName("Você").build();
    Person them = new Person.Builder().setName(name == null || name.isEmpty() ? "Amigo" : name).build();

    NotificationCompat.MessagingStyle style = null;
    Notification existing = active(c, nid);
    if (existing != null) style = NotificationCompat.MessagingStyle.extractMessagingStyleFromNotification(existing);
    if (style == null) style = new NotificationCompat.MessagingStyle(me);
    if (incoming != null) style.addMessage(incoming, ts, them);
    if (mine != null) style.addMessage(mine, System.currentTimeMillis(), (Person) null);

    int icon = smallIcon(c);
    RemoteInput input = new RemoteInput.Builder(KEY_REPLY).setLabel("Responder a " + them.getName()).build();
    NotificationCompat.Action reply = new NotificationCompat.Action.Builder(icon, "Responder", replyIntent(c, nid, fid, pid, name))
      .addRemoteInput(input)
      .setSemanticAction(NotificationCompat.Action.SEMANTIC_ACTION_REPLY)
      .setShowsUserInterface(true)
      .build();
    NotificationCompat.Action read = new NotificationCompat.Action.Builder(icon, "Marcar como lida", actionIntent(c, nid, ACT_READ, fid, pid, name, false))
      .setSemanticAction(NotificationCompat.Action.SEMANTIC_ACTION_MARK_AS_READ)
      .setShowsUserInterface(false)
      .build();

    NotificationCompat.Builder b = new NotificationCompat.Builder(c, CH_MESSAGES)
      .setSmallIcon(icon)
      .setStyle(style)
      .setCategory(NotificationCompat.CATEGORY_MESSAGE)
      .setPriority(NotificationCompat.PRIORITY_HIGH)
      .setAutoCancel(true)
      .setOnlyAlertOnce(quiet)
      .setWhen(mine != null ? System.currentTimeMillis() : ts)
      .setContentIntent(openIntent(c, nid, "message", fid))
      .addAction(reply)
      .addAction(read);
    post(c, nid, b.build());
  }

  /** Pedido de amizade novo (com Aceitar / Recusar) ou "aceitou seu pedido" (só informa). */
  static void showFriendEvent(Context c, String kind, String fid, String pid, String name) {
    ensureChannels(c);
    boolean request = "friend_request".equals(kind);
    int nid = idFor("r:" + fid);
    String who = name == null || name.isEmpty() ? "Alguém" : name;
    int icon = smallIcon(c);
    NotificationCompat.Builder b = new NotificationCompat.Builder(c, CH_SOCIAL)
      .setSmallIcon(icon)
      .setContentTitle(request ? "Novo pedido de amizade" : "Pedido aceito")
      .setContentText(request ? who + " quer ser seu amigo." : who + " aceitou seu pedido de amizade.")
      .setCategory(NotificationCompat.CATEGORY_SOCIAL)
      .setPriority(NotificationCompat.PRIORITY_DEFAULT)
      .setAutoCancel(true)
      .setContentIntent(openIntent(c, nid, kind, fid));
    if (request) {
      b.addAction(new NotificationCompat.Action.Builder(icon, "Aceitar", actionIntent(c, nid, ACT_ACCEPT, fid, pid, name, false)).setShowsUserInterface(false).build());
      b.addAction(new NotificationCompat.Action.Builder(icon, "Recusar", actionIntent(c, nid, ACT_DECLINE, fid, pid, name, false)).setShowsUserInterface(false).build());
    }
    post(c, nid, b.build());
  }

  /** Resultado de uma ação (enviado, erro, aceito…) no lugar da notificação original. */
  static void showInfo(Context c, int nid, String channel, String title, String text, String kind, String fid) {
    ensureChannels(c);
    NotificationCompat.Builder b = new NotificationCompat.Builder(c, channel)
      .setSmallIcon(smallIcon(c))
      .setContentTitle(title)
      .setContentText(text)
      .setStyle(new NotificationCompat.BigTextStyle().bigText(text))
      .setAutoCancel(true)
      .setOnlyAlertOnce(true)
      .setTimeoutAfter(15000)
      .setContentIntent(openIntent(c, nid, kind, fid));
    post(c, nid, b.build());
  }

  /** "Nova versão disponível": tocar abre o app direto na tela de atualização. */
  static void showUpdate(Context c, String version) {
    ensureChannels(c);
    String v = version.startsWith("v") ? version.substring(1) : version;
    String text = "A versão " + v + " já está disponível. Toque para atualizar.";
    int nid = idFor("app-update");
    NotificationCompat.Builder b = new NotificationCompat.Builder(c, CH_UPDATES)
      .setSmallIcon(smallIcon(c))
      .setContentTitle("Nova versão do ALXmovies")
      .setContentText(text)
      .setStyle(new NotificationCompat.BigTextStyle().bigText(text))
      .setAutoCancel(true)
      .setOnlyAlertOnce(true)
      .setContentIntent(openIntent(c, nid, "app_update", null));
    post(c, nid, b.build());
  }

  static void cancel(Context c, int nid) { NotificationManagerCompat.from(c).cancel(nid); }
  static void cancelAll(Context c) { NotificationManagerCompat.from(c).cancelAll(); }
}
`);

  fs.writeFileSync(path.join(pkgDir, "AlxNotifyReceiver.java"),
`package ${pkg};

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Bundle;
import androidx.core.app.RemoteInput;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import org.json.JSONObject;

/** Trata os botões da notificação (responder, aceitar, recusar, marcar como lida) falando direto com o Supabase. */
public class AlxNotifyReceiver extends BroadcastReceiver {
  @Override
  public void onReceive(final Context ctx, final Intent intent) {
    final String action = intent.getAction();
    if (action == null) return;
    String typed = null;
    if (AlxNotifyHelper.ACT_REPLY.equals(action)) {
      Bundle r = RemoteInput.getResultsFromIntent(intent);
      CharSequence cs = r == null ? null : r.getCharSequence(AlxNotifyHelper.KEY_REPLY);
      typed = cs == null ? "" : cs.toString().trim();
    }
    final String text = typed;

    // 1) Serviço em primeiro plano: com ele o Android libera a rede mesmo com o app fechado (alguns celulares cortam a rede em segundo plano)
    try {
      Intent svc = new Intent(ctx, AlxSendService.class);
      svc.putExtra("act", action);
      svc.putExtra("text", text == null ? "" : text);
      svc.putExtra("nid", intent.getIntExtra("nid", 0));
      svc.putExtra("fid", intent.getStringExtra("fid"));
      svc.putExtra("pid", intent.getStringExtra("pid"));
      svc.putExtra("name", intent.getStringExtra("name"));
      androidx.core.content.ContextCompat.startForegroundService(ctx, svc);
      return;
    } catch (Exception ignored) {}

    // 2) Plano B: envia direto daqui
    final PendingResult pending = goAsync();
    new Thread(() -> {
      try { handle(ctx.getApplicationContext(), intent, action, text); }
      catch (Exception ignored) {}
      finally { pending.finish(); }
    }).start();
  }

  /** Resultado de uma chamada: código HTTP (-1 = falha de rede) e um detalhe curto do erro. */
  static class Res { int code = -1; String detail = ""; }

  /** Com o proxy ligado cada chamada precisa de um nonce de uso único (GET <proxy>/nonce). */
  static String fetchNonce(String proxy) {
    HttpURLConnection c = null;
    try {
      c = (HttpURLConnection) new URL(proxy + "/nonce").openConnection();
      c.setConnectTimeout(6000);
      c.setReadTimeout(6000);
      if (c.getResponseCode() != 200) return null;
      java.io.ByteArrayOutputStream bo = new java.io.ByteArrayOutputStream();
      try (java.io.InputStream in = c.getInputStream()) {
        byte[] buf = new byte[512];
        int n;
        while ((n = in.read(buf)) > 0) bo.write(buf, 0, n);
      }
      return new JSONObject(bo.toString("UTF-8")).optString("nonce", null);
    } catch (Exception e) {
      return null;
    } finally {
      if (c != null) c.disconnect();
    }
  }

  static Res rpc(SharedPreferences sp, String fn, JSONObject body) {
    Res r = new Res();
    for (int attempt = 0; attempt < 2; attempt++) {
      HttpURLConnection c = null;
      try {
        c = (HttpURLConnection) new URL(sp.getString("url", "") + "/rest/v1/rpc/" + fn).openConnection();
        c.setRequestMethod("POST");
        c.setConnectTimeout(8000);
        c.setReadTimeout(10000);
        c.setDoOutput(true);
        c.setRequestProperty("Content-Type", "application/json");
        c.setRequestProperty("Accept", "application/json");
        c.setRequestProperty("apikey", sp.getString("key", ""));
        c.setRequestProperty("Authorization", "Bearer " + sp.getString("token", ""));
        String px = sp.getString("proxy", "");
        if (!px.isEmpty()) {
          String nonce = fetchNonce(px);
          if (nonce != null) c.setRequestProperty("X-Nonce", nonce);
        }
        try (OutputStream os = c.getOutputStream()) { os.write(body.toString().getBytes("UTF-8")); }
        r.code = c.getResponseCode();
        if (r.code >= 300) {
          try (java.io.InputStream es = c.getErrorStream()) {
            if (es != null) {
              java.io.ByteArrayOutputStream bo = new java.io.ByteArrayOutputStream();
              byte[] buf = new byte[1024];
              int n, total = 0;
              while ((n = es.read(buf)) > 0 && total < 2048) { bo.write(buf, 0, n); total += n; }
              String raw = bo.toString("UTF-8");
              try { raw = new JSONObject(raw).optString("message", raw); } catch (Exception ignored) {}
              r.detail = raw.length() > 160 ? raw.substring(0, 160) : raw;
            }
          } catch (Exception ignored) {}
        }
        return r; // resposta HTTP (boa ou ruim): não repete
      } catch (Exception e) {
        r.code = -1;
        r.detail = e.getClass().getSimpleName() + (e.getMessage() == null ? "" : ": " + e.getMessage());
        Throwable cause = e.getCause();
        if (cause != null) r.detail += " / " + cause.getClass().getSimpleName() + (cause.getMessage() == null ? "" : ": " + cause.getMessage());
        try { Thread.sleep(1500); } catch (InterruptedException ignored) {}
      } finally {
        if (c != null) c.disconnect();
      }
    }
    return r;
  }

  static String why(Res r) {
    if (r.code == 401) return "Sessão expirada — abra o app.";
    if (r.code == -1) return "Falha de rede (" + r.detail + ").";
    return "Erro " + r.code + (r.detail.isEmpty() ? "" : ": " + r.detail) + ".";
  }

  static void handle(Context ctx, Intent in, String action, String text) throws Exception {
    SharedPreferences sp = ctx.getSharedPreferences(AlxNotifyHelper.PREFS, Context.MODE_PRIVATE);
    int nid = in.getIntExtra("nid", 0);
    String fid = in.getStringExtra("fid");
    String pid = in.getStringExtra("pid");
    String name = in.getStringExtra("name");
    boolean reply = AlxNotifyHelper.ACT_REPLY.equals(action);
    String channel = reply || AlxNotifyHelper.ACT_READ.equals(action) ? AlxNotifyHelper.CH_MESSAGES : AlxNotifyHelper.CH_SOCIAL;
    String kind = reply || AlxNotifyHelper.ACT_READ.equals(action) ? "message" : "friend_request";

    if (reply && (text == null || text.isEmpty())) {
      AlxNotifyHelper.showMessage(ctx, fid, pid, name, null, System.currentTimeMillis(), null, true);
      return;
    }
    boolean ready = !sp.getString("url", "").isEmpty() && !sp.getString("token", "").isEmpty() && pid != null && fid != null;
    if (!ready) {
      AlxNotifyHelper.showInfo(ctx, nid, channel, "Abra o ALXmovies", reply ? "Sua resposta não foi enviada: entre no app e tente de novo." : "Entre no app para continuar.", kind, fid);
      return;
    }

    Res res;
    try {
      JSONObject b = new JSONObject();
      b.put("p_profile_id", pid);
      b.put("p_friendship_id", fid);
      if (reply) {
        b.put("p_body", text);
        b.put("p_kind", "text");
        res = rpc(sp, "social_send_message", b);
      } else if (AlxNotifyHelper.ACT_READ.equals(action)) {
        res = rpc(sp, "social_mark_read", b);
      } else {
        b.put("p_accept", AlxNotifyHelper.ACT_ACCEPT.equals(action));
        res = rpc(sp, "social_respond_request", b);
      }
    } catch (Exception e) {
      res = new Res();
      res.detail = e.getClass().getSimpleName();
    }
    // Sem rede agora (comum com o app em segundo plano em alguns celulares): o Android tenta de novo sozinho quando a rede liberar
    if (res.code == -1) {
      enqueueRetry(ctx, action, pid, fid, name, text, nid);
      AlxNotifyHelper.showInfo(ctx, nid, channel, "Sem rede agora",
        reply ? "Vou enviar sua resposta assim que a conexão liberar: \\"" + text + "\\"" : "Vou concluir assim que a conexão liberar.", kind, fid);
      return;
    }
    finish(ctx, action, res, pid, fid, name, text, nid);
  }

  /** Mostra o resultado final de uma ação (usado pelo envio direto e pela fila de tentativas). */
  static void finish(Context ctx, String action, Res res, String pid, String fid, String name, String text, int nid) {
    boolean reply = AlxNotifyHelper.ACT_REPLY.equals(action);
    String channel = reply || AlxNotifyHelper.ACT_READ.equals(action) ? AlxNotifyHelper.CH_MESSAGES : AlxNotifyHelper.CH_SOCIAL;
    boolean ok = res.code >= 200 && res.code < 300;

    if (reply) {
      if (ok) AlxNotifyHelper.showMessage(ctx, fid, pid, name, null, System.currentTimeMillis(), text, true);
      else AlxNotifyHelper.showInfo(ctx, nid, channel, "Não foi possível enviar",
        why(res) + " Sua resposta: \\"" + text + "\\"", "message", fid);
    } else if (AlxNotifyHelper.ACT_READ.equals(action)) {
      AlxNotifyHelper.cancel(ctx, nid);
    } else if (ok) {
      boolean accepted = AlxNotifyHelper.ACT_ACCEPT.equals(action);
      if (accepted) AlxNotifyHelper.showInfo(ctx, nid, channel, "Pedido aceito", "Agora você e " + (name == null ? "seu novo amigo" : name) + " são amigos.", "friend_accepted", fid);
      else AlxNotifyHelper.cancel(ctx, nid);
    } else {
      AlxNotifyHelper.showInfo(ctx, nid, channel, "Não foi possível responder", why(res), "friend_request", fid);
    }
  }

  private static void enqueueRetry(Context ctx, String action, String pid, String fid, String name, String text, int nid) {
    try {
      androidx.work.Data data = new androidx.work.Data.Builder()
        .putString("action", action).putString("pid", pid).putString("fid", fid)
        .putString("name", name == null ? "" : name).putString("text", text == null ? "" : text).putInt("nid", nid).build();
      androidx.work.Constraints net = new androidx.work.Constraints.Builder()
        .setRequiredNetworkType(androidx.work.NetworkType.CONNECTED).build();
      androidx.work.OneTimeWorkRequest w = new androidx.work.OneTimeWorkRequest.Builder(AlxSendWorker.class)
        .setConstraints(net).setInputData(data)
        .setBackoffCriteria(androidx.work.BackoffPolicy.EXPONENTIAL, 10, java.util.concurrent.TimeUnit.SECONDS).build();
      androidx.work.WorkManager.getInstance(ctx).enqueue(w);
    } catch (Exception ignored) {}
  }
}
`);

  // Player das salas (ExoPlayer embutido atrás da página)
  fs.writeFileSync(path.join(pkgDir, "AlxRoomPlayerPlugin.java"),
    fs.readFileSync(path.join(process.cwd(), "scripts/android/room-player.java.txt"), "utf8").replace(/__PKG__/g, pkg));

  // Verificador de canais (baixa a playlist e um trecho de vídeo de verdade)
  fs.writeFileSync(path.join(pkgDir, "AlxProbe.java"),
    fs.readFileSync(path.join(process.cwd(), "scripts/android/probe.java.txt"), "utf8").replace(/__PKG__/g, pkg));

  // Baixador interno (fila, HLS, serviço em segundo plano)
  for (const [src, dst] of [["downloads-core.java.txt", "AlxDownloadCore.java"], ["downloads-service.java.txt", "AlxDownloadService.java"], ["downloads-plugin.java.txt", "AlxDownloadsPlugin.java"]]) {
    fs.writeFileSync(path.join(pkgDir, dst), fs.readFileSync(path.join(process.cwd(), "scripts/android", src), "utf8").replace(/__PKG__/g, pkg));
  }
  log("baixador interno");

  // Plugin de anúncios (Start.io): código Java em scripts/android/ads-plugin.java.txt
  fs.writeFileSync(path.join(pkgDir, "AlxAdsPlugin.java"),
    fs.readFileSync(path.join(process.cwd(), "scripts/android/ads-plugin.java.txt"), "utf8").replace(/__PKG__/g, pkg));
  {
    let ga = fs.readFileSync(gradlePath, "utf8");
    if (!ga.includes("com.startapp:inapp-sdk")) {
      ga += "\ndependencies {\n    implementation 'com.startapp:inapp-sdk:5.3.1'\n    implementation 'com.unity3d.ads:unity-ads:4.14.2'\n}\n";
      fs.writeFileSync(gradlePath, ga);
      log("dependências de anúncios: Start.io 5.3.1 + Unity Ads 4.14.2");
    }
  }

  // Plugin de download (1DM / ADM): o código Java fica em scripts/android/download-plugin.java.txt
  fs.writeFileSync(path.join(pkgDir, "AlxDownloadPlugin.java"),
    fs.readFileSync(path.join(process.cwd(), "scripts/android/download-plugin.java.txt"), "utf8").replace(/__PKG__/g, pkg));

  // ---- Player de vídeo nativo (Media3) ----
  fs.writeFileSync(path.join(pkgDir, "AlxPlayerActivity.java"),
    fs.readFileSync(path.join(process.cwd(), "scripts/android/player-activity.java.txt"), "utf8").replace(/__PKG__/g, pkg));
  fs.writeFileSync(path.join(pkgDir, "AlxPlayerPlugin.java"),
`package ${pkg};

import android.content.Intent;
import androidx.activity.result.ActivityResult;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;
import org.json.JSONObject;

/** Abre o player nativo e devolve ao app onde a pessoa parou e o que ela fez (fechou, terminou, próximo, trocou de servidor, erro). */
@CapacitorPlugin(name = "AlxPlayer")
public class AlxPlayerPlugin extends Plugin {
  static volatile AlxPlayerPlugin live;

  @Override
  public void load() { live = this; }

  @PluginMethod
  public void play(PluginCall call) {
    String url = call.getString("url");
    if (url == null || url.isEmpty()) { call.reject("Link inválido."); return; }
    Intent i = new Intent(getContext(), AlxPlayerActivity.class);
    i.putExtra("url", url);
    i.putExtra("title", call.getString("title", ""));
    i.putExtra("subtitle", call.getString("subtitle", ""));
    i.putExtra("poster", call.getString("poster", ""));
    i.putExtra("startMs", call.getLong("startMs", 0L).longValue());
    i.putExtra("startPercent", call.getDouble("startPercent", -1.0).doubleValue());
    i.putExtra("hasNext", Boolean.TRUE.equals(call.getBoolean("hasNext", false)));
    i.putExtra("server", call.getString("server", ""));
    i.putExtra("source", call.getString("source", "main"));
    i.putExtra("fallbackLabel", call.getString("fallbackLabel", "Reserva"));
    i.putExtra("rate", call.getFloat("rate", 1f).floatValue());
    i.putExtra("live", Boolean.TRUE.equals(call.getBoolean("live", false)));
    i.putExtra("hasPrev", Boolean.TRUE.equals(call.getBoolean("hasPrev", false)));
    i.putExtra("referer", call.getString("referer", ""));
    i.putExtra("logo", call.getString("logo", ""));
    try {
      JSArray arr = call.getArray("servers");
      if (arr != null) {
        String[] labels = new String[arr.length()];
        boolean[] oks = new boolean[arr.length()];
        for (int k = 0; k < arr.length(); k++) {
          JSONObject o = arr.getJSONObject(k);
          labels[k] = o.optString("label", "");
          oks[k] = o.optBoolean("ok", false);
        }
        i.putExtra("serverLabels", labels);
        i.putExtra("serverOk", oks);
      }
    } catch (Exception ignored) {}
    try {
      startActivityForResult(call, i, "onPlayerResult");
    } catch (Exception e) {
      call.reject("unavailable");
    }
  }

  private static final java.util.concurrent.ExecutorService PROBE_POOL = java.util.concurrent.Executors.newFixedThreadPool(10);

  /** Verifica se um canal está no ar de verdade (playlist + trecho de vídeo), em segundo plano. */
  @PluginMethod
  public void probe(PluginCall call) {
    final String url = call.getString("url", "");
    final String referer = call.getString("referer", "");
    PROBE_POOL.execute(() -> {
      AlxProbe.Result r = AlxProbe.check(url, referer);
      JSObject o = new JSObject();
      o.put("online", r.online);
      o.put("reason", r.reason);
      o.put("ms", r.ms);
      call.resolve(o);
    });
  }

  /** Último fechamento inesperado do app (texto do erro), para o diagnóstico. */
  @PluginMethod
  public void getLastCrash(PluginCall call) {
    android.content.SharedPreferences sp = getContext().getSharedPreferences("alx_crash", 0);
    JSObject o = new JSObject();
    o.put("trace", sp.getString("trace", ""));
    o.put("at", sp.getLong("at", 0L));
    call.resolve(o);
  }

  @PluginMethod
  public void clearLastCrash(PluginCall call) {
    getContext().getSharedPreferences("alx_crash", 0).edit().clear().apply();
    call.resolve();
  }

  /** Atualiza o nome do programa mostrado no player ao vivo. */
  @PluginMethod
  public void setSubtitle(PluginCall call) {
    AlxPlayerActivity a = AlxPlayerActivity.current;
    if (a != null) a.setProgramText(call.getString("text", ""));
    call.resolve();
  }

  /** Reconhecimento de voz do Android (janela do sistema). Devolve o texto falado. */
  @PluginMethod
  public void listen(PluginCall call) {
    android.content.Intent i = new android.content.Intent(android.speech.RecognizerIntent.ACTION_RECOGNIZE_SPEECH);
    i.putExtra(android.speech.RecognizerIntent.EXTRA_LANGUAGE_MODEL, android.speech.RecognizerIntent.LANGUAGE_MODEL_FREE_FORM);
    i.putExtra(android.speech.RecognizerIntent.EXTRA_LANGUAGE, "pt-BR");
    i.putExtra(android.speech.RecognizerIntent.EXTRA_PROMPT, call.getString("prompt", "Fale com a Laura"));
    try {
      startActivityForResult(call, i, "onSpeechResult");
    } catch (Exception e) {
      call.reject("Reconhecimento de voz indisponível neste aparelho.");
    }
  }

  @ActivityCallback
  private void onSpeechResult(PluginCall call, ActivityResult result) {
    if (call == null) return;
    JSObject o = new JSObject();
    String text = "";
    if (result.getResultCode() == android.app.Activity.RESULT_OK && result.getData() != null) {
      java.util.ArrayList<String> list = result.getData().getStringArrayListExtra(android.speech.RecognizerIntent.EXTRA_RESULTS);
      if (list != null && !list.isEmpty()) text = list.get(0);
    }
    o.put("text", text);
    call.resolve(o);
  }

  @ActivityCallback
  private void onPlayerResult(PluginCall call, ActivityResult result) {
    if (call == null) return;
    JSObject o = new JSObject();
    Intent d = result == null ? null : result.getData();
    o.put("reason", d == null ? "closed" : d.getStringExtra("reason"));
    o.put("positionMs", d == null ? 0 : d.getLongExtra("positionMs", 0));
    o.put("durationMs", d == null ? 0 : d.getLongExtra("durationMs", 0));
    o.put("rate", d == null ? 1 : d.getFloatExtra("rate", 1f));
    o.put("played", d != null && d.getBooleanExtra("played", false));
    if (d != null && d.hasExtra("server")) o.put("server", d.getStringExtra("server"));
    call.resolve(o);
  }

  void emitProgress(long positionMs, long durationMs) {
    JSObject o = new JSObject();
    o.put("positionMs", positionMs);
    o.put("durationMs", durationMs);
    notifyListeners("progress", o);
  }
}
`);

  fs.writeFileSync(path.join(pkgDir, "AlxReplyActivity.java"),
`package ${pkg};

import android.app.Activity;
import android.content.Context;
import android.content.Intent;
import android.os.Bundle;
import androidx.core.app.RemoteInput;

/** Tela invisível que envia a resposta da notificação. Enquanto ela está aberta o app conta como "em primeiro plano" e a rede funciona. */
public class AlxReplyActivity extends Activity {
  @Override
  protected void onCreate(Bundle b) {
    super.onCreate(b);
    final Context app = getApplicationContext();
    final Intent in = getIntent();
    String typed = "";
    try {
      Bundle r = RemoteInput.getResultsFromIntent(in);
      CharSequence cs = r == null ? null : r.getCharSequence(AlxNotifyHelper.KEY_REPLY);
      typed = cs == null ? "" : cs.toString().trim();
    } catch (Exception ignored) {}
    final String text = typed;
    new Thread(() -> {
      try { AlxNotifyReceiver.handle(app, in, AlxNotifyHelper.ACT_REPLY, text); }
      catch (Exception ignored) {}
      runOnUiThread(() -> { if (!isFinishing()) finish(); overridePendingTransition(0, 0); });
    }).start();
  }
}
`);

  fs.writeFileSync(path.join(pkgDir, "AlxSendService.java"),
`package ${pkg};

import android.app.Notification;
import android.app.Service;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.os.Build;
import android.os.IBinder;
import androidx.core.app.NotificationCompat;

/** Serviço curto em primeiro plano: envia a resposta / ação da notificação com a rede garantida e se encerra. */
public class AlxSendService extends Service {
  @Override
  public IBinder onBind(Intent intent) { return null; }

  @Override
  public int onStartCommand(final Intent in, int flags, final int startId) {
    AlxNotifyHelper.ensureChannels(this);
    Notification n = new NotificationCompat.Builder(this, AlxNotifyHelper.CH_SENDING)
      .setSmallIcon(AlxNotifyHelper.smallIcon(this))
      .setContentTitle("ALXmovies")
      .setContentText("Enviando…")
      .setPriority(NotificationCompat.PRIORITY_LOW)
      .setOngoing(true)
      .build();
    try {
      if (Build.VERSION.SDK_INT >= 29) startForeground(7711, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC);
      else startForeground(7711, n);
    } catch (Exception ignored) { /* segue mesmo assim */ }

    new Thread(() -> {
      try {
        if (in != null) AlxNotifyReceiver.handle(getApplicationContext(), in, in.getStringExtra("act"), in.getStringExtra("text"));
      } catch (Exception ignored) {
      } finally {
        stopForeground(true);
        stopSelf(startId);
      }
    }).start();
    return START_NOT_STICKY;
  }
}
`);

  fs.writeFileSync(path.join(pkgDir, "AlxSendWorker.java"),
`package ${pkg};

import android.content.Context;
import android.content.SharedPreferences;
import androidx.annotation.NonNull;
import androidx.work.Data;
import androidx.work.Worker;
import androidx.work.WorkerParameters;
import org.json.JSONObject;

/** Refaz o envio (resposta / aceitar / recusar / marcar como lida) quando o Android libera a rede para o app. */
public class AlxSendWorker extends Worker {
  public AlxSendWorker(@NonNull Context context, @NonNull WorkerParameters params) { super(context, params); }

  @NonNull
  @Override
  public Result doWork() {
    Context ctx = getApplicationContext();
    Data in = getInputData();
    String action = in.getString("action");
    String pid = in.getString("pid");
    String fid = in.getString("fid");
    String name = in.getString("name");
    String text = in.getString("text");
    int nid = in.getInt("nid", 0);
    SharedPreferences sp = ctx.getSharedPreferences(AlxNotifyHelper.PREFS, Context.MODE_PRIVATE);
    if (action == null || pid == null || fid == null || sp.getString("token", "").isEmpty()) return Result.failure();

    AlxNotifyReceiver.Res res;
    try {
      JSONObject b = new JSONObject();
      b.put("p_profile_id", pid);
      b.put("p_friendship_id", fid);
      String fn;
      if (AlxNotifyHelper.ACT_REPLY.equals(action)) { b.put("p_body", text); b.put("p_kind", "text"); fn = "social_send_message"; }
      else if (AlxNotifyHelper.ACT_READ.equals(action)) { fn = "social_mark_read"; }
      else { b.put("p_accept", AlxNotifyHelper.ACT_ACCEPT.equals(action)); fn = "social_respond_request"; }
      res = AlxNotifyReceiver.rpc(sp, fn, b);
    } catch (Exception e) {
      res = new AlxNotifyReceiver.Res();
      res.detail = e.getClass().getSimpleName();
    }

    boolean retryable = res.code == -1 || res.code >= 500;
    if (retryable && getRunAttemptCount() < 8) return Result.retry();
    AlxNotifyReceiver.finish(ctx, action, res, pid, fid, name, text, nid);
    return Result.success();
  }
}
`);

  fs.writeFileSync(path.join(pkgDir, "AlxNotifyPlugin.java"),
`package ${pkg};

import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Build;
import androidx.core.app.NotificationManagerCompat;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

/** Ponte JS ↔ notificações do Android (ver src/lib/deviceNotify.ts). */
@CapacitorPlugin(
  name = "AlxNotify",
  permissions = { @Permission(strings = { "android.permission.POST_NOTIFICATIONS" }, alias = "notifications") }
)
public class AlxNotifyPlugin extends Plugin {
  @Override
  public void load() {
    AlxNotifyHelper.ensureChannels(getContext());
${hasFirebase ? '    try { com.google.firebase.messaging.FirebaseMessaging.getInstance().subscribeToTopic("app-updates"); } catch (Exception ignored) {}' : ""}
    handleTap(getActivity() == null ? null : getActivity().getIntent());
  }

  @Override
  protected void handleOnNewIntent(Intent intent) {
    super.handleOnNewIntent(intent);
    handleTap(intent);
  }

  @Override
  protected void handleOnResume() { super.handleOnResume(); AlxNotifyHelper.appVisible = true; }

  @Override
  protected void handleOnPause() { super.handleOnPause(); AlxNotifyHelper.appVisible = false; }

  /** O usuário tocou na notificação: avisa o JS para abrir a tela certa (guarda o aviso até alguém escutar). */
  private void handleTap(Intent i) {
    if (i == null) return;
    String kind = i.getStringExtra("alx_kind");
    if (kind == null) return;
    JSObject o = new JSObject();
    o.put("kind", kind);
    String fid = i.getStringExtra("alx_fid");
    if (fid != null) o.put("fid", fid);
    i.removeExtra("alx_kind");
    i.removeExtra("alx_fid");
    notifyListeners("tap", o, true);
  }

  private void resolveStatus(PluginCall call) {
    JSObject r = new JSObject();
    r.put("granted", NotificationManagerCompat.from(getContext()).areNotificationsEnabled());
    call.resolve(r);
  }

  @PluginMethod
  public void requestPermission(PluginCall call) {
    if (Build.VERSION.SDK_INT < 33 || getPermissionState("notifications") == PermissionState.GRANTED) { resolveStatus(call); return; }
    requestPermissionForAlias("notifications", call, "permissionResult");
  }

  @PermissionCallback
  private void permissionResult(PluginCall call) { resolveStatus(call); }

  @PluginMethod
  public void status(PluginCall call) { resolveStatus(call); }

  /** Guarda o login para os botões da notificação poderem responder sem abrir o app. */
  @PluginMethod
  public void setSession(PluginCall call) {
    SharedPreferences.Editor e = getContext().getSharedPreferences(AlxNotifyHelper.PREFS, Context.MODE_PRIVATE).edit();
    e.putString("url", call.getString("url", ""));
    e.putString("proxy", call.getString("proxy", ""));
    e.putString("key", call.getString("key", ""));
    e.putString("token", call.getString("token", ""));
    e.apply();
    call.resolve();
  }

  @PluginMethod
  public void clearSession(PluginCall call) {
    getContext().getSharedPreferences(AlxNotifyHelper.PREFS, Context.MODE_PRIVATE).edit().clear().apply();
    AlxNotifyHelper.cancelAll(getContext());
    call.resolve();
  }

  @PluginMethod
  public void showMessage(PluginCall call) {
    String fid = call.getString("fid");
    String pid = call.getString("pid");
    if (fid == null || pid == null) { call.reject("fid/pid ausentes"); return; }
    long ts = call.getData().optLong("ts", System.currentTimeMillis());
    String mid = call.getString("mid");
    if (mid != null && !AlxNotifyHelper.firstTime(getContext(), "m:" + mid)) { call.resolve(); return; }
    AlxNotifyHelper.showMessage(getContext(), fid, pid, call.getString("name", ""), call.getString("text", ""), ts, null, false);
    call.resolve();
  }

  @PluginMethod
  public void showFriendEvent(PluginCall call) {
    String fid = call.getString("fid");
    String pid = call.getString("pid");
    if (fid == null || pid == null) { call.reject("fid/pid ausentes"); return; }
    String nid = call.getString("nid");
    if (nid != null && !AlxNotifyHelper.firstTime(getContext(), "n:" + nid)) { call.resolve(); return; }
    AlxNotifyHelper.showFriendEvent(getContext(), call.getString("kind", "friend_request"), fid, pid, call.getString("name", ""));
    call.resolve();
  }

${tokenMethod}

  @PluginMethod
  public void cancelAll(PluginCall call) {
    AlxNotifyHelper.cancelAll(getContext());
    call.resolve();
  }
}
`);

  {
    let g0 = fs.readFileSync(gradlePath, "utf8");
    if (!g0.includes("androidx.work:work-runtime")) {
      g0 += "\ndependencies {\n    implementation 'androidx.work:work-runtime:2.10.0'\n}\n";
      fs.writeFileSync(gradlePath, g0);
      log("dependência WorkManager (tentativas de envio das notificações)");
    }
  }

  // Verificação periódica de versão nova (a cada ~6 h, mesmo com o app fechado). Complementa o push do Firebase.
  fs.writeFileSync(path.join(pkgDir, "AlxUpdateWorker.java"),
`package ${pkg};

import android.content.Context;
import androidx.annotation.NonNull;
import androidx.work.Constraints;
import androidx.work.ExistingPeriodicWorkPolicy;
import androidx.work.NetworkType;
import androidx.work.PeriodicWorkRequest;
import androidx.work.WorkManager;
import androidx.work.Worker;
import androidx.work.WorkerParameters;
import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.concurrent.TimeUnit;
import org.json.JSONObject;

public class AlxUpdateWorker extends Worker {
  private static final String API = "${releaseApi}";

  public AlxUpdateWorker(@NonNull Context context, @NonNull WorkerParameters params) { super(context, params); }

  static void schedule(Context c) {
    try {
      Constraints cs = new Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build();
      PeriodicWorkRequest r = new PeriodicWorkRequest.Builder(AlxUpdateWorker.class, 6, TimeUnit.HOURS).setConstraints(cs).build();
      WorkManager.getInstance(c).enqueueUniquePeriodicWork("alx-update-check", ExistingPeriodicWorkPolicy.KEEP, r);
    } catch (Exception ignored) {}
  }

  static String installed(Context c) {
    try { return c.getPackageManager().getPackageInfo(c.getPackageName(), 0).versionName; } catch (Exception e) { return "0"; }
  }

  /** Compara "1.0.12" com "v1.0.9" número a número. */
  static boolean isNewer(String remote, String local) {
    if (remote == null || local == null) return false;
    String[] a = remote.replaceFirst("^v", "").split("[.]");
    String[] b = local.replaceFirst("^v", "").split("[.]");
    for (int i = 0; i < Math.max(a.length, b.length); i++) {
      int x = 0, y = 0;
      try { x = i < a.length ? Integer.parseInt(a[i].replaceAll("[^0-9]", "")) : 0; } catch (Exception ignored) {}
      try { y = i < b.length ? Integer.parseInt(b[i].replaceAll("[^0-9]", "")) : 0; } catch (Exception ignored) {}
      if (x != y) return x > y;
    }
    return false;
  }

  @NonNull
  @Override
  public Result doWork() {
    Context c = getApplicationContext();
    HttpURLConnection h = null;
    try {
      h = (HttpURLConnection) new URL(API).openConnection();
      h.setConnectTimeout(10000);
      h.setReadTimeout(10000);
      h.setRequestProperty("Accept", "application/vnd.github+json");
      h.setRequestProperty("User-Agent", "ALXmovies-Android");
      if (h.getResponseCode() != 200) return Result.success();
      StringBuilder sb = new StringBuilder();
      try (BufferedReader r = new BufferedReader(new InputStreamReader(h.getInputStream()))) {
        String line;
        while ((line = r.readLine()) != null) sb.append(line);
      }
      String tag = new JSONObject(sb.toString()).optString("tag_name", "");
      if (tag.isEmpty() || !isNewer(tag, installed(c))) return Result.success();
      // com o app na tela ele mesmo mostra o aviso; e cada versão só notifica uma vez
      if (!AlxNotifyHelper.appVisible && AlxNotifyHelper.firstTime(c, "u:" + tag.replaceFirst("^v", ""))) AlxNotifyHelper.showUpdate(c, tag);
    } catch (Exception ignored) {
    } finally {
      if (h != null) h.disconnect();
    }
    return Result.success();
  }
}
`);

  {
    let g1 = fs.readFileSync(gradlePath, "utf8");
    if (!g1.includes("androidx.media3:media3-exoplayer")) {
      g1 += "\ndependencies {\n    implementation 'androidx.media3:media3-exoplayer:1.4.1'\n    implementation 'androidx.media3:media3-exoplayer-hls:1.4.1'\n    implementation 'androidx.media3:media3-ui:1.4.1'\n}\nandroid {\n    lint {\n        abortOnError false\n        checkReleaseBuilds false\n    }\n}\n";
      fs.writeFileSync(gradlePath, g1);
      log("dependências do player nativo (Media3)");
    }
  }

  if (hasFirebase) {
    fs.writeFileSync(path.join(pkgDir, "AlxFirebaseService.java"),
`package ${pkg};

import android.content.Context;
import com.google.firebase.messaging.FirebaseMessagingService;
import com.google.firebase.messaging.RemoteMessage;
import java.util.Map;

/** Recebe o push (só dados) do servidor e monta a mesma notificação com botão de responder. */
public class AlxFirebaseService extends FirebaseMessagingService {
  @Override
  public void onMessageReceived(RemoteMessage msg) {
    Map<String, String> d = msg.getData();
    if (d == null || AlxNotifyHelper.appVisible) return; // com o app na tela, ele mesmo mostra
    Context c = getApplicationContext();
    if ("app_update".equals(d.get("type"))) { // versão nova publicada (enviado para todos os aparelhos)
      String v = d.get("version");
      if (v != null && !v.isEmpty() && AlxUpdateWorker.isNewer(v, AlxUpdateWorker.installed(c)) && AlxNotifyHelper.firstTime(c, "u:" + v.replaceFirst("^v", ""))) AlxNotifyHelper.showUpdate(c, v);
      return;
    }
    String type = d.get("type");
    String fid = d.get("fid");
    String pid = d.get("pid");
    if (type == null || fid == null || fid.isEmpty() || pid == null) return;
    String name = d.get("name");

    if ("message".equals(type)) {
      String mid = d.get("mid");
      if (mid != null && !AlxNotifyHelper.firstTime(c, "m:" + mid)) return;
      long ts = System.currentTimeMillis();
      try { ts = Long.parseLong(d.get("ts")); } catch (Exception ignored) {}
      AlxNotifyHelper.showMessage(c, fid, pid, name, d.get("text") == null ? "" : d.get("text"), ts, null, false);
    } else if ("friend_request".equals(type) || "friend_accepted".equals(type)) {
      String nid = d.get("nid");
      if (nid != null && !AlxNotifyHelper.firstTime(c, "n:" + nid)) return;
      AlxNotifyHelper.showFriendEvent(c, type, fid, pid, name);
    }
  }
}
`);
    log("serviço do Firebase (push com o app fechado)");

    let g = fs.readFileSync(gradlePath, "utf8");
    if (!g.includes("firebase-messaging")) {
      g += "\ndependencies {\n    implementation 'com.google.firebase:firebase-messaging:24.1.0'\n}\n";
      fs.writeFileSync(gradlePath, g);
      log("dependência firebase-messaging");
    }
  } else {
    log("sem google-services.json: APK sem push do Firebase (só notificações com o app aberto/em segundo plano)");
  }

  // ---------- Tela de abertura do Android 12+: logo nítido (o sistema usaria o ícone do app ampliado = borrado) sobre fundo preto ----------
  {
    const splashSrc = path.join(process.cwd(), "scripts/android/splash-icon.png");
    const resDir = path.join(androidDir, "app/src/main/res");
    const stylesPath = path.join(resDir, "values/styles.xml");
    if (fs.existsSync(splashSrc) && fs.existsSync(stylesPath)) {
      fs.mkdirSync(path.join(resDir, "drawable-nodpi"), { recursive: true });
      fs.copyFileSync(splashSrc, path.join(resDir, "drawable-nodpi/splash_icon.png"));
      let st = fs.readFileSync(stylesPath, "utf8");
      if (!st.includes("windowSplashScreenAnimatedIcon")) {
        st = st.replace(/(<style name="AppTheme\.NoActionBarLaunch"[^>]*>)/,
          `$1\n        <item name="windowSplashScreenBackground">#000000</item>\n        <item name="windowSplashScreenAnimatedIcon">@drawable/splash_icon</item>`);
        fs.writeFileSync(stylesPath, st);
        log("tela de abertura nítida (Android 12+)");
      }
    }
  }

  // caminhos que o FileProvider pode compartilhar
  const xmlDir = path.join(androidDir, "app/src/main/res/xml");
  fs.mkdirSync(xmlDir, { recursive: true });
  fs.writeFileSync(path.join(xmlDir, "updater_paths.xml"),
`<?xml version="1.0" encoding="utf-8"?>
<paths>
    <cache-path name="updates" path="updates/" />
</paths>
`);

  // manifesto: permissão de instalar + provider
  let mf = fs.readFileSync(manifestPath, "utf8");
  if (!mf.includes("REQUEST_INSTALL_PACKAGES")) {
    mf = mf.replace(/<application/, `<uses-permission android:name="android.permission.REQUEST_INSTALL_PACKAGES" />\n    <application`);
    log("permissão de instalar atualizações");
  }
  if (!mf.includes("android.permission.POST_NOTIFICATIONS")) {
    mf = mf.replace(/<application/, `<uses-permission android:name="android.permission.POST_NOTIFICATIONS" />\n    <application`);
    log("permissão de notificações");
  }
  if (!mf.includes("AlxNotifyReceiver")) {
    mf = mf.replace(/<\/application>/, `    <receiver android:name="${pkg}.AlxNotifyReceiver" android:exported="false" />\n    </application>`);
    log("receiver das notificações");
  }
  for (const perm of ["android.permission.FOREGROUND_SERVICE", "android.permission.FOREGROUND_SERVICE_DATA_SYNC"]) {
    if (!mf.includes(perm)) mf = mf.replace(/<application/, `<uses-permission android:name="${perm}" />\n    <application`);
  }
  if (!mf.includes("idm.internet.download.manager")) {
    mf = mf.replace(/<application/, `<queries>
        <package android:name="com.dv.adm" />
        <package android:name="com.dv.adm.pay" />
        <package android:name="idm.internet.download.manager" />
        <package android:name="idm.internet.download.manager.plus" />
        <package android:name="idm.internet.download.manager.adm.lite" />
        <intent><action android:name="android.intent.action.VIEW" /><data android:scheme="https" /></intent>
        <intent><action android:name="android.speech.action.RECOGNIZE_SPEECH" /></intent>
    </queries>
    <application`);
    log("visibilidade dos gerenciadores de download");
  }
  if (!mf.includes("AlxPlayerActivity")) {
    mf = mf.replace(/<\/application>/, `    <activity android:name="${pkg}.AlxPlayerActivity" android:exported="false"
            android:theme="@android:style/Theme.Black.NoTitleBar.Fullscreen" android:screenOrientation="sensorLandscape"
            android:supportsPictureInPicture="true" android:resizeableActivity="true"
            android:configChanges="orientation|screenSize|smallestScreenSize|screenLayout|keyboardHidden|layoutDirection|uiMode" />\n    </application>`);
    log("player nativo no manifesto");
  }
  if (!mf.includes("AlxReplyActivity")) {
    mf = mf.replace(/<\/application>/, `    <activity android:name="${pkg}.AlxReplyActivity" android:exported="false" android:theme="@android:style/Theme.Translucent.NoTitleBar" android:taskAffinity="" android:excludeFromRecents="true" android:launchMode="singleTask" android:noHistory="false" />\n    </application>`);
    log("tela invisível de resposta");
  }
  if (!mf.includes("AlxDownloadService")) {
    mf = mf.replace(/<\/application>/, `    <service android:name="${pkg}.AlxDownloadService" android:exported="false" android:foregroundServiceType="dataSync" />\n    </application>`);
    log("serviço dos downloads");
  }
  if (!mf.includes("android.permission.ACCESS_NETWORK_STATE")) {
    mf = mf.replace(/<application/, `<uses-permission android:name="android.permission.ACCESS_NETWORK_STATE" />\n    <application`);
  }
  if (!mf.includes("AlxSendService")) {
    mf = mf.replace(/<\/application>/, `    <service android:name="${pkg}.AlxSendService" android:exported="false" android:foregroundServiceType="dataSync" />\n    </application>`);
    log("serviço de envio das notificações");
  }
  if (hasFirebase && !mf.includes("AlxFirebaseService")) {
    mf = mf.replace(/<\/application>/, `    <service android:name="${pkg}.AlxFirebaseService" android:exported="false">
            <intent-filter><action android:name="com.google.firebase.MESSAGING_EVENT" /></intent-filter>
        </service>
    </application>`);
    log("serviço do Firebase no manifesto");
  }
  // Avisos do admin chegam como push com título/texto: o próprio Android mostra na barra (mesmo com o app fechado),
  // com o ícone e o canal do app. Versões antigas, sem esse canal, usam o canal padrão do Firebase.
  if (hasFirebase && !mf.includes("default_notification_channel_id")) {
    mf = mf.replace(/<\/application>/, `    <meta-data android:name="com.google.firebase.messaging.default_notification_channel_id" android:value="alx_avisos" />
        <meta-data android:name="com.google.firebase.messaging.default_notification_icon" android:resource="@drawable/ic_stat_alx" />
    </application>`);
    log("canal e ícone dos avisos (push)");
  }
  if (!mf.includes("UpdateFileProvider")) {
    mf = mf.replace(/<\/application>/, `    <provider
            android:name="${pkg}.UpdateFileProvider"
            android:authorities="\${applicationId}.updater"
            android:exported="false"
            android:grantUriPermissions="true">
            <meta-data android:name="android.support.FILE_PROVIDER_PATHS" android:resource="@xml/updater_paths" />
        </provider>
    </application>`);
    log("provider do atualizador");
  }
  fs.writeFileSync(manifestPath, mf);
  log("plugin AppUpdater instalado");
}

console.log("✓ Projeto Android ajustado.");
