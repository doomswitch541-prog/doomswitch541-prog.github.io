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
let hemisphereLight;
let cityLights;
let oceanGlints;
let shorelineWash;
let focusMarker;
let traveler;
let travelerFigure;
let travelerJourney = null;
let regionStage = null;
let regionParticles = null;
let journeyPath = null;
let focusedRegion = null;
let cloudBanks = [];
let labelEntries = [];
let labelsVisible = !MOBILE_QUERY.matches;
let desiredZoom = 1;
let currentZoom = MOTION_QUERY.matches ? 1 : 0.88;
let framingScale = 1;
let pointerX = 0;
let pointerY = 0;
let lastTime = 0;
let elapsed = 0;
let frameCount = 0;
let resizeFrame = 0;
let hasStarted = false;
let activePointerId = null;
let dragStartX = 0;
let dragStartY = 0;
let dragStartTarget = null;
let hasDragged = false;
let activePointerType = 'mouse';
let focusBlend = 0;
let desiredFocusBlend = 0;
let keyLightIntensityTarget = 3.05;

const baseCameraPosition = new THREE.Vector3(0, 20.4, 17.4);
const localCameraPosition = new THREE.Vector3(0, 6.6, 7.8);
const homeTarget = new THREE.Vector3(0, 0.18, -0.4);
const cameraTarget = homeTarget.clone();
const desiredTarget = homeTarget.clone();
const parallaxTarget = new THREE.Vector3();
const composedTarget = new THREE.Vector3();
const temporaryVector = new THREE.Vector3();
const cameraOffset = new THREE.Vector3();
const localCameraOffset = new THREE.Vector3();
const travelerFrom = new THREE.Vector3();
const travelerTo = new THREE.Vector3();
const raycaster = new THREE.Raycaster();
const pointerNdc = new THREE.Vector2();
const interactionPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
const interactionPoint = new THREE.Vector3();
const shoreColor = new THREE.Color(world.shoreColor).convertSRGBToLinear();
const seaFloorColor = new THREE.Color(0x082d48).convertSRGBToLinear();
const snowColor = new THREE.Color(0xf5f7f3).convertSRGBToLinear();
const backgroundTarget = new THREE.Color(0x071923);
const fogTarget = new THREE.Color(0x071923);
const hemisphereSkyTarget = new THREE.Color(0xc8e5ec);
const hemisphereGroundTarget = new THREE.Color(0x182313);
const keyLightColorTarget = new THREE.Color(0xffd2a0);

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
    scene.background = new THREE.Color(0x071923);
    scene.fog = new THREE.FogExp2(0x071923, 0.0115);

    camera = new THREE.PerspectiveCamera(35, 1, 0.1, 90);
    camera.position.copy(baseCameraPosition).multiplyScalar(1 / currentZoom);
    camera.lookAt(cameraTarget);

    hemisphereLight = new THREE.HemisphereLight(0xc8e5ec, 0x182313, 1.82);
    scene.add(hemisphereLight);

    directionalLight = new THREE.DirectionalLight(0xffd2a0, 3.05);
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

    createShorelineWash();
    createOceanGlints();
    createRoutes();
    createUrbanMasses();
    createCanopyMasses();
    createTerrainDetails();
    createLandmarks();
    createCitadel();
    createFocusMarker();
    createTraveler();
    createCloudBanks();
    createLabels();

    const bloomRenderPass = new RenderPass(scene, camera);
    const bloomPass = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.9, 0.6, 1.42);
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
    const segmentX = MOBILE_QUERY.matches ? 168 : 256;
    const segmentZ = MOBILE_QUERY.matches ? 104 : 160;
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
            const mineral = noise2(u * 43, v * 43) - 0.5;
            const sunward = smoothstep(0.12, 0.92, 1 - v) * 0.035;
            color.multiplyScalar(0.92 + mineral * 0.11 + sunward);
        }

        colors[index * 3] = color.r;
        colors[index * 3 + 1] = color.g;
        colors[index * 3 + 2] = color.b;
    }

    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geometry.computeVertexNormals();

    const material = new THREE.MeshStandardMaterial({
        vertexColors: true,
        roughness: 0.78,
        metalness: 0.02,
        side: THREE.FrontSide
    });

    const mesh = new THREE.Mesh(geometry, material);
    mesh.receiveShadow = true;
    mesh.name = 'Sculpted continent';
    return mesh;
}

function createWater() {
    const geometry = new THREE.PlaneGeometry(48, 34, MOBILE_QUERY.matches ? 40 : 72, MOBILE_QUERY.matches ? 28 : 48);
    geometry.rotateX(-Math.PI / 2);
    waterBasePositions = new Float32Array(geometry.getAttribute('position').array);

    const material = new THREE.MeshPhysicalMaterial({
        color: world.seaColor,
        roughness: 0.2,
        metalness: 0.08,
        clearcoat: 0.72,
        clearcoatRoughness: 0.27,
        transparent: true,
        opacity: 0.9,
        depthWrite: false
    });

    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.y = SEA_LEVEL;
    mesh.receiveShadow = true;
    mesh.name = 'Atlas water';
    return mesh;
}

