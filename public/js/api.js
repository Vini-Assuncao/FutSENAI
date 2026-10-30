// Camada de dados: lê a API local ou, quando ela não existe, o JSON publicado (somente leitura).
import { state, canEdit } from './state.js';
import { closeModal, updateChrome } from './ui.js';
import { renderCurrent } from './router.js';

const Stats = window.FutSENAIStats;

export async function api(url, options = {}) {
  const method = (options.method || 'GET').toUpperCase();
  if (method !== 'GET' && !canEdit()) {
    throw new Error('Edição disponível somente no servidor local em http://localhost:3000.');
  }
  if (state.readOnly) return staticApi(url, method);
  let response;
  try {
    response = await fetch(url, { ...options, credentials: 'same-origin' });
  } catch (error) {
    if (method !== 'GET') {
      try {
        await enableReadOnlyMode();
      } catch (snapshotError) {
        throw new Error(`A API está indisponível e não foi possível carregar o JSON publicado: ${snapshotError.message}`, { cause: error });
      }
      closeModal();
      await renderCurrent();
      throw new Error('O servidor ficou indisponível. A interface foi alternada para somente leitura; a alteração não foi salva.');
    }
    try {
      await enableReadOnlyMode();
      return staticApi(url, method);
    } catch (snapshotError) {
      throw new Error(`A API está indisponível e não foi possível carregar o JSON publicado: ${snapshotError.message}`, { cause: error });
    }
  }
  let data;
  try { data = await response.json(); } catch { data = {}; }
  if (!response.ok) {
    const isPlayerHistoryRequest = method === 'GET' && /\/api\/players\/\d+\/history$/.test(new URL(url, document.baseURI).pathname);
    if (response.status === 404 && isPlayerHistoryRequest && !data.error) {
      try {
        await enableReadOnlyMode();
        return staticApi(url, method);
      } catch (snapshotError) {
        throw new Error(`A ficha do jogador não está disponível na API e não foi possível carregar o JSON publicado: ${snapshotError.message}`, { cause: snapshotError });
      }
    }
    if (response.status === 404 && method === 'GET' && new URL(url, document.baseURI).pathname.endsWith('/api/health')) {
      await enableReadOnlyMode();
      return staticApi(url, method);
    }
    const error = new Error(data.error || data.message || `Erro na solicitação (${response.status}).`);
    error.status = response.status;
    throw error;
  }
  return data;
}

export async function enableReadOnlyMode() {
  if (state.staticData) return;
  const snapshotUrl = new URL('data/futsenai.json', document.baseURI);
  const response = await fetch(snapshotUrl);
  if (!response.ok) throw new Error(`O arquivo de dados respondeu com status ${response.status}.`);
  const data = await response.json();
  if (data.schemaVersion !== 1 || !Array.isArray(data.players) || !Array.isArray(data.matches)
    || !Array.isArray(data.match_players) || !Array.isArray(data.goals)) {
    throw new Error('O arquivo de dados publicado não tem um formato válido.');
  }
  state.staticData = data;
  state.readOnly = true;
  state.serverAvailable = false;
  state.localServer = false;
  document.body.classList.add('read-only-mode');
  updateChrome();
  document.getElementById('storageStatus').textContent = 'Visualizando a cópia publicada dos dados.';
}

// Responde às mesmas rotas da API usando o cálculo compartilhado com o servidor.
function staticApi(url, method) {
  if (method !== 'GET') throw new Error('Esta cópia está em modo somente leitura. Inicie o servidor para alterar os dados.');
  const endpoint = new URL(url, document.baseURI);
  const data = state.staticData;
  const scope = Stats.normalizeScope(endpoint.searchParams.get('scope'));
  if (endpoint.pathname.endsWith('/api/health')) return { ok: true, app: 'FutSENAI', database: 'JSON' };
  if (endpoint.pathname.endsWith('/api/dashboard')) return Stats.dashboard(data, scope);
  const playerHistory = endpoint.pathname.match(/\/api\/players\/(\d+)\/history$/);
  if (playerHistory) {
    const result = Stats.playerHistory(data, Number(playerHistory[1]));
    if (!result) throw new Error('Jogador não encontrado no JSON publicado.');
    return { data: result };
  }
  if (endpoint.pathname.endsWith('/api/players')) {
    const includeInactive = endpoint.searchParams.get('includeInactive') === 'true';
    return { data: Stats.playerList(data, includeInactive, scope), scope };
  }
  if (endpoint.pathname.endsWith('/api/matches')) return { data: Stats.matchList(data, scope), scope };
  if (endpoint.pathname.endsWith('/api/stats')) return Stats.statistics(data, scope);
  if (endpoint.pathname.endsWith('/api/compare')) {
    const a = Number(endpoint.searchParams.get('a'));
    const b = Number(endpoint.searchParams.get('b'));
    if (a === b) throw new Error('Escolha dois jogadores diferentes.');
    const result = Stats.compare(data, a, b, scope);
    if (!result) throw new Error('Jogador não encontrado no JSON publicado.');
    return result;
  }
  const matchDetail = endpoint.pathname.match(/\/api\/matches\/(\d+)$/);
  if (matchDetail) {
    const result = Stats.matchDetail(data, Number(matchDetail[1]));
    if (!result) throw new Error('Partida não encontrada no JSON publicado.');
    return { data: result };
  }
  throw new Error('Esta operação não está disponível na cópia somente leitura.');
}
