
let elements = null; // will be populated after DOM checks

const cache = new Map();
const speciesCache = new Map();
const typeCache = new Map();
window.requestCount = 0; // expose request count for debugging
let currentPokemonId = null;
let allPokemon = null;

// If the page doesn't include the app DOM (e.g. index.html), skip binding the
// app-specific event listeners to avoid "cannot read property 'addEventListener' of null" errors.
if (!document.getElementById('search')) {
  console.warn('app.js: app DOM not found — skipping app initialization');
} else {
  // populate elements now that we know the app DOM exists
  elements = {
    search: document.getElementById('search'),
    searchBtn: document.getElementById('searchBtn'),
    randomBtn: document.getElementById('randomBtn'),
    generation: document.getElementById('generation'),
    datalist: document.getElementById('poke-list'),
    spriteWrap: document.getElementById('spriteWrap'),
    pokeName: document.getElementById('pokeName'),
    pokeId: document.getElementById('pokeId'),
    typeBadges: document.getElementById('typeBadges'),
    abilities: document.getElementById('abilities'),
    stats: document.getElementById('stats'),
    moves: document.getElementById('moves'),
    detailsArea: document.getElementById('detailsArea'),
    prevBtn: document.getElementById('prevBtn'),
    nextBtn: document.getElementById('nextBtn'),
    favorites: document.getElementById('favorites'),
  };
// --- Favorites ---
function loadFavorites() {
  try {
    return JSON.parse(localStorage.getItem('pkm_favs') || '[]');
  } catch (e) {
    return [];
  }
}

function saveFavorites(list) {
  localStorage.setItem('pkm_favs', JSON.stringify(list));
}

function toggleFavorite(p) {
  const f = loadFavorites();
  const idx = f.indexOf(p);
  if (idx >= 0) {
    f.splice(idx, 1);
  } else {
    f.push(p);
  }
  saveFavorites(f);
  renderFavorites();
}

function renderFavorites() {
  const f = loadFavorites();
  elements.favorites.innerHTML = '';
  if (f.length === 0) {
    elements.favorites.innerHTML = '<div class="muted">No favorites yet</div>';
    return;
  }
  f.forEach((name) => {
    const b = document.createElement('button');
    b.textContent = name;
    b.addEventListener('click', () => loadAndShow(name));
    elements.favorites.appendChild(b);
  });
}

// --- Fetch helpers ---
async function fetchJson(url) {
  window.requestCount = (window.requestCount || 0) + 1;
  // console.log('fetch:', url, 'count:', window.requestCount);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return await res.json();
}

async function loadAllPokemon() {
  if (allPokemon) return allPokemon;
  try {
    const data = await fetchJson('https://pokeapi.co/api/v2/pokemon?limit=3000');
    allPokemon = data.results.map((r) => r.name);
    elements.datalist.innerHTML = allPokemon
      .map((n) => `<option value="${n}"></option>`)
      .join('\n');
    return allPokemon;
  } catch (err) {
    console.warn('Could not fetch pokemon list', err);
    elements.datalist.innerHTML = '';
    return [];
  }
}


// --- Generations ---
const genRanges = {
  '1': { start: 1, end: 151 },
  '2': { start: 152, end: 251 },
  '3': { start: 252, end: 386 },
  all: { start: 1, end: 2000 },
};

function randomIdForGen(gen) {
  const r = genRanges[gen] || genRanges['all'];
  const min = r.start,
    max = r.end;
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

// --- Pokémon API ---
async function getPokemon(nameOrId) {
  const key = String(nameOrId).toLowerCase();
  if (cache.has(key)) return cache.get(key);

  const data = await fetchJson(
    `https://pokeapi.co/api/v2/pokemon/${encodeURIComponent(key)}`
  );
  cache.set(key, data);
  if (data.id) cache.set(String(data.id), data);
  if (data.name) cache.set(data.name.toLowerCase(), data);
  return data;
}

// --- Rendering ---
function clearCard() {
  elements.spriteWrap.innerHTML =
    '<div class="center muted">Search for a Pokémon to see details</div>';
  elements.pokeName.textContent = '—';
  elements.pokeId.textContent = '#—';
  elements.typeBadges.innerHTML = '';
  elements.abilities.innerHTML = '';
  elements.stats.innerHTML = '';
  elements.moves.innerHTML = '';
  elements.detailsArea.textContent = 'No Pokémon selected.';
  currentPokemonId = null;
}

function makeBadge(text) {
  const d = document.createElement('div');
  d.className = 'badge';
  d.textContent = text;
  return d;
}

function renderPokemon(data) {
  if (!data) return clearCard();

  currentPokemonId = data.id;
  const imgUrl =
    data.sprites.other?.['official-artwork']?.front_default ||
    data.sprites.front_default ||
    '';
  elements.spriteWrap.innerHTML = '';
  if (imgUrl) {
    const img = document.createElement('img');
    img.src = imgUrl;
    img.alt = data.name;
    elements.spriteWrap.appendChild(img);
  } else {
    elements.spriteWrap.innerHTML = '<div class="center muted">No image</div>';
  }

  elements.pokeName.textContent = capitalize(data.name);
  elements.pokeId.textContent = `#${data.id}`;

  elements.typeBadges.innerHTML = '';
  data.types.forEach((t) =>
    elements.typeBadges.appendChild(makeBadge(capitalize(t.type.name)))
  );

  elements.abilities.innerHTML = '';
  data.abilities.forEach((a) => {
    const b = makeBadge(
      a.ability.name + (a.is_hidden ? ' (hidden)' : '')
    );
    elements.abilities.appendChild(b);
  });

  elements.stats.innerHTML = '';
  data.stats.forEach((s) => {
    const row = document.createElement('div');
    row.className = 'stat-row';
    const name = document.createElement('div');
    name.className = 'stat-name';
    name.textContent = s.stat.name;
    const bar = document.createElement('div');
    bar.className = 'stat-bar';
    const fill = document.createElement('div');
    fill.className = 'stat-fill';
    const val = Math.min(255, s.base_stat);
    fill.style.width = `${(val / 255) * 100}%`;
    bar.appendChild(fill);
    row.appendChild(name);
    row.appendChild(bar);
    elements.stats.appendChild(row);
  });

  elements.moves.innerHTML = '';
  data.moves.slice(0, 8).forEach((m) => {
    elements.moves.appendChild(makeBadge(m.move.name));
  });

  elements.detailsArea.textContent = 'Loading species info...';
  if (speciesCache.has(data.id)) {
    const spec = speciesCache.get(data.id);
    const flavor = (spec.flavor_text_entries || []).find(
      (e) => e.language.name === 'en'
    );
    const genus =
      (spec.genera || []).find((g) => g.language.name === 'en')?.genus || '';
    elements.detailsArea.innerHTML = `Genus: <strong>${
      genus || '—'
    }</strong><br><br>${
      flavor
        ? flavor.flavor_text.replace(/\\n|\\f/g, ' ')
        : 'No flavor text available.'
    }`;
  } else {
    fetchJson(`https://pokeapi.co/api/v2/pokemon-species/${data.id}`)
      .then((spec) => {
        speciesCache.set(data.id, spec);
      const flavor = (spec.flavor_text_entries || []).find(
        (e) => e.language.name === 'en'
      );
      const genus =
        (spec.genera || []).find((g) => g.language.name === 'en')?.genus || '';
      elements.detailsArea.innerHTML = `Genus: <strong>${
        genus || '—'
      }</strong><br><br>${
        flavor
          ? flavor.flavor_text.replace(/\\n|\\f/g, ' ')
          : 'No flavor text available.'
      }`;
    })
    .catch(() => {
      elements.detailsArea.textContent = 'No species/flavor info available.';
    });
  }

  // Favorite button
  const favBtn = document.createElement('button');
  favBtn.textContent = '♡ Favorite';
  favBtn.addEventListener('click', () => {
    toggleFavorite(data.name);
    favBtn.textContent = loadFavorites().includes(data.name)
      ? '♥ Favorited'
      : '♡ Favorite';
  });
  const ftr = document.querySelector('.footer');
  if (ftr) {
    const existing = ftr.querySelector('.fav-btn');
    if (existing) existing.remove();
    favBtn.className = 'fav-btn';
    favBtn.style.marginLeft = '8px';
    // insert before the third child if present, otherwise append
    if (ftr.children.length >= 3) ftr.insertBefore(favBtn, ftr.children[2]);
    else ftr.appendChild(favBtn);
  }
}

function capitalize(s) {
  return String(s).replace(/(^|-)./g, (ch) => ch.toUpperCase());
}

async function loadAndShow(nameOrId) {
  if (!nameOrId) return;
  try {
    elements.spriteWrap.innerHTML =
      '<div class="center muted">Loading…</div>';
    const data = await getPokemon(nameOrId);
    renderPokemon(data);
  } catch (err) {
    console.error(err);
    elements.spriteWrap.innerHTML =
      `<div class="center muted">Pokémon not found.</div>`;
    elements.pokeName.textContent = 'Not found';
    elements.pokeId.textContent = '#—';
    elements.typeBadges.innerHTML = '';
    elements.abilities.innerHTML = '';
    elements.stats.innerHTML = '';
    elements.moves.innerHTML = '';
    elements.detailsArea.textContent =
      'Could not load data — check name or id.';
  }
}

// --- Event bindings ---
elements.searchBtn.addEventListener('click', () =>
  loadAndShow(elements.search.value.trim().toLowerCase())
);

elements.search.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    loadAndShow(elements.search.value.trim().toLowerCase());
  }
});

