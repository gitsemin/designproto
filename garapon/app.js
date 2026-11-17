/* GARAPONᴸ v2: 등장 효과, 메뉴 색, 3D 조립, 밝기 다이얼, 센서 연결, 갤러리, 소식 폼 */
(() => {
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

  // 등장
  const io = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) { e.target.classList.add('is-in'); io.unobserve(e.target); } }), { threshold: .15 });
  document.querySelectorAll('.reveal').forEach((el) => io.observe(el));

  // 메뉴 글자색: 메뉴 아래가 회색 화면이면 검정, 아니면 흰색
  const nav = document.getElementById('nav');
  const studios = [...document.querySelectorAll('.screen--studio')];
  const navColor = () => {
    const y = 30;
    const onStudio = studios.some((s) => { const r = s.getBoundingClientRect(); return r.top <= y && r.bottom >= y; });
    nav.classList.toggle('is-dark', !onStudio);
  };
  addEventListener('scroll', navColor, { passive: true }); navColor();

  // 3D 조립
  const sec = document.getElementById('assemble');
  const steps = [...document.querySelectorAll('#assemble-steps li')];
  if (window.THREE && window.GaraponScene) {
    const scene = GaraponScene(document.getElementById('assemble-canvas'), { background: 0x000000 });
    const cut = [0.1, 0.35, 0.55, 0.68, 1.01];
    const update = () => {
      const r = sec.getBoundingClientRect(); const span = sec.offsetHeight - innerHeight;
      const p = reduced ? 1 : Math.min(1, Math.max(0, span > 0 ? -r.top / span : 0));
      scene.setProgress(p);
      const i = cut.findIndex((c) => p < c);
      steps.forEach((li, k) => li.classList.toggle('is-on', k === i));
    };
    addEventListener('scroll', update, { passive: true }); addEventListener('resize', update); update();
  }

  // 밝기 다이얼 (4.5바퀴 = 1620°)
  const FULL = 1620;
  const dial = document.getElementById('dial'), fill = document.getElementById('dial-fill'), knob = document.getElementById('dial-knob');
  const pct = document.getElementById('dial-pct'), turns = document.getElementById('dial-turns'), lamp = document.getElementById('lamp');
  const ticks = document.getElementById('dial-ticks');
  for (let i = 0; i < 60; i++) {
    const a = (i / 60) * Math.PI * 2, long = i % 5 === 0;
    const l = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    l.setAttribute('class', 'dial__tick');
    l.setAttribute('x1', 120 + Math.sin(a) * 90); l.setAttribute('y1', 120 - Math.cos(a) * 90);
    l.setAttribute('x2', 120 + Math.sin(a) * (long ? 80 : 85)); l.setAttribute('y2', 120 - Math.cos(a) * (long ? 80 : 85));
    ticks.appendChild(l);
  }
  let deg = FULL * 0.3;
  const render = () => {
    const level = deg / FULL, p = Math.round(level * 100);
    pct.textContent = p; turns.textContent = `${(deg / 360).toFixed(1)} / 4.5 turns`;
    fill.style.strokeDasharray = `${p} 100`;
    knob.setAttribute('transform', `rotate(${deg % 360} 120 120)`);
    dial.setAttribute('aria-valuenow', p);
    lamp.style.setProperty('--glow', Math.pow(level, 1.8).toFixed(3)); // 어두운 쪽을 길게 쓰는 곡선
  };
  const setDeg = (d) => { deg = Math.min(FULL, Math.max(0, d)); render(); };
  let last = null, serialOn = false;
  const angleAt = (e) => { const r = dial.getBoundingClientRect(); return Math.atan2(e.clientX - (r.left + r.width / 2), -(e.clientY - (r.top + r.height / 2))) * 180 / Math.PI; };
  dial.addEventListener('pointerdown', (e) => { last = angleAt(e); dial.setPointerCapture(e.pointerId); });
  dial.addEventListener('pointermove', (e) => { if (last === null || serialOn) return; const a = angleAt(e); let d = a - last; if (d > 180) d -= 360; if (d < -180) d += 360; last = a; setDeg(deg + d); });
  dial.addEventListener('pointerup', () => { last = null; });
  dial.addEventListener('wheel', (e) => { if (serialOn) return; e.preventDefault(); setDeg(deg - e.deltaY * 0.6); }, { passive: false });
  dial.addEventListener('keydown', (e) => {
    if (serialOn) return; const s = e.shiftKey ? 90 : 30;
    if (e.key === 'ArrowUp' || e.key === 'ArrowRight') { setDeg(deg + s); e.preventDefault(); }
    if (e.key === 'ArrowDown' || e.key === 'ArrowLeft') { setDeg(deg - s); e.preventDefault(); }
    if (e.key === 'Home') setDeg(0); if (e.key === 'End') setDeg(FULL);
  });
  render();

  // 센서 연결: 중간고사 스케치 "STATE=RUN ... rotation_deg=123.4" (115200)
  const btn = document.getElementById('serial-btn'), state = document.getElementById('serial-state');
  let port = null, reader = null;
  if (!('serial' in navigator)) { btn.disabled = true; state.textContent = '센서 연결은 PC의 크롬·엣지에서만 돼요.'; }
  btn.addEventListener('click', async () => {
    if (serialOn) { await stop(); return; }
    try {
      port = await navigator.serial.requestPort(); await port.open({ baudRate: 115200 });
      serialOn = true; btn.textContent = '연결 끊기'; state.textContent = '센서 연결됨. 램프 손잡이를 돌려 보세요.'; readLoop();
    } catch (_) { state.textContent = '연결하지 못했어요. 아두이노 IDE 시리얼 모니터가 열려 있으면 닫아 주세요.'; }
  });
  async function readLoop() {
    const dec = new TextDecoderStream(); port.readable.pipeTo(dec.writable).catch(() => {});
    reader = dec.readable.getReader(); let buf = '';
    try {
      while (serialOn) {
        const { value, done } = await reader.read(); if (done) break;
        buf += value; const lines = buf.split('\n'); buf = lines.pop();
        for (const line of lines) { const m = line.match(/rotation_deg=(-?[\d.]+)/); if (line.includes('STATE=RUN') && m) setDeg(parseFloat(m[1])); }
      }
    } catch (_) {}
    await stop();
  }
  async function stop() {
    serialOn = false; btn.textContent = '센서 연결';
    try { await reader?.cancel(); } catch (_) {} try { await port?.close(); } catch (_) {}
    reader = null; port = null; if (!btn.disabled) state.textContent = '센서 없이 화면에서만 돌리는 중';
  }

  // 갤러리
  const slides = [...document.querySelectorAll('.slide')], dots = [...document.querySelectorAll('.dot')];
  let cur = 0, timer = null;
  const show = (i) => { cur = i; slides.forEach((s, k) => s.classList.toggle('is-on', k === i)); dots.forEach((d, k) => { d.classList.toggle('is-on', k === i); d.setAttribute('aria-selected', k === i); }); };
  dots.forEach((d, i) => d.addEventListener('click', () => { show(i); clearInterval(timer); }));
  if (!reduced) timer = setInterval(() => show((cur + 1) % slides.length), 4000);

  // 소식 폼 (과제용 데모: 실제로 보내지 않음)
  const form = document.getElementById('news-form'), help = document.getElementById('email-help'), msg = document.getElementById('form-msg');
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    if (!form.email.value || !form.email.validity.valid) { form.classList.add('is-error'); help.textContent = '! 이메일 형식이 아니에요.'; form.email.focus(); msg.textContent = ''; return; }
    form.classList.remove('is-error'); help.textContent = '한 달에 한 번만 보내요.'; msg.textContent = '고마워요! (데모라서 실제로 보내지는 않아요)'; form.reset();
  });
})();
