// supabase/functions/verify-payment/index.ts
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const PORTONE_API_SECRET = Deno.env.get('PORTONE_API_SECRET')
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

serve(async (req) => {
  const { imp_uid, merchant_uid, provider } = await req.json()

  try {
    const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!)

    // 1. PortOne 결제 검증
    if (provider === 'portone') {
      // Access Token 발급
      const tokenRes = await fetch('https://api.iamport.kr/users/getToken', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          imp_key: Deno.env.get('PORTONE_API_KEY'),
          imp_secret: PORTONE_API_SECRET
        })
      })
      const { response: { access_token } } = await tokenRes.json()

      // 결제 정보 조회
      const paymentRes = await fetch(`https://api.iamport.kr/payments/${imp_uid}`, {
        headers: { 'Authorization': access_token }
      })
      const { response: paymentData } = await paymentRes.json()

      // 금액 및 상태 검증 (DB에 저장된 주문 정보와 비교 필요)
      // 예시로 단순히 성공 상태만 체크
      if (paymentData.status !== 'paid') {
        throw new Error('Payment not paid')
      }

      // 2. DB 업데이트 (Atomically)
      // - payments 테이블에 기록
      // - user_credits 업데이트
      // (현업에서는 트랜잭션 사용 권장)
      const { error: dbError } = await supabase.rpc('process_successful_payment', {
        p_user_id: paymentData.custom_data ? JSON.parse(paymentData.custom_data).user_id : null,
        p_amount: paymentData.amount,
        p_order_id: merchant_uid,
        p_provider: 'portone'
      })

      if (dbError) throw dbError
    }

    return new Response(JSON.stringify({ success: true }), { headers: { 'Content-Type': 'application/json' } })
  } catch (err) {
    return new Response(JSON.stringify({ success: false, error: err.message }), { status: 400 })
  }
})
