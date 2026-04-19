// Browser-only alarm: short triple-beep using WebAudio. No asset needed.
export function beep(durationMs = 1500) {
  if (typeof window === "undefined") return;
  try {
    const Ctx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext;
    const ctx = new Ctx();
    const start = ctx.currentTime;
    for (let i = 0; i < 3; i++) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = 880;
      gain.gain.setValueAtTime(0.0001, start + i * 0.5);
      gain.gain.exponentialRampToValueAtTime(0.4, start + i * 0.5 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + i * 0.5 + 0.35);
      osc.connect(gain).connect(ctx.destination);
      osc.start(start + i * 0.5);
      osc.stop(start + i * 0.5 + 0.4);
    }
    setTimeout(() => ctx.close().catch(() => {}), durationMs);
  } catch {
    // ignore — WebAudio may be blocked
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
