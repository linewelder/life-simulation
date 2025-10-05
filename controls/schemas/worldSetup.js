export default [
    {
        name: 'WORLD_SIZE',
        label: 'World Size',
        type: 'vector2',
        defaultValue: [200, 200],
    },
    {
        name: 'START_NODE_NUM',
        label: 'Starting # of Nodes',
        type: 'number',
        defaultValue: 128,
        editable: true,
    },
    {
        name: 'NODE_START_ENERGY',
        label: 'Spawned Node\'s Energy',
        type: 'number',
        defaultValue: 100,
        editable: true,
    },
    {
        name: 'STARTING_GENOME',
        label: 'Starting Genome',
        type: 'genome',
        defaultValue: [],
    },
];
