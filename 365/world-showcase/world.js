import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';

const WORLD_WIDTH = 26;
const WORLD_DEPTH = 16;
const SEA_LEVEL = 0;
const EXPECTED_REGION_COUNT = 26;
const BASE_LAYER = 0;
const BLOOM_LAYER = 1;
const MOTION_QUERY = window.matchMedia('(prefers-reduced-motion: reduce)');
const MOBILE_QUERY = window.matchMedia('(max-width: 760px)');
const LABEL_IDS = [
    'r_north_cap',
    'r_west_metro',
    'r_high_pass',
    'r_desert',
    'r_karst',
    'r_citadel',
    'r_south_wilds',
    'r_east_shore',
    'r_tropic_isle'
];

const ELEVATION = {
    snow: 1.12,
    ice: 0.54,
    tundra: 0.26,
    wetland: 0.04,
    urban: 0.15,
    'urban-river': 0.08,
    orchard: 0.24,
    mountain: 1.06,
    frontier: 0.22,
    desert: 0.32,
    rock: 0.78,
    oldtown: 0.16,
    village: 0.22,
    farmland: 0.13,
    citadel: 0.2,
    garden: 0.16,
    forest: 0.42,
    coast: 0.04,
    tropical: 0.28
};

const canvas = document.getElementById('worldCanvas');
const atlas = document.getElementById('atlas');
const labelsLayer = document.getElementById('labels');
const statusText = document.getElementById('statusText');
const fallback = document.getElementById('webglFallback');
const opening = document.getElementById('opening');
const toggleLabelsButton = document.getElementById('toggleLabels');
const toggleNotesButton = document.getElementById('toggleNotes');
const notes = document.getElementById('atlasNotes');
const closeNotesButton = document.getElementById('closeNotes');

const world = window.WORLD;
if (!world || !Array.isArray(world.regions) || world.regions.length !== EXPECTED_REGION_COUNT) {
    showFailure('The atlas data did not load correctly.');
    throw new Error(`World data must contain ${EXPECTED_REGION_COUNT} regions.`);
}

const regionById = new Map(world.regions.map(region => [region.id, region]));
const routePairs = world.routes.map(route => ({
    ...route,
    start: regionById.get(route.from),
    end: regionById.get(route.to)
}));

if (routePairs.some(route => !route.start || !route.end)) {
    showFailure('One or more atlas routes point beyond the known world.');
    throw new Error('World route references an unknown region.');
}

let renderer;
let bloomComposer;
let finalComposer;
let scene;
let camera;
let terrain;
let water;
let waterBasePositions;
let citadelCore;
let citadelLight;
let directionalLight;
let labelEntries = [];
let labelsVisible = !MOBILE_QUERY.matches;
let desiredZoom = 1;
let currentZoom = MOTION_QUERY.matches ? 1 : 0.78;
let framingScale = 1;
let pointerX = 0;
let pointerY = 0;
let lastTime = 0;
let elapsed = 0;
let frameCount = 0;
let resizeFrame = 0;
let hasStarted = false;

const baseCameraPosition = new THREE.Vector3(0, 20.4, 17.4);
const cameraTarget = new THREE.Vector3(0, 0.18, -0.4);
const desiredTarget = cameraTarget.clone();
const temporaryVector = new THREE.Vector3();
const shoreColor = new THREE.Color(world.shoreColor).convertSRGBToLinear();
const seaFloorColor = new THREE.Color(0x082d48).convertSRGBToLinear();
const snowColor = new THREE.Color(0xf5f7f3).convertSRGBToLinear();

const regionLooks = world.regions.map(region => ({
    region,
    color: new THREE.Color(region.color).convertSRGBToLinear(),
    elevation: ELEVATION[region.biome] ?? 0.18
}));

try {
    const context = canvas.getContext('webgl2', { alpha: true, antialias: false })
        || canvas.getContext('webgl', { alpha: true, antialias: false });

    if (!context) throw new Error('WebGL is unavailable.');

    renderer = new THREE.WebGLRenderer({
        canvas,
        context,
        alpha: true,
        antialias: false,
        powerPreference: 'high-performance'
    });
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.02;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.setClearColor(0x06131e, 1);
} catch (error) {
    showFailure('This browser could not create the WebGL atlas.');
    throw error;
}

