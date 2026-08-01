import { animate, stagger } from '/echofield/vendor/animejs/anime.esm.min.js';

const page = document.querySelector('.directory-page');
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

if (page && !reducedMotion) {
    const headerItems = page.querySelectorAll('.page-header > *');
    const sections = page.querySelectorAll('.directory-section');

    animate(headerItems, {
        opacity: [0, 1],
        translateY: ['14px', '0px'],
        duration: 720,
        delay: stagger(90),
        ease: 'out(3)',
    });

    sections.forEach((section, sectionIndex) => {
        const heading = section.querySelector('h2');
        const grid = section.querySelector('.link-grid');
        const cards = section.querySelectorAll('.link-card');
        const start = 150 + sectionIndex * 100;

        const trace = document.createElement('span');
        trace.className = 'directory-trace';
        trace.setAttribute('aria-hidden', 'true');
        grid.append(trace);

        animate(heading, {
            opacity: [0, 1],
            translateX: ['-8px', '0px'],
            duration: 520,
            delay: start,
            ease: 'out(3)',
        });

        animate(trace, {
            scaleY: [0, 1],
            opacity: [0.9, 0],
            duration: 980,
            delay: start,
            ease: 'inOut(3)',
            onComplete: () => trace.remove(),
        });

        animate(cards, {
            opacity: [0, 1],
            translateY: ['10px', '0px'],
            duration: 620,
            delay: stagger(55, { start: start + 90 }),
            ease: 'out(3)',
        });
    });
}
