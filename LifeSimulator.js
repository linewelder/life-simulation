/**
 * @file Main simulation logic.
 */

import { getBits, randint, setBits } from './util.js';
import { config } from './life.js';
import { loadShader } from './lib/wgslPreprocessor.js';

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
 * @prop {[number, number, number]} color Color hash based on the genome
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
props0      0       ---- 0000  Kind
                    --00 ----  Direction
                    00-- ----  Diet Eating
            1       0000 0000  Age
            2       0000 0000  Energy
            3       ---- 0000  Minerals
                    --00 ----  Diet Photosynthesis
                    00-- ----  Diet Minerals
props1      0       0000 0000  Color R
            1       0000 0000  Color G
            2       0000 0000  Color B
            3       0000 0000  Current Gene
genome[0]   0       0000 0000  Gene 0
...         ...     ...        ...
genome[15]  0       0000 0000  Gene 60
            1       0000 0000  Gene 61
            2       0000 0000  Gene 62
            3       0000 0000  Gene 63
*/

/**
 * Default world size.
 * @type {[number, number]}
 */
export const WORLD_SIZE = [250, 120];

/**
 * Size of an encoded config in uint32's. Used in WebGPU buffers.
 */
const CONFIG_SIZE_UINT32 = 14;

/**
 * Size of an encoded config in bytes. Used in WebGPU buffers.
 */
const CONFIG_SIZE_BYTES = CONFIG_SIZE_UINT32 * 4;

/**
 * Size of an encoded node in uint32's. Used in WebGPU buffers.
 */
const NODE_SIZE_UINT32 = 18;

/**
 * Size of an encoded node in bytes. Used in WebGPU buffers.
 */
const NODE_SIZE_BYTES = NODE_SIZE_UINT32 * 4;

/**
 * Size of a compute shader work group.
 * Recommended size is 64.
 */
const WORKGROUP_SIZE = [8, 8, 1];

const GENE_NUM = 74;