buildWorld();
bindInterface();
resize();
setLabelsVisible(labelsVisible);

window.__WORLD_SHOWCASE_DIAGNOSTICS__ = Object.freeze({
    regionCount: world.regions.length,
    routeCount: world.routes.length,
    northUp: true,
    bloomSourceCount: 1,
    externalAssetCount: 0,
    rendererRevision: THREE.REVISION
});

requestAnimationFrame(() => {
    hasStarted = true;
    if (MOTION_QUERY.matches) {
        renderScene(0);
        markReady();
    } else {
        requestAnimationFrame(animate);
        window.setTimeout(markReady, 520);
    }
});

function buildWorld() {
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x06131e);
    scene.fog = new THREE.FogExp2(0x06131e, 0.016);

    camera = new THREE.PerspectiveCamera(34, 1, 0.1, 90);
    camera.position.copy(baseCameraPosition).multiplyScalar(1 / currentZoom);
    camera.lookAt(cameraTarget);

    const hemisphere = new THREE.HemisphereLight(0xb7d9e8, 0x172116, 1.7);
    scene.add(hemisphere);

    directionalLight = new THREE.DirectionalLight(0xffd5a4, 2.8);
    directionalLight.position.set(-8.5, 15, 10.5);
    directionalLight.castShadow = true;
    directionalLight.shadow.mapSize.set(MOBILE_QUERY.matches ? 1024 : 2048, MOBILE_QUERY.matches ? 1024 : 2048);
    directionalLight.shadow.camera.left = -14;
    directionalLight.shadow.camera.right = 14;
    directionalLight.shadow.camera.top = 10;
    directionalLight.shadow.camera.bottom = -10;
    directionalLight.shadow.camera.near = 1;
    directionalLight.shadow.camera.far = 38;
    directionalLight.shadow.bias = -0.00025;
    scene.add(directionalLight);

    terrain = createTerrain();
    scene.add(terrain);

    water = createWater();
    scene.add(water);

    createRoutes();
    createUrbanMasses();
    createCanopyMasses();
    createLandmarks();
    createCitadel();
    createLabels();

    const bloomRenderPass = new RenderPass(scene, camera);
    const bloomPass = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.82, 0.55, 1.35);
    bloomComposer = new EffectComposer(renderer);
    bloomComposer.renderToScreen = false;
    bloomComposer.addPass(bloomRenderPass);
    bloomComposer.addPass(bloomPass);

    const finalRenderPass = new RenderPass(scene, camera);
    const combinePass = new ShaderPass(new THREE.ShaderMaterial({
        uniforms: {
            baseTexture: { value: null },
            bloomTexture: { value: bloomComposer.renderTarget2.texture }
        },
        vertexShader: `
            varying vec2 vUv;
            void main() {
                vUv = uv;
                gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
            }
        `,
        fragmentShader: `
            uniform sampler2D baseTexture;
            uniform sampler2D bloomTexture;
            varying vec2 vUv;
            void main() {
                gl_FragColor = texture2D(baseTexture, vUv) + texture2D(bloomTexture, vUv);
            }
        `,
        toneMapped: false
    }), 'baseTexture');
    const outputPass = new OutputPass();

    finalComposer = new EffectComposer(renderer);
    finalComposer.addPass(finalRenderPass);
    finalComposer.addPass(combinePass);
    finalComposer.addPass(outputPass);
}

