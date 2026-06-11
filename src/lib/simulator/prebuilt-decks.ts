import type { DeckRecipe } from "./types";

export interface PrebuiltDeck {
  id: string;
  name: string;
  game: "optcg";
  leaderCode: string;
  description: string;
  recipe: DeckRecipe;
}

export const PREBUILT_DECKS: PrebuiltDeck[] = [
  {
    id: "prebuilt-zoro-red",
    name: "조로의 밀짚모자 일당 덱 (Red)",
    game: "optcg",
    leaderCode: "OP01-001",
    description:
      "공격적인 적색 속공 카드들로 상대의 라이프를 압박하는 빠른 템포의 어그로 덱입니다.",
    recipe: {
      game: "optcg",
      leaderCode: "OP01-001",
      cards: [
        { card_code: "OP01-013", quantity: 4 }, // 상디 (cost 2)
        { card_code: "OP01-011", quantity: 4 }, // 고든 (cost 1)
        { card_code: "OP01-006", quantity: 4 }, // 오타마 (cost 1)
        { card_code: "OP01-014", quantity: 4 }, // 징베 (cost 2, 블로커)
        { card_code: "OP01-004", quantity: 4 }, // 우솝 (cost 3)
        { card_code: "OP02-020", quantity: 4 }, // 리틀 오즈 Jr. (cost 7)
        { card_code: "OP04-077", quantity: 4 }, // 이데오 (cost 3, 블로커)
        { card_code: "OP01-097", quantity: 4 }, // 퀸 (cost 5, 속공)
        { card_code: "OP04-064", quantity: 4 }, // 미스 올 선데이 (cost 3)
        { card_code: "OP04-035", quantity: 4 }, // 거미집 그물 (이벤트)
        { card_code: "OP02-089", quantity: 4 }, // 지옥의 심판 (이벤트)
        { card_code: "OP01-056", quantity: 4 }, // 항마의 상 (이벤트)
        { card_code: "OP06-059", quantity: 2 }, // 화이트 스네이크 (이벤트)
      ],
    },
  },
  {
    id: "prebuilt-oden-green",
    name: "오뎅의 와노쿠니 컨트롤 덱 (Green)",
    game: "optcg",
    leaderCode: "OP01-031",
    description:
      "강력한 블로커와 돈 부스팅 및 메인 기동 효과를 적극적으로 활용하는 중후반 컨트롤 덱입니다.",
    recipe: {
      game: "optcg",
      leaderCode: "OP01-031",
      cards: [
        { card_code: "OP01-033", quantity: 4 }, // 이조 (cost 3)
        { card_code: "OP04-048", quantity: 4 }, // 사사키 (cost 3)
        { card_code: "OP05-074", quantity: 4 }, // 유스타스 키드 (cost 5, 블로커)
        { card_code: "OP03-063", quantity: 4 }, // 잠바이 (cost 3, 블로커)
        { card_code: "OP05-090", quantity: 4 }, // 리쿠 돌드 3세 (cost 3)
        { card_code: "OP03-048", quantity: 4 }, // 노지코 (cost 3)
        { card_code: "OP04-051", quantity: 4 }, // 후즈 후 (cost 3)
        { card_code: "OP02-063", quantity: 4 }, // Mr.1 (cost 1)
        { card_code: "OP02-048", quantity: 4 }, // 와노쿠니 (스테이지)
        { card_code: "OP03-075", quantity: 4 }, // 갈레라 컴퍼니 (스테이지)
        { card_code: "OP06-059", quantity: 4 }, // 화이트 스네이크 (이벤트)
        { card_code: "OP01-013", quantity: 4 }, // 상디 (cost 2)
        { card_code: "OP01-011", quantity: 2 }, // 고든 (cost 1)
      ],
    },
  },
];
