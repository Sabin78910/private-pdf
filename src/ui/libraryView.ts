import { h, clear, announce } from './dom';
import { icon } from './icons';
import { lang, t, type Key } from '../i18n';
import { filePicker, isPdfFile } from './common';
import { canShare, previewUrl, readFile, saveFile, shareFile } from '../platform/files';
import { formatBytes } from '../core/history';
import { checkFolderName, viewItems, type Folder, type LibraryItem, type LibraryView } from '../core/library';
import * as store from '../platform/libraryStore';
import emptyArt from '../assets/library-empty.webp';
import { openPdf, thumbnail } from '../platform/render';

// Page-1 previews for Library rows, rendered on the device one at a time as rows scroll into view.
const thumbCache = new Map<string, string>();
let thumbChain: Promise<void> = Promise.resolve();
let thumbObserver: IntersectionObserver | null = null;
const pendingThumbs = new WeakMap<Element, LibraryItem>();

async function drawThumb(it: LibraryItem, el: HTMLElement) {
  let url = thumbCache.get(it.id);
  if (!url) {
    const doc = await openPdf((await store.readItem(it, false)).bytes);
    try {
      url = (await thumbnail(doc, 0, 40)).toDataURL('image/jpeg', 0.75);
    } finally {
      void doc.destroy();
    }
    thumbCache.set(it.id, url);
  }
  el.replaceChildren(h('img', { src: url, alt: '' }));
  el.classList.add('has-img');
}

/** Document icon that swaps to a page-1 preview for PDFs (the icon stays if the file cannot render). */
export function docThumb(it: LibraryItem): HTMLElement {
  const pdf = it.mime === 'application/pdf';
  const el = h('span', { class: `thumb-doc${pdf ? '' : ' img'}`, 'aria-hidden': 'true' }, icon(pdf ? 'file' : 'toimage', 20));
  if (!pdf || typeof IntersectionObserver === 'undefined') return el;
  thumbObserver ??= new IntersectionObserver((entries) => {
    for (const en of entries) {
      const item = en.isIntersecting ? pendingThumbs.get(en.target) : undefined;
      if (!item) continue;
      thumbObserver!.unobserve(en.target);
      pendingThumbs.delete(en.target);
      const target = en.target as HTMLElement;
      thumbChain = thumbChain.then(() => drawThumb(item, target)).catch(() => {});
    }
  }, { rootMargin: '200px 0px' });
  pendingThumbs.set(el, it);
  thumbObserver.observe(el);
  return el;
}

let view: LibraryView = { kind: 'all' };
let query = '';

