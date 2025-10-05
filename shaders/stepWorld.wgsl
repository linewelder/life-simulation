#include "/shaders/config.wgsl"
#include "/shaders/node.wgsl"

@group(0) @binding(0) var<storage> config: Config;
@group(0) @binding(1) var<storage, read> lastWorld: array<PackedNode>;
@group(0) @binding(2) var<storage, read_write> nextWorld: array<PackedNode>;
@group(0) @binding(3) var<storage, read_write> randomState: array<u32>;

fn randU32(pos: vec2i, min: u32, maxExcluded: u32) -> u32 {
    let index = getIndexForPos(pos);
    var x = randomState[index];
    x ^= x << 13;
    x ^= x >> 17;
    x ^= x << 5;
    randomState[index] = x;

    return min + x % (maxExcluded - min);
}

fn getNodeAt(pos: vec2i) -> Node {
    if !isValidPos(pos) {
        return NODE_WALL;
    }

    let index = getIndexForPos(pos);
    let packedNode = lastWorld[index];
    return unpackNode(packedNode);
}

fn setNodeAt(pos: vec2i, node: Node) {
    if !isValidPos(pos) {
        return;
    }

    let index = getIndexForPos(pos);
    nextWorld[index] = packNode(node);
}

fn shouldMutate(pos: vec2i) -> bool {
    return randU32(pos, 0, 100) < u32(config.MUTATION_RATE * 100);
}

fn mutateGenome(genome: array<u32, GENOME_LENGTH>, pos: vec2i) -> array<u32, GENOME_LENGTH> {
    var newGenome = genome;

    let index   = randU32(pos + vec2i(1, 0), 0, GENOME_LENGTH);
    let newGene = randU32(pos + vec2i(2, 0), 0, NUM_GENES);
    newGenome[index] = newGene;

    return newGenome;
}

fn canMove(node: Node, fromPos: vec2i, toPos: vec2i) -> bool {
    let attackedNode = getNodeAt(toPos);
    if attackedNode.kind > KIND_AIR {
        return false;
    }

    for (var direction = 0; direction < 8; direction++) {
        let candidatePos = toPos + directionToVec2(direction);
        if all(candidatePos == fromPos) {
            continue;
        }

        let rivalNode = getNodeAt(candidatePos);
        switch rivalNode.kind {
            case KIND_ACTIVE {
                let rivalNodeIntent = rivalNode.genome[rivalNode.currentGene];
                if rivalNodeIntent != GENE_MOVE_FORWARD {
                    continue;
                }

                let hasToBeComingFrom = (rivalNode.direction + 4) % 8;
                if hasToBeComingFrom != direction {
                    continue;
                }
            }

            case KIND_FOOD {
                if direction != 2 {
                    continue;
                }
            }

            default {
                continue;
            }
        }

        if node.energy <= rivalNode.energy {
            return false;
        }
    }

    return true;
}

fn isEaten(pos: vec2i) -> bool {
    for (var direction = 0; direction < 8; direction++) {
        let candidatePos = pos + directionToVec2(direction);
        let neighbor = getNodeAt(candidatePos);
        if neighbor.kind != KIND_ACTIVE {
            continue;
        }

        if neighbor.genome[neighbor.currentGene] != GENE_EAT_FORWARD {
            continue;
        }

        if neighbor.direction != (direction + 4) % 8 {
            continue;
        }

        return true;
    }

    return false;
}

/* Returns the energy cost. 0 if failed. */
fn spawnChild(parentPos: vec2i, parent: Node, childPos: vec2i, childFirstGene: u32) -> i32 {
    let halfEnergy = (parent.energy - config.REPRODUCTION_COST) / 2;
    if halfEnergy <= 0 {
        return 0;
    }

    if !canMove(parent, parentPos, childPos) {
        return 0;
    }

    var genome = parent.genome;
    var color = parent.color;
    if shouldMutate(childPos) {
        genome = mutateGenome(parent.genome, childPos);
        color = parent.color + 1;
    }

    let child = Node(
        KIND_ACTIVE,      // kind
        parent.direction, // direction
        0u,               // age
        halfEnergy,       // energy
        0,                // minerals
        vec3(0, 0, 0),    // diet
        color,            // color
        childFirstGene,   // currentGene
        genome,           // genome
    );
    setNodeAt(childPos, child);

    return halfEnergy;
}

