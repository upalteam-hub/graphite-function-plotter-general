'use strict';
const $ = id => document.getElementById(id);
const fns = Object.freeze({...Object.fromEntries('sin cos tan asin acos atan sinh cosh tanh sqrt cbrt abs exp ln log log10 log2 floor ceil round sign min max atan2 hypot pow'.split(' ').map(k=>[k, k==='ln'?Math.log:Math[k]])), sec:x=>1/Math.cos(x),csc:x=>1/Math.sin(x),cot:x=>1/Math.tan(x)});
const variadic = new Set(['min','max','hypot']);
const constants = {pi:Math.PI,e:Math.E,tau:2*Math.PI};
function normalize(s){
  const symbols={'−':'-','–':'-','÷':'/','×':'*','·':'*','⋅':'*','∙':'*','π':'(pi)','√':'sqrt','∣':'|'};
  const aliases={arcsin:'asin',arccos:'acos',arctan:'atan',tg:'tan',ctg:'cot'};
  s=s.replace(/log([₀-₉]+)/gi,(_,digits)=>'log'+[...digits].map(d=>d.charCodeAt(0)-8320).join(''))
    .replace(/[²³]/g,c=>c==='²'?'^2':'^3').normalize('NFKC').toLowerCase()
    .replace(/[−–÷×·⋅∙π√∣]/g,c=>symbols[c]).replace(/\*\*/g,'^')
    .replace(/\b(arcsin|arccos|arctan|tg|ctg)(?=\s*\()/g,name=>aliases[name]);
  let depth=0,expect=true,out='';
  for(const ch of s){
    if(ch==='|'){
      if(depth&&!expect){out+=')';depth--;expect=false;}
      else{out+='abs(';depth++;expect=true;}
    }else{
      out+=ch;
      if(!/\s/.test(ch))expect=/[+\-*/^(,=;]/.test(ch);
    }
  }
  if(depth)throw Error('绝对值需使用成对的 |，例如 |x|');
  return out;
}
function tagged(fn,tree){return Object.assign(fn,{tree});}
function compile(s, allowed){
  const parts=s.match(/(?:\d*\.\d+|\d+\.?\d*)(?:e[+-]?\d+)?|[a-z]+\d*|[+*/^(),-]|[^\s]/g)||[];
  if(parts.length>250)throw Error('表达式太长');
  let i=0;
  const num = k => k && /^(?:\d|\.\d)/.test(k);
  function expr(bound=0){
    const k=parts[i++];let lhs;
    if(k==='+'||k==='-'){const rhs=expr(25);lhs=k==='-'?tagged(v=>-rhs(v),['neg',rhs.tree]):rhs;}
    else if(k==='('){lhs=expr();if(parts[i++]!==')')throw Error('缺少右括号');}
    else if(num(k)){const n=Number(k);lhs=tagged(()=>n,['num',n]);}
    else if(Object.hasOwn(constants,k)){const n=constants[k];lhs=tagged(()=>n,['num',n]);}
    else if(allowed.includes(k)){lhs=tagged(v=>v[k],['var',k]);}
    else if(Object.hasOwn(fns,k)){
      if(parts[i++]!=='(')throw Error(k+' 需要括号');
      const args=[expr()];while(parts[i]===','){i++;args.push(expr());}
      if(parts[i++]!==')')throw Error('缺少右括号');
      if(k==='log'&&args.length===2){
        const [x,base]=args;
        lhs=tagged(v=>{const b=base(v);return b>0&&b!==1?Math.log(x(v))/Math.log(b):NaN;},['/',['call','ln',x.tree],['call','ln',base.tree]]);
      }else{
        if(!variadic.has(k)&&args.length!==(['atan2','pow'].includes(k)?2:1))throw Error(k+' 的参数数量不正确');
        lhs=tagged(v=>fns[k](...args.map(a=>a(v))),['call',k,...args.map(a=>a.tree)]);
      }
    }else throw Error(k?'无法识别「'+k+'」':'表达式不完整');
    while(i<parts.length){
      let op=parts[i],implicit=false,p;
      if(op==='+'||op==='-')p=10;
      else if(op==='*'||op==='/')p=20;
      else if(op==='^')p=30;
      else if(op==='('||/^[a-z]/.test(op)|| (num(op)&&parts[i-1]===')')){op='*';p=20;implicit=true;}
      else break;
      if(p<=bound)break;
      if(!implicit)i++;
      const a=lhs,b=expr(p-(op==='^'?1:0));
      lhs=tagged({'+':v=>a(v)+b(v),'-':v=>a(v)-b(v),'*':v=>a(v)*b(v),'/':v=>a(v)/b(v),'^':v=>a(v)**b(v)}[op],[op,a.tree,b.tree]);
    }
    return lhs;
  }
  const result=expr();if(i<parts.length)throw Error('多余的符号「'+parts[i]+'」');return result;
}
function parse(raw){
  const [s,range,...extra]=normalize(raw).split('@');
  let domain;
  if(range!==undefined){
    const match=range.trim().match(/^\[([^,]+),([^,]+)\]$/);
    if(!match||extra.length)throw Error('区间格式为 @ [起点, 终点]');
    domain=match.slice(1).map(x=>compile(x,[])({}));
    if(!domain.every(Number.isFinite)||domain[0]>=domain[1]||!Number.isFinite(domain[1]-domain[0]))throw Error('区间端点必须有限，且起点小于终点');
  }
  const explicit=f=>({raw,type:'explicit',f,domain});
  const par=s.match(/^\s*(x|y)\s*=([^;]+);\s*(x|y)\s*=(.+)$/);
  if(par&&par[1]!==par[3]){
    const a=compile(par[2],['t']),b=compile(par[4],['t']);
    return {raw,type:'param',x:par[1]==='x'?a:b,y:par[1]==='y'?a:b,domain:domain||[0,2*Math.PI]};
  }
  const pieces=s.split('=').map(p=>p.trim());
  if(pieces.length===1)return explicit(compile(s,['x']));
  if(pieces.length!==2)throw Error('一条方程只能有一个等号');
  let [a,b]=pieces;
  if(a==='y'||/^f\s*\(\s*x\s*\)$/.test(a)){
    try{return explicit(compile(b,['x']));}catch(e){if(a!=='y')throw e;}
  }
  if(b==='y'){try{return explicit(compile(a,['x']));}catch{}}
  if(domain)throw Error('区间适用于显函数或参数曲线');
  const l=compile(a,['x','y']),r=compile(b,['x','y']);
  return {raw,type:'implicit',f:tagged(v=>l(v)-r(v),['-',l.tree,r.tree])};
}
const svg=$('plot'),graph=$('graph'),input=$('input'),status=$('status');
const NS='http://www.w3.org/2000/svg';
const shades=['#1761c2','#b52f35','#15735a','#8b42b2','#a74b09','#00778a','#aa3274','#557413','#5140a8','#8e5a18','#365775','#572a42'];
const patterns=['','9 5','2 5','13 4 2 4','4 4','16 6'];
const minScale=.015,maxScale=200000;
let curves=[],savedCurves=[],fit=null,atHome=true,view={x:0,y:0,scale:null},size={w:900,h:500},queued=0,frame=0;
const motion=matchMedia('(prefers-reduced-motion: reduce)');
const drawDuration=1050;
const heartColor='#ef639c';
const heartMessages=['我喜欢你','所以','现在立刻马上','V我50'];
const heartMessageDuration=1500;
const heartOrbitDuration=4800;
const heartStickerCount=5;
let heartTimer,heartMessageIndex=-1,heartLabel,heartImages=[];
let heartOrbitStart=0,heartOrbitFrame=0;
const heartOrbit=[];
const heartRadius=Math.sqrt(10);
// Measure the curve's two envelopes so distance is uniform even around the lobes.
for(let i=0;i<=256;i++){
  const angle=i/256*2*Math.PI;
  const x=-heartRadius*Math.sin(angle);
  const y=Math.abs(x)**(2/3)-heartRadius*Math.cos(angle);
  const fromCenterY=y-.72;
  const offset=.28/Math.hypot(x,fromCenterY);
  const point={x:x+x*offset,y:y+fromCenterY*offset,distance:0};
  const previous=heartOrbit.at(-1);
  if(previous)point.distance=previous.distance+Math.hypot(point.x-previous.x,point.y-previous.y);
  heartOrbit.push(point);
}
function heartSignature([op,...parts]){
  if(op==='call'&&parts[0]==='sqrt')return ['^',heartSignature(parts[1]),['num',.5]];
  return [op,...parts.map(part=>Array.isArray(part)?heartSignature(part):part)];
}
const heartFormula='y=|x|^(2/3)+(10-x²)^0.5⋅sin(-18⋅π⋅|x|)';
const heartTree=JSON.stringify(heartSignature(parse(heartFormula).f.tree));
function isHeart(c){
  return c.type==='explicit'&&JSON.stringify(heartSignature(c.f.tree))===heartTree;
}
function curveStyle(c,i){
  if(c.heart)return {stroke:heartColor,dash:''};
  if(curves.length===1)return {stroke:'#171717',dash:''};
  return {stroke:shades[i],dash:patterns[i%patterns.length]};
}
// The six polynomial coefficients are for 1, x, y, x², xy, y².
const powers=[[0,0],[1,0],[0,1],[2,0],[1,1],[0,2]];
function poly([op,a,b]){
  if(op==='num')return [a,0,0,0,0,0];
  if(op==='var')return a==='x'?[0,1,0,0,0,0]:a==='y'?[0,0,1,0,0,0]:null;
  if(op==='call')return null;
  const p=poly(a);if(!p)return null;
  if(op==='neg')return p.map(v=>-v);
  const q=poly(b);if(!q)return null;
  const constant=q.slice(1).every(v=>!v);
  if(op==='+'||op==='-')return p.map((v,i)=>v+(op==='+'?q[i]:-q[i]));
  if(op==='/'&&constant&&q[0])return p.map(v=>v/q[0]);
  if(op==='^'&&constant&&q[0]===0)return [1,0,0,0,0,0];
  if(op==='^'&&constant&&q[0]===1)return p;
  if(op!=='*'&&!(op==='^'&&constant&&q[0]===2))return null;
  const r=op==='*'?q:p,out=[0,0,0,0,0,0];
  for(let i=0;i<6;i++)for(let j=0;j<6;j++)if(p[i]&&r[j]){
    const x=powers[i][0]+powers[j][0],y=powers[i][1]+powers[j][1];
    if(x+y>2)return null;
    out[powers.findIndex(([u,v])=>u===x&&v===y)]+=p[i]*r[j];
  }
  return out;
}
function naturalDomain(tree){
  let lo=-Infinity,hi=Infinity;
  function constrain(t){
    const p=poly(t);if(!p||p[2]||p[4]||p[5])return;
    const [c,b,,a]=p;
    if(a<0){
      const d=b*b-4*a*c;
      if(d<0){lo=Infinity;return;}
      const r=Math.sqrt(d),q=-.5*(b+(b<0?-r:r)),u=q/a,v=q?c/q:u;
      lo=Math.max(lo,Math.min(u,v));hi=Math.min(hi,Math.max(u,v));
    }else if(a===0&&b>0)lo=Math.max(lo,-c/b);
    else if(a===0&&b<0)hi=Math.min(hi,-c/b);
    else if(a===0&&b===0&&c<0)lo=Infinity;
  }
  function visit([op,a,...args]){
    if(op==='call'){
      if(a==='sqrt')constrain(args[0]);
      if(a==='asin'||a==='acos'){
        constrain(['+', ['num',1],args[0]]);
        constrain(['-', ['num',1],args[0]]);
      }
      args.forEach(visit);
    }else{
      if(op==='^'&&args[0][0]==='num'&&!Number.isInteger(args[0][1]))constrain(a);
      if(Array.isArray(a))visit(a);
      args.filter(Array.isArray).forEach(visit);
    }
  }
  visit(tree);
  return [lo,hi];
}
const extremes=values=>[Math.min(...values),Math.max(...values)];
function interval([op,a,b,...rest],lo,hi){
  if(op==='num')return [a,a];
  if(op==='var')return [lo,hi];
  if(op==='call'){
    const ranges=[b,...rest].map(t=>interval(t,lo,hi));if(ranges.some(r=>!r))return null;
    const [[l,h]]=ranges, f=fns[a];
    if(a==='min'||a==='max')return [f(...ranges.map(r=>r[0])),f(...ranges.map(r=>r[1]))];
    if(a==='hypot')return [0,f(...ranges.map(r=>Math.max(...r.map(Math.abs))))];
    if(a==='atan2')return [-Math.PI,Math.PI];
    if(a==='pow')return interval(['^',b,rest[0]],lo,hi);
    if(a==='sin'||a==='cos'){
      if(h-l>=2*Math.PI||Math.max(Math.abs(l),Math.abs(h))>1e10)return [-1,1];
      const offset=a==='sin'?Math.PI/2:0,values=[f(l),f(h)];
      for(let k=Math.ceil((l-offset)/Math.PI);k<=Math.floor((h-offset)/Math.PI);k++)values.push(k%2?-1:1);
      return extremes(values);
    }
    if(['tan','sec','csc','cot'].includes(a)){
      const den=interval(['call',a==='tan'||a==='sec'?'cos':'sin',b],lo,hi);
      if(!den||den[0]<=1e-14&&den[1]>=-1e-14)return null;
      if(a==='sec'||a==='csc')return [1/den[1],1/den[0]];
      return extremes([f(l),f(h)]);
    }
    if(a==='sqrt')return h<0?null:[Math.sqrt(Math.max(0,l)),Math.sqrt(h)];
    if(a==='asin'||a==='acos')return h< -1||l>1?null:extremes([f(Math.max(-1,l)),f(Math.min(1,h))]);
    if(a==='abs'||a==='cosh')return [l<=0&&h>=0?f(0):Math.min(f(l),f(h)),Math.max(f(l),f(h))];
    if(['log','ln','log2','log10'].includes(a)&&l<=0)return null;
    return extremes([f(l),f(h)]);
  }
  const p=interval(a,lo,hi);if(!p)return null;
  const [l,h]=p;
  if(op==='neg')return [-h,-l];
  const q=interval(b,lo,hi);if(!q)return null;
  const [u,v]=q;
  if(op==='+')return [l+u,h+v];
  if(op==='-')return [l-v,h-u];
  if(op==='*')return extremes([l*u,l*v,h*u,h*v]);
  if(op==='/')return u<=0&&v>=0?null:extremes([l/u,l/v,h/u,h/v]);
  if(u!==v){
    if(l<=0)return null;
    return extremes([l**u,l**v,h**u,h**v]);
  }
  if(u<0&&l<=0&&h>=0)return null;
  if(!Number.isInteger(u))return h<0?null:extremes([Math.max(0,l)**u,h**u]);
  const values=[l**u,h**u];
  if(u>0&&l<=0&&h>=0)values.push(0);
  return extremes(values);
}
function enclosed(f,key,[a,b]){
  let lo=Infinity,hi=-Infinity,seen=false;
  for(let i=0;i<512;i++){
    const x=a+(b-a)*i/512,y=i===511?b:a+(b-a)*(i+1)/512;
    const r=interval(f.tree,x,y);
    if(!r||!r.every(Number.isFinite))return null;
    lo=Math.min(lo,r[0]);hi=Math.max(hi,r[1]);
    if(!seen)seen=[x,(x+y)/2,y].some(v=>Number.isFinite(f({[key]:v})));
  }
  return seen?[lo,hi]:null;
}
function bounds(c){
  if(c.type==='param'){
    const x=enclosed(c.x,'t',c.domain),y=enclosed(c.y,'t',c.domain);
    return x&&y?[...x,...y]:null;
  }
  if(c.type==='explicit'){
    const auto=naturalDomain(c.f.tree);
    const d=c.domain?[Math.max(auto[0],c.domain[0]),Math.min(auto[1],c.domain[1])]:auto;
    c.domain=d;
    if(!d.every(Number.isFinite)||d[0]>d[1])return null;
    const y=enclosed(c.f,'x',d);return y?[...d,...y]:null;
  }
  const p=poly(c.f.tree);if(!p)return null;
  const [f,d,e,a,b,g]=p,b2=b/2,det=a*g-b2*b2;
  if(!(det>0))return null;
  const x=(b2*e-g*d)/(2*det),y=(b2*d-a*e)/(2*det),k=-(f+(d*x+e*y)/2);
  const rx2=k*g/det,ry2=k*a/det;
  if(!(rx2>0&&ry2>0))return null;
  const rx=Math.sqrt(rx2),ry=Math.sqrt(ry2),box=[x-rx,x+rx,y-ry,y+ry];
  return box.every(Number.isFinite)?box:null;
}
function isConstant([op,...parts]){
  return op!=='var'&&parts.every(part=>!Array.isArray(part)||isConstant(part));
}
function hasNoRealGraph(c){
  const invalidConstant=f=>isConstant(f.tree)&&!Number.isFinite(f({}));
  if(c.type==='explicit')return c.domain[0]>c.domain[1]||invalidConstant(c.f);
  if(c.type==='param')return invalidConstant(c.x)||invalidConstant(c.y);
  return isConstant(c.f.tree)&&c.f({})!==0;
}
function fitView(w,h){
  if(!fit)return {x:0,y:0,scale:Math.min(w/18,h/12)};
  const [x0,x1,y0,y1]=fit,dx=x1-x0,dy=y1-y0;
  const s=Math.min((w*.82)/dx,(h*.82)/dy,maxScale);
  return {x:x0+dx/2,y:y0+dy/2,scale:dx||dy?s:Math.min(w/18,h/12)};
}
function node(name,attrs={},value){
  const el=document.createElementNS(NS,name);
  for(const [k,v] of Object.entries(attrs))el.setAttribute(k,v);
  if(value!==undefined)el.textContent=value;
  return el;
}
function transform(){
  const {w,h}=size,{x,y,scale:s}=view;
  return {px:a=>w/2+(a-x)*s,py:b=>h/2-(b-y)*s,
    gx:a=>x+(a-w/2)/s,gy:b=>y-(b-h/2)/s};
}
function tickStep(){
  const raw=72/view.scale,p=10**Math.floor(Math.log10(raw)),n=raw/p;
  return p*(n<=1?1:n<=2?2:n<=5?5:10);
}
function label(n){
  if(Math.abs(n)<1e-10)return '0';
  return String(Number(n.toPrecision(6)));
}
function grid(t){
  const {w,h}=size,step=tickStep(),x0=t.px(0),y0=t.py(0);
  const gridLines=[],axes=[],labels=node('g',{fill:'#595959','font-size':11,'font-family':'system-ui, sans-serif'});
  const labelY=Math.max(14,Math.min(h-7,y0+16)),labelX=Math.max(8,Math.min(w-54,x0+7));
  const firstX=Math.ceil(t.gx(0)/step),lastX=Math.floor(t.gx(w)/step);
  for(let j=0;j<500&&firstX+j<=lastX;j++){
    const i=firstX+j;
    const x=t.px(i*step);
    (i===0?axes:gridLines).push('M'+x+',0V'+h);
    if(i&&x>23&&x<w-23)labels.append(node('text',{x,y:labelY,'text-anchor':'middle'},label(i*step)));
  }
  const firstY=Math.ceil(t.gy(h)/step),lastY=Math.floor(t.gy(0)/step);
  for(let j=0;j<500&&firstY+j<=lastY;j++){
    const i=firstY+j;
    const y=t.py(i*step);
    (i===0?axes:gridLines).push('M0,'+y+'H'+w);
    if(i&&y>15&&y<h-8)labels.append(node('text',{x:labelX,y:y-4},label(i*step)));
  }
  if(x0>=0&&x0<=w&&y0>=0&&y0<=h)labels.append(node('text',{x:labelX,y:labelY},'0'));
  svg.append(node('rect',{width:w,height:h,fill:'#ffffff'}),node('path',{d:gridLines.join(' '),fill:'none',stroke:'#e8e8e8'}),node('path',{d:axes.join(' '),fill:'none',stroke:'#727272','stroke-width':1.25}),labels);
}
const pt=(x,y)=>x.toFixed(2)+','+y.toFixed(2);
function trace(c,t){
  const {w,h}=size, max=Math.max(w,h)*12;
  const steps=c.type==='param'?1200:Math.max(1800,Math.ceil(w*2));
  const [a,b]=c.type==='param'?c.domain:[Math.max(t.gx(0),c.domain?.[0]??-Infinity),Math.min(t.gx(w),c.domain?.[1]??Infinity)];
  if(a>b)return '';
  const d=[];let prev=null;
  for(let i=0;i<=steps;i++){
    const v=i===steps?b:a+(b-a)*i/steps;let x,y;
    if(c.type==='param'){x=t.px(c.x({t:v}));y=t.py(c.y({t:v}));}
    else{x=t.px(v);y=t.py(c.f({x:v}));}
    if(!Number.isFinite(x)||!Number.isFinite(y)||Math.abs(x)>max||Math.abs(y)>max){prev=null;continue;}
    const jump=prev&&(Math.abs(y-prev[1])>h*.75||Math.abs(x-prev[0])>w*.75);
    d.push((prev&&!jump?'L':'M')+pt(x,y));prev=[x,y];
    if(a===b){d.push('h0.01');break;}
  }
  return d.join('');
}
function contour(c,t){
  const {w,h}=size,nx=Math.ceil(w/5),ny=Math.ceil(h/5),dx=w/nx,dy=h/ny;
  const xs=Array.from({length:nx+1},(_,j)=>t.gx(j*dx));
  function row(i){const y=t.gy(i*dy);return xs.map(x=>c.f({x,y}));}
  const d=[];
  function edge(p,q){
    if((p[2]<0)===(q[2]<0))return null;
    const alpha=Math.abs(p[2])/(Math.abs(p[2])+Math.abs(q[2]));
    return pt(p[0]+alpha*(q[0]-p[0]),p[1]+alpha*(q[1]-p[1]));
  }
  for(let i=0,a=row(0);i<ny;i++){
    const b=row(i+1),y=i*dy;
    for(let j=0;j<nx;j++){
      const x=j*dx, z=[a[j],a[j+1],b[j+1],b[j]];
      if(!z.every(Number.isFinite)||z.every(v=>v>=0)||z.every(v=>v<0))continue;
      const pts=[[x,y,z[0]],[x+dx,y,z[1]],[x+dx,y+dy,z[2]],[x,y+dy,z[3]]];
      const hits=pts.map((p,k)=>edge(p,pts[(k+1)%4])).filter(Boolean);
      if(hits.length===2)d.push('M'+hits[0]+'L'+hits[1]);
      else if(hits.length===4){
        const mid=c.f({x:t.gx(x+dx/2),y:t.gy(y+dy/2)});
        if((mid<0)===(z[0]<0))d.push('M'+hits[0]+'L'+hits[1]+'M'+hits[2]+'L'+hits[3]);
        else d.push('M'+hits[0]+'L'+hits[3]+'M'+hits[1]+'L'+hits[2]);
      }
    }
    a=b;
  }
  return d.join('');
}
function plotSegments(path){
  const segments=[];
  let previous;
  for(const [,command,x,y] of path.matchAll(/([ML])(-?[\d.]+),(-?[\d.]+)/g)){
    const point={x:Number(x),y:Number(y)};
    if(command==='L'&&previous){
      const segment={
        a:previous,b:point,
        left:Math.min(previous.x,point.x),right:Math.max(previous.x,point.x),
        top:Math.min(previous.y,point.y),bottom:Math.max(previous.y,point.y)
      };
      if(segment.right>=0&&segment.left<=size.w&&segment.bottom>=0&&segment.top<=size.h)segments.push(segment);
    }
    previous=point;
  }
  return segments;
}
function segmentIntersection(p,q){
  if(p.right<q.left||q.right<p.left||p.bottom<q.top||q.bottom<p.top)return null;
  const dx=p.b.x-p.a.x,dy=p.b.y-p.a.y,ex=q.b.x-q.a.x,ey=q.b.y-q.a.y;
  const det=dx*ey-dy*ex;
  if(Math.abs(det)<1e-9)return null;
  const x=q.a.x-p.a.x,y=q.a.y-p.a.y;
  const u=(x*ey-y*ex)/det,v=(x*dy-y*dx)/det;
  if(u< -1e-8||u>1+1e-8||v< -1e-8||v>1+1e-8)return null;
  return {x:p.a.x+u*dx,y:p.a.y+u*dy};
}
function visitSegmentCells(s,visit){
  const cell=18,columns=Math.ceil(size.w/cell)+1;
  const x0=Math.max(0,Math.floor(s.left/cell)),x1=Math.floor(Math.min(size.w,s.right)/cell);
  const y0=Math.max(0,Math.floor(s.top/cell)),y1=Math.floor(Math.min(size.h,s.bottom)/cell);
  for(let y=y0;y<=y1;y++)for(let x=x0;x<=x1;x++)visit(y*columns+x);
}
function explicitIntersections(a,b,t,add){
  const lo=Math.max(t.gx(0),a.domain[0],b.domain[0]);
  const hi=Math.min(t.gx(size.w),a.domain[1],b.domain[1]);
  if(lo>hi)return;
  const difference=x=>a.f({x})-b.f({x});
  function mark(x){
    const y=a.f({x}),error=difference(x);
    if(Number.isFinite(y)&&Math.abs(error)<=1e-5/view.scale+Number.EPSILON*Math.abs(y)*16)add({x:t.px(x),y:t.py(y)});
  }
  if(lo===hi){mark(lo);return;}
  const steps=Math.max(360,Math.min(1200,Math.ceil(size.w)));
  const samples=Array.from({length:steps+1},(_,i)=>lo+(hi-lo)*i/steps);
  const values=samples.map(difference);
  if(values.every(v=>v===0))return;
  for(let i=0;i<=steps;i++){
    const v=values[i],prev=values[i-1],next=values[i+1],x=samples[i];
    if(!Number.isFinite(v))continue;
    if(v===0){
      if(prev!==0&&next!==0)mark(x);
      continue;
    }
    if(Number.isFinite(prev)&&prev!==0&&(v<0)!==(prev<0)){
      let l=samples[i-1],r=x;
      for(let j=0;j<36;j++){
        const m=(l+r)/2,d=difference(m);
        if(!Number.isFinite(d))break;
        if(d===0){l=r=m;break;}
        if((d<0)===(prev<0))l=m;else r=m;
      }
      mark((l+r)/2);
    }
    // A tangent can touch zero without changing the sign of the difference.
    if(!Number.isFinite(prev)||!Number.isFinite(next)||(prev<0)!==(v<0)||(next<0)!==(v<0))continue;
    if(Math.abs(v)>=Math.abs(prev)||Math.abs(v)>=Math.abs(next))continue;
    let l=samples[i-1],r=samples[i+1];
    for(let j=0;j<32;j++){
      const m1=l+(r-l)/3,m2=r-(r-l)/3;
      if(Math.abs(difference(m1))<Math.abs(difference(m2)))r=m2;else l=m1;
    }
    mark((l+r)/2);
  }
}
function curveIntersections(lines,t,paths){
  const points=[];
  function add(p){
    if(!p||p.x<0||p.x>size.w||p.y<0||p.y>size.h)return;
    if(!points.some(q=>Math.hypot(q.x-p.x,q.y-p.y)<2.5))points.push(p);
  }
  for(let i=0;i<curves.length;i++)for(let j=0;j<i;j++){
    if(curves[i].type==='explicit'&&curves[j].type==='explicit')
      explicitIntersections(curves[i],curves[j],t,add);
  }
  if(curves.every(c=>c.type==='explicit'))return points;
  const cells=new Map();
  lines.forEach((segments,i)=>{
    for(const s of segments){
      const seen=new Set();
      visitSegmentCells(s,key=>{
        for(const entry of cells.get(key)??[]){
          if(seen.has(entry)||paths[i]===paths[entry.index]||curves[i].type==='explicit'&&curves[entry.index].type==='explicit')continue;
          seen.add(entry);
          add(segmentIntersection(s,entry.segment));
        }
      });
    }
    for(const segment of segments){
      const entry={index:i,segment};
      visitSegmentCells(segment,key=>{
        if(!cells.has(key))cells.set(key,[]);
        cells.get(key).push(entry);
      });
    }
  });
  return points;
}
function plotAnnotations(paths,t){
  const pathData=[...paths.children].map(path=>path.getAttribute('d'));
  const lines=pathData.map(plotSegments);
  const overlay=node('g',{
    id:'plot-annotations',
    'font-size':12,'font-weight':650,'font-family':'system-ui, sans-serif',
    'paint-order':'stroke fill','stroke-linejoin':'round','pointer-events':'none'
  });
  function caption(p,text,color){
    const right=p.x<size.w*.65;
    const width=Math.min(size.w-8,text.length*7.5);
    const x=right?Math.min(p.x+7,size.w-4-width):Math.max(p.x-7,width+4);
    overlay.append(node('text',{
      x,y:p.y<22?p.y+16:p.y-8,
      'text-anchor':right?'start':'end',fill:color,stroke:'#fff','stroke-width':3.5
    },text));
  }
  lines.forEach((segments,i)=>{
    let anchor,best=Infinity;
    for(const {a,b} of segments)for(const p of [a,b]){
      if(p.x<12||p.x>size.w-12||p.y<14||p.y>size.h-10)continue;
      const score=Math.abs(p.x-size.w*(.7-.06*(i%5)));
      if(score<best){anchor=p;best=score;}
    }
    if(!anchor)return;
    const raw=curves[i].raw,max=Math.max(8,Math.floor(size.w/25));
    const text=raw.length>max?raw.slice(0,max-1)+'…':raw;
    caption(anchor,text,curveStyle(curves[i],i).stroke);
  });
  for(const p of curveIntersections(lines,t,pathData)){
    const coords='('+label(t.gx(p.x))+', '+label(t.gy(p.y))+')';
    const marker=node('circle',{cx:p.x,cy:p.y,r:4,fill:'#171717',stroke:'#fff','stroke-width':1.5});
    marker.append(node('title',{},'交点 '+coords));
    overlay.append(marker);
    caption(p,coords,'#171717');
  }
  return overlay;
}
function updateHeartMessage(){
  if(!heartLabel)return;
  heartLabel.textContent=heartMessages[heartMessageIndex]??'';
  heartImages.forEach((image,i)=>{
    const visible=heartMessageIndex===heartMessages.length-1&&(!motion.matches||i===0);
    image.setAttribute('visibility',visible?'visible':'hidden');
  });
}
function placeHeartStickers(now){
  if(!heartImages.length||motion.matches)return;
  const progress=Math.max(0,now-heartOrbitStart)/heartOrbitDuration;
  const t=transform();
  heartImages.forEach((image,i)=>{
    const distance=((progress+i/heartStickerCount)%1)*heartOrbit.at(-1).distance;
    const next=heartOrbit.findIndex(point=>point.distance>distance);
    if(next<0)return;
    const a=heartOrbit[next-1],b=heartOrbit[next];
    const fraction=(distance-a.distance)/(b.distance-a.distance);
    const width=Number(image.getAttribute('width')),height=Number(image.getAttribute('height'));
    let left=t.px(a.x+(b.x-a.x)*fraction)-width/2;
    let top=t.py(a.y+(b.y-a.y)*fraction)-height/2;
    if(atHome&&fit){
      left=Math.min(size.w-width,Math.max(0,left));
      top=Math.min(size.h-height,Math.max(0,top));
    }
    image.setAttribute('x',left);
    image.setAttribute('y',top);
  });
}
function stopHeartOrbit(){
  cancelAnimationFrame(heartOrbitFrame);
  heartOrbitFrame=0;
}
function startHeartOrbit(){
  if(motion.matches)return;
  heartOrbitStart=performance.now();
  function tick(now){
    if(graph.hidden||!heartImages.length||motion.matches){heartOrbitFrame=0;return;}
    placeHeartStickers(now);
    heartOrbitFrame=requestAnimationFrame(tick);
  }
  tick(heartOrbitStart);
}
function startHeartMessages(delay){
  clearTimeout(heartTimer);
  stopHeartOrbit();
  heartMessageIndex=-1;
  function advance(){
    heartMessageIndex++;
    updateHeartMessage();
    if(heartMessageIndex<heartMessages.length-1)heartTimer=setTimeout(advance,heartMessageDuration);
    else startHeartOrbit();
  }
  if(delay)heartTimer=setTimeout(advance,delay);
  else advance();
}
function render(animate=false){
  if(graph.hidden)return;
  cancelAnimationFrame(frame);
  const bounds=svg.getBoundingClientRect(),w=Math.max(1,Math.round(bounds.width)),h=Math.max(1,Math.round(bounds.height));
  if(view.scale===null||atHome&&(w!==size.w||h!==size.h))view=fitView(w,h);
  size={w,h};
  const t=transform();
  svg.setAttribute('viewBox','0 0 '+w+' '+h);
  svg.replaceChildren();
  grid(t);
  const paths=node('g',{fill:'none','stroke-width':2.3,'stroke-linecap':'round','stroke-linejoin':'round'});
  curves.forEach((c,i)=>{
    const {stroke,dash}=curveStyle(c,i);
    const p=node('path',{d:c.type==='implicit'?contour(c,t):trace(c,t),stroke});
    if(dash)p.setAttribute('stroke-dasharray',dash);
    paths.append(p);
  });
  svg.append(paths);
  let firstX=w,lastX=0;
  const pad=2;
  for(const path of paths.children){
    if(!path.getAttribute('d'))continue;
    const box=path.getBBox();
    if(box.x+box.width< -pad||box.x>w+pad||box.y+box.height< -pad||box.y>h+pad)continue;
    firstX=Math.min(firstX,Math.max(0,box.x-pad));
    lastX=Math.max(lastX,Math.min(w,box.x+box.width+pad));
  }
  const hasVisiblePath=lastX>firstX;
  const notice=$('plot-status');
  const message=hasVisiblePath?'':'当前视野未绘出曲线。可尝试缩放、平移或返回检查表达式。';
  if(notice.textContent!==message)notice.textContent=message;
  const reveal=animate&&!motion.matches&&hasVisiblePath;
  const annotations=curves.length>1?plotAnnotations(paths,t):null;
  if(annotations){
    if(reveal)annotations.setAttribute('visibility','hidden');
    svg.append(annotations);
  }
  heartLabel=null;heartImages=[];
  if(curves.some(c=>c.heart)){
    if(animate||heartMessageIndex<0&&heartTimer===undefined)startHeartMessages(reveal?drawDuration:0);
    const fontSize=Math.min(40,view.scale*.62,w/11,h/8);
    const centerX=t.px(0),textY=t.py(.72),imageWidth=fontSize*2.3;
    heartLabel=node('text',{
      id:'heart-message',x:centerX,y:textY,
      'text-anchor':'middle','dominant-baseline':'central',
      'font-family':'system-ui, "Microsoft YaHei", "PingFang SC", sans-serif',
      'font-size':fontSize,'font-weight':750,fill:'#fff',stroke:'#d93278',
      'stroke-width':Math.min(5,fontSize*.15),'stroke-linejoin':'round',
      'paint-order':'stroke fill','pointer-events':'none'
    });
    heartImages=Array.from({length:heartStickerCount},()=>node('image',{
      href:heartSticker,
      x:centerX-imageWidth/2,y:textY+fontSize*.7,
      width:imageWidth,height:imageWidth*145/114,'pointer-events':'none'
    }));
    updateHeartMessage();
    if(heartOrbitFrame)placeHeartStickers(performance.now());
    svg.append(heartLabel,...heartImages);
  }
  if(!reveal)return;
  const clip=node('clipPath',{id:'reveal'}),rect=node('rect',{x:firstX,height:h,width:0});
  const span=lastX-firstX;
  clip.append(rect);svg.append(clip);paths.setAttribute('clip-path','url(#reveal)');
  const start=performance.now();
  function draw(now){
    const p=Math.max(0,Math.min(1,(now-start)/drawDuration));
    const eased=.3*p+.7*p*p*(3-2*p);
    rect.setAttribute('width',span*eased);
    if(p<1)frame=requestAnimationFrame(draw);
    else{
      paths.removeAttribute('clip-path');clip.remove();
      annotations?.removeAttribute('visibility');
    }
  }
  frame=requestAnimationFrame(draw);
}
function schedule(){
  if(!queued)queued=requestAnimationFrame(()=>{queued=0;render();});
}
function showPlot(show,animate=false){
  if(show===!graph.hidden)return;
  if(show)input.blur();
  else{
    cancelAnimationFrame(frame);
    stopHeartOrbit();
    clearTimeout(heartTimer);
    heartTimer=undefined;heartMessageIndex=-1;heartLabel=null;heartImages=[];
  }
  const entry=$('entry-screen');
  entry.classList.toggle('returning',!show);
  entry.hidden=show;graph.hidden=!show;
  document.body.classList.toggle('plot-open',show);
  if(show){render(animate);$('back').focus({preventScroll:true});}
  else $('draw').focus({preventScroll:true});
}
function updateSavedCount(){
  $('saved-curves').hidden=savedCurves.length===0;
  $('saved-count').textContent=savedCurves.length?'已保留 '+savedCurves.length+' 条普通曲线，可继续添加。':'';
}
function curveKey(c){
  const trees=c.type==='param'?[c.x.tree,c.y.tree]:[c.f.tree];
  return JSON.stringify([c.type,c.domain??null,...trees]);
}
function update(){
  const value=input.value.trim();
  if(!value&&!savedCurves.length){
    status.textContent='请输入函数表达式。';status.classList.add('error');input.setAttribute('aria-invalid','true');return;
  }
  try{
    const lines=value.split(/\r?\n/).map(v=>v.trim()).filter(Boolean);
    if(lines.length>12)throw Error('每次最多绘制 12 条曲线。');
    const candidates=lines.map((v,i)=>{try{return parse(v);}catch(e){throw Error('第 '+(i+1)+' 行：'+e.message);}});
    candidates.forEach(c=>{
      c.key=curveKey(c);c.heart=isHeart(c);c.box=bounds(c);c.empty=hasNoRealGraph(c);
    });
    const usable=candidates.filter(c=>!c.empty);
    if(candidates.length&&!usable.length)throw Error('没有可绘制的实数图像，请检查表达式或指定区间。');
    const heart=usable.find(c=>c.heart);
    if(heart){
      curves=[heart];
    }else{
      const combined=new Map(savedCurves.map(c=>[c.key,c]));
      for(const c of usable)if(!combined.has(c.key))combined.set(c.key,c);
      if(combined.size>12)throw Error('最多保留 12 条普通曲线，请先清空曲线再添加。');
      savedCurves=[...combined.values()];
      curves=savedCurves;
      updateSavedCount();
    }
    const relevantBoxes=curves.map(c=>c.box);
    fit=relevantBoxes.every(Boolean)?[
      Math.min(...relevantBoxes.map(b=>b[0])),Math.max(...relevantBoxes.map(b=>b[1])),
      Math.min(...relevantBoxes.map(b=>b[2])),Math.max(...relevantBoxes.map(b=>b[3]))
    ]:null;
    atHome=true;view=fitView(size.w,size.h);view.scale=null;
    status.textContent='';status.classList.remove('error');input.removeAttribute('aria-invalid');
    $('legend').replaceChildren(...curves.map((c,i)=>{
      const item=document.createElement('span'),swatch=document.createElement('i');
      const {stroke,dash}=curveStyle(c,i);
      swatch.style.color=stroke;if(dash)swatch.className='dashed';
      item.append(swatch,document.createTextNode(c.raw));return item;
    }));
    if(location.hash!=='#plot-view')history.pushState(null,'','#plot-view');
    showPlot(true,true);
  }catch(e){status.textContent=e.message;status.classList.add('error');input.setAttribute('aria-invalid','true');}
}
function zoom(f,px=size.w/2,py=size.h/2){
  if(!view.scale)return;
  atHome=false;
  const t=transform(),x=t.gx(px),y=t.gy(py);
  view.scale=Math.min(maxScale,Math.max(minScale,view.scale*f));
  const shifted=transform();view.x+=x-shifted.gx(px);view.y+=y-shifted.gy(py);schedule();
}
const mathKeys=$('math-keys');
mathKeys.addEventListener('pointerdown',e=>{
  if(document.activeElement===input&&e.target.closest('button'))e.preventDefault();
});
mathKeys.addEventListener('click',e=>{
  const key=e.target.closest('button');
  if(!key)return;
  const {selectionStart:start,selectionEnd:end,value}=input;
  if(key.dataset.move){
    const left=key.dataset.move==='-1';
    const caret=start!==end?(left?start:end):Math.max(0,Math.min(value.length,start+Number(key.dataset.move)));
    input.setSelectionRange(caret,caret);
    return;
  }
  if('delete' in key.dataset){
    const previous=Array.from(value.slice(0,start)).at(-1);
    const from=start===end?start-(previous?.length??0):start;
    if(from===end)return;
    input.setRangeText('',from,end,'end');
  }else{
    const {insert,close}=key.dataset;
    const selected=start!==end;
    const replacement=close?insert+value.slice(start,end)+close:insert;
    input.setRangeText(replacement,start,end,'end');
    if(close&&!selected)input.setSelectionRange(start+insert.length,start+insert.length);
  }
  input.dispatchEvent(new Event('input',{bubbles:true}));
});
$('form').addEventListener('submit',e=>{e.preventDefault();update();});
input.addEventListener('input',()=>{status.textContent='';input.removeAttribute('aria-invalid');});
input.addEventListener('keydown',e=>{if(e.key==='Enter'&&(e.ctrlKey||e.metaKey)){e.preventDefault();update();}});
document.querySelectorAll('[data-example]').forEach(b=>b.addEventListener('click',()=>{input.value=b.dataset.example;status.textContent='';input.removeAttribute('aria-invalid');}));
if(location.hash==='#plot-view')history.replaceState(null,'',location.pathname+location.search);
window.addEventListener('popstate',()=>showPlot(location.hash==='#plot-view'&&curves.length>0));
$('back').onclick=()=>history.back();
$('clear-curves').onclick=()=>{
  savedCurves=[];curves=[];
  updateSavedCount();
  status.textContent='已清空普通曲线。';
  status.classList.remove('error');
  input.removeAttribute('aria-invalid');
  $('draw').focus({preventScroll:true});
};
$('out').onclick=()=>zoom(1/1.33);$('in').onclick=()=>zoom(1.33);
$('reset').onclick=()=>{atHome=true;view=fitView(size.w,size.h);render();};
$('replay').onclick=()=>render(true);
$('export').onclick=()=>{
  const copy=svg.cloneNode(true),clip=copy.querySelector('clipPath');
  if(clip){clip.remove();copy.querySelector('[clip-path]').removeAttribute('clip-path');}
  copy.querySelector('#plot-annotations')?.removeAttribute('visibility');
  copy.setAttribute('width',size.w);copy.setAttribute('height',size.h);copy.removeAttribute('tabindex');
  const blob=new Blob([new XMLSerializer().serializeToString(copy)],{type:'image/svg+xml;charset=utf-8'});
  const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='graphite.svg';
  document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
};
svg.addEventListener('wheel',e=>{e.preventDefault();const r=svg.getBoundingClientRect();zoom(Math.exp(-Math.max(-180,Math.min(180,e.deltaY))*.003),e.clientX-r.left,e.clientY-r.top);},{passive:false});
const pointers=new Map();
svg.addEventListener('pointerdown',e=>{
  if(e.pointerType==='mouse'&&e.button!==0)return;
  pointers.set(e.pointerId,[e.clientX,e.clientY]);svg.setPointerCapture(e.pointerId);
});
svg.addEventListener('pointermove',e=>{
  const old=pointers.get(e.pointerId);if(!old||!view.scale)return;
  atHome=false;
  const next=[e.clientX,e.clientY],other=[...pointers].find(([id])=>id!==e.pointerId)?.[1];
  if(other){
    const r=svg.getBoundingClientRect(),dist=p=>Math.hypot(p[0]-other[0],p[1]-other[1]);
    zoom(Math.max(1,dist(next))/Math.max(1,dist(old)),(old[0]+other[0])/2-r.left,(old[1]+other[1])/2-r.top);
  }
  const weight=other?.5:1;
  view.x-=(next[0]-old[0])*weight/view.scale;view.y+=(next[1]-old[1])*weight/view.scale;
  pointers.set(e.pointerId,next);schedule();
});
for(const type of ['pointerup','pointercancel','lostpointercapture'])svg.addEventListener(type,e=>pointers.delete(e.pointerId));
svg.addEventListener('keydown',e=>{
  const delta={ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowUp:[0,1],ArrowDown:[0,-1]}[e.key];
  if(delta){e.preventDefault();atHome=false;view.x+=delta[0]*45/view.scale;view.y+=delta[1]*45/view.scale;schedule();}
  else if(['+','=','-'].includes(e.key)){e.preventDefault();zoom(e.key==='-'?1/1.33:1.33);}
});
let priorSize='';
new ResizeObserver(([e])=>{
  const {width,height}=e.contentRect;
  if(!width||!height)return;
  const stamp=Math.round(width)+':'+Math.round(height);
  if(stamp!==priorSize&&(Math.round(width)!==size.w||Math.round(height)!==size.h))render(!!svg.querySelector('clipPath'));
  priorSize=stamp;
}).observe(svg);
