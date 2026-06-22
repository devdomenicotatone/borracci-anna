import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

// Proxy di Next 16 (ex `middleware.ts`, deprecato e rinominato in v16).
// Responsabilita:
//   1) rinfrescare la sessione Supabase salvata nei cookie;
//   2) redirect "ottimistico" alla login per l'area /gestore;
//   3) header `X-Robots-Tag: noindex` su tutte le risposte /gestore.
// NON e la barriera di autorizzazione: quella e la RLS (is_gestore) piu
// verifySession() dentro ogni Server Action. Runtime Node.js di default:
// NON impostare `export const runtime` (vietato nel proxy).
export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });

  const path = request.nextUrl.pathname;
  const isArea = path.startsWith("/gestore");
  if (isArea) response.headers.set("X-Robots-Tag", "noindex, nofollow");

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  // Senza env si degrada con grazia, coerente con createServerSupabase.
  if (!url || !anonKey) return response;

  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) =>
          request.cookies.set(name, value),
        );
        response = NextResponse.next({ request });
        if (isArea) response.headers.set("X-Robots-Tag", "noindex, nofollow");
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options),
        );
      },
    },
  });

  // IMPORTANTE: nessun codice tra createServerClient e getUser() (refresh token).
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const isLogin = path === "/gestore/login";
  if (isArea && !isLogin && !user) {
    // Riporta sul redirect i cookie eventualmente rinfrescati da getUser().
    const redirect = NextResponse.redirect(
      new URL("/gestore/login", request.nextUrl),
    );
    response.cookies.getAll().forEach((c) => redirect.cookies.set(c));
    return redirect;
  }
  // NB: NON si redirige /gestore/login -> /gestore/prodotti per l'utente loggato:
  // un authenticated NON-gestore creerebbe un loop con requireGestore().
  return response;
}

export const config = {
  // Tutte le route tranne static/asset (i doc auth raccomandano "tutte").
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
