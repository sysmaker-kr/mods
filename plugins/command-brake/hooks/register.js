// 위험 명령 브레이크 (command-brake)
// 클로드가 폴더를 통째로 지우거나 기록을 덮어쓰는 명령을 실행하기 직전에 멈추고 묻는다.
// 공식 문서의 「Hold a tool call until the user decides」 예시를 입문자용으로 넓혔다.
// 목록에 없는 표기는 잡지 못한다 — 브레이크는 보조 장치이고, 권한 확인 창을 대신하지 않는다.
// 모델 호출·파일·네트워크·프로그램 실행 없음.

const RISKY = [
  [/\brm\s+(-[a-zA-Z]*[rR][a-zA-Z]*|--recursive)\b/, '폴더째 삭제'],
  [/\bgit\s+reset\s+--hard\b/, '저장 안 한 변경 지우기'],
  [/\bgit\s+push\b.*\s(--force|--force-with-lease|-f)\b/, '원격 기록 덮어쓰기'],
  [/\bgit\s+clean\s+-[a-zA-Z]*f/, '추적 안 하는 파일 삭제'],
  [/\bgit\s+(checkout|restore)\s+(--\s+)?\.(\s|$)/, '고친 내용 전부 되돌리기'],
  [/\b(mkfs(\.\w+)?|diskpart|format\s+[a-zA-Z]:)/i, '디스크 포맷'],
  [/\bdd\s+[^\n]*\bof=/, '디스크에 직접 쓰기'],
  [/\bchmod\s+-R\s+777\b/, '모든 권한 열기'],
  [/\bDROP\s+(TABLE|DATABASE|SCHEMA)\b/i, '데이터베이스 삭제'],
]

let interactive = true

function match(command) {
  for (const [re, label] of RISKY) if (re.test(command)) return label
  return ''
}

export function register(on) {
  on('session.start', async ($, e, next) => {
    interactive = e.isInteractive !== false
    return next(e)
  })

  on('tool.call', { tool: 'Bash' }, async ($, e, next) => {
    const label = match(String(e.command || ''))
    // 묻을 사람이 없는 실행(claude -p·cron)은 클로드 코드의 권한 규칙에 맡긴다
    if (!label || !interactive) return next(e)
    let answer = '거절'
    try {
      answer = await $.ui.ask('위험 명령 브레이크 · ' + label + '\n' + e.command + '\n이 명령을 실행할까요?', ['실행', '거절'])
    } catch {
      // 질문을 닫았거나 답할 수 없는 상황 — 실행하지 않는 쪽으로
    }
    if (answer !== '실행') {
      return { deny: '사용자가 이 명령(' + label + ')을 거절했습니다. 다른 방법으로 우회하기 전에 먼저 사용자에게 물어보세요.' }
    }
    return next(e)
  }).catch(async ($, e, next) => {
    // 브레이크가 고장 나면 실행하지 않는다(실패 시 닫힘)
    return next.called ? undefined : { deny: '위험 명령 브레이크가 응답하지 않아 이 명령을 실행하지 않았습니다(' + next.error.kind + ').' }
  })
}
