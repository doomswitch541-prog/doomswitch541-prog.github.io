# Three.js for RG Broadcast

Version: 0.185.1 (r185), MIT license in LICENSE.

Source: https://registry.npmjs.org/three/-/three-0.185.1.tgz

Package integrity verified before extracting the two unchanged minified ES modules:
`sha512-5aojFCXKwnjBRZvUnt3WFfEcvUJgkN5LlijRFN95hMy8WVkG4I0QNcJE+OuWvuJ0bOdStrbfXn0pkd6/QyiAlg==`

Only Broadcast imports this directory. The shared `/assets/vendor/three/` library
is independent. Files are served locally with no runtime CDN or build step.
The WebGLRenderer requires WebGL2; Broadcast retains its SVG fallback.
