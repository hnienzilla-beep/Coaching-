// Einblenden beim Scrollen: Elemente mit der Klasse `reveal` gleiten herein, sobald sie in den
// sichtbaren Bereich kommen. Einmal zentral statt je Seite - neue Karten und Listenzeilen
// werden über einen MutationObserver automatisch mit erfasst.
//
// Ausgeblendet wird erst, wenn dieses Skript läuft (Klasse `reveal-ready` am <html>). Fällt es
// aus, bleibt alles einfach sichtbar statt unsichtbar.

export function initScrollReveal(): void {
  if (typeof IntersectionObserver === 'undefined' || typeof MutationObserver === 'undefined') return

  const intersection = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue
        entry.target.classList.add('revealed')
        intersection.unobserve(entry.target)
      }
    },
    // Etwas vor dem unteren Rand auslösen, damit man das Hereingleiten auch sieht.
    { rootMargin: '0px 0px -8% 0px', threshold: 0.01 },
  )

  function observe(root: ParentNode) {
    root.querySelectorAll('.reveal:not(.revealed)').forEach((el) => intersection.observe(el))
  }

  new MutationObserver((mutations) => {
    for (const m of mutations) {
      m.addedNodes.forEach((node) => {
        if (!(node instanceof Element)) return
        if (node.classList.contains('reveal') && !node.classList.contains('revealed')) intersection.observe(node)
        observe(node)
      })
    }
  }).observe(document.body, { childList: true, subtree: true })

  observe(document)
  document.documentElement.classList.add('reveal-ready')
}
