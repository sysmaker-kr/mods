// 한도·캐시 전광판 (limit-board)
// 프롬프트 위 띠에 5시간·주간 한도, 컨텍스트 사용률, 캐시가 식기까지 남은 시간을 띄운다.
// 숫자는 클로드 코드가 답변마다 공식으로 넘겨주는 값(session.measure)만 쓴다.
// 캐시: 구독은 마지막 답변 뒤 1시간, API 키·추가 사용량은 5분이 지나면 식는다(공식 문서 「Cache lifetime」).
// 모델 호출·파일·네트워크·프로그램 실행 없음.

const MIN = 60000

let five = null // { pct, resetsAt }
let week = null
let ctx = null // 컨텍스트 사용률(%)
let lastAt = null // 클로드가 마지막으로 답한 시각(ms)
let subscription = false
let overPlan = false

function ttl() {
  return subscription && !overPlan ? 60 * MIN : 5 * MIN
}

function clockText(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const hh = String(d.getHours()).padStart(2, '0')
  const mm = String(d.getMinutes()).padStart(2, '0')
  return hh + ':' + mm
}

// 건전지 (2026-10-06 사용자 "건전지 형식이 더 직관적" · "안 이뻐" → 휴대폰 배터리처럼 숫자를 칸 안에)
// 남은 양만큼 색으로 채우고, 숫자는 배터리 가운데에 얹는다. 끝에 단자(▌).
const COLOR = { green: '#3fb950', yellow: '#d29922', red: '#f85149' }
const SHELL = '#3a3f47'

function tone(left) {
  if (left < 20) return 'red'
  if (left < 50) return 'yellow'
  return 'green'
}

function battery(Text, Box, key, left, label, width, colorName) {
  const w = Math.max(width, label.length + 2)
  const pad = w - label.length
  const face = ' '.repeat(Math.floor(pad / 2)) + label + ' '.repeat(Math.ceil(pad / 2))
  const n = Math.max(0, Math.min(w, Math.round((left / 100) * w)))
  const fill = COLOR[colorName || tone(left)]
  return Box({
    key,
    flexDirection: 'row',
    children: [
      Text({ backgroundColor: fill, color: '#0d1117', bold: true, children: [face.slice(0, n)] }),
      Text({ backgroundColor: SHELL, color: '#e6edf3', bold: true, children: [face.slice(n)] }),
      Text({ color: SHELL, children: ['▌'] }),
    ],
  })
}

export function register(on) {
  // 30초마다 다시 그려 캐시 남은 시간을 줄여 간다
  on('session.start', async ($, e, next) => {
    $.clock.every(30000, () => $.ui.invalidate('ui.render'))
    return next(e)
  })

  on('session.measure', async ($, e, next) => {
    const rl = Array.isArray(e.rateLimits) ? e.rateLimits : []
    subscription = rl.length > 0
    overPlan = rl.some((r) => r.percentUsed >= 100)
    const f = rl.find((r) => r.kind === 'five_hour')
    const w = rl.find((r) => r.kind === 'seven_day')
    five = f ? { pct: f.percentUsed, resetsAt: f.resetsAt } : null
    week = w ? { pct: w.percentUsed, resetsAt: w.resetsAt } : null
    if (e.context && typeof e.context.percent === 'number') ctx = e.context.percent
    $.ui.invalidate('ui.render')
    return next(e)
  })

  // 메인 대화의 답변이 끝난 시각만 잰다(서브에이전트는 캐시가 따로다)
  on('turn.complete', async ($, e, next) => {
    const result = await next(e)
    if (!e.agentId) {
      lastAt = await $.clock.now()
      $.ui.invalidate('ui.render')
    }
    return result
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (!five && !week && ctx === null && lastAt === null) return next(e)
    const { Box, Text } = $.ui.resolve(e)
    const cols = (e.props && e.props.bodyColumns) || 100
    const width = cols >= 110 ? 10 : 7
    const label = (s) => Text({ dimColor: true, children: [s + ' '] })
    const cell = (key, name, bat, extra) =>
      Box({ key: key + '-cell', flexDirection: 'row', children: [label(name), bat, ...(extra ? [Text({ dimColor: true, children: [' ' + extra] })] : [])] })

    const cells = []
    if (five) {
      const left = Math.max(0, 100 - five.pct)
      const reset = clockText(five.resetsAt)
      cells.push(cell('five', '5시간', battery(Text, Box, 'five', left, left + '%', width), reset && cols >= 100 ? reset + ' 충전' : ''))
    }
    if (week) {
      const left = Math.max(0, 100 - week.pct)
      cells.push(cell('week', '주간', battery(Text, Box, 'week', left, left + '%', width)))
    }
    if (ctx !== null) {
      const left = Math.max(0, 100 - ctx)
      cells.push(cell('ctx', '대화', battery(Text, Box, 'ctx', left, left + '%', width)))
    }
    if (lastAt !== null) {
      const total = ttl()
      const leftMs = total - ((await $.clock.now()) - lastAt)
      if (leftMs <= 0) {
        cells.push(Text({ key: 'cache-cold', color: COLOR.red, bold: true, children: ['캐시 식음 · 다음 질문은 처음부터 다시 읽어요'] }))
      } else {
        const m = Math.ceil(leftMs / MIN)
        const left = Math.round((leftMs / total) * 100)
        cells.push(cell('cache', '캐시', battery(Text, Box, 'cache', left, m + '분', width, m <= 10 ? 'yellow' : 'green')))
      }
    }
    const sep = (n) => Text({ key: 'sep-' + n, dimColor: true, children: ['│'] })
    const row = []
    cells.forEach((c, n) => { if (n) row.push(sep(n)); row.push(c) })
    const mine = Box({ flexDirection: 'row', columnGap: 2, paddingX: 1, children: row })
    const theirs = await next(e)
    return theirs ? Box({ flexDirection: 'column', children: [theirs, mine] }) : mine
  })
}
