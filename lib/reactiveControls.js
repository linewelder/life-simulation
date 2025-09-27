/**
 * @file Allows easy creation of 'Properties'-style interfaces which 
 * reactively update and allow editing by the user.
 */

/**
 * Prefix added to HTML control element class names.
 */
export const CLASS_PREFIX = 'ctrl-';

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
 * @property {function(HTMLElement, Param, function(any)): void} createUi Create initial HTML UI
 * @property {function(Param, any): void} updateUi Update the existing HTML UI when a value is changed
 */

/**
 * Create a generic value type.
 * 
 * @param {string} inputType Type of the HTML input element
 * @param {function(any): any} formatValue Converts internal value to input.value
 * @param {function(any): any} parseValue Converts input.value back to internal value.
 * Returns undefined if value is invalid
 * @returns {ValueType}
 */
function genericValueType(inputType, formatValue, parseValue) {
    return {
        createUi(wrapper, param, setValue) {
            const input = document.createElement('input');
            input.type = inputType;
            input.id = ID_PREFIX + param.name;
            input.autocomplete = false;
            input.disabled = !param.editable;
            input.value = formatValue(param.defaultValue);

            input.onchange = e => {
                const parsed = parseValue(e.target.value);
                if (parsed !== undefined) {
                    setValue(parsed);
                }
            };

            const label = document.createElement('label');
            label.innerText = param.label;
            label.htmlFor = input.id;

            wrapper.appendChild(label);
            wrapper.appendChild(input);
        },

        updateUi(param, newValue) {
            document.getElementById(ID_PREFIX + param.name)
                .value = formatValue(newValue);
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
    number: genericValueType(
        'number',
        x => x,
        x => x === '' ? undefined : x,
    ),

    percent: genericValueType(
        'text',
        x => `${Math.floor(x * 100)}%`,
        x => {
            const parsed = +x.replace(/%$/, '');
            return isNaN(parsed) ? undefined : parsed / 100;
        },
    ),

    vector2: {
        createUi(wrapper, param, setValue) {
            const label = document.createElement('label');
            label.innerText = param.label;
            wrapper.appendChild(label);

            const value = param.defaultValue ?? ['', ''];

            const valueX = document.createElement('input');
            valueX.id = ID_PREFIX + param.name + '-x';
            valueX.value = value[0];
            valueX.disabled = !param.editable;
            wrapper.appendChild(valueX);

            const valueY = document.createElement('input');
            valueY.id = ID_PREFIX + param.name + '-y';
            valueY.value = value[1];
            valueY.disabled = !param.editable;
            wrapper.appendChild(valueY);

            const onChange = () => {
                const x = valueX.value;
                const y = valueY.value;
                if (x !== '' && y !== '') {
                    setValue([x, y]);
                }
            };
            valueX.onchange = onChange;
            valueY.onchange = onChange;
        },

        updateUi(param, newValue) {
            const value = newValue ?? ['', ''];

            document.getElementById(ID_PREFIX + param.name + '-x')
                .value = value[0];

            document.getElementById(ID_PREFIX + param.name + '-y')
                .value = value[1];
        },
    },

    key: {
        createUi(wrapper, param, setValue) {
            const label = document.createElement('label');
            label.innerText = param.label;
            wrapper.appendChild(label);


            const value = document.createElement('div');
            value.id = ID_PREFIX + param.name;
            value.innerHTML = `<kbd>${formatKey(param.defaultValue)}</kbd>`;
            value.disabled = true;
            wrapper.appendChild(value);
        },

        updateUi(param, newValue) {
            document.getElementById(ID_PREFIX + param.name)
                .innerHTML = `<kbd>${formatKey(newValue)}</kbd>`;
        },
    },

    enum: {
        createUi(wrapper, param, setValue) {
            const text = document.createElement('label');
            text.innerText = param.label;
            wrapper.appendChild(text);

            for (const value of param.values) {
                const valueId = ID_PREFIX + param.name + '-' + value.value;

                const valueLabel = document.createElement('label');
                valueLabel.htmlFor = valueId;
                wrapper.appendChild(valueLabel);

                const valueRadio = document.createElement('input');
                valueRadio.type = 'radio';
                valueRadio.id = valueId;
                valueRadio.name = param.name;
                valueRadio.value = value.value;
                valueRadio.checked = value.value === param.defaultValue;
                valueRadio.disabled = !param.editable;
                valueRadio.onchange = () => setValue(value.value);
                valueRadio.autocomplete = false;
                valueLabel.appendChild(valueRadio);

                valueLabel.appendChild(document.createTextNode(value.label));
                
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
        createUi(wrapper, param, setValue) {
            const button = document.createElement('button');
            button.id = ID_PREFIX + param.name;
            button.innerText = param.label;
            button.onclick = () => setValue(null);
            wrapper.appendChild(button);
        },

        updateUi(param, newValue) {},
    },

    label: {
        createUi(wrapper, param, setValue) {
            const text = document.createElement('label');
            text.id = ID_PREFIX + param.name;
            text.innerText = param.defaultValue;
            wrapper.appendChild(text);
        },

        updateUi(param, newValue) {
            document.getElementById(ID_PREFIX + param.name)
                .innerHTML = newValue;
        },
    },

    checkbox: {
        createUi(wrapper, param, setValue) {
            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.id = ID_PREFIX + param.name;
            checkbox.checked = param.defaultValue;
            checkbox.disabled = !param.editable;
            checkbox.autocomplete = false;
            checkbox.onchange = e => { setValue(e.target.checked); }

            const label = document.createElement('label');
            label.innerText = param.label;
            label.htmlFor = checkbox.id;

            wrapper.appendChild(label);
            wrapper.appendChild(checkbox);
        },

        updateUi(param, newValue) {
            document.getElementById(ID_PREFIX + param.name)
                .checked = newValue;
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
        wrapper.classList.add(CLASS_PREFIX + 'param-wrapper');
        wrapper.classList.add(CLASS_PREFIX + 'param-' + param.type);
        root.appendChild(wrapper);

        types[param.type].createUi(
            wrapper, param,
            (value) => { state[param.name] = value; }
        );
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
