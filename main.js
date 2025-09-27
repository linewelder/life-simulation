import { lepr } from './util.js';
import {
    getActiveNodeNum,
    config as gameConfig,
    getSunAmountAt,
    getMineralAmountAt,
} from './life.js';

import { createReactiveState, createUi } from './lib/reactiveControls.js';

import { default as configSchema } from './controls/schemas/config.js';
import { default as gameStateSchema } from './controls/schemas/gameState.js';
import { default as keyBindingsSchema } from './controls/schemas/keyBindings.js';
import { default as insightSchema } from './controls/schemas/nodeInsight.js';
import { default as viewSchema } from './controls/schemas/view.js';
import { registerCustomTypes } from './controls/types/defineTypes.js';
import { LifeSimulator } from './LifeSimulator.js';

registerCustomTypes();

// --- Global State ---

const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');

canvas.width = canvas.clientWidth;
canvas.height = canvas.clientHeight;

const CANVAS_WIDTH = canvas.width;
const CANVAS_HEIGHT = canvas.height;
const SHOW_DETAILS_AT_ZOOM = 7;
const MAX_ZOOM = 50;
const MIN_ZOOM = 1;
const CAMERA_SPEED = 1;
const ORIG_X = Math.floor(CANVAS_WIDTH / 2);
const ORIG_Y = Math.floor(CANVAS_HEIGHT / 2);

let camX = gameConfig.GRID_W / 2;
let camY = gameConfig.GRID_H / 2;
let zoom = 5; // pixels per grid cell

let paused = false;

let keys = {};
let justPressedKeys = {};
document.addEventListener('keydown', e => { keys[e.key] = true; justPressedKeys[e.key] = true; });
document.addEventListener('keyup', e => keys[e.key] = false);

function screenCoordsToWorld(sx, sy) {
    return [
        Math.floor((sx - ORIG_X) / zoom + camX),
        Math.floor((sy - ORIG_Y) / zoom + camY),
    ];
}

let mouseX = null;
let mouseY = null;

const elNodeInsight = document.getElementById('node-insight');
canvas.addEventListener('mousemove', e => {
    mouseX = e.x;
    mouseY = e.y;
});

canvas.addEventListener('mouseleave', e => {
    mouseX = null;
    mouseY = null;
});

// --- Controls ---

const gameState = createReactiveState(gameStateSchema);
createUi(gameState, document.getElementById('section-game-state'));

const view = createReactiveState(viewSchema);
createUi(view, document.getElementById('section-view'));

const config = createReactiveState(configSchema);
createUi(config, document.getElementById('section-config'));
config.$callbacks.push((name, value) => gameConfig[name] = value);

const keyBindings = createReactiveState(keyBindingsSchema);
createUi(keyBindings, document.getElementById('section-key-bindings'));

const insight = createReactiveState(insightSchema);
createUi(insight, document.getElementById('node-insight'));

/**
 * @param {LifeSimulator} simulator 
 */
function updateGameStateDisplay(simulator) {
    gameState.step = simulator.currentStep;
    gameState.isPaused = paused ? 'Paused' : 'Running';
    gameState.numActiveNodes = getActiveNodeNum();
}

function updateConfigDisplay() {
    for (const param of config.$schema) {
        config[param.name] = gameConfig[param.name];
    }
    config.GRID_SIZE = [gameConfig.GRID_W, gameConfig.GRID_H];
}

function areCorrectCoords(x, y) {
    return x >= 0 && x < gameConfig.GRID_W
        && y >= 0 && y < gameConfig.GRID_H;
}

