import '@fontsource-variable/inter';
import '@fontsource/noto-sans-devanagari/devanagari-400.css';
import '@fontsource/noto-sans-devanagari/devanagari-600.css';
import '@fontsource/noto-sans-devanagari/devanagari-700.css';
import './style.css';
import { h, clear } from './ui/dom';
import { initLang, lang, setLang, t, type Key } from './i18n';
import { history, isNative } from './platform/files';
import { formatBytes } from './core/history';
import { PRIVACY_EN, PRIVACY_NE } from './ui/privacyText';
import { listItems, libraryAvailable } from './platform/libraryStore';
import { viewItems, matchesQuery, type LibraryItem } from './core/library';
import { initials } from './core/auth';
import { currentAccount, signIn, signInEnabled, signOut } from './platform/auth';
import { docThumb, libraryView } from './ui/libraryView';
import { icon, type IconName } from './ui/icons';
import { parseUsage, rankTools, recordUse, USAGE_KEY } from './core/frecency';
import { greeting, matchTool, QUICK_TOOLS, resolveTheme, TOOL_GROUPS, toolHue, type Theme } from './core/theme';
import { allKeys } from './i18n';
import welcomeArt from './assets/welcome.webp';
import { activityStats } from './core/feel';
import { feedbackOn, setFeedback } from './ui/celebrate';

type Render = (root: HTMLElement) => void;
// Each tool is its own chunk, so pdf-lib, pdf.js and OCR load only when a tool opens. The home screen starts fast.
const TOOLS: { id: string; icon: IconName; load: () => Promise<Render> }[] = [
  { id: 'compress', icon: 'compress', load: () => import('./tools/compress').then((m) => m.compressTool) },
  { id: 'merge', icon: 'merge', load: () => import('./tools/merge').then((m) => m.mergeTool) },
  { id: 'split', icon: 'split', load: () => import('./tools/split').then((m) => m.splitTool) },
  { id: 'scan', icon: 'scan', load: () => import('./tools/scan').then((m) => m.scanTool) },
  { id: 'idcard', icon: 'idcard', load: () => import('./tools/idcard').then((m) => m.idCardTool) },
  { id: 'ocr', icon: 'ocr', load: () => import('./tools/ocr').then((m) => m.ocrTool) },
  { id: 'qr', icon: 'qr', load: () => import('./tools/qr').then((m) => m.qrTool) },
  { id: 'organize', icon: 'organize', load: () => import('./tools/organize').then((m) => m.organizeTool) },
  { id: 'sign', icon: 'sign', load: () => import('./tools/sign').then((m) => m.signTool) },
  { id: 'toimage', icon: 'toimage', load: () => import('./tools/toimage').then((m) => m.toImageTool) },
  { id: 'toword', icon: 'toword', load: () => import('./tools/toword').then((m) => m.toWordTool) },
  { id: 'numbers', icon: 'numbers', load: () => import('./tools/pagenumbers').then((m) => m.pageNumbersTool) },
  { id: 'watermark', icon: 'watermark', load: () => import('./tools/watermark').then((m) => m.watermarkTool) },
  { id: 'crop', icon: 'crop', load: () => import('./tools/crop').then((m) => m.cropTool) },
  { id: 'flatten', icon: 'flatten', load: () => import('./tools/crop').then((m) => m.flattenTool) },
  { id: 'redact', icon: 'redact', load: () => import('./tools/redact').then((m) => m.redactTool) },
  { id: 'protect', icon: 'protect', load: () => import('./tools/protect').then((m) => m.protectTool) },
  { id: 'reader', icon: 'reader', load: () => import('./tools/reader').then((m) => m.readerTool) },
];

const app = document.getElementById('app')!;
const VERSION = '1.2.0';

