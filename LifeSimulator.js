/**
 * @file Main simulation logic.
 */

import { GENES, NUMBER_OF_GENES } from './genes.js';
import { getBits, randint, setBits, uint32SizeToBytes } from './util.js';
import { loadShader } from './util/wgslPreprocessor.js';

/**
 * @typedef {Object} FoodNode
 * @prop {string} type Kind (see NODE_KINDS)
 * @prop {number} energy
 * @prop {number} x
 * @prop {number} y
 */

/**
 * @typedef {Object} ActiveNode
 * @prop {string} type Kind (see NODE_KINDS)
 * @prop {number} energy
 * @prop {number} x
 * @prop {number} y
 * @prop {number} direction 0 - east, 1 - north, 2 - west, 3 - south
 * @prop {number} age
 * @prop {number} minerals
 * @prop {number} color Color hash based on the genome
 * @prop {[number, number, number]} diet
 * @prop {number} currentGene
 * @prop {number[]} genome Looped sequence of commands
 */

const NODE_KINDS = [
    'air',
    'wall',
    'food',
    'active',
];

/*
Encoded Node Structure

            Byte    
Uint32      Offset  Bits       Property
----------------------------------------------
props0      0       ---- -000  Kind
                    --00 0---  Direction
                    00-- ----  Diet Eating
            1       0000 0000  Age (bits 0-7)
            2       0000 0000  Energy
            3       ---- 0000  Minerals
                    --00 ----  Diet Photosynthesis
                    00-- ----  Diet Minerals
props1      0       0000 0000  Color
            1       ---- ----  [empty]
            2       ---- ----  [empty]
            3       --00 0000  Current Gene
                    -0-- ----  Age (bit 8)
genome[0]   0       0000 0000  Gene 0
...         ...     ...        ...
genome[15]  0       0000 0000  Gene 60
            1       0000 0000  Gene 61
            2       0000 0000  Gene 62
            3       0000 0000  Gene 63
*/

/**
 * Size of an encoded config in uint32's. Used in WebGPU buffers.
 */
const CONFIG_SIZE_UINT32 = 14;

/**
 * Size of an encoded node in uint32's. Used in WebGPU buffers.
 */
const NODE_SIZE_UINT32 = 18;

/**
 * Size of a compute shader work group.
 * Recommended size is 64.
 */
const WORKGROUP_SIZE = [8, 8, 1];

/**
 * Defined symbols passed to the WGSL preprocessor.
 */
const SHADER_DEFINED_SYMBOLS = {
    WORKGROUP_SIZE: WORKGROUP_SIZE,
    ...Object.fromEntries(
        Object.entries(GENES)
            .map(([internalName, gene]) => [internalName, gene.value])
    ),
    NUM_GENES: NUMBER_OF_GENES,
};

/**
 * Main game class.
 */
export class LifeSimulator {
    /**
     * @type {GPUDevice}
     */
    #device;

    /**
     * @type {GPUComputePipeline}
     */
    #pipeline;

    /**
     * World configuration and game rules.
     * @type {Object}
     */
    #config;

    /**
     * World step counter.
     * @type {number}
     */
    #currentStep;

    /**
     * Stores the current config.
     * @type {GPUBuffer}
     */
    #configBuffer;

    /**
     * Used as the input to the compute shader, so that every thread
     * sees the same world picture independently from others.
     * 
     * At the beginning of a step is filled by the current world data,
     * while all the changes are applied to #nextWorldBuffer.
     * @type {GPUBuffer}
     */
    #lastWorldBuffer;

    /**
     * World data at the end of a step. The shader writes changes here.
     * 
     * At the beginning of a step, the contents are copied
     * to #lastWorldBuffer.
     * @type {GPUBuffer}
     */
    #nextWorldBuffer;

    /**
     * Used for reading world data back to CPU. Has space for one node.
     * @type {GPUBuffer}
     */
    #worldReadBuffer;

    /**
     * Stores the last random number for each grid cell.
     * @type {GPUBuffer}
     */
    #randomStateBuffer;

    /**
     * Bind group for all compute shader resources.
     * @type {GPUBindGroup}
     */
    #bindGroup;

