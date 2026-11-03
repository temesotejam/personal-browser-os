(() => {
  "use strict";
  const $ = id => document.getElementById(id);
  const source = $("code"), gutter = $("gutter"), output = $("console");
  const buttonRun = $("runBtn"), buttonStop = $("stopBtn");
  const canvas = $("canvas"), ctx = canvas.getContext("2d");
  const selects = $("examples");
  const SOURCE_KEY = "personal-os-python-code-v1";
  const INPUT_KEY = "personal-os-python-stdin-v1";
  const COLORS = ["#7367ff","#f472b6","#0891b2","#16a34a","#eab308"];
  const EXAMPLES = {
  "hello": "print(\"Hello World!\")\nprint(\"PythonがパーソナルOS内で動いています。\")\n",
  "calculate": "import math\n\nradius = 5.0\narea = math.pi * radius ** 2\nprint(f\"半径: {radius}\")\nprint(f\"円の面積: {area:.3f}\")\nprint(f\"√2 = {math.sqrt(2):.6f}\")\n",
  "input": "name = input(\"名前を入力してください: \")\na = int(input(\"整数A: \"))\nb = int(input(\"整数B: \"))\nprint(f\"{name}さん、{a} + {b} = {a+b} です。\")\n",
  "graph": "import math\nfrom os_plot import plot, scatter, title, xlabel, ylabel, grid\n\nxs = [i / 20 for i in range(126)]\nys = [math.sin(x) for x in xs]\nplot(xs, ys, \"#6c63ff\")\nscatter([0, math.pi / 2, math.pi], [0, 1, 0], \"#fb7185\")\ntitle(\"sin(x) の波形\")\nxlabel(\"x [rad]\")\nylabel(\"sin(x)\")\ngrid(True)\nprint(\"波形を描画しました。\")\n"
};
  let worker = null, workerJob = null, busy = false, jobId = 0;
  let bootTimer = null, runTimer = null, filename = "main.py";
  let graphSeries = [], graphOptions = {title:"",xlabel:"",ylabel:"",grid:true};

  function setStatus(message) { $("status").textContent = message; }
  function append(text, cls = "") {
    if (!text || output.textContent.length > 250000) return;
    const span = document.createElement("span");
    span.className = cls;
    span.textContent = text;
    output.append(span);
    output.scrollTop = output.scrollHeight;
  }
  function setBusy(value) {
    busy = value; buttonRun.disabled = value; buttonStop.disabled = !value; selects.disabled = value;
  }
  function updateGutter() {
    const count = Math.min(9999, source.value.split("\n").length);
    gutter.textContent = Array.from({length:count},(_,i)=>i+1).join("\n");
    gutter.scrollTop = source.scrollTop;
  }
  function saveLocal() {
    try { localStorage.setItem(SOURCE_KEY,source.value); }
    catch(_) { setStatus("ブラウザーの自動保存ができません。ファイル保存をご利用ください。"); }
  }
  function setCode(text) {
    source.value = text; updateGutter(); saveLocal();
  }
  function resetGraph() {
    graphSeries = [];
    graphOptions = {title:"",xlabel:"",ylabel:"",grid:true};
    drawGraph();
  }
  function safeColor(value,index) {
    return typeof value==="string" && /^#[0-9a-fA-F]{6}$/.test(value) ? value : COLORS[index%COLORS.length];
  }
  function handlePlotMessage(item) {
    if (!item || typeof item.kind !== "string") return;
    if (item.kind === "clear") return resetGraph();
    if (["title","xlabel","ylabel"].includes(item.kind)) {
      graphOptions[item.kind] = String(item.text||"").slice(0,100);
    } else if (item.kind === "grid") {
      graphOptions.grid = Boolean(item.enabled);
    } else if (["line","scatter","bar"].includes(item.kind)) {
      if (!Array.isArray(item.x) || !Array.isArray(item.y)) return;
      const x = [], y = [];
      for (let i = 0; i < Math.min(item.x.length,item.y.length,3000); i++) {
        const xv = Number(item.x[i]), yv = Number(item.y[i]);
        if(Number.isFinite(xv) && Number.isFinite(yv)) {x.push(xv);y.push(yv);}
      }
      if(x.length) graphSeries.push({kind:item.kind,x,y,color:safeColor(item.color,graphSeries.length)});
      if(graphSeries.length>30) graphSeries.shift();
    }
    drawGraph();
  }
  function drawGraph() {
    const w=canvas.width,h=canvas.height;
    ctx.fillStyle="#fff";ctx.fillRect(0,0,w,h);
    const left=72,right=w-26,top=44,bottom=h-56;
    ctx.font="13px system-ui";ctx.textAlign="center";
    ctx.fillStyle="#263249";ctx.fillText(graphOptions.title || "Python 描画キャンバス",w/2,24);
    ctx.font="11px system-ui";
    const allX=graphSeries.flatMap(s=>s.x),allY=graphSeries.flatMap(s=>s.y);
    let xmin=allX.length?Math.min(...allX):0,xmax=allX.length?Math.max(...allX):10;
    let ymin=allY.length?Math.min(...allY):0,ymax=allY.length?Math.max(...allY):10;
    if(xmin===xmax){xmin-=1;xmax+=1;}
    if(ymin===ymax){ymin-=1;ymax+=1;}
    const dx=(xmax-xmin)*.05,dy=(ymax-ymin)*.1;
    xmin-=dx;xmax+=dx;ymin-=dy;ymax+=dy;
    const mapX=v=>left+(v-xmin)/(xmax-xmin)*(right-left);
    const mapY=v=>bottom-(v-ymin)/(ymax-ymin)*(bottom-top);
    ctx.strokeStyle="#aab5c4";ctx.lineWidth=1;ctx.beginPath();
    ctx.moveTo(left,top);ctx.lineTo(left,bottom);ctx.lineTo(right,bottom);ctx.stroke();
    for(let i=0;i<=5;i++){
      const x=left+(right-left)*i/5,y=bottom-(bottom-top)*i/5;
      if(graphOptions.grid){ctx.strokeStyle="#e6e9f0";ctx.beginPath();ctx.moveTo(x,top);ctx.lineTo(x,bottom);ctx.moveTo(left,y);ctx.lineTo(right,y);ctx.stroke();}
      ctx.fillStyle="#64748b";ctx.textAlign="center";ctx.fillText((xmin+(xmax-xmin)*i/5).toFixed(1),x,bottom+19);
      ctx.textAlign="right";ctx.fillText((ymin+(ymax-ymin)*i/5).toFixed(1),left-8,y+4);
    }
    graphSeries.forEach(series=>{
      ctx.strokeStyle=series.color;ctx.fillStyle=series.color;ctx.lineWidth=2;
      if(series.kind==="line"){
        ctx.beginPath();series.x.forEach((v,i)=>{const x=mapX(v),y=mapY(series.y[i]);i?ctx.lineTo(x,y):ctx.moveTo(x,y);});ctx.stroke();
      }else if(series.kind==="scatter"){
        series.x.forEach((v,i)=>{ctx.beginPath();ctx.arc(mapX(v),mapY(series.y[i]),4,0,Math.PI*2);ctx.fill();});
      }else if(series.kind==="bar"){
        const width=Math.max(3,(right-left)/Math.max(2,series.x.length*1.4));
        series.x.forEach((v,i)=>{const x=mapX(v), y=mapY(series.y[i]),zero=mapY(0);ctx.fillRect(x-width/2,Math.min(y,zero),width,Math.abs(zero-y));});
      }
    });
    ctx.fillStyle="#344054";ctx.textAlign="center";ctx.font="12px system-ui";
    ctx.fillText(graphOptions.xlabel,right-(right-left)/2,h-10);
    if(graphOptions.ylabel){ctx.save();ctx.translate(16,top+(bottom-top)/2);ctx.rotate(-Math.PI/2);ctx.fillText(graphOptions.ylabel,0,0);ctx.restore();}
  }

  function finish(error=null) {
    clearTimeout(bootTimer); clearTimeout(runTimer);
    bootTimer=null;runTimer=null;
    if(error) {append("\n"+error+"\n","out-err");setStatus("実行エラー");}
    setBusy(false);workerJob=null;
  }
  function discardWorker() {
    if(worker){worker.terminate();worker=null;}
    jobId++;
  }
  function stop() {
    if(!busy) return;
    discardWorker();
    append("\n[実行を停止しました]\n","out-err");
    setStatus("停止しました。");
    finish();
  }
  function onWorkerMessage(message) {
    if(!workerJob) return;
    if(message.id!==undefined && message.id!==workerJob) return;
    if(message.type==="ready") {
      $("runtime").textContent="Python "+message.version+" / Pyodide";
      return;
    }
    if(message.type==="status") {
      setStatus(message.message);
      if(message.message?.includes("プログラムを実行")) {
        clearTimeout(bootTimer);
        if(!runTimer) runTimer=setTimeout(()=>{
          discardWorker();finish("実行が12秒を超えたため停止しました（無限ループの可能性があります）。");
        },12000);
      }
      return;
    }
    if(message.type==="stdout") {
      const text=String(message.text||"");
      if(text.startsWith("__PYOS_PLOT__")){
        try{handlePlotMessage(JSON.parse(text.slice("__PYOS_PLOT__".length)));}catch(e){append("[描画命令エラー] "+e.message+"\n","out-err");}
      }else{append(text+"\n");}
    }else if(message.type==="stderr") {
      append(String(message.text||"")+"\n","out-err");
    }else if(message.type==="done") {
      append("\n[正常終了 / 終了コード 0]\n","out-ok");
      setStatus("実行が完了しました。");finish();
    }else if(message.type==="error") {
      finish(message.message || "Python実行エラー");
    }
  }
  function ensureWorker() {
    if(worker)return worker;
    worker=new Worker("./worker.js",{type:"module"});
    worker.onmessage=e=>onWorkerMessage(e.data||{});
    worker.onerror=e=>{discardWorker();finish("Python実行環境の読み込みに失敗しました: "+e.message);};
    return worker;
  }
  function run() {
    if(busy)return;
    setBusy(true);output.replaceChildren();resetGraph();
    jobId++;
    workerJob=jobId;
    setStatus("Pythonを準備しています…");
    const code=source.value;
    bootTimer=setTimeout(()=>{
      discardWorker();finish("Pythonの初期化が90秒で完了しませんでした。通信やランタイムファイルを確認してください。");
    },90000);
    ensureWorker().postMessage({type:"run",id:workerJob,source:code,stdin:$("stdin").value});
  }
  $("runBtn").addEventListener("click",run);
  $("stopBtn").addEventListener("click",stop);
  $("clearConsole").addEventListener("click",()=>output.replaceChildren());
  $("saveGraph").addEventListener("click",()=>{
    const a=document.createElement("a");a.download="python-graph.png";a.href=canvas.toDataURL("image/png");a.click();
  });
  selects.addEventListener("change",()=>{
    if(source.value.trim() && !confirm("現在のコードをサンプルで置き換えますか？")){selects.value="";return;}
    setCode(EXAMPLES[selects.value]);filename="main.py";$("filename").textContent=filename;
  });
  $("newFile").addEventListener("click",()=>{
    if(source.value.trim() && !confirm("新規ファイルを作りますか？現在の内容は置き換わります。"))return;
    setCode('print("Hello World!")\n');filename="main.py";$("filename").textContent=filename;
  });
  $("openFile").addEventListener("click",()=>$("fileInput").click());
  $("fileInput").addEventListener("change",async e=>{
    const f=e.target.files?.[0];if(!f)return;
    if(f.size>1024*1024){setStatus("1MBを超えるファイルは読み込めません。");return;}
    setCode(await f.text());filename=f.name.endsWith(".py")?f.name:"main.py";$("filename").textContent=filename;
    e.target.value="";setStatus("ファイルを読み込みました。");
  });
  $("saveFile").addEventListener("click",()=>{
    const a=document.createElement("a"),url=URL.createObjectURL(new Blob([source.value],{type:"text/x-python;charset=utf-8"}));
    a.href=url;a.download=filename;a.click();setTimeout(()=>URL.revokeObjectURL(url),2000);
    setStatus("ファイルを保存しました。");
  });
  source.addEventListener("input",()=>{updateGutter();saveLocal();});
  source.addEventListener("scroll",()=>{gutter.scrollTop=source.scrollTop;});
  source.addEventListener("keydown",e=>{
    if(e.key==="Tab"){e.preventDefault();source.setRangeText("    ",source.selectionStart,source.selectionEnd,"end");source.dispatchEvent(new Event("input"));}
  });
  $("stdin").addEventListener("input",()=>{try{localStorage.setItem(INPUT_KEY,$("stdin").value);}catch(_){}});
  document.addEventListener("keydown",e=>{
    if((e.ctrlKey||e.metaKey)&&e.key==="Enter"){e.preventDefault();run();}
    else if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==="s"){e.preventDefault();$("saveFile").click();}
  });
  try{source.value=localStorage.getItem(SOURCE_KEY)||EXAMPLES.hello;$("stdin").value=localStorage.getItem(INPUT_KEY)||"";}
  catch(_){source.value=EXAMPLES.hello;}
  selects.value="hello";updateGutter();drawGraph();
})();
