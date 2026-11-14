
"use client";

import { useEffect } from "react";

const RETURN_URL_KEY = "pollify-offline-return-url";

export function ServiceWorkerRegister() {
  useEffect(() => {
    function saveDestination(url: string) {
      try {
        const destination = new URL(url, window.location.origin);

        if (
          destination.origin === window.location.origin &&
          destination.pathname !== "/offline.html"
        ) {
          localStorage.setItem(RETURN_URL_KEY, destination.href);
        }
      } catch {
        // Ignore invalid destinations.
      }
    }

    // Remember the current page.
    saveDestination(window.location.href);

    // Remember same-origin links before navigation.
    function handleLinkClick(event: MouseEvent) {
      const target = event.target;

      if (!(target instanceof Element)) return;

      const link = target.closest("a[href]");

      if (!(link instanceof HTMLAnchorElement)) return;

      if (
        link.target === "_blank" ||
        link.hasAttribute("download")
      ) {
        return;
      }

      saveDestination(link.href);
    }

    function handlePageChange() {
      saveDestination(window.location.href);
    }

    document.addEventListener("click", handleLinkClick, true);
    window.addEventListener("popstate", handlePageChange);
    window.addEventListener("pageshow", handlePageChange);

    // Register offline support.
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker
        .register("/sw.js")
        .then((registration) => {
          console.log(
            "Pollify offline support registered:",
            registration.scope
          );
        })
        .catch((error) => {
          console.error(
            "Pollify offline support registration failed:",
            error
          );
        });
    }

    return () => {
      document.removeEventListener("click", handleLinkClick, true);
      window.removeEventListener("popstate", handlePageChange);
      window.removeEventListener("pageshow", handlePageChange);
    };
  }, []);

  return null;
}
