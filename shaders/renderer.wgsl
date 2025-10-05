#include "/shaders/config.wgsl"
#include "/shaders/node.wgsl"

struct Uniforms {
    matrix:          mat4x4f,
    nodeView:        u32,
    nodeDetails:     u32, // bool, can't use bools in uniforms
    highlightedNode: vec2i,
}

const VIEW_ENERGY    = 0;
const VIEW_MINERALS  = 1;
const VIEW_AGE       = 2;
const VIEW_GENOME    = 3;
const VIEW_DIET      = 4;
const VIEW_RELATIVES = 5;

@group(0) @binding(0) var<storage> config: Config;
@group(0) @binding(1) var<uniform> uniforms: Uniforms;
@group(0) @binding(2) var<storage> worldState: array<PackedNode>;

struct Vertex {
    @builtin(position)
    position: vec4f,

    @location(0)
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

fn countDifferences(genomeA: array<u32, GENOME_LENGTH>, genomeB: array<u32, GENOME_LENGTH>) -> u32 {
    var differenceCount = 0u;
    for (var i = 0u; i < GENOME_LENGTH; i++) {
        if genomeA[i] != genomeB[i] {
            differenceCount++;
        }
    }

    return differenceCount;
}

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

fn hue2rgb(f1: f32, f2: f32, hue_: f32) -> f32 {
    var hue = hue_;
    if (hue < 0.0) {
        hue = hue + 1.0;
    } else if (hue > 1.0) {
        hue = hue - 1.0;
    }

    if (6.0 * hue < 1.0) {
        return f1 + (f2 - f1) * 6.0 * hue;
    } else if (2.0 * hue < 1.0) {
        return f2;
    } else if (3.0 * hue < 2.0) {
        return f1 + (f2 - f1) * ((2.0 / 3.0) - hue) * 6.0;
    } else {
        return f1;
    }
}

fn hsl2rgb(hsl: vec3<f32>) -> vec3<f32> {
    var rgb: vec3<f32>;

    if (hsl.y == 0.0) {
        rgb = vec3<f32>(hsl.z); // Achromatic
    } else {
        var f2: f32;
        if (hsl.z < 0.5) {
            f2 = hsl.z * (1.0 + hsl.y);
        } else {
            f2 = hsl.z + hsl.y - hsl.y * hsl.z;
        }

        let f1 = 2.0 * hsl.z - f2;

        rgb = vec3<f32>(
            hue2rgb(f1, f2, hsl.x + 1.0 / 3.0),
            hue2rgb(f1, f2, hsl.x),
            hue2rgb(f1, f2, hsl.x - 1.0 / 3.0)
        );
    }

    return rgb;
}

fn lerp(a: vec3f, b: vec3f, x: f32) -> vec3f {
    return (b - a) * smoothstep(0, 1, x) + a;
}

const GRID_WIDTH = 0.05;
const EYE_RADIUS = 0.07;

const SUN_COLOR        = vec3(1.0,  1.0,  1.0);
const MINERAL_COLOR    = vec3(0.59, 0.59, 0.78);
const BACKGROUND_COLOR = vec3(0.78, 0.78, 0.75);
const FOOD_COLOR       = vec3(0.62, 0.62, 0.62);
const GRID_COLOR       = vec3(0.4, 0.4, 0.4);

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

        case VIEW_RELATIVES {
            let highlightedNode = getNodeAt(uniforms.highlightedNode);
            let differences = countDifferences(highlightedNode.genome, node.genome);
            let lightness = 0.7 / f32(differences + 1);
            return hsl2rgb(vec3(0.3, 0.7, lightness));
        }

        case VIEW_DIET, default {
            return vec3f(node.diet) / 3.0 * vec3(0.71, 0.71, 0.78) + 0.16;
        }
    }
}

fn drawNodeDetails(pos: vec2f, node: Node) -> bool {
    if uniforms.nodeDetails == 0 {
        return false;
    }

    let distanceToGrid = abs(pos - round(pos));
    if any(distanceToGrid < vec2(GRID_WIDTH)) {
        return true;
    }

    let eyePos = floor(pos) + vec2(0.5) + 0.25 * vec2f(directionToVec2(node.direction));
    if distance(pos, eyePos) < EYE_RADIUS {
        return true;
    }

    return false;
}

@fragment
fn fragmentMain(
    vertex: Vertex,
) -> @location(0) vec4f {
    let worldPosF = vertex.uv * vec2f(config.WORLD_SIZE);
    let worldPos = vec2i(worldPosF);

    let node = getNodeAt(worldPos);
    switch node.kind {
        case KIND_ACTIVE {
            if drawNodeDetails(worldPosF, node) {
                return vec4f(GRID_COLOR, 1);
            }

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
