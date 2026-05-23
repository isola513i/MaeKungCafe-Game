// ---------------------------------------------------------------------------
// Procedural SFX via Web Audio API.
//
// All sounds are synthesized from oscillators with short ADSR-ish envelopes,
// so no audio files are bundled. The AudioContext is created lazily on the
// first play* call — which is always invoked from a user-gesture handler in
// main.ts — to satisfy browser autoplay policies.
// ---------------------------------------------------------------------------

type AudioContextCtor = typeof AudioContext;

interface LegacyWindow {
	webkitAudioContext?: AudioContextCtor;
}

let ctx: AudioContext | null = null;

function getCtx(): AudioContext | null {
	if (ctx) {
		if (ctx.state === "suspended") {
			void ctx.resume().catch(() => {});
		}
		return ctx;
	}
	const AC: AudioContextCtor | undefined =
		window.AudioContext ??
		(window as unknown as LegacyWindow).webkitAudioContext;
	if (!AC) return null;
	try {
		ctx = new AC();
	} catch {
		return null;
	}
	return ctx;
}

interface ToneOptions {
	type: OscillatorType;
	freq: number;
	startOffset?: number;
	duration: number;
	peak: number;
	freqEnd?: number;
}

function tone(c: AudioContext, opts: ToneOptions): void {
	const start = c.currentTime + (opts.startOffset ?? 0);
	const osc = c.createOscillator();
	const gain = c.createGain();

	osc.type = opts.type;
	osc.frequency.setValueAtTime(opts.freq, start);
	if (opts.freqEnd !== undefined) {
		osc.frequency.exponentialRampToValueAtTime(
			Math.max(opts.freqEnd, 1),
			start + opts.duration,
		);
	}

	// Tiny attack then exponential decay to a near-silent target. We never
	// ramp exactly to 0 because exponentialRampToValueAtTime forbids it.
	gain.gain.setValueAtTime(0.0001, start);
	gain.gain.exponentialRampToValueAtTime(opts.peak, start + 0.01);
	gain.gain.exponentialRampToValueAtTime(0.0001, start + opts.duration);

	osc.connect(gain);
	gain.connect(c.destination);
	osc.start(start);
	osc.stop(start + opts.duration + 0.05);
}

/** Short high-pitched pop. Used on Cook/Brew button presses. */
export function playClick(): void {
	const c = getCtx();
	if (!c) return;
	tone(c, { type: "square", freq: 880, duration: 0.07, peak: 0.08 });
}

/** Cheerful 2-note rising chime (C5 -> E5) for a Perfect order served. */
export function playSuccess(): void {
	const c = getCtx();
	if (!c) return;
	tone(c, { type: "triangle", freq: 523.25, duration: 0.13, peak: 0.12 });
	tone(c, {
		type: "triangle",
		freq: 659.25,
		startOffset: 0.1,
		duration: 0.18,
		peak: 0.12,
	});
}

/** Short downward buzz for wasted / burnt items. */
export function playFail(): void {
	const c = getCtx();
	if (!c) return;
	tone(c, {
		type: "sawtooth",
		freq: 220,
		freqEnd: 110,
		duration: 0.24,
		peak: 0.1,
	});
}

/** Bright sparkly "ching" for coin gains / upgrade purchases. */
export function playCoin(): void {
	const c = getCtx();
	if (!c) return;
	tone(c, { type: "sine", freq: 1568, duration: 0.25, peak: 0.07 }); // G6
	tone(c, {
		type: "sine",
		freq: 2349,
		startOffset: 0.04,
		duration: 0.22,
		peak: 0.06,
	}); // D7
}

// ---------------------------------------------------------------------------
// Background music
//
// A simple looped <audio> element. We don't pipe it through the Web Audio
// graph because the procedural SFX above are already loud enough on their
// own; keeping BGM on the native element also lets the browser handle
// streaming/decoding of the mp3 efficiently.
// ---------------------------------------------------------------------------

const BGM_SRC = "/mochi-cafe-morning.mp3";
const BGM_DEFAULT_VOLUME = 0.32;

let bgm: HTMLAudioElement | null = null;
let bgmMuted = false;

function getBgm(): HTMLAudioElement {
	if (bgm) return bgm;
	const el = new Audio(BGM_SRC);
	el.loop = true;
	el.preload = "auto";
	el.volume = BGM_DEFAULT_VOLUME;
	bgm = el;
	return el;
}

/**
 * Starts the looping background music. Safe to call multiple times — once
 * the track is playing further calls are no-ops. Must be invoked from a
 * user-gesture handler the first time, due to browser autoplay policy.
 */
export function startBgm(): void {
	const el = getBgm();
	if (bgmMuted) return;
	if (!el.paused) return;
	void el.play().catch(() => {
		// Autoplay was blocked or the user hasn't interacted yet. We'll
		// retry on the next user gesture via main.ts's first-interaction
		// handler.
	});
}

/**
 * Toggles BGM mute state. Returns the new muted state so the UI can
 * update its icon/label.
 */
export function toggleBgmMute(): boolean {
	bgmMuted = !bgmMuted;
	const el = getBgm();
	if (bgmMuted) {
		el.pause();
	} else {
		void el.play().catch(() => {});
	}
	return bgmMuted;
}

/** Whether BGM is currently muted by the user. */
export function isBgmMuted(): boolean {
	return bgmMuted;
}
