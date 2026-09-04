/**
 * language.js — The Fourth Wall
 * Whole-page translation system powered by Google Translate integration
 * & persistent language state.
 */

(function () {
  'use strict';

  const STORAGE_KEY = 'tfw_lang';
  const DEFAULT_LANG = 'en';

  // Map language codes to Google Translate language codes
  const CODE_MAP = {
    'en': 'en',
    'zh': 'zh-CN',
    'de': 'de',
    'ja': 'ja',
    'hi': 'hi',
    'fr': 'fr',
    'it': 'it',
    'pt': 'pt',
    'ru': 'ru',
    'ko': 'ko'
  };

  /* Helper to set cookie for current path & root domain */
  function setCookie(name, value) {
    const host = window.location.hostname;
    document.cookie = name + "=" + value + "; path=/;";
    if (host && host !== 'localhost' && host !== '127.0.0.1') {
      document.cookie = name + "=" + value + "; path=/; domain=" + host + ";";
    }
  }

  /* Helper to clear cookie */
  function clearCookie(name) {
    const host = window.location.hostname;
    document.cookie = name + "=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;";
    if (host && host !== 'localhost' && host !== '127.0.0.1') {
      document.cookie = name + "=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/; domain=" + host + ";";
    }
  }

  /* Dynamically initialize Google Translate hidden widget */
  function initGoogleTranslate() {
    if (document.getElementById('google_translate_element')) return;

    const div = document.createElement('div');
    div.id = 'google_translate_element';
    div.style.display = 'none';
    document.body.appendChild(div);

    window.googleTranslateElementInit = function () {
      new window.google.translate.TranslateElement({
        pageLanguage: 'en',
        includedLanguages: 'en,zh-CN,de,ja,hi,fr,it,pt,ru,ko',
        autoDisplay: false
      }, 'google_translate_element');
    };

    const script = document.createElement('script');
    script.src = '//translate.google.com/translate_a/element.js?cb=googleTranslateElementInit';
    script.async = true;
    document.head.appendChild(script);
  }

  /* Apply language selection to UI and Google Translate */
  function applyLanguage(lang) {
    const targetCode = CODE_MAP[lang] || lang;

    // Persist choice
    try { localStorage.setItem(STORAGE_KEY, lang); } catch (_) {}

    // Update <html lang="...">
    document.documentElement.lang = lang;

    // Synchronize all language selector components on screen
    document.querySelectorAll('.lang-selector').forEach(selector => {
      const label = selector.querySelector('.lang-selector__current');
      const dropdown = selector.querySelector('.lang-selector__dropdown');
      const selectedOpt = dropdown ? dropdown.querySelector('[data-lang="' + lang + '"]') : null;

      if (label && selectedOpt) {
        label.textContent = selectedOpt.getAttribute('data-label') || lang.toUpperCase();
      }

      if (dropdown) {
        dropdown.querySelectorAll('[role="option"]').forEach(opt => {
          opt.setAttribute('aria-selected', opt.getAttribute('data-lang') === lang ? 'true' : 'false');
        });
      }
    });

    // Handle Google Translate activation
    if (lang === 'en') {
      clearCookie('googtrans');
      const select = document.querySelector('.goog-te-combo');
      if (select && select.value !== 'en') {
        select.value = 'en';
        select.dispatchEvent(new Event('change'));
      } else if (document.cookie.includes('googtrans')) {
        window.location.reload();
      }
    } else {
      setCookie('googtrans', '/en/' + targetCode);
      const select = document.querySelector('.goog-te-combo');
      if (select) {
        select.value = targetCode;
        select.dispatchEvent(new Event('change'));
      } else {
        // Retry after Google Translate script initializes
        setTimeout(() => {
          const s = document.querySelector('.goog-te-combo');
          if (s) {
            s.value = targetCode;
            s.dispatchEvent(new Event('change'));
          } else {
            window.location.reload();
          }
        }, 800);
      }
    }
  }

  /* Bind click and keyboard handlers to all .lang-selector elements */
  function bindSelectors() {
    document.querySelectorAll('.lang-selector').forEach(selector => {
      const btn = selector.querySelector('.lang-selector__btn');
      const dropdown = selector.querySelector('.lang-selector__dropdown');
      if (!btn || !dropdown) return;

      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        // Close other open dropdowns
        document.querySelectorAll('.lang-selector__dropdown').forEach(d => {
          if (d !== dropdown) d.classList.remove('open');
        });
        const isOpen = dropdown.classList.contains('open');
        dropdown.classList.toggle('open', !isOpen);
        btn.setAttribute('aria-expanded', (!isOpen).toString());
      });

      dropdown.querySelectorAll('[role="option"]').forEach(opt => {
        opt.addEventListener('click', () => {
          const lang = opt.getAttribute('data-lang');
          applyLanguage(lang);
          dropdown.classList.remove('open');
          btn.setAttribute('aria-expanded', 'false');
        });
      });
    });

    // Close dropdowns on outside click
    document.addEventListener('click', (e) => {
      if (!e.target.closest('.lang-selector')) {
        document.querySelectorAll('.lang-selector__dropdown').forEach(d => {
          d.classList.remove('open');
        });
        document.querySelectorAll('.lang-selector__btn').forEach(b => {
          b.setAttribute('aria-expanded', 'false');
        });
      }
    });
  }

  function start() {
    initGoogleTranslate();
    bindSelectors();

    let saved = DEFAULT_LANG;
    try { saved = localStorage.getItem(STORAGE_KEY) || DEFAULT_LANG; } catch (_) {}
    if (saved && saved !== DEFAULT_LANG) {
      applyLanguage(saved);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }

})();
