# 빵칼 (0-kcal) — Backend

칼로리 균형을 관리하며 대전 빵집을 탐방하는 여행 서비스의 백엔드 API. 빵을 고르면 그 빵집까지
이동하며 소모한 칼로리로 섭취 칼로리를 상쇄하도록 안내한다.

## 기술 스택

- **Runtime**: Node.js >= 20 (개발/운영 스크립트가 `--env-file-if-exists` 플래그를 사용하므로
  Node 20.12+ 또는 21.7+ 권장)
- **Language**: TypeScript
- **Framework**: Express 4
- **ORM / DB**: Prisma + PostgreSQL
- **Auth**: JWT (`jsonwebtoken`)
- **API 문서**: Swagger UI (`swagger-jsdoc` + `swagger-ui-express`) — `/api-docs`
- **테스트**: Jest + ts-jest
- **Lint**: ESLint (flat config, `eslint.config.mjs`)
- **외부 API**: 한국관광공사 TourAPI (KorService2) — 빵집 주변 관광지 추천에 사용, 공모전 제출
  요건상 연동 필수

길안내는 백엔드가 아니라 프론트엔드(네이버 지도 앱 딥링크)에서 처리하므로, 이 저장소는 별도의
지도/경로 API를 호출하지 않는다.

## 시작하기

### 1. 의존성 설치

```bash
npm install
npx prisma generate
```

### 2. 환경변수 설정

`.env.example`을 복사해 `.env`를 만들고 값을 채운다.

```bash
cp .env.example .env
```

| 변수 | 필수 여부 | 설명 |
| --- | --- | --- |
| `DATABASE_URL` | 필수 | PostgreSQL 연결 문자열 |
| `JWT_SECRET` | 권장 | JWT 서명 키. 미설정 시 개발용 기본값(`dev-secret-change-me`)으로 동작하니 운영 환경에서는 반드시 지정 |
| `TOUR_API_SERVICE_KEY` | TourAPI 연동에 필수 | 공공데이터포털에서 발급받은 서비스키 ("Decoding" 값 사용 — "Encoding" 값을 넣으면 요청 시 이중 인코딩되어 실패함) |
| `TOUR_API_BASE_URL` | 선택 | 기본값 `https://apis.data.go.kr/B551011/KorService2`. `locationBasedList2`/`detailCommon2`/`detailImage2`(v2 오퍼레이션)와 짝이 맞아야 하므로 별다른 확인 없이 바꾸지 말 것 |
| `PORT` | 선택 | 기본값 `4000` |

`.env`는 Node 내장 `--env-file-if-exists` 플래그로 `npm run dev`/`npm start` 실행 시 자동
로드된다 (dotenv 등 별도 패키지 불필요, 파일이 없어도 기본값으로 안전하게 동작).

### 3. 로컬 PostgreSQL 준비

번들된 개발용 DB가 없으므로 Docker로 임시 인스턴스를 띄운다:

```bash
docker run -d --name ppangkal-db \
  -e POSTGRES_PASSWORD=devpass -e POSTGRES_DB=ppangkal \
  -p 55432:5432 postgres:16-alpine
```

`.env`의 `DATABASE_URL`을 이 인스턴스에 맞춰 설정한다:

```
DATABASE_URL="postgresql://postgres:devpass@localhost:55432/ppangkal"
```

### 4. 마이그레이션 적용 + 시드

```bash
npx prisma migrate deploy   # 기존 마이그레이션 이력을 그대로 적용
npm run prisma:seed        # 대전 빵집 2곳 / 빵 메뉴 9개 시드
```

### 5. 개발 서버 실행

```bash
npm run dev
```

기본적으로 `http://localhost:4000`에서 실행된다. `GET /health`로 헬스체크, API 전체 스펙은
`http://localhost:4000/api-docs`(Swagger UI)에서 확인할 수 있다.

## 스크립트