function createTerrain() {
    const segmentX = MOBILE_QUERY.matches ? 144 : 224;
    const segmentZ = MOBILE_QUERY.matches ? 88 : 136;
    const geometry = new THREE.PlaneGeometry(WORLD_WIDTH, WORLD_DEPTH, segmentX, segmentZ);
    geometry.rotateX(-Math.PI / 2);

    const position = geometry.getAttribute('position');
    const colors = new Float32Array(position.count * 3);
    const color = new THREE.Color();

    for (let index = 0; index < position.count; index += 1) {
        const x = position.getX(index);
        const z = position.getZ(index);
        const u = x / WORLD_WIDTH + 0.5;
        const v = z / WORLD_DEPTH + 0.5;
        const field = terrainField(u, v);

        position.setY(index, field.height);

        if (field.land <= 0) {
            color.copy(seaFloorColor).multiplyScalar(0.72 + Math.max(-0.22, field.land) * 0.16);
        } else {
            color.copy(field.biome.color);
            const shoreMix = 1 - smoothstep(0.015, 0.11, field.land);
            color.lerp(shoreColor, shoreMix * 0.88);
            if (field.height > 0.93) {
                color.lerp(snowColor, smoothstep(0.93, 1.42, field.height) * 0.64);
            }
            color.multiplyScalar(0.88 + (noise2(u * 43, v * 43) - 0.5) * 0.08);
        }

        colors[index * 3] = color.r;
        colors[index * 3 + 1] = color.g;
        colors[index * 3 + 2] = color.b;
    }

    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geometry.computeVertexNormals();

    const material = new THREE.MeshStandardMaterial({
        vertexColors: true,
        roughness: 0.84,
        metalness: 0.015,
        side: THREE.FrontSide
    });

    const mesh = new THREE.Mesh(geometry, material);
    mesh.receiveShadow = true;
    mesh.name = 'Sculpted continent';
    return mesh;
}

function createWater() {
    const geometry = new THREE.PlaneGeometry(42, 29, MOBILE_QUERY.matches ? 32 : 54, MOBILE_QUERY.matches ? 22 : 36);
    geometry.rotateX(-Math.PI / 2);
    waterBasePositions = new Float32Array(geometry.getAttribute('position').array);

    const material = new THREE.MeshPhysicalMaterial({
        color: world.seaColor,
        roughness: 0.27,
        metalness: 0.06,
        clearcoat: 0.5,
        clearcoatRoughness: 0.36,
        transparent: true,
        opacity: 0.84,
        depthWrite: false
    });

    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.y = SEA_LEVEL;
    mesh.receiveShadow = true;
    mesh.name = 'Atlas water';
    return mesh;
}

function createRoutes() {
    const earthMaterial = new THREE.MeshStandardMaterial({
        color: 0x9b805e,
        roughness: 1,
        transparent: true,
        opacity: 0.33,
        depthWrite: false
    });
    const waterMaterial = new THREE.MeshStandardMaterial({
        color: 0x8ec9ca,
        roughness: 0.65,
        transparent: true,
        opacity: 0.22,
        depthWrite: false
    });

    routePairs.forEach((route, routeIndex) => {
        const start = mapPoint(route.start.x, route.start.y, route.land === false ? 0.04 : 0.045);
        const end = mapPoint(route.end.x, route.end.y, route.land === false ? 0.04 : 0.045);
        const midpoint = start.clone().lerp(end, 0.5);
        const dx = end.x - start.x;
        const dz = end.z - start.z;
        const routeLength = Math.hypot(dx, dz) || 1;
        const bend = (hash(routeIndex * 7.31) - 0.5) * Math.min(0.36, Math.hypot(dx, dz) * 0.09);
        midpoint.x += (-dz / routeLength) * bend;
        midpoint.z += (dx / routeLength) * bend;
        midpoint.y = route.land === false
            ? 0.055
            : terrainHeightAtWorld(midpoint.x, midpoint.z) + 0.045;

        const curve = new THREE.CatmullRomCurve3([start, midpoint, end]);
        const geometry = new THREE.TubeGeometry(curve, 20, route.land === false ? 0.011 : 0.016, 3, false);
        const mesh = new THREE.Mesh(geometry, route.land === false ? waterMaterial : earthMaterial);
        mesh.name = `Route ${route.from} to ${route.to}`;
        scene.add(mesh);
    });
}

