import { Capacitor } from '@capacitor/core';
import { Directory, Filesystem } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import { zipSync } from 'fflate';
import { History, MemoryStore, type KeyValueStore } from '../core/history';

export const isNative = () => Capacitor.isNativePlatform();

export interface OutputFile {
  name: string;
  bytes: Uint8Array;
  mime: string;
}

export async function readFile(f: File): Promise<Uint8Array> {
  return new Uint8Array(await f.arrayBuffer());
}

function toBase64(bytes: Uint8Array): string {
  let s = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) s += String.fromCharCode(...bytes.subarray(i, i + chunk));
  return btoa(s);
}

/** Bundles several outputs as one .zip so the user gets a single download / share. */
export function bundle(files: OutputFile[], zipName: string): OutputFile {
  if (files.length === 1) return files[0];
  const entries: Record<string, Uint8Array> = {};
  for (const f of files) entries[f.name] = f.bytes;
  return { name: zipName, bytes: zipSync(entries, { level: 0 }), mime: 'application/zip' };
}

/** Web: browser download. Android: saves to Documents (app keeps working offline). */
export async function saveFile(file: OutputFile): Promise<void> {
  if (isNative()) {
    await Filesystem.writeFile({
      path: `PrivatePDF/${file.name}`,
      data: toBase64(file.bytes),
      directory: Directory.Documents,
      recursive: true,
    });
    return;
  }
  const url = URL.createObjectURL(new Blob([file.bytes], { type: file.mime }));
  const a = document.createElement('a');
  a.href = url;
  a.download = file.name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

export const canShare = () =>
  isNative() || (typeof navigator.canShare === 'function' && navigator.canShare({ files: [new File([], 'x.pdf')] }));

/** Opens the native share sheet (WhatsApp, Gmail, …). Sharing is always the user's choice. */
export async function shareFile(file: OutputFile): Promise<void> {
  if (isNative()) {
    const res = await Filesystem.writeFile({
      path: file.name,
      data: toBase64(file.bytes),
      directory: Directory.Cache,
    });
    await Share.share({ files: [res.uri] });
    return;
  }
  await navigator.share({ files: [new File([file.bytes], file.name, { type: file.mime })] });
}

export function previewUrl(file: OutputFile): string {
  return URL.createObjectURL(new Blob([file.bytes], { type: file.mime }));
}

function pickStore(): KeyValueStore {
  try {
    const s = isNative() ? localStorage : sessionStorage;
    s.setItem('pdfapp.probe', '1');
    s.removeItem('pdfapp.probe');
    return s;
  } catch {
    return new MemoryStore();
  }
}
export const history = new History(pickStore());
