// 위험 명령 브레이크 (command-brake)
// 클로드가 파일을 지우거나 기록을 덮어쓰는 명령을 실행하기 직전에 멈추고 묻는다.
// 공식 문서의 「Hold a tool call until the user decides」 예시를 입문자용으로 넓혔다.
// 목록에 없는 표기는 잡지 못한다 — 브레이크는 보조 장치이고, 권한 확인 창을 대신하지 않는다.
// 모델 호출·파일·네트워크·프로그램 실행 없음.
//
// 0.2.0 (2026-10-07): "명령어 원문만 보여 주면 나 같은 사람은 무슨 내용인지 모른다"(사용자).
//   → 파일 하나 지우기(rm)도 잡고, 질문을 '무엇을 · 왜 · 되돌릴 수 있나' 한국어로 쓴다.
//     왜 = 클로드가 명령에 붙인 설명(description). 무엇을 = 명령에서 뽑은 지울 대상.
//     변수($D)·패턴(*)으로 적힌 대상은 실행할 때 정해지므로 그 사실을 따로 경고한다.
//
// 0.3.0 (2026-10-07): "너무 자주 걸린다, 작업에 방해될 수준"(사용자).
//   → 작업용·임시 폴더(build·dist·out·renders·preview·scratch·demos·cache·/tmp …) 정리는 묻지 않는다.
//     파일 하나 지우기는 .env·.git·DB 같은 되돌리기 어려운 파일일 때만 묻는다. 코드 안 삭제 감지는 뺐다(판단 불가·소음).
//     원본 폴더 삭제·깃 기록 덮어쓰기·디스크·권한·DB는 그대로 묻는다.

const RISKY = [
  // 지우기 — 위에서부터 먼저 맞는 것 하나만 쓴다(폴더째가 파일 하나보다 먼저)
  [/\brm\s+(-[a-zA-Z]*[rR][a-zA-Z]*\s+|--recursive\s+)/, '폴더째 삭제', 'rm'],
  [/(^|[\s;&|(])rm\s+/, '중요 파일 삭제', 'rm1'],
  [/\bfind\b[^\n]*\s(-delete\b|-exec\s+rm\b)/, '찾은 파일 한꺼번에 삭제', 'find'],
  // 기록 덮어쓰기
  [/\bgit\s+reset\s+--hard\b/, '저장 안 한 변경 지우기', ''],
  [/\bgit\s+push\b.*\s(--force|--force-with-lease|-f)\b/, '원격 기록 덮어쓰기', ''],
  [/\bgit\s+clean\s+-[a-zA-Z]*f/, '추적 안 하는 파일 삭제', ''],
  [/\bgit\s+(checkout|restore)\s+(--\s+)?\.(\s|$)/, '고친 내용 전부 되돌리기', ''],
  [/\b(mkfs(\.\w+)?|diskpart|format\s+[a-zA-Z]:)/i, '디스크 포맷', ''],
  [/\bdd\s+[^\n]*\bof=/, '디스크에 직접 쓰기', ''],
  [/\bchmod\s+-R\s+777\b/, '모든 권한 열기', ''],
  [/\bDROP\s+(TABLE|DATABASE|SCHEMA)\b/i, '데이터베이스 삭제', ''],
]

const UNDO = {
  '폴더째 삭제': '휴지통을 거치지 않아 되돌릴 수 없습니다.',
  '중요 파일 삭제': '휴지통을 거치지 않아 되돌릴 수 없습니다.',
  '찾은 파일 한꺼번에 삭제': '휴지통을 거치지 않아 되돌릴 수 없습니다.',
  '저장 안 한 변경 지우기': '커밋하지 않은 수정이 사라지고 되돌릴 수 없습니다.',
  '원격 기록 덮어쓰기': '깃허브에 있던 기록이 덮여 다른 사람 작업이 사라질 수 있습니다.',
  '추적 안 하는 파일 삭제': '깃이 모르는 파일이 지워지고 되돌릴 수 없습니다.',
  '고친 내용 전부 되돌리기': '저장 안 한 수정이 사라지고 되돌릴 수 없습니다.',
}

let interactive = true

function match(command) {
  for (const [re, label, kind] of RISKY) if (re.test(command)) return { label, kind }
  return null
}

// 따옴표·이스케이프를 대충 벗긴 낱말 목록 (셸 해석기가 아니다 — 보여 주기용)
function words(segment) {
  const out = []
  const re = /"((?:\\.|[^"\\])*)"|'([^']*)'|(\S+)/g
  let m
  while ((m = re.exec(segment))) out.push(m[1] ?? m[2] ?? m[3])
  return out
}

// rm 대상 = rm 뒤의 옵션 아닌 낱말들. 여러 rm이 있으면 전부 모은다
function rmTargets(command) {
  const targets = []
  for (const seg of command.split(/&&|\|\||;|\||\n/)) {
    const w = words(seg.trim())
    const i = w.findIndex((x) => x === 'rm')
    if (i < 0) continue
    for (const x of w.slice(i + 1)) if (!x.startsWith('-')) targets.push(x)
  }
  return targets
}

// 작업용·임시 폴더 — 여기 안만 지우는 정리는 묻지 않는다(다시 만들 수 있는 것들)
const SAFE_DIRS = new Set(['build', 'dist', 'out', 'tmp', 'temp', '.tmp', 'cache', '.cache', 'node_modules', '__pycache__',
  '.pytest_cache', 'coverage', '.next', '.turbo', 'target', 'renders', 'render', 'preview', 'previews', 'snapshots',
  'scratch', 'scratchpad', 'demos', 'clips', 'logs', 'late', 'harness', 'frames'])
