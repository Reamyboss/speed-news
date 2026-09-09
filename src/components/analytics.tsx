import Script from "next/script";
import { ANALYTICS } from "@/lib/env";

/**
 * Analytics-ready, provider-agnostic.
 *
 * No vendor is hard-coded and none loads unless explicitly configured, so the
 * default build ships zero third-party JavaScript and zero cookies. Adding a
 * provider is an environment-variable change.
 */
export function Analytics() {
  const { provider, domain, id, scriptUrl } = ANALYTICS;

  if (provider === "plausible" && domain) {
    return (
      <Script
        defer
        data-domain={domain}
        src={scriptUrl || "https://plausible.io/js/script.js"}
        strategy="afterInteractive"
      />
    );
  }

  if (provider === "umami" && id) {
    return (
      <Script
        defer
        data-website-id={id}
        src={scriptUrl || "https://analytics.umami.is/script.js"}
        strategy="afterInteractive"
      />
    );
  }

  if (provider === "ga4" && id) {
    return (
      <>
        <Script
          src={`https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(id)}`}
          strategy="afterInteractive"
        />
        <Script id="ga4-init" strategy="afterInteractive">
          {`window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config','${id.replace(/'/g, "")}',{anonymize_ip:true});`}
        </Script>
      </>
    );
  }

  return null;
}
