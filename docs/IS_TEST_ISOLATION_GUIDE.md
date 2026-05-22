# DuelNight 배포 환경별 데이터 격리 가이드 (`is_test`)
   
> **최종 수정**: 2026-05-22  
> **적용 범위**: Lovable (스키마 반영) + Antigravity (쿼리 필터 적용) + Claude (검증)

이 문서는 DuelNight의 **Preview 미리보기(테스트) 환경**과 **Production(실운영) 환경**이 동일한 Supabase 데이터베이스를 공유함에 따라 발생할 수 있는 **데이터 오염 및 노이즈 문제를 해결하기 위한 데이터 격리 설계 스펙**입니다.

주요 테이블에 `is_test` 컬럼을 주입하고, 애플리케이션 접속 호스트명(Domain)에 따라 쿼리 필터를 다르게 적용하여 안전한 QA와 실운영을 보장합니다.

---

## 1. 데이터 격리 아키텍처 개요

```
                        ┌─── [ duelnight.app (운영) ] ───> SELECT * FROM table WHERE is_test = false
                        │
[ Supabase Single DB ] ─┤
                        │
                        └─── [ Lovable Preview (QA) ] ───> SELECT * FROM table WHERE is_test = true
```

* **원칙 1**: 데이터 삽입(INSERT) 시 현재 접속 도메인이 Preview/로컬 환경이면 `is_test = true`, 정식 운영 도메인이면 `is_test = false`를 부여합니다.
* **원칙 2**: 데이터 조회(SELECT) 시 환경에 맞게 `is_test` 필터를 강제 적용하여 상호 환경의 데이터가 섞이지 않도록 차단합니다.

---

## 2. [Lovable 담당] DB 스키마 DDL 마이그레이션 스펙

`COLLABORATION_GUIDE.md` 규칙에 따라, **Supabase 스키마 및 마이그레이션 변경은 Lovable이 수행**해야 합니다. Lovable AI 창에 아래의 SQL 쿼리를 전달하여 마이그레이션을 실행하고 `types.ts`를 갱신하게 하십시오.

> [!IMPORTANT]
> Lovable에 아래 텍스트를 그대로 붙여넣어 실행을 요청해 주세요.

```sql
-- 1. decks 테이블에 is_test 컬럼 추가 및 기본값 설정
ALTER TABLE public.decks 
ADD COLUMN is_test BOOLEAN NOT NULL DEFAULT false;

-- 2. matches 테이블에 is_test 컬럼 추가 및 기본값 설정
ALTER TABLE public.matches 
ADD COLUMN is_test BOOLEAN NOT NULL DEFAULT false;

-- 3. lfg_posts 테이블에 is_test 컬럼 추가 및 기본값 설정
ALTER TABLE public.lfg_posts 
ADD COLUMN is_test BOOLEAN NOT NULL DEFAULT false;

-- 4. announcements 테이블에 is_test 컬럼 추가 및 기본값 설정
-- (Preview 단계에서 기획자가 미리 테스트 공지를 올려볼 수 있도록 격리)
ALTER TABLE public.announcements 
ADD COLUMN is_test BOOLEAN NOT NULL DEFAULT false;

-- 5. RLS 정책 보완 (필요한 경우)
-- 기존 RLS 정책들이 추가된 컬럼에 의해 무력화되지 않도록 스키마 타입 재생성
```

---

## 3. [Antigravity 담당] 프론트엔드 환경 판정 및 필터 연동

Antigravity는 프론트엔드 애플리케이션(`@tanstack/react-start`) 전체의 데이터 입출력 쿼리에 격리 필터를 탑재합니다.

### 3-1. 환경 판정 유틸리티 작성

`src/utils/env.ts` (또는 적절한 공유 유틸 파일)에 배포 환경에 따라 `is_test`의 기본값을 추출해주는 판정 헬퍼를 구성합니다.

```typescript
/**
 * 현재 구동 중인 웹 애플리케이션의 테스트 환경 여부를 반환합니다.
 * - Localhost 포트 및 Lovable Preview 도메인인 경우 true를 반환합니다.
 */
export function isTestEnvironment(): boolean {
  if (typeof window === "undefined") {
    // SSR (Server Side Rendering) 환경 판정
    const env = process.env.NODE_ENV;
    return env !== "production";
  }

  const hostname = window.location.hostname;
  
  // 로컬 개발 환경 및 Lovable Preview 서브도메인 검사
  return (
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname.includes("lovable.app") ||
    hostname.includes("preview")
  );
}
```

### 3-2. 데이터 조회(SELECT) 쿼리 레이어 적용

데이터를 불러올 때, `is_test` 필터를 체이닝하여 주입합니다. (예: `useQuery` 내 Supabase 호출부)

```typescript
import { supabase } from "@/integrations/supabase/client";
import { isTestEnvironment } from "@/utils/env";

// 예: 덱 목록 조회 시 격리 필터 적용
const isTest = isTestEnvironment();

const { data: decks, error } = await supabase
  .from("decks")
  .select("*")
  .eq("is_test", isTest) // 현재 환경(true/false)에 일치하는 데이터만 필터링
  .order("created_at", { ascending: false });
```

### 3-3. 데이터 생성(INSERT) 시 필터 적용

새로운 매치 전적이나 덱을 등록할 때, `is_test` 속성을 함께 실어 보냅니다.

```typescript
import { supabase } from "@/integrations/supabase/client";
import { isTestEnvironment } from "@/utils/env";

const handleCreateDeck = async (deckData: any) => {
  const isTest = isTestEnvironment();
  
  const { data, error } = await supabase
    .from("decks")
    .insert([
      {
        ...deckData,
        is_test: isTest // 호스트 환경에 맞게 자동으로 true/false 분기 삽입
      }
    ]);
};
```

---

## 4. 환경 격리 테스트 & 검증 방법 (QA Checklist)

이 구조가 안전하게 정착되었는지 검증하기 위해 다음 시나리오를 수행합니다:

1. **로컬/Preview 환경에서 덱 생성 테스트**:
   - `localhost` 또는 Lovable Preview URL에서 테스트 덱을 생성합니다.
   - DB 백업 스냅샷을 덤프하여 해당 덱의 `is_test` 컬럼 값이 `true`로 저장되었는지 눈으로 직접 확인합니다.
2. **실운영 환경(Published) 데이터 검수**:
   - `duelnight.app` 실운영 도메인으로 접속하여 데이터를 추가합니다.
   - 해당 데이터의 `is_test`가 `false`인지 체크하고, Preview URL로 접속했을 때 실운영 데이터가 노출되지 않는지 교차 검증합니다.
