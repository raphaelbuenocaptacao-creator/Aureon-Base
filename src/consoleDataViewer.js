export function runConsoleDataViewer() {
  const API = location.origin;
  const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[char]));

  async function get(path) {
    const token = localStorage.getItem('aureon_access_token') || '';
    if (!token) return null;
    const response = await fetch(API + path, { headers: { Authorization: `Bearer ${token}` } });
    if (!response.ok) return null;
    return response.json().catch(() => null);
  }

  function compactJson(value) {
    try {
      const text = JSON.stringify(value ?? {});
      return text.length > 180 ? `${text.slice(0, 177)}…` : text;
    } catch {
      return '{}';
    }
  }

  async function discoverProject() {
    const content = document.querySelector('#content');
    const title = document.querySelector('#title')?.textContent?.trim();
    if (!content?.querySelector('[data-action="back-projects"]') || !title) return null;
    const projects = await get('/v1/admin/projects');
    return Array.isArray(projects) ? projects.find(project => project.name === title) || null : null;
  }

  async function decorateCollections() {
    const content = document.querySelector('#content');
    if (!content || content.dataset.dataViewerEnhanced === '1') return;
    const project = await discoverProject();
    if (!project) return;
    const collections = await get(`/v1/admin/projects/${encodeURIComponent(project.slug)}/collections`);
    if (!Array.isArray(collections) || !collections.length) return;
    const table = [...content.querySelectorAll('.panel')].find(panel => panel.querySelector('h2')?.textContent?.includes('Database / Coleções'))?.querySelector('table');
    if (!table) return;
    const rows = [...table.querySelectorAll('tbody tr')];
    rows.forEach((row, index) => {
      const collection = collections[index];
      if (!collection || row.querySelector('[data-view-collection]')) return;
      const cell = document.createElement('td');
      cell.innerHTML = `<button class="mini" data-view-collection="${esc(collection.name)}" data-view-project="${esc(project.slug)}">Ver registros</button>`;
      row.appendChild(cell);
    });
    const head = table.querySelector('thead tr');
    if (head && !head.querySelector('[data-data-view-head]')) {
      const th = document.createElement('th');
      th.dataset.dataViewHead = '1';
      th.textContent = 'Dados';
      head.appendChild(th);
    }
    content.dataset.dataViewerEnhanced = '1';
  }

  async function showRecords(slug, collection) {
    const records = await get(`/v1/projects/${encodeURIComponent(slug)}/data/${encodeURIComponent(collection)}?environment=production&limit=50`);
    const content = document.querySelector('#content');
    if (!content) return;
    content.querySelector('[data-record-viewer]')?.remove();
    const rows = Array.isArray(records) ? records.map(record => `<tr>
      <td class="mono">${esc(record.id)}</td>
      <td class="mono">${esc(compactJson(record.data))}</td>
      <td>${esc(record.owner_user_id || '—')}</td>
      <td>${record.updated_at ? new Date(record.updated_at).toLocaleString('pt-BR') : '—'}</td>
    </tr>`).join('') : '';
    content.insertAdjacentHTML('beforeend', `<div class="panel" data-record-viewer>
      <div class="panel-head"><h2>Registros · ${esc(collection)} · production</h2><span class="pill">somente leitura · até 50 registros</span></div>
      ${rows ? `<table><thead><tr><th>ID</th><th>Dados</th><th>Proprietário</th><th>Atualizado</th></tr></thead><tbody>${rows}</tbody></table>` : '<div class="empty">Nenhum registro encontrado ou acesso indisponível.</div>'}
    </div>`);
  }

  document.addEventListener('click', event => {
    const button = event.target.closest('[data-view-collection]');
    if (!button) return;
    showRecords(button.dataset.viewProject, button.dataset.viewCollection).catch(() => {});
  });

  async function enhance() {
    try { await decorateCollections(); } catch { /* core console remains usable */ }
  }

  const observer = new MutationObserver(() => queueMicrotask(enhance));
  const target = document.querySelector('#content');
  if (target) observer.observe(target, { childList: true, subtree: true });
  enhance();
}