export function libraryView(): HTMLElement {
  const main = h('main', {});
  const list = h('div', { class: 'lib-list', 'aria-live': 'polite' });
  const chips = h('div', { class: 'chips', role: 'group', 'aria-label': t('library') });
  const folderBar = h('div');
  const search = h('input', {
    type: 'search', id: 'libSearch', value: query, placeholder: t('searchFiles'), 'aria-label': t('searchFiles'),
    oninput: () => ((query = search.value), void refresh()),
  });
  let items: LibraryItem[] = [];
  let folders: Folder[] = [];

  const chip = (label: string, v: LibraryView, ico?: Parameters<typeof icon>[0]) => {
    const on = JSON.stringify(v) === JSON.stringify(view);
    return h('button', { class: `chipbtn${on ? ' on' : ''}`, 'aria-pressed': on ? 'true' : 'false', onclick: () => ((view = v), void refresh()) },
      ico ? icon(ico, 16) : null, label);
  };

  /** Inline name form used for both new and renamed folders. */
  const nameForm = (initial: string, onSave: (name: string) => Promise<void>, ignoreId?: string) => {
    const input = h('input', { type: 'text', id: 'folderName', value: initial, maxlength: 60, 'aria-label': t('folderName'), placeholder: t('folderName') });
    const msg = h('p', { class: 'warn small', role: 'status' });
    const submit = async (e: Event) => {
      e.preventDefault();
      const bad = checkFolderName(input.value, folders, ignoreId);
      if (bad) return void (msg.textContent = t(`folder.${bad}` as Key));
      await onSave(input.value);
      clear(folderBar);
      await refresh();
    };
    clear(folderBar, h('form', { class: 'row wrap namer', onsubmit: submit }, input,
      h('button', { class: 'btn primary small', type: 'submit' }, t('save')),
      h('button', { class: 'btn ghost small', type: 'button', onclick: () => clear(folderBar) }, t('cancel')), msg));
    input.focus();
  };

  const sheetFor = (it: LibraryItem) => {
    const scrim = h('div', { class: 'scrim', onclick: () => close() });
    const close = () => (scrim.remove(), sheet.remove());
    const act = (ico: Parameters<typeof icon>[0], label: string, fn: () => unknown, cls = '') =>
      h('button', { class: `rowi plain ${cls}`, style: 'width:100%', onclick: async () => (close(), await fn()) },
        h('span', { class: 'setico' }, icon(ico, 20)), h('span', { class: 'grow t' }, label));
    const move = h('select', { 'aria-label': t('moveTo'), class: 'move-select',
      onchange: async () => (await store.updateItem({ ...it, folder: move.value || null }), close(), void refresh()) },
      h('option', { value: '', selected: !it.folder }, t('topLevel')),
      folders.map((f) => h('option', { value: f.id, selected: it.folder === f.id }, f.name)));
    const sheet = h('div', { class: 'sheet', role: 'dialog', 'aria-label': it.name },
      h('h3', {}, it.name),
      it.mime === 'application/pdf' ? act('reader', t('read'), () => (location.hash = `#/reader?lib=${encodeURIComponent(it.id)}`)) : null,
      act('eye', t('open'), async () => window.open(previewUrl(await store.readItem(it)), '_blank', 'noopener')),
      canShare() ? act('share', t('share'), async () => shareFile(await store.readItem(it)).catch(() => {})) : null,
      act('download', t('saveDevice'), async () => saveFile(await store.readItem(it, false))),
      h('label', { class: 'field', style: 'margin:8px 0' }, h('span', { class: 'lbl' }, t('moveTo')), move),
      act('trash', t('delete'), async () => {
        if (!confirm(t('deleteFileConfirm', { name: it.name }))) return;
        await store.removeItem(it.id);
        announce(t('delete'));
        await refresh();
      }, 'danger'));
    document.body.append(scrim, sheet);
    (sheet.querySelector('button') as HTMLElement | null)?.focus();
  };

  const row = (it: LibraryItem) => {
    const pdf = it.mime === 'application/pdf';
    const when = new Date(it.addedAt).toLocaleDateString(lang() === 'ne' ? 'ne-NP' : 'en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
    return h('li', { class: 'lib-item' },
      h('a', { class: 'open', href: pdf ? `#/reader?lib=${encodeURIComponent(it.id)}` : '#/library', onclick: (e: Event) => { if (!pdf) { e.preventDefault(); sheetFor(it); } } },
        docThumb(it),
        h('span', { class: 'grow' }, h('span', { class: 'name' }, it.name), h('span', { class: 'muted small' }, `${formatBytes(it.size)} · ${when}`))),
      h('button', { class: `icon-btn star${it.favorite ? ' on' : ''}`, 'aria-pressed': it.favorite ? 'true' : 'false', 'aria-label': `${t('favorite')}: ${it.name}`,
        onclick: async () => (await store.updateItem({ ...it, favorite: !it.favorite }), void refresh()) }, icon('star', 20)),
      h('button', { class: 'icon-btn more', 'aria-label': `${t('moreActions')}: ${it.name}`, onclick: () => sheetFor(it) }, icon('dots', 22)));
  };

  async function refresh() {
    try {
      [items, folders] = await Promise.all([store.listItems(), store.listFolders()]);
    } catch {
      clear(main, h('div', { class: 'largetitle' }, h('h1', {}, t('library'))), h('p', { class: 'warn' }, t('libUnavailable')));
      return;
    }
    if (view.kind === 'folder' && !folders.some((f) => view.kind === 'folder' && f.id === view.id)) view = { kind: 'all' };
    folders.sort((a, b) => a.name.localeCompare(b.name));
    clear(chips,
      chip(t('lib.all'), { kind: 'all' }),
      chip(t('lib.recent'), { kind: 'recent' }, 'history'),
      chip(t('lib.favorites'), { kind: 'favorites' }, 'star'),
      folders.map((f) => chip(f.name, { kind: 'folder', id: f.id }, 'folder')),
      h('button', { class: 'chipbtn add', onclick: () => nameForm('', async (n) => void (view = { kind: 'folder', id: (await store.addFolder(n)).id })) },
        icon('plus', 16), t('newFolder')));
    const current = view.kind === 'folder' ? folders.find((f) => view.kind === 'folder' && f.id === view.id) : undefined;
    const folderTools = current
      ? h('div', { class: 'row wrap folder-tools' },
          h('button', { class: 'btn small', onclick: () => nameForm(current.name, (n) => store.renameFolder(current, n), current.id) }, t('renameFolder')),
          h('button', { class: 'btn small ghost', onclick: async () => {
            if (!confirm(t('deleteFolderConfirm', { name: current.name }))) return;
            await store.removeFolder(current.id);
            view = { kind: 'all' };
            await refresh();
          } }, t('deleteFolder')))
      : null;
    const shown = viewItems(items, view, query);
    clear(list, folderTools,
      shown.length
        ? h('ul', { class: 'list' }, shown.map(row))
        : items.length
          ? h('div', { class: 'card empty-row' }, t('libNoMatch'))
          : h('div', { class: 'card empty-row empty-art' },
              h('img', { src: emptyArt, alt: '', width: 469, height: 439, decoding: 'async' }), h('p', {}, t('libEmpty'))));
  }

  const picker = filePicker({ accept: 'application/pdf,.pdf', multiple: true, label: 'addToLibrary', onFiles: async (fs) => {
    const folder = view.kind === 'folder' ? view.id : null;
    for (const f of fs.filter(isPdfFile)) await store.addFile({ name: f.name, bytes: await readFile(f), mime: 'application/pdf' }, 'import', folder);
    await refresh();
  } });

  clear(main,
    h('div', { class: 'largetitle' }, h('h1', {}, t('library')), h('p', {}, icon('shield', 16), t('libraryNote'))),
    h('div', { class: 'lib-tools' }, h('label', { class: 'searchbox' }, icon('search', 20), search), chips),
    folderBar, list, h('div', { class: 'lib-add' }, picker));
  void refresh();
  return main;
}

/** "Keep in Library" button for a result card. */
export function keepButton(file: { name: string; bytes: Uint8Array; mime: string }, source: string): HTMLElement | null {
  if (!store.libraryAvailable()) return null;
  const btn = h('button', { class: 'btn keep', onclick: async () => {
    btn.disabled = true;
    try {
      await store.addFile(file, source);
      clear(btn, icon('star', 16), t('kept'));
      announce(t('kept'));
    } catch {
      btn.disabled = false;
    }
  } }, icon('library', 16), t('keep'));
  return btn;
}
