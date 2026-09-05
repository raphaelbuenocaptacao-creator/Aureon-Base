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
    { src: '/pwa/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
    { src: '/pwa/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
    { src: '/pwa/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
  ],
};

const iconSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><rect width="512" height="512" rx="112" fill="#08090b"/><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#f0cc78"/><stop offset="1" stop-color="#9a6818"/></linearGradient></defs><rect x="86" y="86" width="340" height="340" rx="96" fill="url(#g)"/><path d="M256 144 151 368h58l20-48h54l20 48h58L256 144Zm0 83 25 60h-50l25-60Z" fill="#111"/></svg>`;
const icon192Png = 'iVBORw0KGgoAAAANSUhEUgAAAMAAAADACAYAAABS3GwHAAADNUlEQVR42u3dsW0iURRAUYMIQDRD4MQ0Q+iaHLoZnDigI5zYuWWNh5l/zylgtTDv/vdHYrWb/eF4f4Kora8AAYAAQAAgABAACAAEAAIAAYAAQAAgABAACAAEAAIAAYAAQAAgABAACAAEAAIAAYAAQAAgABAACADmsSt/+Nv72QR8O12uyc+9qfwHGYZdFLkADL0YkgEYfCEkAzD4QkgGYPCF8Fdbw0/5+9/68ik/h1VegQy+K1F2Axh+zycbgOH3nLIBGH4RZAMw/CLIBmD4ReAKBMUAnP62QDYAwy+CbACGXwSuQFAMwOlvC9gAUAygePq/vH7aAgKAeADl098WEAAIoHz3L24BAYSvPyzjudsACzj9bQEBgABAANHrj2tQNAAvwF6EbQCnvy0gABBA/vS3BQQAAiif/ggA4QgABBA/xW0BAYAA3OERgJAQgKFFAIJCACCA0GltCwgABOCujgAEhgDWP5wfb8++OAFgCwgg5+f0twUE4FS2BQQAAvDyiwC67wOuQQJw90cATnsBCiB2+nsvEAC2gABcfxCAUxcB2BCCFIDTHwG4/wtTAE5/BGBTIABDbUMJwPUHAdgYQhXAsk9/d3oB4LomAMOEANzlXZ0E4PT3d1+Gna/AENoACFAAGB4BIGQBYGgEAAJw+vtMAgABYAsIwJAgAAQuAMPBEPwW6B9N9WtOYdoAqzv9p/wp89Q/ixaUAEAAS7/62AIC8PKLAOqn/xx/tgCc/j67AEAATsAFX1G8DAsAxgngdLk6/cNb4FHP3wYAASAAL7+ruv54GRYAjBXAnC9CI5z+o2yBR78A2wDYAO7+6zz9vQsMFsAS1iG95536J5Gj/prSr0QHuQLZAk5/7wBQDsAWcPrbAFAOwBZw+uc3gAgMf/4KJALD7x0AygHYAk7//AYQgeHPX4FEYPjz7wAi8JzyL8Ei8HymtNkfjve1ftm397OJM/itDWAbeA4CEIHv3xXIlcjgC0AIBl8AQjD4AhCDoReAKAy7AODX/BwaAYAAQAAgABAACAAEAAIAAYAAQAAgABAACAAEAAIAAYAAQAAgABAACAAEAAIAAYAAQAAgABAAzOkLLZQ1UPnrDUYAAAAASUVORK5CYII=';
const icon512Png = 'iVBORw0KGgoAAAANSUhEUgAAAgAAAAIACAYAAAD0eNT6AAAK2klEQVR42u3bO3Ii2xJAUUFgQDAZDBwxGUyNCVOTAQeDGSFLBlIgPkGV8rOWd73X9ag8+2R1T+aL5fkNAGhl6hEAgAAAAAQAACAAAAABAAAIAABAAAAAAgAAEAAAgAAAAAQAACAAAAABAAAIAABAAAAAAgAAEAAAgAAAAAEAAAgAAEAAAAACAAAQAACAAAAABAAAIAAAAAEAAAgAAEAAAAACAAAQAACAAAAABAAAIAAAAAEAAAIAABAAAIAAAAAEAAAgAAAAAQAACAAAQAAAAAIAABAAAIAAAAAEAAAgAAAAAQAACAAAQAAAAAIAAAQAACAAAAABAAAIAABAAAAAAgAAEAAAgAAAAAQAACAAAAABAAAIAABAAAAAAgAAEAAAgAAAAAQAAAgAAEAAAAACAAAQAACAAAAABAAAIAAAAAEAAAgAAEAAAAACAAAQAACAAAAABAAAIAAAAAEAAAgAAGhv5hGQ1elz4yEQwmq79xBIZzJfLM8eAw55EAcIAHDYgyhAAIADHwQBAgAc+CAIEADg0AcxgAAABz8IAQQADn1ADCAAcPADQgABgIMfEAIIABz8gBBAAODgB4QAAgAHPyAEEAA4+AEhgADAwQ8IAR4w9Qhw+IP3GxsADAbANgAbABz+gPceAYAhAHj/KcEnAC8+gE8CNgA4/AFzAQGAlxwwHyjJJwAvNsAvPgnYAODwB8wNBABeYsD8QADg5QXMEQQAXlrAPEEA4GUFzBUEAF5SwHxBAODlBMwZBABeSsC8QQDgZQTMHQQAXkLA/EEA4OUDzCEEgJcOwDxCAHjZAMwlBAAAIABUNoD5hADwcgGYUwIALxWAeSUAAAABgJoGMLcEAF4iAPNLAODlATDHBAAAIABQzYB5hgDAywKYawgAAEAAqGQA8w0BAAAIAHUMYM4hAAAAAaCKAcw7BAAAIADUMIC5hwAAAAGACqab94+jh4D5JwAAAAGA+qXF7d8WAHNQAAAAAgDVS/Xb/7X/BvNQAAAAAgCodvu3BQABwEisuwDMRQEAAAgAlQvDubXm9xkA81EAAAACAKh++7cFAAHAQKy3AMxJAQCEu/3bAoAAAAAEANDl9g8IAF7Idy2EA5iXAgAAEABAzFu8LQAIAABAAPAI37PIePu3BcDcFAAAgAAAutz+AQEACApAAAAAAoCr/EUWqtzWbQEwPwUAACAAgOq3f1sAEAAAgAAAutz+bQFAAAAAAgDocvsHBAB38E9YEBxgjgoAAEAAALlv47YAIAAAAAEAdLmF2wKAAAAABADg9g0IAECIAAIAABAAQPJbty0ACAAAQAAAXW7btgAgAAAAAQC4ZQMCABAogAAAAAQAkPx2bQsAAgAAEABAl1u1LQAIAABAAABu04AAAIQLIAAAhyggAAABAwgAAEAAgNuzPwcgAAAAAQBuzQACABA0gAAAhyUgAACEDQgAAEAAAG7J/nwgAAAAAQC4HQMCAEDogAAAHIqAAAAQPCAAAAABAG7D/tyAAAAABAC4BQMIAEAAAQIAHH4AAgAQQoAAAIfeFYfd2v8ZIAAAbAFAAAClfd/+bQFAAABuu4AAABBGIACAMofcz7W/zwAgAABsAUAAAA43QAAA6UVf9wslEACAMAAEAOTlVut5gQAAAAQAuM2O59aa32cAEAAAwgkEAOAQAwQAkM696/1InwEEFAgAcPsHEACAkAIEAPAnf7sfEADg1ioYAAEACCoQAEC5w8ptHhAAQNpwsAUAAQBu/wACAMhyixdYIAAAAQEIAHA7BRAAgNu70AIBAA4lAAEAjCjiJkFwgQAAh1GSQxsQAAC2ACAAgOhsFEAAAG6hgAAA3NYFGAgAcPsXFoAAABBiIADAoeOWDggAIJuogWELAAIAHDYAAgDczgEEAFCWzQwIAHDIDMimAQQA4FAWaCAAwOECIACAsiJvHIQaCABocahY/wMCAAAQAMBwfAYAAQClWf8DAgBAuIEAAIcIgAAARhRh/R/9E4SAAwEADg8AAQAAAgDgaT4DgACAMqIfGv75HyAAAGwBQACAw2J8NhIgAACHrbADAQAOCQABAAAIAHD7f0zk9X+GTxM2PCAAAEAAAHRhCwACAFIdChlW7P6FAggAAMEHgc08AhwGR/87ARsAAOEHAgAcAgACAAAQAACJ2QAhAMDwBxAAAEIQBAAY+gACAEAQggAAwx5AAAAAAgDc/vHbAAEAAAgAAFsAEABguAMIAAChCAIADHUAAQAACABw+8dvBgQAACAAAGwBQABgiAMIAAAEJAIADG8AAQAACABw+8dvCQQAACAAAGwBQACAYQ0gAACEJQgAMKQB/svMI4CYDru1KANsAKDTQVPl8K/2ZxEzCAAAQACAm5kbsy0ACAAAQAAA1GILgAAAw/ilKq7/O/zZQAAAAAIA3P7dkKv+GX0GQAAAAAIA3MDc/m0BQAAAAAIAoBZbAAQAGLpP6fjP4/yTQBAAAIAAALd/WwC/SRAAAIAAADct/DZBAEBq/iKcZwACAMAWAARAFavt3kMwXN18PQvMUQEAAAgAaHn7x28VBAA0ZOXtmYAAADcq/GZBAICbrmcDCABwk8JvFwRATv4JC264nhHmpwAAsAUAAQCGJ4AAgLKstj0rEADg9o/fMgiADvxFFjdaPDPMTQEAbkz4TYMAAAAEAJRile3Z2QIgAJrzPcuQBMxLAQBusHiGIADA7R+/cRAAAIAAqMN3rT43I6trz9IWwJwUAACAAAC3f2wBbAEQAO1YbwGYjwIA3FTxbEEAqNx+rELx28dcFAAAgADADSgXK2rP2BYAAcBN1l0A5qEAwO3fzRRbABAAqhfAHGRYM48Atzj8fsAGAPULYP4JAABAAKCCAcw9AQAACADUMIB5JwAAAAGAKgbMOXNOAAAAAgB1DJhvCAAAQACoZABzDQHgZQEwzxAAAIAAUM0A5hgCwMsDYH4hALxEAOYWAgAABABqGsC8EgB4qQDMKQGAlwvAfBIAAIAAQGUD5hICAC8bYB4hAPDSAeYQAgAvH2D+IADwEgLmDgIALyNg3iAA8FIC5gwCAC8nYL4gAPCSAuYKAgAvK2CeIAC8tADmCALAywtgfiAAvMQA5kZXk/liefYY+jh9bjwEwMGPDYCXG8B8EAB4yQFzgRZ8AmjOJwFw8GMDgJcf8P4jADAEAO89VfkEwAWfBMDBjw0AhgPg/cYGANsAwMGPAEAIAA5+BABCAHDwIwAQAoCDHwGAEAAc/AgAhADg4EcAIAQABz8CADEAOPQRAAgBcPCDAEAMgEMfBACCABz4IAAQBODABwGAKACHPQgAxAE45EEAAEBXU48AAAQAACAAAAABAAAIAABAAAAAAgAAEAAAgAAAAAQAACAAAAABAAAIAABAAAAAAgAAEAAAgAAAAAQAAAgAAEAAAAACAAAQAACAAAAABAAAIAAAAAEAAAgAAEAAAAACAAAQAACAAAAABAAAIAAAAAEAAAgAABAAAIAAAAAEAAAgAAAAAQAACAAAQAAAAAIAABAAAIAAAAAEAAAgAAAAAQAACAAAQAAAAAIAABAAACAAAAABAAAIAABAAAAAAgAAEAAAgAAAAAQAACAAAAABAAAIAABAAAAAAgAAEAAAgAAAAAQAACAAAEAAAAACAAAQAACAAAAABAAAIAAAAAEAAAgAAEAAAAACAAAQAACAAAAABAAAIAAAAAEAAAgAAODSF5H2J7KWg/8nAAAAAElFTkSuQmCC';
const iconMaskable512Png = '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';

const serviceWorker = `const CACHE='aureon-console-v6-raster-safe-shell';
const SHELL=['/','/console','/console/app.js','/manifest.webmanifest','/icon.svg','/pwa/icon-192.png','/pwa/icon-512.png','/pwa/icon-maskable-512.png'];
const SHELL_PATHS=new Set(SHELL);
const SENSITIVE_PARAMS=['token','access_token','refresh_token','password','passwd','session','session_id','api_key','apikey','code','credential','credentials'];
const isSensitive=(request,url)=>request.headers.has('authorization')||request.headers.has('cookie')||request.headers.has('range')||request.headers.has('if-range')||SENSITIVE_PARAMS.some(key=>url.searchParams.has(key));
const isCacheable=(response)=>response&&response.ok&&response.type==='basic'&&!response.redirected&&response.status!==206&&!response.headers.has('content-range')&&!response.headers.has('set-cookie')&&!/(?:private|no-store)/i.test(response.headers.get('cache-control')||'');
self.addEventListener('install',event=>{event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(SHELL)));self.skipWaiting();});
self.addEventListener('activate',event=>{event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key!==CACHE).map(key=>caches.delete(key)))));self.clients.claim();});
self.addEventListener('fetch',event=>{const request=event.request;if(request.method!=='GET')return;const url=new URL(request.url);if(url.origin!==self.location.origin||isSensitive(request,url))return;if(request.mode==='navigate'){event.respondWith(fetch(request,{cache:'no-store',redirect:'manual'}).then(response=>response.type==='opaqueredirect'?Promise.reject(new Error('redirect')):response).catch(()=>caches.match('/console')));return;}if(!SHELL_PATHS.has(url.pathname))return;event.respondWith(caches.match(request).then(hit=>hit||fetch(request,{cache:'no-store',redirect:'manual'}).then(response=>{if(isCacheable(response)){const copy=response.clone();event.waitUntil(caches.open(CACHE).then(cache=>cache.put(request,copy)));}return response;})));});`;

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
<meta name="format-detection" content="telephone=no">
<link rel="manifest" href="/manifest.webmanifest">
<link rel="icon" href="/pwa/icon-192.png" type="image/png">
<link rel="apple-touch-icon" href="/pwa/icon-192.png">
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

function sendPng(res, base64) {
  res.type('image/png').set('Cache-Control', 'public, max-age=86400, immutable').send(Buffer.from(base64, 'base64'));
}

export function registerConsoleRoutes({ app }) {
  app.get('/', (_req, res) => res.type('html').send(page));
  app.get('/console', (_req, res) => res.type('html').send(page));
  app.get('/manifest.webmanifest', (_req, res) => {
    res.type('application/manifest+json').set('Cache-Control', 'no-cache').send(JSON.stringify(manifest));
  });
  app.get('/icon.svg', (_req, res) => {
    res.type('image/svg+xml').set('Cache-Control', 'public, max-age=86400').send(iconSvg);
  });
  app.get('/pwa/icon-192.png', (_req, res) => sendPng(res, icon192Png));
  app.get('/pwa/icon-512.png', (_req, res) => sendPng(res, icon512Png));
  app.get('/pwa/icon-maskable-512.png', (_req, res) => sendPng(res, iconMaskable512Png));
  app.get('/sw.js', (_req, res) => {
    res.type('application/javascript').set('Cache-Control', 'no-cache').send(serviceWorker);
  });
  app.get('/console/app.js', (_req, res) => {
    res.type('application/javascript').set('Cache-Control', 'no-cache').send(`(${runAureonConsole.toString()})();(${runConsoleEnhancements.toString()})();if('serviceWorker' in navigator&&window.isSecureContext){navigator.serviceWorker.register('/sw.js?v=6-raster-safe-shell',{updateViaCache:'none'}).then(registration=>registration.update()).catch(()=>{});}let deferredInstallPrompt=null;window.addEventListener('beforeinstallprompt',event=>{event.preventDefault();deferredInstallPrompt=event;if(document.getElementById('installAureon'))return;const button=document.createElement('button');button.id='installAureon';button.textContent='Instalar app';button.style.cssText='position:fixed;right:16px;bottom:16px;z-index:9999;padding:11px 14px;border:1px solid #87672d;border-radius:12px;background:#181b21;color:#f0cc78;font:600 13px system-ui;cursor:pointer';button.addEventListener('click',async()=>{if(!deferredInstallPrompt)return;deferredInstallPrompt.prompt();await deferredInstallPrompt.userChoice;deferredInstallPrompt=null;button.remove();});document.body.appendChild(button);});window.addEventListener('appinstalled',()=>{deferredInstallPrompt=null;document.getElementById('installAureon')?.remove();});`);
  });
}
