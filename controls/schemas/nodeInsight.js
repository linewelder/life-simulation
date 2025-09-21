export default [
    {
        name: 'msg',
        label: 'Arbitrary Debug Info',
        type: 'label',
        defaultValue: 'This is node insight',
    },
    {
        name: 'energy',
        label: 'Energy',
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
