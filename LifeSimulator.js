/**
 * @file Main simulation logic.
 */

import { randint } from './util.js';

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
const NODE_SIZE_BYTES = 4;

/**
 * Size of a compute shader work group.
 * Recommended size is 64.
 */
const WORKGROUP_SIZE = [8, 8, 1];

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
     * Stores the current config.
     * @type {GPUBuffer}
     */
    #configBuffer;

    /**
     * Stores the world data for the compute shader to operate on.
     * @type {GPUBuffer}
     */
    #worldBuffer;

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
     * Initializes the main game class, returns null if initialization failed.
     */
    static async create() {
        const adapter = await navigator.gpu?.requestAdapter();
        const device = await adapter?.requestDevice();
        if (!device) return null;

        return new LifeSimulator(device);
    }

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
        
        this.#worldBuffer?.destroy();
        this.#worldReadBuffer?.destroy();
        this.#bindGroup?.destroy();

        this.#worldSize = worldSize;

        if (!this.#configBuffer) {
            this.#configBuffer = this.#device.createBuffer({
                label: 'Config',
                size: CONFIG_SIZE_BYTES,
                usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST,
            });
        }

        const configData = new Int32Array(2);
        configData.set(this.#worldSize, 0);
        this.#device.queue.writeBuffer(this.#configBuffer, 0, configData);

        this.#worldBuffer = this.#device.createBuffer({
            label: 'World Data',
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
                { binding: 1, resource: { buffer: this.#worldBuffer } },
            ],
        });
    }

    /**
     * Reset state of the world. Or initialize a newly created one.
     */
    resetWorld() {
        const worldData = new Uint32Array(WORLD_SIZE[0] * WORLD_SIZE[1]);
        for (let i = 0; i < 128; i++) {
            let x = randint(0, WORLD_SIZE[0]);
            let y = randint(0, WORLD_SIZE[1]);
            worldData.set([1], x * WORLD_SIZE[1] + y);
        }

        this.#device.queue.writeBuffer(this.#worldBuffer, 0, worldData);
    }

    /**
     * Do a single simulation step
     */
    stepWorld() {
        const encoder = this.#device.createCommandEncoder({
            label: 'Life Simulator',
        });

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
    }

    /**
     * Fetch world state from the GPU.
     */
    async readWorldState() {
        const encoder = this.#device.createCommandEncoder({
            label: 'Life Simulator - Read World State',
        });

        encoder.copyBufferToBuffer(
            this.#worldBuffer, 0,
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
     * Decode world data from buffer data to regular structures.
     * @param {Uint32Array} data
     */
    #decodeWorldData(data) {
        return Array.from(data).map(
            (node, index) => {
                if (node === 1) {
                    return {
                        type: 'food',
                        x: Math.floor(index / this.#worldSize[1]),
                        y: index % this.#worldSize[1],
                    };
                }

                return null;
            }
        );
    }
}

const STEP_NODE_SHADER = `
struct Config {
    worldSize: vec2i,
}

struct Node {
    kind: u32,
}

@group(0) @binding(0) var<storage> config: Config;
@group(0) @binding(1) var<storage, read_write> world: array<Node>;

fn getNodeAt(pos: vec2i) -> Node {
    if (pos.y < 0) {
        return Node(0u);
    }

    return world[pos.x * config.worldSize.y + pos.y];
}

fn setNodeAt(pos: vec2i, node: Node) {
    world[pos.x * config.worldSize.y + pos.y] = node;
}

@compute @workgroup_size(${WORKGROUP_SIZE}) fn stepWorldCell(
    @builtin(global_invocation_id) id: vec3u
) {
    let coords = vec2i(id.xy);
    if (coords.x >= config.worldSize.x || coords.y >= config.worldSize.y) {
        return;
    }

    if (getNodeAt(coords - vec2(0, 1)).kind == 1 && getNodeAt(coords).kind == 0) {
        setNodeAt(coords - vec2(0, 1), Node(0u));
        setNodeAt(coords, Node(1u));
    }
}
`;
