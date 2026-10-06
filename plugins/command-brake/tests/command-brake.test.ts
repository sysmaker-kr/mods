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

test('원본 폴더째 삭제는 멈추고, 거절하면 실행하지 않는다', async ($, on) => {
  const asked: string[] = []
  stubs(on, '거절', asked)
  await start($)
  const out = await $.tool.call({ tool: 'Bash', command: 'rm -rf src' })
  expect(asked.length).toBe(1)
  expect(asked[0]).toContain('rm -rf src')
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

// 0.3.0 — 작업용 폴더·일반 파일은 묻지 않고, 되돌리기 어려운 것만 묻는다
test('중요 파일(.env) 지우기는 멈추고, 지울 파일과 클로드의 설명을 보여 준다', async ($, on) => {
  const asked: string[] = []
  stubs(on, '거절', asked)
  await start($)
  const out = await $.tool.call({ tool: 'Bash', command: 'rm "config/.env.local"', description: '예전 설정 파일 지우기' })
  expect(asked.length).toBe(1)
  expect(asked[0]).toContain('중요 파일 삭제')
  expect(asked[0]).toContain('왜: 예전 설정 파일 지우기')
  expect(asked[0]).toContain('.env.local')
  expect(asked[0]).toContain('되돌릴 수 없습니다')
  expect(out.deny).toContain('중요 파일 삭제')
})

test('일반 파일 하나 지우기는 묻지 않는다', async ($, on) => {
  const asked: string[] = []
  stubs(on, '거절', asked)
  await start($)
  expect(await $.tool.call({ tool: 'Bash', command: 'rm notes.txt "out dir/a.mp4"' })).toEqual({ result: 'ran' })
  expect(asked.length).toBe(0)
})

test('변수만으로 된 폴더 삭제는 멈추고 변수 경고를 붙인다', async ($, on) => {
  const asked: string[] = []
  stubs(on, '거절', asked)
  await start($)
  await $.tool.call({ tool: 'Bash', command: 'D=$(ls -d proj/*); rm -rf "$D"' })
  expect(asked.length).toBe(1)
  expect(asked[0]).toContain('변수')
})

test('설명이 없으면 없다고 알려 준다', async ($, on) => {
  const asked: string[] = []
  stubs(on, '거절', asked)
  await start($)
  await $.tool.call({ tool: 'Bash', command: 'rm -rf docs' })
  expect(asked[0]).toContain('설명을 붙이지 않았습니다')
})

test('작업용·임시 폴더 정리는 묻지 않는다', async ($, on) => {
  const asked: string[] = []
  stubs(on, '거절', asked)
  await start($)
  for (const c of ['rm -rf /tmp/scratch/preview', 'rm -rf build dist', 'rm -rf "$SP/site_preview"', 'rm -rf renders/late', 'find out -name "*.png" -delete']) {
    expect(await $.tool.call({ tool: 'Bash', command: c })).toEqual({ result: 'ran' })
  }
  expect(asked.length).toBe(0)
})

test('원본 폴더에서 find -delete 는 잡는다', async ($, on) => {
  const asked: string[] = []
  stubs(on, '거절', asked)
  await start($)
  const out = await $.tool.call({ tool: 'Bash', command: 'find business -name "*.bak" -delete' })
  expect(asked[0]).toContain('찾은 파일 한꺼번에 삭제')
  expect(asked[0]).toContain('*.bak')
  expect(out.deny).toBeTruthy()
})
