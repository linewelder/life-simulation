export default [
    {
        name: 'WORLD_SIZE',
        label: 'World Size',
        type: 'vector2',
        defaultValue: [300, 150],
        editable: true,
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
        defaultValue: [
            70, 70, 70, 70, 70, 70, 70, 70,
            70, 70, 70, 70, 70, 70, 70, 70,
            70, 70, 70, 70, 70, 70, 70, 70,
            70, 70, 70, 70, 70, 70, 70, 70,
            70, 70, 70, 70, 70, 70, 70, 70,
            70, 70, 70, 70, 70, 70, 70, 70,
            70, 70, 70, 70, 70, 70, 70, 70,
            70, 70, 70, 70, 70, 70, 70, 69,
        ],
    },
];