function createShorelineWash() {
    const positions = [];
    const samplesX = MOBILE_QUERY.matches ? 96 : 148;
    const samplesY = MOBILE_QUERY.matches ? 62 : 96;

    for (let row = 0; row < samplesY; row += 1) {
        for (let column = 0; column < samplesX; column += 1) {
            const seed = row * samplesX + column;
            const u = (column + 0.18 + hash(seed * 3.17) * 0.64) / samplesX;
            const v = (row + 0.18 + hash(seed * 7.91) * 0.64) / samplesY;
            const land = landField(u, v);
            if (Math.abs(land) > 0.024) continue;

            const point = normalizedToWorld(u, v);
            positions.push(point.x, SEA_LEVEL + 0.035, point.z);
        }
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    const material = new THREE.PointsMaterial({
        color: 0xe9d7a9,
        size: MOBILE_QUERY.matches ? 0.055 : 0.042,
        sizeAttenuation: true,
        transparent: true,
        opacity: 0.34,
        depthWrite: false,
        toneMapped: true
    });

    shorelineWash = new THREE.Points(geometry, material);
    shorelineWash.name = 'Moving shoreline wash';
    scene.add(shorelineWash);
}

function createOceanGlints() {
    const positions = [];
    const count = MOBILE_QUERY.matches ? 150 : 310;

    for (let index = 0; index < count * 3 && positions.length < count * 3; index += 1) {
        const u = 0.02 + hash(index * 8.27) * 0.96;
        const v = 0.03 + hash(index * 14.63 + 2.8) * 0.94;
        if (landField(u, v) > -0.055) continue;
        const point = normalizedToWorld(u, v);
        positions.push(point.x, SEA_LEVEL + 0.06, point.z);
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    const material = new THREE.PointsMaterial({
        color: 0xa8dce2,
        size: MOBILE_QUERY.matches ? 0.035 : 0.026,
        sizeAttenuation: true,
        transparent: true,
        opacity: 0.14,
        depthWrite: false,
        toneMapped: true
    });

    oceanGlints = new THREE.Points(geometry, material);
    oceanGlints.name = 'Ocean glints';
    scene.add(oceanGlints);
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
    const countForRegion = region => MOBILE_QUERY.matches
        ? (region.y > 0.67 ? 12 : 8)
        : (region.y > 0.67 ? 22 : 14);
    const instanceCount = urbanRegions.reduce((sum, region) => sum + countForRegion(region), 0);
    const geometry = new THREE.BoxGeometry(0.18, 1, 0.18);
    const material = new THREE.MeshStandardMaterial({ color: 0x656870, roughness: 0.68, metalness: 0.12 });
    const buildings = new THREE.InstancedMesh(geometry, material, instanceCount);
    const matrix = new THREE.Matrix4();
    const quaternion = new THREE.Quaternion();
    const position = new THREE.Vector3();
    const scale = new THREE.Vector3();
    const practicalPositions = [];
    let instance = 0;

    urbanRegions.forEach((region, regionIndex) => {
        const count = countForRegion(region);
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
            if (index % 2 === 0) practicalPositions.push(position.clone().add(new THREE.Vector3(0, height * 0.34, 0)));
            instance += 1;
        }
    });

    buildings.castShadow = true;
    buildings.receiveShadow = true;
    buildings.instanceMatrix.needsUpdate = true;
    buildings.name = 'Quiet city masses';
    scene.add(buildings);

    const practicalGeometry = new THREE.BufferGeometry().setFromPoints(practicalPositions);
    const practicalMaterial = new THREE.PointsMaterial({
        color: 0xb67b42,
        size: 0.038,
        sizeAttenuation: true,
        transparent: true,
        opacity: 0.64,
        depthWrite: false,
        toneMapped: true
    });
    cityLights = new THREE.Points(practicalGeometry, practicalMaterial);
    cityLights.name = 'Practical city lights';
    scene.add(cityLights);
}

function createCanopyMasses() {
    const greenRegions = world.regions.filter(region => ['orchard', 'forest', 'garden', 'tropical'].includes(region.biome));
    const countPerRegion = MOBILE_QUERY.matches ? 22 : 42;
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

function createTerrainDetails() {
    createRidgeFields();
    createDuneFields();
    createFarmStrips();
}

function createRidgeFields() {
    const regions = world.regions.filter(region => ['snow', 'mountain', 'rock'].includes(region.biome));
    const countPerRegion = MOBILE_QUERY.matches ? 8 : 15;
    const geometry = new THREE.ConeGeometry(0.12, 0.5, 5);
    const material = new THREE.MeshStandardMaterial({ color: 0x74766c, roughness: 0.92, metalness: 0.01 });
    const ridges = new THREE.InstancedMesh(geometry, material, regions.length * countPerRegion);
    const matrix = new THREE.Matrix4();
    const quaternion = new THREE.Quaternion();
    const position = new THREE.Vector3();
    const scale = new THREE.Vector3();
    let instance = 0;

    regions.forEach((region, regionIndex) => {
        const center = normalizedToWorld(region.x, region.y);
        for (let index = 0; index < countPerRegion; index += 1) {
            const angle = hash(regionIndex * 31 + index * 4.7) * Math.PI * 2;
            const radius = 0.12 + hash(regionIndex * 73 + index * 9.2) * 0.72;
            const height = 0.2 + hash(regionIndex * 43 + index * 6.1) * 0.48;
            position.set(center.x + Math.cos(angle) * radius, 0, center.z + Math.sin(angle) * radius * 0.64);
            position.y = terrainHeightAtWorld(position.x, position.z) + height * 0.5 - 0.02;
            quaternion.setFromAxisAngle(new THREE.Vector3(0, 1, 0), angle * 0.5);
            scale.set(0.58 + hash(index * 3.9) * 0.7, height, 0.72 + hash(index * 8.3) * 0.65);
            matrix.compose(position, quaternion, scale);
            ridges.setMatrixAt(instance, matrix);
            instance += 1;
        }
    });

    ridges.castShadow = true;
    ridges.receiveShadow = true;
    ridges.instanceMatrix.needsUpdate = true;
    ridges.name = 'Mountain ridge fields';
    scene.add(ridges);
}

function createDuneFields() {
    const regions = world.regions.filter(region => ['desert', 'frontier'].includes(region.biome));
    const countPerRegion = MOBILE_QUERY.matches ? 10 : 20;
    const geometry = new THREE.IcosahedronGeometry(0.16, 1);
    const material = new THREE.MeshStandardMaterial({ color: 0xb98855, roughness: 0.97, metalness: 0 });
    const dunes = new THREE.InstancedMesh(geometry, material, regions.length * countPerRegion);
    const matrix = new THREE.Matrix4();
    const quaternion = new THREE.Quaternion();
    const position = new THREE.Vector3();
    const scale = new THREE.Vector3();
    let instance = 0;

    regions.forEach((region, regionIndex) => {
        const center = normalizedToWorld(region.x, region.y);
        for (let index = 0; index < countPerRegion; index += 1) {
            const angle = hash(regionIndex * 51 + index * 5.4) * Math.PI * 2;
            const radius = 0.1 + hash(regionIndex * 87 + index * 3.6) * 0.76;
            position.set(center.x + Math.cos(angle) * radius, 0, center.z + Math.sin(angle) * radius * 0.58);
            position.y = terrainHeightAtWorld(position.x, position.z) + 0.035;
            quaternion.setFromAxisAngle(new THREE.Vector3(0, 1, 0), angle);
            const size = 0.55 + hash(index * 6.7) * 0.82;
            scale.set(1.8 * size, 0.28 * size, 0.62 * size);
            matrix.compose(position, quaternion, scale);
            dunes.setMatrixAt(instance, matrix);
            instance += 1;
        }
    });

    dunes.castShadow = true;
    dunes.receiveShadow = true;
    dunes.instanceMatrix.needsUpdate = true;
    dunes.name = 'Wind-shaped dune fields';
    scene.add(dunes);
}

function createFarmStrips() {
    const region = regionById.get('r_lowland_fields');
    const center = normalizedToWorld(region.x, region.y);
    const count = region.biome === 'tropical'
        ? (MOBILE_QUERY.matches ? 10 : 18)
        : (MOBILE_QUERY.matches ? 5 : 8);
    const geometry = new THREE.BoxGeometry(0.52, 0.022, 0.024);
    const material = new THREE.MeshStandardMaterial({ color: 0x9eb864, roughness: 0.94 });
    const strips = new THREE.InstancedMesh(geometry, material, count);
    const matrix = new THREE.Matrix4();
    const quaternion = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), -0.34);
    const position = new THREE.Vector3();
    const scale = new THREE.Vector3();

    for (let index = 0; index < count; index += 1) {
        const lane = index - (count - 1) * 0.5;
        position.set(center.x + lane * 0.035, 0, center.z + lane * 0.018);
        position.y = terrainHeightAtWorld(position.x, position.z) + 0.035;
        scale.set(0.65 + hash(index * 9.1) * 0.65, 1, 1);
        matrix.compose(position, quaternion, scale);
        strips.setMatrixAt(index, matrix);
    }

    strips.receiveShadow = true;
    strips.instanceMatrix.needsUpdate = true;
    strips.name = 'Lowland field rows';
    scene.add(strips);
}