let theme: Theme = 'dark';
function applyTheme(next: Theme) {
  theme = next;
  document.documentElement.dataset.theme = next;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', next === 'dark' ? '#0b0f17' : '#f6f7f9');
  try {
    localStorage.setItem('pdfapp.theme', next);
  } catch {
    /* ignore */
  }
}
function initTheme() {
  let saved: string | null = null;
  try {
    saved = localStorage.getItem('pdfapp.theme');
  } catch {
    /* ignore */
  }
  applyTheme(resolveTheme(saved));
}

type Tab = '' | 'tools' | 'library' | 'settings';
const TABS: { id: Tab; key: Key; icon: IconName }[] = [
  { id: '', key: 'homeTab', icon: 'home' },
  { id: 'tools', key: 'tools', icon: 'organize' },
  { id: 'library', key: 'library', icon: 'library' },
  { id: 'settings', key: 'settings', icon: 'gear' },
];
let lastTab: Tab = '';

const toolName = (id: string) => t(`tool.${id}` as Key);

function appbar(opts: { title?: string; back?: boolean; brand?: boolean; fade?: boolean }) {
  const right = signInEnabled() ? accountLink() : null;
  return h('header', { class: 'appbar' },
    opts.back
      ? h('a', { class: 'icon-btn', href: `#/${lastTab}`, 'aria-label': t('back') }, icon('back', 22))
      : null,
    opts.brand
      ? h('a', { href: '#/', class: 'brand' }, h('span', { class: 'mark' }, icon('logo', 18)), t('appName'))
      : h('span', { class: `title${opts.fade ? ' fade' : ''}` }, opts.title ?? ''),
    opts.brand ? h('span', { class: 'grow' }) : null,
    right);
}

function tabbar(id: string) {
  return h('nav', { class: 'tabbar', 'aria-label': t('appName') }, h('div', { class: 'tabbar-in' },
    TABS.map((n) => h('a', { href: `#/${n.id}`, 'aria-current': n.id === id ? 'page' : null },
      h('span', { class: 'pill' }, icon(n.icon, 22)), t(n.key)))));
}

function accountLink() {
  const a = currentAccount();
  return a
    ? h('a', { href: '#/account', class: 'avatar', title: a.email, 'aria-label': t('signedInAs', { name: a.name }) }, initials(a))
    : null;
}

function accountView() {
  const a = currentAccount();
  const host = h('div', { class: 'gbtn' });
  const status = h('p', { role: 'status' });
  if (a) {
    return h('main', { class: 'prose' },
      h('h2', {}, t('account')),
      h('p', {}, h('strong', {}, a.name), h('br'), h('span', { class: 'muted' }, a.email)),
      h('p', { class: 'muted' }, t('signInData')),
      h('button', { class: 'btn', onclick: async () => (await signOut(), route()) }, t('signOut')));
  }
  const start = h('button', { class: 'btn primary', onclick: () => {
    start.disabled = true;
    signIn(host, lang())
      .then(() => ((location.hash = '#/settings'), route()))
      .catch(() => ((status.textContent = t('signInFailed')), (start.disabled = false)));
  } }, t('signIn'));
  host.append(start);
  return h('main', { class: 'prose' },
    h('h2', {}, t('account')),
    h('p', {}, t('signInWhy')),
    h('p', { class: 'muted' }, t('signInData')),
    host, status);
}

function toolTile(id: string) {
  const tool = TOOLS.find((x) => x.id === id);
  if (!tool) return null;
  return h('li', {}, h('a', { href: `#/${tool.id}` },
    h('span', { class: `chipico hue-${toolHue(id)}` }, icon(tool.icon, 26)),
    h('span', { class: 'lbl' }, toolName(id))));
}

const when = (ms: number) => new Date(ms).toLocaleDateString(lang() === 'ne' ? 'ne-NP' : 'en-GB', { day: 'numeric', month: 'short' });

