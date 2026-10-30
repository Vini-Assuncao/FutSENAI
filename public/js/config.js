// config.js
export const ANTI_RESENHA_STORAGE_KEY = 'futsenai.anti-resenha';
export const MAX_DRAW_OVERALL_AVERAGE_GAP_TENTHS = 61;

export const viewNames = { dashboard: 'Visão geral', players: 'Jogadores', matches: 'Partidas', stats: 'Estatísticas', compare: 'Comparar', matchDetail: 'Detalhes da partida', playerDetail: 'Jogador' };
export const JOURNAL_HOME_URL = 'https://pietro-guedes.github.io/FutSenai-Jornal/';
export const JOURNAL_FEED_URL = 'https://raw.githubusercontent.com/Pietro-Guedes/FutSenai-Jornal/main/noticias.json';
export const readOnlyActions = new Set(['new-player', 'edit-player', 'archive-player', 'reactivate-player', 'new-goal', 'delete-match', 'delete-goal', 'delete-assist']);
export const JOURNAL_ROTATION_MS = 8500;
// Capa padrão do Jornal FutSENAI, usada quando a notícia não tem imagem.
export const DEFAULT_JOURNAL_COVER = 'assets/jornal-capa-padrao.svg';
