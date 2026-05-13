# 소셜 로그인(OAuth) 연동 가이드

이 문서는 TCG Hub 프로젝트에 네이버 및 카카오 로그인을 최종 활성화하기 위한 설정 단계를 설명합니다.

---

## 1. 개요
현재 `src/routes/login.tsx`에 네이버 및 카카오 로그인 연동 코드는 구현되어 있으나, 실제 동작을 위해서는 각 서비스의 개발자 센터 등록과 Supabase 대시보드 설정이 필요합니다.

## 2. 서비스별 설정 단계

### 🟢 네이버 (Naver)
1. **네이버 개발자 센터** ([developers.naver.com](https://developers.naver.com/)) 접속 및 로그인
2. **Application > 애플리케이션 등록** 선택
3. **애플리케이션 이름** 입력
4. **사용 API**에서 '네이버 로그인' 선택
    - 필수 권한: 회원이름, 이메일 주소, 프로필 사진 (필요에 따라 선택)
5. **로그인 오픈 API 서비스 환경 설정**:
    - **서비스 URL**: `https://<YOUR_APP_DOMAIN>` (개발 시에는 `http://localhost:8080` 등 추가 가능)
    - **네이버 로그인 Callback URL**: `https://<SUPABASE_PROJECT_ID>.supabase.co/auth/v1/callback`
6. 발급된 **Client ID**와 **Client Secret**을 기록해 둡니다.

### 🟡 카카오 (Kakao)
1. **카카오 개발자 센터** ([developers.kakao.com](https://developers.kakao.com/)) 접속 및 로그인
2. **내 애플리케이션 > 애플리케이션 추가하기**
3. **제품 설정 > 카카오 로그인**:
    - **활성 상태**: ON으로 변경
    - **Redirect URI**: `https://<SUPABASE_PROJECT_ID>.supabase.co/auth/v1/callback` 추가
4. **제품 설정 > 카카오 로그인 > 동의항목**:
    - 닉네임, 프로필 사진, 카카오계정(이메일) 등을 설정
5. **앱 설정 > 앱 키**:
    - **REST API 키**를 기록해 둡니다 (이것이 Client ID 역할을 합니다).
6. **제품 설정 > 카카오 로그인 > 보안**:
    - **Client Secret**을 생성하고 기록해 둡니다.

---

## 3. Supabase 설정 (가장 중요)

1. **Supabase Dashboard** ([app.supabase.com](https://app.supabase.com/)) 접속
2. 해당 프로젝트 선택 > **Authentication > Providers** 메뉴 이동
3. 각 Provider 설정:
    - **Naver**:
        - `Enabled` 스위치 ON
        - 네이버에서 받은 `Client ID`와 `Client Secret` 입력
    - **Kakao**:
        - `Enabled` 스위치 ON
        - 카카오에서 받은 `REST API Key` (Client ID)와 `Client Secret` 입력
4. 상단의 **Save** 버튼을 클릭하여 저장

---

## 4. 확인 및 테스트

1. 로컬 개발 서버 또는 배포된 사이트의 로그인 페이지로 이동합니다.
2. 네이버/카카오 로그인 버튼을 클릭합니다.
3. 각 서비스의 로그인 창이 정상적으로 뜨고, 인증 후 `/matches` 페이지로 리다이렉트되는지 확인합니다.
4. Supabase의 `auth.users` 테이블에 새로운 사용자가 생성되었는지 확인합니다.

---

## ⚠️ 주의사항
- **Redirect URI** 오타에 주의하세요. (반드시 `auth/v1/callback`으로 끝나야 합니다.)
- **보안**: Client Secret은 절대로 클라이언트 코드에 직접 노출되지 않도록 하세요. (Supabase 대시보드에만 입력하면 됩니다.)
- **Lovable 협업**: Supabase 설정을 변경한 후에는 Lovable 환경에서도 세션이 정상적으로 유지되는지 확인하세요.
