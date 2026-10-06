// 질문 장부 (ask-ledger)
// 한 메시지에 여러 개를 물었는데 답이 하나만 오는 일을 막는다.
// 답변이 끝날 때마다 작은 모델(haiku)에게 "무엇을 답했고 무엇을 놓쳤나"를 물어,
// 프롬프트 위 띠에는 개수를, /ledger 패널에는 목록·내가 정할 것·리스크·요약을 보여 준다.
// 비용: 답변마다 haiku 한 번(내 플랜 사용량). 보내는 것은 내 메시지와 클로드의 마지막 답변뿐이다.
import { SYSTEM, buildPrompt, parseVerdict, applyVerdict, counts, sections, reaskText, ledgerText } from './ledger.js'

const PANE = 'ask-ledger'

let items = []
let summary = []
let prompts = [] // 아직 판정에 못 넣은 내 메시지
let nextId = 1
let checking = false
let waiting = null // 판정 중에 끝난 다음 답변
let note = ''
let interactive = true // claude -p·cron에서는 판정하지 않는다(사용량 보호)

function reset() {
  items = []
  summary = []
  prompts = []
  nextId = 1
  waiting = null
  note = ''
}

async function check($, answer) {
  if (checking) {
    waiting = answer
    return
  }
  const live = items.some((i) => i.status === 'open' || i.status === 'partial')
  if (!prompts.length && !live) return
  checking = true
  $.ui.invalidate('ui.render')
  const sent = prompts.slice()
  try {
    const r = await $.model.complete({
      model: 'haiku',
      system: SYSTEM,
      prompt: buildPrompt(items, sent, answer),
      maxTokens: 900,
      timeoutMs: 30000,
    })
    const v = r.isAnswered ? parseVerdict(r.text) : null
    if (!v) {
      note = r.isAnswered ? '판정을 읽지 못했어요' : '판정 실패: ' + (r.reason || '응답 없음')
    } else {
      const out = applyVerdict(items, v, nextId)
      items = out.items
      nextId = out.nextId
      if (out.summary) summary = out.summary
      prompts = prompts.slice(sent.length) // 판정 중에 새로 온 메시지는 남긴다
      note = ''
    }
  } catch (err) {
    note = '판정 실패: ' + (err && err.message ? err.message : String(err))
  } finally {
    checking = false
    $.ui.invalidate('ui.render')
  }
  if (waiting !== null) {
    const next = waiting
    waiting = null
    await check($, next)
  }
}

