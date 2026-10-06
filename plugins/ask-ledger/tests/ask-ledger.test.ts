// 모드 전체 흐름 — 내 메시지 → 클로드 답변 → haiku 판정 → 띠·패널·/ledger text
import { expect, mock, test } from 'claude-code/testing'

const VERDICT = {
  updates: [],
  new: [
    { kind: 'ask', text: '모즈 기능 설명', status: 'done' },
    { kind: 'ask', text: '썸네일 루틴 방법', status: 'open' },
    { kind: 'ask', text: '네이트 허크 채널 분석', status: 'open' },
    { kind: 'decision', text: '롱폼 각도 승인', status: 'open' },
    { kind: 'risk', text: '버전이 매일 바뀜', status: 'open' },
  ],
  summary: ['모즈 롱폼을 준비하는 중'],
}

const USAGE = { input_tokens: 10, output_tokens: 5, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 }

const PANE = {
  plugin: 'ask-ledger',
  component: 'Pane',
  requestId: 'ask-ledger',
  viewport: { columns: 100, rows: 30 },
  props: { title: '질문 장부', isFocused: true, bodyColumns: 80, placement: 'inline', scroll: { offset: 0, bodyRows: 20 }, view: {} },
} as const

const BAND = {
  plugin: 'ask-ledger',
  component: 'AbovePrompt',
  requestId: 'above-prompt',
  viewport: { columns: 100, rows: 30 },
  props: { hasSurvey: false, isWorking: false, maxRows: 4, bodyColumns: 96, scroll: { offset: 0, bodyRows: 4 }, view: {} },
} as const

function stubs(on, calls: string[]) {
  on('session.start', () => ({ cwd: '/work' }))
  on('command.register', () => ({ value: undefined }))
  on('prompt.submit', ($, e) => ({ text: e.text }))
  on('turn.complete', () => ({ text: '' }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('ui.render', () => ({ type: 'Text', props: {}, children: ['다른 모드'] }))
  on('model.complete', ($, e) => {
    calls.push(e.prompt)
    return { value: { isAnswered: true, text: '```json\n' + JSON.stringify(VERDICT) + '\n```', usage: USAGE } }
  })
}

async function oneTurn($, clock, isAborted = false, isInteractive = true) {
  await $.session.start({ surface: 'terminal', isInteractive, cwd: '/work' })
  await $.prompt.submit({ text: '모즈 설명해 줘. 썸네일 루틴 찾아 줘. 네이트 허크 분석해 줘.' })
  await $.turn.complete({ turnId: 't1', answer: '모즈는 클로드 코드에 기능을 끼워 넣는 확장입니다.', durationMs: 10, isAborted, usage: null })
  await clock.settle()
}

test('세 개를 물었는데 하나만 답하면 놓친 질문 2개가 장부에 남는다', async ($, on) => {
  const clock = mock.clock(on)
  const calls: string[] = []
  stubs(on, calls)
  await oneTurn($, clock)

  expect(calls.length).toBe(1)
  expect(calls[0]).toContain('썸네일 루틴 찾아 줘')
  expect(calls[0]).toContain('모즈는 클로드 코드에')

  const out = await $.command.run({ command: 'ledger', args: 'text' })
  expect(out.text).toContain('놓친 질문 (2)')
  expect(out.text).toContain('썸네일 루틴 방법')
  expect(out.text).toContain('내가 정할 것 (1)')
  expect(out.text).not.toContain('모즈 기능 설명')
})

test('띠와 패널에 개수가 보인다', async ($, on) => {
  const clock = mock.clock(on)
  stubs(on, [])
  await oneTurn($, clock)

  const band = await $.ui.mount({ ...BAND, surface: 'terminal' })
  expect(await band.find({ type: 'Text', text: '놓친 질문 2' })).toBeDefined()
  await band.unmount()

  const pane = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect(await pane.find({ key: 'tab-놓친 질문' })).toBeDefined()
  expect(await pane.find({ key: 'reask' })).toBeDefined()
  // 내가 정할 것 탭을 누르면 첫 항목의 카드와 '정했어요' 버튼이 나온다
  await pane.press({ key: 'tab-내가 정할 것' })
  expect(await pane.find({ type: 'Text', text: '롱폼 각도 승인' })).toBeDefined()
  await pane.press({ key: 'did' })
  expect(await pane.find({ key: 'tab-내가 정할 것' })).toBeUndefined()
  await pane.press({ key: 'clear' })
  expect(await pane.find({ key: 'tab-놓친 질문' })).toBeUndefined()
  await pane.unmount()
})

test('중단된 턴은 판정하지 않는다', async ($, on) => {
  const clock = mock.clock(on)
  const calls: string[] = []
  stubs(on, calls)
  await oneTurn($, clock, true)
  expect(calls.length).toBe(0)
})

test('cron 같은 비대화형 실행(claude -p)에서는 사용량을 쓰지 않는다', async ($, on) => {
  const clock = mock.clock(on)
  const calls: string[] = []
  stubs(on, calls)
  await oneTurn($, clock, false, false)
  expect(calls.length).toBe(0)
})