function createUrbanMasses() {
    const urbanRegions = world.regions.filter(region => ['urban', 'urban-river', 'oldtown'].includes(region.biome));
    const instanceCount = urbanRegions.reduce((sum, region) => sum + (region.y > 0.67 ? 10 : 7), 0);
    const geometry = new THREE.BoxGeometry(0.18, 1, 0.18);
    const material = new THREE.MeshStandardMaterial({ color: 0x686a70, roughness: 0.72, metalness: 0.09 });
    const buildings = new THREE.InstancedMesh(geometry, material, instanceCount);
    const matrix = new THREE.Matrix4();
    const quaternion = new THREE.Quaternion();
    const position = new THREE.Vector3();
    const scale = new THREE.Vector3();
    let instance = 0;

    urbanRegions.forEach((region, regionIndex) => {
        const count = region.y > 0.67 ? 10 : 7;
        for (let index = 0; index < count; index += 1) {
            const angle = hash(regionIndex * 41 + index * 5.7) * Math.PI * 2;
            const radius = (0.06 + hash(regionIndex * 19 + index * 11.2) * 0.22) * (region.y > 0.67 ? 0.65 : 1);
            const center = normalizedToWorld(region.x, region.y);
            position.set(center.x + Math.cos(angle) * radius, 0, center.z + Math.sin(angle) * radius);
            const ground = terrainHeightAtWorld(position.x, position.z);
            const height = 0.13 + hash(regionIndex * 83 + index * 2.9) * (region.y > 0.67 ? 0.46 : 0.34);
            position.y = ground + height * 0.5;
            scale.set(0.48 + hash(index * 31.7) * 0.65, height, 0.48 + hash(index * 17.3) * 0.65);
            quaternion.setFromAxisAngle(new THREE.Vector3(0, 1, 0), hash(regionIndex + index * 13) * Math.PI);
            matrix.compose(position, quaternion, scale);
            buildings.setMatrixAt(instance, matrix);
            instance += 1;
        }
    });

    buildings.castShadow = true;
    buildings.receiveShadow = true;
    buildings.instanceMatrix.needsUpdate = true;
    buildings.name = 'Quiet city masses';
    scene.add(buildings);

    const practicalPositions = urbanRegions.map(region => {
        const point = mapPoint(region.x, region.y, 0.22);
        return point;
    });
    const practicalGeometry = new THREE.BufferGeometry().setFromPoints(practicalPositions);
    const practicalMaterial = new THREE.PointsMaterial({
        color: 0xa97745,
        size: 0.055,
        sizeAttenuation: true,
        transparent: true,
        opacity: 0.68,
        depthWrite: false,
        toneMapped: true
    });
    scene.add(new THREE.Points(practicalGeometry, practicalMaterial));
}

function createCanopyMasses() {
    const greenRegions = world.regions.filter(region => ['orchard', 'forest', 'garden', 'tropical'].includes(region.biome));
    const countPerRegion = 14;
    const geometry = new THREE.IcosahedronGeometry(0.16, 1);
    const material = new THREE.MeshStandardMaterial({ color: 0x254f2c, roughness: 0.95 });
    const canopies = new THREE.InstancedMesh(geometry, material, greenRegions.length * countPerRegion);
    const matrix = new THREE.Matrix4();
    const position = new THREE.Vector3();
    const quaternion = new THREE.Quaternion();
    const scale = new THREE.Vector3();
    let instance = 0;

    greenRegions.forEach((region, regionIndex) => {
        const center = normalizedToWorld(region.x, region.y);
        for (let index = 0; index < countPerRegion; index += 1) {
            const angle = hash(regionIndex * 23 + index * 8.1) * Math.PI * 2;
            const radius = 0.07 + hash(regionIndex * 91 + index * 4.3) * (region.biome === 'tropical' ? 0.5 : 0.36);
            position.set(center.x + Math.cos(angle) * radius, 0, center.z + Math.sin(angle) * radius);
            const size = 0.52 + hash(regionIndex * 43 + index * 5.9) * 0.72;
            position.y = terrainHeightAtWorld(position.x, position.z) + 0.08 * size;
            scale.set(size, 0.7 * size, size);
            matrix.compose(position, quaternion, scale);
            canopies.setMatrixAt(instance, matrix);
            instance += 1;
        }
    });

    canopies.castShadow = true;
    canopies.receiveShadow = true;
    canopies.instanceMatrix.needsUpdate = true;
    canopies.name = 'Forest canopy masses';
    scene.add(canopies);
}

