/**
 * A quiet tick on each beat, through Web Audio: a few sounds made on the
 * spot, no audio files. Ticks are scheduled a little ahead on the audio
 * clock, so they land on time however late a frame is; a seek or a pause
 * takes back the ones not yet heard.
 */

export type Sound = 'click' | 'wood' | 'tick' | 'pop'

export interface Metronome {
  /** Schedule a tick `inMs` of real time from now. `accent` is a beat (a bottom); a top ticks softer. */
  tick: (inMs: number, volume: number, accent: boolean, sound: Sound) => void
  /** Four beats of a sound, now: for picking one. */
  preview: (sound: Sound, volume: number) => void
  /** Take back every tick not heard yet (seek, pause, panic). */
  cancel: () => void
  close: () => void
}

/** How far ahead to schedule: more than a frame, less than a beat. */
export const SCHEDULE_AHEAD_MS = 120

/** How long each sound rings, s. */
export const SOUND_LENGTH: Record<Sound, number> = { click: 0.03, wood: 0.09, tick: 0.07, pop: 0.12 }

export function createMetronome(): Metronome {
  let ac: AudioContext | null = null
  let noise: AudioBuffer | null = null
  let pending: { node: AudioScheduledSourceNode, end: number }[] = []

  function context(): AudioContext | null {
    if (!ac) {
      try {
        ac = new AudioContext({ latencyHint: 'interactive' })
      }
      catch {
        return null
      }
    }
    if (ac.state === 'suspended')
      void ac.resume().catch(() => {})
    return ac
  }

  function noiseBuffer(a: AudioContext): AudioBuffer {
    if (!noise) {
      noise = a.createBuffer(1, Math.round(a.sampleRate * 0.05), a.sampleRate)
      const d = noise.getChannelData(0)
      // A fixed pattern, so every click sounds the same.
      let s = 12345
      for (let i = 0; i < d.length; i++) {
        s = (s * 1103515245 + 12345) & 0x7FFFFFFF
        d[i] = (s / 0x3FFFFFFF - 1) * (1 - i / d.length)
      }
    }
    return noise
  }

  /** A gain that rises in 3 ms and dies away by `len`. */
  function envelope(a: AudioContext, at: number, peak: number, len: number): GainNode {
    const g = a.createGain()
    g.gain.setValueAtTime(0.0001, at)
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), at + 0.003)
    g.gain.exponentialRampToValueAtTime(0.0001, at + len)
    g.connect(a.destination)
    return g
  }

  function play(a: AudioContext, at: number, volume: number, accent: boolean, sound: Sound) {
    const v = Math.min(1, volume) * (accent ? 1 : 0.5)
    const len = SOUND_LENGTH[sound]
    const nodes: AudioScheduledSourceNode[] = []
    if (sound === 'click') {
      // A short burst of noise, filtered to a soft click.
      const src = a.createBufferSource()
      src.buffer = noiseBuffer(a)
      const f = a.createBiquadFilter()
      f.type = 'bandpass'
      f.frequency.value = accent ? 3200 : 2600
      f.Q.value = 1.4
      src.connect(f).connect(envelope(a, at, v * 0.9, len))
      nodes.push(src)
    }
    else if (sound === 'wood') {
      // Two inharmonic partials, dying fast: a wood block.
      for (const [freq, share] of [[accent ? 1150 : 980, 0.32], [accent ? 1720 : 1470, 0.14]] as const) {
        const o = a.createOscillator()
        o.type = 'sine'
        o.frequency.value = freq
        o.connect(envelope(a, at, v * share, len * (share > 0.2 ? 1 : 0.6)))
        nodes.push(o)
      }
    }
    else if (sound === 'pop') {
      // A sine falling in pitch: a soft pop.
      const o = a.createOscillator()
      o.type = 'sine'
      o.frequency.setValueAtTime(accent ? 760 : 620, at)
      o.frequency.exponentialRampToValueAtTime(accent ? 300 : 260, at + 0.07)
      o.connect(envelope(a, at, v * 0.4, len))
      nodes.push(o)
    }
    else {
      const o = a.createOscillator()
      o.type = 'triangle'
      o.frequency.value = accent ? 1250 : 900
      o.connect(envelope(a, at, v * 0.35, len))
      nodes.push(o)
    }
    for (const n of nodes) {
      n.start(at)
      n.stop(at + len + 0.01)
      pending.push({ node: n, end: at + len + 0.01 })
    }
  }

  function tick(inMs: number, volume: number, accent: boolean, sound: Sound) {
    if (volume <= 0)
      return
    const a = context()
    if (!a || a.state !== 'running')
      return
    pending = pending.filter(p => p.end >= a.currentTime)
    // Sound leaves the speakers outputLatency after it is scheduled: start that much sooner.
    const lag = a.outputLatency || a.baseLatency || 0
    play(a, Math.max(a.currentTime, a.currentTime + inMs / 1000 - lag), volume, accent, sound)
  }

  function preview(sound: Sound, volume: number) {
    const a = context()
    if (!a)
      return
    const go = () => {
      const t0 = a.currentTime + 0.05
      for (let i = 0; i < 4; i++)
        play(a, t0 + i * 0.45, Math.max(0.05, volume), i % 2 === 0, sound)
    }
    if (a.state === 'running')
      go()
    else
      void a.resume().then(go, () => {})
  }

  function cancel() {
    if (!ac)
      return
    const now = ac.currentTime
    for (const p of pending) {
      try {
        if (p.end > now)
          p.node.stop()
      }
      catch {}
    }
    pending = []
  }

  function close() {
    cancel()
    void ac?.close().catch(() => {})
    ac = null
    noise = null
  }

  return { tick, preview, cancel, close }
}
