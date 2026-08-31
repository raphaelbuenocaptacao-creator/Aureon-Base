import { runAureonConsole } from './consoleClient.js';
import { runConsoleEnhancements } from './consoleEnhancements.js';

const manifest = {
  id: '/console',
  name: 'Aureon Base',
  short_name: 'Aureon',
  description: 'Console administrativo da infraestrutura Aureon Base.',
  start_url: '/console',
  scope: '/',
  display: 'standalone',
  background_color: '#08090b',
  theme_color: '#08090b',
  lang: 'pt-BR',
  icons: [
    { src: '/pwa/icon-192.svg', sizes: '192x192', type: 'image/svg+xml', purpose: 'any' },
    { src: '/pwa/icon-512.svg', sizes: '512x512', type: 'image/svg+xml', purpose: 'any' },
    { src: '/pwa/icon-maskable-512.svg', sizes: '512x512', type: 'image/svg+xml', purpose: 'maskable' },
  ],
};

const iconSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><rect width="512" height="512" rx="112" fill="#08090b"/><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#f0cc78"/><stop offset="1" stop-color="#9a6818"/></linearGradient></defs><rect x="86" y="86" width="340" height="340" rx="96" fill="url(#g)"/><path d="M256 144 151 368h58l20-48h54l20 48h58L256 144Zm0 83 25 60h-50l25-60Z" fill="#111"/></svg>`;
const maskableIconSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><rect width="512" height="512" fill="#08090b"/><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#f0cc78"/><stop offset="1" stop-color="#9a6818"/></linearGradient></defs><circle cx="256" cy="256" r="190" fill="url(#g)"/><path d="M256 146 160 366h58l18-46h40l18 46h58L256 146Zm0 86 22 56h-44l22-56Z" fill="#111"/></svg>`;

const serviceWorker = `const CACHE='aureon-console-v5-safe-shell';
const SHELL=['/','/console','/console/app.js','/manifest.webmanifest','/icon.svg','/pwa/icon-192.svg','/pwa/icon-512.svg','/pwa/icon-maskable-512.svg'];
const SHELL_PATHS=new Set(SHELL);
const SENSITIVE_PARAMS=['token','access_token','refresh_token','password','passwd','session','session_id','api_key','apikey','code','credential','credentials'];
const isSensitive=(request,url)=>request.headers.has('authorization')||request.headers.has('cookie')||SENSITIVE_PARAMS.some(key=>url.searchParams.has(key));
self.addEventListener('install',event=>{event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(SHELL)));self.skipWaiting();});
self.addEventListener('activate',event=>{event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key!==CACHE).map(key=>caches.delete(key)))));self.clients.claim();});
self.addEventListener('fetch',event=>{const request=event.request;if(request.method!=='GET')return;const url=new URL(request.url);if(url.origin!==self.location.origin||isSensitive(request,url))return;if(request.mode==='navigate'){event.respondWith(fetch(request,{cache:'no-store'}).catch(()=>caches.match('/console')));return;}if(!SHELL_PATHS.has(url.pathname))return;event.respondWith(caches.match(request).then(hit=>hit||fetch(request).then(response=>{if(response&&response.ok&&response.type==='basic'){const copy=response.clone();event.waitUntil(caches.open(CACHE).then(cache=>cache.put(request,copy)));}return response;})));});`;

