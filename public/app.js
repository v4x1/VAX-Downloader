'use strict';

const translations = {
  en: {
    brandHome: 'VAX Downloader home',
    skipToContent: 'Skip to content',
    themeToggleDark: 'Switch to light mode',
    themeToggleLight: 'Switch to dark mode',
    languageLabel: 'Choose language',
    headlineLineOne: 'Your media,',
    headlineLineTwo: 'one tap away.',
    heroDescription: 'Paste a link to explore the formats and qualities actually available. Simple, quick, and made for you.',
    linkLabel: 'Media link',
    urlPlaceholder: 'Paste a YouTube, TikTok, Instagram link…',
    pasteLabel: 'Paste from clipboard',
    paste: 'Paste',
    analyze: 'Analyze link',
    analyzing: 'Analyzing…',
    highlightFormats: 'Only real available formats',
    highlightPrivate: 'Private by design',
    highlightFast: 'Fast, simple downloads',
    highlightsLabel: 'Product highlights',
    footer: '© All rights reserved — VAX Creations',
    invalidLink: 'That link does not look right. Enter a public http or https media URL and try again.',
    unsupportedSite: 'We could not recognize this platform. Try a link from a supported site.',
    privateContent: 'This content is private or requires an account. We can only analyze publicly accessible media.',
    unavailableContent: 'This media is unavailable, removed, or does not offer a downloadable stream.',
    networkError: 'We could not reach the source. Check your connection and try again in a moment.',
    rateLimited: 'A lot of requests came in at once. Please wait a little and try again.',
    serverBusy: 'Downloads are busy right now. Please try again shortly.',
    toolMissing: 'The media processing tools are not installed on this server yet. Please contact the site administrator.',
    fileTooLarge: 'This file is larger than the server’s download limit.',
    analysisError: 'We could not analyze that link. Please check it and try again.',
    downloadError: 'The download could not be prepared. Try another available format or retry in a moment.',
    serverError: 'Something went wrong on our side. Please try again.',
    clipboardUnavailable: 'Clipboard access is unavailable. You can paste the link into the field instead.',
    modeHeading: 'Choose your download',
    modeVideoDescription: 'Available video resolutions and formats',
    modeAudioDescription: 'Audio formats and bitrate options',
    video: 'VIDEO',
    audio: 'AUDIO',
    switchToAudio: 'Switch to audio downloads',
    switchToVideo: 'Switch to video downloads',
    availableVideo: 'Available video',
    availableAudio: 'Available audio',
    chooseVideo: 'Choose a resolution that is available for this link.',
    chooseAudio: 'Pick an audio format and bitrate for your download.',
    download: 'Download',
    preparing: 'Preparing',
    downloading: 'Downloading',
    ready: 'Ready',
    downloadDone: 'Downloaded',
    doneAnnouncement: 'Download complete.',
    unknownCreator: 'Unknown creator',
    untitledMedia: 'Untitled media',
    mediaFile: 'Media file',
    unavailableDuration: 'Duration unavailable',
    unavailableSize: 'Size varies',
    approximate: 'Approx.',
    kbps: 'kbps',
    pcmQuality: 'PCM · 44.1 kHz stereo',
    aacQuality: 'AAC audio',
    option: 'option',
    options: 'options',
    noVideoFormats: 'No downloadable video formats were found for this media.',
    noAudioFormats: 'No audio stream is available for this media.',
    noFormats: 'No compatible download formats are available for this link.',
    quality8k: '8K',
    quality4k: '4K',
    quality2k: '2K',
    qualityFhd: 'Full HD',
    qualityHd: 'HD',
    qualitySd: 'SD',
    platform_youtube: 'YouTube',
    platform_tiktok: 'TikTok',
    platform_instagram: 'Instagram',
    platform_telegram: 'Telegram',
    platform_twitter: 'X / Twitter',
    platform_facebook: 'Facebook',
    platform_soundcloud: 'SoundCloud',
    platform_vimeo: 'Vimeo',
    platform_reddit: 'Reddit',
    platform_other: 'Website',
  },
  ar: {
    brandHome: 'الصفحة الرئيسية لـ VAX Downloader',
    skipToContent: 'انتقل إلى المحتوى',
    themeToggleDark: 'التبديل إلى الوضع الفاتح',
    themeToggleLight: 'التبديل إلى الوضع الداكن',
    languageLabel: 'اختيار اللغة',
    headlineLineOne: 'محتواك،',
    headlineLineTwo: 'على بُعد لمسة.',
    heroDescription: 'ألصق الرابط لاستكشاف الصيغ والجودات المتاحة فعليًا. تجربة بسيطة وسريعة ومصممة لك.',
    linkLabel: 'رابط الوسائط',
    urlPlaceholder: 'ألصق رابطًا من YouTube أو TikTok أو Instagram…',
    pasteLabel: 'لصق من الحافظة',
    paste: 'لصق',
    analyze: 'تحليل الرابط',
    analyzing: 'جارٍ التحليل…',
    highlightFormats: 'الصيغ المتاحة فعلًا فقط',
    highlightPrivate: 'خصوصيتك أولويتنا',
    highlightFast: 'تنزيل سريع وبسيط',
    highlightsLabel: 'مزايا المنتج',
    footer: '© جميع الحقوق محفوظة — VAX Creations',
    invalidLink: 'يبدو أن الرابط غير صحيح. أدخل رابط وسائط عامًا يبدأ بـ http أو https ثم حاول مجددًا.',
    unsupportedSite: 'تعذّر التعرّف على هذه المنصة. جرّب رابطًا من موقع مدعوم.',
    privateContent: 'هذا المحتوى خاص أو يتطلب تسجيل الدخول. يمكننا تحليل الوسائط المتاحة للعامة فقط.',
    unavailableContent: 'هذه الوسائط غير متاحة أو محذوفة أو لا توفّر بثًا قابلًا للتنزيل.',
    networkError: 'تعذّر الاتصال بالمصدر. تحقق من اتصالك وحاول مجددًا بعد قليل.',
    rateLimited: 'وردت طلبات كثيرة في وقت قصير. انتظر قليلًا ثم حاول مجددًا.',
    serverBusy: 'التنزيلات مشغولة حاليًا. حاول مجددًا بعد قليل.',
    toolMissing: 'أدوات معالجة الوسائط غير مثبّتة على الخادم بعد. يرجى التواصل مع مسؤول الموقع.',
    fileTooLarge: 'حجم الملف أكبر من حد التنزيل المسموح به على الخادم.',
    analysisError: 'تعذّر تحليل هذا الرابط. تحقق منه ثم حاول مجددًا.',
    downloadError: 'تعذّر تجهيز التنزيل. جرّب صيغة أخرى متاحة أو أعد المحاولة بعد قليل.',
    serverError: 'حدث خطأ من جانبنا. يرجى المحاولة مجددًا.',
    clipboardUnavailable: 'لا يمكن الوصول إلى الحافظة. يمكنك لصق الرابط مباشرة في الحقل.',
    modeHeading: 'اختر طريقة التنزيل',
    modeVideoDescription: 'دقات وصيغ الفيديو المتاحة',
    modeAudioDescription: 'صيغ الصوت وخيارات معدل البت',
    video: 'فيديو',
    audio: 'صوت',
    switchToAudio: 'التبديل إلى تنزيل الصوت',
    switchToVideo: 'التبديل إلى تنزيل الفيديو',
    availableVideo: 'الفيديو المتاح',
    availableAudio: 'الصوت المتاح',
    chooseVideo: 'اختر دقة متاحة لهذا الرابط.',
    chooseAudio: 'اختر صيغة الصوت ومعدل البت للتنزيل.',
    download: 'تنزيل',
    preparing: 'جارٍ التجهيز',
    downloading: 'جارٍ التنزيل',
    ready: 'جاهز',
    downloadDone: 'تم التنزيل',
    doneAnnouncement: 'اكتمل التنزيل.',
    unknownCreator: 'ناشر غير معروف',
    untitledMedia: 'وسائط بلا عنوان',
    mediaFile: 'ملف وسائط',
    unavailableDuration: 'المدة غير متاحة',
    unavailableSize: 'الحجم متغير',
    approximate: 'تقريبًا',
    kbps: 'ك.بت/ث',
    pcmQuality: 'PCM · ستيريو 44.1 كيلوهرتز',
    aacQuality: 'صوت AAC',
    option: 'خيار',
    options: 'خيارات',
    noVideoFormats: 'لم نعثر على صيغ فيديو قابلة للتنزيل لهذا المحتوى.',
    noAudioFormats: 'لا يوجد مسار صوتي متاح لهذا المحتوى.',
    noFormats: 'لا توجد صيغ تنزيل متوافقة لهذا الرابط.',
    quality8k: '8K',
    quality4k: '4K',
    quality2k: '2K',
    qualityFhd: 'Full HD',
    qualityHd: 'HD',
    qualitySd: 'SD',
    platform_youtube: 'YouTube',
    platform_tiktok: 'TikTok',
    platform_instagram: 'Instagram',
    platform_telegram: 'Telegram',
    platform_twitter: 'X / Twitter',
    platform_facebook: 'Facebook',
    platform_soundcloud: 'SoundCloud',
    platform_vimeo: 'Vimeo',
    platform_reddit: 'Reddit',
    platform_other: 'موقع إلكتروني',
  },
};

