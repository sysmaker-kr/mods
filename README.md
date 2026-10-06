# 시스메이커 클로드 코드 모드

클로드 코드(2.1.287 이상)에서 쓰는 모드 3개입니다. 영상: https://youtu.be/3BpfQuiq9KM · 자료 페이지: https://sysmaker.kr/go/claude-mods-ledger

## 설치 (클로드 코드 안에서 두 줄)

```
/plugin marketplace add sysmaker-kr/mods
/plugin install ask-ledger@sysmaker
```

나머지 둘도 같은 방식: `limit-board@sysmaker` · `command-brake@sysmaker`

| 모드 | 하는 일 | 하는 동작(`claude plugin validate`) |
|---|---|---|
| ask-ledger 질문 장부 | 답변이 끝날 때마다 작은 AI(하이쿠)가 질문과 답을 대조해 놓친 질문·내가 정할 것·리스크를 한 줄로. `/ledger`로 목록, `r`로 놓친 질문 다시 묻기 | 작은 AI 부르기·다시 묻기·화면 그리기 — 파일·인터넷 없음 |
| limit-board 한도 전광판 | 5시간·주간 한도, 컨텍스트, 캐시 남은 시간 | 시계·화면 그리기뿐 |
| command-brake 위험 명령 브레이크 | 파일·폴더 삭제, 강제 덮어쓰기 같은 되돌리기 어려운 명령을 실행 직전에 멈추고 **무엇을 · 왜 · 되돌릴 수 있는지** 한국어로 묻기 (0.2.0) | 질문 창 하나뿐 |

- 질문 장부는 답변마다 하이쿠를 한 번 불러 내 플랜 사용량을 조금 씁니다. `claude -p`·자동 작업에서는 돌지 않습니다.
- 터미널 또는 데스크톱 앱(Code 탭)에서 화면이 그려집니다. VS Code 확장 채팅창·웹은 안 됩니다.

## 깔기 전에
모드는 내 권한으로 돕니다. 남이 만든 모드는 설치 전에 `claude plugin validate <폴더>`로 하는 일을 먼저 확인하세요. 인터넷 접속과 프로그램 실행이 같이 보이면 만든 사람을 꼭 확인하세요.

있는 그대로 제공하며, 문제는 이슈로 알려 주세요.