const page = `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="theme-color" content="#08090b">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
<meta name="apple-mobile-web-app-title" content="Aureon">
<link rel="manifest" href="/manifest.webmanifest">
<link rel="icon" href="/icon.svg" type="image/svg+xml">
<title>Aureon Base</title>
<style>
:root{--bg:#08090b;--panel:#101216;--panel2:#15181e;--line:#252933;--gold:#d8aa45;--gold2:#f0cc78;--text:#f7f3ea;--muted:#8f96a3;--ok:#54c68a;--danger:#ed6b6b;--shadow:0 24px 80px rgba(0,0,0,.45)}
*{box-sizing:border-box}body{margin:0;background:radial-gradient(circle at 70% -20%,rgba(216,170,69,.12),transparent 35%),var(--bg);color:var(--text);font:14px Inter,ui-sans-serif,system-ui,-apple-system,Segoe UI,sans-serif;min-height:100vh}.hidden{display:none!important}button,input{font:inherit}.login{min-height:100vh;display:grid;place-items:center;padding:24px}.login-card{width:min(440px,100%);background:linear-gradient(180deg,#12151a,#0d0f13);border:1px solid #292d35;border-radius:24px;padding:36px;box-shadow:var(--shadow)}.brand{display:flex;align-items:center;gap:12px;font-size:20px;font-weight:800;letter-spacing:.04em}.mark{width:38px;height:38px;border-radius:12px;display:grid;place-items:center;background:linear-gradient(135deg,var(--gold2),#9a6818);color:#111;font-weight:1000}.sub{color:var(--muted);margin:9px 0 22px}.auth-tabs{display:grid;grid-template-columns:repeat(3,1fr);gap:6px;margin-bottom:18px;background:#0a0c0f;border:1px solid #252a31;border-radius:12px;padding:5px}.auth-tab{border:0;background:transparent;color:#8f96a3;border-radius:8px;padding:9px 6px;cursor:pointer;font-size:12px}.auth-tab.active{background:#1a1d23;color:#fff}.field{margin:14px 0}.field label{display:block;color:#b4bac5;margin-bottom:7px}.field input{width:100%;padding:13px 14px;border-radius:12px;border:1px solid #2b3038;background:#0a0c0f;color:#fff;outline:none}.field input:focus{border-color:#8c6a2c;box-shadow:0 0 0 3px rgba(216,170,69,.08)}.primary{width:100%;border:0;border-radius:12px;padding:13px 16px;background:linear-gradient(135deg,var(--gold2),#aa761e);color:#111;font-weight:800;cursor:pointer}.secondary-link{width:100%;border:0;background:transparent;color:var(--gold2);padding:10px 0 0;cursor:pointer}.hint{color:var(--muted);font-size:12px;line-height:1.5;margin:8px 0}.msg{min-height:20px;margin-top:12px;color:var(--danger)}.msg.ok{color:var(--ok)}.shell{display:grid;grid-template-columns:240px 1fr;min-height:100vh}.side{border-right:1px solid var(--line);background:#0b0d10;padding:22px 16px;position:sticky;top:0;height:100vh}.side .brand{padding:0 8px 22px}.nav{display:grid;gap:6px}.nav button{border:0;background:transparent;color:#a6acb6;padding:11px 12px;border-radius:10px;text-align:left;cursor:pointer}.nav button:hover,.nav button.active{background:#171a20;color:#fff}.nav button.active{box-shadow:inset 2px 0 var(--gold)}.side-foot{position:absolute;left:16px;right:16px;bottom:18px}.logout{width:100%;padding:10px;border:1px solid var(--line);border-radius:10px;background:#11141a;color:#b7bdc7;cursor:pointer}.main{padding:28px 34px}.top{display:flex;align-items:center;justify-content:space-between;margin-bottom:28px}.top h1{font-size:25px;margin:0}.badge{border:1px solid #324036;background:#122119;color:var(--ok);padding:7px 10px;border-radius:999px;font-size:12px}.cards{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:12px}.card{background:linear-gradient(180deg,#13161b,#0f1115);border:1px solid var(--line);border-radius:16px;padding:18px}.card b{font-size:28px;display:block;margin-top:8px}.card span{color:var(--muted);font-size:12px}.panel{margin-top:18px;background:#101318;border:1px solid var(--line);border-radius:18px;overflow:hidden}.panel-head{display:flex;align-items:center;justify-content:space-between;padding:16px 18px;border-bottom:1px solid var(--line)}.panel-head h2{margin:0;font-size:15px}.actions{display:flex;gap:8px}.mini{padding:8px 11px;border-radius:9px;border:1px solid #393e47;background:#181b21;color:#e7e9ed;cursor:pointer}.mini.gold{border-color:#87672d;color:var(--gold2)}table{width:100%;border-collapse:collapse}th,td{padding:13px 16px;text-align:left;border-bottom:1px solid #20242a;font-size:13px}th{color:#8f96a3;font-weight:600}tr:last-child td{border-bottom:0}.project{cursor:pointer}.project:hover{background:#15191f}.mono{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;color:#b8bec8}.pill{padding:4px 8px;border-radius:999px;background:#1b1f25;color:#b9c0ca;font-size:11px}.pill.ok{background:#122119;color:#68d299}.empty{padding:40px;text-align:center;color:var(--muted)}.grid2{display:grid;grid-template-columns:1fr 1fr;gap:18px}.modal{position:fixed;inset:0;background:rgba(0,0,0,.72);display:grid;place-items:center;padding:20px}.modal-card{width:min(460px,100%);background:#12151a;border:1px solid #333842;border-radius:18px;padding:22px}.modal-card h3{margin:0 0 16px}.modal-actions{display:flex;gap:8px;justify-content:flex-end;margin-top:18px}
@media(max-width:900px){.shell{grid-template-columns:76px 1fr}.side .brand span,.nav button span,.side-foot{display:none}.main{padding:22px 16px}.cards{grid-template-columns:1fr 1fr}.grid2{grid-template-columns:1fr}.side{padding:16px 10px}.nav button{text-align:center}.brand{justify-content:center}.top h1{font-size:20px}}
@media(max-width:540px){.login{padding:16px}.login-card{padding:28px 22px;border-radius:20px}.cards{grid-template-columns:1fr 1fr}.card b{font-size:22px}th:nth-child(n+4),td:nth-child(n+4){display:none}.main{padding-bottom:calc(20px + env(safe-area-inset-bottom))}}
</style>
</head>
<body>
<section id="login" class="login">
  <div class="login-card">
    <div class="brand"><div class="mark">A</div><span>AUREON BASE</span></div>
    <p class="sub">Sua infraestrutura. Seus projetos. Um só lugar.</p>
    <div class="auth-tabs">
      <button type="button" class="auth-tab active" data-auth-view="loginForm">Entrar</button>
      <button type="button" class="auth-tab" data-auth-view="registerForm">Criar conta</button>
      <button type="button" class="auth-tab" data-auth-view="recoverForm">Redefinir</button>
    </div>
    <form id="loginForm" class="auth-form">
      <div class="field"><label>E-mail</label><input id="email" type="email" autocomplete="username" inputmode="email" required></div>
      <div class="field"><label>Senha</label><input id="password" type="password" autocomplete="current-password" required></div>
      <button class="primary">Entrar no Console</button>
      <button type="button" class="secondary-link" data-auth-view="recoverForm">Esqueci minha senha</button>
      <div class="msg" id="loginMsg" role="status" aria-live="polite"></div>
    </form>
    <form id="registerForm" class="auth-form hidden">
      <div class="field"><label>E-mail</label><input id="registerEmail" type="email" autocomplete="email" required></div>
      <div class="field"><label>Senha</label><input id="registerPassword" type="password" autocomplete="new-password" minlength="10" required></div>
      <div class="field"><label>Confirmar senha</label><input id="registerPassword2" type="password" autocomplete="new-password" minlength="10" required></div>
      <p class="hint">A senha precisa ter pelo menos 10 caracteres. Contas comuns não recebem acesso administrativo automaticamente.</p>
      <button class="primary">Criar conta</button>
      <div class="msg" id="registerMsg" role="status" aria-live="polite"></div>
    </form>
    <form id="recoverForm" class="auth-form hidden">
      <div id="recoverRequestStep">
        <div class="field"><label>E-mail da conta</label><input id="recoverEmail" type="email" autocomplete="email" required></div>
        <p class="hint">Você receberá um token de uso único no e-mail cadastrado.</p>
        <button class="primary">Enviar recuperação</button>
      </div>
      <div id="recoverResetStep" class="hidden">
        <div class="field"><label>Token recebido por e-mail</label><input id="recoverToken" type="text" autocomplete="one-time-code" minlength="32"></div>
        <div class="field"><label>Nova senha</label><input id="recoverNewPassword" type="password" autocomplete="new-password" minlength="10"></div>
        <div class="field"><label>Confirmar nova senha</label><input id="recoverNewPassword2" type="password" autocomplete="new-password" minlength="10"></div>
        <button class="primary" type="button" id="resetPasswordButton">Definir nova senha</button>
        <button type="button" class="secondary-link" id="requestAgainButton">Enviar outro token</button>
      </div>
      <div class="msg" id="recoverMsg" role="status" aria-live="polite"></div>
    </form>
  </div>
</section>
<section id="app" class="shell hidden">
  <aside class="side">
    <div class="brand"><div class="mark">A</div><span>AUREON</span></div>
    <nav class="nav">
      <button class="active" data-view="overview">◈ <span>Visão geral</span></button>
      <button data-view="projects">▦ <span>Projetos</span></button>
      <button data-view="users">◎ <span>Usuários</span></button>
      <button data-view="logs">⌁ <span>Logs</span></button>
    </nav>
    <div class="side-foot"><button id="logout" class="logout">Sair</button></div>
  </aside>
  <main class="main">
    <div class="top"><h1 id="title">Visão geral</h1><span class="badge">● API online</span></div>
    <div id="content"></div>
  </main>
</section>
<div id="modal" class="modal hidden"></div>
<script src="/console/app.js"></script>
</body>
</html>`;

