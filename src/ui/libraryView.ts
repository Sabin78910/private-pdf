import { h, clear, announce } from './dom';
import { icon } from './icons';
import { lang, t, type Key } from '../i18n';
import { filePicker, isPdfFile } from './common';
import { canShare, previewUrl, readFile, saveFile, shareFile } from '../platform/files';
import { formatBytes } from '../core/history';
import { checkFolderName, viewItems, type Folder, type LibraryItem, type LibraryView } from '../core/library';
import * as store from '../platform/libraryStore';

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

  const row = (it: LibraryItem) => {
    const open = async () => {
      const f = await store.readItem(it);
      window.open(previewUrl(f), '_blank', 'noopener');
    };
    const move = h('select', { 'aria-label': `${t('moveTo')}: ${it.name}`, class: 'small-select',
      onchange: async () => (await store.updateItem({ ...it, folder: move.value || null }), void refresh()) },
      h('option', { value: '', selected: !it.folder }, t('topLevel')),
      folders.map((f) => h('option', { value: f.id, selected: it.folder === f.id }, f.name)));
    const when = new Date(it.addedAt).toLocaleDateString(lang() === 'ne' ? 'ne-NP' : 'en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
    return h('li', { class: 'lib-item' },
      h('span', { class: 'ico' }, icon('file')),
      h('div', { class: 'grow' }, h('strong', { class: 'name' }, it.name), h('div', { class: 'muted small' }, `${formatBytes(it.size)} · ${when}`)),
      h('div', { class: 'row wrap lib-actions' },
        h('button', { class: `icon-btn star${it.favorite ? ' on' : ''}`, 'aria-pressed': it.favorite ? 'true' : 'false', 'aria-label': `${t('favorite')}: ${it.name}`,
          onclick: async () => (await store.updateItem({ ...it, favorite: !it.favorite }), void refresh()) }, icon('star', 18)),
        h('button', { class: 'btn small', onclick: open }, t('open')),
        canShare() ? h('button', { class: 'btn small', onclick: async () => shareFile(await store.readItem(it)).catch(() => {}) }, t('share')) : null,
        h('button', { class: 'btn small', onclick: async () => saveFile(await store.readItem(it, false)) }, t('download')),
        move,
        h('button', { class: 'icon-btn', 'aria-label': `${t('delete')}: ${it.name}`, onclick: async () => {
          if (!confirm(t('deleteFileConfirm', { name: it.name }))) return;
          await store.removeItem(it.id);
          announce(t('delete'));
          await refresh();
        } }, icon('trash', 18))));
  };

  async function refresh() {
    try {
      [items, folders] = await Promise.all([store.listItems(), store.listFolders()]);
    } catch {
      clear(main, h('h2', {}, t('library')), h('p', { class: 'warn' }, t('libUnavailable')));
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
        : h('div', { class: 'empty' }, h('span', { class: 'ico' }, icon('library', 28)), h('p', {}, t(items.length ? 'libNoMatch' : 'libEmpty'))));
  }

  const picker = filePicker({ accept: 'application/pdf,.pdf', multiple: true, label: 'addToLibrary', onFiles: async (fs) => {
    const folder = view.kind === 'folder' ? view.id : null;
    for (const f of fs.filter(isPdfFile)) await store.addFile({ name: f.name, bytes: await readFile(f), mime: 'application/pdf' }, 'import', folder);
    await refresh();
  } });

  clear(main,
    h('div', { class: 'toolhead' }, h('span', { class: 'ico' }, icon('library')),
      h('div', {}, h('h2', {}, t('library')), h('p', {}, t('libraryNote')))),
    h('div', { class: 'searchbox' }, icon('search', 18), search),
    chips, folderBar, list, h('div', { class: 'lib-add' }, picker));
  void refresh();
  return main;
}

/** "Keep in Library" button for a result card. */
export function keepButton(file: { name: string; bytes: Uint8Array; mime: string }, source: string): HTMLElement | null {
  if (!store.libraryAvailable()) return null;
  const btn = h('button', { class: 'btn', onclick: async () => {
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
