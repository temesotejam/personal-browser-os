// C実行専用Web Worker。WASI Preview 1 の標準入出力のみを実装します。
// 無限ループは親ページでWorkerごと強制終了できます。
const WASI_SUCCESS = 0;
const WASI_BADF = 8;
const WASI_NOSYS = 52;
const WASI_SPIPE = 70;
class ExitCode {
  constructor(code) { this.code = code; }
}

self.onmessage = async event => {
  if (event.data?.type !== "run") return;
  const wasmBytes = event.data.bytes;
  const stdin = new TextEncoder().encode(String(event.data.stdin || ""));
  let inputIndex = 0;
  let memory;
  const view = () => new DataView(memory.buffer);
  function output(fd, pointer, length) {
    const bytes = new Uint8Array(length);
    bytes.set(new Uint8Array(memory.buffer,pointer,length));
    self.postMessage({type:fd===2?"stderr":"stdout",bytes},[bytes.buffer]);
  }

  const imports = {
    fd_write(fd, iovs, count, written) {
      if (fd!==1 && fd!==2) return WASI_BADF;
      let total=0;
      for(let i=0;i<count;i++){
        const p=view().getUint32(iovs+i*8,true);
        const n=view().getUint32(iovs+i*8+4,true);
        output(fd,p,n);
        total+=n;
      }
      view().setUint32(written,total,true);
      return WASI_SUCCESS;
    },
    fd_read(fd,iovs,count,readPointer) {
      if(fd!==0) return WASI_BADF;
      let total=0;
      for(let i=0;i<count;i++){
        const p=view().getUint32(iovs+i*8,true);
        const n=view().getUint32(iovs+i*8+4,true);
        const amount=Math.min(n,stdin.length-inputIndex);
        if(amount<=0) break;
        new Uint8Array(memory.buffer,p,amount).set(stdin.subarray(inputIndex,inputIndex+amount));
        inputIndex+=amount;
        total+=amount;
      }
      view().setUint32(readPointer,total,true);
      return WASI_SUCCESS;
    },
    proc_exit(code){throw new ExitCode(code);},
    args_sizes_get(argc,size){view().setUint32(argc,0,true);view().setUint32(size,0,true);return WASI_SUCCESS;},
    args_get(){return WASI_SUCCESS;},
    environ_sizes_get(count,size){view().setUint32(count,0,true);view().setUint32(size,0,true);return WASI_SUCCESS;},
    environ_get(){return WASI_SUCCESS;},
    clock_time_get(_id,_precision,time){view().setBigUint64(time,BigInt(Date.now())*1000000n,true);return WASI_SUCCESS;},
    random_get(pointer,length){
      const bytes=new Uint8Array(memory.buffer,pointer,length);
      for(let i=0;i<length;i+=65536)crypto.getRandomValues(bytes.subarray(i,Math.min(i+65536,length)));
      return WASI_SUCCESS;
    },
    fd_fdstat_get(fd,pointer) {
      if(fd<0 || fd>2) return WASI_BADF;
      new Uint8Array(memory.buffer,pointer,24).fill(0);
      view().setUint8(pointer,2);
      return WASI_SUCCESS;
    },
    fd_prestat_get(){return WASI_BADF;},
    fd_close(){return WASI_SUCCESS;},
    fd_seek(){return WASI_SPIPE;},
    fd_fdstat_set_flags(){return WASI_SUCCESS;}
  };

  try {
    const mod=await WebAssembly.compile(wasmBytes);
    const wasi={wasi_snapshot_preview1:{}};
    for(const imp of WebAssembly.Module.imports(mod)){
      if(imp.module!=="wasi_snapshot_preview1") throw new Error("未対応の外部モジュール: "+imp.module);
      wasi.wasi_snapshot_preview1[imp.name]=imports[imp.name]||(()=>WASI_NOSYS);
    }
    const instance=await WebAssembly.instantiate(mod,wasi);
    memory=instance.exports.memory;
    if(!memory) throw new Error("WASMメモリが見つかりません");
    let exit=0;
    try {
      instance.exports._start();
    }catch(error){
      if(error instanceof ExitCode) exit=error.code;
      else throw error;
    }
    self.postMessage({type:"exit",code:exit});
  }catch(error){
    self.postMessage({type:"error",message:String(error?.message||error)});
  }
};
