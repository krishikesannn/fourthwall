/* === Interactions.js — FAQ Accordion, Team Hover, Mobile Nav, Contact Form === */

document.addEventListener('DOMContentLoaded', () => {

  /* ─────────────────────────────────────────────────────────
     FAQ ACCORDION
  ───────────────────────────────────────────────────────── */
  const faqItems = document.querySelectorAll('.faq-item');

  faqItems.forEach(item => {
    const questionBtn = item.querySelector('.faq-item__question');
    if (!questionBtn) return;

    questionBtn.addEventListener('click', () => {
      const isOpen = item.classList.contains('open');

      faqItems.forEach(other => {
        if (other !== item) {
          other.classList.remove('open');
          const otherBtn = other.querySelector('.faq-item__question');
          if (otherBtn) otherBtn.setAttribute('aria-expanded', 'false');
        }
      });

      item.classList.toggle('open', !isOpen);
      questionBtn.setAttribute('aria-expanded', (!isOpen).toString());
    });
  });

  /* ─────────────────────────────────────────────────────────
     MOBILE NAV TOGGLE
  ───────────────────────────────────────────────────────── */
  const navToggle  = document.getElementById('navToggle');
  const mobileMenu = document.getElementById('mobileMenu');

  if (navToggle && mobileMenu) {
    navToggle.addEventListener('click', () => {
      mobileMenu.classList.toggle('open');
      const isOpen = mobileMenu.classList.contains('open');
      navToggle.setAttribute('aria-expanded', isOpen.toString());
    });

    /* Close on outside click */
    document.addEventListener('click', e => {
      if (!navToggle.contains(e.target) && !mobileMenu.contains(e.target)) {
        mobileMenu.classList.remove('open');
        navToggle.setAttribute('aria-expanded', 'false');
      }
    });
  }

  /* ─────────────────────────────────────────────────────────
     TEAM HOVER — Per-person inline image reveal
     Each .team-typo__item has its own .team-typo__inline-preview
     anchored absolutely to that row. No cursor tracking.
  ───────────────────────────────────────────────────────── */
  const teamItems = document.querySelectorAll('.team-typo__item');

  if (teamItems.length > 0) {
    const activate = (item) => {
      teamItems.forEach(i => i.classList.remove('active'));
      item.classList.add('active');
    };

    const deactivate = (item) => {
      item.classList.remove('active');
    };

    teamItems.forEach(item => {
      item.addEventListener('mouseenter', () => activate(item));
      item.addEventListener('mouseleave', () => deactivate(item));
      item.addEventListener('focus', () => activate(item));
      item.addEventListener('blur', () => deactivate(item));

      /* Mobile tap — toggle; tapping another replaces the active one */
      item.addEventListener('click', () => {
        if (window.innerWidth <= 768) {
          if (item.classList.contains('active')) {
            deactivate(item);
          } else {
            teamItems.forEach(i => i.classList.remove('active'));
            activate(item);
          }
        }
      });
    });
  }

  /* ─────────────────────────────────────────────────────────
     AGENCY CONTACT FORM HANDLER
  ───────────────────────────────────────────────────────── */
  const contactForm = document.getElementById('contactForm');
  if (contactForm) {
    contactForm.addEventListener('submit', async e => {
      e.preventDefault();
      if (!contactForm.checkValidity()) {
        contactForm.reportValidity();
        return;
      }
      const name    = document.getElementById('contactName')?.value.trim();
      const email   = document.getElementById('contactEmail')?.value.trim();
      const details = document.getElementById('contactDetails')?.value.trim();
      const submitButton = contactForm.querySelector('button[type="submit"]');

      if (!name || !email || !details) {
        alert('Please fill out your Name, Email, and Project Details.');
        return;
      }

      if (submitButton) {
        submitButton.disabled = true;
        submitButton.textContent = 'SENDING INQUIRY…';
      }

      try {
        const formData = new FormData(contactForm);
        const response = await fetch('/api/inquiries', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(Object.fromEntries(formData))
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || 'We could not send your inquiry.');

        contactForm.innerHTML = `
        <div style="padding: 2rem 0; color: var(--color-primary);">
          <span style="font-family: var(--font-sans); font-size: 0.72rem; font-weight: 800; letter-spacing: 0.14em; color: var(--color-accent); text-transform: uppercase; display: block; margin-bottom: 0.5rem;">INQUIRY RECEIVED ✦</span>
          <h3 style="font-family: var(--font-serif); font-size: 1.8rem; font-weight: 700; color: var(--color-primary); margin-bottom: 0.8rem;">Thank you, ${name}.</h3>
          <p style="font-family: var(--font-sans); font-size: 1rem; line-height: 1.7; color: var(--color-text-light);">We've received your project details and will respond directly to <strong>${email}</strong> within 24 hours.</p>
        </div>
      `;
      } catch (error) {
        if (submitButton) {
          submitButton.disabled = false;
          submitButton.textContent = 'SUBMIT INQUIRY →';
        }
        alert(error.message || 'We could not send your inquiry. Please try again.');
      }
    });
  }

  /* ─────────────────────────────────────────────────────────
     TESTIMONIAL — Scattered pop-up reviews (no overlap)
     Shows 2 at a time using pre-defined non-overlapping pairs
  ───────────────────────────────────────────────────────── */
  const floatCards = document.querySelectorAll('.testimonial-float');

  if (floatCards.length > 0) {
    // Pre-defined position PAIRS — left-zone + right-zone, guaranteed no overlap
    const positionPairs = [
      { left: { top: '35%', left: '3%'  }, right: { top: '32%', left: '58%' } },
      { left: { top: '50%', left: '5%'  }, right: { top: '28%', left: '55%' } },
      { left: { top: '30%', left: '2%'  }, right: { top: '55%', left: '60%' } },
    ];

    let currentPairIndex = 0;
    let visibleCards = [];      // [cardIndex, cardIndex]
    let cardQueue = [0, 1, 2];  // shuffled order of cards to show
    let queuePos = 0;
    let popTimer = null;
    let started = false;

    function shuffle(arr) {
      const a = [...arr];
      for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
      }
      return a;
    }

    function getNextTwo() {
      // Pick 2 cards from the shuffled queue
      let c1 = cardQueue[queuePos % 3];
      let c2 = cardQueue[(queuePos + 1) % 3];
      queuePos += 1;
      if (queuePos >= 3) {
        queuePos = 0;
        cardQueue = shuffle([0, 1, 2]);
      }
      return [c1, c2];
    }

    function showPair() {
      const pair = positionPairs[currentPairIndex];
      const [c1, c2] = getNextTwo();

      // Position card 1 on the left zone
      floatCards[c1].style.top = pair.left.top;
      floatCards[c1].style.left = pair.left.left;
      floatCards[c1].style.right = 'auto';
      floatCards[c1].style.bottom = 'auto';

      // Position card 2 on the right zone
      floatCards[c2].style.top = pair.right.top;
      floatCards[c2].style.left = pair.right.left;
      floatCards[c2].style.right = 'auto';
      floatCards[c2].style.bottom = 'auto';

      // Stagger the pop-in: first card immediately, second card after 450ms
      floatCards[c1].classList.add('testimonial-float--visible');
      setTimeout(() => {
        floatCards[c2].classList.add('testimonial-float--visible');
      }, 450);

      visibleCards = [c1, c2];
      currentPairIndex = (currentPairIndex + 1) % positionPairs.length;

      // Stagger the fade-out: card 1 disappears first, card 2 disappears after
      setTimeout(() => {
        // Disappear card 1 first
        floatCards[c1].classList.remove('testimonial-float--visible');

        // Disappear card 2 one-by-one (750ms later)
        setTimeout(() => {
          floatCards[c2].classList.remove('testimonial-float--visible');

          // Wait for fade-out transition (600ms), then load next pair
          setTimeout(showPair, 600);
        }, 750);
      }, 3600);
    }

    function startPops() {
      if (started) return;
      started = true;
      cardQueue = shuffle([0, 1, 2]);
      showPair();
    }

    // Trigger when section scrolls into view
    const testimonialSection = document.getElementById('testimonialBanner');
    if (testimonialSection) {
      const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            startPops();
            observer.unobserve(entry.target);
          }
        });
      }, { threshold: 0.3 });
      observer.observe(testimonialSection);
    }
  }


  /* ─────────────────────────────────────────────────────────
     CLOSER LOOK — Interactive Category Filter & Lightbox Modal
  ───────────────────────────────────────────────────────── */
  const closerLookFilters = document.querySelectorAll('.closer-look-filter');
  const closerLookItems   = document.querySelectorAll('.closer-look-item');
  
  // Lightbox DOM elements
  const lightbox          = document.getElementById('galleryLightbox');
  const lightboxOverlay   = document.getElementById('lightboxOverlay');
  const lightboxClose     = document.getElementById('lightboxClose');
  const lightboxPrev      = document.getElementById('lightboxPrev');
  const lightboxNext      = document.getElementById('lightboxNext');
  const lightboxImage     = document.getElementById('lightboxImage');
  const lightboxTitle     = document.getElementById('lightboxTitle');
  const lightboxCategory  = document.getElementById('lightboxCategory');
  const lightboxCounter   = document.getElementById('lightboxCounter');

  let activeVisibleItems = Array.from(closerLookItems);
  let currentLightboxIndex = 0;

  function getVisibleItems() {
    return Array.from(closerLookItems).filter(item => !item.classList.contains('hidden'));
  }

  // --- Category Filtering ---
  if (closerLookFilters.length > 0 && closerLookItems.length > 0) {
    closerLookFilters.forEach(btn => {
      btn.addEventListener('click', () => {
        const filter = btn.getAttribute('data-filter');

        closerLookFilters.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');

        // Smooth transition
        closerLookItems.forEach(item => {
          const itemCat = item.getAttribute('data-category');
          const isMatch = (filter === 'all' || itemCat === filter);

          if (isMatch) {
            item.classList.remove('hidden');
            setTimeout(() => {
              item.classList.remove('hiding');
            }, 30);
          } else {
            item.classList.add('hiding');
            setTimeout(() => {
              if (item.classList.contains('hiding')) {
                item.classList.add('hidden');
              }
            }, 280);
          }
        });
      });
    });
  }

  // --- Lightbox Modal ---
  function openLightbox(index) {
    activeVisibleItems = getVisibleItems();
    if (activeVisibleItems.length === 0) return;

    currentLightboxIndex = (index + activeVisibleItems.length) % activeVisibleItems.length;
    const targetItem = activeVisibleItems[currentLightboxIndex];
    if (!targetItem) return;

    const imgTrigger = targetItem.querySelector('.closer-look-item__image');
    const src   = imgTrigger.getAttribute('data-lightbox-src') || targetItem.querySelector('img')?.src;
    const title = imgTrigger.getAttribute('data-lightbox-title') || targetItem.querySelector('.closer-look-item__title')?.textContent;
    const cat   = imgTrigger.getAttribute('data-lightbox-cat') || targetItem.querySelector('.closer-look-item__cat')?.textContent;

    if (lightboxImage) lightboxImage.src = src;
    if (lightboxTitle) lightboxTitle.textContent = title || '';
    if (lightboxCategory) lightboxCategory.textContent = cat || '';
    if (lightboxCounter) lightboxCounter.textContent = `${currentLightboxIndex + 1} / ${activeVisibleItems.length}`;

    if (lightbox) {
      lightbox.classList.add('open');
      lightbox.setAttribute('aria-hidden', 'false');
      document.body.style.overflow = 'hidden';
    }
  }

  function closeLightbox() {
    if (lightbox) {
      lightbox.classList.remove('open');
      lightbox.setAttribute('aria-hidden', 'true');
      document.body.style.overflow = '';
    }
  }

  function nextLightbox() {
    openLightbox(currentLightboxIndex + 1);
  }

  function prevLightbox() {
    openLightbox(currentLightboxIndex - 1);
  }

  // Mini Slider for multi-item cards (e.g. Posters & Exhibition Creatives)
  const closerSliderItems = document.querySelectorAll('.closer-look-item--slider');
  closerSliderItems.forEach(item => {
    const slider = item.querySelector('.closer-look-slider');
    const slides = item.querySelectorAll('.closer-look-slide');
    const prevBtn = item.querySelector('.closer-look-slider-nav--prev');
    const nextBtn = item.querySelector('.closer-look-slider-nav--next');
    const dots = item.querySelectorAll('.closer-look-slider-dots .dot');
    const counter = item.querySelector('.closer-look-slider-count');

    if (slides.length <= 1) return;

    let currentIndex = 0;

    function goToSlide(idx) {
      currentIndex = (idx + slides.length) % slides.length;
      slides.forEach((s, i) => {
        s.classList.toggle('active', i === currentIndex);
      });
      dots.forEach((d, i) => {
        d.classList.toggle('active', i === currentIndex);
      });
      if (counter) {
        counter.textContent = `${currentIndex + 1} / ${slides.length}`;
      }
      // Update data attributes for lightbox
      const currentSlide = slides[currentIndex];
      if (currentSlide && slider) {
        slider.setAttribute('data-lightbox-src', currentSlide.getAttribute('data-src'));
        slider.setAttribute('data-lightbox-title', currentSlide.getAttribute('data-title'));
      }
    }

    if (prevBtn) {
      prevBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        goToSlide(currentIndex - 1);
      });
    }

    if (nextBtn) {
      nextBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        goToSlide(currentIndex + 1);
      });
    }

    dots.forEach((dot, idx) => {
      dot.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        goToSlide(idx);
      });
    });

    // Touch swipe support on image
    if (slider) {
      let touchStartX = 0;
      slider.addEventListener('touchstart', (e) => {
        touchStartX = e.changedTouches[0].screenX;
      }, { passive: true });

      slider.addEventListener('touchend', (e) => {
        const touchEndX = e.changedTouches[0].screenX;
        if (touchStartX - touchEndX > 35) {
          goToSlide(currentIndex + 1);
        } else if (touchEndX - touchStartX > 35) {
          goToSlide(currentIndex - 1);
        }
      }, { passive: true });
    }
  });

  // Bind click handlers on gallery image frames
  closerLookItems.forEach(item => {
    const imgWrap = item.querySelector('.closer-look-item__image');
    if (imgWrap) {
      imgWrap.addEventListener('click', (e) => {
        if (e.target.closest('.closer-look-slider-nav')) return;
        const visible = getVisibleItems();
        const idx = visible.indexOf(item);
        openLightbox(idx >= 0 ? idx : 0);
      });
    }
  });

  if (lightboxClose) lightboxClose.addEventListener('click', closeLightbox);
  if (lightboxOverlay) lightboxOverlay.addEventListener('click', closeLightbox);
  if (lightboxNext) lightboxNext.addEventListener('click', nextLightbox);
  if (lightboxPrev) lightboxPrev.addEventListener('click', prevLightbox);

  // Keyboard navigation
  document.addEventListener('keydown', (e) => {
    if (!lightbox || !lightbox.classList.contains('open')) return;

    if (e.key === 'Escape') {
      closeLightbox();
    } else if (e.key === 'ArrowRight') {
      nextLightbox();
    } else if (e.key === 'ArrowLeft') {
      prevLightbox();
    }
  });

});
