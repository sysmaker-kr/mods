# 한도·캐시 전광판 (limit-board)

프롬프트 위 띠에 한 줄로 보여 준다:
`한도  5시간 42% (15:20 초기화)  주간 18%  컨텍스트 31%  캐시 48분 남음`

- 숫자는 클로드 코드가 답변마다 공식으로 넘겨주는 값만 쓴다.
- 캐시 남은 시간: 구독(플랜 한도 안)은 마지막 답변 뒤 1시간, API 키·추가 사용량은 5분(공식 문서 「Cache lifetime」).
  10분 아래면 노랑, 다 식으면 빨강 `캐시 식음 · 다음 질문은 처음부터 다시 읽어요`.
- 한도 %가 50% 이상이면 노랑, 80% 이상이면 빨강.

## 켜는 법

```bash
claude --plugin-dir ~/mods/limit-board
```

`/plugin`에서 `limit-board`가 보이면 켜진 것. 클로드 코드 2.1.287 이상, 터미널 또는 데스크톱 앱(Code 탭).

## 이 모드가 하는 일 (`claude plugin validate`)

```text
hooks: session.start, session.measure, turn.complete, ui.render{component=AbovePrompt}
calls: $.clock.every, $.clock.now, $.ui.invalidate, $.ui.resolve
```

모델 호출·파일·네트워크·프로그램 실행 없음. 테스트: `claude plugin test` (3개) · 확인한 버전 2.1.290
