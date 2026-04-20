// Single short three-tone beep, respects the requested gain (0..1).
export function playBeep(volume: number) {
  if (typeof window === "undefined" || volume <= 0) return;
  try {
    const Ctx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext;
    const ctx = new Ctx();
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
    setTimeout(() => ctx.close().catch(() => {}), (FREQS.length + 1) * STEP * 1000);
  } catch {
    // ignore — WebAudio may be blocked
  }
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
