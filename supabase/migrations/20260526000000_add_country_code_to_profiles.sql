-- Migration to add country_code to profiles table for global Region/Payment mapping
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS country_code text DEFAULT 'US';

COMMENT ON COLUMN public.profiles.country_code IS '사용자의 글로벌 접속/결제 기준 국가 (KR, US, JP 등)';
