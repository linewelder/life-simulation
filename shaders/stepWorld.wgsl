#include "/shaders/config.wgsl"
#include "/shaders/node.wgsl"
#include "/shaders/genes.wgsl"

@group(0) @binding(0) var<storage> config: Config;
@group(0) @binding(1) var<storage, read> lastWorld: array<PackedNode>;
@group(0) @binding(2) var<storage, read_write> nextWorld: array<PackedNode>;

fn getNodeAt(pos: vec2i) -> Node {
    if pos.y < 0 || pos.y >= config.WORLD_SIZE.y {
        return NODE_WALL;
    }

    let packedNode = lastWorld[pos.x * config.WORLD_SIZE.y + pos.y];
    return unpackNode(packedNode);
}

fn setNodeAt(pos: vec2i, node: Node) {
    nextWorld[pos.x * config.WORLD_SIZE.y + pos.y] = packNode(node);
}

fn stepFood(pos: vec2i, node: Node) {
    if getNodeAt(pos + vec2(0, 1)).kind == KIND_AIR {
        setNodeAt(pos + vec2(0, 1), node);
        setNodeAt(pos, NODE_AIR);
    }
}

fn getSunAmountAt(y: i32) -> i32 {
    return max(
        config.SUN_AMOUNT - y / config.SUN_LEVEL_HEIGHT,
        0,
    );
}

fn getMineralAmountAt(y: i32) -> i32 {
    let reverseY = config.WORLD_SIZE.y - 1 - y;
    return max(
        config.MINERAL_AMOUNT - reverseY / config.MINERAL_LEVEL_HEIGHT,
        0,
    );
}

fn stepActive(pos_: vec2i, node_: Node) {
    var pos = pos_;
    var node = node_;
    var genomeStep = 1u;

    let gene = node.genome[node.currentGene];
    switch gene {
        case GENE_MOVE_FORWARD {
            pos += vec2(1, 0);
        }

        case GENE_TURN_CCW {
            node.direction = (node.direction + 1) % 4;
        }

        case GENE_TURN_CW {
            node.direction = (node.direction + 3) % 4;
        }

        case GENE_EAT_FORWARD {}

        case GENE_REPRODUCE_FORWARD {}

        case GENE_REPRODUCE_BACKWARD {}

        case GENE_PHOTOSYNTHESIZE {
            let sunAmount = getSunAmountAt(pos.y);
            if sunAmount > 0 {
                node.energy += sunAmount;
                node.diet.y = min(3, node.diet.y + 1);
            }
        }

        case GENE_CHECK_FORWARD {}

        case GENE_CHECK_ENERGY {
            let threshold  = node.genome[(node.currentGene + 1) % GENOME_LENGTH];
            let stepIfMore = node.genome[(node.currentGene + 2) % GENOME_LENGTH];
            let stepIfLess = node.genome[(node.currentGene + 2) % GENOME_LENGTH];
            if node.energy > i32(threshold) {
                genomeStep = stepIfMore;
            } else {
                genomeStep = stepIfLess;
            }
        }

        case GENE_CONVERT_MINERALS {
            if node.minerals > 0 {
                node.energy += node.minerals * config.MINERAL_ENERGY;
                node.minerals = 0;
                node.diet.z = min(3, node.diet.z + 1);
            }
        }

        default {
            if gene < GENOME_LENGTH && gene != 0 {
                genomeStep = gene;
            }
        }
    }

    node.currentGene = (node.currentGene + genomeStep) % GENOME_LENGTH;

    node.energy   = min(config.NODE_MAX_ENERGY,   node.energy - 1);
    node.minerals = min(config.NODE_MAX_MINERALS, node.minerals + getMineralAmountAt(pos.y));
    node.age++;

    setNodeAt(pos, node);
    if any(pos != pos_) {
        setNodeAt(pos_, NODE_AIR);
    }

    if node.energy <= 0 || node.age > config.NODE_MAX_AGE {
        setNodeAt(pos, NODE_FOOD);
    }
}

@compute @workgroup_size(WORKGROUP_SIZE) fn stepWorldCell(
    @builtin(global_invocation_id) id: vec3u
) {
    let pos = vec2i(id.xy);
    if pos.x >= config.WORLD_SIZE.x || pos.y >= config.WORLD_SIZE.y {
        return;
    }

    let node = getNodeAt(pos);
    if node.kind == KIND_FOOD {
        stepFood(pos, node);
    } else if node.kind == KIND_ACTIVE {
        stepActive(pos, node);
    }
}