function createCloudBanks() {
    const textureCanvas = document.createElement('canvas');
    textureCanvas.width = 256;
    textureCanvas.height = 128;
    const context = textureCanvas.getContext('2d');

    for (let index = 0; index < 18; index += 1) {
        const x = (0.08 + hash(index * 4.1) * 0.84) * textureCanvas.width;
        const y = (0.15 + hash(index * 9.3) * 0.7) * textureCanvas.height;
        const radius = (0.09 + hash(index * 13.7) * 0.16) * textureCanvas.width;
        const gradient = context.createRadialGradient(x, y, 0, x, y, radius);
        gradient.addColorStop(0, 'rgba(255,255,255,0.72)');
        gradient.addColorStop(0.55, 'rgba(255,255,255,0.28)');
        gradient.addColorStop(1, 'rgba(255,255,255,0)');
        context.fillStyle = gradient;
        context.fillRect(x - radius, y - radius, radius * 2, radius * 2);
    }

    const texture = new THREE.CanvasTexture(textureCanvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    const geometry = new THREE.PlaneGeometry(10.5, 5.2);
    const starts = [
        [-14, 3.1, -4.4, 0.32],
        [-5, 3.6, 4.8, 0.21],
        [8, 3.25, -0.6, 0.27]
    ];

    starts.forEach(([x, y, z, speed], index) => {
        const material = new THREE.MeshBasicMaterial({
            map: texture,
            color: 0x0b1a22,
            transparent: true,
            opacity: index === 1 ? 0.1 : 0.13,
            depthWrite: false,
            side: THREE.DoubleSide,
            toneMapped: false
        });
        const bank = new THREE.Mesh(geometry, material);
        bank.position.set(x, y, z);
        bank.rotation.x = -Math.PI / 2;
        bank.rotation.z = (index - 1) * 0.12;
        bank.renderOrder = 5;
        bank.userData.speed = speed;
        bank.userData.originZ = z;
        bank.userData.phase = index * 2.4;
        bank.name = `Cloud shadow ${index + 1}`;
        cloudBanks.push(bank);
        scene.add(bank);
    });
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

function createFocusMarker() {
    const outerMaterial = new THREE.MeshBasicMaterial({
        color: 0xf1d7a0,
        transparent: true,
        opacity: 0.72,
        depthWrite: false,
        toneMapped: true
    });
    const innerMaterial = new THREE.MeshBasicMaterial({
        color: 0xa9d7d4,
        transparent: true,
        opacity: 0.38,
        depthWrite: false,
        toneMapped: true
    });
    const washMaterial = new THREE.MeshBasicMaterial({
        color: 0xe9d4a4,
        transparent: true,
        opacity: 0.055,
        depthWrite: false,
        side: THREE.DoubleSide,
        toneMapped: true
    });

    const outerRing = new THREE.Mesh(new THREE.TorusGeometry(0.48, 0.018, 6, 48), outerMaterial);
    const innerRing = new THREE.Mesh(new THREE.TorusGeometry(0.29, 0.009, 5, 40), innerMaterial);
    const groundWash = new THREE.Mesh(new THREE.CircleGeometry(0.46, 48), washMaterial);
    [outerRing, innerRing, groundWash].forEach(mesh => {
        mesh.rotation.x = -Math.PI / 2;
        mesh.renderOrder = 7;
    });

    focusMarker = new THREE.Group();
    focusMarker.add(groundWash, outerRing, innerRing);
    focusMarker.userData.outerMaterial = outerMaterial;
    focusMarker.userData.innerMaterial = innerMaterial;
    focusMarker.userData.washMaterial = washMaterial;
    focusMarker.visible = false;
    focusMarker.name = 'Selected region landing ring';
    scene.add(focusMarker);
}

function createTraveler() {
    const cloak = new THREE.MeshStandardMaterial({ color: 0x8d4938, roughness: 0.88, metalness: 0.01 });
    const cloth = new THREE.MeshStandardMaterial({ color: 0xd8c9a8, roughness: 0.92, metalness: 0 });
    const shadow = new THREE.MeshBasicMaterial({ color: 0x071015, transparent: true, opacity: 0.24, depthWrite: false });

    traveler = new THREE.Group();
    travelerFigure = new THREE.Group();

    const groundShadow = new THREE.Mesh(new THREE.CircleGeometry(0.12, 18), shadow);
    groundShadow.rotation.x = -Math.PI / 2;
    groundShadow.position.y = 0.008;

    const body = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.25, 7), cloak);
    body.position.y = 0.145;
    const shoulders = new THREE.Mesh(new THREE.CylinderGeometry(0.065, 0.082, 0.11, 7), cloth);
    shoulders.position.y = 0.27;
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.052, 10, 8), cloth);
    head.position.y = 0.37;

    travelerFigure.add(body, shoulders, head);
    traveler.add(groundShadow, travelerFigure);
    traveler.traverse(child => {
        if (child.isMesh && child !== groundShadow) {
            child.castShadow = true;
            child.receiveShadow = true;
        }
    });

    const startingRegion = regionById.get('r_citadel');
    traveler.position.copy(mapPoint(startingRegion.x, startingRegion.y, 0.09));
    traveler.name = 'World traveler';
    scene.add(traveler);
}

function beginJourney(region) {
    const destination = mapPoint(region.x, region.y, 0.09);
    travelerFrom.copy(traveler.position);
    travelerTo.copy(destination);
    const distance = travelerFrom.distanceTo(travelerTo);
    if (distance < 0.08) {
        traveler.position.copy(destination);
        travelerJourney = null;
        desiredTarget.set(destination.x, destination.y + 0.12, destination.z);
        desiredZoom = 1.54;
        desiredFocusBlend = 1;
        regionStage.scale.setScalar(1);
        statusText.textContent = `${region.label} · drag around or return to the whole world`;
        atlas.classList.add('is-local');
        return;
    }
    const startingRegion = nearestRegionToPoint(travelerFrom);
    const itinerary = findRegionRoute(startingRegion.id, region.id);
    const waypoints = itinerary && itinerary.length > 1
        ? [travelerFrom.clone(), ...itinerary.slice(1).map(stop => mapPoint(stop.x, stop.y, 0.09))]
        : [travelerFrom.clone(), travelerTo.clone()];
    const points = [];

    for (let segment = 0; segment < waypoints.length - 1; segment += 1) {
        const start = waypoints[segment];
        const end = waypoints[segment + 1];
        const dx = end.x - start.x;
        const dz = end.z - start.z;
        const length = Math.hypot(dx, dz) || 1;
        const bend = (hash(segment * 17.2 + world.regions.indexOf(region) * 3.7) - 0.5) * Math.min(0.42, length * 0.055);
        for (let step = segment === 0 ? 0 : 1; step <= 8; step += 1) {
            const amount = step / 8;
            const arc = Math.sin(amount * Math.PI) * bend;
            const x = mix(start.x, end.x, amount) + (-dz / length) * arc;
            const z = mix(start.z, end.z, amount) + (dx / length) * arc;
            const y = Math.max(SEA_LEVEL + 0.09, terrainHeightAtWorld(x, z) + 0.09);
            points.push(new THREE.Vector3(x, y, z));
        }
    }

    const curve = new THREE.CatmullRomCurve3(points);
    travelerJourney = {
        region,
        curve,
        elapsed: 0,
        duration: THREE.MathUtils.clamp(0.72 + curve.getLength() * 0.105, 0.78, 3.4)
    };
    createJourneyPath(curve);
    desiredZoom = Math.max(1.16, Math.min(desiredZoom, 1.28));
    desiredFocusBlend = 0.42;
    statusText.textContent = `${itinerary && itinerary.length > 1 ? 'Following the old routes' : 'Crossing open country'} toward ${region.label}`;
}

