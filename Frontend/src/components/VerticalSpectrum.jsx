import { useEffect, useRef } from 'react'

const MAX = 220

/**
 * Espectro de audio vertical (solo el canvas, sin portada, botones ni título).
 *
 * Props:
 *  - analyser  AnalyserNode de Web Audio. Sin él, las barras quedan en reposo (puntos).
 *  - playing   boolean. En false las barras vuelven a puntos.
 *  - width     ancho máximo de las barras en px (por defecto 22)
 *  - span      fracción del alto que ocupa, centrado (por defecto 0.7)
 *  - pitch     separación aproximada entre barras en px (por defecto 5)
 *  - minBars   mínimo de barras (por defecto 36)
 *  - maxBars   máximo de barras (por defecto 220)
 *  - thickness grosor máximo de cada barra en px (por defecto 1.6)
 *  - amplitude fracción del ancho disponible que puede alcanzar (por defecto 1)
 *
 * El color es el `color` CSS del contenedor. El alto es el 100 % del contenedor.
 */
export default function VerticalSpectrum({ analyser, playing = true, width = 22, span = 0.7, pitch = 5, minBars = 36, maxBars = MAX, thickness = 1.6, amplitude = 1 }) {
  const cvRef = useRef(null)
  const live = useRef({ playing, analyser })

  useEffect(() => { live.current = { playing, analyser } }, [playing, analyser])

  useEffect(() => {
    const cv = cvRef.current
    const g = cv.getContext('2d')
    const vals = new Float32Array(MAX)
    const target = new Float32Array(MAX)
    const env = new Float32Array(MAX)
    const avg = new Float32Array(MAX).fill(0.25)
    const cache = { an: null, n: 0, edges: null, spec: null }
    let N = 100, W = 0, H = 0, dpr = 1, raf = 0

    const resize = () => {
      const r = cv.getBoundingClientRect()
      dpr = Math.min(window.devicePixelRatio || 1, 2)
      W = r.width; H = r.height
      cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr)
      N = Math.max(minBars, Math.min(maxBars, Math.round((H * span) / pitch / 2) * 2)) // par
      for (let i = 0; i < N; i++) {
        const c = (i - (N - 1) / 2) / (N / 2)
        env[i] = 0.3 + 0.7 * Math.pow(Math.cos((c * Math.PI) / 2), 1.2) // campana suave: las puntas sí reaccionan
      }
    }
    const ro = new ResizeObserver(resize)
    ro.observe(cv)
    resize()

    const prepare = (an) => {
      an.fftSize = 4096              // más resolución: las bandas graves ya no se repiten
      an.smoothingTimeConstant = 0.5 // por defecto es 0.8 y vuelve todo lento
      an.minDecibels = -88           // por defecto -100/-30 comprime el rango y aplana las barras
      an.maxDecibels = -22
      const hz = an.context.sampleRate / an.fftSize
      const fmin = 45, fmax = Math.min(12000, an.context.sampleRate / 2.2)
      cache.edges = Array.from({ length: N + 1 }, (_, k) => (fmin * Math.pow(fmax / fmin, k / N)) / hz)
      cache.spec = new Uint8Array(an.frequencyBinCount)
      cache.an = an; cache.n = N
    }

    const jit = (i) => 0.82 + 0.3 * Math.abs((Math.sin(i * 12.9898) * 43758.5453) % 1)

    const audioTargets = (an) => {
      if (cache.an !== an || cache.n !== N) prepare(an)
      const { edges, spec } = cache
      an.getByteFrequencyData(spec)
      const bands = new Float32Array(N)
      for (let k = 0; k < N; k++) {
        const lo = Math.floor(edges[k])
        const hi = Math.max(lo + 1, Math.ceil(edges[k + 1]))
        let s = 0, m = 0
        for (let i = lo; i < hi; i++) { s += spec[i]; if (spec[i] > m) m = spec[i] }
        const x = Math.min(1, ((0.4 * (s / (hi - lo)) + 0.6 * m) / 255) * (1 + 1.8 * (k / N)))
        avg[k] += (x - avg[k]) * 0.006
        const rel = Math.max(0, (x - avg[k] * 0.85) / (avg[k] * 1.1 + 0.12))
        bands[k] = Math.min(1, 0.6 * Math.min(1, rel * 0.85) + 0.4 * Math.pow(x, 1.4))
      }
      const half = N / 2
      for (let j = 0; j < half; j++) { // graves al centro, agudos hacia las puntas
        const a = half - 1 - j, b = half + j
        target[a] = Math.min(1, Math.pow(bands[2 * j] * env[a] * jit(a) * 1.3, 1.1))
        target[b] = Math.min(1, Math.pow(bands[2 * j + 1] * env[b] * jit(b) * 1.3, 1.1))
      }
    }

    const fallbackTargets = (now) => {
      const time = now / 1000
      for (let i = 0; i < N; i++) {
        const pulse = Math.sin(time * 4.2 + i * 0.68) * 0.5 + 0.5
        const ripple = Math.sin(time * 1.9 - i * 0.27) * 0.5 + 0.5
        target[i] = (0.05 + pulse * ripple * 0.28) * env[i]
      }
    }

    const pill = (x, y, w, h) => {
      const r = h / 2
      g.beginPath()
      if (g.roundRect) g.roundRect(x, y, w, h, r)
      else {
        g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r)
        g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath()
      }
      g.fill()
    }

    let last = performance.now()
    const frame = (now) => {
      const dt = Math.min(0.05, (now - last) / 1000)
      last = now
      const { playing: p, analyser: an } = live.current
      if (p && an && an.context.state === 'running') audioTargets(an)
      else if (p) fallbackTargets(now)
      else target.fill(0)

      // ataque rápido y firme, caída suave (independiente de los fps)
      const up = 1 - Math.pow(1 - 0.55, dt * 60)
      const down = 1 - Math.pow(1 - 0.16, dt * 60)
      for (let i = 0; i < N; i++) vals[i] += (target[i] - vals[i]) * (target[i] > vals[i] ? up : down)

      g.setTransform(dpr, 0, 0, dpr, 0, 0)
      g.clearRect(0, 0, W, H)
      g.fillStyle = getComputedStyle(cv).color
      const total = H * span, y0 = (H - total) / 2, step = total / N
      const t = Math.min(step * 0.72, thickness)
      for (let i = 0; i < N; i++) {
        const w = t + vals[i] * (W - t) * amplitude // punto en reposo
        pill(W / 2 - w / 2, y0 + i * step + (step - t) / 2, w, t)
      }
      raf = requestAnimationFrame(frame)
    }
    raf = requestAnimationFrame(frame)
    return () => { cancelAnimationFrame(raf); ro.disconnect() }
  }, [amplitude, maxBars, minBars, pitch, span, thickness])

  return (
    <canvas
      ref={cvRef}
      style={{ width, height: '100%', display: 'block' }}
      aria-label="Espectro de audio vertical"
    />
  )
}
