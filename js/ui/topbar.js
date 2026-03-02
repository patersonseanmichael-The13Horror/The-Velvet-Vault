const links = [
  { href: "index.html", label: "Home" },
  { href: "members.html", label: "Members" },
  { href: "slots.html", label: "Slots" },
  { href: "promotions.html", label: "Promotions" }
];

function currentName(){
  const path = (location.pathname.split("/").pop() || "index.html").toLowerCase();
  return path || "index.html";
}

export function renderTopbar(){
  const host = document.getElementById("vv-topbar");
  if(!host) return;

  const cur = currentName();
  host.innerHTML = `
    <div class="vv-topbar">
      <div class="vv-container vv-nav">
        <div class="vv-row" style="gap:10px;">
          <div class="sigil" aria-hidden="true" style="
            width:40px;height:40px;border-radius:14px;
            background: radial-gradient(circle at 30% 30%, rgba(0,255,154,0.35), transparent 55%),
                        radial-gradient(circle at 70% 70%, rgba(255,35,61,0.35), transparent 55%),
                        linear-gradient(135deg, rgba(255,35,61,0.20), rgba(0,255,154,0.20));
            border:1px solid rgba(255,255,255,0.16);
            position:relative; overflow:hidden;
          ">
            <span style="position:absolute; inset:-30%; background: conic-gradient(from 180deg, transparent, rgba(255,35,61,0.25), transparent, rgba(0,255,154,0.25), transparent); animation:sigilSpin 8s linear infinite; opacity:.85;"></span>
          </div>
          <div>
            <div style="font-family:var(--vv-font-display); letter-spacing:0.10em; font-weight:700;">Velvet Vault</div>
            <small style="color:var(--vv-muted); letter-spacing:0.06em;">VIP Noir Slots Club</small>
          </div>
        </div>
        <button class="vv-nav_toggle" type="button" aria-label="Toggle menu" id="vvNavToggle">Menu</button>
        <nav class="vv-nav_links" aria-label="Primary navigation" id="vvNavLinks">
          ${links.map(l=>`<a class="vv-chip ${cur===l.href?'active':''}" href="${l.href}">${l.label}</a>`).join("")}
          <button class="vv-btn ghost" id="logoutBtn" type="button">Logout</button>
        </nav>
      </div>
    </div>
  `;

  const toggle = document.getElementById("vvNavToggle");
  const navLinks = document.getElementById("vvNavLinks");
  if(toggle && navLinks){
    toggle.addEventListener("click", ()=> navLinks.classList.toggle("is-open"));
  }
}

if(document.readyState==="loading"){
  document.addEventListener("DOMContentLoaded", renderTopbar, {once:true});
}else{
  renderTopbar();
}