export function registerConsoleRoutes({ app }) {
  app.get('/', (_req, res) => res.type('html').send(page));
  app.get('/console', (_req, res) => res.type('html').send(page));
  app.get('/manifest.webmanifest', (_req, res) => {
    res.type('application/manifest+json').set('Cache-Control', 'no-cache').send(JSON.stringify(manifest));
  });
  app.get('/icon.svg', (_req, res) => {
    res.type('image/svg+xml').set('Cache-Control', 'public, max-age=86400').send(iconSvg);
  });
  app.get('/pwa/icon-192.svg', (_req, res) => {
    res.type('image/svg+xml').set('Cache-Control', 'public, max-age=86400').send(iconSvg);
  });
  app.get('/pwa/icon-512.svg', (_req, res) => {
    res.type('image/svg+xml').set('Cache-Control', 'public, max-age=86400').send(iconSvg);
  });
  app.get('/pwa/icon-maskable-512.svg', (_req, res) => {
    res.type('image/svg+xml').set('Cache-Control', 'public, max-age=86400').send(maskableIconSvg);
  });
  app.get('/sw.js', (_req, res) => {
    res.type('application/javascript').set('Cache-Control', 'no-cache').send(serviceWorker);
  });
  app.get('/console/app.js', (_req, res) => {
    res.type('application/javascript').set('Cache-Control', 'no-cache').send(`(${runAureonConsole.toString()})();(${runConsoleEnhancements.toString()})();if('serviceWorker' in navigator&&window.isSecureContext){navigator.serviceWorker.register('/sw.js',{updateViaCache:'none'}).then(registration=>registration.update()).catch(()=>{});}`);
  });
}
