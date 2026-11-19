(() => {
  'use strict';

  // Dataset demonstrativo isolado: não realiza rede, gravação nem análise de IA.
  const FIRST = '2026-11-04';
  const LAST = '2026-11-18';
  const $ = (selector) => document.querySelector(selector);
  const number = new Intl.NumberFormat('pt-BR');
  const money = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });
  const labels = { direct: 'Direta', potential: 'Potencial', insufficient: 'A esclarecer', unmatched: 'Não identificada', pending: 'Pendente', error: 'Erro' };
  const categoryTemplates = [
    { title: 'Plataforma de identificação biométrica', object: 'Contratação de plataforma de identificação biométrica multimodal para cadastro e verificação de pessoas.', evidence: 'identificação biométrica multimodal', category: 'Biometria e identificação', weight: 6 },
    { title: 'Modernização de identidade civil', object: 'Modernização da infraestrutura de identidade civil e emissão de credenciais de identificação.', evidence: 'infraestrutura de identidade civil', category: 'Identidade civil', weight: 6 },
    { title: 'Carteira de identidade digital', object: 'Implantação de carteira de identidade digital integrada ao cadastro de titulares.', evidence: 'carteira de identidade digital', category: 'Identidade digital', weight: 6 },
    { title: 'Autenticação e gestão de acesso', object: 'Contratação de solução de autenticação multifator e gestão de identidade e acesso.', evidence: 'gestão de identidade e acesso', category: 'IAM e autenticação', weight: 5 },
    { title: 'Emissão de credenciais seguras', object: 'Fornecimento e emissão de credenciais profissionais seguras com identificação do titular.', evidence: 'credenciais profissionais seguras', category: 'Credenciais profissionais', weight: 3 }
  ];
  const uncertainTemplates = [
    { title: 'Integração de serviços de identificação', object: 'Contratação de serviços de integração para atendimento de identificação de pessoas.', evidence: 'identificação de pessoas', category: 'Integração de identidade', weight: 6, reason: 'Pode incluir integração de identidade; confirmar a entrega contratada.' },
    { title: 'Modernização de atendimento digital', object: 'Modernização de atendimento digital e serviços de validação de usuários.', evidence: 'validação de usuários', category: 'Verificação de identidade', weight: 4, reason: 'Há sinal de validação de usuários; verificar o escopo técnico.' },
    { title: 'Serviço especializado de tecnologia', object: 'Contratação de serviço especializado de tecnologia para sistemas institucionais.', evidence: 'serviço especializado de tecnologia', category: null, weight: null, reason: 'Objeto genérico; é necessário consultar os documentos do processo.' }
  ];
  const organizations = ['Órgão demonstrativo A', 'Entidade demonstrativa B', 'Instituição demonstrativa C', 'Secretaria demonstrativa D', 'Autarquia demonstrativa E'];
  const locations = [['Brasília', 'DF'], ['São Paulo', 'SP'], ['Rio de Janeiro', 'RJ'], ['Belo Horizonte', 'MG'], ['Curitiba', 'PR']];
  const allDays = [];
  const byId = new Map();
  const dateAt = (n) => `2026-11-${String(n).padStart(2, '0')}`;
  const humanDate = (date, options) => new Intl.DateTimeFormat('pt-BR', { timeZone: 'UTC', ...options }).format(new Date(`${date}T12:00:00Z`));
  const shortDate = (date) => humanDate(date, { day: '2-digit', month: '2-digit', year: 'numeric' });
  const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
  const normal = (value) => String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

  function makeRecord(day, status, index) {
    const seed = index + day * 7;
    const template = status === 'direct' ? categoryTemplates[seed % categoryTemplates.length] : uncertainTemplates[seed % uncertainTemplates.length];
    const irrelevant = status === 'unmatched';
    const pending = status === 'pending' || status === 'error';
    const item = {
      id: `DEMO-2026-${String(day).padStart(2, '0')}-${String(index).padStart(4, '0')}`,
      day: dateAt(day), status, order: index,
      title: irrelevant ? 'Compra de materiais administrativos' : pending ? 'Publicação aguardando análise' : template.title,
      object: irrelevant ? 'Aquisição de materiais de uso administrativo para unidade demonstrativa.' : pending ? 'Registro demonstrativo ainda não classificado.' : template.object,
      evidence: irrelevant || pending ? null : template.evidence,
      category: irrelevant || pending || status === 'insufficient' ? null : template.category,
      weight: irrelevant || pending || status === 'insufficient' ? null : template.weight,
      reason: irrelevant ? 'Nenhuma aderência identificada nos dados simulados.' : pending ? 'A análise desta publicação ainda não está disponível.' : status === 'direct' ? 'O objeto descreve uma solução presente no perfil.' : status === 'insufficient' ? 'Objeto genérico; é necessário consultar os documentos do processo.' : (template.reason || 'Pode haver aderência; confirmar detalhes do escopo.'),
      org: organizations[seed % organizations.length], city: locations[seed % locations.length][0], uf: locations[seed % locations.length][1],
      deadline: index % 7 === 0 ? null : `2026-12-${String(1 + seed % 20).padStart(2, '0')}`,
      value: index % 6 === 0 ? null : 380000 + (seed % 20) * 95000,
      valueType: 'Estimado', source: 'PNCP', docs: index % 17 === 0 ? Array.from({ length: 7 }, (_, n) => `Documento demonstrativo ${n + 1}`) : [],
    };
    byId.set(item.id, item);
    return item;
  }

  for (let day = 18; day >= 4; day--) {
    let counts = day === 18 ? { direct: 24, potential: 52, insufficient: 24, unmatched: 1860, pending: 40, error: 0 }
      : day === 17 ? { direct: 125, potential: 30, insufficient: 10, unmatched: 175, pending: 5, error: 0 }
        : day === 9 ? { direct: 0, potential: 0, insufficient: 0, unmatched: 95, pending: 5, error: 0 }
          : { direct: 4 + day % 12, potential: 7 + day % 10, insufficient: 3 + day % 5, unmatched: 110 + day * 4, pending: day % 3, error: day === 12 ? 1 : 0 };
    let index = 0;
    const items = [];
    for (const [status, count] of Object.entries(counts)) for (let n = 0; n < count; n++) items.push(makeRecord(day, status, ++index));
    allDays.push({ date: dateAt(day), items });
  }

  // Esta fronteira concentra as consultas que serão substituídas pelo backend.
  const source = {
    days: () => allDays,
    get: (id) => byId.get(id),
    find({ start, end, query, view }) {
      const text = normal(query.trim());
      return allDays.filter((day) => day.date >= start && day.date <= end).map((day) => {
        const items = day.items.filter((item) => {
          const selected = view === 'all' || ['direct', 'potential', 'insufficient'].includes(item.status);
          const corpus = normal([item.id, item.title, item.object, item.org, item.category, item.reason].join(' '));
          return selected && (!text || corpus.includes(text));
        });
        return { date: day.date, items, all: day.items };
      }).filter((day) => !text || day.items.length);
    }
  };
  const state = { filter: { start: FIRST, end: LAST, query: '', view: 'selected' }, days: [], shown: 0, dayStates: new Map(), opener: null, observer: null };
  const counts = (items) => ({ total: items.length, direct: items.filter((item) => item.status === 'direct').length, attention: items.filter((item) => item.status === 'potential' || item.status === 'insufficient').length, pending: items.filter((item) => item.status === 'pending' || item.status === 'error').length });
  const percentage = (part, total) => total ? `${(part * 100 / total).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%` : '—';
  const formattedCount = (value) => number.format(value);
  const icon = (name) => `<svg aria-hidden="true"><use href="#i-${name}"></use></svg>`;

  function renderOverview() {
    const yesterday = source.days()[0];
    const result = counts(yesterday.items);
    $('#total-count').textContent = formattedCount(result.total);
    $('#direct-count').textContent = formattedCount(result.direct);
    $('#direct-percent').textContent = percentage(result.direct, result.total);
    $('#attention-count').textContent = formattedCount(result.attention);
    $('#attention-percent').textContent = percentage(result.attention, result.total);
    $('#processed-count').textContent = `${formattedCount(result.total - result.pending)} analisados · ${formattedCount(result.pending)} pendentes`;
    $('#partial-note').textContent = result.pending ? 'Processamento parcial · Os percentuais consideram todas as publicações coletadas.' : 'Os percentuais consideram todas as publicações coletadas.';
    const week = source.days().slice(0, 7).reverse();
    const max = Math.max(...week.map((day) => day.items.length), 1);
    $('#chart').innerHTML = week.map((day) => {
      const c = counts(day.items);
      const title = `${shortDate(day.date)}: ${formattedCount(c.total)} publicações, ${formattedCount(c.direct)} destaques, ${formattedCount(c.attention)} em atenção`;
      return `<div class="chart-bar-item ${day.date === LAST ? 'today' : ''}" tabindex="0" title="${esc(title)}" aria-label="${esc(title)}"><div class="chart-track"><div class="chart-bar ${day.date === LAST ? 'today' : ''}" style="--bar:${Math.max(4, Math.round(c.total * 100 / max))}%"></div></div><span class="chart-date">${esc(humanDate(day.date, { day: '2-digit', month: '2-digit' }))}</span></div>`;
    }).join('');
  }

  function dayState(date) {
    if (!state.dayStates.has(date)) state.dayStates.set(date, { tab: 'direct', expanded: false, page: 0 });
    return state.dayStates.get(date);
  }
  function dateTitle(date) {
    const day = humanDate(date, { day: '2-digit', month: 'long', year: 'numeric' });
    const weekday = humanDate(date, { weekday: 'long' });
    return { day, weekday: weekday[0].toUpperCase() + weekday.slice(1) };
  }
  function sorted(items) {
    const priority = { direct: 0, potential: 1, insufficient: 2, unmatched: 3, pending: 4, error: 5 };
    return [...items].sort((a, b) => priority[a.status] - priority[b.status] || (b.weight || 0) - (a.weight || 0) || a.id.localeCompare(b.id));
  }
  function row(item) {
    return `<tr><td><button type="button" class="opportunity-name" data-detail="${esc(item.id)}">${esc(item.title)}</button><span class="cell-sub opportunity-reason">${esc(item.reason)}</span></td><td>${esc(item.org)}<span class="cell-sub">${esc(item.city)} · ${esc(item.uf)}</span></td><td><span class="status ${esc(item.status)}">${esc(labels[item.status])}</span><span class="cell-sub">${esc(item.category || 'A definir')}</span></td><td>${item.deadline ? esc(shortDate(item.deadline)) : 'Não informado'}<span class="cell-sub">Prazo informado</span></td><td>${item.value !== null ? esc(money.format(item.value)) : 'Não informado'}<span class="cell-sub">${item.value !== null ? esc(item.valueType) : 'Valor ausente'}</span></td><td><button type="button" class="source-button" data-detail="${esc(item.id)}" data-source="true">PNCP</button></td></tr>`;
  }
  function dayHtml(day) {
    const s = dayState(day.date);
    const c = counts(day.items);
    const sourceCounts = counts(day.all);
    const title = dateTitle(day.date);
    const isAll = state.filter.view === 'all';
    const items = sorted(isAll ? day.items : day.items.filter((item) => s.tab === 'direct' ? item.status === 'direct' : item.status === 'potential' || item.status === 'insufficient'));
    const size = s.expanded ? 100 : 20;
    const pages = Math.max(1, Math.ceil(items.length / size));
    s.page = Math.max(0, Math.min(s.page, pages - 1));
    const slice = items.slice(s.page * size, (s.page + 1) * size);
    const tabs = isAll ? '<div class="all-label">Todos os registros</div>' : `<div class="day-tabs" role="tablist" aria-label="Categorias de ${esc(title.day)}"><button type="button" role="tab" aria-selected="${s.tab === 'direct'}" tabindex="${s.tab === 'direct' ? 0 : -1}" class="tab ${s.tab === 'direct' ? 'active' : ''}" data-tab="direct">Destaques <span class="tab-count">${formattedCount(c.direct)}</span></button><button type="button" role="tab" aria-selected="${s.tab === 'attention'}" tabindex="${s.tab === 'attention' ? 0 : -1}" class="tab ${s.tab === 'attention' ? 'active' : ''}" data-tab="attention">Atenção <span class="tab-count">${formattedCount(c.attention)}</span></button></div>`;
    const table = items.length ? `<div class="table-scroll"><table class="opportunity-table"><caption class="sr-only">Oportunidades de ${esc(title.day)}</caption><thead><tr><th scope="col">OPORTUNIDADE</th><th scope="col">ÓRGÃO / ENTIDADE</th><th scope="col">ADERÊNCIA</th><th scope="col">PRAZO</th><th scope="col">VALOR</th><th scope="col">FONTE</th></tr></thead><tbody>${slice.map(row).join('')}</tbody></table></div>` : `<p class="empty-state">${s.tab === 'direct' && !isAll ? 'Nenhum destaque para este dia. Confira também a aba Atenção.' : 'Nenhum registro encontrado nesta seleção.'}</p>`;
    const from = items.length ? s.page * size + 1 : 0;
    const to = Math.min((s.page + 1) * size, items.length);
    const expand = items.length > 20 ? `<button type="button" class="day-action" data-expand>${s.expanded ? 'Recolher' : 'Expandir até 100'}</button>` : '';
    const pagination = s.expanded && pages > 1 ? `<button type="button" class="day-action" data-page="prev" ${s.page === 0 ? 'disabled' : ''}>Anterior</button><span>Página ${s.page + 1} de ${pages}</span><button type="button" class="day-action" data-page="next" ${s.page === pages - 1 ? 'disabled' : ''}>Próxima</button>` : '';
    return `<article class="day-card" data-day="${esc(day.date)}"><div class="day-head"><div class="day-title"><span class="day-icon">${icon('calendar')}</span><div><h3>${esc(title.day)}</h3><p>${esc(title.weekday)}${sourceCounts.pending ? ' · Processamento parcial' : ''}</p></div></div><p class="day-counts"><strong>${formattedCount(c.direct)}</strong> destaques <span> · </span><strong>${formattedCount(c.attention)}</strong> em atenção</p></div>${tabs}${table}<div class="day-footer"><span>Mostrando ${formattedCount(from)}–${formattedCount(to)} de ${formattedCount(items.length)}</span><div class="day-actions">${pagination}${expand}</div></div></article>`;
  }
  function observeEnd() {
    if (state.observer) state.observer.disconnect();
    if (!('IntersectionObserver' in window) || state.shown >= state.days.length) return;
    const cards = $('#feed').querySelectorAll('.day-card');
    const trigger = cards[Math.max(0, cards.length - 2)];
    if (!trigger) return;
    state.observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) { state.observer.disconnect(); appendDays(); }
    }, { rootMargin: '0px 0px 300px 0px' });
    state.observer.observe(trigger);
  }
  function appendDays() {
    const next = state.days.slice(state.shown, state.shown + 5);
    $('#feed').insertAdjacentHTML('beforeend', next.map(dayHtml).join(''));
    state.shown += next.length;
    const finished = state.shown >= state.days.length;
    $('#load-more').hidden = finished;
    $('#feed-end-text').hidden = !finished || !state.days.length;
    observeEnd();
  }
  function renderFeed() {
    if (state.observer) state.observer.disconnect();
    state.days = source.find(state.filter);
    state.shown = 0;
    state.dayStates.clear();
    $('#feed').innerHTML = '';
    const total = state.days.reduce((sum, day) => sum + day.items.length, 0);
    $('#feed-context').textContent = `${shortDate(state.filter.start)} a ${shortDate(state.filter.end)} · Mais recentes primeiro`;
    $('#active-filter').textContent = state.filter.query ? `Busca: “${state.filter.query}” · ${state.filter.view === 'all' ? 'Todos os registros' : 'Selecionadas'}` : state.filter.view === 'all' ? 'Todos os registros' : 'Destaques e atenção';
    $('#match-count').textContent = `${formattedCount(total)} ${total === 1 ? 'registro encontrado' : 'registros encontrados'}`;
    if (!state.days.length || !total) {
      $('#feed').innerHTML = '<div class="day-card empty-state">Nenhuma correspondência encontrada. Ajuste os filtros para ampliar a busca.</div>';
      $('#load-more').hidden = true;
      $('#feed-end-text').hidden = true;
      return;
    }
    appendDays();
  }
  function replaceDay(date, selector) {
    const card = document.querySelector(`[data-day="${date}"]`);
    const day = state.days.find((entry) => entry.date === date);
    if (!card || !day) return;
    card.outerHTML = dayHtml(day);
    if (selector) document.querySelector(`[data-day="${date}"] ${selector}`)?.focus({ preventScroll: true });
    observeEnd();
  }

  function showDetails(id, sourceFocus, opener) {
    const item = source.get(id);
    if (!item) return;
    state.opener = opener;
    $('#details-title').textContent = item.title;
    const docs = item.docs.length ? `<ul>${item.docs.map((doc, index) => `<li ${index >= 5 ? 'data-extra-doc hidden' : ''}>${esc(doc)} — link indisponível na demonstração</li>`).join('')}</ul>${item.docs.length > 5 ? '<div class="docs-more"><button type="button" id="show-docs">Ver todos os documentos</button></div>' : ''}` : '<p>Nenhum documento disponível na demonstração.</p>';
    $('#dialog-content').innerHTML = `<div class="detail-meta"><span>${esc(item.org)}</span><span>·</span><span>${esc(item.city)} / ${esc(item.uf)}</span><span>·</span><span>${esc(item.id)}</span><span>·</span><span class="status ${esc(item.status)}">${esc(labels[item.status])}</span></div><section class="detail-block"><h3>Análise simulada · Por que foi selecionada</h3><p>${esc(item.reason)}</p>${item.category ? `<p>Categoria: ${esc(item.category)}${item.weight ? ` · peso da área: ${item.weight}%` : ''}</p>` : ''}</section><section class="detail-block"><h3>Evidência na publicação simulada</h3>${item.evidence ? `<p class="evidence">“${esc(item.evidence)}” <br><small>Campo: objeto da contratação</small></p>` : '<p>Não localizada nos dados disponíveis.</p>'}</section><section class="detail-block"><h3>Dados da publicação · Objeto completo</h3><p>${esc(item.object)}</p></section><section class="detail-block"><h3>Lacunas e próxima ação</h3><p>Conferir os documentos e a situação atual do processo. Os anexos não foram analisados nesta demonstração.</p></section><section class="detail-block detail-grid"><div><h3>Publicação e prazo</h3><p>Publicado em ${esc(shortDate(item.day))}<br>Prazo: ${item.deadline ? esc(shortDate(item.deadline)) : 'Não informado'}</p></div><div><h3>Valor ${item.value !== null ? 'estimado' : ''}</h3><p>${item.value !== null ? esc(money.format(item.value)) : 'Não informado'}</p></div></section><section class="detail-block" id="sources" tabindex="-1"><h3>Fontes e documentos · PNCP</h3><p>Página oficial do registro: link indisponível na demonstração.</p><p>Sistema de origem: não informado.</p>${docs}</section>`;
    const dialog = $('#details');
    dialog.showModal();
    if (sourceFocus) $('#sources').focus({ preventScroll: false });
    else $('#dialog-close').focus();
  }

  function closeFilter(returnFocus = true) {
    $('#filter-panel').hidden = true;
    $('#filter-toggle').setAttribute('aria-expanded', 'false');
    if (returnFocus) $('#filter-toggle').focus();
  }
  function populateForm(filter) {
    $('#query').value = filter.query;
    $('#date-start').value = filter.start;
    $('#date-end').value = filter.end;
    $('#filter-view').value = filter.view;
    $('#filter-error').textContent = '';
  }
  $('#filter-toggle').addEventListener('click', () => {
    if (!$('#filter-panel').hidden) return closeFilter();
    populateForm(state.filter);
    $('#filter-panel').hidden = false;
    $('#filter-toggle').setAttribute('aria-expanded', 'true');
    $('#query').focus();
  });
  $('#filter-close').addEventListener('click', () => closeFilter());
  $('#filter-form').addEventListener('submit', (event) => {
    event.preventDefault();
    const start = $('#date-start').value;
    const end = $('#date-end').value;
    if (start > end) { $('#filter-error').textContent = 'A data inicial deve ser anterior ou igual à data final.'; $('#date-start').focus(); return; }
    state.filter = { start, end, query: $('#query').value.trim(), view: $('#filter-view').value };
    renderFeed();
    closeFilter();
  });
  $('#filter-reset').addEventListener('click', () => { state.filter = { start: FIRST, end: LAST, query: '', view: 'selected' }; populateForm(state.filter); renderFeed(); closeFilter(); });
  document.querySelectorAll('[data-preset]').forEach((button) => button.addEventListener('click', () => {
    const days = Number(button.dataset.preset);
    $('#date-start').value = dateAt(19 - days);
    $('#date-end').value = LAST;
  }));
  $('#load-more').addEventListener('click', appendDays);
  $('#feed').addEventListener('click', (event) => {
    const target = event.target.closest('button');
    if (!target) return;
    if (target.dataset.detail) return showDetails(target.dataset.detail, target.dataset.source === 'true', target);
    const card = target.closest('[data-day]');
    if (!card) return;
    const date = card.dataset.day;
    const s = dayState(date);
    if (target.dataset.tab) { s.tab = target.dataset.tab; s.page = 0; s.expanded = false; replaceDay(date, `[data-tab="${s.tab}"]`); }
    else if (target.hasAttribute('data-expand')) { s.expanded = !s.expanded; s.page = 0; replaceDay(date, '[data-expand]'); }
    else if (target.dataset.page) { s.page += target.dataset.page === 'next' ? 1 : -1; replaceDay(date, `[data-page="${target.dataset.page}"]:not(:disabled)`); }
  });
  $('#feed').addEventListener('keydown', (event) => {
    const tab = event.target.closest('[role="tab"]');
    if (!tab || !['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const tabs = [...tab.parentElement.querySelectorAll('[role="tab"]')];
    const index = tabs.indexOf(tab);
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : (index + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
    tabs[next].click();
  });
  $('#dialog-close').addEventListener('click', () => $('#details').close());
  $('#details').addEventListener('close', () => { if (state.opener?.isConnected) state.opener.focus(); });
  $('#dialog-content').addEventListener('click', (event) => {
    if (event.target.id !== 'show-docs') return;
    $('#dialog-content').querySelectorAll('[data-extra-doc]').forEach((item) => { item.hidden = false; });
    event.target.remove();
  });
  document.addEventListener('keydown', (event) => { if (event.key === 'Escape' && !$('#filter-panel').hidden && !$('#details').open) closeFilter(); });
  document.addEventListener('click', (event) => { if (!$('#filter-panel').hidden && !event.target.closest('.filter-wrap')) closeFilter(false); });
  document.querySelectorAll('.nav-link').forEach((link) => link.addEventListener('click', () => { document.querySelectorAll('.nav-link').forEach((item) => item.classList.remove('active')); link.classList.add('active'); }));

  renderOverview();
  populateForm(state.filter);
  renderFeed();
})();
