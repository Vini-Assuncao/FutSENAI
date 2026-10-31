// views/dashboard.js
import { renderMatchRow, rivalryPanel, scopeFilterHtml, scorerRow, statCard } from '../components.js';
import { canEdit, pageContent, state } from '../state.js';
import { setLoading, updateChrome } from '../ui.js';
import { esc } from '../utils.js';

import { api } from '../api.js';

export async function renderDashboard() {
  setLoading('Atualizando o placar da turma...');
  const [result, internalMatches, interclassMatches] = await Promise.all([
    api(`/api/dashboard?scope=${state.statsScope}`),
    api('/api/matches?scope=internal'),
    api('/api/matches?scope=interclass')
  ]);
  result.summary.allMatches = internalMatches.data.length + interclassMatches.data.length;
  state.dashboard = result;
  state.players = result.players;
  updateChrome();
  const s = result.summary;
  const matchActionLabel = canEdit() ? 'Registrar partida' : 'Testar sorteio';
  const scorerHtml = result.topScorers.length ? result.topScorers.map(scorerRow).join('') : `<div class="empty-inline"><strong>Nenhuma estatística neste filtro</strong>Registre gols ou selecione outro tipo de partida.</div>`;
  const recentHtml = result.recentMatches.length ? result.recentMatches.map(renderMatchRow).join('') : `<div class="empty-inline"><strong>Nenhuma partida neste filtro</strong>Registre um jogo para ver o placar por aqui.</div>`;
  pageContent.innerHTML = `
    <section class="page-heading"><div><div class="eyebrow">BEM-VINDO À QUADRA</div><h1>O jogo começa aqui<span style="color:var(--red)">.</span></h1><p>Organize a resenha, guarde os resultados e descubra quem está brilhando na quadra.</p></div><div class="heading-actions">${canEdit() ? '<button class="btn btn-secondary" data-action="new-player">＋ Novo jogador</button>' : ''}<button class="btn btn-primary" data-action="new-match">＋ ${matchActionLabel}</button>${canEdit() ? '' : '<button class="btn btn-secondary" data-action="scroll-team">☕︎ Equipe do FutSENAI</button>'}</div></section>
    <div class="scope-filter-row">${scopeFilterHtml()}</div>
    <section class="stats-grid">
      ${statCard('Jogadores ativos', s.activePlayers, '♟', 'Elenco disponível do 3º A')}
      ${statCard('Partidas consideradas', s.totalMatches, '⚑', 'De acordo com o filtro acima')}
      ${statCard('Gols marcados', s.totalGoals, '⚽︎', 'Placar dos jogos selecionados')}
      ${statCard('Média de gols / jogo', s.averageGoals, '↗', 'Gols divididos pelas partidas filtradas')}
    </section>
    ${rivalryPanel(result.secondYearRivalry)}
    <section class="dashboard-grid">
      <article class="panel"><div class="panel-head"><div><h2 class="panel-title">Últimas partidas</h2><div class="panel-subtitle">${state.statsScope === 'interclass' ? 'Somente jogos contra o 2º Ano' : 'Somente jogos entre jogadores do 3º A'}</div></div><button class="text-action" data-action="go-matches">Ver todas →</button></div><div class="match-list">${recentHtml}</div></article>
      <article class="panel"><div class="panel-head"><div><h2 class="panel-title">Artilharia da turma</h2><div class="panel-subtitle">Gols</div></div><button class="text-action" data-action="go-stats">Ranking →</button></div><div class="scorer-list">${scorerHtml}</div></article>
    </section>
    ${teamSectionHtml()}`;
}

// Seção "A Equipe do FutSENAI": quem faz o site, o jornal e o jogo de cartas.
const TEAM_MEMBERS = [
  {
    name: 'Vinícius Assunção',
    role: 'Desenvolvedor do FutSENAI Score',
    tone: 'red',
    photo: 'assets/equipe/vinicius-assuncao.jpg',
    github: 'https://github.com/Vini-Assuncao',
    tags: ['Inovador', 'Pioneiro'],
    bio: 'Pioneiro do projeto: imaginou e constrói o placar da turma, com partidas, times sorteados, gols e estatísticas.'
  },
  {
    name: 'Pietro Guedes',
    role: 'Desenvolvedor do Jornal FutSENAI',
    tone: 'blue',
    photo: 'assets/equipe/pietro-guedes.jpg',
    github: 'https://github.com/Pietro-Guedes',
    tags: ['Focado', 'Disciplinado'],
    bio: 'Mantém a redação da turma em dia, transformando os lances da quadra em notícias que todo mundo quer ler.'
  },
  {
    name: 'Vinicius Valle',
    role: 'Desenvolvedor do FutSENAI Cards',
    tone: 'purple',
    photo: 'assets/equipe/vinicius-valle.jpg',
    github: 'https://github.com/Valle-Vinicius',
    tags: ['Criativo', 'Talentoso'],
    bio: 'Transforma cada jogador em carta colecionável, com raridades que vão do Comum ao Ícone e overall calculado.'
  }
];