function fileRow(it: LibraryItem) {
  const pdf = it.mime === 'application/pdf';
  return h('li', {}, h('a', { class: 'rowi', href: pdf ? `#/reader?lib=${encodeURIComponent(it.id)}` : '#/library' },
    docThumb(it),
    h('span', { class: 'grow' }, h('span', { class: 't' }, it.name), h('span', { class: 'm' }, `${formatBytes(it.size)} · ${when(it.openedAt)}`)),
    h('span', { class: 'end' }, icon('chevron', 18))));
}

const WELCOME_KEY = 'pdfapp.welcomed';

function readUsage() {
  try {
    return parseUsage(localStorage.getItem(USAGE_KEY));
  } catch {
    return {};
  }
}

/** Counts a tool screen being opened, on this device only, to order Quick tools. */
function noteToolUse(id: string) {
  try {
    localStorage.setItem(USAGE_KEY, JSON.stringify(recordUse(readUsage(), id, Date.now())));
  } catch {
    /* storage blocked: Quick tools keep the default order */
  }
}

/** First-launch card; hidden for good once dismissed. */
function welcomeCard() {
  try {
    if (localStorage.getItem(WELCOME_KEY) === '1') return null;
  } catch {
    /* storage blocked: show it, dismissing still hides it for this visit */
  }
  const card = h('section', { class: 'card welcome', 'aria-labelledby': 'welcomeTitle' },
    h('img', { class: 'art', src: welcomeArt, alt: '', width: 560, height: 431, decoding: 'async' }),
    h('h2', { id: 'welcomeTitle' }, t('welcome.title')),
    h('p', {}, t('welcome.body')),
    h('button', { class: 'btn primary', id: 'welcomeOk', onclick: () => {
      try {
        localStorage.setItem(WELCOME_KEY, '1');
      } catch {
        /* ignore */
      }
      card.remove();
      document.getElementById('homeSearch')?.focus();
    } }, t('welcome.ok')));
  return card;
}

/** Small, honest progress badges from local history. Hidden until there is something to show. */
function statsRow() {
  const { week, streak } = activityStats(history.list(), Date.now());
  if (!week && !streak) return null;
  return h('div', { class: 'stats', role: 'status' },
    week ? h('span', { class: 'stat' }, icon('check', 16), h('strong', {}, String(week)), t('stats.week')) : null,
    streak > 1 ? h('span', { class: 'stat' }, icon('star', 16), h('strong', {}, String(streak)), t('stats.streak')) : null);
}

function home() {
  const results = h('div');
  const sections = h('div');
  const recent = h('ul', { class: 'group' }, h('li', { class: 'empty-row' }, t('recentEmpty')));
  let items: LibraryItem[] = [];
  if (libraryAvailable())
    void listItems().then((all) => {
      items = all;
      const top = viewItems(all, { kind: 'recent' }).slice(0, 4);
      if (top.length) clear(recent, top.map(fileRow));
    }).catch(() => {});
  const search = h('input', { type: 'search', id: 'homeSearch', placeholder: t('searchAll'), 'aria-label': t('searchAll'), oninput: () => {
    const q = search.value.trim();
    sections.hidden = !!q;
    if (!q) return clear(results);
    const tools = TOOLS.filter((x) => matchTool([allKeys.en[`tool.${x.id}` as Key], allKeys.ne[`tool.${x.id}` as Key]], q));
    const files = items.filter((i) => matchesQuery(i.name, q)).slice(0, 8);
    clear(results,
      tools.length ? h('section', { class: 'section' }, h('div', { class: 'caption-label' }, t('tools')), h('ul', { class: 'tgrid' }, tools.map((x) => toolTile(x.id)))) : null,
      files.length ? h('section', { class: 'section' }, h('div', { class: 'caption-label' }, t('library')), h('ul', { class: 'group' }, files.map(fileRow))) : null,
      !tools.length && !files.length ? h('p', { class: 'empty-row' }, t('noResults', { q })) : null);
  } });
  clear(sections,
    h('div', { class: 'actions2' },
      h('a', { class: 'qa main', href: '#/scan' }, h('span', { class: 'qi' }, icon('scan', 24)),
        h('span', {}, h('strong', {}, t('qa.scan')), h('span', { class: 's' }, t('qa.scan.desc')))),
      h('a', { class: 'qa', href: '#/reader' }, h('span', { class: 'qi' }, icon('reader', 24)),
        h('span', {}, h('strong', {}, t('qa.open')), h('span', { class: 's' }, t('qa.open.desc'))))),
    h('section', { class: 'section' },
      h('div', { class: 'section-head' }, h('h2', {}, t('quickTools')), h('a', { href: '#/tools' }, t('allTools'))),
      h('ul', { class: 'tgrid' }, rankTools(QUICK_TOOLS, readUsage(), Date.now(), TOOLS.map((x) => x.id)).map(toolTile))),
    h('section', { class: 'section' },
      h('div', { class: 'section-head' }, h('h2', {}, t('recent')), h('a', { href: '#/library' }, t('seeAll'))),
      recent));
  return h('main', {},
    h('div', { class: 'largetitle' }, h('h1', {}, t(`greet.${greeting(new Date().getHours())}` as Key)),
      h('p', {}, icon('shield', 16), t('homeSub'))),
    welcomeCard(),
    statsRow(),
    h('label', { class: 'searchbox' }, icon('search', 20), search),
    sections, results,
    h('p', { class: 'trust' }, icon('lock', 16), t('aboutBody')));
}

