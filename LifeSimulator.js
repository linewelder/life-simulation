/**
 * @file Main simulation logic.
 */

import { getBits, randint, setBits } from './util.js';
import { config } from './life.js';

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

/**
 * 2 dimensional vector.
 * @typedef {[number, number]} Vec2
 */

/**
 * Default world size.
 * @type {Vec2}
 */
export const WORLD_SIZE = [250, 120];

/**
 * Size of an encoded config. Used in WebGPU buffers.
 */
const CONFIG_SIZE_BYTES = 4 * 2;

/**
 * Size of an encoded node in bytes. Used in WebGPU buffers.
 */
const NODE_SIZE_BYTES = 18 * 4;

/**
 * Size of an encoded node in uint32's. Used in WebGPU buffers.
 */
const NODE_SIZE_UINT32 = 18;

/**
 * Size of a compute shader work group.
 * Recommended size is 64.
 */
const WORKGROUP_SIZE = [8, 8, 1];

const GENE_NUM = 74;

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
     * @type {Vec2}
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

    constructor(device) {
        this.#device = device;
        this.#pipeline = this.#createPipeline(device);
        this.#createGpuStructures(WORLD_SIZE);
    }

    #createPipeline(device) {
        const module = device.createShaderModule({
            label: 'Step Node',
            code: STEP_NODE_SHADER,
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
     * @param {Vec2} worldSize Size of the world grid.
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

        const configData = new Int32Array(2);
        configData.set(this.#worldSize, 0);
        this.#device.queue.writeBuffer(this.#configBuffer, 0, configData);

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
        for (let i = 0; i < 128; i++) {
            let x = randint(0, WORLD_SIZE[0]);
            let y = randint(0, WORLD_SIZE[1]);

            const genome = [
                64, 70, 70, 70, 70, 70, 70, 70,
                70, 70, 70, 70, 70, 70, 70, 70,
                70, 70, 70, 70, 70, 70, 70, 70,
                70, 70, 70, 70, 70, 70, 70, 70,
                70, 70, 70, 70, 70, 70, 70, 70,
                70, 70, 70, 70, 70, 70, 70, 70,
                70, 70, 70, 70, 70, 70, 70, 70,
                70, 70, 70, 70, 70, 70, 70, 70,
            ];

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
            this.#lastWorldBuffer, 0,
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
                world[offset] = node;
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
}

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

const STEP_NODE_SHADER = `
// enable chromium_experimental_subgroup_matrix;

struct Config {
    worldSize: vec2i,
}

struct PackedNode {
    props0: u32,
    props1: u32,
    genome: array<u32, 16>,
}

struct Node {
    kind: u32,
    direction: i32,
    age: u32,
    energy: u32,
    minerals: u32,
    diet: vec3u,
    color: vec3u,
    currentGene: u32,
    genome: array<u32, 64>,
}

const KIND_AIR:    u32 = 0x0;
const KIND_WALL:   u32 = 0x1;
const KIND_FOOD:   u32 = 0x2;
const KIND_ACTIVE: u32 = 0x3;

const NODE_AIR:  Node = Node();
const NODE_WALL: Node = Node(
    KIND_WALL,
    0,
    0u,
    0u,
    0u,
    vec3u(),
    vec3u(),
    0u,
    array<u32, 64>(),
);

const NODE_FOOD: Node = Node(
    KIND_FOOD,
    0,
    0u,
    50u,
    0u,
    vec3u(),
    vec3u(),
    0u,
    array<u32, 64>(),
);

fn getBits(value: u32, offset: u32, bits: u32) -> u32 {
    return (value >> offset) & ((1u << bits) - 1u);
}

fn setBits(original: u32, offset: u32, bits: u32, value: u32) -> u32 {
    let mask = ((1u << bits) - 1u) << offset;
    return (original & ~mask) | ((value << offset) & mask);
}

fn unpackNode(node: PackedNode) -> Node {
    var unpacked: Node;

    unpacked.kind        =     getBits(node.props0, 0,  4);
    unpacked.direction   = i32(getBits(node.props0, 4,  2));
    unpacked.age         =     getBits(node.props0, 8,  8);
    unpacked.energy      =     getBits(node.props0, 16, 8);
    unpacked.minerals    =     getBits(node.props0, 24, 4);

    unpacked.color = vec3u(
        getBits(node.props1, 0,  8),
        getBits(node.props1, 8,  8),
        getBits(node.props1, 16, 8),
    );

    unpacked.diet = vec3u(
        getBits(node.props0, 6,  2),
        getBits(node.props0, 28, 2),
        getBits(node.props0, 30, 2),
    );

    unpacked.currentGene = getBits(node.props1, 24, 8);

    // Each u32 in genome contains 4 genes (8 bits each), so 16 * 4 = 64 genes total.
    for (var i: u32 = 0u; i < 64u; i = i + 1u) {
        let word = node.genome[i / 4u];
        unpacked.genome[i] = getBits(word, (i % 4u) * 8u, 8u);
    }

    return unpacked;
}

fn packNode(unpacked: Node) -> PackedNode {
    var node: PackedNode;

    // Pack props0
    var props0: u32 = 0u;
    props0 = setBits(props0, 0u,  4u, unpacked.kind);
    props0 = setBits(props0, 4u,  2u, u32(unpacked.direction));
    props0 = setBits(props0, 6u,  2u, unpacked.diet.x);
    props0 = setBits(props0, 8u,  8u, unpacked.age);
    props0 = setBits(props0, 16u, 8u, unpacked.energy);
    props0 = setBits(props0, 24u, 8u, unpacked.minerals);
    props0 = setBits(props0, 28u, 2u, unpacked.diet.y);
    props0 = setBits(props0, 30u, 2u, unpacked.diet.z);

    // Pack props1
    var props1: u32 = 0u;
    props1 = setBits(props1, 0u,  8u, unpacked.color.r);
    props1 = setBits(props1, 8u,  8u, unpacked.color.g);
    props1 = setBits(props1, 16u, 8u, unpacked.color.b);
    props1 = setBits(props1, 24u, 8u, unpacked.currentGene);

    // Pack genome (64 genes into 16 u32s, 4 genes per u32)
    var packedGenome: array<u32, 16>;
    for (var i: u32 = 0u; i < 64u; i = i + 1u) {
        let wordIndex = i / 4u;
        let offset = (i % 4u) * 8u;
        packedGenome[wordIndex] = setBits(packedGenome[wordIndex], offset, 8u, unpacked.genome[i]);
    }

    node.props0 = props0;
    node.props1 = props1;
    node.genome = packedGenome;

    return node;
}

@group(0) @binding(0) var<storage> config: Config;
@group(0) @binding(1) var<storage, read> lastWorld: array<PackedNode>;
@group(0) @binding(2) var<storage, read_write> nextWorld: array<PackedNode>;

fn getNodeAt(pos: vec2i) -> Node {
    if pos.y < 0 || pos.y >= config.worldSize.y {
        return NODE_WALL;
    }

    let packedNode = lastWorld[pos.x * config.worldSize.y + pos.y];
    return unpackNode(packedNode);
}

fn setNodeAt(pos: vec2i, node: Node) {
    nextWorld[pos.x * config.worldSize.y + pos.y] = packNode(node);
}

fn stepFood(pos: vec2i, node: Node) {
    if getNodeAt(pos + vec2(0, 1)).kind == KIND_AIR {
        setNodeAt(pos + vec2(0, 1), node);
        setNodeAt(pos, NODE_AIR);
    }
}

fn stepActive(pos_: vec2i, node_: Node) {
    var pos = pos_;
    var node = node_;

    if (node.genome[node.currentGene] == 64) {
        pos += vec2(1, 0);
    }

    node.currentGene = (node.currentGene + 1) % 64;
    node.age++;

    if (node.age >= 256) {
        setNodeAt(pos, NODE_FOOD);
        return;
    }

    setNodeAt(pos, node);
    if (any(pos != pos_)) {
        setNodeAt(pos_, NODE_AIR);
    }
}

@compute @workgroup_size(${WORKGROUP_SIZE}) fn stepWorldCell(
    @builtin(global_invocation_id) id: vec3u
) {
    let pos = vec2i(id.xy);
    if pos.x >= config.worldSize.x || pos.y >= config.worldSize.y {
        return;
    }

    let node = getNodeAt(pos);
    if node.kind == KIND_FOOD {
        stepFood(pos, node);
    } else if node.kind == KIND_ACTIVE {
        stepActive(pos, node);
    }
}
`;