function createLandmarks() {
    world.regions.filter(region => region.landmark && region.id !== 'r_citadel').forEach(region => {
        const point = mapPoint(region.x, region.y, 0);
        const group = new THREE.Group();
        group.position.copy(point);
        group.name = region.label;

        const material = new THREE.MeshStandardMaterial({
            color: region.color,
            roughness: region.biome === 'urban' ? 0.58 : 0.88,
            metalness: region.biome === 'urban' ? 0.12 : 0.01
        });

        if (['snow', 'mountain'].includes(region.biome)) {
            addPeak(group, material, 0, 0, 0.34, 0.86);
            addPeak(group, material, -0.22, 0.08, 0.2, 0.52);
            addPeak(group, material, 0.2, 0.12, 0.18, 0.44);
        } else if (['orchard', 'forest', 'tropical'].includes(region.biome)) {
            const trunk = new THREE.Mesh(
                new THREE.CylinderGeometry(0.04, 0.06, 0.34, 6),
                new THREE.MeshStandardMaterial({ color: 0x4c3823, roughness: 1 })
            );
            trunk.position.y = 0.17;
            const crown = new THREE.Mesh(new THREE.IcosahedronGeometry(0.3, 1), material);
            crown.position.y = 0.48;
            group.add(trunk, crown);
        } else if (['urban', 'urban-river'].includes(region.biome)) {
            const tower = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.72, 0.28), material);
            tower.position.y = 0.36;
            const roof = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.24, 4), material);
            roof.position.y = 0.84;
            roof.rotation.y = Math.PI / 4;
            group.add(tower, roof);
        } else if (region.biome === 'coast') {
            const arch = new THREE.Mesh(new THREE.TorusGeometry(0.27, 0.045, 6, 24, Math.PI), material);
            arch.position.y = 0.05;
            arch.rotation.z = Math.PI;
            group.add(arch);
        } else {
            const marker = new THREE.Mesh(new THREE.ConeGeometry(0.15, 0.56, 5), material);
            marker.position.y = 0.28;
            group.add(marker);
        }

        group.traverse(child => {
            if (child.isMesh) {
                child.castShadow = true;
                child.receiveShadow = true;
            }
        });
        scene.add(group);
    });
}

function addPeak(group, material, x, z, radius, height) {
    const peak = new THREE.Mesh(new THREE.ConeGeometry(radius, height, 7), material);
    peak.position.set(x, height * 0.5, z);
    peak.castShadow = true;
    peak.receiveShadow = true;
    group.add(peak);
}

function createCitadel() {
    const region = regionById.get('r_citadel');
    const point = mapPoint(region.x, region.y, 0);
    const group = new THREE.Group();
    group.position.copy(point);
    group.name = region.label;

    const stone = new THREE.MeshStandardMaterial({ color: 0x6f5d3f, roughness: 0.54, metalness: 0.13 });
    const bronze = new THREE.MeshStandardMaterial({ color: 0x9a6833, roughness: 0.4, metalness: 0.34 });
    const ember = new THREE.MeshStandardMaterial({
        color: 0xffb45f,
        emissive: 0xff650d,
        emissiveIntensity: 6.6,
        roughness: 0.24,
        metalness: 0.05,
        toneMapped: true
    });

    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.54, 0.22, 8), stone);
    base.position.y = 0.11;
    const tower = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.25, 1.18, 8), bronze);
    tower.position.y = 0.78;
    const crown = new THREE.Mesh(new THREE.ConeGeometry(0.21, 0.92, 8), bronze);
    crown.position.y = 1.82;
    citadelCore = new THREE.Mesh(new THREE.CylinderGeometry(0.042, 0.065, 1.9, 8), ember);
    citadelCore.position.y = 1.31;
    citadelCore.layers.enable(BLOOM_LAYER);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.24, 0.028, 6, 32), bronze);
    ring.position.y = 1.28;
    ring.rotation.x = Math.PI / 2;

    [base, tower, crown, citadelCore, ring].forEach(mesh => {
        mesh.castShadow = mesh !== citadelCore;
        mesh.receiveShadow = true;
        group.add(mesh);
    });

    citadelLight = new THREE.PointLight(0xff8c1a, 15, 5.2, 2);
    citadelLight.position.set(0, 1.45, 0);
    group.add(citadelLight);
    scene.add(group);
}

