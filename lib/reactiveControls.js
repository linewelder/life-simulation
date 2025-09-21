export const ID_PREFIX = 'ctrl-';

function genericValueType(valueFormatter) {
    return {
        createUi(wrapper, param, state) {
            const text = document.createElement('p');
            wrapper.appendChild(text);

            const formattedValue =
                param.defaultValue === undefined
                    ? '<i>undefined</i>'
                    : param.defaultValue === null
                        ? '<i>null</i>'
                        : valueFormatter(param.defaultValue);

            text.innerHTML = `${param.label}: <span id="${ID_PREFIX}${param.name}">${formattedValue}</span>`;
        },

        updateUi(param, newValue) {
            const formattedValue =
                newValue === undefined
                    ? '<i>undefined</i>'
                    : newValue === null
                        ? '<i>null</i>'
                        : valueFormatter(newValue);

            document.getElementById(ID_PREFIX + param.name)
                .innerHTML = formattedValue;
        },
    };
}

function formatKey(key) {
    switch (key) {
        case ' ': return 'Space';
        default:  return key.toUpperCase();
    }
}

const types = {
    number: genericValueType(x => `${x}`),

    percent: genericValueType(x => `${Math.floor(x * 100)}%`),

    vector2: genericValueType(x => `[${x[0]}, ${x[1]}]`),

    key: genericValueType(x => `<kbd>${formatKey(x)}</kbd>`),

    enum: {
        createUi(wrapper, param, state) {
            const text = document.createElement('p');
            text.innerText = `${param.label}:`;
            wrapper.appendChild(text);

            text.appendChild(document.createElement('br'));

            for (const value of param.values) {
                const valueId = ID_PREFIX + param.name + '-' + value.value;

                const valueRadio = document.createElement('input');
                valueRadio.type = 'radio';
                valueRadio.id = valueId;
                valueRadio.name = param.name;
                valueRadio.value = value.value;
                valueRadio.checked = value.value === param.defaultValue;
                valueRadio.disabled = !param.editable;
                valueRadio.onchange = () => { state[param.name] = value.value };
                text.appendChild(valueRadio);

                const valueLabel = document.createElement('label');
                valueLabel.htmlFor = valueId;
                valueLabel.innerText = value.label;
                text.appendChild(valueLabel);

                text.appendChild(document.createElement('br'));
            }
        },

        updateUi(param, newValue) {
            if (!param.values.find(x => x.value === newValue)) {
                throw `Trying to set value of an enum parameter ${param.name} to ${newValue}, which is invalid`;
            }

            document.getElementById(ID_PREFIX + param.name + '-' + newValue)
                .checked = true;
        },
    },

    button: {
        createUi(wrapper, param, state) {
            const button = document.createElement('button');
            button.id = ID_PREFIX + param.name;
            button.innerText = param.label;
            button.onclick = () => { state[param.name] = null; };
            wrapper.appendChild(button);
        },

        updateUi(param, newValue) {},
    },

    label: {
        createUi(wrapper, param, state) {
            const text = document.createElement('p');
            text.id = ID_PREFIX + param.name;
            text.innerText = param.defaultValue;
            wrapper.appendChild(text);
        },

        updateUi(param, newValue) {
            document.getElementById(ID_PREFIX + param.name)
                .innerHTML = newValue;
        },
    },
};

export function defineType(name, definition) {
    types[name] = definition;
}

export function createReactiveState(schema) {
    const state = {
        '$schema': schema,
        '$callbacks': [],
    };

    for (const param of schema) {
        let innerValue = param.defaultValue;
        Object.defineProperty(state, param.name, {
            get() { return innerValue; },
            set(newValue) {
                innerValue = newValue;
                this.$callbacks.forEach(callback => callback(param.name, newValue));
            },
            enumerable: true,
        });
    }

    return state;
}

export function createUi(state, root) {
    state.$callbacks.push((name, value) => {
        updateUiFor(name, value, state.$schema);
    });

    root.innerHTML = '';
    for (const param of state.$schema) {
        const wrapper = document.createElement('div');
        root.appendChild(wrapper);

        types[param.type].createUi(wrapper, param, state);
    }
}

function updateUiFor(name, value, schema) {
    const param = schema.find(param => param.name === name);
    if (!param) throw `Trying to set value of the parameter ${name}, which is not in the schema`;

    types[param.type].updateUi(param, value);
}