function nearestRegionToPoint(point) {
    return world.regions.reduce((best, region) => {
        const dx = point.x - (region.x - 0.5) * WORLD_WIDTH;
        const dz = point.z - (region.y - 0.5) * WORLD_DEPTH;
        const distance = dx * dx + dz * dz;
        return !best || distance < best.distance ? { region, distance } : best;
    }, null).region;
}

function findRegionRoute(startId, endId) {
    if (startId === endId) return [regionById.get(startId)];
    const adjacency = new Map(world.regions.map(region => [region.id, []]));
    routePairs.forEach(route => {
        adjacency.get(route.start.id).push(route.end.id);
        adjacency.get(route.end.id).push(route.start.id);
    });

    const queue = [[startId]];
    const visited = new Set([startId]);
    while (queue.length) {
        const path = queue.shift();
        const current = path[path.length - 1];
        for (const neighbor of adjacency.get(current)) {
            if (visited.has(neighbor)) continue;
            const nextPath = [...path, neighbor];
            if (neighbor === endId) return nextPath.map(id => regionById.get(id));
            visited.add(neighbor);
            queue.push(nextPath);
        }
    }
    return null;
}

function createJourneyPath(curve) {
    disposeObject(journeyPath);
    if (journeyPath) scene.remove(journeyPath);

    const geometry = new THREE.TubeGeometry(curve, 48, 0.012, 4, false);
    const material = new THREE.MeshStandardMaterial({
        color: 0xc4a677,
        roughness: 0.92,
        transparent: true,
        opacity: 0.38,
        depthWrite: false
    });
    journeyPath = new THREE.Mesh(geometry, material);
    journeyPath.name = 'Current journey';
    scene.add(journeyPath);
}

function updateTraveler(delta) {
    if (!travelerJourney) {
        travelerFigure.position.y = MOTION_QUERY.matches ? 0 : Math.sin(elapsed * 2.2) * 0.008;
        return;
    }

    travelerJourney.elapsed += delta;
    const rawAmount = Math.min(1, travelerJourney.elapsed / travelerJourney.duration);
    const amount = rawAmount * rawAmount * (3 - 2 * rawAmount);
    const point = travelerJourney.curve.getPointAt(amount);
    const tangent = travelerJourney.curve.getTangentAt(Math.min(0.999, amount));
    traveler.position.copy(point);
    traveler.rotation.y = Math.atan2(tangent.x, tangent.z);
    travelerFigure.position.y = MOTION_QUERY.matches ? 0 : Math.abs(Math.sin(rawAmount * Math.PI * 12)) * 0.045;
    desiredTarget.set(point.x, point.y + 0.12, point.z);
    if (regionStage) regionStage.scale.setScalar(0.72 + amount * 0.28);

    if (rawAmount < 1) return;

    focusedRegion = travelerJourney.region;
    travelerJourney = null;
    desiredZoom = 1.54;
    desiredFocusBlend = 1;
    focusMarker.visible = true;
    statusText.textContent = `${focusedRegion.label} · tap another region or return to the whole world`;
    atlas.classList.add('is-local');
}

function disposeObject(object) {
    if (!object) return;
    const geometries = new Set();
    const materials = new Set();
    object.traverse(child => {
        if (child.geometry) geometries.add(child.geometry);
        if (Array.isArray(child.material)) child.material.forEach(material => materials.add(material));
        else if (child.material) materials.add(child.material);
    });
    geometries.forEach(geometry => geometry.dispose());
    materials.forEach(material => material.dispose());
}

function regionFamily(region) {
    if (region.biome === 'citadel') return 'citadel';
    if (['snow', 'ice', 'tundra'].includes(region.biome)) return 'cold';
    if (region.biome === 'wetland') return 'wetland';
    if (['urban', 'urban-river', 'oldtown'].includes(region.biome)) return 'urban';
    if (['orchard', 'village', 'farmland', 'garden', 'forest'].includes(region.biome)) return 'green';
    if (['mountain', 'rock'].includes(region.biome)) return 'ridge';
    if (['desert', 'frontier'].includes(region.biome)) return 'dry';
    if (['coast', 'tropical'].includes(region.biome)) return 'coast';
    return 'green';
}

function createRegionStage(region) {
    disposeObject(regionStage);
    if (regionStage) scene.remove(regionStage);

    const family = regionFamily(region);
    const point = mapPoint(region.x, region.y, 0.035);
    regionStage = new THREE.Group();
    regionStage.position.copy(point);
    regionStage.scale.setScalar(MOTION_QUERY.matches ? 1 : 0.72);
    regionStage.name = `${region.label} local landscape`;
    scene.add(regionStage);

    if (family === 'cold') buildColdStage(region);
    else if (family === 'wetland') buildWetlandStage(region);
    else if (family === 'urban') buildUrbanStage(region, false);
    else if (family === 'citadel') buildUrbanStage(region, true);
    else if (family === 'green') buildGreenStage(region);
    else if (family === 'ridge') buildRidgeStage(region);
    else if (family === 'dry') buildDryStage(region);
    else buildCoastStage(region);

    createRegionParticles(region, family);
    applyRegionMood(family);
}

function stagePoint(seed, index, inner = 0.28, outer = 1.35) {
    const angle = hash(seed * 17.3 + index * 5.91) * Math.PI * 2;
    const radius = inner + hash(seed * 31.7 + index * 11.43) * (outer - inner);
    return { angle, radius, x: Math.cos(angle) * radius, z: Math.sin(angle) * radius * 0.72 };
}

function addStageMesh(mesh) {
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    regionStage.add(mesh);
    return mesh;
}

