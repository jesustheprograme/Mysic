const assert = require('node:assert/strict')
const test = require('node:test')
const { artistCacheHeaders } = require('./cache-headers')

function run(method, path) {
  const headers = {}
  let nextCalled = false
  artistCacheHeaders({ method, path }, { set: (name, value) => { headers[name] = value } }, () => { nextCalled = true })
  return { headers, nextCalled }
}

test('la ficha de artista recibe Cache-Control privado con revalidación', () => {
  const { headers, nextCalled } = run('GET', '/artist/UC123')
  assert.match(headers['Cache-Control'], /^private, max-age=300, stale-while-revalidate=900$/)
  assert.equal(nextCalled, true)
})

test('las subrutas, otros métodos y otras rutas no se tocan', () => {
  for (const [method, path] of [['GET', '/artist/UC123/releases'], ['GET', '/artist/UC123/songs'], ['POST', '/artist/UC123'], ['GET', '/album/abc'], ['GET', '/home']]) {
    const { headers, nextCalled } = run(method, path)
    assert.equal(headers['Cache-Control'], undefined, `${method} ${path}`)
    assert.equal(nextCalled, true)
  }
})
