import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { createServer } from 'vite'
const { JSDOM } = createRequire(new URL('../Backend/package.json', import.meta.url))('jsdom')
const dom = new JSDOM('<div id="root"></div>', { url: 'http://localhost/' })
for (const key of ['window', 'document', 'localStorage', 'HTMLElement']) globalThis[key] = dom.window[key]
globalThis.IS_REACT_ACT_ENVIRONMENT = true
const listeners = new Set()
globalThis.BroadcastChannel = class {
  addEventListener(_name, listener) { this.listener = listener; listeners.add(listener) }
  postMessage(data) { for (const listener of listeners) listener({ data }) }
  close() { listeners.delete(this.listener) }
}
const server = await createServer({ configFile: false, server: { middlewareMode: true, hmr: false }, optimizeDeps: { noDiscovery: true }, appType: 'custom' })
try {
  const [React, { createRoot }, bridge, { default: useGlobalMiniPlayer }] = await Promise.all([
    import('react'),
    import('react-dom/client'),
    server.ssrLoadModule('/src/features/mini-player/playerBridge.ts'),
    server.ssrLoadModule('/src/features/mini-player/useGlobalMiniPlayer.js'),
  ])
  const calls = []
  const player = { currentSong: { id: 'g1', title: 'Global', thumbnail: '/cover.jpg' }, queue: [{ id: 'g1' }, { id: 'g2' }], currentTime: 12, progressMax: 100, volume: 0.4, isPlaying: true,
    togglePlay: () => calls.push('toggle'), playNext: () => calls.push('next'), playPrev: () => calls.push('previous'),
    setVolume: (value) => calls.push(['volume', value]), handleSeek: () => {}, commitSeek: (e) => calls.push(['seek', e.target.value]), playFrom: (_queue, index) => calls.push(['select', index]) }
  const browse = { openArtist: (id) => calls.push(['artist', id]), openAlbum: (id) => calls.push(['album', id]) }
  function Harness() { useGlobalMiniPlayer(player, browse); return null }
  const root = createRoot(document.getElementById('root'))
  await React.act(async () => root.render(React.createElement(Harness)))
  await bridge.sendMiniPlayerCommand({ type: 'toggle' })
  assert.equal(calls.length, 0, 'global ignores commands owned by library')
  await React.act(async () => window.dispatchEvent(new dom.window.CustomEvent('yotubei:play')))
  assert.equal(bridge.readPlaybackSnapshot().track.id, 'g1')
  assert.equal(bridge.readPlaybackSnapshot().volume, 40)
  await Promise.all([
    { type: 'toggle' },
    { type: 'next' },
    { type: 'previous' },
    { type: 'volume', value: 75 },
    { type: 'seek', time: 42 },
    { type: 'select', songId: 'g2' },
  ].map((command) => bridge.sendMiniPlayerCommand(command)))
  assert.deepEqual(calls, ['toggle', 'next', 'previous', ['volume', 0.75], ['seek', 42], ['select', 1]])
  await bridge.publishPlaybackState({ track: { id: 'local' }, isPlaying: false })
  assert.equal(bridge.readPlaybackSnapshot().track.id, 'g1', 'paused library cannot replace global snapshot')
  bridge.claimMiniPlayer('mysic')
  await bridge.sendMiniPlayerCommand({ type: 'next' })
  assert.equal(calls.length, 6, 'global releases controls when library takes over')
  await bridge.sendMiniPlayerCommand({ type: 'play-global', song: { id: 'result', title: 'Resultado' } })
  assert.deepEqual(calls.at(-1), ['select', 0], 'catalog result starts global playback')
  assert.equal(bridge.ownsMiniPlayer('global'), true, 'catalog result returns ownership to global player')
  await bridge.sendMiniPlayerCommand({ type: 'open-global', kind: 'album', id: 'album-1' })
  assert.deepEqual(calls.at(-1), ['album', 'album-1'], 'catalog collection opens in global view')
  await React.act(async () => root.unmount())
  assert.equal(listeners.size, 0, 'command channel cleaned up')
  console.log('PASS: global snapshot, controls, ownership isolation, catalog playback/navigation, volume scale, cleanup')
} finally { await server.close(); dom.window.close() }
