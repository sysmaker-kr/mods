# 위험 명령 브레이크 (command-brake)

클로드가 되돌리기 어려운 명령을 실행하기 직전에 멈추고 한국어로 묻는다:

```text
위험 명령 브레이크 · 폴더째 삭제
rm -rf build
이 명령을 실행할까요?   1. 실행   2. 거절
```

거절하면 실행하지 않고, 클로드에게 "다른 방법으로 우회하기 전에 먼저 물어보라"고 전한다.

잡는 명령: 폴더째 삭제(`rm -r`·`rm -rf`) · 저장 안 한 변경 지우기(`git reset --hard`) · 원격 기록 덮어쓰기(`git push -f`·`--force`) ·
추적 안 하는 파일 삭제(`git clean -f`) · 고친 내용 전부 되돌리기(`git checkout .`) · 디스크 포맷 · 디스크에 직접 쓰기(`dd of=`) ·
모든 권한 열기(`chmod -R 777`) · 데이터베이스 삭제(`DROP TABLE`)

## 한계

- 목록에 없는 표기는 잡지 못한다. 클로드 코드의 원래 권한 확인 창을 대신하지 않는다(에어백이지 안전벨트가 아니다).
- 묻을 사람이 없는 실행(`claude -p`·cron)에서는 끼어들지 않는다.
- 브레이크가 고장 나면 그 명령은 실행하지 않는다(실패 시 닫힘).

## 켜는 법

```bash
claude --plugin-dir ~/mods/command-brake
```

## 이 모드가 하는 일 (`claude plugin validate`)

```text
hooks: session.start, tool.call{tool=Bash}
calls: $.ui.ask
```

모델 호출·파일·네트워크·프로그램 실행 없음. 테스트: `claude plugin test` (5개) · 확인한 버전 2.1.290