const SHADER_DEFINED_SYMBOLS = {
    WORKGROUP_SIZE: WORKGROUP_SIZE,
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
     * Current size of the world grid.
     * @type {[number, number]}
     */
    #worldSize;

    /**
     * World step counter.
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
     * Used for reading world data back to CPU.
     * @type {GPUBuffer}
     */
    #worldReadBuffer;

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
        this.#createGpuStructures(WORLD_SIZE);
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
     * @param {[number, number]} worldSize Size of the world grid.
     */
    #createGpuStructures(worldSize) {
        const size = worldSize[0] * worldSize[1] * NODE_SIZE_BYTES;
        
        this.#lastWorldBuffer?.destroy();
        this.#nextWorldBuffer?.destroy();
        this.#worldReadBuffer?.destroy();
        this.#bindGroup?.destroy();

        this.#worldSize = worldSize;

        if (!this.#configBuffer) {
            this.#configBuffer = this.#device.createBuffer({
                label: 'Config',
                size: CONFIG_SIZE_BYTES,
                usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
            });
        }

        this.#updateConfig(config);

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

        this.#worldReadBuffer = this.#device.createBuffer({
            label: 'Read Buffer for World Data',
            size: size,
            usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
        });

        this.#bindGroup = this.#device.createBindGroup({
            label: 'Life Simulator Bind Group',
            layout: this.#pipeline.getBindGroupLayout(0),
            entries: [
                { binding: 0, resource: { buffer: this.#configBuffer } },
                { binding: 1, resource: { buffer: this.#lastWorldBuffer } },
                { binding: 2, resource: { buffer: this.#nextWorldBuffer } },
            ],
        });
    }

    /**
     * Reset state of the world. Or initialize a newly created one.
     */
    resetWorld() {
        this.#currentStep = 0;

        const worldData = new Uint32Array(WORLD_SIZE[0] * WORLD_SIZE[1] * NODE_SIZE_UINT32);
        for (let i = 0; i < config.START_NODE_NUM; i++) {
            let x = randint(0, WORLD_SIZE[0]);
            let y = randint(0, Math.floor(config.SUN_AMOUNT * config.SUN_LEVEL_HEIGHT));

            const genome = config.STARTING_GENOME;

            const node = {
                type: 'active',
                genome: genome,
                color: [255, 255, 255],
                x: x,
                y: y,
                direction: 0, // 0 - east, 1 - north, 2 - west, 3 - south
                energy: config.NODE_START_ENERGY,
                age: 0,
                currentGene: 0,
                diet: [0, 0, 0],
                minerals: 0,
            };

            const data = this.#encodeActiveNode(node);
            worldData.set(data, (x * WORLD_SIZE[1] + y) * NODE_SIZE_UINT32);
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
            Math.ceil(this.#worldSize[0] / WORKGROUP_SIZE[0]),
            Math.ceil(this.#worldSize[1] / WORKGROUP_SIZE[1]),
            WORKGROUP_SIZE[2],
        );
        pass.end();
    
        const commandBuffer = encoder.finish();
        this.#device.queue.submit([commandBuffer]);

        this.#currentStep++;
    }

    /**
     * Fetch world state from the GPU.
     */
    async readWorldState() {
        const encoder = this.#device.createCommandEncoder({
            label: 'Life Simulator - Read World State',
        });

        encoder.copyBufferToBuffer(
            this.#nextWorldBuffer, 0,
            this.#worldReadBuffer, 0,
            this.#worldReadBuffer.size,
        );

        const commandBuffer = encoder.finish();
        this.#device.queue.submit([commandBuffer]);

        // Read the new world state.
        await this.#worldReadBuffer.mapAsync(GPUMapMode.READ);
        const worldData = new Uint32Array(this.#worldReadBuffer.getMappedRange().slice());
        this.#worldReadBuffer.unmap();

        return this.#decodeWorldData(worldData);
    }

    /**
     * Number of calls to stepWorld().
     */
    get currentStep() { 
        return this.#currentStep;
    }

    /**
     * Decode world data from buffer data to regular structures.
     * @param {Uint32Array} data
     * @returns {(FoodNode | ActiveNode | null)[]}
     */
    #decodeWorldData(data) {
        const world = new Array(this.#worldSize[0] * this.#worldSize[1]);

        let worldOffset = 0;
        let offset = 0;
        for (let x = 0; x < this.#worldSize[0]; x++) {
            for (let y = 0; y < this.#worldSize[1]; y++) {
                const slice = data.slice(offset, offset + NODE_SIZE_UINT32);
                const node = this.#decodeNode(slice, x, y);
                world[worldOffset] = node;
                offset += NODE_SIZE_UINT32;
                worldOffset++;
            }
        }

        return world;
    }

    /**
     * Decode node data to a regular structure.
     * @param {number[]} data
     * @returns {FoodNode | ActiveNode | null}
     */
    #decodeNode(data, x, y) {
        const kind = NODE_KINDS[getBits(data[0], 0,  4)];

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
                    direction: getBits(data[0], 4,  2),
                    age:       getBits(data[0], 8,  8),
                    minerals:  getBits(data[0], 24, 8),
                    color: [
                        getBits(data[1], 0,  8),
                        getBits(data[1], 8,  8),
                        getBits(data[1], 16, 8),
                    ],
                    diet: [
                        getBits(data[0], 6,  2) / 3,
                        getBits(data[0], 28, 2) / 3,
                        getBits(data[0], 30, 2) / 3,
                    ],
                    currentGene: getBits(data[1], 24, 8),
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

        result[0] = setBits(result[0], 0,  4, NODE_KINDS.indexOf(node.type));
        result[0] = setBits(result[0], 4,  2, node.direction);
        result[0] = setBits(result[0], 6,  2, Math.floor(node.diet[0] * 3));
        result[0] = setBits(result[0], 8,  8, node.age);
        result[0] = setBits(result[0], 16, 8, node.energy);
        result[0] = setBits(result[0], 24, 4, node.minerals);
        result[0] = setBits(result[0], 28, 2, Math.floor(node.diet[1] * 3));
        result[0] = setBits(result[0], 30, 2, Math.floor(node.diet[2] * 3));

        result[1] = setBits(result[1], 0,  8, node.color[0]);
        result[1] = setBits(result[1], 8,  8, node.color[1]);
        result[1] = setBits(result[1], 16, 8, node.color[2]);
        result[1] = setBits(result[1], 24, 8, node.currentGene);

        node.genome.forEach((gene, index) => {
            const resultIx = Math.floor(index / 4) + 2;
            const offset = index % 4 * 8;
            result[resultIx] = setBits(result[resultIx], offset, 8, gene);
        });

        return result;
    }

    #updateConfig(config) {
        const configData = new Uint32Array(CONFIG_SIZE_UINT32);
        configData.set([
            this.#worldSize[0],
            this.#worldSize[1],
            config.NODE_MAX_AGE,
            config.NODE_MAX_ENERGY,
            config.NODE_MAX_MINERALS,
            config.MINERAL_ENERGY,
            config.SUN_AMOUNT,
            config.SUN_LEVEL_HEIGHT,
            config.MINERAL_AMOUNT,
            config.MINERAL_LEVEL_HEIGHT,
            config.RELATIVE_THRESHOLD,
            config.REPRODUCTION_COST,
            Math.floor(config.MUTATION_RATE * 100),
        ], 0)
        this.#device.queue.writeBuffer(this.#configBuffer, 0, configData);
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
