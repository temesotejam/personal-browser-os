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
