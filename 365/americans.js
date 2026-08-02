/* === Americans — Scroll Animations === */

(function () {
  const scenes = document.querySelectorAll('.scene-content');
  const barFills = document.querySelectorAll('.bar-fill');
  const statNumbers = document.querySelectorAll('.stat-number[data-count]');

  // Intersection Observer for scene reveals
  const sceneObserver = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add('visible');
      }
    });
  }, {
    threshold: 0.2,
    rootMargin: '0px 0px -50px 0px'
  });

  scenes.forEach((scene) => sceneObserver.observe(scene));

  // Bar chart animation
  const barObserver = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        const fills = entry.target.querySelectorAll('.bar-fill');
        fills.forEach((fill, i) => {
          setTimeout(() => fill.classList.add('animated'), i * 150);
        });
        barObserver.unobserve(entry.target);
      }
    });
  }, { threshold: 0.3 });

  const barChart = document.querySelector('.bar-chart');
  if (barChart) barObserver.observe(barChart);

  // Animated counting for stat numbers
  function animateCount(el) {
    const target = parseInt(el.dataset.count, 10);
    const duration = 1500;
    const start = performance.now();

    function tick(now) {
      const elapsed = now - start;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      el.textContent = Math.floor(eased * target).toLocaleString();
      if (progress < 1) requestAnimationFrame(tick);
    }

    requestAnimationFrame(tick);
  }

  const countObserver = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        animateCount(entry.target);
        countObserver.unobserve(entry.target);
      }
    });
  }, { threshold: 0.5 });

  statNumbers.forEach((el) => countObserver.observe(el));

  // Parallax on scroll (subtle)
  let ticking = false;
  window.addEventListener('scroll', () => {
    if (!ticking) {
      requestAnimationFrame(() => {
        const scrollY = window.scrollY;
        const titleEl = document.querySelector('.mega-title');
        if (titleEl) {
          const offset = scrollY * 0.3;
          titleEl.style.transform = `translateY(${offset}px)`;
          titleEl.style.opacity = Math.max(0, 1 - scrollY / 600);
        }
        ticking = false;
      });
      ticking = true;
    }
  });
})();