function buildColdStage(region) {
    const seed = world.regions.indexOf(region) + 1;
    const isTundra = region.biome === 'tundra';
    const geometry = isTundra
        ? new THREE.IcosahedronGeometry(0.14, 1)
        : new THREE.ConeGeometry(0.13, 0.72, 5);
    const material = new THREE.MeshPhysicalMaterial({
        color: region.color,
        roughness: region.biome === 'ice' ? 0.34 : 0.66,
        metalness: 0.02,
        clearcoat: region.biome === 'ice' ? 0.42 : 0.12,
        clearcoatRoughness: 0.3
    });

    for (let index = 0; index < (MOBILE_QUERY.matches ? 12 : 20); index += 1) {
        const spot = stagePoint(seed, index, 0.24, 1.5);
        const height = isTundra
            ? 0.32 + hash(seed * 53 + index * 7.1) * 0.34
            : 0.45 + hash(seed * 53 + index * 7.1) * 1.15;
        const shard = new THREE.Mesh(geometry, material);
        shard.position.set(spot.x, isTundra ? height * 0.14 : height * 0.36, spot.z);
        shard.rotation.y = spot.angle;
        shard.rotation.z = (hash(index * 9.7) - 0.5) * 0.16;
        shard.scale.set(
            (isTundra ? 1.35 : 0.62) + hash(index * 3.4) * 0.8,
            isTundra ? height * 0.42 : height,
            (isTundra ? 0.9 : 0.62) + hash(index * 6.8) * 0.7
        );
        addStageMesh(shard);
    }
}

function buildWetlandStage(region) {
    const seed = world.regions.indexOf(region) + 1;
    const waterMaterial = new THREE.MeshPhysicalMaterial({
        color: 0x286775,
        roughness: 0.18,
        clearcoat: 0.64,
        transparent: true,
        opacity: 0.76,
        depthWrite: false
    });
    const reedMaterial = new THREE.MeshStandardMaterial({ color: 0x68805a, roughness: 0.96 });
    const reedGeometry = new THREE.CylinderGeometry(0.012, 0.018, 0.42, 5);

    for (let index = 0; index < 4; index += 1) {
        const pool = new THREE.Mesh(new THREE.CircleGeometry(0.34 + index * 0.045, 28), waterMaterial);
        const spot = stagePoint(seed, index, 0.28, 0.92);
        pool.position.set(spot.x, 0.018, spot.z);
        pool.rotation.x = -Math.PI / 2;
        pool.scale.set(1.45, 0.72, 1);
        regionStage.add(pool);
    }
    for (let index = 0; index < (MOBILE_QUERY.matches ? 18 : 32); index += 1) {
        const spot = stagePoint(seed, index + 8, 0.32, 1.48);
        const reed = new THREE.Mesh(reedGeometry, reedMaterial);
        const height = 0.55 + hash(index * 4.9) * 0.75;
        reed.position.set(spot.x, height * 0.2, spot.z);
        reed.scale.y = height;
        reed.rotation.z = (hash(index * 8.1) - 0.5) * 0.12;
        addStageMesh(reed);
    }
}

function buildUrbanStage(region, isCitadel) {
    const seed = world.regions.indexOf(region) + 1;
    const geometry = new THREE.BoxGeometry(0.16, 1, 0.16);
    const material = new THREE.MeshStandardMaterial({
        color: region.biome === 'oldtown' ? 0x62556d : 0x747882,
        roughness: 0.62,
        metalness: 0.14
    });
    const lightPositions = [];
    const count = MOBILE_QUERY.matches ? 18 : 34;

    for (let index = 0; index < count; index += 1) {
        const spot = stagePoint(seed, index, isCitadel ? 0.48 : 0.22, isCitadel ? 1.5 : 1.32);
        const height = 0.24 + hash(seed * 61 + index * 7.7) * (isCitadel ? 0.9 : 0.72);
        const building = new THREE.Mesh(geometry, material);
        building.position.set(spot.x, height * 0.5, spot.z);
        building.scale.set(0.6 + hash(index * 4.3) * 0.9, height, 0.6 + hash(index * 9.1) * 0.85);
        building.rotation.y = spot.angle * 0.5;
        addStageMesh(building);
        if (region.biome === 'oldtown' && index % 3 === 0) {
            const roof = new THREE.Mesh(
                new THREE.ConeGeometry(0.13, 0.14, 4),
                new THREE.MeshStandardMaterial({ color: 0x76504d, roughness: 0.88 })
            );
            roof.position.set(spot.x, height + 0.07, spot.z);
            roof.rotation.y = Math.PI / 4 + spot.angle * 0.5;
            addStageMesh(roof);
        }
        if (index % 3 === 0) lightPositions.push(new THREE.Vector3(spot.x, height * 0.72, spot.z));
    }

    if (region.biome === 'urban-river') {
        const riverCurve = new THREE.CatmullRomCurve3([
            new THREE.Vector3(-1.5, 0.035, -0.6),
            new THREE.Vector3(-0.45, 0.045, 0.16),
            new THREE.Vector3(0.42, 0.04, -0.12),
            new THREE.Vector3(1.5, 0.035, 0.62)
        ]);
        const river = new THREE.Mesh(
            new THREE.TubeGeometry(riverCurve, 32, 0.055, 6, false),
            new THREE.MeshPhysicalMaterial({ color: 0x4e8c9b, roughness: 0.2, clearcoat: 0.62, transparent: true, opacity: 0.76, depthWrite: false })
        );
        regionStage.add(river);
    }

    const lightGeometry = new THREE.BufferGeometry().setFromPoints(lightPositions);
    const lightMaterial = new THREE.PointsMaterial({
        color: 0xc68b55,
        size: 0.032,
        sizeAttenuation: true,
        transparent: true,
        opacity: 0.72,
        depthWrite: false,
        toneMapped: true
    });
    regionStage.add(new THREE.Points(lightGeometry, lightMaterial));

    if (isCitadel) {
        const gardenMaterial = new THREE.MeshStandardMaterial({ color: 0x47764f, roughness: 0.95 });
        for (let index = 0; index < 12; index += 1) {
            const angle = index / 12 * Math.PI * 2;
            const garden = new THREE.Mesh(new THREE.IcosahedronGeometry(0.1, 1), gardenMaterial);
            garden.position.set(Math.cos(angle) * 0.38, 0.08, Math.sin(angle) * 0.38);
            addStageMesh(garden);
        }
    }
}

