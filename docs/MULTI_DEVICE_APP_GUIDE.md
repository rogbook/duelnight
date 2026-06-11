# DuelNight 멀티 디바이스 지원 및 하이브리드 앱 구축 가이드

본 문서는 PC, 태블릿, 모바일 기기를 모두 아우르는 **PWA(Progressive Web App)** 사용 방법과 **Capacitor**를 이용한 iOS 및 Android 네이티브 앱 패키징 절차를 설명합니다.

---

## 1. 반응형 UI 및 터치 UX 설계 원칙

모바일과 태블릿 환경에서 오작동 없는 쾌적한 UX를 제공하기 위해 디자인 시스템 수준에서 아래 규칙을 지키고 있습니다.

1. **안전 영역 (Safe Area) 적용**:
   - 모바일 상단 노치 및 하단 홈 바 영역 침범을 방지하기 위해 헤더와 네비게이션 트레이에 `env(safe-area-inset-top)` 및 `env(safe-area-inset-bottom)`을 패딩 값으로 할당합니다 (`src/routes/__root.tsx` 참고).
2. **최소 터치 타깃 확보**:
   - 모바일/태블릿 터치 조작 시 오클릭을 피할 수 있도록 모든 버튼과 입력 필드의 터치 영역을 최소 **32px ~ 44px 이상**으로 유지합니다.
3. **가로 스크롤 및 레이아웃**:
   - 화면 비율이 좁은 모바일에서는 데스크톱의 2열 레이아웃을 **1열 세로 스택**으로 자동 전환하고, 벤치 카드 및 손패(hand) 트레이와 같이 아이템이 많은 영역은 `overflow-x-auto`를 주어 가로 스와이프 조작을 지원합니다.

---

## 2. PWA (Progressive Web App) 활용

DuelNight는 PWA 표준이 이미 구성되어 있어, 웹 브라우저를 통해 모바일/태블릿 바탕화면에 **설치형 독립 앱**으로 등록하여 사용할 수 있습니다.

### 2.1. 기등록된 PWA 파일 목록

- **웹 매니페스트**: [`public/manifest.webmanifest`](file:///g:/%EB%82%B4%20%EB%93%9C%EB%9D%BC%EC%9D%B4%EB%B8%8C/Development/duelnight/public/manifest.webmanifest)
  - 앱 이름(`DuelNight`), 배경색 및 테마색, 시작 URL, 아이콘 정의 완료.
- **HTML Head 설정**: [`src/routes/__root.tsx`](file:///g:/%EB%82%B4%20%EB%93%9C%EB%9D%BC%EC%9D%B4%EB%B8%8C/Development/duelnight/src/routes/__root.tsx)
  - `viewport-fit=cover`, `apple-mobile-web-app-capable="yes"` 등 모바일 브라우저 주소창 제거 및 가득 찬 화면 렌더링 옵션 적용 완료.

### 2.2. 설치 방법

- **iOS (Safari)**:
  1. Safari 브라우저에서 서비스 주소(예: `https://duelnight.app`)에 접속합니다.
  2. 하단 툴바의 **공유 버튼** (네모에 위쪽 화살표)을 누릅니다.
  3. 메뉴를 아래로 스크롤하여 **"홈 화면에 추가"**를 선택합니다.
- **Android (Chrome)**:
  1. Chrome 브라우저에서 서비스 주소에 접속합니다.
  2. 우측 상단의 **점 3개 메뉴**를 누릅니다.
  3. **"앱 설치"** 또는 **"홈 화면에 추가"**를 선택합니다.

바탕화면에 생성된 **DuelNight 아이콘**을 클릭하면 주소창이 없는 네이티브 앱 모드로 기기 환경(가로/세로 회전)에 맞춰 실행됩니다.

---

## 3. Capacitor를 활용한 네이티브 앱 구축 (App Store / Play Store 출시)

기존 React + Vite 웹 코드를 한 줄도 고치지 않고 그대로 사용하여 iOS Xcode 및 Android Studio 네이티브 프로젝트로 빌드하는 방법입니다.

```
[React + Vite 소스 코드]
        ↓  (Vite 빌드)
  [dist/ 정적 빌드 파일]
        ↓  (Capacitor 동기화)
  [Xcode / Android Studio 프로젝트]
        ↓  (네이티브 컴파일)
[App Store / Play Store 설치 앱]
```

### 3.1. Capacitor 초기 설정 (최초 1회)

1. **필수 패키지 설치**:
   ```bash
   npm install @capacitor/core @capacitor/cli
   ```
2. **Capacitor 초기화**:
   - 앱 이름, 패키지 식별자(도메인 역순), 그리고 웹 빌드 출력 폴더(`dist`)를 지정합니다.
   ```bash
   npx cap init DuelNight com.rogbook.duelnight --web-dir=dist
   ```
3. **플랫폼 패키지 설치**:
   ```bash
   npm install @capacitor/ios @capacitor/android
   ```
4. **네이티브 플랫폼 프로젝트 추가**:
   ```bash
   npx cap add ios
   npx cap add android
   ```

   - 실행 후 루트 디렉토리에 `ios/` 및 `android/` 네이티브 프로젝트 폴더가 생성됩니다. (이 폴더들은 git에 커밋하여 함께 관리합니다.)

### 3.2. 일상 개발 및 빌드 파이프라인

코드를 수정한 뒤 네이티브 앱에 반영하여 테스트하는 표준 파이프라인입니다.

1. **웹 애플리케이션 빌드**:
   ```bash
   # 정적 리소스(HTML/JS/CSS)를 dist 디렉토리에 빌드
   bun run build
   # 또는
   npm run build
   ```
2. **빌드된 리소스를 네이티브 플랫폼에 동기화**:
   ```bash
   npx cap sync
   ```
3. **네이티브 개발 도구 실행**:
   - **iOS (Xcode 실행)**: (macOS 환경 필요)
     ```bash
     npx cap open ios
     ```

     - Xcode가 실행되면 기기/시뮬레이터를 선택하고 빌드 및 실행을 누릅니다.
   - **Android (Android Studio 실행)**:
     ```bash
     npx cap open android
     ```

     - Android Studio에서 Gradle 동기화 완료 후 실행 버튼을 눌러 에뮬레이터나 실기기에서 테스트합니다.
