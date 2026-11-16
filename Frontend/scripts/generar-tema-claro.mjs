#!/usr/bin/env node
// Genera src/styles/tema-claro.generated.css: la versión clara de TODO el CSS de la app, sin editar a mano 800 colores.
//
// Cómo: por cada regla que fija colores (color, fondos, bordes, fill, variables con color...) emite la misma regla
// precedida por :root[data-theme='light'] con los colores invertidos en luminosidad (OKLab: L' = 1 - L², mismo
// tono y croma). Los blancos translúcidos pasan a negros translúcidos, los fondos casi negros a casi blancos y el
// texto claro a oscuro. Los colores vivos (acento naranja, verde del "me gusta", rojos) no se tocan. Las sombras
// (box-shadow, text-shadow, filter) tampoco: una sombra no debe volverse un resplandor.
//
// Uso: node scripts/generar-tema-claro.mjs [--check]   (--check falla si el archivo generado no está al día)
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import postcss from 'postcss'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const SRC = path.join(ROOT, 'src')
const OUT = path.join(SRC, 'styles', 'tema-claro.generated.css')
const LIGHT = ":root[data-theme='light']"
const CHROMA_KEEP = 0.1 // por encima de este croma el color se considera "de marca" y se conserva

const COLOR_PROPS = /^(color|background|background-color|background-image|border(-(top|right|bottom|left|block|inline)(-(start|end))?)?(-color)?|outline(-color)?|fill|stroke|stop-color|caret-color|accent-color|column-rule(-color)?|text-decoration(-color)?|--.+)$/i
const SKIP_AT = new Set(['keyframes', '-webkit-keyframes', 'font-face', 'property', 'counter-style', 'page'])

// ---------- color ----------
const clamp01 = (value) => Math.min(1, Math.max(0, value))
const toLinear = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)
const fromLinear = (c) => (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055)

function rgbToOklab([r, g, b]) {
  const [lr, lg, lb] = [r, g, b].map(toLinear)
  const l = Math.cbrt(0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb)
  const m = Math.cbrt(0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb)
  const s = Math.cbrt(0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb)
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ]
}

function oklabToRgb([L, a, b]) {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ].map((c) => clamp01(fromLinear(c)))
}

const lightnessFor = (L) => clamp01(1 - L * L)

/** Invierte la luminosidad de un color sRGB (0-1). Devuelve null si es un color de marca (no se toca). */
function invert(rgb) {
  const [L, a, b] = rgbToOklab(rgb)
  if (Math.hypot(a, b) > CHROMA_KEEP) return null
  return oklabToRgb([lightnessFor(L), a, b])
}

const hex2 = (value) => Math.round(clamp01(value) * 255).toString(16).padStart(2, '0')
const fmtAlpha = (alpha) => (alpha >= 0.999 ? '' : ` / ${Number(alpha.toFixed(3))}`)
const toCss = (rgb, alpha) => `rgb(${rgb.map((c) => Math.round(c * 255)).join(' ')}${fmtAlpha(alpha)})`

function parseHex(token) {
  let hex = token.slice(1)
  if (![3, 4, 6, 8].includes(hex.length)) return null
  if (hex.length <= 4) hex = [...hex].map((c) => c + c).join('')
  const n = (i) => Number.parseInt(hex.slice(i, i + 2), 16) / 255
  return { rgb: [n(0), n(2), n(4)], alpha: hex.length === 8 ? n(6) : 1 }
}

function parseChannels(body) {
  const parts = body.replace(/[,/]/g, ' ').trim().split(/\s+/)
  if (parts.length < 3) return null
  const channel = (text) => (text.endsWith('%') ? Number.parseFloat(text) / 100 : Number.parseFloat(text) / 255)
  const rgb = parts.slice(0, 3).map(channel)
  let alpha = 1
  if (parts[3] !== undefined) alpha = parts[3].endsWith('%') ? Number.parseFloat(parts[3]) / 100 : Number.parseFloat(parts[3])
  return rgb.some(Number.isNaN) || Number.isNaN(alpha) ? null : { rgb, alpha }
}

