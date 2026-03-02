(function initVvBgParticles() {
  if (document.querySelector(".vvParticlesCanvas")) return;

  const canvas = document.createElement("canvas");
  canvas.className = "vvParticlesCanvas";
  canvas.setAttribute("aria-hidden", "true");
  document.body.appendChild(canvas);

  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const particles = Array.from({ length: 36 }, () => ({
    x: Math.random(),
    y: Math.random(),
    r: 1 + Math.random() * 2.4,
    vx: (Math.random() - 0.5) * 0.00018,
    vy: 0.0001 + Math.random() * 0.00022,
    a: 0.12 + Math.random() * 0.28
  }));

  function resize() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
  }

  function tick() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    for (const p of particles) {
      p.x += p.vx;
      p.y += p.vy;
      if (p.x < -0.05) p.x = 1.05;
      if (p.x > 1.05) p.x = -0.05;
      if (p.y > 1.05) p.y = -0.05;

      ctx.beginPath();
      ctx.fillStyle = `rgba(255, 255, 255, ${p.a})`;
      ctx.arc(p.x * canvas.width, p.y * canvas.height, p.r, 0, Math.PI * 2);
      ctx.fill();
    }
    requestAnimationFrame(tick);
  }

  resize();
  window.addEventListener("resize", resize);
  requestAnimationFrame(tick);
})();
