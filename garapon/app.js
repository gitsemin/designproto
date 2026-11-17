/* 가라폰 웹: 밝기 다이얼 + 센서(시리얼) 연결 + 소식 폼 */
(() => {
  const FULL = 1620;            // 4.5바퀴 = 꺼짐 ~ 최대 (중간고사 스케치와 같은 범위)
  const dial = document.getElementById('dial');
  const fill = document.getElementById('dial-fill');
  const knob = document.getElementById('dial-knob');
  const pct = document.getElementById('dial-pct');
  const turns = document.getElementById('dial-turns');
  const lamp = document.getElementById('lamp');

  // 눈금: 1바퀴를 12칸
  const ticks = document.getElementById('dial-ticks');
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    const l = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    l.setAttribute('class', 'dial__tick');
    l.setAttribute('x1', 120 + Math.sin(a) * 78); l.setAttribute('y1', 120 - Math.cos(a) * 78);
    l.setAttribute('x2', 120 + Math.sin(a) * (i % 3 ? 70 : 64)); l.setAttribute('y2', 120 - Math.cos(a) * (i % 3 ? 70 : 64));
    ticks.appendChild(l);
  }

  let deg = FULL * 0.3;         // 누적 회전 각도
  const render = () => {
    const level = deg / FULL;
    const p = Math.round(level * 100);
    pct.textContent = p;
    turns.textContent = `${(deg / 360).toFixed(1)} / 4.5 바퀴`;
    fill.style.strokeDasharray = `${p} 100`;
    knob.setAttribute('transform', `rotate(${deg % 360} 120 120)`);
    dial.setAttribute('aria-valuenow', p);
    // 어두운 쪽을 길게 쓰는 곡선(중간고사 제어 곡선과 같은 생각): 밝기 = level^1.8
    lamp.style.setProperty('--glow', Math.pow(level, 1.8).toFixed(3));
  };
  const setDeg = (d) => { deg = Math.min(FULL, Math.max(0, d)); render(); };

  // 드래그로 돌리기
  let last = null;
  const angleAt = (e) => {
    const r = dial.getBoundingClientRect();
    return Math.atan2(e.clientX - (r.left + r.width / 2), -(e.clientY - (r.top + r.height / 2))) * 180 / Math.PI;
  };
  dial.addEventListener('pointerdown', (e) => { last = angleAt(e); dial.setPointerCapture(e.pointerId); });
  dial.addEventListener('pointermove', (e) => {
    if (last === null || serialOn) return;
    const a = angleAt(e); let d = a - last; if (d > 180) d -= 360; if (d < -180) d += 360;
    last = a; setDeg(deg + d);
  });
  dial.addEventListener('pointerup', () => { last = null; });
  dial.addEventListener('wheel', (e) => { if (serialOn) return; e.preventDefault(); setDeg(deg - e.deltaY * 0.6); }, { passive: false });
  dial.addEventListener('keydown', (e) => {
    if (serialOn) return;
    const step = e.shiftKey ? 90 : 30;
    if (e.key === 'ArrowUp' || e.key === 'ArrowRight') { setDeg(deg + step); e.preventDefault(); }
    if (e.key === 'ArrowDown' || e.key === 'ArrowLeft') { setDeg(deg - step); e.preventDefault(); }
    if (e.key === 'Home') setDeg(0);
    if (e.key === 'End') setDeg(FULL);
  });
  render();

  // 센서 연결: 중간고사 스케치가 보내는 "STATE=RUN ... rotation_deg=123.4" 줄을 읽는다 (115200)
  const btn = document.getElementById('serial-btn');
  const state = document.getElementById('serial-state');
  let serialOn = false, port = null, reader = null;
  if (!('serial' in navigator)) {
    btn.disabled = true;
    state.textContent = '센서 연결은 PC의 크롬·엣지에서만 돼요. 지금은 화면에서 돌려 보세요.';
  }
  btn.addEventListener('click', async () => {
    if (serialOn) { await stop(); return; }
    try {
      port = await navigator.serial.requestPort();
      await port.open({ baudRate: 115200 });
      serialOn = true; btn.lastChild.textContent = '연결 끊기';
      state.textContent = '센서 연결됨. 램프 손잡이를 돌려 보세요.';
      readLoop();
    } catch (err) {
      state.textContent = '연결하지 못했어요. 아두이노 IDE 시리얼 모니터가 열려 있으면 닫아 주세요.';
    }
  });
  async function readLoop() {
    const dec = new TextDecoderStream();
    port.readable.pipeTo(dec.writable).catch(() => {});
    reader = dec.readable.getReader();
    let buf = '';
    try {
      while (serialOn) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += value;
        const lines = buf.split('\n'); buf = lines.pop();
        for (const line of lines) {
          const m = line.match(/rotation_deg=(-?[\d.]+)/);
          if (line.includes('STATE=RUN') && m) setDeg(parseFloat(m[1]));
        }
      }
    } catch (_) { /* 케이블이 뽑힘 */ }
    await stop();
  }
  async function stop() {
    serialOn = false; btn.lastChild.textContent = '센서 연결';
    try { await reader?.cancel(); } catch (_) {}
    try { await port?.close(); } catch (_) {}
    reader = null; port = null;
    if (!btn.disabled) state.textContent = '센서 없이 화면에서만 돌리는 중';
  }

  // 소식 폼: 주소 형식만 확인하고, 실제로 보내지는 않는다(과제용 데모)
  const form = document.getElementById('news-form');
  const msg = document.getElementById('form-msg');
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const email = form.email; const field = email.closest('.field'); const help = field.querySelector('.field__help');
    if (!email.validity.valid || !email.value) {
      field.classList.add('is-error'); help.textContent = '이메일 형식이 아니에요.'; email.focus(); msg.textContent = '';
      return;
    }
    field.classList.remove('is-error'); help.textContent = '소식은 한 달에 한 번만 보내요.';
    msg.textContent = '고마워요! (데모라서 실제로 보내지는 않아요)';
    form.reset();
  });
})();
