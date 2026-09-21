// Adapted from ScrollWorld's blob playback/seek coalescing. Scoped to an interlude;
// the original engine uses global scroll offsets and permanent fixed overlays.
export function validManifest(manifest, count) {
  return Number.isInteger(count) && count > 0 && manifest?.version === 1 && manifest.status === 'verified' &&
    manifest.architecture === 'A' && Array.isArray(manifest.clips) && manifest.clips.length === count &&
    manifest.clips.every(c => c && ['desktop', 'mobile', 'poster', 'posterMobile'].every(k =>
      typeof c[k] === 'string' && /^(media|web)\/[a-zA-Z0-9._-]+$/.test(c[k])) &&
      Number.isFinite(c.duration) && c.duration > 0 && Number.isFinite(c.fps) && c.fps > 0) &&
    Array.isArray(manifest.seams) && manifest.seams.length === count - 1 && manifest.seams.every(s => s &&
      Number.isFinite(s.desktop) && s.desktop >= .90 && Number.isFinite(s.mobile) && s.mobile >= .90);
}

export function segmentAt(progress, count) {
  if (!Number.isFinite(progress) || !Number.isInteger(count) || count < 1) throw new Error('Invalid scroll mapping inputs');
  const scaled = Math.max(0, Math.min(1, progress)) * count;
  const index = Math.min(count - 1, Math.floor(scaled));
  return { index, local: scaled - index };
}

