// Shared helpers for the items viewer: item records, wishlist and owned tracking.
(function () {
  const esc = (s) =>
    String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  const fmt = (n) => (n == null ? "—" : n.toLocaleString("en-US"));
  // On the public site (see site.js), visitors can't save files into this repo.
  const published = (window.SITE || {}).mode === "published";
  const today = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  };

  // ── Items ──────────────────────────────────────────────────────────────────
  // catalog.data.js (generated) stores some fields in short form to save space (see its header).
  // Expand them back into plain records.
  const LOCS = window.ITEM_LOCATIONS || [];
  const DESCS = window.ITEM_DESCRIPTIONS || [];
  const longDate = (d) => (d ? `20${String(d).slice(0, 2)}-${String(d).slice(2, 4)}-${String(d).slice(4, 6)}` : null);
  function longImage(img) {
    if (!img) return null;
    if (img.startsWith("w:")) {
      const path = img.slice(2);
      const file = path.split("/").pop();
      return `https://media.starcitizen.tools/thumb/${path}/600px-${file}.webp`;
    }
    if (img.startsWith("c:")) return `https://cstone.space/uifimages/${img.slice(2)}`;
    return img;
  }
  function expand(r) {
    const { cstone, uex, ...rest } = r;
    return {
      ...rest,
      stats: r.stats || {},
      facts: r.facts || [],
      buy: (r.buy || []).map(([loc, price, date, src]) => ({
        location: LOCS[loc],
        price,
        date: longDate(date),
        source: src === "c" ? "cstone" : "UEX",
      })),
      image: longImage(r.image),
      links: {
        cstone: cstone ? `https://finder.cstone.space/${cstone}` : null,
        uex: uex ? `https://uexcorp.space/items/info?name=${encodeURIComponent(uex)}` : null,
        wiki: `https://starcitizen.tools/Special:Search?search=${encodeURIComponent(r.name)}`,
      },
      description: typeof r.description === "number" ? DESCS[r.description] : r.description || "",
    };
  }

  // items.data.js has my curated records, which override catalog records field by field.
  // Matched by className, then by id.
  function mergeItems(catalog, curated) {
    const byClass = new Map(catalog.filter((s) => s.className).map((s) => [s.className.toLowerCase(), s]));
    const byId = new Map(catalog.map((s) => [s.id, s]));
    const replaced = new Map();
    const extra = [];
    for (const cur of curated) {
      const base = (cur.className && byClass.get(cur.className.toLowerCase())) || byId.get(cur.id);
      const merged = base
        ? { ...base, ...cur, stats: { ...base.stats, ...cur.stats }, links: { ...base.links, ...cur.links }, buy: cur.buy || base.buy, curated: true }
        : { stats: {}, facts: [], links: {}, buy: [], category: "Other", type: "Other", ...cur, curated: true };
      if (base) replaced.set(base, merged);
      else extra.push(merged);
    }
    return [...catalog.map((s) => replaced.get(s) || s), ...extra];
  }
  const items = mergeItems((window.ITEM_CATALOG || []).map(expand), window.ITEMS || []);
  const itemById = new Map(items.map((s) => [s.id, s]));

  // How an item can be had, for filters and price labels.
  const availability = (s) => {
    if (s.buy.length) return "buy";
    if (s.loot) return "loot";
    if (s.craft) return "craft";
    if (s.event) return "event";
    return "none";
  };
  const availabilityLabel = { buy: "In shops", loot: "Loot only", craft: "Crafted", event: "Event reward", none: "Not sold" };
  const bestPrice = (s) => (s.buy.length ? Math.min(...s.buy.map((b) => b.price)) : null);

  // ── File-backed stores ─────────────────────────────────────────────────────
  // A .js file (e.g. owned.js → window.OWNED) is the saved state. Changes made in the viewer are
  // kept in localStorage as overrides until the user saves a new file over the old one.
  const allStores = [];
  const listeners = [];
  const notify = () => listeners.forEach((fn) => fn());

  function createStore({ key, globalName, fileName, label, header, order }) {
    const fileState = window[globalName] || {};
    let overrides = {};
    try { overrides = JSON.parse(localStorage.getItem(key)) || {}; } catch (e) { overrides = {}; }
    const same = (a, b) => JSON.stringify(a || null) === JSON.stringify(b || null);

    function persist() {
      // Drop overrides that now match the file (e.g. after the file was replaced).
      for (const id of Object.keys(overrides)) {
        if (same(overrides[id], fileState[id])) delete overrides[id];
      }
      try { localStorage.setItem(key, JSON.stringify(overrides)); } catch (e) { /* storage unavailable */ }
    }
    persist();

    function all() {
      const out = { ...fileState };
      for (const [id, v] of Object.entries(overrides)) {
        if (v) out[id] = v;
        else delete out[id];
      }
      return out;
    }

    function fileText() {
      const entries = order ? order(Object.entries(all())) : Object.entries(all()).sort(([a], [b]) => a.localeCompare(b));
      // One line per item: "id": { "key": value, ... }
      const obj = (v) => `{ ${Object.entries(v).map(([k, x]) => `${JSON.stringify(k)}: ${JSON.stringify(x)}`).join(", ")} }`;
      const body = entries.length
        ? `{\n${entries.map(([id, v]) => `  ${JSON.stringify(id)}: ${obj(v)}`).join(",\n")}\n}`
        : "{}";
      return [...header, `window.${globalName} = ${body};`, ``].join("\n");
    }

    const store = {
      label,
      fileName,
      all,
      get: (id) => all()[id] || null,
      has: (id) => !!all()[id],
      set(id, value) {
        overrides[id] = value || null;
        persist();
        notify();
      },
      pending: () => Object.keys(overrides),
      discard() {
        overrides = {};
        persist();
        notify();
      },
      // Writes the file in place via the File System Access API when available (Edge/Chrome),
      // otherwise downloads it.
      async save() {
        const text = fileText();
        if (window.showSaveFilePicker) {
          try {
            const handle = await window.showSaveFilePicker({
              id: "items-wishlist",
              suggestedName: fileName,
              types: [{ description: "JavaScript", accept: { "text/javascript": [".js"] } }],
            });
            const w = await handle.createWritable();
            await w.write(text);
            await w.close();
            return "saved";
          } catch (e) {
            if (e.name === "AbortError") return "cancelled";
          }
        }
        const a = Object.assign(document.createElement("a"), {
          href: URL.createObjectURL(new Blob([text], { type: "text/javascript" })),
          download: fileName,
        });
        a.click();
        URL.revokeObjectURL(a.href);
        return "downloaded";
      },
    };
    allStores.push(store);
    return store;
  }

  // ── Owned ──────────────────────────────────────────────────────────────────
  const ownedStore = createStore({
    key: "sc-items-wishlist:owned-overrides",
    globalName: "OWNED",
    fileName: "owned.js",
    label: "owned",
    header: [
      `// Items I own: { "<item id>": { date: "YYYY-MM-DD" } }.`,
      `// The viewer's "Owned" checkboxes save to the browser right away. To make them permanent`,
      `// (and visible to agents and git), click "Save owned.js" in the viewer and replace this file.`,
    ],
  });
  const Owned = {
    ...ownedStore,
    isOwned: ownedStore.has,
    set: (id, owned) => ownedStore.set(id, owned ? { date: today() } : null),
  };

  // ── Wishlist ───────────────────────────────────────────────────────────────
  // Groups (e.g. "Sniper kit", "Heavy armor") appear in the order they first show up in the file.
  const groupsOf = (entries) => [...new Set(entries.map(([, v]) => v.group || "Other"))];
  const wishStore = createStore({
    key: "sc-items-wishlist:wishlist-overrides",
    globalName: "WISHLIST",
    fileName: "wishlist.js",
    label: "wishlist",
    header: [
      `// My item wishlist: { "<item id>": { group, added: "YYYY-MM-DD" } }. Groups show in file order.`,
      `// The viewer's ☆ buttons save to the browser right away. To make changes permanent (and visible`,
      `// to agents and git), click "Save wishlist.js" in the viewer and replace this file.`,
    ],
    order: (entries) => {
      const groups = groupsOf(entries);
      return entries
        .map((e, i) => [e, i])
        .sort(([a, i], [b, j]) => groups.indexOf(a[1].group || "Other") - groups.indexOf(b[1].group || "Other") || i - j)
        .map(([e]) => e);
    },
  });
  const Wishlist = {
    ...wishStore,
    isWanted: wishStore.has,
    group: (id) => (wishStore.get(id) || {}).group || "Other",
    groups: () => groupsOf(Object.entries(wishStore.all())),
    add: (id, group) => wishStore.set(id, { group, added: (wishStore.get(id) || {}).added || today() }),
    remove: (id) => wishStore.set(id, null),
  };

  const onChange = (fn) => listeners.push(fn);

  // Banner shown while browser state differs from the saved files.
  function renderPendingBanner(el) {
    if (published) {
      el.hidden = true; // visitors' changes simply live in their browser
      return;
    }
    const changed = allStores.filter((s) => s.pending().length);
    el.hidden = changed.length === 0;
    if (!changed.length) return;
    const desc = changed
      .map((s) => `${s.pending().length} ${s.label} change${s.pending().length > 1 ? "s" : ""}`)
      .join(" and ");
    el.innerHTML = `
      <span><strong>${desc}</strong> saved in this browser only.
      To keep them for good, save ${changed.map((s) => s.fileName).join(" and ")} over the one${changed.length > 1 ? "s" : ""} in this folder.</span>
      <span class="pending-actions">
        ${changed.map((s) => `<button type="button" data-save="${esc(s.fileName)}">Save ${esc(s.fileName)}</button>`).join("")}
        <button type="button" data-act="discard" class="ghost">Discard</button>
      </span>
      <span class="pending-msg" aria-live="polite"></span>`;
    el.onclick = async (e) => {
      const btn = e.target.closest("button");
      if (!btn) return;
      if (btn.dataset.act === "discard" && confirm(`Discard changes that aren't in ${changed.map((s) => s.fileName).join(" or ")}?`)) {
        changed.forEach((s) => s.discard());
      }
      const store = allStores.find((s) => s.fileName === btn.dataset.save);
      if (store) {
        const result = await store.save();
        const msg = el.querySelector(".pending-msg");
        if (result === "saved") msg.textContent = "Saved. Reload the page to confirm.";
        if (result === "downloaded") msg.textContent = `Downloaded. Move it into this folder, replacing the old ${store.fileName}, then reload.`;
      }
    };
  }

  function ownedToggle(id) {
    const p = Owned.get(id);
    return `<label class="purchase-toggle${p ? " on" : ""}">
      <input type="checkbox" data-owned="${esc(id)}"${p ? " checked" : ""}>
      <span>${p ? `Owned <small>${esc(p.date || "")}</small>` : "Mark owned"}</span>
    </label>`;
  }

  // Wishlist control for the detail panel: add/remove, and pick a group.
  function wishlistControl(item) {
    if (!Wishlist.isWanted(item.id)) {
      return `<button type="button" class="wish-toggle" data-wish="${esc(item.id)}">☆ Add to wishlist</button>`;
    }
    const current = Wishlist.group(item.id);
    const options = [...new Set([...Wishlist.groups(), current, item.category])];
    return `<span class="wish-toggle on">
      <button type="button" class="star on" data-wish="${esc(item.id)}" title="Remove from wishlist" aria-label="Remove from wishlist">★</button>
      On wishlist in
      <select data-wish-select="${esc(item.id)}" aria-label="Wishlist group">
        ${options.map((g) => `<option${g === current ? " selected" : ""}>${esc(g)}</option>`).join("")}
        <option value="__new">New group…</option>
      </select>
    </span>`;
  }

  // One delegated listener for every owned checkbox and wishlist control on the page.
  document.addEventListener("change", (e) => {
    const t = e.target;
    if (!t.dataset) return;
    if (t.dataset.owned) Owned.set(t.dataset.owned, t.checked);
    if (t.dataset.wishSelect) {
      const id = t.dataset.wishSelect;
      let group = t.value;
      if (group === "__new") group = (prompt("Name the new wishlist group:") || "").trim();
      if (group) Wishlist.add(id, group);
      else t.value = Wishlist.group(id);
    }
  });
  document.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-wish]");
    if (!btn) return;
    e.preventDefault();
    const id = btn.dataset.wish;
    // New wishlist items go in a group named after their category (Weapons, Armor...).
    if (Wishlist.isWanted(id)) Wishlist.remove(id);
    else Wishlist.add(id, (itemById.get(id) || {}).category || "Other");
  });

  function thingsToKnow(item) {
    const list = item.thingsToKnow || [];
    if (!list.length) return "";
    return `<h3>Things to know</h3>
      <ul class="ttk">${list
        .map((t) => `<li class="ttk-${t.level === "warn" ? "warn" : "info"}"><span class="ttk-icon">${t.level === "warn" ? "!" : "i"}</span>${esc(t.text)}</li>`)
        .join("")}</ul>`;
  }

  // CSS class for a category/group tag. Known names get their own color; others share one.
  const tagClass = (name) => `tag cat-${String(name || "other").toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;

  window.Gear = {
    esc, fmt, published, items, itemById, availability, availabilityLabel, bestPrice,
    Owned, Wishlist, onChange, renderPendingBanner, ownedToggle, wishlistControl, thingsToKnow, tagClass,
  };
})();
