import { burstVectors } from '../core/feel';

const KEY = 'pdfapp.feedback';

/** Sound and vibration on success. On by default; Settings can turn it off. */
export function feedbackOn(): boolean {
  try {
    return localStorage.getItem(KEY) !== 'off';
  } catch {
    return true;
  }
}
export function setFeedback(on: boolean) {
  try {
    localStorage.setItem(KEY, on ? 'on' : 'off');
  } catch {
    /* ignore */
  }
}

const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

let audio: AudioContext | null = null;
/** A soft two-note chime (E6 then A6), quiet enough not to startle. */
function chime() {
  const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctx) return;
  audio ??= new Ctx();
  const t0 = audio.currentTime;
  [1318.5, 1760].forEach((f, i) => {
    const o = audio!.createOscillator();
    const g = audio!.createGain();
    o.type = 'sine';
    o.frequency.value = f;
    const s = t0 + i * 0.09;
    g.gain.setValueAtTime(0, s);
    g.gain.linearRampToValueAtTime(0.05, s + 0.015);
    g.gain.exponentialRampToValueAtTime(0.0001, s + 0.35);
    o.connect(g).connect(audio!.destination);
    o.start(s);
    o.stop(s + 0.4);
  });
}

/** Success moment: a light double tap of haptics, a soft chime and a small burst around `anchor`. */
export function celebrate(anchor: HTMLElement) {
  if (feedbackOn()) {
    try {
      navigator.vibrate?.([12, 60, 18]);
      chime();
    } catch {
      /* feedback is a nicety; never break the result screen */
    }
  }
  if (reducedMotion()) return;
  const burst = document.createElement('span');
  burst.className = 'burst';
  burst.setAttribute('aria-hidden', 'true');
  burstVectors(12, 46, Date.now() % 1000 + 1).forEach((v, i) => {
    const p = document.createElement('i');
    p.style.setProperty('--x', `${v.x}px`);
    p.style.setProperty('--y', `${v.y}px`);
    p.className = `c${i % 3}`;
    burst.append(p);
  });
  anchor.append(burst);
  setTimeout(() => burst.remove(), 900);
}
