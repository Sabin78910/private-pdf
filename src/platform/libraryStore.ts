// On-device Library storage in IndexedDB. Nothing here touches the network.
// 'items' holds metadata (fast to list), 'blobs' the file bytes, 'folders' the folders.
import { newId, releaseFolder, uniqueName, type Folder, type LibraryItem } from '../core/library';
import type { OutputFile } from './files';

const DB = 'pdfapp.library';
let dbp: Promise<IDBDatabase> | null = null;

function db(): Promise<IDBDatabase> {
  dbp ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => {
      const d = req.result;
      d.createObjectStore('items', { keyPath: 'id' });
      d.createObjectStore('blobs');
      d.createObjectStore('folders', { keyPath: 'id' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => ((dbp = null), reject(req.error));
  });
  return dbp;
}

type Store = 'items' | 'blobs' | 'folders';

async function tx<T>(stores: Store[], mode: IDBTransactionMode, fn: (t: IDBTransaction) => IDBRequest<T> | void): Promise<T> {
  const d = await db();
  return new Promise((resolve, reject) => {
    const t = d.transaction(stores, mode);
    const req = fn(t);
    t.oncomplete = () => resolve(req ? req.result : (undefined as T));
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error ?? new Error('aborted'));
  });
}

export const libraryAvailable = () => typeof indexedDB !== 'undefined';

export const listItems = () => tx<LibraryItem[]>(['items'], 'readonly', (t) => t.objectStore('items').getAll());
export const listFolders = () => tx<Folder[]>(['folders'], 'readonly', (t) => t.objectStore('folders').getAll());

export async function addFile(file: OutputFile, source: string, folder: string | null = null): Promise<LibraryItem> {
  const now = Date.now();
  const item: LibraryItem = {
    id: newId(now),
    name: uniqueName(file.name, await listItems()),
    size: file.bytes.length,
    mime: file.mime,
    folder,
    favorite: false,
    addedAt: now,
    openedAt: now,
    source,
  };
  await tx(['items', 'blobs'], 'readwrite', (t) => {
    t.objectStore('items').put(item);
    t.objectStore('blobs').put(new Blob([file.bytes], { type: file.mime }), item.id);
  });
  return item;
}

export async function updateItem(item: LibraryItem): Promise<void> {
  await tx(['items'], 'readwrite', (t) => void t.objectStore('items').put(item));
}

export async function readItem(item: LibraryItem, markOpened = true): Promise<OutputFile> {
  const blob = await tx<Blob | undefined>(['blobs'], 'readonly', (t) => t.objectStore('blobs').get(item.id));
  if (!blob) throw new Error('missing');
  if (markOpened) await updateItem({ ...item, openedAt: Date.now() });
  return { name: item.name, mime: item.mime, bytes: new Uint8Array(await blob.arrayBuffer()) };
}

export async function getItem(id: string): Promise<LibraryItem | undefined> {
  return tx<LibraryItem | undefined>(['items'], 'readonly', (t) => t.objectStore('items').get(id));
}

/** Deletes the file from this device. */
export async function removeItem(id: string): Promise<void> {
  await tx(['items', 'blobs'], 'readwrite', (t) => {
    t.objectStore('items').delete(id);
    t.objectStore('blobs').delete(id);
  });
}

export async function addFolder(name: string): Promise<Folder> {
  const folder: Folder = { id: newId(), name: name.trim(), createdAt: Date.now() };
  await tx(['folders'], 'readwrite', (t) => void t.objectStore('folders').put(folder));
  return folder;
}

export async function renameFolder(folder: Folder, name: string): Promise<void> {
  await tx(['folders'], 'readwrite', (t) => void t.objectStore('folders').put({ ...folder, name: name.trim() }));
}

/** Deletes a folder; its files move to the top level. */
export async function removeFolder(id: string): Promise<void> {
  const moved = releaseFolder(await listItems(), id);
  await tx(['items', 'folders'], 'readwrite', (t) => {
    for (const i of moved) t.objectStore('items').put(i);
    t.objectStore('folders').delete(id);
  });
}
