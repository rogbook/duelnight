import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";
import { installServerFnAuthFetch } from "./lib/server-fn-fetch";

export const getRouter = () => {
  // Attach Supabase bearer token to server function fetches (browser only).
  installServerFnAuthFetch();
  const queryClient = new QueryClient();

  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    defaultPreloadStaleTime: 0,
  });

  return router;
};
