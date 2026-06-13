-- Phase 3 PvP 친선전 매치. 순수함수+결정론 RNG 엔진이라 양측이 같은 seed로 init하고
-- 액션을 주고받아 동기화한다. action_log는 재접속 복구용 누적 기록.
-- 친선전은 클라이언트 신뢰 모델(상대 손패는 화면에서 숨김). 랭크전 도입 시 Edge Function 권위서버로 승격.
-- 지시서: docs/SIMULATOR_PHASE3_TASKS.md
CREATE TABLE public.simulator_matches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  host_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  guest_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  game text NOT NULL DEFAULT 'optcg',
  seed text NOT NULL,
  host_recipe jsonb NOT NULL,
  guest_recipe jsonb,
  host_leader_code text,
  guest_leader_code text,
  status text NOT NULL DEFAULT 'waiting' CHECK (status IN ('waiting','playing','finished','abandoned')),
  action_log jsonb NOT NULL DEFAULT '[]'::jsonb,
  winner text CHECK (winner IN ('host','guest','draw')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_simulator_matches_status ON public.simulator_matches (status, created_at DESC);
CREATE INDEX idx_simulator_matches_host ON public.simulator_matches (host_id);
CREATE INDEX idx_simulator_matches_guest ON public.simulator_matches (guest_id);

ALTER TABLE public.simulator_matches ENABLE ROW LEVEL SECURITY;

-- 조회: 참가자 본인 또는 공개 대기방(로비 목록용)
CREATE POLICY "View own or waiting matches" ON public.simulator_matches
  FOR SELECT TO authenticated
  USING (auth.uid() = host_id OR auth.uid() = guest_id OR status = 'waiting');

-- 생성: 본인이 host인 매치만
CREATE POLICY "Host creates match" ON public.simulator_matches
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = host_id);

-- 수정: 참가자, 또는 대기방에 게스트로 입장(빈 자리)
CREATE POLICY "Participants or joining guest update" ON public.simulator_matches
  FOR UPDATE TO authenticated
  USING (
    auth.uid() = host_id
    OR auth.uid() = guest_id
    OR (status = 'waiting' AND guest_id IS NULL)
  )
  WITH CHECK (auth.uid() = host_id OR auth.uid() = guest_id);

-- 삭제: 호스트만 (대기방 취소 등)
CREATE POLICY "Host deletes match" ON public.simulator_matches
  FOR DELETE TO authenticated
  USING (auth.uid() = host_id);

-- 매치 lifecycle(게스트 입장·상태 변화) 구독용 realtime publication
ALTER PUBLICATION supabase_realtime ADD TABLE public.simulator_matches;
