import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "../../app/page";
import "../../app/globals.css";

const RELEASE_ID = "2026-07-13-calibration-signal-v6";
const root = document.getElementById("root");

if (!root) {
  throw new Error("Missing application root");
}

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

if ("serviceWorker" in navigator) {
  let refreshing = false;

  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (refreshing) return;
    refreshing = true;
    window.location.reload();
  });

  window.addEventListener("load", async () => {
    const manifestLink = document.querySelector<HTMLLinkElement>(
      'link[rel="manifest"]',
    );
    const appBaseUrl = new URL("./", manifestLink?.href ?? document.baseURI);
    const serviceWorkerUrl = new URL(`sw.js?release=${RELEASE_ID}`, appBaseUrl);

    try {
      const registration = await navigator.serviceWorker.register(
        serviceWorkerUrl.toString(),
        {
          scope: appBaseUrl.pathname,
          updateViaCache: "none",
        },
      );

      if (registration.waiting) {
        registration.waiting.postMessage({ type: "SKIP_WAITING" });
      }

      registration.addEventListener("updatefound", () => {
        const installingWorker = registration.installing;
        if (!installingWorker) return;

        installingWorker.addEventListener("statechange", () => {
          if (
            installingWorker.state === "installed" &&
            navigator.serviceWorker.controller
          ) {
            installingWorker.postMessage({ type: "SKIP_WAITING" });
          }
        });
      });

      await registration.update();
    } catch (error: unknown) {
      console.warn("PWA service worker registration failed", error);
    }
  });
}
