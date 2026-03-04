function renderFooter(){
  const host = document.getElementById("vv-footer");
  if(!host) return;
  const year = new Date().getFullYear();
  host.innerHTML = `
    <div class="vv-container vv-footer">
      <nav class="vv-footerLinks" aria-label="Footer navigation">
        <a href="index.html">Home</a>
        <a href="login.html">Login</a>
        <a href="members.html">Members</a>
        <a href="slots-lobby.html">Slots</a>
        <a href="slots.html">Play</a>
        <a href="promotions.html">Promotions</a>
        <a href="about.html">About</a>
        <a href="terms.html">Terms</a>
        <a href="privacy.html">Privacy</a>
        <a href="responsible-gambling.html">Responsible Play</a>
        <a href="ledger.html">Ledger</a>
      </nav>
      <div class="vv-footerMeta">© ${year} Velvet Vault — Keep the lights low. Follow the green signal.</div>
    </div>
  `;
}

if(document.readyState==="loading"){
  document.addEventListener("DOMContentLoaded", renderFooter, {once:true});
}else{
  renderFooter();
}