function createLabels() {
    labelEntries = LABEL_IDS.map(id => {
        const region = regionById.get(id);
        const element = document.createElement('span');
        element.className = 'place-label';
        element.dataset.id = region.id;
        element.textContent = region.label;
        labelsLayer.appendChild(element);
        const lift = region.id === 'r_citadel' ? 2.65 : (region.biome === 'snow' || region.biome === 'mountain' ? 1.2 : 0.72);
        return { region, element, anchor: mapPoint(region.x, region.y, lift) };
    });
}

function terrainField(u, v) {
    const land = landField(u, v);
    const biome = biomeBlend(u, v);

    if (land <= 0) {
        return {
            land,
            biome,
            height: -0.34 + Math.max(-0.18, land * 0.22)
        };
    }

    const rise = smoothstep(0.004, 0.14, land);
    const broadNoise = fbm(u * 5.2, v * 5.2) - 0.5;
    const detailNoise = fbm(u * 17.3 + 7.1, v * 17.3 + 3.8) - 0.5;
    const relief = broadNoise * 0.2 + detailNoise * 0.09;
    const height = 0.018 + rise * (0.08 + biome.elevation + relief);

    return { land, biome, height: Math.max(0.018, height) };
}

function landField(u, v) {
    let mass = 0;

    world.regions.forEach(region => {
        const denseSouth = region.x > 0.54 && region.y > 0.67;
        const westColumn = region.x < 0.18 && region.y > 0.4;
        const radiusX = region.biome === 'tropical' ? 0.03
            : region.biome === 'coast' ? 0.04
                : denseSouth ? 0.042
                    : westColumn ? 0.048
                        : 0.078;
        const radiusY = region.biome === 'tropical' ? 0.03
            : region.biome === 'coast' ? 0.04
                : denseSouth ? 0.046
                    : westColumn ? 0.052
                        : 0.075;
        const dx = (u - region.x) / radiusX;
        const dy = (v - region.y) / radiusY;
        const influence = Math.exp(-(dx * dx + dy * dy) * 0.5);
        mass = Math.max(mass, influence);
    });

    routePairs.forEach(route => {
        if (route.land === false) return;
        const distance = distanceToSegment(u, v, route.start.x, route.start.y, route.end.x, route.end.y);
        const bridge = Math.exp(-Math.pow(distance / 0.032, 2)) * 0.62;
        mass = Math.max(mass, bridge);
    });

    const edgeNoise = (fbm(u * 8.4 + 11.2, v * 8.4 + 4.9) - 0.5) * 0.14;
    return mass + edgeNoise - 0.37;
}

function biomeBlend(u, v) {
    let total = 0;
    let elevation = 0;
    let red = 0;
    let green = 0;
    let blue = 0;

    regionLooks.forEach(look => {
        const dx = (u - look.region.x) * 1.45;
        const dy = v - look.region.y;
        const weight = Math.exp(-(dx * dx + dy * dy) / 0.018) + 0.00001;
        total += weight;
        elevation += look.elevation * weight;
        red += look.color.r * weight;
        green += look.color.g * weight;
        blue += look.color.b * weight;
    });

    return {
        elevation: elevation / total,
        color: new THREE.Color(red / total, green / total, blue / total)
    };
}

function terrainHeightAtWorld(x, z) {
    const u = x / WORLD_WIDTH + 0.5;
    const v = z / WORLD_DEPTH + 0.5;
    return terrainField(u, v).height;
}

function normalizedToWorld(u, v) {
    return new THREE.Vector3((u - 0.5) * WORLD_WIDTH, 0, (v - 0.5) * WORLD_DEPTH);
}

function mapPoint(u, v, lift = 0) {
    const point = normalizedToWorld(u, v);
    point.y = (lift === 0.04 ? SEA_LEVEL : terrainHeightAtWorld(point.x, point.z)) + lift;
    return point;
}

function distanceToSegment(px, py, ax, ay, bx, by) {
    const aspect = 1.45;
    px *= aspect;
    ax *= aspect;
    bx *= aspect;
    const abx = bx - ax;
    const aby = by - ay;
    const lengthSquared = abx * abx + aby * aby || 1;
    const amount = Math.max(0, Math.min(1, ((px - ax) * abx + (py - ay) * aby) / lengthSquared));
    const dx = px - (ax + abx * amount);
    const dy = py - (ay + aby * amount);
    return Math.hypot(dx, dy);
}

