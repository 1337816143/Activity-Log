/** Bounded, compositor-only spring deck. At most six decoded card layers. No framework rerender per frame. */
export class PhotoDeck {
  constructor(root, files, resolveURL, {onChange = () => {}, onOpen = () => {}, initial = 0} = {}) {
    this.root=root; this.files=files; this.url=resolveURL; this.onChange=onChange; this.onOpen=onOpen;
    this.index=Math.max(0,Math.min(initial,files.length-1)); this.cards=new Map(); this.frame=0; this.disposed=false; this.last=0;
    this.reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
    root.classList.add('deck'); root.tabIndex=0; root.setAttribute('role','region'); root.setAttribute('aria-label','叠放图片预览，滚轮、方向键或拖动切换，回车打开原图');
    root.innerHTML='<div class="deck-stage"></div>'; this.stage=root.firstElementChild;
    this.abort=new AbortController(); const signal=this.abort.signal;
    root.addEventListener('wheel',e=>this.wheel(e),{passive:false,signal});
    root.addEventListener('keydown',e=>this.key(e),{signal});
    root.addEventListener('pointerdown',e=>this.down(e),{signal});
    root.addEventListener('pointermove',e=>this.move(e),{signal});
    root.addEventListener('pointerup',e=>this.up(e),{signal});
    root.addEventListener('pointercancel',()=>{this.drag=null;this.sync();},{signal});
    root.addEventListener('lostpointercapture',()=>{if(this.drag){this.drag=null;this.sync();}},{signal});
    this.sync(true);
  }
  key(e) {
    if(e.altKey||e.ctrlKey||e.metaKey)return;
    const next=['ArrowDown','ArrowRight','PageDown'].includes(e.key)||['Numpad2','Numpad6'].includes(e.code);
    const prev=['ArrowUp','ArrowLeft','PageUp'].includes(e.key)||['Numpad8','Numpad4'].includes(e.code);
    if(next||prev){e.preventDefault();e.stopPropagation();this.step(next?1:-1);}
    else if(e.key==='Home'){e.preventDefault();this.go(0);}
    else if(e.key==='End'){e.preventDefault();this.go(this.files.length-1);}
    else if(e.key==='Enter'||e.key===' '){e.preventDefault();this.onOpen(this.files[this.index],this.index);}
  }
  wheel(e) {
    if(e.ctrlKey||e.metaKey||this.files.length<2)return;
    const delta=(Math.abs(e.deltaY)>=Math.abs(e.deltaX)?e.deltaY:e.deltaX)*(e.deltaMode===1?16:1);
    if(!delta)return;
    const dir=Math.sign(delta), atEdge=dir>0?this.index===this.files.length-1:this.index===0;
    // At the first/last card let the page scroll. A finite sequence is predictable and accessible.
    if(atEdge)return;
    e.preventDefault();
    const now=performance.now();
    if(now-(this.lastWheel||0)>150)this.wheelSum=0;
    this.lastWheel=now;
    this.wheelSum=(this.wheelSum||0)+delta;
    if(Math.abs(this.wheelSum)>34 && now-(this.lastStep||0)>260){this.step(Math.sign(this.wheelSum));this.wheelSum=0;this.lastStep=now;}
  }
  down(e){if(e.button!==0||!e.isPrimary)return;this.root.focus({preventScroll:true});this.drag={x:e.clientX,y:e.clientY,dy:0,dx:0,t:performance.now(),id:e.pointerId};this.root.setPointerCapture(e.pointerId);}
  move(e){if(!this.drag||e.pointerId!==this.drag.id)return;this.drag.dy=e.clientY-this.drag.y;this.drag.dx=e.clientX-this.drag.x;const card=this.cards.get(this.index);if(card){card.target.y=this.drag.dy*.5;card.target.rotate=this.drag.dx*.025;this.start();}}
  up(e){if(!this.drag||e.pointerId!==this.drag.id)return;const {dy,dx,id}=this.drag;this.drag=null;if(this.root.hasPointerCapture(id))this.root.releasePointerCapture(id);if(Math.abs(dy)>35||Math.abs(dx)>48)this.step(Math.abs(dy)>Math.abs(dx)?(dy<0?1:-1):(dx<0?1:-1));else if(Math.abs(dy)<8&&Math.abs(dx)<8)this.onOpen(this.files[this.index],this.index);this.sync();}
  step(dir){this.go(this.index+dir);}
  go(index){const next=Math.max(0,Math.min(this.files.length-1,index));if(next===this.index)return;this.index=next;this.sync();}
  sync(instant=false){
    if(this.disposed||!this.files.length)return;
    const keep=new Set();
    for(let i=Math.max(0,this.index-1);i<Math.min(this.files.length,this.index+5);i++){
      keep.add(i);let card=this.cards.get(i),d=i-this.index;
      if(!card){
        const el=document.createElement('div');el.className='deck-card';el.setAttribute('aria-hidden','true');
        const img=new Image();img.alt=this.files[i].name;img.decoding='async';img.draggable=false;
        const err=document.createElement('span');err.className='image-error';err.textContent='浏览器无法显示此图片。点击打开详情后下载原文件。';
        el.append(img,err);this.stage.append(el);
        card={el,img,value:{y:d>=0?Math.min(d,4)*20:-130,scale:d>=0?1-Math.min(d,4)*.043:.97,opacity:d>=0?1:0,rotate:0},velocity:{y:0,scale:0,opacity:0,rotate:0},target:{}};this.cards.set(i,card);
        this.url(this.files[i]).then(src=>{if(!this.disposed&&this.cards.get(i)===card)img.src=src;}).catch(()=>el.classList.add('broken'));
        img.onerror=()=>el.classList.add('broken');
      }
      card.target={y:d<0?-150:d*20,scale:d<0?.96:1-d*.043,opacity:d<0?0:1-d*.085,rotate:d<0?-3:0};
      card.el.style.zIndex=d<0?'30':String(20-d);card.el.style.pointerEvents=d===0?'auto':'none';
      if(instant||this.reduced){card.value={...card.target};this.paint(card);}
    }
    for(const [i,c] of this.cards){if(!keep.has(i)){c.el.remove();this.cards.delete(i);}}
    this.root.dataset.index=String(this.index);this.root.setAttribute('aria-label',`图片 ${this.index+1} / ${this.files.length}：${this.files[this.index].name}。滚轮、方向键或拖动切换，回车打开原图`);
    this.onChange(this.index,this.files[this.index]);if(!instant&&!this.reduced)this.start();
  }
  paint(c){const v=c.value;c.el.style.transform=`translate3d(0,${v.y.toFixed(2)}px,0) scale(${v.scale.toFixed(4)}) rotate(${v.rotate.toFixed(2)}deg)`;c.el.style.opacity=Math.max(0,Math.min(1,v.opacity)).toFixed(3);}
  start(){if(this.frame||this.disposed)return;this.last=performance.now();this.frame=requestAnimationFrame(t=>this.tick(t));}
  tick(t){this.frame=0;if(this.disposed)return;const dt=Math.min((t-this.last)/1000,.028);this.last=t;let moving=false;
    for(const c of this.cards.values()){
      for(const key of ['y','scale','opacity','rotate']){
        const diff=c.target[key]-c.value[key];c.velocity[key]+=(245*diff-29*c.velocity[key])*dt;c.value[key]+=c.velocity[key]*dt;
        const epsilon=key==='y'||key==='rotate'?.035:.0006;
        if(Math.abs(diff)>epsilon||Math.abs(c.velocity[key])>epsilon)moving=true;else{c.value[key]=c.target[key];c.velocity[key]=0;}
      }this.paint(c);
    }if(moving)this.frame=requestAnimationFrame(t2=>this.tick(t2));
  }
  destroy(){this.disposed=true;cancelAnimationFrame(this.frame);this.abort.abort();this.cards.clear();this.root.innerHTML='';}
}
