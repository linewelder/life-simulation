import { randint } from "./util.js";

export const config = {
    GRID_W: 250,
    GRID_H: 150,
    START_NODE_NUM: 128,
    MAX_NODE_NUM: 1024,
    GENOME_LENGTH: 64,
    MUTATION_RATE: 0.25,
    NODE_MAX_AGE: 512,
    NODE_MAX_ENERGY: 256,
    NODE_START_ENERGY: 100,
    SUN_AMOUNT: 20,
    DEAD_NODE_ENERGY: 20,
    SPAWN_RANDOM_NODES: false,
    STARTING_GENOME: [
        70, 70, 70, 70, 70, 70, 70, 70,
        70, 70, 70, 70, 70, 70, 70, 70,
        70, 70, 70, 70, 70, 70, 70, 70,
        70, 70, 70, 70, 70, 70, 70, 70,
        70, 70, 70, 70, 70, 70, 70, 70,
        70, 70, 70, 70, 70, 70, 70, 70,
        70, 70, 70, 70, 70, 70, 70, 70,
        70, 70, 70, 70, 70, 70, 70, 69,
    ],
    RELATIVE_THRESHOLD: 2,
};

const GENE_NUM = 79;
const DIET_CHANGE_RATE = 0.05;

function mutateGenome(genome) {
    const newGenome = genome.slice();
    if (Math.random() < config.MUTATION_RATE) {
        newGenome[randint(0, newGenome.length)] = randint(0, GENE_NUM);
    }
    return newGenome;
}

function getColorForGenome(genome) {
    const sum = genome.reduce((sum, x) => sum + x / GENE_NUM, 0);
    const hue = sum / config.GENOME_LENGTH * 360;
  
    return `hsl(${hue} 100 50)`;
}

/**
 * @typedef {number[]} Genome
 */

/**
 * Compare two genomes
 * @param {Genome} a 
 * @param {Genome} b 
 * @returns The number of different genes
 */
function compareGenomes(a, b) {
    let differenceCount = 0;
    for (let i = 0; i < Math.min(a.length, b.length); i++) {
        if (a[i] !== b[i]) {
            differenceCount++;
        }
    }

    return differenceCount
}

let currentWorld = new Array(config.GRID_W * config.GRID_H).fill(null);
let nextWorld = new Array(config.GRID_W * config.GRID_H).fill(null);
let activeNodeNum = 0;
let gameStep = 0;

/**
 * Convert an unbound X coordinate (might be < 0 or >= world width)
 * to the real coordinate (>= 0 and < world width).
 * @param {number} x
 * @returns {number} 
 */
function normalizeX(x) {
    return (x + config.GRID_W) % config.GRID_W;
}

export function getNodeAt(x, y) {
    const normalizedX = normalizeX(x);
    return nextWorld[normalizedX * config.GRID_H + y];
}

function setNodeAt(x, y, node) {
    if (getNodeAt(x, y)?.type === 'active') {
        activeNodeNum--;
    }
    if (node?.type === 'active') {
        activeNodeNum++;
    }

    const normalizedX = normalizeX(x);
    nextWorld[normalizedX * config.GRID_H + y] = node;
}

function tryMoveNodeTo(node, x, y) {
    if (!areCorrectCoords(x, y) || getNodeAt(x, y)) {
        return;
    }

    setNodeAt(node.x, node.y, null);
    setNodeAt(x, y, node);
    node.x = normalizeX(x);
    node.y = y;

    if (node.type === 'active') {
        node.energy--;
    }
}

function areCorrectCoords(x, y) {
    return y >= 0 && y < config.GRID_H;
}

function spawnNode(x, y, genome, energy) {
    if (!areCorrectCoords(x, y)) return;

    setNodeAt(x, y, {
        type: 'active',
        genome: genome,
        color: getColorForGenome(genome),
        x: normalizeX(x),
        y: y,
        direction: 0, // 0 - east, 1 - north, 2 - west, 3 - south
        energy: energy,
        age: 0,
        currentGene: 0,
        diet: 0,
    });
}

export function spawnFood(x, y) {
    if (!areCorrectCoords(x, y)) return;

    setNodeAt(x, y, {
        type: 'food',
        x: normalizeX(x),
        y: y,
        energy: config.DEAD_NODE_ENERGY,
    });
}

function spawnRandomNode() {
    let x, y;
    do {
        x = randint(0, config.GRID_W);
        y = randint(0, config.SUN_AMOUNT);
    } while (getNodeAt(x, y)?.type === 'active');

    let genome = mutateGenome(config.STARTING_GENOME);
    spawnNode(x, y, genome, config.NODE_START_ENERGY);
}

export function reset() {
    gameStep = 0;
    activeNodeNum = 0;

    nextWorld.fill(null);
    for (let i = 0; i < config.START_NODE_NUM; i++) {
        spawnRandomNode();
    }

    currentWorld = Array.from(nextWorld);
}

export function getGameStep() {
    return gameStep;
}

export function getActiveNodeNum() {
    return activeNodeNum;
}

