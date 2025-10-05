struct Config {
    WORLD_SIZE:           vec2i,
    NODE_MAX_AGE:         u32,   // <= 255
    NODE_MAX_ENERGY:      i32,   // <= 255
    NODE_MAX_MINERALS:    i32,   // <= 15
    MINERAL_ENERGY:       i32,
    SUN_AMOUNT:           i32,
    SUN_LEVEL_HEIGHT:     i32,
    MINERAL_AMOUNT:       i32,
    MINERAL_LEVEL_HEIGHT: i32,
    RELATIVE_THRESHOLD:   u32,
    REPRODUCTION_COST:    i32,
    MUTATION_RATE:        f32,
}

fn isValidPos(pos: vec2i) -> bool {
    return pos.y >= 0 && pos.y < config.WORLD_SIZE.y;
}

fn getIndexForPos(pos: vec2i) -> i32 {
    let normalizedPos = pos % config.WORLD_SIZE;
    return normalizedPos.x * config.WORLD_SIZE.y + normalizedPos.y;
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
