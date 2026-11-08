// Offscreen page that plays the "saved" sound (service workers cannot play audio).
let ctx;
chrome.runtime.onMessage.addListener(m => {
  if (m.type !== "chime") return;
  ctx ||= new AudioContext();
  const t = ctx.currentTime;
  // Two short sine notes (E6, A6) with a soft attack and decay.
  [[1318.5, 0], [1760, 0.09]].forEach(([f, d]) => {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = "sine";
    o.frequency.value = f;
    g.gain.setValueAtTime(0, t + d);
    g.gain.linearRampToValueAtTime(0.18, t + d + 0.01);
    g.gain.exponentialRampToValueAtTime(0.001, t + d + 0.35);
    o.connect(g).connect(ctx.destination);
    o.start(t + d);
    o.stop(t + d + 0.4);
  });
});
