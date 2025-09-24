#include "/shaders/config.wgsl"
#include "/shaders/node.wgsl"
#include "/shaders/genes.wgsl"

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

    if (node.genome[node.currentGene] == GENE_MOVE_FORWARD) {
        pos += vec2(1, 0);
    }

    node.currentGene = (node.currentGene + 1) % GENOME_LENGTH;
    node.age++;

    setNodeAt(pos, node);
    if (any(pos != pos_)) {
        setNodeAt(pos_, NODE_AIR);
    }

    if (node.age >= 256) {
        setNodeAt(pos, NODE_FOOD);
    }
}

@compute @workgroup_size(WORKGROUP_SIZE) fn stepWorldCell(
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
