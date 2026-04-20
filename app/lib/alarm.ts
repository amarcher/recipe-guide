// A single shared AudioContext, created and unlocked on first user gesture.
// Mobile browsers refuse to let a context start playing unless the very first
// call happens inside a user gesture; reusing the unlocked context for later
// alarms is what makes the beep survive a backgrounded tab. Diagnostics are
// logged so we can tell why a mobile device went silent.
type AnyWindow = Window & { webkitAudioContext?: typeof AudioContext };
let sharedCtx: AudioContext | null = null;

function getCtx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (sharedCtx) return sharedCtx;
  try {
    const Ctx = window.AudioContext || (window as AnyWindow).webkitAudioContext;
    if (!Ctx) return null;
    sharedCtx = new Ctx();
    return sharedCtx;
  } catch {
    return null;
  }
}

// Call from a user gesture (e.g. the Start button). Unlocks the audio graph
// and the speech synthesizer on iOS/Safari. Safe to call repeatedly.
export function primeAudio() {
  const ctx = getCtx();
  if (ctx && ctx.state === "suspended") void ctx.resume();
  if (typeof window !== "undefined" && window.speechSynthesis) {
    try {
      const u = new SpeechSynthesisUtterance("");
      u.volume = 0;
      window.speechSynthesis.speak(u);
    } catch {}
  }
}

// Short three-tone beep. Returns false if the context is blocked (useful for
// falling back to vibration / notification).
export function playBeep(volume: number): boolean {
  if (typeof window === "undefined" || volume <= 0) return false;
  const ctx = getCtx();
  if (!ctx) return false;
  if (ctx.state === "suspended") {
    void ctx.resume();
    if ((ctx.state as string) !== "running") {
      console.warn("[alarm] AudioContext suspended; beep skipped", {
        state: ctx.state,
      });
      return false;
    }
  }
  try {
    const start = ctx.currentTime;
    const FREQS = [880, 660, 880, 1100, 880];
    const STEP = 0.16;
    for (let i = 0; i < FREQS.length; i++) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = FREQS[i];
      const t = start + i * STEP;
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(
        Math.max(0.0001, Math.min(1, volume)),
        t + 0.02
      );
      gain.gain.exponentialRampToValueAtTime(0.0001, t + STEP - 0.02);
      osc.connect(gain).connect(ctx.destination);
      osc.start(t);
      osc.stop(t + STEP);
    }
    return true;
  } catch (err) {
    console.warn("[alarm] beep failed", err);
    return false;
  }
}

// Fire a vibration pattern. On Android Chrome this works even when the
// device's ringer is silenced, which is the main reason to include it.
export function vibrate(pattern: number | number[] = [200, 100, 200, 100, 400]) {
  if (typeof navigator === "undefined" || !navigator.vibrate) return;
  try {
    navigator.vibrate(pattern);
  } catch {}
}

export function speakText(text: string) {
  if (typeof window === "undefined" || !window.speechSynthesis) return;
  try {
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.rate = 1.0;
    u.pitch = 1.0;
    window.speechSynthesis.speak(u);
  } catch {
    // ignore
  }
}

export function cancelSpeech() {
  if (typeof window !== "undefined" && window.speechSynthesis) {
    try {
      window.speechSynthesis.cancel();
    } catch {
      // ignore
    }
  }
}

export async function ensureNotificationPermission(): Promise<boolean> {
  if (typeof window === "undefined" || !("Notification" in window)) return false;
  if (Notification.permission === "granted") return true;
  if (Notification.permission === "denied") return false;
  const r = await Notification.requestPermission();
  return r === "granted";
}

export function notify(title: string, body?: string) {
  if (typeof window === "undefined" || !("Notification" in window)) return;
  if (Notification.permission !== "granted") return;
  try {
    new Notification(title, { body });
  } catch {
    // ignore
  }
}
