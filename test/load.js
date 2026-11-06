// Loads the browser scripts into Node's global scope for testing.
require('../js/units.js');
require('../js/species.js');
require('../js/engine.js');
module.exports = globalThis.CB;
