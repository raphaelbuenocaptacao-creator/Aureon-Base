export function runConsoleEnhancements() {
  const API = location.origin;
  const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[char]));

  async function requestJson(path, options = {}) {
    const token = localStorage.getItem('aureon_access_token') || '';
    if (!token) throw new Error('auth_required');
    const response = await fetch(API + path, {
      ...options,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(options.body ? { 'Content-Type': 'application/json' } : {}),
        ...(options.headers || {}),
      },
    });
    if (response.status === 204) return null;
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || `http_${response.status}`);
    return data;
  }

  async function get(path) {
    try {
      return await requestJson(path);
    } catch {
      return null;
    }
  }

  const compactJson = value => {
    try {
      const text = JSON.stringify(value ?? {});
      return text.length > 180 ? `${text.slice(0, 177)}…` : text;
    } catch {
      return '{}';
    }
  };

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
    const [environments, keys, storage, collections] = await Promise.all([
      get(`/v1/admin/projects/${encodeURIComponent(project.slug)}/environments`),
      get(`/v1/admin/projects/${encodeURIComponent(project.slug)}/keys`),
      get(`/v1/projects/${encodeURIComponent(project.slug)}/storage?bucket=default&limit=100`),
      get(`/v1/admin/projects/${encodeURIComponent(project.slug)}/collections`),
    ]);
    const envRows = Array.isArray(environments) ? environments.map(env => `<tr><td><b>${esc(env.name)}</b></td><td>${Number(env.records || 0)}</td><td><span class="pill ${env.is_active ? 'ok' : ''}">${env.is_active ? 'ativo' : 'inativo'}</span></td></tr>`).join('') : '';
    const keyRows = Array.isArray(keys) ? keys.slice(0, 20).map(key => `<tr><td>${esc(key.name)}</td><td class="mono">${esc(key.key_prefix)}</td><td>${esc((key.scopes || []).join(', '))}</td><td><span class="pill ${key.is_active ? 'ok' : ''}">${key.is_active ? 'ativa' : 'revogada'}</span></td><td>${key.is_active ? `<button class="mini" data-revoke-key="${esc(key.id)}" data-key-project="${esc(project.slug)}" data-key-name="${esc(key.name)}">Revogar</button>` : '—'}</td></tr>`).join('') : '';
    const storageRows = Array.isArray(storage) ? storage.slice(0, 25).map(object => `<tr><td class="mono">${esc(object.object_key)}</td><td>${esc(object.content_type || '—')}</td><td>${Number(object.size_bytes || 0).toLocaleString('pt-BR')} B</td><td><span class="pill">${esc(object.visibility || 'private')}</span></td></tr>`).join('') : '';
    const storageBytes = Array.isArray(storage) ? storage.reduce((sum, object) => sum + Number(object.size_bytes || 0), 0) : 0;
    const github = project.github_url ? `<a href="${esc(project.github_url)}" target="_blank" rel="noopener noreferrer" class="mini gold" style="text-decoration:none">Abrir GitHub ↗</a>` : '<span class="pill">GitHub não vinculado</span>';
    content.insertAdjacentHTML('beforeend', `
      <div class="grid2" data-project-meta>
        <div class="panel"><div class="panel-head"><h2>Projeto / GitHub</h2>${github}</div><table><tbody><tr><td>Slug</td><td class="mono">${esc(project.slug)}</td></tr><tr><td>Repositório</td><td class="mono">${esc(project.github_repo || '—')}</td></tr><tr><td>Status</td><td><span class="pill ${project.is_active ? 'ok' : ''}">${project.is_active ? 'ativo' : 'inativo'}</span></td></tr></tbody></table></div>
        <div class="panel"><div class="panel-head"><h2>Ambientes</h2></div>${envRows ? `<table><thead><tr><th>Ambiente</th><th>Registros</th><th>Status</th></tr></thead><tbody>${envRows}</tbody></table>` : '<div class="empty">Ambientes indisponíveis.</div>'}</div>
      </div>
      <div class="panel" data-storage-panel><div class="panel-head"><h2>Storage · bucket default</h2><span class="pill">${Array.isArray(storage) ? storage.length : 0} objetos · ${storageBytes.toLocaleString('pt-BR')} B</span></div>${storageRows ? `<table><thead><tr><th>Objeto</th><th>Tipo</th><th>Tamanho</th><th>Visibilidade</th></tr></thead><tbody>${storageRows}</tbody></table>` : '<div class="empty">Nenhum objeto no bucket default ou Storage indisponível.</div>'}</div>
      <div class="panel" data-api-keys-panel>
        <div class="panel-head"><h2>API Keys</h2><div class="actions"><span class="pill">segredos aparecem somente na criação</span><button class="mini gold" data-create-key="${esc(project.slug)}">+ Nova chave</button></div></div>
        ${keyRows ? `<table><thead><tr><th>Nome</th><th>Prefixo</th><th>Escopos</th><th>Status</th><th>Ação</th></tr></thead><tbody>${keyRows}</tbody></table>` : '<div class="empty">Nenhuma API key criada.</div>'}
      </div>`);

    const collectionTable = [...content.querySelectorAll('.panel')].find(panel => panel.querySelector('h2')?.textContent?.includes('Database / Coleções'))?.querySelector('table');
    if (collectionTable && Array.isArray(collections)) {
      const rows = [...collectionTable.querySelectorAll('tbody tr')];
      rows.forEach((row, index) => {
        const collection = collections[index];
        if (!collection || row.querySelector('[data-view-collection]')) return;
        const cell = document.createElement('td');
        cell.innerHTML = `<button class="mini" data-view-collection="${esc(collection.name)}" data-view-project="${esc(project.slug)}">Ver registros</button>`;
        row.appendChild(cell);
      });
      const head = collectionTable.querySelector('thead tr');
      if (head && !head.querySelector('[data-data-view-head]')) {
        const th = document.createElement('th');
        th.dataset.dataViewHead = '1';
        th.textContent = 'Dados';
        head.appendChild(th);
      }
    }
    content.dataset.projectMetaEnhanced = '1';
  }

  async function showRecords(slug, collection) {
    const records = await get(`/v1/projects/${encodeURIComponent(slug)}/data/${encodeURIComponent(collection)}?environment=production&limit=50`);
    const content = document.querySelector('#content');
    if (!content) return;
    content.querySelector('[data-record-viewer]')?.remove();
    const rows = Array.isArray(records) ? records.map(record => `<tr><td class="mono">${esc(record.id)}</td><td class="mono">${esc(compactJson(record.data))}</td><td>${esc(record.owner_user_id || '—')}</td><td>${record.updated_at ? new Date(record.updated_at).toLocaleString('pt-BR') : '—'}</td></tr>`).join('') : '';
    content.insertAdjacentHTML('beforeend', `<div class="panel" data-record-viewer><div class="panel-head"><h2>Registros · ${esc(collection)} · production</h2><span class="pill">somente leitura · até 50 registros</span></div>${rows ? `<table><thead><tr><th>ID</th><th>Dados</th><th>Proprietário</th><th>Atualizado</th></tr></thead><tbody>${rows}</tbody></table>` : '<div class="empty">Nenhum registro encontrado ou acesso indisponível.</div>'}</div>`);
  }

  async function createApiKey(slug) {
    const name = window.prompt('Nome da nova API key (ex.: integracao-vercel):')?.trim();
    if (!name) return;
    const scopeInput = window.prompt('Escopos separados por vírgula: read, write, admin', 'read')?.trim();
    if (!scopeInput) return;
    const scopes = [...new Set(scopeInput.split(',').map(value => value.trim().toLowerCase()).filter(Boolean))];
    if (!scopes.length || scopes.some(scope => !['read', 'write', 'admin'].includes(scope))) {
      window.alert('Escopos inválidos. Use somente read, write e/ou admin.');
      return;
    }
    const created = await requestJson(`/v1/admin/projects/${encodeURIComponent(slug)}/keys`, {
      method: 'POST',
      body: JSON.stringify({ name, scopes }),
    });
    if (!created?.api_key) throw new Error('api_key_not_returned');
    const panel = document.querySelector('[data-api-keys-panel]');
    panel?.querySelector('[data-new-key-secret]')?.remove();
    panel?.insertAdjacentHTML('afterbegin', `<div class="empty" data-new-key-secret style="text-align:left"><b>Chave criada. Copie agora — ela não será mostrada novamente.</b><div class="mono" style="margin-top:8px;word-break:break-all">${esc(created.api_key)}</div><button class="mini gold" data-copy-new-key style="margin-top:8px">Copiar</button></div>`);
  }

  async function revokeApiKey(slug, keyId, name) {
    if (!window.confirm(`Revogar a chave "${name}"? Aplicações que usam essa chave deixarão de autenticar.`)) return;
    await requestJson(`/v1/admin/projects/${encodeURIComponent(slug)}/keys/${encodeURIComponent(keyId)}`, { method: 'DELETE' });
    const content = document.querySelector('#content');
    if (content) {
      delete content.dataset.projectMetaEnhanced;
      content.querySelectorAll('[data-project-meta],[data-storage-panel],[data-api-keys-panel]').forEach(node => node.remove());
    }
    await decorateProjectDetail();
  }

  document.addEventListener('click', event => {
    const viewButton = event.target.closest('[data-view-collection]');
    if (viewButton) {
      showRecords(viewButton.dataset.viewProject, viewButton.dataset.viewCollection).catch(() => {});
      return;
    }
    const createButton = event.target.closest('[data-create-key]');
    if (createButton) {
      createApiKey(createButton.dataset.createKey).catch(error => window.alert(`Não foi possível criar a chave: ${error.message}`));
      return;
    }
    const revokeButton = event.target.closest('[data-revoke-key]');
    if (revokeButton) {
      revokeApiKey(revokeButton.dataset.keyProject, revokeButton.dataset.revokeKey, revokeButton.dataset.keyName).catch(error => window.alert(`Não foi possível revogar a chave: ${error.message}`));
      return;
    }
    const copyButton = event.target.closest('[data-copy-new-key]');
    if (copyButton) {
      const value = copyButton.closest('[data-new-key-secret]')?.querySelector('.mono')?.textContent || '';
      if (value && navigator.clipboard) navigator.clipboard.writeText(value).then(() => { copyButton.textContent = 'Copiada'; }).catch(() => {});
    }
  });

  async function enhance() {
    try { await decorateProjects(); await decorateProjectDetail(); } catch { /* core console remains usable */ }
  }

  const observer = new MutationObserver(() => queueMicrotask(enhance));
  const target = document.querySelector('#content');
  if (target) observer.observe(target, { childList: true, subtree: true });
  enhance();
}
