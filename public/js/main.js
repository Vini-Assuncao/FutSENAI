// Ponto de entrada do FutSENAI: liga os módulos e inicia a aplicação.
import { state, pageContent, isLocalServerOrigin } from './state.js';
import { setupJournalCarouselControls, setupJournalAutoRefresh, loadLatestJournalNews } from './journal.js';
import { bindGlobalEvents } from './events.js';
import { setSidebarOpen, updateChrome } from './ui.js';
import { renderCurrent } from './router.js';
import { applyRoute, enableHistory, parseRoute, resolveRoute, syncHistory } from './routes.js';
import { api } from './api.js';
import { renderDashboard } from './views/dashboard.js';
import { esc } from './utils.js';
import { startPlayerCards } from './cards/futsenai-cards.js';

async function applyRouteFromLocation() {
  let route = parseRoute();
  state.routeResolving = true;
  applyRoute(route);
  try {
    const needsPlayers = Boolean(route.playerSlug || route.playerSlugA || route.playerSlugB);
    const players = needsPlayers ? (await api('/api/players?includeInactive=true')).data : [];
    let matches = [];
    if (route.date) {
      const [internal, interclass] = await Promise.all([
        api('/api/matches?scope=internal'),
        api('/api/matches?scope=interclass')
      ]);
      matches = [...internal.data, ...interclass.data];
    }
    route = resolveRoute(route, { players, matches });
    applyRoute(route);
  } finally {
    state.routeResolving = false;
  }
}

setupJournalCarouselControls();
setupJournalAutoRefresh();
bindGlobalEvents();

// Atualiza o card do jornal sem bloquear o carregamento do painel.
void loadLatestJournalNews();

// Start by checking that the backend is reachable, then render the dashboard.
// Botão voltar/avançar do navegador: aplica a rota da URL e renderiza a tela correspondente.
window.addEventListener('popstate', async () => {
  try {
    await applyRouteFromLocation();
    setSidebarOpen(false);
    updateChrome();
    await renderCurrent();
  } catch (error) {
    pageContent.innerHTML = `<div class="empty-state"><div class="empty-symbol">!</div><h3>Não foi possível carregar esta página</h3><p>${esc(error.message)}</p><button class="btn btn-primary" data-action="retry">Tentar novamente</button></div>`;
  }
});

(async function boot() {
  applyRoute(parseRoute());
  updateChrome();
  try {
    await api('/api/health');
    state.serverAvailable = true;
    state.localServer = isLocalServerOrigin();
    await applyRouteFromLocation();
    updateChrome();
    if (state.view === 'dashboard') await renderDashboard();
    else await renderCurrent();
  } catch (error) {
    pageContent.innerHTML = `<div class="empty-state"><div class="empty-symbol">!</div><h3>Não foi possível carregar o FutSENAI</h3><p>Verifique se o servidor está iniciado ou se o arquivo de dados foi publicado em <strong>public/data/futsenai.json</strong>.</p><p style="font-size:10px">Detalhe: ${esc(error.message)}</p><button class="btn btn-primary" data-action="retry">Tentar novamente</button></div>`;
  }
  enableHistory();
  syncHistory({ replace: true });
})();

// O módulo de cartas se integra ao detalhe do jogador depois que a interface existe.
startPlayerCards();