function hash(value) {
    return fract(Math.sin(value * 127.1 + 311.7) * 43758.5453123);
}

function hash2(x, y) {
    return fract(Math.sin(x * 127.1 + y * 311.7) * 43758.5453123);
}

function noise2(x, y) {
    const ix = Math.floor(x);
    const iy = Math.floor(y);
    const fx = smoothCurve(fract(x));
    const fy = smoothCurve(fract(y));
    const a = hash2(ix, iy);
    const b = hash2(ix + 1, iy);
    const c = hash2(ix, iy + 1);
    const d = hash2(ix + 1, iy + 1);
    return mix(mix(a, b, fx), mix(c, d, fx), fy);
}

function fbm(x, y) {
    let value = 0;
    let amplitude = 0.54;
    let frequency = 1;
    let normalizer = 0;
    for (let octave = 0; octave < 4; octave += 1) {
        value += noise2(x * frequency, y * frequency) * amplitude;
        normalizer += amplitude;
        frequency *= 2.03;
        amplitude *= 0.48;
    }
    return value / normalizer;
}

function fract(value) {
    return value - Math.floor(value);
}

function mix(a, b, amount) {
    return a + (b - a) * amount;
}

function smoothCurve(value) {
    return value * value * (3 - 2 * value);
}

function smoothstep(edge0, edge1, value) {
    const amount = Math.max(0, Math.min(1, (value - edge0) / (edge1 - edge0)));
    return amount * amount * (3 - 2 * amount);
}

function bindInterface() {
    document.getElementById('zoomIn').addEventListener('click', () => changeZoom(0.14));
    document.getElementById('zoomOut').addEventListener('click', () => changeZoom(-0.14));
    document.getElementById('resetView').addEventListener('click', resetView);

    toggleLabelsButton.addEventListener('click', () => setLabelsVisible(!labelsVisible));
    toggleNotesButton.addEventListener('click', openNotes);
    closeNotesButton.addEventListener('click', closeNotes);

    canvas.addEventListener('wheel', event => {
        event.preventDefault();
        changeZoom(event.deltaY > 0 ? -0.08 : 0.08);
    }, { passive: false });

    window.addEventListener('pointermove', event => {
        if (MOTION_QUERY.matches) return;
        pointerX = (event.clientX / window.innerWidth - 0.5) * 2;
        pointerY = (event.clientY / window.innerHeight - 0.5) * 2;
    }, { passive: true });

    window.addEventListener('keydown', event => {
        if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey) return;
        if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement || event.target?.isContentEditable) return;

        if (event.key === '+' || event.key === '=') changeZoom(0.14);
        if (event.key === '-' || event.key === '_') changeZoom(-0.14);
        if (event.key === '0') resetView();
        if (event.key.toLowerCase() === 'l') setLabelsVisible(!labelsVisible);
        if (event.key === 'Escape' && !notes.hidden) closeNotes();
    });

    window.addEventListener('resize', () => {
        cancelAnimationFrame(resizeFrame);
        resizeFrame = requestAnimationFrame(resize);
    });

    MOTION_QUERY.addEventListener?.('change', () => window.location.reload());
}

function changeZoom(amount) {
    desiredZoom = THREE.MathUtils.clamp(desiredZoom + amount, 0.78, 1.42);
    if (MOTION_QUERY.matches) {
        currentZoom = desiredZoom;
        renderScene(elapsed);
    }
}

function resetView() {
    desiredZoom = 1;
    pointerX = 0;
    pointerY = 0;
    if (MOTION_QUERY.matches) {
        currentZoom = 1;
        cameraTarget.copy(desiredTarget);
        renderScene(elapsed);
    }
}

function setLabelsVisible(visible) {
    labelsVisible = visible;
    labelsLayer.classList.toggle('is-visible', visible);
    labelsLayer.setAttribute('aria-hidden', String(!visible));
    toggleLabelsButton.setAttribute('aria-pressed', String(visible));
    toggleLabelsButton.textContent = visible ? 'Hide names' : 'Place names';
    if (MOTION_QUERY.matches && hasStarted) renderScene(elapsed);
}

function openNotes() {
    notes.hidden = false;
    toggleNotesButton.setAttribute('aria-expanded', 'true');
    closeNotesButton.focus();
}

