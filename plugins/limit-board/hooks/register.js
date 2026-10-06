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

function level(pct) {
  if (pct >= 80) return 'red'
  if (pct >= 50) return 'yellow'
  return null
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
    const parts = [Text({ bold: true, children: ['한도'] })]
    const pct = (label, v, reset) => {
      const props = { children: [label + ' ' + v.pct + '%' + (reset ? ' (' + reset + ' 초기화)' : '')] }
      const c = level(v.pct)
      return Text(c ? { ...props, color: c, bold: true } : props)
    }
    if (five) parts.push(pct('5시간', five, clockText(five.resetsAt)))
    if (week) parts.push(pct('주간', week, ''))
    if (ctx !== null) {
      const c = level(ctx)
      const props = { children: ['컨텍스트 ' + ctx + '%'] }
      parts.push(Text(c ? { ...props, color: c } : props))
    }
    if (lastAt !== null) {
      const left = ttl() - ((await $.clock.now()) - lastAt)
      if (left <= 0) {
        parts.push(Text({ color: 'red', bold: true, children: ['캐시 식음 · 다음 질문은 처음부터 다시 읽어요'] }))
      } else {
        const m = Math.ceil(left / MIN)
        const props = { children: ['캐시 ' + m + '분 남음'] }
        parts.push(Text(m <= 10 ? { ...props, color: 'yellow' } : { ...props, dimColor: true }))
      }
    }
    const mine = Box({ flexDirection: 'row', columnGap: 2, children: parts })
    const theirs = await next(e)
    return theirs ? Box({ flexDirection: 'column', children: [theirs, mine] }) : mine
  })
}
