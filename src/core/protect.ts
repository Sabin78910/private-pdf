import { PDFArray, PDFDict, PDFHexString, PDFName, PDFNumber, PDFRawStream, PDFStream, PDFString, type PDFObject, type PDFRef } from 'pdf-lib';
import { loadPdf } from './load';
import { PdfError } from './errors';

/**
 * Adds an open password with the PDF 2.0 standard security handler (V5 / R6, AES-256).
 * Implemented from ISO 32000-2 §7.6.4 using WebCrypto, so it runs on the device.
 * All permissions stay granted: this protects who can open the file, nothing else.
 */
export const MIN_PASSWORD = 4;
export const MAX_PASSWORD_BYTES = 127;

type Crypto = { subtle: SubtleCrypto; getRandomValues<T extends ArrayBufferView>(a: T): T };
const cryptoApi = (): Crypto => globalThis.crypto as Crypto;
const random = (n: number) => cryptoApi().getRandomValues(new Uint8Array(n));

function concat(...parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) out.set(p, o), (o += p.length);
  return out;
}

async function aesCbc(key: Uint8Array, iv: Uint8Array, data: Uint8Array, pad: boolean): Promise<Uint8Array> {
  const k = await cryptoApi().subtle.importKey('raw', key, 'AES-CBC', false, ['encrypt']);
  const out = new Uint8Array(await cryptoApi().subtle.encrypt({ name: 'AES-CBC', iv }, k, data));
  // WebCrypto always pads; for block-aligned input the unpadded ciphertext is the same prefix.
  return pad ? out : out.subarray(0, data.length);
}

async function digest(alg: 'SHA-256' | 'SHA-384' | 'SHA-512', data: Uint8Array) {
  return new Uint8Array(await cryptoApi().subtle.digest(alg, data));
}

/** Algorithm 2.B: the R6 password hash. */
export async function hash2B(password: Uint8Array, salt: Uint8Array, userKey: Uint8Array = new Uint8Array(0)): Promise<Uint8Array> {
  let k = await digest('SHA-256', concat(password, salt, userKey));
  let e = new Uint8Array(0);
  for (let i = 0; i < 64 || e[e.length - 1] > i - 32; i++) {
    const block = concat(password, k, userKey);
    const k1 = new Uint8Array(block.length * 64);
    for (let j = 0; j < 64; j++) k1.set(block, j * block.length);
    e = await aesCbc(k.subarray(0, 16), k.subarray(16, 32), k1, false);
    let sum = 0;
    for (let j = 0; j < 16; j++) sum += e[j];
    k = await digest((['SHA-256', 'SHA-384', 'SHA-512'] as const)[sum % 3], e);
  }
  return k.subarray(0, 32);
}

export function passwordBytes(password: string): Uint8Array {
  return new TextEncoder().encode(password.normalize('NFKC')).subarray(0, MAX_PASSWORD_BYTES);
}

export function checkPassword(password: string, confirm: string): 'short' | 'mismatch' | null {
  if ([...password].length < MIN_PASSWORD) return 'short';
  if (password !== confirm) return 'mismatch';
  return null;
}

const ALL_PERMISSIONS = -4; // every permission bit set (bits 1-2 must be 0)

export async function protectPdf(bytes: Uint8Array, password: string): Promise<Uint8Array> {
  if (checkPassword(password, password)) throw new PdfError('invalid-password');
  const doc = await loadPdf(bytes);
  await doc.flush();
  const ctx = doc.context;
  const fileKey = random(32);
  const user = passwordBytes(password);
  const owner = random(32); // nobody needs owner rights: all permissions are granted

  const [uvs, uks, ovs, oks] = [random(8), random(8), random(8), random(8)];
  const U = concat(await hash2B(user, uvs), uvs, uks);
  const UE = await aesCbc(await hash2B(user, uks), new Uint8Array(16), fileKey, false);
  const O = concat(await hash2B(owner, ovs, U), ovs, oks);
  const OE = await aesCbc(await hash2B(owner, oks, U), new Uint8Array(16), fileKey, false);
  const perms = new Uint8Array(16);
  new DataView(perms.buffer).setInt32(0, ALL_PERMISSIONS, true);
  perms.set([0xff, 0xff, 0xff, 0xff, 0x54 /* T: metadata encrypted */, 0x61, 0x64, 0x62], 4);
  perms.set(random(4), 12);
  const Perms = await aesCbc(fileKey, new Uint8Array(16), perms, false);

  const enc = async (data: Uint8Array) => {
    const iv = random(16);
    return concat(iv, await aesCbc(fileKey, iv, data, true));
  };
  const isString = (o: PDFObject): o is PDFString | PDFHexString => o instanceof PDFString || o instanceof PDFHexString;
  const encString = async (s: PDFString | PDFHexString) => PDFHexString.of(toHex(await enc(s.asBytes())));
  const walk = async (o: PDFObject): Promise<void> => {
    if (o instanceof PDFDict) {
      for (const [k, v] of o.entries()) {
        if (isString(v)) o.set(k, await encString(v));
        else await walk(v);
      }
    } else if (o instanceof PDFArray) {
      for (let i = 0; i < o.size(); i++) {
        const v = o.get(i);
        if (isString(v)) o.set(i, await encString(v));
        else await walk(v);
      }
    }
  };

  const objects: [PDFRef, PDFObject][] = ctx.enumerateIndirectObjects();
  for (const [ref, obj] of objects) {
    if (obj instanceof PDFStream) {
      if (obj.dict.lookup(PDFName.of('Type')) === PDFName.of('XRef')) continue;
      await walk(obj.dict);
      ctx.assign(ref, PDFRawStream.of(obj.dict, await enc(obj.getContents())));
    } else if (isString(obj)) {
      ctx.assign(ref, await encString(obj));
    } else {
      await walk(obj);
    }
  }

  const hex = (b: Uint8Array) => PDFHexString.of(toHex(b));
  const encrypt = ctx.obj({
    Filter: 'Standard',
    V: 5,
    R: 6,
    Length: 256,
    CF: { StdCF: { AuthEvent: 'DocOpen', CFM: 'AESV3', Length: 32 } },
    StmF: 'StdCF',
    StrF: 'StdCF',
    P: PDFNumber.of(ALL_PERMISSIONS),
    EncryptMetadata: true,
  });
  encrypt.set(PDFName.of('O'), hex(O));
  encrypt.set(PDFName.of('U'), hex(U));
  encrypt.set(PDFName.of('OE'), hex(OE));
  encrypt.set(PDFName.of('UE'), hex(UE));
  encrypt.set(PDFName.of('Perms'), hex(Perms));
  ctx.trailerInfo.Encrypt = ctx.register(encrypt);
  const id = hex(random(16));
  ctx.trailerInfo.ID = ctx.obj([id, id]);
  return doc.save({ useObjectStreams: false, updateFieldAppearances: false, addDefaultPage: false });
}

function toHex(b: Uint8Array): string {
  let s = '';
  for (const x of b) s += x.toString(16).padStart(2, '0');
  return s;
}
