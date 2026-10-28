// journal.js
import { DEFAULT_JOURNAL_COVER, JOURNAL_FEED_URL, JOURNAL_HOME_URL, JOURNAL_ROTATION_MS } from './config.js';
import { updateChrome } from './ui.js';

export let journalNews = [];
export let journalCurrentIndex = 0;
export let freshJournalNews = null;
export let journalRotationTimer = null;
export let journalTransitionTimer = null;
export function formatJournalDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Data indisponível';
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit', month: 'short', year: 'numeric', timeZone: 'America/Sao_Paulo'
  }).format(date).replace('.', '');
}
export function isFreshJournalNews(value) {
  const createdAt = Date.parse(value);
  const age = Date.now() - createdAt;
  return Number.isFinite(createdAt) && age >= 0 && age <= 12 * 60 * 60 * 1000;
}
export function fallbackJournalNewsFromMarkup() {
  const title = document.getElementById('sidebarJournalTitle')?.textContent?.trim();
  const tag = document.getElementById('sidebarJournalTag')?.textContent?.trim();
  const date = document.getElementById('sidebarJournalDate');
  const excerpt = document.getElementById('sidebarJournalExcerpt')?.textContent?.trim();
  const cover = document.getElementById('sidebarJournalCover');
  const image = cover?.getAttribute('src');
  if (!title) return [];
  return [{
    title,
    category: tag || 'NOTÍCIA',
    createdAt: date?.dateTime || '',
    content: excerpt || '',
    image: image && image !== DEFAULT_JOURNAL_COVER ? image : ''
  }];
}
export function journalImageUrl(item) {
  const providedImage = typeof item.image === 'string' ? item.image.trim() : '';
  if (!providedImage) return '';
  try {
    const parsedImageUrl = new URL(providedImage, JOURNAL_HOME_URL);
    if (parsedImageUrl.protocol === 'https:' || parsedImageUrl.protocol === 'http:') return parsedImageUrl.href;
  } catch {
    // A imagem inválida será substituída pela capa ilustrativa.
  }
  return '';
}
export function renderCurrentJournalNews() {
  if (!journalNews.length) return;
  const item = journalNews[journalCurrentIndex];
  const link = document.getElementById('latestJournalNews');
  const cover = document.getElementById('sidebarJournalCover');
  const tag = document.getElementById('sidebarJournalTag');
  const date = document.getElementById('sidebarJournalDate');
  const title = document.getElementById('sidebarJournalTitle');
  const excerpt = document.getElementById('sidebarJournalExcerpt');
  const kicker = document.getElementById('sidebarJournalKicker');
  const freshBadge = document.getElementById('sidebarJournalFresh');
  const controls = document.getElementById('sidebarJournalControls');
  const dots = document.getElementById('sidebarJournalDots');
  if (!link || !cover || !tag || !date || !title || !excerpt || !dots) return;

  const headline = String(item.title || 'Última notícia do Jornal FutSENAI').trim();
  const fresh = isFreshJournalNews(item.createdAt);
  const coverUrl = journalImageUrl(item);
  cover.onerror = () => {
    cover.onerror = null;
    cover.src = DEFAULT_JOURNAL_COVER;
    cover.alt = `Capa ilustrativa da matéria: ${headline}`;
  };
  cover.src = coverUrl || DEFAULT_JOURNAL_COVER;
  cover.alt = coverUrl ? `Capa da matéria: ${headline}` : `Capa ilustrativa da matéria: ${headline}`;

  link.href = JOURNAL_HOME_URL;
  link.setAttribute('aria-label', `Ler no Jornal FutSENAI: ${headline}`);
  if (kicker) kicker.textContent = 'JORNAL FUTSENAI';
  if (freshBadge) freshBadge.hidden = !fresh;
  tag.textContent = String(item.category || 'NOTÍCIA').trim().toLocaleUpperCase('pt-BR');
  date.dateTime = String(item.createdAt || '');
  date.textContent = formatJournalDate(item.createdAt);
  const cleanContent = String(item.content || '').replace(/\s+/g, ' ').trim();
  excerpt.textContent = cleanContent.length > 125 ? `${cleanContent.slice(0, 122).trimEnd()}…` : cleanContent;
  title.textContent = headline.length > 110 ? `${headline.slice(0, 107).trimEnd()}…` : headline;

  dots.replaceChildren();
  journalNews.forEach((newsItem, index) => {
    const dot = document.createElement('button');
    dot.type = 'button';
    dot.className = 'sidebar-news-dot' + (index === journalCurrentIndex ? ' is-active' : '');
    dot.dataset.journalIndex = String(index);
    dot.setAttribute('aria-label', `Ver notícia ${index + 1}: ${String(newsItem.title || '').trim()}`);
    dot.setAttribute('aria-current', String(index === journalCurrentIndex));
    dots.append(dot);
  });
  if (controls) controls.hidden = journalNews.length < 2;
}
export function stopJournalRotation() {
  if (journalRotationTimer !== null) {
    window.clearInterval(journalRotationTimer);
    journalRotationTimer = null;
  }
}
export function startJournalRotation() {
  stopJournalRotation();
  if (journalNews.length < 2) return;
  journalRotationTimer = window.setInterval(() => showJournalNews(journalCurrentIndex + 1), JOURNAL_ROTATION_MS);
}
export function showJournalNews(nextIndex) {
  if (journalNews.length < 2) return;
  journalCurrentIndex = (nextIndex % journalNews.length + journalNews.length) % journalNews.length;
  const story = document.getElementById('latestJournalNews');
  if (journalTransitionTimer !== null) window.clearTimeout(journalTransitionTimer);
  if (story) story.classList.add('is-changing');
  journalTransitionTimer = window.setTimeout(() => {
    renderCurrentJournalNews();
    if (story) requestAnimationFrame(() => story.classList.remove('is-changing'));
    journalTransitionTimer = null;
  }, story ? 150 : 0);
  startJournalRotation();
}
export function renderLatestJournalNews(items) {
  const incoming = (Array.isArray(items) ? items : [items])
    .filter(item => item && typeof item === 'object' && typeof item.title === 'string' && item.title.trim())
    .slice(0, 3);
  journalNews = incoming.length ? incoming : fallbackJournalNewsFromMarkup();
  freshJournalNews = journalNews
    .filter(item => isFreshJournalNews(item.createdAt))
    .sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt))[0] || null;
  const freshTicker = document.getElementById('freshNewsTicker');
  const freshTickerText = document.getElementById('freshNewsTickerText');
  const freshTickerRepeat = document.getElementById('freshNewsTickerRepeat');
  if (freshTicker && freshTickerText && freshTickerRepeat) {
    const headline = String(freshJournalNews?.title || '').trim();
    freshTickerText.textContent = headline;
    freshTickerRepeat.textContent = headline;
    freshTicker.setAttribute('aria-label', headline ? `Notícia fresca! Abrir Notícias FutSENAI: ${headline}` : 'Notícia fresca! Abrir Notícias FutSENAI');
  }
  journalCurrentIndex = 0;
  renderCurrentJournalNews();
  startJournalRotation();
  updateChrome();
}
export function setupJournalCarouselControls() {
  const previous = document.getElementById('sidebarJournalPrev');
  const next = document.getElementById('sidebarJournalNext');
  const dots = document.getElementById('sidebarJournalDots');
  if (previous) previous.addEventListener('click', () => showJournalNews(journalCurrentIndex - 1));
  if (next) next.addEventListener('click', () => showJournalNews(journalCurrentIndex + 1));
  if (dots) dots.addEventListener('click', event => {
    const dot = event.target.closest('[data-journal-index]');
    if (dot) showJournalNews(Number(dot.dataset.journalIndex));
  });
}
export async function loadLatestJournalNews() {
  try {
    const response = await fetch(`${JOURNAL_FEED_URL}?_=${Date.now()}`, { cache: 'no-store' });
    if (!response.ok) throw new Error(`Feed do jornal respondeu ${response.status}`);
    const articles = await response.json();
    if (!Array.isArray(articles)) throw new Error('Formato de notícias inválido');
    const latest = articles
      .filter(item => item && typeof item.title === 'string' && item.title.trim()
        && typeof item.createdAt === 'string' && Number.isFinite(Date.parse(item.createdAt)))
      .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
      .slice(0, 3);
    renderLatestJournalNews(latest);
  } catch (error) {
    // Mantém a notícia de reserva presente no HTML se o feed estiver indisponível.
    console.warn('Não foi possível atualizar as notícias do Jornal FutSENAI.', error);
    renderLatestJournalNews(fallbackJournalNewsFromMarkup());
  }
}
