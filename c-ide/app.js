(() => {
  "use strict";
  const $ = id => document.getElementById(id);
  const code = $("code"), output = $("output"), status = $("status");
  const gutter = $("gutter"), examplesSelect = $("examples");
  const runButton = $("runBtn"), compileButton = $("compileBtn"), stopButton = $("stopBtn");
  const canvas = $("plot"), ctx = canvas.getContext("2d");
  const STORAGE_KEY = "personal-browser-os-c-ide-source-v1";
  const INPUT_KEY = "personal-browser-os-c-ide-stdin-v1";
  const EXAMPLES = {
  "hello": "#include <stdio.h>\n\nint main(void) {\n    printf(\"Hello World!\\n\");\n    return 0;\n}\n",
  "calculate": "#include <stdio.h>\n#include <math.h>\n\nint main(void) {\n    double radius = 5.0;\n    double area = 3.141592653589793 * radius * radius;\n    printf(\"半径: %.1f\\n面積: %.3f\\n\", radius, area);\n    printf(\"sqrt(2) = %.6f\\n\", sqrt(2.0));\n    return 0;\n}\n",
  "input": "#include <stdio.h>\n\nint main(void) {\n    int a, b;\n    printf(\"2つの整数を入力してください。\\n\");\n    if (scanf(\"%d %d\", &a, &b) != 2) {\n        puts(\"入力が必要です。右上の標準入力に例: 12 34\");\n        return 1;\n    }\n    printf(\"%d + %d = %d\\n\", a, b, a + b);\n    return 0;\n}\n",
  "draw": "#include <stdio.h>\n#include <math.h>\n\n/* パーソナルOS独自の描画命令。printfで送信します。 */\nint main(void) {\n    puts(\"@PLOT CLEAR 640 360\");\n    puts(\"@PLOT LINE 40 180 600 180 #667085\");\n    puts(\"@PLOT LINE 40 20 40 340 #667085\");\n    for (int x = 40; x < 600; x += 4) {\n        double a = (x - 40.0) / 560.0 * 6.2831853;\n        double b = (x + 4 - 40.0) / 560.0 * 6.2831853;\n        int y1 = 180 - (int)(110 * sin(a));\n        int y2 = 180 - (int)(110 * sin(b));\n        printf(\"@PLOT LINE %d %d %d %d #7367ff\\n\", x, y1, x + 4, y2);\n    }\n    puts(\"@PLOT CIRCLE 320 180 6 #fb7185\");\n    puts(\"sin波を描画しました。\");\n    return 0;\n}\n"
};
  let filename = "main.c";
  let compilerWorker = null, compileJob = null, runWorker = null, stopTimer = null;
  let busy = false, compiled = null, compilationStamp = "";
  let sourceVersion = 0, buildingVersion = 0, lineBuffer = "";
  let stdoutDecoder = new TextDecoder(), stderrDecoder = new TextDecoder();

  function message(text) { status.textContent = text; }
  function print(text, kind) {
    if (!text || output.textContent.length > 250000) return;
    const span = document.createElement("span");
    span.className = kind || "";
    span.textContent = text;
    output.appendChild(span);
    output.scrollTop = output.scrollHeight;
  }

  function updateGutter() {
    const count = Math.min(9999,code.value.split("\n").length);
    gutter.textContent = Array.from({length:count},(_,i)=>String(i+1)).join("\n");
    gutter.scrollTop = code.scrollTop;
  }

  function setBusy(value) {
    busy = value;
    runButton.disabled = value;
    compileButton.disabled = value;
    stopButton.disabled = !value;
    examplesSelect.disabled = value;
  }
  function saveLocal() {
    try {
      localStorage.setItem(STORAGE_KEY,code.value);
    } catch(error) {
      message("ブラウザー内の保存領域を利用できません。ファイル保存をご利用ください。");
    }
  }
  function markChanged() {
    sourceVersion++;
    compiled = null;
    compilationStamp = "";
    updateGutter();
    saveLocal();
  }
  function setSource(text) {
    code.value = text;
    markChanged();
  }

  function clearDrawing() {
    canvas.width = 640;
    canvas.height = 360;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0,0,canvas.width,canvas.height);
  }
  const safeColor = value => /^#[0-9a-fA-F]{6}$/.test(value || "") ? value : "#6757db";
  function drawCommand(command) {
    const parts = command.trim().split(/\s+/);
    if(parts[0] !== "@PLOT") return false;
    const kind = (parts[1] || "").toUpperCase();
    const vals = parts.slice(2,6).map(Number);
    if(kind === "CLEAR") {
      const w = Number(parts[2]), h = Number(parts[3]);
      canvas.width = Number.isFinite(w) ? Math.min(1200,Math.max(20,w)) : 640;
      canvas.height = Number.isFinite(h) ? Math.min(900,Math.max(20,h)) : 360;
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0,0,canvas.width,canvas.height);
      return true;
    }
    if(vals.some((v)=>!Number.isFinite(v))) return true;
    if(kind === "LINE") {
      ctx.strokeStyle=safeColor(parts[6]);ctx.lineWidth=2;
      ctx.beginPath();ctx.moveTo(vals[0],vals[1]);ctx.lineTo(vals[2],vals[3]);ctx.stroke();
    } else if(kind === "RECT") {
      ctx.fillStyle=safeColor(parts[6]);
      ctx.fillRect(vals[0],vals[1],vals[2],vals[3]);
    } else if(kind === "CIRCLE") {
      ctx.fillStyle=safeColor(parts[5]);ctx.beginPath();
      ctx.arc(vals[0],vals[1],Math.max(0,vals[2]),0,Math.PI*2);ctx.fill();
    }
    return true;
  }
  function writeOutputText(text) {
    lineBuffer += text;
    if(lineBuffer.length > 150000) lineBuffer = lineBuffer.slice(-150000);
    const lines = lineBuffer.split("\n");
    lineBuffer = lines.pop() || "";
    for(const line of lines) {
      if (!drawCommand(line)) print(line+"\n");
    }
  }
  function flushOutput() {
    if(lineBuffer) {
      if(!drawCommand(lineBuffer)) print(lineBuffer);
      lineBuffer = "";
    }
  }

  function terminateCompiler() {
    if(compilerWorker) compilerWorker.terminate();
    compilerWorker = null;
    if(compileJob) {
      const job = compileJob;
      compileJob = null;
      job.reject(new Error("コンパイルを停止しました"));
    }
  }
  function terminateRuntime() {
    clearTimeout(stopTimer);
    stopTimer = null;
    if(runWorker) runWorker.terminate();
    runWorker = null;
  }
  function stop() {
    terminateRuntime();
    terminateCompiler();
    setBusy(false);
    message("処理を停止しました。");
    print("\n[停止]\n","console-error");
  }

  function compileSource(source) {
    return new Promise((resolve,reject)=>{
      if(!compilerWorker) {
        compilerWorker = new Worker("./compiler-worker.mjs",{type:"module"});
        compilerWorker.onerror = error => {
          const failure = new Error("コンパイラの起動に失敗しました: "+(error.message || "ファイルを確認してください"));
          if(compileJob){const job=compileJob;compileJob=null;job.reject(failure);}
          terminateCompiler();
        };
        compilerWorker.onmessage = event => {
          const data = event.data || {};
          if(data.type === "status"){message(data.message || "コンパイル中…");return;}
          if(!compileJob) return;
          const job=compileJob;
          compileJob=null;
          if(data.type === "result") job.resolve(data);
          else if(data.type === "fatal") {
            compilerWorker?.terminate();
            compilerWorker=null;
            job.reject(new Error(data.message || "コンパイラの起動に失敗しました"));
          }
        };
      }
      compileJob={resolve,reject};
      compilerWorker.postMessage({type:"compile",source});
    });
  }

  function runCompiled(wasm, stdin) {
    return new Promise((resolve,reject)=>{
      terminateRuntime();
      runWorker = new Worker("./runtime-worker.js");
      const current = runWorker;
      stdoutDecoder = new TextDecoder();
      stderrDecoder = new TextDecoder();
      lineBuffer = "";
      let closed = false;
      function finish() {
        if(closed) return false;
        closed = true;
        clearTimeout(stopTimer);
        stopTimer = null;
        try { current.terminate(); } catch(error) {}
        if(runWorker === current) runWorker = null;
        writeOutputText(stdoutDecoder.decode());
        print(stderrDecoder.decode(),"console-error");
        flushOutput();
        return true;
      }
      stopTimer = setTimeout(()=>{
        if(!finish()) return;
        reject(new Error("実行時間が10秒を超えたため停止しました（無限ループの可能性があります）。"));
      },10000);
      current.onerror = event => {
        if(finish()) reject(new Error(event.message || "実行用Workerが停止しました。"));
      };
      current.onmessage = event => {
        const data = event.data || {};
        if(data.type === "stdout") {
          writeOutputText(stdoutDecoder.decode(new Uint8Array(data.bytes),{stream:true}));
        }else if(data.type === "stderr") {
          print(stderrDecoder.decode(new Uint8Array(data.bytes),{stream:true}),"console-error");
        }else if(data.type === "exit") {
          if(finish()) resolve(data.code);
        }else if(data.type === "error") {
          if(finish()) reject(new Error(data.message || "実行エラー"));
        }
      };
      current.postMessage({type:"run",bytes:wasm,stdin});
    });
  }

  async function buildAndRun(execute) {
    if(busy) return;
    if(!code.value.trim()){message("コードを入力してください。");return;}
    setBusy(true);
    output.replaceChildren();
    clearDrawing();
    const original=code.value, version=sourceVersion;
    try {
      if(!compiled || compilationStamp !== original) {
        message("C言語コンパイラを準備しています…");
        const t0=performance.now();
        const result=await compileSource(original);
        if(!result.ok) {
          print(result.log || "コンパイルに失敗しました。","console-error");
          message("コンパイルエラー");
          return;
        }
        if(result.log) print(result.log,"console-muted");
        if(sourceVersion !== version) {
          message("コンパイル中にコードが変更されました。もう一度実行してください。");
          return;
        }
        compiled = result.bytes;
        compilationStamp = original;
        print("[ビルド成功 "+Math.round(performance.now()-t0)+" ms]\n","console-success");
      }else{
        print("[前回のビルド結果を利用します]\n","console-muted");
      }
      if(!execute){message("ビルド成功。");return;}
      message("プログラムを実行しています…");
      const t1=performance.now();
      const codeNumber=await runCompiled(compiled,$("stdin").value);
      print("\n[終了コード "+codeNumber+" / 実行時間 "+Math.round(performance.now()-t1)+" ms]\n",
        codeNumber===0?"console-success":"console-error");
      message(codeNumber===0?"実行が完了しました。":"終了コード "+codeNumber+" で終了しました。");
    }catch(error){
      print("\n"+String(error?.message || error)+"\n","console-error");
      message("処理を完了できませんでした。");
    }finally{
      setBusy(false);
    }
  }
  $("compileBtn").addEventListener("click",()=>buildAndRun(false));
  $("runBtn").addEventListener("click",()=>buildAndRun(true));
  $("stopBtn").addEventListener("click",stop);
  $("clearOutput").addEventListener("click",()=>output.replaceChildren());

  examplesSelect.addEventListener("change",()=>{
    if(code.value !== EXAMPLES[examplesSelect.value] && code.value.trim() && !confirm("編集中のコードをサンプルで置き換えますか？")) return;
    setSource(EXAMPLES[examplesSelect.value]);
    filename="main.c";
    $("filename").textContent=filename;
    message("サンプルを読み込みました。");
  });
  $("newFile").addEventListener("click",()=>{
    if(code.value.trim() && !confirm("新しいファイルを作成しますか？現在の編集内容は上書きされます。"))return;
    setSource("#include <stdio.h>\n\nint main(void) {\n    return 0;\n}\n");
    filename="main.c";$("filename").textContent=filename;
  });
  $("openFile").addEventListener("click",()=>$("fileInput").click());
  $("fileInput").addEventListener("change",async event=>{
    const file=event.target.files?.[0];
    if(!file) return;
    if(file.size > 1024*1024){message("1MBより大きいCファイルは読み込めません。");return;}
    const text=await file.text();
    setSource(text);
    filename=file.name.endsWith(".c") ? file.name : "main.c";
    $("filename").textContent=filename;
    message("ファイルを読み込みました。");
    event.target.value="";
  });
  $("saveFile").addEventListener("click",()=>{
    const blob=new Blob([code.value],{type:"text/plain;charset=utf-8"});
    const link=document.createElement("a");
    link.href=URL.createObjectURL(blob);
    link.download=filename;
    link.click();
    setTimeout(()=>URL.revokeObjectURL(link.href),1000);
    message(filename+" を保存しました。");
  });
  $("saveImage").addEventListener("click",()=>{
    const link=document.createElement("a");
    link.download="c-drawing.png";
    link.href=canvas.toDataURL("image/png");
    link.click();
  });
  $("stdin").addEventListener("input",()=>{
    try{localStorage.setItem(INPUT_KEY,$("stdin").value);}catch(error){}
  });
  code.addEventListener("input",markChanged);
  code.addEventListener("scroll",()=>{gutter.scrollTop=code.scrollTop;});
  code.addEventListener("keydown",event=>{
    if(event.key==="Tab"){
      event.preventDefault();
      code.setRangeText("    ",code.selectionStart,code.selectionEnd,"end");
      markChanged();
    }
  });
  document.addEventListener("keydown",event=>{
    if((event.ctrlKey || event.metaKey) && event.key==="Enter"){
      event.preventDefault();buildAndRun(true);
    }else if((event.ctrlKey || event.metaKey) && event.key.toLowerCase()==="s"){
      event.preventDefault();$("saveFile").click();
    }
  });

  try{
    code.value=localStorage.getItem(STORAGE_KEY) || EXAMPLES.hello;
    $("stdin").value=localStorage.getItem(INPUT_KEY) || "";
  }catch(error){code.value=EXAMPLES.hello;}
  updateGutter();
  clearDrawing();
})();
