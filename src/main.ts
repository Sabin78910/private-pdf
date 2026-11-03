import './style.css';
import { h, clear } from './ui/dom';
import { initLang, lang, setLang, t, type Key } from './i18n';
import { history, isNative } from './platform/files';
import { formatBytes } from './core/history';
import { initials } from './core/auth';
import { currentAccount, signIn, signInEnabled, signOut } from './platform/auth';
import { mergeTool } from './tools/merge';
import { splitTool } from './tools/split';
import { compressTool } from './tools/compress';
import { scanTool } from './tools/scan';
import { ocrTool } from './tools/ocr';
import { organizeTool } from './tools/organize';
import { signTool } from './tools/sign';
import { toImageTool } from './tools/toimage';
import { pageNumbersTool } from './tools/pagenumbers';
import { watermarkTool } from './tools/watermark';
import { protectTool } from './tools/protect';
import { libraryView } from './ui/libraryView';
import { icon, type IconName } from './ui/icons';
import { otherTheme, resolveTheme, TOOL_GROUPS, type Theme } from './core/theme';

const TOOLS: { id: string; icon: IconName; render: (root: HTMLElement) => void }[] = [
  { id: 'compress', icon: 'compress', render: compressTool },
  { id: 'merge', icon: 'merge', render: mergeTool },
  { id: 'split', icon: 'split', render: splitTool },
  { id: 'scan', icon: 'scan', render: scanTool },
  { id: 'ocr', icon: 'ocr', render: ocrTool },
  { id: 'organize', icon: 'organize', render: organizeTool },
  { id: 'sign', icon: 'sign', render: signTool },
  { id: 'toimage', icon: 'toimage', render: toImageTool },
  { id: 'numbers', icon: 'numbers', render: pageNumbersTool },
  { id: 'watermark', icon: 'watermark', render: watermarkTool },
  { id: 'protect', icon: 'protect', render: protectTool },
];

const app = document.getElementById('app')!;

let theme: Theme = 'dark';
function applyTheme(next: Theme) {
  theme = next;
  document.documentElement.dataset.theme = next;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', next === 'dark' ? '#0a0f1e' : '#f4f6fb');
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

const NAV: { href: string; key: Key; icon: IconName }[] = [
  { href: '#/', key: 'tools', icon: 'home' },
  { href: '#/library', key: 'library', icon: 'library' },
  { href: '#/history', key: 'history', icon: 'history' },
  { href: '#/privacy', key: 'privacy', icon: 'shield' },
];
const isCurrent = (href: string, id: string) => (href === '#/' ? id === '' : href === `#/${id}`);

function header(id: string) {
  const themeLabel = t(theme === 'dark' ? 'theme.light' : 'theme.dark');
  return h('header', { class: 'top' },
    h('a', { href: '#/', class: 'brand' }, h('span', { class: 'mark' }, icon('logo', 20)), t('appName')),
    h('nav', { class: 'links' },
      NAV.map((n) => h('a', { href: n.href, class: 'tab', 'aria-current': isCurrent(n.href, id) ? 'page' : null }, t(n.key))),
      signInEnabled() ? accountLink() : null,
      h('button', { class: 'icon-btn', 'aria-label': themeLabel, title: themeLabel, onclick: () => (applyTheme(otherTheme(theme)), route()) },
        icon(theme === 'dark' ? 'sun' : 'moon', 20)),
      h('button', { class: 'btn small', lang: lang() === 'en' ? 'ne' : 'en', onclick: () => (setLang(lang() === 'en' ? 'ne' : 'en'), route()) }, t('language'))));
}

function tabbar(id: string) {
  return h('nav', { class: 'tabbar', 'aria-label': t('tools') },
    NAV.map((n) => h('a', { href: n.href, 'aria-current': isCurrent(n.href, id) ? 'page' : null }, icon(n.icon, 22), t(n.key))));
}

function deviceBadge() {
  return h('p', { class: 'badge' }, h('span', { class: 'dot', 'aria-hidden': 'true' }), t('privacyBadge'));
}

function accountLink() {
  const a = currentAccount();
  return a
    ? h('a', { href: '#/account', class: 'avatar', title: a.email, 'aria-label': t('signedInAs', { name: a.name }) }, initials(a))
    : h('a', { href: '#/account' }, t('signIn'));
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
      .then(() => ((location.hash = '#/'), route()))
      .catch(() => ((status.textContent = t('signInFailed')), (start.disabled = false)));
  } }, 'G  ', t('signIn'));
  host.append(start);
  return h('main', { class: 'prose' },
    h('h2', {}, t('account')),
    h('p', {}, t('signInWhy')),
    h('p', { class: 'muted' }, t('signInData')),
    host, status);
}

