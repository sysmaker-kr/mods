# 질문 장부 (ask-ledger)

한 번에 여러 개를 물었는데 답이 하나만 올 때, 놓친 질문을 잡아 주는 클로드 코드 모드.

- 답변이 끝날 때마다 작은 모델(haiku)이 판정해서 **프롬프트 위 띠**에 보여 준다:
  `질문 장부  놓친 질문 2  일부만 답함 1  내가 정할 것 3  리스크 2  /ledger`
- `/ledger` → 패널: 묶음별 목록과 요약. `r` 놓친 것 다시 묻기 · `c` 장부 비우기 · 항목 앞 `x` 지우기
- `/ledger text` → 목록을 대화에 출력(클로드도 읽는다)
- `/ledger ask` → 놓친 질문을 내 말로 다시 보낸다

## 켜는 법

1. 압축을 풀어 `ask-ledger` 폴더를 원하는 곳에 둔다(예: 홈 폴더 아래 `mods/ask-ledger`).
2. 그 폴더를 넣어 클로드 코드를 켠다.

```bash
claude --plugin-dir ~/mods/ask-ledger
```

매번 치기 귀찮으면 클로드 코드에 "이 폴더를 항상 불러오게 설정해 줘"라고 말하면 된다(설정 이름 `CLAUDE_CODE_PLUGIN_DIRS`).
켜졌는지는 세션에서 `/plugin`을 열어 `1 mod active · ask-ledger`를 확인한다. 클로드 코드 2.1.287 이상, 터미널 또는 데스크톱 앱(Code 탭)에서 된다.

## 끄는 법

`/plugin`의 Installed 탭에서 끄거나, `--plugin-dir` 없이 클로드 코드를 켜면 된다.

## 비용과 보내는 것

- 사람이 대화하는 세션에서만 판정한다. `claude -p`·cron 실행에서는 판정하지 않는다.
- 답변마다 haiku 1회(내 플랜 사용량).
- 보내는 것: 내 최근 메시지(최대 3개)와 클로드의 마지막 답변(각 1만 2천 자까지).

## 이 모드가 하는 일 (`claude plugin validate`)

```text
hooks: session.start, prompt.submit, turn.complete, session.end, command.run{command=ledger}, ui.render{component=AbovePrompt}, ui.render{component=Pane}
calls: $.clock.after, $.command.register, $.model.complete (via check), $.prompt.submit, $.ui.close, $.ui.invalidate, $.ui.open, $.ui.resolve
```

파일 읽기·쓰기, 네트워크, 프로그램 실행은 없다.

## 한계

- 판정은 작은 모델의 추정이라 틀릴 수 있다. 틀린 항목은 `x`로 지운다.
- 장부는 세션마다 따로이고, `/clear`·`/resume`을 하면 비워진다.

테스트: `claude plugin test` (11개) · 확인한 버전: Claude Code 2.1.290
