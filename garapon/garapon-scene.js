/* 가라폰 램프 스크롤 장면 (maker-hardware-scroll-scene 스킬)
 * 단위 1 = 1 mm. THREE(r150 UMD)가 먼저 로드되어 있어야 한다.
 *
 *   const s = GaraponScene(hostElement, { background: 0x000000 });
 *   s.setProgress(0.4);   // 0 분리 → 0.35 프레임 조립 → 0.55 전자부품 → 0.68 배선 → 1 작동
 *
 * 카메라 키프레임: CAMERA_KEYS, 재질 값: MAT 에서 고친다.
 */
(function () {
  'use strict';

  // [진행도, 방위각(도), 고도각(도)]
  const CAMERA_KEYS = [
    [0.0, -38, 30],
    [0.35, -28, 20],
    [0.68, -18, 12],
    [1.0, -24, 10],
  ];

  const smooth = (t) => t * t * (3 - 2 * t);
  const seg = (p, a, b) => smooth(Math.min(1, Math.max(0, (p - a) / (b - a))));
  const lerp = (a, b, t) => a + (b - a) * t;

  function GaraponScene(host, opts) {
    opts = opts || {};
    const THREE = window.THREE;
    const bg = opts.background ?? 0x000000;

    // ── 렌더러 ──
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.outputEncoding = THREE.sRGBEncoding;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 0.9;
    renderer.setClearColor(bg, 1);
    host.appendChild(renderer.domElement);
    renderer.domElement.style.display = 'block';
    renderer.domElement.style.width = '100%';
    renderer.domElement.style.height = '100%';

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(bg);
    const camera = new THREE.PerspectiveCamera(35, 1, 1, 5000);

    // ── 환경맵: 검은 씬 + 소프트박스 평면 ──
    (function makeEnv() {
      const envScene = new THREE.Scene();
      envScene.background = new THREE.Color(0x000000);
      const box = (w, h, pos, rot, k) => {
        const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: new THREE.Color(1, 1, 1).multiplyScalar(k), side: THREE.DoubleSide }));
        m.position.set(...pos); m.rotation.set(...rot); envScene.add(m);
      };
      box(6, 3, [0, 4, 2], [Math.PI / 2, 0, 0], 3.2);
      box(4, 4, [-5, 1, 0], [0, Math.PI / 2, 0], 1.4);
      box(4, 4, [5, 1, 0], [0, -Math.PI / 2, 0], 0.8);
      box(10, 4, [0, 0, -6], [0, 0, 0], 0.35);
      const pm = new THREE.PMREMGenerator(renderer);
      scene.environment = pm.fromScene(envScene, 0.02).texture;
      pm.dispose();
    })();

    const key = new THREE.DirectionalLight(0xffffff, 1.3);
    key.position.set(-200, 300, 250);
    scene.add(key);
    scene.add(new THREE.AmbientLight(0xffffff, 0.15));

    // ── 재질 ──
    const MAT = {
      print: new THREE.MeshStandardMaterial({ color: 0xf1ead8, roughness: 0.6, metalness: 0 }),
      drum: new THREE.MeshStandardMaterial({ color: 0xd98a00, emissive: 0xff9a00, emissiveIntensity: 0.0, roughness: 0.35, metalness: 0, transparent: true, opacity: 0.72, side: THREE.DoubleSide, depthWrite: false }),
      gold: new THREE.MeshStandardMaterial({ color: 0xe0a21c, roughness: 0.3, metalness: 0.6 }),
      pcbBlue: new THREE.MeshStandardMaterial({ color: 0x1d5aa6, roughness: 0.5, metalness: 0 }),
      black: new THREE.MeshStandardMaterial({ color: 0x151515, roughness: 0.5 }),
      silver: new THREE.MeshStandardMaterial({ color: 0xcfcfcf, roughness: 0.3, metalness: 1 }),
      pin: new THREE.MeshStandardMaterial({ color: 0xd9b45a, roughness: 0.3, metalness: 1 }),
      strip: new THREE.MeshStandardMaterial({ color: 0xf5f5f0, roughness: 0.5, side: THREE.DoubleSide }),
      steel: new THREE.MeshStandardMaterial({ color: 0x9a9a9a, roughness: 0.4, metalness: 1 }),
    };

    const root = new THREE.Group();
    scene.add(root);
    const parts = []; // { obj, home, from, a, b }
    const add = (obj, home, from, a, b, parent) => {
      (parent || root).add(obj);
      obj.position.copy(home);
      parts.push({ obj, home: home.clone(), from: from.clone(), a, b });
      return obj;
    };
    const V = (x, y, z) => new THREE.Vector3(x, y, z);

    // 각재 하나 (단면 12.5)
    const beamBetween = (p1, p2, w) => {
      const dir = p2.clone().sub(p1); const L = dir.length();
      const m = new THREE.Mesh(new THREE.BoxGeometry(w || 12.5, L, w || 12.5), MAT.print);
      m.quaternion.setFromUnitVectors(V(0, 1, 0), dir.normalize());
      return { mesh: m, mid: p1.clone().add(p2).multiplyScalar(0.5) };
    };

    const AXIS_Y = 115, HALF = 78.75, LEG_X = 62;

    // ── 1) 바닥 프레임 ──
    [[V(0, 6, HALF), V(1, 0, 0), V(0, -20, 70)], [V(0, 6, -HALF), V(1, 0, 0), V(0, -20, -70)],
     [V(HALF, 6, 0), V(0, 0, 1), V(70, -20, 0)], [V(-HALF, 6, 0), V(0, 0, 1), V(-70, -20, 0)]].forEach(([c, axis, off], i) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(axis.x ? 170 : 12.5, 12.5, axis.z ? 170 : 12.5), MAT.print);
      add(m, c, off, 0.10 + i * 0.02, 0.22 + i * 0.02);
    });
    [[1, 1], [1, -1], [-1, 1], [-1, -1]].forEach(([sx, sz], i) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(20, 18, 20), MAT.print);
      add(m, V(sx * HALF, 9, sz * HALF), V(sx * 40, 40, sz * 40), 0.16 + i * 0.01, 0.26 + i * 0.01);
    });

    // ── 2) A자 다리 ──
    [-1, 1].forEach((sx, i) => {
      [-1, 1].forEach((sz, j) => {
        const b = beamBetween(V(sx * LEG_X, 6, sz * 70), V(sx * LEG_X, AXIS_Y, 0));
        add(b.mesh, b.mid, V(sx * 70, 60, sz * 30), 0.18 + i * 0.03 + j * 0.015, 0.32 + i * 0.03);
      });
      const cap = new THREE.Mesh(new THREE.BoxGeometry(18, 24, 26), MAT.print);
      add(cap, V(sx * LEG_X, AXIS_Y, 0), V(sx * 70, 90, 0), 0.22 + i * 0.03, 0.34);
    });

    // ── 3) 드럼 + 축 + 크랭크 (작동 때 함께 돈다) ──
    const rotor = new THREE.Group();
    add(rotor, V(0, AXIS_Y, 0), V(0, 160, 0), 0.24, 0.36);
    const drumGeo = new THREE.CylinderGeometry(85, 85, 100, 72, 1, true); drumGeo.rotateZ(Math.PI / 2);
    rotor.add(new THREE.Mesh(drumGeo, MAT.drum));
    [-50, 50].forEach((x) => {
      const ring = new THREE.Mesh(new THREE.RingGeometry(28, 85, 72), MAT.drum);
      ring.rotation.y = Math.PI / 2; ring.position.x = x; rotor.add(ring);
      const hub = new THREE.Mesh(new THREE.CylinderGeometry(28, 28, 14, 48), MAT.drum);
      hub.rotation.z = Math.PI / 2; hub.position.x = x + Math.sign(x) * 7; rotor.add(hub);
    });
    const axle = new THREE.Mesh(new THREE.CylinderGeometry(6, 6, 150, 24), MAT.steel);
    axle.rotation.z = Math.PI / 2; axle.position.x = -4; rotor.add(axle);

    const crank = new THREE.Group();
    crank.position.x = -82;
    const arm = new THREE.Mesh(new THREE.BoxGeometry(10, 66, 20), MAT.print); arm.position.y = 26; crank.add(arm);
    const boss = new THREE.Mesh(new THREE.CylinderGeometry(13, 13, 14, 32), MAT.print); boss.rotation.z = Math.PI / 2; crank.add(boss);
    const stub = new THREE.Mesh(new THREE.CylinderGeometry(6, 6, 22, 20), MAT.print); stub.rotation.z = Math.PI / 2; stub.position.set(-14, 56, 0); crank.add(stub);
    const knob = new THREE.Mesh(new THREE.SphereGeometry(18, 40, 24), MAT.gold); knob.position.set(-32, 56, 0); crank.add(knob);
    rotor.add(crank);
    // 크랭크는 드럼보다 늦게 끼운다
    parts.push({ obj: crank, home: crank.position.clone(), from: V(-80, 0, 0), a: 0.30, b: 0.38 });

    // ── 4) LED 스트립 2줄 (드럼 안쪽 둘레, 60개/m) ──
    const LED_R = 79, LED_PITCH = 16.7;
    const ledPerRing = Math.round((2 * Math.PI * LED_R) / LED_PITCH);
    const ledPos = [], ledCol = [];
    const ledGroup = new THREE.Group(); rotor.add(ledGroup);
    [-25, 25].forEach((x) => {
      const band = new THREE.Mesh(new THREE.CylinderGeometry(LED_R + 1, LED_R + 1, 10, 72, 1, true, 0, Math.PI * 2), MAT.strip);
      band.rotation.z = Math.PI / 2; band.position.x = x; ledGroup.add(band);
      for (let k = 0; k < ledPerRing; k++) {
        const a = (k / ledPerRing) * Math.PI * 2;
        ledPos.push(x, Math.cos(a) * (LED_R - 1.5), Math.sin(a) * (LED_R - 1.5));
        ledCol.push(1, 0.72, 0.3);
      }
    });
    const ledGeo = new THREE.BufferGeometry();
    ledGeo.setAttribute('position', new THREE.Float32BufferAttribute(ledPos, 3));
    ledGeo.setAttribute('color', new THREE.Float32BufferAttribute(ledCol, 3));
    const glowTex = (() => {
      const c = document.createElement('canvas'); c.width = c.height = 64;
      const g = c.getContext('2d'); const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
      gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.25, 'rgba(255,255,255,0.55)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
      return new THREE.CanvasTexture(c);
    })();
    const ledMat = new THREE.PointsMaterial({ size: 14, map: glowTex, vertexColors: true, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });
    const leds = new THREE.Points(ledGeo, ledMat); ledGroup.add(leds);
    const totalLeds = ledPos.length / 3;

    // ── 5) 아두이노 우노 (바닥 가운데, 스탠드오프 위) ──
    const uno = new THREE.Group();
    const pcb = new THREE.Mesh(new THREE.BoxGeometry(68.6, 1.6, 53.4), MAT.pcbBlue); uno.add(pcb);
    const usb = new THREE.Mesh(new THREE.BoxGeometry(16, 11, 12), MAT.silver); usb.position.set(-34.3 + 2, 6.3, -53.4 / 2 + 12); uno.add(usb);
    const dc = new THREE.Mesh(new THREE.BoxGeometry(13.5, 11, 9), MAT.black); dc.position.set(-34.3 + 2, 6.3, 53.4 / 2 - 10); uno.add(dc);
    const chip = new THREE.Mesh(new THREE.BoxGeometry(35, 3.5, 7.5), MAT.black); chip.position.set(8, 2.6, 10); uno.add(chip);
    [[-2, 24.5, 46], [12, -24.5, 40]].forEach(([x, z, w]) => {
      const h = new THREE.Mesh(new THREE.BoxGeometry(w, 8.5, 2.5), MAT.black); h.position.set(x, 5, z); uno.add(h);
    });
    const pwrLed = new THREE.Mesh(new THREE.BoxGeometry(2, 1, 1.2), new THREE.MeshBasicMaterial({ color: 0x113311 })); pwrLed.position.set(20, 1.3, -10); uno.add(pwrLed);
    const txLed = new THREE.Mesh(new THREE.BoxGeometry(2, 1, 1.2), new THREE.MeshBasicMaterial({ color: 0x332a08 })); txLed.position.set(24, 1.3, -6); uno.add(txLed);
    [[13.97, 2.54], [15.24, 50.8], [66.04, 7.62], [66.04, 35.56]].forEach(([mx, mz]) => {
      const so = new THREE.Mesh(new THREE.CylinderGeometry(2.5, 2.5, 10, 12), MAT.pin); so.position.set(mx - 34.3, -5.8, mz - 26.7); uno.add(so);
    });
    add(uno, V(0, 22.5, 0), V(0, 0, 170), 0.36, 0.48);

    // ── 6) MPU6050 (왼쪽 다리 꼭짓점 옆) ──
    const mpu = new THREE.Group();
    const mb = new THREE.Mesh(new THREE.BoxGeometry(1.6, 21, 16), MAT.pcbBlue); mpu.add(mb);
    const mc = new THREE.Mesh(new THREE.BoxGeometry(1.2, 4, 4), MAT.black); mc.position.x = 1.4; mpu.add(mc);
    add(mpu, V(-LED_X(), AXIS_Y - 30, 0), V(-60, 30, 0), 0.44, 0.55);
    function LED_X() { return LEG_X + 10.5; }

    // ── 7) 배선 (핀에서 핀으로 자라남) ──
    const wires = [];
    const wire = (pts, color, a, b) => {
      const curve = new THREE.CatmullRomCurve3(pts.map((p) => V(...p)));
      const geo = new THREE.TubeGeometry(curve, 80, 0.9, 6, false);
      const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color, roughness: 0.6 }));
      root.add(m); wires.push({ geo, total: geo.index.count, a, b });
    };
    const mx = -LEG_X - 9.7;
    wire([[-14, 27, 24.5], [-30, 50, 20], [-70, 60, 10], [mx, AXIS_Y - 38, 3]], 0xd33b2c, 0.55, 0.62);
    wire([[-10, 27, 24.5], [-32, 46, 16], [-72, 56, 6], [mx, AXIS_Y - 38, -1]], 0x222222, 0.56, 0.63);
    wire([[-6, 27, 24.5], [-34, 42, 12], [-74, 52, 2], [mx, AXIS_Y - 36, -4]], 0xe8c33a, 0.57, 0.64);
    wire([[-2, 27, 24.5], [-36, 38, 8], [-76, 48, -2], [mx, AXIS_Y - 34, -6]], 0x2f8f4a, 0.58, 0.65);
    wire([[22, 27, -24.5], [40, 40, -30], [60, 70, -20], [72, AXIS_Y - 10, -4], [70, AXIS_Y, 0]], 0xff7a1a, 0.59, 0.67);
    wire([[26, 27, -24.5], [44, 38, -26], [64, 66, -16], [75, AXIS_Y - 12, -2], [70, AXIS_Y, 2]], 0x222222, 0.60, 0.68);

    // ── 진행도 ──
    let target = 0, cur = 0;
    const s = { setProgress(p) { target = Math.min(1, Math.max(0, p)); }, get progress() { return cur; } };

    function camDir(p) {
      let i = 0; while (i < CAMERA_KEYS.length - 2 && p > CAMERA_KEYS[i + 1][0]) i++;
      const [p0, az0, el0] = CAMERA_KEYS[i], [p1, az1, el1] = CAMERA_KEYS[i + 1];
      const t = smooth(Math.min(1, Math.max(0, (p - p0) / (p1 - p0))));
      return [lerp(az0, az1, t) * Math.PI / 180, lerp(el0, el1, t) * Math.PI / 180];
    }

    function apply(p, time) {
      for (const pt of parts) {
        const k = 1 - seg(p, pt.a, pt.b);
        pt.obj.position.copy(pt.home).addScaledVector(pt.from, k);
      }
      // LED 스트립 깔기 (0.42~0.55)
      const lay = seg(p, 0.42, 0.55);
      ledGroup.scale.set(1, Math.max(0.001, lay), Math.max(0.001, lay));
      ledGeo.setDrawRange(0, Math.floor(totalLeds * lay));
      // 배선 자라기
      for (const w of wires) w.geo.setDrawRange(0, Math.floor(w.total * seg(p, w.a, w.b) / 3) * 3);
      // 작동
      const run = seg(p, 0.68, 1);
      rotor.rotation.x = -run * Math.PI * 2.5 - (run > 0 && !reduced ? Math.sin(time * 0.6) * 0.02 * run : 0);
      ledMat.opacity = 0.15 + run * 0.85;
      ledMat.size = 10 + run * 10;
      if (lay <= 0) ledMat.opacity = 0;
      MAT.drum.emissiveIntensity = run * 0.55;
      pwrLed.material.color.setHex(p > 0.66 ? 0x39ff6a : 0x113311);
      txLed.material.color.setHex(run > 0 && Math.sin(time * 18) > 0.2 ? 0xffd23a : 0x332a08);
      // 체이스: 회전 방향으로 밝기 물결
      const cols = ledGeo.attributes.color;
      for (let i = 0; i < totalLeds; i++) {
        const w = 0.55 + 0.45 * Math.sin((i % ledPerRing) / ledPerRing * Math.PI * 6 - time * 3);
        const k = lerp(0.6, w, run);
        cols.setXYZ(i, 1 * k, 0.72 * k, 0.3 * k);
      }
      cols.needsUpdate = true;
      // 카메라: 분리 상태 반경에 맞춰 거리 자동
      const R = lerp(225, 150, seg(p, 0.3, 0.5));
      const [az, el] = camDir(p);
      const vHalf = THREE.MathUtils.degToRad(camera.fov / 2);
      const hHalf = Math.atan(Math.tan(vHalf) * camera.aspect);
      const dist = R / Math.sin(Math.min(vHalf, hHalf)) * 1.03;
      const tgt = V(-15, lerp(150, 92, seg(p, 0.3, 0.5)), 0);
      camera.position.set(tgt.x + dist * Math.cos(el) * Math.sin(az), tgt.y + dist * Math.sin(el), tgt.z + dist * Math.cos(el) * Math.cos(az));
      camera.lookAt(tgt);
    }

    function resize() {
      const w = host.clientWidth || 1, h = host.clientHeight || 1;
      renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix();
    }
    new ResizeObserver(resize).observe(host); resize();

    const reduced = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
    let visible = true, last = performance.now(), raf = 0;
    new IntersectionObserver((es) => { visible = es[0].isIntersecting; if (visible && !raf) loop(); }).observe(host);
    function loop() {
      raf = 0;
      if (!visible) return;
      const now = performance.now(); const dt = Math.min(0.1, (now - last) / 1000); last = now;
      cur += (target - cur) * Math.min(1, dt * 7);
      if (Math.abs(target - cur) < 1e-4) cur = target;
      apply(cur, reduced ? 0 : now / 1000);
      renderer.render(scene, camera);
      raf = requestAnimationFrame(loop);
    }
    loop();
    s.renderOnce = (p) => { cur = target = p; apply(p, 1.2); renderer.render(scene, camera); };
    return s;
  }

  window.GaraponScene = GaraponScene;
})();