const errorTranslationKeys = {
  invalid_url: 'invalidLink',
  invalid_request: 'invalidLink',
  unsupported_site: 'unsupportedSite',
  private_content: 'privateContent',
  unavailable_content: 'unavailableContent',
  network_error: 'networkError',
  rate_limited: 'rateLimited',
  server_busy: 'serverBusy',
  tool_missing: 'toolMissing',
  file_too_large: 'fileTooLarge',
  analysis_failed: 'analysisError',
  download_failed: 'downloadError',
  not_found: 'analysisError',
  server_error: 'serverError',
};

const knownPlatforms = new Set(['youtube', 'tiktok', 'instagram', 'telegram', 'twitter', 'facebook', 'soundcloud', 'vimeo', 'reddit']);
const platformMarks = { youtube: 'YT', tiktok: 'TT', instagram: 'IG', telegram: 'TG', twitter: 'X', facebook: 'FB', soundcloud: 'SC', vimeo: 'V', reddit: 'R' };
const state = {
  language: 'en',
  theme: 'dark',
  currentMedia: null,
  currentUrl: '',
  currentMode: 'video',
  resultSerial: 0,
  downloadStates: new Map(),
  themeWasChosen: false,
};

const html = document.documentElement;
const form = document.getElementById('analyze-form');
const input = document.getElementById('media-url');
const analyzeButton = document.getElementById('analyze-button');
const analyzerCard = document.querySelector('.analyzer-card');
const formMessage = document.getElementById('form-message');
const resultsShell = document.getElementById('results-shell');
const skeletonCard = document.getElementById('skeleton-card');
const resultContainer = document.getElementById('result-container');
const screenReaderStatus = document.getElementById('screen-reader-status');
const themeToggle = document.getElementById('theme-toggle');

