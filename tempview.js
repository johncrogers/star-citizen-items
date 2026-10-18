// Temperature coverage: each armor or clothing piece's rated range as a bar, against the range I
// need. Items with the same range (color variants) share one row.
(function () {
  const { esc, fmt, items, bestPrice, availability, availabilityLabel, Owned, Wishlist } = window.Gear;

  const TYPE_ORDER = ["Undersuit", "Helmet", "Core", "Arms", "Legs", "Torso", "Hat", "Gloves", "Shoes", "Backpack"];
  const rated = items.filter((s) => s.stats.tempMin != null && s.stats.tempMax != null);
  const types = [...new Set(rated.map((s) => s.type))].sort((a, b) => {
    const i = TYPE_ORDER.indexOf(a), j = TYPE_ORDER.indexOf(b);
    return (i < 0 ? 99 : i) - (j < 0 ? 99 : j) || a.localeCompare(b);
  });

  const KEY = "sc-items-wishlist:temperature";
  const opts = { type: "Undersuit", lo: -80, hi: 40, scope: "all", open: null };
  try { Object.assign(opts, JSON.parse(localStorage.getItem(KEY) || "{}")); } catch (e) { /* storage unavailable */ }
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(opts)); } catch (e) { /* storage unavailable */ } };
  const deg = (n) => `${n < 0 ? "−" : ""}${Math.abs(n)}`;
  const mine = (s) => Owned.isOwned(s.id) || Wishlist.isWanted(s.id);

  function groups() {
    const pool = rated.filter((s) => s.type === opts.type &&
      (opts.scope === "all" || (opts.scope === "mine" && mine(s)) || (opts.scope === "buy" && s.buy.length)));
    const by = new Map();
    for (const s of pool) {
      const k = `${s.stats.tempMin}|${s.stats.tempMax}`;
      if (!by.has(k)) by.set(k, { key: k, min: s.stats.tempMin, max: s.stats.tempMax, items: [] });
      by.get(k).items.push(s);
    }
    const list = [...by.values()];
    for (const g of list) {
      g.covers = g.min <= opts.lo && g.max >= opts.hi;
      g.owned = g.items.filter((s) => Owned.isOwned(s.id));
      g.wanted = g.items.filter((s) => Wishlist.isWanted(s.id) && !Owned.isOwned(s.id));
      const priced = g.items.filter((s) => bestPrice(s) != null).sort((a, b) => bestPrice(a) - bestPrice(b));
      g.cheapest = priced[0] || null;
      g.lead = g.owned[0] || g.wanted[0] || g.cheapest || g.items[0];
    }
    // Ranges that cover what I need first, then the widest.
    return list.sort((a, b) => b.covers - a.covers || (b.max - b.min) - (a.max - a.min) || a.min - b.min);
  }

  function chart(list, width) {
    const W = Math.max(320, width), rowH = 26;
    const labelW = W < 560 ? 130 : 240, rightW = W < 560 ? 54 : 110;
    const pad = { l: labelW, r: rightW, t: 8, b: 30 };
    const H = pad.t + list.length * rowH + pad.b;
    const lo = Math.min(opts.lo, ...list.map((g) => g.min)) - 10, hi = Math.max(opts.hi, ...list.map((g) => g.max)) + 10;
    const sx = (v) => pad.l + ((v - lo) / (hi - lo)) * (W - pad.l - pad.r);
    const step = hi - lo > 300 ? 100 : hi - lo > 120 ? 50 : 20;
    const ticks = [];
    for (let v = Math.ceil(lo / step) * step; v <= hi; v += step) ticks.push(v);
    const grid = ticks.map((v) => `<line class="tc-grid${v === 0 ? " zero" : ""}" x1="${sx(v)}" x2="${sx(v)}" y1="${pad.t}" y2="${H - pad.b}"/>
      <text class="tc-tick" x="${sx(v)}" y="${H - pad.b + 16}" text-anchor="middle">${deg(v)}</text>`).join("");
    const band = `<rect class="tc-need" x="${sx(opts.lo)}" y="${pad.t}" width="${Math.max(1, sx(opts.hi) - sx(opts.lo))}" height="${H - pad.t - pad.b}"/>
      <line class="tc-need-edge" x1="${sx(opts.lo)}" x2="${sx(opts.lo)}" y1="${pad.t}" y2="${H - pad.b}"/>
      <line class="tc-need-edge" x1="${sx(opts.hi)}" x2="${sx(opts.hi)}" y1="${pad.t}" y2="${H - pad.b}"/>`;
    const maxChars = Math.floor((labelW - 16) / 6.6);
    // Leave room for the "+N" and ✓/★ after the name.
    const clip = (t, extra) => (t.length + extra > maxChars ? t.slice(0, Math.max(4, maxChars - extra - 1)) + "…" : t);
    const rows = list.map((g, i) => {
      const y = pad.t + i * rowH;
      const more = g.items.length > 1 ? ` +${g.items.length - 1}` : "";
      const tag = g.owned.length ? " ✓" : g.wanted.length ? " ★" : "";
      const price = g.cheapest ? fmt(bestPrice(g.cheapest)) : availabilityLabel[availability(g.lead)];
      const tip = `${deg(g.min)} to ${deg(g.max)} °C · ${g.items.length} item${g.items.length > 1 ? "s" : ""}${g.covers ? " · covers your range" : ""}${g.owned.length ? ` · you own ${g.owned.map((s) => s.name).join(", ")}` : ""}${g.cheapest ? ` · cheapest ${g.cheapest.name}, ${fmt(bestPrice(g.cheapest))} aUEC` : ""}`;
      return `<g class="tc-row${g.covers ? " covers" : ""}${opts.open === g.key ? " open" : ""}" data-range="${esc(g.key)}" data-tip="${esc(tip)}" tabindex="0" role="button">
        <rect class="tc-hit" x="0" y="${y}" width="${W}" height="${rowH}"/>
        <text class="tc-label" x="${pad.l - 10}" y="${y + rowH / 2 + 4}" text-anchor="end">${esc(clip(g.lead.name, more.length + tag.length) + tag)}<tspan class="tc-more">${esc(more)}</tspan></text>
        <rect class="tc-bar" x="${sx(g.min)}" y="${y + rowH / 2 - 5}" width="${Math.max(2, sx(g.max) - sx(g.min))}" height="10" rx="4"/>
        <text class="tc-val" x="${W - pad.r + 8}" y="${y + rowH / 2 + 4}">${esc(price)}</text>
      </g>`;
    }).join("");
    return `<svg class="tc-svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="Temperature ranges of ${esc(opts.type.toLowerCase())} items">
      ${band}${grid}${rows}<text class="tc-tick" x="${W - pad.r}" y="${H - pad.b + 16}" text-anchor="start" dx="6">°C</text></svg>`;
  }

  function detail(list) {
    const g = list.find((x) => x.key === opts.open);
    if (!g) return "";
    const rows = [...g.items].sort((a, b) => mine(b) - mine(a) || (bestPrice(a) ?? Infinity) - (bestPrice(b) ?? Infinity) || a.name.localeCompare(b.name));
    return `<div class="tc-detail"><h4>${deg(g.min)} to ${deg(g.max)} °C · ${g.items.length} item${g.items.length > 1 ? "s" : ""}</h4>
      <table><tbody>${rows.slice(0, 60).map((s) => `<tr><td><a href="#${esc(s.id)}">${esc(s.name)}</a>${Owned.isOwned(s.id) ? ' <span class="owned-tag">owned</span>' : Wishlist.isWanted(s.id) ? ' <span class="tc-wanted">wanted</span>' : ""}</td>
        <td class="num">${bestPrice(s) != null ? `${fmt(bestPrice(s))} aUEC` : `<span class="muted">${availabilityLabel[availability(s)]}</span>`}</td></tr>`).join("")}</tbody></table>
      ${rows.length > 60 ? `<p class="muted">${rows.length - 60} more.</p>` : ""}</div>`;
  }

  function render(el) {
    const list = groups();
    const covering = list.filter((g) => g.covers);
    const nItems = list.reduce((n, g) => n + g.items.length, 0);
    const coverItems = covering.reduce((n, g) => n + g.items.length, 0);
    const ownCover = covering.flatMap((g) => g.owned);
    const cheapest = covering.map((g) => g.cheapest).filter(Boolean).sort((a, b) => bestPrice(a) - bestPrice(b))[0];
    const width = (el.clientWidth || 1000) - 42;
    el.innerHTML = `<div class="cmp-card tc">
      <h3>Temperature coverage</h3>
      <p class="muted">Each bar is the temperature range an item is rated for. The shaded band is the range you need. Items with the same range share a row.</p>
      <div class="tc-controls">
        <label>Type <select data-tc="type">${types.map((t) => `<option${t === opts.type ? " selected" : ""}>${esc(t)}</option>`).join("")}</select></label>
        <label>I need <input type="number" step="5" value="${opts.lo}" data-tc="lo" aria-label="Coldest temperature I need"> to <input type="number" step="5" value="${opts.hi}" data-tc="hi" aria-label="Hottest temperature I need"> °C</label>
        <label>Show <select data-tc="scope">
          <option value="all"${opts.scope === "all" ? " selected" : ""}>All items</option>
          <option value="buy"${opts.scope === "buy" ? " selected" : ""}>Sold in shops</option>
          <option value="mine"${opts.scope === "mine" ? " selected" : ""}>Owned or wanted</option>
        </select></label>
      </div>
      <p class="tc-summary">${nItems ? `<strong>${coverItems} of ${nItems}</strong> ${esc(opts.type.toLowerCase())} items cover ${deg(opts.lo)} to ${deg(opts.hi)} °C.
        ${ownCover.length ? `You own ${ownCover.map((s) => `<a href="#${esc(s.id)}">${esc(s.name)}</a>`).join(", ")}.` : coverItems ? "You don't own one yet." : ""}
        ${cheapest && !ownCover.length ? ` Cheapest: <a href="#${esc(cheapest.id)}">${esc(cheapest.name)}</a>, ${fmt(bestPrice(cheapest))} aUEC.` : ""}` : "No items match."}</p>
      <div class="legend tc-legend"><span><i class="tc-key covers"></i>Covers your range</span><span><i class="tc-key"></i>Doesn't</span><span><i class="tc-key need"></i>Your range</span><span>✓ owned · ★ wanted · +N more with the same range</span></div>
      <div class="tc-plot">${list.length ? chart(list, width) : ""}</div>
      <div class="tc-tip" role="tooltip" hidden></div>
      ${detail(list)}
      <p class="note">Click a row to list every item in it. Price is the cheapest item in the row. Ratings come from the in-game item data; how several pieces combine isn't in the data.</p>
    </div>`;
  }

  function bind(el, rerender) {
    el.addEventListener("change", (e) => {
      const k = e.target.dataset.tc;
      if (!k) return;
      if (k === "lo" || k === "hi") {
        const v = Math.round(+e.target.value);
        if (Number.isFinite(v)) opts[k] = v;
        if (opts.lo > opts.hi) [opts.lo, opts.hi] = [opts.hi, opts.lo];
      } else {
        opts[k] = e.target.value;
        opts.open = null;
      }
      save();
      // Not straight away: redrawing removes the focused box, whose blur can fire another change
      // while this redraw is still running.
      setTimeout(rerender);
    });
    const toggle = (row) => {
      opts.open = opts.open === row.dataset.range ? null : row.dataset.range;
      save();
      rerender();
    };
    el.addEventListener("click", (e) => {
      const row = e.target.closest && e.target.closest(".tc-row");
      if (row) toggle(row);
    });
    el.addEventListener("keydown", (e) => {
      const row = e.target.closest && e.target.closest(".tc-row");
      if (row && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); toggle(row); }
    });
    const show = (e) => {
      const tip = el.querySelector(".tc-tip");
      if (!tip) return;
      const row = e.target.closest && e.target.closest(".tc-row");
      if (!row) { tip.hidden = true; return; }
      const box = el.querySelector(".tc").getBoundingClientRect();
      const r = row.querySelector(".tc-bar").getBoundingClientRect();
      tip.textContent = row.dataset.tip;
      tip.hidden = false;
      tip.style.left = `${Math.max(8, Math.min(r.left - box.left, box.width - tip.offsetWidth - 8))}px`;
      tip.style.top = `${r.top - box.top - tip.offsetHeight - 6}px`;
    };
    el.addEventListener("mouseover", show);
    el.addEventListener("focusin", show);
    el.addEventListener("mouseleave", () => { const t = el.querySelector(".tc-tip"); if (t) t.hidden = true; });
  }

  window.TempView = { render, bind };
})();