function buildGreenStage(region) {
    const seed = world.regions.indexOf(region) + 1;
    const isFarmland = region.biome === 'farmland';
    const isVillage = region.biome === 'village';
    const isOrchard = region.biome === 'orchard';
    const trunkGeometry = new THREE.CylinderGeometry(0.025, 0.04, 0.34, 6);
    const crownGeometry = new THREE.IcosahedronGeometry(region.biome === 'forest' ? 0.2 : 0.16, 1);
    const trunkMaterial = new THREE.MeshStandardMaterial({ color: 0x4b3521, roughness: 1 });
    const crownMaterial = new THREE.MeshStandardMaterial({ color: region.color, roughness: 0.92 });

    if (isFarmland) {
        const rowMaterial = new THREE.MeshStandardMaterial({ color: 0xa6bd68, roughness: 0.95 });
        for (let index = -8; index <= 8; index += 1) {
            const row = new THREE.Mesh(new THREE.BoxGeometry(1.45, 0.018, 0.026), rowMaterial);
            row.position.set(0, 0.025, index * 0.09);
            row.rotation.y = -0.28;
            addStageMesh(row);
        }
    }

    const count = MOBILE_QUERY.matches ? 14 : (isFarmland ? 12 : 26);
    for (let index = 0; index < count; index += 1) {
        const spot = isOrchard
            ? {
                angle: 0,
                x: ((index % 6) - 2.5) * 0.27,
                z: (Math.floor(index / 6) - 1.7) * 0.26
            }
            : stagePoint(seed, index, isVillage ? 0.52 : 0.24, 1.48);
        const size = 0.72 + hash(seed * 43 + index * 7.2) * 0.78;
        const trunk = new THREE.Mesh(trunkGeometry, trunkMaterial);
        trunk.position.set(spot.x, 0.17 * size, spot.z);
        trunk.scale.set(size, size, size);
        addStageMesh(trunk);
        const crown = new THREE.Mesh(crownGeometry, crownMaterial);
        crown.position.set(spot.x, 0.43 * size, spot.z);
        crown.scale.set(size, 0.78 * size, size);
        addStageMesh(crown);
    }

    if (isVillage) {
        const wallMaterial = new THREE.MeshStandardMaterial({ color: 0xb8a77d, roughness: 0.9 });
        const roofMaterial = new THREE.MeshStandardMaterial({ color: 0x765044, roughness: 0.9 });
        for (let index = 0; index < 5; index += 1) {
            const angle = index / 5 * Math.PI * 2;
            const x = Math.cos(angle) * 0.34;
            const z = Math.sin(angle) * 0.25;
            const cottage = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.18, 0.18), wallMaterial);
            cottage.position.set(x, 0.09, z);
            addStageMesh(cottage);
            const roof = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.13, 4), roofMaterial);
            roof.position.set(x, 0.245, z);
            roof.rotation.y = Math.PI / 4;
            addStageMesh(roof);
        }
    }
}

function buildRidgeStage(region) {
    const seed = world.regions.indexOf(region) + 1;
    const geometry = new THREE.ConeGeometry(0.19, 0.92, region.biome === 'rock' ? 6 : 7);
    const material = new THREE.MeshStandardMaterial({ color: region.color, roughness: 0.9, metalness: 0.015 });
    const count = MOBILE_QUERY.matches ? 13 : 24;

    for (let index = 0; index < count; index += 1) {
        const spot = stagePoint(seed, index, 0.2, 1.62);
        const height = 0.5 + hash(seed * 71 + index * 5.8) * 1.3;
        const peak = new THREE.Mesh(geometry, material);
        peak.position.set(spot.x, height * 0.42, spot.z);
        peak.scale.set(0.58 + hash(index * 4.7) * 0.8, height, 0.62 + hash(index * 8.9) * 0.74);
        peak.rotation.y = spot.angle;
        addStageMesh(peak);
    }
}

function buildDryStage(region) {
    const seed = world.regions.indexOf(region) + 1;
    const isFrontier = region.biome === 'frontier';
    const duneGeometry = isFrontier
        ? new THREE.ConeGeometry(0.05, 0.32, 5)
        : new THREE.IcosahedronGeometry(0.2, 1);
    const duneMaterial = new THREE.MeshStandardMaterial({ color: region.color, roughness: 0.98, metalness: 0 });
    const count = MOBILE_QUERY.matches ? 14 : 28;

    for (let index = 0; index < count; index += 1) {
        const spot = stagePoint(seed, index, 0.18, 1.58);
        const dune = new THREE.Mesh(duneGeometry, duneMaterial);
        const size = 0.58 + hash(seed * 39 + index * 5.2) * 0.9;
        dune.position.set(spot.x, (isFrontier ? 0.14 : 0.075) * size, spot.z);
        dune.scale.set(
            (isFrontier ? 0.72 : 1.9) * size,
            (isFrontier ? 0.85 : 0.32) * size,
            (isFrontier ? 0.72 : 0.66) * size
        );
        dune.rotation.y = spot.angle;
        addStageMesh(dune);
    }
}

function buildCoastStage(region) {
    const seed = world.regions.indexOf(region) + 1;
    const shoreMaterial = new THREE.MeshStandardMaterial({ color: 0xe4c88d, roughness: 0.88 });
    const shore = new THREE.Mesh(new THREE.TorusGeometry(0.88, 0.032, 6, 48, Math.PI * 1.45), shoreMaterial);
    shore.rotation.x = -Math.PI / 2;
    shore.rotation.z = -0.65;
    shore.position.y = 0.035;
    regionStage.add(shore);

    const trunkGeometry = new THREE.CylinderGeometry(0.022, 0.04, 0.52, 7);
    const crownGeometry = new THREE.ConeGeometry(0.18, 0.34, 7);
    const trunkMaterial = new THREE.MeshStandardMaterial({ color: 0x6e4c2d, roughness: 0.94 });
    const crownMaterial = new THREE.MeshStandardMaterial({ color: region.biome === 'tropical' ? 0x2f8f5a : 0x64825d, roughness: 0.9 });
    const count = MOBILE_QUERY.matches ? 9 : 16;

    for (let index = 0; index < count; index += 1) {
        const spot = stagePoint(seed, index, 0.34, 1.42);
        const size = 0.7 + hash(index * 6.3) * 0.75;
        const trunk = new THREE.Mesh(trunkGeometry, trunkMaterial);
        trunk.position.set(spot.x, 0.26 * size, spot.z);
        trunk.scale.set(size, size, size);
        trunk.rotation.z = (hash(index * 11.4) - 0.5) * 0.2;
        addStageMesh(trunk);
        const crown = new THREE.Mesh(crownGeometry, crownMaterial);
        crown.position.set(spot.x, 0.58 * size, spot.z);
        crown.rotation.x = Math.PI;
        crown.scale.set(size, 0.52 * size, size);
        addStageMesh(crown);
    }
}

function createRegionParticles(region, family) {
    const count = MOBILE_QUERY.matches ? 26 : 48;
    const positions = new Float32Array(count * 3);
    const seed = world.regions.indexOf(region) + 1;
    for (let index = 0; index < count; index += 1) {
        const spot = stagePoint(seed, index + 40, 0.12, 1.7);
        positions[index * 3] = spot.x;
        positions[index * 3 + 1] = 0.18 + hash(seed * 71 + index * 3.8) * 1.35;
        positions[index * 3 + 2] = spot.z;
    }

    const colors = {
        cold: 0xe2f2f3,
        wetland: 0x91b8a1,
        urban: 0xb6a3c2,
        citadel: 0xc5b08a,
        green: 0xb8c982,
        ridge: 0xc7c1ae,
        dry: 0xd8b47c,
        coast: 0xa6d9d6
    };
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const material = new THREE.PointsMaterial({
        color: colors[family],
        size: family === 'cold' ? 0.038 : 0.026,
        sizeAttenuation: true,
        transparent: true,
        opacity: family === 'urban' ? 0.18 : 0.34,
        depthWrite: false,
        toneMapped: true
    });
    regionParticles = new THREE.Points(geometry, material);
    regionParticles.userData.family = family;
    regionParticles.name = `${region.label} atmosphere`;
    regionStage.add(regionParticles);
}

