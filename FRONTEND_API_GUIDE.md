# 빵칼 (0-kcal) — Flutter 프론트엔드 API 가이드

이 문서는 Flutter 앱을 만들 때 백엔드 API를 **언제, 어떻게** 호출해야 하는지, 그리고 **백엔드에
없어서 프론트에서 직접 구현해야 하는 것**이 뭔지 정리한 문서다. 서버 실행 중이면
`http://<host>:4000/api-docs`(Swagger UI)에서 실시간 스펙을 그대로 확인할 수 있으니, 이 문서는
"전체 그림"과 "호출 순서"를 잡는 용도로 쓰고 필드 하나하나의 최종 확인은 Swagger로 하면 된다.

---

## 0. 기본 정보

- **Base URL**: `http://<host>:4000/api` (로컬 개발 시 `http://localhost:4000/api`)
- **인증**: 로그인 후 받은 JWT를 모든 인증 필요 엔드포인트에 `Authorization: Bearer <token>` 헤더로 실어 보낸다.
- **성공 응답**: 래퍼 없는 평문 JSON, 필드는 전부 snake_case (`{ met_value, calories_burned, ... }`)
- **실패 응답**: 항상 `{ "error": { "code": "...", "message": "..." } }` 형태 (HTTP 상태코드도 같이 옴 — 400/401/404/500)
- **헬스체크**: `GET /health` (인증 불필요, `/api` 접두사 없음)

---

## 1. 인증 흐름

| 단계 | 호출 |
| --- | --- |
| 회원가입 | `POST /api/auth/signup` — `{ name, gender, age, height, weight, activity_level }` → `{ user: { id, name, daily_goal_calories }, token }` |
| 로그인 (MVP: user_id 기반 간편 로그인) | `POST /api/auth/login` — `{ user_id }` → `{ token }` |
| 내 프로필 조회 | `GET /api/users/me` (인증) → `{ id, name, gender, age, height, weight, activity_level, daily_goal_calories }` |
| 내 프로필 수정 | `PATCH /api/users/me` (인증) — `weight`/`height`/`age`/`activity_level`/`daily_goal_calories` 중 바꿀 필드만 |

- `activity_level`은 정확히 `여행 휴식` / `관광` / `도보여행` 셋 중 하나만 허용 (다른 문자열이면 400).
- `daily_goal_calories`는 서버가 Harris-Benedict 공식으로 자동 계산해줌 — 프론트에서 계산할 필요 없음.
- 로그인 후 받은 `token`은 로컬에 저장해두고, 이후 모든 요청에 계속 실어 보낸다. 만료 30일.

---

## 2. 8단계 흐름 ↔ API 호출 매핑

전체 서비스 흐름(`idea.md` §2)에 맞춰 어떤 화면에서 뭘 호출하면 되는지 정리했다.

### 1단계 — 빵투어 시작 & 센서 가동
- `POST /api/tours` (인증) → `{ id, started_at }`
- 이 `tour_id`를 투어가 끝날 때까지 프론트 상태에 들고 있는다.
- 만보기/GPS 센서 가동은 **백엔드 API 없음** — 전부 프론트 책임 (§4 참고).

### 2~3단계 — 빵집 검색 & 거리 기반 가이드
- `GET /api/bakeries?lat={위도}&lng={경도}&radius_km={반경}&sort={distance|rating|recommended}&user_weight={체중}`
  - `radius_km` 기본값 3 — 5km로 보고 싶으면 그냥 `radius_km=5`로 호출 (별도 대응 불필요, 이미 지원됨).
  - `user_weight`를 같이 보내면 각 빵집에 `estimated_walk_calories`(도보 예상 소모 칼로리)가 계산돼서 옴. 안 보내면 `null`.
  - 응답의 `walk_recommended: true/false`가 곧 1.2km 컷오프 배지 — `true`면 "걸어가기 딱 좋은 거리예요!" 문구를 보여주면 됨.
  - "1.2km 초과 시 도착 후 산책 제안" 미리보기도 이 응답에 `suggested_walk`로 같이 온다 — `user_weight`를 보내야 채워지고(칼로리 계산에 필요), `walk_recommended: true`인 빵집은 항상 `null`(이미 도보로 가니 산책 제안이 필요 없음).
