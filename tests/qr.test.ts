import { describe, expect, it } from 'vitest';
import { parseQr } from '../src/core/qr';

describe('QR content', () => {
  it('turns http(s) into a link and nothing else', () => {
    expect(parseQr(' https://example.com/a?b=1 ')).toEqual({ kind: 'url', url: 'https://example.com/a?b=1' });
    expect(parseQr('javascript:alert(1)')).toEqual({ kind: 'text', text: 'javascript:alert(1)' });
    expect(parseQr('https://exa mple.com').kind).toBe('text');
  });

  it('reads Wi-Fi codes, including escaped characters', () => {
    expect(parseQr('WIFI:T:WPA;S:Home\\;Net;P:pa\\:ss;;')).toEqual({ kind: 'wifi', ssid: 'Home;Net', password: 'pa:ss', security: 'WPA' });
    expect(parseQr('WIFI:S:Cafe;;')).toMatchObject({ ssid: 'Cafe', password: '', security: 'nopass' });
  });

  it('reads email and phone codes', () => {
    expect(parseQr('mailto:a%40b.np?subject=x')).toEqual({ kind: 'email', to: 'a@b.np' });
    expect(parseQr('tel:+977 (1) 555-1234')).toEqual({ kind: 'phone', number: '+97715551234' });
  });

  it('keeps anything else as plain text', () => {
    expect(parseQr('नमस्ते 123')).toEqual({ kind: 'text', text: 'नमस्ते 123' });
  });
});
