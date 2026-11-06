import assert from 'node:assert/strict'
import test from 'node:test'
import { setAccountMenu } from './accountMenuBridge.js'

// useAccountMenu necesita React; aquí se comprueba solo el almacén a través de su efecto observable:
// publicar dos veces lo mismo no debe fallar y retirar con null es válido.
test('publicar, repetir y retirar no lanza', () => {
  const actions = {}
  assert.doesNotThrow(() => {
    setAccountMenu({ actions, busy: false, connected: true, syncBusy: false })
    setAccountMenu({ actions, busy: false, connected: true, syncBusy: false })
    setAccountMenu({ actions, busy: true, connected: true, syncBusy: false })
    setAccountMenu(null)
    setAccountMenu(null)
  })
})
