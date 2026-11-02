import {createCompiler} from "./compile.mjs";
let compiler = null;
let initializing = null;
let isCompiling = false;
const report = message => self.postMessage({type:"status",message});
self.onmessage = async event => {
  const data = event.data || {};
  if (data.type !== "compile" || isCompiling) return;
  isCompiling = true;
  try {
    if (!compiler) {
      if (!initializing) initializing = createCompiler("./toolchain/",report);
      compiler = await initializing;
    }
    const result = await compiler(String(data.source || ""));
    if (result.ok && result.wasm) {
      self.postMessage({type:"result",ok:true,log:result.log,bytes:result.wasm},[result.wasm.buffer]);
    } else {
      self.postMessage({type:"result",ok:false,log:result.log || "コンパイルに失敗しました"});
    }
  } catch (error) {
    initializing = null;
    compiler = null;
    self.postMessage({type:"fatal",message:String(error?.message || error)});
  } finally {
    isCompiling = false;
  }
};
