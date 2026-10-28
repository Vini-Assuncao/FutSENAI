// ui.js
import { viewNames } from './config.js';
import { freshJournalNews, isFreshJournalNews } from './journal.js';
import { canEdit, modalRoot, pageContent, state, toastStack } from './state.js';
import { esc, numericDate } from './utils.js';

export function toast(message, type = 'success') {
  const item = document.createElement('div');
  item.className = `toast ${type}`;
  item.textContent = message;
  toastStack.appendChild(item);
  window.setTimeout(() => { item.style.opacity = '0'; item.style.transform = 'translateY(5px)'; window.setTimeout(() => item.remove(), 220); }, 3700);
}
export function setLoading(message = 'Carregando...') {
  pageContent.innerHTML = `<div class="loading-state"><div class="spinner"></div><p>${esc(message)}</p></div>`;
}
export function updateChrome() {
  const editor = canEdit();
  document.body.classList.toggle('editor-mode', editor);
  document.body.classList.toggle('view-only-mode', !editor);
  const editorNotice = document.getElementById('adminModeNotice');
  if (editorNotice) editorNotice.hidden = !editor;
  document.body.classList.toggle('anti-resenha-mode', state.antiResenha);
  const journalCard = document.querySelector('.sidebar-news-card');
  if (journalCard) journalCard.hidden = state.antiResenha;
  const freshTicker = document.getElementById('freshNewsTicker');
  const hasVisibleFreshNews = !state.antiResenha && Boolean(freshJournalNews && isFreshJournalNews(freshJournalNews.createdAt));
  if (freshTicker) freshTicker.hidden = !hasVisibleFreshNews;
  document.querySelector('.topbar')?.classList.toggle('has-fresh-news', hasVisibleFreshNews);
  document.getElementById('breadcrumbPath').innerHTML = renderBreadcrumb();
  document.querySelectorAll('.anti-resenha-indicator').forEach(indicator => { indicator.hidden = !state.antiResenha; });
  const activeView = state.view === 'matchDetail' ? 'matches' : state.view === 'playerDetail' ? 'players' : state.view;
  document.querySelectorAll('.nav-item').forEach(button => button.classList.toggle('active', button.dataset.view === activeView));
  const date = new Date();
  document.getElementById('todayLabel').textContent = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short' }).format(date).replace('.', '');
  if (state.dashboard) document.getElementById('navPlayerCount').textContent = state.dashboard.summary.activePlayers;
}
export function renderBreadcrumb() {
  const home = '<button type="button" class="crumb-link" data-crumb-view="dashboard">FutSENAI</button>';
  const crumb = (label, view, current = false) => current
    ? `<strong aria-current="page">${esc(label)}</strong>`
    : `<button type="button" class="crumb-link" data-crumb-view="${view}">${esc(label)}</button>`;
  const slash = '<span class="crumb-slash" aria-hidden="true">/</span>';
  if (state.view === 'matchDetail') {
    const date = state.matchDetail?.played_on ? numericDate(state.matchDetail.played_on) : 'Partida';
    return `${home}${slash}${crumb('Partida', 'matches')}${slash}${crumb(`Detalhes Partida ${date}`, '', true)}`;
  }
  if (state.view === 'playerDetail') {
    const name = state.playerProfile?.player.name || viewNames.playerDetail;
    return `${home}${slash}${crumb('Jogadores', 'players')}${slash}${crumb(name, '', true)}`;
  }
  const label = viewNames[state.view] || 'Visão geral';
  return `${home}${slash}${crumb(label, '', true)}`;
}
export function setSidebarOpen(isOpen) {
  document.getElementById('sidebar').classList.toggle('open', isOpen);
  document.body.classList.toggle('sidebar-open', isOpen);
  document.getElementById('mobileMenu').setAttribute('aria-expanded', String(isOpen));
}
export function modal(title, subtitle, body, footer, wide = false) {
  modalRoot.innerHTML = `<div class="modal-card ${wide ? 'wide' : ''}" role="dialog" aria-modal="true" aria-label="${esc(title)}"><div class="modal-header"><div><h2>${esc(title)}</h2><p>${esc(subtitle)}</p></div><button class="modal-close" data-modal-close aria-label="Fechar">×</button></div>${body}<div class="modal-footer">${footer}</div></div>`;
  modalRoot.dataset.open = 'true';
  document.body.style.overflow = 'hidden';
  const first = modalRoot.querySelector('input:not([type="hidden"]),select,button:not([data-modal-close])');
  if (first) window.setTimeout(() => first.focus(), 40);
}
export function closeModal() {
  modalRoot.innerHTML = '';
  delete modalRoot.dataset.open;
  document.body.style.overflow = '';
}