- 빵집 상세(소개글/사진/영업정보): `GET /api/bakeries/{bakeryId}` — `tour_info` 필드에 TourAPI 등록된 유명 빵집만 소개글/사진/대표메뉴/영업시간 등이 채워짐, 미등록이면 `tour_info: null` (정상 동작, 에러 아님).

### 4단계 — 빵 선택 & 예상 칼로리 산출
- `GET /api/bakeries/{bakeryId}/items` → `bread_items[]` (id, name, price, calories 등)
- **"예상 섭취 칼로리"는 저장하지 않는다.** `calories × 수량`을 프론트에서 그냥 화면에 계산해서 보여주면 끝 — 이 시점엔 서버에 아무것도 안 보냄.

### 5단계 — 네이버 지도 외부 호출
- **백엔드 API 없음.** `url_launcher`로 네이버 지도 앱 딥링크를 직접 열고, 앱이 없으면 `https://m.map.naver.com/...` 웹으로 폴백한다. 백엔드는 경로를 계산하지 않는다.

### 6단계 — GPS 속도 필터링 동작
- **백엔드 API 없음.** 이동 중 실시간 속도 감시, 시속 20km 이하 구간만 걸음으로 인정하는 로직은 전부 프론트에서 처리 (§4 참고). 서버는 결과(집계값)만 7단계에서 받는다.

### 7단계 — 도착 & 실제 먹은 빵 정산
1. 빵집 도착 시 `POST /api/tours/{tourId}/stops` — `{ bakery_id, distance_m, duration_minutes, steps }` (이 구간에서 실측한 값)
   → `{ id(=tour_stop_id), calories_burned, suggested_walk }` 받음. `suggested_walk`가 있으면 "도착 후 산책" 카드를 보여주면 됨 (없으면 `null`, 정상).
2. 실제 먹은 빵 확정: `POST /api/food-logs` — `{ bread_item_id, tour_stop_id, quantity }` (`tour_stop_id`는 위에서 받은 값)
   → 여러 개 먹었으면 빵 종류별로 여러 번 호출.
3. 0-kcal 밸런스 바 갱신용 실시간 값: `GET /api/calories/balance` (인증) → `remaining_calories`, `status`(green/yellow/red)

### 8단계 — 투어 종료 & 결과 저장
- `PATCH /api/tours/{tourId}/complete` (인증) → `{ total_steps, total_distance_m, total_calories_burned, total_calories_consumed, balance_kcal }` — 이 값으로 종료 요약 카드를 그린다.
- 방문 빵집별 상세까지 포함한 전체 리포트가 필요하면: `GET /api/tours/{tourId}` → `stops[]`(빵집별 거리/시간/걸음수/칼로리) 포함.

### 그 외 — 통계 화면
- `GET /api/stats/daily?date=YYYY-MM-DD` → 하루 섭취/소모 칼로리, 방문 빵집 수
- `GET /api/stats/weekly?to=YYYY-MM-DD` → 최근 7일 그래프용 데이터 + 목표 달성률

---

## 3. 전체 엔드포인트 레퍼런스

