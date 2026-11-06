// Saving designs, the species library and settings in this browser, plus
// backup files to move everything to another device.
(function (root) {
  'use strict';
  const CB = (root.CB = root.CB || {});

  const KEYS = {
    designs: 'cutting-board-designer.designs',
    species: 'cutting-board-designer.species',
    prefs: 'cutting-board-designer.prefs',
    current: 'cutting-board-designer.current',
  };
  const FORMAT = 'cutting-board-designer';

  function get(key, fallback) {
    try {
      const v = JSON.parse(localStorage.getItem(key));
      return v == null ? fallback : v;
    } catch (e) {
      return fallback;
    }
  }
  function set(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (e) {
      return false;
    }
  }

  function allDesigns() {
    const all = get(KEYS.designs, {});
    return all && typeof all === 'object' ? all : {};
  }

  function listDesigns() {
    return Object.values(allDesigns())
      .filter((d) => d && d.id)
      .map((d) => ({ id: d.id, name: d.name, savedAt: d.savedAt || '', pattern: d.pattern }))
      .sort((a, b) => b.savedAt.localeCompare(a.savedAt));
  }

  function saveDesign(design) {
    const all = allDesigns();
    design.savedAt = new Date().toISOString();
    all[design.id] = design;
    return set(KEYS.designs, all);
  }

  function loadDesign(id) {
    const d = allDesigns()[id];
    return d ? CB.engine.normalizeDesign(d) : null;
  }

  function deleteDesign(id) {
    const all = allDesigns();
    delete all[id];
    set(KEYS.designs, all);
  }

  const loadSpecies = () => CB.species.normalize(get(KEYS.species, null));
  const saveSpecies = (list) => set(KEYS.species, list);

  const loadPrefs = () => ({ units: 'in', precision: 16, defaults: null, ...get(KEYS.prefs, {}) });
  const savePrefs = (p) => set(KEYS.prefs, p);

  const loadCurrent = () => {
    const d = get(KEYS.current, null);
    try {
      return d ? CB.engine.normalizeDesign(d) : null;
    } catch (e) {
      return null;
    }
  };
  const saveCurrent = (d) => set(KEYS.current, d);

  // One file holding everything, or a single design.
  function backup(onlyDesign) {
    return {
      format: FORMAT,
      version: 1,
      exportedAt: new Date().toISOString(),
      designs: onlyDesign ? [onlyDesign] : Object.values(allDesigns()),
      species: loadSpecies(),
      prefs: onlyDesign ? undefined : loadPrefs(),
    };
  }

  // Merges a backup file in. Species are added or updated by id; designs
  // are added or replaced by id. Returns what was loaded.
  function restore(data) {
    if (!data || data.format !== FORMAT) throw new Error('This isn’t a Cutting Board Designer file.');
    const designs = (Array.isArray(data.designs) ? data.designs : []).map((d) => CB.engine.normalizeDesign(d));
    const all = allDesigns();
    for (const d of designs) all[d.id] = d;
    set(KEYS.designs, all);
    const incoming = CB.species.normalize(data.species || []);
    const list = loadSpecies();
    for (const s of incoming) {
      const i = list.findIndex((x) => x.id === s.id);
      if (i >= 0) list[i] = s;
      else list.push(s);
    }
    saveSpecies(list);
    if (data.prefs && typeof data.prefs === 'object') savePrefs({ ...loadPrefs(), ...data.prefs });
    return { designs, species: incoming.length };
  }

  function download(filename, text, type = 'application/json') {
    const blob = new Blob([text], { type });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      URL.revokeObjectURL(a.href);
      a.remove();
    }, 0);
  }

  CB.storage = {
    listDesigns,
    saveDesign,
    loadDesign,
    deleteDesign,
    loadSpecies,
    saveSpecies,
    loadPrefs,
    savePrefs,
    loadCurrent,
    saveCurrent,
    backup,
    restore,
    download,
  };
})(typeof window !== 'undefined' ? window : globalThis);