elements.randomBtn.addEventListener('click', () => {
  const id = randomIdForGen(elements.generation.value);
  loadAndShow(String(id));
});

elements.prevBtn.addEventListener('click', () => {
  if (!currentPokemonId) return;
  loadAndShow(String(Math.max(1, currentPokemonId - 1)));
});

elements.nextBtn.addEventListener('click', () => {
  if (!currentPokemonId) return;
  loadAndShow(String(currentPokemonId + 1));
});

document.querySelectorAll('.filter').forEach((btn) => {
  btn.addEventListener('click', async () => {
    const type = btn.dataset.type;
    elements.detailsArea.textContent = `Loading a random ${type}-type Pokémon...`;
    try {
      let data;
      if (typeCache.has(type)) {
        data = typeCache.get(type);
      } else {
        data = await fetchJson(
          `https://pokeapi.co/api/v2/type/${encodeURIComponent(type)}`
        );
        typeCache.set(type, data);
      }
      const pokemonList = data.pokemon.map((p) => p.pokemon.name);
      const pick =
        pokemonList[Math.floor(Math.random() * pokemonList.length)];
      loadAndShow(pick);
    } catch (err) {
      elements.detailsArea.textContent = 'Could not load type data.';
    }
  });
});

elements.search.addEventListener('focus', () => {
  loadAllPokemon();
});

