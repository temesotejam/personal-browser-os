"use strict";

// CPython runs inside this dedicated Worker, never on the desktop UI thread.
// Runtime files are served from our own GitHub Pages origin.
const PYODIDE_BASE = new URL("./vendor/", self.location.href).href;
let python = null;
let initializing = null;
let running = false;

const graphHelpers = `
import json
import sys
import types

_os_plot = types.ModuleType("os_plot")
def _emit(kind, **kwargs):
    print("__PYOS_PLOT__" + json.dumps({"kind":kind, **kwargs}, ensure_ascii=False))
def plot(x, y, color=None):
    _emit("line", x=list(x), y=list(y), color=color)
def scatter(x, y, color=None):
    _emit("scatter", x=list(x), y=list(y), color=color)
def bar(x, y, color=None):
    _emit("bar", x=list(x), y=list(y), color=color)
def title(value):
    _emit("title", text=str(value))
def xlabel(value):
    _emit("xlabel", text=str(value))
def ylabel(value):
    _emit("ylabel", text=str(value))
def grid(on=True):
    _emit("grid", enabled=bool(on))
def clear():
    _emit("clear")
_os_plot.plot=plot
_os_plot.scatter=scatter
_os_plot.bar=bar
_os_plot.title=title
_os_plot.xlabel=xlabel
_os_plot.ylabel=ylabel
_os_plot.grid=grid
_os_plot.clear=clear
sys.modules["os_plot"]=_os_plot
`;

function emit(type, payload = {}) {
  self.postMessage({type, ...payload});
}

async function ensureRuntime() {
  if (python) return python;
  if (!initializing) {
    initializing = (async () => {
      emit("status", {message:"Python実行環境を読み込んでいます（初回はダウンロードが必要です）…"});
      const {loadPyodide} = await import(new URL("pyodide.mjs", PYODIDE_BASE).href);
      const engine = await loadPyodide({indexURL:PYODIDE_BASE});
      engine.runPython(graphHelpers);
      python = engine;
      emit("ready", {version:engine.runPython("import sys; sys.version.split()[0]")});
      return engine;
    })().catch(error => {
      initializing = null;
      python = null;
      throw error;
    });
  }
  return initializing;
}

self.addEventListener("message", async event => {
  const data = event.data || {};
  if (data.type !== "run" || running) return;
  running = true;
  const id = data.id;
  try {
    const engine = await ensureRuntime();
    const lines = String(data.stdin || "").replace(/\r\n/g,"\n").split("\n");
    let lineIndex = 0;
    engine.setStdout({batched: text => emit("stdout",{id,text:String(text)})});
    engine.setStderr({batched: text => emit("stderr",{id,text:String(text)})});
    engine.setStdin({stdin: () => lineIndex < lines.length ? lines[lineIndex++] : null});
    emit("status",{id,message:"Pythonプログラムを実行しています…"});
    // Each run uses a fresh globals dictionary, but the Python runtime stays warm.
    const globals = engine.toPy({__name__:"__main__",__package__:null});
    try {
      await engine.runPythonAsync(String(data.source || ""),{globals,filename:"main.py"});
    } finally {
      globals.destroy();
    }
    emit("done",{id});
  } catch(error) {
    emit("error",{id,message:String(error?.message || error)});
  } finally {
    running = false;
  }
});
