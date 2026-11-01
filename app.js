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
    { id: "home", name: "ホーム", icon: "⌂", description: "あなた専用のデスクトップ概要", width: 650, height: 460, desktop: true, dock: true },
    { id: "browser", name: "ブラウザー", icon: "🌐", description: "Webサイトを閲覧・検索", width: 900, height: 620, desktop: true, dock: true },
    { id: "calculator", name: "電卓", icon: "∑", description: "日常使いのシンプルな電卓", width: 360, height: 465, desktop: true, dock: true },
    { id: "notes", name: "メモ帳", icon: "▤", description: "思いついたことを書き留める場所", width: 520, height: 440, desktop: true, dock: true },
    { id: "viewer", name: "画像ビューア", icon: "▧", description: "端末内の画像を表示", width: 600, height: 430, desktop: true, dock: true },
    { id: "settings", name: "設定", icon: "⚙", description: "デスクトップの見た目を変更", width: 520, height: 470, desktop: true, dock: true },
    { id: "app-center", name: "アプリ追加", icon: "＋", description: "お気に入りのWebアプリを登録", width: 570, height: 500, desktop: true, dock: false }
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
    catch (_) { showToast("ブラウザーの保存機能を利用できません。"); }
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
    return apps.concat(customApps.map((app) => ({ ...app, description: "追加したWebアプリ" })));
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
    launcher.title = "すべてのアプリ";
    launcher.setAttribute("aria-label", "すべてのアプリ");
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
    $("#appCount").textContent = String(visible.length).padStart(2, "0") + " アプリ";
    if (!visible.length) {
      const empty = document.createElement("div");
      empty.className = "empty-state";
      empty.textContent = "アプリが見つかりません。";
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
    actions.innerHTML = '<button class="window-action minimize" type="button" title="最小化" aria-label="最小化">−</button><button class="window-action maximize" type="button" title="最大化" aria-label="最大化">□</button><button class="window-action close" type="button" title="閉じる" aria-label="閉じる">×</button>';
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
    $(".maximize", actions).addEventListener("click", () => toggle最大化(win));
    $(".close", actions).addEventListener("click", () => {
      win.remove();
      windows.delete(id);
      updateDockState();
    });

    mountApp(id, content);
    focusWindow(win);
    updateDockState();
  }

  function toggle最大化(win) {
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
      content.innerHTML = '<div class="app-hero"><p class="eyebrow">あなたのデスクトップへようこそ</p><h2>自分だけのデスクトップ。</h2><p>これはブラウザーだけで動く、あなただけの作業空間です。アプリを起動し、ウィンドウを並べて、自分好みの環境に整えていきましょう。</p></div><div class="app-cards"><article class="app-card"><span class="card-icon">▤</span><h3>思いつきを書き留める</h3><p>ブラウザー内にメモを残せます。入力した内容は、この端末に自動保存されます。</p><button class="small-button" data-open="notes" style="margin-top:12px">メモ帳を開く ↗</button></article><article class="app-card"><span class="card-icon">∑</span><h3>計算する</h3><p>日常の計算やちょっとした確認に使えるシンプルな電卓です。</p><button class="small-button" data-open="calculator" style="margin-top:12px">電卓を開く ↗</button></article><article class="app-card"><span class="card-icon">▧</span><h3>画像を見る</h3><p>画像をサーバーに送信せず、この端末から読み込んで表示できます。</p><button class="small-button" data-open="viewer" style="margin-top:12px">画像ビューアを開く ↗</button></article><article class="app-card"><span class="card-icon">＋</span><h3>自分好みにカスタマイズ</h3><p>Webサイトや自作のWebアプリをランチャーに追加できます。</p><button class="small-button" data-open="app-center" style="margin-top:12px">アプリを追加 ↗</button></article></div>';
      wireOpenButtons(content);
      return;
    }


    if (id === "browser") {
      content.classList.add("no-padding");
      content.innerHTML = '<div class="browser-app"><form class="browser-toolbar" id="browserForm"><button class="browser-control" type="button" data-browser-action="back" aria-label="戻る" title="戻る" disabled>←</button><button class="browser-control" type="button" data-browser-action="forward" aria-label="進む" title="進む" disabled>→</button><button class="browser-control" type="button" data-browser-action="reload" aria-label="再読み込み" title="再読み込み">↻</button><input class="browser-address" id="browserAddress" type="text" inputmode="url" autocomplete="url" placeholder="URLまたは検索語句を入力"><button class="browser-go" type="submit">移動</button><button class="browser-external" type="button" data-browser-action="external" title="別タブで開く">↗</button></form><div class="browser-notice" id="browserNotice">一部のWebサイトは安全上の理由でこの画面内に表示できません。その場合は右上の「別タブで開く」を使ってください。</div><div class="browser-start" id="browserStart"><div class="browser-start-mark">🌐</div><p class="eyebrow">パーソナルブラウザー</p><h2>インターネットを開く</h2><p>上のアドレス欄にURLまたは検索したい言葉を入力してください。</p><div class="browser-shortcuts"><button type="button" data-quick="https://www.google.com/">Google</button><button type="button" data-quick="https://www.youtube.com/">YouTube</button><button type="button" data-quick="https://github.com/">GitHub</button><button type="button" data-quick="https://ja.wikipedia.org/">Wikipedia</button></div><p class="browser-start-note">検索語句はGoogle検索を別タブで開きます。Webサイトによっては別タブでの表示が必要です。</p></div><iframe class="browser-frame" id="browserFrame" title="閲覧ページ" referrerpolicy="no-referrer" allow="fullscreen" hidden></iframe></div>';
      setupBrowser(content);
      return;
    }

    if (id === "calculator") {
      content.innerHTML = '<div class="calc"><div class="calc-display"><div class="calc-expression" id="calcExpression"></div><div class="calc-value" id="calcValue">0</div></div><div class="calc-grid"><button class="calc-key" data-key="clear">消去</button><button class="calc-key" data-key="back">⌫</button><button class="calc-key operator" data-key="%">%</button><button class="calc-key operator" data-key="/">÷</button><button class="calc-key" data-key="7">7</button><button class="calc-key" data-key="8">8</button><button class="calc-key" data-key="9">9</button><button class="calc-key operator" data-key="*">×</button><button class="calc-key" data-key="4">4</button><button class="calc-key" data-key="5">5</button><button class="calc-key" data-key="6">6</button><button class="calc-key operator" data-key="-">−</button><button class="calc-key" data-key="1">1</button><button class="calc-key" data-key="2">2</button><button class="calc-key" data-key="3">3</button><button class="calc-key operator" data-key="+">+</button><button class="calc-key wide" data-key="0">0</button><button class="calc-key" data-key=".">.</button><button class="calc-key equals" data-key="=">=</button></div></div>';
      setupCalculator(content);
      return;
    }

    if (id === "notes") {
      content.innerHTML = '<div class="notes-layout"><div class="notes-toolbar"><span>個人メモ</span><span id="notesStatus">端末に保存済み</span></div><textarea class="notes-area" id="notesArea" placeholder="ここにメモを入力してください…"></textarea></div>';
      const area = $("#notesArea", content);
      area.value = readStorage(STORAGE.notes, "");
      area.addEventListener("input", () => {
        writeStorage(STORAGE.notes, area.value);
        $("#notesStatus", content).textContent = "たった今保存";
      });
      return;
    }

    if (id === "viewer") {
      content.classList.add("no-padding");
      content.innerHTML = '<div class="viewer-frame"><div class="viewer-drop" id="viewerDrop"><div style="font-size:34px">▧</div><strong style="font-size:12px">ここに画像をドロップ</strong><span style="font-size:10px">または端末から画像を選択</span><label class="primary-button" for="imageFile">画像を選択</label><input id="imageFile" type="file" accept="image/*" hidden></div></div>';
      setupViewer(content);
      return;
    }

    if (id === "settings") {
      content.innerHTML = '<div class="settings-section"><h3>外観</h3><p>デスクトップの配色や壁紙を変更できます。</p><div class="settings-row"><label><span class="field-label">テーマ</span><select class="select-field" id="themeSelect"><option value="dark">ダーク</option><option value="light">ライト</option></select></label><label><span class="field-label">壁紙</span><select class="select-field" id="wallpaperSelect"><option value="aurora">オーロラ</option><option value="sunset">夕焼け</option><option value="ocean">海</option><option value="graphite">グラファイト</option></select></label></div></div><div class="settings-section"><h3>プライバシー</h3><p>メモ、外観設定、追加したアプリの情報は、このブラウザー内に保存されます。画像ビューアで選択した画像は端末内で表示するだけで、サーバーには送信されません。</p></div><div class="settings-section"><h3>このデスクトップについて</h3><p>パーソナルブラウザーOS · 初期版。GitHub Pagesで動作するWebアプリです。</p><button class="secondary-button" id="resetSettings">外観を初期化</button></div>';
      setupSettings(content);
      return;
    }

    if (id === "app-center") {
      content.innerHTML = '<div class="app-hero"><p class="eyebrow">自分好みにカスタマイズ</p><h2>お気に入りのアプリを一か所に。</h2><p>Webサイトや自分で公開したWebアプリを追加できます。追加したアプリはランチャーに表示され、専用のウィンドウで開きます。</p></div><form class="custom-app-form" id="customAppForm"><label><span class="field-label">アプリ名</span><input class="text-field" name="name" maxlength="28" placeholder="例：自分のダッシュボード" required></label><label><span class="field-label">アイコン（絵文字・記号）</span><input class="text-field" name="icon" maxlength="4" placeholder="↗" value="↗"></label><label class="full"><span class="field-label">Webアドレス（https://…）</span><input class="text-field" name="url" type="url" placeholder="https://example.com" required></label><div class="full"><button class="primary-button" type="submit">＋ デスクトップに追加</button></div></form><div class="custom-app-list" id="customAppList"></div>';
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
    if (!tokens || tokens.join("") !== clean) throw new Error("計算式が正しくありません");
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
        if ((operator === "/" || operator === "%") && right === 0) throw new Error("0で割ることはできません");
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
        if (tokens[index++] !== ")") throw new Error("閉じ括弧がありません");
        return value;
      }
      if (!token || !/^\d*\.?\d+$/.test(token)) throw new Error("数値が正しくありません");
      return Number(token);
    }
    const result = expression();
    if (index !== tokens.length || !Number.isFinite(result)) throw new Error("計算結果が正しくありません");
    return result;
  }


  function setupBrowser(root) {
    const form = $("#browserForm", root);
    const address = $("#browserAddress", root);
    const frame = $("#browserFrame", root);
    const start = $("#browserStart", root);
    const notice = $("#browserNotice", root);
    const back = $('[data-browser-action="back"]', root);
    const forward = $('[data-browser-action="forward"]', root);
    const external = $('[data-browser-action="external"]', root);
    let history = [];
    let historyIndex = -1;
    let currentUrl = "";

    function updateNavigation() {
      back.disabled = historyIndex <= 0;
      forward.disabled = historyIndex < 0 || historyIndex >= history.length - 1;
      external.disabled = !currentUrl;
    }

    function showStart(message) {
      frame.hidden = true;
      start.hidden = false;
      currentUrl = "";
      notice.textContent = message || "一部のWebサイトは安全上の理由でこの画面内に表示できません。その場合は右上の「別タブで開く」を使ってください。";
      updateNavigation();
    }

    function openExternal(url) {
      const opened = window.open(url, "_blank", "noopener,noreferrer");
      if (!opened) {
        showToast("新しいタブが開けませんでした。ブラウザーのポップアップ設定を確認してください。");
        return;
      }
      showToast("Webサイトを別タブで開きました。");
    }

    function normalizeInput(value) {
      const input = value.trim();
      if (!input) return null;
      if (/\s/.test(input) || (!input.includes(".") && !/^https?:\/\//i.test(input))) {
        return { search: "https://www.google.com/search?q=" + encodeURIComponent(input) };
      }
      let candidate = input;
      if (!/^https?:\/\//i.test(candidate)) candidate = "https://" + candidate;
      try {
        const url = new URL(candidate);
        if (url.protocol !== "http:" && url.protocol !== "https:") return null;
        return { url: url.href };
      } catch (_) {
        return null;
      }
    }

    function navigate(url, addHistory) {
      try {
        const parsed = new URL(url);
        if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
          showToast("HTTPまたはHTTPSのURLを入力してください。");
          return;
        }
        currentUrl = parsed.href;
        address.value = currentUrl;
        if (addHistory !== false) {
          history = history.slice(0, historyIndex + 1);
          history.push(currentUrl);
          historyIndex = history.length - 1;
        }
        start.hidden = true;
        frame.hidden = false;
        frame.src = currentUrl;
        notice.textContent = "表示先：" + parsed.hostname + " ／ サイト側の制限で表示されない場合は「別タブで開く」を使ってください。";
        updateNavigation();
      } catch (_) {
        showToast("URLを確認してください。");
      }
    }

    form.addEventListener("submit", (event) => {
      event.preventDefault();
      const result = normalizeInput(address.value);
      if (!result) {
        showToast("URLまたは検索語句を入力してください。");
        return;
      }
      if (result.search) {
        openExternal(result.search);
        notice.textContent = "Google検索を別タブで開きました。URLを入力すると、この画面内で表示を試みます。";
        return;
      }
      navigate(result.url, true);
    });

    root.querySelectorAll("[data-quick]").forEach((button) => {
      button.addEventListener("click", () => openExternal(button.dataset.quick));
    });

    root.querySelectorAll("[data-browser-action]").forEach((button) => {
      button.addEventListener("click", () => {
        const action = button.dataset.browserAction;
        if (action === "back" && historyIndex > 0) {
          historyIndex -= 1;
          navigate(history[historyIndex], false);
        } else if (action === "forward" && historyIndex < history.length - 1) {
          historyIndex += 1;
          navigate(history[historyIndex], false);
        } else if (action === "reload" && currentUrl) {
          frame.src = currentUrl;
        } else if (action === "external" && currentUrl) {
          openExternal(currentUrl);
        }
      });
    });

    frame.addEventListener("load", () => {
      if (!currentUrl || frame.hidden) return;
      notice.textContent = "ページを読み込みました。内容が表示されない場合は、サイト側が埋め込みを禁止している可能性があります。「別タブで開く」を試してください。";
    });

    updateNavigation();
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
        } catch (_) { value.textContent = "エラー"; justEvaluated = true; }
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
      if (!file || !file.type.startsWith("image/")) { showToast("画像ファイルを選択してください。"); return; }
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
      showToast("外観を初期状態に戻しました。");
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
      catch (_) { showToast("正しいWebアドレスを入力してください。"); return; }
      if (!["https:", "http:"].includes(url.protocol)) { showToast("Webアドレスを入力してください。"); return; }
      if (!name) return;
      const app = { id: "web-" + Date.now().toString(36), name, icon, url: url.href };
      customApps.push(app);
      writeStorage(STORAGE.customApps, customApps);
      renderCustomAppList(list);
      renderLauncher(launcherSearch.value);
      form.reset();
      form.elements.icon.value = "↗";
      showToast(name + "をランチャーに追加しました。");
    });
  }

  function renderCustomAppList(list) {
    list.replaceChildren();
    if (!customApps.length) {
      const empty = document.createElement("div");
      empty.className = "empty-state";
      empty.textContent = "追加したアプリはまだありません。上のフォームからWebサイトを登録してください。";
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
      remove.textContent = "削除";
      remove.addEventListener("click", () => {
        customApps = customApps.filter((item) => item.id !== app.id);
        writeStorage(STORAGE.customApps, customApps);
        renderCustomAppList(list);
        renderLauncher(launcherSearch.value);
        const win = windows.get(app.id);
        if (win) { win.remove(); windows.delete(app.id); updateDockState(); }
        showToast("アプリを削除しました。");
      });
      row.append(icon, details, remove);
      list.append(row);
    });
  }

  function updateClock() {
    const now = new Date();
    $("#clock").textContent = now.toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" });
    $("#desktopDate").textContent = now.toLocaleDateString("ja-JP", { year: "numeric", month: "long", day: "numeric", weekday: "long" });
  }

  function initialize() {
    const savedTheme = readStorage(STORAGE.theme, "dark");
    const saved壁紙 = readStorage(STORAGE.wallpaper, "aurora");
    document.body.dataset.theme = savedTheme === "light" ? "light" : "dark";
    document.body.dataset.wallpaper = ["aurora", "sunset", "ocean", "graphite"].includes(saved壁紙) ? saved壁紙 : "aurora";

    renderDesktopIcons();
    renderDock();
    renderLauncher("");
    updateClock();
    setInterval(updateClock, 1000);

    $("#launcherButton").addEventListener("click", toggleLauncher);
    $("#closeLauncher").addEventListener("click", () => { launcherPanel.hidden = true; });
    launcherSearch.addEventListener("input", () => renderLauncher(launcherSearch.value));
    document.addEventListener("keydown", (event) => {
      if ((event.ctrlKey || event.metaKey) && event.code === "Space") {
        event.preventDefault();
        toggleLauncher();
      }
      if (event.key === "Escape" && !launcherPanel.hidden) launcherPanel.hidden = true;
    });
    document.addEventListener("pointerdown", (event) => {
      if (!launcherPanel.hidden && !launcherPanel.contains(event.target) && !$("#launcherButton").contains(event.target)) {
        if (!event.target.closest(".dock")) launcherPanel.hidden = true;
      }
    });
    window.addEventListener("resize", () => {
      windows.forEach((win) => {
        if (win.classList.contains("maximized")) return;
        const maxLeft = Math.max(0, desktopArea.clientWidth - win.offsetWidth);
        const maxTop = Math.max(0, desktopArea.clientHeight - 60);
        win.style.left = Math.min(parseFloat(win.style.left) || 0, maxLeft) + "px";
        win.style.top = Math.min(parseFloat(win.style.top) || 0, maxTop) + "px";
      });
    });

    setTimeout(() => $("#bootScreen").classList.add("done"), 850);
    openApp("home");

    if ("serviceWorker" in navigator && location.protocol.startsWith("http")) {
      navigator.serviceWorker.register("./sw.js").catch(() => {
        // The desktop remains fully usable when offline caching is unavailable.
      });
    }
  }

  initialize();
})();
