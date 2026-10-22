const assert = require('node:assert/strict')
const test = require('node:test')
const { YOUTUBE_USER_PATHS } = require('./authPaths')

test('protects every route that reads a personalized YouTube Music session', () => {
  assert.deepEqual(YOUTUBE_USER_PATHS, [
    '/api/youtube/account',
    '/api/youtube/link',
    '/api/youtube/home',
    '/api/youtube/radio',
    '/api/youtube/playlist',
    '/api/youtube/recommendations',
  ])
})
