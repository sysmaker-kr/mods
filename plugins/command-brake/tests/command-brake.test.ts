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

// 0.2.0 — 파일 하나 지우기도 잡고, 무엇을·왜·되돌릴 수 있나를 한국어로 보여 준다
test('파일 하나 지우기도 멈추고, 지울 파일과 클로드의 설명을 보여 준다', async ($, on) => {
  const asked: string[] = []
  stubs(on, '거절', asked)
  await start($)
  const out = await $.tool.call({ tool: 'Bash', command: 'rm "business/업로드대기/04_s7_x/s7_영상_효과음적게.mp4"', description: '효과음 적게 버전 복사본 지우기' })
  expect(asked.length).toBe(1)
  expect(asked[0]).toContain('파일 삭제')
  expect(asked[0]).toContain('왜: 효과음 적게 버전 복사본 지우기')
  expect(asked[0]).toContain('s7_영상_효과음적게.mp4')
  expect(asked[0]).toContain('되돌릴 수 없습니다')
  expect(out.deny).toContain('파일 삭제')
})

test('변수로 적힌 경로는 따로 경고한다', async ($, on) => {
  const asked: string[] = []
  stubs(on, '거절', asked)
  await start($)
  await $.tool.call({ tool: 'Bash', command: 'D=$(ls -d out/*); rm "$D/a.mp4"' })
  expect(asked[0]).toContain('변수')
})

test('설명이 없으면 없다고 알려 준다', async ($, on) => {
  const asked: string[] = []
  stubs(on, '거절', asked)
  await start($)
  await $.tool.call({ tool: 'Bash', command: 'rm notes.txt' })
  expect(asked[0]).toContain('설명을 붙이지 않았습니다')
})

test('임시 폴더(/tmp)만 지우는 정리는 묻지 않는다', async ($, on) => {
  const asked: string[] = []
  stubs(on, '거절', asked)
  await start($)
  expect(await $.tool.call({ tool: 'Bash', command: 'rm -rf /tmp/scratch/preview' })).toEqual({ result: 'ran' })
  expect(asked.length).toBe(0)
})

test('find -delete 도 잡는다', async ($, on) => {
  const asked: string[] = []
  stubs(on, '거절', asked)
  await start($)
  const out = await $.tool.call({ tool: 'Bash', command: 'find business -name "*.bak" -delete' })
  expect(asked[0]).toContain('찾은 파일 한꺼번에 삭제')
  expect(asked[0]).toContain('*.bak')
  expect(out.deny).toBeTruthy()
})
