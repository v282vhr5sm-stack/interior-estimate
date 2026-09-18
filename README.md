# 견적 작업실

인테리어 공정별 자재·면적으로 원가를 계산하고, 고객용 견적서를 만드는 웹 앱입니다.
아이폰·아이패드·노트북에서 홈 화면 앱으로 설치해 쓰고, 같은 계정으로 로그인하면 데이터가 자동으로 맞춰집니다.

- 데이터는 각 기기에 먼저 저장되고(인터넷이 없어도 작동), 연결되면 Supabase로 동기화됩니다.
- AI 단가표 읽기는 선택 기능입니다. 설정에서 Anthropic API 키를 넣은 기기에서만 동작합니다.

## 처음 설치 (한 번만)

### 1. Supabase (데이터 저장소, 무료)
1. https://supabase.com 에 가입하고 **New project** 를 만듭니다. 지역은 `Northeast Asia (Seoul)` 을 고릅니다. 데이터베이스 비밀번호는 따로 적어두세요.
2. 왼쪽 메뉴 **SQL Editor** → 새 쿼리 → 이 폴더의 `supabase.sql` 내용을 전부 붙여넣고 **Run**.
3. **Authentication → Users → Add user → Create new user**: 앱에 로그인할 이메일·비밀번호를 넣고 **Auto Confirm User** 를 체크한 뒤 만듭니다.
4. **Authentication → Sign In / Providers** 에서 **Allow new users to sign up** 을 끕니다. (나 말고는 가입할 수 없게)
5. **Project Settings → API Keys** 에서 `Project URL` 과 `Publishable key`(또는 `anon` 키)를 복사해 `config.js` 에 넣습니다.
   - `secret` / `service_role` 키는 절대 넣지 마세요.

### 2. GitHub Pages (앱 주소, 무료)
1. https://github.com 에 가입하고 **New repository** → 이름 `interior-estimate`, **Public** 으로 만듭니다.
2. **uploading an existing file** → 이 폴더 안의 파일과 `icons` 폴더를 전부 끌어다 놓고 **Commit changes**.
3. 저장소 **Settings → Pages** → Source: `Deploy from a branch`, Branch: `main` / `(root)` → **Save**.
4. 1~2분 뒤 `https://<GitHub아이디>.github.io/interior-estimate/` 로 접속됩니다.

### 3. 기기에 설치
- **아이폰·아이패드**: Safari로 위 주소 열기 → 공유 버튼 → **홈 화면에 추가**
- **노트북**: Chrome 또는 Edge로 열기 → 주소창 오른쪽 **설치** 아이콘 (또는 그냥 즐겨찾기)
- 각 기기에서 3단계에서 만든 이메일·비밀번호로 로그인합니다.

## 수정·업데이트할 때
1. 파일을 고칩니다. (Claude 등 AI에게 이 폴더의 파일을 주고 요청해도 됩니다)
2. **`sw.js` 맨 위의 `VERSION` 숫자를 1 올립니다.** 이걸 빼먹으면 기기에 새 버전이 안 뜹니다.
3. GitHub 저장소에서 **Add file → Upload files** 로 바뀐 파일을 같은 이름으로 올려 덮어씁니다.
4. 기기에서 앱을 다시 열면 “새 버전이 있습니다 → 지금 적용”이 뜹니다.

데이터는 앱 파일과 따로 저장되어 있어서 업데이트해도 지워지지 않습니다. 큰 수정 전에는 **설정 → 백업 파일 만들기**를 해두세요.

## 알아둘 점
- Supabase 무료 프로젝트는 **일주일 동안 아무도 쓰지 않으면 일시 중지**됩니다. 그동안에도 앱은 기기 저장본으로 계속 쓸 수 있고, Supabase 대시보드에서 **Restore** 를 누르면 다시 동기화됩니다.
- GitHub 저장소가 Public 이라 앱 코드는 공개되지만, 견적 데이터는 Supabase에 있고 로그인한 본인만 볼 수 있습니다.
- Anthropic API 키는 `config.js` 에 넣지 말고 앱의 설정 화면에서 기기마다 넣으세요. (공개 저장소에 올라가면 안 됩니다)

## 파일 구성
| 파일 | 역할 |
|---|---|
| `index.html` | 화면 틀 |
| `styles.css` | 디자인 |
| `app.js` | 계산·저장·동기화·AI 읽기 등 모든 기능 |
| `config.js` | Supabase 연결 정보 |
| `sw.js` | 오프라인 실행과 업데이트 알림 |
| `manifest.webmanifest`, `icons/` | 홈 화면 앱 이름·아이콘 |
| `supabase.sql` | Supabase 테이블·보안 설정 (처음 한 번 실행) |
| `.serve.cjs` | 내 컴퓨터에서 확인용 서버 (`node .serve.cjs`) — 배포엔 필요 없음 |