elements.generation.addEventListener('change', () => {
  const gen = elements.generation.value;
  if (gen === 'all') {
    if (allPokemon)
      elements.datalist.innerHTML = allPokemon
        .map((n) => `<option value="${n}"></option>`)
        .join('\n');
  } else {
    const range = genRanges[gen];
    fetchJson('https://pokeapi.co/api/v2/pokemon?limit=2000')
      .then((data) => {
        const slice = data.results.slice(range.start - 1, range.end);
        elements.datalist.innerHTML = slice
          .map((r) => `<option value="${r.name}"></option>`)
          .join('\n');
      })
      .catch(() => {});
  }
});

// --- Init ---
(function init() {
  // Initialize footer filters
  document.querySelectorAll('.footer-filters .filter').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const type = btn.dataset.type;
      elements.detailsArea.textContent = `Loading a random ${type}-type Pokémon...`;
      try {
        let data;
        if (typeCache.has(type)) {
          data = typeCache.get(type);
        } else {
          data = await fetchJson(
            `https://pokeapi.co/api/v2/type/${encodeURIComponent(type)}`
          );
          typeCache.set(type, data);
        }
        const pokemonList = data.pokemon.map((p) => p.pokemon.name);
        const pick =
          pokemonList[Math.floor(Math.random() * pokemonList.length)];
        loadAndShow(pick);
      } catch (err) {
        elements.detailsArea.textContent = 'Could not load type data.';
      }
    });
  });

  renderFavorites();
  loadAllPokemon().catch(() => {});
})();

} // end app DOM guard