| Method | Path | 인증 | 설명 |
| --- | --- | --- | --- |
| POST | `/auth/signup` | ✗ | 회원가입 |
| POST | `/auth/login` | ✗ | 로그인 (user_id 기반) |
| GET | `/users/me` | ✓ | 내 프로필 |
| PATCH | `/users/me` | ✓ | 프로필 수정 |
| GET | `/bakeries` | ✗ | 주변 빵집 목록 |
| GET | `/bakeries/{bakeryId}` | ✗ | 빵집 상세 (TourAPI 보강 포함) |
| GET | `/bakeries/{bakeryId}/items` | ✗ | 빵 메뉴 목록 |
| POST | `/tours` | ✓ | 투어 시작 |
| POST | `/tours/{tourId}/stops` | ✓ | 빵집 도착 기록 |
| GET | `/tours/{tourId}` | ✓ | 투어 상세 (리포트 카드) |
| PATCH | `/tours/{tourId}/complete` | ✓ | 투어 종료 |
| POST | `/calories/calculate` | ✗ | 도보 소모 칼로리 단건 계산 (미리보기용) |
| GET | `/calories/balance` | ✓ | 오늘의 실시간 칼로리 밸런스 |
| POST | `/food-logs` | ✓ | 섭취 기록 생성 |
| GET | `/food-logs?from=&to=` | ✓ | 섭취 기록 조회 |
| GET | `/stats/daily?date=` | ✓ | 일별 통계 |
| GET | `/stats/weekly?to=` | ✓ | 주간 통계 |
| GET | `/tour/nearby?lat=&lng=&radius_km=` | ✓ | 주변 관광지 목록 (TourAPI) |
| GET | `/tour/spots/{contentId}` | ✓ | 관광지 상세 (TourAPI) |

`/tour`(단수, TourAPI 관광정보 프록시)와 `/tours`(복수, 빵투어 세션)는 이름이 비슷하지만 완전히 다른 리소스이니 헷갈리지 말 것.

---

## 4. 백엔드에 없어서 프론트가 직접 구현해야 하는 것

| 기능 | 구현 방식 |
| --- | --- |
| 백그라운드 센서 유지 (화면 꺼져도 동작) | `flutter_background_service` |
| 만보기 | 플랫폼 만보기 센서 패키지 |
| GPS 속도 필터 (시속 20km 이하만 걸음 인정) | 위치 스트림에서 속도 계산 후 필터링, 결과만 7단계에서 서버로 전송 |
| 길안내 | `url_launcher`로 네이버 지도 앱 딥링크 (미설치 시 `m.map.naver.com` 웹 폴백 필수) |
| 상주 알림 (OS 강제종료 방지) | Android Foreground Service Notification |
| 섭취 사진 | 촬영 후 **기기 갤러리에만 저장** — 서버 업로드 없음, `food_logs`에 사진 관련 필드 자체가 없음 |
| 지도에 빵집 핀 표시 (목록 화면) | **아직 미정.** 지금 백엔드는 위경도 숫자만 내려주고, 실제 지도 렌더링(SDK)은 프론트에서 결정 안 됨 — 필요하면 별도로 논의 |

---

## 5. 에러 처리

모든 실패 응답은 동일한 모양이다:

```json
{ "error": { "code": "INVALID_PARAMS", "message": "lat, lng는 필수 값입니다." } }
```

| HTTP 상태 | code 예시 | 의미 |
| --- | --- | --- |
| 400 | `INVALID_PARAMS` | 필수 값 누락/형식 오류 |
| 401 | `UNAUTHORIZED` | 토큰 없음/만료/유효하지 않음 |
| 404 | `NOT_FOUND` | 리소스 없음 (빵집/투어/투어스톱/빵 메뉴 등) |
| 500 | `INTERNAL_ERROR` | 서버 오류 |

`message`는 사용자에게 그대로 보여줘도 되는 한국어 문장으로 와 있음(예: "bread_item_id는 필수 값입니다.").

---

## 6. 참고

- 서버 실행 중이면 `/api-docs`에서 요청/응답 스키마를 직접 눌러보며 테스트 가능 (Swagger UI, `Authorize` 버튼에 `Bearer <token>` 입력하면 인증 필요 엔드포인트도 바로 테스트 가능).
- `suggested_walk`, `tour_info` 등 "있을 수도 없을 수도" 있는 필드는 전부 `null`이 정상 케이스다(TourAPI 미등록, 도보로 이미 도착 등) — 에러로 처리하지 말 것.
