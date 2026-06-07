-- 게임별 확장 필드(특히 디지몬) 저장용 JSONB 컬럼
-- 디지몬: { category(종류), form(형태), evo_cost_1, evo_cost_2, text_top(상단텍스트), text_bottom(하단텍스트) }
-- 공통 컬럼 재사용: power=DP, cost=등장코스트, attribute=속성, traits=유형, effect=상단+하단 결합
ALTER TABLE public.cards ADD COLUMN IF NOT EXISTS extra jsonb;