function toolsView() {
  return h('main', {},
    h('div', { class: 'largetitle' }, h('h1', {}, t('tools')), h('p', {}, icon('shield', 16), t('privacyBadge'))),
    TOOL_GROUPS.map((g) => h('section', { class: 'section' },
      h('div', { class: 'section-head' }, h('h2', {}, t(`group.${g.id}` as Key))),
      h('ul', { class: 'tgrid' }, g.tools.map(toolTile)))));
}

function segmented<T extends string>(name: string, label: Key, options: [T, string][], value: T, onChange: (v: T) => void) {
  return h('div', { class: 'optgroup', role: 'radiogroup', 'aria-label': t(label) },
    h('div', { class: 'opts seg' }, options.map(([v, text]) => h('label', { class: 'opt' },
      h('input', { type: 'radio', name, value: v, checked: v === value, onchange: () => onChange(v) }),
      h('span', { class: 'o-t' }, text)))));
}

function settingsRow(href: string, ico: IconName, title: string, sub?: string) {
  return h('a', { class: 'rowi', href }, h('span', { class: 'setico' }, icon(ico, 20)),
    h('span', { class: 'grow' }, h('span', { class: 't' }, title), sub ? h('span', { class: 'm' }, sub) : null),
    h('span', { class: 'end' }, icon('chevron', 18)));
}

function settingsView() {
  const a = signInEnabled() ? currentAccount() : null;
  return h('main', {},
    h('div', { class: 'largetitle' }, h('h1', {}, t('settings'))),
    h('div', { class: 'caption-label' }, t('appearance')),
    segmented('theme', 'appearance', [['dark', t('theme.dark')], ['light', t('theme.light')]], theme, (v) => (applyTheme(v), route())),
    h('div', { class: 'caption-label', style: 'margin-top:24px' }, t('languageLabel')),
    segmented('lang', 'languageLabel', [['en', 'English'], ['ne', 'नेपाली']], lang(), (v) => (setLang(v), route())),
    h('div', { class: 'caption-label', style: 'margin-top:24px' }, t('feedback')),
    segmented('feedback', 'feedback', [['on', t('feedback.on')], ['off', t('feedback.off')]], feedbackOn() ? 'on' : 'off', (v) => (setFeedback(v === 'on'), route())),
    h('div', { class: 'caption-label', style: 'margin-top:24px' }, t('about')),
    h('div', { class: 'group' },
      signInEnabled() ? settingsRow('#/account', 'device', t('account'), a ? a.email : t('signIn')) : null,
      settingsRow('#/history', 'history', t('history')),
      settingsRow('#/privacy', 'shield', t('privacy'))),
    h('p', { class: 'trust' }, icon('lock', 16), h('span', {}, t('aboutBody'), h('br'), t('version', { v: VERSION }))));
}

