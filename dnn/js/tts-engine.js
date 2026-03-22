// ═══════════════════════════════════════════════════════════════════════════
// DNN TTS Engine
// Currently uses Web Speech API for instant, zero-download TTS.
// Kokoro integration preserved but disabled — can be enabled later
// for higher quality neural voices.
// ═══════════════════════════════════════════════════════════════════════════

// Set to true to attempt Kokoro loading (slow, ~80MB download)
const USE_KOKORO = false;

const KOKORO_MODEL = 'onnx-community/Kokoro-82M-v1.0-ONNX';
const KOKORO_DTYPE = 'q4f16';
const KOKORO_DEVICE = 'wasm';
const DEFAULT_VOICE = 'af_heart';

class TTSEngine {
  constructor() {
    this.kokoro = null;
    this.ready = false;
    this.useFallback = true;
    this.voice = DEFAULT_VOICE;
    this._audioCtx = null;
    this._currentSource = null;
    this._speaking = false;
    this._webVoice = null;  // Cached Web Speech voice
  }

  async init(onProgress) {
    this._audioCtx = new (window.AudioContext || window.webkitAudioContext)();

    if (!USE_KOKORO) {
      // Pre-load Web Speech voices (Chrome loads async)
      await this._loadWebVoices();
      onProgress?.({ percent: 100, label: 'Voice engine ready' });
      this.useFallback = true;
      this.ready = true;
      console.log(`[DNN TTS] Using Web Speech API. Voice: ${this._webVoice?.name || 'default'}`);
      return false;
    }

    // Kokoro path (disabled by default)
    try {
      onProgress?.({ percent: 5, label: 'Loading Kokoro TTS library…' });
      const { KokoroTTS } = await import(
        /* webpackIgnore: true */
        'https://cdn.jsdelivr.net/npm/kokoro-js@1.2.1/+esm'
      );
      onProgress?.({ percent: 20, label: 'Downloading voice model…' });
      this.kokoro = await KokoroTTS.from_pretrained(KOKORO_MODEL, {
        dtype: KOKORO_DTYPE,
        device: KOKORO_DEVICE,
        progress_callback: (progress) => {
          if (progress.status === 'progress' && progress.total) {
            const pct = 20 + Math.round((progress.loaded / progress.total) * 70);
            onProgress?.({ percent: pct, label: 'Downloading voice model…' });
          }
        }
      });
      onProgress?.({ percent: 100, label: 'Ready' });
      this.ready = true;
      this.useFallback = false;
      return true;
    } catch (err) {
      console.warn('[DNN TTS] Kokoro failed, using Web Speech:', err);
      onProgress?.({ percent: 100, label: 'Using browser voice' });
      this.useFallback = true;
      this.ready = true;
      return false;
    }
  }

  setVoice(voiceId) {
    this.voice = voiceId;
  }

  /**
   * Speak a line of text. Returns a promise that resolves when done.
   */
  async speak(text, opts = {}) {
    const { onStart, onEnd, onError } = opts;

    if (this.useFallback) {
      return this._speakWebSpeech(text, { onStart, onEnd, onError });
    }

    // Kokoro path
    try {
      this._speaking = true;
      onStart?.();
      const audio = await this.kokoro.generate(text, { voice: opts.voice || this.voice });
      const sampleRate = audio.sampling_rate || 24000;
      const audioData = audio.data || audio.audio;
      const buffer = this._audioCtx.createBuffer(1, audioData.length, sampleRate);
      buffer.getChannelData(0).set(audioData);

      if (this._audioCtx.state === 'suspended') await this._audioCtx.resume();

      const source = this._audioCtx.createBufferSource();
      source.buffer = buffer;
      source.connect(this._audioCtx.destination);
      this._currentSource = source;

      return new Promise((resolve) => {
        source.onended = () => {
          this._speaking = false;
          this._currentSource = null;
          onEnd?.();
          resolve();
        };
        source.start(0);
      });
    } catch (err) {
      console.error('[DNN TTS] Kokoro error, falling back:', err);
      this._speaking = false;
      return this._speakWebSpeech(text, { onStart, onEnd, onError });
    }
  }

  stop() {
    if (this._currentSource) {
      try { this._currentSource.stop(); } catch (e) {}
      this._currentSource = null;
    }
    window.speechSynthesis?.cancel();
    this._speaking = false;
  }

  get isSpeaking() {
    return this._speaking;
  }

  // ─── Web Speech API ────────────────────────────────────────────────────

  _loadWebVoices() {
    return new Promise((resolve) => {
      const pick = () => {
        const voices = window.speechSynthesis.getVoices();
        console.log(`[DNN TTS] Available voices: ${voices.length}`);
        if (voices.length === 0) return false;

        // Log all English voices for debugging
        const en = voices.filter(v => v.lang.startsWith('en'));
        console.log('[DNN TTS] English voices:', en.map(v => `${v.name} (${v.lang})`).join(', '));

        // Prefer female English voices
        this._webVoice = voices.find(v =>
          v.lang.startsWith('en') && (
            v.name.includes('Samantha') || v.name.includes('Karen') ||
            v.name.includes('Moira') || v.name.includes('Tessa') ||
            v.name.includes('Fiona') || v.name.includes('Victoria') ||
            v.name.includes('Google UK English Female')
          )
        ) || voices.find(v => v.lang.startsWith('en') && v.name.toLowerCase().includes('female'))
          || voices.find(v => v.lang.startsWith('en-'));

        console.log(`[DNN TTS] Selected voice: ${this._webVoice?.name || 'browser default'}`);
        return true;
      };

      // Try immediately
      if (pick()) { resolve(); return; }

      // Chrome loads voices async — wait for event
      window.speechSynthesis.onvoiceschanged = () => {
        pick();
        resolve();
      };

      // Fallback timeout
      setTimeout(resolve, 2000);
    });
  }

  _speakWebSpeech(text, { onStart, onEnd, onError }) {
    return new Promise((resolve) => {
      if (!window.speechSynthesis) {
        console.warn('[DNN TTS] speechSynthesis not available');
        onError?.('not available');
        resolve();
        return;
      }

      const utt = new SpeechSynthesisUtterance(text);
      utt.rate = 0.88;
      utt.pitch = 0.95;
      utt.volume = 1.0;

      if (this._webVoice) {
        utt.voice = this._webVoice;
      }

      console.log(`[DNN TTS] Speaking: "${text.slice(0, 40)}…"`);

      utt.onstart = () => {
        console.log('[DNN TTS] onstart fired');
        this._speaking = true;
        onStart?.();
      };
      utt.onend = () => {
        console.log('[DNN TTS] onend fired');
        this._speaking = false;
        onEnd?.();
        resolve();
      };
      utt.onerror = (e) => {
        console.warn('[DNN TTS] onerror fired:', e?.error || e);
        this._speaking = false;
        onError?.(e);
        resolve();
      };

      window.speechSynthesis.cancel();
      window.speechSynthesis.speak(utt);
    });
  }
}

export const tts = new TTSEngine();
