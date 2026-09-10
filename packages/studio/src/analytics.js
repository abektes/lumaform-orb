// Analytics, off unless a measurement ID is configured.
//
// The gtag snippet used to be inline in index.html with the ID hardcoded. That
// is fine for one deployment and wrong for a public repo: every fork and every
// self-hosted copy would report into that one property, polluting its data and
// silently tracking visitors who never agreed to it.
//
// Set VITE_GA_ID in the deploy environment to turn it on. Unset — which is the
// case for local dev, CI, forks and anyone who clones this — injects nothing at
// all, so there is no network request to opt out of.

export function initAnalytics(measurementId = import.meta.env.VITE_GA_ID) {
  if (!measurementId) return false;

  const loader = document.createElement('script');
  loader.async = true;
  loader.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(measurementId)}`;
  document.head.appendChild(loader);

  window.dataLayer = window.dataLayer || [];
  // gtag forwards `arguments`, so it cannot be an arrow function.
  function gtag() {
    window.dataLayer.push(arguments);
  }
  window.gtag = gtag;
  gtag('js', new Date());
  gtag('config', measurementId);

  return true;
}
