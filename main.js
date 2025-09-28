import { lepr } from './util.js';

import { createReactiveState, createUi } from './lib/reactiveControls.js';

import { default as configSchema } from './controls/schemas/config.js';
import { default as gameStateSchema } from './controls/schemas/gameState.js';
import { default as keyBindingsSchema } from './controls/schemas/keyBindings.js';
import { default as insightSchema } from './controls/schemas/nodeInsight.js';
import { default as viewSchema } from './controls/schemas/view.js';
import { registerCustomTypes } from './controls/types/defineTypes.js';
import { LifeSimulator } from './LifeSimulator.js';
import { Renderer } from './Renderer.js';

registerCustomTypes();

// --- Global State ---

const canvas = document.getElementById('canvas');
const ctx = null; // canvas.getContext('2d');

canvas.width = canvas.clientWidth;
canvas.height = canvas.clientHeight;

const CANVAS_WIDTH = canvas.width;
const CANVAS_HEIGHT = canvas.height;
const SHOW_DETAILS_AT_ZOOM = 7;
const MAX_ZOOM = 50;
const MIN_ZOOM = 1;
const CAMERA_SPEED = 1;

let paused = false;

let keys = {};
document.addEventListener('keydown', e => { keys[e.key] = true; });
document.addEventListener('keyup', e => keys[e.key] = false);

let simulator = null;
let gameConfig = null;
let renderer = null;

function resetView() {
    view.cameraPos = [0, 0];
    view.zoom = 9;
}

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
view.$callbacks.push(() => renderer.updateView(view));

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
function updateGameStateDisplay() {
    gameState.step = simulator.currentStep;
    gameState.isPaused = paused ? 'Paused' : 'Running';
    gameState.numActiveNodes = simulator.activeNodeNum;
}

function updateConfigDisplay() {
    for (const param of config.$schema) {
        config[param.name] = gameConfig[param.name];
    }
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
        const sunAmount = config.SUN_AMOUNT === 0
            ? 0
            : simulator.getSunAmountAt(y) / config.SUN_AMOUNT;

        const mineralAmount = config.MINERAL_AMOUNT === 0
            ? 0
            : simulator.getMineralAmountAt(y) / config.MINERAL_AMOUNT;

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
                            fillStyle = `hsl(${node.color / 255 * 359} 100 50)`;
                        break;
                    case 'diet':
                        const carnivority = node.diet * 110 + 128;
                        fillStyle = `rgb(${node.diet[0] * 180 + 40}, ${node.diet[1] * 180 + 40}, ${node.diet[2] * 200 + 40})`;
                        break;
                }
            }

            const addDetails =
                view.nodeDetails
                && zoom > SHOW_DETAILS_AT_ZOOM
                && node.type === 'active';

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
                    case 1: endCoords = [node.x + 1,   node.y      ]; break;
                    case 2: endCoords = [node.x + 0.5, node.y      ]; break;
                    case 3: endCoords = [node.x,       node.y      ]; break;
                    case 4: endCoords = [node.x,       node.y + 0.5]; break;
                    case 5: endCoords = [node.x,       node.y + 1  ]; break;
                    case 6: endCoords = [node.x + 0.5, node.y + 1  ]; break;
                    case 7: endCoords = [node.x + 1,   node.y + 1  ]; break;
                    default: endCoords = [0, 0];
                }
                drawLine(node.x + 0.5, node.y + 0.5, ...endCoords);
            }
        }
    }
}

let alreadyPaused = false;
let alreadyStepped = false;

/**
 * Main loop.
 * @param {LifeSimulator} simulator 
 */
function loop() {
    if (keys[keyBindings['moveCamWest']]) view.cameraPos[0] -= CAMERA_SPEED;
    if (keys[keyBindings['moveCamEast']]) view.cameraPos[0] += CAMERA_SPEED;
    if (keys[keyBindings['moveCamNorth']]) view.cameraPos[1] -= CAMERA_SPEED;
    if (keys[keyBindings['moveCamSouth']]) view.cameraPos[1] += CAMERA_SPEED;
    if (keys[keyBindings['zoomIn']]) view.zoom = Math.min(view.zoom + 1, MAX_ZOOM);
    if (keys[keyBindings['zoomOut']]) view.zoom = Math.max(view.zoom - 1, MIN_ZOOM);

    if (keys[keyBindings['resetView']]) {
        resetView();
    }

    if (keys[keyBindings['pause']]) {
        if (!alreadyPaused) {
            paused = !paused;
            alreadyPaused = true;
        }
    } else {
        alreadyPaused = false;
    }

    if (keys[keyBindings['fastForward']]) {
        for (let i = 0; i < 50; i++) {
            simulator.stepWorld();
        }
    } else if (!paused) {
        simulator.stepWorld();
    } else {
        if (keys[keyBindings['stepOnce']]) {
            if (!alreadyStepped) {
                simulator.stepWorld();
                alreadyStepped = true;
            }
        } else {
            alreadyStepped = false;
        }
    }

    renderer.updateView(view);
    renderer.render();

    updateGameStateDisplay();
    updateNodeInsightDisplay(worldState);

    requestAnimationFrame(() => loop());
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
    loop();
}

main();
