/**
 * @file Allows easy creation of 'Properties'-style interfaces which 
 * reactively update and allow editing by the user.
 */

/**
 * Prefix added to HTML control element IDs.
 */
export const ID_PREFIX = 'ctrl-';

/**
 * Available value for a param of type enum.
 * 
 * @typedef {Object} EnumValue
 * @property {string} value Internal value that is actually used
 * @property {string} label Label displayed in UI
 */

/**
 * A property of a reactive state.
 * 
 * @typedef {Object} Param
 * @property {string} name Internal name
 * @property {string} label Label displayed in UI
 * @property {string} type Name of the value type
 * @property {any} defaultValue Value set when the state is created
 * @property {boolean} editable Whether the value can be changed using the UI
 * @property {EnumValue[]=} values For params of type 'enum', list of available values
 */

/**
 * The list of properties of a reactive state.
 * 
 * @typedef {Param[]} Schema
 */

/**
 * Callback called when a property value of a reactive state is updated.
 * @callback ReactiveStateCallback
 * @param {string} name Name of the updated param
 * @param {any} value The new value set for the param
 */

/**
 * Reactive state created based on a schema.
 * Calls callbacks when property values are updated.
 * 
 * @typedef {Object} ReactiveState
 * @property {Schema} $schema Description of the state's properties
 * @property {ReactiveStateCallback[]} $callbacks List of callbacks called when a value is updated
 */

/**
 * A type of a property of a reactive state
 * 
 * @typedef {Object} ValueType
 * @property {function(HTMLElement, Param, ReactiveState): void} createUi Create initial HTML UI
 * @property {function(Param, any): void} updateUi Update the existing HTML UI when a value is changed
 */

/**
 * Create a generic value type.
 * 
 * @param {function(any): string} formatValue Converts values to HTML
 * @returns {ValueType}
 */
function genericValueType(formatValue) {
    return {
        createUi(wrapper, param, state) {
            const text = document.createElement('p');
            wrapper.appendChild(text);

            const formattedValue =
                param.defaultValue === undefined
                    ? '<i>undefined</i>'
                    : param.defaultValue === null
                        ? '<i>null</i>'
                        : formatValue(param.defaultValue);

            text.innerHTML = `${param.label}: <span id="${ID_PREFIX}${param.name}">${formattedValue}</span>`;
        },

        updateUi(param, newValue) {
            const formattedValue =
                newValue === undefined
                    ? '<i>undefined</i>'
                    : newValue === null
                        ? '<i>null</i>'
                        : formatValue(newValue);

            document.getElementById(ID_PREFIX + param.name)
                .innerHTML = formattedValue;
        },
    };
}

/**
 * For a keyboard key's internal name (event.key), return the UI display name
 * @param {string} key
 * @returns {string}
 */
function formatKey(key) {
    switch (key) {
        case ' ': return 'Space';
        default:  return key.toUpperCase();
    }
}

/**
 * Available value types for reactive properties.
 * 
 * @type {Object.<string, ValueType>}
 */
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

/**
 * Register a custom value type.
 * 
 * @param {string} name 
 * @param {ValueType} definition 
 */
export function defineType(name, definition) {
    types[name] = definition;
}

/**
 * Create a reactive state based on a schema.
 * 
 * @param {Schema} schema
 * @returns {ReactiveState}
 */
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

/**
 * Create HTML UI for a reactive state.
 * 
 * @param {ReactiveState} state Reactive state which the UI is created for
 * @param {HTMLElement} root HTML element to which the UI should be added as children
 * @returns {void}
 */
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

/**
 * Updates the HTML UI whenever a property's value of a reactive state is changed.
 * 
 * @param {string} name Name of the changed property
 * @param {any} value The new value
 * @param {Schema} schema The schema that the property belongs to
 * @returns {void}
 */
function updateUiFor(name, value, schema) {
    const param = schema.find(param => param.name === name);
    if (!param) throw `Trying to set value of the parameter ${name}, which is not in the schema`;

    types[param.type].updateUi(param, value);
}
