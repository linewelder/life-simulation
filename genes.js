/**
 * Genes with values 1-63 are unconditional jumps.
 */
export const GENES = {
    GENE_MOVE_FORWARD: {
        value: 64,
        emoji: '🏃',
        label: 'Move Forward',
    },
    GENE_TURN_CCW: {
        value: 65,
        emoji: '↪️',
        label: 'Turn Counter-Clockwise',
    },
    GENE_TURN_CW: {
        value: 66,
        emoji: '↩️',
        label: 'Turn Clockwise',
    },
    GENE_EAT_FORWARD: {
        value: 67,
        emoji: '🍖',
        label: 'Eat Forward',
    },
    GENE_REPRODUCE_FORWARD: {
        value: 68,
        emoji: '👍',
        label: 'Reproduce Forward',
    },
    GENE_REPRODUCE_BACKWARD: {
        value: 69,
        emoji: '👎',
        label: 'Reproduce Backward',
    },
    GENE_PHOTOSYNTHESIZE: {
        value: 70,
        emoji: '🌻',
        label: 'Photosynthesize',
    },
    GENE_CHECK_FORWARD: {
        value: 71,
        emoji: '👁️‍🗨️',
        label: 'Check Forward',
    },
    GENE_CHECK_ENERGY: {
        value: 72,
        emoji: '⚡',
        label: 'Check Energy Level',
    },
    GENE_CONVERT_MINERALS: {
        value: 73,
        emoji: '💎',
        label: 'Check Mineral Level',
    },
};

/**
 * Total number of functional genes and unconditional jumps 1-63.
 */
export const NUMBER_OF_GENES = Math.max(...Object.values(GENES).map(x => x.value)) + 1;

/**
 * Get emoji representation of the gene.
 * For non-functional gene the value is returned back.
 * @param {number} value 
 * @returns {string}
 */
export function getEmojiForGene(value) {
    const foundGene = Object.values(GENES).find(gene => gene.value === value);
    return foundGene?.emoji ?? `${value}`;
}
