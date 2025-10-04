export default [
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