function closeNotes() {
    notes.hidden = true;
    toggleNotesButton.setAttribute('aria-expanded', 'false');
    toggleNotesButton.focus();
}

function resize() {
    const width = Math.max(1, atlas.clientWidth);
    const height = Math.max(1, atlas.clientHeight);
    const pixelRatio = Math.min(window.devicePixelRatio || 1, MOBILE_QUERY.matches ? 1.3 : 1.7);

    renderer.setPixelRatio(pixelRatio);
    renderer.setSize(width, height, false);
    bloomComposer.setPixelRatio(pixelRatio);
    bloomComposer.setSize(width, height);
    finalComposer.setPixelRatio(pixelRatio);
    finalComposer.setSize(width, height);
    camera.aspect = width / height;
    camera.fov = width < 620 ? 50 : width / height > 1.7 ? 32 : 35;
    camera.updateProjectionMatrix();
    const baseDistance = baseCameraPosition.distanceTo(cameraTarget);
    const horizontalHalfView = baseDistance
        * Math.tan(THREE.MathUtils.degToRad(camera.fov * 0.5))
        * camera.aspect;
    framingScale = Math.max(1, (WORLD_WIDTH * 0.54) / horizontalHalfView);

    if (MOTION_QUERY.matches && hasStarted) renderScene(elapsed);
}

function animate(time) {
    requestAnimationFrame(animate);
    if (document.hidden) return;

    const delta = Math.min(0.05, lastTime ? (time - lastTime) / 1000 : 0.016);
    lastTime = time;
    elapsed += delta;
    frameCount += 1;

    currentZoom += (desiredZoom - currentZoom) * (1 - Math.pow(0.001, delta));
    desiredTarget.set(pointerX * 0.28, 0.18, -0.4 + pointerY * 0.13);
    cameraTarget.lerp(desiredTarget, 1 - Math.pow(0.002, delta));

    if (frameCount % 2 === 0) updateWater(elapsed);
    citadelCore.material.emissiveIntensity = 6.55 + Math.sin(elapsed * 1.15) * 0.42;
    citadelLight.intensity = 15 + Math.sin(elapsed * 1.15) * 0.8;
    renderScene(elapsed);
}

function updateWater(time) {
    const position = water.geometry.getAttribute('position');
    for (let index = 0; index < position.count; index += 1) {
        const offset = index * 3;
        const x = waterBasePositions[offset];
        const z = waterBasePositions[offset + 2];
        const ripple = Math.sin(x * 0.72 + time * 0.42) * 0.012
            + Math.sin(z * 0.91 - time * 0.31) * 0.008;
        position.setY(index, ripple);
    }
    position.needsUpdate = true;
    if (frameCount % 10 === 0) water.geometry.computeVertexNormals();
}

function renderScene() {
    temporaryVector.copy(baseCameraPosition).multiplyScalar(framingScale / currentZoom);
    camera.position.copy(temporaryVector);
    camera.position.x += cameraTarget.x * 0.35;
    camera.lookAt(cameraTarget);
    camera.layers.set(BLOOM_LAYER);
    bloomComposer.render();
    camera.layers.set(BASE_LAYER);
    finalComposer.render();
    updateLabels();
}

function updateLabels() {
    const width = atlas.clientWidth;
    const height = atlas.clientHeight;

    labelEntries.forEach(entry => {
        temporaryVector.copy(entry.anchor).project(camera);
        const x = (temporaryVector.x * 0.5 + 0.5) * width;
        const y = (-temporaryVector.y * 0.5 + 0.5) * height;
        const onscreen = temporaryVector.z > -1 && temporaryVector.z < 1
            && x > 10 && x < width - 110 && y > 20 && y < height - 20;
        entry.element.classList.toggle('is-onscreen', onscreen);
        entry.element.style.transform = `translate(${Math.round(x + 8)}px, ${Math.round(y)}px) translateY(-50%)`;
    });
}

function markReady() {
    atlas.classList.add('is-ready');
    statusText.textContent = `${world.regions.length} regions · north up · one world`;
}

function showFailure(message) {
    if (fallback) fallback.hidden = false;
    if (opening) opening.hidden = true;
    if (statusText) statusText.textContent = message;
}
