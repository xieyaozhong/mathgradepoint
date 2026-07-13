import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "../../app/page";
import "../../app/globals.css";

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
  window.addEventListener("load", () => {
    const manifestLink = document.querySelector<HTMLLinkElement>(
      'link[rel="manifest"]',
    );
    const appBaseUrl = new URL("./", manifestLink?.href ?? document.baseURI);
    const serviceWorkerUrl = new URL("sw.js", appBaseUrl);

    navigator.serviceWorker
      .register(serviceWorkerUrl.toString(), { scope: appBaseUrl.pathname })
      .then((registration) => registration.update())
      .catch((error: unknown) => {
        console.warn("PWA service worker registration failed", error);
      });
  });
}
