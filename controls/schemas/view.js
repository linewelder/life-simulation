export default [
    {
        name: 'nodeView',
        label: 'Colour Nodes By',
        type: 'enum',
        defaultValue: 'genome',
        editable: true,
        values: [
            {
                value: 'energy',
                label: 'Energy',
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
