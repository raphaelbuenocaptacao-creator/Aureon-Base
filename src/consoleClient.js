export function runAureonConsole() {
  const API = location.origin;
  const state = {
    token: localStorage.getItem('aureon_access_token') || '',
    refresh: localStorage.getItem('aureon_refresh_token') || '',
    projects: [],
    selected: null,
    recoveryEmail: '',
  };

  const $ = selector => document.querySelector(selector);
  const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[char]));

  async function raw(path, options = {}, token = state.token) {
    return fetch(API + path, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(options.headers || {}),
      },
    });
  }

  async function request(path, options = {}, retry = true) {
    let response = await raw(path, options);
    if (response.status === 401 && retry && state.refresh && path !== '/auth/refresh') {
      const refreshed = await raw('/auth/refresh', {
        method: 'POST',
        body: JSON.stringify({ refresh_token: state.refresh }),
      }, '');
      if (refreshed.ok) {
        const data = await refreshed.json();
        state.token = data.access_token;
        localStorage.setItem('aureon_access_token', state.token);
        response = await raw(path, options);
      }
    }
    if (response.status === 204) return null;
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(data.error || `Erro ${response.status}`);
      error.status = response.status;
      error.data = data;
      throw error;
    }
    return data;
  }

  function authUI(authenticated) {
    $('#login').classList.toggle('hidden', authenticated);
    $('#app').classList.toggle('hidden', !authenticated);
  }

  function showAuthView(formId) {
    document.querySelectorAll('.auth-form').forEach(form => form.classList.toggle('hidden', form.id !== formId));
    document.querySelectorAll('.auth-tab').forEach(tab => tab.classList.toggle('active', tab.dataset.authView === formId));
    document.querySelectorAll('.msg').forEach(message => {
      message.textContent = '';
      message.classList.remove('ok');
    });
  }

  function signOutLocal() {
    localStorage.removeItem('aureon_access_token');
    localStorage.removeItem('aureon_refresh_token');
    state.token = '';
    state.refresh = '';
    authUI(false);
  }

  async function login(event) {
    event.preventDefault();
    $('#loginMsg').textContent = '';
    try {
      const data = await request('/auth/login', {
        method: 'POST',
        body: JSON.stringify({
          email: $('#email').value.trim().toLowerCase(),
          password: $('#password').value,
        }),
      }, false);
      state.token = data.access_token;
      state.refresh = data.refresh_token;
      localStorage.setItem('aureon_access_token', state.token);
      localStorage.setItem('aureon_refresh_token', state.refresh);
      const me = await request('/me');
      if (!me.is_superadmin) {
        signOutLocal();
        throw new Error('Esta conta existe, mas o Console Aureon Base é restrito a administradores.');
      }
      authUI(true);
      await view('overview');
    } catch (error) {
      $('#loginMsg').textContent = error.message === 'invalid_credentials'
        ? 'E-mail ou senha inválidos.'
        : error.message;
    }
  }

  async function register(event) {
    event.preventDefault();
    const msg = $('#registerMsg');
    msg.textContent = '';
    msg.classList.remove('ok');
    const email = $('#registerEmail').value.trim().toLowerCase();
    const password = $('#registerPassword').value;
    if (password !== $('#registerPassword2').value) {
      msg.textContent = 'As senhas não são iguais.';
      return;
    }
    try {
      await request('/auth/register', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      }, false);
      msg.classList.add('ok');
      msg.textContent = 'Conta criada com sucesso. Agora você pode entrar com seu e-mail e senha.';
      $('#email').value = email;
      $('#password').value = '';
      setTimeout(() => showAuthView('loginForm'), 1200);
    } catch (error) {
      const messages = {
        email_already_exists: 'Este e-mail já possui uma conta.',
        email_not_allowed: 'O cadastro público ainda não está liberado para este e-mail.',
        project_not_found: 'Não foi possível vincular a conta ao projeto padrão.',
        invalid_credentials: 'Use um e-mail válido e uma senha com pelo menos 10 caracteres.',
      };
      msg.textContent = messages[error.message] || error.message;
    }
  }

  async function requestPasswordReset(event) {
    event.preventDefault();
    const msg = $('#recoverMsg');
    msg.textContent = '';
    msg.classList.remove('ok');
    const email = $('#recoverEmail').value.trim().toLowerCase();
    try {
      await request('/auth/request-password-reset', {
        method: 'POST',
        body: JSON.stringify({ email }),
      }, false);
      state.recoveryEmail = email;
      $('#recoverRequestStep').classList.add('hidden');
      $('#recoverResetStep').classList.remove('hidden');
      msg.classList.add('ok');
      msg.textContent = 'Se a conta existir, enviamos um token de recuperação para esse e-mail. Confira também o spam.';
    } catch {
      msg.classList.add('ok');
      msg.textContent = 'Se a conta existir, enviamos um token de recuperação para esse e-mail.';
    }
  }

  async function resetPassword() {
    const msg = $('#recoverMsg');
    msg.textContent = '';
    msg.classList.remove('ok');
    const token = $('#recoverToken').value.trim();
    const password = $('#recoverNewPassword').value;
    if (password.length < 10 || password.length > 128) {
      msg.textContent = 'A nova senha precisa ter entre 10 e 128 caracteres.';
      return;
    }
    if (password !== $('#recoverNewPassword2').value) {
      msg.textContent = 'As novas senhas não são iguais.';
      return;
    }
    try {
      await request('/auth/reset-password', {
        method: 'POST',
        body: JSON.stringify({
          email: state.recoveryEmail || $('#recoverEmail').value.trim().toLowerCase(),
          token,
          new_password: password,
        }),
      }, false);
      msg.classList.add('ok');
      msg.textContent = 'Senha redefinida com sucesso. Você já pode entrar com a nova senha.';
      $('#email').value = state.recoveryEmail || $('#recoverEmail').value.trim().toLowerCase();
      $('#password').value = '';
      setTimeout(() => showAuthView('loginForm'), 1400);
    } catch (error) {
      msg.textContent = ['invalid_reset', 'invalid_reset_token'].includes(error.message)
        ? 'Token inválido, expirado ou já utilizado. Solicite outro token.'
        : error.message;
    }
  }

  function resetRecoveryRequest() {
    $('#recoverResetStep').classList.add('hidden');
    $('#recoverRequestStep').classList.remove('hidden');
    $('#recoverToken').value = '';
    $('#recoverNewPassword').value = '';
    $('#recoverNewPassword2').value = '';
    $('#recoverMsg').textContent = '';
    $('#recoverMsg').classList.remove('ok');
  }

  function cards(overview) {
    return '<div class="cards">' + [
      ['Projetos', overview.projects],
      ['Usuários', overview.users],
      ['Registros', overview.records],
      ['Eventos', overview.audit_events],
      ['Sessões', overview.active_sessions],
    ].map(([label, value]) => `<div class="card"><span>${label}</span><b>${escapeHtml(value)}</b></div>`).join('') + '</div>';
  }

  function projectPanel(projects, title = 'Projetos') {
    const rows = projects.map(project => `
      <tr class="project" data-project="${escapeHtml(project.slug)}">
        <td><b>${escapeHtml(project.name)}</b></td>
        <td class="mono">${escapeHtml(project.slug)}</td>
        <td>${project.users}</td>
        <td>${project.collections}</td>
        <td>${project.records}</td>
      </tr>`).join('');
    return `<div class="panel"><div class="panel-head"><h2>${title}</h2><div class="actions"><button class="mini gold" data-action="new-project">+ Novo projeto</button></div></div>${projects.length ? `<table><thead><tr><th>Projeto</th><th>Slug</th><th>Usuários</th><th>Coleções</th><th>Registros</th></tr></thead><tbody>${rows}</tbody></table>` : '<div class="empty">Nenhum projeto.</div>'}</div>`;
  }

  async function overview() {
    const [summary, projects] = await Promise.all([
      request('/v1/admin/overview'),
      request('/v1/admin/projects'),
    ]);
    state.projects = projects;
    return cards(summary) + projectPanel(projects, 'Projetos recentes');
  }

  async function projects() {
    state.projects = await request('/v1/admin/projects');
    return projectPanel(state.projects);
  }

  async function users() {
    const projectList = await request('/v1/admin/projects');
    const rows = [];
    for (const project of projectList) {
      const members = await request(`/v1/admin/projects/${encodeURIComponent(project.slug)}/users`);
      rows.push(...members.map(member => ({ ...member, project: project.name })));
    }
    const body = rows.map(user => `<tr><td>${escapeHtml(user.email)}</td><td>${escapeHtml(user.project)}</td><td><span class="pill">${escapeHtml(user.role)}</span></td><td><span class="pill ${user.is_active ? 'ok' : ''}">${user.is_active ? 'ativo' : 'inativo'}</span></td></tr>`).join('');
    return `<div class="panel"><div class="panel-head"><h2>Usuários por projeto</h2></div>${rows.length ? `<table><thead><tr><th>E-mail</th><th>Projeto</th><th>Papel</th><th>Status</th></tr></thead><tbody>${body}</tbody></table>` : '<div class="empty">Sem usuários.</div>'}</div>`;
  }

  async function logs() {
    const projectList = await request('/v1/admin/projects');
    const rows = [];
    for (const project of projectList) {
      const events = await request(`/v1/admin/projects/${encodeURIComponent(project.slug)}/logs?limit=40`);
      rows.push(...events.map(event => ({ ...event, project: project.name })));
    }
    rows.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    const body = rows.slice(0, 120).map(event => `<tr><td class="mono">${escapeHtml(event.event)}</td><td>${escapeHtml(event.project)}</td><td>${escapeHtml(event.email || 'sistema')}</td><td>${new Date(event.created_at).toLocaleString('pt-BR')}</td></tr>`).join('');
    return `<div class="panel"><div class="panel-head"><h2>Auditoria</h2></div>${rows.length ? `<table><thead><tr><th>Evento</th><th>Projeto</th><th>Usuário</th><th>Data</th></tr></thead><tbody>${body}</tbody></table>` : '<div class="empty">Sem eventos.</div>'}</div>`;
  }

  async function openProject(slug) {
    state.selected = slug;
    if (!state.projects.length) state.projects = await request('/v1/admin/projects');
    const project = state.projects.find(item => item.slug === slug);
    if (!project) return;
    const [collections, members, events] = await Promise.all([
      request(`/v1/admin/projects/${encodeURIComponent(slug)}/collections`),
      request(`/v1/admin/projects/${encodeURIComponent(slug)}/users`),
      request(`/v1/admin/projects/${encodeURIComponent(slug)}/logs?limit=20`),
    ]);
    $('#title').textContent = project.name;
    const collectionRows = collections.map(collection => `<tr><td class="mono">${escapeHtml(collection.name)}</td><td>${collection.records}</td><td><span class="pill">${collection.owner_scoped ? 'por usuário' : 'compartilhado'}</span></td></tr>`).join('');
    const logRows = events.slice(0, 8).map(event => `<tr><td class="mono">${escapeHtml(event.event)}</td><td>${new Date(event.created_at).toLocaleString('pt-BR')}</td></tr>`).join('');
    $('#content').innerHTML = `
      <button class="mini" data-action="back-projects">← Todos os projetos</button>
      <div class="cards">
        <div class="card"><span>Coleções</span><b>${collections.length}</b></div>
        <div class="card"><span>Usuários</span><b>${members.length}</b></div>
        <div class="card"><span>Registros</span><b>${collections.reduce((sum, item) => sum + item.records, 0)}</b></div>
      </div>
      <div class="grid2">
        <div class="panel"><div class="panel-head"><h2>Database / Coleções</h2><button class="mini gold" data-action="new-collection">+ Coleção</button></div>${collections.length ? `<table><thead><tr><th>Nome</th><th>Registros</th><th>Escopo</th></tr></thead><tbody>${collectionRows}</tbody></table>` : '<div class="empty">Sem coleções</div>'}</div>
        <div class="panel"><div class="panel-head"><h2>Últimos logs</h2></div>${events.length ? `<table><tbody>${logRows}</tbody></table>` : '<div class="empty">Sem logs</div>'}</div>
      </div>`;
  }

  function showModal(html) {
    $('#modal').innerHTML = `<div class="modal-card">${html}</div>`;
    $('#modal').classList.remove('hidden');
  }

  function hideModal() {
    $('#modal').classList.add('hidden');
    $('#modal').innerHTML = '';
  }

  function newProject() {
    showModal('<h3>Novo projeto</h3><div class="field"><label>Nome</label><input id="mName"></div><div class="field"><label>Slug</label><input id="mSlug" placeholder="meu-projeto"></div><div class="modal-actions"><button class="mini" data-action="close-modal">Cancelar</button><button class="mini gold" data-action="save-project">Criar</button></div>');
  }

  async function saveProject() {
    await request('/v1/admin/projects', {
      method: 'POST',
      body: JSON.stringify({ name: $('#mName').value, slug: $('#mSlug').value, trial_days: 0 }),
    });
    hideModal();
    await view('projects');
  }

  function newCollection() {
    showModal('<h3>Nova coleção</h3><div class="field"><label>Nome</label><input id="mCollection" placeholder="clientes"></div><div class="field"><label><input id="mOwner" type="checkbox" checked> Dados separados por usuário</label></div><div class="modal-actions"><button class="mini" data-action="close-modal">Cancelar</button><button class="mini gold" data-action="save-collection">Criar</button></div>');
  }

  async function saveCollection() {
    await request(`/v1/admin/projects/${encodeURIComponent(state.selected)}/collections`, {
      method: 'POST',
      body: JSON.stringify({ name: $('#mCollection').value, owner_scoped: $('#mOwner').checked }),
    });
    hideModal();
    await openProject(state.selected);
  }

  async function view(name) {
    document.querySelectorAll('.nav button').forEach(button => button.classList.toggle('active', button.dataset.view === name));
    const labels = { overview: 'Visão geral', projects: 'Projetos', users: 'Usuários', logs: 'Logs' };
    $('#title').textContent = labels[name] || 'Aureon Base';
    $('#content').innerHTML = '<div class="empty">Carregando...</div>';
    try {
      const loaders = { overview, projects, users, logs };
      $('#content').innerHTML = await loaders[name]();
    } catch (error) {
      if (error.status === 401) return signOutLocal();
      $('#content').innerHTML = `<div class="empty">Erro: ${escapeHtml(error.message)}</div>`;
    }
  }

  $('#loginForm').addEventListener('submit', login);
  $('#registerForm').addEventListener('submit', register);
  $('#recoverForm').addEventListener('submit', requestPasswordReset);
  $('#resetPasswordButton').addEventListener('click', resetPassword);
  $('#requestAgainButton').addEventListener('click', resetRecoveryRequest);
  document.querySelectorAll('[data-auth-view]').forEach(button => button.addEventListener('click', () => {
    if (button.dataset.authView === 'recoverForm') resetRecoveryRequest();
    showAuthView(button.dataset.authView);
  }));
  $('#logout').addEventListener('click', signOutLocal);
  document.querySelectorAll('.nav button').forEach(button => button.addEventListener('click', () => view(button.dataset.view)));
  document.addEventListener('click', async event => {
    const projectRow = event.target.closest('[data-project]');
    if (projectRow) return openProject(projectRow.dataset.project);
    const action = event.target.closest('[data-action]')?.dataset.action;
    if (!action) return;
    try {
      if (action === 'new-project') newProject();
      if (action === 'save-project') await saveProject();
      if (action === 'new-collection') newCollection();
      if (action === 'save-collection') await saveCollection();
      if (action === 'close-modal') hideModal();
      if (action === 'back-projects') await view('projects');
    } catch (error) {
      alert(error.message);
    }
  });

  (async () => {
    if (!state.token) return authUI(false);
    try {
      const me = await request('/me');
      if (!me.is_superadmin) throw new Error('admin_required');
      authUI(true);
      await view('overview');
    } catch {
      signOutLocal();
    }
  })();
}
