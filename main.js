import { createReactiveState, createUi } from './util/reactiveControls.js';

import { default as configSchema } from './controls/schemas/config.js';
import { default as gameStateSchema } from './controls/schemas/gameState.js';
import { default as keyBindingsSchema } from './controls/schemas/keyBindings.js';
import { default as genesSchema } from './controls/schemas/genes.js';
import { default as insightSchema } from './controls/schemas/nodeInsight.js';
import { default as viewSchema } from './controls/schemas/view.js';
import { registerCustomTypes } from './controls/types/defineTypes.js';
import { LifeSimulator } from './LifeSimulator.js';
import { Renderer } from './Renderer.js';
import { vec2 } from './lib/webgpu-matrix.js';

registerCustomTypes();

// --- Global State ---

const canvas = document.getElementById('canvas');
const elNodeInsight = document.getElementById('node-insight');

canvas.width = canvas.clientWidth;
canvas.height = canvas.clientHeight;

const MAX_ZOOM = 10;
const MIN_ZOOM = 0.1;
const CAMERA_SPEED = 0.2;
const ZOOM_SPEED = 1.005;
const AVERAGE_FPS_OVER_N_FRAMES = 60;

let paused = false;
let lastTimes = Array(AVERAGE_FPS_OVER_N_FRAMES).fill(0);

let simulator = null;
let gameConfig = null;
let renderer = null;

function resetView() {
    view.cameraPos = vec2.mulScalar(gameConfig.WORLD_SIZE, 0.5);
    view.zoom = 0.99;
}

// --- Controls ---

const gameState = createReactiveState(gameStateSchema);
createUi(gameState, document.getElementById('section-game-state'));

const view = createReactiveState(viewSchema);
createUi(view, document.getElementById('section-view'));
view.$callbacks.push(() => renderer.updateView(view));

const config = createReactiveState(configSchema);
createUi(config, document.getElementById('section-config'));
config.$callbacks.push((name, value) => simulator.setConfig(name, value));

const keyBindings = createReactiveState(keyBindingsSchema);
createUi(keyBindings, document.getElementById('section-key-bindings'));

const genes = createReactiveState(genesSchema);
createUi(genes, document.getElementById('section-genes'));

const insight = createReactiveState(insightSchema);
createUi(insight, document.getElementById('node-insight'));

// --- User Input ---

let pressedKeys = {};
let justPressedKeys = {};
let mouseX = null;
let mouseY = null;

let stepOnce = false;

canvas.addEventListener('mousemove', e => {
    mouseX = e.x;
    mouseY = e.y;
});

canvas.addEventListener('mouseleave', e => {
    mouseX = null;
    mouseY = null;
});

document.addEventListener('keydown', e => {
    const isRepeatedPress = pressedKeys[e.key];
    if (!isRepeatedPress) {
        justPressedKeys[e.key] = true;
    }

    pressedKeys[e.key] = true;
});

document.addEventListener('keyup', e => {
    pressedKeys[e.key] = false
});

function handleInput(delta) {
    if (pressedKeys[keyBindings['moveCamWest']])  view.cameraPos[0] -= CAMERA_SPEED * delta / view.zoom;
    if (pressedKeys[keyBindings['moveCamEast']])  view.cameraPos[0] += CAMERA_SPEED * delta / view.zoom;
    if (pressedKeys[keyBindings['moveCamNorth']]) view.cameraPos[1] -= CAMERA_SPEED * delta / view.zoom;
    if (pressedKeys[keyBindings['moveCamSouth']]) view.cameraPos[1] += CAMERA_SPEED * delta / view.zoom;
    if (pressedKeys[keyBindings['zoomIn']])       view.zoom = Math.min(view.zoom * Math.pow(ZOOM_SPEED, delta), MAX_ZOOM);
    if (pressedKeys[keyBindings['zoomOut']])      view.zoom = Math.max(view.zoom / Math.pow(ZOOM_SPEED, delta), MIN_ZOOM);

    if (pressedKeys[keyBindings['resetView']]) {
        resetView();
    }

    if (justPressedKeys[keyBindings['pause']]) {
        paused = !paused;
        justPressedKeys[keyBindings['pause']] = false;
    }

    if (justPressedKeys[keyBindings['stepOnce']]) {
        stepOnce = true;
        justPressedKeys[keyBindings['stepOnce']] = false;
    } else {
        stepOnce = false;
    }
}

