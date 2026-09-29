"use strict";

function solvePlacement(data, send) {
  try {
    const {items, empty} = data;
    const rows = 5, cols = 9, cellsTotal = rows * cols, maskBase = 2 ** 28;
    const emptySet = new Set(empty);
    const emptyAt = Array.from({length:cellsTotal},(_,i)=>emptySet.has(i));
    const freeSuffix = Array(cellsTotal+1).fill(0);
    for (let i=cellsTotal-1;i>=0;i--) freeSuffix[i]=freeSuffix[i+1]+(emptyAt[i]?0:1);
    const options = Array.from({length:cellsTotal},()=>[[],[],[]]);

    for (let pos=0;pos<cellsTotal;pos++) {
      const x=pos%cols, y=Math.floor(pos/cols);
      items.forEach((item,typeIndex)=>{
        const shapes=item.w===item.h?[[item.w,item.h]]:[[item.w,item.h],[item.h,item.w]];
        for (const [w,h] of shapes) {
          if (x+w>cols || y+h>rows) continue;
          let mask=0, placedCells=[], touchesEmpty=false;
          for (let dy=0;dy<h;dy++) for (let dx=0;dx<w;dx++) {
            const offset=dy*cols+dx, absolute=pos+offset;
            mask |= 1 << offset; placedCells.push(absolute);
            if (emptyAt[absolute]) touchesEmpty=true;
          }
          if (!touchesEmpty) options[pos][typeIndex].push({mask,cells:placedCells});
        }
      });
    }

    function popcount(value) {
      value=value-((value>>>1)&0x55555555);
      value=(value&0x33333333)+((value>>>2)&0x33333333);
      return (((value+(value>>>4))&0x0f0f0f0f)*0x01010101)>>>24;
    }
    const memo=new Map(); let states=0;
    function keyFor(pos,occ,a,b,c) { return ((((pos*64+a)*64+b)*64+c)*maskBase)+occ; }
    function solve(pos,occ,a,b,c) {
      states++;
      const remainingArea=a*items[0].w*items[0].h+b*items[1].w*items[1].h+c*items[2].w*items[2].h;
      if (remainingArea>freeSuffix[pos]-popcount(occ)) return 0n;
      if (pos===cellsTotal) return a+b+c===0?1n:0n;
      const key=keyFor(pos,occ,a,b,c), known=memo.get(key);
      if (known!==undefined) return known;
      let total=0n;
      if (emptyAt[pos] || (occ&1)) total=solve(pos+1,occ>>>1,a,b,c);
      else {
        total=solve(pos+1,occ>>>1,a,b,c); // Leave this cell empty.
        const counts=[a,b,c];
        for (let t=0;t<3;t++) if (counts[t]>0) for (const option of options[pos][t]) {
          if (occ&option.mask) continue;
          counts[t]--;
          total+=solve(pos+1,(occ|option.mask)>>>1,counts[0],counts[1],counts[2]);
          counts[t]++;
        }
      }
      memo.set(key,total);
      if (states%500000===0) send({type:"progress",states});
      return total;
    }

    const counts=items.map(item=>item.n);
    const total=solve(0,0,counts[0],counts[1],counts[2]);
    if (total===0n) { send({type:"done",total:"0",counts:Array(cellsTotal).fill("0")}); return; }

    const cellCounts=Array(cellsTotal).fill(0n);
    let layer=new Map([[keyFor(0,0,counts[0],counts[1],counts[2]),{pos:0,occ:0,a:counts[0],b:counts[1],c:counts[2],ways:1n}]]);
    for (let pos=0;pos<cellsTotal;pos++) {
      const nextLayer=new Map();
      const advance=(occ,a,b,c,ways,placedCells=[])=>{
        const suffix=solve(pos+1,occ,a,b,c);
        if (suffix===0n) return;
        const key=keyFor(pos+1,occ,a,b,c), existing=nextLayer.get(key);
        if (existing) existing.ways+=ways; else nextLayer.set(key,{pos:pos+1,occ,a,b,c,ways});
        if (placedCells.length) { const contribution=ways*suffix; for (const cell of placedCells) cellCounts[cell]+=contribution; }
      };
      for (const state of layer.values()) {
        const {occ,a,b,c,ways}=state;
        if (emptyAt[pos] || (occ&1)) { advance(occ>>>1,a,b,c,ways); continue; }
        advance(occ>>>1,a,b,c,ways); // This cell is not occupied.
        const remaining=[a,b,c];
        for (let t=0;t<3;t++) if (remaining[t]>0) for (const option of options[pos][t]) {
          if (occ&option.mask) continue;
          remaining[t]--;
          advance((occ|option.mask)>>>1,remaining[0],remaining[1],remaining[2],ways,option.cells);
          remaining[t]++;
        }
      }
      layer=nextLayer;
    }
    send({type:"done",total:String(total),counts:cellCounts.map(String)});
  } catch (error) {
    send({type:"error",error:error&&error.message?error.message:String(error)});
  }
}

if (typeof WorkerGlobalScope !== "undefined" && globalThis instanceof WorkerGlobalScope) {
  self.onmessage = event => solvePlacement(event.data, message => self.postMessage(message));
} else {
  globalThis.solvePlacement = solvePlacement;
}
