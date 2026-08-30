export function runConsoleEnhancements() {
  const API = location.origin;
  const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[char]));

  async function get(path) {
    const token = localStorage.getItem('aureon_access_token') || '';
    if (!token) return null;
    const response = await fetch(API + path, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!response.ok) return null;
    return response.json().catch(() => null);
  }

  async function decorateProjects() {
    const content = document.querySelector('#content');
    if (!content || content.dataset.githubEnhanced === '1') return;
    const rows = [...content.querySelectorAll('tr.project[data-project]')];
    if (!rows.length) return;
    const projects = await get('/v1/admin/projects');
    if (!Array.isArray(projects)) return;
    const bySlug = new Map(projects.map(project => [project.slug, project]));
    for (const row of rows) {
      const project = bySlug.get(row.dataset.project);
      if (!project?.github_url) continue;
      const first = row.querySelector('td');
      if (!first || first.querySelector('[data-github-link]')) continue;
      first.insertAdjacentHTML('beforeend', ` <a data-github-link href="${esc(project.github_url)}" target="_blank" rel="noopener noreferrer" style="color:#f0cc78;font-size:11px;text-decoration:none;margin-left:8px">GitHub ↗</a>`);
    }
    content.dataset.githubEnhanced = '1';
  }

  async function decorateProjectDetail() {
    const content = document.querySelector('#content');
    const title = document.querySelector('#title')?.textContent?.trim();
    if (!content || !title || content.dataset.projectMetaEnhanced === '1') return;
    if (!content.querySelector('[data-action="back-projects"]')) return;
    const projects = await get('/v1/admin/projects');
    if (!Array.isArray(projects)) return;
    const project = projects.find(item => item.name === title);
    if (!project) return;
    const [environments, keys] = await Promise.all([
      get(`/v1/admin/projects/${encodeURIComponent(project.slug)}/environments`),
      get(`/v1/admin/projects/${encodeURIComponent(project.slug)}/keys`),
    ]);
    const envRows = Array.isArray(environments) ? environments.map(env => `
      <tr><td><b>${esc(env.name)}</b></td><td>${env.records}</td><td><span class="pill ${env.is_active ? 'ok' : ''}">${env.is_active ? 'ativo' : 'inativo'}</span></td></tr>`).join('') : '';
    const keyRows = Array.isArray(keys) ? keys.slice(0, 8).map(key => `
      <tr><td>${esc(key.name)}</td><td class="mono">${esc(key.key_prefix)}</td><td>${esc((key.scopes || []).join(', '))}</td><td><span class="pill ${key.is_active ? 'ok' : ''}">${key.is_active ? 'ativa' : 'revogada'}</span></td></tr>`).join('') : '';
    const github = project.github_url
      ? `<a href="${esc(project.github_url)}" target="_blank" rel="noopener noreferrer" class="mini gold" style="text-decoration:none">Abrir GitHub ↗</a>`
      : '<span class="pill">GitHub não vinculado</span>';
    content.insertAdjacentHTML('beforeend', `
      <div class="grid2" data-project-meta>
        <div class="panel">
          <div class="panel-head"><h2>Projeto / GitHub</h2>${github}</div>
          <table><tbody>
            <tr><td>Slug</td><td class="mono">${esc(project.slug)}</td></tr>
            <tr><td>Repositório</td><td class="mono">${esc(project.github_repo || '—')}</td></tr>
            <tr><td>Status</td><td><span class="pill ${project.is_active ? 'ok' : ''}">${project.is_active ? 'ativo' : 'inativo'}</span></td></tr>
          </tbody></table>
        </div>
        <div class="panel">
          <div class="panel-head"><h2>Ambientes</h2></div>
          ${envRows ? `<table><thead><tr><th>Ambiente</th><th>Registros</th><th>Status</th></tr></thead><tbody>${envRows}</tbody></table>` : '<div class="empty">Ambientes indisponíveis.</div>'}
        </div>
      </div>
      <div class="panel" data-api-keys-panel>
        <div class="panel-head"><h2>API Keys</h2><span class="pill">segredos nunca são exibidos novamente</span></div>
        ${keyRows ? `<table><thead><tr><th>Nome</th><th>Prefixo</th><th>Escopos</th><th>Status</th></tr></thead><tbody>${keyRows}</tbody></table>` : '<div class="empty">Nenhuma API key criada.</div>'}
      </div>`);
    content.dataset.projectMetaEnhanced = '1';
  }

  async function enhance() {
    try {
      await decorateProjects();
      await decorateProjectDetail();
    } catch {
      // Enhancement is deliberately non-blocking; core console remains usable.
    }
  }

  const observer = new MutationObserver(() => queueMicrotask(enhance));
  const target = document.querySelector('#content');
  if (target) observer.observe(target, { childList: true, subtree: true });
  enhance();
}
