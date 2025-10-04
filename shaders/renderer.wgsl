#include "/shaders/config.wgsl"
#include "/shaders/node.wgsl"

struct Uniforms {
    matrix:      mat4x4f,
    nodeView:    u32,
}

const VIEW_ENERGY   = 0;
const VIEW_MINERALS = 1;
const VIEW_AGE      = 2;
const VIEW_GENOME   = 3;
const VIEW_DIET     = 4;

@group(0) @binding(0) var<storage> config: Config;
@group(0) @binding(1) var<uniform> uniforms: Uniforms;
@group(0) @binding(2) var<storage> worldState: array<PackedNode>;

struct Vertex {
    @builtin(position)
    position: vec4f,

    @location(0)
    @interpolate(linear)
    uv: vec2f,
}

const VERTICES = array(
    vec2f(0.0, 0.0),
    vec2f(0.0, 1.0),
    vec2f(1.0, 0.0),
    vec2f(1.0, 0.0),
    vec2f(0.0, 1.0),
    vec2f(1.0, 1.0),
);

@vertex
fn vertexMain(
    @builtin(vertex_index) vertexIndex: u32
) ->  Vertex {
    let vertex = VERTICES[vertexIndex];

    let position = uniforms.matrix * vec4f(vertex, 0, 1);
    let uv       = vertex;

    return Vertex(
        position,
        uv,
    );
}

fn getNodeAt(pos: vec2i) -> Node {
    if !isValidPos(pos) {
        return NODE_WALL;
    }

    let index = getIndexForPos(pos);
    let packedNode = worldState[index];
    return unpackNode(packedNode);
}

fn hsl2rgb(c: vec3f) -> vec3f {
    let rgb = clamp(abs(c.x * 6.0 + vec3(0.0, 4.0, 2.0) % 6.0 - 3.0) - 1.0, vec3(0.0), vec3(1.0));
    return c.z + c.y * (rgb - 0.5) * (1.0 - abs(2.0 * c.z - 1.0));
}

fn lerp(a: vec3f, b: vec3f, x: f32) -> vec3f {
    return (b - a) * smoothstep(0, 1, x) + a;
}

const SUN_COLOR        = vec3(1.0,  1.0,  1.0);
const MINERAL_COLOR    = vec3(0.59, 0.59, 0.78);
const BACKGROUND_COLOR = vec3(0.78, 0.78, 0.75);
const FOOD_COLOR       = vec3(0.62, 0.62, 0.62);

fn getActiveNodeColor(node: Node) -> vec3f {
    switch uniforms.nodeView {
        case VIEW_ENERGY {
            let energy = f32(node.energy) / f32(config.NODE_MAX_ENERGY);
            let hsl = vec3(0.14, 1.0, energy * 0.8);
            return hsl2rgb(hsl);
        }

        case VIEW_MINERALS {
            let minerals = f32(node.minerals) / f32(config.NODE_MAX_MINERALS);
            let hsl = vec3(0.47, minerals, 0.5);
            return hsl2rgb(hsl);
        }

        case VIEW_AGE {
            let age = f32(node.age) / f32(config.NODE_MAX_AGE);
            let hsl = vec3(0.41, 1.0 - sqrt(age), 0.5);
            return hsl2rgb(hsl);
        }

        case VIEW_GENOME {
            let hsl = vec3(vec3(f32(node.color) / 255, 1.0, 0.5));
            return hsl2rgb(hsl);
        }

        case VIEW_DIET, default {
            return vec3f(node.diet) / 3.0 * vec3(0.71, 0.71, 0.78) + 0.16;
        }
    }
}

@fragment
fn fragmentMain(
    vertex: Vertex,
) -> @location(0) vec4f {
    let worldPos = vec2i(vertex.uv * vec2f(config.WORLD_SIZE));

    let node = getNodeAt(worldPos);
    switch node.kind {
        case KIND_ACTIVE {
            return vec4f(getActiveNodeColor(node), 1);
        }

        case KIND_FOOD {
            return vec4f(FOOD_COLOR, 1);
        }

        default {
            let sunAmount       = f32(getSunAmountAt(worldPos.y)) / f32(config.SUN_AMOUNT);
            let mineralAmount   = f32(getMineralAmountAt(worldPos.y)) / f32(config.MINERAL_AMOUNT);

            return vec4f(lerp(lerp(BACKGROUND_COLOR, SUN_COLOR, sunAmount), MINERAL_COLOR, mineralAmount), 1);
        }
    }
}