function t(key) {
  return translations[state.language]?.[key] || translations.en[key] || key;
}

function readStorage(key) {
  try { return window.localStorage.getItem(key); } catch { return null; }
}

function writeStorage(key, value) {
  try { window.localStorage.setItem(key, value); } catch { /* Storage may be disabled. */ }
}

function applyTheme(theme, persist = false) {
  state.theme = theme === 'light' ? 'light' : 'dark';
  html.dataset.theme = state.theme;
  themeToggle.setAttribute('aria-checked', String(state.theme === 'dark'));
  themeToggle.setAttribute('aria-label', t(state.theme === 'dark' ? 'themeToggleDark' : 'themeToggleLight'));
  const themeColor = document.querySelector('meta[name="theme-color"]');
  if (themeColor) themeColor.content = state.theme === 'dark' ? '#10111b' : '#f4f6fb';
  if (persist) {
    state.themeWasChosen = true;
    writeStorage('vax-theme', state.theme);
  }
}

function setLanguage(language, persist = true) {
  state.language = language === 'ar' ? 'ar' : 'en';
  html.lang = state.language;
  html.dir = state.language === 'ar' ? 'rtl' : 'ltr';
  document.title = state.language === 'ar' ? 'VAX Downloader — تنزيل الوسائط بسهولة' : 'VAX Downloader — Media, made simple';

  document.querySelectorAll('[data-i18n]').forEach((element) => {
    element.textContent = t(element.dataset.i18n);
  });
  document.querySelectorAll('[data-i18n-placeholder]').forEach((element) => {
    element.setAttribute('placeholder', t(element.dataset.i18nPlaceholder));
  });
  document.querySelectorAll('[data-i18n-aria]').forEach((element) => {
    element.setAttribute('aria-label', t(element.dataset.i18nAria));
  });
  document.querySelectorAll('.language-option').forEach((button) => {
    const active = button.dataset.language === state.language;
    button.classList.toggle('is-active', active);
    button.setAttribute('aria-pressed', String(active));
  });
  applyTheme(state.theme, false);
  const analyzeLabel = analyzeButton.querySelector('.analyze-label');
  if (analyzeLabel) analyzeLabel.textContent = analyzerCard.classList.contains('is-loading') ? t('analyzing') : t('analyze');
  if (!formMessage.hidden && formMessage.dataset.messageKey) formMessage.textContent = t(formMessage.dataset.messageKey);
  const resultMessage = resultContainer.querySelector('.result-message');
  if (resultMessage?.dataset.messageKey) resultMessage.textContent = t(resultMessage.dataset.messageKey);
  document.querySelector('meta[name="description"]')?.setAttribute('content', state.language === 'ar'
    ? 'حلّل رابط الوسائط واختر صيغة الفيديو أو الصوت والجودة المتاحة خلال ثوانٍ.'
    : 'Analyze a media link and choose an available video or audio download in seconds.');

  if (state.currentMedia) renderCurrentResult();
  if (persist) writeStorage('vax-language', state.language);
}

function initPreferences() {
  const storedTheme = readStorage('vax-theme');
  state.themeWasChosen = storedTheme === 'dark' || storedTheme === 'light';
  const systemDark = window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? true;
  applyTheme(state.themeWasChosen ? storedTheme : (systemDark ? 'dark' : 'light'));
  const savedLanguage = readStorage('vax-language');
  setLanguage(savedLanguage === 'ar' ? 'ar' : 'en', false);

  window.matchMedia?.('(prefers-color-scheme: dark)').addEventListener?.('change', (event) => {
    if (!state.themeWasChosen) applyTheme(event.matches ? 'dark' : 'light');
  });
}

function announce(message) {
  screenReaderStatus.textContent = '';
  window.setTimeout(() => { screenReaderStatus.textContent = message; }, 20);
}

function showFormMessage(messageKey, kind = 'error') {
  formMessage.dataset.messageKey = messageKey;
  formMessage.textContent = t(messageKey);
  formMessage.dataset.kind = kind;
  formMessage.hidden = false;
}

function clearFormMessage() {
  formMessage.hidden = true;
  formMessage.textContent = '';
  delete formMessage.dataset.kind;
  delete formMessage.dataset.messageKey;
}

function showResultMessage(messageKey, kind = 'error') {
  const existing = resultContainer.querySelector('.result-message');
  if (existing) existing.remove();
  const alert = document.createElement('p');
  alert.className = 'inline-message result-message';
  alert.setAttribute('role', kind === 'error' ? 'alert' : 'status');
  alert.dataset.kind = kind;
  alert.dataset.messageKey = messageKey;
  alert.textContent = t(messageKey);
  resultContainer.querySelector('.result-card')?.append(alert);
}

