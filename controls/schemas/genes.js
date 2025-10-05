import { GENES } from '/genes.js';

export default Object.entries(GENES)
    .map(([internalName, gene]) => ({
        name: internalName,
        label: gene.label,
        type: 'label',
        defaultValue: `${gene.emoji} — ${gene.label} (${gene.value})`,
    }));
