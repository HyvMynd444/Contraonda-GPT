document.addEventListener("DOMContentLoaded", () => {
  const root = document.documentElement;
  const container = document.querySelector("#canvas-container");
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const compact = window.matchMedia("(max-width: 800px)").matches;

  const updatePointer = (event) => {
    const x = event.clientX / window.innerWidth;
    const y = event.clientY / window.innerHeight;

    root.style.setProperty("--laser-x", `${(x * 100).toFixed(2)}%`);
    root.style.setProperty("--laser-y", `${(y * 100).toFixed(2)}%`);
  };

  window.addEventListener("pointermove", updatePointer, { passive: true });

  const reveals = document.querySelectorAll(".reveal");
  if ("IntersectionObserver" in window && !reduceMotion) {
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("is-visible");
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0.18 });

    reveals.forEach((element) => observer.observe(element));
  } else {
    reveals.forEach((element) => element.classList.add("is-visible"));
  }

  const form = document.querySelector(".signup-form");
  const formStatus = document.querySelector(".form-status");

  form?.addEventListener("submit", (event) => {
    event.preventDefault();
    const email = form.elements.email;

    if (!email.validity.valid) {
      formStatus.textContent = "Escribe un correo válido para entrar a la lista.";
      email.focus();
      return;
    }

    formStatus.textContent = "Señal recibida. Te avisaremos cuando abra la siguiente noche.";
    form.reset();
  });

  const soundbar = document.querySelector(".soundbar");
  const audio = document.querySelector("#audio-player");
  const audioFile = document.querySelector("#audio-file");
  const playTrack = document.querySelector(".play-track");
  const trackTitle = document.querySelector(".track-info strong");
  const trackMeta = document.querySelector(".track-info span");
  const progress = document.querySelector("#audio-progress");
  const trackTime = document.querySelector(".track-time");
  const volume = document.querySelector("#audio-volume");
  const visualizer = document.querySelector("#audio-visualizer");
  const visualContext = visualizer?.getContext("2d");
  let audioUrl = "";
  let audioContext;
  let analyser;
  let audioSource;
  let audioData;

  const formatTime = (seconds) => {
    if (!Number.isFinite(seconds)) return "00:00";
    const minutes = Math.floor(seconds / 60);
    const remainder = Math.floor(seconds % 60);
    return `${String(minutes).padStart(2, "0")}:${String(remainder).padStart(2, "0")}`;
  };

  const setTrack = (file) => {
    if (!file?.type.startsWith("audio/")) return;
    if (audioUrl) URL.revokeObjectURL(audioUrl);

    audioUrl = URL.createObjectURL(file);
    audio.src = audioUrl;
    audio.load();
    trackTitle.textContent = file.name.replace(/\.[^/.]+$/, "");
    trackMeta.textContent = `${(file.size / 1048576).toFixed(1)} MB · Audio local`;
    playTrack.disabled = false;
    progress.disabled = false;
    progress.value = 0;
    playTrack.querySelector("span").textContent = "▶";
    playTrack.setAttribute("aria-label", "Reproducir");
  };

  const prepareAudioGraph = () => {
    if (audioContext) return;
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return;

    audioContext = new AudioContext();
    analyser = audioContext.createAnalyser();
    analyser.fftSize = 256;
    analyser.smoothingTimeConstant = 0.82;
    audioData = new Uint8Array(analyser.frequencyBinCount);
    audioSource = audioContext.createMediaElementSource(audio);
    audioSource.connect(analyser);
    analyser.connect(audioContext.destination);
  };

  audioFile?.addEventListener("change", () => setTrack(audioFile.files[0]));

  playTrack?.addEventListener("click", async () => {
    prepareAudioGraph();
    if (audioContext?.state === "suspended") await audioContext.resume();

    if (audio.paused) {
      try {
        await audio.play();
      } catch {
        trackMeta.textContent = "No se pudo reproducir este archivo";
      }
    } else {
      audio.pause();
    }
  });

  audio?.addEventListener("play", () => {
    playTrack.querySelector("span").textContent = "Ⅱ";
    playTrack.setAttribute("aria-label", "Pausar");
    soundbar.classList.add("is-playing");
  });

  audio?.addEventListener("pause", () => {
    playTrack.querySelector("span").textContent = "▶";
    playTrack.setAttribute("aria-label", "Reproducir");
    soundbar.classList.remove("is-playing");
  });

  audio?.addEventListener("loadedmetadata", () => {
    trackTime.textContent = `00:00 / ${formatTime(audio.duration)}`;
  });

  audio?.addEventListener("timeupdate", () => {
    const ratio = audio.duration ? audio.currentTime / audio.duration : 0;
    progress.value = ratio * 100;
    trackTime.textContent = `${formatTime(audio.currentTime)} / ${formatTime(audio.duration)}`;
  });

  audio?.addEventListener("ended", () => {
    progress.value = 0;
    audio.currentTime = 0;
  });

  progress?.addEventListener("input", () => {
    if (audio.duration) audio.currentTime = (progress.value / 100) * audio.duration;
  });

  volume?.addEventListener("input", () => {
    audio.volume = volume.value;
  });

  if (audio) audio.volume = volume?.value || 0.82;

  ["dragenter", "dragover"].forEach((eventName) => {
    soundbar?.addEventListener(eventName, (event) => {
      event.preventDefault();
      soundbar.classList.add("is-dragging");
    });
  });

  ["dragleave", "drop"].forEach((eventName) => {
    soundbar?.addEventListener(eventName, (event) => {
      event.preventDefault();
      soundbar.classList.remove("is-dragging");
    });
  });

  soundbar?.addEventListener("drop", (event) => setTrack(event.dataTransfer.files[0]));

  const sizeVisualizer = () => {
    if (!visualizer || !visualContext) return;
    const rect = visualizer.getBoundingClientRect();
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    visualizer.width = Math.max(1, Math.floor(rect.width * ratio));
    visualizer.height = Math.max(1, Math.floor(rect.height * ratio));
    visualContext.setTransform(ratio, 0, 0, ratio, 0, 0);
  };

  const drawMeshAnaconda = (now) => {
    if (!visualizer || !visualContext) return;
    const width = visualizer.clientWidth;
    const height = visualizer.clientHeight;
    const centerY = height / 2;
    const layers = 5;
    const points = 42;
    const pointSets = [];

    visualContext.clearRect(0, 0, width, height);
    if (analyser && !audio.paused) analyser.getByteTimeDomainData(audioData);

    for (let layer = 0; layer < layers; layer += 1) {
      const layerPoints = [];
      const depth = layer / (layers - 1);

      for (let index = 0; index < points; index += 1) {
        const t = index / (points - 1);
        const sampleIndex = audioData ? Math.floor(t * (audioData.length - 1)) : 0;
        const signal = analyser && !audio.paused
          ? (audioData[sampleIndex] - 128) / 128
          : Math.sin(t * 13 + now * 0.0012) * 0.16;
        const envelope = Math.sin(Math.PI * t);
        const idleCoil = Math.sin(t * 7 - now * 0.00055 + layer * 0.35) * 1.7;
        const x = t * width;
        const y = centerY
          + signal * envelope * (height * 0.42)
          + idleCoil
          + (depth - 0.5) * 12;
        layerPoints.push({ x, y });
      }

      pointSets.push(layerPoints);
      visualContext.beginPath();
      layerPoints.forEach((point, index) => {
        if (index === 0) visualContext.moveTo(point.x, point.y);
        else visualContext.lineTo(point.x, point.y);
      });
      visualContext.strokeStyle = layer === 2
        ? "rgba(216, 255, 0, 0.88)"
        : `rgba(216, 255, 0, ${0.15 + (1 - Math.abs(depth - 0.5) * 2) * 0.25})`;
      visualContext.lineWidth = layer === 2 ? 1.2 : 0.65;
      visualContext.stroke();
    }

    for (let index = 2; index < points - 1; index += 3) {
      visualContext.beginPath();
      pointSets.forEach((layerPoints, layer) => {
        const point = layerPoints[index];
        if (layer === 0) visualContext.moveTo(point.x, point.y);
        else visualContext.lineTo(point.x, point.y);
      });
      visualContext.strokeStyle = "rgba(244, 245, 239, 0.14)";
      visualContext.lineWidth = 0.55;
      visualContext.stroke();
    }

    requestAnimationFrame(drawMeshAnaconda);
  };

  if (visualizer && visualContext) {
    sizeVisualizer();
    window.addEventListener("resize", sizeVisualizer, { passive: true });
    requestAnimationFrame(drawMeshAnaconda);
  }

  if (!container || !window.THREE) return;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(47, 1, 0.1, 100);
  const renderer = new THREE.WebGLRenderer({
    alpha: true,
    antialias: true,
    powerPreference: "high-performance"
  });

  renderer.setClearColor(0x070807, 0);
  renderer.outputEncoding = THREE.sRGBEncoding;
  container.appendChild(renderer.domElement);

  const ribbonGeometry = new THREE.PlaneGeometry(
    compact ? 30 : 42,
    compact ? 6.2 : 7.4,
    compact ? 76 : 136,
    compact ? 30 : 38
  );

  const netGeometry = new THREE.PlaneGeometry(
    compact ? 34 : 48,
    compact ? 22 : 28,
    compact ? 64 : 92,
    compact ? 42 : 58
  );

  const makeUniforms = (opacity = 1) => ({
    uTime: { value: 0 },
    uScroll: { value: 0 },
    uOpacity: { value: opacity }
  });

  const vertexShader = `
    uniform float uTime;
    uniform float uScroll;

    varying float vHeight;
    varying float vEdge;
    varying vec3 vLocalPosition;
    varying vec3 vViewPosition;

    vec3 permute(vec3 x) {
      return mod(((x * 34.0) + 1.0) * x, 289.0);
    }

    float organicNoise(vec2 value) {
      const vec4 C = vec4(
        0.211324865405187,
        0.366025403784439,
       -0.577350269189626,
        0.024390243902439
      );
      vec2 i = floor(value + dot(value, C.yy));
      vec2 x0 = value - i + dot(i, C.xx);
      vec2 i1 = x0.x > x0.y ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
      vec4 x12 = x0.xyxy + C.xxzz;
      x12.xy -= i1;
      i = mod(i, 289.0);
      vec3 p = permute(permute(i.y + vec3(0.0, i1.y, 1.0))
        + i.x + vec3(0.0, i1.x, 1.0));
      vec3 m = max(0.5 - vec3(
        dot(x0, x0),
        dot(x12.xy, x12.xy),
        dot(x12.zw, x12.zw)
      ), 0.0);
      m = m * m;
      m = m * m;
      vec3 x = 2.0 * fract(p * C.www) - 1.0;
      vec3 h = abs(x) - 0.5;
      vec3 ox = floor(x + 0.5);
      vec3 a0 = x - ox;
      m *= 1.79284291400159 - 0.85373472095314 * (a0 * a0 + h * h);
      vec3 gradient;
      gradient.x = a0.x * x0.x + h.x * x0.y;
      gradient.yz = a0.yz * x12.xz + h.yz * x12.yw;
      return 130.0 * dot(m, gradient);
    }

    void main() {
      vec3 p = position;
      float center = exp(-0.008 * dot(p.xy, p.xy));
      float distanceFromCenter = length(p.xy);
      float edge = 1.0 - smoothstep(10.0, 22.0, distanceFromCenter);

      float primary = sin(p.x * 0.53 + uTime * 0.58)
        * cos(p.y * 0.30 - uTime * 0.24);
      float secondary = sin((p.x - p.y * 0.7) * 0.19 - uTime * 0.34);
      float cymatic = cos(distanceFromCenter * 0.42 - uTime * 0.30);
      float organic = organicNoise(p.xy * 0.16 + vec2(uTime * 0.055, -uTime * 0.036));

      p.z = primary * 1.34
        + secondary * 0.46
        + cymatic * center * 0.2
        + organic * (0.46 + center * 0.2);
      p.y += sin(p.x * 0.24 - uTime * 0.18) * 0.2;
      p.y += organic * 0.08;
      p.y += sin(uScroll * 6.2831) * 0.16;

      vHeight = smoothstep(-1.35, 1.85, p.z);
      vEdge = edge;
      vLocalPosition = p;
      vec4 viewPosition = modelViewMatrix * vec4(p, 1.0);
      vViewPosition = viewPosition.xyz;
      gl_Position = projectionMatrix * viewPosition;
    }
  `;

  const surfaceMaterial = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    extensions: { derivatives: true },
    uniforms: makeUniforms(0.74),
    vertexShader,
    fragmentShader: `
      uniform float uTime;
      uniform float uOpacity;

      varying float vHeight;
      varying float vEdge;
      varying vec3 vLocalPosition;
      varying vec3 vViewPosition;

      float detailNoise(vec2 p) {
        vec2 cell = floor(p);
        vec2 fraction = fract(p);
        fraction = fraction * fraction * (3.0 - 2.0 * fraction);
        float a = fract(sin(dot(cell, vec2(127.1, 311.7))) * 43758.5453);
        float b = fract(sin(dot(cell + vec2(1.0, 0.0), vec2(127.1, 311.7))) * 43758.5453);
        float c = fract(sin(dot(cell + vec2(0.0, 1.0), vec2(127.1, 311.7))) * 43758.5453);
        float d = fract(sin(dot(cell + vec2(1.0), vec2(127.1, 311.7))) * 43758.5453);
        return mix(mix(a, b, fraction.x), mix(c, d, fraction.x), fraction.y);
      }

      void main() {
        vec3 normal = normalize(cross(dFdx(vViewPosition), dFdy(vViewPosition)));
        if (!gl_FrontFacing) normal *= -1.0;

        float micro = detailNoise(vLocalPosition.xy * 2.8 + uTime * 0.018)
          + detailNoise(vLocalPosition.xy * 6.4 - uTime * 0.012) * 0.38;
        vec2 microGradient = vec2(dFdx(micro), dFdy(micro));
        normal = normalize(normal + vec3(microGradient * 3.2, 0.0));

        vec3 viewDirection = normalize(-vViewPosition);
        vec3 blueLight = normalize(vec3(-5.5, 4.5, 7.0) - vViewPosition);
        vec3 acidLight = normalize(vec3(5.8, -2.0, 5.5) - vViewPosition);

        float blueDiffuse = max(dot(normal, blueLight), 0.0);
        float acidDiffuse = max(dot(normal, acidLight), 0.0);
        float blueSpecular = pow(max(dot(reflect(-blueLight, normal), viewDirection), 0.0), 34.0);
        float acidSpecular = pow(max(dot(reflect(-acidLight, normal), viewDirection), 0.0), 46.0);
        float fresnel = pow(1.0 - abs(dot(normal, viewDirection)), 2.4);

        vec3 base = vec3(0.012, 0.014, 0.017);
        vec3 electricBlue = vec3(0.08, 0.25, 0.72);
        vec3 ultraviolet = vec3(0.42, 0.08, 0.58);
        vec3 acid = vec3(0.85, 1.0, 0.0);
        vec3 color = base;
        color += electricBlue * blueDiffuse * 0.22;
        color += ultraviolet * blueSpecular * 0.42;
        color += acid * acidDiffuse * 0.12;
        color += acid * acidSpecular * 0.62;
        color += mix(electricBlue, acid, vHeight) * fresnel * 0.15;

        float alpha = (0.18 + fresnel * 0.24 + blueSpecular * 0.16 + acidSpecular * 0.2)
          * vEdge * uOpacity;
        gl_FragColor = vec4(color, alpha);
      }
    `
  });

  const wireMaterial = new THREE.ShaderMaterial({
    transparent: true,
    wireframe: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: makeUniforms(0.54),
    vertexShader,
    fragmentShader: `
      uniform float uTime;
      uniform float uOpacity;
      varying float vHeight;
      varying float vEdge;
      varying vec3 vLocalPosition;

      void main() {
        vec3 graphite = vec3(0.2, 0.22, 0.24);
        vec3 white = vec3(0.94, 0.95, 0.9);
        vec3 acid = vec3(0.85, 1.0, 0.0);
        float peak = smoothstep(0.58, 0.96, vHeight);
        float colorFlow = 0.5 + 0.5 * sin(vLocalPosition.x * 0.28 - uTime * 0.24);
        vec3 signalColor = mix(acid, white, smoothstep(0.28, 0.82, colorFlow));
        vec3 color = mix(graphite, signalColor, 0.34 + peak * 0.56);
        float alpha = (0.08 + peak * 0.38) * vEdge * uOpacity;
        gl_FragColor = vec4(color, alpha);
      }
    `
  });

  const wave = new THREE.Group();
  const surfaceWave = new THREE.Mesh(ribbonGeometry, surfaceMaterial);
  const wireWave = new THREE.Mesh(ribbonGeometry, wireMaterial);
  wireWave.scale.setScalar(1.002);
  wave.add(surfaceWave, wireWave);
  wave.position.y = 0.2;
  wave.rotation.x = -0.22;
  wave.rotation.z = -0.018;
  scene.add(wave);

  const netMaterial = wireMaterial.clone();
  netMaterial.uniforms.uOpacity.value = 0.22;
  const backgroundNet = new THREE.Mesh(netGeometry, netMaterial);
  backgroundNet.position.set(0, -1.8, -5.2);
  backgroundNet.rotation.x = -0.78;
  backgroundNet.rotation.z = 0.055;
  scene.add(backgroundNet);

  const particleCount = compact ? 240 : 520;
  const particlePositions = new Float32Array(particleCount * 3);
  for (let index = 0; index < particleCount; index += 1) {
    const offset = index * 3;
    particlePositions[offset] = (Math.random() - 0.5) * 38;
    particlePositions[offset + 1] = (Math.random() - 0.5) * 19;
    particlePositions[offset + 2] = -1.5 - Math.random() * 11;
  }

  const particleGeometry = new THREE.BufferGeometry();
  particleGeometry.setAttribute("position", new THREE.BufferAttribute(particlePositions, 3));
  const particleMaterial = new THREE.PointsMaterial({
    color: 0xd8ff00,
    size: compact ? 0.035 : 0.026,
    transparent: true,
    opacity: 0.3,
    depthWrite: false,
    blending: THREE.AdditiveBlending
  });
  const particleField = new THREE.Points(particleGeometry, particleMaterial);
  scene.add(particleField);

  camera.position.set(0, compact ? -0.9 : -1.25, compact ? 13.8 : 12.6);
  camera.lookAt(0, 0, 0);

  const clock = new THREE.Clock();
  let elapsed = 0;
  let smoothScroll = 0;
  let frameId = 0;

  const resize = () => {
    const width = container.clientWidth;
    const height = container.clientHeight;

    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, compact ? 1.25 : 1.5));
    renderer.setSize(width, height, false);
  };

  const render = () => {
    const delta = Math.min(clock.getDelta(), 0.05);
    elapsed += delta * 0.43;
    const scrollDamping = 1 - Math.exp(-delta * 3.2);

    const rawScroll = window.scrollY / Math.max(document.body.scrollHeight - window.innerHeight, 1);
    smoothScroll += (rawScroll - smoothScroll) * scrollDamping;
    surfaceMaterial.uniforms.uTime.value = elapsed;
    surfaceMaterial.uniforms.uScroll.value = smoothScroll;
    wireMaterial.uniforms.uTime.value = elapsed;
    wireMaterial.uniforms.uScroll.value = smoothScroll;
    netMaterial.uniforms.uTime.value = elapsed * 0.62 + 2.1;
    netMaterial.uniforms.uScroll.value = smoothScroll;

    wave.rotation.z = -0.018 + Math.sin(elapsed * 0.11) * 0.006;
    backgroundNet.rotation.z = 0.055 + Math.sin(elapsed * 0.075) * 0.008;
    particleField.rotation.z = elapsed * 0.012;
    particleField.position.y = -smoothScroll * 0.65;

    renderer.render(scene, camera);
    frameId = requestAnimationFrame(render);
  };

  const onVisibilityChange = () => {
    if (document.hidden) {
      cancelAnimationFrame(frameId);
      frameId = 0;
    } else if (!reduceMotion && !frameId) {
      clock.getDelta();
      render();
    }
  };

  resize();
  window.addEventListener("resize", resize, { passive: true });
  document.addEventListener("visibilitychange", onVisibilityChange);

  if (reduceMotion) {
    surfaceMaterial.uniforms.uTime.value = 2.4;
    wireMaterial.uniforms.uTime.value = 2.4;
    netMaterial.uniforms.uTime.value = 4.1;
    renderer.render(scene, camera);
  } else {
    render();
  }
});
