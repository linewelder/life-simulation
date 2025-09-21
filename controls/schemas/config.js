export default [
    {
        name: 'GRID_SIZE',
        label: 'Grid Size',
        type: 'vector2',
        defaultValue: [200, 200],
    },
    {
        name: 'START_NODE_NUM',
        label: 'Starting # of Nodes',
        type: 'number',
        defaultValue: 128,
    },
    {
        name: 'MAX_NODE_NUM',
        label: 'Max # of Nodes',
        type: 'number',
        defaultValue: 1024,
    },
    {
        name: 'GENOME_LENGTH',
        label: 'Node\'s Genome Length',
        type: 'number',
        defaultValue: 64,
    },
    {
        name: 'MUTATION_RATE',
        label: 'Mutation Rate',
        type: 'percent',
        defaultValue: 0.05,
    },
    {
        name: 'NODE_MAX_AGE',
        label: 'Node\'s Max Age',
        type: 'number',
        defaultValue: 512,
    },
    {
        name: 'NODE_MAX_ENERGY',
        label: 'Node\'s Max Energy',
        type: 'number',
        defaultValue: 256,
    },
    {
        name: 'NODE_START_ENERGY',
        label: 'Spawned Node\'s Energy',
        type: 'number',
        defaultValue: 100,
    },
    {
        name: 'SUN_AMOUNT',
        label: 'Sun Amount',
        type: 'number',
        defaultValue: 10,
    },
    {
        name: 'DEAD_NODE_ENERGY',
        label: 'Energy of a Dead Node',
        type: 'number',
        defaultValue: 20,
    },
];
