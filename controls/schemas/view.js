export default [
    {
        name: 'nodeView',
        label: 'Colour Nodes By',
        type: 'enum',
        defaultValue: 'diet',
        editable: true,
        values: [
            {
                value: 'energy',
                label: 'Energy',
            },
            {
                value: 'minerals',
                label: 'Minerals',
            },
            {
                value: 'age',
                label: 'Age',
            },
            {
                value: 'genome',
                label: 'Genome',
            },
            {
                value: 'diet',
                label: 'Diet',
            },
        ],
    },
];
