import { ID_PREFIX } from '/util/reactiveControls.js';

export default {
    createGenomeHtml(table, nodeOrGenome) {
        const { genome, currentGene } =
            Array.isArray(nodeOrGenome)
                ? { genome: nodeOrGenome, currentGene: null }
                : nodeOrGenome;

        let genomeHtml = '';
        for (let i = 0; i < genome.length; i++) {
            if (i % 8 === 0) {
                genomeHtml += '<tr>';
            }

            const className = currentGene === i ? 'current-gene' : '';
            genomeHtml += `<td class="${className}">${genome[i]}</td>`;

            if (i % 8 === 7 || i === genome.length - 1) {
                genomeHtml += '</tr>';
            }
        }

        table.innerHTML = genomeHtml;
    },

    createUi(wrapper, param, state) {
        const label = document.createElement('label');
        label.innerText = param.label;
        wrapper.appendChild(label);

        const table = document.createElement('table');
        table.id = ID_PREFIX + param.name;
        table.className = 'genome';
        this.createGenomeHtml(table, param.defaultValue);
        wrapper.appendChild(table);
    },

    updateUi(param, newValue) {
        const table = document.getElementById(ID_PREFIX + param.name);
        table.innerHTML = '';
        this.createGenomeHtml(table, newValue);
    },
};