function toolCard(id: string) {
  const tool = TOOLS.find((x) => x.id === id)!;
  return h('li', {}, h('a', { class: 'tile', href: `#/${tool.id}` },
    h('span', { class: 'ico' }, icon(tool.icon)),
    h('span', {}, h('strong', {}, t(`tool.${tool.id}` as Key)), h('span', { class: 'muted small' }, t(`tool.${tool.id}.desc` as Key))),
    h('span', { class: 'go' }, icon('chevron', 18))));
}

function home() {
  return h('main', {},
    h('section', { class: 'hero' },
      h('h1', {}, t('heroTitle')),
      h('p', {}, t('heroBody')),
      h('ul', { class: 'facts' },
        h('li', {}, icon('device', 16), t('fact.device')),
        h('li', {}, icon('wifiOff', 16), t('fact.offline')),
        h('li', {}, icon('lock', 16), t('fact.noAccount')))),
    TOOL_GROUPS.map((g) => h('section', { class: 'group' },
      h('h2', {}, t(`group.${g.id}` as Key)),
      h('ul', { class: 'grid' }, g.tools.filter((id) => TOOLS.some((x) => x.id === id)).map(toolCard)))),
    h('p', { class: 'foot' }, icon('shield', 16), t('footNote')));
}

function historyView() {
  const items = history.list();
  const list = h('ul', { class: 'list' },
    items.map((e) => h('li', { class: 'chip' },
      h('span', { class: 'grow' }, h('strong', {}, t(`tool.${e.tool}` as Key)), ' · ', e.output, ' ', h('span', { class: 'muted' }, formatBytes(e.outputSize))),
      h('time', { class: 'muted small', datetime: new Date(e.at).toISOString() }, new Date(e.at).toLocaleString(lang() === 'ne' ? 'ne-NP' : 'en-GB')))));
  return h('main', {},
    h('h2', {}, t('history')),
    h('p', { class: 'muted' }, t(isNative() ? 'historyNoteApp' : 'historyNoteWeb')),
    items.length ? list : h('div', { class: 'empty' }, h('span', { class: 'ico' }, icon('history', 28)), h('p', {}, t(isNative() ? 'historyEmptyApp' : 'historyEmptyWeb'))),
    items.length ? h('button', { class: 'btn', onclick: () => (history.clear(), route()) }, t('clearHistory')) : null);
}

function privacyView() {
  const main = h('main', { class: 'prose' });
  main.innerHTML = lang() === 'ne' ? PRIVACY_NE : PRIVACY_EN;
  return main;
}

