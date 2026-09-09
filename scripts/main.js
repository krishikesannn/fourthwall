/* === Main.js — Navigation & Page Behavior === */

document.addEventListener('DOMContentLoaded', () => {
  // Do not expose dead social links while profile URLs are not configured.
  document.querySelectorAll('a[href$="_URL"]').forEach(link => link.remove());

  // Privacy-first consent. Optional analytics never loads before an explicit yes.
  const consent = localStorage.getItem('tfw-cookie-consent');
  const loadAnalytics = () => {
    const token = document.querySelector('meta[name="cf-beacon-token"]')?.content;
    if (!token || token === 'CONFIGURE_IN_CLOUDFLARE') return;
    const script = document.createElement('script');
    script.defer = true;
    script.src = 'https://static.cloudflareinsights.com/beacon.min.js';
    script.dataset.cfBeacon = JSON.stringify({ token });
    document.head.append(script);
  };
  if (consent === 'accepted') loadAnalytics();
  if (!consent) {
    const banner = document.createElement('section');
    banner.className = 'cookie-banner';
    banner.setAttribute('role', 'dialog');
    banner.setAttribute('aria-label', 'Cookie preferences');
    banner.innerHTML = '<div><strong>A quieter kind of cookie notice.</strong><p>We use essential storage for the site and, only with your permission, anonymous performance analytics.</p><a href="privacy.html">Read our privacy policy</a></div><div class="cookie-banner__actions"><button type="button" data-cookie="essential">ESSENTIAL ONLY</button><button type="button" data-cookie="accepted">ALLOW ANALYTICS →</button></div>';
    document.body.append(banner);
    banner.addEventListener('click', event => {
      const choice = event.target.closest('[data-cookie]')?.dataset.cookie;
      if (!choice) return;
      localStorage.setItem('tfw-cookie-consent', choice);
      banner.remove();
      if (choice === 'accepted') loadAnalytics();
    });
  }
  // Page loader removal if present
  const loader = document.getElementById('pageLoader');
  if (loader) {
    setTimeout(() => {
      loader.classList.add('loaded');
      setTimeout(() => loader.remove(), 600);
    }, 400);
  }

  // Subtle floating parallax effect on hero image
  const img = document.querySelector('.hero-split__frame img, .hero-cover__frame img, .hero-premium__image');

  if (img) {
    let ticking = false;
    window.addEventListener('scroll', () => {
      if (!ticking) {
        window.requestAnimationFrame(() => {
          const offset = window.scrollY;
          img.style.transform = `translateY(${offset * 0.1}px)`;
          ticking = false;
        });
        ticking = true;
      }
    }, { passive: true });
  }

  // Scroll Progress Bar Update
  const progressBar = document.getElementById('scrollProgress');
  if (progressBar) {
    window.addEventListener('scroll', () => {
      const winScroll = document.documentElement.scrollTop || document.body.scrollTop;
      const height = document.documentElement.scrollHeight - document.documentElement.clientHeight;
      const scrolled = height > 0 ? (winScroll / height) * 100 : 0;
      progressBar.style.width = `${scrolled}%`;
    }, { passive: true });
  }
});
