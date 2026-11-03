import {chromium} from "playwright-core";
const browser = await chromium.launch({
  headless:true,
  executablePath:process.env.CHROME_BIN,
  args:["--no-sandbox","--disable-dev-shm-usage"]
});
const page = await browser.newPage({viewport:{width:1380,height:920}});
const errors=[];
page.on("pageerror",e=>errors.push(e.message));
page.on("console",m=>{if(m.type()==="error") console.log("Browser console:",m.text());});
page.on("dialog",d=>d.accept());
page.on("response",r=>{if(r.status()>=400)console.log("HTTP",r.status(),r.url());});
page.on("requestfailed",r=>console.log("Request failed",r.url(),r.failure()?.errorText));
async function testProgram(name,outputText) {
  await page.locator("#runBtn").click();
  try {
    await page.waitForFunction((expected)=>{
      const status=document.querySelector("#status").textContent;
      const consoleText=document.querySelector("#console").textContent;
      return (consoleText.includes(expected) && status.includes("完了")) || status.includes("実行エラー");
    },outputText,{timeout:60000});
  } catch(error) {
    console.log("Status on timeout:",await page.locator("#status").textContent());
    console.log("Output on timeout:",await page.locator("#console").textContent());
    throw error;
  }
  const result=await page.locator("#console").textContent();
  console.log(name+" state:",await page.locator("#status").textContent(),"output:",result.slice(-900));
  if(!result.includes(outputText)) throw Error(name+" failed: "+result);
}
try {
  await page.goto("http://127.0.0.1:8099/python-ide/",{waitUntil:"domcontentloaded"});
  console.log("Python IDE loaded:",await page.title());
  await testProgram("Hello World","Hello World!");
  await page.locator("#examples").selectOption("calculate");
  await testProgram("Calculator","円の面積: 78.540");
  await page.locator("#stdin").fill("山田\n12\n34");
  await page.locator("#examples").selectOption("input");
  await testProgram("stdin","12 + 34 = 46");
  await page.locator("#examples").selectOption("graph");
  await testProgram("graph","波形を描画しました");
  const pixels=await page.locator("#canvas").evaluate(canvas=>{
    const ctx=canvas.getContext("2d");
    const {data}=ctx.getImageData(0,0,canvas.width,canvas.height);
    let colored=0;
    for(let i=0;i<data.length;i+=4){
      if(data[i] > 80 && data[i] < 250 && data[i+1] < 170 && data[i+2] > 150) colored++;
    }
    return colored;
  });
  if(pixels<50) throw Error("Python plot did not render colored pixels: "+pixels);
  console.log("Graph drawn, colored pixels:",pixels);
  if(errors.length)throw Error("JavaScript errors: "+errors.join("; "));
  console.log("All Python IDE tests PASSED");
}finally{await browser.close();}
