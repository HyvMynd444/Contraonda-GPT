const editions = {
  original: {
    label: "Original GPT",
    path: "original/index.html",
    accent: "#ff2d43",
    background: "#070807",
  },
  red: {
    label: "Red Signal",
    path: "red/index.html",
    accent: "#ff2d43",
    background: "#070807",
  },
  acid: {
    label: "Acid Signal",
    path: "acid/index.html",
    accent: "#d8ff00",
    background: "#070807",
  },
  ultraviolet: {
    label: "Ultraviolet",
    path: "ultraviolet/index.html",
    accent: "#b44cff",
    background: "#070807",
  },
  pearl: {
    label: "Pearl",
    path: "pearl/index.html",
    accent: "#8aa0bd",
    background: "#f3f3f0",
  },
};

const frame = document.querySelector(".edition-frame");
const buttons = document.querySelectorAll("[data-edition]");
const openEdition = document.querySelector(".open-edition");
const copyLink = document.querySelector(".copy-link");
const loadingSignal = document.querySelector(".loading-signal span");

const requestedEdition = new URLSearchParams(window.location.search).get("style");
let currentEdition = editions[requestedEdition] ? requestedEdition : "red";

function showEdition(name, updateHistory = true) {
  const edition = editions[name];
  if (!edition) return;

  currentEdition = name;
  frame.classList.remove("is-ready");
  frame.style.background = edition.background;
  frame.title = `Contraonda ${edition.label} edition`;
  loadingSignal.textContent = `Loading ${edition.label}`;
  document.documentElement.style.setProperty("--accent", edition.accent);

  buttons.forEach((button) => {
    button.setAttribute("aria-pressed", String(button.dataset.edition === name));
  });

  openEdition.href = edition.path;
  if (!frame.src.endsWith(edition.path)) frame.src = edition.path;

  if (updateHistory) {
    const url = new URL(window.location.href);
    url.searchParams.set("style", name);
    window.history.replaceState({ edition: name }, "", url);
  }
}

buttons.forEach((button) => {
  button.addEventListener("click", () => showEdition(button.dataset.edition));
});

frame.addEventListener("load", () => {
  frame.classList.add("is-ready");
});

copyLink.addEventListener("click", async () => {
  const originalLabel = copyLink.textContent;
  try {
    await navigator.clipboard.writeText(window.location.href);
    copyLink.textContent = "Link copied";
  } catch {
    copyLink.textContent = "Copy URL above";
  }
  window.setTimeout(() => {
    copyLink.textContent = originalLabel;
  }, 1800);
});

window.addEventListener("popstate", () => {
  const name = new URLSearchParams(window.location.search).get("style");
  showEdition(editions[name] ? name : "red", false);
});

showEdition(currentEdition, requestedEdition !== currentEdition);
