import { LifeSimulator } from "./LifeSimulator.js";
import { loadShader } from './util/wgslPreprocessor.js';
import { makeShaderDataDefinitions, makeStructuredView } from './lib/webgpu-utils.js';
import { mat4, vec2 } from './lib/webgpu-matrix.js';

/**
 * Renders the world.
 */
export class Renderer {
    /**
     * @type {GPUDevice}
     */
    #device;

    /**
     * @type {GPUComputePipeline}
     */
    #pipeline;

    /**
     * WebGPU canvas context.
     */
    #context;

    /**
     * WebGPU render pass descriptor.
     */
    #renderPassDescriptor;

    /**
     * Buffer for uniform values, such as
     * view config.
     */
    #uniformsBuffer;

    /**
     * Structured view of the Uniforms struct (created with webgpu-utils).
     */
    #uniformsView;

    /**
     * @type {GPUBindGroup}
     */
    #bindGroup;

    /**
     * @type {LifeSimulator}
     */
    #simulator;

    /**
     * Canvas aspect ratio.
     * @type {number}
     */
    #aspectRatio;

    /**
     * DO NOT CALL DIRECTLY. USE Renderer.create()
     * @param {LifeSimulator} simulator 
     */
    constructor(device, canvas, simulator, shader) {
        this.#simulator = simulator;
        this.#device = device;

        const defs = makeShaderDataDefinitions(shader);
        this.#uniformsView = makeStructuredView(defs.uniforms.uniforms);

        this.#aspectRatio = canvas.clientWidth / canvas.clientHeight;

        const presentationFormat = navigator.gpu.getPreferredCanvasFormat();
        this.#context = canvas.getContext('webgpu');
        this.#context.configure({
            device,
            format: presentationFormat,
        });

        this.#pipeline = this.#createPipeline(device, presentationFormat, shader);

        this.#renderPassDescriptor = {
            label: 'Render Pass',
            colorAttachments: [
                {
                    // view: <- to be filled out when we render
                    clearValue: [0.3, 0.3, 0.3, 1],
                    loadOp: 'clear',
                    storeOp: 'store',
                },
            ],
        };

        this.#uniformsBuffer = this.#device.createBuffer({
            label: 'Renderer Uniforms',
            size: this.#uniformsView.arrayBuffer.byteLength,
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
        });

        this.#bindGroup = this.#device.createBindGroup({
            label: 'Renderer Bind Group',
            layout: this.#pipeline.getBindGroupLayout(0),
            entries: [
                { binding: 0, resource: { buffer: simulator.configBuffer } },
                { binding: 1, resource: { buffer: this.#uniformsBuffer } },
                { binding: 2, resource: { buffer: simulator.worldStateBuffer } },
            ],
        });
    }

    /**
     * Create an instance of Renderer.
     * @param {GPUDevice} device
     */
    static async create(device, canvas, simulator) {
        return new Renderer(
            device,
            canvas,
            simulator,
            await loadShader('/shaders/renderer.wgsl'),
        );
    }

    /**
     * Create main rendering pipeline.
     * @param {GPUDevice} device 
     * @param {*} presentationFormat 
     * @param {string} shader 
     * @returns 
     */
    #createPipeline(device, presentationFormat, shader) {
        const module = device.createShaderModule({
            label: 'Renderer Vertex & Fragment',
            code: shader,
        });

        return device.createRenderPipeline({
            label: 'Renderer',
            layout: 'auto',
            vertex: {
                module,
            },
            fragment: {
                module,
                targets: [{ format: presentationFormat }],
            },
        });
    }

    /**
     * Render the world.
     */
    render() {
        this.#renderPassDescriptor.colorAttachments[0].view =
            this.#context.getCurrentTexture().createView();

        const encoder = this.#device.createCommandEncoder({
            label: 'Renderer Encoder',
        });

        const pass = encoder.beginRenderPass(this.#renderPassDescriptor);
        pass.setPipeline(this.#pipeline);
        pass.setBindGroup(0, this.#bindGroup);
        pass.draw(6);
        pass.end();

        const commandBuffer = encoder.finish();
        this.#device.queue.submit([commandBuffer]);
    }

    updateView(view) {
        this.#uniformsView.set({
            matrix:      this.#createViewMatrix(view),
            nodeView:    view.nodeView,
            nodeDetails: view.nodeDetails ? 1 : 0,
        });

        this.#device.queue.writeBuffer(this.#uniformsBuffer, 0, this.#uniformsView.arrayBuffer);
    }

    #createViewMatrix(view) {
        const worldSize = this.#simulator.config.WORLD_SIZE;

        const m = mat4.identity();

        let scale = vec2.create(view.zoom, view.zoom);
        mat4.scale(m, [scale[0], scale[1], 1], m);

        let translation = vec2.negate(view.cameraPos);
        vec2.div(translation, worldSize, translation);
        mat4.translate(m, [translation[0], translation[1], 0], m);

        const halfHeight = worldSize[0] / worldSize[1] / this.#aspectRatio / 2;
        const projection = mat4.ortho(-0.5, 0.5, halfHeight, -halfHeight, 0, 1);

        mat4.multiply(projection, m, m);
        return m;
    }
}
