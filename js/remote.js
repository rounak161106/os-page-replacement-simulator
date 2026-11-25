const DEFAULT_ROOM_CODE = 'LIVE';

function isLikelyStaticHost() {
  const host = window.location.hostname || '';
  return window.location.protocol === 'file:' || host.endsWith('.github.io');
}

async function probeLocalRelayServer() {
  if (isLikelyStaticHost()) return false;
  try {
    const res = await fetch('./api/server-info', { cache: 'no-store' });
    const ct = res.headers.get('content-type') || '';
    if (!res.ok || !ct.includes('application/json')) return false;
    const data = await res.json();
    return Boolean(data?.ok);
  } catch (_) {
    return false;
  }
}

export function sanitizePin(raw) {
  const cleaned = String(raw || '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');
  if (cleaned.length < 4 || cleaned.length > 8) return '';
  return cleaned;
}

export function detectRemoteLaunchParam() {
  const path = window.location.pathname.replace(/\/+$/, '') || '/';
  const params = new URLSearchParams(window.location.search);

  if (path === '/remote' || path.endsWith('/remote')) {
    return {
      isRemote: true,
      code: sanitizePin(params.get('remote') || params.get('room')) || DEFAULT_ROOM_CODE
    };
  }
  if (params.has('remote')) {
    return {
      isRemote: true,
      code: sanitizePin(params.get('remote')) || DEFAULT_ROOM_CODE
    };
  }
  if (window.location.hash.startsWith('#remote')) {
    const parts = window.location.hash.split('=');
    return {
      isRemote: true,
      code: sanitizePin(parts[1] || '') || DEFAULT_ROOM_CODE
    };
  }
  return { isRemote: false, code: '' };
}

