/* ============================================================
   Fig. 01 — Campo noosférico · 384 nós
   ------------------------------------------------------------
   Transplante SEM ALTERAÇÃO do código do Manual de Identidade
   Noos v1.0 (Noosfera.zip), linhas 1941–2053. O algoritmo, as
   constantes e o comportamento são idênticos — mesmo globo.

   ⚠ NÃO EDITAR. A figura é patrimônio do sistema
   (Carta do Projeto e SDD, cap. 14: "Fig. 01 congelada").
   Dependências definidas como no manual: `root` e `reduce`.
   ============================================================ */
(function(){
  var root=document.documentElement;
  var reduce=window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var canvas=document.getElementById('field');
  if(canvas&&canvas.getContext){
    var ctx=canvas.getContext('2d');
    var N=384;
    var pts=[];
    var pairs=[];
    var rot=0;
    var W=0,H=0,dpr=1;
    var raf=null,last=0,visible=true;
    var col={line:'#066755',point:'#0e1b1c',hot:'#32a188'};
    var ga=Math.PI*(3-Math.sqrt(5));

    for(var i=0;i<N;i++){
      var y=1-(i/(N-1))*2;
      var r=Math.sqrt(Math.max(0,1-y*y));
      var a=ga*i;
      pts.push({x:Math.cos(a)*r,y:y,z:Math.sin(a)*r});
    }
    for(var i2=0;i2<N;i2++){
      for(var j=i2+1;j<N;j++){
        var dx=pts[i2].x-pts[j].x,dy=pts[i2].y-pts[j].y,dz=pts[i2].z-pts[j].z;
        if(dx*dx+dy*dy+dz*dz<0.055){pairs.push([i2,j]);}
      }
    }
    function readColors(){
      var cs=getComputedStyle(root);
      col.line=cs.getPropertyValue('--accent').trim()||'#066755';
      col.point=cs.getPropertyValue('--fg').trim()||'#0e1b1c';
      col.hot=cs.getPropertyValue('--accent-bright').trim()||'#32a188';
    }
    var proj=new Array(N);
    function draw(){
      if(!W||!H) return;
      ctx.clearRect(0,0,W,H);
      var cx=W/2, cy=H/2, R=Math.min(W,H)*0.40;
      var cosY=Math.cos(rot),sinY=Math.sin(rot);
      var tilt=0.42,cosT=Math.cos(tilt),sinT=Math.sin(tilt);
      for(var k=0;k<N;k++){
        var p=pts[k];
        var x1=p.x*cosY-p.z*sinY;
        var z1=p.x*sinY+p.z*cosY;
        var y1=p.y*cosT-z1*sinT;
        var z2=p.y*sinT+z1*cosT;
        proj[k]={x:cx+x1*R,y:cy-y1*R,z:z2};
      }
      ctx.globalAlpha=0.05;
      ctx.fillStyle=col.line;
      ctx.beginPath();ctx.arc(cx,cy,R*1.01,0,Math.PI*2);ctx.fill();
      ctx.globalAlpha=1;
      ctx.strokeStyle=col.line;
      ctx.lineWidth=0.65;
      for(var q=0;q<pairs.length;q++){
        var A=proj[pairs[q][0]],B=proj[pairs[q][1]];
        var z=(A.z+B.z)/2;
        if(z<-0.35) continue;
        ctx.globalAlpha=0.035+0.115*((z+1)/2);
        ctx.beginPath();ctx.moveTo(A.x,A.y);ctx.lineTo(B.x,B.y);ctx.stroke();
      }
      ctx.fillStyle=col.point;
      for(var m=0;m<N;m++){
        var pt=proj[m];
        var d=(pt.z+1)/2;
        ctx.globalAlpha=0.12+0.5*d;
        ctx.beginPath();ctx.arc(pt.x,pt.y,0.55+1.25*d,0,Math.PI*2);ctx.fill();
      }
      var hot=proj[0];
      ctx.strokeStyle=col.hot;ctx.lineWidth=1;
      ctx.globalAlpha=0.28;
      ctx.beginPath();ctx.arc(hot.x,hot.y,7,0,Math.PI*2);ctx.stroke();
      ctx.fillStyle=col.hot;ctx.globalAlpha=0.95;
      ctx.beginPath();ctx.arc(hot.x,hot.y,2.6,0,Math.PI*2);ctx.fill();
      ctx.globalAlpha=1;
    }
    function resize(){
      var rect=canvas.getBoundingClientRect();
      if(!rect.width) return;
      W=rect.width;H=rect.height;
      dpr=Math.min(window.devicePixelRatio||1,2);
      canvas.width=Math.round(W*dpr);canvas.height=Math.round(H*dpr);
      ctx.setTransform(dpr,0,0,dpr,0,0);
      draw();
    }
    function frame(ts){
      if(!last) last=ts;
      var dt=Math.min(ts-last,48);last=ts;
      rot+=dt*0.00009;
      draw();
      if(visible&&!document.hidden&&!reduce){raf=requestAnimationFrame(frame);}
      else{raf=null;}
    }
    function start(){
      if(reduce) return;
      if(raf===null&&visible){last=0;raf=requestAnimationFrame(frame);}
    }
    function stop(){
      if(raf!==null){cancelAnimationFrame(raf);raf=null;}
    }
    readColors();
    resize();
    window.__noosField={refresh:function(){readColors();draw();}};
    if('ResizeObserver' in window){new ResizeObserver(resize).observe(canvas);}
    else{window.addEventListener('resize',resize);}
    if('IntersectionObserver' in window){
      new IntersectionObserver(function(entries){
        visible=entries[0].isIntersecting;
        if(visible){start();}else{stop();}
      },{threshold:0}).observe(canvas);
    }
    if(!reduce){start();}
    document.addEventListener('visibilitychange',function(){
      if(document.hidden){stop();}else{start();}
    });
    if(document.fonts&&document.fonts.ready){document.fonts.ready.then(resize);}
  }
})();
