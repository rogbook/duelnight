import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";
import { installServerFnAuthFetch } from "./lib/server-fn-fetch";

export const getRouter = () => {
  // Attach Supabase bearer token to server function fetches (browser only).
  installServerFnAuthFetch();
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 60_000, // 1분 동안은 캐시 재사용 (페이지 이동 시 재요청 방지)
        gcTime: 5 * 60_000, // 5분 후 GC
        refetchOnWindowFocus: false, // 탭 전환마다 재요청 방지
        refetchOnReconnect: false,
        retry: 1,
      },
    },
  });

  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    defaultPreloadStaleTime: 0,
  });

  return router;
};