function makeClientId(prefix) {
  return `${prefix}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Desktop / Projector Host Bridge (zero UI buttons on desktop):
 * Auto-pairs with phones connecting to /remote or /?remote over the same Wi-Fi.
 */
export class RemoteHostBridge {
  constructor(options = {}) {
    this.onCommand = options.onCommand || (() => {});
    this.onNotify = options.onNotify || (() => {});
    this.getStateSnapshot = options.getStateSnapshot || (() => null);

    const urlRoom = sanitizePin(new URLSearchParams(window.location.search).get('room'));
    this.pin = urlRoom || DEFAULT_ROOM_CODE;
    this.clientId = makeClientId('host');
    this.eventSource = null;
    this.channel = null;
    this.relayAvailable = false;
    this.remoteCount = 0;
    this.stateFlushTimer = null;

    this.initRoom(this.pin);
  }

  async initRoom(pin) {
    this.bindBroadcastChannel(pin);
    this.relayAvailable = await probeLocalRelayServer();
    if (this.relayAvailable) {
      this.openHostSse(pin);
    }
  }

  bindBroadcastChannel(pin) {
    if (this.channel) {
      this.channel.close();
      this.channel = null;
    }

    if (typeof BroadcastChannel !== 'undefined') {
      this.channel = new BroadcastChannel(`framelab-remote-${pin}`);
      this.channel.onmessage = (event) => {
        const msg = event.data;
        if (!msg || msg.sender === this.clientId) return;
        if (msg.kind === 'command') {
          this.handleIncomingCommand(msg.command);
        } else if (msg.kind === 'controller-hello') {
          this.broadcastChannelState(this.getStateSnapshot());
        }
      };
    }
  }

  openHostSse(pin) {
    if (this.eventSource) {
      this.eventSource.close();
      this.eventSource = null;
    }
    this.remoteCount = 0;

    try {
      const esUrl = `./api/remote/${encodeURIComponent(pin)}/events?role=host&clientId=${encodeURIComponent(this.clientId)}`;
      const es = new EventSource(esUrl);
      this.eventSource = es;

      es.addEventListener('session', (event) => {
        const info = JSON.parse(event.data || '{}');
        const nextCount = Number(info.remoteCount) || 0;
        const grew = nextCount > this.remoteCount;
        this.remoteCount = nextCount;
        if (grew) {
          this.onNotify('Phone remote paired over Wi-Fi', 'hit');
          this.pushStateNow(this.getStateSnapshot());
        }
      });

      es.addEventListener('command', (event) => {
        const cmd = JSON.parse(event.data || '{}');
        this.handleIncomingCommand(cmd);
      });

      es.onerror = () => {
        // Keep BroadcastChannel fallback alive if relay stops
      };
    } catch (_) {
      /* ignore SSE unavailability */
    }

    this.pushStateNow(this.getStateSnapshot());
  }

  handleIncomingCommand(cmd) {
    if (!cmd || !cmd.type) return;
    if (cmd.type === 'REQUEST_STATE') {
      this.pushStateNow(this.getStateSnapshot());
      return;
    }
    this.onCommand(cmd);
  }

  broadcastChannelState(state) {
    if (this.channel && state) {
      try {
        this.channel.postMessage({ kind: 'state', sender: this.clientId, state });
      } catch (_) {
        /* ignore */
      }
    }
  }

  publishState(state) {
    if (!state) return;
    this.broadcastChannelState(state);
    clearTimeout(this.stateFlushTimer);
    this.stateFlushTimer = setTimeout(() => {
      this.pushStateNow(state);
    }, 35);
  }

  async pushStateNow(state) {
    if (!state) return;
    this.broadcastChannelState(state);
    if (this.relayAvailable !== true) return;

    try {
      await fetch(`./api/remote/${encodeURIComponent(this.pin)}/state`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ state }),
        keepalive: true
      });
    } catch (_) {
      /* ignore transient network error */
    }
  }
}

/**
 * Mobile Phone Presenter Remote View (?remote=XXXX):
 * Ergonomic palm-held remote synced in real time over classroom Wi-Fi.
 */
export class RemoteControllerUI {
  constructor(initialPin = '') {
    this.pin = sanitizePin(initialPin);
    this.clientId = makeClientId('phone');
    this.eventSource = null;
    this.channel = null;
    this.relayAvailable = false;
    this.hostOnline = false;
    this.lastState = null;
    this.root = document.getElementById('remote-controller-view');
    this.appShell = document.querySelector('.app-shell');

    this.mount();
  }

  mount() {
    document.body.classList.add('is-remote-controller');
    if (this.appShell) this.appShell.hidden = true;
    if (!this.root) return;
    this.root.hidden = false;

    this.root.innerHTML = `
      <header class="rm-header">
        <div class="rm-brand">
          <span class="rm-brand-badge" aria-hidden="true">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2">
              <rect x="3" y="3" width="8" height="8" rx="1.5"/>
              <rect x="13" y="3" width="8" height="8" rx="1.5" fill="currentColor" fill-opacity="0.35"/>
              <rect x="3" y="13" width="8" height="8" rx="1.5"/>
              <rect x="13" y="13" width="8" height="8" rx="1.5"/>
            </svg>
          </span>
          <span class="rm-title">FrameLab Remote</span>
        </div>
        <div class="rm-header-right">
          <span id="rm-conn-pill" class="rm-conn-pill is-waiting">Connecting...</span>
          <a href="./" class="rm-exit-link">Full App</a>
        </div>
      </header>

      <main class="rm-main">
        <section id="rm-join-card" class="rm-card rm-join-card" ${this.pin ? 'hidden' : ''}>
          <h1 class="rm-h1">Pair with Projector</h1>
          <p class="rm-sub">Enter the 4-digit pairing code shown under <strong>Phone Remote</strong> on the classroom screen.</p>
          <form id="rm-join-form" class="rm-join-form">
            <input id="rm-pin-input" class="rm-pin-input" type="text" inputmode="numeric" maxlength="8" placeholder="e.g. 4829" aria-label="Pairing code" required>
            <button type="submit" class="rm-btn rm-btn-primary">Connect</button>
          </form>
        </section>

        <div id="rm-deck" class="rm-deck" ${this.pin ? '' : 'hidden'}>
          <!-- Live Mirror Screen -->
          <section class="rm-card rm-mirror-card" aria-label="Live projector state mirror">
            <div class="rm-mirror-top">
              <span id="rm-step-pill" class="rm-mono-pill">Step -- / --</span>
              <span id="rm-meta-pill" class="rm-soft-meta">FIFO · 3 Frames</span>
              <span id="rm-outcome-badge" class="rm-outcome-badge">IDLE</span>
            </div>

            <div class="rm-incoming-and-frames">
              <div class="rm-incoming-tile">
                <span class="rm-kicker">Incoming</span>
                <span id="rm-incoming-page" class="rm-big-page">--</span>
              </div>
              <div id="rm-frames-strip" class="rm-frames-strip" aria-label="RAM frames snapshot"></div>
            </div>

            <div class="rm-kpis-mini">
              <span>Faults: <strong id="rm-stat-faults">0</strong></span>
              <span>Hits: <strong id="rm-stat-hits">0</strong></span>
              <span>Replaced: <strong id="rm-stat-replaced">0</strong></span>
            </div>

            <p id="rm-narration" class="rm-narration">Waiting for live simulation sync from projector...</p>
          </section>

          <!-- Primary Thumb Transport Controls -->
          <section class="rm-card rm-transport-card" aria-label="Playback remote controls">
            <button type="button" id="rm-btn-play" class="rm-btn rm-btn-hero">
              <span id="rm-play-text">▶ Play Simulation</span>
            </button>

            <div class="rm-nav-pair">
              <button type="button" id="rm-btn-prev" class="rm-btn rm-btn-step">⏮ Previous</button>
              <button type="button" id="rm-btn-next" class="rm-btn rm-btn-step rm-btn-next-emphasis">Next Step ⏭</button>
            </div>

            <div class="rm-scrubber-row">
              <label for="rm-step-scrubber" class="rm-kicker">Jump Step</label>
              <input id="rm-step-scrubber" class="rm-slider" type="range" min="0" max="13" step="1" value="1">
              <button type="button" id="rm-btn-reset" class="rm-btn rm-btn-reset">↺ Reset</button>
            </div>
          </section>

          <!-- Speed Control -->
          <section class="rm-card rm-speed-card" aria-label="Playback speed controls">
            <div class="rm-row-head">
              <span class="rm-section-label">Playback Speed</span>
              <span id="rm-speed-badge" class="rm-mono-pill">1400 ms</span>
            </div>
            <div class="rm-speed-presets" role="group" aria-label="Speed multipliers">
              <button type="button" class="rm-chip-btn" data-speed="2800">0.5x</button>
              <button type="button" class="rm-chip-btn" data-speed="1400">1x</button>
              <button type="button" class="rm-chip-btn" data-speed="700">2x</button>
              <button type="button" class="rm-chip-btn" data-speed="350">4x</button>
            </div>
            <input id="rm-speed-slider" class="rm-slider" type="range" min="300" max="2800" step="50" value="1400" aria-label="Speed slider milliseconds">
          </section>

          <!-- Teaching Controls -->
          <section class="rm-card rm-teach-card" aria-label="Algorithm and screen controls">
            <div class="rm-control-block">
              <span class="rm-section-label">Algorithm</span>
              <div class="rm-seg-grid" role="group" aria-label="Algorithm selector">
                <button type="button" class="rm-chip-btn" data-algo="FIFO">FIFO</button>
                <button type="button" class="rm-chip-btn" data-algo="LRU">LRU</button>
                <button type="button" class="rm-chip-btn" data-algo="OPTIMAL">Optimal</button>
              </div>
            </div>

            <div class="rm-control-block">
              <span class="rm-section-label">Projector Screen Tab</span>
              <div class="rm-seg-grid" role="group" aria-label="Workspace view selector">
                <button type="button" class="rm-chip-btn" data-view="sim">Simulator</button>
                <button type="button" class="rm-chip-btn" data-view="cmp">Compare</button>
                <button type="button" class="rm-chip-btn" data-view="learn">Learn</button>
              </div>
            </div>

            <div class="rm-two-col">
              <div class="rm-control-block">
                <span class="rm-section-label">RAM Frames</span>
                <div class="rm-stepper">
                  <button type="button" id="rm-frames-dec" class="rm-chip-btn" aria-label="Decrease frames">−</button>
                  <span id="rm-frames-val" class="rm-frames-readout">3</span>
                  <button type="button" id="rm-frames-inc" class="rm-chip-btn" aria-label="Increase frames">+</button>
                </div>
              </div>

              <div class="rm-control-block">
                <span class="rm-section-label">Projector Scale</span>
                <button type="button" id="rm-btn-class-view" class="rm-chip-btn rm-full-btn">Class View: Off</button>
              </div>
            </div>

            <div class="rm-control-block">
              <span class="rm-section-label">Class Presets</span>
              <div class="rm-preset-grid" role="group" aria-label="Reference sequence presets">
                <button type="button" class="rm-chip-btn" data-preset="Standard (13)">Standard (13)</button>
                <button type="button" class="rm-chip-btn" data-preset="Belady (12)">Belady (12)</button>
                <button type="button" class="rm-chip-btn" data-preset="Locality">Locality</button>
                <button type="button" class="rm-chip-btn" data-preset="Thrashing">Thrashing</button>
              </div>
            </div>

            <button type="button" id="rm-btn-belady-proof" class="rm-chip-btn rm-full-btn" hidden>Run 3 vs 4 Belady Proof</button>
          </section>
        </div>
      </main>
    `;

    this.bindEvents();
    this.requestWakeLock();

    if (this.pin) {
      this.connectSession(this.pin);
    }
  }

  bindEvents() {
    this.root.querySelector('#rm-join-form')?.addEventListener('submit', (e) => {
      e.preventDefault();
      const input = this.root.querySelector('#rm-pin-input');
      const pin = sanitizePin(input?.value);
      if (!pin) return;
      this.pin = pin;
      const url = new URL(window.location.href);
      url.searchParams.set('remote', pin);
      window.history.replaceState(null, '', url.toString());
      this.root.querySelector('#rm-join-card')?.setAttribute('hidden', '');
      this.root.querySelector('#rm-deck')?.removeAttribute('hidden');
      this.connectSession(pin);
    });

    this.root.querySelector('#rm-btn-play')?.addEventListener('click', () => this.sendCommand('TOGGLE_PLAY'));
    this.root.querySelector('#rm-btn-prev')?.addEventListener('click', () => this.sendCommand('PREV'));
    this.root.querySelector('#rm-btn-next')?.addEventListener('click', () => this.sendCommand('NEXT'));
    this.root.querySelector('#rm-btn-reset')?.addEventListener('click', () => this.sendCommand('RESET'));
    this.root.querySelector('#rm-btn-class-view')?.addEventListener('click', () => this.sendCommand('TOGGLE_CLASS_VIEW'));
    this.root.querySelector('#rm-btn-belady-proof')?.addEventListener('click', () => this.sendCommand('RUN_BELADY_PROOF'));

    this.root.querySelector('#rm-step-scrubber')?.addEventListener('change', (e) => {
      const stepNum = Number(e.target.value);
      this.sendCommand('GOTO_STEP', { index: stepNum - 1 });
    });

    this.root.querySelector('#rm-speed-slider')?.addEventListener('input', (e) => {
      const ms = Number(e.target.value);
      const badge = this.root.querySelector('#rm-speed-badge');
      if (badge) badge.textContent = `${ms} ms`;
      this.sendCommand('SET_SPEED', { ms });
    });

    this.root.querySelectorAll('[data-speed]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const ms = Number(btn.dataset.speed);
        this.sendCommand('SET_SPEED', { ms });
      });
    });

    this.root.querySelectorAll('[data-algo]').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.sendCommand('SET_ALGO', { algoKey: btn.dataset.algo });
      });
    });

    this.root.querySelectorAll('[data-view]').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.sendCommand('SWITCH_VIEW', { view: btn.dataset.view });
      });
    });

    this.root.querySelector('#rm-frames-dec')?.addEventListener('click', () => {
      const cur = Number(this.lastState?.frameCount) || 3;
      if (cur > 1) this.sendCommand('SET_FRAMES', { frameCount: cur - 1 });
    });

    this.root.querySelector('#rm-frames-inc')?.addEventListener('click', () => {
      const cur = Number(this.lastState?.frameCount) || 3;
      if (cur < 10) this.sendCommand('SET_FRAMES', { frameCount: cur + 1 });
    });

    this.root.querySelectorAll('[data-preset]').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.sendCommand('LOAD_PRESET', { label: btn.dataset.preset });
      });
    });
  }

  async requestWakeLock() {
    try {
      if ('wakeLock' in navigator) {
        await navigator.wakeLock.request('screen');
      }
    } catch (_) {
      /* optional best-effort */
    }
  }

  async connectSession(pin) {
    if (this.eventSource) {
      this.eventSource.close();
      this.eventSource = null;
    }
    if (this.channel) {
      this.channel.close();
      this.channel = null;
    }

    if (typeof BroadcastChannel !== 'undefined') {
      this.channel = new BroadcastChannel(`framelab-remote-${pin}`);
      this.channel.onmessage = (event) => {
        const msg = event.data;
        if (!msg || msg.sender === this.clientId) return;
        if (msg.kind === 'state' && msg.state) {
          this.hostOnline = true;
          this.renderState(msg.state);
        }
      };
      this.channel.postMessage({ kind: 'controller-hello', sender: this.clientId });
    }

    this.relayAvailable = await probeLocalRelayServer();
    if (!this.relayAvailable) {
      this.updateConnectionPill();
      return;
    }

    try {
      const url = `./api/remote/${encodeURIComponent(pin)}/events?role=controller&clientId=${encodeURIComponent(this.clientId)}`;
      const es = new EventSource(url);
      this.eventSource = es;

      es.addEventListener('session', (event) => {
        const info = JSON.parse(event.data || '{}');
        this.hostOnline = Boolean(info.hostOnline);
        if (info.state) this.renderState(info.state);
        this.updateConnectionPill();
      });

      es.addEventListener('state', (event) => {
        const state = JSON.parse(event.data || 'null');
        if (state) {
          this.hostOnline = true;
          this.renderState(state);
        }
      });

      es.onerror = () => {
        this.updateConnectionPill('reconnecting');
      };
    } catch (_) {
      this.updateConnectionPill('offline');
    }
  }

  updateConnectionPill(override) {
    const pill = this.root.querySelector('#rm-conn-pill');
    if (!pill) return;

    if (override === 'reconnecting') {
      pill.className = 'rm-conn-pill is-waiting';
      pill.textContent = `Reconnecting #${this.pin}...`;
      return;
    }

    if (this.hostOnline) {
      pill.className = 'rm-conn-pill is-live';
      pill.textContent = this.pin === DEFAULT_ROOM_CODE ? 'Projector Live' : `Linked #${this.pin}`;
    } else {
      pill.className = 'rm-conn-pill is-waiting';
      pill.textContent = this.pin === DEFAULT_ROOM_CODE ? 'Searching Wi-Fi...' : `Waiting #${this.pin}`;
    }
  }

  async sendCommand(type, payload = {}) {
    if (!this.pin) return;

    if (this.channel) {
      try {
        this.channel.postMessage({
          kind: 'command',
          sender: this.clientId,
          command: { type, payload, clientId: this.clientId, ts: Date.now() }
        });
      } catch (_) {
        /* ignore */
      }
    }

    if (this.relayAvailable !== true) return;

    try {
      const res = await fetch(`./api/remote/${encodeURIComponent(this.pin)}/command`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type, payload, clientId: this.clientId })
      });
      if (res.ok) {
        const data = await res.json();
        this.hostOnline = Boolean(data?.hostOnline || this.hostOnline);
        this.updateConnectionPill();
      }
    } catch (_) {
      /* BroadcastChannel already handled same-browser fallback if present */
    }
  }

  renderState(state) {
    this.lastState = state;
    this.updateConnectionPill();

    const stepNum = Math.max(0, (Number(state.currentIndex) ?? -1) + 1);
    const total = Number(state.totalSteps) || 0;

    const stepPill = this.root.querySelector('#rm-step-pill');
    if (stepPill) stepPill.textContent = `Step ${stepNum} / ${total}`;

    const metaPill = this.root.querySelector('#rm-meta-pill');
    if (metaPill) metaPill.textContent = `${state.algoKey || 'FIFO'} · ${state.frameCount || 3} Frames`;

    const badge = this.root.querySelector('#rm-outcome-badge');
    if (badge) {
      badge.className = 'rm-outcome-badge';
      if (state.decision === 'HIT') {
        badge.classList.add('is-hit');
        badge.textContent = `HIT F${state.affectedFrameNumber || ''}`;
      } else if (state.decision === 'REPLACE') {
        badge.classList.add('is-replace');
        badge.textContent = `EVICT P${state.evictedPage}`;
      } else if (state.decision === 'LOAD') {
        badge.classList.add('is-fault');
        badge.textContent = `LOAD F${state.affectedFrameNumber || ''}`;
      } else {
        badge.textContent = 'READY';
      }
    }

    const incEl = this.root.querySelector('#rm-incoming-page');
    if (incEl) incEl.textContent = state.requestedPage !== null && state.requestedPage !== undefined ? String(state.requestedPage) : '--';

    const framesStrip = this.root.querySelector('#rm-frames-strip');
    if (framesStrip && Array.isArray(state.frames)) {
      framesStrip.innerHTML = '';
      state.frames.forEach((val, idx) => {
        const chip = document.createElement('div');
        const isActive = idx === state.affectedFrameIndex;
        chip.className = 'rm-frame-chip';
        if (isActive && state.decision === 'HIT') chip.classList.add('is-hit');
        else if (isActive && state.decision === 'REPLACE') chip.classList.add('is-replace');
        else if (isActive && state.decision === 'LOAD') chip.classList.add('is-fault');
        if (val === null || val === undefined) chip.classList.add('is-empty');
        chip.innerHTML = `<span class="rm-frame-idx">F${idx + 1}</span><strong class="rm-frame-val">${val ?? '--'}</strong>`;
        framesStrip.appendChild(chip);
      });
    }

    const setVal = (sel, val) => {
      const el = this.root.querySelector(sel);
      if (el) el.textContent = String(val ?? 0);
    };
    setVal('#rm-stat-faults', state.faults);
    setVal('#rm-stat-hits', state.hits);
    setVal('#rm-stat-replaced', state.replacements);

    const narEl = this.root.querySelector('#rm-narration');
    if (narEl) {
      narEl.textContent = state.explanation || 'Press Next Step or Play to step through page references.';
    }

    const playBtn = this.root.querySelector('#rm-btn-play');
    const playText = this.root.querySelector('#rm-play-text');
    if (playBtn && playText) {
      const playing = Boolean(state.isPlaying);
      playBtn.classList.toggle('is-playing', playing);
      playText.textContent = playing ? '⏸ Pause Auto-Step' : '▶ Play Simulation';
    }

    const prevBtn = this.root.querySelector('#rm-btn-prev');
    const nextBtn = this.root.querySelector('#rm-btn-next');
    if (prevBtn) prevBtn.disabled = stepNum <= 0;
    if (nextBtn) nextBtn.disabled = total === 0 || stepNum >= total;

    const scrubber = this.root.querySelector('#rm-step-scrubber');
    if (scrubber) {
      scrubber.max = String(Math.max(1, total));
      scrubber.value = String(stepNum);
    }

    const speedBadge = this.root.querySelector('#rm-speed-badge');
    const speedSlider = this.root.querySelector('#rm-speed-slider');
    const ms = Number(state.intervalMs) || 1400;
    if (speedBadge) speedBadge.textContent = `${ms} ms`;
    if (speedSlider && document.activeElement !== speedSlider) speedSlider.value = String(ms);

    this.root.querySelectorAll('[data-speed]').forEach((btn) => {
      btn.classList.toggle('is-active', Number(btn.dataset.speed) === ms);
    });

    this.root.querySelectorAll('[data-algo]').forEach((btn) => {
      btn.classList.toggle('is-active', btn.dataset.algo === state.algoKey);
    });

    this.root.querySelectorAll('[data-view]').forEach((btn) => {
      btn.classList.toggle('is-active', btn.dataset.view === (state.view || 'sim'));
    });

    const framesVal = this.root.querySelector('#rm-frames-val');
    if (framesVal) framesVal.textContent = String(state.frameCount || 3);

    const classBtn = this.root.querySelector('#rm-btn-class-view');
    if (classBtn) {
      const on = Boolean(state.classView);
      classBtn.classList.toggle('is-active', on);
      classBtn.textContent = `Class View: ${on ? 'On' : 'Off'}`;
    }

    this.root.querySelectorAll('[data-preset]').forEach((btn) => {
      btn.classList.toggle('is-active', btn.dataset.preset === state.activePreset);
    });

    const beladyBtn = this.root.querySelector('#rm-btn-belady-proof');
    if (beladyBtn) {
      beladyBtn.hidden = state.view !== 'learn';
    }
  }
}
