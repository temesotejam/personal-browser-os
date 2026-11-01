(() => {
  "use strict";

  const $ = (selector, root) => (root || document).querySelector(selector);
  const desktopArea = $(".desktop-area");
  const windowLayer = $("#windowLayer");
  const desktopIcons = $("#desktopIcons");
  const dock = $("#dock");
  const launcherPanel = $("#launcherPanel");
  const launcherGrid = $("#launcherGrid");
  const launcherSearch = $("#launcherSearch");
  const STORAGE = {
    notes: "personal-os-notes-v1",
    theme: "personal-os-theme-v1",
    wallpaper: "personal-os-wallpaper-v1",
    customApps: "personal-os-custom-apps-v1"
  };

  const apps = [
    { id: "home", name: "Overview", icon: "⌂", description: "Your personal desktop at a glance", width: 650, height: 460, desktop: true, dock: true },
    { id: "calculator", name: "Calculator", icon: "∑", description: "A simple everyday calculator", width: 360, height: 465, desktop: true, dock: true },
    { id: "notes", name: "Notes", icon: "▤", description: "A quiet place for your thoughts", width: 520, height: 440, desktop: true, dock: true },
    { id: "viewer", name: "Image Viewer", icon: "▧", description: "Preview an image from your device", width: 600, height: 430, desktop: true, dock: true },
    { id: "settings", name: "Settings", icon: "⚙", description: "Make this desktop feel like yours", width: 520, height: 470, desktop: true, dock: true },
    { id: "app-center", name: "App Center", icon: "＋", description: "Add your own web apps", width: 570, height: 500, desktop: true, dock: false }
  ];

  const windows = new Map();
  let zIndex = 20;
  let dragState = null;
  let toastTimer = null;
  let customApps = readStorage(STORAGE.customApps, []);

  function readStorage(key, fallback) {
    try {
      const value = localStorage.getItem(key);
      return value === null ? fallback : JSON.parse(value);
    } catch (_) { return fallback; }
  }
  function writeStorage(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); }
    catch (_) { showToast("Browser storage is unavailable."); }
  }
  function showToast(message) {
    const toast = $("#toast");
    toast.textContent = message;
    toast.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove("show"), 2200);
  }
  function getMeta(id) {
    const builtIn = apps.find((app) => app.id === id);
    if (builtIn) return builtIn;
    const custom = customApps.find((app) => app.id === id);
    return custom ? { ...custom, width: 820, height: 560, icon: custom.icon || "↗" } : null;
  }
  function allApps() {
    return apps.concat(customApps.map((app) => ({ ...app, description: "Your custom web application" })));
  }

  function renderDesktopIcons() {
    desktopIcons.replaceChildren();
    apps.filter((app) => app.desktop).forEach((app) => {
      const button = document.createElement("button");
      button.className = "desktop-icon";
      button.type = "button";
      button.innerHTML = '<span class="icon-tile"></span><span class="icon-label"></span>';
      $(".icon-tile", button).textContent = app.icon;
      $(".icon-label", button).textContent = app.name;
      button.title = app.description;
      button.addEventListener("click", () => openApp(app.id));
      desktopIcons.append(button);
    });
  }

  function renderDock() {
    dock.replaceChildren();
    apps.filter((app) => app.dock).forEach((app) => {
      const button = document.createElement("button");
      button.className = "dock-button";
      button.type = "button";
      button.title = app.name;
      button.setAttribute("aria-label", app.name);
      button.textContent = app.icon;
      button.dataset.app = app.id;
      button.addEventListener("click", () => openApp(app.id));
      dock.append(button);
    });
    const separator = document.createElement("span");
    separator.className = "dock-separator";
    dock.append(separator);
    const launcher = document.createElement("button");
    launcher.className = "dock-button";
    launcher.type = "button";
    launcher.title = "All applications";
    launcher.setAttribute("aria-label", "All applications");
    launcher.textContent = "▦";
    launcher.addEventListener("click", toggleLauncher);
    dock.append(launcher);
  }

  function renderLauncher(filter) {
    const query = (filter || "").trim().toLowerCase();
    launcherGrid.replaceChildren();
    const visible = allApps().filter((app) => (app.name + " " + (app.description || "")).toLowerCase().includes(query));
    visible.forEach((app) => {
      const button = document.createElement("button");
      button.className = "launcher-app";
      button.type = "button";
      const tile = document.createElement("span");
      tile.className = "icon-tile";
      tile.textContent = app.icon;
      const label = document.createElement("span");
      label.textContent = app.name;
      button.append(tile, label);
      button.addEventListener("click", () => {
        openApp(app.id);
        launcherPanel.hidden = true;
      });
      launcherGrid.append(button);
    });
    $("#appCount").textContent = String(visible.length).padStart(2, "0") + " APPS";
    if (!visible.length) {
      const empty = document.createElement("div");
      empty.className = "empty-state";
      empty.textContent = "No apps found.";
      launcherGrid.append(empty);
    }
  }

  function toggleLauncher() {
    launcherPanel.hidden = !launcherPanel.hidden;
    if (!launcherPanel.hidden) {
      launcherSearch.value = "";
      renderLauncher("");
      launcherSearch.focus();
    }
  }

  function updateDockState() {
    dock.querySelectorAll("[data-app]").forEach((button) => {
      const win = windows.get(button.dataset.app);
      button.classList.toggle("is-open", Boolean(win && win.isConnected && win.style.display !== "none"));
    });
  }

  function focusWindow(win) {
    windows.forEach((other) => other.classList.remove("focused"));
    win.classList.add("focused");
    win.style.zIndex = String(++zIndex);
  }

  function openApp(id) {
    const existing = windows.get(id);
    if (existing && existing.isConnected) {
      existing.style.display = "flex";
      focusWindow(existing);
      updateDockState();
      return;
    }
    const meta = getMeta(id);
    if (!meta) return;
    const win = document.createElement("section");
    win.className = "window focused";
    win.dataset.app = id;
    win.style.zIndex = String(++zIndex);
    const width = Math.min(meta.width || 600, Math.max(300, desktopArea.clientWidth - 24));
    const height = Math.min(meta.height || 430, Math.max(220, desktopArea.clientHeight - 24));
    const offset = windows.size * 25;
    win.style.width = width + "px";
    win.style.height = height + "px";
    win.style.left = Math.max(12, Math.min(150 + offset, desktopArea.clientWidth - width - 12)) + "px";
    win.style.top = Math.max(12, Math.min(58 + offset, desktopArea.clientHeight - height - 12)) + "px";

    const titlebar = document.createElement("div");
    titlebar.className = "window-titlebar";
    const appIcon = document.createElement("span");
    appIcon.className = "window-app-icon";
    appIcon.textContent = meta.icon;
    const title = document.createElement("span");
    title.className = "window-title";
    title.textContent = meta.name;
    const actions = document.createElement("div");
    actions.className = "window-actions";
    actions.innerHTML = '<button class="window-action minimize" type="button" title="Minimize" aria-label="Minimize">−</button><button class="window-action maximize" type="button" title="Maximize" aria-label="Maximize">□</button><button class="window-action close" type="button" title="Close" aria-label="Close">×</button>';
    titlebar.append(appIcon, title, actions);
    const content = document.createElement("div");
    content.className = "window-content";
    win.append(titlebar, content);
    windowLayer.append(win);
    windows.set(id, win);

    titlebar.addEventListener("pointerdown", (event) => {
      if (event.target.closest("button") || win.classList.contains("maximized")) return;
      focusWindow(win);
      const rect = win.getBoundingClientRect();
      const areaRect = desktopArea.getBoundingClientRect();
      dragState = { win, pointerId: event.pointerId, x: event.clientX, y: event.clientY, left: rect.left - areaRect.left, top: rect.top - areaRect.top };
      titlebar.setPointerCapture(event.pointerId);
    });
    titlebar.addEventListener("pointermove", (event) => {
      if (!dragState || dragState.win !== win || dragState.pointerId !== event.pointerId) return;
      const maxLeft = Math.max(0, desktopArea.clientWidth - win.offsetWidth);
      const maxTop = Math.max(0, desktopArea.clientHeight - 50);
      const left = Math.min(maxLeft, Math.max(0, dragState.left + event.clientX - dragState.x));
      const top = Math.min(maxTop, Math.max(0, dragState.top + event.clientY - dragState.y));
      win.style.left = left + "px";
      win.style.top = top + "px";
    });
    titlebar.addEventListener("pointerup", () => { dragState = null; });
    titlebar.addEventListener("pointercancel", () => { dragState = null; });
    win.addEventListener("pointerdown", () => focusWindow(win));
    $(".minimize", actions).addEventListener("click", () => { win.style.display = "none"; updateDockState(); });
    $(".maximize", actions).addEventListener("click", () => toggleMaximize(win));
    $(".close", actions).addEventListener("click", () => {
      win.remove();
      windows.delete(id);
      updateDockState();
    });

    mountApp(id, content);
    focusWindow(win);
    updateDockState();
  }

  function toggleMaximize(win) {
    if (win.classList.contains("maximized")) {
      win.classList.remove("maximized");
      const old = win._restoreRect;
      if (old) {
        win.style.left = old.left;
        win.style.top = old.top;
        win.style.width = old.width;
        win.style.height = old.height;
      }
    } else {
      win._restoreRect = { left: win.style.left, top: win.style.top, width: win.style.width, height: win.style.height };
      win.classList.add("maximized");
      win.style.left = "8px";
      win.style.top = "8px";
      win.style.width = "calc(100% - 16px)";
      win.style.height = "calc(100% - 16px)";
    }
  }

  function mountApp(id, content) {
    if (id.startsWith("web-")) {
      const app = customApps.find((item) => item.id === id);
      if (!app) return;
      content.classList.add("no-padding");
      const frame = document.createElement("iframe");
      frame.title = app.name;
      frame.loading = "lazy";
      frame.referrerPolicy = "no-referrer";
      frame.sandbox = "allow-forms allow-scripts allow-popups";
      frame.src = app.url;
      content.append(frame);
      return;
    }

    if (id === "home") {
      content.innerHTML = '<div class="app-hero"><p class="eyebrow">WELCOME TO YOUR SPACE</p><h2>A desktop that is yours.</h2><p>This is a small, personal workspace running entirely in your browser. Open an app, arrange your windows, and make the space your own.</p></div><div class="app-cards"><article class="app-card"><span class="card-icon">▤</span><h3>Capture a thought</h3><p>Keep quick notes in your browser. Your text is saved automatically on this device.</p><button class="small-button" data-open="notes" style="margin-top:12px">Open Notes ↗</button></article><article class="app-card"><span class="card-icon">∑</span><h3>Work something out</h3><p>A lightweight calculator for everyday numbers and quick checks.</p><button class="small-button" data-open="calculator" style="margin-top:12px">Open Calculator ↗</button></article><article class="app-card"><span class="card-icon">▧</span><h3>Look at an image</h3><p>Preview an image from your computer without uploading it to a server.</p><button class="small-button" data-open="viewer" style="margin-top:12px">Open Viewer ↗</button></article><article class="app-card"><span class="card-icon">＋</span><h3>Make it yours</h3><p>Add a website or your own hosted web app to the launcher.</p><button class="small-button" data-open="app-center" style="margin-top:12px">Add an app ↗</button></article></div>';
      wireOpenButtons(content);
      return;
    }

    if (id === "calculator") {
      content.innerHTML = '<div class="calc"><div class="calc-display"><div class="calc-expression" id="calcExpression"></div><div class="calc-value" id="calcValue">0</div></div><div class="calc-grid"><button class="calc-key" data-key="clear">AC</button><button class="calc-key" data-key="back">⌫</button><button class="calc-key operator" data-key="%">%</button><button class="calc-key operator" data-key="/">÷</button><button class="calc-key" data-key="7">7</button><button class="calc-key" data-key="8">8</button><button class="calc-key" data-key="9">9</button><button class="calc-key operator" data-key="*">×</button><button class="calc-key" data-key="4">4</button><button class="calc-key" data-key="5">5</button><button class="calc-key" data-key="6">6</button><button class="calc-key operator" data-key="-">−</button><button class="calc-key" data-key="1">1</button><button class="calc-key" data-key="2">2</button><button class="calc-key" data-key="3">3</button><button class="calc-key operator" data-key="+">+</button><button class="calc-key wide" data-key="0">0</button><button class="calc-key" data-key=".">.</button><button class="calc-key equals" data-key="=">=</button></div></div>';
      setupCalculator(content);
      return;
    }

    if (id === "notes") {
      content.innerHTML = '<div class="notes-layout"><div class="notes-toolbar"><span>PERSONAL NOTE</span><span id="notesStatus">SAVED LOCALLY</span></div><textarea class="notes-area" id="notesArea" placeholder="Start writing…"></textarea></div>';
      const area = $("#notesArea", content);
      area.value = readStorage(STORAGE.notes, "");
      area.addEventListener("input", () => {
        writeStorage(STORAGE.notes, area.value);
        $("#notesStatus", content).textContent = "SAVED JUST NOW";
      });
      return;
    }

    if (id === "viewer") {
      content.classList.add("no-padding");
      content.innerHTML = '<div class="viewer-frame"><div class="viewer-drop" id="viewerDrop"><div style="font-size:34px">▧</div><strong style="font-size:12px">Drop an image here</strong><span style="font-size:10px">or choose a file from your device</span><label class="primary-button" for="imageFile">Choose image</label><input id="imageFile" type="file" accept="image/*" hidden></div></div>';
      setupViewer(content);
      return;
    }

    if (id === "settings") {
      content.innerHTML = '<div class="settings-section"><h3>Appearance</h3><p>Choose the look and atmosphere of your desktop.</p><div class="settings-row"><label><span class="field-label">Color theme</span><select class="select-field" id="themeSelect"><option value="dark">Midnight</option><option value="light">Daylight</option></select></label><label><span class="field-label">Wallpaper</span><select class="select-field" id="wallpaperSelect"><option value="aurora">Aurora</option><option value="sunset">Sunset</option><option value="ocean">Ocean</option><option value="graphite">Graphite</option></select></label></div></div><div class="settings-section"><h3>Privacy</h3><p>Notes, preferences, and custom app shortcuts are stored in this browser using local storage. Images selected in Image Viewer are previewed locally and are not uploaded.</p></div><div class="settings-section"><h3>About this desktop</h3><p>Personal Browser OS · First release. A static web app designed for GitHub Pages.</p><button class="secondary-button" id="resetSettings">Reset appearance</button></div>';
      setupSettings(content);
      return;
    }

    if (id === "app-center") {
      content.innerHTML = '<div class="app-hero"><p class="eyebrow">MAKE IT YOURS</p><h2>Your apps, one desktop.</h2><p>Add a website or a web app you host yourself. It will appear in the launcher and open in its own window.</p></div><form class="custom-app-form" id="customAppForm"><label><span class="field-label">App name</span><input class="text-field" name="name" maxlength="28" placeholder="e.g. My dashboard" required></label><label><span class="field-label">Icon (emoji or symbol)</span><input class="text-field" name="icon" maxlength="4" placeholder="↗" value="↗"></label><label class="full"><span class="field-label">Web address (https://…)</span><input class="text-field" name="url" type="url" placeholder="https://example.com" required></label><div class="full"><button class="primary-button" type="submit">＋ Add to my desktop</button></div></form><div class="custom-app-list" id="customAppList"></div>';
      setupAppCenter(content);
    }
  }

  function wireOpenButtons(root) {
    root.querySelectorAll("[data-open]").forEach((button) => {
      button.addEventListener("click", () => openApp(button.dataset.open));
    });
  }

  function evaluateExpression(source) {
    const clean = source.replace(/\s/g, "");
    const tokens = clean.match(/(?:\d+\.?\d*|\.\d+)|[()+\-*/%]/g);
    if (!tokens || tokens.join("") !== clean) throw new Error("Invalid expression");
    let index = 0;
    function expression() {
      let value = term();
      while (tokens[index] === "+" || tokens[index] === "-") {
        const operator = tokens[index++];
        const right = term();
        value = operator === "+" ? value + right : value - right;
      }
      return value;
    }
    function term() {
      let value = unary();
      while (tokens[index] === "*" || tokens[index] === "/" || tokens[index] === "%") {
        const operator = tokens[index++];
        const right = unary();
        if ((operator === "/" || operator === "%") && right === 0) throw new Error("Cannot divide by zero");
        if (operator === "*") value *= right;
        if (operator === "/") value /= right;
        if (operator === "%") value %= right;
      }
      return value;
    }
    function unary() {
      if (tokens[index] === "+") { index++; return unary(); }
      if (tokens[index] === "-") { index++; return -unary(); }
      return primary();
    }
    function primary() {
      const token = tokens[index++];
      if (token === "(") {
        const value = expression();
        if (tokens[index++] !== ")") throw new Error("Missing closing parenthesis");
        return value;
      }
      if (!token || !/^\d*\.?\d+$/.test(token)) throw new Error("Invalid number");
      return Number(token);
    }
    const result = expression();
    if (index !== tokens.length || !Number.isFinite(result)) throw new Error("Invalid result");
    return result;
  }

  function setupCalculator(root) {
    let expression = "";
    let justEvaluated = false;
    const value = $("#calcValue", root);
    const history = $("#calcExpression", root);
    function render() {
      value.textContent = expression || "0";
      history.textContent = "";
    }
    root.querySelector(".calc-grid").addEventListener("click", (event) => {
      const button = event.target.closest("[data-key]");
      if (!button) return;
      const key = button.dataset.key;
      if (key === "clear") { expression = ""; justEvaluated = false; render(); return; }
      if (key === "back") { expression = expression.slice(0, -1); justEvaluated = false; render(); return; }
      if (key === "=") {
        try {
          const answer = evaluateExpression(expression);
          history.textContent = expression + " =";
          expression = String(Number(answer.toPrecision(11)));
          value.textContent = expression;
          justEvaluated = true;
        } catch (_) { value.textContent = "Error"; justEvaluated = true; }
        return;
      }
      if (/^[0-9.]$/.test(key)) {
        if (justEvaluated) expression = "";
        justEvaluated = false;
        expression += key;
      } else {
        if (justEvaluated) justEvaluated = false;
        expression += key;
      }
      render();
    });
  }

  function setupViewer(root) {
    const input = $("#imageFile", root);
    const drop = $("#viewerDrop", root);
    function showFile(file) {
      if (!file || !file.type.startsWith("image/")) { showToast("Please choose an image file."); return; }
      const url = URL.createObjectURL(file);
      const image = document.createElement("img");
      image.className = "viewer-preview";
      image.alt = file.name;
      image.src = url;
      image.addEventListener("load", () => URL.revokeObjectURL(url), { once: true });
      const frame = $(".viewer-frame", root);
      frame.replaceChildren(image);
    }
    input.addEventListener("change", () => showFile(input.files && input.files[0]));
    drop.addEventListener("dragover", (event) => { event.preventDefault(); drop.style.borderColor = "var(--accent)"; });
    drop.addEventListener("dragleave", () => { drop.style.borderColor = ""; });
    drop.addEventListener("drop", (event) => {
      event.preventDefault();
      drop.style.borderColor = "";
      showFile(event.dataTransfer.files && event.dataTransfer.files[0]);
    });
  }

  function applyAppearance(theme, wallpaper) {
    document.body.dataset.theme = theme;
    document.body.dataset.wallpaper = wallpaper;
    writeStorage(STORAGE.theme, theme);
    writeStorage(STORAGE.wallpaper, wallpaper);
  }

  function setupSettings(root) {
    const theme = $("#themeSelect", root);
    const wallpaper = $("#wallpaperSelect", root);
    theme.value = document.body.dataset.theme;
    wallpaper.value = document.body.dataset.wallpaper;
    theme.addEventListener("change", () => applyAppearance(theme.value, wallpaper.value));
    wallpaper.addEventListener("change", () => applyAppearance(theme.value, wallpaper.value));
    $("#resetSettings", root).addEventListener("click", () => {
      theme.value = "dark";
      wallpaper.value = "aurora";
      applyAppearance("dark", "aurora");
      showToast("Appearance reset.");
    });
  }

  function setupAppCenter(root) {
    const form = $("#customAppForm", root);
    const list = $("#customAppList", root);
    renderCustomAppList(list);
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      const data = new FormData(form);
      const name = String(data.get("name") || "").trim();
      const icon = String(data.get("icon") || "↗").trim() || "↗";
      let url;
      try { url = new URL(String(data.get("url") || "").trim()); }
      catch (_) { showToast("Enter a valid web address."); return; }
      if (!["https:", "http:"].includes(url.protocol)) { showToast("Only web addresses are supported."); return; }
      if (!name) return;
      const app = { id: "web-" + Date.now().toString(36), name, icon, url: url.href };
      customApps.push(app);
      writeStorage(STORAGE.customApps, customApps);
      renderCustomAppList(list);
      renderLauncher(launcherSearch.value);
      form.reset();
      form.elements.icon.value = "↗";
      showToast(name + " added to your launcher.");
    });
  }

  function renderCustomAppList(list) {
    list.replaceChildren();
    if (!customApps.length) {
      const empty = document.createElement("div");
      empty.className = "empty-state";
      empty.textContent = "No custom apps yet. Add a website above to get started.";
      list.append(empty);
      return;
    }
    customApps.forEach((app) => {
      const row = document.createElement("div");
      row.className = "custom-app-item";
      const icon = document.createElement("span");
      icon.textContent = app.icon || "↗";
      const details = document.createElement("div");
      details.className = "app-name";
      const name = document.createElement("div");
      name.textContent = app.name;
      const url = document.createElement("span");
      url.className = "app-url";
      url.textContent = app.url;
      details.append(name, url);
      const remove = document.createElement("button");
      remove.className = "small-button";
      remove.type = "button";
      remove.textContent = "Remove";
      remove.addEventListener("click", () => {
        customApps = customApps.filter((item) => item.id !== app.id);
        writeStorage(STORAGE.customApps, customApps);
        renderCustomAppList(list);
        renderLauncher(launcherSearch.value);
        const win = windows.get(app.id);
        if (win) { win.remove(); windows.delete(app.id); updateDockState(); }
        showToast("App removed.");
      });
      row.append(icon, details, remove);
      list.append(row);
    });
  }