function convertOklch(body) {
  const parts = body.replace(/\//g, ' / ').trim().split(/\s+/)
  const slash = parts.indexOf('/')
  const channels = slash === -1 ? parts : parts.slice(0, slash)
  if (channels.length < 3 || channels.some((part) => part === 'from' || part.includes('('))) return null
  const [lightness, chroma, hue] = channels
  const L = lightness.endsWith('%') ? Number.parseFloat(lightness) / 100 : Number.parseFloat(lightness)
  const C = Number.parseFloat(chroma)
  if ([L, C].some(Number.isNaN) || C > CHROMA_KEEP) return null
  const alphaText = slash === -1 ? '' : ` / ${parts.slice(slash + 1).join(' ')}`
  return `oklch(${Number(lightnessFor(L).toFixed(4))} ${chroma} ${hue}${alphaText})`
}

const TOKEN = /#[0-9a-fA-F]{3,8}\b|\brgba?\(([^()]*)\)|\boklch\(([^()]*)\)|\b(white|black)\b/gi

/** Sustituye cada color del valor por su versión clara. Lo que no entiende lo deja igual. */
function lightenValue(value) {
  return value.replace(TOKEN, (token, rgbBody, oklchBody, keyword) => {
    let parsed = null
    if (token.startsWith('#')) parsed = parseHex(token)
    else if (rgbBody !== undefined) parsed = parseChannels(rgbBody)
    else if (oklchBody !== undefined) return convertOklch(oklchBody) ?? token
    else if (keyword) parsed = { rgb: keyword.toLowerCase() === 'white' ? [1, 1, 1] : [0, 0, 0], alpha: 1 }
    if (!parsed) return token
    const inverted = invert(parsed.rgb)
    if (!inverted) return token
    return toCss(inverted, parsed.alpha)
  })
}

// ---------- reglas ----------
function lightSelector(selector) {
  const sel = selector.trim()
  if (sel.startsWith(':root')) return LIGHT + sel.slice(':root'.length)
  if (/^html\b/.test(sel)) return `html[data-theme='light']${sel.slice(4)}`
  return `${LIGHT} ${sel}`
}

function collectCssFiles(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) collectCssFiles(full, out)
    else if (entry.name.endsWith('.css') && !entry.name.endsWith('.generated.css')) out.push(full)
  }
  return out
}

function atRuleChain(node) {
  const chain = []
  for (let parent = node.parent; parent && parent.type !== 'root'; parent = parent.parent) {
    if (parent.type === 'rule') return null // CSS anidado: no se transforma
    if (parent.type === 'atrule') {
      if (SKIP_AT.has(parent.name.toLowerCase())) return null
      chain.unshift(parent)
    }
  }
  return chain
}

function lightRuleFor(rule) {
  const decls = []
  rule.each((child) => {
    if (child.type !== 'decl' || !COLOR_PROPS.test(child.prop)) return
    const lightened = lightenValue(child.value)
    // Se emiten TODAS las declaraciones de color de la regla, también las que no cambian (var(), transparent, none...):
    // el selector claro pesa más que el original, y si se omitieran, una regla anterior ya invertida ganaría a una
    // posterior que en oscuro la pisaba (p. ej. el botón de play, cuyo fondo es var(--player-accent)).
    decls.push(postcss.decl({ prop: child.prop, value: lightened, important: child.important }))
  })
  if (!decls.length) return null
  const selectors = rule.selectors.filter((selector) => !selector.includes('&')).map(lightSelector)
  return selectors.length ? postcss.rule({ selectors, nodes: decls }) : null
}
function generate() {
  const files = collectCssFiles(SRC).sort()
  const output = postcss.root()
  const groups = new Map()
  let rules = 0
  for (const file of files) {
    const root = postcss.parse(fs.readFileSync(file, 'utf8'), { from: file })
    root.walkRules((rule) => {
      const chain = atRuleChain(rule)
      if (!chain) return
      const lightRule = lightRuleFor(rule)
      if (!lightRule) return
      let container = output
      let key = ''
      for (const at of chain) {
        key += `${at.name}(${at.params})>`
        if (!groups.has(key)) {
          const wrapper = postcss.atRule({ name: at.name, params: at.params })
          container.append(wrapper)
          groups.set(key, wrapper)
        }
        container = groups.get(key)
      }
      container.append(lightRule)
      rules += 1
    })
  }
  const header = '/* Generado por scripts/generar-tema-claro.mjs a partir del CSS de la app: no editar a mano.\n   Cambia el CSS original y ejecuta "npm run tema:generar". */\n'
  return { css: header + output.toString().replace(/\n{3,}/g, '\n\n') + '\n', rules }
}

const { css, rules } = generate()
if (process.argv.includes('--check')) {
  const current = fs.existsSync(OUT) ? fs.readFileSync(OUT, 'utf8') : ''
  if (current !== css) {
    console.error('tema-claro.generated.css no está al día: ejecuta "npm run tema:generar".')
    process.exit(1)
  }
  console.log(`tema-claro.generated.css al día (${rules} reglas).`)
} else {
  fs.writeFileSync(OUT, css)
  console.log(`tema-claro.generated.css: ${rules} reglas, ${(css.length / 1024).toFixed(0)} KB.`)
}