function clearResultMessage() {
  resultContainer.querySelector('.result-message')?.remove();
}

function apiErrorKey(code) {
  return errorTranslationKeys[code] || 'serverError';
}

async function parseApiError(response) {
  try {
    const payload = await response.json();
    return payload?.error?.code || 'server_error';
  } catch {
    return 'server_error';
  }
}

function isPlausibleLink(value) {
  try {
    const parsed = new URL(value);
    if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password) return false;
    const host = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, '').replace(/\.$/, '');
    if (!host || host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host.endsWith('.internal')) return false;
    if (/^(0|10|127|169\.254|192\.168)\./.test(host) || /^172\.(1[6-9]|2\d|3[01])\./.test(host)) return false;
    if (host === '::1' || host.startsWith('fc') || host.startsWith('fd') || host.startsWith('fe80:')) return false;
    return true;
  } catch {
    return false;
  }
}

function setAnalyzing(isLoading) {
  analyzeButton.disabled = isLoading;
  input.disabled = isLoading;
  document.getElementById('paste-button').disabled = isLoading;
  analyzerCard.classList.toggle('is-loading', isLoading);
  resultsShell.hidden = false;
  resultsShell.setAttribute('aria-busy', String(isLoading));
  skeletonCard.hidden = !isLoading;
  resultContainer.hidden = isLoading;
  if (isLoading) {
    analyzeButton.querySelector('.analyze-label').textContent = t('analyzing');
    announce(t('analyzing'));
  } else {
    analyzeButton.querySelector('.analyze-label').textContent = t('analyze');
  }
}

function apiUrl(path) {
  const configuredBase = window.VAX_API_BASE || '';
  const base = configuredBase ? configuredBase.replace(/\/+$/, '') : window.location.origin;
  return `${base}/api/${path.replace(/^\/+/, '')}`;
}

async function analyzeLink(url) {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 60_000);
  try {
    const response = await fetch(apiUrl('analyze'), {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'accept': 'application/json' },
      body: JSON.stringify({ url }),
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(await parseApiError(response));
    const payload = await response.json();
    if (!payload?.ok || !payload.media) throw new Error('analysis_failed');
    return payload.media;
  } finally {
    window.clearTimeout(timeout);
  }
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  clearFormMessage();
  const url = input.value.trim();
  if (!isPlausibleLink(url)) {
    showFormMessage('invalidLink');
    input.focus();
    return;
  }

  state.currentMedia = null;
  state.currentUrl = url;
  resultContainer.replaceChildren();
  setAnalyzing(true);

  try {
    const media = await analyzeLink(url);
    state.currentMedia = normalizeClientMedia(media);
    state.currentMode = 'video';
    state.resultSerial += 1;
    resultContainer.hidden = false;
    renderCurrentResult();
    announce(t('availableVideo'));
  } catch (error) {
    resultContainer.replaceChildren();
    resultsShell.hidden = true;
    const code = error.name === 'AbortError' ? 'network_error' : (error.message || 'server_error');
    showFormMessage(apiErrorKey(code));
    announce(t(apiErrorKey(code)));
  } finally {
    setAnalyzing(false);
    if (!state.currentMedia) resultsShell.hidden = true;
  }
});

function normalizeClientMedia(media) {
  const allowedVideo = Array.isArray(media.videoFormats) ? media.videoFormats.filter((item) =>
    item && Number.isInteger(Number(item.height)) && Number(item.height) > 0 && ['mp4', 'webm'].includes(item.format)
  ) : [];
  const allowedAudio = Array.isArray(media.audioFormats) ? media.audioFormats.filter((item) =>
    item && ['mp3', 'wav', 'm4a'].includes(item.format)
  ) : [];
  return {
    title: typeof media.title === 'string' ? media.title : t('untitledMedia'),
    uploader: typeof media.uploader === 'string' ? media.uploader : t('unknownCreator'),
    duration: media.duration !== null && media.duration !== undefined && Number.isFinite(Number(media.duration)) ? Number(media.duration) : null,
    thumbnail: typeof media.thumbnail === 'string' && media.thumbnail.startsWith('https://')
      ? `${apiUrl('thumbnail')}?url=${encodeURIComponent(media.thumbnail)}`
      : null,
    platformKey: knownPlatforms.has(media.platformKey) ? media.platformKey : 'other',
    platformName: typeof media.platformName === 'string' ? media.platformName.slice(0, 48) : '',
    videoFormats: allowedVideo,
    audioFormats: allowedAudio,
  };
}

function makeElement(tag, className, text) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}

function makeSvg(name, className = '') {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', name === 'play' ? '0 0 24 24' : '0 0 20 20');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('aria-hidden', 'true');
  if (className) svg.setAttribute('class', className);
  const paths = {
    play: [['path', { d: 'M8 5.5v13l10-6.5-10-6.5Z', fill: 'currentColor', stroke: 'none' }]],
    user: [['circle', { cx: '10', cy: '6.3', r: '3.1' }], ['path', { d: 'M3.8 17.4c.5-3.1 2.8-5 6.2-5s5.7 1.9 6.2 5' }]],
    download: [['path', { d: 'M10 2.5v9.2m-3.7-3.1 3.7 3.7 3.7-3.7M3.2 14v2.3c0 .8.7 1.5 1.5 1.5h10.6c.8 0 1.5-.7 1.5-1.5V14' }]],
    check: [['path', { d: 'm3.5 10.3 4.1 4.1 8.9-9.1' }]],
  };
  for (const [tagName, attributes] of paths[name] || []) {
    const child = document.createElementNS(ns, tagName);
    for (const [attribute, value] of Object.entries(attributes)) child.setAttribute(attribute, value);
    svg.append(child);
  }
  return svg;
}

