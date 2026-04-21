/* ===================================
   LE BUS INSOLITE — script.js
   =================================== */

document.addEventListener('DOMContentLoaded', function () {

  /* ============================================
     HAMBURGER MENU
  ============================================ */
  const hamburger = document.querySelector('.hamburger');
  const mobileNav = document.querySelector('.mobile-nav');

  if (hamburger && mobileNav) {
    hamburger.addEventListener('click', function () {
      const isOpen = mobileNav.classList.contains('open');
      hamburger.classList.toggle('active');
      mobileNav.classList.toggle('open');
      hamburger.setAttribute('aria-expanded', !isOpen);
    });

    // Fermer le menu au clic sur un lien
    mobileNav.querySelectorAll('a').forEach(function (link) {
      link.addEventListener('click', function () {
        hamburger.classList.remove('active');
        mobileNav.classList.remove('open');
        hamburger.setAttribute('aria-expanded', 'false');
      });
    });

    // Fermer avec Escape
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && mobileNav.classList.contains('open')) {
        hamburger.classList.remove('active');
        mobileNav.classList.remove('open');
        hamburger.setAttribute('aria-expanded', 'false');
      }
    });
  }

  /* ============================================
     ACTIVE NAV LINK
  ============================================ */
  const currentPage = window.location.pathname.split('/').pop() || 'index.html';
  document.querySelectorAll('.header-nav a, .mobile-nav a').forEach(function (link) {
    const href = link.getAttribute('href');
    if (href === currentPage || (currentPage === '' && href === 'index.html')) {
      link.classList.add('active');
    }
  });

  /* ============================================
     SCROLL ANIMATIONS (Intersection Observer)
  ============================================ */
  const fadeEls = document.querySelectorAll('.fade-in');

  if (fadeEls.length > 0 && 'IntersectionObserver' in window) {
    const observer = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            entry.target.classList.add('visible');
            observer.unobserve(entry.target);
          }
        });
      },
      {
        threshold: 0.1,
        rootMargin: '0px 0px -40px 0px',
      }
    );

    fadeEls.forEach(function (el) {
      observer.observe(el);
    });
  } else {
    // Fallback sans IntersectionObserver
    fadeEls.forEach(function (el) {
      el.classList.add('visible');
    });
  }

  /* ============================================
     HEADER SHADOW AU SCROLL
  ============================================ */
  const header = document.querySelector('.site-header');
  if (header) {
    const handleScroll = function () {
      if (window.scrollY > 20) {
        header.style.boxShadow = '0 2px 20px rgba(0,0,0,0.12)';
      } else {
        header.style.boxShadow = 'none';
      }
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
  }

  /* ============================================
     FAQ ACCORDION
  ============================================ */
  const faqItems = document.querySelectorAll('.faq-item');

  faqItems.forEach(function (item) {
    const question = item.querySelector('.faq-question');
    const answer = item.querySelector('.faq-answer');

    if (!question || !answer) return;

    question.addEventListener('click', function () {
      const isOpen = answer.classList.contains('open');

      // Fermer tous les autres
      faqItems.forEach(function (other) {
        if (other !== item) {
          other.querySelector('.faq-question').classList.remove('active');
          other.querySelector('.faq-answer').classList.remove('open');
        }
      });

      // Basculer l'élément courant
      question.classList.toggle('active', !isOpen);
      answer.classList.toggle('open', !isOpen);
    });
  });

  /* ============================================
     FORMULAIRE CONTACT
  ============================================ */
  const contactForm = document.getElementById('contact-form');
  if (contactForm) {
    contactForm.addEventListener('submit', function (e) {
      const btn = contactForm.querySelector('button[type="submit"]');
      if (btn) {
        const original = btn.textContent;
        btn.textContent = 'Envoi en cours…';
        btn.disabled = true;
        // Réactiver après 4s (le mailto ouvre le client email)
        setTimeout(function () {
          btn.textContent = original;
          btn.disabled = false;
        }, 4000);
      }
    });
  }

  /* ============================================
     SMOOTH SCROLL pour les ancres internes
  ============================================ */
  document.querySelectorAll('a[href^="#"]').forEach(function (anchor) {
    anchor.addEventListener('click', function (e) {
      const target = document.querySelector(this.getAttribute('href'));
      if (target) {
        e.preventDefault();
        const offset = 80; // hauteur du header fixe
        const top = target.getBoundingClientRect().top + window.pageYOffset - offset;
        window.scrollTo({ top: top, behavior: 'smooth' });
      }
    });
  });

});