    /**
     * DO NOT CALL DIRECTLY. USE LifeSimulator.create()
     */
    constructor(device, stepWorldShader) {
        this.#device = device;
        this.#pipeline = this.#createPipeline(device, stepWorldShader);

        this.#config = {
            WORLD_SIZE: [250, 120],
            START_NODE_NUM: 128,
            MAX_NODE_NUM: 1024,
            GENOME_LENGTH: 64,
            MUTATION_RATE: 0.25,
            NODE_MAX_AGE: 511,
            NODE_MAX_ENERGY: 255,
            NODE_MAX_MINERALS: 8,
            MINERAL_ENERGY: 5,
            NODE_START_ENERGY: 100,
            SUN_AMOUNT: 10,
            SUN_LEVEL_HEIGHT: 4,
            MINERAL_AMOUNT: 4,
            MINERAL_LEVEL_HEIGHT: 16,
            REPRODUCTION_COST: 100,
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
            PREDATOR_DEFENSE: 0.1,
            FOOD_GROUND_LEVEL: 57,
        };

        this.#createGpuStructures(this.#config.WORLD_SIZE);
        this.#updateConfig();
    }

    /**
     * Create an instance of LifeSimulator.
     * @param {GPUDevice} device
     */
    static async create(device) {
        return new LifeSimulator(
            device,
            await loadShader('/shaders/stepWorld.wgsl', SHADER_DEFINED_SYMBOLS),
        );
    }

    #createPipeline(device, stepWorldShader) {
        const module = device.createShaderModule({
            label: 'Step Node',
            code: stepWorldShader,
        });

        return device.createComputePipeline({
            label: 'Life Simulator',
            layout: 'auto',
            compute: {
                module,
            },
        });
    }

    /**
     * Create or recreate buffers for storing and reading world data.
     */
    #createGpuStructures() {
        const totalWorldSize = this.#config.WORLD_SIZE[0] * this.#config.WORLD_SIZE[1];
        const size = totalWorldSize * uint32SizeToBytes(NODE_SIZE_UINT32);
        
        this.#lastWorldBuffer?.destroy();
        this.#nextWorldBuffer?.destroy();
        this.#worldReadBuffer?.destroy();
        this.#bindGroup?.destroy();

        if (!this.#configBuffer) {
            this.#configBuffer = this.#device.createBuffer({
                label: 'Config',
                size: uint32SizeToBytes(CONFIG_SIZE_UINT32),
                usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
            });
        }

        if (!this.#worldReadBuffer) {
            this.#worldReadBuffer = this.#device.createBuffer({
                label: 'Read Buffer for getNodeAt',
                size: uint32SizeToBytes(NODE_SIZE_UINT32),
                usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
            });
        }

        this.#lastWorldBuffer = this.#device.createBuffer({
            label: 'Last World Data',
            size: size,
            usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST,
        });

        this.#nextWorldBuffer = this.#device.createBuffer({
            label: 'Next World Data',
            size: size,
            usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST,
        });

        this.#randomStateBuffer = this.#device.createBuffer({
            label: 'Random State',
            size: uint32SizeToBytes(totalWorldSize),
            usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
        });

        this.#initRandomStateBuffer();

        this.#bindGroup = this.#device.createBindGroup({
            label: 'Life Simulator Bind Group',
            layout: this.#pipeline.getBindGroupLayout(0),
            entries: [
                { binding: 0, resource: { buffer: this.#configBuffer } },
                { binding: 1, resource: { buffer: this.#lastWorldBuffer } },
                { binding: 2, resource: { buffer: this.#nextWorldBuffer } },
                { binding: 3, resource: { buffer: this.#randomStateBuffer } },
            ],
        });
    }

    #initRandomStateBuffer() {
        const randomState = new Uint32Array(this.#config.WORLD_SIZE[0] * this.#config.WORLD_SIZE[1]);
        for (let i = 0; i < randomState.length; i++) {
            randomState.set([Math.floor(Math.random() * 0xffffffff)], i);
        }
        this.#device.queue.writeBuffer(this.#randomStateBuffer, 0, randomState);
    }

    /**
     * Reset state of the world. Or initialize a newly created one.
     */
    resetWorld() {
        this.#currentStep = 0;

        const worldData = new Uint32Array(this.#config.WORLD_SIZE[0] * this.#config.WORLD_SIZE[1] * NODE_SIZE_UINT32);
        for (let i = 0; i < this.#config.START_NODE_NUM; i++) {
            let x = randint(0, this.#config.WORLD_SIZE[0]);
            let y = randint(0, Math.floor(this.#config.SUN_AMOUNT * this.#config.SUN_LEVEL_HEIGHT));

            const genome = this.#config.STARTING_GENOME;

            const node = {
                type: 'active',
                genome: genome,
                color: 0,
                x: x,
                y: y,
                direction: 0, // 0 - east, 1 - north, 2 - west, 3 - south
                energy: this.#config.NODE_START_ENERGY,
                age: 0,
                currentGene: 0,
                diet: [0, 0, 0],
                minerals: 0,
            };

            const data = this.#encodeActiveNode(node);
            worldData.set(data, this.#coordsToIndex(x, y) * NODE_SIZE_UINT32);
        }

        this.#device.queue.writeBuffer(this.#lastWorldBuffer, 0, worldData);
        this.#device.queue.writeBuffer(this.#nextWorldBuffer, 0, worldData);
    }

    /**
     * Do a single simulation step
     */
    stepWorld() {
        const encoder = this.#device.createCommandEncoder({
            label: 'Life Simulator',
        });

        encoder.copyBufferToBuffer(
            this.#nextWorldBuffer, 0,
            this.#lastWorldBuffer, 0,
            this.#lastWorldBuffer.size,
        );

        const pass = encoder.beginComputePass({
            label: 'Life Simulator Compute Pass',
        });
        pass.setPipeline(this.#pipeline);
        pass.setBindGroup(0, this.#bindGroup);
        pass.dispatchWorkgroups(
            Math.ceil(this.#config.WORLD_SIZE[0] / WORKGROUP_SIZE[0]),
            Math.ceil(this.#config.WORLD_SIZE[1] / WORKGROUP_SIZE[1]),
            WORKGROUP_SIZE[2],
        );
        pass.end();
    
        const commandBuffer = encoder.finish();
        this.#device.queue.submit([commandBuffer]);

        this.#currentStep++;
    }

    /**
     * Number of calls to stepWorld().
     */
    get currentStep() { 
        return this.#currentStep;
    }

    /**
     * Number of active nodes in the world.
     */
    get activeNodeNum() {
        return 0;
    }

    /**
     * Get current config.
     */
    get config() {
        return this.#config;
    }

    /**
     * Get GPU buffer with config.
     */
    get configBuffer() {
        return this.#configBuffer;
    }

    /**
     * Get GPU buffer with current world state.
     */
    get worldStateBuffer() {
        return this.#nextWorldBuffer;
    }

    /**
     * Get the level of sunlight at the specified Y coordinate.
     * @param {number} y 
     */
    getSunAmountAt(y) {
        return Math.max(
            this.#config.SUN_AMOUNT - Math.floor(y / this.#config.SUN_LEVEL_HEIGHT),
            0
        );
    }

    /**
     * Get the amount of minerals at the specified Y coordinate.
     * @param {number} y 
     */
    getMineralAmountAt(y) {
        return Math.max(
            this.#config.MINERAL_AMOUNT - Math.floor((this.#config.GRID_H - 1 - y) / this.#config.MINERAL_LEVEL_HEIGHT),
            0
        );
    }

    /**
     * Get node at the specified coords.
     * @param {number} x 
     * @param {number} y 
     * @returns 
     */
    async getNodeAt(x, y) {
        const nodeSizeBytes = uint32SizeToBytes(NODE_SIZE_UINT32)
        const index = this.#coordsToIndex(x, y) * nodeSizeBytes;

        const encoder = this.#device.createCommandEncoder({
            label: 'Life Simulator - Read Node Info',
        });

        encoder.copyBufferToBuffer(
            this.#nextWorldBuffer, index,
            this.#worldReadBuffer, 0,
            nodeSizeBytes,
        );

        const commandBuffer = encoder.finish();
        this.#device.queue.submit([commandBuffer]);

        await this.#worldReadBuffer.mapAsync(GPUMapMode.READ);
        const worldData = new Uint32Array(this.#worldReadBuffer.getMappedRange().slice());
        this.#worldReadBuffer.unmap();

        return this.#decodeNode(worldData, x, y);
    }

    /**
     * Check whether the given coords are within the world's boundaries.
     * @param {number} x 
     * @param {number} y 
     * @returns {boolean}
     */
    areCorrectCoords(x, y) {
        return x >= 0 && x < this.#config.WORLD_SIZE[0]
            && y >= 0 && y < this.#config.WORLD_SIZE[1];
    }

    #coordsToIndex(x, y) {
        return x * this.#config.WORLD_SIZE[1] + y;
    }

    /**
     * Decode node data to a regular structure.
     * @param {number[]} data
     * @returns {FoodNode | ActiveNode | null}
     */
    #decodeNode(data, x, y) {
        const kind = NODE_KINDS[getBits(data[0], 0,  3)];

        switch (kind) {
            case 'air':
                return null;

            case 'wall':
                return null;

            case 'food':
                return {
                    type:      kind,
                    energy:    getBits(data[0], 16, 8),
                    x:         x,
                    y:         y,
                };
            
            case 'active':
                return {
                    type:      kind,
                    energy:    getBits(data[0], 16, 8),
                    x:         x,
                    y:         y,
                    direction: getBits(data[0], 3,  3),
                    age:       (getBits(data[1], 30, 1) << 8) | getBits(data[0], 8,  8),
                    minerals:  getBits(data[0], 24, 4),
                    color:     getBits(data[1], 0,  8),
                    diet: [
                        getBits(data[0], 6,  2) / 3,
                        getBits(data[0], 28, 2) / 3,
                        getBits(data[0], 30, 2) / 3,
                    ],
                    currentGene: getBits(data[1], 24, 6),
                    genome: Array.from(data.slice(2)).flatMap(x => [
                        getBits(x, 0,  8),
                        getBits(x, 8,  8),
                        getBits(x, 16, 8),
                        getBits(x, 24, 8),
                    ]),
                };
        }
    }

    /**
     * Encode node data to the buffer representation.
     * @param {ActiveNode} node
     * @returns {number[]}
     */
    #encodeActiveNode(node) {
        const result = new Array(NODE_SIZE_UINT32).fill(0);

        result[0] = setBits(result[0], 0,  3, NODE_KINDS.indexOf(node.type));
        result[0] = setBits(result[0], 3,  3, node.direction);
        result[0] = setBits(result[0], 6,  2, Math.floor(node.diet[0] * 3));
        result[0] = setBits(result[0], 8,  8, getBits(node.age, 0, 8));
        result[0] = setBits(result[0], 16, 8, node.energy);
        result[0] = setBits(result[0], 24, 4, node.minerals);
        result[0] = setBits(result[0], 28, 2, Math.floor(node.diet[1] * 3));
        result[0] = setBits(result[0], 30, 2, Math.floor(node.diet[2] * 3));

        result[1] = setBits(result[1], 0,  8, node.color);
        result[1] = setBits(result[1], 24, 6, node.currentGene);
        result[1] = setBits(result[1], 30, 1, getBits(node.age, 8, 1));

        node.genome.forEach((gene, index) => {
            const resultIx = Math.floor(index / 4) + 2;
            const offset = index % 4 * 8;
            result[resultIx] = setBits(result[resultIx], offset, 8, gene);
        });

        return result;
    }

    #updateConfig() {
        const configData = new Uint32Array(CONFIG_SIZE_UINT32);
        configData.set([
            this.#config.WORLD_SIZE[0],
            this.#config.WORLD_SIZE[1],
            this.#config.NODE_MAX_AGE,
            this.#config.NODE_MAX_ENERGY,
            this.#config.NODE_MAX_MINERALS,
            this.#config.MINERAL_ENERGY,
            this.#config.SUN_AMOUNT,
            this.#config.SUN_LEVEL_HEIGHT,
            this.#config.MINERAL_AMOUNT,
            this.#config.MINERAL_LEVEL_HEIGHT,
            this.#config.RELATIVE_THRESHOLD,
            this.#config.REPRODUCTION_COST,
            Math.floor(this.#config.MUTATION_RATE * 100),
        ], 0)
        this.#device.queue.writeBuffer(this.#configBuffer, 0, configData);
    }

    setConfig(name, value) {
        this.#config[name] = value;
        this.#updateConfig();
    }
}

/**
 * WebGPU device.
 * @typedef {Object} GPUDevice 
 */

/**
 * WebGPU buffer.
 * @typedef {Object} GPUBuffer 
 */

/**
 * WebGPU compute pipeline.
 * @typedef {Object} GPUComputePipeline
 */

/**
 * WebGPU bind group.
 * @typedef {Object} GPUBindGroup
 */