function setDownloadIcon(iconHolder, done = false) {
  iconHolder.replaceChildren(makeSvg(done ? 'check' : 'download', done ? 'download-check' : ''));
}

function durationLabel(duration) {
  if (!Number.isFinite(duration)) return t('unavailableDuration');
  const total = Math.floor(duration);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  const number = new Intl.NumberFormat(state.language === 'ar' ? 'ar' : 'en-US', { useGrouping: false, minimumIntegerDigits: 2 });
  return hours > 0
    ? `${number.format(hours)}:${number.format(minutes)}:${number.format(seconds)}`
    : `${number.format(minutes)}:${number.format(seconds)}`;
}

function formatBytes(bytes) {
  const size = Number(bytes);
  if (!Number.isFinite(size) || size <= 0) return t('unavailableSize');
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const unitIndex = Math.min(units.length - 1, Math.floor(Math.log(size) / Math.log(1024)));
  const value = size / (1024 ** unitIndex);
  const number = new Intl.NumberFormat(state.language === 'ar' ? 'ar' : 'en-US', { maximumFractionDigits: unitIndex === 0 ? 0 : 1 });
  return `${t('approximate')} ${number.format(value)} ${units[unitIndex]}`;
}

function localNumber(value) {
  return new Intl.NumberFormat(state.language === 'ar' ? 'ar' : 'en-US', { maximumFractionDigits: 0 }).format(value);
}

function qualityTier(height) {
  if (height >= 4320) return t('quality8k');
  if (height >= 2160) return t('quality4k');
  if (height >= 1440) return t('quality2k');
  if (height >= 1080) return t('qualityFhd');
  if (height >= 720) return t('qualityHd');
  if (height >= 480) return t('qualitySd');
  return `${localNumber(height)}p`;
}

function platformName(media) {
  if (media.platformKey !== 'other') return t(`platform_${media.platformKey}`);
  return media.platformName || t('platform_other');
}

function platformMark(media) {
  return platformMarks[media.platformKey] || '▶';
}

function showMode(mode) {
  state.currentMode = mode;
  if (!state.currentMedia) return;
  renderCurrentResult();
  announce(mode === 'video' ? t('availableVideo') : t('availableAudio'));
}

function renderCurrentResult() {
  if (!state.currentMedia) return;
  resultContainer.replaceChildren(buildResultCard(state.currentMedia));
  resultContainer.hidden = false;
  resultsShell.hidden = false;
  resultsShell.setAttribute('aria-busy', 'false');
  refreshCardGlows();
}

function buildResultCard(media) {
  const card = makeElement('article', 'result-card glass-card');
  card.setAttribute('aria-label', `${t('modeHeading')}: ${media.title}`);

  const summary = makeElement('div', 'result-summary');
  const thumbnail = makeElement('div', 'thumbnail-wrap');
  const placeholder = makeElement('span', 'thumbnail-placeholder');
  placeholder.append(makeSvg('play'));
  thumbnail.append(placeholder);
  if (media.thumbnail) {
    const image = document.createElement('img');
    image.className = 'media-thumbnail';
    image.src = media.thumbnail;
    image.alt = '';
    image.loading = 'lazy';
    image.referrerPolicy = 'no-referrer';
    image.addEventListener('error', () => image.remove(), { once: true });
    thumbnail.append(image);
  }
  const duration = makeElement('span', 'duration-chip', durationLabel(media.duration));
  thumbnail.append(duration);

  const info = makeElement('div', 'media-info');
  const source = makeElement('span', 'source-chip');
  const mark = makeElement('span', 'platform-mark', platformMark(media));
  mark.setAttribute('aria-hidden', 'true');
  const sourceLabel = makeElement('span', '', platformName(media));
  source.append(mark, sourceLabel);
  const title = makeElement('h2', 'media-title', media.title);
  const uploader = makeElement('div', 'media-uploader');
  uploader.append(makeSvg('user'), makeElement('span', '', media.uploader || t('unknownCreator')));
  info.append(source, title, uploader);
  summary.append(thumbnail, info);

  const modeRow = makeElement('div', 'mode-row');
  const modeCopy = makeElement('div', 'mode-copy');
  const modeTitle = makeElement('span', 'mode-title', t('modeHeading'));
  const modeDescription = makeElement('span', 'mode-description', t(state.currentMode === 'video' ? 'modeVideoDescription' : 'modeAudioDescription'));
  modeCopy.append(modeTitle, modeDescription);
  const modeSwitch = document.createElement('button');
  modeSwitch.className = 'media-toggle';
  modeSwitch.type = 'button';
  modeSwitch.setAttribute('role', 'switch');
  modeSwitch.setAttribute('aria-checked', String(state.currentMode === 'audio'));
  modeSwitch.setAttribute('aria-label', t(state.currentMode === 'video' ? 'switchToAudio' : 'switchToVideo'));
  const thumb = makeElement('span', 'toggle-thumb');
  thumb.setAttribute('aria-hidden', 'true');
  const videoLabel = makeElement('span', 'media-toggle-label media-toggle-label--video', t('video'));
  const audioLabel = makeElement('span', 'media-toggle-label media-toggle-label--audio', t('audio'));
  videoLabel.setAttribute('aria-hidden', 'true');
  audioLabel.setAttribute('aria-hidden', 'true');
  modeSwitch.append(thumb, videoLabel, audioLabel);
  modeSwitch.addEventListener('click', () => showMode(state.currentMode === 'video' ? 'audio' : 'video'));
  modeRow.append(modeCopy, modeSwitch);

  const heading = makeElement('div', 'download-heading');
  const headingCopy = makeElement('div');
  const formats = state.currentMode === 'video' ? media.videoFormats : media.audioFormats;
  const titleText = t(state.currentMode === 'video' ? 'availableVideo' : 'availableAudio');
  headingCopy.append(
    makeElement('h3', '', titleText),
    makeElement('p', '', t(state.currentMode === 'video' ? 'chooseVideo' : 'chooseAudio')),
  );
  const count = makeElement('span', 'format-count', `${localNumber(formats.length)} ${t(formats.length === 1 ? 'option' : 'options')}`);
  heading.append(headingCopy, count);

  const list = makeElement('div', 'download-list');
  list.setAttribute('aria-label', titleText);
  if (formats.length) {
    formats.forEach((option, index) => {
      list.append(state.currentMode === 'video' ? buildVideoRow(option, index) : buildAudioRow(option, index));
    });
  } else {
    list.append(makeElement('div', 'empty-formats', t(state.currentMode === 'video' ? 'noVideoFormats' : 'noAudioFormats')));
  }
  if (!media.videoFormats.length && !media.audioFormats.length) {
    list.replaceChildren(makeElement('div', 'empty-formats', t('noFormats')));
  }

  card.append(summary, modeRow, heading, list);
  return card;
}

