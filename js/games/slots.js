(function slotsInit(){
  const requiredIds = [
    "balance","result","betLabel","lineBetLabel","multLabel","autoLabel",
    "spinBtn","betUp","betDown","maxBtn","autoBtn","stopBtn","autoCount",
    "machineSelect","paytableBtn","paytableModal","paytableClose","paytableTitle","paytableBody",
    "holdWinModal","holdWinClose","holdWinGrid","holdWinSpin","respinsLeft","holdWinTotal",
    "paylines",
    "col1","col2","col3","col4","col5",
    "c1r1","c1r2","c1r3","c2r1","c2r2","c2r3","c3r1","c3r2","c3r3","c4r1","c4r2","c4r3","c5r1","c5r2","c5r3"
  ];
  const missing = requiredIds.filter(id => !document.getElementById(id));
  if (missing.length) { console.warn("[Slots] Missing elements:", missing.join(", ")); return; }

  // --- UI hooks ---
  const balanceEl = document.getElementById("balance");
  const resultEl  = document.getElementById("result");
  const betLabel  = document.getElementById("betLabel");
  const lineBetLabel = document.getElementById("lineBetLabel");
  const multLabel = document.getElementById("multLabel");
  const autoLabel = document.getElementById("autoLabel");

  const spinBtn = document.getElementById("spinBtn");
  const betUp   = document.getElementById("betUp");
  const betDown = document.getElementById("betDown");
  const maxBtn  = document.getElementById("maxBtn");
  const autoBtn = document.getElementById("autoBtn");
  const stopBtn = document.getElementById("stopBtn");
  const autoCountEl = document.getElementById("autoCount");

  const machineSelect = document.getElementById("machineSelect");
  const paytableBtn = document.getElementById("paytableBtn");
  const paytableModal = document.getElementById("paytableModal");
  const paytableClose = document.getElementById("paytableClose");
  const paytableTitle = document.getElementById("paytableTitle");
  const paytableBody = document.getElementById("paytableBody");

  const holdWinModal = document.getElementById("holdWinModal");
  const holdWinClose = document.getElementById("holdWinClose");
  const holdWinGrid = document.getElementById("holdWinGrid");
  const holdWinSpin = document.getElementById("holdWinSpin");
  const respinsLeftEl = document.getElementById("respinsLeft");
  const holdWinTotalEl = document.getElementById("holdWinTotal");

  const cols = [
    document.getElementById("col1"),
    document.getElementById("col2"),
    document.getElementById("col3"),
    document.getElementById("col4"),
    document.getElementById("col5"),
  ];
  const cells = [
    [document.getElementById("c1r1"),document.getElementById("c1r2"),document.getElementById("c1r3")],
    [document.getElementById("c2r1"),document.getElementById("c2r2"),document.getElementById("c2r3")],
    [document.getElementById("c3r1"),document.getElementById("c3r2"),document.getElementById("c3r3")],
    [document.getElementById("c4r1"),document.getElementById("c4r2"),document.getElementById("c4r3")],
    [document.getElementById("c5r1"),document.getElementById("c5r2"),document.getElementById("c5r3")],
  ];

  const paylinesWrap = document.getElementById("paylines");
  const reelsWrap = document.querySelector(".reelsWrap");

  // Normalize DOM to guarantee 5x3 visible cabinet.
  // Fixes the "~~~/~~" layout issue (wrong rows/wrapping).
  function ensureCabinetDOM(){
    if (!reelsWrap) return;

    const reelGrid = reelsWrap.querySelector(".reels") || reelsWrap;
    const existingCols = Array.from(reelGrid.querySelectorAll(".reelCol"));
    const looksRight =
      existingCols.length === REELS &&
      existingCols.every(col => col.querySelectorAll(".cell,.reel-cell").length >= ROWS);

    if (looksRight){
      cols.length = 0;
      cells.length = 0;
      existingCols.forEach((col)=>{
        cols.push(col);
        const list = Array.from(col.querySelectorAll(".cell,.reel-cell")).slice(0, ROWS);
        cells.push(list);
      });
      return;
    }

    reelGrid.innerHTML = "";
    cols.length = 0;
    cells.length = 0;

    for (let r=0; r<REELS; r++){
      const col = document.createElement("div");
      col.className = "reelCol";
      col.id = `col${r+1}`;
      reelGrid.appendChild(col);
      cols.push(col);

      const colCells = [];
      for (let row=0; row<ROWS; row++){
        const cell = document.createElement("div");
        cell.className = "cell";
        cell.id = `c${r+1}r${row+1}`;
        col.appendChild(cell);
        colCells.push(cell);
      }
      cells.push(colCells);
    }
  }

  // --- Utility ---
  const clamp = (n,min,max)=>Math.max(min,Math.min(max,n));
  const rnd = (min,max)=>Math.floor(Math.random()*(max-min+1))+min;
  const pickWeighted = (pairs) => {
    const total = pairs.reduce((s,p)=>s+p.w,0);
    let r = Math.random()*total;
    for (const p of pairs) { r -= p.w; if (r<=0) return p.id; }
    return pairs[pairs.length-1].id;
  };

  // --- 10 paylines for 5x3 ---
  const PAYLINES = [
    [1,1,1,1,1],
    [0,0,0,0,0],
    [2,2,2,2,2],
    [0,1,2,1,0],
    [2,1,0,1,2],
    [0,0,1,0,0],
    [2,2,1,2,2],
    [1,0,0,0,1],
    [1,2,2,2,1],
    [0,1,1,1,2],
  ];

  (function buildPaylines(){
    paylinesWrap.innerHTML = "";
    const rowY = ["18%","50%","82%"];
    for (let i=0;i<PAYLINES.length;i++){
      const d=document.createElement("div");
      d.className="payline";
      d.style.top = rowY[PAYLINES[i][0]];
      d.dataset.line = String(i);
      paylinesWrap.appendChild(d);
    }
  })();

  // --- Machine configs (7 story machines) ---
  function sym(id,glyph,type="REG"){ return { id, glyph, type }; }
  function makePay(base){ return { 3: base, 4: base*3, 5: base*10 }; }

  function makeMachineBase({key,name,desc,accent,scatter,coin,wild,regulars,weights,payBase,freeSpins,skin}){
    const symbols = [
      sym(scatter, skin?.scatterGlyph ?? "⭐", "SCAT"),
      sym(coin,    skin?.coinGlyph    ?? "🪙", "COIN"),
      sym(wild,    skin?.wildGlyph    ?? "🃏", "WILD"),
      ...regulars,
    ];
    const paytable = {};
    for (const s of regulars) paytable[s.id] = makePay(payBase[s.id] ?? 8);
    paytable[wild] = makePay(15);
    return {
      key, name, desc, accent,
      symbols,
      ids: { scatter, coin, wild },
      skin: skin || {},
      stripWeights: weights,
      paytable,
      freeSpins,
    };
  }

  function makeMachine_VelvetNoir(){
    const regulars = [
      sym("MASK","🎭"), sym("ROSE","🥀"), sym("RING","💍"),
      sym("WINE","🍷"), sym("DIAMOND","💎"), sym("KEY","🗝️")
    ];
    return makeMachineBase({
      key:"velvet_noir",
      name:"Velvet Noir",
      desc:"Masks, roses, and secrets. The house whispers. Coins trigger Hold & Win.",
      accent:"noir",
      scatter:"SCAT",
      coin:"COIN",
      wild:"WILD",
      regulars,
      skin: { skinKey:"noir", scatterGlyph:"🌙", coinGlyph:"🩸", wildGlyph:"🃏" },
      weights: [
        {id:"WINE", w: 18},{id:"ROSE", w: 16},{id:"KEY", w: 14},{id:"RING", w: 12},
        {id:"DIAMOND", w: 10},{id:"MASK", w: 8},
        {id:"WILD", w: 6},{id:"SCAT", w: 5},{id:"COIN", w: 7},
      ],
      payBase: { WINE:6, ROSE:7, KEY:8, RING:10, DIAMOND:14, MASK:18 },
      freeSpins: (n)=> n>=4?10 : n===3?8 : 0,
    });
  }
  function makeMachine_CyberSakura(){
    const regulars = [sym("SAKURA","🌸"), sym("NEON_FOX","🦊"), sym("CIRCUIT","🧬"), sym("KATANA","🗡️"), sym("GEM","🔶"), sym("BYTE","💾")];
    return makeMachineBase({
      key:"cyber_sakura",
      name:"Cyber Sakura",
      desc:"Neon petals and razor luck. Free spins lean wild-heavy.",
      accent:"neon",
      scatter:"SCAT",
      coin:"COIN",
      wild:"WILD",
      regulars,
      skin: { skinKey:"sakura", scatterGlyph:"🌸", coinGlyph:"🔋", wildGlyph:"🟪" },
      weights: [
        {id:"BYTE", w: 18},{id:"GEM", w: 16},{id:"CIRCUIT", w: 14},{id:"SAKURA", w: 12},
        {id:"KATANA", w: 10},{id:"NEON_FOX", w: 8},
        {id:"WILD", w: 7},{id:"SCAT", w: 5},{id:"COIN", w: 6},
      ],
      payBase: { BYTE:6, GEM:7, CIRCUIT:8, SAKURA:10, KATANA:14, NEON_FOX:18 },
      freeSpins: (n)=> n>=4?12 : n===3?10 : 0,
    });
  }
  function makeMachine_NeonPharaoh(){
    const regulars = [sym("EYE","🧿"), sym("ANKH","☥"), sym("SCARAB","🪲"), sym("PYRAMID","🔺"), sym("GOLD","🪙"), sym("CROWN","👑")];
    return makeMachineBase({
      key:"neon_pharaoh",
      name:"Neon Pharaoh",
      desc:"Ancient power with neon edges. Coins can chain big features.",
      accent:"sand",
      scatter:"SCAT",
      coin:"COIN",
      wild:"WILD",
      regulars,
      skin: { skinKey:"pharaoh", scatterGlyph:"✨", coinGlyph:"🟡", wildGlyph:"👁️" },
      weights: [
        {id:"PYRAMID", w: 18},{id:"SCARAB", w: 16},{id:"EYE", w: 14},{id:"ANKH", w: 12},
        {id:"GOLD", w: 10},{id:"CROWN", w: 8},
        {id:"WILD", w: 6},{id:"SCAT", w: 5},{id:"COIN", w: 7},
      ],
      payBase: { PYRAMID:6, SCARAB:7, EYE:8, ANKH:10, GOLD:14, CROWN:18 },
      freeSpins: (n)=> n>=4?12 : n===3?8 : 0,
    });
  }
  function makeMachine_EmeraldHeist(){
    const regulars = [sym("BAG","💰"), sym("LASER","🔫"), sym("BLUEPRINT","📐"), sym("GEM","💚"), sym("VAULT","🏦"), sym("ALARM","🚨")];
    return makeMachineBase({
      key:"emerald_heist",
      name:"Emerald Heist",
      desc:"Steal the glow. Hold & Win appears slightly more often.",
      accent:"emerald",
      scatter:"SCAT",
      coin:"COIN",
      wild:"WILD",
      regulars,
      skin: { skinKey:"heist", scatterGlyph:"🧩", coinGlyph:"💚", wildGlyph:"🕶️" },
      weights: [
        {id:"BLUEPRINT", w: 18},{id:"LASER", w: 16},{id:"BAG", w: 14},{id:"GEM", w: 12},
        {id:"ALARM", w: 10},{id:"VAULT", w: 8},
        {id:"WILD", w: 6},{id:"SCAT", w: 5},{id:"COIN", w: 9},
      ],
      payBase: { BLUEPRINT:6, LASER:7, BAG:8, GEM:10, ALARM:14, VAULT:18 },
      freeSpins: (n)=> n>=4?10 : n===3?8 : 0,
    });
  }
  function makeMachine_CrimsonCrown(){
    const regulars = [sym("CROWN","👑"), sym("SWORD","⚔️"), sym("SEAL","🦁"), sym("GEM","❤️"), sym("TORCH","🔥"), sym("BANNER","🎌")];
    return makeMachineBase({
      key:"crimson_crown",
      name:"Crimson Crown",
      desc:"Royal risk. High symbol hits feel heavy.",
      accent:"crimson",
      scatter:"SCAT",
      coin:"COIN",
      wild:"WILD",
      regulars,
      skin: { skinKey:"crown", scatterGlyph:"👑", coinGlyph:"🔴", wildGlyph:"🦁" },
      weights: [
        {id:"BANNER", w: 18},{id:"TORCH", w: 16},{id:"GEM", w: 14},{id:"SEAL", w: 12},
        {id:"SWORD", w: 10},{id:"CROWN", w: 8},
        {id:"WILD", w: 6},{id:"SCAT", w: 5},{id:"COIN", w: 7},
      ],
      payBase: { BANNER:6, TORCH:7, GEM:8, SEAL:10, SWORD:14, CROWN:18 },
      freeSpins: (n)=> n>=4?10 : n===3?8 : 0,
    });
  }
  function makeMachine_AbyssalPearls(){
    const regulars = [sym("PEARL","🫧"), sym("SHELL","🐚"), sym("WAVE","🌊"), sym("TRIDENT","🔱"), sym("FISH","🐟"), sym("TREASURE","🧰")];
    return makeMachineBase({
      key:"abyssal_pearls",
      name:"Abyssal Pearls",
      desc:"Deep sea shimmer. Free spins can feel ‘floaty’ with extra wilds.",
      accent:"ocean",
      scatter:"SCAT",
      coin:"COIN",
      wild:"WILD",
      regulars,
      skin: { skinKey:"abyss", scatterGlyph:"🌊", coinGlyph:"🫧", wildGlyph:"🔱" },
      weights: [
        {id:"FISH", w: 18},{id:"WAVE", w: 16},{id:"SHELL", w: 14},{id:"PEARL", w: 12},
        {id:"TRIDENT", w: 10},{id:"TREASURE", w: 8},
        {id:"WILD", w: 7},{id:"SCAT", w: 5},{id:"COIN", w: 6},
      ],
      payBase: { FISH:6, WAVE:7, SHELL:8, PEARL:10, TRIDENT:14, TREASURE:18 },
      freeSpins: (n)=> n>=4?12 : n===3?10 : 0,
    });
  }
  function makeMachine_ClockworkVault(){
    const regulars = [sym("GEAR","⚙️"), sym("CLOCK","⏱️"), sym("SPRING","🌀"), sym("KEY","🗝️"), sym("MAP","🗺️"), sym("VAULT","🏦")];
    return makeMachineBase({
      key:"clockwork_vault",
      name:"Clockwork Vault",
      desc:"Precision luck. Hold & Win is ‘mechanical’ and steady.",
      accent:"steel",
      scatter:"SCAT",
      coin:"COIN",
      wild:"WILD",
      regulars,
      skin: { skinKey:"clockwork", scatterGlyph:"⏱️", coinGlyph:"⚙️", wildGlyph:"🔧" },
      weights: [
        {id:"SPRING", w: 18},{id:"GEAR", w: 16},{id:"MAP", w: 14},{id:"CLOCK", w: 12},
        {id:"KEY", w: 10},{id:"VAULT", w: 8},
        {id:"WILD", w: 6},{id:"SCAT", w: 5},{id:"COIN", w: 7},
      ],
      payBase: { SPRING:6, GEAR:7, MAP:8, CLOCK:10, KEY:14, VAULT:18 },
      freeSpins: (n)=> n>=4?10 : n===3?8 : 0,
    });
  }

  const MACHINES = [
    makeMachine_VelvetNoir(),
    makeMachine_CyberSakura(),
    makeMachine_NeonPharaoh(),
    makeMachine_EmeraldHeist(),
    makeMachine_CrimsonCrown(),
    makeMachine_AbyssalPearls(),
    makeMachine_ClockworkVault(),
  ];

  const SLOT_CONFIG_BY_MACHINE = {
    velvet_noir: "noir_paylines_5x3",
    cyber_sakura: "neon_ways_5x3",
    neon_pharaoh: "ember_cascade_5x3",
    emerald_heist: "royal_cluster_5x3",
    crimson_crown: "noir_paylines_5x3",
    abyssal_pearls: "neon_ways_5x3",
    clockwork_vault: "ember_cascade_5x3",
  };

  const toInt = (n)=> {
    const v = Number(n);
    if (!Number.isFinite(v)) return 0;
    return Math.floor(v);
  };

  // --- Game state ---
  let balance = Number(balanceEl.textContent || "5000") || 5000;
  let bet = 150;
  const lines = PAYLINES.length;
  let lineBet = Math.floor(bet / lines);
  let lastMult = 1.0;
  let auto = false;
  let autoLeft = 0;
  let busy = false;
  let stopRequested = false;
  let celebrating = false;
  let cancelCelebration = false;

  let freeSpinsLeft = 0;
  let inFreeSpins = false;
  let freeSpinMult = 1.0;
  let serverFeatureState = null;
  let serverFeatureStateMachineId = "";

  let machine = MACHINES[0];

  // Build dropdown
  (function initPicker(){
    machineSelect.innerHTML = "";
    for (const m of MACHINES){
      const opt=document.createElement("option");
      opt.value=m.key;
      opt.textContent=m.name;
      machineSelect.appendChild(opt);
    }
    machineSelect.value = machine.key;
    machineSelect.addEventListener("change", ()=>{
      const m = MACHINES.find(x=>x.key===machineSelect.value) || MACHINES[0];
      machine = m;
      serverFeatureState = null;
      serverFeatureStateMachineId = "";
      applyMachineSkin();
      clearHighlights();
      renderRandomGrid();
      setResult(`Machine set: ${machine.name}.`);
    });
  })();

  // Paytable modal
  function openModal(el){ el.classList.add("open"); el.setAttribute("aria-hidden","false"); }
  function closeModal(el){ el.classList.remove("open"); el.setAttribute("aria-hidden","true"); }
  paytableBtn.addEventListener("click", ()=>{
    paytableTitle.textContent = machine.name;
    paytableBody.innerHTML = renderPaytableHTML(machine);
    openModal(paytableModal);
  });
  paytableClose.addEventListener("click", ()=>closeModal(paytableModal));
  paytableModal.addEventListener("click", (e)=>{ if (e.target===paytableModal) closeModal(paytableModal); });

  holdWinClose.addEventListener("click", ()=>closeModal(holdWinModal));
  holdWinModal.addEventListener("click", (e)=>{ if (e.target===holdWinModal) closeModal(holdWinModal); });

  function formatMoney(value){
    if (window.VaultEngine?.formatAUD) return window.VaultEngine.formatAUD(value);
    if (window.VaultEngine?.formatGold) return window.VaultEngine.formatGold(value);
    return `$${(toInt(value) / 100).toFixed(2)}`;
  }

  function syncUI(){
    if (window.VaultEngine && typeof window.VaultEngine.getBalance === "function"){
      const latest = toInt(window.VaultEngine.getBalance());
      if (latest >= 0) balance = latest;
    }
    balanceEl.textContent = formatMoney(balance);
    betLabel.textContent = formatMoney(bet);
    lineBet = Math.max(1, Math.floor(bet / lines));
    lineBetLabel.textContent = formatMoney(lineBet);
    multLabel.textContent = `${lastMult.toFixed(2)}x`;
    autoLabel.textContent = auto ? "ON" : "OFF";
    autoCountEl.textContent = String(autoLeft);
  }
  function syncControls(){
    const canSpin = !busy && !celebrating;
    const canAdjustBet = !busy && !celebrating && !auto;
    const canStop = busy && auto && !stopRequested;

    spinBtn.disabled = !canSpin;
    betUp.disabled = !canAdjustBet;
    betDown.disabled = !canAdjustBet;
    maxBtn.disabled = !canAdjustBet;
    machineSelect.disabled = !canAdjustBet;

    autoBtn.disabled = busy || celebrating;
    stopBtn.disabled = !canStop;
  }
  function setResult(msg){ resultEl.textContent = msg; }

  function currentServerConfigId(){
    return SLOT_CONFIG_BY_MACHINE[machine.key] || "noir_paylines_5x3";
  }

  function currentSlotServerUrl(){
    return window.VVAtomicSpin?.resolveSlotServerUrl
      ? window.VVAtomicSpin.resolveSlotServerUrl(window.VV_SLOT_SERVER_URL)
      : String(window.VV_SLOT_SERVER_URL || "").trim().replace(/\/+$/, "");
  }

  function hasAtomicServerSpin(){
    return Boolean(
      window.VVAtomicSpin &&
      typeof window.VVAtomicSpin.atomicSpin === "function" &&
      window.VaultEngine &&
      typeof window.VaultEngine.reserveBet === "function" &&
      typeof window.VaultEngine.settleBet === "function" &&
      typeof window.VaultEngine.cancelBet === "function" &&
      window.vvAuth?.currentUser &&
      currentSlotServerUrl()
    );
  }

  function makeClientSeed(){
    if (window.crypto && typeof window.crypto.randomUUID === "function") {
      return window.crypto.randomUUID();
    }
    return `seed_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
  }

  function renderServerGrid(grid){
    if (!Array.isArray(grid)) return;
    for (let r=0;r<REELS;r++){
      for (let row=0;row<ROWS;row++){
        const id = String(grid[row]?.[r] || "");
        const s = symbolById(id);
        const el = cells[r]?.[row];
        if (!el) continue;
        el.textContent = s.glyph !== "?" ? s.glyph : (id ? id.slice(0, 2) : "?");
        el.classList.toggle("scatter", id===machine.ids.scatter || id==="SCATTER" || id==="SCAT");
        el.classList.toggle("coin", id===machine.ids.coin || id==="COIN");
        el.classList.toggle("wild", id===machine.ids.wild || id==="WILD");
      }
    }
  }

  function applyServerHighlights(wins){
    clearHighlights();
    if (!Array.isArray(wins)) return;
    for (const w of wins){
      const line = Number(w?.lineIndex);
      if (Number.isFinite(line)){
        const pl = paylinesWrap.querySelector(`.payline[data-line="${line}"]`);
        if (pl) pl.classList.add("on");
      }
      const positions = Array.isArray(w?.positions) ? w.positions : [];
      for (const p of positions){
        const reel = Number(p?.reel);
        const row = Number(p?.row);
        if (!Number.isInteger(reel) || !Number.isInteger(row)) continue;
        const cell = cells[reel]?.[row];
        if (cell) cell.classList.add("win");
      }
    }
  }

  // --- Reel model ---
  const REELS = 5;
  const ROWS = 3;
  let reelState = [];

  // Normalize cabinet on startup.
  ensureCabinetDOM();

  const STRIPS_BY_MACHINE = new Map();

  function buildStrip(weights){
    const strip = [];
    for (let i=0;i<56;i++){
      strip.push(pickWeighted(weights));
    }
    for (let k=0;k<8;k++){
      const a = rnd(0, strip.length-6);
      const b = rnd(0, strip.length-6);
      for (let j=0;j<5;j++){
        const t = strip[a+j];
        strip[a+j] = strip[b+j];
        strip[b+j] = t;
      }
    }
    return strip;
  }

  function ensureMachineStrips(m){
    if (STRIPS_BY_MACHINE.has(m.key)) return STRIPS_BY_MACHINE.get(m.key);
    const strips = [];
    for (let r=0;r<REELS;r++){
      strips.push(buildStrip(m.stripWeights));
    }
    STRIPS_BY_MACHINE.set(m.key, strips);
    return strips;
  }

  function resetReels(){
    const strips = ensureMachineStrips(machine);
    reelState = [];
    for (let r=0;r<REELS;r++){
      const strip = strips[r];
      reelState.push({ strip, pos: rnd(0, strip.length-1) });
    }
  }

  function symbolById(id){
    return machine.symbols.find(s=>s.id===id) || { id, glyph:"?" };
  }

  function windowForReel(r){
    const st = reelState[r];
    const strip = st.strip;
    const top = st.pos;
    const out = [];
    for (let i=0;i<ROWS;i++){
      out.push(strip[(top+i) % strip.length]);
    }
    return out;
  }

  function getGrid(){
    const grid = Array.from({length: ROWS}, ()=>Array(REELS).fill("X"));
    for (let r=0;r<REELS;r++){
      const w = windowForReel(r);
      for (let row=0;row<ROWS;row++){
        grid[row][r] = w[row];
      }
    }
    return grid;
  }

  function renderGrid(){
    const grid = getGrid();
    for (let r=0;r<REELS;r++){
      for (let row=0;row<ROWS;row++){
        const id = grid[row][r];
        const s = symbolById(id);
        const el = cells[r]?.[row];
        if (!el) continue;
        el.textContent = s.glyph;
        el.classList.toggle("scatter", id===machine.ids.scatter);
        el.classList.toggle("coin", id===machine.ids.coin);
        el.classList.toggle("wild", id===machine.ids.wild);
      }
    }
  }

  function renderRandomGrid(){
    resetReels();
    renderGrid();
  }

  // --- Line evaluation ---
  function clearHighlights(){
    document.querySelectorAll(".cell.win").forEach(el=>el.classList.remove("win"));
    document.querySelectorAll(".payline.on").forEach(el=>el.classList.remove("on"));
  }

  function evalLines(grid){
    let total = 0;
    const wins = [];
    const highlights = [];
    let scatters = 0;
    let coins = 0;
    for (let row=0;row<ROWS;row++){
      for (let r=0;r<REELS;r++){
        const id=grid[row][r];
        if (id===machine.ids.scatter) scatters++;
        if (id===machine.ids.coin) coins++;
      }
    }

    for (let li=0; li<PAYLINES.length; li++){
      const pattern = PAYLINES[li];
      let baseSym = null;
      for (let r=0;r<REELS;r++){
        const symId = grid[pattern[r]][r];
        if (symId===machine.ids.scatter || symId===machine.ids.coin) { /* skip */ }
        else if (symId===machine.ids.wild) { /* skip for base pick */ }
        else { baseSym = symId; break; }
      }
      if (!baseSym){
        baseSym = machine.ids.wild;
      }

      let count = 0;
      for (let r=0;r<REELS;r++){
        const symId = grid[pattern[r]][r];
        if (symId===baseSym || symId===machine.ids.wild){
          count++;
        } else {
          break;
        }
      }
      if (count >= 3){
        const payDef = machine.paytable[baseSym];
        const pay = (payDef?.[count] ?? 0) * lineBet;
        if (pay>0){
          wins.push({ line: li, symId: baseSym, count, pay });
          total += pay;
          for (let r=0;r<count;r++){
            highlights.push({ reel:r, row: pattern[r], line: li });
          }
        }
      }
    }
    return { win: total, wins, scatters, coins, highlights };
  }

  function applyHighlights(result){
    clearHighlights();
    const hitLines = new Set(result.wins.map(w=>w.line));
    hitLines.forEach(li=>{
      const el = paylinesWrap.querySelector(`.payline[data-line="${li}"]`);
      if (el) el.classList.add("on");
    });
    for (const h of result.highlights){
      cells[h.reel][h.row].classList.add("win");
    }
  }

  function clearPaylineCycle(){
    document.querySelectorAll(".payline.cycle").forEach(el=>el.classList.remove("cycle"));
  }
  function clearCellWin(){
    document.querySelectorAll(".cell.win").forEach(el=>el.classList.remove("win"));
  }
  function sleep(ms){ return new Promise(res=>setTimeout(res, ms)); }

  async function animateCountUp(amount, prefix){
    const steps = 14;
    for (let i=1;i<=steps;i++){
      if (cancelCelebration) return;
      const v = Math.floor((amount * i) / steps);
      setResult(`${prefix}${v}`);
      await sleep(28);
    }
  }

  async function ladderCelebrate(grid, res, payout){
    if (!res.wins.length) return;
    celebrating = true;
    cancelCelebration = false;
    syncControls();

    try {
      await animateCountUp(payout, "Win: +");
      if (cancelCelebration) return;
      await sleep(120);

      for (const w of res.wins){
        if (cancelCelebration) break;
        clearPaylineCycle();
        clearCellWin();

        const pl = paylinesWrap.querySelector(`.payline[data-line=\"${w.line}\"]`);
        if (pl){
          pl.classList.add("on");
          pl.classList.add("cycle");
        }

        const pattern = PAYLINES[w.line];
        for (let r=0;r<w.count;r++){
          const row = pattern[r];
          cells[r][row].classList.add("win");
        }

        const symGlyph = symbolById(w.symId).glyph;
        setResult(`Line ${w.line+1}: ${symGlyph} ×${w.count}  (+${formatMoney(w.pay * lastMult | 0)})`);
        await sleep(420);
      }

      clearPaylineCycle();
      applyHighlights(res);
      if (!cancelCelebration){
        setResult(`Win: +${formatMoney(payout)} (Lines: ${res.wins.length})${inFreeSpins?` • Free Spins left: ${freeSpinsLeft}`:""}`);
      }
    } finally {
      celebrating = false;
      syncControls();
    }
  }

  // --- Reel realism ---
  const REALISM = {
    spinUpMs: 140,
    steadyMs: 420,
    decelMs: 320,
    baseStaggerMs: 190,
    fastStopMinMs: 220,
    nearMissChance: 0.035,
    anticipationExtraMs: 220,
  };

  function setReelClass(r, cls, on){
    if (!cols[r]) return;
    cols[r].classList.toggle(cls, !!on);
  }
  function clearReelClasses(){
    for (let r=0;r<REELS;r++){
      cols[r].classList.remove("slam","anticipation");
    }
    reelsWrap?.classList.remove("tease-coins","tease-scatters");
  }

  function bounceReel(r){
    const el = cols[r];
    if (!el) return;
    el.classList.remove("bounce");
    void el.offsetWidth; // restart animation
    el.classList.add("bounce");
    setTimeout(()=>el.classList.remove("bounce"), 260);
  }

  function detectEarlyScatters(grid, uptoReelInclusive){
    let c=0;
    for (let r=0;r<=uptoReelInclusive;r++){
      for (let row=0;row<ROWS;row++){
        if (grid[row][r]===machine.ids.scatter) c++;
      }
    }
    return c;
  }

  function maybeApplyNearMiss(finals){
    if (Math.random() > REALISM.nearMissChance) return finals;
    const tmp = finals.slice();
    let scatterCount = 0;
    for (let r=0;r<4;r++){
      const st = reelState[r];
      const strip = st.strip;
      const top = tmp[r];
      for (let i=0;i<ROWS;i++){
        if (strip[(top+i)%strip.length]===machine.ids.scatter) scatterCount++;
      }
    }
    if (scatterCount < 2) return finals;

    const st5 = reelState[4];
    const strip5 = st5.strip;
    let scatterIdx = -1;
    for (let tries=0; tries<40; tries++){
      const idx = rnd(0, strip5.length-1);
      if (strip5[idx]===machine.ids.scatter){ scatterIdx = idx; break; }
    }
    if (scatterIdx < 0) return finals;

    const useAbove = Math.random() < 0.5;
    const finalTop = useAbove
      ? (scatterIdx + 1) % strip5.length
      : (scatterIdx - 3 + strip5.length) % strip5.length;
    tmp[4] = finalTop;
    return tmp;
  }

  async function spinReels(){
    stopRequested = false;
    clearReelClasses();

    let finals = [];
    for (let r=0;r<REELS;r++){
      finals.push(rnd(0, reelState[r].strip.length-1));
    }

    finals = maybeApplyNearMiss(finals);

    let anticipate = false;
    {
      const pred = Array.from({length:ROWS}, ()=>Array(REELS).fill("X"));
      for (let r=0;r<REELS;r++){
        const st = reelState[r];
        const strip = st.strip;
        const top = (r<=2 ? finals[r] : st.pos);
        for (let i=0;i<ROWS;i++){
          pred[i][r] = strip[(top+i) % strip.length];
        }
      }
      const early = detectEarlyScatters(pred, 2);
      if (early >= 2) anticipate = true;
    }

    const start = performance.now();
    const baseStop = REALISM.spinUpMs + REALISM.steadyMs + REALISM.decelMs;
    const stagger = REALISM.baseStaggerMs;
    const endTimes = finals.map((_,r)=> start + baseStop + r*stagger + (anticipate && r>=3 ? REALISM.anticipationExtraMs : 0));

    if (anticipate){
      setReelClass(3, "anticipation", true);
      setReelClass(4, "anticipation", true);
    }

    const maxAdv = [9, 10, 11, 12, 13];
    const minAdv = [1, 1, 1, 1, 1];

    return new Promise((resolve)=>{
      function step(now){
        let done = true;
        for (let r=0;r<REELS;r++){
          const st = reelState[r];
          const endT = endTimes[r];
          if (stopRequested && now > start + REALISM.fastStopMinMs){
            endTimes[r] = Math.min(endTimes[r], now + 140 + r*55);
          }
          if (now < endTimes[r]){
            done = false;
            const elapsed = now - start;
            const total = (endTimes[r] - start);
            const p = clamp(elapsed / total, 0, 1);

            const spinUpP = REALISM.spinUpMs / total;
            const decelP = REALISM.decelMs / total;
            let adv;
            if (p < spinUpP){
              const t = p / spinUpP;
              adv = Math.round(minAdv[r] + (maxAdv[r]-minAdv[r]) * (t*t));
            } else if (p > (1 - decelP)){
              const t = (p - (1 - decelP)) / decelP;
              const easeOut = (1 - (1-t)*(1-t));
              adv = Math.round(maxAdv[r] - (maxAdv[r]-minAdv[r]) * easeOut);
            } else {
              adv = Math.round(maxAdv[r] * 0.85);
            }
            adv = clamp(adv, 1, maxAdv[r]);
            st.pos = (st.pos + adv) % st.strip.length;
          } else {
            st.pos = finals[r];
            setReelClass(r, "slam", true);
            setTimeout(()=>setReelClass(r,"slam",false), 120 + r*20);
            setTimeout(()=>bounceReel(r), 60 + r*25);
          }
        }
        renderGrid();
        if (done) resolve();
        else requestAnimationFrame(step);
      }
      requestAnimationFrame(step);
    });
  }

  // --- Features ---
  function awardFreeSpins(scatterCount){
    const fs = machine.freeSpins(scatterCount);
    if (fs>0){
      freeSpinsLeft += fs;
      inFreeSpins = true;
      freeSpinMult = 1.25;
      setResult(`Free Spins! +${fs} (Total ${freeSpinsLeft}).`);
    }
  }

  let hw = null;
  function startHoldWin(grid){
    hw = {
      locked: Array.from({length:ROWS}, ()=>Array(REELS).fill(null)),
      respins: 3,
      total: 0,
    };
    for (let row=0;row<ROWS;row++){
      for (let r=0;r<REELS;r++){
        if (grid[row][r]===machine.ids.coin){
          hw.locked[row][r] = coinValue();
        }
      }
    }
    renderHoldWin();
    openModal(holdWinModal);
  }

  function coinValue(){
    const base = Math.max(1, Math.floor(lineBet/2));
    const picks = [
      {v: base*1, w: 40},
      {v: base*2, w: 28},
      {v: base*5, w: 18},
      {v: base*10, w: 10},
      {v: base*25, w: 4},
    ];
    const total = picks.reduce((s,p)=>s+p.w,0);
    let r = Math.random()*total;
    for (const p of picks){ r-=p.w; if (r<=0) return p.v; }
    return picks[picks.length-1].v;
  }

  function renderHoldWin(){
    holdWinGrid.innerHTML = "";
    let total = 0;
    for (let row=0;row<ROWS;row++){
      for (let r=0;r<REELS;r++){
        const cell = document.createElement("div");
        cell.className = "hwCell";
        const v = hw.locked[row][r];
        if (v!=null){
          cell.classList.add("locked");
          cell.innerHTML = `🪙 <span class="v">${v}</span>`;
          total += v;
        } else {
          cell.textContent = "—";
        }
        holdWinGrid.appendChild(cell);
      }
    }
    hw.total = total;
    respinsLeftEl.textContent = String(hw.respins);
    holdWinTotalEl.textContent = formatMoney(hw.total);
  }

  function holdWinFilledCount(){
    let c=0;
    for (let row=0;row<ROWS;row++) for (let r=0;r<REELS;r++) if (hw.locked[row][r]!=null) c++;
    return c;
  }

  holdWinSpin.addEventListener("click", ()=>{
    if (!hw) return;
    if (hw.respins<=0) return;
    let added = 0;
    const empties = [];
    for (let row=0;row<ROWS;row++){
      for (let r=0;r<REELS;r++){
        if (hw.locked[row][r]==null) empties.push([row,r]);
      }
    }
    const p = clamp(0.22 + (Math.random()*0.08), 0.18, 0.32);
    for (const [row,r] of empties){
      if (Math.random() < p){
        hw.locked[row][r] = coinValue();
        added++;
      }
    }
    if (added>0) hw.respins = 3;
    else hw.respins -= 1;
    renderHoldWin();
    if (hw.respins<=0 || holdWinFilledCount()===ROWS*REELS){
      balance += hw.total;
      syncUI();
      setResult(`Hold & Win complete: +${formatMoney(hw.total)}.`);
      hw = null;
      closeModal(holdWinModal);
    }
  });

  // --- Bet controls ---
  const BET_STEPS = [50, 100, 150, 200, 250, 300, 400, 500];
  function setBet(v){
    bet = clamp(v, BET_STEPS[0], BET_STEPS[BET_STEPS.length-1]);
    let best = BET_STEPS[0], dist = Infinity;
    for (const s of BET_STEPS){
      const d = Math.abs(s-bet);
      if (d<dist){ dist=d; best=s; }
    }
    bet = best;
    syncUI();
  }
  betUp.addEventListener("click", ()=>{
    const idx = BET_STEPS.indexOf(bet);
    setBet(BET_STEPS[Math.min(BET_STEPS.length-1, idx+1)]);
  });
  betDown.addEventListener("click", ()=>{
    const idx = BET_STEPS.indexOf(bet);
    setBet(BET_STEPS[Math.max(0, idx-1)]);
  });
  maxBtn.addEventListener("click", ()=>setBet(BET_STEPS[BET_STEPS.length-1]));

  // --- Spin flow ---
  async function doAtomicServerSpin(){
    if (!hasAtomicServerSpin()) return false;
    if (busy) return true;
    if (celebrating){
      cancelCelebration = true;
      celebrating = false;
      syncControls();
      return true;
    }

    busy = true;
    stopRequested = false;
    syncUI();
    syncControls();

    try {
      clearHighlights();
      setResult("Reserving wager...");

      const roundId = window.RoundEngine?.nextDebitId
        ? window.RoundEngine.nextDebitId("slots")
        : `slots_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

      const spinRequest = {
        stake: bet,
        denom: 1,
        machineId: currentServerConfigId(),
        roundId,
        clientSeed: makeClientSeed()
      };
      if (serverFeatureState && serverFeatureStateMachineId === spinRequest.machineId){
        spinRequest.state = serverFeatureState;
      }

      let payload = null;
      try {
        if (freeSpinsLeft <= 0 && balance < bet){
          throw new Error("Insufficient funds.");
        }

        resetReels();
        setResult("Spinning...");
        const spinPromise = window.VVAtomicSpin.atomicSpin({
          VaultEngine: window.VaultEngine,
          auth: window.vvAuth,
          slotServerUrl: currentSlotServerUrl(),
          machineId: spinRequest.machineId,
          stakeCents: spinRequest.stake,
          roundId: spinRequest.roundId,
          clientSeed: spinRequest.clientSeed,
          featureState: spinRequest.state || null,
          freeSpin: freeSpinsLeft > 0
        });
        await spinReels();
        payload = await spinPromise;
      } catch (err) {
        payload = { ok: false, error: err?.message || "Spin failed." };
      }

      if (!payload || payload.ok !== true || !payload.outcome){
        setResult(payload?.error || "Spin failed.");
        syncUI();
        return true;
      }

      const spin = payload.outcome;
      const nextState = spin.featureState || null;
      renderServerGrid(spin.grid || spin.finalGrid);
      applyServerHighlights(spin.wins);

      serverFeatureState = nextState || null;
      serverFeatureStateMachineId = payload.machineId || spin.configId || currentServerConfigId();
      freeSpinsLeft = Math.max(0, toInt(nextState?.freeSpinsRemaining));
      inFreeSpins = freeSpinsLeft > 0;
      freeSpinMult = Math.max(1, Number((nextState?.freeSpinsMultiplier ?? nextState?.freeSpinWinMultiplier ?? 1)));
      lastMult = Math.max(1, Number(spin.totalMultiplier || 1));

      balance = toInt(window.VaultEngine.getBalance() ?? balance);
      syncUI();

      const payout = toInt(spin.totalPayout ?? spin.totalWin);
      if (payout > 0){
        setResult(`Win: +${formatMoney(payout)} (Lines: ${Array.isArray(spin.wins) ? spin.wins.length : 0})${inFreeSpins?` • Free Spins left: ${freeSpinsLeft}`:""}`);
      } else {
        setResult(inFreeSpins ? `No win • Free Spins left: ${freeSpinsLeft}` : "No win.");
      }

      if (auto && autoLeft>0){
        autoLeft--;
        syncUI();
        setTimeout(()=>doSpin(), 220);
      } else if (auto && autoLeft<=0){
        auto = false;
        syncUI();
      }

      return true;
    } catch (err) {
      console.error(err);
      setResult("Spin failed.");
      return true;
    } finally {
      busy = false;
      syncUI();
      syncControls();
    }
  }

  async function doSpin(){
    if (hasAtomicServerSpin()){
      const handled = await doAtomicServerSpin();
      if (handled) return;
    }

    if (currentSlotServerUrl() && !window.vvAuth?.currentUser){
      setResult("Please sign in.");
      return;
    }

    if (window.VaultEngine?.mode === "secure"){
      if (!window.VaultEngine.user) {
        setResult("Connecting to the vault...");
      } else if (!currentSlotServerUrl()) {
        setResult("Slot server not configured.");
      } else {
        setResult("Atomic wallet unavailable.");
      }
      return;
    }

    if (busy) return;
    if (celebrating){
      cancelCelebration = true;
      celebrating = false;
      syncControls();
      return true;
    }
    busy = true;
    stopRequested = false;
    syncUI();
    syncControls();

    try {
      clearHighlights();

      const cost = bet;
      if (!inFreeSpins){
        if (balance < cost){
          setResult("Not enough balance.");
          return true;
        }
        balance -= cost;
      } else {
        freeSpinsLeft = Math.max(0, freeSpinsLeft-1);
        if (freeSpinsLeft===0){
          inFreeSpins = false;
          freeSpinMult = 1.0;
        }
      }
      syncUI();

      resetReels();
      await spinReels();

      const grid = getGrid();
      const res = evalLines(grid);

      const sc = res.scatters;
      const co = res.coins;
      if (reelsWrap){
        reelsWrap.classList.remove("tease-coins","tease-scatters");
        if (sc === 2){
          reelsWrap.classList.add("tease-scatters");
          setTimeout(()=>reelsWrap.classList.remove("tease-scatters"), 600);
        }
        if (co === 5){
          reelsWrap.classList.add("tease-coins");
          setTimeout(()=>reelsWrap.classList.remove("tease-coins"), 600);
        }
      }

      if (res.scatters >= 3){
        awardFreeSpins(res.scatters);
      }
      if (res.coins >= 6){
        startHoldWin(grid);
      }

      lastMult = inFreeSpins ? freeSpinMult : 1.0;
      const payout = Math.floor(res.win * lastMult);
      if (payout > 0){
        balance += payout;
        syncUI();
        applyHighlights(res);
        setResult(`Win: +${formatMoney(payout)} (Lines: ${res.wins.length})${inFreeSpins?` • Free Spins left: ${freeSpinsLeft}`:""}`);
        if (!hw && res.wins.length <= 4){
          await ladderCelebrate(grid, res, payout);
        }
      } else {
        setResult(inFreeSpins ? `No win • Free Spins left: ${freeSpinsLeft}` : "No win.");
      }

      if (auto && autoLeft>0){
        autoLeft--;
        syncUI();
        setTimeout(()=>doSpin(), 220);
      } else if (auto && autoLeft<=0){
        auto = false;
        syncUI();
      }

      return true;
    } catch (err) {
      console.error(err);
      setResult("Spin failed.");
      return true;
    } finally {
      busy = false;
      syncUI();
      syncControls();
    }
  }

  spinBtn.addEventListener("click", ()=>doSpin());

  autoBtn.addEventListener("click", ()=>{
    auto = !auto;
    if (auto){
      autoLeft = 25;
      stopRequested = false;
      syncUI();
      syncControls();
      doSpin();
    } else {
      autoLeft = 0;
      stopRequested = false;
      syncUI();
      syncControls();
    }
  });

  stopBtn.addEventListener("click", ()=>{
    auto = false;
    autoLeft = 0;
    stopRequested = true;
    cancelCelebration = true;
    syncUI();
    syncControls();
  });

  // --- Paytable render ---
  function renderPaytableHTML(m){
    const rows = [];
    rows.push(`<p class="sub" style="margin:0 0 10px;">${escapeHtml(m.desc)}</p>`);
    rows.push(`<div style="display:grid; gap:10px;">`);
    rows.push(`<div class="pill">Lines: <b>${PAYLINES.length}</b> • Free Spins: <b>3+ ⭐</b> • Hold &amp; Win: <b>6+ 🪙</b></div>`);
    rows.push(`<div style="display:grid; grid-template-columns: 1fr; gap:10px;">`);
    const regulars = m.symbols.filter(s=>s.type==="REG");
    const wild = m.ids.wild;
    rows.push(`<div class="pill">Wild ${symbolById(wild).glyph} substitutes for regular symbols.</div>`);
    rows.push(`<div class="pill">Scatter ⭐ triggers Free Spins (3=8, 4+=10-12 depending on machine).</div>`);
    rows.push(`<div class="pill">Coin 🪙 triggers Hold &amp; Win when 6+ land.</div>`);
    rows.push(`</div>`);
    rows.push(`<div style="margin-top:10px; display:grid; gap:8px;">`);
    for (const s of regulars){
      const p = m.paytable[s.id];
      rows.push(`<div class="pill">${s.glyph} <b>${escapeHtml(s.id)}</b> — 3:${p[3]} 4:${p[4]} 5:${p[5]} (× Line Bet)</div>`);
    }
    const pw = m.paytable[wild];
    rows.push(`<div class="pill">${symbolById(wild).glyph} <b>WILD</b> — 3:${pw[3]} 4:${pw[4]} 5:${pw[5]} (× Line Bet)</div>`);
    rows.push(`</div>`);
    rows.push(`</div>`);
    return rows.join("");
  }
  function escapeHtml(s){
    return String(s).replace(/[&<>"']/g, c=>({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[c]));
  }

  function applyMachineSkin(){
    document.body.setAttribute("data-slot-skin", machine.skin?.skinKey || machine.key);
  }

  function bindWallet(){
    const attach = () => {
      if (!window.VaultEngine) return false;
      if (typeof window.VaultEngine.subscribe === "function"){
        window.VaultEngine.subscribe((nextBalance)=>{
          balance = toInt(nextBalance);
          syncUI();
        });
      }
      if (typeof window.VaultEngine.getBalance === "function"){
        balance = toInt(window.VaultEngine.getBalance());
      }
      syncUI();
      return true;
    };

    if (attach()) return;
    let attempts = 0;
    const t = setInterval(() => {
      attempts += 1;
      if (attach() || attempts > 60){
        clearInterval(t);
      }
    }, 100);
  }

  window.render_game_to_text = function renderGameToText(){
    const grid = getGrid();
    return JSON.stringify({
      coordinateSystem: "grid rows top->bottom (0..2), reels left->right (0..4)",
      machine: machine.key,
      busy,
      auto,
      autoLeft,
      balance: toInt(balance),
      bet: toInt(bet),
      lineBet: toInt(lineBet),
      freeSpinsLeft: toInt(freeSpinsLeft),
      inFreeSpins,
      lastMultiplier: Number(lastMult || 1),
      grid,
      result: resultEl.textContent || ""
    });
  };

  window.advanceTime = function advanceTime(ms){
    const frames = Math.max(1, Math.round(Number(ms || 0) / (1000 / 60)));
    return new Promise((resolve) => {
      let remaining = frames;
      function tick(){
        remaining -= 1;
        if (remaining <= 0){
          resolve();
          return;
        }
        requestAnimationFrame(tick);
      }
      requestAnimationFrame(tick);
    });
  };

  // --- Init ---
  resetReels();
  renderGrid();
  setBet(150);
  bindWallet();
  syncUI();
  syncControls();
  applyMachineSkin();
  setResult("Ready.");
})();
