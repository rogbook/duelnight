-- 오타마(OP01-006) cost 입력 오류 정정: 111 → 1 (실제 카드 코스트)
-- 시뮬레이터에서 손패 소환이 불가하던 문제 + 카드DB/덱빌더 표시 오류 해소
UPDATE cards SET cost = 1 WHERE game = 'optcg' AND code = 'OP01-006' AND cost = 111;
