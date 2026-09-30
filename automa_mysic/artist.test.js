const assert = require('node:assert/strict')
const test = require('node:test')

const { primaryArtist } = require('./artist')

test('keeps only the first credited artist', () => {
  assert.equal(primaryArtist('Slowdown feat. Patricia Cruz'), 'Slowdown')
  assert.equal(primaryArtist('Slowdown, Constantin Gillies'), 'Slowdown')
  assert.equal(primaryArtist('Artist A & Artist B'), 'Artist A')
  assert.equal(primaryArtist('Ado'), 'Ado')
})