function applyRegionMood(family) {
    const moods = {
        cold: [0x0b202b, 0x173542, 0xdceef1, 0x233039, 0xe9f3ef, 2.78],
        wetland: [0x071d1d, 0x17342f, 0xbadbd0, 0x17251b, 0xffd0a0, 2.72],
        urban: [0x111522, 0x292638, 0xc8c9da, 0x201b24, 0xffc58f, 2.92],
        citadel: [0x101724, 0x2a2424, 0xd5d6dc, 0x211a17, 0xffbd78, 3.18],
        green: [0x081d19, 0x17352a, 0xc9e1cf, 0x182516, 0xffd0a0, 2.86],
        ridge: [0x111d24, 0x343b3a, 0xd2dce0, 0x282921, 0xffd0a0, 3.02],
        dry: [0x261a12, 0x49301e, 0xf0d7bb, 0x322219, 0xffc079, 3.32],
        coast: [0x06232d, 0x124152, 0xc7e8e5, 0x17332f, 0xffd4a0, 2.94]
    };
    const [background, fog, sky, ground, key, intensity] = moods[family];
    backgroundTarget.setHex(background);
    fogTarget.setHex(fog);
    hemisphereSkyTarget.setHex(sky);
    hemisphereGroundTarget.setHex(ground);
    keyLightColorTarget.setHex(key);
    keyLightIntensityTarget = intensity;
}

function resetMood() {
    backgroundTarget.setHex(0x071923);
    fogTarget.setHex(0x071923);
    hemisphereSkyTarget.setHex(0xc8e5ec);
    hemisphereGroundTarget.setHex(0x182313);
    keyLightColorTarget.setHex(0xffd2a0);
    keyLightIntensityTarget = 3.05;
}

function snapMood() {
    scene.background.copy(backgroundTarget);
    scene.fog.color.copy(fogTarget);
    hemisphereLight.color.copy(hemisphereSkyTarget);
    hemisphereLight.groundColor.copy(hemisphereGroundTarget);
    directionalLight.color.copy(keyLightColorTarget);
    directionalLight.intensity = keyLightIntensityTarget;
}

function createLabels() {
    labelEntries = world.regions.map(region => {
        const element = document.createElement('span');
        element.className = `place-label${LABEL_IDS.includes(region.id) ? ' is-major' : ''}`;
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
    const relief = broadNoise * 0.28 + detailNoise * 0.13;
    const height = 0.022 + rise * (0.1 + biome.elevation * 1.18 + relief);

    return { land, biome, height: Math.max(0.022, height) };
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

    canvas.addEventListener('pointerdown', beginWorldDrag);
    canvas.addEventListener('pointermove', moveAcrossWorld);
    canvas.addEventListener('pointerup', finishWorldDrag);
    canvas.addEventListener('pointercancel', cancelWorldDrag);
    canvas.addEventListener('pointerleave', event => {
        if (event.pointerType === 'mouse' && activePointerId === null) {
            pointerX = 0;
            pointerY = 0;
        }
    });

    window.addEventListener('keydown', event => {
        if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey) return;
        if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement || event.target?.isContentEditable) return;

        if (event.key === '+' || event.key === '=') changeZoom(0.14);
        if (event.key === '-' || event.key === '_') changeZoom(-0.14);
        if (event.key === '0') resetView();
        if (event.key.toLowerCase() === 'l') setLabelsVisible(!labelsVisible);
        if (event.key === 'Enter' && event.target === canvas) focusOnRegion(regionById.get('r_citadel'));
        if (event.key === 'Escape' && !notes.hidden) closeNotes();
    });

    window.addEventListener('resize', () => {
        cancelAnimationFrame(resizeFrame);
        resizeFrame = requestAnimationFrame(resize);
    });

    MOTION_QUERY.addEventListener?.('change', () => window.location.reload());
}

function beginWorldDrag(event) {
    if (event.button !== undefined && event.button !== 0) return;
    event.preventDefault();
    activePointerId = event.pointerId;
    activePointerType = event.pointerType || 'mouse';
    dragStartX = event.clientX;
    dragStartY = event.clientY;
    dragStartTarget = desiredTarget.clone();
    hasDragged = false;
    pointerX = 0;
    pointerY = 0;
    canvas.setPointerCapture?.(event.pointerId);
    canvas.focus({ preventScroll: true });
    atlas.classList.add('is-travelling');
}

function moveAcrossWorld(event) {
    const bounds = canvas.getBoundingClientRect();

    if (event.pointerId !== activePointerId) {
        if (!MOTION_QUERY.matches && event.pointerType === 'mouse') {
            pointerX = ((event.clientX - bounds.left) / bounds.width - 0.5) * 2;
            pointerY = ((event.clientY - bounds.top) / bounds.height - 0.5) * 2;
        }
        return;
    }

    const dx = event.clientX - dragStartX;
    const dy = event.clientY - dragStartY;
    const dragThreshold = activePointerType === 'touch' ? 14 : 5;
    if (!hasDragged && Math.hypot(dx, dy) > dragThreshold) {
        hasDragged = true;
        if (travelerJourney) {
            travelerJourney = null;
            desiredZoom = currentZoom;
            desiredFocusBlend = Math.max(0.42, focusBlend);
        }
    }
    if (!hasDragged) return;
    event.preventDefault();

    const horizontalScale = (WORLD_WIDTH * 0.82) / Math.max(320, bounds.width) / currentZoom;
    const verticalScale = (WORLD_DEPTH * 0.78) / Math.max(420, bounds.height) / currentZoom;
    desiredTarget.set(
        THREE.MathUtils.clamp(dragStartTarget.x - dx * horizontalScale, -7.4, 7.4),
        dragStartTarget.y,
        THREE.MathUtils.clamp(dragStartTarget.z - dy * verticalScale, -5.1, 5.1)
    );
    statusText.textContent = 'The world follows your hand';

    cameraTarget.lerp(desiredTarget, MOTION_QUERY.matches ? 1 : 0.52);
    renderScene();
}

function finishWorldDrag(event) {
    if (event.pointerId !== activePointerId) return;
    if (!hasDragged) focusAtPointer(event);
    else statusText.textContent = 'North stays fixed · drag again to continue';
    canvas.releasePointerCapture?.(event.pointerId);
    activePointerId = null;
    dragStartTarget = null;
    atlas.classList.remove('is-travelling');
}

function cancelWorldDrag(event) {
    if (event.pointerId !== activePointerId) return;
    activePointerId = null;
    dragStartTarget = null;
    atlas.classList.remove('is-travelling');
}

function focusAtPointer(event) {
    const bounds = canvas.getBoundingClientRect();
    pointerNdc.set(
        ((event.clientX - bounds.left) / bounds.width) * 2 - 1,
        -((event.clientY - bounds.top) / bounds.height) * 2 + 1
    );
    raycaster.setFromCamera(pointerNdc, camera);
    const hit = raycaster.intersectObject(terrain, false)[0];
    const point = hit?.point || raycaster.ray.intersectPlane(interactionPlane, interactionPoint);
    if (!point) return;

    const nearest = world.regions.reduce((best, region) => {
        const dx = point.x - (region.x - 0.5) * WORLD_WIDTH;
        const dz = point.z - (region.y - 0.5) * WORLD_DEPTH;
        const distance = dx * dx + dz * dz;
        return !best || distance < best.distance ? { region, distance } : best;
    }, null);
    focusOnRegion(nearest.region);
}