function route() {
  const id = location.hash.replace(/^#\/?/, '');
  const tool = TOOLS.find((x) => x.id === id);
  document.title = tool ? `${t(`tool.${tool.id}` as Key)} · ${t('appName')}` : t('appName');
  let main: HTMLElement;
  if (tool) {
    const body = h('section', { class: 'tool' });
    main = h('main', {}, h('a', { href: '#/', class: 'back' }, icon('back', 18), t('home')),
      h('div', { class: 'toolhead' }, h('span', { class: 'ico' }, icon(tool.icon)),
        h('div', {}, h('h2', {}, t(`tool.${tool.id}` as Key)), h('p', {}, t(`tool.${tool.id}.desc` as Key)))),
      deviceBadge(), body);
    tool.render(body);
  } else if (id === 'library') main = libraryView();
  else if (id === 'history') main = historyView();
  else if (id === 'privacy') main = privacyView();
  else if (id === 'account' && signInEnabled()) main = accountView();
  else main = home();
  clear(app, header(id), main, tabbar(id), h('div', { id: 'live', class: 'visually-hidden', 'aria-live': 'polite' }));
  const heading = main.querySelector<HTMLElement>('h1, h2');
  heading?.setAttribute('tabindex', '-1');
  heading?.focus();
}

const PRIVACY_EN = `
<h2>Privacy policy</h2>
<p><strong>Your documents never leave your device.</strong> Every tool in Private PDF (merge, split, compress,
scan, OCR, organize, fill &amp; sign, PDF to image) runs inside the app or your browser. We do not upload,
store, log or read the content of your files. There is no account, no ads and no analytics.</p>
<h3>What stays on your device</h3>
<ul>
<li>Your files and every result. Results are saved as new files; your original is never overwritten.</li>
<li>Job history: only the tool name, file names, sizes and time. On Android it is kept on the device;
on the web it is kept for the current browser session only. You can clear it at any time.</li>
<li>Your Library: files you choose to keep, with their folders and favorites, are stored in the app's private
storage on this device (browser storage on the web). Delete any of them at any time.</li>
<li>Your language and theme choice.</li>
</ul>
<h3>Network</h3>
<p>The app's security policy blocks connections to any other server, except Google's sign-in service when you choose to sign in. OCR language data for Nepali and
English is bundled with the app, so OCR works offline. On the web, the page itself is downloaded from our
host like any website; your documents are not sent with it.</p>
<h3>Permissions (Android)</h3>
<ul><li>Camera: only when you choose “Take photo” in the scanner or OCR.</li>
<li>Files: only the files you pick, and saving results to Documents/PrivatePDF.</li></ul>
<h3>Sharing</h3><p>Files leave your device only when you tap Share and choose an app yourself.</p>
<h3>Optional Google sign-in</h3><p>You never need an account. If you choose to sign in with Google, Google
shares your name and email with the app; they are stored only on your device so we can show who is signed in.
Signing in contacts Google only. Your documents are never uploaded, whether you are signed in or not. Sign out at
any time from the Account page.</p>
<h3>Future AI features</h3><p>Any feature that needs cloud processing will be off by default, clearly labelled,
and will ask for your explicit consent first.</p>`;

const PRIVACY_NE = `
<h2>गोपनीयता नीति</h2>
<p><strong>तपाईंका कागजात कहिल्यै तपाईंको उपकरणबाट बाहिर जाँदैनन्।</strong> प्राइभेट PDF का सबै उपकरण
(जोड्ने, छुट्याउने, सानो बनाउने, स्क्यान, OCR, पाना मिलाउने, भर्ने र हस्ताक्षर, PDF बाट फोटो) एप वा ब्राउजरभित्रै चल्छन्।
हामी तपाईंका फाइलको सामग्री अपलोड, भण्डारण, लग वा पढ्दैनौं। खाता, विज्ञापन वा एनालिटिक्स छैन।</p>
<h3>तपाईंको उपकरणमै रहने कुरा</h3>
<ul>
<li>तपाईंका फाइल र सबै नतिजा। नतिजा नयाँ फाइलमा बस्छ; मूल फाइल कहिल्यै बदलिँदैन।</li>
<li>कामको इतिहास: उपकरणको नाम, फाइलको नाम, आकार र समय मात्र। एन्ड्रोइडमा उपकरणमै रहन्छ; वेबमा हालको ब्राउजर सत्रसम्म मात्र। जुनसुकै बेला मेटाउन सकिन्छ।</li>
<li>तपाईंको लाइब्रेरी: तपाईंले राख्न रोजेका फाइल, फोल्डर र मनपर्ने सूची यही उपकरणको एपभित्रको निजी भण्डारमा (वेबमा ब्राउजर भण्डारमा) रहन्छन्। जुनसुकै बेला मेटाउन सकिन्छ।</li>
<li>तपाईंले रोजेको भाषा र थिम।</li>
</ul>
<h3>नेटवर्क</h3>
<p>एपको सुरक्षा नीतिले अरू कुनै सर्भरसँग जडान रोक्छ। नेपाली र अंग्रेजी OCR डाटा एपसँगै आउँछ, त्यसैले OCR अफलाइन चल्छ।</p>
<h3>अनुमति (एन्ड्रोइड)</h3>
<ul><li>क्यामेरा: स्क्यानर वा OCR मा “फोटो खिच्नुहोस्” रोज्दा मात्र।</li>
<li>फाइल: तपाईंले छानेका फाइल मात्र, र नतिजा Documents/PrivatePDF मा सेभ गर्न।</li></ul>
<h3>सेयर</h3><p>तपाईंले सेयर थिचेर आफैं एप रोज्दा मात्र फाइल बाहिर जान्छ।</p>
<h3>ऐच्छिक Google साइन इन</h3><p>खाता कहिल्यै अनिवार्य छैन। Google बाट साइन इन गर्नुभयो भने Google ले तपाईंको नाम र इमेल एपलाई दिन्छ;
ती तपाईंको उपकरणमा मात्र राखिन्छन्। साइन इनले Google सँग मात्र सम्पर्क गर्छ। साइन इन गरे पनि नगरे पनि तपाईंका कागजात कहिल्यै
अपलोड हुँदैनन्। खाता पानाबाट जुनसुकै बेला साइन आउट गर्न सकिन्छ।</p>
<h3>भविष्यका AI सुविधा</h3><p>क्लाउड चाहिने कुनै पनि सुविधा सुरुमा बन्द रहनेछ, स्पष्ट लेखिनेछ र तपाईंको स्पष्ट सहमति माग्नेछ।</p>`;

initLang();
initTheme();
window.addEventListener('hashchange', route);
route();