| 명령 | 설명 |
| --- | --- |
| `npm run dev` | 개발 서버 (hot reload, `tsx watch`) |
| `npm run build` | `dist/`로 컴파일 |
| `npm start` | 컴파일된 서버 실행 (`dist/server.js`) |
| `npm run lint` / `npm run lint:fix` | ESLint |
| `npm test` | Jest 유닛 테스트 (`npx jest path/to/file.test.ts`로 단일 파일 실행 가능) |
| `npm run prisma:generate` | Prisma Client 생성 |
| `npm run prisma:migrate` | 마이그레이션 생성/적용 (`prisma migrate dev`, 대화형 — 로컬 개발용) |
| `npm run prisma:seed` | 시드 데이터 삽입 |

## 데이터베이스

Prisma 스키마: `prisma/schema.prisma`. 주요 테이블:

- `users` — 사용자 프로필. `daily_goal_calories`는 회원가입 시 Harris-Benedict 공식 + 활동량
  계수로 서버가 자동 계산한다.
- `bakeries` / `bread_items` — 빵집과 메뉴 (대전 성심당·몽심, 자체 조사 데이터).
  `bread_items.source_grade`(A/B/C)로 데이터 신뢰도를 표시하며, C등급은 근거(`source_note`) 필수.
- `tours` / `tour_stops` — 빵투어 세션과 빵집 방문 기록. 한 투어에 여러 빵집을 방문할 수 있고,
  거리/시간/걸음 수는 클라이언트(만보기 + GPS 속도 필터) 실측값이다. 투어 종료 시점의 총 걸음
  수/거리/소모·섭취 칼로리를 스냅샷(`total_*`, `balance_kcal`)으로 저장해, 이후 `food_logs`가
  수정돼도 이미 끝난 투어의 리포트 숫자는 바뀌지 않는다.
- `food_logs` — 실제 섭취 기록. 빵 선택 시 보여주는 "예상 섭취 칼로리"는 저장하지 않고, 실제로
  먹은 걸 확정하는 시점에만 생성된다.
- `tourist_spots` / `spot_images` — 한국관광공사 TourAPI 응답의 read-through 캐시 (7일 TTL,
  만료돼도 삭제하지 않고 UPDATE로 갱신).

마이그레이션 이력(`prisma/migrations/`)은 직접 편집하지 않는다 — 스키마 변경은 항상
`npx prisma migrate dev`로 새 마이그레이션을 생성한다.

## 핵심 도메인 로직

- **이동 소모 칼로리**: 고정 MET(도보 3.5) × 체중(kg) × 시간(h) × 1.05. 도보만 추적하며(GPS
  속도 필터가 시속 20km 초과 구간을 걸음 집계에서 제외), 자전거/버스 같은 이동수단 선택 개념은
  없다.
- **일일 목표 칼로리**: Harris-Benedict 공식 + 활동량 계수(여행 휴식 1.2 / 관광 1.375 /
  도보여행 1.55), 수동 재설정 가능.
- **거리 기반 도보 유도**: 빵집까지 직선거리 1.2km 이내면 도보를 권장하고 예상 소모 칼로리를
  보여준다. 그 이상이면 도착 후(또는 실측 도보 거리가 짧으면) 근처 공원 산책을 TourAPI로 찾아
  제안한다.
- **0-kcal 밸런스 매칭**: 한 투어의 `소모한 칼로리 − 실제 섭취 칼로리`가 0에 가까울수록 좋은
  성과로 표시한다. 하루 단위 잔여 칼로리(`목표 − 섭취 + 소모`)와는 별개의 개념이다.
- **길안내**: 백엔드가 경로를 계산하지 않는다 — 프론트엔드가 네이버 지도 앱으로 딥링크
  (`url_launcher`)해 위임한다.

## API 응답 계약

- 성공 응답: 래퍼 없는 snake_case 평문 JSON 최상위 반환 (예: `{ met_value, calories_burned, message }`)
- 실패 응답: `{ error: { code, message } }` 형태로 통일 (전역 에러 핸들러가 변환)
- 인증이 필요한 엔드포인트는 `Authorization: Bearer {jwt}` 헤더 필요 (회원가입/로그인, 도보
  칼로리 미리보기 계산은 제외)

전체 스펙은 서버 실행 후 `/api-docs`(Swagger UI)에서 확인.