fn areRelatives(genomeA: array<u32, GENOME_LENGTH>, genomeB: array<u32, GENOME_LENGTH>) -> bool {
    var differenceCount = 0u;
    for (var i = 0u; i < GENOME_LENGTH; i++) {
        if genomeA[i] != genomeB[i] {
            differenceCount++;

            if differenceCount > config.RELATIVE_THRESHOLD {
                return false;
            }
        }
    }

    return true;
}

fn stepFood(pos: vec2i, node: Node) {
    if isEaten(pos) {
        setNodeAt(pos, NODE_AIR);
        return;
    }

    let newPos = pos + vec2(0, 1);
    if canMove(node, pos, newPos) {
        setNodeAt(newPos, node);
        setNodeAt(pos, NODE_AIR);
    }
}

/* Get nth argument of the current gene. Arguments come right after the current gene. */
fn getGeneArg(node: Node, argNum: u32) -> u32 {
    return node.genome[(node.currentGene + argNum) % GENOME_LENGTH];
}

fn stepActive(pos_: vec2i, node_: Node) {
    var pos = pos_;
    var node = node_;
    var genomeStep = 1u;

    if isEaten(pos) {
        setNodeAt(pos, NODE_AIR);
        return;
    }

    let gene = node.genome[node.currentGene];
    switch gene {
        case GENE_MOVE_FORWARD {
            let newPos = pos + directionToVec2(node.direction);
            if canMove(node, pos, newPos) {
                pos = newPos;
            }
        }

        case GENE_TURN_CCW {
            node.direction = (node.direction + 1) % 8;
        }

        case GENE_TURN_CW {
            node.direction = (node.direction + 7) % 8;
        }

        case GENE_EAT_FORWARD {
            let stepIfSucceeded = getGeneArg(node, 1);
            let stepIfFailed    = getGeneArg(node, 2);

            let attackedPos = pos + directionToVec2(node.direction);

            let attackedNode = getNodeAt(attackedPos);
            if attackedNode.kind < KIND_FOOD {
                genomeStep = stepIfFailed;
            } else {
                node.energy += attackedNode.energy;
                node.diet.x = min(3, node.diet.x + 1);
                genomeStep = stepIfSucceeded;
            }
        }

        case GENE_REPRODUCE_FORWARD, GENE_REPRODUCE_BACKWARD {
            let childFirstGene  = getGeneArg(node, 1) % 64;
            let stepIfSucceeded = getGeneArg(node, 2);
            let stepIfFailed    = getGeneArg(node, 3);

            var direction = node.direction;
            if gene == GENE_REPRODUCE_BACKWARD {
                direction = direction + 4;
            }

            let childPos = pos + directionToVec2(direction);
            let energyCost = spawnChild(pos, node, childPos, childFirstGene);
            if energyCost > 0 {
                node.energy -= energyCost;
                genomeStep = stepIfSucceeded;
            } else {
                genomeStep = stepIfFailed;
            }
        }

        case GENE_PHOTOSYNTHESIZE {
            let sunAmount = getSunAmountAt(pos.y);
            if sunAmount > 0 {
                node.energy += sunAmount;
                node.diet.y = min(3, node.diet.y + 1);
            }
        }

        case GENE_CHECK_FORWARD {
            let stepIfRelative = getGeneArg(node, 1);
            let stepIfActive   = getGeneArg(node, 2);
            let stepIfFood     = getGeneArg(node, 3);
            let stepIfAir      = getGeneArg(node, 4);
            let stepIfWall     = getGeneArg(node, 5);

            let coordsInFront = pos + directionToVec2(node.direction);
            let nodeInFront = getNodeAt(coordsInFront);
            switch nodeInFront.kind {
                case KIND_ACTIVE {
                    if areRelatives(node.genome, nodeInFront.genome) {
                        genomeStep = stepIfRelative;
                    } else {
                        genomeStep = stepIfActive;
                    }
                }

                case KIND_FOOD {
                    genomeStep = stepIfFood;
                }

                case KIND_AIR {
                    genomeStep = stepIfAir;
                }

                case KIND_WALL, default {
                    genomeStep = stepIfWall;
                }
            }
        }

        case GENE_CHECK_ENERGY {
            let threshold  = getGeneArg(node, 1);
            let stepIfMore = getGeneArg(node, 2);
            let stepIfLess = getGeneArg(node, 2);
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
