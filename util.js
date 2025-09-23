export function lepr(a, b, x) {
    return a + (b - a) * x;
}

export function randint(min, top) {
    return min + Math.floor(Math.random() * top);
}

/**
 * Get bit slice of a number
 * @param {number} wholeNumber
 * @param {number} bit_start
 * @param {number} bit_length
 */
export function getBits(wholeNumber, bit_start, bit_length) {
    const mask = (1 << bit_length) - 1;
    return (wholeNumber >> bit_start) & mask;
}

/**
 * Set bit slice of a number to a value
 * @param {number} wholeNumber
 * @param {number} bit_start
 * @param {number} bit_length
 * @param {number} value
 */
export function setBits(wholeNumber, bit_start, bit_length, value) {
    const mask = ((1 << bit_length) - 1) << bit_start;
    const valueShifted = (value << bit_start) & mask;
    return (wholeNumber & ~mask) | valueShifted;
}
