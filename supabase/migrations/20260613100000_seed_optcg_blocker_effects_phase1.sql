-- 시뮬레이터 효과 적재 1차(안전분): 블로커 5장
-- 엔진(optcg.ts:217)이 trigger "on_block" 존재만으로 블로커를 인식하므로 현 인터프리터에서 정확히 동작.
-- gain_keyword 액션은 현 단계에서 실행되지 않는 마커(스키마 충족용). 본대 적재는 엔진 보강(Phase 1A) 후.
-- 지시서: docs/SIMULATOR_PHASE1_TASKS.md
UPDATE cards SET effects = '[
  {"id":"kw:blocker","label":"블로커","trigger":"on_block",
   "actions":[{"kind":"gain_keyword","keyword":"blocker","duration":"permanent","target":{"selector":"self_active"}}]}
]'::jsonb
WHERE game = 'optcg'
  AND code IN ('OP04-077','OP01-014','OP05-074','OP03-063','OP05-090');
