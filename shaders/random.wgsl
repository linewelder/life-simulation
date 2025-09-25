fn random(st: vec2i) -> f32 {
    return fract(sin(dot(vec2f(st.xy), vec2(12.9898,78.233))) * 43758.5453123);
}

fn randU32(st: vec2i, min: u32, maxExcluded: u32) -> u32 {
    return u32(random(st) * f32(maxExcluded - min)) + min;
}
