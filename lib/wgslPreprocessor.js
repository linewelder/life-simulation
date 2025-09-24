/**
 * @file Custom preprocessor for WGSL shaders.
 * 
 * Features:
 * 
 * File includes
 * 
 *      ```
 *      #include "url"
 *      ```
 * 
 *      Replaces the line with the directive with the contents of the requested file
 *      applying the preprocessor to its contents.
 * 
 *      URL must include the full path to the file.
 * 
 * Defined symbols
 * 
 *      ```
 *      var test = DEFINED_SYM_NAME;
 *      ```
 * 
 *      Substitutes references to the symbol for the contents. Just like the C preprocessor.
 */

/**
 * Constant definitions that should be added to the shader's code.
 * @typedef {Object} DefinedSymbol
 * @prop {string} type
 * @prop {string} value
 */

/**
 * Load a shader source from a file applying preprocessing.
 * 
 * @param {string} url 
 * @param {Object.<string, DefinedSymbol>} definedSymbols Similar to the C's preprocessor,
 * all references are substituted with the given value.
 */
export async function loadShader(url, definedSymbols = {}) {
    try {
        return await preprocessShader(await loadSourceFromUrl(url), definedSymbols);
    } catch (error) {
        throw `Failed to load shader "${url}": ${error}`;
    }
}

/**
 * Load a shader source from a file.
 * Return the error if failed.
 * 
 * @param {string} url
 */
async function loadSourceFromUrl(url) {
    const response = await fetch(url);
    if (!response.ok) {
        throw response.statusText;
    }

    return await response.text();
}

/**
 * Apply preprocessor to the WGSL source.
 * 
 * @param {string} source
 * @param {Object.<string, any>} definedSymbols
 */
async function preprocessShader(source, definedSymbols = {}) {
    let code = '';
    const lines = source.split('\n');

    let lineNum = 1;
    for (const line of lines) {
        if (line.startsWith('#include')) {
            const openingQuote = line.indexOf('"');
            if (openingQuote < 0) {
                throw `Line ${lineNum}: #include must be followed by a quoted ("") URL of the file to load`;
            }

            const closingQuote = line.indexOf('"', openingQuote + 1);
            if (closingQuote < 0) {
                throw `Line ${lineNum}: Missing closing " after the file URL`;
            }

            const url = line.slice(openingQuote + 1, closingQuote);
            try {
                const includedCode = await loadSourceFromUrl(url);

                code += `// PREPROCESSOR: Include "${url}"\n`;
                code += includedCode;
                code += `// PREPROCESSOR: End of Include "${url}"\n`;
            } catch (error) {
                throw `Line ${lineNum}: Failed to include "${url}": ${error}`;
            }
        } else {
            code += line + '\n';
        }

        lineNum++;
    }

    code = substituteSymbols(code, definedSymbols);

    return code;
}

/**
 * Substitute the given symbols in the source.
 * 
 * @param {string} source
 * @param {Object.<string, any>} definedSymbols
 */
function substituteSymbols(source, definedSymbols = {}) {
    let temp = source;

    for (const symbol in definedSymbols) {
        // Do not match parts of symbol names
        const boundaryChar = /[^A-Z]/;
        const regex = RegExp(`(?<!${boundaryChar})${symbol}(?!${boundaryChar})`, 'g');
        temp = temp.replace(regex, definedSymbols[symbol]);
    }

    return temp;
}
