// Ponto de entrada do FutSENAI: liga os módulos e inicia a aplicação.
import { state, pageContent, isLocalServerOrigin } from './state.js';
import { setupJournalCarouselControls, loadLatestJournalNews } from './journal.js';
import { bindGlobalEvents } from './events.js';
import { updateChrome } from './ui.js';
import { api } from './api.js';
import { renderDashboard } from './views/dashboard.js';
import { esc } from './utils.js';
import { startPlayerCards } from './cards/futsenai-cards.js';

setupJournalCarouselControls();
bindGlobalEvents();

// Atualiza o card do jornal sem bloquear o carregamento do painel.
void loadLatestJournalNews();

// Start by checking that the backend is reachable, then render the dashboard.
(async function boot() {
  updateChrome();
  try {
    await api('/api/health');
    state.serverAvailable = true;
    state.localServer = isLocalServerOrigin();
    updateChrome();
    await renderDashboard();
  } catch (error) {
    pageContent.innerHTML = `<div class="empty-state"><div class="empty-symbol">!</div><h3>Não foi possível carregar o FutSENAI</h3><p>Verifique se o servidor está iniciado ou se o arquivo de dados foi publicado em <strong>public/data/futsenai.json</strong>.</p><p style="font-size:10px">Detalhe: ${esc(error.message)}</p><button class="btn btn-primary" data-action="retry">Tentar novamente</button></div>`;
  }
})();

// O módulo de cartas se integra ao detalhe do jogador depois que a interface existe.
startPlayerCards();
