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
 *
 * Limitação: as cartas que cada usuário *possui* ficam na conta dele (Supabase,
 * com login) e não podem ser lidas por outro site. Aqui aparecem as versões
 * disponíveis de cada jogador, não a coleção pessoal.
 */
(() => {
  'use strict';

  // ───────────────────────── Configuração ─────────────────────────
  const CARDS_SITE = 'https://fut-senai-cards.vercel.app/';
  const RAW_BASE = 'https://raw.githubusercontent.com/Valle-Vinicius/FutSENAICards/main/';
  const IMAGE_BASE = RAW_BASE + 'src/imagens/';
  const CACHE_KEY = 'futsenai-cards-catalog-v2';
  const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hora
  const FETCH_TIMEOUT_MS = 8000;
  const SECTION_ID = 'futsenaicards-player-cards';
  const STYLE_ID = 'futsenaicards-integration-styles';
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
  };

  // Forçar uma correspondência manual: "nome no FutSENAI" → "nome no Cards".
  // Ex.: { 'zé': 'Rafael Dutra' }. As chaves são comparadas sem acento/maiúscula.
  const NAME_OVERRIDES = {};

  // Catálogo embutido (cópia verificada do Cards). Gerado automaticamente.
  const SNAPSHOT = /*SNAPSHOT_START*/{
    "templates": [
      {
        "name": "Pietro Guedes",
        "position": "Pivo",
        "nationality": "Brasil",
        "age": 20,
        "club": "Aurora Futsal",
        "image": "pietroguedes.jpg",
        "attributes": {
          "pace": 85,
          "shooting": 92,
          "passing": 75,
          "dribbling": 75,
          "defending": 65,
          "physical": 90
        }
      },
      {
        "name": "Mateus Lopes",
        "position": "Pivo",
        "nationality": "Brasil",
        "age": 19,
        "club": "Estrela Futsal",
        "image": "matheuslopes.jpg",
        "attributes": {
          "pace": 40,
          "shooting": 76,
          "passing": 70,
          "dribbling": 83,
          "defending": 65,
          "physical": 73
        }
      },
      {
        "name": "Muzy",
        "position": "Pivo",
        "nationality": "Brasil",
        "age": 21,
        "club": "Fênix Futsal",
        "image": "gustavohyppolito.jpg",
        "attributes": {
          "pace": 70,
          "shooting": 78,
          "passing": 75,
          "dribbling": 75,
          "defending": 68,
          "physical": 80
        }
      },
      {
        "name": "Thiago Tavares",
        "position": "Ala",
        "nationality": "Brasil",
        "age": 24,
        "club": "Leões Futsal",
        "image": "thiagotavares.jpg",
        "attributes": {
          "pace": 84,
          "shooting": 84,
          "passing": 85,
          "dribbling": 94,
          "defending": 70,
          "physical": 80
        }
      },
      {
        "name": "Rafael Dutra",
        "position": "Ala",
        "nationality": "Brasil",
        "age": 21,
        "club": "Tigres Futsal",
        "image": "rafaeldutra.jpg",
        "attributes": {
          "pace": 73,
          "shooting": 90,
          "passing": 84,
          "dribbling": 70,
          "defending": 70,
          "physical": 94
        }
      },
      {
        "name": "João Marcos",
        "position": "Ala",
        "nationality": "Brasil",
        "age": 23,
        "club": "Leões Futsal",
        "image": "joaomarcos.jpg",
        "attributes": {
          "pace": 85,
          "shooting": 78,
          "passing": 80,
          "dribbling": 85,
          "defending": 60,
          "physical": 60
        }
      },
      {
        "name": "Enzo Thomas",
        "position": "Ala",
        "nationality": "Brasil",
        "age": 19,
        "club": "Aurora Futsal",
        "image": "enzothomas.jpg",
        "attributes": {
          "pace": 82,
          "shooting": 78,
          "passing": 75,
          "dribbling": 90,
          "defending": 55,
          "physical": 60
        }
      },
      {
        "name": "Vinícius Assunção",
        "position": "Ala",
        "nationality": "Brasil",
        "age": 22,
        "club": "Aurora Futsal",
        "image": "viniciusassuncao.jpg",
        "attributes": {
          "pace": 94,
          "shooting": 72,
          "passing": 76,
          "dribbling": 65,
          "defending": 68,
          "physical": 60
        }
      },
      {
        "name": "Heitor Barbosa",
        "position": "Fixo",
        "nationality": "Brasil",
        "age": 22,
        "club": "Tigres Futsal",
        "image": "heitorbarbosa.jpg",
        "attributes": {
          "pace": 70,
          "shooting": 75,
          "passing": 80,
          "dribbling": 65,
          "defending": 85,
          "physical": 65
        }
      },
      {
        "name": "Jonas Daniel",
        "position": "GK",
        "nationality": "Brasil",
        "age": 18,
        "club": "Aurora Futsal",
        "image": "jonasdanieldebritolopes.jpg",
        "attributes": {
          "pace": 40,
          "shooting": 60,
          "passing": 60,
          "dribbling": 60,
          "defending": 65,
          "physical": 72
        },
        "gkAttributes": {
          "reflexes": 75,
          "positioning": 90,
          "handling": 75
        }
      },
      {
        "name": "Gabriel Ortelan",
        "position": "Fixo",
        "nationality": "Brasil",
        "age": 21,
        "club": "Estrela Futsal",
        "image": "gabrielortelan.jpg",
        "attributes": {
          "pace": 45,
          "shooting": 30,
          "passing": 55,
          "dribbling": 45,
          "defending": 90,
          "physical": 75
        }
      }
    ],
    "modifiers": {
      "common": 0.88,
      "uncommon": 1,
      "rare": 1.05,
      "epic": 1.1,
      "legendary": 1.15,
      "icon": 1.2
    },
    "specialBonuses": {
      "none": 0,
      "totw": 2,
      "potm": 2,
      "revelation": 1,
      "legend": 3,
      "futsal": 2
    },
    "rarities": {
      "common": {
        "label": "Comum",
        "color": "#9ca3af",
        "minOvr": 50,
        "maxOvr": 69
      },
      "uncommon": {
        "label": "Incomum",
        "color": "#b6ff3b",
        "minOvr": 60,
        "maxOvr": 74
      },
      "rare": {
        "label": "Rara",
        "color": "#3b82f6",
        "minOvr": 70,
        "maxOvr": 79
      },
      "epic": {
        "label": "Épica",
        "color": "#a855f7",
        "minOvr": 80,
        "maxOvr": 87
      },
      "legendary": {
        "label": "Lendária",
        "color": "#f5c542",
        "minOvr": 88,
        "maxOvr": 94
      },
      "icon": {
        "label": "Ícone",
        "color": "#fbbf24",
        "minOvr": 95,
        "maxOvr": 99
      }
    },
    "season": "2025/26",
    "fingerprint": "133swgw"
  }/*SNAPSHOT_END*/;

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
    }));

    const modDecl = playersTs.match(/RARITY_MODIFIER\b[^=]*=\s*\{/);
    if (!modDecl) throw new Error('RARITY_MODIFIER não encontrado');
    const modifiers = numbersIn(extractBlock(playersTs, modDecl.index + modDecl[0].length - 1) || '');

    const bonusDecl = playersTs.match(/SPECIAL_BONUS\b[^=]*=\s*\{/);
    if (!bonusDecl) throw new Error('SPECIAL_BONUS não encontrado');
    const specialBonuses = numbersIn(extractBlock(playersTs, bonusDecl.index + bonusDecl[0].length - 1) || '');

    const metaDecl = typesTs.match(/RARITY_META\b[^=]*=\s*\{/);
    if (!metaDecl) throw new Error('RARITY_META não encontrado');
    const metaText = extractBlock(typesTs, metaDecl.index + metaDecl[0].length - 1) || '';
    const rarities = {};
    for (const m of metaText.matchAll(/([a-z]+)\s*:\s*\{\s*label\s*:\s*'([^']*)'\s*,\s*color\s*:\s*'([^']*)'\s*,\s*glow\s*:\s*'[^']*'\s*,\s*minOvr\s*:\s*(\d+)\s*,\s*maxOvr\s*:\s*(\d+)/g)) {
      rarities[m[1]] = { label: m[2], color: m[3], minOvr: Number(m[4]), maxOvr: Number(m[5]) };
    }

    const season = (playersTs.match(/SEASONS\s*=\s*\[\s*'([^']+)'/) || [])[1] || '';
    return { templates, modifiers, specialBonuses, rarities, season, fingerprint: formulaFingerprint(playersTs) };
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
      }
      for (const r of RARITY_ORDER) {
        const mod = c.modifiers && c.modifiers[r];
        const meta = c.rarities && c.rarities[r];
        if (!Number.isFinite(mod) || mod < 0.5 || mod > 2) return false;
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
    let overall = calculateOverall(template.position, attrs, gk);
    overall = Math.min(99, overall + (catalog.specialBonuses[special] ?? 0));
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
  const signatureOf = c => hashString(JSON.stringify([c.templates, c.modifiers, c.rarities, c.season]));
  if (typeof window !== 'undefined') {
    window.FutSENAIPlayerCards = Object.freeze({
      getUncommonOverall(playerName) {
        const match = findCatalogPlayer(playerName, catalog);
        return match ? generateCard(match.template, 'uncommon', catalog).overall : null;
      }
    });
  }

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
  const css = `
    .fsc-panel{margin-top:18px;overflow:hidden}
    .fsc-panel .panel-head{align-items:center;flex-wrap:wrap}
    .fsc-open{display:inline-flex;align-items:center;justify-content:center;gap:7px;border:1px solid #f1d4dc;border-radius:9px;background:#fff5f7;color:#b81435;padding:8px 11px;font-size:11px;font-weight:800;white-space:nowrap;text-decoration:none}
    .fsc-open:hover{background:#ffe8ee;border-color:#e7a8b7}
    .fsc-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(168px,1fr));gap:18px 16px;padding:6px 22px 18px;justify-items:center}
    .fsc-note{margin:0;padding:0 22px 18px;color:#858894;font-size:11px;line-height:1.55}
    .fsc-empty{margin:4px 20px 22px;padding:22px 16px;text-align:center;border:1px dashed #dedee5;border-radius:13px;background:#fcfcfd;color:#858894;font-size:12px;line-height:1.6}
    .fsc-empty strong{display:block;margin-bottom:4px;color:#40424d;font-size:13px}

    .fsc-card{--u:1px;position:relative;box-sizing:border-box;width:100%;max-width:204px;aspect-ratio:3/4;overflow:hidden;border:2px solid var(--r);border-radius:16px;background:#252733;box-shadow:0 8px 24px rgba(37,39,51,.15);color:#fff;font-family:'Poppins',system-ui,-apple-system,sans-serif;user-select:none;transition:transform .2s ease;container-type:inline-size}
    @supports (width:1cqw){.fsc-card{--u:calc(100cqw / 188)}}
    .fsc-card:hover{transform:translateY(-4px)}
    .fsc-card *{box-sizing:border-box}
    .fsc-photo{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;object-position:top}
    .fsc-photo.is-missing{display:none}
    .fsc-ph{position:absolute;inset:0;background:linear-gradient(180deg,#F7F7F9,#E9EAF0)}
    .fsc-shade{position:absolute;inset:0;background:linear-gradient(to top,rgba(0,0,0,.8),rgba(0,0,0,.35),rgba(0,0,0,0))}
    .fsc-rarity{position:absolute;top:calc(var(--u)*8);left:calc(var(--u)*8);max-width:60%;padding:calc(var(--u)*2) calc(var(--u)*8);border-radius:999px;background:var(--r);color:#fff;font-size:calc(var(--u)*10);font-weight:700;line-height:1.5;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .fsc-ovr{position:absolute;top:calc(var(--u)*8);right:calc(var(--u)*8);color:var(--r);font-size:calc(var(--u)*24);font-weight:700;line-height:1;text-shadow:0 2px 4px rgba(0,0,0,.6)}
    .fsc-edition{position:absolute;top:calc(var(--u)*40);right:calc(var(--u)*8);max-width:35%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:rgba(255,255,255,.7);font-size:calc(var(--u)*8);line-height:1.5}
    .fsc-info{position:absolute;left:0;right:0;bottom:0;padding:calc(var(--u)*10)}
    .fsc-pos{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:rgba(255,255,255,.8);font-size:calc(var(--u)*10);line-height:1.5}
    .fsc-name{margin-top:calc(var(--u)*2);display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;color:#fff;font-size:calc(var(--u)*16);font-weight:700;line-height:1.25}
    .fsc-attrs{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:calc(var(--u)*4);margin-top:calc(var(--u)*6)}
    .fsc-attr{display:flex;flex-direction:column;align-items:center;padding:calc(var(--u)*2);border-radius:calc(var(--u)*4);background:rgba(0,0,0,.5);font-size:calc(var(--u)*11)}
    .fsc-attr span{color:rgba(255,255,255,.7);line-height:1}
    .fsc-attr b{margin-top:calc(var(--u)*2);color:#fff;font-weight:700;line-height:1}
    @media(max-width:760px){.fsc-grid{grid-template-columns:repeat(2,minmax(0,1fr));gap:14px 10px;padding:4px 13px 16px}.fsc-note{padding:0 15px 16px}.fsc-panel .panel-head{padding:17px 15px 13px}.fsc-open{width:100%}}
    @media(prefers-reduced-motion:reduce){.fsc-card{transition:none}.fsc-card:hover{transform:none}}
  `;

  function injectAssets() {
    if (!document.getElementById(STYLE_ID)) {
      const style = document.createElement('style');
      style.id = STYLE_ID;
      style.textContent = css;
      document.head.append(style);
    }
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
      ? [['REF', card.reflexes], ['POS', card.positioning], ['HAN', card.handling], ['PAC', card.pace], ['DEF', card.defending], ['FIS', card.physical]]
      : [['PAC', card.pace], ['SHO', card.shooting], ['PAS', card.passing], ['DRI', card.dribbling], ['DEF', card.defending], ['PHY', card.physical]];
  }

  function renderCard(card) {
    const attrs = attributeList(card).map(([label, value]) => `<div class="fsc-attr"><span>${label}</span><b>${value}</b></div>`).join('');
    const src = IMAGE_BASE + encodeURIComponent(card.image);
    return `<article class="fsc-card" style="--r:${escapeHtml(card.color)}" aria-label="${escapeHtml(card.name)}, ${escapeHtml(card.label)}, overall ${card.overall}, ${escapeHtml(card.position)}">
      <div class="fsc-ph" aria-hidden="true"></div>
      <img class="fsc-photo" src="${escapeHtml(src)}" alt="${escapeHtml(card.name)}" loading="lazy" decoding="async" referrerpolicy="no-referrer">
      <div class="fsc-shade" aria-hidden="true"></div>
      <span class="fsc-rarity">${escapeHtml(card.label)}</span>
      <div class="fsc-ovr">${card.overall}</div>
      <div class="fsc-edition">${escapeHtml(card.edition)}</div>
      <div class="fsc-info"><div class="fsc-pos">${escapeHtml(card.position)} · ${escapeHtml(card.club)}</div><div class="fsc-name">${escapeHtml(card.name)}</div><div class="fsc-attrs">${attrs}</div></div>
    </article>`;
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
    section.innerHTML = `${head(subtitle)}<div class="fsc-grid">${cards.map(renderCard).join('')}</div><p class="fsc-note">Versões disponíveis deste jogador no FutSENAI Cards. As cartas que cada usuário já conquistou ficam na conta dele e não aparecem aqui.</p>`;
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

  // Exposição para testes em Node (não afeta o navegador).
  if (typeof window === 'undefined') {
    module.exports = { parseCatalog, isValidCatalog, generateCard, findCatalogPlayer, SNAPSHOT, normalizeName };
    return;
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})();