function getDownloadId(type, option) {
  const quality = type === 'video' ? option.height : (option.quality ?? option.bitrate ?? 'default');
  return `${state.resultSerial}-${type}-${option.format}-${quality}`;
}

function buildVideoRow(option, index) {
  const row = makeElement('div', 'download-row');
  row.style.setProperty('--row-index', String(index));
  const info = makeElement('div', 'download-info');
  const primary = makeElement('div', 'download-primary');
  primary.append(makeElement('span', 'quality-label', `${localNumber(option.height)}p`));
  primary.append(makeElement('span', 'quality-subtitle', qualityTier(Number(option.height))));
  const details = makeElement('div', 'download-details');
  details.append(makeElement('span', 'format-pill', String(option.format).toUpperCase()));
  details.append(makeElement('span', 'detail-dot'));
  details.append(makeElement('span', '', formatBytes(option.sizeBytes)));
  info.append(primary, details);
  const button = buildDownloadButton('video', option);
  row.append(info, button);
  return row;
}

function buildAudioRow(option, index) {
  const row = makeElement('div', 'download-row');
  row.style.setProperty('--row-index', String(index));
  const info = makeElement('div', 'download-info');
  const primary = makeElement('div', 'download-primary');
  const format = String(option.format || '').toUpperCase();
  primary.append(makeElement('span', 'quality-label', format));
  let bitrate = Number(option.bitrate);
  if (!bitrate && format === 'M4A') bitrate = 192;
  if (!bitrate && format === 'WAV') bitrate = 1411;
  const qualityText = format === 'WAV'
    ? `${t('pcmQuality')} · ${localNumber(bitrate)} ${t('kbps')}`
    : format === 'M4A'
      ? `${t('aacQuality')} · ${localNumber(bitrate)} ${t('kbps')}`
      : `${localNumber(bitrate || 0)} ${t('kbps')}`;
  primary.append(makeElement('span', 'quality-subtitle', qualityText));
  const details = makeElement('div', 'download-details');
  details.append(makeElement('span', 'format-pill', format));
  details.append(makeElement('span', 'detail-dot'));
  details.append(makeElement('span', '', formatBytes(option.sizeBytes)));
  info.append(primary, details);
  const button = buildDownloadButton('audio', option);
  row.append(info, button);
  return row;
}

function currentButtonLabel(type, option) {
  if (type === 'video') return `${localNumber(option.height)}p ${String(option.format).toUpperCase()}`;
  const suffix = option.format === 'mp3' ? ` ${localNumber(option.quality || option.bitrate)} ${t('kbps')}` : '';
  return `${String(option.format).toUpperCase()}${suffix}`;
}

function buildDownloadButton(type, option) {
  const id = getDownloadId(type, option);
  const button = document.createElement('button');
  button.className = 'download-button';
  button.type = 'button';
  button.dataset.downloadId = id;
  button.setAttribute('aria-label', `${t('download')} ${currentButtonLabel(type, option)}`);
  const icon = makeElement('span', 'download-icon');
  const ring = makeElement('span', 'download-progress-ring');
  ring.setAttribute('aria-hidden', 'true');
  const label = makeElement('span', 'download-label');
  button.append(icon, ring, label);
  button.addEventListener('click', () => startDownload(button, id, type, option));
  updateDownloadButton(button, downloadStateFor(id), type, option);
  return button;
}

