import { defineType } from '/util/reactiveControls.js';
import genomeType from './genome.js';

/**
 * Register custom value types for reactive controls.
 */
export function registerCustomTypes() {
    defineType('genome', genomeType);
}
