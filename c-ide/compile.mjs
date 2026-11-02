// C言語のブラウザー内コンパイル。LLVM 18 / wasi-libc 24 のWebAssembly版を使用します。
// ツールチェーン本体は c-ide/toolchain/ に配置し、コンパイル時の外部API呼び出しは行いません。
const RESOURCE_VERSION = "18";

function installSysroot(fs, archive) {
  const bytes = new Uint8Array(archive);
  const decoder = new TextDecoder("utf-8");
  function str(offset, length) {
    const chunk = bytes.subarray(offset, offset + length);
    const zero = chunk.indexOf(0);
    return decoder.decode(zero >= 0 ? chunk.subarray(0, zero) : chunk);
  }
  for (let offset = 0; offset + 512 <= bytes.length;) {
    const name = str(offset, 100);
    if (!name) break;
    const prefix = str(offset + 345, 155);
    const filename = (prefix ? prefix + "/" : "") + name;
    const size = parseInt(str(offset + 124, 12).trim() || "0", 8);
    if (!Number.isFinite(size) || size < 0 || offset + 512 + size > bytes.length) throw new Error("sysrootが破損しています");
    const kind = str(offset + 156, 1);
    if (filename.startsWith("sysroot/")) {
      const path = "/sysroot/" + filename.slice("sysroot/".length);
      if (path !== "/sysroot/") {
        if (kind === "5") {
          fs.mkdirTree(path);
        } else if (kind === "" || kind === "0") {
          fs.mkdirTree(path.slice(0, path.lastIndexOf("/")));
          fs.writeFile(path, bytes.subarray(offset + 512, offset + 512 + size));
        }
      }
    }
    offset += 512 + Math.ceil(size / 512) * 512;
  }
}

async function executeTool(factory, args, files, output, sysroot) {
  let diagnostics = "";
  const module = await factory({
    print: value => { diagnostics += String(value) + "\n"; },
    printErr: value => { diagnostics += String(value) + "\n"; },
    noInitialRun: true
  });
  installSysroot(module.FS, sysroot);
  module.FS.mkdirTree("/work");
  for (const [file, data] of Object.entries(files)) {
    module.FS.writeFile("/work/" + file, typeof data === "string" ? new TextEncoder().encode(data) : data);
  }
  let status = 0;
  try {
    const result = module.callMain(args);
    if (typeof result === "number") status = result;
  } catch (error) {
    if (typeof error === "number") status = error;
    else if (error && typeof error.status === "number") status = error.status;
    else throw error;
  }
  const resultFile = status === 0 ? module.FS.readFile("/work/" + output) : null;
  return { status, diagnostics, file: resultFile };
}

export async function createCompiler(base, report) {
  const url = new URL(base, import.meta.url);
  report("コンパイラを読み込んでいます（初回は約70MBのダウンロードがあります）…");
  const [clangModule, linkerModule, archiveResponse] = await Promise.all([
    import(new URL("clang.mjs", url).href),
    import(new URL("lld.mjs", url).href),
    fetch(new URL("sysroot.tar", url).href)
  ]);
  if (!archiveResponse.ok) throw new Error("標準ライブラリを取得できません (HTTP " + archiveResponse.status + ")");
  const sysroot = await archiveResponse.arrayBuffer();
  return async function compile(source) {
    const cflags = [
      "--target=wasm32-wasi",
      "--sysroot=/sysroot",
      "-resource-dir=/sysroot/lib/clang/" + RESOURCE_VERSION,
      "-std=c11", "-Wall", "-Wextra", "-O1",
      "-I/work",
      "-c", "/work/main.c", "-o", "/work/main.o"
    ];
    report("C言語をコンパイルしています…");
    const compiled = await executeTool(clangModule.default, cflags, {"main.c": source}, "main.o", sysroot);
    if (compiled.status !== 0) return {ok:false,log:compiled.diagnostics};
    const linkerFlags = [
      "-flavor", "wasm",
      "/sysroot/lib/wasm32-wasi/crt1.o",
      "/work/main.o",
      "-L/sysroot/lib/wasm32-wasi",
      "-lc", "-lm",
      "/sysroot/lib/clang/" + RESOURCE_VERSION + "/lib/wasi/libclang_rt.builtins-wasm32.a",
      "-o", "/work/main.wasm"
    ];
    report("WebAssemblyにリンクしています…");
    const linked = await executeTool(linkerModule.default, linkerFlags, {"main.o":compiled.file}, "main.wasm", sysroot);
    return {ok:linked.status===0,log:compiled.diagnostics + linked.diagnostics, wasm: linked.file};
  };
}