export function getWorldState() {
    return currentWorld;
}

export function getSunAmountAt(y) {
    return Math.max(Math.floor(config.SUN_AMOUNT - y / 2), 0);
}

function spawnChildNode(parent, x, y) {
    if (!areCorrectCoords(x, y)) return;
    if (getNodeAt(x, y)) return;

    const halfEnergy = Math.floor((parent.energy - config.DEAD_NODE_ENERGY) / 2);
    if (halfEnergy <= 0) return;

    const genome = mutateGenome(parent.genome);
    spawnNode(x, y, genome, halfEnergy);
    parent.energy = halfEnergy;
}

export function killNode(node) {
    if (node.type !== 'active') return;

    spawnFood(node.x, node.y);

    if (config.SPAWN_RANDOM_NODES && activeNodeNum < config.START_NODE_NUM) {
        spawnRandomNode();
    }
}

export function findNodeWithMostEnergyIn(fromX, fromY, toX, toY, thisNode) {
    fromX = Math.max(0, fromX);
    fromY = Math.max(0, fromY);
    toX = Math.min(config.GRID_W - 1, toX);
    toY = Math.min(config.GRID_H - 1, toY);

    let mostEnergy = null;

    for (let x = fromX; x <= toX; x++) {
        for (let y = fromY; y <= toY; y++) {
            const node = getNodeAt(x, y);
            if (!node || node === thisNode) continue;

            if (node.energy > mostEnergy) {
                mostEnergy = node;
            }
        }
    }

    return mostEnergy;
}

function eatAt(node, x, y) {
    let attackedNode = getNodeAt(x, y);
    if (attackedNode) {
        killNode(attackedNode);
        node.energy += attackedNode.energy;
        node.diet = Math.min(1, node.diet + DIET_CHANGE_RATE);
    }
}

function getCoordsInDirection(x, y, direction) {
    switch (direction) {
        case 0: return [x + 1, y    ];
        case 1: return [x,     y - 1];
        case 2: return [x - 1, y    ];
        case 3: return [x,     y + 1];
        default: throw `Unkown direction: ${direction}`;
    }
}

function stepNode(node) {
    let gene = node.genome[node.currentGene];
    let genomeStep = 1;

    switch (gene) {
        case 64: // Move Forward
            tryMoveNodeTo(node, ...getCoordsInDirection(node.x, node.y, node.direction));
            break;

        case 65: // Turn Counter-clockwise
            node.direction = (node.direction + 1) % 4;
            break;

        case 66: // Turn Clockwise
            node.direction = (node.direction + 3) % 4;
            break;
        
        case 67: // Eat Forward
            eatAt(node, ...getCoordsInDirection(node.x, node.y, node.direction));
            break;

        case 68: // Reproduce Forward
            spawnChildNode(node, ...getCoordsInDirection(node.x, node.y, node.direction));
            break;

        case 69: // Reproduce Backward
            spawnChildNode(node, ...getCoordsInDirection(node.x, node.y, (2 + node.direction) % 4));
            break;
        
        case 70: // Photosynthesise
            const sunAmount = getSunAmountAt(node.y);
            if (sunAmount > 0) {
                node.energy += getSunAmountAt(node.y);
                node.diet = Math.max(-1, node.diet - DIET_CHANGE_RATE);
            }
            break;

        case 71: // Check Forward
            const coordsForward = getCoordsInDirection(node.x, node.y, node.direction);
            if (!areCorrectCoords(...coordsForward)) {
                genomeStep = 5;
                break;
            }

            const nodeInFront = getNodeAt(...coordsForward);
            if (nodeInFront === null) {
                genomeStep = 4;
            } else if (nodeInFront.type === 'active') {
                if (compareGenomes(node.genome, nodeInFront.genome) <= config.RELATIVE_THRESHOLD) {
                    genomeStep = 1;
                } else {
                    genomeStep = 2;
                }
            } else if (nodeInFront.type === 'food') {
                genomeStep = 3;
            }
            break;

        case 72: // Check Energy
            if (node.energy > 100) {
                genomeStep = 1;
            } else {
                genomeStep = 2;
            }
            break;

        default:
            if (gene < config.GENOME_LENGTH && gene != 0) {
                genomeStep = gene;
            }
            break;
    }

    node.currentGene = (node.currentGene + genomeStep) % config.GENOME_LENGTH;
    
    node.energy --;
    if (node.energy > config.NODE_MAX_ENERGY) {
        node.energy = config.NODE_MAX_ENERGY;
    }

    node.age ++;
    if (node.energy <= 0 || node.age > config.NODE_MAX_AGE) {
        killNode(node);
    }
}

function stepFood(node) {
    tryMoveNodeTo(node, node.x, node.y + 1);
}

export function stepGame() {
    for (let node of currentWorld) {
        if (!node) continue;

        if (node.type === 'active') {
            stepNode(node);
        } else if (node.type === 'food') {
            stepFood(node);
        }
    }

    gameStep++;
    currentWorld = Array.from(nextWorld);
}
