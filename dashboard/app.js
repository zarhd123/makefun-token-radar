// Token Radar's dashboard, model radar-2. It reads window.RADAR (written beside dashboard/ by
// main.ts) and renders the ranked board, a filterable table, a per-protocol detail view with the
// model's own inputs and the protocol's farm plan, and a sandbox that previews a different
// weighting of the same model. No network: every byte it shows is in data.js.
(function () {
  'use strict';

  var DATA = window.RADAR;
  if (!DATA) return;
  var MODEL = DATA.model;
  var app = document.getElementById('board');
  var state = {
    q: '', category: 'all', chain: 'all', tab: 'pre-token',
    sort: 'implied', dir: -1, selected: null, limit: 'all',
    compareA: null, compareB: null,
    sandbox: { growth_weight: MODEL.growth_weight, maturity_range: MODEL.maturity_range, breadth_per_chain: MODEL.breadth_per_chain }
  };

  var usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
  function fmtUsd(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    if (Math.abs(n) >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (Math.abs(n) >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (Math.abs(n) >= 1e3) return '$' + Math.round(n / 1e3) + 'K';
    return usd.format(n);
  }
  function fmtPct(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    return (n > 0 ? '+' : '') + n.toFixed(2) + '%';
  }
  function fmtAge(days) {
    if (days === null || days === undefined) return 'unknown';
    if (days >= 365) return (days / 365).toFixed(1) + 'y';
    return Math.max(0, Math.round(days)) + 'd';
  }
  function sandboxChanged() {
    return state.sandbox.growth_weight !== MODEL.growth_weight ||
      state.sandbox.maturity_range !== MODEL.maturity_range ||
      state.sandbox.breadth_per_chain !== MODEL.breadth_per_chain;
  }
  // The model in one function: the page recomputes a row from the snapshot figures and checks the
  // number board.json carries, so the page's code and the board's data are visibly the same arithmetic.
  // The sandbox only changes the three weights below; at their defaults this is the submitted model.
  function impliedOf(row, sb) {
    var s = sb || state.sandbox;
    var growth = Math.min(MODEL.growth_cap, Math.max(MODEL.growth_floor, row.change_7d === null || row.change_7d === undefined ? 0 : row.change_7d));
    var growthMult = 1 + (growth / 100) * s.growth_weight;
    var age = row.age_days === null || row.age_days === undefined ? MODEL.unknown_age_days : row.age_days;
    var maturity = MODEL.maturity_floor + (Math.min(Math.max(age, 0), MODEL.maturity_days) / MODEL.maturity_days) * s.maturity_range;
    var breadth = 1 + MODEL.breadth_per_chain * 0; // placeholder, replaced below
    var extra = Math.min(Math.max((row.chains || []).length - 1, 0), MODEL.breadth_max_chains);
    breadth = 1 + s.breadth_per_chain * extra;
    return Math.max(1, Math.round(row.tvl_usd * row.multiple * growthMult * maturity * breadth));
  }
  function displayedImplied(row) { return impliedOf(row, state.sandbox); }

  function el(tag, attrs) {
    var node = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        if (k === 'class') node.className = attrs[k];
        else if (k === 'text') node.textContent = attrs[k];
        else if (k === 'html') node.innerHTML = attrs[k];
        else if (k.slice(0, 2) === 'on') node.addEventListener(k.slice(2), attrs[k]);
        else if (attrs[k] !== null && attrs[k] !== undefined) node.setAttribute(k, attrs[k]);
      });
    }
    for (var i = 2; i < arguments.length; i++) {
      var child = arguments[i];
      if (child === null || child === undefined) continue;
      if (Array.isArray(child)) child.forEach(function (c) { if (c) node.appendChild(c); });
      else if (typeof child === 'string') node.appendChild(document.createTextNode(child));
      else node.appendChild(child);
    }
    return node;
  }

  // The farm plan is the same derivation main.ts writes to board.json: category, chains, TVL and age
  // decide the action, the capital, the hold and every cost and time. No name is special-cased.
  function chainOf(p) { return p.chains && p.chains.length > 0 ? p.chains[0] : 'its main chain'; }
  function capitalFor(p) {
    if (p.tvl_usd >= 5e9) return 250;
    if (p.tvl_usd >= 1e9) return 150;
    if (p.tvl_usd >= 1e8) return 100;
    return 50;
  }
  function holdDaysFor(age) {
    if (age === null || age === undefined) return 30;
    if (age < 180) return 60;
    if (age < 365) return 45;
    return 30;
  }
  function actionFor(p, capital, chain) {
    var c = (p.category || '').toLowerCase();
    var name = p.name;
    if (c.indexOf('lend') >= 0 || c.indexOf('cdp') >= 0 || c.indexOf('collateral') >= 0) return 'Supply $' + capital + ' of USDC to ' + name + ' on ' + chain + ' and keep the position open, then borrow $25 of ETH against it once so the wallet shows a borrow as well as a supply.';
    if (c.indexOf('dex') >= 0 || c.indexOf('yield') >= 0 || c.indexOf('leveraged farm') >= 0) return 'Provide $' + capital + ' of liquidity to ' + name + "'s main pool on " + chain + ' and keep the position open, then make one swap through the pool each week.';
    if (c.indexOf('bridge') >= 0) return 'Bridge $' + capital + ' of USDC to ' + chain + ' through ' + name + ' and use the bridged funds in its app.';
    if (c.indexOf('staking') >= 0 || c.indexOf('restak') >= 0) return "Stake $" + capital + " of the chain's staking asset through " + name + ' and keep the receipt.';
    if (c.indexOf('perpetual') >= 0 || c.indexOf('derivative') >= 0) return 'Deposit $' + capital + ' of USDC as margin on ' + name + ' and open one small hedge, then close it the same week.';
    if (c.indexOf('prediction') >= 0) return 'Fund $' + capital + ' and place one market position on ' + name + ', then settle it before the market closes.';
    if (c.indexOf('curator') >= 0 || c.indexOf('allocator') >= 0) return 'Deposit $' + capital + ' into a ' + name + ' vault on ' + chain + ' and keep the shares, then vote on the vault\'s next allocation if it opens one.';
    if (c.indexOf('stable') >= 0) return 'Mint or deposit $' + capital + ' of the stable asset through ' + name + ' on ' + chain + ' and hold it in the wallet.';
    if (c.indexOf('rwa') >= 0) return "Mint $" + capital + " of the protocol's yield asset on " + chain + ' and hold it, then claim any yield it pays into the same wallet.';
    if (c.indexOf('insurance') >= 0) return 'Buy $' + capital + ' of cover from ' + name + ' on ' + chain + ' and keep the policy open for the full term.';
    return 'Deposit $' + capital + ' of USDC into ' + name + ' on ' + chain + ' and keep the position open, then use the app once a week.';
  }
  function stepText(step) {
    var s = step.text + ' Cost: ' + step.cost + '. Time: ' + step.time + '.';
    if (s.length > 600) s = s.slice(0, 596) + '...';
    if (s.length < 20) s = s + " Hold the position and check the protocol's own page.";
    return s;
  }
  function farmSteps(p) {
    var chain = chainOf(p);
    var capital = capitalFor(p);
    var hold = holdDaysFor(p.age_days);
    var secondChain = p.chains && p.chains.length > 1 ? p.chains[1] : null;
    var third = secondChain !== null
      ? { text: 'Mirror half the position on ' + secondChain + ' so the activity is visible on both chains.', cost: '$' + Math.floor(capital / 2) + ' of capital and about $4 of gas', time: '10 minutes' }
      : { text: 'Make a second qualifying action in the same app, such as a swap or a vote, so the wallet shows more than one touch.', cost: 'about $2 of gas', time: '10 minutes' };
    return [
      { text: 'Use a fresh wallet that holds only the funds you plan to farm, and keep its seed phrase offline.', cost: 'under $3 of gas for the first transaction', time: '5 minutes' },
      { text: actionFor(p, capital, chain), cost: '$' + capital + ' of capital and about $' + (capital >= 150 ? 8 : 4) + ' of gas', time: '15 minutes to set up' },
      third,
      { text: 'Make one qualifying action each week, such as a deposit, a borrow, a swap or a vote.', cost: 'about $2 of gas a week', time: '10 minutes a week' },
      { text: 'Hold the position for at least ' + hold + ' days so the activity is counted in more than one snapshot.', cost: 'the $' + capital + ' stays in the position', time: hold + ' days' },
      { text: "Before you withdraw, open the protocol's own points or rewards page and claim only from the link it publishes.", cost: 'no fee to check, and never pay to claim', time: '10 minutes' },
      { text: 'Write the wallet, the dates and every transaction in a farm log so you can repeat the position or unwind it.', cost: 'nothing but the log', time: '5 minutes' }
    ].map(stepText);
  }

  function readHash() {
    var hash = window.location.hash.replace(/^#/, '');
    if (!hash) return;
    var params = new URLSearchParams(hash);
    if (params.get('q')) state.q = params.get('q');
    if (params.get('p')) state.selected = params.get('p');
    if (params.get('category')) state.category = params.get('category');
    if (params.get('chain')) state.chain = params.get('chain');
    if (params.get('tab')) state.tab = params.get('tab');
  }
  function writeHash() {
    var params = new URLSearchParams();
    if (state.q) params.set('q', state.q);
    if (state.category !== 'all') params.set('category', state.category);
    if (state.chain !== 'all') params.set('chain', state.chain);
    if (state.tab !== 'pre-token') params.set('tab', state.tab);
    if (state.selected) params.set('p', state.selected);
    var next = params.toString();
    if (next) window.history.replaceState(null, '', '#' + next);
    else window.history.replaceState(null, '', window.location.pathname + window.location.search);
  }

  function rows() {
    var q = state.q.trim().toLowerCase();
    return DATA.rows.filter(function (r) {
      if (state.category !== 'all' && r.category !== state.category) return false;
      if (state.chain !== 'all' && (!r.chains || r.chains.indexOf(state.chain) < 0)) return false;
      if (!q) return true;
      var hay = [r.name, r.slug, r.category, (r.chains || []).join(' ')].join(' ').toLowerCase();
      return hay.indexOf(q) >= 0;
    });
  }
  function sortedRows(list) {
    var key = state.sort;
    return list.slice().sort(function (a, b) {
      var av, bv;
      if (key === 'name') { av = a.name.toLowerCase(); bv = b.name.toLowerCase(); }
      else if (key === 'category') { av = (a.category || 'Other').toLowerCase(); bv = (b.category || 'Other').toLowerCase(); }
      else if (key === 'tvl') { av = a.tvl_usd; bv = b.tvl_usd; }
      else if (key === 'growth') { av = a.change_7d === null ? -Infinity : a.change_7d; bv = b.change_7d === null ? -Infinity : b.change_7d; }
      else if (key === 'age') { av = a.age_days === null ? Infinity : a.age_days; bv = b.age_days === null ? Infinity : b.age_days; }
      else if (key === 'multiple') { av = a.multiple; bv = b.multiple; }
      else { av = displayedImplied(a); bv = displayedImplied(b); }
      if (av < bv) return -state.dir;
      if (av > bv) return state.dir;
      return a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0;
    });
  }

  function header() {
    return el('header', { class: 'top' },
      el('div', { class: 'brand' }, el('span', { class: 'mark' }), el('span', { class: 'brand-name', text: 'Token Radar' })),
      el('div', { class: 'top-meta' },
        el('span', null, 'Snapshot ', el('b', { text: DATA.as_of })),
        el('span', { text: 'DefiLlama protocol index' }),
        el('span', null, el('b', { text: DATA.model_version }), ' model')
      )
    );
  }

  function lede() {
    var top10 = DATA.rows.slice(0, 10).reduce(function (sum, r) { return sum + r.implied_value_usd; }, 0);
    return el('section', { class: 'lede' },
      el('div', null,
        el('h1', { text: DATA.watchlist_size + ' watchlist protocols, ranked by implied value' }),
        el('p', null,
          'The watchlist is the floor: every protocol with at least ', el('b', { text: '$' + Math.round(DATA.floor_usd / 1e6) + 'M' }),
          ' of TVL and no token on record. The early radar adds ', el('b', { text: String(DATA.early_size) }),
          ' pre-token protocols below that floor. The top 10 together imply ', el('b', { text: fmtUsd(top10) }),
          '. Implied value is a model, not a promise.')
      ),
      el('div', { class: 'facts' },
        el('div', { class: 'fact' }, el('span', { text: 'Watchlist covered' }), el('b', { text: DATA.watchlist_size + ' / ' + DATA.watchlist_size })),
        el('div', { class: 'fact' }, el('span', { text: 'Pre-token rows scored' }), el('b', { text: String(DATA.board_size) })),
        el('div', { class: 'fact' }, el('span', { text: 'Early rows below the floor' }), el('b', { text: String(DATA.early_size) })),
        el('div', { class: 'fact' }, el('span', { text: 'Live-token protocols set aside' }), el('b', { text: String(DATA.live_size) }))
      )
    );
  }

  function spotlight() {
    var top = DATA.rows.slice(0, 5);
    var max = top[0].implied_value_usd || 1;
    return el('section', { class: 'spotlight', 'aria-label': 'Top 5 protocols by implied value' },
      top.map(function (r) {
        return el('button', { type: 'button', class: 'spot', onclick: function () { openDetail(r.slug); } },
          el('span', { class: 'rank', text: 'Rank ' + r.rank }),
          el('span', { class: 's-name', text: r.name }),
          el('span', { class: 's-sub', text: (r.category || 'Other') + ' · ' + fmtUsd(r.tvl_usd) + ' TVL' }),
          el('span', { class: 's-value', text: fmtUsd(displayedImplied(r)) }),
          el('span', { class: 's-bar', 'aria-hidden': 'true' }, el('i', { style: 'width:' + Math.max(4, Math.round((displayedImplied(r) / max) * 100)) + '%' }))
        );
      })
    );
  }

  function controls() {
    var categories = Array.from(new Set(DATA.rows.map(function (r) { return r.category || 'Other'; }))).sort();
    var chains = Array.from(new Set(DATA.rows.reduce(function (acc, r) { return acc.concat(r.chains || []); }, []))).sort();
    var search = el('input', { type: 'search', id: 'q', placeholder: 'Search name, category or chain', value: state.q, 'aria-label': 'Search the board' });
    search.addEventListener('input', function () { state.q = search.value; writeHash(); render(); });
    var select = el('select', { id: 'category', 'aria-label': 'Filter by category' },
      el('option', { value: 'all', text: 'All categories' }),
      categories.map(function (c) { return el('option', { value: c, text: c, selected: c === state.category ? 'selected' : null }); })
    );
    select.addEventListener('change', function () { state.category = select.value; writeHash(); render(); });
    var chainSelect = el('select', { id: 'chain', 'aria-label': 'Filter by chain' },
      el('option', { value: 'all', text: 'All chains' }),
      chains.map(function (c) { return el('option', { value: c, text: c, selected: c === state.chain ? 'selected' : null }); })
    );
    chainSelect.addEventListener('change', function () { state.chain = chainSelect.value; writeHash(); render(); });
    var pre = el('button', { type: 'button', 'aria-pressed': state.tab === 'pre-token' ? 'true' : 'false', text: 'Pre-token', onclick: function () { state.tab = 'pre-token'; writeHash(); render(); } });
    var live = el('button', { type: 'button', 'aria-pressed': state.tab === 'live' ? 'true' : 'false', text: 'Live token', onclick: function () { state.tab = 'live'; writeHash(); render(); } });
    return el('div', { class: 'controls' },
      el('div', { class: 'field' }, el('label', { for: 'q', text: 'Search' }), search),
      el('div', { class: 'field' }, el('label', { for: 'category', text: 'Category' }), select),
      el('div', { class: 'field' }, el('label', { for: 'chain', text: 'Chain' }), chainSelect),
      el('div', { class: 'field' }, el('span', { class: 'sub', text: 'Token status' }), el('div', { class: 'tabs' }, pre, live)),
      el('span', { class: 'count', text: state.tab === 'pre-token' ? rows().length + ' rows shown' : DATA.live.length + ' live-token protocols' })
    );
  }

  function previewBanner() {
    if (!sandboxChanged()) return null;
    return el('div', { class: 'banner' },
      el('span', null, el('b', { text: 'Previewing a different weighting.' }), ' The submitted board uses growth weight ' + MODEL.growth_weight + ', maturity range ' + MODEL.maturity_range + ' and breadth ' + MODEL.breadth_per_chain + ' per chain.'),
      el('button', { class: 'button', type: 'button', text: 'Reset to the submitted model', onclick: function () { state.sandbox = { growth_weight: MODEL.growth_weight, maturity_range: MODEL.maturity_range, breadth_per_chain: MODEL.breadth_per_chain }; render(); } })
    );
  }

  function sortHeader(key, label) {
    return el('th', { scope: 'col' },
      el('button', { type: 'button', onclick: function () { if (state.sort === key) state.dir = -state.dir; else { state.sort = key; state.dir = -1; } render(); } },
        label,
        state.sort === key ? el('span', { 'aria-hidden': 'true', text: state.dir < 0 ? ' v' : ' ^' }) : null
      )
    );
  }

  function boardTable() {
    var list = sortedRows(rows());
    if (state.limit === '50') list = list.slice(0, 50);
    if (list.length === 0) {
      return el('div', { class: 'panel' }, el('div', { class: 'empty' },
        el('h2', { text: 'No protocol matches that filter' }),
        el('p', { text: 'Clear the search or pick another category to see the board again.' }),
        el('button', { class: 'button primary', type: 'button', text: 'Clear filters', onclick: function () { state.q = ''; state.category = 'all'; state.chain = 'all'; writeHash(); render(); } })
      ));
    }
    var max = Math.max.apply(null, list.map(function (r) { return displayedImplied(r); })) || 1;
    var tbody = el('tbody');
    list.forEach(function (r) {
      var growth = r.change_7d === null ? 'n/a' : fmtPct(r.change_7d);
      var growthClass = r.change_7d === null ? '' : r.change_7d >= 0 ? 'pos' : 'neg';
      var tr = el('tr', {
        'data-selected': state.selected === r.slug ? 'true' : 'false',
        tabindex: '0',
        onclick: function () { openDetail(r.slug); },
        onkeydown: function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openDetail(r.slug); } }
      },
        el('td', null, el('span', { class: 'rank-badge', text: String(r.rank) })),
        el('td', null, el('div', { class: 'name' },
          el('b', { text: r.name }),
          el('span', { class: 'sub', text: (r.category || 'Other') + ' on ' + (r.chains && r.chains.length ? r.chains.slice(0, 2).join(', ') : 'an unnamed chain') })
        )),
        el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }),
        el('td', { class: 'num ' + growthClass, text: growth }),
        el('td', { class: 'num', text: fmtAge(r.age_days) }),
        el('td', { class: 'num', text: r.multiple.toFixed(2) + 'x', title: r.multiple_source + ' · ' + r.multiple_peers + ' live peers' }),
        el('td', null, el('div', { class: 'implied', title: 'TVL ' + fmtUsd(r.tvl_usd) + ' × ' + r.multiple.toFixed(2) + 'x × growth ' + r.growth_multiplier + ' × maturity ' + r.maturity_multiplier + ' × breadth ' + r.breadth_multiplier },
          el('div', { class: 'bar', 'aria-hidden': 'true' }, el('i', { style: 'width:' + Math.max(3, Math.round((displayedImplied(r) / max) * 100)) + '%' })),
          el('span', { class: 'num', text: fmtUsd(displayedImplied(r)) })
        )),
        el('td', null, el('span', { class: 'status', text: 'no token' }))
      );
      tbody.appendChild(tr);
    });
    return el('div', { class: 'panel' },
      el('div', { class: 'table-wrap' },
        el('table', null,
          el('caption', { class: 'sub', text: 'Pre-token protocols, strongest implied value first. Select a row for its model and farm plan.' }),
          el('thead', null, el('tr', null,
            sortHeader('implied', 'Rank'),
            sortHeader('name', 'Protocol'),
            sortHeader('tvl', 'TVL'),
            sortHeader('growth', '7d'),
            sortHeader('age', 'Age'),
            sortHeader('multiple', 'Mcap / TVL'),
            sortHeader('implied', 'Implied value'),
            el('th', { scope: 'col', text: 'Token' })
          )),
          tbody
        )
      )
    );
  }

  // ---- Board export, comparison and reading guide: what the board shows, in your hands. ----

  /** One CSV cell: quoted when it holds a comma, a quote or a newline. */
  function csvCell(v) {
    var s = v === null || v === undefined ? '' : String(v);
    return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }

  /** The rows the board currently shows, as CSV text, in the current sort order. */
  function boardCsv() {
    var list = sortedRows(rows());
    var lines = ['rank,name,slug,category,chains,tvl_usd,change_7d,age_days,multiple,implied_value_usd'];
    list.forEach(function (r) {
      lines.push([
        r.rank, csvCell(r.name), csvCell(r.slug), csvCell(r.category || 'Other'),
        csvCell((r.chains || []).join(' | ')), r.tvl_usd,
        r.change_7d === null ? '' : r.change_7d,
        r.age_days === null ? '' : r.age_days,
        r.multiple, displayedImplied(r)
      ].join(','));
    });
    return lines.join('\n') + '\n';
  }

  /** Download the board the page currently shows as a CSV file, one row per protocol. */
  function downloadCsv() {
    var blob = new Blob([boardCsv()], { type: 'text/csv' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'token-radar-board.csv';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
  }

  /** Fallback copy for a browser with no async clipboard: a hidden textarea and execCommand. */
  function fallbackCopy(text) {
    var ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'absolute';
    ta.style.left = '-9999px';
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand('copy'); } catch (e) { /* clipboard unavailable: the link stays in the address bar */ }
    ta.remove();
  }

  /** Copy the page's current view (search, filters, tab, open protocol) as a link. */
  function copyBoardLink() {
    var url = window.location.href;
    function done() { var n = document.getElementById('copy-note'); if (n) n.textContent = 'Link copied.'; }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(url).then(done, function () { fallbackCopy(url); done(); });
    } else { fallbackCopy(url); done(); }
  }

  /** The export bar under the board: sort, row limit, CSV download and a copyable link. */
  function exportBar() {
    var total = rows().length;
    var sortSelect = el('select', { id: 'sort-by', 'aria-label': 'Sort the board by' },
      [['implied', 'Implied value'], ['tvl', 'TVL'], ['growth', '7-day growth'], ['age', 'Age'], ['multiple', 'Mcap / TVL'], ['name', 'Name'], ['category', 'Category']].map(function (opt) {
        return el('option', { value: opt[0], text: opt[1], selected: state.sort === opt[0] ? 'selected' : null });
      })
    );
    sortSelect.addEventListener('change', function () { state.sort = sortSelect.value; state.dir = -1; render(); });
    var limitAll = el('button', { type: 'button', 'aria-pressed': state.limit === 'all' ? 'true' : 'false', text: 'Show all ' + total, onclick: function () { state.limit = 'all'; render(); } });
    var limit50 = el('button', { type: 'button', 'aria-pressed': state.limit === '50' ? 'true' : 'false', text: 'Show top 50', onclick: function () { state.limit = '50'; render(); } });
    return el('div', { class: 'exportbar' },
      el('div', { class: 'field' }, el('label', { for: 'sort-by', text: 'Sort by' }), sortSelect),
      el('div', { class: 'field' }, el('span', { class: 'sub', text: 'Rows shown' }), el('div', { class: 'tabs' }, limitAll, limit50)),
      el('button', { class: 'button', type: 'button', text: 'Download board as CSV', onclick: downloadCsv }),
      el('button', { class: 'button', type: 'button', text: 'Copy link to this view', onclick: copyBoardLink }),
      el('span', { id: 'copy-note', class: 'sub', 'aria-live': 'polite' }),
      el('span', { class: 'sub', text: 'The CSV follows the search, the filters and the sort above.' })
    );
  }

  /** One row of the comparison table: a figure for each protocol and the gap between them. */
  function compareFigure(label, aText, bText, dText, dClass) {
    return el('tr', null,
      el('td', { text: label }),
      el('td', { class: 'num', text: aText }),
      el('td', { class: 'num', text: bText }),
      el('td', { class: 'num ' + (dClass || ''), text: dText })
    );
  }

  /** A signed dollar gap: +$1.23B, -$842K, or $0 when the two are equal. */
  function deltaUsd(d) {
    if (d === null || d === undefined || !isFinite(d)) return 'n/a';
    if (d === 0) return '$0';
    return (d > 0 ? '+' : '') + fmtUsd(d);
  }

  /** A signed plain-number gap with a unit: +0.12x, -3d, +5.00%. */
  function deltaNum(d, unit, digits) {
    if (d === null || d === undefined || !isFinite(d)) return 'n/a';
    if (d === 0) return '0' + unit;
    return (d > 0 ? '+' : '') + d.toFixed(digits === undefined ? 2 : digits) + unit;
  }

  /** The side-by-side table for two protocols, on the figures the ranking is built on. */
  function compareTable(a, b) {
    var growthA = a.change_7d === null ? null : a.change_7d;
    var growthB = b.change_7d === null ? null : b.change_7d;
    var ageA = a.age_days === null ? null : a.age_days;
    var ageB = b.age_days === null ? null : b.age_days;
    return el('div', { class: 'table-wrap' },
      el('table', { class: 'compact' },
        el('thead', null, el('tr', null,
          el('th', { scope: 'col', text: 'Figure' }),
          el('th', { scope: 'col', text: '#' + a.rank + ' ' + a.name }),
          el('th', { scope: 'col', text: '#' + b.rank + ' ' + b.name }),
          el('th', { scope: 'col', text: 'Gap (second minus first)' })
        )),
        el('tbody', null,
          compareFigure('Implied value', fmtUsd(a.implied_value_usd), fmtUsd(b.implied_value_usd), deltaUsd(b.implied_value_usd - a.implied_value_usd), b.implied_value_usd >= a.implied_value_usd ? 'pos' : 'neg'),
          compareFigure('TVL', fmtUsd(a.tvl_usd), fmtUsd(b.tvl_usd), deltaUsd(b.tvl_usd - a.tvl_usd), b.tvl_usd >= a.tvl_usd ? 'pos' : 'neg'),
          compareFigure('Category', a.category || 'Other', b.category || 'Other', a.category === b.category ? 'same' : 'different', ''),
          compareFigure('Chains', (a.chains || []).join(', ') || 'none', (b.chains || []).join(', ') || 'none', (a.chains || []).length === (b.chains || []).length ? 'same count' : deltaNum((b.chains || []).length - (a.chains || []).length, '', 0), ''),
          compareFigure('7-day growth', fmtPct(growthA), fmtPct(growthB), growthA === null || growthB === null ? 'n/a' : deltaNum(growthB - growthA, '%'), growthA !== null && growthB !== null && growthB >= growthA ? 'pos' : 'neg'),
          compareFigure('Age with no token', fmtAge(ageA), fmtAge(ageB), ageA === null || ageB === null ? 'n/a' : deltaNum(ageB - ageA, 'd', 0), ''),
          compareFigure('Category multiple', a.multiple.toFixed(2) + 'x', b.multiple.toFixed(2) + 'x', deltaNum(b.multiple - a.multiple, 'x'), b.multiple >= a.multiple ? 'pos' : 'neg'),
          compareFigure('Growth multiplier', String(a.growth_multiplier), String(b.growth_multiplier), deltaNum(b.growth_multiplier - a.growth_multiplier, ''), ''),
          compareFigure('Maturity multiplier', String(a.maturity_multiplier), String(b.maturity_multiplier), deltaNum(b.maturity_multiplier - a.maturity_multiplier, ''), ''),
          compareFigure('Breadth multiplier', String(a.breadth_multiplier), String(b.breadth_multiplier), deltaNum(b.breadth_multiplier - a.breadth_multiplier, ''), '')
        )
      )
    );
  }

  /** Two protocols side by side: pick any two rows of the board and compare their figures. */
  function comparePanel() {
    function selectFor(which) {
      var current = which === 'a' ? state.compareA : state.compareB;
      var sel = el('select', { 'aria-label': which === 'a' ? 'First protocol to compare' : 'Second protocol to compare' },
        el('option', { value: '', text: 'Pick a protocol' }),
        DATA.rows.map(function (r) {
          return el('option', { value: r.slug, text: '#' + r.rank + ' ' + r.name, selected: current === r.slug ? 'selected' : null });
        })
      );
      sel.addEventListener('change', function () {
        if (which === 'a') state.compareA = sel.value || null;
        else state.compareB = sel.value || null;
        render();
      });
      return sel;
    }
    var panel = el('section', { class: 'panel compare' },
      el('h2', { text: 'Compare two protocols' }),
      el('p', { class: 'sub', text: 'Pick any two rows of the board to see them side by side: the same figures the ranking is built on, and the gap between them. The gap reads second minus first.' }),
      el('div', { class: 'compare-picks' }, selectFor('a'), selectFor('b'))
    );
    var a = DATA.rows.filter(function (r) { return r.slug === state.compareA; })[0];
    var b = DATA.rows.filter(function (r) { return r.slug === state.compareB; })[0];
    if (a && b) {
      if (a.slug === b.slug) panel.appendChild(el('p', { class: 'sub', text: 'Pick two different protocols to compare them.' }));
      else {
        panel.appendChild(compareTable(a, b));
        panel.appendChild(el('button', { class: 'button', type: 'button', text: 'Download comparison as CSV', onclick: function () { downloadCompareCsv(a, b); } }));
      }
    }
    return panel;
  }

  /** The week's biggest movers on the board: the five fastest growers and the five hardest falls. */
  function moversPanel() {
    function movers(dir) {
      return DATA.rows
        .filter(function (r) { return r.change_7d !== null; })
        .sort(function (a, b) { return dir * (b.change_7d - a.change_7d) || (a.slug < b.slug ? -1 : 1); })
        .slice(0, 5);
    }
    function moverList(title, list, cls) {
      return el('div', null,
        el('h3', { text: title }),
        el('ol', { class: 'movers' }, list.map(function (r) {
          return el('li', null,
            el('button', { type: 'button', onclick: function () { openDetail(r.slug); } },
              el('b', { text: '#' + r.rank + ' ' + r.name }),
              el('span', { class: 'num ' + cls, text: fmtPct(r.change_7d) }),
              el('span', { class: 'sub', text: fmtUsd(r.implied_value_usd) + ' implied' })
            )
          );
        }))
      );
    }
    return el('section', { class: 'panel movers-panel' },
      el('h2', { text: 'This week\u2019s biggest movers' }),
      el('p', { class: 'sub', text: 'Seven-day TVL change is the model\u2019s growth input, so a fast mover is a row whose implied value is moving too. Select a mover to open its detail view.' }),
      el('div', { class: 'movers-grid' },
        moverList('Fastest growing', movers(1), 'pos'),
        moverList('Hardest falling', movers(-1), 'neg')
      )
    );
  }

  /** The board by chain: where the ranked protocols live, and what each chain's rows imply. */
  function chainPanel() {
    var byChain = {};
    DATA.rows.forEach(function (r) {
      (r.chains || []).forEach(function (chain) {
        var c = byChain[chain] || (byChain[chain] = { rows: 0, total: 0, top: null });
        c.rows += 1;
        c.total += r.implied_value_usd;
        if (!c.top || r.implied_value_usd > c.top.implied_value_usd) c.top = r;
      });
    });
    var chains = Object.keys(byChain).map(function (k) {
      return { chain: k, rows: byChain[k].rows, total: byChain[k].total, top: byChain[k].top };
    }).sort(function (a, b) { return b.total - a.total || (a.chain < b.chain ? -1 : 1); });
    return el('section', { class: 'panel chains' },
      el('h2', { text: 'Where the board lives, by chain' }),
      el('p', { class: 'sub', text: 'A protocol on several chains counts once per chain it names. The table is sorted by total implied value, so the chains carrying the most launch value read first.' }),
      el('div', { class: 'table-wrap' },
        el('table', { class: 'compact' },
          el('thead', null, el('tr', null, el('th', { scope: 'col', text: 'Chain' }), el('th', { scope: 'col', text: 'Rows' }), el('th', { scope: 'col', text: 'Total implied' }), el('th', { scope: 'col', text: 'Top protocol' }))),
          el('tbody', null, chains.slice(0, 12).map(function (c) {
            return el('tr', null,
              el('td', { text: c.chain }),
              el('td', { class: 'num', text: String(c.rows) }),
              el('td', { class: 'num', text: fmtUsd(c.total) }),
              el('td', null, el('b', { text: c.top.name }), el('span', { class: 'sub', text: ' ' + fmtUsd(c.top.implied_value_usd) }))
            );
          }))
        )
      ),
      el('p', { class: 'sub', text: 'Showing the top 12 of ' + chains.length + ' chains by total implied value.' })
    );
  }

  /** The comparison on screen as CSV: one row per figure, both protocols and the gap. */
  function compareCsv(a, b) {
    function row(label, av, bv, dv) { return [csvCell(label), csvCell(av), csvCell(bv), csvCell(dv)].join(','); }
    var lines = ['figure,' + csvCell(a.name) + ',' + csvCell(b.name) + ',gap'];
    lines.push(row('Rank', String(a.rank), String(b.rank), String(b.rank - a.rank)));
    lines.push(row('Implied value (USD)', String(a.implied_value_usd), String(b.implied_value_usd), String(b.implied_value_usd - a.implied_value_usd)));
    lines.push(row('TVL (USD)', String(a.tvl_usd), String(b.tvl_usd), String(b.tvl_usd - a.tvl_usd)));
    lines.push(row('Category', a.category || 'Other', b.category || 'Other', a.category === b.category ? 'same' : 'different'));
    lines.push(row('7-day growth (%)', a.change_7d === null ? '' : String(a.change_7d), b.change_7d === null ? '' : String(b.change_7d), a.change_7d === null || b.change_7d === null ? '' : String(b.change_7d - a.change_7d)));
    lines.push(row('Age (days)', a.age_days === null ? '' : String(a.age_days), b.age_days === null ? '' : String(b.age_days), a.age_days === null || b.age_days === null ? '' : String(b.age_days - a.age_days)));
    lines.push(row('Category multiple', String(a.multiple), String(b.multiple), String(b.multiple - a.multiple)));
    return lines.join('\n') + '\n';
  }

  /** Download the comparison the panel shows as a CSV file. */
  function downloadCompareCsv(a, b) {
    var blob = new Blob([compareCsv(a, b)], { type: 'text/csv' });
    var aEl = document.createElement('a');
    aEl.href = URL.createObjectURL(blob);
    aEl.download = 'token-radar-compare-' + a.slug + '-vs-' + b.slug + '.csv';
    document.body.appendChild(aEl);
    aEl.click();
    aEl.remove();
    setTimeout(function () { URL.revokeObjectURL(aEl.href); }, 1000);
  }

  /** How to read the board, in plain language, for a reader who has never seen a radar. */
  function howTo() {
    return el('section', { class: 'panel howto' },
      el('h2', { text: 'How to read this board' }),
      el('ol', { class: 'howto-steps' },
        el('li', null, el('b', { text: 'Start at the top. ' }), 'Rank 1 is the protocol whose token launch the model values most, not the biggest protocol. A small protocol with a strong multiple can outrank a large one.'),
        el('li', null, el('b', { text: 'Check the multiple. ' }), 'Each row shows what live protocols in the same category already trade at, per dollar of TVL. That multiple is the only market input; everything else is the protocol\u2019s own record.'),
        el('li', null, el('b', { text: 'Open a row. ' }), 'The detail view shows the full equation, the thesis in one sentence, and a seven-step farm plan derived from the protocol\u2019s category, chains, TVL and age.'),
        el('li', null, el('b', { text: 'Try the sandbox. ' }), 'Move a weight in the model panel and the board recomputes at once. The submitted board always uses the weights the panel states; the sandbox only previews a different weighting.'),
        el('li', null, el('b', { text: 'Use the Live token tab. ' }), 'Protocols that already trade are set aside from the ranking, with their market caps as facts, not model outputs — they are the comparables the ranking is learned from.')
      ),
      el('p', { class: 'sub', text: 'Implied value is a model of what a token could be worth at launch, built from this snapshot alone. It is an estimate, never a price, and never investment advice.' })
    );
  }

  /** The board's total implied value split across categories, with each category's top row. */
  function categoryPanel() {
    var byCat = {};
    DATA.rows.forEach(function (r) {
      var key = r.category || 'Other';
      var c = byCat[key] || (byCat[key] = { rows: 0, total: 0, top: null });
      c.rows += 1;
      c.total += r.implied_value_usd;
      if (!c.top || r.implied_value_usd > c.top.implied_value_usd) c.top = r;
    });
    var cats = Object.keys(byCat).map(function (k) {
      return { category: k, rows: byCat[k].rows, total: byCat[k].total, top: byCat[k].top };
    }).sort(function (a, b) { return b.total - a.total || (a.category < b.category ? -1 : 1); });
    var grand = DATA.rows.reduce(function (s, r) { return s + r.implied_value_usd; }, 0) || 1;
    return el('section', { class: 'panel cats' },
      el('h2', { text: 'Where the value sits, by category' }),
      el('p', { class: 'sub', text: 'The board\u2019s total implied value split across categories. A category with one giant row and a category with many mid-size rows read very differently as a hunting ground.' }),
      el('div', { class: 'table-wrap' },
        el('table', { class: 'compact' },
          el('thead', null, el('tr', null, el('th', { scope: 'col', text: 'Category' }), el('th', { scope: 'col', text: 'Rows' }), el('th', { scope: 'col', text: 'Total implied' }), el('th', { scope: 'col', text: 'Share' }), el('th', { scope: 'col', text: 'Top protocol' }))),
          el('tbody', null, cats.map(function (c) {
            return el('tr', null,
              el('td', { text: c.category }),
              el('td', { class: 'num', text: String(c.rows) }),
              el('td', { class: 'num', text: fmtUsd(c.total) }),
              el('td', { class: 'num', text: (100 * c.total / grand).toFixed(1) + '%' }),
              el('td', null, el('b', { text: c.top.name }), el('span', { class: 'sub', text: ' ' + fmtUsd(c.top.implied_value_usd) }))
            );
          }))
        )
      )
    );
  }

  function liveTable() {
    var tbody = el('tbody');
    DATA.live.forEach(function (r) {
      tbody.appendChild(el('tr', null,
        el('td', null, el('span', { class: 'status live', text: 'live' })),
        el('td', null, el('div', { class: 'name' }, el('b', { text: r.name }), el('span', { class: 'sub', text: (r.category || 'Other') + ' on ' + (r.chains && r.chains.length ? r.chains.slice(0, 2).join(', ') : 'an unnamed chain') }))),
        el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }),
        el('td', { class: 'num ' + (r.change_7d !== null && r.change_7d >= 0 ? 'pos' : 'neg'), text: fmtPct(r.change_7d) }),
        el('td', { class: 'num', text: fmtUsd(r.mcap_usd) }),
        el('td', null, el('span', { class: 'status live', text: 'already trades' }))
      ));
    });
    return el('div', { class: 'panel' },
      el('div', { class: 'table-wrap' },
        el('table', null,
          el('caption', { class: 'sub', text: 'Token live: these protocols already trade, so their market cap is a fact, not a model. They are set aside from the pre-token ranking.' }),
          el('thead', null, el('tr', null, el('th', { scope: 'col', text: 'Status' }), el('th', { scope: 'col', text: 'Protocol' }), el('th', { scope: 'col', text: 'TVL' }), el('th', { scope: 'col', text: '7d' }), el('th', { scope: 'col', text: 'Market cap' }), el('th', { scope: 'col', text: 'Token' }))),
          tbody
        )
      )
    );
  }

  function modelPanel() {
    var m = MODEL;
    var compRows = DATA.comparables.map(function (c) {
      return el('tr', null,
        el('td', { text: c.category }),
        el('td', { class: 'num', text: String(c.peers) }),
        el('td', { class: 'num', text: c.median_multiple.toFixed(2) + 'x' })
      );
    });
    function slider(id, label, min, max, step, value, key) {
      var out = el('output', { for: id, text: String(value) });
      var input = el('input', { type: 'range', id: id, min: String(min), max: String(max), step: String(step), value: String(value), 'aria-label': label });
      input.addEventListener('input', function () { state.sandbox[key] = parseFloat(input.value); out.textContent = input.value; render(); });
      return el('label', null, label + ' ', out, input);
    }
    return el('section', { class: 'panel model' },
      el('h2', { text: 'How implied value is computed' }),
      el('p', { class: 'sub', text: 'Every row is scored by one function of the snapshot figures. The multiple is what the live market already pays per dollar of TVL in the same category, learned from this snapshot. No protocol name is special-cased, and no row is hand-picked.' }),
      el('div', { class: 'model-grid' },
        el('div', null,
          el('div', { class: 'formula' },
            'implied = round( tvl_usd x ', el('b', { text: 'category multiple' }), ' x (1 + clamp(change_7d, ' + m.growth_floor + ', ' + m.growth_cap + ') / 100 x ' + m.growth_weight + ') x (' + m.maturity_floor + ' + min(age_days, ' + m.maturity_days + ') / ' + m.maturity_days + ' x ' + m.maturity_range + ') x (1 + ' + m.breadth_per_chain + ' x extra chains, at most ' + m.breadth_max_chains + ') )'
          ),
          el('p', { class: 'sub', text: 'TVL and seven-day growth come from the snapshot. Age is the time since the protocol was first listed, the best record of how long it has run with no token; an unlisted age uses ' + m.unknown_age_days + ' days. A category with fewer than ' + m.min_category_peers + ' live peers falls back to the snapshot-wide median of ' + DATA.overall_multiple.toFixed(2) + 'x. Multiples are clamped to ' + m.multiple_floor + 'x–' + m.multiple_cap + 'x. Wrapped, staked and bridged products are never ranked as launches, the same bar the watchlist sets.' })
        ),
        el('div', null,
          el('h3', { text: 'What the live market pays, by category' }),
          el('div', { class: 'table-wrap' },
            el('table', { class: 'compact' },
              el('thead', null, el('tr', null, el('th', { scope: 'col', text: 'Category' }), el('th', { scope: 'col', text: 'Live peers' }), el('th', { scope: 'col', text: 'Median mcap / TVL' }))),
              el('tbody', null, compRows)
            )
          )
        )
      ),
      el('div', { class: 'sandbox' },
        el('h3', { text: 'Model sandbox' }),
        el('p', { class: 'sub', text: 'Move a weight and the board recomputes at once. This previews a different weighting; the submitted board always uses the weights above.' }),
        slider('sb-growth', 'Growth weight', 0, 1, 0.05, state.sandbox.growth_weight, 'growth_weight'),
        slider('sb-maturity', 'Maturity range', 0, 0.8, 0.05, state.sandbox.maturity_range, 'maturity_range'),
        slider('sb-breadth', 'Breadth per extra chain', 0, 0.06, 0.01, state.sandbox.breadth_per_chain, 'breadth_per_chain')
      )
    );
  }

  var dialog = el('dialog', { class: 'detail', id: 'detail', 'aria-labelledby': 'detail-title' });
  dialog.addEventListener('close', function () { state.selected = null; writeHash(); });

  function openDetail(slug) {
    var row = DATA.rows.filter(function (r) { return r.slug === slug; })[0];
    if (!row) return;
    state.selected = slug;
    writeHash();
    dialog.textContent = '';
    var steps = farmSteps(row);
    var recomputed = impliedOf(row, state.sandbox);
    dialog.appendChild(el('div', { class: 'detail-head' },
      el('div', null,
        el('span', { class: 'brand-name', text: 'Rank ' + row.rank + ' of ' + DATA.board_size }),
        el('h2', { id: 'detail-title', text: row.name }),
        el('p', { class: 'sub', text: (row.category || 'Other') + ' on ' + (row.chains && row.chains.length ? row.chains.join(', ') : 'an unnamed chain') })
      ),
      el('button', { class: 'close', type: 'button', 'aria-label': 'Close details', text: 'Close', onclick: function () { dialog.close(); } })
    ));
    dialog.appendChild(el('p', { class: 'thesis', text: row.thesis }));
    dialog.appendChild(el('section', { class: 'detail-section' },
      el('h3', { text: 'Implied value' }),
      el('div', { class: 'equation' },
        el('div', null, el('span', { text: 'TVL' }), el('b', { class: 'num', text: fmtUsd(row.tvl_usd) })),
        el('div', null, el('span', { text: 'Category multiple' }), el('b', { class: 'num', text: row.multiple.toFixed(2) + 'x' })),
        el('div', null, el('span', { text: 'Multiple source' }), el('b', { class: 'num', text: row.multiple_source })),
        el('div', null, el('span', { text: 'Seven-day growth' }), el('b', { class: 'num', text: fmtPct(row.change_7d) })),
        el('div', null, el('span', { text: 'Age with no token' }), el('b', { class: 'num', text: fmtAge(row.age_days) })),
        el('div', null, el('span', { text: 'Growth multiplier' }), el('b', { class: 'num', text: String(row.growth_multiplier) })),
        el('div', null, el('span', { text: 'Maturity multiplier' }), el('b', { class: 'num', text: String(row.maturity_multiplier) })),
        el('div', null, el('span', { text: 'Breadth multiplier' }), el('b', { class: 'num', text: String(row.breadth_multiplier) })),
        el('div', { class: 'total' }, el('span', { text: 'Implied value' }), el('b', { class: 'num', text: fmtUsd(row.implied_value_usd) }))
      ),
      el('p', { class: 'sub', text: 'Model ' + DATA.model_version + ': the same function scores every protocol. The page recomputes this row as ' + fmtUsd(recomputed) + (recomputed === row.implied_value_usd ? ', the same number board.json carries.' : ', which differs from the board because the sandbox is previewing a different weighting.') + ' This is an estimate, not a price.' })
    ));
    dialog.appendChild(el('section', { class: 'detail-section' },
      el('h3', { text: 'Farm plan' }),
      el('ol', { class: 'steps' }, steps.map(function (s) {
        var at = s.indexOf(' Cost: ');
        var action = at >= 0 ? s.slice(0, at) : s;
        var tail = at >= 0 ? s.slice(at + 1) : '';
        return el('li', null, el('b', { text: action }), el('span', { class: 'cost', text: tail }));
      }))
    ));
    if (typeof dialog.showModal === 'function') {
      if (!dialog.open) dialog.showModal();
    } else {
      dialog.setAttribute('open', '');
    }
  }

  function footer() {
    return el('p', { class: 'foot' },
      'Source: ', el('b', { text: DATA.source }), '. Snapshot ', el('b', { text: DATA.as_of }),
      '. A protocol that records no token may still have one its DefiLlama record does not carry. Implied value is the entry\u2019s own claim, never a price.'
    );
  }

  function render() {
    app.textContent = '';
    var shell = el('div', { class: 'shell' });
    shell.appendChild(header());
    shell.appendChild(lede());
    shell.appendChild(spotlight());
    shell.appendChild(controls());
    var banner = previewBanner();
    if (banner) shell.appendChild(banner);
    shell.appendChild(state.tab === 'pre-token' ? boardTable() : liveTable());
    if (state.tab === 'pre-token') {
      shell.appendChild(exportBar());
      shell.appendChild(modelPanel());
      shell.appendChild(howTo());
      shell.appendChild(categoryPanel());
      shell.appendChild(chainPanel());
      shell.appendChild(moversPanel());
      shell.appendChild(comparePanel());
    }
    shell.appendChild(footer());
    app.appendChild(shell);
    app.setAttribute('aria-busy', 'false');
    if (!dialog.isConnected) app.appendChild(dialog);
    if (state.selected) openDetail(state.selected);
  }

  readHash();
  render();
  window.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && dialog.open) dialog.close();
  });
})();
