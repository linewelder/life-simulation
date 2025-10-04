import { uint32SizeToBytes } from './util.js';
import { LifeSimulator } from "./LifeSimulator.js";
import { loadShader } from './util/wgslPreprocessor.js';

/**
 * Size of the uniforms in uint32's. Used in WebGPU buffers.
 */
const UNIFORMS_SIZE_UINT32 = 14;

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
     * @type {GPUBindGroup}
     */
    #bindGroup;

    /**
     * DO NOT CALL DIRECTLY. USE Renderer.create()
     * @param {LifeSimulator} simulator 
     */
    constructor(device, canvas, simulator, shader) {
        this.#device = device;

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
            size: uint32SizeToBytes(UNIFORMS_SIZE_UINT32),
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
        const uniformsData = new Uint32Array(UNIFORMS_SIZE_UINT32);
        uniformsData.set([
            view.cameraPos[0],
            view.cameraPos[1],
            view.zoom,
            view.nodeView,
        ], 0)
        this.#device.queue.writeBuffer(this.#uniformsBuffer, 0, uniformsData);
    }
}