export function register(on) {
  on('session.start', async ($, e, next) => {
    interactive = e.isInteractive !== false
    await $.command.register({
      name: 'ledger',
      description: '질문 장부 열기 · text = 목록을 대화에 출력 · ask = 놓친 질문 다시 묻기',
      argumentHint: '[text|ask]',
      immediate: true,
    })
    return next(e)
  })

  // 내가 보낸 메시지를 모아 둔다. 슬래시 명령은 질문이 아니다.
  on('prompt.submit', async ($, e, next) => {
    const t = String(e.text || '').trim()
    if (t && !t.startsWith('/')) prompts = [...prompts, t].slice(-3)
    return next(e)
  }).catch(async ($, e, next) => {
    // 장부가 고장 나도 내 메시지는 그대로 나간다
    return next.called ? undefined : next(e)
  })

  // 답변이 끝나면 판정은 타이머로 넘겨, 다음 입력을 막지 않는다.
  on('turn.complete', async ($, e, next) => {
    const result = await next(e)
    if (interactive && !e.isAborted && !e.agentId && e.answer) $.clock.after(0, () => check($, e.answer))
    return result
  })

  // /clear·/resume·/branch 뒤에는 새 대화라서 장부를 비운다.
  on('session.end', async ($, e, next) => {
    if (e.reason === 'clear' || e.reason === 'resume') reset()
    return next(e)
  })

  on('command.run', { command: 'ledger' }, async ($, e) => {
    const arg = String(e.args || '').trim()
    if (arg === 'text') return { text: ledgerText(items, summary) }
    if (arg === 'ask') {
      const t = reaskText(items)
      if (!t) return { text: '다시 물을 질문이 없어요.' }
      $.prompt.submit({ text: t, asUser: true }).catch(() => {})
      return {}
    }
    await $.ui.open({ id: PANE, title: '질문 장부', focus: true, closeOnEscape: true })
    return {}
  })

  // 프롬프트 위 띠: 놓친 질문이 있을 때만 한 줄
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const c = counts(items)
    if (!c.total && !checking && !note) return next(e)
    const { Box, Text } = $.ui.resolve(e)
    const parts = [Text({ bold: true, children: ['질문 장부'] })]
    if (c.missed) parts.push(Text({ color: 'red', bold: true, children: ['놓친 질문 ' + c.missed] }))
    if (c.partial) parts.push(Text({ color: 'yellow', children: ['일부만 답함 ' + c.partial] }))
    if (c.decide) parts.push(Text({ color: 'cyan', children: ['내가 정할 것 ' + c.decide] }))
    if (c.risk) parts.push(Text({ color: 'magenta', children: ['리스크 ' + c.risk] }))
    if (checking) parts.push(Text({ dimColor: true, children: ['점검 중…'] }))
    else if (note) parts.push(Text({ dimColor: true, children: [note] }))
    parts.push(Text({ dimColor: true, children: ['/ledger'] }))
    const mine = Box({ flexDirection: 'row', columnGap: 2, children: parts })
    const theirs = await next(e)
    return theirs ? Box({ flexDirection: 'column', children: [theirs, mine] }) : mine
  })

  // /ledger 패널: 묶음별 목록 + 요약 + 다시 묻기·비우기
  on('ui.render', { component: 'Pane' }, async ($, e, next) => {
    if (e.requestId !== PANE) return next(e)
    const { Box, Text, Button } = $.ui.resolve(e)
    const redraw = () => $.ui.invalidate('ui.render')
    const body = []
    for (const s of sections(items)) {
      if (!s.list.length) continue
      body.push(Text({ bold: true, color: s.color, children: [s.title + ' ' + s.list.length] }))
      for (const i of s.list) {
        body.push(
          Box({
            key: 'row-' + i.id,
            flexDirection: 'row',
            columnGap: 1,
            children: [
              Button({
                key: 'drop-' + i.id,
                label: 'x',
                plain: true,
                onPress: () => {
                  items = items.map((x) => (x.id === i.id ? { ...x, status: 'dismissed' } : x))
                  redraw()
                },
              }),
              Text({ wrap: 'wrap', children: [i.text] }),
            ],
          }),
        )
      }
    }
    if (!body.length) body.push(Text({ dimColor: true, children: ['놓친 질문이 없어요. 한 번에 여러 개를 물으면 여기에 쌓입니다.'] }))
    if (summary.length) {
      body.push(Text({ children: [' '] }), Text({ bold: true, children: ['요약'] }))
      for (const line of summary) body.push(Text({ wrap: 'wrap', children: ['· ' + line] }))
    }
    const actions = []
    if (counts(items).missed + counts(items).partial > 0) {
      actions.push(
        Button({
          key: 'reask',
          label: '놓친 것 다시 묻기',
          hotkey: 'r',
          plain: true,
          onPress: () => {
            const t = reaskText(items)
            if (!t) return
            $.prompt.submit({ text: t, asUser: true }).catch(() => {})
            $.ui.close({ id: PANE }).catch(() => {})
          },
        }),
      )
    }
    actions.push(
      Button({
        key: 'clear',
        label: '장부 비우기',
        hotkey: 'c',
        plain: true,
        onPress: () => {
          reset()
          redraw()
        },
      }),
    )
    const tail = note ? [Text({ dimColor: true, children: [note] })] : []
    return Box({
      flexDirection: 'column',
      children: [...body, Text({ children: [' '] }), Box({ flexDirection: 'row', columnGap: 3, children: actions }), ...tail],
    })
  })
}