function focusOnRegion(region) {
    const point = mapPoint(region.x, region.y, 0.1);
    focusedRegion = region;
    createRegionStage(region);
    focusMarker.position.copy(point);
    focusMarker.visible = true;
    labelEntries.forEach(entry => entry.element.classList.toggle('is-focused', entry.region.id === region.id));
    atlas.classList.add('has-focus');
    atlas.classList.remove('is-local');

    if (MOTION_QUERY.matches) {
        traveler.position.copy(point);
        travelerJourney = null;
        desiredTarget.set(point.x, point.y + 0.12, point.z);
        desiredZoom = 1.54;
        currentZoom = 1.54;
        desiredFocusBlend = 1;
        focusBlend = 1;
        regionStage.scale.setScalar(1);
        cameraTarget.copy(desiredTarget);
        statusText.textContent = `${region.label} · tap another region or return to the whole world`;
        atlas.classList.add('is-local');
        snapMood();
        renderScene();
    } else {
        beginJourney(region);
    }
}

function changeZoom(amount) {
    desiredZoom = THREE.MathUtils.clamp(desiredZoom + amount, 0.78, 1.68);
    if (MOTION_QUERY.matches) {
        currentZoom = desiredZoom;
        renderScene(elapsed);
    }
}

function resetView() {
    travelerJourney = null;
    desiredZoom = 1;
    desiredFocusBlend = 0;
    pointerX = 0;
    pointerY = 0;
    desiredTarget.copy(homeTarget);
    focusMarker.visible = false;
    disposeObject(regionStage);
    if (regionStage) scene.remove(regionStage);
    regionStage = null;
    regionParticles = null;
    disposeObject(journeyPath);
    if (journeyPath) scene.remove(journeyPath);
    journeyPath = null;
    focusedRegion = null;
    labelEntries.forEach(entry => entry.element.classList.remove('is-focused'));
    atlas.classList.remove('has-focus', 'is-local');
    resetMood();
    statusText.textContent = 'Whole world · north up';
    if (MOTION_QUERY.matches) {
        currentZoom = 1;
        focusBlend = 0;
        cameraTarget.copy(homeTarget);
        snapMood();
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
    const baseDistance = baseCameraPosition.distanceTo(homeTarget);
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
    focusBlend += (desiredFocusBlend - focusBlend) * (1 - Math.pow(0.004, delta));
    updateTraveler(delta);
    parallaxTarget.set(pointerX * 0.18, 0, pointerY * 0.09);
    composedTarget.copy(desiredTarget).add(parallaxTarget);
    const followAmount = activePointerId !== null && hasDragged
        ? 0.52
        : 1 - Math.pow(0.002, delta);
    cameraTarget.lerp(composedTarget, followAmount);

    if (frameCount % 2 === 0) updateWater(elapsed);
    updateAtmosphere(delta);
    citadelCore.material.emissiveIntensity = 6.55 + Math.sin(elapsed * 1.15) * 0.42;
    citadelLight.intensity = 15 + Math.sin(elapsed * 1.15) * 0.8;
    renderScene(elapsed);
}

function updateAtmosphere(delta) {
    cloudBanks.forEach(bank => {
        bank.position.x += delta * bank.userData.speed;
        bank.position.z = bank.userData.originZ + Math.sin(elapsed * 0.08 + bank.userData.phase) * 0.32;
        if (bank.position.x > 18) bank.position.x = -18;
    });
    if (oceanGlints) oceanGlints.material.opacity = 0.12 + Math.sin(elapsed * 0.42) * 0.025;
    if (shorelineWash) shorelineWash.material.opacity = 0.3 + Math.sin(elapsed * 0.34) * 0.04;
    if (cityLights) cityLights.material.opacity = 0.61 + Math.sin(elapsed * 0.73) * 0.045;
    updateRegionParticles(delta);
    const moodAmount = 1 - Math.pow(0.018, delta);
    scene.background.lerp(backgroundTarget, moodAmount);
    scene.fog.color.lerp(fogTarget, moodAmount);
    hemisphereLight.color.lerp(hemisphereSkyTarget, moodAmount);
    hemisphereLight.groundColor.lerp(hemisphereGroundTarget, moodAmount);
    directionalLight.color.lerp(keyLightColorTarget, moodAmount);
    directionalLight.intensity += (keyLightIntensityTarget - directionalLight.intensity) * moodAmount;
    if (focusMarker?.visible) {
        const pulse = MOTION_QUERY.matches ? 0 : Math.sin(elapsed * 1.8);
        focusMarker.scale.setScalar(1 + pulse * 0.055);
        focusMarker.userData.outerMaterial.opacity = 0.68 + pulse * 0.1;
        focusMarker.userData.innerMaterial.opacity = 0.34 - pulse * 0.07;
        focusMarker.userData.washMaterial.opacity = 0.05 + pulse * 0.014;
    }
}

function updateRegionParticles(delta) {
    if (!regionParticles) return;
    const position = regionParticles.geometry.getAttribute('position');
    const family = regionParticles.userData.family;

    for (let index = 0; index < position.count; index += 1) {
        let x = position.getX(index);
        let y = position.getY(index);
        let z = position.getZ(index);
        if (family === 'cold') {
            y -= delta * 0.18;
            x += Math.sin(elapsed * 0.7 + index) * delta * 0.025;
            if (y < 0.08) y = 1.5;
        } else if (family === 'dry') {
            x += delta * 0.07;
            y += Math.sin(elapsed + index) * delta * 0.012;
            if (x > 1.75) x = -1.75;
        } else if (family === 'coast') {
            y += delta * 0.045;
            z += Math.sin(elapsed * 0.8 + index) * delta * 0.025;
            if (y > 1.58) y = 0.14;
        } else {
            y += Math.sin(elapsed * 0.65 + index * 0.7) * delta * 0.018;
            x += Math.cos(elapsed * 0.28 + index) * delta * 0.006;
        }
        position.setXYZ(index, x, y, z);
    }
    position.needsUpdate = true;
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
    const breath = MOTION_QUERY.matches ? 1 : 1 + Math.sin(elapsed * 0.11) * 0.0045;
    temporaryVector.copy(baseCameraPosition).multiplyScalar(framingScale / (currentZoom * breath));
    const localScale = (MOBILE_QUERY.matches ? 1.14 : 1) * 1.54 / currentZoom;
    localCameraOffset.copy(localCameraPosition).multiplyScalar(localScale);
    cameraOffset.copy(temporaryVector).lerp(localCameraOffset, focusBlend);
    camera.position.copy(cameraOffset);
    camera.position.x += cameraTarget.x;
    camera.position.y += cameraTarget.y;
    camera.position.z += cameraTarget.z;
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
    statusText.textContent = 'Drag anywhere · tap a region and the traveler will cross';
}

function showFailure(message) {
    if (fallback) fallback.hidden = false;
    if (opening) opening.hidden = true;
    if (statusText) statusText.textContent = message;
}
