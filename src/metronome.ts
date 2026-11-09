/**
 * A quiet tick on each beat, through Web Audio. Ticks are scheduled a little
 * ahead on the audio clock, so they land on time however late a frame is;
 * a seek or a pause takes back the ones not yet heard.
 */

export interface Metronome {
  /** Schedule a tick `inMs` of real time from now. `accent` is a beat (a bottom); a top ticks softer. */
  tick: (inMs: number, volume: number, accent: boolean) => void
  /** Take back every tick not heard yet (seek, pause, panic). */
  cancel: () => void
  close: () => void
}

/** How far ahead to schedule: more than a frame, less than a beat. */
export const SCHEDULE_AHEAD_MS = 120

export function createMetronome(): Metronome {
  let ac: AudioContext | null = null
  let pending: { osc: OscillatorNode, end: number }[] = []

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

  function tick(inMs: number, volume: number, accent: boolean) {
    if (volume <= 0)
      return
    const a = context()
    if (!a || a.state !== 'running')
      return
    pending = pending.filter(p => p.end >= a.currentTime)
    // Sound leaves the speakers outputLatency after it is scheduled: start that much sooner.
    const lag = (a.outputLatency || a.baseLatency || 0)
    const at = Math.max(a.currentTime, a.currentTime + inMs / 1000 - lag)
    const osc = a.createOscillator()
    const gain = a.createGain()
    osc.type = 'triangle'
    osc.frequency.value = accent ? 1250 : 900
    const peak = Math.min(1, volume) * (accent ? 0.35 : 0.18)
    gain.gain.setValueAtTime(0.0001, at)
    gain.gain.exponentialRampToValueAtTime(peak, at + 0.004)
    gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.06)
    osc.connect(gain).connect(a.destination)
    osc.start(at)
    osc.stop(at + 0.07)
    pending.push({ osc, end: at + 0.07 })
  }

  function cancel() {
    if (!ac)
      return
    const now = ac.currentTime
    for (const p of pending) {
      try {
        if (p.end > now)
          p.osc.stop()
      }
      catch {}
    }
    pending = []
  }

  function close() {
    cancel()
    void ac?.close().catch(() => {})
    ac = null
  }

  return { tick, cancel, close }
}
