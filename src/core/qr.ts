/** What a decoded QR code holds, so the UI can offer the right action. */
export type QrContent =
  | { kind: 'url'; url: string }
  | { kind: 'wifi'; ssid: string; password: string; security: string }
  | { kind: 'email'; to: string }
  | { kind: 'phone'; number: string }
  | { kind: 'text'; text: string };

/** Unescapes a WIFI: field value (\; \, \: \\ and \"). */
const unescape = (v: string) => v.replace(/\\([\;,:"])/g, '$1');

function wifiField(body: string, key: string): string {
  const m = new RegExp(`(?:^|;)${key}:((?:\\\\.|[^;])*)`).exec(body);
  return m ? unescape(m[1]) : '';
}

/** Classifies decoded text. Only http(s) becomes a link, so a code can never run script. */
export function parseQr(raw: string): QrContent {
  const text = raw.trim();
  if (/^https?:\/\/\S+$/i.test(text)) {
    try {
      return { kind: 'url', url: new URL(text).href };
    } catch {
      /* fall through to text */
    }
  }
  if (/^WIFI:/i.test(text)) {
    const body = text.slice(5);
    return { kind: 'wifi', ssid: wifiField(body, 'S'), password: wifiField(body, 'P'), security: wifiField(body, 'T') || 'nopass' };
  }
  const mail = /^mailto:([^?\s]+)/i.exec(text);
  if (mail) return { kind: 'email', to: decodeURIComponent(mail[1]) };
  const tel = /^tel:([+\d\s()-]+)$/i.exec(text);
  if (tel) return { kind: 'phone', number: tel[1].replace(/[\s()-]/g, '') };
  return { kind: 'text', text };
}
