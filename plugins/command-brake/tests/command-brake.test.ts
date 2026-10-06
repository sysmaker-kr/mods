// 브레이크 — 위험한 Bash 명령만 붙잡고, 내가 '실행'을 고를 때만 보낸다.
import { expect, test } from 'claude-code/testing'

function stubs(on, answer: string, asked: string[]) {
  on('session.start', () => ({ cwd: '/work' }))
  on('tool.call', ($, e) => {
    if (e.tool === 'AskUserQuestion') {
      asked.push(e.questions[0].question)
      return { result: { answers: { [e.questions[0].question]: answer } } }
    }
    return { result: 'ran' }
  })
}

async function start($, isInteractive = true) {
  await $.session.start({ surface: 'terminal', isInteractive, cwd: '/work' })
}

test('평범한 명령은 묻지 않고 그대로 실행한다', async ($, on) => {
  const asked: string[] = []
  stubs(on, '거절', asked)
  await start($)
  expect(await $.tool.call({ tool: 'Bash', command: 'ls -la' })).toEqual({ result: 'ran' })
  expect(asked.length).toBe(0)
})

test('폴더째 삭제는 멈추고, 거절하면 실행하지 않는다', async ($, on) => {
  const asked: string[] = []
  stubs(on, '거절', asked)
  await start($)
  const out = await $.tool.call({ tool: 'Bash', command: 'rm -rf build' })
  expect(asked.length).toBe(1)
  expect(asked[0]).toContain('rm -rf build')
  expect(out.deny).toContain('폴더째 삭제')
})

test('내가 실행을 고르면 그대로 실행한다', async ($, on) => {
  const asked: string[] = []
  stubs(on, '실행', asked)
  await start($)
  expect(await $.tool.call({ tool: 'Bash', command: 'rm -r dist' })).toEqual({ result: 'ran' })
})

test('짧게 쓴 강제 푸시(-f)도 잡는다', async ($, on) => {
  const asked: string[] = []
  stubs(on, '거절', asked)
  await start($)
  const out = await $.tool.call({ tool: 'Bash', command: 'git push -f origin main' })
  expect(out.deny).toContain('원격 기록 덮어쓰기')
})

test('묻을 사람이 없는 실행(claude -p)에서는 끼어들지 않는다', async ($, on) => {
  const asked: string[] = []
  stubs(on, '거절', asked)
  await start($, false)
  expect(await $.tool.call({ tool: 'Bash', command: 'rm -rf build' })).toEqual({ result: 'ran' })
  expect(asked.length).toBe(0)
})