function historyView() {
  const items = history.list();
  const list = h('ul', { class: 'list' },
    items.map((e) => h('li', { class: 'chip' },
      h('span', { class: 'grow' }, h('strong', {}, t(`tool.${e.tool}` as Key)), ' · ', e.output, ' ', h('span', { class: 'muted' }, formatBytes(e.outputSize))),
      h('time', { class: 'muted small', datetime: new Date(e.at).toISOString() }, when(e.at)))));
  return h('main', {},
    h('p', { class: 'screen-sub' }, t(isNative() ? 'historyNoteApp' : 'historyNoteWeb')),
    items.length ? list : h('div', { class: 'card empty-row' }, t(isNative() ? 'historyEmptyApp' : 'historyEmptyWeb')),
    items.length ? h('button', { class: 'btn ghost danger', style: 'margin-top:12px', onclick: () => (history.clear(), route()) }, t('clearHistory')) : null);
}

function privacyView() {
  const main = h('main', { class: 'prose' });
  main.innerHTML = lang() === 'ne' ? PRIVACY_NE : PRIVACY_EN;
  return main;
}

function route() {
  const id = location.hash.replace(/^#\/?/, '').split('?')[0];
  const tool = TOOLS.find((x) => x.id === id);
  const isTab = TABS.some((x) => x.id === id);
  if (isTab) lastTab = id as Tab;
  document.title = tool ? `${toolName(tool.id)} · ${t('appName')}` : t('appName');
  let main: HTMLElement;
  let bar: HTMLElement;
  if (tool) {
    const body = h('section', { class: 'tool' });
    main = h('main', {},
      h('h2', { class: 'screen-title' }, toolName(tool.id)),
      h('p', { class: 'screen-sub' }, t(`tool.${tool.id}.desc` as Key)),
      body);
    bar = appbar({ back: true, title: toolName(tool.id), fade: true });
    noteToolUse(tool.id);
    body.setAttribute('aria-busy', 'true');
    tool.load().then(
      (render) => {
        body.removeAttribute('aria-busy');
        if (body.isConnected) render(body);
      },
      () => {
        // Usually a stale chunk after an app update; a reload fetches the new one.
        body.removeAttribute('aria-busy');
        body.replaceChildren(h('p', { class: 'screen-sub' }, t('loadFailed')));
      },
    );
  } else if (id === 'library') (main = libraryView()), (bar = appbar({ brand: true }));
  else if (id === 'tools') (main = toolsView()), (bar = appbar({ brand: true }));
  else if (id === 'settings') (main = settingsView()), (bar = appbar({ brand: true }));
  else if (id === 'history') (main = historyView()), (bar = appbar({ back: true, title: t('history') }));
  else if (id === 'privacy') (main = privacyView()), (bar = appbar({ back: true, title: t('privacy') }));
  else if (id === 'account' && signInEnabled()) (main = accountView()), (bar = appbar({ back: true, title: t('account') }));
  else (main = home()), (bar = appbar({ brand: true }));
  clear(app, bar, main, tabbar(isTab ? id : lastTab), h('div', { id: 'live', class: 'visually-hidden', 'aria-live': 'polite' }));
  window.scrollTo(0, 0);
  const heading = main.querySelector<HTMLElement>('h1, h2');
  heading?.setAttribute('tabindex', '-1');
  heading?.focus({ preventScroll: true });
}

window.addEventListener('scroll', () => document.querySelector('.appbar')?.classList.toggle('scrolled', scrollY > 4), { passive: true });

initLang();
initTheme();
window.addEventListener('hashchange', route);
route();
