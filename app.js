// Items wishlist viewer. Item records come from common.js (catalog.data.js merged with items.data.js).
(function () {
  const {
    esc, fmt, published, items, itemById, availability, availabilityLabel, bestPrice,
    Owned, Wishlist, onChange, renderPendingBanner, ownedToggle, wishlistControl, thingsToKnow, tagClass,
  } = window.Gear;
  const Filters = window.ItemFilters;
  const catalogMeta = window.ITEM_CATALOG_META || {};

  const CATEGORY_ORDER = ["Weapons", "Attachments", "Armor", "Clothing", "Tools", "Medical & food"];
  const SLOT_ORDER = ["Helmet", "Core", "Arms", "Legs", "Backpack", "Undersuit"];

  const SCOPE_KEY = "sc-items-wishlist:scope";
  let savedScope = "all";
  try { savedScope = localStorage.getItem(SCOPE_KEY) || (Object.keys(Wishlist.all()).length ? "wishlist" : "all"); } catch (e) { /* storage unavailable */ }
  const state = { scope: savedScope, query: "", category: "", availability: "", owned: "", sort: "list", selected: null };

  const $ = (id) => document.getElementById(id);

  // Search text doesn't depend on user state, so build it once.
  const haystacks = new Map(
    items.map((s) => [
      s.id,
      [
        s.name, s.manufacturer, s.category, s.type, s.weight, s.weaponClass, s.damage, s.rarity, s.event,
        s.description, s.notes,
        ...s.facts.map(([k, v]) => `${k} ${v}`),
        ...(s.thingsToKnow || []).map((t) => t.text),
        ...s.buy.map((b) => b.location),
      ].filter(Boolean).join(" ").toLowerCase(),
    ])
  );

  // Armor sets: pieces whose names match once the slot word is removed
  // ("Citadel Arms Roughshod" and "Citadel Core Roughshod").
  const setKey = (s) =>
    s.category === "Armor" && s.type !== "Undersuit"
      ? s.name.toLowerCase().replace(/\b(arms|core|legs|helmet|backpack|torso|chest)\b/g, " ").replace(/\s+/g, " ").trim()
      : null;
  const sets = new Map();
  for (const s of items) {
    const k = setKey(s);
    if (k) sets.set(k, [...(sets.get(k) || []), s]);
  }
  const setOf = (s) => {
    const pieces = sets.get(setKey(s)) || [];
    return pieces.length > 1 ? pieces.slice().sort((a, b) => SLOT_ORDER.indexOf(a.type) - SLOT_ORDER.indexOf(b.type)) : [];
  };

  // In the wishlist, items are grouped by my wishlist group; in "All items", by category.
  const categoryOf = (s) => (state.scope === "wishlist" ? Wishlist.group(s.id) : s.category);
  const categories = () => {
    if (state.scope === "wishlist") return Wishlist.groups();
    const present = new Set(items.map((s) => s.category));
    return [...CATEGORY_ORDER.filter((c) => present.has(c)), ...[...present].filter((c) => !CATEGORY_ORDER.includes(c))];
  };
  const inScope = () => (state.scope === "wishlist" ? items.filter((s) => Wishlist.isWanted(s.id)) : items);

  function filtered() {
    const terms = Filters.parse(state.query);
    const out = inScope().filter(
      (s) =>
        (!state.category || categoryOf(s) === state.category) &&
        (!state.availability || availability(s) === state.availability) &&
        (!state.owned || (state.owned === "owned") === Owned.isOwned(s.id)) &&
        Filters.matches(terms, s, haystacks.get(s.id))
    );
    const priceKey = (s, dir) => bestPrice(s) ?? (dir > 0 ? Infinity : -Infinity);
    const byName = (a, b) => a.name.localeCompare(b.name);
    if (state.sort === "list") {
      if (state.scope === "wishlist") {
        // Group order, then the order items were added within the group.
        const groups = Wishlist.groups();
        const ids = Object.keys(Wishlist.all());
        out.sort((a, b) => groups.indexOf(Wishlist.group(a.id)) - groups.indexOf(Wishlist.group(b.id)) || ids.indexOf(a.id) - ids.indexOf(b.id));
      } else {
        out.sort((a, b) => CATEGORY_ORDER.indexOf(a.category) - CATEGORY_ORDER.indexOf(b.category) || a.type.localeCompare(b.type) || byName(a, b));
      }
    }
    if (state.sort === "price-asc") out.sort((a, b) => priceKey(a, 1) - priceKey(b, 1) || byName(a, b));
    if (state.sort === "price-desc") out.sort((a, b) => priceKey(b, -1) - priceKey(a, -1) || byName(a, b));
    if (state.sort === "name") out.sort(byName);
    if (state.sort === "manufacturer") out.sort((a, b) => a.manufacturer.localeCompare(b.manufacturer) || byName(a, b));
    if (state.sort.startsWith("stat:") || state.sort.startsWith("statlow:")) {
      // "stat:" sorts highest first, "statlow:" lowest first. Items with no data go last.
      const low = state.sort.startsWith("statlow:");
      const field = Filters.numField(state.sort.split(":")[1]);
      const val = (s) => field.get(s);
      out.sort((a, b) => {
        const va = val(a), vb = val(b);
        if (va == null || vb == null) return (va == null) - (vb == null) || byName(a, b);
        return (low ? va - vb : vb - va) || byName(a, b);
      });
    }
    return out;
  }

  function renderScope() {
    const wanted = items.filter((s) => Wishlist.isWanted(s.id)).length;
    $("scope").innerHTML = [
      ["wishlist", "My wishlist", wanted],
      ["all", "All items", items.length],
    ]
      .map(([k, label, n]) => `<button class="tab${state.scope === k ? " on" : ""}" data-scope="${k}">${label} <span>${fmt(n)}</span></button>`)
      .join("");
  }

  function renderChips() {
    const pool = inScope();
    const cats = categories();
    if (state.category && !cats.includes(state.category)) state.category = "";
    $("categoryChips").innerHTML = ["", ...cats]
      .map((c) => {
        const count = c ? pool.filter((s) => categoryOf(s) === c).length : pool.length;
        return `<button class="chip${state.category === c ? " on" : ""}" data-cat="${esc(c)}">${esc(c || "All")} <span>${fmt(count)}</span></button>`;
      })
      .join("");
  }

  const subLine = (s) => [s.manufacturer, s.weight ? `${s.weight} ${s.type.toLowerCase()}` : s.type, s.weaponClass].filter(Boolean).map(esc).join(" · ");

  function renderList() {
    const list = filtered();
    if (state.selected && !list.some((s) => s.id === state.selected)) state.selected = null;
    if (!state.selected && list.length) state.selected = list[0].id;

    // Show the numbers being filtered or sorted on, so rows are easy to compare.
    const shownKeys = Filters.numericKeys(Filters.parse(state.query));
    const sortKey = state.sort.includes(":") ? state.sort.split(":")[1] : null;
    if (sortKey && !shownKeys.includes(sortKey)) shownKeys.push(sortKey);
    const shownFields = shownKeys.filter((k) => k !== "price").map(Filters.numField);
    const statLine = (s) => {
      const parts = shownFields.map((f) => Filters.formatValue(f, s) || `${f.label} ?`);
      return parts.length ? `<span class="row-stats">${parts.map(esc).join(" · ")}</span>` : "";
    };

    // Thousands of items: cap the rows drawn so typing stays snappy.
    const LIMIT = 300;
    $("list").innerHTML = list.length
      ? list
          .slice(0, LIMIT)
          .map((s) => {
            const a = availability(s);
            const price = bestPrice(s);
            const owned = Owned.isOwned(s.id);
            const wanted = Wishlist.isWanted(s.id);
            const cat = categoryOf(s);
            return `<li class="row${s.id === state.selected ? " active" : ""}${owned ? " owned" : ""}">
              <span class="row-controls">
                <button type="button" class="star${wanted ? " on" : ""}" data-wish="${esc(s.id)}" title="${wanted ? "Remove from" : "Add to"} wishlist" aria-label="${wanted ? "Remove" : "Add"} ${esc(s.name)} ${wanted ? "from" : "to"} wishlist">${wanted ? "★" : "☆"}</button>
                <input type="checkbox" class="row-check" data-owned="${esc(s.id)}"${owned ? " checked" : ""} title="Owned" aria-label="Owned ${esc(s.name)}">
              </span>
              <a href="#${esc(s.id)}" class="row-link">
                <div class="row-main">
                  <strong>${esc(s.name)}</strong>
                  <span class="sub">${subLine(s)}</span>
                  ${statLine(s)}
                </div>
                <div class="row-side">
                  <span class="${tagClass(cat)}">${esc(cat)}</span>
                  <span class="price ${a}">${price != null ? fmt(price) + " aUEC" : availabilityLabel[a]}</span>
                </div>
              </a>
            </li>`;
          })
          .join("") + (list.length > LIMIT ? `<li class="empty">${fmt(list.length - LIMIT)} more. Narrow the search to see them.</li>` : "")
      : `<li class="empty">${state.scope === "wishlist" && !state.query ? "Nothing here yet. Switch to All items and tap ☆ to add some." : "No items match."}</li>`;

    const pool = inScope();
    const ownedCount = pool.filter((s) => Owned.isOwned(s.id)).length;
    if (state.scope === "wishlist") {
      const buyable = list.filter((s) => !Owned.isOwned(s.id) && bestPrice(s) != null);
      const total = buyable.reduce((sum, s) => sum + bestPrice(s), 0);
      $("total").innerHTML = `
        <span>${ownedCount} / ${pool.length} owned · ${buyable.length} shown still to buy for</span>
        <strong>${fmt(total)} aUEC</strong>`;
    } else {
      $("total").innerHTML = `<span>${fmt(list.length)} shown · ${ownedCount} owned</span>`;
    }
  }

  function statRow(label, value, unit) {
    if (value == null || value === "") return "";
    const v = typeof value === "number" ? fmt(value) : esc(value);
    return `<div class="stat"><dt>${esc(label)}</dt><dd>${v}${unit ? ` <small>${unit}</small>` : ""}</dd></div>`;
  }

  function statsFor(s) {
    const st = s.stats;
    const temp = st.tempMin != null || st.tempMax != null ? `${st.tempMin ?? "?"} / ${st.tempMax ?? "?"}` : null;
    return [
      statRow("DPS", st.dps),
      statRow("Damage per shot", st.alpha),
      statRow("Fire rate", st.rpm, "rpm"),
      statRow("Magazine", st.mag),
      statRow("Effective range", st.rangeM, "m"),
      statRow("Projectile speed", st.speed, "m/s"),
      statRow("Damage type", s.damage),
      statRow("Fire modes", s.modes),
      statRow("Attachments", s.attachments),
      statRow("Damage reduction", st.dr, "%"),
      statRow("Temperature", temp, "°C"),
      statRow("Radiation protection", st.rad, "REM"),
      statRow("Radiation scrub", st.radScrub, "REM/s"),
      statRow("Storage", st.storage, "K µSCU"),
      statRow("Zoom", st.zoom, "x"),
      statRow("Hunger", st.hunger),
      statRow("Thirst", st.thirst),
      statRow("Blood drug level", st.bdl),
      statRow("Size", st.size),
      statRow("Mass", st.massKg, "kg"),
      statRow("Rarity", s.rarity),
      ...s.facts.map(([k, v]) => statRow(k, v)),
    ].join("");
  }

  function howToGet(s) {
    const ways = [];
    if (s.buy.length) ways.push(`Sold at ${s.buy.length} shop${s.buy.length > 1 ? "s" : ""}`);
    if (s.loot) ways.push("Can be looted");
    if (s.craft) ways.push("Can be crafted");
    if (s.event) ways.push(`Event reward (${esc(s.event)})`);
    return ways.length ? ways.join(" · ") : "No known source. It may be a mission reward, a subscriber item, or not in the game yet.";
  }

  function buyTable(s) {
    if (!s.buy.length) return "";
    const best = bestPrice(s);
    const row = (b) =>
      `<tr${b.price === best ? ' class="best"' : ""}><td>${esc(b.location)}</td><td class="num">${fmt(b.price)}</td><td class="num muted">${esc(b.date || "")}${b.source === "cstone" ? " <small>cstone</small>" : ""}</td></tr>`;
    const head = `<thead><tr><th>Shop</th><th class="num">aUEC</th><th class="num">Checked</th></tr></thead>`;
    const SHOW = 8;
    const first = s.buy.slice(0, SHOW).map(row).join("");
    const rest = s.buy.slice(SHOW);
    return `<table>${head}<tbody>${first}</tbody></table>
      ${rest.length ? `<details class="more-shops"><summary>${rest.length} more shop${rest.length > 1 ? "s" : ""}</summary><table><tbody>${rest.map(row).join("")}</tbody></table></details>` : ""}`;
  }

  function setPieces(s) {
    const pieces = setOf(s);
    if (!pieces.length) return "";
    const priced = pieces.filter((p) => bestPrice(p) != null);
    const total = priced.reduce((sum, p) => sum + bestPrice(p), 0);
    return `<h3>Matching set</h3>
      <table><tbody>${pieces
        .map((p) => {
          const price = bestPrice(p);
          return `<tr${p.id === s.id ? ' class="current"' : ""}><td>${esc(p.type)}</td><td><a href="#${esc(p.id)}">${esc(p.name)}</a>${Owned.isOwned(p.id) ? ' <span class="owned-tag">owned</span>' : ""}</td><td class="num">${price != null ? fmt(price) : `<span class="muted">${availabilityLabel[availability(p)]}</span>`}</td></tr>`;
        })
        .join("")}
      ${priced.length > 1 ? `<tr class="set-total"><td></td><td>Whole set${priced.length < pieces.length ? ` (${priced.length} of ${pieces.length} pieces are sold)` : ""}</td><td class="num">${fmt(total)}</td></tr>` : ""}
      </tbody></table>`;
  }

  function renderDetail() {
    const s = itemById.get(state.selected);
    if (!s) {
      $("detail").innerHTML = `<p class="empty">Select an item.</p>`;
      return;
    }
    const a = availability(s);
    const links = [
      s.links.cstone && `<a href="${esc(s.links.cstone)}" target="_blank" rel="noopener">cstone ↗</a>`,
      s.links.uex && `<a href="${esc(s.links.uex)}" target="_blank" rel="noopener">UEX ↗</a>`,
      s.links.wiki && `<a href="${esc(s.links.wiki)}" target="_blank" rel="noopener">Wiki ↗</a>`,
    ].filter(Boolean).join("");
    const badgeCat = Wishlist.isWanted(s.id) ? Wishlist.group(s.id) : s.category;

    $("detail").innerHTML = `
      <div class="hero item-hero">
        ${s.image
          ? `<img src="${esc(s.image)}" alt="${esc(s.name)}" loading="lazy" referrerpolicy="no-referrer" onerror="this.replaceWith(Object.assign(document.createElement('div'),{className:'noimg',textContent:'No image'}))">`
          : `<div class="noimg">No image yet</div>`}
      </div>
      <div class="detail-head">
        <div>
          <h2>${esc(s.name)}</h2>
          <p class="sub">${subLine(s)}${s.category !== badgeCat ? ` · ${esc(s.category)}` : ""}</p>
        </div>
        <div class="badges">
          <span class="${tagClass(badgeCat)}">${esc(badgeCat)}</span>
          <span class="price ${a}">${bestPrice(s) != null ? `from ${fmt(bestPrice(s))} aUEC` : availabilityLabel[a]}</span>
        </div>
      </div>
      <div class="toggles">${wishlistControl(s)}${ownedToggle(s.id)}</div>
      ${s.description ? `<p class="desc">${esc(s.description)}</p>` : ""}
      <nav class="links">${links}</nav>

      ${thingsToKnow(s)}

      <h3>Stats</h3>
      <dl class="stats">${statsFor(s)}</dl>

      ${setPieces(s)}

      <h3>How to get it</h3>
      <p>${howToGet(s)}</p>
      ${buyTable(s)}

      <h3>My notes</h3>
      <p class="${s.notes ? "" : "muted"}">${s.notes ? esc(s.notes) : published ? "No notes yet." : "No notes yet. Add a record for this item in items.data.js."}</p>
    `;
  }

  const PANEL_KEY = "sc-items-wishlist:filters-open";
  let panelOpen = false;
  try { panelOpen = localStorage.getItem(PANEL_KEY) === "1"; } catch (e) { /* storage unavailable */ }

  function renderFilters() {
    const panel = $("filterPanel");
    const terms = Filters.parse(state.query);
    const structured = terms.filter((t) => t.kind !== "free").length;
    $("filtersToggle").innerHTML = `Filters${structured ? ` <span class="count">${structured}</span>` : ""}`;
    $("filtersToggle").setAttribute("aria-expanded", String(panelOpen));
    $("filtersToggle").classList.toggle("on", panelOpen);
    panel.hidden = !panelOpen;
    // Don't redraw the panel under the user's cursor; its controls already show what they typed.
    if (panelOpen && !panel.contains(document.activeElement)) Filters.renderPanel(panel, items, state.query);

    $("activeFilters").innerHTML = terms.length
      ? terms
          .map((t) => `<button type="button" class="filter-chip${t.kind === "free" ? " free" : ""}${t.neg ? " neg" : ""}" data-remove-term="${esc(t.raw)}" title="Remove">${esc(Filters.termLabel(t))} <span aria-hidden="true">×</span></button>`)
          .join("") + (terms.length > 1 ? `<button type="button" class="filter-chip clear" data-clear-filters>Clear all</button>` : "")
      : "";
  }

  function setQuery(q) {
    state.query = q;
    $("search").value = q;
    render();
    saveQueryToUrl();
  }

  // Keep the search in the address bar (index.html?q=...) so filtered views can be bookmarked.
  function saveQueryToUrl() {
    const url = new URL(location.href);
    if (state.query.trim()) url.searchParams.set("q", state.query.trim());
    else url.searchParams.delete("q");
    try { history.replaceState(null, "", url); } catch (e) { /* some browsers block this on file:// */ }
  }

  let shownDetail = null;
  function render() {
    renderFilters();
    renderScope();
    renderChips();
    renderList();
    renderDetail();
    if (state.selected !== shownDetail) {
      $("detail").scrollTop = 0;
      shownDetail = state.selected;
    }
    renderPendingBanner($("pending"));
  }

  function setScope(scope) {
    state.scope = scope;
    state.category = "";
    try { localStorage.setItem(SCOPE_KEY, scope); } catch (e) { /* storage unavailable */ }
  }

  function selectFromHash() {
    const id = decodeURIComponent(location.hash.slice(1));
    if (!id || !itemById.has(id)) return;
    state.selected = id;
    // Linking to an item that isn't on the wishlist: show it in "All items" with filters cleared.
    if (state.scope === "wishlist" && !Wishlist.isWanted(id)) setScope("all");
    if (!filtered().some((s) => s.id === id)) {
      state.query = $("search").value = "";
      state.category = state.availability = state.owned = "";
      $("availability").value = $("owned").value = "";
    }
  }

  // Search as you type, but wait for a pause: filtering ~5,000 items on every key is wasteful.
  let typing;
  $("search").addEventListener("input", (e) => {
    clearTimeout(typing);
    typing = setTimeout(() => { state.query = e.target.value; render(); saveQueryToUrl(); }, 120);
  });
  $("meta").textContent = `${fmt(items.length)} items · data for patch ${catalogMeta.patch || "?"} · gathered ${catalogMeta.gathered || "?"} · prices are crowdsourced, so check the date before you fly out`;
  $("siteLinks").innerHTML = ((window.SITE || {}).links || [])
    .map((l) => `<a href="${esc(l.href)}">${esc(l.label)} →</a>`)
    .join("");
  $("filtersToggle").addEventListener("click", () => {
    panelOpen = !panelOpen;
    try { localStorage.setItem(PANEL_KEY, panelOpen ? "1" : "0"); } catch (e) { /* storage unavailable */ }
    render();
  });
  Filters.bindPanel($("filterPanel"), () => state.query, setQuery);
  $("activeFilters").addEventListener("click", (e) => {
    const btn = e.target.closest("button");
    if (!btn) return;
    if (btn.hasAttribute("data-clear-filters")) setQuery("");
    else if (btn.dataset.removeTerm != null) setQuery(Filters.removeTerm(state.query, btn.dataset.removeTerm));
  });
  $("availability").addEventListener("change", (e) => { state.availability = e.target.value; render(); });
  $("owned").addEventListener("change", (e) => { state.owned = e.target.value; render(); });
  $("sort").addEventListener("change", (e) => { state.sort = e.target.value; render(); });
  $("scope").addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-scope]");
    if (!btn) return;
    setScope(btn.dataset.scope);
    render();
  });
  $("categoryChips").addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-cat]");
    if (!btn) return;
    state.category = btn.dataset.cat;
    render();
  });
  const scrollToSelected = () => {
    const row = document.querySelector(".row.active");
    if (row) row.scrollIntoView({ block: "nearest" });
  };
  window.addEventListener("hashchange", () => { selectFromHash(); render(); scrollToSelected(); });
  onChange(render);

  const initialQuery = new URLSearchParams(location.search).get("q");
  if (initialQuery) state.query = $("search").value = initialQuery;
  selectFromHash();
  render();
  if (location.hash) scrollToSelected();
})();
