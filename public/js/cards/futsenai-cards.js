import { SNAPSHOT } from './catalog-snapshot.js';


/*
 * Integração FutSENAI → FutSENAI Cards
 * ------------------------------------------------------------------
 * Na tela de detalhes do jogador, logo após "Últimas partidas", mostra a
 * seção "Cards" com as 6 versões (Comum → Ícone) do jogador, desenhadas
 * como no FutSENAI Cards.
 *
 * Como funciona (100% estático, sem banco de dados):
 *  1. Lê o catálogo público do FutSENAI Cards direto do GitHub
 *     (src/data/players.ts e src/types.ts) e guarda em cache no navegador.
 *  2. Se o GitHub estiver fora do ar, a fórmula mudar ou o arquivo vier
 *     diferente do esperado, usa o SNAPSHOT embutido abaixo.
 *  3. Reproduz a mesma geração de card do Cards (multiplicador de raridade,
 *     bônus de edição especial, fórmula de overall e limites por raridade).
 *  4. Casa o nome do jogador do FutSENAI com o do Cards ("Pietro" →
 *     "Pietro Guedes", "Matheus" → "Mateus", apelidos, acentos...).
 */
  // ───────────────────────── Configuração ─────────────────────────
  const CARDS_SITE = 'https://fut-senai-cards.vercel.app/';
  const RAW_BASE = 'https://raw.githubusercontent.com/Valle-Vinicius/FutSENAICards/main/';
  const IMAGE_BASE = RAW_BASE + 'src/imagens/';
  const CACHE_KEY = 'futsenai-cards-catalog-v2';
  const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hora
  const FETCH_TIMEOUT_MS = 8000;
  const SECTION_ID = 'futsenaicards-player-cards';
  const FONT_ID = 'futsenaicards-integration-font';
  const RARITY_ORDER = ['common', 'uncommon', 'rare', 'epic', 'legendary', 'icon'];
  const POSITIONS = ['GK', 'Fixo', 'Ala', 'Pivo'];
  const ATTR_KEYS = ['pace', 'shooting', 'passing', 'dribbling', 'defending', 'physical'];

  // Apelidos / outras grafias → nome do jogador NO FutSENAI CARDS (chave).
  // Use quando o nome no FutSENAI for bem diferente do nome do card.
  const ALIASES = {
    'Muzy': ['Gustavo Hyppolito', 'Gustavo Hipólito'],
    'Mateus Lopes': ['Matheus Lopes'],
    'Jonas Daniel': ['Jonas Daniel de Brito Lopes'],
    'Vinícius Assunção': ['Vinicius Assuncao'],
    'Enzo Thomas': ['Enzo'],
  };

  // Forçar uma correspondência manual: "nome no FutSENAI" → "nome no Cards".
  // Ex.: { 'zé': 'Rafael Dutra' }. As chaves são comparadas sem acento/maiúscula.
  const NAME_OVERRIDES = {};


  // ───────────────────────── Utilidades ─────────────────────────
  function normalizeName(value) {
    return String(value || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLocaleLowerCase('pt-BR')
      .replace(/[^a-z0-9]+/g, ' ')
      .trim();
  }

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, ch => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    })[ch]);
  }

  function hashString(text) {
    let h = 5381;
    for (let i = 0; i < text.length; i++) h = ((h << 5) + h + text.charCodeAt(i)) | 0;
    return (h >>> 0).toString(36);
  }

  // ───────────── Leitura do código-fonte do Cards (parser) ─────────────
  // Percorre um bloco balanceado respeitando strings e comentários.
  function extractBlock(src, openIdx) {
    const open = src[openIdx];
    const close = { '[': ']', '{': '}', '(': ')' }[open];
    let depth = 0;
    for (let i = openIdx; i < src.length; i++) {
      const ch = src[i];
      if (ch === "'" || ch === '"' || ch === '`') {
        for (i++; i < src.length && src[i] !== ch; i++) if (src[i] === '\\') i++;
        continue;
      }
      if (ch === '/' && src[i + 1] === '/') { while (i < src.length && src[i] !== '\n') i++; continue; }
      if (ch === '/' && src[i + 1] === '*') { i = src.indexOf('*/', i + 2); if (i < 0) return null; i++; continue; }
      if (ch === open) depth++;
      else if (ch === close && --depth === 0) return src.slice(openIdx, i + 1);
    }
    return null;
  }

  function splitTopLevelObjects(arrayText) {
    const out = [];
    for (let i = 1; i < arrayText.length - 1; i++) {
      if (arrayText[i] === '{') {
        const block = extractBlock(arrayText, i);
        if (!block) break;
        out.push(block);
        i += block.length - 1;
      }
    }
    return out;
  }

  const stringField = (obj, key) => {
    const m = obj.match(new RegExp(`\\b${key}\\s*:\\s*(?:'((?:[^'\\\\]|\\\\.)*)'|"((?:[^"\\\\]|\\\\.)*)")`));
    return m ? (m[1] ?? m[2]) : null;
  };
  const numberField = (obj, key) => {
    const m = obj.match(new RegExp(`\\b${key}\\s*:\\s*(-?\\d+(?:\\.\\d+)?)`));
    return m ? Number(m[1]) : null;
  };
  const identField = (obj, key) => {
    const m = obj.match(new RegExp(`\\b${key}\\s*:\\s*([A-Za-z_$][\\w$]*)`));
    return m ? m[1] : null;
  };
  const numbersIn = body => {
    const out = {};
    for (const m of body.matchAll(/([A-Za-z_$][\w$]*)\s*:\s*(-?\d+(?:\.\d+)?)/g)) out[m[1]] = Number(m[2]);
    return out;
  };
  const objectField = (obj, key) => {
    const m = obj.match(new RegExp(`\\b${key}\\s*:\\s*\\{`));
    if (!m) return null;
    const block = extractBlock(obj, m.index + m[0].length - 1);
    return block ? numbersIn(block) : null;
  };

  // Resumo do texto das funções de cálculo, para detectar mudança de fórmula.
  function formulaFingerprint(playersTs) {
    const parts = ['calculateOverall', 'applyModifier', 'generatePlayerCard'].map(fn => {
      const m = playersTs.match(new RegExp(`function\\s+${fn}\\s*\\(`));
      if (!m) return '';
      const paren = playersTs.indexOf('(', m.index);
      const afterParams = extractBlock(playersTs, paren);
      if (!afterParams) return '';
      const braceIdx = playersTs.indexOf('{', paren + afterParams.length);
      const body = extractBlock(playersTs, braceIdx) || '';
      return body.replace(/\/\/[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\s+/g, '');
    });
    return hashString(parts.join('|'));
  }

  function parseCatalog(playersTs, typesTs) {
    const imports = {};
    for (const m of playersTs.matchAll(/import\s+([A-Za-z_$][\w$]*)\s+from\s+['"]\.\.\/imagens\/([^'"]+)['"]/g)) imports[m[1]] = m[2];

    const decl = playersTs.match(/const\s+TEMPLATES\b[^=]*=\s*\[/);
    if (!decl) throw new Error('TEMPLATES não encontrado');
    const arrayText = extractBlock(playersTs, decl.index + decl[0].length - 1);
    if (!arrayText) throw new Error('TEMPLATES inválido');

    const templates = splitTopLevelObjects(arrayText).map(obj => ({
      name: stringField(obj, 'name'),
      position: stringField(obj, 'position'),
      nationality: stringField(obj, 'nationality'),
      age: numberField(obj, 'age'),
      club: stringField(obj, 'club'),
      image: imports[identField(obj, 'image')] || null,
      attributes: objectField(obj, 'attributes'),
      gkAttributes: objectField(obj, 'gkAttributes') || undefined,
      baseRarity: stringField(obj, 'baseRarity'),
      baseOverall: numberField(obj, 'baseOverall'),
    }));

    const modDecl = playersTs.match(/RARITY_MODIFIER\b[^=]*=\s*\{/);
    if (!modDecl) throw new Error('RARITY_MODIFIER não encontrado');
    const modifiers = numbersIn(extractBlock(playersTs, modDecl.index + modDecl[0].length - 1) || '');

    const rarityBonusDecl = playersTs.match(/RARITY_OVR_BONUS\b[^=]*=\s*\{/);
    if (!rarityBonusDecl) throw new Error('RARITY_OVR_BONUS não encontrado');
    const rarityOverallBonuses = numbersIn(extractBlock(playersTs, rarityBonusDecl.index + rarityBonusDecl[0].length - 1) || '');

    const specialBonusDecl = playersTs.match(/SPECIAL_OVR_BONUS\b[^=]*=\s*\{/);
    if (!specialBonusDecl) throw new Error('SPECIAL_OVR_BONUS não encontrado');
    const specialBonuses = numbersIn(extractBlock(playersTs, specialBonusDecl.index + specialBonusDecl[0].length - 1) || '');

    const metaDecl = typesTs.match(/RARITY_META\b[^=]*=\s*\{/);
    if (!metaDecl) throw new Error('RARITY_META não encontrado');
    const metaText = extractBlock(typesTs, metaDecl.index + metaDecl[0].length - 1) || '';
    const rarities = {};
    for (const m of metaText.matchAll(/([a-z]+)\s*:\s*\{\s*label\s*:\s*'([^']*)'\s*,\s*color\s*:\s*'([^']*)'\s*,\s*glow\s*:\s*'[^']*'\s*,\s*minOvr\s*:\s*(\d+)\s*,\s*maxOvr\s*:\s*(\d+)/g)) {
      rarities[m[1]] = { label: m[2], color: m[3], minOvr: Number(m[4]), maxOvr: Number(m[5]) };
    }

    const season = (playersTs.match(/SEASONS\s*=\s*\[\s*'([^']+)'/) || [])[1] || '';
    return { templates, modifiers, rarityOverallBonuses, specialBonuses, rarities, season, fingerprint: formulaFingerprint(playersTs) };
  }

  function isValidCatalog(c) {
    try {
      if (!c || !Array.isArray(c.templates) || !c.templates.length) return false;
      const inRange = v => Number.isFinite(v) && v >= 0 && v <= 99;
      for (const t of c.templates) {
        if (typeof t.name !== 'string' || !t.name.trim() || !POSITIONS.includes(t.position)) return false;
        if (typeof t.club !== 'string' || !/^[\w.-]+\.(jpe?g|png|webp)$/i.test(t.image || '')) return false;
        if (!t.attributes || !ATTR_KEYS.every(k => inRange(t.attributes[k]))) return false;
        if (t.position === 'GK' && !(t.gkAttributes && ['reflexes', 'positioning', 'handling'].every(k => inRange(t.gkAttributes[k])))) return false;
        if (t.baseRarity && !RARITY_ORDER.includes(t.baseRarity)) return false;
        if (t.baseOverall !== null && t.baseOverall !== undefined && !inRange(t.baseOverall)) return false;
      }
      for (const r of RARITY_ORDER) {
        const mod = c.modifiers && c.modifiers[r];
        const rarityBonus = c.rarityOverallBonuses && c.rarityOverallBonuses[r];
        const meta = c.rarities && c.rarities[r];
        if (!Number.isFinite(mod) || mod < 0.5 || mod > 2) return false;
        if (!Number.isFinite(rarityBonus) || rarityBonus < -10 || rarityBonus > 10) return false;
        if (!meta || !meta.label || !/^#[0-9a-f]{3,8}$/i.test(meta.color)) return false;
        if (!(meta.minOvr <= meta.maxOvr && meta.minOvr >= 0 && meta.maxOvr <= 99)) return false;
      }
      for (const special of ['none', 'totw', 'potm', 'revelation', 'legend', 'futsal']) {
        const bonus = c.specialBonuses && c.specialBonuses[special];
        if (!Number.isFinite(bonus) || bonus < 0 || bonus > 10) return false;
      }
      return typeof c.season === 'string';
    } catch (_) { return false; }
  }

  // ───────────── Geração do card (espelha generatePlayerCard) ─────────────
  function calculateOverall(position, a, gk) {
    if (position === 'GK') {
      const g = gk || { reflexes: 50, positioning: 50, handling: 50 };
      return Math.round(g.reflexes * 0.30 + g.positioning * 0.25 + a.defending * 0.20 + a.passing * 0.10 + a.physical * 0.10 + a.pace * 0.05);
    }
    if (position === 'Fixo') {
      return Math.round(a.defending * 0.35 + a.physical * 0.20 + a.passing * 0.20 + a.pace * 0.10 + a.dribbling * 0.08 + a.shooting * 0.07);
    }
    if (position === 'Ala') {
      return Math.round(a.pace * 0.25 + a.passing * 0.22 + a.dribbling * 0.20 + a.shooting * 0.13 + a.defending * 0.12 + a.physical * 0.08);
    }
    return Math.round(a.shooting * 0.32 + a.physical * 0.22 + a.dribbling * 0.18 + a.passing * 0.12 + a.pace * 0.10 + a.defending * 0.06);
  }

  function generateCard(template, rarityId, catalog, special = 'none') {
    const mod = catalog.modifiers[rarityId];
    const meta = catalog.rarities[rarityId];
    const apply = v => Math.max(0, Math.min(99, Math.round(v * mod)));
    const attrs = {};
    ATTR_KEYS.forEach(k => { attrs[k] = apply(template.attributes[k]); });
    const gk = template.gkAttributes ? {
      reflexes: apply(template.gkAttributes.reflexes),
      positioning: apply(template.gkAttributes.positioning),
      handling: apply(template.gkAttributes.handling),
    } : undefined;
    const overallBase = template.baseOverall ?? calculateOverall(template.position, template.attributes, template.gkAttributes);
    const overall = Math.min(99, overallBase
      + (catalog.rarityOverallBonuses[rarityId] ?? 0)
      + (catalog.specialBonuses[special] ?? 0));
    return {
      name: template.name, position: template.position, club: template.club, image: template.image,
      rarity: rarityId, special, label: meta.label, color: meta.color, edition: catalog.season, overall, ...attrs, ...(gk || {}),
    };
  }

  // ───────────── Correspondência de nomes ─────────────
  const STOP_WORDS = new Set(['de', 'da', 'do', 'das', 'dos', 'e']);
  const tokensOf = value => normalizeName(value).split(' ').filter(t => t && !STOP_WORDS.has(t));

  function editDistanceAtMost1(a, b) {
    if (Math.abs(a.length - b.length) > 1) return false;
    let i = 0;
    while (i < a.length && i < b.length && a[i] === b[i]) i++;
    if (i === a.length && i === b.length) return true;
    if (a.length === b.length) return a.slice(i + 1) === b.slice(i + 1);
    return a.length > b.length ? a.slice(i + 1) === b.slice(i) : b.slice(i + 1) === a.slice(i);
  }
  const tokenEquals = (a, b) => a === b
    || (a.length >= 5 && b.length >= 5 && editDistanceAtMost1(a, b))
    || (a.length === 1 && b.startsWith(a)) || (b.length === 1 && a.startsWith(b)); // inicial: "Pietro G."
  const tokensContained = (small, big) => small.length > 0 && small.every(t => big.some(b => tokenEquals(t, b)));

  function candidateNames(template) {
    return [template.name, ...(ALIASES[template.name] || [])];
  }

  // Retorna { template, via } ou null (inclusive quando há ambiguidade).
  function findCatalogPlayer(profileName, catalog) {
    const wanted = normalizeName(profileName);
    if (!wanted) return null;

    const forced = Object.keys(NAME_OVERRIDES).find(k => normalizeName(k) === wanted);
    if (forced) {
      const target = normalizeName(NAME_OVERRIDES[forced]);
      const hit = catalog.templates.find(t => normalizeName(t.name) === target);
      if (hit) return { template: hit, via: 'manual' };
    }

    const profileTokens = tokensOf(profileName);
    let best = 0;
    let winners = [];
    for (const template of catalog.templates) {
      let score = 0;
      for (const candidate of candidateNames(template)) {
        const candTokens = tokensOf(candidate);
        let s = 0;
        if (normalizeName(candidate) === wanted) s = 100;
        else if (tokensContained(profileTokens, candTokens)) s = 60 + profileTokens.length;
        else if (tokensContained(candTokens, profileTokens)) s = 50 + candTokens.length;
        score = Math.max(score, s);
      }
      if (score > best) { best = score; winners = [template]; }
      else if (score === best && score > 0) winners.push(template);
    }
    if (best === 0 || winners.length !== 1) return null;
    return { template: winners[0], via: best === 100 ? 'exact' : 'partial' };
  }

  // ───────────── Cache + atualização ao vivo ─────────────
  let catalog = SNAPSHOT;
  let catalogSig = '';
  const signatureOf = c => hashString(JSON.stringify([
    c.templates, c.modifiers, c.rarityOverallBonuses, c.specialBonuses, c.rarities, c.season
  ]));
  function getUncommonOverall(playerName) {
    const match = findCatalogPlayer(playerName, catalog);
    return match ? generateCard(match.template, 'uncommon', catalog).overall : null;
  }
  window.FutSENAIPlayerCards = Object.freeze({ getUncommonOverall });

  function readCache() {
    try {
      const raw = JSON.parse(localStorage.getItem(CACHE_KEY) || 'null');
      if (raw && isValidCatalog(raw.catalog) && raw.catalog.fingerprint === SNAPSHOT.fingerprint) return raw;
    } catch (_) { /* sem cache */ }
    return null;
  }
  function writeCache(c) {
    try { localStorage.setItem(CACHE_KEY, JSON.stringify({ savedAt: Date.now(), catalog: c })); } catch (_) { /* ignorado */ }
  }

  async function fetchText(url) {
    const controller = typeof AbortController === 'function' ? new AbortController() : null;
    const timer = controller ? setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS) : null;
    try {
      const response = await fetch(url, { signal: controller ? controller.signal : undefined, cache: 'no-cache' });
      if (!response.ok) throw new Error('HTTP ' + response.status);
      return await response.text();
    } finally { if (timer) clearTimeout(timer); }
  }

  async function refreshCatalog() {
    try {
      const [playersTs, typesTs] = await Promise.all([
        fetchText(RAW_BASE + 'src/data/players.ts'),
        fetchText(RAW_BASE + 'src/types.ts'),
      ]);
      const live = parseCatalog(playersTs, typesTs);
      if (!isValidCatalog(live)) throw new Error('catálogo ao vivo em formato inesperado');
      if (live.fingerprint !== SNAPSHOT.fingerprint) {
        console.warn('[FutSENAI Cards] A fórmula de overall mudou no FutSENAI Cards; usando o catálogo embutido. Atualize futsenaicards-integration.js.');
        return;
      }
      writeCache(live);
      const sig = signatureOf(live);
      if (sig !== catalogSig) { catalog = live; catalogSig = sig; renderCurrentPlayerCards(true); }
    } catch (error) {
      console.info('[FutSENAI Cards] Usando catálogo em cache/embutido:', error && error.message);
    }
  }

  // ───────────── Visual ─────────────

  function injectAssets() {
    if (!document.getElementById(FONT_ID)) {
      const link = document.createElement('link');
      link.id = FONT_ID;
      link.rel = 'stylesheet';
      link.href = 'https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700&display=swap';
      document.head.append(link);
    }
  }

  function attributeList(card) {
    return card.position === 'GK'
      ? [['REF', card.reflexes], ['POS', card.positioning], ['HAN', card.handling], ['VEL', card.pace], ['DEF', card.defending], ['FIS', card.physical]]
      : [['VEL', card.pace], ['CHU', card.shooting], ['PAS', card.passing], ['DRI', card.dribbling], ['DEF', card.defending], ['FIS', card.physical]];
  }

  function renderCard(card) {
    const attrs = attributeList(card).map(([label, value]) => `<div class="fsc-attr"><span>${label}</span><b>${value}</b></div>`).join('');
    const src = IMAGE_BASE + encodeURIComponent(card.image);
    const iconClass = card.rarity === 'icon' ? ' fsc-card-icon' : '';
    return `<a class="fsc-card-link" href="${CARDS_SITE}" target="_blank" rel="noopener noreferrer" aria-label="Abrir FutSENAI Cards: ${escapeHtml(card.name)}, ${escapeHtml(card.label)}, overall ${card.overall}">
      <article class="fsc-card${iconClass}" style="--r:${escapeHtml(card.color)}" aria-hidden="true">
      <div class="fsc-ph" aria-hidden="true"></div>
      <img class="fsc-photo" src="${escapeHtml(src)}" alt="${escapeHtml(card.name)}" loading="lazy" decoding="async" referrerpolicy="no-referrer">
      <div class="fsc-shade" aria-hidden="true"></div>
      <span class="fsc-rarity">${escapeHtml(card.label)}</span>
      <div class="fsc-ovr">${card.overall}</div>
      <div class="fsc-edition">${escapeHtml(card.edition)}</div>
      <div class="fsc-info"><div class="fsc-pos">${escapeHtml(card.position)} · ${escapeHtml(card.club)}</div><div class="fsc-name">${escapeHtml(card.name)}</div><div class="fsc-attrs">${attrs}</div></div>
      </article>
    </a>`;
  }

  function buildSection(playerName) {
    const section = document.createElement('section');
    section.id = SECTION_ID;
    section.className = 'panel fsc-panel';
    section.dataset.key = normalizeName(playerName) + '|' + catalogSig;

    const match = findCatalogPlayer(playerName, catalog);
    const link = `<a class="fsc-open" href="${CARDS_SITE}" target="_blank" rel="noopener noreferrer">Abrir FutSENAI Cards ↗</a>`;
    const head = subtitle => `<div class="panel-head"><div><h2 class="panel-title">Cards</h2><div class="panel-subtitle">${subtitle}</div></div><div>${link}</div></div>`;

    if (!match) {
      section.innerHTML = `${head('FutSENAI Cards')}<div class="fsc-empty"><strong>${escapeHtml(playerName)} ainda não tem card</strong>Nenhum jogador do FutSENAI Cards corresponde a este nome. Quando ele for adicionado lá, as versões aparecem aqui automaticamente.</div>`;
      return section;
    }

    const template = match.template;
    const cards = RARITY_ORDER.map(r => generateCard(template, r, catalog));
    const sameName = normalizeName(template.name) === normalizeName(playerName);
    const subtitle = sameName ? 'FutSENAI Cards · 6 raridades' : `FutSENAI Cards · ${escapeHtml(template.name)} · 6 raridades`;
    section.innerHTML = `${head(subtitle)}<div class="fsc-grid">${cards.map(renderCard).join('')}</div><p class="fsc-note">Versões disponíveis deste jogador no FutSENAI Cards.</p>`;
    section.querySelectorAll('.fsc-photo').forEach(img => {
      img.addEventListener('error', () => img.classList.add('is-missing'), { once: true });
    });
    return section;
  }

  // ───────────── Integração com a tela do jogador ─────────────
  function findPlayerName(root) {
    const selectors = ['.player-profile-hero h2', '.player-profile-hero h1', '.player-profile-hero .player-name', '[data-player-name]'];
    for (const selector of selectors) {
      const el = root.querySelector(selector);
      const text = el && (el.dataset.playerName || el.textContent || '').trim();
      if (text) return text;
    }
    return '';
  }

  // Procura o painel "Últimas partidas"; sem ele, cai no painel de histórico/hero.
  function findAnchor(root) {
    const headings = root.querySelectorAll('h1,h2,h3,h4,h5,.panel-title');
    for (const heading of headings) {
      if (heading.closest('#' + SECTION_ID)) continue;
      if (normalizeName(heading.textContent).startsWith('ultimas partidas')) {
        const panel = heading.closest('.panel, section, article');
        if (panel && panel !== root && root.contains(panel)) return panel;
      }
    }
    return root.querySelector('.player-history-panel') || root.querySelector('.player-profile-hero');
  }

  function renderCurrentPlayerCards(force) {
    const root = document.getElementById('pageContent');
    if (!root) return;
    const playerName = findPlayerName(root);
    const existing = root.querySelector('#' + SECTION_ID);
    if (!playerName) { if (existing) existing.remove(); return; }

    const key = normalizeName(playerName) + '|' + catalogSig;
    const anchor = findAnchor(root);
    if (!anchor) return;
    if (existing && !force && existing.dataset.key === key && existing.previousElementSibling === anchor) return;
    if (existing) existing.remove();
    anchor.insertAdjacentElement('afterend', buildSection(playerName));
  }

  function start() {
    injectAssets();
    const cached = readCache();
    if (cached) catalog = cached.catalog;
    catalogSig = signatureOf(catalog);

    const root = document.getElementById('pageContent');
    if (!root || typeof MutationObserver === 'undefined') return;
    let scheduled = false;
    new MutationObserver(() => {
      if (scheduled) return;
      scheduled = true;
      requestAnimationFrame(() => { scheduled = false; renderCurrentPlayerCards(false); });
    }).observe(root, { childList: true, subtree: true });
    renderCurrentPlayerCards(false);

    if (!cached || Date.now() - cached.savedAt > CACHE_TTL_MS) refreshCatalog();
  }

export function startPlayerCards() {
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
}
export { getUncommonOverall };
