/* === Animations.js — Intersection Observer Scroll Animations === */

document.addEventListener('DOMContentLoaded', () => {

  // --- Scroll Reveal (fade in on scroll) ---
  const revealElements = document.querySelectorAll('.reveal, .stagger, .img-reveal, .line-draw');

  const revealObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('visible');
      }
    });
  }, {
    threshold: 0.01,
    rootMargin: '100px 0px 100px 0px'
  });

  revealElements.forEach(el => revealObserver.observe(el));

  // Trigger initial check for elements already in viewport on page load
  setTimeout(() => {
    revealElements.forEach(el => {
      const rect = el.getBoundingClientRect();
      if (rect.top < window.innerHeight && rect.bottom > 0) {
        el.classList.add('visible');
      }
    });
  }, 100);

  // --- Parallax Effect (subtle) ---
  const parallaxElements = document.querySelectorAll('.parallax');

  if (parallaxElements.length > 0) {
    const handleParallax = () => {
      const scrollY = window.scrollY;

      parallaxElements.forEach(el => {
        const speed = parseFloat(el.dataset.speed) || 0.1;
        const rect = el.getBoundingClientRect();
        const elementCenter = rect.top + rect.height / 2;
        const viewportCenter = window.innerHeight / 2;
        const offset = (elementCenter - viewportCenter) * speed;

        el.style.transform = `translateY(${offset}px)`;
      });
    };

    window.addEventListener('scroll', () => {
      requestAnimationFrame(handleParallax);
    }, { passive: true });
  }

  // --- Text Reveal (word-by-word animation) ---
  const textRevealElements = document.querySelectorAll('.text-reveal');

  textRevealElements.forEach(el => {
    const text = el.textContent;
    const words = text.split(' ');
    el.innerHTML = words.map((word, i) =>
      `<span class="word" style="transition-delay: ${i * 80}ms">${word}</span>`
    ).join(' ');
  });

  const textRevealObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('visible');
      }
    });
  }, {
    threshold: 0.2,
    rootMargin: '0px 0px -40px 0px'
  });

  textRevealElements.forEach(el => textRevealObserver.observe(el));

  // --- Counter Animation (for stats if added) ---
  const animateCounter = (element, target, duration = 1500) => {
    let start = 0;
    const step = (timestamp) => {
      if (!start) start = timestamp;
      const progress = Math.min((timestamp - start) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3); // ease-out cubic
      element.textContent = Math.floor(eased * target);
      if (progress < 1) {
        requestAnimationFrame(step);
      }
    };
    requestAnimationFrame(step);
  };

  // Observe counters
  const counterElements = document.querySelectorAll('[data-count]');
  if (counterElements.length > 0) {
    const counterObserver = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          const target = parseInt(entry.target.dataset.count, 10);
          animateCounter(entry.target, target);
          counterObserver.unobserve(entry.target);
        }
      });
    }, { threshold: 0.5 });

    counterElements.forEach(el => counterObserver.observe(el));
  }

  // --- Section Divider Line Draw ---
  const dividerLines = document.querySelectorAll('.divider');

  const dividerObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.style.animation = 'lineGrow 1s var(--ease-smooth) forwards';
      }
    });
  }, { threshold: 0.5 });

  dividerLines.forEach(el => dividerObserver.observe(el));
});
