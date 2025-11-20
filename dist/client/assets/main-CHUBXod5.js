(function(){const e=document.createElement("link").relList;if(e&&e.supports&&e.supports("modulepreload"))return;for(const s of document.querySelectorAll('link[rel="modulepreload"]'))i(s);new MutationObserver(s=>{for(const n of s)if(n.type==="childList")for(const r of n.addedNodes)r.tagName==="LINK"&&r.rel==="modulepreload"&&i(r)}).observe(document,{childList:!0,subtree:!0});function t(s){const n={};return s.integrity&&(n.integrity=s.integrity),s.referrerPolicy&&(n.referrerPolicy=s.referrerPolicy),s.crossOrigin==="use-credentials"?n.credentials="include":s.crossOrigin==="anonymous"?n.credentials="omit":n.credentials="same-origin",n}function i(s){if(s.ep)return;s.ep=!0;const n=t(s);fetch(s.href,n)}})();const q=class q{constructor(){this.objects=[],this.tanks=[]}registerType(e){const t=this.constructor.types.length;this.constructor.types.push(e),this.constructor.typesByName.set(e.name,t)}insert(e){e.idx=this.objects.length,this.objects.push(e)}tick(){for(const e of this.objects)e&&e.tick&&e.tick()}spawn(e,...t){const i=new e(this);return this.insert(i),i.spawn&&typeof i.spawn=="function"&&i.spawn(...t),i.anySpawn&&typeof i.anySpawn=="function"&&i.anySpawn(),i.constructor.name==="Tank"&&this.tanks.push(i),i}destroy(e){const t=this.objects.indexOf(e);t!==-1&&this.objects.splice(t,1);const i=this.tanks.indexOf(e);i!==-1&&this.tanks.splice(i,1),e.destroy&&e.destroy()}};q.types=[],q.typesByName=new Map;let fe=q;const A=8,g=32,w=g*A,T=256,$e=T*g,nt=20,{round:Pe,floor:rt,min:ot}=Math,R=[{ascii:"|",description:"building"},{ascii:" ",description:"river"},{ascii:"~",description:"swamp"},{ascii:"%",description:"crater"},{ascii:"=",description:"road"},{ascii:"#",description:"forest"},{ascii:":",description:"rubble"},{ascii:".",description:"grass"},{ascii:"}",description:"shot building"},{ascii:"b",description:"river with boat"},{ascii:"^",description:"deep sea"}];function lt(){for(const a of R)R[a.ascii]=a}lt();class ge{constructor(e,t,i,s){this.map=e,this.x=t,this.y=i,this.type=R["^"],this.mine=this.isEdgeCell(),this.idx=i*T+t}neigh(e,t){return this.map.cellAtTile(this.x+e,this.y+t)}isType(...e){for(let t=0;t<arguments.length;t++){const i=arguments[t];if(this.type===i||this.type.ascii===i)return!0}return!1}isEdgeCell(){return this.x<=20||this.x>=236||this.y<=20||this.y>=236}getNumericType(){if(this.type.ascii==="^")return-1;let e=R.indexOf(this.type);return this.mine&&(e+=8),e}setType(e,t,i){if(i=i??1,this.type,this.mine,t!==void 0&&(this.mine=t),typeof e=="string"){if(this.type=R[e],e.length!==1||!this.type)throw new Error(`Invalid terrain type: ${e}`)}else if(typeof e=="number"){if(e>=10?(e-=8,this.mine=!0):this.mine=!1,this.type=R[e],!this.type)throw new Error(`Invalid terrain type: ${e}`)}else e!==null&&(this.type=e);this.isEdgeCell()&&(this.mine=!0),i>=0&&this.map.retile(this.x-i,this.y-i,this.x+i,this.y+i)}setTile(e,t){this.mine&&!this.pill&&!this.base&&(t+=10),this.map.view.onRetile(this,e,t)}retile(){if(this.pill)this.setTile(this.pill.armour,2);else if(this.base)this.setTile(16,0);else switch(this.type.ascii){case"^":this.retileDeepSea();break;case"|":this.retileBuilding();break;case" ":this.retileRiver();break;case"~":this.setTile(7,1);break;case"%":this.setTile(5,1);break;case"=":this.retileRoad();break;case"#":this.retileForest();break;case":":this.setTile(4,1);break;case".":this.setTile(2,1);break;case"}":this.setTile(8,1);break;case"b":this.retileBoat();break}}retileDeepSea(){const e=(u,c)=>{const f=this.neigh(u,c);return f.isType("^")?"d":f.isType(" ","b")?"w":"l"},t=e(0,-1),i=e(1,-1),s=e(1,0),n=e(1,1),r=e(0,1),l=e(-1,1),o=e(-1,0);e(-1,-1)!=="d"&&t!=="d"&&o!=="d"&&s==="d"&&r==="d"?this.setTile(10,3):i!=="d"&&t!=="d"&&s!=="d"&&o==="d"&&r==="d"?this.setTile(11,3):n!=="d"&&r!=="d"&&s!=="d"&&o==="d"&&t==="d"?this.setTile(13,3):l!=="d"&&r!=="d"&&o!=="d"&&s==="d"&&t==="d"?this.setTile(12,3):o==="w"&&s==="d"?this.setTile(14,3):r==="w"&&t==="d"?this.setTile(15,3):t==="w"&&r==="d"?this.setTile(16,3):s==="w"&&o==="d"?this.setTile(17,3):this.setTile(0,0)}retileBuilding(){const e=(u,c)=>this.neigh(u,c).isType("|","}")?"b":"o",t=e(0,-1),i=e(1,-1),s=e(1,0),n=e(1,1),r=e(0,1),l=e(-1,1),o=e(-1,0),h=e(-1,-1);h==="b"&&t==="b"&&i==="b"&&o==="b"&&s==="b"&&l==="b"&&r==="b"&&n==="b"?this.setTile(17,1):s==="b"&&t==="b"&&r==="b"&&o==="b"&&i!=="b"&&h!=="b"&&n!=="b"&&l!=="b"?this.setTile(30,1):s==="b"&&t==="b"&&r==="b"&&o==="b"&&i!=="b"&&h!=="b"&&n!=="b"&&l==="b"?this.setTile(22,2):s==="b"&&t==="b"&&r==="b"&&o==="b"&&i!=="b"&&h==="b"&&n!=="b"&&l!=="b"?this.setTile(23,2):s==="b"&&t==="b"&&r==="b"&&o==="b"&&i!=="b"&&h!=="b"&&n==="b"&&l!=="b"?this.setTile(24,2):s==="b"&&t==="b"&&r==="b"&&o==="b"&&i==="b"&&h!=="b"&&n!=="b"&&l!=="b"?this.setTile(25,2):h==="b"&&t==="b"&&o==="b"&&s==="b"&&l==="b"&&r==="b"&&n==="b"?this.setTile(16,2):t==="b"&&i==="b"&&o==="b"&&s==="b"&&l==="b"&&r==="b"&&n==="b"?this.setTile(17,2):h==="b"&&t==="b"&&i==="b"&&o==="b"&&s==="b"&&l==="b"&&r==="b"?this.setTile(18,2):h==="b"&&t==="b"&&i==="b"&&o==="b"&&s==="b"&&r==="b"&&n==="b"?this.setTile(19,2):o==="b"&&s==="b"&&t==="b"&&r==="b"&&i==="b"&&l==="b"&&h!=="b"&&n!=="b"?this.setTile(20,2):o==="b"&&s==="b"&&t==="b"&&r==="b"&&n==="b"&&h==="b"&&i!=="b"&&l!=="b"?this.setTile(21,2):t==="b"&&o==="b"&&s==="b"&&r==="b"&&n==="b"&&i==="b"?this.setTile(8,2):t==="b"&&o==="b"&&s==="b"&&r==="b"&&l==="b"&&h==="b"?this.setTile(9,2):t==="b"&&o==="b"&&s==="b"&&r==="b"&&l==="b"&&n==="b"?this.setTile(10,2):t==="b"&&o==="b"&&s==="b"&&r==="b"&&h==="b"&&i==="b"?this.setTile(11,2):t==="b"&&r==="b"&&o==="b"&&s!=="b"&&l==="b"&&h!=="b"?this.setTile(12,2):t==="b"&&r==="b"&&s==="b"&&n==="b"&&o!=="b"&&i!=="b"?this.setTile(13,2):t==="b"&&r==="b"&&s==="b"&&i==="b"&&n!=="b"?this.setTile(14,2):t==="b"&&r==="b"&&o==="b"&&h==="b"&&l!=="b"?this.setTile(15,2):s==="b"&&t==="b"&&o==="b"&&r!=="b"&&h!=="b"&&i!=="b"?this.setTile(26,1):s==="b"&&r==="b"&&o==="b"&&l!=="b"&&n!=="b"?this.setTile(27,1):s==="b"&&t==="b"&&r==="b"&&i!=="b"&&n!=="b"?this.setTile(28,1):r==="b"&&t==="b"&&o==="b"&&h!=="b"&&l!=="b"?this.setTile(29,1):o==="b"&&s==="b"&&t==="b"&&i==="b"&&h!=="b"?this.setTile(4,2):o==="b"&&s==="b"&&t==="b"&&h==="b"&&i!=="b"?this.setTile(5,2):o==="b"&&s==="b"&&r==="b"&&l==="b"&&n!=="b"?this.setTile(6,2):o==="b"&&s==="b"&&r==="b"&&t!=="b"&&n==="b"&&l!=="b"?this.setTile(7,2):s==="b"&&t==="b"&&r==="b"?this.setTile(0,2):o==="b"&&t==="b"&&r==="b"?this.setTile(1,2):s==="b"&&o==="b"&&r==="b"?this.setTile(2,2):s==="b"&&t==="b"&&o==="b"?this.setTile(3,2):s==="b"&&r==="b"&&n==="b"?this.setTile(18,1):o==="b"&&r==="b"&&l==="b"?this.setTile(19,1):s==="b"&&t==="b"&&i==="b"?this.setTile(20,1):o==="b"&&t==="b"&&h==="b"?this.setTile(21,1):s==="b"&&r==="b"?this.setTile(22,1):o==="b"&&r==="b"?this.setTile(23,1):s==="b"&&t==="b"?this.setTile(24,1):o==="b"&&t==="b"?this.setTile(25,1):o==="b"&&s==="b"?this.setTile(11,1):t==="b"&&r==="b"?this.setTile(12,1):s==="b"?this.setTile(13,1):o==="b"?this.setTile(14,1):r==="b"?this.setTile(15,1):t==="b"?this.setTile(16,1):this.setTile(6,1)}retileRiver(){const e=(r,l)=>{const o=this.neigh(r,l);return o.isType("=")?"r":o.isType("^"," ","b")?"w":"l"},t=e(0,-1),i=e(1,0),s=e(0,1),n=e(-1,0);t==="l"&&s==="l"&&i==="l"&&n==="l"?this.setTile(30,2):t==="l"&&s==="l"&&i==="w"&&n==="l"?this.setTile(26,2):t==="l"&&s==="l"&&i==="l"&&n==="w"?this.setTile(27,2):t==="l"&&s==="w"&&i==="l"&&n==="l"?this.setTile(28,2):t==="w"&&s==="l"&&i==="l"&&n==="l"?this.setTile(29,2):t==="l"&&n==="l"?this.setTile(6,3):t==="l"&&i==="l"?this.setTile(7,3):s==="l"&&n==="l"?this.setTile(8,3):s==="l"&&i==="l"?this.setTile(9,3):s==="l"&&t==="l"&&s==="l"?this.setTile(0,3):n==="l"&&i==="l"?this.setTile(1,3):n==="l"?this.setTile(2,3):s==="l"?this.setTile(3,3):i==="l"?this.setTile(4,3):t==="l"?this.setTile(5,3):this.setTile(1,0)}retileRoad(){const e=(u,c)=>{const f=this.neigh(u,c);return f.isType("=")?"r":f.isType("^"," ","b")?"w":"l"},t=e(0,-1),i=e(1,-1),s=e(1,0),n=e(1,1),r=e(0,1),l=e(-1,1),o=e(-1,0),h=e(-1,-1);h!=="r"&&t==="r"&&i!=="r"&&o==="r"&&s==="r"&&l!=="r"&&r==="r"&&n!=="r"?this.setTile(11,0):t==="r"&&o==="r"&&s==="r"&&r==="r"?this.setTile(10,0):o==="w"&&s==="w"&&t==="w"&&r==="w"?this.setTile(26,0):s==="r"&&r==="r"&&o==="w"&&t==="w"?this.setTile(20,0):o==="r"&&r==="r"&&s==="w"&&t==="w"?this.setTile(21,0):t==="r"&&o==="r"&&r==="w"&&s==="w"?this.setTile(22,0):s==="r"&&t==="r"&&o==="w"&&r==="w"?this.setTile(23,0):t==="w"&&r==="w"?this.setTile(24,0):o==="w"&&s==="w"?this.setTile(25,0):t==="w"&&r==="r"?this.setTile(16,0):s==="w"&&o==="r"?this.setTile(17,0):r==="w"&&t==="r"?this.setTile(18,0):o==="w"&&s==="r"?this.setTile(19,0):s==="r"&&r==="r"&&t==="r"&&(i==="r"||n==="r")?this.setTile(27,0):o==="r"&&s==="r"&&r==="r"&&(l==="r"||n==="r")?this.setTile(28,0):o==="r"&&t==="r"&&r==="r"&&(l==="r"||h==="r")?this.setTile(29,0):o==="r"&&s==="r"&&t==="r"&&(i==="r"||h==="r")?this.setTile(30,0):o==="r"&&s==="r"&&r==="r"?this.setTile(12,0):o==="r"&&t==="r"&&r==="r"?this.setTile(13,0):o==="r"&&s==="r"&&t==="r"?this.setTile(14,0):s==="r"&&t==="r"&&r==="r"?this.setTile(15,0):r==="r"&&s==="r"&&n==="r"?this.setTile(6,0):r==="r"&&o==="r"&&l==="r"?this.setTile(7,0):t==="r"&&o==="r"&&h==="r"?this.setTile(8,0):t==="r"&&s==="r"&&i==="r"?this.setTile(9,0):r==="r"&&s==="r"?this.setTile(2,0):r==="r"&&o==="r"?this.setTile(3,0):t==="r"&&o==="r"?this.setTile(4,0):t==="r"&&s==="r"?this.setTile(5,0):s==="r"||o==="r"?this.setTile(0,1):t==="r"||r==="r"?this.setTile(1,1):this.setTile(10,0)}retileForest(){const e=this.neigh(0,-1).isType("#"),t=this.neigh(1,0).isType("#"),i=this.neigh(0,1).isType("#"),s=this.neigh(-1,0).isType("#");!e&&!s&&t&&i?this.setTile(9,9):!e&&s&&!t&&i?this.setTile(10,9):e&&s&&!t&&!i?this.setTile(11,9):e&&!s&&t&&!i?this.setTile(12,9):e&&!s&&!t&&!i?this.setTile(16,9):!e&&!s&&!t&&i?this.setTile(15,9):!e&&s&&!t&&!i?this.setTile(14,9):!e&&!s&&t&&!i?this.setTile(13,9):!e&&!s&&!t&&!i?this.setTile(8,9):this.setTile(3,1)}retileBoat(){const e=(r,l)=>this.neigh(r,l).isType("^"," ","b")?"w":"l",t=e(0,-1),i=e(1,0),s=e(0,1),n=e(-1,0);t!=="w"&&n!=="w"?this.setTile(15,6):t!=="w"&&i!=="w"?this.setTile(16,6):s!=="w"&&i!=="w"?this.setTile(17,6):s!=="w"&&n!=="w"?this.setTile(14,6):n!=="w"?this.setTile(12,6):i!=="w"?this.setTile(13,6):s!=="w"?this.setTile(10,6):this.setTile(11,6)}}class at{onRetile(e,t,i){}}class ye{constructor(e){this.x=0,this.y=0,this.map=e,this.cell=e.cells[this.y][this.x]}}class Me extends ye{constructor(e,t,i,s,n,r){super(e),this.x=t,this.y=i,this.owner_idx=s,this.armour=n,this.speed=r,this.cell=e.cells[this.y][this.x]}}class Re extends ye{constructor(e,t,i,s,n,r,l){super(e),this.x=t,this.y=i,this.owner_idx=s,this.armour=n,this.shells=r,this.mines=l,this.cell=e.cells[this.y][this.x]}}class _e extends ye{constructor(e,t,i,s){super(e),this.x=t,this.y=i,this.direction=s,this.cell=e.cells[this.y][this.x]}}var H;let ht=(H=class{constructor(){this.CellClass=ge,this.PillboxClass=Me,this.BaseClass=Re,this.StartClass=_e,this.pills=[],this.bases=[],this.starts=[],this.cells=[],this.view=new at,this.cells=new Array(T);for(let e=0;e<T;e++){const t=this.cells[e]=new Array(T);for(let i=0;i<T;i++)t[i]=new this.CellClass(this,i,e)}}setView(e){this.view=e,this.retile()}cellAtTile(e,t){var s;const i=(s=this.cells[t])==null?void 0:s[e];return i||new this.CellClass(this,e,t,{isDummy:!0})}each(e,t,i,s,n){const r=t!==void 0&&t>=0?t:0,l=i!==void 0&&i>=0?i:0,o=s!==void 0&&s<T?s:T-1,h=n!==void 0&&n<T?n:T-1;for(let u=l;u<=h;u++){const c=this.cells[u];for(let f=r;f<=o;f++)e.call(c[f],c[f])}return this}clear(e,t,i,s){this.each(function(){this.type=R["^"],this.mine=this.isEdgeCell()},e,t,i,s)}retile(e,t,i,s){this.each(function(){this.retile()},e,t,i,s)}findCenterCell(){let e=T-1,t=T-1,i=0,s=0;this.each(function(l){t>l.x&&(t=l.x),s<l.x&&(s=l.x),e>l.y&&(e=l.y),i<l.y&&(i=l.y)}),t>s&&(e=t=0,i=s=T-1);const n=Pe(t+(s-t)/2),r=Pe(e+(i-e)/2);return this.cellAtTile(n,r)}dump(e){e=e||{};const t=(p,C)=>{let m=null,k=null,x=0;for(let P=0;P<p.length;P++){const B=p[P].getNumericType();if(m===B){x++;continue}m!==null&&C(m,x,k),m=B,k=P,x=1}m!==null&&C(m,x,k)},i=p=>{const C=[];let m=null;for(let k=0;k<p.length;k++){let x=p[k]&15;k%2===0?m=x<<4:(C.push(m+x),m=null)}return m!==null&&C.push(m),C},s=e.noPills?[]:this.pills,n=e.noBases?[]:this.bases,r=e.noStarts?[]:this.starts;let l=[];for(const p of"BMAPBOLO")l.push(p.charCodeAt(0));l.push(1,s.length,n.length,r.length);for(const p of s)l.push(p.x,p.y,p.owner_idx,p.armour,p.speed);for(const p of n)l.push(p.x,p.y,p.owner_idx,p.armour,p.shells,p.mines);for(const p of r)l.push(p.x,p.y,p.direction);let o=null,h=null,u=0,c=0,f=0;const d=()=>{if(!o)return;y();const p=i(o);l.push(p.length+4,f,u,c),l=l.concat(p),o=null},b=p=>{251*2-o.length<p&&(d(),o=[],u=c)},y=()=>{if(!h)return;const p=h;h=null,b(p.length+1),o.push(p.length-1),o=o.concat(p),c+=p.length};for(const p of this.cells)f=p[0].y,o=null,u=c=0,h=null,t(p,(C,m,k)=>{if(C===-1){d();return}if(o||(o=[],u=c=k),m>2)for(y();m>2;){b(2);const x=ot(m,9);o.push(x+6,C),c+=x,m-=x}for(;m>0;)h||(h=[]),h.push(C),h.length===8&&y(),m--});return d(),l.push(4,255,255,255),l}static load(e){let t=0;const i=(d,b)=>{let y;try{y=[];for(let p=t;p<t+d;p++)y.push(e[p])}catch{throw new Error(b)}return t+=d,y},s=i(8,"Not a Bolo map.");for(let d=0;d<8;d++)if("BMAPBOLO"[d].charCodeAt(0)!==s[d])throw new Error("Not a Bolo map.");const[n,r,l,o]=i(4,"Incomplete header");if(n!==1)throw new Error(`Unsupported map version: ${n}`);const h=new this,u=[];for(let d=0;d<r;d++)u.push(i(5,"Incomplete pillbox data"));const c=[];for(let d=0;d<l;d++)c.push(i(6,"Incomplete base data"));const f=[];for(let d=0;d<o;d++)f.push(i(3,"Incomplete player start data"));for(;;){const[d,b,y,p]=i(4,"Incomplete map data"),C=d-4;if(C===0&&b===255&&y===255&&p===255)break;const m=i(C,"Incomplete map data");let k=0;const x=()=>{const M=rt(k),B=M===k?(m[M]&240)>>4:m[M]&15;return k+=.5,B};let P=y;for(;P<p;){const M=x();if(M<8)for(let B=1;B<=M+1;B++)h.cellAtTile(P++,b).setType(x(),void 0,-1);else{const B=x();for(let He=1;He<=M-6;He++)h.cellAtTile(P++,b).setType(B,void 0,-1)}}}return h.pills=u.map(d=>new h.PillboxClass(h,...d)),h.bases=c.map(d=>new h.BaseClass(h,...d)),h.starts=f.map(([d,b,y])=>new h.StartClass(h,d,b,y)),h}},H.CellClass=ge,H.PillboxClass=Me,H.BaseClass=Re,H.StartClass=_e,H);const Xe=0,Ye=1,Je=2,qe=3,D=4,Ze=5,we=6,xe=7,ke=8,W=9,Te=10,ve=11,{sqrt:ct,atan2:dt}=Math;function Ce(a,e){for(const t in e)Object.prototype.hasOwnProperty.call(e,t)&&(a[t]=e[t]);return a}function v(a,e){const t=a.x-e.x,i=a.y-e.y;return ct(t*t+i*i)}function Y(a,e){return dt(e.y-a.y,e.x-a.x)}class et{constructor(){this.events=new Map}on(e,t){return this.events.has(e)||this.events.set(e,[]),this.events.get(e).push(t),this}once(e,t){const i=(...s)=>{this.off(e,i),t.apply(this,s)};return this.on(e,i)}off(e,t){const i=this.events.get(e);if(i){const s=i.indexOf(t);s!==-1&&i.splice(s,1),i.length===0&&this.events.delete(e)}return this}emit(e,...t){const i=this.events.get(e);return i?(i.slice().forEach(s=>s.apply(this,t)),!0):!1}removeAllListeners(e){return e?this.events.delete(e):this.events.clear(),this}}class ut extends et{constructor(e){super(),this.idx=-1,this.x=null,this.y=null,this.world=e}destroy(){}tick(){}}function pt(a){return[a&255]}function ft(a){return[(a&65280)>>8,a&255]}function gt(a){return[(a&4278190080)>>>24,(a&16711680)>>16,(a&65280)>>8,a&255]}function bt(a,e){return a[e]}function mt(a,e){return(a[e]<<8)+a[e+1]}function yt(a,e){return(a[e]<<24)+(a[e+1]<<16)+(a[e+2]<<8)+a[e+3]}function wt(){let a=[],e=null,t=0;const i=()=>{e!==null&&(a.push(e),e=null)},s=(n,r)=>{if(n==="f")e===null?(e=r?1:0,t=1):(r&&(e|=1<<t),t++,t===8&&i());else{i();const l=r;let o;switch(n){case"B":o=pt(l);break;case"H":o=ft(l);break;case"I":o=gt(l);break;default:throw new Error(`Unknown format character ${n}`)}a=a.concat(o)}};return s.finish=()=>(i(),a),s}function tt(a,e=0){let t=e,i=0;const s=n=>{let r;if(n==="f")r=(1<<i&a[t])>0,i++,i===8&&(t++,i=0);else{i!==0&&(t++,i=0);let l;switch(n){case"B":r=bt(a,t),l=1;break;case"H":r=mt(a,t),l=2;break;case"I":r=yt(a,t),l=4;break;default:throw new Error(`Unknown format character ${n}`)}t+=l}return r};return s.finish=()=>(i!==0&&t++,t-e),s}function G(a,e,t){const i=tt(e,t),s=[];for(const n of a)s.push(i(n));return[s,i.finish()]}class xt extends ut{constructor(e){super(e),this._net_type_idx=0}ref(e,t){this[e]=t?{$:t}:null}tick(){this.update&&this.update()}dump(e=!1){if(!this.serialization)return[];const t=wt();return this.serialization(e,(i,s,n)=>{let r=this[s];if(n!=null&&n.tx&&(r=n.tx(r)),i==="O"){const l=r==null?void 0:r.$,o=(l==null?void 0:l.idx)??65535;t("H",o)}else t(i,r)}),t.finish()}load(e,t,i=!1){if(!this.serialization)return 0;const s=tt(e,t),n={};return this.serialization(i,(r,l,o)=>{let h;if(r==="O"){const c=s("H");if(c===65535)h=null;else{const f=this.world.objects[c];h=f?{$:f}:null}}else h=s(r);o!=null&&o.rx&&(h=o.rx(h));const u=Object.getOwnPropertyDescriptor(Object.getPrototypeOf(this),l);u&&u.set?u.set.call(this,h):this[l]=h,n[l]=h}),this.emit&&this.emit("netUpdate",n),s.finish()}}class $ extends xt{constructor(){super(...arguments),this.styled=null,this.x=null,this.y=null}soundEffect(e){this.world.soundEffect(e,this.x,this.y,this)}getTile(){}}const{floor:kt}=Math;class L extends ${constructor(){super(...arguments),this.styled=!1,this.lifespan=0}serialization(e,t){e&&(t("H","x"),t("H","y")),t("B","lifespan")}getTile(){switch(kt(this.lifespan/3)){case 7:return[20,3];case 6:return[21,3];case 5:return[20,4];case 4:return[21,4];case 3:return[20,5];case 2:return[21,5];case 1:return[18,4];default:return[19,4]}}spawn(e,t){this.x=e,this.y=t,this.lifespan=23}update(){this.lifespan--===0&&this.world.destroy&&this.world.destroy(this)}}class E extends ${constructor(){super(...arguments),this.styled=null,this.lifespan=0}serialization(e,t){e&&(t("H","x"),t("H","y")),t("B","lifespan")}spawn(e){[this.x,this.y]=e.getWorldCoordinates(),this.lifespan=10}anySpawn(){this.cell=this.world.map.cellAtWorld(this.x,this.y)}update(){this.lifespan--===0&&this.world.spawn&&this.world.destroy&&(this.cell&&this.cell.mine&&this.asplode(),this.world.destroy(this))}asplode(){var e;this.cell.setType(null,!1,0),this.cell.takeExplosionHit();for(const t of this.world.tanks){t.armour!==255&&v(this,t)<384&&t.takeMineHit();const i=(e=t.builder)==null?void 0:e.$;if(i){const{inTank:s,parachuting:n}=i.states;i.order!==s&&i.order!==n&&v(this,i)<w/2&&i.kill()}}this.world.spawn&&this.world.spawn(L,this.x,this.y),this.soundEffect(xe),this.spread()}spread(){if(!this.world.spawn)return;let e=this.cell.neigh(1,0);e.isEdgeCell()||this.world.spawn(E,e),e=this.cell.neigh(0,1),e.isEdgeCell()||this.world.spawn(E,e),e=this.cell.neigh(-1,0),e.isEdgeCell()||this.world.spawn(E,e),e=this.cell.neigh(0,-1),e.isEdgeCell()||this.world.spawn(E,e)}}const{round:se,cos:Tt,sin:vt,PI:Ct}=Math;class ee extends ${constructor(e){super(e),this.updatePriority=20,this.styled=!1,this.direction=0,this.lifespan=0,this.onWater=!1,this.on("netSync",()=>{this.updateCell()})}serialization(e,t){e&&(t("B","direction"),t("O","owner"),t("O","attribution"),t("f","onWater")),t("H","x"),t("H","y"),t("B","lifespan")}updateCell(){this.cell=this.world.map.cellAtWorld(this.x,this.y)}getDirection16th(){return se((this.direction-1)/16)%16}getTile(){return[this.getDirection16th(),4]}spawn(e,t){var i;t=t||{},this.ref("owner",e),this.owner.$.hasOwnProperty("owner_idx")?this.ref("attribution",(i=this.owner.$.owner)==null?void 0:i.$):this.ref("attribution",this.owner.$),this.direction=t.direction||this.owner.$.direction,this.lifespan=(t.range||7)*w/32-2,this.onWater=t.onWater||!1,this.x=this.owner.$.x,this.y=this.owner.$.y,this.move()}update(){this.move();const e=this.collide();if(e){const[t,i]=e,s=i.takeShellHit(this);let n,r;t==="cell"?([n,r]=this.cell.getWorldCoordinates(),this.world.soundEffect(s,n,r)):(n=this.x,r=this.y,i.soundEffect(s)),this.asplode(n,r,t)}else this.lifespan--===0&&this.asplode(this.x,this.y,"eol")}move(){this.radians||(this.radians=(256-this.direction)*2*Ct/256),this.x=this.x+se(Tt(this.radians)*32),this.y=this.y+se(vt(this.radians)*32),this.updateCell()}collide(){var i,s,n,r,l;const e=this.cell.pill;if(e&&e.armour>0&&e!==((i=this.owner)==null?void 0:i.$)){const[o,h]=this.cell.getWorldCoordinates();if(v(this,{x:o,y:h})<=127)return["cell",e]}for(const o of this.world.tanks)if(o!==((s=this.owner)==null?void 0:s.$)&&o.armour!==255&&v(this,o)<=127)return["tank",o];if(((n=this.attribution)==null?void 0:n.$)===((r=this.owner)==null?void 0:r.$)){const o=this.cell.base;if(o&&o.armour>4&&(this.onWater||o!=null&&o.owner&&!o.owner.$.isAlly((l=this.attribution)==null?void 0:l.$)))return["cell",o]}return(this.onWater?!this.cell.isType("^"," ","%"):this.cell.isType("|","}","#","b"))?["cell",this.cell]:null}asplode(e,t,i){var s;for(const n of this.world.tanks){const r=(s=n.builder)==null?void 0:s.$;if(r){const{inTank:l,parachuting:o}=r.states;r.order!==l&&r.order!==o&&(i==="cell"?r.cell===this.cell&&r.kill():v(this,r)<w/2&&r.kill())}}this.world.spawn&&this.world.destroy&&(this.world.spawn(L,e,t),this.world.spawn(E,this.cell),this.world.destroy(this))}}const{min:U,max:ne,round:re,ceil:oe,PI:Oe,cos:At,sin:St}=Math;class te extends ${constructor(e,t,i,s,n,r){super(arguments.length===1?e:null),this.team=255,this.styled=!0,this.owner_idx=255,this.armour=0,this.speed=0,this.coolDown=0,this.reload=0,this.inTank=!1,this.carried=!1,this.haveTarget=!1,this.cell=null,arguments.length>1&&(this.map=e,this.x=(t+.5)*w,this.y=(i+.5)*w,this.owner_idx=s,this.armour=n,this.speed=r),this.on("netUpdate",l=>{var o,h;(l.hasOwnProperty("x")||l.hasOwnProperty("y"))&&this.updateCell(),(l.hasOwnProperty("inTank")||l.hasOwnProperty("carried"))&&this.updateCell(),l.hasOwnProperty("owner")&&!l.hasOwnProperty("team")&&this.updateOwner(),l.hasOwnProperty("armour")&&((o=this.cell)==null||o.retile()),l.hasOwnProperty("team")&&((h=this.cell)==null||h.retile())})}updateCell(){this.cell&&(delete this.cell.pill,this.cell.retile()),this.inTank||this.carried?this.cell=null:(this.cell=this.world.map.cellAtWorld(this.x,this.y),this.cell.pill=this,this.cell.retile())}updateOwner(){var e;this.owner&&(this.owner_idx=this.owner.$.tank_idx,this.team=this.owner.$.team),(e=this.cell)==null||e.retile()}serialization(e,t){t("O","owner"),t("B","owner_idx"),t("B","team"),t("f","inTank"),t("f","carried"),t("f","haveTarget"),!this.inTank&&!this.carried?(t("H","x"),t("H","y")):this.x=this.y=null,t("B","armour"),t("B","speed"),t("B","coolDown"),t("B","reload")}getTile(){return this.armour===0?[18,0]:[16+this.armour,0]}placeAt(e){this.inTank=this.carried=!1,[this.x,this.y]=e.getWorldCoordinates(),this.updateCell(),this.reset()}spawn(){this.reset()}reset(){this.coolDown=32,this.reload=0}anySpawn(){this.updateCell()}update(){if(this.inTank||this.carried)return;if(this.armour===0){this.haveTarget=!1;for(const i of this.world.tanks)if(i.armour!==255&&i.cell===this.cell){this.inTank=!0,this.x=this.y=null,this.updateCell(),this.ref("owner",i),this.updateOwner();break}return}if(this.reload=U(this.speed,this.reload+1),--this.coolDown===0&&(this.coolDown=32,this.speed=U(100,this.speed+1)),this.reload<this.speed)return;let e=null,t=1/0;for(const i of this.world.tanks){const s=this.team===null||this.team===255?!0:i.team!==this.team;if(i.armour!==255&&s&&!i.hidden){const n=v(this,i);n<=2048&&n<t&&(e=i,t=n)}}if(!e){this.haveTarget=!1;return}if(this.haveTarget){const i=(256-e.getDirection16th()*16)*2*Oe/256,s=e.x+t/32*re(At(i)*oe(e.speed)),n=e.y+t/32*re(St(i)*oe(e.speed)),r=256-Y(this,{x:s,y:n})*256/(2*Oe);this.world.spawn&&this.world.spawn(ee,this,{direction:r}),this.soundEffect(ke)}this.haveTarget=!0,this.reload=0}aggravate(){this.coolDown=32,this.speed=ne(6,re(this.speed/2))}takeShellHit(e){return this.aggravate(),this.armour=ne(0,this.armour-1),this.cell.retile(),W}takeExplosionHit(){this.armour=ne(0,this.armour-5),this.cell.retile()}repair(e){const t=U(e,oe((15-this.armour)/4));return this.armour=U(15,this.armour+t*4),this.cell.retile(),t}}const{min:Et,max:Bt}=Math;class ie extends ${constructor(e,t,i,s,n,r,l){super(arguments.length===1?e:null),this.owner_idx=255,this._team=255,this.styled=!0,this.armour=0,this.shells=0,this.mines=0,this.refuelCounter=0,arguments.length>1&&(this.map=e,this.x=(t+.5)*w,this.y=(i+.5)*w,this.owner_idx=s,this.armour=n,this.shells=r,this.mines=l,e.cellAtTile(t,i).setType("=",!1,-1)),this.on("netUpdate",o=>{var u,c;const h=((u=this.world)==null?void 0:u.map)||this.map;(o.hasOwnProperty("x")||o.hasOwnProperty("y"))&&this.x!=null&&this.y!=null&&h&&(this.cell=h.cellAtWorld(this.x,this.y),this.cell.base=this),o.hasOwnProperty("owner")&&!o.hasOwnProperty("team")&&this.updateOwner(),o.hasOwnProperty("team")&&((c=this.cell)==null||c.retile())})}get team(){return this._team}set team(e){this._team=e}serialization(e,t){e&&(t("H","x"),t("H","y")),t("O","owner"),t("B","owner_idx"),t("B","team"),t("O","refueling"),t("B","refuelCounter"),t("B","armour"),t("B","shells"),t("B","mines")}updateOwner(){var e;this.owner&&(this.owner_idx=this.owner.$.tank_idx,this.team=this.owner.$.team),(e=this.cell)==null||e.retile()}getTile(){return[16,0]}spawn(){}anySpawn(){this.cell=this.world.map.cellAtWorld(this.x,this.y),this.cell.base=this}update(){if(this.world.authority){const t=this.world.tanks.filter(i=>i.armour!==255).length/1e3;Math.random()<t&&(this.armour<90?this.armour++:this.shells<90?this.shells++:this.mines<90&&this.mines++)}if(this.refueling){const e=this.refueling.$.cell,t=this.refueling.$.armour;(e!==this.cell||t===255)&&this.ref("refueling",null)}if(!this.refueling){this.findSubject();return}if(--this.refuelCounter===0)if(this.armour>0&&this.refueling.$.armour<40){const e=Et(5,this.armour,40-this.refueling.$.armour);this.refueling.$.armour+=e,this.armour-=e,this.refuelCounter=46}else this.shells>0&&this.refueling.$.shells<40?(this.refueling.$.shells+=1,this.shells-=1,this.refuelCounter=7):this.mines>0&&this.refueling.$.mines<40?(this.refueling.$.mines+=1,this.mines-=1,this.refuelCounter=7):this.refuelCounter=1}findSubject(){const e=this.world.tanks.filter(t=>t.armour!==255&&t.cell===this.cell);for(const t of e)if(this.team!==255&&t.team===this.team){this.ref("refueling",t),this.refuelCounter=46;break}else{let s=!0;for(const n of e)n!==t&&(t.isAlly(n)||(s=!1));if(s){this.ref("owner",t),this.updateOwner(),this.ref("refueling",t),this.refuelCounter=46;break}}}takeShellHit(e){var t;if(this.owner)for(const i of this.world.map.pills)!i.inTank&&!i.carried&&i.armour>0&&(t=i.owner)!=null&&t.$.isAlly(this.owner.$)&&v(this,i)<=2304&&i.aggravate();return this.armour=Bt(0,this.armour-5),W}}class j extends ${constructor(){super(...arguments),this.styled=null,this.lifespan=0,this.neighbours=[]}serialization(e,t){e&&(t("H","x"),t("H","y")),t("B","lifespan")}spawn(e){[this.x,this.y]=e.getWorldCoordinates(),this.lifespan=16}anySpawn(){this.cell=this.world.map.cellAtWorld(this.x,this.y),this.neighbours=[this.cell.neigh(1,0),this.cell.neigh(0,1),this.cell.neigh(-1,0),this.cell.neigh(0,-1)]}update(){this.lifespan--===0&&(this.flood(),this.world.destroy&&this.world.destroy(this))}canGetWet(){let e=!1;for(const t of this.neighbours)if(!t.base&&!t.pill&&t.isType(" ","^","b")){e=!0;break}return e}flood(){this.canGetWet()&&(this.cell.setType(" ",!1),this.spread())}spread(){if(this.world.spawn)for(const e of this.neighbours)!e.base&&!e.pill&&e.isType("%")&&this.world.spawn(j,e)}}const{round:It,random:Ht,floor:K}=Math,Le={"|":{tankSpeed:0,tankTurn:0,manSpeed:0}," ":{tankSpeed:3,tankTurn:.25,manSpeed:0},"~":{tankSpeed:3,tankTurn:.25,manSpeed:4},"%":{tankSpeed:3,tankTurn:.25,manSpeed:4},"=":{tankSpeed:16,tankTurn:1,manSpeed:16},"#":{tankSpeed:6,tankTurn:.5,manSpeed:8},":":{tankSpeed:3,tankTurn:.25,manSpeed:4},".":{tankSpeed:12,tankTurn:1,manSpeed:16},"}":{tankSpeed:0,tankTurn:0,manSpeed:0},b:{tankSpeed:16,tankTurn:1,manSpeed:16},"^":{tankSpeed:3,tankTurn:.5,manSpeed:0}};function $t(){for(const a in Le){const e=Le[a],t=R[a];for(const i in e)t[i]=e[i]}}$t();class Pt extends ge{constructor(e,t,i,s){super(e,t,i,s),this.life=0}isObstacle(){var e;return((e=this.pill)==null?void 0:e.armour)>0||this.type.tankSpeed===0}hasTankOnBoat(){for(const e of this.map.world.tanks)if(e.armour!==255&&e.cell===this&&e.onBoat)return!0;return!1}getTankSpeed(e){var t,i;return((t=this.pill)==null?void 0:t.armour)>0||(i=this.base)!=null&&i.owner&&!this.base.owner.$.isAlly(e)&&this.base.armour>9?0:e.onBoat&&this.isType("^"," ")?16:this.type.tankSpeed}getTankTurn(e){var t,i;return((t=this.pill)==null?void 0:t.armour)>0||(i=this.base)!=null&&i.owner&&!this.base.owner.$.isAlly(e)&&this.base.armour>9?0:e.onBoat&&this.isType("^"," ")?1:this.type.tankTurn}getManSpeed(e){var i,s;const t=e.owner.$;return((i=this.pill)==null?void 0:i.armour)>0||(s=this.base)!=null&&s.owner&&!this.base.owner.$.isAlly(t)&&this.base.armour>9?0:this.type.manSpeed}getPixelCoordinates(){return[(this.x+.5)*g,(this.y+.5)*g]}getWorldCoordinates(){return[(this.x+.5)*w,(this.y+.5)*w]}setType(e,t,i){var l;const s=this.type,n=this.mine,r=this.life;super.setType(e,t,i),this.life=(()=>{switch(this.type.ascii){case".":return 5;case"}":return 5;case":":return 5;case"~":return 4;default:return 0}})(),(l=this.map.world)==null||l.mapChanged(this,s,n,r)}takeShellHit(e){var i,s;let t=W;if(this.isType(".","}",":","~"))if(--this.life===0){const n=(()=>{switch(this.type.ascii){case".":return"~";case"}":return":";case":":return" ";case"~":return" "}})();this.setType(n)}else(i=this.map.world)==null||i.mapChanged(this,this.type,this.mine);else if(this.isType("#"))this.setType("."),t=Te;else if(this.isType("="))(e.direction>=224||e.direction<32?this.neigh(1,0):e.direction>=32&&e.direction<96?this.neigh(0,-1):e.direction>=96&&e.direction<160?this.neigh(-1,0):this.neigh(0,1)).isType(" ","^")&&this.setType(" ");else{const n=(()=>{switch(this.type.ascii){case"|":return"}";case"b":return" "}})();this.setType(n)}return this.isType(" ")&&(s=this.map.world)!=null&&s.spawn&&this.map.world.spawn(j,this),t}takeExplosionHit(){var e;if(this.pill){this.pill.takeExplosionHit();return}if(this.isType("b"))this.setType(" ");else if(!this.isType(" ","^","b"))this.setType("%");else return;(e=this.map.world)!=null&&e.spawn&&this.map.world.spawn(j,this)}}class it extends ht{constructor(){super(),this.CellClass=Pt,this.PillboxClass=te,this.BaseClass=ie;for(let e=0;e<this.cells.length;e++){const t=this.cells[e];for(let i=0;i<t.length;i++){const s=t[i],n=new this.CellClass(this,i,e);n.type=s.type,n.mine=s.mine,t[i]=n}}}static load(e){return super.load(e)}findCenterCell(){return super.findCenterCell()}cellAtTile(e,t){return super.cellAtTile(e,t)}cellAtPixel(e,t){return this.cellAtTile(K(e/g),K(t/g))}cellAtWorld(e,t){return this.cellAtTile(K(e/w),K(t/w))}getRandomStart(){return this.starts[It(Ht()*(this.starts.length-1))]}}const Mt=`Qk1BUEJPTE8BEAsQW5H/D2Vjbv8PZV90/w9lVHX/D2VwbP8PZYFr/w9lq27/D2WueP8PZa58/w9l
mpL/D2Veh/8PZWmJ/w9lcYn/D2Vsf/8PZWx4/w9lrYn/D2WBaP9aWlqvaf9aWlpWbv9aWlquev9a
Wlp5e/9aWlpsfP9aWlqLff9aWlpti/9aWlpVjf9aWlqlkv9aWlp+mP9aWlpMjABMfABcZA1sZAx8
ZAyMZAycZAysZAu4fAi4jAisnAWcnASMnAR8nARsnARcnAMQZk608fHx8fHx8fHx8fGRGGdNtaH0
tNUB8PCQkgGSAeIB4vHh8pKRHWhNtZGU9YUE1QHnlOcAxIIB4gHiAfKygdKQkoEfaU21gZT1lQTV
Ade05wSSgYIB4pHCAfKC8ZEAhJKBIGpNtYGEhfSFBNUBx9TXBIeC8bKBooHiofICgQSBgoEja021
gQSFhNUEhQTVAbf0xwSXEhwrGSAaIBwqGCAfKSFCsSBsTbWBBIUE5QSFBNWRl/TUl/KSsaIBkqGy
gfKCBKKBIG1NtYEEhQSFpIUEhQT1AZf0xwT3t7LxAfIB8oIEooEjbk21gQSFBIWEFUhQSFBKUHpQ
Gn1NcE9/fCAfKioeIEooECBvTbWBBIUEtQSFBIUE9QG3tOcE9/eygZL3p5HCBKKBIXBNtYEEhQS1
BIUEhQT1gbeU9wT394eSAaL3x5GiBKKBIHFNtYEEhdSFBIUE9RUffXIED355CHAff3lwGiBKKBAe
ck21gQT1hQSFBPUVH31wD09JQQeB9/eXsQSBgoEdc021gQT1hQSFBPUVH31yBA9+dAQHH399eAFA
sRl0TbWB9KSFFH9QH35wT39wD09PS0AJKBAddU21gbUH9QTl8QGH4QTx8RFJH394eFlxBICSgSJ2
TbWB9cUE1fGx0ATw8EBAEIcFlwCHhYcQeFl4WnFHooEgd021gfWFtLXx0QD0pAD0pDAQeVx4WXhR
cKcAhwS3gSJ4TbXhtQTl8QLREE8IAkBNAEkDQBCHBYcldZeF96cEt4EleU21gbcBtQTl8eEgQPRA
QEC0AJRAQBCHBYclBaeFl5XHBLWBJnpNtYG3AaUQSQtfHhkATwJASQBLBUBAELeVhwCHhceVhwSH
lYEje021gbcBpQD09PSUAJQgQJQgQNRwQEAQX3p4W3JXWXtYECd8TbWBtwGlkBQLXxAtEQSwRAQE
kASwdAQEBAEQhYeF9wW3JXXngSd9TbWBtwHVBMXx4SBAtCBAtAC0cEBAQBAJUHhZeVt5VHV1e1h4
ECp+TbWBtwHVBIXx8ZEwQEsATQBNB0BAEFcVeFlwWnBYcFl3V1dXVwWHgSd/TbWBtwGFsQSRp+EC
0UBAQPSEAPRAQBCHpZeVB5UXWXNXV7WHgSeATbWBt6GgBKeV8dFwQEBATQBPBUBAEPcFpwWHBZd1
dXV1cFh4ECSBTbWB96AEp5UH8aFAEECUANQgQNRAQECh15W3lUdXV7WHgSOCTbWB94CHBNUH8ZFC
AQTwBJAkBLB0BAQBAHsffHJXXngQI4NNtYHwgIcElcfxAYIgEPSEAJQAtACUQEAQt+HnFXxZeBAf
hE21gfCAhwTVhwGSsZIQHQBLAE0ATQEQ95fB97eBHIVNtYEAxwC3BKeVhwHyggCRAPQA9PSE98fx
4R6GTbWBEHoAewF01YcB8oKQAfDw8AGHBPe3gPe3gR6HTbWBIHCnALc0V1t4HyogDx8fGBhwT3x4
D3p4EByITbWBMHB6C3BNUHgfKyAfeg9+cE98eA95eRAeiU21gZD3IECXlRcfLCAYcAt8D3xxBPCA
l7D3B5Efik21gQeAB4DHAPT09LSHAKcAhwD09MQwcHsPcHkQK4tNtYEHgAeAxyBAh4CXAaKQFAwk
FwcKcApwCHAPeHBKCRBIEwQH0PcHkSaMTbWBB4AHgOQAh4CXAaKwwgGXEHwAew94eUEQkQSBAPQA
94eBKo1NtYEHgAeAFH0IeAh4GSkPJhcHBw9/engCQQkQSBgBQMcQegh4WHgQK45NtYEHgAeAh/CA
B4GSoPKBpwCHhccA15AHgCQQkQShFAxwCnAIeFh4ECmPTbWBhyBwh4CngIcAhwGioPISGnANegh6
UXCXgCQQ4QSwB9CHhYeBKZBNtYGHMHB5AHgAeAhwCHAZKw8hIafwtwWHhZCHEE0aSAhwDHANeBAo
kU21gYeQRwcHgASAhxB4GSsPISGnsPeFhwWAlwCk0QSAB/AXC3gQKpJNtYGnUHBweAB4CHIHGnsP
cH8YH3hYcVCXAIShAqEUCXEEhwCnALeBKJNNtYEHoEcHB4AHgAeAFxp7D3hwHnwbeFhwCXgJShxJ
CXkAeAt4ECaUTbWBB6BHBweAB4AnB4GnsJehpwH3p7G3gAeQBPGAFAp8C3kQIpVNtYGXAIcwcHgK
cgcbewh8GXAffnoceAlNEgdKD3l5ECCWTbWRhwCnEHgAegFxt7CHwZcB9/cH8fGBEH9ATHoQHZdN
tZGH8Aeggbewl6GnAfeHkfengPERDygrexAbmE21sfCXgAHHsKeBtwH34feHAPERDygpfRAQmU60
8fHx8fHx8fHx8fGRBP///w==`.split(`
`).join(""),{round:F,floor:Rt,ceil:Ne,min:le,cos:De,sin:je}=Math;class Ae extends ${constructor(e){super(e),this.styled=!0,this.team=null,this.states={inTank:0,waiting:1,returning:2,parachuting:3,actions:{_min:10,forest:10,road:11,repair:12,boat:13,building:14,pillbox:15,mine:16}},this.order=0,this.x=null,this.y=null,this.targetX=0,this.targetY=0,this.trees=0,this.hasMine=!1,this.waitTimer=0,this.animation=0,this.cell=null,this.on("netUpdate",t=>{(t.hasOwnProperty("x")||t.hasOwnProperty("y"))&&this.updateCell()})}updateCell(){this.x!=null&&this.y!=null?this.cell=this.world.map.cellAtWorld(this.x,this.y):this.cell=null}serialization(e,t){e&&(t("O","owner"),t("B","team")),t("B","order"),this.order===this.states.inTank?this.x=this.y=null:(t("H","x"),t("H","y"),t("H","targetX"),t("H","targetY"),t("B","trees"),t("O","pillbox"),t("f","hasMine")),this.order===this.states.waiting&&t("B","waitTimer")}getTile(){return this.order===this.states.parachuting?[16,1]:[17,Rt(this.animation/3)]}performOrder(e,t,i){if(this.order!==this.states.inTank||!this.owner.$.onBoat&&this.owner.$.cell!==i&&this.owner.$.cell.getManSpeed(this)===0)return;let s=null;if(e==="mine"){if(this.owner.$.mines===0)return;t=0}else{if(this.owner.$.trees<t)return;if(e==="pillbox"){if(s=this.owner.$.getCarryingPillboxes().pop(),!s)return;s.inTank=!1,s.carried=!0}}this.trees=t,this.hasMine=e==="mine",this.ref("pillbox",s),this.hasMine&&this.owner.$.mines--,this.owner.$.trees-=t,this.order=this.states.actions[e],this.x=this.owner.$.x,this.y=this.owner.$.y,[this.targetX,this.targetY]=i.getWorldCoordinates(),this.updateCell()}kill(){if(!this.world.authority)return;this.soundEffect(Ze),this.order=this.states.parachuting,this.trees=0,this.hasMine=!1,this.pillbox&&(this.pillbox.$.placeAt(this.cell),this.ref("pillbox",null)),this.owner.$.armour===255?[this.targetX,this.targetY]=[this.x,this.y]:[this.targetX,this.targetY]=[this.owner.$.x,this.owner.$.y];const e=this.world.map.getRandomStart();[this.x,this.y]=e.cell.getWorldCoordinates()}spawn(e){this.ref("owner",e),this.order=this.states.inTank}anySpawn(){this.owner&&this.owner.$&&(this.team=this.owner.$.team),this.animation=0}update(){if(this.order!==this.states.inTank&&!(!this.owner||!this.owner.$))switch(this.animation=(this.animation+1)%9,this.order){case this.states.waiting:this.waitTimer--===0&&(this.order=this.states.returning);break;case this.states.parachuting:this.parachutingIn({x:this.targetX,y:this.targetY});break;case this.states.returning:this.owner.$.armour!==255&&this.move(this.owner.$,128,160);break;default:this.move({x:this.targetX,y:this.targetY},16,144)}}move(e,t,i){let s=this.cell.getManSpeed(this),n=!1;const r=this.world.map.cellAtWorld(this.targetX,this.targetY);s===0&&this.cell===r&&(s=16),this.owner.$.armour!==255&&this.owner.$.onBoat&&v(this,this.owner.$)<i&&(n=!0,s=16),s=le(s,v(this,e));const l=Y(this,e),o=F(De(l)*Ne(s)),h=F(je(l)*Ne(s)),u=this.x+o,c=this.y+h;let f=0;if(o!==0){const d=this.world.map.cellAtWorld(u,this.y);(n||d===r||d.getManSpeed(this)>0)&&(this.x=u,f++)}if(h!==0){const d=this.world.map.cellAtWorld(this.x,c);(n||d===r||d.getManSpeed(this)>0)&&(this.y=c,f++)}f===0?this.order=this.states.returning:(this.updateCell(),v(this,e)<=t&&this.reached())}reached(){if(this.order===this.states.returning){this.order=this.states.inTank,this.x=this.y=null,this.pillbox&&(this.pillbox.$.inTank=!0,this.pillbox.$.carried=!1,this.ref("pillbox",null)),this.owner.$.trees=le(40,this.owner.$.trees+this.trees),this.trees=0,this.hasMine&&(this.owner.$.mines=le(40,this.owner.$.mines+1)),this.hasMine=!1;return}if(this.cell.mine){this.world.spawn&&this.world.spawn(E,this.cell),this.order=this.states.waiting,this.waitTimer=20;return}switch(this.order){case this.states.actions.forest:if(this.cell.base||this.cell.pill||!this.cell.isType("#"))break;this.cell.setType("."),this.trees=4,this.soundEffect(Je);break;case this.states.actions.road:if(this.cell.base||this.cell.pill||this.cell.isType("|","}","b","^","#","=")||this.cell.isType(" ")&&this.cell.hasTankOnBoat())break;this.cell.setType("="),this.trees=0,this.soundEffect(D);break;case this.states.actions.repair:if(this.cell.pill){const e=this.cell.pill.repair(this.trees);this.trees-=e}else if(this.cell.isType("}"))this.cell.setType("|"),this.trees=0;else break;this.soundEffect(D);break;case this.states.actions.boat:if(!this.cell.isType(" ")||this.cell.hasTankOnBoat())break;this.cell.setType("b"),this.trees=0,this.soundEffect(D);break;case this.states.actions.building:if(this.cell.base||this.cell.pill||this.cell.isType("b","^","#","}","|"," "))break;this.cell.setType("|"),this.trees=0,this.soundEffect(D);break;case this.states.actions.pillbox:if(this.cell.pill||this.cell.base||this.cell.isType("b","^","#","|","}"," "))break;this.pillbox.$.armour=15,this.trees=0,this.pillbox.$.placeAt(this.cell),this.ref("pillbox",null),this.soundEffect(D);break;case this.states.actions.mine:if(this.cell.base||this.cell.pill||this.cell.isType("^"," ","|","b","}"))break;this.cell.setType(null,!0,0),this.hasMine=!1,this.soundEffect(we);break}this.order=this.states.waiting,this.waitTimer=20}parachutingIn(e){if(v(this,e)<=16)this.order=this.states.returning;else{const t=Y(this,e);this.x=this.x+F(De(t)*3),this.y=this.y+F(je(t)*3),this.updateCell()}}}const{round:ae,cos:_t,sin:Ot,PI:Lt}=Math;class J extends ${constructor(){super(...arguments),this.styled=null,this.direction=0,this.largeExplosion=!1,this.lifespan=0}serialization(e,t){e&&(t("B","direction"),t("f","largeExplosion")),t("H","x"),t("H","y"),t("B","lifespan")}getDirection16th(){return ae((this.direction-1)/16)%16}spawn(e,t,i,s){this.x=e,this.y=t,this.direction=i,this.largeExplosion=s,this.lifespan=80}update(){if(this.lifespan--%2===0){if(this.wreck())return;this.move()}this.lifespan===0&&(this.explode(),this.world.destroy&&this.world.destroy(this))}wreck(){this.world.spawn&&this.world.spawn(L,this.x,this.y);const e=this.world.map.cellAtWorld(this.x,this.y);return e.isType("^")?(this.world.destroy&&this.world.destroy(this),this.soundEffect(ve),!0):(e.isType("b")?(e.setType(" "),this.soundEffect(W)):e.isType("#")&&(e.setType("."),this.soundEffect(Te)),!1)}move(){if(this.dx===void 0){const n=(256-this.direction)*2*Lt/256;this.dx=ae(_t(n)*48),this.dy=ae(Ot(n)*48)}const{dx:e,dy:t}=this,i=this.x+e,s=this.y+t;if(e!==0){const n=e>0?i+24:i-24;this.world.map.cellAtWorld(n,s).isObstacle()||(this.x=i)}if(t!==0){const n=t>0?s+24:s-24;this.world.map.cellAtWorld(i,n).isObstacle()||(this.y=s)}}explode(){var t;const e=[this.world.map.cellAtWorld(this.x,this.y)];if(this.largeExplosion){const i=this.dx>0?1:-1,s=this.dy>0?1:-1;e.push(e[0].neigh(i,0)),e.push(e[0].neigh(0,s)),e.push(e[0].neigh(i,s)),this.soundEffect(Xe)}else this.soundEffect(xe);for(const i of e){i.takeExplosionHit();for(const s of this.world.tanks){const n=(t=s.builder)==null?void 0:t.$;if(n){const{inTank:r,parachuting:l}=n.states;n.order!==r&&n.order!==l&&n.cell===i&&n.kill()}}if(this.world.spawn){const[s,n]=i.getWorldCoordinates();this.world.spawn(L,s,n)}}}}const{round:S,floor:Nt,ceil:We,min:Ge,sqrt:Dt,max:N,sin:he,cos:ce,PI:de}=Math;class Se extends ${constructor(e){super(e),this.styled=!0,this.team=null,this.hidden=!1,this.speed=0,this.slideTicks=0,this.slideDirection=0,this.accelerating=!1,this.braking=!1,this.direction=0,this.turningClockwise=!1,this.turningCounterClockwise=!1,this.turnSpeedup=0,this.shells=40,this.mines=0,this.armour=40,this.trees=0,this.reload=0,this.shooting=!1,this.layingMine=!1,this.firingRange=7,this.kills=0,this.deaths=0,this.waterTimer=0,this.onBoat=!0,this.cell=null,this.on("netUpdate",t=>{(t.hasOwnProperty("x")||t.hasOwnProperty("y")||t.armour===255)&&this.updateCell()})}anySpawn(){this.updateCell(),this.world.addTank(this),this.on("finalize",()=>this.world.removeTank(this))}updateCell(){this.x!=null&&this.y!=null?this.cell=this.world.map.cellAtWorld(this.x,this.y):this.cell=null}reset(){const e=this.world.map.getRandomStart();[this.x,this.y]=e.cell.getWorldCoordinates(),this.direction=e.direction*16,this.updateCell(),this.speed=0,this.slideTicks=0,this.slideDirection=0,this.accelerating=!1,this.braking=!1,this.turningClockwise=!1,this.turningCounterClockwise=!1,this.turnSpeedup=0,this.shells=40,this.mines=0,this.armour=40,this.trees=0,this.reload=0,this.shooting=!1,this.layingMine=!1,this.firingRange=7,this.waterTimer=0,this.onBoat=!0,this.fireball=null}serialization(e,t){var i;if(e&&(t("B","team"),t("O","builder")),t("B","armour"),this.armour===255){t("O","fireball"),this.x=this.y=null;return}else(i=this.fireball)==null||i.clear();t("H","x"),t("H","y"),t("B","direction"),t("B","speed",{tx:s=>s*4,rx:s=>s/4}),t("B","slideTicks"),t("B","slideDirection"),t("B","turnSpeedup",{tx:s=>s+50,rx:s=>s-50}),t("B","shells"),t("B","mines"),t("B","trees"),t("B","reload"),t("B","firingRange",{tx:s=>s*2,rx:s=>s/2}),t("B","waterTimer"),t("B","kills"),t("B","deaths"),t("f","accelerating"),t("f","braking"),t("f","turningClockwise"),t("f","turningCounterClockwise"),t("f","shooting"),t("f","layingMine"),t("f","onBoat"),t("f","hidden")}getDirection16th(){return S((this.direction-1)/16)%16}getSlideDirection16th(){return S((this.slideDirection-1)/16)%16}getCarryingPillboxes(){return this.world.map.pills.filter(e=>{var t;return e.inTank&&((t=e.owner)==null?void 0:t.$)===this})}getTile(){const e=this.getDirection16th(),t=this.onBoat?1:0;return[e,t]}updateHiddenStatus(){if(!this.cell||!this.world.authority)return;const e=this.world.map.cellAtTile(this.cell.x,this.cell.y-1).isType("#"),t=this.world.map.cellAtTile(this.cell.x,this.cell.y+1).isType("#"),i=this.world.map.cellAtTile(this.cell.x-1,this.cell.y).isType("#"),s=this.world.map.cellAtTile(this.cell.x+1,this.cell.y).isType("#");this.hidden=e&&t&&i&&s}isAlly(e){return e===this||this.team!==255&&e.team===this.team}increaseRange(){this.firingRange=Ge(7,this.firingRange+.5)}decreaseRange(){this.firingRange=N(1,this.firingRange-.5)}takeShellHit(e){if(this.armour-=5,this.armour<0){const t=this.shells+this.mines>20;this.world.spawn&&this.ref("fireball",this.world.spawn(J,this.x,this.y,e.direction,t)),this.deaths++,e.attribution&&e.attribution.$&&e.attribution.$!==this&&e.attribution.$.kills++,this.kill()}else this.slideTicks=8,this.slideDirection=e.direction,this.onBoat&&(this.onBoat=!1,this.speed=0,this.cell.isType("^")&&this.sink());return qe}takeMineHit(){if(this.armour-=10,this.armour<0){const e=this.shells+this.mines>20;this.world.spawn&&this.ref("fireball",this.world.spawn(J,this.x,this.y,this.direction,e)),this.deaths++,this.kill()}else this.onBoat&&(this.onBoat=!1,this.speed=0,this.cell.isType("^")&&this.sink())}spawn(e){this.team=e,this.reset(),this.world.spawn&&this.ref("builder",this.world.spawn(Ae,this))}update(){this.cell&&(this.death()||(this.shootOrReload(),this.layMine(),this.turn(),this.accelerate(),this.fixPosition(),this.move(),this.updateHiddenStatus()))}destroy(){this.dropPillboxes(),this.world.destroy&&this.world.destroy(this.builder.$)}death(){return this.armour!==255?!1:this.world.authority&&--this.respawnTimer===0?(delete this.respawnTimer,this.reset(),!1):!0}shootOrReload(){this.reload>0&&this.reload--,!(!this.shooting||this.reload!==0||this.shells<=0)&&(this.shells--,this.reload=13,this.world.spawn&&this.world.spawn(ee,this,{range:this.firingRange,onWater:this.onBoat}),this.soundEffect(ke))}layMine(){if(!this.layingMine||this.mines<=0)return;const e=(this.direction+128)%256,t=(256-S((e-1)/16)%16*16)*2*de/256,i=this.x+S(ce(t)*w),s=this.y+S(he(t)*w),n=this.world.map.cellAtWorld(i,s);n.base||n.pill||n.mine||n.isType("^"," ","|","b","}")||(n.setType(null,!0,0),this.mines--,this.soundEffect(we))}turn(){const e=this.cell.getTankTurn(this)*2.6555;if(this.turningClockwise===this.turningCounterClockwise){this.turnSpeedup=0;return}let t;for(this.turningCounterClockwise?(t=e,this.turnSpeedup<10&&(t/=2),this.turnSpeedup<0&&(this.turnSpeedup=0),this.turnSpeedup++):(t=-e,this.turnSpeedup>-10&&(t/=2),this.turnSpeedup>0&&(this.turnSpeedup=0),this.turnSpeedup--),this.direction+=t;this.direction<0;)this.direction+=256;this.direction>=256&&(this.direction%=256)}accelerate(){const e=this.cell.getTankSpeed(this);let t;this.speed>e?t=-.25:this.accelerating===this.braking?t=0:this.accelerating?t=.25:t=-.25,t>0&&this.speed<e?this.speed=Ge(e,this.speed+t):t<0&&this.speed>0&&(this.speed=N(0,this.speed+t))}fixPosition(){if(this.cell.getTankSpeed(this)===0){const e=w/2;this.x%w>=e?this.x++:this.x--,this.y%w>=e?this.y++:this.y--,this.speed=N(0,this.speed-1)}for(const e of this.world.tanks)e!==this&&e.armour!==255&&v(this,e)<=255&&(e.x<this.x?this.x++:this.x--,e.y<this.y?this.y++:this.y--)}move(){let e=0,t=0;if(this.speed>0){const r=(256-this.getDirection16th()*16)*2*de/256;e+=S(ce(r)*We(this.speed)),t+=S(he(r)*We(this.speed))}if(this.slideTicks>0){const r=(256-this.getSlideDirection16th()*16)*2*de/256;e+=S(ce(r)*16),t+=S(he(r)*16),this.slideTicks--}const i=this.x+e,s=this.y+t;let n=!0;if(e!==0){const r=e>0?i+64:i-64,l=this.world.map.cellAtWorld(r,s);l.getTankSpeed(this)!==0&&(n=!1,(!this.onBoat||l.isType(" ","^")||this.speed>=16)&&(this.x=i))}if(t!==0){const r=t>0?s+64:s-64,l=this.world.map.cellAtWorld(i,r);l.getTankSpeed(this)!==0&&(n=!1,(!this.onBoat||l.isType(" ","^")||this.speed>=16)&&(this.y=s))}if(e!==0||t!==0){n&&(this.speed=N(0,this.speed-1));const r=this.cell;this.updateCell(),r!==this.cell&&this.checkNewCell(r)}!this.onBoat&&this.speed<=3&&this.cell.isType(" ")?++this.waterTimer===15&&((this.shells!==0||this.mines!==0)&&this.soundEffect(Ye),this.shells=N(0,this.shells-1),this.mines=N(0,this.mines-1),this.waterTimer=0):this.waterTimer=0}checkNewCell(e){if(this.onBoat)this.cell.isType(" ","^")||this.leaveBoat(e);else{if(this.cell.isType("^")){this.sink();return}this.cell.isType("b")&&this.enterBoat()}this.cell.mine&&this.world.spawn&&this.world.spawn(E,this.cell)}leaveBoat(e){if(this.cell.isType("b")){this.cell.setType(" ",!1,0);const t=(this.cell.x+.5)*w,i=(this.cell.y+.5)*w;this.world.spawn&&this.world.spawn(L,t,i),this.world.soundEffect(W,t,i)}else e.isType(" ")&&e.setType("b",!1,0),this.onBoat=!1}enterBoat(){this.cell.setType(" ",!1,0),this.onBoat=!0}sink(){this.world.soundEffect(ve,this.x,this.y),this.deaths++,this.kill()}kill(){this.dropPillboxes(),this.x=this.y=null,this.armour=255,this.respawnTimer=255}dropPillboxes(){const e=this.getCarryingPillboxes();if(e.length===0||!this.cell)return;let t=this.cell.x;const i=this.cell.y,s=S(Dt(e.length)),n=Nt(s/2);t-=n;const r=i+s;for(;e.length!==0;){for(let l=i;l<r;l++){const o=this.world.map.cellAtTile(t,l);if(o.base||o.pill||o.isType("|","}","b"))continue;const h=e.pop();if(!h)return;h.placeAt(o)}t+=1}}}function jt(a){a.registerType(te),a.registerType(ie),a.registerType(j),a.registerType(Se),a.registerType(L),a.registerType(E),a.registerType(ee),a.registerType(J),a.registerType(Ae)}const st=Object.freeze(Object.defineProperty({__proto__:null,Builder:Ae,Explosion:L,Fireball:J,FloodFill:j,MineExplosion:E,Shell:ee,Tank:Se,WorldBase:ie,WorldPillbox:te,registerWithWorld:jt},Symbol.toStringTag,{value:"Module"}));function be(a){if(a.length%4!==0)throw new Error("Invalid base64 input length, not properly padded?");let e=a.length/4*3;const t=a.substr(-2);t[0]==="="&&e--,t[1]==="="&&e--;const i=new Array(e),s=new Array(4);let n=0;for(let r=0;r<a.length;r++){const l=a[r],o=l.charCodeAt(0),h=r%4;s[h]=(()=>{if(65<=o&&o<=90)return o-65;if(97<=o&&o<=122)return o-71;if(48<=o&&o<=57)return o+4;if(o===43)return 62;if(o===47)return 63;if(o===61)return-1;throw new Error(`Invalid base64 input character: ${l}`)})(),h===3&&(i[n++]=((s[0]&63)<<2)+((s[1]&48)>>4),s[2]!==-1&&(i[n++]=((s[1]&15)<<4)+((s[2]&60)>>2)),s[3]!==-1&&(i[n++]=((s[2]&3)<<6)+(s[3]&63)))}return i}function Wt(a){let e=null,t=null,i=!1;const s=typeof globalThis<"u"&&typeof globalThis.window<"u"&&typeof globalThis.window.requestAnimationFrame=="function";return{start(){if(!i&&(i=!0,a.tick&&(e=setInterval(a.tick,a.rate)),a.frame&&s)){const n=()=>{i&&(a.frame(),t=globalThis.window.requestAnimationFrame(n))};n()}},stop(){i=!1,e&&(clearInterval(e),e=null),t!==null&&s&&(globalThis.window.cancelAnimationFrame(t),t=null)}}}class Gt extends et{constructor(e){super(),this.lengthComputable=!0,this.loaded=0,this.total=0,this.wrappingUp=!1,this.total=e!==void 0?e:0}add(...e){let t=1,i=null;return typeof e[0]=="number"&&(t=e.shift()),typeof e[0]=="function"&&(i=e.shift()),this.total+=t,this.emit("progress",this),()=>{this.step(t),i==null||i()}}step(e=1){this.loaded+=e,this.emit("progress",this),this.checkComplete()}set(e,t){this.total=e,this.loaded=t,this.emit("progress",this),this.checkComplete()}wrapUp(){this.wrappingUp=!0,this.checkComplete()}checkComplete(){!this.wrappingUp||this.loaded<this.total||this.emit("complete")}}class Qt{constructor(){this.container=document.createElement("div"),this.container.className="vignette",document.body.appendChild(this.container),this.messageLine=document.createElement("div"),this.messageLine.className="vignette-message",this.container.appendChild(this.messageLine)}message(e){this.messageLine.textContent=e}showProgress(){}hideProgress(){}progress(e){}destroy(){this.container.remove(),this.container=null,this.messageLine=null}}class zt{constructor(){if(this.sounds={},this.isSupported=!1,typeof Audio<"u"){const e=new Audio;this.isSupported=typeof e.canPlayType=="function"}}register(e,t){this.sounds[e]=t,this[e]=()=>this.play(e)}load(e,t,i){if(this.register(e,t),!this.isSupported){i==null||i();return}const s=new Audio;i&&s.addEventListener("canplaythrough",i,{once:!0}),s.addEventListener("error",n=>{const r=n.target.error;(r==null?void 0:r.code)===MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED&&(this.isSupported=!1,i==null||i())},{once:!0}),s.src=t,s.load()}play(e){if(!this.isSupported)return;const t=new Audio;return t.src=this.sounds[e],t.play(),t}}const z=[{r:255,g:0,b:0,name:"red"},{r:0,g:0,b:255,name:"blue"},{r:255,g:255,b:0,name:"yellow"},{r:0,g:255,b:0,name:"green"},{r:255,g:165,b:0,name:"orange"},{r:128,g:0,b:128,name:"purple"}],{min:Qe,max:ze,round:O,cos:Ut,sin:Kt,PI:Ft,sqrt:Vt}=Math;class Xt{constructor(e){this.currentTool=null,this.world=e,this.images=this.world.images,this.soundkit=this.world.soundkit,this.canvas=document.createElement("canvas"),document.body.appendChild(this.canvas),this.lastCenter=this.world.map.findCenterCell().getWorldCoordinates(),this.mouse=[0,0],this.canvas.addEventListener("click",t=>this.handleClick(t)),this.canvas.addEventListener("mousemove",t=>{this.mouse=[t.pageX,t.pageY]}),this.setup(),this.handleResize(),window.addEventListener("resize",()=>this.handleResize())}setup(){}centerOn(e,t,i){}drawTile(e,t,i,s){}drawStyledTile(e,t,i,s,n){}drawMap(e,t,i,s){}drawBuilderIndicator(e){}onRetile(e,t,i){}draw(){let e,t;const i=this.world.getViewTarget?this.world.getViewTarget():null;i?{x:e,y:t}=i:this.world.player?({x:e,y:t}=this.world.player,this.world.player.fireball&&({x:e,y:t}=this.world.player.fireball.$)):e=t=null,e==null||t==null?[e,t]=this.lastCenter:this.lastCenter=[e,t],this.centerOn(e,t,(s,n,r,l)=>{this.drawMap(s,n,r,l);for(const o of this.world.objects)if(o&&!(o.hidden&&o!==this.world.player)&&o.styled!=null&&o.x!=null&&o.y!=null){const[h,u]=o.getTile(),c=O(o.x/A)-g/2,f=O(o.y/A)-g/2;o.styled===!0?this.drawStyledTile(h,u,o.team,c,f):o.styled===!1&&this.drawTile(h,u,c,f)}this.drawOverlay()}),this.hud&&this.updateHud()}playSound(e,t,i,s){let n;if(this.world.player&&s===this.world.player)n="Self";else{const l=t-this.lastCenter[0],o=i-this.lastCenter[1],h=Vt(l*l+o*o);h>40*w?n="None":h>15*w?n="Far":n="Near"}if(n==="None")return;let r;switch(e){case Xe:r=`bigExplosion${n}`;break;case Ye:r=n==="Self"?"bubbles":void 0;break;case Je:r=`farmingTree${n}`;break;case qe:r=`hitTank${n}`;break;case D:r=`manBuilding${n}`;break;case Ze:r=`manDying${n}`;break;case we:r=n==="Near"?"manLayMineNear":void 0;break;case xe:r=`mineExplosion${n}`;break;case ke:r=`shooting${n}`;break;case W:r=`shotBuilding${n}`;break;case Te:r=`shotTree${n}`;break;case ve:r=`tankSinking${n}`;break}r&&this.soundkit[r]()}handleResize(){this.canvas.width=window.innerWidth,this.canvas.height=window.innerHeight,this.canvas.style.width=`${window.innerWidth}px`,this.canvas.style.height=`${window.innerHeight}px`,document.body.style.width=`${window.innerWidth}px`,document.body.style.height=`${window.innerHeight}px`}handleClick(e){if(e.preventDefault(),this.world.input.focus(),!this.currentTool)return;const[t,i]=this.mouse,s=this.getCellAtScreen(t,i),[n,r,l]=this.world.checkBuildOrder(this.currentTool,s);n&&this.world.buildOrder(n,r,s)}getViewAreaAtWorld(e,t){const{width:i,height:s}=this.canvas;let n=O(e/A-i/2);n=ze(0,Qe($e-i,n));let r=O(t/A-s/2);return r=ze(0,Qe($e-s,r)),[n,r,i,s]}getCellAtScreen(e,t){const[i,s]=this.lastCenter,[n,r,l,o]=this.getViewAreaAtWorld(i,s);return this.world.map.cellAtPixel(n+e,r+t)}drawOverlay(){const e=this.world.player;if(e&&e.armour!==255){if(e.builder){const t=e.builder.$;t.order===t.states.inTank||t.order===t.states.parachuting||this.drawBuilderIndicator(t)}this.world.gunsightVisible&&this.drawReticle()}this.drawNames(),this.drawCursor()}drawReticle(){const e=this.world.player.firingRange*g,t=(256-this.world.player.direction)*2*Ft/256,i=O(this.world.player.x/A+Ut(t)*e)-g/2,s=O(this.world.player.y/A+Kt(t)*e)-g/2;this.drawTile(17,4,i,s)}drawCursor(){const[e,t]=this.mouse,i=this.getCellAtScreen(e,t);this.drawTile(18,6,i.x*g,i.y*g)}drawNames(){}initHud(){this.hud=document.createElement("div"),this.hud.id="hud",document.body.appendChild(this.hud),this.initHudTankStatus(),this.initHudPillboxes(),this.initHudBases(),this.initHudPlayers(),this.initHudStats(),this.initHudToolSelect(),this.initHudNotices(),this.updateHud()}initHudTankStatus(){const e=document.createElement("div");e.id="tankStatus",this.hud.appendChild(e);const t=document.createElement("div");t.className="deco",e.appendChild(t),this.tankIndicators={};for(const i of["shells","mines","armour","trees"]){const s=document.createElement("div");s.className="gauge",s.id=`tank-${i}`,e.appendChild(s);const n=document.createElement("div");n.className="gauge-content",s.appendChild(n),this.tankIndicators[i]=n}}initHudPillboxes(){const e=document.createElement("div");e.id="pillStatus",this.hud.appendChild(e);const t=document.createElement("div");t.className="deco",e.appendChild(t),this.pillIndicators=this.world.map.pills.map(i=>{const s=document.createElement("div");return s.className="pill",e.appendChild(s),[s,i]})}initHudBases(){const e=document.createElement("div");e.id="baseStatus",this.hud.appendChild(e);const t=document.createElement("div");t.className="deco",e.appendChild(t),this.baseIndicators=this.world.map.bases.map((i,s)=>{const n=document.createElement("div");return n.className="base",n.setAttribute("data-base-idx",i.idx),n.setAttribute("data-array-index",s.toString()),e.appendChild(n),[n,i]})}initHudPlayers(){const e=document.createElement("div");e.id="playersStatus",this.hud.appendChild(e);const t=document.createElement("div");t.className="deco",e.appendChild(t),this.playerIndicators=[]}initHudStats(){const e=document.createElement("div");e.id="statsStatus",this.hud.appendChild(e);const t=document.createElement("div");t.className="stat-line",e.appendChild(t);const i=document.createElement("span");i.className="stat-group-left",t.appendChild(i);const s=document.createElement("span");s.className="stat-icon",s.textContent="☠",i.appendChild(s);const n=document.createElement("span");n.className="stat-value",n.id="stat-kills",n.textContent="0",i.appendChild(n);const r=document.createElement("span");r.className="stat-group-right",t.appendChild(r);const l=document.createElement("span");l.className="stat-icon",l.id="stat-score-icon",l.textContent="★",r.appendChild(l);const o=document.createElement("span");o.className="stat-value",o.id="stat-score",o.textContent="0",r.appendChild(o);const h=document.createElement("div");h.className="stat-line",e.appendChild(h);const u=document.createElement("span");u.className="stat-icon",u.textContent="†",h.appendChild(u);const c=document.createElement("span");c.className="stat-value",c.id="stat-deaths",c.textContent="0",h.appendChild(c)}initHudToolSelect(){this.currentTool=null;const e=document.createElement("div");e.id="tool-select",this.hud.appendChild(e);for(const t of["forest","road","building","pillbox","mine"])this.initHudTool(e,t)}initHudTool(e,t){const i=`tool-${t}`,s=document.createElement("input");s.type="radio",s.name="tool",s.id=i,e.appendChild(s);const n=document.createElement("label");n.htmlFor=i,e.appendChild(n);const r=document.createElement("span");r.className=`bolo-tool bolo-${i}`,n.appendChild(r),s.addEventListener("click",l=>{this.currentTool===t?(this.currentTool=null,e.querySelectorAll("input").forEach(o=>{o.checked=!1})):this.currentTool=t,this.world.input.focus()})}initHudNotices(){if(location.hostname.split(".")[1]==="github"){const e=document.createElement("div");e.innerHTML=`
        This is a work-in-progress; less than alpha quality!<br>
        To see multiplayer in action, follow instructions on Github.
      `,Object.assign(e.style,{position:"absolute",top:"70px",left:"0px",width:"100%",textAlign:"center",fontFamily:"monospace",fontSize:"16px",fontWeight:"bold",color:"white"}),this.hud.appendChild(e)}if(location.hostname.split(".")[1]==="github"||location.hostname.substr(-6)===".no.de"){const e=document.createElement("a");e.href="http://github.com/stephank/orona",Object.assign(e.style,{position:"absolute",top:"0px",right:"0px"}),e.innerHTML='<img src="http://s3.amazonaws.com/github/ribbons/forkme_right_darkblue_121621.png" alt="Fork me on GitHub">',this.hud.appendChild(e)}}updateHud(){if(this.pillIndicators)for(let t=0;t<this.pillIndicators.length;t++){const[i]=this.pillIndicators[t],s=this.world.map.pills[t];if(!s)continue;const n=`${s.inTank};${s.carried};${s.armour};${s.team};${s.owner_idx}`;s.hudStatusKey=n,s.inTank||s.carried?i.setAttribute("status","carried"):s.armour===0?i.setAttribute("status","dead"):i.setAttribute("status","healthy");const r=z[s.team]||{r:112,g:112,b:112};i.style.backgroundColor=`rgb(${r.r},${r.g},${r.b})`}if(this.baseIndicators)for(let t=0;t<this.baseIndicators.length;t++){const[i]=this.baseIndicators[t],s=this.world.map.bases[t];if(!s){console.warn(`[HUD] Base at indicator index ${t} is null/undefined`);continue}const n=`${s.armour};${s.team};${s.owner_idx}`;s.hudStatusKey=n,s.armour<=9?i.setAttribute("status","vulnerable"):i.setAttribute("status","healthy");const r=z[s.team]||{r:112,g:112,b:112},l=`rgb(${r.r},${r.g},${r.b})`;i.style.backgroundColor!==l&&(i.style.backgroundColor=l)}if(this.playerIndicators){const t=document.getElementById("playersStatus");if(t){const i=this.world.tanks.filter(s=>s);for(;this.playerIndicators.length>i.length;){const s=this.playerIndicators.pop();s&&s.remove()}for(let s=0;s<i.length;s++){const n=i[s];if(!this.playerIndicators[s]){const h=document.createElement("div");h.className="player",t.appendChild(h),this.playerIndicators[s]=h}const r=this.playerIndicators[s],l=z[n.team]||{r:112,g:112,b:112};r.style.backgroundColor=`rgb(${l.r},${l.g},${l.b})`,n.armour===255?r.setAttribute("data-dead","true"):r.removeAttribute("data-dead")}}}const e=this.world.player;if(e&&e.kills!==void 0&&e.deaths!==void 0){const t=document.getElementById("stat-kills"),i=document.getElementById("stat-deaths"),s=document.getElementById("stat-score"),n=document.getElementById("stat-score-icon");if(t&&(t.textContent=e.kills.toString()),i&&(i.textContent=e.deaths.toString()),s&&e.team!==void 0&&e.team>=0&&e.team<=5){const r=this.world.teamScores.map((h,u)=>({team:u,score:h}));r.sort((h,u)=>u.score-h.score);const l=r.findIndex(h=>h.team===e.team)+1,o=h=>{const u=["th","st","nd","rd"],c=h%100;return h+(u[(c-20)%10]||u[c]||u[0])};if(s.textContent=o(l),n){const h=z[e.team]||{r:192,g:192,b:240};n.style.color=`rgb(${h.r},${h.g},${h.b})`}}}if(e.hudLastStatus=e.hudLastStatus||{},this.tankIndicators)for(const[t,i]of Object.entries(this.tankIndicators)){const s=e.armour===255?0:e[t];e.hudLastStatus[t]!==s&&(e.hudLastStatus[t]=s,i.style.height=`${O(s/40*100)}%`)}}}const{min:V,round:Q,cos:ue,sin:pe,PI:Yt}=Math;class Jt extends Xt{constructor(){super(...arguments),this.prestyled={}}setup(){try{const n=this.canvas.getContext("2d");if(!n)throw new Error("Could not get 2D context");this.ctx=n,this.ctx.drawImage}catch(n){throw new Error(`Could not initialize 2D canvas: ${n.message}`)}const e=this.images.overlay,t=document.createElement("canvas");t.width=e.width,t.height=e.height;const i=t.getContext("2d");if(!i)throw new Error("Could not get temporary canvas context");i.globalCompositeOperation="copy",i.drawImage(e,0,0);const s=i.getImageData(0,0,e.width,e.height);this.overlay=s.data,this.prestyled={}}drawTile(e,t,i,s,n){(n||this.ctx).drawImage(this.images.base,e*g,t*g,g,g,i,s,g,g)}createPrestyled(e){const t=this.images.styled,{width:i,height:s}=t,n=document.createElement("canvas");n.width=i,n.height=s;const r=n.getContext("2d");if(!r)throw new Error("Could not get canvas context");r.globalCompositeOperation="copy",r.drawImage(t,0,0);const l=r.getImageData(0,0,i,s),o=l.data;for(let h=0;h<i;h++)for(let u=0;u<s;u++){const c=4*(u*i+h),f=this.overlay[c]/255;o[c+0]=Q(f*e.r+(1-f)*o[c+0]),o[c+1]=Q(f*e.g+(1-f)*o[c+1]),o[c+2]=Q(f*e.b+(1-f)*o[c+2]),o[c+3]=V(255,o[c+3]+this.overlay[c])}return r.putImageData(l,0,0),n}drawStyledTile(e,t,i,s,n,r){let l=this.prestyled[i];if(!l){const o=z[i];o?l=this.prestyled[i]=this.createPrestyled(o):l=this.images.styled}(r||this.ctx).drawImage(l,e*g,t*g,g,g,s,n,g,g)}centerOn(e,t,i){this.ctx.save();const[s,n,r,l]=this.getViewAreaAtWorld(e,t);this.ctx.translate(-s,-n),i(s,n,r,l),this.ctx.restore()}drawBuilderIndicator(e){const t=e.owner.$;if(t.hidden&&t!==this.world.player)return;const i=v(t,e);if(i<=128)return;const s=t.x/A,n=t.y/A;this.ctx.save(),this.ctx.globalCompositeOperation="source-over",this.ctx.globalAlpha=V(1,(i-128)/1024);const r=V(50,i/10240*50)+32;let l=Y(t,e);this.ctx.beginPath();const o=s+ue(l)*r,h=n+pe(l)*r;this.ctx.moveTo(o,h),l+=Yt,this.ctx.lineTo(o+ue(l-.4)*10,h+pe(l-.4)*10),this.ctx.lineTo(o+ue(l+.4)*10,h+pe(l+.4)*10),this.ctx.closePath(),this.ctx.fillStyle="yellow",this.ctx.fill(),this.ctx.restore()}drawNames(){this.ctx.save(),this.ctx.strokeStyle=this.ctx.fillStyle="white",this.ctx.font="bold 11px sans-serif",this.ctx.textBaselines="alphabetic",this.ctx.textAlign="left";const e=this.world.player;for(const t of this.world.tanks)if(!(t.hidden&&t!==e)&&t.name&&t.armour!==255&&t!==e){if(e){const r=v(e,t);if(r<=768)continue;this.ctx.globalAlpha=V(1,(r-768)/1536)}else this.ctx.globalAlpha=1;const i=this.ctx.measureText(t.name);this.ctx.beginPath();let s=Q(t.x/A)+16,n=Q(t.y/A)-16;this.ctx.moveTo(s,n),s+=12,n-=9,this.ctx.lineTo(s,n),this.ctx.lineTo(s+i.width,n),this.ctx.stroke(),this.ctx.fillText(t.name,s,n-2)}this.ctx.restore()}}const{floor:Ue}=Math,_=16,X=T/_,I=_*g;class qt{constructor(e,t,i){this.canvas=null,this.ctx=null,this.renderer=e,this.sx=t*_,this.sy=i*_,this.ex=this.sx+_-1,this.ey=this.sy+_-1,this.psx=t*I,this.psy=i*I,this.pex=this.psx+I-1,this.pey=this.psy+I-1}isInView(e,t,i,s){return i<this.psx||s<this.psy?!1:!(e>this.pex||t>this.pey)}build(){this.canvas=document.createElement("canvas"),this.canvas.width=this.canvas.height=I;const e=this.canvas.getContext("2d");if(!e)throw new Error("Could not get canvas context");this.ctx=e,this.ctx.translate(-this.psx,-this.psy),this.renderer.world.map.each(t=>{this.onRetile(t,t.tile[0],t.tile[1])},this.sx,this.sy,this.ex,this.ey)}clear(){this.canvas=this.ctx=null}onRetile(e,t,i){if(!this.canvas)return;const s=e.pill||e.base;s?this.renderer.drawStyledTile(e.tile[0],e.tile[1],s.team,e.x*g,e.y*g,this.ctx):this.renderer.drawTile(e.tile[0],e.tile[1],e.x*g,e.y*g,this.ctx)}}class Zt extends Jt{setup(){super.setup(),this.cache=new Array(X);for(let e=0;e<X;e++){const t=this.cache[e]=new Array(X);for(let i=0;i<X;i++)t[i]=new qt(this,i,e)}}onRetile(e,t,i){if(e.tile=[t,i],!this.cache)return;const s=Ue(e.x/_),n=Ue(e.y/_);!this.cache[n]||!this.cache[n][s]||this.cache[n][s].onRetile(e,t,i)}drawMap(e,t,i,s){const n=e+i-1,r=t+s-1;let l=!1;for(const o of this.cache)for(const h of o){if(!h.isInView(e,t,n,r)){h.canvas&&h.clear();continue}if(!h.canvas){if(l)continue;h.build(),l=!0}this.ctx.drawImage(h.canvas,0,0,I,I,h.psx,h.psy,I,I)}}}const ei={boloInit(){this.tanks=[]},addTank(a){a.tank_idx=this.tanks.length,this.tanks.push(a),this.authority&&this.resolveMapObjectOwners(),this.tanks.length===1&&this.emptyStartTime!==void 0&&(this.emptyStartTime=null)},removeTank(a){const e=a.tank_idx;this.tanks.splice(a.tank_idx,1);for(let t=a.tank_idx;t<this.tanks.length;t++)this.tanks[t].tank_idx=t;for(const t of this.getAllMapObjects())if(t.owner_idx!==255)if(t.owner_idx===e){const i=t.team;t.owner_idx=255,t.ref("owner",null),t.team=i}else t.owner_idx>e&&(t.owner_idx-=1);this.authority&&this.resolveMapObjectOwners(),this.tanks.length===0&&this.emptyStartTime!==void 0&&(this.emptyStartTime=Date.now())},getAllMapObjects(){return this.map.pills.concat(this.map.bases)},spawnMapObjects(){for(const a of this.getAllMapObjects())a.world=this,this.insert(a),a.spawn(),a.anySpawn()},resolveMapObjectOwners(){var a;for(const e of this.getAllMapObjects())e.owner_idx!==255&&e.owner_idx<this.tanks.length?e.ref("owner",this.tanks[e.owner_idx]):e.owner_idx===255&&e.owner&&e.ref("owner",null),(a=e.cell)==null||a.retile()}},Ee={start(){const a=new Qt;this.waitForCache(a,()=>{this.loadResources(a,()=>{this.loaded(a)})})},waitForCache(a,e){return e()},loadResources(a,e){a.message("Loading resources");const t=new Gt;this.images={},this.loadImages(i=>{this.images[i]=new Image;const s=this.images[i],n=t.add();s.addEventListener("load",n,{once:!0}),s.src=`images/${i}.png`}),this.soundkit=new zt,this.loadSounds(i=>{const s=`sounds/${i}.ogg`,n=i.split("_");for(let l=1;l<n.length;l++)n[l]=n[l].substr(0,1).toUpperCase()+n[l].substr(1);const r=n.join("");this.soundkit.load(r,s,t.add())}),typeof applicationCache>"u"&&(a.showProgress(),t.on("progress",i=>a.progress(i.loaded/i.total))),t.on("complete",()=>{a.hideProgress(),e()}),t.wrapUp()},loadImages(a){a("base"),a("styled"),a("overlay")},loadSounds(a){a("big_explosion_far"),a("big_explosion_near"),a("bubbles"),a("farming_tree_far"),a("farming_tree_near"),a("hit_tank_far"),a("hit_tank_near"),a("hit_tank_self"),a("man_building_far"),a("man_building_near"),a("man_dying_far"),a("man_dying_near"),a("man_lay_mine_near"),a("mine_explosion_far"),a("mine_explosion_near"),a("shooting_far"),a("shooting_near"),a("shooting_self"),a("shot_building_far"),a("shot_building_near"),a("shot_tree_far"),a("shot_tree_near"),a("tank_sinking_far"),a("tank_sinking_near")},commonInitialization(){this.renderer=new Zt(this),this.map.world=this,this.map.setView(this.renderer),this.boloInit(),this.loop=Wt({rate:nt,tick:()=>this.tick(),frame:()=>this.renderer.draw()}),this.increasingRange=!1,this.decreasingRange=!1,this.rangeAdjustTimer=0,this.viewMode="tank",this.currentPillboxIndex=0;const a=o=>{var c;const u=`; ${document.cookie}`.split(`; ${o}=`);return u.length===2&&((c=u.pop())==null?void 0:c.split(";").shift())||null},e={accelerate:"ArrowUp",decelerate:"ArrowDown",turnLeft:"ArrowLeft",turnRight:"ArrowRight",increaseRange:"KeyL",decreaseRange:"Semicolon",shoot:"Space",layMine:"Tab",tankView:"Enter",pillboxView:"KeyP",autoSlowdown:!0,autoGunsight:!0},t=a("keyBindings");this.keyBindings=t?{...e,...JSON.parse(t)}:e,this.input=document.createElement("input"),this.input.id="input-dummy",this.input.type="text",this.input.setAttribute("autocomplete","off"),this.input.setAttribute("readonly","true"),this.input.style.caretColor="transparent",document.body.insertBefore(this.input,this.renderer.canvas),this.input.focus();const i=[this.input,this.renderer.canvas],s=document.querySelectorAll("#tool-select label");i.push(...Array.from(s));const n=o=>{o.preventDefault(),o.stopPropagation();const h=o.code;h===this.keyBindings.increaseRange?this.increasingRange=!0:h===this.keyBindings.decreaseRange?this.decreasingRange=!0:this.handleKeydown(o)},r=o=>{o.preventDefault(),o.stopPropagation();const h=o.code;h===this.keyBindings.increaseRange?this.increasingRange=!1:h===this.keyBindings.decreaseRange?this.decreasingRange=!1:this.handleKeyup(o)},l=o=>(o.preventDefault(),o.stopPropagation(),!1);for(const o of i)o.addEventListener("keydown",n),o.addEventListener("keyup",r),o.addEventListener("keypress",l)},failure(a){this.loop&&this.loop.stop();const e=document.createElement("div");e.textContent=a,e.style.cssText=`
      position: fixed;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      background: white;
      padding: 20px;
      border: 2px solid #333;
      z-index: 10000;
      font-family: sans-serif;
    `;const t=document.createElement("div");t.style.cssText=`
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: rgba(0, 0, 0, 0.5);
      z-index: 9999;
    `,document.body.appendChild(t),document.body.appendChild(e)},checkBuildOrder(a,e){const t=this.player.builder.$;if(t.order!==t.states.inTank)return[!1];if(e.mine)return[!1];let i;switch(a){case"forest":e.base||e.pill||!e.isType("#")?i=[!1]:i=["forest",0];break;case"road":e.base||e.pill||e.isType("|","}","b","^")?i=[!1]:e.isType("#")?i=["forest",0]:e.isType("=")?i=[!1]:e.isType(" ")&&e.hasTankOnBoat()?i=[!1]:i=["road",2];break;case"building":e.base||e.pill||e.isType("b","^")?i=[!1]:e.isType("#")?i=["forest",0]:e.isType("}")?i=["repair",1]:e.isType("|")?i=[!1]:e.isType(" ")?e.hasTankOnBoat()?i=[!1]:i=["boat",20]:e===this.player.cell?i=[!1]:i=["building",2];break;case"pillbox":e.pill?e.pill.armour===16?i=[!1]:e.pill.armour>=11?i=["repair",1,!0]:e.pill.armour>=7?i=["repair",2,!0]:e.pill.armour>=3?i=["repair",3,!0]:e.pill.armour<3?i=["repair",4,!0]:i=[!1]:e.isType("#")?i=["forest",0]:e.base||e.isType("b","^","|","}"," ")?i=[!1]:e===this.player.cell?i=[!1]:i=["pillbox",4];break;case"mine":e.base||e.pill||e.isType("^"," ","|","b","}")?i=[!1]:i=["mine"];break;default:i=[!1]}const[s,n,r]=i;return s?s==="mine"?this.player.mines===0?[!1]:["mine"]:s==="pill"&&this.player.getCarryingPillboxes().length===0?[!1]:n!=null&&this.player.trees<n?r?[s,this.player.trees,r]:[!1]:i:[!1]}};Ce(Ee,ei);const ti=st;class Be extends fe{constructor(){super(...arguments),this.authority=!0,this.gunsightVisible=!0,this.autoSlowdownActive=!1}loaded(e){this.map=it.load(be(Mt)),this.commonInitialization(),this.spawnMapObjects(),this.player=this.spawn(Se),this.player.spawn(0),this.renderer.initHud(),e.destroy(),this.loop.start()}tick(){if(super.tick(),this.increasingRange!==this.decreasingRange){if(++this.rangeAdjustTimer===6){if(this.increasingRange){this.player.increaseRange();const e=this.keyBindings;e&&e.autoGunsight&&this.player.firingRange===7&&(this.gunsightVisible=!1)}else{this.player.decreaseRange();const e=this.keyBindings;e&&e.autoGunsight&&(this.gunsightVisible=!0)}this.rangeAdjustTimer=0}}else this.rangeAdjustTimer=0}soundEffect(e,t,i,s){this.renderer.playSound(e,t,i,s)}mapChanged(e,t,i,s){}handleKeydown(e){switch(e.which||e.keyCode){case 32:this.player.shooting=!0;break;case 37:this.player.turningCounterClockwise=!0;break;case 38:this.player.accelerating=!0,this.autoSlowdownActive&&(this.player.braking=!1,this.autoSlowdownActive=!1);break;case 39:this.player.turningClockwise=!0;break;case 40:this.player.braking=!0,this.autoSlowdownActive=!1;break}}handleKeyup(e){const t=e.which||e.keyCode,i=this.keyBindings;switch(t){case 32:this.player.shooting=!1;break;case 37:this.player.turningCounterClockwise=!1;break;case 38:this.player.accelerating=!1,i&&i.autoSlowdown&&(this.player.braking=!0,this.autoSlowdownActive=!0);break;case 39:this.player.turningClockwise=!1;break;case 40:this.player.braking=!1,this.autoSlowdownActive=!1;break}}buildOrder(e,t,i){this.player.builder.$.performOrder(e,t,i)}}Ce(Be.prototype,Ee);ti.registerWithWorld(Be.prototype);const Z=class Z{constructor(){this.objects=[],this.tanks=[],this._isSynchronized=!1}registerType(e){const t=this.constructor.types.length;this.constructor.types.push(e),this.constructor.typesByName.set(e.name,t)}insert(e){e.idx=this.objects.length,this.objects.push(e)}tick(){for(const e of this.objects)e&&e.tick&&e.tick()}netSpawn(e,t){const i=e[t],s=e[t+1]<<8|e[t+2],n=this.constructor.types[i];if(!n)throw new Error(`Unknown object type index: ${i}`);const r=new n(this);for(r._net_type_idx=i,r.idx=s,r._createdViaMessage=!0;this.objects.length<=s;)this.objects.push(null);this.objects[s]=r;const l=this.constructor.types[3];if(n===l){const o=this.tanks.findIndex(h=>h&&h.idx===r.idx);o===-1?this.tanks.push(r):this.tanks[o]=r}return 3}netDestroy(e,t){const i=e[t]<<8|e[t+1];if(this.objects[i]){const s=this.objects[i],n=this.constructor.types[3];if(s.constructor===n){const r=this.tanks.indexOf(s);r!==-1&&this.tanks.splice(r,1)}this.objects[i]=null}return 2}netUpdate(e,t,i){return e&&e.load?e.load(t,i):0}netTick(e,t,i){const s=!this._isSynchronized;let n=0;for(let r=0;r<this.objects.length;r++){const l=this.objects[r];if(l&&l.load){if(i&&i.has(l))continue;const o=l.load(e,t+n,s);n+=o}}return n}netRestore(){}failure(e){console.error("Client error:",e)}};Z.types=[],Z.typesByName=new Map;let me=Z;const ii=115,si=87,ni=67,ri=68,oi=77,li=85,ai=117,hi=83,ci=84,di="L",ui="l",pi="R",fi="r",gi="A",bi="a",Ke="B",Fe="b",mi="S",yi="s",wi="M",xi="m",ki="I",Ti="D",vi="O",Ci=st,Ai=`
    <div id="join-dialog" style="
      background: #DDDDDD;
      border: 2px solid black;
      border-radius: 8px;
      box-shadow: 4px 4px 0px rgba(0, 0, 0, 0.3);
      padding: 0;
      min-width: 320px;
      font-family: 'Chicago', 'Charcoal', sans-serif;
      color: black;
    ">
      <div style="
        background: white;
        border-bottom: 1px solid black;
        padding: 8px 16px;
        text-align: center;
        font-weight: bold;
        font-size: 14px;
      ">Join Game</div>

      <div style="padding: 16px;">
        <div style="margin-bottom: 12px;">
          <label style="display: block; margin-bottom: 4px; font-weight: bold; font-size: 12px;">Player Name</label>
          <input type="text" id="join-nick-field" name="join-nick-field" maxlength="20" style="
            width: 100%;
            border: 1px solid black;
            background: white;
            padding: 4px;
            font-family: 'Chicago', 'Charcoal', sans-serif;
            font-size: 12px;
            box-sizing: border-box;
          "></input>
        </div>

        <div id="join-team" style="margin-bottom: 16px;">
          <label style="display: block; margin-bottom: 8px; font-weight: bold; font-size: 12px;">Choose a team</label>
          <div style="display: flex; gap: 8px; justify-content: center; flex-wrap: wrap;">
            <input type="radio" id="join-team-red" name="join-team" value="red" style="display: none;"></input>
            <label for="join-team-red" style="cursor: pointer;">
              <span class="bolo-team bolo-team-red" style="
                display: inline-block;
                width: 32px;
                height: 32px;
                border: 2px solid black;
                box-sizing: border-box;
              "></span>
            </label>

            <input type="radio" id="join-team-blue" name="join-team" value="blue" style="display: none;"></input>
            <label for="join-team-blue" style="cursor: pointer;">
              <span class="bolo-team bolo-team-blue" style="
                display: inline-block;
                width: 32px;
                height: 32px;
                border: 2px solid black;
                box-sizing: border-box;
              "></span>
            </label>

            <input type="radio" id="join-team-yellow" name="join-team" value="yellow" style="display: none;"></input>
            <label for="join-team-yellow" style="cursor: pointer;">
              <span class="bolo-team bolo-team-yellow" style="
                display: inline-block;
                width: 32px;
                height: 32px;
                border: 2px solid black;
                box-sizing: border-box;
              "></span>
            </label>

            <input type="radio" id="join-team-green" name="join-team" value="green" style="display: none;"></input>
            <label for="join-team-green" style="cursor: pointer;">
              <span class="bolo-team bolo-team-green" style="
                display: inline-block;
                width: 32px;
                height: 32px;
                border: 2px solid black;
                box-sizing: border-box;
              "></span>
            </label>

            <input type="radio" id="join-team-orange" name="join-team" value="orange" style="display: none;"></input>
            <label for="join-team-orange" style="cursor: pointer;">
              <span class="bolo-team bolo-team-orange" style="
                display: inline-block;
                width: 32px;
                height: 32px;
                border: 2px solid black;
                box-sizing: border-box;
              "></span>
            </label>

            <input type="radio" id="join-team-purple" name="join-team" value="purple" style="display: none;"></input>
            <label for="join-team-purple" style="cursor: pointer;">
              <span class="bolo-team bolo-team-purple" style="
                display: inline-block;
                width: 32px;
                height: 32px;
                border: 2px solid black;
                box-sizing: border-box;
              "></span>
            </label>
          </div>
        </div>

        <div style="text-align: center;">
          <button type="button" id="join-submit" style="
            padding: 6px 24px;
            border: 2px solid black;
            border-radius: 8px;
            background: white;
            cursor: pointer;
            font-family: 'Chicago', 'Charcoal', sans-serif;
            font-weight: bold;
            font-size: 12px;
          ">Join Game</button>
        </div>
      </div>
    </div>
  `;function Si(a){var i;const t=`; ${document.cookie}`.split(`; ${a}=`);return t.length===2&&((i=t.pop())==null?void 0:i.split(";").shift())||null}function Ve(a,e){document.cookie=`${a}=${e}; path=/; max-age=31536000`}class Ie extends me{constructor(){super(),this.authority=!1,this.mapChanges={},this.processingServerMessages=!1,this.objectsCreatedInThisPacket=new Set,this.gunsightVisible=!0,this.autoSlowdownActive=!1,this.teamScores=[0,0,0,0,0,0],this.mapChanges={},this.processingServerMessages=!1}loaded(e){this.vignette=e,this.heartbeatTimer=0;const t=/^\?([a-z]{20})$/.exec(location.search);if(t)this.connectToGame(t[1]);else if(location.search){this.vignette.message("Invalid game ID");return}else this.showLobby()}showLobby(){var t,i,s;this.vignette&&this.vignette.message(""),document.body.insertAdjacentHTML("beforeend",`
      <div id="lobby-dialog" style="
        position: fixed;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        background: #DDDDDD;
        color: black;
        padding: 0;
        border: 2px solid black;
        border-radius: 8px;
        min-width: 600px;
        max-width: 800px;
        max-height: 80vh;
        overflow: hidden;
        font-family: 'Chicago', 'Charcoal', sans-serif;
        z-index: 10000;
        box-shadow: 4px 4px 0px rgba(0, 0, 0, 0.3);
      ">
        <div style="
          background: white;
          border-bottom: 1px solid black;
          padding: 8px 16px;
          text-align: center;
          font-weight: bold;
        ">Bolo Multiplayer Lobby</div>
        <div style="padding: 20px; overflow-y: auto; max-height: calc(80vh - 60px);">

        <div id="active-games-section">
          <h2 style="margin: 0 0 10px 0; font-size: 14px;">Active Games</h2>
          <div id="active-games-list" style="margin-bottom: 20px; font-size: 12px;">
            Loading...
          </div>
        </div>

        <div id="create-game-section">
          <h2 style="margin: 20px 0 10px 0; font-size: 14px;">Create New Game</h2>
          <div style="margin-bottom: 10px; font-size: 12px;">
            <label for="map-select">Select Map:</label>
            <select id="map-select" style="
              margin-left: 10px;
              padding: 4px 8px;
              width: 300px;
              border: 1px solid black;
              background: white;
              font-family: 'Chicago', 'Charcoal', sans-serif;
              font-size: 12px;
            ">
              <option value="">Loading maps...</option>
            </select>
          </div>
          <button id="create-game-btn" style="
            padding: 6px 16px;
            cursor: pointer;
            border: 2px solid black;
            border-radius: 8px;
            background: white;
            font-family: 'Chicago', 'Charcoal', sans-serif;
            font-weight: bold;
            font-size: 12px;
          " disabled>Create Game</button>
        </div>

        <div style="margin-top: 30px; text-align: center; border-top: 1px solid black; padding-top: 20px;">
          <button id="how-to-play-btn" style="
            padding: 6px 16px;
            cursor: pointer;
            border: 2px solid black;
            border-radius: 8px;
            background: white;
            font-family: 'Chicago', 'Charcoal', sans-serif;
            font-weight: bold;
            font-size: 12px;
            margin-right: 10px;
          ">How to Play</button>
          <button id="key-settings-btn" style="
            padding: 6px 16px;
            cursor: pointer;
            border: 2px solid black;
            border-radius: 8px;
            background: white;
            font-family: 'Chicago', 'Charcoal', sans-serif;
            font-weight: bold;
            font-size: 12px;
          ">Key Settings</button>
        </div>
        </div>
      </div>
    `),this.loadMaps(),this.loadGames(),this.lobbyRefreshInterval=window.setInterval(()=>{this.loadGames()},3e3),(t=document.getElementById("create-game-btn"))==null||t.addEventListener("click",()=>{this.createGame()}),(i=document.getElementById("how-to-play-btn"))==null||i.addEventListener("click",()=>{this.showHowToPlay()}),(s=document.getElementById("key-settings-btn"))==null||s.addEventListener("click",()=>{this.showKeySettings()}),window.boloJoinGame=n=>this.connectToGame(n)}async loadMaps(){try{const t=await(await fetch("/api/maps")).json(),i=document.getElementById("map-select");if(!i)return;i.innerHTML=t.map(n=>`<option value="${n.name}">${n.name}</option>`).join("");const s=document.getElementById("create-game-btn");s&&(s.disabled=!1)}catch(e){console.error("Failed to load maps:",e)}}async loadGames(){try{const t=await(await fetch("/api/games")).json(),i=document.getElementById("active-games-list");if(!i)return;t.length===0?i.innerHTML='<p style="color: #888;">No active games. Create one below!</p>':i.innerHTML=t.map(s=>`
          <div style="border: 1px solid #666; padding: 10px; margin-bottom: 10px; display: flex; justify-content: space-between; align-items: center;">
            <div>
              <strong>${s.mapName}</strong>
              <span style="color: #888; margin-left: 10px;">${s.playerCount} player${s.playerCount!==1?"s":""}</span>
            </div>
            <button onclick="window.boloJoinGame('${s.gid}')" style="padding: 5px 15px; cursor: pointer;">Join</button>
          </div>
        `).join("")}catch(e){console.error("Failed to load games:",e)}}async createGame(){const e=document.getElementById("map-select");if(!e||!e.value)return;const t=e.value;try{const i=await fetch("/api/games",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({mapName:t})}),s=await i.json();i.ok?this.connectToGame(s.gid):alert(s.error||"Failed to create game")}catch(i){console.error("Failed to create game:",i),alert("Failed to create game")}}showKeySettings(){var c,f;const e={accelerate:"ArrowUp",decelerate:"ArrowDown",turnLeft:"ArrowLeft",turnRight:"ArrowRight",increaseRange:"KeyL",decreaseRange:"Semicolon",shoot:"Space",layMine:"Tab",tankView:"Enter",pillboxView:"KeyP",autoSlowdown:!0,autoGunsight:!0},t=Si("keyBindings"),i=t?{...e,...JSON.parse(t)}:e,s=d=>{const b={Space:"Spc",ArrowUp:"↑",ArrowDown:"↓",ArrowLeft:"←",ArrowRight:"→",Enter:"Ret",Tab:"Tab",Semicolon:";",Comma:",",Period:".",Slash:"/",Backslash:"\\",BracketLeft:"[",BracketRight:"]",Quote:"'",Backquote:"`",Minus:"-",Equal:"="};return b[d]?b[d]:d.startsWith("Key")?d.substring(3):d.startsWith("Digit")?d.substring(5):d},n=`
      <div id="key-settings-overlay" style="
        position: fixed;
        top: 0; left: 0; right: 0; bottom: 0;
        background: rgba(0, 0, 0, 0.5);
        z-index: 20000;
        display: flex;
        align-items: center;
        justify-content: center;
      ">
        <div id="key-settings-dialog" style="
          background: #DDDDDD;
          border: 2px solid black;
          border-radius: 8px;
          box-shadow: 4px 4px 0px rgba(0, 0, 0, 0.3);
          padding: 0;
          min-width: 400px;
          font-family: 'Chicago', 'Charcoal', sans-serif;
          color: black;
        ">
          <div style="
            background: white;
            border-bottom: 1px solid black;
            padding: 8px 16px;
            text-align: center;
            font-weight: bold;
            font-size: 14px;
          ">Key Settings</div>
          <div style="padding: 16px;">

          <div style="margin-bottom: 16px;">
            <div style="font-weight: bold; margin-bottom: 8px;">Drive tank</div>
            <div style="display: flex; gap: 8px; margin-bottom: 4px;">
              <label style="width: 120px;">Accelerate:</label>
              <input type="text" readonly class="key-input" data-binding="accelerate"
                value="${s(i.accelerate)}"
                style="
                  width: 80px;
                  border: 1px solid black;
                  background: white;
                  padding: 4px;
                  text-align: center;
                  cursor: pointer;
                  font-family: 'Chicago', 'Charcoal', monospace;
                  font-size: 12px;
                ">
            </div>
            <div style="display: flex; gap: 8px; margin-bottom: 8px;">
              <label style="width: 120px;">Decelerate:</label>
              <input type="text" readonly class="key-input" data-binding="decelerate"
                value="${s(i.decelerate)}"
                style="
                  width: 80px;
                  border: 1px solid black;
                  background: white;
                  padding: 4px;
                  text-align: center;
                  cursor: pointer;
                  font-family: 'Chicago', 'Charcoal', monospace;
                  font-size: 12px;
                ">
            </div>

            <div style="font-weight: bold; margin-bottom: 8px;">Rotate tank</div>
            <div style="display: flex; gap: 8px; margin-bottom: 4px;">
              <label style="width: 120px;">Anti-clockwise:</label>
              <input type="text" readonly class="key-input" data-binding="turnLeft"
                value="${s(i.turnLeft)}"
                style="
                  width: 80px;
                  border: 1px solid black;
                  background: white;
                  padding: 4px;
                  text-align: center;
                  cursor: pointer;
                  font-family: 'Chicago', 'Charcoal', monospace;
                  font-size: 12px;
                ">
            </div>
            <div style="display: flex; gap: 8px; margin-bottom: 8px;">
              <label style="width: 120px;">Clockwise:</label>
              <input type="text" readonly class="key-input" data-binding="turnRight"
                value="${s(i.turnRight)}"
                style="
                  width: 80px;
                  border: 1px solid black;
                  background: white;
                  padding: 4px;
                  text-align: center;
                  cursor: pointer;
                  font-family: 'Chicago', 'Charcoal', monospace;
                  font-size: 12px;
                ">
            </div>

            <div style="font-weight: bold; margin-bottom: 8px;">Gun range</div>
            <div style="display: flex; gap: 8px; margin-bottom: 4px;">
              <label style="width: 120px;">Increase:</label>
              <input type="text" readonly class="key-input" data-binding="increaseRange"
                value="${s(i.increaseRange)}"
                style="
                  width: 80px;
                  border: 1px solid black;
                  background: white;
                  padding: 4px;
                  text-align: center;
                  cursor: pointer;
                  font-family: 'Chicago', 'Charcoal', monospace;
                  font-size: 12px;
                ">
            </div>
            <div style="display: flex; gap: 8px; margin-bottom: 8px;">
              <label style="width: 120px;">Decrease:</label>
              <input type="text" readonly class="key-input" data-binding="decreaseRange"
                value="${s(i.decreaseRange)}"
                style="
                  width: 80px;
                  border: 1px solid black;
                  background: white;
                  padding: 4px;
                  text-align: center;
                  cursor: pointer;
                  font-family: 'Chicago', 'Charcoal', monospace;
                  font-size: 12px;
                ">
            </div>

            <div style="font-weight: bold; margin-bottom: 8px;">Weapons</div>
            <div style="display: flex; gap: 8px; margin-bottom: 4px;">
              <label style="width: 120px;">Shoot:</label>
              <input type="text" readonly class="key-input" data-binding="shoot"
                value="${s(i.shoot)}"
                style="
                  width: 80px;
                  border: 1px solid black;
                  background: white;
                  padding: 4px;
                  text-align: center;
                  cursor: pointer;
                  font-family: 'Chicago', 'Charcoal', monospace;
                  font-size: 12px;
                ">
            </div>
            <div style="display: flex; gap: 8px; margin-bottom: 8px;">
              <label style="width: 120px;">Lay mine:</label>
              <input type="text" readonly class="key-input" data-binding="layMine"
                value="${s(i.layMine)}"
                style="
                  width: 80px;
                  border: 1px solid black;
                  background: white;
                  padding: 4px;
                  text-align: center;
                  cursor: pointer;
                  font-family: 'Chicago', 'Charcoal', monospace;
                  font-size: 12px;
                ">
            </div>

            <div style="font-weight: bold; margin-bottom: 8px;">Switch views</div>
            <div style="display: flex; gap: 8px; margin-bottom: 4px;">
              <label style="width: 120px;">Tank view:</label>
              <input type="text" readonly class="key-input" data-binding="tankView"
                value="${s(i.tankView)}"
                style="
                  width: 80px;
                  border: 1px solid black;
                  background: white;
                  padding: 4px;
                  text-align: center;
                  cursor: pointer;
                  font-family: 'Chicago', 'Charcoal', monospace;
                  font-size: 12px;
                ">
            </div>
            <div style="display: flex; gap: 8px; margin-bottom: 8px;">
              <label style="width: 120px;">Pillbox view:</label>
              <input type="text" readonly class="key-input" data-binding="pillboxView"
                value="${s(i.pillboxView)}"
                style="
                  width: 80px;
                  border: 1px solid black;
                  background: white;
                  padding: 4px;
                  text-align: center;
                  cursor: pointer;
                  font-family: 'Chicago', 'Charcoal', monospace;
                  font-size: 12px;
                ">
            </div>

            <div style="margin-top: 12px;">
              <div style="margin-bottom: 4px;">
                <label style="cursor: pointer;">
                  <input type="checkbox" id="auto-slowdown" ${i.autoSlowdown?"checked":""}>
                  Auto Slowdown
                </label>
              </div>
              <div>
                <label style="cursor: pointer;">
                  <input type="checkbox" id="auto-gunsight" ${i.autoGunsight?"checked":""}>
                  Enable automatic show &amp; hide of gunsight
                </label>
              </div>
            </div>
          </div>

          <div style="text-align: center; display: flex; gap: 8px; justify-content: center;">
            <button id="key-settings-cancel" style="
              padding: 6px 16px;
              border: 2px solid black;
              border-radius: 8px;
              background: white;
              cursor: pointer;
              min-width: 80px;
              font-family: 'Chicago', 'Charcoal', sans-serif;
              font-weight: bold;
              font-size: 12px;
            ">Cancel</button>
            <button id="key-settings-ok" style="
              padding: 6px 16px;
              border: 2px solid black;
              border-radius: 8px;
              background: white;
              cursor: pointer;
              min-width: 80px;
              font-family: 'Chicago', 'Charcoal', sans-serif;
              font-weight: bold;
              font-size: 12px;
            ">OK</button>
          </div>
          </div>
        </div>
      </div>
    `;document.body.insertAdjacentHTML("beforeend",n);const r={...i};let l=null;const o=Array.from(document.querySelectorAll(".key-input")),h=d=>{l=d,d.value="...",d.style.background="#ffffcc"};o.forEach(d=>{d.addEventListener("click",b=>{const y=b.target;h(y)})});const u=d=>{if(!l)return;d.preventDefault(),d.stopPropagation();const b=l.getAttribute("data-binding");if(!b)return;r[b]=d.code,l.value=s(d.code),l.style.background="white";const p=o.indexOf(l)+1;p<o.length?h(o[p]):l=null};document.addEventListener("keydown",u),(c=document.getElementById("key-settings-cancel"))==null||c.addEventListener("click",()=>{var d;document.removeEventListener("keydown",u),(d=document.getElementById("key-settings-overlay"))==null||d.remove()}),(f=document.getElementById("key-settings-ok"))==null||f.addEventListener("click",()=>{var d,b,y;r.autoSlowdown=(d=document.getElementById("auto-slowdown"))==null?void 0:d.checked,r.autoGunsight=(b=document.getElementById("auto-gunsight"))==null?void 0:b.checked,Ve("keyBindings",JSON.stringify(r)),document.removeEventListener("keydown",u),(y=document.getElementById("key-settings-overlay"))==null||y.remove(),this.updateKeyBindings&&this.updateKeyBindings(r)})}showHowToPlay(){var t,i;document.body.insertAdjacentHTML("beforeend",`
      <div id="how-to-play-overlay" style="
        position: fixed;
        top: 0; left: 0; right: 0; bottom: 0;
        background: rgba(0, 0, 0, 0.5);
        z-index: 20000;
        display: flex;
        align-items: center;
        justify-content: center;
      ">
        <div id="how-to-play-dialog" style="
          background: #DDDDDD;
          border: 2px solid black;
          border-radius: 8px;
          box-shadow: 4px 4px 0px rgba(0, 0, 0, 0.3);
          padding: 0;
          max-width: 700px;
          max-height: 85vh;
          overflow: hidden;
          font-family: 'Chicago', 'Charcoal', sans-serif;
          color: black;
        ">
          <div style="
            background: white;
            border-bottom: 1px solid black;
            padding: 8px 16px;
            text-align: center;
            font-weight: bold;
            font-size: 14px;
          ">How to Play Bolo</div>
          <div style="padding: 16px; overflow-y: auto; max-height: calc(85vh - 80px);">

          <div style="padding: 0 8px;">
            <!-- OBJECTIVE -->
            <div style="margin-bottom: 14px;">
              <div style="font-weight: bold; margin-bottom: 4px; font-size: 13px;">🎯 How to Win</div>
              <div style="font-size: 11px; line-height: 1.4;">
                Capture ALL bases on the map. Work with teammates on your color team to control territory, build defenses, and eliminate enemy bases.
              </div>
            </div>

            <!-- UNDERSTANDING THE SCREEN -->
            <div style="margin-bottom: 14px;">
              <div style="font-weight: bold; margin-bottom: 4px; font-size: 13px;">📺 Understanding the Screen</div>
              <div style="font-size: 11px; line-height: 1.4;">
                <strong>Bottom Right (Tank Status):</strong> Four yellow bars show your Shells, Mines, Armor (health), and Trees (building materials). Max 40 each.<br>
                <strong>Bottom Left:</strong> Three status panels show all Pillboxes (defense turrets), Bases (refuel stations), and Players. Checkerboard pattern = neutral/uncaptured.<br>
                <strong>Top Right (Stats):</strong> Your kills ☠, deaths †, and team rank ★<br>
                <strong>Top Center (Build Tools):</strong> Five tools: Forest (gather trees), Road, Building, Pillbox, Mine. Click to select, click map to build.<br>
                <strong>Targeting Reticle:</strong> Circular crosshair shows where your shots will land
              </div>
            </div>

            <!-- BASIC CONTROLS -->
            <div style="margin-bottom: 14px;">
              <div style="font-weight: bold; margin-bottom: 4px; font-size: 13px;">⌨️ Controls</div>
              <div style="font-size: 11px; line-height: 1.4;">
                <strong>Arrow Keys:</strong> Move and turn your tank<br>
                <strong>Space:</strong> Shoot (hold for auto-fire)<br>
                <strong>Tab:</strong> Drop mine behind tank<br>
                <strong>L/; (semicolon):</strong> Adjust gun range (1-7 tiles)<br>
                <strong>Enter/P:</strong> Switch camera views<br>
                <strong>T/R:</strong> Chat (all players / team only)<br>
                <strong>Mouse Click:</strong> Build selected item at location
              </div>
              <div style="font-size: 10px; margin-top: 3px; font-style: italic;">
                Customize controls in "Key Settings" (lobby)
              </div>
            </div>

            <!-- GETTING STARTED -->
            <div style="margin-bottom: 14px;">
              <div style="font-weight: bold; margin-bottom: 4px; font-size: 13px;">🚀 Getting Started</div>
              <div style="font-size: 11px; line-height: 1.4;">
                <strong>1. Gather Resources:</strong> Drive into forests (#) to collect trees. Select the Forest tool, click on trees to send your builder (little man) to chop them.<br>
                <strong>2. Capture Bases:</strong> Drive your tank onto checkerboard bases to capture them. They'll turn your team color and refuel your tank automatically.<br>
                <strong>3. Refuel:</strong> Park on your team's bases. They slowly transfer armor (health), shells, and mines to fill your tank.
              </div>
            </div>

            <!-- THE BUILDER SYSTEM -->
            <div style="margin-bottom: 14px;">
              <div style="font-weight: bold; margin-bottom: 4px; font-size: 13px;">🔨 Building System</div>
              <div style="font-size: 11px; line-height: 1.4;">
                <strong>How it works:</strong> Select a tool at top, click map location. A little man exits your tank, walks there, builds, and returns.<br>
                <strong>Forest tool:</strong> Chop trees, gain 4 trees<br>
                <strong>Road (0.5 trees):</strong> Build fast-travel paths<br>
                <strong>Building (0.5 trees):</strong> Build walls for defense<br>
                <strong>Pillbox (1 tree):</strong> Place defense turret (must be carrying one)<br>
                <strong>Mine (uses 1 mine):</strong> Lay explosive trap<br>
                <strong>Warning:</strong> Your builder can be killed! Protect him.
              </div>
            </div>

            <!-- BASES -->
            <div style="margin-bottom: 14px;">
              <div style="font-weight: bold; margin-bottom: 4px; font-size: 13px;">🏰 Bases (Refuel Stations)</div>
              <div style="font-size: 11px; line-height: 1.4;">
                <strong>Capture:</strong> Drive onto checkerboard bases<br>
                <strong>Refuel:</strong> Park on your bases to restore armor, shells, and mines<br>
                <strong>Attack:</strong> Shoot enemy bases to damage them (5 armor per hit)<br>
                <strong>Regeneration:</strong> Bases slowly refill their supplies over time<br>
                <strong>Win Condition:</strong> Control all bases on the map
              </div>
            </div>

            <!-- PILLBOXES -->
            <div style="margin-bottom: 14px;">
              <div style="font-weight: bold; margin-bottom: 4px; font-size: 13px;">🛡️ Pillboxes (Defense Turrets)</div>
              <div style="font-size: 11px; line-height: 1.4;">
                <strong>Auto-Defense:</strong> Pillboxes automatically shoot enemy tanks in range<br>
                <strong>Capturing:</strong> Shoot enemy pillboxes until disabled (0 armor), drive over to pick up, then rebuild using builder + 1 tree<br>
                <strong>Team Defense:</strong> Your team's pillboxes won't shoot teammates<br>
                <strong>Status:</strong> Check bottom-left panel—gray with X means disabled/dead
              </div>
            </div>

            <!-- COMBAT -->
            <div style="margin-bottom: 14px;">
              <div style="font-weight: bold; margin-bottom: 4px; font-size: 13px;">⚔️ Combat Tips</div>
              <div style="font-size: 11px; line-height: 1.4;">
                <strong>•</strong> Adjust range (L/;) to hit targets accurately<br>
                <strong>•</strong> Watch your armor bar—when it hits 0, you die<br>
                <strong>•</strong> Respawn takes ~5 seconds after death<br>
                <strong>•</strong> Forest (#) hides you from enemy pillboxes if completely surrounded<br>
                <strong>•</strong> Mines damage any tank that drives over them (10 damage)<br>
                <strong>•</strong> Work with teammates—use team chat (R key)
              </div>
            </div>

            <!-- TEAM COLORS -->
            <div style="margin-bottom: 14px;">
              <div style="font-weight: bold; margin-bottom: 4px; font-size: 13px;">🎨 Team Colors</div>
              <div style="font-size: 11px; line-height: 1.4;">
                <strong>Six teams:</strong> Red, Blue, Yellow, Green, Orange, Purple<br>
                <strong>Your team's color:</strong> Shows on bases, pillboxes, and team rank star<br>
                <strong>Checkerboard pattern:</strong> Neutral/uncaptured bases
              </div>
            </div>

            <div style="text-align: center; margin-top: 20px;">
              <button id="how-to-play-close" style="
                padding: 6px 24px;
                border: 2px solid black;
                border-radius: 8px;
                background: white;
                cursor: pointer;
                font-family: 'Chicago', 'Charcoal', sans-serif;
                font-weight: bold;
                font-size: 12px;
              ">Close</button>
            </div>
          </div>
          </div>
        </div>
      </div>
    `),(t=document.getElementById("how-to-play-close"))==null||t.addEventListener("click",()=>{var s;(s=document.getElementById("how-to-play-overlay"))==null||s.remove()}),(i=document.getElementById("how-to-play-overlay"))==null||i.addEventListener("click",s=>{var n;s.target===document.getElementById("how-to-play-overlay")&&((n=document.getElementById("how-to-play-overlay"))==null||n.remove())})}updateKeyBindings(e){this.keyBindings=e}connectToGame(e){var s,n;this.lobbyRefreshInterval&&(clearInterval(this.lobbyRefreshInterval),this.lobbyRefreshInterval=void 0),(s=document.getElementById("lobby-dialog"))==null||s.remove(),(n=this.vignette)==null||n.message("Connecting to game...");const t=e==="demo"?"/demo":`/match/${e}`,i=location.protocol==="https:"?"wss:":"ws:";this.ws=new WebSocket(`${i}//${location.host}${t}`),this.ws.addEventListener("open",()=>{this.connected()},{once:!0}),this.ws.addEventListener("close",()=>{this.failure("Connection lost")},{once:!0})}connected(){this.vignette&&(this.vignette.message("Waiting for the game map"),this.ws&&this.ws.addEventListener("message",e=>{this.receiveMap(e)},{once:!0}))}receiveMap(e){this.map=it.load(be(e.data)),this.commonInitialization(),this.vignette&&this.vignette.message("Waiting for the game state"),this.ws&&this.ws.addEventListener("message",t=>{this.handleMessage(t)})}synchronized(){this._isSynchronized=!0,this.rebuildMapObjects(),this.vignette&&(this.vignette.destroy(),this.vignette=null),this.loop.start();const e=[0,0,0,0,0,0];for(const f of this.tanks)f.team>=0&&f.team<6&&e[f.team]++;const t=["red","blue","yellow","green","orange","purple"];let i=Math.min(...e),s=t[e.indexOf(i)];const n=document.createElement("div");n.innerHTML=Ai;const r=n.firstElementChild;r.style.position="fixed",r.style.top="50%",r.style.left="50%",r.style.transform="translate(-50%, -50%)",r.style.zIndex="10000";const l=document.createElement("div");l.style.cssText=`
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: rgba(0, 0, 0, 0.5);
      z-index: 9999;
    `,document.body.appendChild(l),document.body.appendChild(r),this.joinDialog=r;const o=r.querySelector("#join-nick-field");o&&(o.value="",o.focus(),o.addEventListener("keydown",f=>{f.which===13&&this.join()}));const h=r.querySelector(`#join-team-${s}`);if(h){h.checked=!0;const f=r.querySelector(`label[for="join-team-${s}"] span`);f&&(f.style.borderWidth="3px")}r.querySelectorAll('#join-team input[type="radio"]').forEach(f=>{f.addEventListener("change",d=>{const b=d.target;r.querySelectorAll("#join-team label span").forEach(p=>{p.style.borderWidth="2px"});const y=r.querySelector(`label[for="${b.id}"] span`);y&&(y.style.borderWidth="3px")})});const c=r.querySelector("#join-submit");c&&c.addEventListener("click",()=>{this.join()})}join(){if(!this.joinDialog)return;const e=this.joinDialog.querySelector("#join-nick-field"),t=e==null?void 0:e.value,i=this.joinDialog.querySelector("#join-team input:checked"),s=i==null?void 0:i.value;let n;switch(s){case"red":n=0;break;case"blue":n=1;break;case"yellow":n=2;break;case"green":n=3;break;case"orange":n=4;break;case"purple":n=5;break;default:n=-1}if(!t||n===-1)return;Ve("nick",t);const r=this.joinDialog.parentElement,l=r==null?void 0:r.querySelector('div[style*="z-index: 9999"]');l&&l.remove(),this.joinDialog.remove(),this.joinDialog=null,this.ws&&this.ws.send(JSON.stringify({command:"join",nick:t,team:n})),this.input.focus()}receiveWelcome(e){this.player=e,this.renderer.initHud(),this.initChat()}tick(){super.tick(),this.increasingRange!==this.decreasingRange?++this.rangeAdjustTimer===6&&(this.ws&&(this.increasingRange?(this.ws.send(ki),this.keyBindings.autoGunsight&&this.player&&this.player.firingRange===7&&(this.gunsightVisible=!1)):(this.ws.send(Ti),this.keyBindings.autoGunsight&&(this.gunsightVisible=!0))),this.rangeAdjustTimer=0):this.rangeAdjustTimer=0,++this.heartbeatTimer===10&&(this.heartbeatTimer=0,this.ws&&this.ws.send(""))}failure(e){this.ws&&(this.ws.close(),this.ws=null),super.failure(e)}soundEffect(e,t,i,s){}netSpawn(e,t){const i=super.netSpawn(e,t);return this.rebuildMapObjects(),i}netDestroy(e,t){const i=super.netDestroy(e,t);return this.rebuildMapObjects(),i}mapChanged(e,t,i,s){this.processingServerMessages||this.mapChanges[e.idx]==null&&(e._net_oldType=t,e._net_hadMine=i,e._net_oldLife=s,this.mapChanges[e.idx]=e)}initChat(){this.chatMessages=document.createElement("div"),this.chatMessages.id="chat-messages",this.renderer.hud.appendChild(this.chatMessages),this.chatContainer=document.createElement("div"),this.chatContainer.id="chat-input",this.chatContainer.style.display="none",this.renderer.hud.appendChild(this.chatContainer),this.chatInput=document.createElement("input"),this.chatInput.type="text",this.chatInput.name="chat",this.chatInput.maxLength=140,this.chatInput.addEventListener("keydown",e=>this.handleChatKeydown(e)),this.chatContainer.appendChild(this.chatInput)}openChat(e){e=e||{},this.chatContainer.style.display="block",this.chatInput.value="",this.chatInput.focus(),this.chatInput.team=e.team}commitChat(){this.ws&&this.ws.send(JSON.stringify({command:this.chatInput.team?"teamMsg":"msg",text:this.chatInput.value})),this.closeChat()}closeChat(){this.chatContainer.style.display="none",this.input.focus()}receiveChat(e,t,i){i=i||{};const s=document.createElement("p");s.className=i.team?"msg-team":"msg",s.textContent=`<${e.name}> ${t}`,this.chatMessages.appendChild(s),window.setTimeout(()=>{s.remove()},7e3)}handleKeydown(e){if(!this.ws||!this.player)return;const t=e.code,i=this.keyBindings;t===i.shoot?this.ws.send(mi):t===i.layMine?this.ws.send(wi):t===i.turnLeft?this.ws.send(di):t===i.accelerate?(this.ws.send(gi),this.autoSlowdownActive&&(this.ws.send(Fe),this.autoSlowdownActive=!1)):t===i.turnRight?this.ws.send(pi):t===i.decelerate?(this.ws.send(Ke),this.autoSlowdownActive=!1):t===i.tankView?this.switchToTankView():t===i.pillboxView?this.switchToPillboxView():t==="KeyT"?this.openChat():t==="KeyR"&&this.openChat({team:!0})}handleKeyup(e){if(!this.ws||!this.player)return;const t=e.code,i=this.keyBindings;t===i.shoot?this.ws.send(yi):t===i.layMine?this.ws.send(xi):t===i.turnLeft?this.ws.send(ui):t===i.accelerate?(this.ws.send(bi),i.autoSlowdown&&(this.ws.send(Ke),this.autoSlowdownActive=!0)):t===i.turnRight?this.ws.send(fi):t===i.decelerate&&(this.ws.send(Fe),this.autoSlowdownActive=!1)}handleChatKeydown(e){if(!(!this.ws||!this.player)){switch(e.which){case 13:this.commitChat();break;case 27:this.closeChat();break;default:return}e.preventDefault()}}buildOrder(e,t,i){!this.ws||!this.player||(t=t||0,this.ws.send([vi,e,t,i.x,i.y].join(",")))}switchToPillboxView(){if(!this.player||!this.map)return;const e=this.map.pills.filter(t=>t&&!t.inTank&&!t.carried&&t.armour>0&&t.team===this.player.team);e.length!==0&&(this.viewMode==="tank"?(this.viewMode="pillbox",this.currentPillboxIndex=0):this.currentPillboxIndex=(this.currentPillboxIndex+1)%e.length)}switchToTankView(){this.viewMode="tank",this.currentPillboxIndex=0}getViewTarget(){if(this.viewMode==="tank"||!this.player||!this.map)return null;const e=this.map.pills.filter(t=>t&&!t.inTank&&!t.carried&&t.armour>0&&t.team===this.player.team);return e.length===0||this.currentPillboxIndex>=e.length?(this.viewMode="tank",null):e[this.currentPillboxIndex]}handleMessage(e){let t=null;if(e.data.charAt(0)==="{")try{this.handleJsonCommand(JSON.parse(e.data))}catch(i){t=i}else if(e.data.charAt(0)==="[")try{const i=JSON.parse(e.data);for(const s of i)this.handleJsonCommand(s)}catch(i){t=i}else{this.netRestore();try{const i=be(e.data);let s=0;const n=i.length;for(this.processingServerMessages=!0,this.objectsCreatedInThisPacket.clear();s<n;){const r=i[s++],l=this.handleBinaryCommand(r,i,s);s+=l}this.processingServerMessages=!1,s!==n&&(t=new Error(`Message length mismatch, processed ${s} out of ${n} bytes`))}catch(i){t=i}}if(t)throw this.failure("Connection lost (protocol error)"),console&&console.log("Following exception occurred while processing message:",e.data),t}handleBinaryCommand(e,t,i){switch(e){case ii:return this.synchronized(),0;case si:{const[[s],n]=G("H",t,i);return this.receiveWelcome(this.objects[s]),n}case ni:return this.netSpawn(t,i);case ri:return this.netDestroy(t,i);case oi:{const[[s,n,r,l,o],h]=G("BBBBf",t,i),u=String.fromCharCode(r),c=this.map.cells[n][s];return c.setType(u,o),c.life=l,h}case hi:{const[[s,n,r,l],o]=G("BHHH",t,i);return this.renderer.playSound(s,n,r,this.objects[l]),o}case ai:{const[[s],n]=G("H",t,i),r=this.objects[s],l=!this._isSynchronized||r&&r._createdViaMessage,o=r&&r.load?r.load(t,i+n,l):0;return r&&this.objectsCreatedInThisPacket.add(r),r&&r._createdViaMessage&&delete r._createdViaMessage,n+o}case li:return this.netTick(t,i,this.objectsCreatedInThisPacket);case ci:{const[s,n]=G("HHHHHH",t,i);return this.teamScores=s.map(r=>r/100),n}default:throw new Error(`Bad command '${e}' from server, at offset ${i-1}`)}}handleJsonCommand(e){switch(e.command){case"nick":this.objects[e.idx]&&(this.objects[e.idx].name=e.nick);break;case"msg":this.objects[e.idx]&&this.receiveChat(this.objects[e.idx],e.text);break;case"teamMsg":this.objects[e.idx]&&this.receiveChat(this.objects[e.idx],e.text,{team:!0});break;default:throw new Error(`Bad JSON command '${e.command}' from server.`)}}rebuildMapObjects(){this.map.pills=[],this.map.bases=[];for(const e of this.objects){if(e instanceof te)this.map.pills.push(e);else if(e instanceof ie)this.map.bases.push(e);else continue;e.cell&&e.cell.retile()}}netRestore(){super.netRestore();for(const e in this.mapChanges){const t=this.mapChanges[e];t.setType(t._net_oldType,t._net_hadMine),t.life=t._net_oldLife}this.mapChanges={}}}Ce(Ie.prototype,Ee);Ci.registerWithWorld(Ie.prototype);const Ei=location.search==="?local"||location.hostname.split(".")[1]==="github"?Be:Ie;window.addEventListener("load",function(){const a=new Ei;window.world=a,a.start()});
