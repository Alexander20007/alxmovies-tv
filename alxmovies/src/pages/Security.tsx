import { useEffect } from "react";
import { Link } from "react-router-dom";
import { SiteFooter } from "@/components/SiteFooter";

export default function Security() {
  useEffect(() => { document.title = "Política de Segurança | ALXmovies"; }, []);
  return (
    <>
<div className="legal-page">
    <Link to="/home" className="legal-back">← Voltar ao ALXmovies</Link>
    <h1>Política de Segurança</h1>
    <p className="legal-updated">Última atualização: 22 de agosto de 2026</p>

    <div className="legal-disclaimer">
      Este documento descreve, de forma direta, as medidas técnicas que o
      ALXmovies usa para proteger sua conta e seus dados. Não é um
      parecer jurídico — recomendamos revisão por um profissional
      especializado antes de tratar isso como garantia legal formal.
    </div>

    <h2>1. Como sua senha é protegida</h2>
    <p>O ALXmovies não guarda sua senha em texto legível em nenhum
    momento. A autenticação é feita pelo Supabase Auth, que armazena
    apenas um hash criptográfico da senha — mesmo alguém com acesso
    direto ao banco de dados não consegue recuperar a senha original a
    partir dele.</p>

    <h2>2. Chaves de API nunca ficam expostas no navegador</h2>
    <p>As chaves de acesso ao TMDB (catálogo de filmes e séries) e ao
    Gemini (assistente de IA) nunca chegam ao seu navegador. Todas as
    chamadas passam por funções de servidor (Supabase Edge Functions),
    que guardam essas chaves em variáveis de ambiente protegidas —
    inspecionar o código do site não revela nenhuma delas.</p>

    <h2>3. Isolamento de dados entre contas (RLS)</h2>
    <p>O banco de dados usa Row Level Security (RLS): cada pessoa só
    consegue ler ou alterar seus próprios perfis, favoritos, avaliações
    e histórico. Isso é aplicado no próprio banco de dados, não apenas
    na tela — então mesmo uma falha na interface não permitiria ver
    dados de outra conta.</p>

    <h2>4. Conexão sempre criptografada</h2>
    <p>Todo o tráfego entre seu navegador e o ALXmovies acontece por
    HTTPS. O site também envia o cabeçalho HSTS (Strict-Transport-Security),
    que instrui o navegador a nunca tentar se conectar por uma versão
    não criptografada do site.</p>

    <h2>5. Cabeçalhos de segurança do navegador</h2>
    <p>O site define políticas explícitas de segurança no navegador
    (Content-Security-Policy, X-Frame-Options, X-Content-Type-Options,
    Referrer-Policy e Permissions-Policy), que restringem de quais
    domínios o site pode carregar conteúdo, bloqueiam tentativas de
    incorporar o ALXmovies dentro de outro site, e desligam recursos do
    navegador que o site não usa (câmera, microfone, geolocalização).</p>

    <h2>6. Login por biometria (Touch ID / Face ID / Windows Hello)</h2>
    <p>Quando você ativa o desbloqueio biométrico no Painel da Conta, sua
    digital, rosto ou PIN do dispositivo <strong>nunca é enviado para o
    ALXmovies</strong> — essa verificação acontece inteiramente dentro
    do seu aparelho, usando o padrão WebAuthn do navegador. O site só
    recebe uma confirmação de "verificado" ou "não verificado".</p>

    <h2>7. Contas de convidado são temporárias</h2>
    <p>Sessões criadas com "Entrar como convidado" expiram em 24 horas.
    Depois desse prazo, uma rotina automática no servidor apaga
    permanentemente a conta e todos os dados associados a ela (perfis,
    favoritos, histórico).</p>

    <h2>8. PIN de perfil</h2>
    <p>Você pode proteger perfis individuais (como um perfil infantil)
    com um PIN de 4 dígitos, exigido toda vez que alguém tentar entrar
    naquele perfil específico dentro da mesma conta.</p>

    <h2>9. O que você pode fazer pra ajudar</h2>
    <ul>
      <li>Use uma senha única, que você não reutiliza em outros sites.</li>
      <li>Ative o desbloqueio biométrico se usar o ALXmovies num
        aparelho compartilhado com outras pessoas.</li>
      <li>Não compartilhe o código de recuperação de convidado nem o PIN
        de perfil com quem você não quer que acesse aquela conta.</li>
    </ul>

    <h2>10. Encontrou uma vulnerabilidade?</h2>
    <p>Se você identificar uma falha de segurança no ALXmovies, entre em
    contato em
    <a href="mailto:alxmovies.tv@gmail.com">alxmovies.tv@gmail.com</a>
    descrevendo o problema. Pedimos que não explore a falha além do
    necessário pra demonstrá-la, e que nos dê um tempo razoável pra
    corrigir antes de divulgar publicamente.</p>

    <h2>11. Alterações nesta política</h2>
    <p>Podemos atualizar esta página conforme o site evolui. A data no
    topo sempre reflete a versão mais recente.</p>
  </div>
      <SiteFooter />
    </>
  );
}
