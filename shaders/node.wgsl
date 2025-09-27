const KIND_AIR:    u32 = 0x0;
const KIND_WALL:   u32 = 0x1;
const KIND_FOOD:   u32 = 0x2;
const KIND_ACTIVE: u32 = 0x3;

const GENOME_LENGTH = 64u;

struct PackedNode {
    props0: u32,
    props1: u32,
    genome: array<u32, 16>,
}

struct Node {
    kind: u32,
    direction: i32,
    age: u32,
    energy: i32,
    minerals: i32,
    diet: vec3u,
    color: i32,
    currentGene: u32,
    genome: array<u32, GENOME_LENGTH>,
}

const NODE_AIR:  Node = Node();
const NODE_WALL: Node = Node(
    KIND_WALL,
    0,
    0u,
    0,
    0,
    vec3u(),
    0,
    0u,
    array<u32, GENOME_LENGTH>(),
);

const NODE_FOOD: Node = Node(
    KIND_FOOD,
    0,
    0u,
    50,
    0,
    vec3u(),
    0,
    0u,
    array<u32, GENOME_LENGTH>(),
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
    unpacked.energy      = i32(getBits(node.props0, 16, 8));
    unpacked.minerals    = i32(getBits(node.props0, 24, 4));

    unpacked.color       = i32(getBits(node.props1, 0,  8));

    unpacked.diet = vec3u(
        getBits(node.props0, 6,  2),
        getBits(node.props0, 28, 2),
        getBits(node.props0, 30, 2),
    );

    unpacked.currentGene = getBits(node.props1, 24, 8);
    for (var i: u32 = 0u; i < GENOME_LENGTH; i = i + 1u) {
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
    props0 = setBits(props0, 16u, 8u, u32(unpacked.energy));
    props0 = setBits(props0, 24u, 8u, u32(unpacked.minerals));
    props0 = setBits(props0, 28u, 2u, unpacked.diet.y);
    props0 = setBits(props0, 30u, 2u, unpacked.diet.z);

    // Pack props1
    var props1: u32 = 0u;
    props1 = setBits(props1, 0u,  8u, u32(unpacked.color));
    props1 = setBits(props1, 24u, 8u, unpacked.currentGene);

    // Pack genome
    var packedGenome: array<u32, GENOME_LENGTH / 4>;
    for (var i: u32 = 0u; i < GENOME_LENGTH; i = i + 1u) {
        let wordIndex = i / 4u;
        let offset = (i % 4u) * 8u;
        packedGenome[wordIndex] = setBits(packedGenome[wordIndex], offset, 8u, unpacked.genome[i]);
    }

    node.props0 = props0;
    node.props1 = props1;
    node.genome = packedGenome;

    return node;
}
