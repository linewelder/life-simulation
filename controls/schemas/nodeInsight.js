export default [
    {
        name: 'energy',
        label: 'Energy',
        type: 'number',
        defaultValue: 0,
    },
    {
        name: 'minerals',
        label: 'Minerals',
        type: 'number',
        defaultValue: 0,
    },
    {
        name: 'age',
        label: 'Age',
        type: 'number',
        defaultValue: 0,
    },
    {
        name: 'genome',
        label: 'Genome',
        type: 'genome',
        defaultValue: { genome: [], currentGene: 0 },
    },
];
