function openSlotMachine(slot) {
  window.location.href = `slots.html?machine=${encodeURIComponent(slot)}`;
}

document.querySelectorAll(".vv-play-slot").forEach((btn) => {
  btn.onclick = (event) => {
    const card = event.target.closest(".vv-slot-card");
    const slot = card?.dataset?.slot;
    if (!slot) return;
    openSlotMachine(slot);
  };
});

document.querySelectorAll(".vv-slot-card").forEach((card) => {
  card.addEventListener("click", (event) => {
    if (event.target.closest(".vv-play-slot")) return;
    const slot = card.dataset.slot;
    if (!slot) return;
    openSlotMachine(slot);
  });
});

window.openSlotMachine = openSlotMachine;
window.render_game_to_text = () => JSON.stringify({
  screen: "slots-lobby",
  launchMode: "direct"
});
window.advanceTime = async () => {};
