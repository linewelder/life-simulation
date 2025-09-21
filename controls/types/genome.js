import { ID_PREFIX } from '/lib/reactiveControls.js';

export default {
    createGenomeHtml(table, node) {
        let genomeHtml = '';
        for (let i = 0; i < node.genome.length; i++) {
            if (i % 8 === 0) {
                genomeHtml += '<tr>';
            }

            const className = node.currentGene === i ? 'current-gene' : '';
            genomeHtml += `<td class="${className}">${node.genome[i]}</td>`;

            if (i % 8 === 7 || i === node.genome.length - 1) {
                genomeHtml += '</tr>';
            }
        }

        table.innerHTML = genomeHtml;
    },

    createUi(wrapper, param, state) {
        const table = document.createElement('table');
        table.id = ID_PREFIX + param.name;
        this.createGenomeHtml(table, param.defaultValue);
        wrapper.appendChild(table);
    },

    updateUi(param, newValue) {
        const table = document.getElementById(ID_PREFIX + param.name);
        table.innerHTML = '';
        this.createGenomeHtml(table, newValue);
    },
};
