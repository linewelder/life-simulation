export function lepr(a, b, x) {
    return a + (b - a) * x;
}

export function randint(min, top) {
    return min + Math.floor(Math.random() * top);
}
