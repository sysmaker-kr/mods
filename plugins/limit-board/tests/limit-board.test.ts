// 전광판 — 공식 측정값(session.measure)과 마지막 답변 시각으로 한 줄을 그린다.
import { expect, mock, test } from 'claude-code/testing'

const BAND = {
  plugin: 'limit-board',
  component: 'AbovePrompt',
  requestId: 'above-prompt',
  viewport: { columns: 120, rows: 30 },
  props: { hasSurvey: false, isWorking: false, maxRows: 4, bodyColumns: 116, scroll: { offset: 0, bodyRows: 4 }, view: {} },
} as const

const SUB = [
  { kind: 'five_hour', percentUsed: 42, resetsAt: '2026-10-06T06:20:00Z' },
  { kind: 'seven_day', percentUsed: 18, resetsAt: '2026-10-09T00:00:00Z' },
]

function stubs(on) {
  on('session.start', () => ({ cwd: '/work' }))
  on('session.measure', ($, e) => ({ changed: e.changed }))
  on('turn.complete', () => ({ text: '' }))
  on('ui.render', () => ({ type: 'Text', props: {}, children: ['다른 모드'] }))
}

async function measure($, rateLimits) {
  await $.session.measure({ context: { window: 200000, tokens: 62000, percent: 31 }, rateLimits, changed: ['context', 'rateLimits'] })
}

test('5시간·주간 한도와 컨텍스트 사용률을 보여 준다', async ($, on) => {
  mock.clock(on)
  stubs(on)
  await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' })
  await measure($, SUB)
  const band = await $.ui.mount({ ...BAND, surface: 'terminal' })
  expect(await band.find({ type: 'Text', text: /^5시간 42%/ })).toBeDefined()
  expect(await band.find({ type: 'Text', text: '주간 18%' })).toBeDefined()
  expect(await band.find({ type: 'Text', text: '컨텍스트 31%' })).toBeDefined()
})

test('구독이면 마지막 답변 뒤 60분이 지나야 캐시가 식는다', async ($, on) => {
  const clock = mock.clock(on)
  stubs(on)
  await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' })
  await measure($, SUB)
  await $.turn.complete({ turnId: 't1', answer: '완료', durationMs: 10, isAborted: false, usage: null })
  await clock.advance(50 * 60_000)
  let band = await $.ui.mount({ ...BAND, surface: 'terminal' })
  expect(await band.find({ type: 'Text', text: '캐시 10분 남음' })).toBeDefined()
  await band.unmount()
  await clock.advance(11 * 60_000)
  band = await $.ui.mount({ ...BAND, surface: 'terminal' })
  expect(await band.find({ type: 'Text', text: /^캐시 식음/ })).toBeDefined()
})

test('API 키(한도 정보 없음)는 5분이면 캐시가 식는다', async ($, on) => {
  const clock = mock.clock(on)
  stubs(on)
  await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' })
  await measure($, [])
  await $.turn.complete({ turnId: 't1', answer: '완료', durationMs: 10, isAborted: false, usage: null })
  await clock.advance(6 * 60_000)
  const band = await $.ui.mount({ ...BAND, surface: 'terminal' })
  expect(await band.find({ type: 'Text', text: /^캐시 식음/ })).toBeDefined()
})
