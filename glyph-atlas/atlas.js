import { animate, stagger } from '/echofield/vendor/animejs/anime.esm.min.js';

const field = document.querySelector('#glyph-field');
const svg = document.querySelector('#connections');
const glyphs = Array.from(document.querySelectorAll('.glyph'));
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const maps = [
    [[0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [5, 0], [0, 3]],
    [[0, 2], [2, 4], [4, 0], [1, 3], [3, 5], [5, 1]],
    [[0, 3], [0, 2], [0, 4], [1, 3], [2, 5], [3, 4], [1, 5]],
];

let activeIndex = 0;
let activeMap = 0;
let lines = [];

function centerFor(glyph) {
    const fieldRect = field.getBoundingClientRect();
    const glyphRect = glyph.getBoundingClientRect();
    return {
        x: glyphRect.left - fieldRect.left + glyphRect.width / 2,
        y: glyphRect.top - fieldRect.top + glyphRect.height / 2,
    };
}

function setLinePosition(line, edge) {
    const start = centerFor(glyphs[edge[0]]);
    const end = centerFor(glyphs[edge[1]]);
    line.setAttribute('x1', start.x);
    line.setAttribute('y1', start.y);
    line.setAttribute('x2', end.x);
    line.setAttribute('y2', end.y);
}

function refreshLinePositions() {
    lines.forEach(({ element, edge }) => setLinePosition(element, edge));
}

function drawMap(mapIndex, focusIndex, animateDraw = true) {
    svg.replaceChildren();
    lines = maps[mapIndex].map((edge) => {
        const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        line.classList.add('connection');
        if (edge.includes(focusIndex)) line.classList.add('is-active');
        setLinePosition(line, edge);
        svg.append(line);

        if (animateDraw && !reducedMotion) {
            const length = line.getTotalLength();
            line.style.strokeDasharray = length;
            line.style.strokeDashoffset = length;
            animate(line, {
                strokeDashoffset: [length, 0],
                opacity: [0, 1],
                duration: edge.includes(focusIndex) ? 760 : 1100,
                ease: 'inOut(3)',
            });
        }

        return { element: line, edge };
    });
}

function selectGlyph(index, shouldFocus = false) {
    activeIndex = index;
    activeMap = (activeMap + 1 + index) % maps.length;

    glyphs.forEach((glyph, glyphIndex) => {
        glyph.setAttribute('aria-pressed', String(glyphIndex === index));
    });

    drawMap(activeMap, activeIndex);

    if (!reducedMotion) {
        animate(glyphs[index].querySelector('span'), {
            scale: [1, 1.16, 1],
            duration: 720,
            ease: 'inOut(3)',
        });
        animate(glyphs, {
            opacity: [0.56, 1],
            duration: 820,
            delay: stagger(46, { from: index }),
            ease: 'out(3)',
        });
    }

    if (shouldFocus) glyphs[index].focus({ preventScroll: true });
}

glyphs.forEach((glyph, index) => {
    glyph.addEventListener('click', () => selectGlyph(index));
});

field.addEventListener('pointerdown', (event) => {
    if (event.target.closest('.glyph')) return;

    let nearestIndex = 0;
    let nearestDistance = Number.POSITIVE_INFINITY;
    const fieldRect = field.getBoundingClientRect();

    glyphs.forEach((glyph, index) => {
        const center = centerFor(glyph);
        const distance = Math.hypot(
            event.clientX - fieldRect.left - center.x,
            event.clientY - fieldRect.top - center.y,
        );
        if (distance < nearestDistance) {
            nearestDistance = distance;
            nearestIndex = index;
        }
    });

    selectGlyph(nearestIndex, true);
});

if ('ResizeObserver' in window) {
    new ResizeObserver(refreshLinePositions).observe(field);
} else {
    window.addEventListener('resize', refreshLinePositions, { passive: true });
}

requestAnimationFrame(() => {
    drawMap(activeMap, activeIndex, false);

    if (!reducedMotion) {
        animate('.title-block > *', {
            opacity: [0, 1],
            translateY: ['12px', '0px'],
            duration: 900,
            delay: stagger(100),
            ease: 'out(3)',
        });
        animate(glyphs, {
            opacity: [0, 1],
            duration: 1050,
            delay: stagger(90, { start: 180, from: 'center' }),
            ease: 'out(4)',
        });
        animate('.glyph span', {
            scale: [0.78, 1],
            duration: 1050,
            delay: stagger(90, { start: 180, from: 'center' }),
            ease: 'out(4)',
        });
        animate('.orbit-a', {
            scale: [0.94, 1.05],
            rotate: ['-7deg', '5deg'],
            duration: 14000,
            alternate: true,
            loop: true,
            ease: 'inOut(2)',
        });
        animate('.orbit-b', {
            scale: [1.06, 0.92],
            rotate: ['8deg', '-4deg'],
            duration: 18000,
            alternate: true,
            loop: true,
            ease: 'inOut(2)',
        });
    }
});
