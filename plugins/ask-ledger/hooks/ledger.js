// 질문 장부의 순수 로직 — 모드 API를 쓰지 않으니 테스트에서 바로 부른다.

const PREFIX = { ask: 'a', decision: 'd', risk: 'r' }
const STATUSES = ['open', 'partial', 'done']
const CLIP = 12000

export const SYSTEM = [
  '너는 대화 기록 담당이다. 사용자 메시지와 어시스턴트의 마지막 답변을 읽고 "질문 장부"를 갱신한다.',
  '항목 종류:',
  '- ask: 사용자가 어시스턴트에게 물은 것·시킨 것. 한 메시지에 여러 개면 하나씩 나눈다.',
  '- decision: 어시스턴트가 사용자에게 결정·승인·행동을 부탁한 것.',
  '- risk: 답변에 나온 위험·주의·한계 중 중요한 것.',
  '상태: ask는 답변이 다뤘으면 done, 일부만 다뤘으면 partial, 안 다뤘으면 open. decision은 사용자가 답하기 전까지 open이고 답하면 done. risk는 해결되기 전까지 open.',
  '규칙: 기존 장부 항목의 상태가 바뀌면 updates에 적는다. 이미 있는 내용을 new로 또 만들지 않는다. 인사·잡담·감탄은 항목이 아니다.',
  'text는 30자 이내의 한국어 명사구. new는 최대 8개, 그중 risk는 최대 3개. summary는 지금까지의 논의를 3줄 이내로, 줄마다 50자 이내.',
  '설명 없이 JSON 하나만 출력한다: {"updates":[{"id":"a1","status":"done"}],"new":[{"kind":"ask","text":"…","status":"open"}],"summary":["…"]}',
].join('\n')

// 긴 글은 앞뒤만 남긴다 — 질문은 대개 앞에, 결론은 대개 뒤에 있다.
export function clip(text, n = CLIP) {
  const s = String(text || '')
  if (s.length <= n) return s
  const half = Math.floor(n / 2)
  return s.slice(0, half) + '\n…(중략)…\n' + s.slice(-half)
}

export function buildPrompt(items, prompts, answer) {
  const live = items.filter((i) => i.status === 'open' || i.status === 'partial')
  const book = live.length ? live.map((i) => `${i.id} | ${i.kind} | ${i.status} | ${i.text}`).join('\n') : '(없음)'
  const said = prompts.length ? prompts.map((p) => clip(p)).join('\n---\n') : '(새 메시지 없음)'
  return `[기존 장부]\n${book}\n\n[사용자 메시지]\n${said}\n\n[어시스턴트 답변]\n${clip(answer)}`
}

export function parseVerdict(text) {
  const s = String(text || '')
  const a = s.indexOf('{')
  const b = s.lastIndexOf('}')
  if (a < 0 || b <= a) return null
  try {
    const v = JSON.parse(s.slice(a, b + 1))
    return v && typeof v === 'object' && !Array.isArray(v) ? v : null
  } catch {
    return null
  }
}

function norm(t) {
  return String(t).replace(/\s+/g, '').toLowerCase()
}

export function applyVerdict(items, verdict, nextId) {
  const out = items.map((i) => ({ ...i }))
  let id = nextId
  for (const u of Array.isArray(verdict.updates) ? verdict.updates : []) {
    const it = out.find((i) => i.id === (u && u.id))
    // 내가 지운(dismissed) 항목은 모델이 되살리지 못한다
    if (it && it.status !== 'dismissed' && STATUSES.includes(u.status)) it.status = u.status
  }
  const seen = new Set(out.map((i) => i.kind + '|' + norm(i.text)))
  let risks = 0
  for (const n of (Array.isArray(verdict.new) ? verdict.new : []).slice(0, 8)) {
    if (!n || !PREFIX[n.kind] || typeof n.text !== 'string' || !n.text.trim()) continue
    if (n.kind === 'risk' && ++risks > 3) continue
    const key = n.kind + '|' + norm(n.text)
    if (seen.has(key)) continue
    seen.add(key)
    out.push({
      id: PREFIX[n.kind] + id++,
      kind: n.kind,
      text: n.text.trim().slice(0, 60),
      status: STATUSES.includes(n.status) ? n.status : 'open',
    })
  }
  const summary = Array.isArray(verdict.summary)
    ? verdict.summary.filter((x) => typeof x === 'string' && x.trim()).slice(0, 3).map((x) => x.trim().slice(0, 80))
    : null
  return { items: out, summary, nextId: id }
}

export function counts(items) {
  const c = { missed: 0, partial: 0, decide: 0, risk: 0 }
  for (const i of items) {
    if (i.kind === 'ask' && i.status === 'open') c.missed++
    else if (i.kind === 'ask' && i.status === 'partial') c.partial++
    else if (i.kind === 'decision' && i.status === 'open') c.decide++
    else if (i.kind === 'risk' && i.status === 'open') c.risk++
  }
  c.total = c.missed + c.partial + c.decide + c.risk
  return c
}

export function sections(items) {
  return [
    { title: '놓친 질문', color: 'red', list: items.filter((i) => i.kind === 'ask' && i.status === 'open') },
    { title: '일부만 답함', color: 'yellow', list: items.filter((i) => i.kind === 'ask' && i.status === 'partial') },
    { title: '내가 정할 것', color: 'cyan', list: items.filter((i) => i.kind === 'decision' && i.status === 'open') },
    { title: '리스크', color: 'magenta', list: items.filter((i) => i.kind === 'risk' && i.status === 'open') },
  ]
}

export function reaskText(items) {
  const left = items.filter((i) => i.kind === 'ask' && (i.status === 'open' || i.status === 'partial'))
  if (!left.length) return ''
  return [
    '앞에서 물었는데 아직 답을 못 받은 것들이야. 하나씩 답해 줘.',
    ...left.map((i, n) => `${n + 1}. ${i.text}${i.status === 'partial' ? ' (일부만 답함)' : ''}`),
  ].join('\n')
}

export function ledgerText(items, summary) {
  const lines = []
  for (const s of sections(items)) {
    if (!s.list.length) continue
    lines.push(`${s.title} (${s.list.length})`)
    s.list.forEach((i, n) => lines.push(`  ${n + 1}. ${i.text}`))
  }
  if (summary.length) {
    lines.push('요약')
    summary.forEach((x) => lines.push('  · ' + x))
  }
  return lines.length ? '질문 장부\n' + lines.join('\n') : '질문 장부가 비어 있어요.'
}
