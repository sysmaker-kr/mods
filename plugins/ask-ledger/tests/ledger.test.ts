// 장부 순수 로직 — 모델 판정을 읽고, 항목을 갱신하고, 다시 물을 문장을 만든다.
import { expect, test } from 'claude-code/testing'
import { applyVerdict, counts, ledgerText, parseVerdict, reaskText } from '../hooks/ledger.js'

test('코드펜스나 앞뒤 설명이 붙은 판정도 읽는다', async () => {
  const v = parseVerdict('네, 판정입니다.\n```json\n{"updates":[],"new":[],"summary":["요약"]}\n```')
  expect(v).toEqual({ updates: [], new: [], summary: ['요약'] })
  expect(parseVerdict('JSON 없음')).toBe(null)
  expect(parseVerdict('{깨진 json')).toBe(null)
})

test('새 항목에 종류별 번호를 붙이고 같은 내용은 다시 넣지 않는다', async () => {
  const v = {
    new: [
      { kind: 'ask', text: '썸네일 루틴 방법', status: 'open' },
      { kind: 'ask', text: '썸네일  루틴 방법', status: 'open' },
      { kind: 'decision', text: '롱폼 각도 승인', status: 'open' },
      { kind: 'gossip', text: '잡담', status: 'open' },
    ],
  }
  const out = applyVerdict([], v, 1)
  expect(out.items.map((i) => i.id)).toEqual(['a1', 'd2'])
  expect(out.nextId).toBe(3)
})

test('기존 항목 상태를 바꾸되 내가 지운 항목은 건드리지 않는다', async () => {
  const items = [
    { id: 'a1', kind: 'ask', text: '모즈 설명', status: 'open' },
    { id: 'a2', kind: 'ask', text: '루틴', status: 'dismissed' },
  ]
  const out = applyVerdict(items, { updates: [{ id: 'a1', status: 'done' }, { id: 'a2', status: 'open' }] }, 3)
  expect(out.items.find((i) => i.id === 'a1').status).toBe('done')
  expect(out.items.find((i) => i.id === 'a2').status).toBe('dismissed')
})

test('리스크는 한 번에 3개까지만 받는다', async () => {
  const risks = [1, 2, 3, 4].map((n) => ({ kind: 'risk', text: '위험 ' + n, status: 'open' }))
  expect(applyVerdict([], { new: risks }, 1).items.length).toBe(3)
})

test('개수는 놓친 질문·일부·내가 정할 것·리스크로 센다', async () => {
  const items = [
    { id: 'a1', kind: 'ask', text: 'x', status: 'open' },
    { id: 'a2', kind: 'ask', text: 'y', status: 'partial' },
    { id: 'a3', kind: 'ask', text: 'z', status: 'done' },
    { id: 'd4', kind: 'decision', text: 'w', status: 'open' },
    { id: 'r5', kind: 'risk', text: 'v', status: 'open' },
    { id: 'a6', kind: 'ask', text: 'u', status: 'dismissed' },
  ]
  expect(counts(items)).toEqual({ missed: 1, partial: 1, decide: 1, risk: 1, total: 4 })
})

test('다시 묻기 문장에는 아직 답 못 받은 질문만 들어간다', async () => {
  const items = [
    { id: 'a1', kind: 'ask', text: '썸네일 루틴', status: 'open' },
    { id: 'a2', kind: 'ask', text: '네이트 허크 분석', status: 'partial' },
    { id: 'a3', kind: 'ask', text: '모즈 설명', status: 'done' },
    { id: 'd4', kind: 'decision', text: '승인', status: 'open' },
  ]
  const t = reaskText(items)
  expect(t).toContain('1. 썸네일 루틴')
  expect(t).toContain('2. 네이트 허크 분석 (일부만 답함)')
  expect(t).not.toContain('모즈 설명')
  expect(t).not.toContain('승인')
  expect(reaskText([])).toBe('')
})

test('빈 장부를 글로 뽑으면 비어 있다고 말한다', async () => {
  expect(ledgerText([], [])).toBe('질문 장부가 비어 있어요.')
})