function downloadStateFor(id) {
  return state.downloadStates.get(id) || { state: 'idle', progress: 0, indeterminate: false };
}

function updateDownloadButton(button, current, type, option) {
  const stateName = current.state || 'idle';
  button.dataset.state = stateName;
  button.dataset.indeterminate = String(Boolean(current.indeterminate));
  button.disabled = stateName === 'preparing' || stateName === 'downloading';
  const icon = button.querySelector('.download-icon');
  const label = button.querySelector('.download-label');
  setDownloadIcon(icon, stateName === 'done');
  const name = currentButtonLabel(type, option);
  if (stateName === 'preparing') {
    label.textContent = t('preparing');
    button.setAttribute('aria-label', `${t('preparing')} ${name}`);
  } else if (stateName === 'downloading') {
    const percent = Number.isFinite(current.progress) ? current.progress : 0;
    label.textContent = current.indeterminate ? t('downloading') : `${Math.round(percent)}%`;
    button.setAttribute('aria-label', current.indeterminate ? t('downloading') : `${t('downloading')} ${Math.round(percent)}%`);
    button.querySelector('.download-progress-ring').style.setProperty('--progress', `${Math.min(100, percent)}%`);
  } else if (stateName === 'done') {
    label.textContent = t('downloadDone');
    button.setAttribute('aria-label', `${t('downloadDone')} ${name}`);
  } else {
    label.textContent = t('download');
    button.setAttribute('aria-label', `${t('download')} ${name}`);
    button.querySelector('.download-progress-ring').style.setProperty('--progress', '0%');
  }
}

function setDownloadState(id, next) {
  state.downloadStates.set(id, next);
  const type = id.includes('-audio-') ? 'audio' : 'video';
  const button = [...resultContainer.querySelectorAll('.download-button')].find((item) => item.dataset.downloadId === id);
  if (!button) return;
  const option = type === 'video'
    ? state.currentMedia?.videoFormats.find((item) => getDownloadId('video', item) === id)
    : state.currentMedia?.audioFormats.find((item) => getDownloadId('audio', item) === id);
  if (option) updateDownloadButton(button, next, type, option);
}