// --- Controls Logic ---

/**
 * @param {LifeSimulator} simulator 
 */
function updateGameStateDisplay() {
    gameState.step = simulator.currentStep;
    gameState.isPaused = paused ? 'Paused' : 'Running';
    gameState.numActiveNodes = simulator.activeNodeNum;

    const avgDelta = (lastTimes[lastTimes.length - 1] - lastTimes[0]) / (lastTimes.length - 1);
    gameState.fps = Math.floor(1000 / avgDelta);
}

function updateConfigDisplay() {
    for (const param of config.$schema) {
        config[param.name] = gameConfig[param.name];
    }
}

async function updateNodeInsightDisplay() {
    // --- Visibility ---
    const [worldX, worldY] = renderer.screenCoordsToWorld(view, [mouseX, mouseY]);
    if (mouseX === null || !simulator.areCorrectCoords(worldX, worldY)) {
        elNodeInsight.style.display = 'none';
        return;
    }

    const node = await simulator.getNodeAt(worldX, worldY);
    if (node?.type !== 'active') {
        elNodeInsight.style.display = 'none';
        return;
    }

    elNodeInsight.style.display = 'block';

    // --- Position on screen ---

    const offsetFromCursor = 15;

    let newX = mouseX + offsetFromCursor;
    let newY = mouseY + offsetFromCursor;

    if (newX + elNodeInsight.clientWidth >= window.innerWidth) {
        newX -= elNodeInsight.clientWidth + 2 * offsetFromCursor;
    }

    if (newY + elNodeInsight.clientHeight >= window.innerHeight) {
        newY -= elNodeInsight.clientHeight + 2 * offsetFromCursor;
    }

    elNodeInsight.style.left = `${newX}px`;
    elNodeInsight.style.top = `${newY}px`;

    // --- Contents ---

    insight.energy = node.energy;
    insight.minerals = node.minerals;
    insight.age = node.age;
    insight.genome = node;
}

// --- Main ---

/**
 * Main loop.
 * @param {LifeSimulator} simulator 
 */
async function loop(currentTime) {
    const delta = currentTime - lastTimes[lastTimes.length - 1];
    handleInput(delta);

    if (!paused) {
        for (let i = 0; i < view.simulationSpeed; i++) {
            simulator.stepWorld();
        }
    } else  if (stepOnce) {
        simulator.stepWorld();
    }

    renderer.updateView(view);
    renderer.render();

    for (let i = 0; i < lastTimes.length - 1; i++) {
        lastTimes[i] = lastTimes[i + 1];
    }
    lastTimes[lastTimes.length - 1] = currentTime;

    updateGameStateDisplay();
    await updateNodeInsightDisplay();

    requestAnimationFrame(loop);
}

async function main() {
    const adapter = await navigator.gpu?.requestAdapter();
    const device = await adapter?.requestDevice();
    if (!device) {
        alert('The browser does not support WebGPU.');
        return;
    }

    simulator = await LifeSimulator.create(device);
    gameConfig = simulator.config;
    simulator.resetWorld();

    renderer = await Renderer.create(device, canvas, simulator);
    resetView();
    renderer.updateView(view);

    gameState.$callbacks.push((name) => {
        switch (name) {
            case 'pause':
                paused = !paused;
                break;
            
            case 'restart':
                simulator.resetWorld();
                break;
        }
    })

    updateConfigDisplay();
    requestAnimationFrame(loop);
}

main();
