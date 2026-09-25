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
        entry.target.setAttribute('data-revealed', '')
        ;(entry.target as HTMLElement).dataset.revealed = ''
        intersection.unobserve(entry.target)
      }
    },
    // Etwas vor dem unteren Rand auslösen, damit man das Hereingleiten auch sieht.
    { rootMargin: '0px 0px -8% 0px', threshold: 0.01 },
  )

  function observe(root: ParentNode) {
    root.querySelectorAll('.reveal:not([data-revealed])').forEach((el) => intersection.observe(el))
  }

  // Was beim Einfügen schon im Bild ist (neue Seite, neuer Reiter), wird sofort sichtbar - die
  // Seite selbst gleitet ja schon herein. Ein zusätzliches Einblenden jeder Karte ließ den
  // Wechsel dunkel und zäh wirken. Einblenden gibt es nur für das, was erst beim Scrollen kommt.
  //
  // Der Zustand steht in Data-Attributen statt Klassen: React schreibt bei jeder Änderung von
  // `className` das ganze class-Attribut neu - eine Karte, die z. B. beim letzten abgehakten
  // Satz grün umrandet wird, verlöre sonst ihr "revealed" und wäre wieder unsichtbar.
  function handle(el: Element) {
    if (!(el instanceof HTMLElement) || el.hasAttribute('data-revealed')) return
    const rect = el.getBoundingClientRect()
    // `data-reveal-instant` schaltet den Übergang ab: Das Messen hat den versteckten Zustand schon
    // berechnet, ohne diese Klasse würde die Karte trotzdem noch einblenden.
    if (rect.top < window.innerHeight && rect.bottom > 0) {
      el.dataset.revealed = ''
      el.dataset.revealInstant = ''
    } else intersection.observe(el)
  }

  new MutationObserver((mutations) => {
    for (const m of mutations) {
      m.addedNodes.forEach((node) => {
        if (!(node instanceof Element)) return
        if (node.classList.contains('reveal')) handle(node)
        node.querySelectorAll('.reveal').forEach(handle)
      })
    }
  }).observe(document.body, { childList: true, subtree: true })

  observe(document)
  document.documentElement.classList.add('reveal-ready')
}
