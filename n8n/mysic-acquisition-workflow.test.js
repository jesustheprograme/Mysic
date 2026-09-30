const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')

const workflowPath = path.join(__dirname, 'mysic-acquisition-workflow.json')

test('el workflow se importa inactivo y no contiene secretos', () => {
  const raw = fs.readFileSync(workflowPath, 'utf8')
  const workflow = JSON.parse(raw)
  assert.equal(workflow.active, false)
  assert.match(raw, /MYSIC_WEBHOOK_TOKEN/)
  assert.match(raw, /MYSIC_WORKER_TOKEN/)
  assert.doesNotMatch(raw, /Bearer\s+[A-Za-z0-9_-]{16,}/)
})

test('expone creación, estado y cancelación y llama al worker local', () => {
  const workflow = JSON.parse(fs.readFileSync(workflowPath, 'utf8'))
  const paths = workflow.nodes.filter((node) => node.type === 'n8n-nodes-base.webhook').map((node) => node.parameters.path)
  assert.deepEqual(paths, [
    'mysic/acquisition',
    'mysic/acquisition/status',
    'mysic/acquisition/cancel',
  ])
  const requests = workflow.nodes.filter((node) => node.type === 'n8n-nodes-base.httpRequest')
  assert.ok(requests.every((node) => node.parameters.url.includes('127.0.0.1:4310')))
  assert.ok(workflow.nodes.some((node) => node.type === 'n8n-nodes-base.wait'))
})