export function mountScrollWorld(root, { base, manifest: supplied, onEvent } = {}) {
  if (!root || root.dataset.mounted) return () => {};
  if (typeof matchMedia !== 'function' || typeof AbortController !== 'function') {
    root.dataset.mode = 'stills'; root.dataset.reason = 'unsupported-browser';
    return () => {};
  }
  root.dataset.mounted = 'true';
  const scenes = [...root.querySelectorAll('.aw-scene')];
  const pin = root.querySelector('.aw-pin');
  const controls = root.querySelector('.aw-controls');
  const reduce = matchMedia('(prefers-reduced-motion: reduce)');
  const coarse = matchMedia('(pointer: coarse)');
  const connection = navigator.connection;
  const phone = Math.min(screen.width, screen.height) <= 600;
  const mediaBase = new URL(base, location.href);
  let disposed = false, enhanced = false, disabled = false, manifest;
  let raf = 0, height = innerHeight, width = innerWidth, active = -1, primed = false;
  let progress = 0, local = 0, observer, stillObserver;
  const videos = new Map(), seen = new Set();
  const lifetime = new AbortController();
  const nav = document.createElement('div'); nav.className = 'aw-scene-nav';
  nav.setAttribute('role', 'group'); nav.setAttribute('aria-label', 'Story scenes');
  const toggle = document.createElement('button'); toggle.textContent = 'Reduce motion';
  toggle.type = 'button'; toggle.hidden = true;
  const bar = document.createElement('div'); bar.className = 'aw-progress'; bar.hidden = true;
  controls.append(nav, toggle); pin.append(bar);
  const buttons = scenes.map((scene, i) => {
    const b = document.createElement('button'); b.type = 'button';
    b.textContent = String(i + 1).padStart(2, '0');
    b.setAttribute('aria-label', `Scene ${i + 1}: ${scene.querySelector('h2').textContent}`);
    b.addEventListener('click', () => {
      const offset = enhanced ? root.getBoundingClientRect().top + scrollY +
        i / scenes.length * (root.offsetHeight - height) : scene.getBoundingClientRect().top + scrollY;
      window.scrollTo({ top: offset, behavior: 'instant' });
      if (enhanced) tick();
      scene.querySelector('h2').focus({ preventScroll: true });
    }, { signal: lifetime.signal });
    nav.append(b); return b;
  });
  nav.hidden = true;

  function emit(type, extra = {}) {
    const detail = { type, mode: enhanced ? 'video' : 'stills', ...extra };
    root.dispatchEvent(new CustomEvent('afristage:scroll-world', { bubbles: true, detail }));
    try { onEvent?.(detail); } catch (error) { console.warn('ScrollWorld analytics callback failed', error); }
  }
  function release(i) {
    const s = videos.get(i); if (!s) return;
    s.controller.abort(); clearTimeout(s.timer);
    if (s.video) { s.video.pause(); s.video.removeAttribute('src'); s.video.load(); s.video.remove(); }
    s.poster?.remove();
    if (s.url) URL.revokeObjectURL(s.url);
    videos.delete(i);
  }
  function fallback(reason, error) {
    if (disposed) return;
    const previous = scenes[Math.max(0, active)];
    const wasVisible = root.getBoundingClientRect().top < height && root.getBoundingClientRect().bottom > 0;
    const wasEnhanced = enhanced;
    enhanced = false; disabled = true;
    for (const i of videos.keys()) release(i);
    root.classList.remove('aw-enhanced'); root.style.removeProperty('height');
    root.dataset.mode = 'stills'; root.dataset.reason = reason;
    scenes.forEach(scene => { scene.inert = false; scene.removeAttribute('aria-hidden'); scene.classList.remove('aw-active', 'aw-preview'); scene.style.removeProperty('opacity'); });
    nav.hidden = toggle.hidden = bar.hidden = true;
    if (wasEnhanced && wasVisible) previous.scrollIntoView({ behavior: 'instant', block: 'start' });
    if (error) console.warn(`ScrollWorld fallback: ${reason}`, error.message);
    emit('fallback', { reason });
    if (!stillObserver && typeof IntersectionObserver !== 'undefined') {
      stillObserver = new IntersectionObserver(entries => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          const index = scenes.indexOf(entry.target);
          if (!seen.has(index)) { seen.add(index); emit('scene-view', { scene: index + 1 }); }
        }
      }, { threshold: .4 });
      scenes.forEach(scene => stillObserver.observe(scene));
    }
  }
  function requestTick() {
    if (!raf && !disposed && enhanced && !document.hidden) raf = requestAnimationFrame(tick);
  }
  async function prime(s) {
    if (!coarse.matches || s.primed || !s.video || !s.ready) return;
    s.primed = true;
    try { await s.video.play(); s.video.pause(); requestTick(); }
    catch (error) { if (videos.has(s.index) && !disposed && enhanced) fallback('playback-blocked', error); }
  }
  async function load(index) {
    if (videos.has(index) || !enhanced || index < 0 || index >= scenes.length) return;
    const clip = manifest.clips[index];
    const controller = new AbortController();
    const s = { index, controller, video: null, ready: false, primed: false, painted: false };
    const poster = document.createElement('img'); s.poster = poster;
    poster.alt = ''; poster.setAttribute('aria-hidden', 'true');
    poster.src = new URL(phone ? clip.posterMobile : clip.poster, mediaBase).href;
    scenes[index].querySelector('.aw-visual').append(poster);
    videos.set(index, s);
    s.timer = setTimeout(() => { if (videos.get(index) === s) fallback('media-timeout', new Error('Clip did not become playable in 20s')); }, 20000);
    try {
      const response = await fetch(new URL(phone ? clip.mobile : clip.desktop, mediaBase), { signal: controller.signal });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const blob = await response.blob();
      if (!enhanced || disposed || controller.signal.aborted) return;
      const v = document.createElement('video'); s.video = v;
      v.muted = true; v.defaultMuted = true; v.playsInline = true; v.preload = 'auto';
      v.setAttribute('aria-hidden', 'true'); v.setAttribute('playsinline', ''); v.setAttribute('muted', '');
      v.poster = new URL(phone ? clip.posterMobile : clip.poster, mediaBase).href;
      // The source still remains below this exact-frame poster until video paints.
      v.style.opacity = '1';
      s.url = URL.createObjectURL(blob); v.src = s.url;
      const painted = () => {
        if (!enhanced || disposed || controller.signal.aborted) return;
        s.painted = true; v.classList.add('aw-painted'); requestTick();
      };
      v.addEventListener('loadeddata', () => {
        if (!Number.isFinite(v.duration) || v.duration <= 0 || !v.seekable.length || v.seekable.end(0) <= 0) {
          fallback('unseekable-media', new Error('No seekable video range')); return;
        }
        s.ready = true; clearTimeout(s.timer);
        if (v.requestVideoFrameCallback) v.requestVideoFrameCallback(painted); else painted();
        if (primed) prime(s); requestTick();
      }, { once: true, signal: controller.signal });
      v.addEventListener('seeked', () => {
        if (v.requestVideoFrameCallback) v.requestVideoFrameCallback(painted); else painted();
        requestTick();
      }, { signal: controller.signal });
      v.addEventListener('error', () => fallback('decode-error', new Error('Video decode failed')), { signal: controller.signal });
      scenes[index].querySelector('.aw-visual').append(v);
    } catch (error) {
      if (!controller.signal.aborted && !disposed && enhanced) fallback('media-fetch-failed', error);
    }
  }
  function tick() {
    raf = 0; if (!enhanced || disposed || document.hidden) return;
    const rect = root.getBoundingClientRect();
    if (rect.top >= height || rect.bottom <= 0) return;
    progress = Math.max(0, Math.min(1, -rect.top / (root.offsetHeight - height)));
    ({ index: active, local } = segmentAt(progress, scenes.length));
    root.dataset.scene = String(active + 1);
    scenes.forEach((scene, i) => {
      scene.classList.toggle('aw-active', i === active);
      // Only a short actual-frame blend: this cannot disguise a failed seam gate.
      const blend = i === active + 1 && local > .92 ? (local - .92) / .08 : 0;
      scene.classList.toggle('aw-preview', blend > 0);
      scene.style.opacity = String(i === active ? 1 : blend);
      scene.inert = i !== active; scene.setAttribute('aria-hidden', String(i !== active));
      buttons[i].setAttribute('aria-current', i === active ? 'step' : 'false');
    });
    if (!seen.has(active)) { seen.add(active); emit('scene-view', { scene: active + 1 }); }
    bar.style.transform = `scaleX(${progress})`;
    load(active);
    if (!/2g|3g/.test(connection?.effectiveType || '')) {
      if (local > .65) load(active + 1);
      if (local < .35) load(active - 1);
    }
    for (const [i, s] of videos) {
      if (Math.abs(i - active) > 1) { release(i); continue; }
      if (!s.ready || !s.video || s.video.seeking) continue;
      const fraction = i < active ? 1 : i > active ? 0 : local;
      const target = fraction * Math.max(0, s.video.duration - 1 / manifest.clips[i].fps);
      if (Math.abs(s.video.currentTime - target) > .015) s.video.currentTime = target;
    }
  }
  function layout() {
    if (!enhanced) return;
    if (coarse.matches && width === innerWidth && root.style.height) { requestTick(); return; }
    width = innerWidth; height = innerHeight;
    root.style.setProperty('--aw-height', `${height}px`);
    root.style.height = `${height * (1 + scenes.length * (phone ? 1.9 : 1.6))}px`;
    requestTick();
  }
  function activate(value) {
    if (disposed || disabled) return;
    if (!validManifest(value, scenes.length)) { fallback('assets-not-verified'); return; }
    manifest = value; enhanced = true;
    root.classList.add('aw-enhanced'); root.dataset.mode = 'video';
    nav.hidden = toggle.hidden = bar.hidden = false;
    scenes.forEach(scene => { scene.querySelector('h2').tabIndex = -1; });
    layout(); tick(); emit('ready');
  }
  toggle.addEventListener('click', () => fallback('user-choice'), { signal: lifetime.signal });
  root.addEventListener('click', e => { if (e.target.closest('.aw-cta')) emit('cta-click', { scene: scenes.indexOf(e.target.closest('.aw-scene')) + 1 }); }, { signal: lifetime.signal });
  window.addEventListener('scroll', requestTick, { passive: true, signal: lifetime.signal });
  window.addEventListener('resize', layout, { signal: lifetime.signal });
  document.addEventListener('visibilitychange', requestTick, { signal: lifetime.signal });
  const gesture = () => { primed = true; for (const s of videos.values()) prime(s); };
  root.addEventListener('pointerdown', gesture, { passive: true, signal: lifetime.signal });
  root.addEventListener('touchstart', gesture, { passive: true, signal: lifetime.signal });
  const preference = () => { if (reduce.matches || connection?.saveData) fallback(reduce.matches ? 'reduced-motion' : 'data-saver'); };
  reduce.addEventListener('change', preference, { signal: lifetime.signal });
  connection?.addEventListener('change', preference, { signal: lifetime.signal });
  if (reduce.matches || connection?.saveData) preference();
  else if (supplied) activate(supplied);
  else if (typeof IntersectionObserver === 'undefined') fallback('unsupported-browser');
  else {
    observer = new IntersectionObserver(entries => {
      if (!entries.some(e => e.isIntersecting)) return;
      observer.disconnect();
      fetch(new URL('runtime/manifest.json', mediaBase), { signal: lifetime.signal })
        .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
        .then(activate).catch(e => { if (!disposed) fallback('manifest-unavailable', e); });
    }, { rootMargin: '300px' });
    observer.observe(root);
  }
  return () => {
    disposed = true; lifetime.abort(); observer?.disconnect(); stillObserver?.disconnect(); cancelAnimationFrame(raf);
    for (const i of videos.keys()) release(i);
    nav.remove(); toggle.remove(); bar.remove();
    root.classList.remove('aw-enhanced'); root.style.removeProperty('height');
    scenes.forEach(s => { s.inert = false; s.removeAttribute('aria-hidden'); s.classList.remove('aw-active', 'aw-preview'); s.style.removeProperty('opacity'); });
    delete root.dataset.mounted;
  };
}
