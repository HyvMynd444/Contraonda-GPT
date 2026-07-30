document.addEventListener("DOMContentLoaded", () => {
  const root = document.documentElement;
  const container = document.querySelector("#canvas-container");
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const compact = window.matchMedia("(max-width: 800px)").matches;
  const pointerGlow = { x: -2, y: -2, age: 99 };

  const updatePointer = (event) => {
    const x = event.clientX / window.innerWidth;
    const y = event.clientY / window.innerHeight;
    const shaderY = 1 - y;

    root.style.setProperty("--laser-x", `${(x * 100).toFixed(2)}%`);
    root.style.setProperty("--laser-y", `${(y * 100).toFixed(2)}%`);
    pointerGlow.x = x;
    pointerGlow.y = shaderY;
    pointerGlow.age = 0;
  };

  window.addEventListener("pointermove", updatePointer, { passive: true });

  document.querySelectorAll(".alien-module").forEach((module) => {
    const resetModule = () => {
      module.classList.remove("is-absorbing");
      module.style.setProperty("--module-x", "50%");
      module.style.setProperty("--module-y", "50%");
      module.style.setProperty("--module-shift-x", "0px");
      module.style.setProperty("--module-shift-y", "0px");
    };

    module.addEventListener("pointerenter", () => {
      module.classList.add("is-absorbing");
    });

    module.addEventListener("pointermove", (event) => {
      module.classList.add("is-absorbing");
      const bounds = module.getBoundingClientRect();
      if (!bounds.width || !bounds.height) return;
      const localX = (event.clientX - bounds.left) / bounds.width;
      const localY = (event.clientY - bounds.top) / bounds.height;
      const pullX = (localX - 0.5) * (reduceMotion ? 0 : 7);
      const pullY = (localY - 0.5) * (reduceMotion ? 0 : 5);

      module.style.setProperty("--module-x", `${(localX * 100).toFixed(1)}%`);
      module.style.setProperty("--module-y", `${(localY * 100).toFixed(1)}%`);
      module.style.setProperty("--module-shift-x", `${pullX.toFixed(2)}px`);
      module.style.setProperty("--module-shift-y", `${pullY.toFixed(2)}px`);
    }, { passive: true });

    module.addEventListener("pointerleave", resetModule);
    module.addEventListener("blur", resetModule);
  });

  const cymaticPortal = document.querySelector(".ticket-portal");
  if (cymaticPortal instanceof HTMLCanvasElement) {
    const gl = cymaticPortal.getContext("webgl", {
      alpha: true,
      antialias: false,
      powerPreference: "low-power",
      premultipliedAlpha: false,
    });

    if (gl) {
      const vertexSource = `
        attribute vec2 aPosition;
        varying vec2 vUv;
        void main() {
          vUv = aPosition * 0.5 + 0.5;
          gl_Position = vec4(aPosition, 0.0, 1.0);
        }
      `;
      const fragmentSource = `
        precision highp float;
        uniform float uTime;
        uniform vec2 uResolution;
        uniform vec2 uMouse;
        varying vec2 vUv;

        vec3 permute(vec3 x) { return mod(((x * 34.0) + 1.0) * x, 289.0); }
        float snoise(vec2 v) {
          const vec4 C = vec4(0.211324865405187, 0.366025403784439, -0.577350269189626, 0.024390243902439);
          vec2 i = floor(v + dot(v, C.yy));
          vec2 x0 = v - i + dot(i, C.xx);
          vec2 i1 = x0.x > x0.y ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
          vec4 x12 = x0.xyxy + C.xxzz;
          x12.xy -= i1;
          i = mod(i, 289.0);
          vec3 p = permute(permute(i.y + vec3(0.0, i1.y, 1.0)) + i.x + vec3(0.0, i1.x, 1.0));
          vec3 m = max(0.5 - vec3(dot(x0, x0), dot(x12.xy, x12.xy), dot(x12.zw, x12.zw)), 0.0);
          m = m * m;
          m = m * m;
          vec3 x = 2.0 * fract(p * C.www) - 1.0;
          vec3 h = abs(x) - 0.5;
          vec3 ox = floor(x + 0.5);
          vec3 a0 = x - ox;
          m *= 1.79284291400159 - 0.85373472095314 * (a0 * a0 + h * h);
          vec3 g;
          g.x = a0.x * x0.x + h.x * x0.y;
          g.yz = a0.yz * x12.xz + h.yz * x12.yw;
          return 130.0 * dot(m, g);
        }

        void main() {
          vec2 p = vUv * 2.0 - 1.0;
          p.x *= uResolution.x / max(uResolution.y, 1.0);
          vec2 mouse = uMouse * 2.0 - 1.0;
          mouse.x *= uResolution.x / max(uResolution.y, 1.0);

          float time = uTime * 0.24;
          float coarse = snoise(p * 2.15 + vec2(time * 0.34, -time * 0.21));
          float medium = snoise(p * 4.7 + vec2(-time * 0.19, time * 0.27));
          float fine = snoise(p * 10.0 - time * 0.11);
          float cursor = 1.0 - smoothstep(0.0, 0.48, length(p - mouse));
          float radius = length(p) + coarse * 0.085 + medium * 0.025 + cursor * fine * 0.035;

          float contourA = abs(sin(radius * 27.0 - time * 2.0 + coarse * 1.7));
          float contourB = abs(sin(radius * 42.0 + time * 1.15 + medium * 1.25));
          float filament = 1.0 - smoothstep(0.0, 0.105, min(contourA, contourB * 1.18));
          float broken = smoothstep(-0.52, 0.18, fine + coarse * 0.58);
          float iris = smoothstep(0.10, 0.28, radius) * (1.0 - smoothstep(0.82, 1.18, radius));
          float glow = filament * mix(0.34, 1.0, broken) * iris;
          glow += cursor * (1.0 - smoothstep(0.0, 0.09, abs(contourA - 0.08))) * iris * 0.42;

          vec3 spectralBlue = vec3(0.08, 0.47, 1.0);
          vec3 ice = vec3(0.44, 0.91, 1.0);
          vec3 signalRed = vec3(0.706, 0.298, 1.0);
          float redSignal = cursor * smoothstep(0.46, 0.86, fine) * 0.48;
          vec3 color = mix(spectralBlue, ice, broken * 0.42 + cursor * 0.22);
          color = mix(color, signalRed, redSignal);
          color += spectralBlue * glow * 0.34;

          float coreMist = (0.5 + coarse * 0.5) * (1.0 - smoothstep(0.0, 0.72, radius)) * 0.075;
          float alpha = clamp(glow * 0.88 + coreMist, 0.0, 0.86);
          gl_FragColor = vec4(color * (glow + coreMist), alpha);
        }
      `;

      const makeShader = (type, source) => {
        const shader = gl.createShader(type);
        gl.shaderSource(shader, source);
        gl.compileShader(shader);
        return shader;
      };
      const program = gl.createProgram();
      gl.attachShader(program, makeShader(gl.VERTEX_SHADER, vertexSource));
      gl.attachShader(program, makeShader(gl.FRAGMENT_SHADER, fragmentSource));
      gl.linkProgram(program);
      gl.useProgram(program);

      const buffer = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
      const position = gl.getAttribLocation(program, "aPosition");
      gl.enableVertexAttribArray(position);
      gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);

      const timeUniform = gl.getUniformLocation(program, "uTime");
      const resolutionUniform = gl.getUniformLocation(program, "uResolution");
      const mouseUniform = gl.getUniformLocation(program, "uMouse");
      const portalPointer = { x: 0.5, y: 0.5 };
      let portalVisible = true;
      let lastPortalFrame = 0;

      const resizePortal = () => {
        const bounds = cymaticPortal.getBoundingClientRect();
        const density = Math.min(window.devicePixelRatio || 1, compact ? 1 : 1.35);
        const width = Math.max(1, Math.round(bounds.width * density));
        const height = Math.max(1, Math.round(bounds.height * density));
        if (cymaticPortal.width !== width || cymaticPortal.height !== height) {
          cymaticPortal.width = width;
          cymaticPortal.height = height;
        }
      };

      const movePortalPointer = (event) => {
        const bounds = cymaticPortal.getBoundingClientRect();
        if (!bounds.width || !bounds.height) return;
        portalPointer.x = (event.clientX - bounds.left) / bounds.width;
        portalPointer.y = 1 - (event.clientY - bounds.top) / bounds.height;
      };

      window.addEventListener("pointermove", movePortalPointer, { passive: true });
      window.addEventListener("resize", resizePortal, { passive: true });
      new ResizeObserver(resizePortal).observe(cymaticPortal);
      new IntersectionObserver(([entry]) => {
        portalVisible = entry.isIntersecting;
      }, { rootMargin: "20%" }).observe(cymaticPortal);
      resizePortal();

      const renderPortal = (now) => {
        if (portalVisible && (reduceMotion || now - lastPortalFrame > 32)) {
          lastPortalFrame = now;
          gl.viewport(0, 0, cymaticPortal.width, cymaticPortal.height);
          gl.uniform1f(timeUniform, reduceMotion ? 0 : now * 0.001);
          gl.uniform2f(resolutionUniform, cymaticPortal.width, cymaticPortal.height);
          gl.uniform2f(mouseUniform, portalPointer.x, portalPointer.y);
          gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
        }
        requestAnimationFrame(renderPortal);
      };
      requestAnimationFrame(renderPortal);
    }
  }

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
  let frequencyData;
  const audioEnergy = { bass: 0, mid: 0, high: 0, level: 0 };

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
    analyser.fftSize = 512;
    analyser.smoothingTimeConstant = 0.86;
    audioData = new Uint8Array(analyser.frequencyBinCount);
    frequencyData = new Uint8Array(analyser.frequencyBinCount);
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
        ? "rgba(180, 76, 255, 0.88)"
        : `rgba(180, 76, 255, ${0.15 + (1 - Math.abs(depth - 0.5) * 2) * 0.25})`;
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

  const makeUniforms = (opacity = 1, response = 1) => ({
    uTime: { value: 0 },
    uScroll: { value: 0 },
    uOpacity: { value: opacity },
    uBass: { value: 0 },
    uMid: { value: 0 },
    uHigh: { value: 0 },
    uLevel: { value: 0 },
    uResponse: { value: response },
    uResolution: { value: new THREE.Vector2(1, 1) },
    uPointer: { value: new THREE.Vector4(-2, -2, 0, 0) }
  });

  const vertexShader = `
    uniform float uTime;
    uniform float uScroll;
    uniform float uBass;
    uniform float uMid;
    uniform float uHigh;
    uniform float uLevel;
    uniform float uResponse;

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

      float breath = 1.0 + uBass * 1.55 * uResponse;
      float fold = 1.0 + uMid * 0.9 * uResponse;
      float audioRipple = sin(p.x * 1.08 + uTime * (0.85 + uHigh * 1.4))
        * uHigh * 0.28 * uResponse * center;

      p.z = primary * 1.34 * breath
        + secondary * 0.46 * fold
        + cymatic * center * 0.2
        + organic * (0.46 + center * (0.2 + uMid * 0.3 * uResponse))
        + audioRipple;
      p.y += sin(p.x * 0.24 - uTime * (0.18 + uLevel * 0.18))
        * (0.2 + uMid * 0.32 * uResponse);
      p.y += organic * (0.08 + uHigh * 0.1 * uResponse);
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
    uniforms: makeUniforms(0.64),
    vertexShader,
    fragmentShader: `
      uniform float uTime;
      uniform float uOpacity;
      uniform float uBass;
      uniform float uMid;
      uniform float uLevel;
      uniform float uHigh;
      uniform vec2 uResolution;
      uniform vec4 uPointer;

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

      float cellHash(vec2 cell) {
        return fract(sin(dot(cell, vec2(127.1, 311.7))) * 43758.5453123);
      }

      vec3 spectralColor(float phase) {
        float cobaltShift = 0.5 + 0.5 * sin(phase * 6.2831853);
        float pearlShift = pow(0.5 + 0.5 * cos(phase * 6.2831853 + 1.1), 9.0);
        return mix(
          vec3(0.012, 0.045, 0.24),
          vec3(0.055, 0.62, 1.0),
          cobaltShift
        ) + vec3(0.48, 0.74, 1.0) * pearlShift * 0.32;
      }

      mat2 rotate2d(float angle) {
        float sine = sin(angle);
        float cosine = cos(angle);
        return mat2(cosine, -sine, sine, cosine);
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
        float blueSpecular = pow(max(dot(reflect(-blueLight, normal), viewDirection), 0.0), 20.0);
        float acidSpecular = pow(max(dot(reflect(-acidLight, normal), viewDirection), 0.0), 26.0);
        float fresnel = pow(1.0 - abs(dot(normal, viewDirection)), 2.0);
        vec2 diamondAxes = vec2(
          vLocalPosition.x * 0.72 + vLocalPosition.y * 1.08,
          vLocalPosition.x * 0.72 - vLocalPosition.y * 1.08
        );
        float diamondId = cellHash(floor(diamondAxes));
        float travel = pow(0.5 + 0.5 * sin(
          vLocalPosition.x * (0.28 + uHigh * 0.16)
            - uTime * (0.24 + uHigh * 0.72)
        ), 7.0);
        float twinkle = 0.72 + 0.28 * sin(
          uTime * (1.1 + diamondId * 1.7) + diamondId * 31.0
        );
        vec3 prism = spectralColor(diamondId + uTime * 0.018 + uHigh * 0.08);
        float shimmer = travel * twinkle;

        vec2 cloudUv = rotate2d(sin(uTime * 0.13) * 0.34)
          * (vLocalPosition.xy * 0.23);
        vec2 cloudDrift = vec2(uTime * 0.115, -uTime * 0.078);
        float warpX = detailNoise(cloudUv * 1.45 + cloudDrift);
        float warpY = detailNoise(cloudUv * 1.7 - cloudDrift.yx + 7.4);
        vec2 warpedCloud = cloudUv + (vec2(warpX, warpY) - 0.5) * 2.48;
        float cloudLow = detailNoise(warpedCloud + cloudDrift * 0.42);
        float cloudHigh = detailNoise(warpedCloud * 2.4 - cloudDrift * 0.75);
        float smokeCurl = detailNoise(
          rotate2d(-0.56) * warpedCloud * 3.7 + cloudDrift.yx * 0.9
        );
        float rollingBand = 0.5 + 0.5 * sin(
          warpedCloud.y * 4.8 - uTime * (0.62 + uBass * 0.45)
            + cloudLow * 5.4 + warpX * 2.2
        );
        float cloud = smoothstep(
          0.05,
          0.87,
          cloudLow * 0.62 + cloudHigh * 0.3 + smokeCurl * 0.24 + rollingBand * 0.18
        );
        float cloudVein = smoothstep(0.32, 0.9, abs(cloudLow - cloudHigh) + cloud * 0.42);

        vec2 screenUv = gl_FragCoord.xy / max(uResolution, vec2(1.0));
        vec2 cursorDelta = screenUv - uPointer.xy;
        cursorDelta.x *= uResolution.x / max(uResolution.y, 1.0);
        float cursorTurbulence = detailNoise(
          screenUv * 11.0 + vec2(uTime * 0.15, -uTime * 0.1)
        );
        float cursorDistance = length(cursorDelta)
          + (cursorTurbulence - 0.5) * 0.025 * uPointer.z;
        float clearCore = (1.0 - smoothstep(0.035, 0.115, cursorDistance))
          * uPointer.z;
        float fluorescentRing = (
          smoothstep(0.035, 0.09, cursorDistance)
            - smoothstep(0.1, 0.19, cursorDistance)
        ) * uPointer.z;
        float fluorescentSmoke = fluorescentRing
          * (0.48 + cloudVein * 0.52)
          * (0.78 + cursorTurbulence * 0.32);

        float sideDistance = min(screenUv.x, 1.0 - screenUv.x);
        float capDistance = min(screenUv.y, 1.0 - screenUv.y);
        float audioDrive = 0.18 + uLevel * 0.82;
        float sideCenterA = 0.018 + sin(
          screenUv.y * 47.0 - uTime * (1.5 + uMid * 3.8) + warpY * 5.0
        ) * (0.004 + uBass * 0.014);
        float sideCenterB = 0.052 + sin(
          screenUv.y * 29.0 + uTime * (1.0 + uHigh * 4.6) + cloudLow * 4.0
        ) * (0.006 + uMid * 0.012);
        float capCenter = 0.022 + sin(
          screenUv.x * 61.0 + uTime * (1.35 + uHigh * 4.0) + cloudHigh * 4.5
        ) * (0.004 + uHigh * 0.012);
        float sideWave = 1.0 - smoothstep(0.0015, 0.0065, abs(sideDistance - sideCenterA));
        sideWave += (1.0 - smoothstep(0.002, 0.008, abs(sideDistance - sideCenterB))) * 0.58;
        float capWave = 1.0 - smoothstep(0.0015, 0.006, abs(capDistance - capCenter));
        float edgeSignal = (sideWave + capWave * 0.7) * audioDrive
          * (0.54 + rollingBand * 0.46);
        float edgeAura = (1.0 - smoothstep(0.0, 0.105, min(sideDistance, capDistance)))
          * (0.08 + uBass * 0.18 + uMid * 0.1);

        vec3 base = vec3(0.012, 0.014, 0.017);
        vec3 electricBlue = vec3(0.035, 0.24, 0.74);
        vec3 ultraviolet = vec3(0.012, 0.035, 0.16);
        vec3 acid = vec3(0.055, 0.68, 1.0);
        vec3 cloudShadow = vec3(0.009, 0.018, 0.052);
        vec3 cloudPearl = mix(vec3(0.018, 0.07, 0.24), vec3(0.07, 0.31, 0.46), warpY);
        vec3 color = mix(base, cloudShadow + cloudPearl * cloud, 0.4 + cloud * 0.52);
        color += mix(vec3(0.05, 0.06, 0.22), electricBlue, warpX)
          * cloudVein * (0.2 + smokeCurl * 0.16);
        color += electricBlue * blueDiffuse * 0.16;
        color += ultraviolet * blueSpecular * 0.28;
        color += acid * acidDiffuse * 0.075;
        color += mix(acid, prism, shimmer)
          * acidSpecular * (0.34 + uLevel * 0.3 + shimmer * 0.2);
        color += mix(electricBlue, acid, vHeight) * fresnel * 0.1;
        color += prism * shimmer * fresnel * (0.08 + uHigh * 0.22);
        color += mix(vec3(0.025, 0.34, 1.0), vec3(0.38, 0.92, 1.0), rollingBand)
          * edgeSignal * (0.28 + uLevel * 0.46);
        color += mix(vec3(0.05, 0.22, 0.85), vec3(0.706, 0.298, 1.0), uHigh)
          * edgeAura;
        color *= 1.0 - clearCore * 0.74;
        color += mix(vec3(0.025, 0.22, 0.95), vec3(0.16, 0.9, 1.0), cursorTurbulence)
          * fluorescentSmoke * (0.75 + uHigh * 0.32);
        color += vec3(0.62, 0.88, 1.0)
          * pow(fluorescentSmoke, 3.0) * 0.35;

        float smokeOpacity = 0.43 + cloud * 0.82;
        float alpha = (0.11 + fresnel * 0.15 + blueSpecular * 0.1
          + acidSpecular * 0.11 + uLevel * 0.1
          + cloud * 0.28 + shimmer * (0.018 + uHigh * 0.06)
          + fluorescentSmoke * 0.22 + edgeSignal * 0.22 + edgeAura * 0.16)
          * smokeOpacity * (1.0 - clearCore * 0.88) * vEdge * uOpacity;
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
      uniform float uLevel;
      uniform float uHigh;
      varying float vHeight;
      varying float vEdge;
      varying vec3 vLocalPosition;

      float cellHash(vec2 cell) {
        return fract(sin(dot(cell, vec2(127.1, 311.7))) * 43758.5453123);
      }

      vec3 spectralColor(float phase) {
        float cobaltShift = 0.5 + 0.5 * sin(phase * 6.2831853);
        float pearlShift = pow(0.5 + 0.5 * cos(phase * 6.2831853 + 1.1), 9.0);
        return mix(
          vec3(0.012, 0.045, 0.24),
          vec3(0.055, 0.62, 1.0),
          cobaltShift
        ) + vec3(0.48, 0.74, 1.0) * pearlShift * 0.32;
      }

      void main() {
        vec3 graphite = vec3(0.2, 0.22, 0.24);
        vec3 white = vec3(0.94, 0.95, 0.9);
        vec3 acid = vec3(0.055, 0.68, 1.0);
        float peak = smoothstep(0.58, 0.96, vHeight);
        float colorFlow = 0.5 + 0.5 * sin(
          vLocalPosition.x * (0.28 + uHigh * 0.16)
            - uTime * (0.24 + uHigh * 0.72)
        );
        float travel = pow(colorFlow, 7.0);
        vec2 diamondAxes = vec2(
          vLocalPosition.x * 0.72 + vLocalPosition.y * 1.08,
          vLocalPosition.x * 0.72 - vLocalPosition.y * 1.08
        );
        float diamondId = cellHash(floor(diamondAxes));
        float twinkle = 0.72 + 0.28 * sin(
          uTime * (1.1 + diamondId * 1.7) + diamondId * 31.0
        );
        vec3 prism = spectralColor(diamondId + uTime * 0.018 + uHigh * 0.08);
        float shimmer = travel * twinkle;
        vec3 restingSignal = mix(acid, white, smoothstep(0.28, 0.82, colorFlow));
        vec3 signalColor = mix(restingSignal, prism, shimmer * (0.82 + uHigh * 0.18));
        vec3 color = mix(graphite, signalColor, 0.34 + peak * 0.56);
        color += prism * shimmer * (0.16 + uHigh * 0.3);
        float alpha = (0.08 + peak * 0.38 + uLevel * 0.18
          + shimmer * (0.12 + uHigh * 0.2)) * vEdge * uOpacity;
        gl_FragColor = vec4(color, alpha);
      }
    `
  });

  const wave = new THREE.Group();
  const surfaceWave = new THREE.Mesh(ribbonGeometry, surfaceMaterial);
  wave.add(surfaceWave);
  wave.position.y = 0.2;
  wave.rotation.x = -0.22;
  wave.rotation.z = -0.018;
  scene.add(wave);

  const cloudMaterial = surfaceMaterial.clone();
  cloudMaterial.uniforms.uOpacity.value = 0.46;
  cloudMaterial.uniforms.uResponse.value = 0.34;
  const backgroundCloud = new THREE.Mesh(netGeometry, cloudMaterial);
  backgroundCloud.position.set(0, -1.8, -5.28);
  backgroundCloud.rotation.x = -0.78;
  backgroundCloud.rotation.z = 0.055;
  scene.add(backgroundCloud);

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
    color: 0xb44cff,
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

  const averageBand = (start, end) => {
    if (!frequencyData) return 0;
    let total = 0;
    const safeEnd = Math.min(end, frequencyData.length);
    for (let index = start; index < safeEnd; index += 1) total += frequencyData[index];
    return total / Math.max(safeEnd - start, 1) / 255;
  };

  const updateAudioEnergy = (delta) => {
    const active = analyser && !audio.paused;
    if (active) analyser.getByteFrequencyData(frequencyData);

    const target = active
      ? {
          bass: averageBand(1, 14),
          mid: averageBand(14, 72),
          high: averageBand(72, 190),
          level: averageBand(1, 190)
        }
      : { bass: 0, mid: 0, high: 0, level: 0 };

    Object.keys(audioEnergy).forEach((band) => {
      const speed = target[band] > audioEnergy[band] ? 12 : 4.2;
      const damping = 1 - Math.exp(-delta * speed);
      audioEnergy[band] += (target[band] - audioEnergy[band]) * damping;
    });
  };

  const applyAudioUniforms = (material) => {
    material.uniforms.uBass.value = audioEnergy.bass;
    material.uniforms.uMid.value = audioEnergy.mid;
    material.uniforms.uHigh.value = audioEnergy.high;
    material.uniforms.uLevel.value = audioEnergy.level;
  };

  const updatePointerUniform = (material, delta) => {
    if (material === surfaceMaterial) pointerGlow.age += delta;
    const intensity = Math.exp(-pointerGlow.age * 7.2);
    material.uniforms.uPointer.value.set(
      pointerGlow.x,
      pointerGlow.y,
      intensity,
      0
    );
  };

  const resize = () => {
    const width = container.clientWidth;
    const height = container.clientHeight;

    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, compact ? 1.25 : 1.5));
    renderer.setSize(width, height, false);
    const pixelRatio = renderer.getPixelRatio();
    surfaceMaterial.uniforms.uResolution.value.set(width * pixelRatio, height * pixelRatio);
    cloudMaterial.uniforms.uResolution.value.set(width * pixelRatio, height * pixelRatio);
  };

  const render = () => {
    const delta = Math.min(clock.getDelta(), 0.05);
    elapsed += delta * 0.62;
    updateAudioEnergy(delta);
    const scrollDamping = 1 - Math.exp(-delta * 3.2);

    const rawScroll = window.scrollY / Math.max(document.body.scrollHeight - window.innerHeight, 1);
    smoothScroll += (rawScroll - smoothScroll) * scrollDamping;
    surfaceMaterial.uniforms.uTime.value = elapsed;
    surfaceMaterial.uniforms.uScroll.value = smoothScroll;
    applyAudioUniforms(surfaceMaterial);
    updatePointerUniform(surfaceMaterial, delta);
    cloudMaterial.uniforms.uTime.value = elapsed * 0.82 + 0.7;
    cloudMaterial.uniforms.uScroll.value = smoothScroll;
    applyAudioUniforms(cloudMaterial);
    updatePointerUniform(cloudMaterial, delta);

    wave.rotation.z = -0.018 + Math.sin(elapsed * 0.11) * 0.006;
    backgroundCloud.rotation.z = 0.055 + Math.sin(elapsed * 0.075) * 0.008;
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
    cloudMaterial.uniforms.uTime.value = 3.1;
    renderer.render(scene, camera);
  } else {
    render();
  }
});
