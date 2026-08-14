import { useCallback, useEffect, useRef, useState } from "react";

function getCurrentPathname() {
  return window.location.pathname || "/";
}

export default function useClientRoute() {
  const [pathname, setPathname] = useState(getCurrentPathname);
  const pendingScrollPosition = useRef(null);

  useEffect(() => {
    const previousScrollRestoration = window.history.scrollRestoration;

    window.history.scrollRestoration = "manual";
    window.history.replaceState(
      {
        ...window.history.state,
        fursatiPath: getCurrentPathname(),
        scrollY: window.scrollY,
      },
      "",
    );

    function handlePopState(event) {
      pendingScrollPosition.current = Number.isFinite(event.state?.scrollY)
        ? event.state.scrollY
        : 0;
      setPathname(getCurrentPathname());
    }

    window.addEventListener("popstate", handlePopState);

    return () => {
      window.history.scrollRestoration = previousScrollRestoration;
      window.removeEventListener("popstate", handlePopState);
    };
  }, []);

  useEffect(() => {
    if (pendingScrollPosition.current === null) {
      return undefined;
    }

    const scrollY = pendingScrollPosition.current;
    pendingScrollPosition.current = null;
    let secondFrameId;
    const firstFrameId = window.requestAnimationFrame(() => {
      secondFrameId = window.requestAnimationFrame(() => {
        window.scrollTo({ top: scrollY, behavior: "auto" });
      });
    });

    return () => {
      window.cancelAnimationFrame(firstFrameId);
      window.cancelAnimationFrame(secondFrameId);
    };
  }, [pathname]);

  const navigate = useCallback((to) => {
    const nextUrl = new URL(to, window.location.origin);
    const nextLocation = `${nextUrl.pathname}${nextUrl.search}${nextUrl.hash}`;
    const currentLocation = `${window.location.pathname}${window.location.search}${window.location.hash}`;

    if (nextLocation !== currentLocation) {
      window.history.replaceState(
        {
          ...window.history.state,
          fursatiPath: window.location.pathname,
          scrollY: window.scrollY,
        },
        "",
      );
      window.history.pushState(
        {
          fromPath: window.location.pathname,
          fursatiPath: nextUrl.pathname,
          scrollY: 0,
        },
        "",
        nextLocation,
      );
      pendingScrollPosition.current = 0;
      setPathname(nextUrl.pathname);
      return;
    }

    window.scrollTo({ top: 0, behavior: "auto" });
  }, []);

  const returnTo = useCallback((fallbackPath) => {
    if (window.history.state?.fromPath === fallbackPath) {
      window.history.back();
      return;
    }

    navigate(fallbackPath);
  }, [navigate]);

  return { pathname, navigate, returnTo };
}