const GROUP_SITES = [
  {
    name: 'FutSENAI Score',
    icon: '⚑',
    text: 'O placar da turma: partidas, gols, times sorteados, estatísticas, comparações e marcos históricos.',
    href: null,
    cta: 'Você está aqui'
  },
  {
    name: 'Jornal FutSENAI',
    icon: '✎',
    text: 'A redação da turma: notícias das partidas com capa, data e tags, reunidas em um carrossel e num jornal próprio.',
    href: 'https://pietro-guedes.github.io/FutSenai-Jornal/',
    cta: 'Ler o jornal ↗'
  },
  {
    name: 'FutSENAI Cards',
    icon: '◈',
    text: 'O jogo de cartas dos jogadores, com seis raridades, overall e a carta Incomum de cada um.',
    href: 'https://fut-senai-cards.vercel.app/',
    cta: 'Abrir os cards ↗'
  }
];

function teamSectionHtml() {
  const members = TEAM_MEMBERS.map((member, index) => `
    <article class="team-card tone-${member.tone}" style="--delay:${index * 90}ms">
      <div class="team-card-frame">
        <div class="team-card-top"><span class="team-number">${esc(member.number)}</span><span class="team-position">${esc(member.position)}</span></div>
        <div class="team-photo"><img src="${esc(member.photo)}" alt="Foto de ${esc(member.name)}" loading="lazy"></div>
        <div class="team-card-body">
          <h3>${esc(member.name)}</h3>
          <p class="team-role">${esc(member.role)}</p>
          <div class="team-tags">${member.tags.map(tag => `<span>${esc(tag)}</span>`).join('')}</div>
          <p class="team-bio">${esc(member.bio)}</p>
          <a class="team-github" href="${esc(member.github)}" target="_blank" rel="noopener noreferrer">GitHub ↗</a>
        </div>
      </div>
    </article>`).join('');

  const sites = GROUP_SITES.map(site => {
    const tag = site.href ? 'a' : 'article';
    const attributes = site.href
      ? `href="${esc(site.href)}" target="_blank" rel="noopener noreferrer" aria-label="${esc(site.name)}: ${esc(site.cta)}"`
      : '';
    return `
    <${tag} class="group-site-card${site.href ? '' : ' is-current'}" ${attributes}>
      <span class="group-site-icon" aria-hidden="true">${esc(site.icon)}</span>
      <h3>${esc(site.name)}</h3>
      <p>${esc(site.text)}</p>
      ${site.href
        ? `<span class="group-site-link">${esc(site.cta)}</span>`
        : `<span class="group-site-link is-current">${esc(site.cta)}</span>`}
    </${tag}>`;
  }).join('');

  return `<section class="team-section" id="teamSection" aria-labelledby="teamTitle">
    <div class="team-head">
      <div class="eyebrow">NOSSA TURMA, NOSSO CÓDIGO</div>
      <h2 id="teamTitle">A Equipe do FutSENAI<span class="team-dot">.</span></h2>
      <p>Quem monta o placar, escreve as notícias e cria as cartas da turma.</p>
    </div>
    <figure class="team-hero">
      <img src="assets/equipe/equipe.jpg" alt="Três integrantes da equipe conversando em uma sala de desenvolvimento" loading="lazy">
      <figcaption><span class="team-hero-kicker">O TRIO DO CÓDIGO</span><strong>Três devs, um time só.</strong></figcaption>
    </figure>
    <div class="team-grid">${members}</div>
    <div class="group-head">
      <div class="eyebrow">ECOSSISTEMA</div>
      <h3>O Grupo FutSENAI</h3>
      <p>Três projetos que se conversam: o placar, o jornal e as cartas.</p>
    </div>
    <div class="group-sites">${sites}</div>
    <p class="team-footer">Feito pela turma, para a turma <b>•</b> FutSENAI Score</p>
  </section>`;
}