function clientFilename(title, extension) {
  const base = String(title || 'vax-download')
    .replace(/[\\/:*?"<>|\u0000-\u001f\u007f-\u009f]/g, ' ')
    .replace(/[. ]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120) || 'vax-download';
  return `${base}.${extension}`;
}

const mimeByFormat = { mp4: 'video/mp4', webm: 'video/webm', mp3: 'audio/mpeg', wav: 'audio/wav', m4a: 'audio/mp4' };

async function chooseSaveTarget(filename, extension) {
  if (typeof window.showSaveFilePicker !== 'function' || !window.isSecureContext) return null;
  try {
    const mime = mimeByFormat[extension] || 'application/octet-stream';
    return await window.showSaveFilePicker({
      suggestedName: filename,
      types: [{ description: t('mediaFile'), accept: { [mime]: [`.${extension}`] } }],
    });
  } catch (error) {
    if (error?.name === 'AbortError') throw error;
    // Browsers may expose the API without permitting this file type; fall back to a Blob download.
    return null;
  }
}

async function readResponse(response, saveTarget, filename, mime, id, type, option, signal) {
  const total = Number(response.headers.get('content-length')) || 0;
  const reader = response.body?.getReader();
  if (!reader) throw new Error('download_failed');
  let writer = null;
  const chunks = [];
  let received = 0;
  if (saveTarget) writer = await saveTarget.createWritable();
  try {
    while (true) {
      if (signal.aborted) throw new DOMException('The download was cancelled.', 'AbortError');
      const { done, value } = await reader.read();
      if (done) break;
      received += value.byteLength;
      if (writer) await writer.write(value);
      else chunks.push(value);
      const progress = total > 0 ? Math.min(100, (received / total) * 100) : 0;
      setDownloadState(id, { state: 'downloading', progress, indeterminate: total <= 0 });
    }
    if (writer) {
      await writer.close();
    } else {
      const blob = new Blob(chunks, { type: mime });
      const objectUrl = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = objectUrl;
      anchor.download = filename;
      anchor.hidden = true;
      document.body.append(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
    }
  } catch (error) {
    if (writer) await writer.abort().catch(() => {});
    throw error;
  } finally {
    reader.releaseLock();
  }
}

async function startDownload(button, id, type, option) {
  if (button.disabled) return;
  clearResultMessage();
  const runSerial = state.resultSerial;
  const requestedUrl = state.currentUrl;
  const title = state.currentMedia?.title;
  const extension = String(option.format).toLowerCase();
  const filename = clientFilename(title, extension);
  setDownloadState(id, { state: 'preparing', progress: 0, indeterminate: true });
  const controller = new AbortController();
  let timeout;
  try {
    // Request a user-selected save location before starting network work when supported.
    const saveTarget = await chooseSaveTarget(filename, extension);
    setDownloadState(id, { state: 'preparing', progress: 0, indeterminate: true });
    const url = new URL(apiUrl('download'));
    url.searchParams.set('url', requestedUrl);
    url.searchParams.set('type', type);
    url.searchParams.set('format', extension);
    url.searchParams.set('quality', String(type === 'video' ? option.height : (option.quality ?? (option.format === 'mp3' ? option.bitrate : ''))));
    timeout = window.setTimeout(() => controller.abort(), 15 * 60 * 1000);
    const response = await fetch(url, { method: 'GET', headers: { accept: 'application/octet-stream, application/json' }, signal: controller.signal });
    if (!response.ok) throw new Error(await parseApiError(response));

    setDownloadState(id, { state: 'downloading', progress: 0, indeterminate: !response.headers.get('content-length') });
    await readResponse(response, saveTarget, filename, mimeByFormat[extension] || 'application/octet-stream', id, type, option, controller.signal);
    setDownloadState(id, { state: 'done', progress: 100, indeterminate: false });
    announce(t('doneAnnouncement'));
    window.setTimeout(() => {
      if (downloadStateFor(id).state === 'done') {
        setDownloadState(id, { state: 'idle', progress: 0, indeterminate: false });
        state.downloadStates.delete(id);
      }
    }, 4_000);
  } catch (error) {
    if (error?.name === 'AbortError' && !controller.signal.aborted) {
      setDownloadState(id, { state: 'idle', progress: 0, indeterminate: false });
      return;
    }
    const code = error.name === 'AbortError' ? 'network_error' : (error.message || 'download_failed');
    setDownloadState(id, { state: 'idle', progress: 0, indeterminate: false });
    const messageKey = apiErrorKey(code);
    const message = t(messageKey);
    if (runSerial === state.resultSerial) showResultMessage(messageKey);
    announce(message);
  } finally {
    if (timeout) window.clearTimeout(timeout);
  }
}

function prefersReducedMotion() {
  return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
}

function switchLanguageSmoothly(language) {
  const update = () => setLanguage(language, true);
  if (typeof document.startViewTransition === 'function' && !prefersReducedMotion()) {
    try {
      document.startViewTransition(update);
      return;
    } catch {
      // Older or embedded browsers can reject a view transition; use the CSS fallback.
    }
  }
  html.classList.add('language-switching');
  update();
  window.setTimeout(() => html.classList.remove('language-switching'), 380);
}

function initLanguageSwitch() {
  document.querySelectorAll('.language-option').forEach((button) => {
    button.addEventListener('click', () => {
      const nextLanguage = button.dataset.language;
      if (nextLanguage === state.language) return;
      switchLanguageSmoothly(nextLanguage);
    });
  });
}

themeToggle.addEventListener('click', () => applyTheme(state.theme === 'dark' ? 'light' : 'dark', true));

document.getElementById('paste-button').addEventListener('click', async () => {
  clearFormMessage();
  try {
    if (!navigator.clipboard?.readText) throw new Error('clipboard_unavailable');
    const text = await navigator.clipboard.readText();
    if (!text.trim()) {
      input.focus();
      return;
    }
    input.value = text.trim();
    input.focus();
    input.dispatchEvent(new Event('input', { bubbles: true }));
  } catch {
    showFormMessage('clipboardUnavailable', 'info');
    input.focus();
  }
});

function randomizeOrbs() {
  document.querySelectorAll('.orb').forEach((orb) => {
    const x = (Math.random() * 14 - 7).toFixed(1);
    const y = (Math.random() * 14 - 7).toFixed(1);
    orb.style.setProperty('--start-x', `${x}vw`);
    orb.style.setProperty('--start-y', `${y}vh`);
  });
}

function refreshCardGlows() {
  const orbs = [...document.querySelectorAll('.orb')];
  const cards = [...document.querySelectorAll('.glass-card')];
  if (!orbs.length || !cards.length) return;
  const orbPositions = orbs.map((orb) => {
    const rect = orb.getBoundingClientRect();
    return {
      x: rect.left + rect.width / 2,
      y: rect.top + rect.height / 2,
      glow: orb.dataset.glow || 'rgba(139, 92, 246, .16)',
    };
  });
  cards.forEach((card) => {
    const rect = card.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    let nearest = orbPositions[0];
    let distance = Number.POSITIVE_INFINITY;
    for (const orb of orbPositions) {
      const candidateDistance = ((orb.x - centerX) ** 2) + ((orb.y - centerY) ** 2);
      if (candidateDistance < distance) {
        distance = candidateDistance;
        nearest = orb;
      }
    }
    card.style.setProperty('--nearest-glow', nearest.glow);
    card.style.setProperty('--glow-x', `${Math.max(0, Math.min(100, ((nearest.x - rect.left) / Math.max(rect.width, 1)) * 100))}%`);
    card.style.setProperty('--glow-y', `${Math.max(0, Math.min(100, ((nearest.y - rect.top) / Math.max(rect.height, 1)) * 100))}%`);
  });
}

function initAmbientEffects() {
  randomizeOrbs();
  refreshCardGlows();
  let glowFrame = 0;
  const refresh = () => {
    if (glowFrame) cancelAnimationFrame(glowFrame);
    glowFrame = requestAnimationFrame(refreshCardGlows);
  };
  window.addEventListener('resize', refresh, { passive: true });
  window.addEventListener('scroll', refresh, { passive: true });
  window.setInterval(refreshCardGlows, 1_500);
}

initPreferences();
initLanguageSwitch();
initAmbientEffects();