function safeTarget(t) {
  if (t.startsWith('/tmp/') || t.startsWith('~/.cache/')) return true
  const segs = t.split('/').filter(Boolean)
  return segs.some((x) => SAFE_DIRS.has(x) || /preview|render|scratch|cache|tmp|temp/i.test(x))
}
// 파일 하나 지우기에서 묻는 '중요 파일' — 비밀값·깃 기록·데이터베이스
function preciousFile(t) {
  const name = t.split('/').pop() || ''
  return /^\.env(\.|$)/.test(name) || t.includes('.git/') || name === '.git' || /\.(db|sqlite3?|kdbx|pem|key)$/i.test(name)
}

function findTarget(command) {
  const w = words(command)
  const i = w.indexOf('find')
  const where = i >= 0 && w[i + 1] && !w[i + 1].startsWith('-') ? w[i + 1] : '.'
  const n = w.findIndex((x) => x === '-name' || x === '-iname')
  return n >= 0 && w[n + 1] ? `${where} 안에서 이름이 "${w[n + 1]}"인 것 전부` : `${where} 안에서 조건에 맞는 것 전부`
}

// 긴 경로는 마지막 두 칸만 — 파일 이름이 먼저 눈에 들어오게
function short(path) {
  const parts = path.split('/').filter(Boolean)
  if (parts.length <= 2) return path
  return parts[parts.length - 1] + '   (' + '…/' + parts[parts.length - 2] + '/ 안)'
}

function explain(command, hit, description) {
  const lines = ['위험 명령 브레이크 · ' + hit.label]
  lines.push('왜: ' + (description ? description : '(클로드가 설명을 붙이지 않았습니다 — 실행 전에 무엇을 왜 지우는지 물어보세요)'))
  const warn = []
  if (hit.kind === 'rm' || hit.kind === 'rm1') {
    const ts = rmTargets(command)
    lines.push('지울 것' + (ts.length ? ' ' + ts.length + '개:' : ':'))
    for (const t of ts.slice(0, 6)) lines.push('  · ' + short(t))
    if (ts.length > 6) lines.push('  · …외 ' + (ts.length - 6) + '개')
    if (ts.some((t) => t.includes('$'))) warn.push('경로가 변수($…)로 적혀 있어 실행할 때 정해집니다. 변수가 비면 엉뚱한 곳을 지울 수 있어요.')
    if (ts.some((t) => /[*?]/.test(t))) warn.push('패턴(*)이 들어 있어 이름이 맞는 파일이 여러 개 지워질 수 있어요.')
  } else if (hit.kind === 'find') {
    lines.push('지울 것: ' + findTarget(command))
  }
  if (UNDO[hit.label]) lines.push('되돌리기: ' + UNDO[hit.label])
  for (const w of warn) lines.push('⚠ ' + w)
  const raw = command.length > 160 ? command.slice(0, 160) + '…' : command
  lines.push('명령 원문: ' + raw.replace(/\s*\n\s*/g, ' ⏎ '))
  lines.push('이 명령을 실행할까요?')
  return lines.join('\n')
}

export function register(on) {
  on('session.start', async ($, e, next) => {
    interactive = e.isInteractive !== false
    return next(e)
  })

  on('tool.call', { tool: 'Bash' }, async ($, e, next) => {
    const command = String(e.command || '')
    const hit = match(command)
    // 묻을 사람이 없는 실행(claude -p·cron)은 클로드 코드의 권한 규칙에 맡긴다
    if (!hit || !interactive) return next(e)
    // 0.3.0: 작업용·임시 폴더 정리는 묻지 않는다 — 작업 찌꺼기 청소마다 멈추면 브레이크가 소음이 된다
    if (hit.kind === 'rm') {
      const ts = rmTargets(command)
      if (ts.length && ts.every((t) => safeTarget(t) && !/\.\./.test(t))) return next(e)
    }
    if (hit.kind === 'rm1') {
      // 파일 하나 지우기는 .env·.git·DB 같은 되돌리기 어려운 파일일 때만 묻는다
      if (!rmTargets(command).some(preciousFile)) return next(e)
    }
    if (hit.kind === 'find') {
      const w = words(command), i = w.indexOf('find'), where = i >= 0 && w[i + 1] && !w[i + 1].startsWith('-') ? w[i + 1] : '.'
      if (safeTarget(where)) return next(e)
    }
    let answer = '거절'
    try {
      answer = await $.ui.ask(explain(command, hit, String(e.description || '').trim()), ['실행', '거절'])
    } catch {
      // 질문을 닫았거나 답할 수 없는 상황 — 실행하지 않는 쪽으로
    }
    if (answer !== '실행') {
      return { deny: '사용자가 이 명령(' + hit.label + ')을 거절했습니다. 다른 방법으로 우회하기 전에 먼저 사용자에게 무엇을 왜 지우려는지 쉬운 말로 설명하고 물어보세요.' }
    }
    return next(e)
  }).catch(async ($, e, next) => {
    // 브레이크가 고장 나면 실행하지 않는다(실패 시 닫힘)
    return next.called ? undefined : { deny: '위험 명령 브레이크가 응답하지 않아 이 명령을 실행하지 않았습니다(' + next.error.kind + ').' }
  })
}
