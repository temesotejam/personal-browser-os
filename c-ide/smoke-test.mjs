import {chromium} from "playwright-core";

const browser=await chromium.launch({
  headless:true,
  executablePath:process.env.CHROME_BIN,
  args:["--no-sandbox","--disable-dev-shm-usage"]
});
const page=await browser.newPage({viewport:{width:1280,height:880}});
const errors=[];
page.on("pageerror",error=>errors.push(error.message));
page.on("console",message=>{
  if(message.type()==="error") console.log("Browser console:",message.text());
});
page.on("dialog",dialog=>dialog.accept());
try {
  await page.goto("http://127.0.0.1:8099/c-ide/index.html",{waitUntil:"domcontentloaded"});
  console.log("Loaded C IDE:",await page.title());
  await page.locator("#runBtn").click();
  await page.waitForFunction(()=>{
    const text=document.querySelector("#output").textContent;
    return text.includes("Hello World!") && text.includes("[終了コード 0");
  },null,{timeout:180000});
  console.log("Hello World compiled and executed successfully.");

  await page.locator("#examples").selectOption("draw");
  await page.locator("#runBtn").click();
  await page.waitForFunction(()=>{
    const text=document.querySelector("#output").textContent;
    return text.includes("sin波を描画しました。") && text.includes("[終了コード 0");
  },null,{timeout:180000});
  const pixel=await page.locator("#plot").evaluate(canvas=>{
    const p=canvas.getContext("2d").getImageData(320,180,1,1).data;
    return Array.from(p);
  });
  if(pixel[0]>245 && pixel[1]>245 && pixel[2]>245) throw new Error("Canvas draw test failed: center pixel is still white");
  console.log("Canvas drawing succeeded; pixel:",pixel);
  if(errors.length) throw new Error("Browser JavaScript errors: "+errors.join("; "));
  console.log("All C IDE smoke tests PASSED.");
} finally {
  await browser.close();
}
