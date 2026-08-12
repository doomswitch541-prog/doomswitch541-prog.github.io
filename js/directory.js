import { animate, stagger } from '/echofield/vendor/animejs/anime.esm.min.js';

const page = document.querySelector('.directory-page');
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const sizeKey = 'rg-directory-text-size';
const sizeLabels = {
    compact: 'Compact',
    default: 'Default',
    large: 'Large',
};
const sizeToggle = document.getElementById('type-size-toggle');
const sizeMenu = document.getElementById('type-size-menu');
const sizeCurrent = document.getElementById('type-size-current');
const sizeOptions = [...document.querySelectorAll('.type-size-option')];

function readSize() {
    try {
        const value = localStorage.getItem(sizeKey);
        return Object.hasOwn(sizeLabels, value) ? value : 'default';
    } catch {
        return 'default';
    }
}

function applySize(size, persist = false) {
    const next = Object.hasOwn(sizeLabels, size) ? size : 'default';
    document.documentElement.dataset.directorySize = next;
    if (sizeCurrent) sizeCurrent.textContent = sizeLabels[next];
    if (sizeToggle) sizeToggle.setAttribute('aria-label', `Text size: ${sizeLabels[next]}`);
    sizeOptions.forEach(option => {
        option.setAttribute('aria-pressed', String(option.dataset.size === next));
    });
    if (persist) {
        try {
            localStorage.setItem(sizeKey, next);
        } catch {
            // The setting is optional; the control still works for this visit.
        }
    }
}

function setSizeMenu(open) {
    if (!sizeToggle || !sizeMenu) return;
    sizeToggle.setAttribute('aria-expanded', String(open));
    sizeMenu.hidden = !open;
}

applySize(readSize());

if (sizeToggle && sizeMenu) {
    sizeToggle.addEventListener('click', () => {
        setSizeMenu(sizeToggle.getAttribute('aria-expanded') !== 'true');
    });

    sizeToggle.addEventListener('keydown', event => {
        if (event.key !== 'ArrowDown') return;
        event.preventDefault();
        setSizeMenu(true);
        const selected = sizeOptions.find(option => option.getAttribute('aria-pressed') === 'true');
        (selected || sizeOptions[0])?.focus();
    });

    sizeOptions.forEach((option, index) => {
        option.addEventListener('click', () => {
            applySize(option.dataset.size, true);
            setSizeMenu(false);
            sizeToggle.focus();
        });
        option.addEventListener('keydown', event => {
            const keys = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'];
            if (!keys.includes(event.key)) return;
            event.preventDefault();
            let nextIndex = index;
            if (event.key === 'Home') nextIndex = 0;
            else if (event.key === 'End') nextIndex = sizeOptions.length - 1;
            else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
                nextIndex = (index - 1 + sizeOptions.length) % sizeOptions.length;
            } else {
                nextIndex = (index + 1) % sizeOptions.length;
            }
            sizeOptions[nextIndex].focus();
        });
    });

    document.addEventListener('keydown', event => {
        if (event.key !== 'Escape' || sizeMenu.hidden) return;
        setSizeMenu(false);
        sizeToggle.focus();
    });

    document.addEventListener('click', event => {
        if (sizeMenu.hidden || sizeToggle.contains(event.target) || sizeMenu.contains(event.target)) return;
        setSizeMenu(false);
    }, true);
}

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
