// The species library: your woods, their preview colours, price per board
// foot and where you last bought them.
(function (root) {
  'use strict';
  const CB = (root.CB = root.CB || {});

  let counter = 0;
  function uid(prefix = 'sp') {
    counter += 1;
    return `${prefix}_${Date.now().toString(36)}${counter.toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  }

  function newSpecies(name = 'New species', color = '#b08a5a') {
    return { id: uid(), name, color, price: null, supplier: '', lastBought: '', notes: '' };
  }

  // Starting list. Prices start blank for you to fill in.
  function defaults() {
    return [
      ['sp_maple', 'Hard maple', '#ead9b8'],
      ['sp_walnut', 'Black walnut', '#4b3428'],
      ['sp_cherry', 'Cherry', '#a8603c'],
      ['sp_purpleheart', 'Purpleheart', '#6e2f55'],
      ['sp_padauk', 'Padauk', '#c4461f'],
      ['sp_whiteoak', 'White oak', '#c8a679'],
      ['sp_yellowheart', 'Yellowheart', '#e3b53b'],
    ].map(([id, name, color]) => ({ id, name, color, price: null, supplier: '', lastBought: '', notes: '' }));
  }

  function normalize(list) {
    if (!Array.isArray(list)) return defaults();
    return list
      .filter((s) => s && typeof s === 'object' && typeof s.id === 'string')
      .map((s) => ({
        id: s.id,
        name: String(s.name || 'Unnamed'),
        color: /^#[0-9a-f]{6}$/i.test(s.color) ? s.color : '#b08a5a',
        price: Number.isFinite(Number(s.price)) && s.price !== null && s.price !== '' ? Number(s.price) : null,
        supplier: String(s.supplier || ''),
        lastBought: String(s.lastBought || ''),
        notes: String(s.notes || ''),
      }));
  }

  function byId(list, id) {
    return list.find((s) => s.id === id) || { id, name: 'Unknown species', color: '#999999', price: null };
  }

  CB.species = { uid, newSpecies, defaults, normalize, byId };
})(typeof window !== 'undefined' ? window : globalThis);
