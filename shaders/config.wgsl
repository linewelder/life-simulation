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
}
