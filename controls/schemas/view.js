export default [
    {
        name: 'simulationSpeed',
        label: 'Simulation Speed',
        type: 'enum',
        defaultValue: 1,
        editable: true,
        values: [1, 2, 5, 10, 50, 100]
            .map(val => ({ value: val, label: `${val}x` })),
    },
    {
        name: 'nodeView',
        label: 'Colour Nodes By',
        type: 'enum',
        defaultValue: 4,
        editable: true,
        values: [
            {
                value: 0,
                label: 'Energy',
            },
            {
                value: 1,
                label: 'Minerals',
            },
            {
                value: 2,
                label: 'Age',
            },
            {
                value: 3,
                label: 'Genome',
            },
            {
                value: 4,
                label: 'Diet',
            },
            {
                value: 5,
                label: 'Relatives',
            },
        ],
    },
    {
        name: 'nodeDetails',
        label: 'Enable Node Details',
        type: 'checkbox',
        defaultValue: false,
        editable: true,
    }
];