function updateNodeInsightDisplay(worldState) {
    // --- Visibility ---
    const [worldX, worldY] = screenCoordsToWorld(mouseX, mouseY);
    if (mouseX === null || !areCorrectCoords(worldX, worldY)) {
        elNodeInsight.style.display = 'none';
        return;
    }

    const node = worldState[worldX * gameConfig.GRID_H + worldY];
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

function toScreenCoords(x, y) {
    return [
        (x - camX) * zoom + ORIG_X,
        (y - camY) * zoom + ORIG_Y,
    ];
}

function isOnScreen(fromX, fromY, toX, toY) {
    return (toX < 0 || fromX > CANVAS_WIDTH) && (toY < 0 || fromY > CANVAS_HEIGHT);
}

function drawRect(x, y, w, h, fillStyle, doStroke = false) {
    let [sx, sy] = toScreenCoords(x, y);
    let sw = w * zoom;
    let sh = h * zoom;

    if (isOnScreen(sx, sy, sx + sw, sy + sh)) {
        return;
    }

    ctx.fillStyle = fillStyle;
    if (doStroke) {
        ctx.beginPath();
        ctx.rect(sx, sy, sw, sh);
        ctx.fill();
        ctx.stroke();
    } else {
        ctx.fillRect(sx, sy, sw, sh);
    }
}

function drawLine(fromX, fromY, toX, toY) {
    let [sFromX, sFromY] = toScreenCoords(fromX, fromY);
    let [sToX, sToY] = toScreenCoords(toX, toY);

    if (isOnScreen(sFromX, sFromY, sToX, sToY)) {
        return;
    }

    ctx.beginPath();
    ctx.moveTo(sFromX, sFromY);
    ctx.lineTo(sToX, sToY);
    ctx.stroke();
}

function draw(worldState) {
    ctx.fillStyle = 'black';
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    for (let y = 0; y < config.GRID_SIZE[1]; y++) {
        const sunAmount     = getSunAmountAt(y)     / config.SUN_AMOUNT;
        const mineralAmount = getMineralAmountAt(y) / config.MINERAL_AMOUNT;

        const red   = lepr(lepr(200, 255, sunAmount), 150, mineralAmount);
        const green = lepr(lepr(200, 255, sunAmount), 150, mineralAmount);
        const blue  = lepr(lepr(190, 255, sunAmount), 200, mineralAmount);

        drawRect(
            0, y,
            config.GRID_SIZE[0], 1,
            `rgb(${red}, ${green}, ${blue})`,
        );
    }

    for (let node of worldState) {
        if (node) {
            let fillStyle = '#000';
            if (node.type === 'food') {
                fillStyle = '#aaa';
            } else {
                switch (view.nodeView) {
                    case 'energy':
                        fillStyle = `hsl(50 100 ${node.energy / config.NODE_MAX_ENERGY * 80})`;
                        break;
                    case 'minerals':
                        fillStyle = `hsl(170 ${node.minerals / config.NODE_MAX_MINERALS * 100} 50)`;
                        break;
                    case 'age':
                        fillStyle = `hsl(147 ${100 - Math.sqrt(node.age / config.NODE_MAX_AGE, 2) * 100} 50)`;
                        break;
                    case 'genome':
                            fillStyle = `rgb(${node.color[0]}, ${node.color[1]}, ${node.color[2]}`;
                        break;
                    case 'diet':
                        const carnivority = node.diet * 110 + 128;
                        fillStyle = `rgb(${node.diet[0] * 180 + 40}, ${node.diet[1] * 180 + 40}, ${node.diet[2] * 200 + 40})`;
                        break;
                }
            }

            const addDetails = zoom > SHOW_DETAILS_AT_ZOOM && node.type === 'active';

            drawRect(
                node.x, node.y,
                1, 1,
                fillStyle,
                addDetails,
            );

            if (addDetails) {
                let endCoords;
                switch (node.direction) {
                    case 0: endCoords = [node.x + 1,   node.y + 0.5]; break;
                    case 1: endCoords = [node.x + 0.5, node.y      ]; break;
                    case 2: endCoords = [node.x,       node.y + 0.5]; break;
                    case 3: endCoords = [node.x + 0.5, node.y + 1  ]; break;
                    default: endCoords = [0, 0];
                }
                drawLine(node.x + 0.5, node.y + 0.5, ...endCoords);
            }
        }
    }
}

/**
 * Main loop.
 * @param {LifeSimulator} simulator 
 */
async function loop(simulator) {
    if (keys[keyBindings['moveCamWest']]) camX -= CAMERA_SPEED;
    if (keys[keyBindings['moveCamEast']]) camX += CAMERA_SPEED;
    if (keys[keyBindings['moveCamNorth']]) camY -= CAMERA_SPEED;
    if (keys[keyBindings['moveCamSouth']]) camY += CAMERA_SPEED;
    if (keys[keyBindings['zoomIn']]) zoom = Math.min(zoom + 1, MAX_ZOOM);
    if (keys[keyBindings['zoomOut']]) zoom = Math.max(zoom - 1, MIN_ZOOM);

    if (keys[keyBindings['resetView']]) {
        camX = gameConfig.GRID_W / 2;
        camY = gameConfig.GRID_H / 2;
        zoom = 5;
    }

    if (justPressedKeys[keyBindings['pause']]) {
        paused = !paused;
    }

    if (keys[keyBindings['fastForward']]) {
        for (let i = 0; i < 50; i++) {
            simulator.stepWorld();
        }
    } else if (!paused || justPressedKeys[keyBindings['stepOnce']]) {
        simulator.stepWorld();
    }

    const worldState = await simulator.readWorldState();
    draw(worldState);

    justPressedKeys = {};
    updateGameStateDisplay(simulator);
    updateNodeInsightDisplay(worldState);

    requestAnimationFrame(() => loop(simulator));
}

async function main() {
    const adapter = await navigator.gpu?.requestAdapter();
    const device = await adapter?.requestDevice();
    if (!device) {
        alert('The browser does not support WebGPU.');
        return;
    }

    const simulator = await LifeSimulator.create(device);

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

    simulator.resetWorld();
    updateConfigDisplay();
    loop(simulator);
}

main();
