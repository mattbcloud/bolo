(function(){const t=document.createElement("link").relList;if(t&&t.supports&&t.supports("modulepreload"))return;for(const s of document.querySelectorAll('link[rel="modulepreload"]'))i(s);new MutationObserver(s=>{for(const n of s)if(n.type==="childList")for(const r of n.addedNodes)r.tagName==="LINK"&&r.rel==="modulepreload"&&i(r)}).observe(document,{childList:!0,subtree:!0});function e(s){const n={};return s.integrity&&(n.integrity=s.integrity),s.referrerPolicy&&(n.referrerPolicy=s.referrerPolicy),s.crossOrigin==="use-credentials"?n.credentials="include":s.crossOrigin==="anonymous"?n.credentials="omit":n.credentials="same-origin",n}function i(s){if(s.ep)return;s.ep=!0;const n=e(s);fetch(s.href,n)}})();const tt=class tt{constructor(){this.objects=[],this.tanks=[]}registerType(t){const e=this.constructor.types.length;this.constructor.types.push(t),this.constructor.typesByName.set(t.name,e)}insert(t){t.idx=this.objects.length,this.objects.push(t)}tick(){for(const t of this.objects)t&&t.tick&&t.tick()}spawn(t,...e){const i=new t(this);return this.insert(i),i.spawn&&typeof i.spawn=="function"&&i.spawn(...e),i.anySpawn&&typeof i.anySpawn=="function"&&i.anySpawn(),i.constructor.name==="Tank"&&this.tanks.push(i),i}destroy(t){const e=this.objects.indexOf(t);e!==-1&&this.objects.splice(e,1);const i=this.tanks.indexOf(t);i!==-1&&this.tanks.splice(i,1),t.destroy&&t.destroy()}};tt.types=[],tt.typesByName=new Map;let mt=tt;const M=8,x=32,C=x*M,A=256,Rt=A*x,le=20,{round:Pt,floor:ae,min:he}=Math,_=[{ascii:"|",description:"building"},{ascii:" ",description:"river"},{ascii:"~",description:"swamp"},{ascii:"%",description:"crater"},{ascii:"=",description:"road"},{ascii:"#",description:"forest"},{ascii:":",description:"rubble"},{ascii:".",description:"grass"},{ascii:"}",description:"shot building"},{ascii:"b",description:"river with boat"},{ascii:"^",description:"deep sea"}];function ce(){for(const a of _)_[a.ascii]=a}ce();class bt{constructor(t,e,i,s){this.map=t,this.x=e,this.y=i,this.type=_["^"],this.mine=this.isEdgeCell(),this.idx=i*A+e}neigh(t,e){return this.map.cellAtTile(this.x+t,this.y+e)}isType(...t){for(let e=0;e<arguments.length;e++){const i=arguments[e];if(this.type===i||this.type.ascii===i)return!0}return!1}isEdgeCell(){return this.x<=20||this.x>=236||this.y<=20||this.y>=236}getNumericType(){if(this.type.ascii==="^")return-1;let t=_.indexOf(this.type);return this.mine&&(t+=8),t}setType(t,e,i){if(i=i??1,this.type,this.mine,e!==void 0&&(this.mine=e),typeof t=="string"){if(this.type=_[t],t.length!==1||!this.type)throw new Error(`Invalid terrain type: ${t}`)}else if(typeof t=="number"){if(t>=10?(t-=8,this.mine=!0):this.mine=!1,this.type=_[t],!this.type)throw new Error(`Invalid terrain type: ${t}`)}else t!==null&&(this.type=t);this.isEdgeCell()&&(this.mine=!0),i>=0&&this.map.retile(this.x-i,this.y-i,this.x+i,this.y+i)}setTile(t,e){this.mine&&!this.pill&&!this.base&&(e+=10),this.map.view.onRetile(this,t,e)}retile(){if(this.pill)this.setTile(this.pill.armour,2);else if(this.base)this.setTile(16,0);else switch(this.type.ascii){case"^":this.retileDeepSea();break;case"|":this.retileBuilding();break;case" ":this.retileRiver();break;case"~":this.setTile(7,1);break;case"%":this.setTile(5,1);break;case"=":this.retileRoad();break;case"#":this.retileForest();break;case":":this.setTile(4,1);break;case".":this.setTile(2,1);break;case"}":this.setTile(8,1);break;case"b":this.retileBoat();break}}retileDeepSea(){const t=(p,c)=>{const d=this.neigh(p,c);return d.isType("^")?"d":d.isType(" ","b")?"w":"l"},e=t(0,-1),i=t(1,-1),s=t(1,0),n=t(1,1),r=t(0,1),l=t(-1,1),o=t(-1,0);t(-1,-1)!=="d"&&e!=="d"&&o!=="d"&&s==="d"&&r==="d"?this.setTile(10,3):i!=="d"&&e!=="d"&&s!=="d"&&o==="d"&&r==="d"?this.setTile(11,3):n!=="d"&&r!=="d"&&s!=="d"&&o==="d"&&e==="d"?this.setTile(13,3):l!=="d"&&r!=="d"&&o!=="d"&&s==="d"&&e==="d"?this.setTile(12,3):o==="w"&&s==="d"?this.setTile(14,3):r==="w"&&e==="d"?this.setTile(15,3):e==="w"&&r==="d"?this.setTile(16,3):s==="w"&&o==="d"?this.setTile(17,3):this.setTile(0,0)}retileBuilding(){const t=(p,c)=>this.neigh(p,c).isType("|","}")?"b":"o",e=t(0,-1),i=t(1,-1),s=t(1,0),n=t(1,1),r=t(0,1),l=t(-1,1),o=t(-1,0),h=t(-1,-1);h==="b"&&e==="b"&&i==="b"&&o==="b"&&s==="b"&&l==="b"&&r==="b"&&n==="b"?this.setTile(17,1):s==="b"&&e==="b"&&r==="b"&&o==="b"&&i!=="b"&&h!=="b"&&n!=="b"&&l!=="b"?this.setTile(30,1):s==="b"&&e==="b"&&r==="b"&&o==="b"&&i!=="b"&&h!=="b"&&n!=="b"&&l==="b"?this.setTile(22,2):s==="b"&&e==="b"&&r==="b"&&o==="b"&&i!=="b"&&h==="b"&&n!=="b"&&l!=="b"?this.setTile(23,2):s==="b"&&e==="b"&&r==="b"&&o==="b"&&i!=="b"&&h!=="b"&&n==="b"&&l!=="b"?this.setTile(24,2):s==="b"&&e==="b"&&r==="b"&&o==="b"&&i==="b"&&h!=="b"&&n!=="b"&&l!=="b"?this.setTile(25,2):h==="b"&&e==="b"&&o==="b"&&s==="b"&&l==="b"&&r==="b"&&n==="b"?this.setTile(16,2):e==="b"&&i==="b"&&o==="b"&&s==="b"&&l==="b"&&r==="b"&&n==="b"?this.setTile(17,2):h==="b"&&e==="b"&&i==="b"&&o==="b"&&s==="b"&&l==="b"&&r==="b"?this.setTile(18,2):h==="b"&&e==="b"&&i==="b"&&o==="b"&&s==="b"&&r==="b"&&n==="b"?this.setTile(19,2):o==="b"&&s==="b"&&e==="b"&&r==="b"&&i==="b"&&l==="b"&&h!=="b"&&n!=="b"?this.setTile(20,2):o==="b"&&s==="b"&&e==="b"&&r==="b"&&n==="b"&&h==="b"&&i!=="b"&&l!=="b"?this.setTile(21,2):e==="b"&&o==="b"&&s==="b"&&r==="b"&&n==="b"&&i==="b"?this.setTile(8,2):e==="b"&&o==="b"&&s==="b"&&r==="b"&&l==="b"&&h==="b"?this.setTile(9,2):e==="b"&&o==="b"&&s==="b"&&r==="b"&&l==="b"&&n==="b"?this.setTile(10,2):e==="b"&&o==="b"&&s==="b"&&r==="b"&&h==="b"&&i==="b"?this.setTile(11,2):e==="b"&&r==="b"&&o==="b"&&s!=="b"&&l==="b"&&h!=="b"?this.setTile(12,2):e==="b"&&r==="b"&&s==="b"&&n==="b"&&o!=="b"&&i!=="b"?this.setTile(13,2):e==="b"&&r==="b"&&s==="b"&&i==="b"&&n!=="b"?this.setTile(14,2):e==="b"&&r==="b"&&o==="b"&&h==="b"&&l!=="b"?this.setTile(15,2):s==="b"&&e==="b"&&o==="b"&&r!=="b"&&h!=="b"&&i!=="b"?this.setTile(26,1):s==="b"&&r==="b"&&o==="b"&&l!=="b"&&n!=="b"?this.setTile(27,1):s==="b"&&e==="b"&&r==="b"&&i!=="b"&&n!=="b"?this.setTile(28,1):r==="b"&&e==="b"&&o==="b"&&h!=="b"&&l!=="b"?this.setTile(29,1):o==="b"&&s==="b"&&e==="b"&&i==="b"&&h!=="b"?this.setTile(4,2):o==="b"&&s==="b"&&e==="b"&&h==="b"&&i!=="b"?this.setTile(5,2):o==="b"&&s==="b"&&r==="b"&&l==="b"&&n!=="b"?this.setTile(6,2):o==="b"&&s==="b"&&r==="b"&&e!=="b"&&n==="b"&&l!=="b"?this.setTile(7,2):s==="b"&&e==="b"&&r==="b"?this.setTile(0,2):o==="b"&&e==="b"&&r==="b"?this.setTile(1,2):s==="b"&&o==="b"&&r==="b"?this.setTile(2,2):s==="b"&&e==="b"&&o==="b"?this.setTile(3,2):s==="b"&&r==="b"&&n==="b"?this.setTile(18,1):o==="b"&&r==="b"&&l==="b"?this.setTile(19,1):s==="b"&&e==="b"&&i==="b"?this.setTile(20,1):o==="b"&&e==="b"&&h==="b"?this.setTile(21,1):s==="b"&&r==="b"?this.setTile(22,1):o==="b"&&r==="b"?this.setTile(23,1):s==="b"&&e==="b"?this.setTile(24,1):o==="b"&&e==="b"?this.setTile(25,1):o==="b"&&s==="b"?this.setTile(11,1):e==="b"&&r==="b"?this.setTile(12,1):s==="b"?this.setTile(13,1):o==="b"?this.setTile(14,1):r==="b"?this.setTile(15,1):e==="b"?this.setTile(16,1):this.setTile(6,1)}retileRiver(){const t=(r,l)=>{const o=this.neigh(r,l);return o.isType("=")?"r":o.isType("^"," ","b")?"w":"l"},e=t(0,-1),i=t(1,0),s=t(0,1),n=t(-1,0);e==="l"&&s==="l"&&i==="l"&&n==="l"?this.setTile(30,2):e==="l"&&s==="l"&&i==="w"&&n==="l"?this.setTile(26,2):e==="l"&&s==="l"&&i==="l"&&n==="w"?this.setTile(27,2):e==="l"&&s==="w"&&i==="l"&&n==="l"?this.setTile(28,2):e==="w"&&s==="l"&&i==="l"&&n==="l"?this.setTile(29,2):e==="l"&&n==="l"?this.setTile(6,3):e==="l"&&i==="l"?this.setTile(7,3):s==="l"&&n==="l"?this.setTile(8,3):s==="l"&&i==="l"?this.setTile(9,3):s==="l"&&e==="l"&&s==="l"?this.setTile(0,3):n==="l"&&i==="l"?this.setTile(1,3):n==="l"?this.setTile(2,3):s==="l"?this.setTile(3,3):i==="l"?this.setTile(4,3):e==="l"?this.setTile(5,3):this.setTile(1,0)}retileRoad(){const t=(p,c)=>{const d=this.neigh(p,c);return d.isType("=")?"r":d.isType("^"," ","b")?"w":"l"},e=t(0,-1),i=t(1,-1),s=t(1,0),n=t(1,1),r=t(0,1),l=t(-1,1),o=t(-1,0),h=t(-1,-1);h!=="r"&&e==="r"&&i!=="r"&&o==="r"&&s==="r"&&l!=="r"&&r==="r"&&n!=="r"?this.setTile(11,0):e==="r"&&o==="r"&&s==="r"&&r==="r"?this.setTile(10,0):o==="w"&&s==="w"&&e==="w"&&r==="w"?this.setTile(26,0):s==="r"&&r==="r"&&o==="w"&&e==="w"?this.setTile(20,0):o==="r"&&r==="r"&&s==="w"&&e==="w"?this.setTile(21,0):e==="r"&&o==="r"&&r==="w"&&s==="w"?this.setTile(22,0):s==="r"&&e==="r"&&o==="w"&&r==="w"?this.setTile(23,0):e==="w"&&r==="w"?this.setTile(24,0):o==="w"&&s==="w"?this.setTile(25,0):e==="w"&&r==="r"?this.setTile(16,0):s==="w"&&o==="r"?this.setTile(17,0):r==="w"&&e==="r"?this.setTile(18,0):o==="w"&&s==="r"?this.setTile(19,0):s==="r"&&r==="r"&&e==="r"&&(i==="r"||n==="r")?this.setTile(27,0):o==="r"&&s==="r"&&r==="r"&&(l==="r"||n==="r")?this.setTile(28,0):o==="r"&&e==="r"&&r==="r"&&(l==="r"||h==="r")?this.setTile(29,0):o==="r"&&s==="r"&&e==="r"&&(i==="r"||h==="r")?this.setTile(30,0):o==="r"&&s==="r"&&r==="r"?this.setTile(12,0):o==="r"&&e==="r"&&r==="r"?this.setTile(13,0):o==="r"&&s==="r"&&e==="r"?this.setTile(14,0):s==="r"&&e==="r"&&r==="r"?this.setTile(15,0):r==="r"&&s==="r"&&n==="r"?this.setTile(6,0):r==="r"&&o==="r"&&l==="r"?this.setTile(7,0):e==="r"&&o==="r"&&h==="r"?this.setTile(8,0):e==="r"&&s==="r"&&i==="r"?this.setTile(9,0):r==="r"&&s==="r"?this.setTile(2,0):r==="r"&&o==="r"?this.setTile(3,0):e==="r"&&o==="r"?this.setTile(4,0):e==="r"&&s==="r"?this.setTile(5,0):s==="r"||o==="r"?this.setTile(0,1):e==="r"||r==="r"?this.setTile(1,1):this.setTile(10,0)}retileForest(){const t=this.neigh(0,-1).isType("#"),e=this.neigh(1,0).isType("#"),i=this.neigh(0,1).isType("#"),s=this.neigh(-1,0).isType("#");!t&&!s&&e&&i?this.setTile(9,9):!t&&s&&!e&&i?this.setTile(10,9):t&&s&&!e&&!i?this.setTile(11,9):t&&!s&&e&&!i?this.setTile(12,9):t&&!s&&!e&&!i?this.setTile(16,9):!t&&!s&&!e&&i?this.setTile(15,9):!t&&s&&!e&&!i?this.setTile(14,9):!t&&!s&&e&&!i?this.setTile(13,9):!t&&!s&&!e&&!i?this.setTile(8,9):this.setTile(3,1)}retileBoat(){const t=(r,l)=>this.neigh(r,l).isType("^"," ","b")?"w":"l",e=t(0,-1),i=t(1,0),s=t(0,1),n=t(-1,0);e!=="w"&&n!=="w"?this.setTile(15,6):e!=="w"&&i!=="w"?this.setTile(16,6):s!=="w"&&i!=="w"?this.setTile(17,6):s!=="w"&&n!=="w"?this.setTile(14,6):n!=="w"?this.setTile(12,6):i!=="w"?this.setTile(13,6):s!=="w"?this.setTile(10,6):this.setTile(11,6)}}class de{onRetile(t,e,i){}}class xt{constructor(t){this.x=0,this.y=0,this.map=t,this.cell=t.cells[this.y][this.x]}}class Lt extends xt{constructor(t,e,i,s,n,r){super(t),this.x=e,this.y=i,this.owner_idx=s,this.armour=n,this.speed=r,this.cell=t.cells[this.y][this.x]}}class _t extends xt{constructor(t,e,i,s,n,r,l){super(t),this.x=e,this.y=i,this.owner_idx=s,this.armour=n,this.shells=r,this.mines=l,this.cell=t.cells[this.y][this.x]}}class zt extends xt{constructor(t,e,i,s){super(t),this.x=e,this.y=i,this.direction=s,this.cell=t.cells[this.y][this.x]}}var P;let ue=(P=class{constructor(){this.CellClass=bt,this.PillboxClass=Lt,this.BaseClass=_t,this.StartClass=zt,this.pills=[],this.bases=[],this.starts=[],this.cells=[],this.view=new de,this.cells=new Array(A);for(let t=0;t<A;t++){const e=this.cells[t]=new Array(A);for(let i=0;i<A;i++)e[i]=new this.CellClass(this,i,t)}}setView(t){this.view=t,this.retile()}cellAtTile(t,e){var s;const i=(s=this.cells[e])==null?void 0:s[t];return i||new this.CellClass(this,t,e,{isDummy:!0})}each(t,e,i,s,n){const r=e!==void 0&&e>=0?e:0,l=i!==void 0&&i>=0?i:0,o=s!==void 0&&s<A?s:A-1,h=n!==void 0&&n<A?n:A-1;for(let p=l;p<=h;p++){const c=this.cells[p];for(let d=r;d<=o;d++)t.call(c[d],c[d])}return this}clear(t,e,i,s){this.each(function(){this.type=_["^"],this.mine=this.isEdgeCell()},t,e,i,s)}retile(t,e,i,s){this.each(function(){this.retile()},t,e,i,s)}findCenterCell(){let t=A-1,e=A-1,i=0,s=0;this.each(function(l){e>l.x&&(e=l.x),s<l.x&&(s=l.x),t>l.y&&(t=l.y),i<l.y&&(i=l.y)}),e>s&&(t=e=0,i=s=A-1);const n=Pt(e+(s-e)/2),r=Pt(t+(i-t)/2);return this.cellAtTile(n,r)}dump(t){t=t||{};const e=(f,v)=>{let w=null,S=null,E=0;for(let y=0;y<f.length;y++){const g=f[y].getNumericType();if(w===g){E++;continue}w!==null&&v(w,E,S),w=g,S=y,E=1}w!==null&&v(w,E,S)},i=f=>{const v=[];let w=null;for(let S=0;S<f.length;S++){let E=f[S]&15;S%2===0?w=E<<4:(v.push(w+E),w=null)}return w!==null&&v.push(w),v},s=t.noPills?[]:this.pills,n=t.noBases?[]:this.bases,r=t.noStarts?[]:this.starts;let l=[];for(const f of"BMAPBOLO")l.push(f.charCodeAt(0));l.push(1,s.length,n.length,r.length);for(const f of s)l.push(f.x,f.y,f.owner_idx,f.armour,f.speed);for(const f of n)l.push(f.x,f.y,f.owner_idx,f.armour,f.shells,f.mines);for(const f of r)l.push(f.x,f.y,f.direction);let o=null,h=null,p=0,c=0,d=0;const u=()=>{if(!o)return;b();const f=i(o);l.push(f.length+4,d,p,c),l=l.concat(f),o=null},m=f=>{251*2-o.length<f&&(u(),o=[],p=c)},b=()=>{if(!h)return;const f=h;h=null,m(f.length+1),o.push(f.length-1),o=o.concat(f),c+=f.length};for(const f of this.cells)d=f[0].y,o=null,p=c=0,h=null,e(f,(v,w,S)=>{if(v===-1){u();return}if(o||(o=[],p=c=S),w>2)for(b();w>2;){m(2);const E=he(w,9);o.push(E+6,v),c+=E,w-=E}for(;w>0;)h||(h=[]),h.push(v),h.length===8&&b(),w--});return u(),l.push(4,255,255,255),l}static load(t){let e=0;const i=(u,m)=>{let b;try{b=[];for(let f=e;f<e+u;f++)b.push(t[f])}catch{throw new Error(m)}return e+=u,b},s=i(8,"Not a Bolo map.");for(let u=0;u<8;u++)if("BMAPBOLO"[u].charCodeAt(0)!==s[u])throw new Error("Not a Bolo map.");const[n,r,l,o]=i(4,"Incomplete header");if(n!==1)throw new Error(`Unsupported map version: ${n}`);const h=new this,p=[];for(let u=0;u<r;u++)p.push(i(5,"Incomplete pillbox data"));const c=[];for(let u=0;u<l;u++)c.push(i(6,"Incomplete base data"));const d=[];for(let u=0;u<o;u++)d.push(i(3,"Incomplete player start data"));for(;;){const[u,m,b,f]=i(4,"Incomplete map data"),v=u-4;if(v===0&&m===255&&b===255&&f===255)break;const w=i(v,"Incomplete map data");let S=0;const E=()=>{const k=ae(S),g=k===S?(w[k]&240)>>4:w[k]&15;return S+=.5,g};let y=b;for(;y<f;){const k=E();if(k<8)for(let g=1;g<=k+1;g++)h.cellAtTile(y++,m).setType(E(),void 0,-1);else{const g=E();for(let T=1;T<=k-6;T++)h.cellAtTile(y++,m).setType(g,void 0,-1)}}}return h.pills=p.map(u=>new h.PillboxClass(h,...u)),h.bases=c.map(u=>new h.BaseClass(h,...u)),h.starts=d.map(([u,m,b])=>new h.StartClass(h,u,m,b)),h}},P.CellClass=bt,P.PillboxClass=Lt,P.BaseClass=_t,P.StartClass=zt,P);const qt=0,Zt=1,te=2,ee=3,D=4,ie=5,vt=6,kt=7,Tt=8,V=9,Ct=10,Et=11,{sqrt:pe,atan2:fe}=Math;function St(a,t){for(const e in t)Object.prototype.hasOwnProperty.call(t,e)&&(a[e]=t[e]);return a}function B(a,t){const e=a.x-t.x,i=a.y-t.y;return pe(e*e+i*i)}function q(a,t){return fe(t.y-a.y,t.x-a.x)}class se{constructor(){this.events=new Map}on(t,e){return this.events.has(t)||this.events.set(t,[]),this.events.get(t).push(e),this}once(t,e){const i=(...s)=>{this.off(t,i),e.apply(this,s)};return this.on(t,i)}off(t,e){const i=this.events.get(t);if(i){const s=i.indexOf(e);s!==-1&&i.splice(s,1),i.length===0&&this.events.delete(t)}return this}emit(t,...e){const i=this.events.get(t);return i?(i.slice().forEach(s=>s.apply(this,e)),!0):!1}removeAllListeners(t){return t?this.events.delete(t):this.events.clear(),this}}class ge extends se{constructor(t){super(),this.idx=-1,this.x=null,this.y=null,this.world=t}destroy(){}tick(){}}function me(a){return[a&255]}function be(a){return[(a&65280)>>8,a&255]}function ye(a){return[(a&4278190080)>>>24,(a&16711680)>>16,(a&65280)>>8,a&255]}function we(a,t){return a[t]}function xe(a,t){return(a[t]<<8)+a[t+1]}function ve(a,t){return(a[t]<<24)+(a[t+1]<<16)+(a[t+2]<<8)+a[t+3]}function ke(){let a=[],t=null,e=0;const i=()=>{t!==null&&(a.push(t),t=null)},s=(n,r)=>{if(n==="f")t===null?(t=r?1:0,e=1):(r&&(t|=1<<e),e++,e===8&&i());else{i();const l=r;let o;switch(n){case"B":o=me(l);break;case"H":o=be(l);break;case"I":o=ye(l);break;default:throw new Error(`Unknown format character ${n}`)}a=a.concat(o)}};return s.finish=()=>(i(),a),s}function ne(a,t=0){let e=t,i=0;const s=n=>{let r;if(n==="f")r=(1<<i&a[e])>0,i++,i===8&&(e++,i=0);else{i!==0&&(e++,i=0);let l;switch(n){case"B":r=we(a,e),l=1;break;case"H":r=xe(a,e),l=2;break;case"I":r=ve(a,e),l=4;break;default:throw new Error(`Unknown format character ${n}`)}e+=l}return r};return s.finish=()=>(i!==0&&e++,e-t),s}function G(a,t,e){const i=ne(t,e),s=[];for(const n of a)s.push(i(n));return[s,i.finish()]}class Te extends ge{constructor(t){super(t),this._net_type_idx=0}ref(t,e){this[t]=e?{$:e}:null}tick(){this.update&&this.update()}dump(t=!1){if(!this.serialization)return[];const e=ke();return this.serialization(t,(i,s,n)=>{let r=this[s];if(n!=null&&n.tx&&(r=n.tx(r)),i==="O"){const l=r==null?void 0:r.$,o=(l==null?void 0:l.idx)??65535;e("H",o)}else e(i,r)}),e.finish()}load(t,e,i=!1){if(!this.serialization)return 0;const s=ne(t,e),n={};return this.serialization(i,(r,l,o)=>{let h;if(r==="O"){const c=s("H");if(c===65535)h=null;else{const d=this.world.objects[c];h=d?{$:d}:null}}else h=s(r);o!=null&&o.rx&&(h=o.rx(h));const p=Object.getOwnPropertyDescriptor(Object.getPrototypeOf(this),l);p&&p.set?p.set.call(this,h):this[l]=h,n[l]=h}),this.emit&&this.emit("netUpdate",n),s.finish()}}class L extends Te{constructor(){super(...arguments),this.styled=null,this.x=null,this.y=null}soundEffect(t){this.world.soundEffect(t,this.x,this.y,this)}getTile(){}}const{floor:Ce}=Math;class N extends L{constructor(){super(...arguments),this.styled=!1,this.lifespan=0}serialization(t,e){t&&(e("H","x"),e("H","y")),e("B","lifespan")}getTile(){switch(Ce(this.lifespan/3)){case 7:return[20,3];case 6:return[21,3];case 5:return[20,4];case 4:return[21,4];case 3:return[20,5];case 2:return[21,5];case 1:return[18,4];default:return[19,4]}}spawn(t,e){this.x=t,this.y=e,this.lifespan=23}update(){this.lifespan--===0&&this.world.destroy&&this.world.destroy(this)}}class I extends L{constructor(){super(...arguments),this.styled=null,this.lifespan=0}serialization(t,e){t&&(e("H","x"),e("H","y")),e("B","lifespan")}spawn(t){[this.x,this.y]=t.getWorldCoordinates(),this.lifespan=10}anySpawn(){this.cell=this.world.map.cellAtWorld(this.x,this.y)}update(){this.lifespan--===0&&this.world.spawn&&this.world.destroy&&(this.cell&&this.cell.mine&&this.asplode(),this.world.destroy(this))}asplode(){var t;this.cell.setType(null,!1,0),this.cell.takeExplosionHit();for(const e of this.world.tanks){e.armour!==255&&B(this,e)<384&&e.takeMineHit();const i=(t=e.builder)==null?void 0:t.$;if(i){const{inTank:s,parachuting:n}=i.states;i.order!==s&&i.order!==n&&B(this,i)<C/2&&i.kill()}}this.world.spawn&&this.world.spawn(N,this.x,this.y),this.soundEffect(kt),this.spread()}spread(){if(!this.world.spawn)return;let t=this.cell.neigh(1,0);t.isEdgeCell()||this.world.spawn(I,t),t=this.cell.neigh(0,1),t.isEdgeCell()||this.world.spawn(I,t),t=this.cell.neigh(-1,0),t.isEdgeCell()||this.world.spawn(I,t),t=this.cell.neigh(0,-1),t.isEdgeCell()||this.world.spawn(I,t)}}const{round:rt,cos:Ee,sin:Se,PI:Ae}=Math;class it extends L{constructor(t){super(t),this.updatePriority=20,this.styled=!1,this.direction=0,this.lifespan=0,this.onWater=!1,this.on("netSync",()=>{this.updateCell()})}serialization(t,e){t&&(e("B","direction"),e("O","owner"),e("O","attribution"),e("f","onWater")),e("H","x"),e("H","y"),e("B","lifespan")}updateCell(){this.cell=this.world.map.cellAtWorld(this.x,this.y)}getDirection16th(){return rt((this.direction-1)/16)%16}getTile(){return[this.getDirection16th(),4]}spawn(t,e){var i;e=e||{},this.ref("owner",t),this.owner.$.hasOwnProperty("owner_idx")?this.ref("attribution",(i=this.owner.$.owner)==null?void 0:i.$):this.ref("attribution",this.owner.$),this.direction=e.direction||this.owner.$.direction,this.lifespan=(e.range||7)*C/32-2,this.onWater=e.onWater||!1,this.x=this.owner.$.x,this.y=this.owner.$.y,this.move()}update(){this.move();const t=this.collide();if(t){const[e,i]=t,s=i.takeShellHit(this);let n,r;e==="cell"?([n,r]=this.cell.getWorldCoordinates(),this.world.soundEffect(s,n,r)):(n=this.x,r=this.y,i.soundEffect(s)),this.asplode(n,r,e)}else this.lifespan--===0&&this.asplode(this.x,this.y,"eol")}move(){this.radians||(this.radians=(256-this.direction)*2*Ae/256),this.x=this.x+rt(Ee(this.radians)*32),this.y=this.y+rt(Se(this.radians)*32),this.updateCell()}collide(){var i,s,n,r,l;const t=this.cell.pill;if(t&&t.armour>0&&t!==((i=this.owner)==null?void 0:i.$)){const[o,h]=this.cell.getWorldCoordinates();if(B(this,{x:o,y:h})<=127)return["cell",t]}for(const o of this.world.tanks)if(o!==((s=this.owner)==null?void 0:s.$)&&o.armour!==255&&B(this,o)<=127)return["tank",o];if(((n=this.attribution)==null?void 0:n.$)===((r=this.owner)==null?void 0:r.$)){const o=this.cell.base;if(o&&o.armour>4&&(this.onWater||o!=null&&o.owner&&!o.owner.$.isAlly((l=this.attribution)==null?void 0:l.$)))return["cell",o]}return(this.onWater?!this.cell.isType("^"," ","%"):this.cell.isType("|","}","#","b"))?["cell",this.cell]:null}asplode(t,e,i){var s;for(const n of this.world.tanks){const r=(s=n.builder)==null?void 0:s.$;if(r){const{inTank:l,parachuting:o}=r.states;r.order!==l&&r.order!==o&&(i==="cell"?r.cell===this.cell&&r.kill():B(this,r)<C/2&&r.kill())}}this.world.spawn&&this.world.destroy&&(this.world.spawn(N,t,e),this.world.spawn(I,this.cell),this.world.destroy(this))}}const{min:F,max:ot,round:lt,ceil:at,PI:Ot,cos:Be,sin:Me}=Math;class st extends L{constructor(t,e,i,s,n,r){super(arguments.length===1?t:null),this.team=255,this.styled=!0,this.owner_idx=255,this.armour=0,this.speed=0,this.coolDown=0,this.reload=0,this.inTank=!1,this.carried=!1,this.haveTarget=!1,this.cell=null,arguments.length>1&&(this.map=t,this.x=(e+.5)*C,this.y=(i+.5)*C,this.owner_idx=s,this.armour=n,this.speed=r),this.on("netUpdate",l=>{var o,h;(l.hasOwnProperty("x")||l.hasOwnProperty("y"))&&this.updateCell(),(l.hasOwnProperty("inTank")||l.hasOwnProperty("carried"))&&this.updateCell(),l.hasOwnProperty("owner")&&!l.hasOwnProperty("team")&&this.updateOwner(),l.hasOwnProperty("armour")&&((o=this.cell)==null||o.retile()),l.hasOwnProperty("team")&&((h=this.cell)==null||h.retile())})}updateCell(){this.cell&&(delete this.cell.pill,this.cell.retile()),this.inTank||this.carried?this.cell=null:(this.cell=this.world.map.cellAtWorld(this.x,this.y),this.cell.pill=this,this.cell.retile())}updateOwner(){var t;this.owner&&(this.owner_idx=this.owner.$.tank_idx,this.team=this.owner.$.team),(t=this.cell)==null||t.retile()}serialization(t,e){e("O","owner"),e("B","owner_idx"),e("B","team"),e("f","inTank"),e("f","carried"),e("f","haveTarget"),!this.inTank&&!this.carried?(e("H","x"),e("H","y")):this.x=this.y=null,e("B","armour"),e("B","speed"),e("B","coolDown"),e("B","reload")}getTile(){return this.armour===0?[18,0]:[16+this.armour,0]}placeAt(t){this.inTank=this.carried=!1,[this.x,this.y]=t.getWorldCoordinates(),this.updateCell(),this.reset()}spawn(){this.reset()}reset(){this.coolDown=32,this.reload=0}anySpawn(){this.updateCell()}update(){if(this.inTank||this.carried)return;if(this.armour===0){this.haveTarget=!1;for(const i of this.world.tanks)if(i.armour!==255&&i.cell===this.cell){this.inTank=!0,this.x=this.y=null,this.updateCell(),this.ref("owner",i),this.updateOwner();break}return}if(this.reload=F(this.speed,this.reload+1),--this.coolDown===0&&(this.coolDown=32,this.speed=F(100,this.speed+1)),this.reload<this.speed)return;let t=null,e=1/0;for(const i of this.world.tanks){const s=this.team===null||this.team===255?!0:i.team!==this.team;if(i.armour!==255&&s&&!i.hidden){const n=B(this,i);n<=2048&&n<e&&(t=i,e=n)}}if(!t){this.haveTarget=!1;return}if(this.haveTarget){const i=(256-t.getDirection16th()*16)*2*Ot/256,s=t.x+e/32*lt(Be(i)*at(t.speed)),n=t.y+e/32*lt(Me(i)*at(t.speed)),r=256-q(this,{x:s,y:n})*256/(2*Ot);this.world.spawn&&this.world.spawn(it,this,{direction:r}),this.soundEffect(Tt)}this.haveTarget=!0,this.reload=0}aggravate(){this.coolDown=32,this.speed=ot(6,lt(this.speed/2))}takeShellHit(t){return this.aggravate(),this.armour=ot(0,this.armour-1),this.cell.retile(),V}takeExplosionHit(){this.armour=ot(0,this.armour-5),this.cell.retile()}repair(t){const e=F(t,at((15-this.armour)/4));return this.armour=F(15,this.armour+e*4),this.cell.retile(),e}}const{min:He,max:Ie}=Math;class nt extends L{constructor(t,e,i,s,n,r,l){super(arguments.length===1?t:null),this.owner_idx=255,this._team=255,this.styled=!0,this.armour=0,this.shells=0,this.mines=0,this.refuelCounter=0,arguments.length>1&&(this.map=t,this.x=(e+.5)*C,this.y=(i+.5)*C,this.owner_idx=s,this.armour=n,this.shells=r,this.mines=l,t.cellAtTile(e,i).setType("=",!1,-1)),this.on("netUpdate",o=>{var p,c;const h=((p=this.world)==null?void 0:p.map)||this.map;(o.hasOwnProperty("x")||o.hasOwnProperty("y"))&&this.x!=null&&this.y!=null&&h&&(this.cell=h.cellAtWorld(this.x,this.y),this.cell.base=this),o.hasOwnProperty("owner")&&!o.hasOwnProperty("team")&&this.updateOwner(),o.hasOwnProperty("team")&&((c=this.cell)==null||c.retile())})}get team(){return this._team}set team(t){this._team=t}serialization(t,e){t&&(e("H","x"),e("H","y")),e("O","owner"),e("B","owner_idx"),e("B","team"),e("O","refueling"),e("B","refuelCounter"),e("B","armour"),e("B","shells"),e("B","mines")}updateOwner(){var t;this.owner&&(this.owner_idx=this.owner.$.tank_idx,this.team=this.owner.$.team),(t=this.cell)==null||t.retile()}getTile(){return[16,0]}spawn(){}anySpawn(){this.cell=this.world.map.cellAtWorld(this.x,this.y),this.cell.base=this}update(){if(this.world.authority){const e=this.world.tanks.filter(i=>i.armour!==255).length/1e3;Math.random()<e&&(this.armour<90?this.armour++:this.shells<90?this.shells++:this.mines<90&&this.mines++)}if(this.refueling){const t=this.refueling.$.cell,e=this.refueling.$.armour;(t!==this.cell||e===255)&&this.ref("refueling",null)}if(!this.refueling){this.findSubject();return}if(--this.refuelCounter===0)if(this.armour>0&&this.refueling.$.armour<40){const t=He(5,this.armour,40-this.refueling.$.armour);this.refueling.$.armour+=t,this.armour-=t,this.refuelCounter=46}else this.shells>0&&this.refueling.$.shells<40?(this.refueling.$.shells+=1,this.shells-=1,this.refuelCounter=7):this.mines>0&&this.refueling.$.mines<40?(this.refueling.$.mines+=1,this.mines-=1,this.refuelCounter=7):this.refuelCounter=1}findSubject(){const t=this.world.tanks.filter(e=>e.armour!==255&&e.cell===this.cell);for(const e of t)if(this.team!==255&&e.team===this.team){this.ref("refueling",e),this.refuelCounter=46;break}else{let s=!0;for(const n of t)n!==e&&(e.isAlly(n)||(s=!1));if(s){this.ref("owner",e),this.updateOwner(),this.ref("refueling",e),this.refuelCounter=46;break}}}takeShellHit(t){var e;if(this.owner)for(const i of this.world.map.pills)!i.inTank&&!i.carried&&i.armour>0&&(e=i.owner)!=null&&e.$.isAlly(this.owner.$)&&B(this,i)<=2304&&i.aggravate();return this.armour=Ie(0,this.armour-5),V}}class j extends L{constructor(){super(...arguments),this.styled=null,this.lifespan=0,this.neighbours=[]}serialization(t,e){t&&(e("H","x"),e("H","y")),e("B","lifespan")}spawn(t){[this.x,this.y]=t.getWorldCoordinates(),this.lifespan=16}anySpawn(){this.cell=this.world.map.cellAtWorld(this.x,this.y),this.neighbours=[this.cell.neigh(1,0),this.cell.neigh(0,1),this.cell.neigh(-1,0),this.cell.neigh(0,-1)]}update(){this.lifespan--===0&&(this.flood(),this.world.destroy&&this.world.destroy(this))}canGetWet(){let t=!1;for(const e of this.neighbours)if(!e.base&&!e.pill&&e.isType(" ","^","b")){t=!0;break}return t}flood(){this.canGetWet()&&(this.cell.setType(" ",!1),this.spread())}spread(){if(this.world.spawn)for(const t of this.neighbours)!t.base&&!t.pill&&t.isType("%")&&this.world.spawn(j,t)}}const{round:$e,random:Re,floor:X}=Math,Nt={"|":{tankSpeed:0,tankTurn:0,manSpeed:0}," ":{tankSpeed:3,tankTurn:.25,manSpeed:0},"~":{tankSpeed:3,tankTurn:.25,manSpeed:4},"%":{tankSpeed:3,tankTurn:.25,manSpeed:4},"=":{tankSpeed:16,tankTurn:1,manSpeed:16},"#":{tankSpeed:6,tankTurn:.5,manSpeed:8},":":{tankSpeed:3,tankTurn:.25,manSpeed:4},".":{tankSpeed:12,tankTurn:1,manSpeed:16},"}":{tankSpeed:0,tankTurn:0,manSpeed:0},b:{tankSpeed:16,tankTurn:1,manSpeed:16},"^":{tankSpeed:3,tankTurn:.5,manSpeed:0}};function Pe(){for(const a in Nt){const t=Nt[a],e=_[a];for(const i in t)e[i]=t[i]}}Pe();class Le extends bt{constructor(t,e,i,s){super(t,e,i,s),this.life=0}isObstacle(){var t;return((t=this.pill)==null?void 0:t.armour)>0||this.type.tankSpeed===0}hasTankOnBoat(){for(const t of this.map.world.tanks)if(t.armour!==255&&t.cell===this&&t.onBoat)return!0;return!1}getTankSpeed(t){var e,i;return((e=this.pill)==null?void 0:e.armour)>0||(i=this.base)!=null&&i.owner&&!this.base.owner.$.isAlly(t)&&this.base.armour>9?0:t.onBoat&&this.isType("^"," ")?16:this.type.tankSpeed}getTankTurn(t){var e,i;return((e=this.pill)==null?void 0:e.armour)>0||(i=this.base)!=null&&i.owner&&!this.base.owner.$.isAlly(t)&&this.base.armour>9?0:t.onBoat&&this.isType("^"," ")?1:this.type.tankTurn}getManSpeed(t){var i,s;const e=t.owner.$;return((i=this.pill)==null?void 0:i.armour)>0||(s=this.base)!=null&&s.owner&&!this.base.owner.$.isAlly(e)&&this.base.armour>9?0:this.type.manSpeed}getPixelCoordinates(){return[(this.x+.5)*x,(this.y+.5)*x]}getWorldCoordinates(){return[(this.x+.5)*C,(this.y+.5)*C]}setType(t,e,i){var l;const s=this.type,n=this.mine,r=this.life;super.setType(t,e,i),this.life=(()=>{switch(this.type.ascii){case".":return 5;case"}":return 5;case":":return 5;case"~":return 4;default:return 0}})(),(l=this.map.world)==null||l.mapChanged(this,s,n,r)}takeShellHit(t){var i,s;let e=V;if(this.isType(".","}",":","~"))if(--this.life===0){const n=(()=>{switch(this.type.ascii){case".":return"~";case"}":return":";case":":return" ";case"~":return" "}})();this.setType(n)}else(i=this.map.world)==null||i.mapChanged(this,this.type,this.mine);else if(this.isType("#"))this.setType("."),e=Ct;else if(this.isType("="))(t.direction>=224||t.direction<32?this.neigh(1,0):t.direction>=32&&t.direction<96?this.neigh(0,-1):t.direction>=96&&t.direction<160?this.neigh(-1,0):this.neigh(0,1)).isType(" ","^")&&this.setType(" ");else{const n=(()=>{switch(this.type.ascii){case"|":return"}";case"b":return" "}})();this.setType(n)}return this.isType(" ")&&(s=this.map.world)!=null&&s.spawn&&this.map.world.spawn(j,this),e}takeExplosionHit(){var t;if(this.pill){this.pill.takeExplosionHit();return}if(this.isType("b"))this.setType(" ");else if(!this.isType(" ","^","b"))this.setType("%");else return;(t=this.map.world)!=null&&t.spawn&&this.map.world.spawn(j,this)}}class re extends ue{constructor(){super(),this.CellClass=Le,this.PillboxClass=st,this.BaseClass=nt;for(let t=0;t<this.cells.length;t++){const e=this.cells[t];for(let i=0;i<e.length;i++){const s=e[i],n=new this.CellClass(this,i,t);n.type=s.type,n.mine=s.mine,e[i]=n}}}static load(t){return super.load(t)}findCenterCell(){return super.findCenterCell()}cellAtTile(t,e){return super.cellAtTile(t,e)}cellAtPixel(t,e){return this.cellAtTile(X(t/x),X(e/x))}cellAtWorld(t,e){return this.cellAtTile(X(t/C),X(e/C))}getRandomStart(){return this.starts[$e(Re()*(this.starts.length-1))]}}const _e=`Qk1BUEJPTE8BEAsQW5H/D2Vjbv8PZV90/w9lVHX/D2VwbP8PZYFr/w9lq27/D2WueP8PZa58/w9l
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
`).join(""),{round:Y,floor:ze,ceil:Wt,min:ht,cos:Dt,sin:jt}=Math;class At extends L{constructor(t){super(t),this.styled=!0,this.team=null,this.states={inTank:0,waiting:1,returning:2,parachuting:3,actions:{_min:10,forest:10,road:11,repair:12,boat:13,building:14,pillbox:15,mine:16}},this.order=0,this.x=null,this.y=null,this.targetX=0,this.targetY=0,this.trees=0,this.hasMine=!1,this.waitTimer=0,this.animation=0,this.cell=null,this.on("netUpdate",e=>{(e.hasOwnProperty("x")||e.hasOwnProperty("y"))&&this.updateCell()})}updateCell(){this.x!=null&&this.y!=null?this.cell=this.world.map.cellAtWorld(this.x,this.y):this.cell=null}serialization(t,e){t&&(e("O","owner"),e("B","team")),e("B","order"),this.order===this.states.inTank?this.x=this.y=null:(e("H","x"),e("H","y"),e("H","targetX"),e("H","targetY"),e("B","trees"),e("O","pillbox"),e("f","hasMine")),this.order===this.states.waiting&&e("B","waitTimer")}getTile(){return this.order===this.states.parachuting?[16,1]:[17,ze(this.animation/3)]}performOrder(t,e,i){if(this.order!==this.states.inTank||!this.owner.$.onBoat&&this.owner.$.cell!==i&&this.owner.$.cell.getManSpeed(this)===0)return;let s=null;if(t==="mine"){if(this.owner.$.mines===0)return;e=0}else{if(this.owner.$.trees<e)return;if(t==="pillbox"){if(s=this.owner.$.getCarryingPillboxes().pop(),!s)return;s.inTank=!1,s.carried=!0}}this.trees=e,this.hasMine=t==="mine",this.ref("pillbox",s),this.hasMine&&this.owner.$.mines--,this.owner.$.trees-=e,this.order=this.states.actions[t],this.x=this.owner.$.x,this.y=this.owner.$.y,[this.targetX,this.targetY]=i.getWorldCoordinates(),this.updateCell()}kill(){if(!this.world.authority)return;this.soundEffect(ie),this.order=this.states.parachuting,this.trees=0,this.hasMine=!1,this.pillbox&&(this.pillbox.$.placeAt(this.cell),this.ref("pillbox",null)),this.owner.$.armour===255?[this.targetX,this.targetY]=[this.x,this.y]:[this.targetX,this.targetY]=[this.owner.$.x,this.owner.$.y];const t=this.world.map.getRandomStart();[this.x,this.y]=t.cell.getWorldCoordinates()}spawn(t){this.ref("owner",t),this.order=this.states.inTank}anySpawn(){this.owner&&this.owner.$&&(this.team=this.owner.$.team),this.animation=0}update(){if(this.order!==this.states.inTank&&!(!this.owner||!this.owner.$))switch(this.animation=(this.animation+1)%9,this.order){case this.states.waiting:this.waitTimer--===0&&(this.order=this.states.returning);break;case this.states.parachuting:this.parachutingIn({x:this.targetX,y:this.targetY});break;case this.states.returning:this.owner.$.armour!==255&&this.move(this.owner.$,128,160);break;default:this.move({x:this.targetX,y:this.targetY},16,144)}}move(t,e,i){if(!this.cell)return;let s=this.cell.getManSpeed(this),n=!1;const r=this.world.map.cellAtWorld(this.targetX,this.targetY);s===0&&this.cell===r&&(s=16),this.owner.$.armour!==255&&this.owner.$.onBoat&&B(this,this.owner.$)<i&&(n=!0,s=16),s=ht(s,B(this,t));const l=q(this,t),o=Y(Dt(l)*Wt(s)),h=Y(jt(l)*Wt(s)),p=this.x+o,c=this.y+h;let d=0;if(o!==0){const u=this.world.map.cellAtWorld(p,this.y);(n||u===r||u.getManSpeed(this)>0)&&(this.x=p,d++)}if(h!==0){const u=this.world.map.cellAtWorld(this.x,c);(n||u===r||u.getManSpeed(this)>0)&&(this.y=c,d++)}d===0?this.order=this.states.returning:(this.updateCell(),B(this,t)<=e&&this.reached())}reached(){if(this.order===this.states.returning){this.order=this.states.inTank,this.x=this.y=null,this.pillbox&&(this.pillbox.$.inTank=!0,this.pillbox.$.carried=!1,this.ref("pillbox",null)),this.owner.$.trees=ht(40,this.owner.$.trees+this.trees),this.trees=0,this.hasMine&&(this.owner.$.mines=ht(40,this.owner.$.mines+1)),this.hasMine=!1;return}if(this.cell.mine){this.world.spawn&&this.world.spawn(I,this.cell),this.order=this.states.waiting,this.waitTimer=20;return}switch(this.order){case this.states.actions.forest:if(this.cell.base||this.cell.pill||!this.cell.isType("#"))break;this.cell.setType("."),this.trees=4,this.soundEffect(te);break;case this.states.actions.road:if(this.cell.base||this.cell.pill||this.cell.isType("|","}","b","^","#","=")||this.cell.isType(" ")&&this.cell.hasTankOnBoat())break;this.cell.setType("="),this.trees=0,this.soundEffect(D);break;case this.states.actions.repair:if(this.cell.pill){const t=this.cell.pill.repair(this.trees);this.trees-=t}else if(this.cell.isType("}"))this.cell.setType("|"),this.trees=0;else break;this.soundEffect(D);break;case this.states.actions.boat:if(!this.cell.isType(" ")||this.cell.hasTankOnBoat())break;this.cell.setType("b"),this.trees=0,this.soundEffect(D);break;case this.states.actions.building:if(this.cell.base||this.cell.pill||this.cell.isType("b","^","#","}","|"," "))break;this.cell.setType("|"),this.trees=0,this.soundEffect(D);break;case this.states.actions.pillbox:if(this.cell.pill||this.cell.base||this.cell.isType("b","^","#","|","}"," "))break;this.pillbox.$.armour=15,this.trees=0,this.pillbox.$.placeAt(this.cell),this.ref("pillbox",null),this.soundEffect(D);break;case this.states.actions.mine:if(this.cell.base||this.cell.pill||this.cell.isType("^"," ","|","b","}"))break;this.cell.setType(null,!0,0),this.hasMine=!1,this.soundEffect(vt);break}this.order=this.states.waiting,this.waitTimer=20}parachutingIn(t){if(B(this,t)<=16)this.order=this.states.returning;else{const e=q(this,t);this.x=this.x+Y(Dt(e)*3),this.y=this.y+Y(jt(e)*3),this.updateCell()}}}const{round:ct,cos:Oe,sin:Ne,PI:We}=Math;class Z extends L{constructor(){super(...arguments),this.styled=null,this.direction=0,this.largeExplosion=!1,this.lifespan=0}serialization(t,e){t&&(e("B","direction"),e("f","largeExplosion")),e("H","x"),e("H","y"),e("B","lifespan")}getDirection16th(){return ct((this.direction-1)/16)%16}spawn(t,e,i,s){this.x=t,this.y=e,this.direction=i,this.largeExplosion=s,this.lifespan=80}update(){if(this.lifespan--%2===0){if(this.wreck())return;this.move()}this.lifespan===0&&(this.explode(),this.world.destroy&&this.world.destroy(this))}wreck(){this.world.spawn&&this.world.spawn(N,this.x,this.y);const t=this.world.map.cellAtWorld(this.x,this.y);return t.isType("^")?(this.world.destroy&&this.world.destroy(this),this.soundEffect(Et),!0):(t.isType("b")?(t.setType(" "),this.soundEffect(V)):t.isType("#")&&(t.setType("."),this.soundEffect(Ct)),!1)}move(){if(this.dx===void 0){const n=(256-this.direction)*2*We/256;this.dx=ct(Oe(n)*48),this.dy=ct(Ne(n)*48)}const{dx:t,dy:e}=this,i=this.x+t,s=this.y+e;if(t!==0){const n=t>0?i+24:i-24;this.world.map.cellAtWorld(n,s).isObstacle()||(this.x=i)}if(e!==0){const n=e>0?s+24:s-24;this.world.map.cellAtWorld(i,n).isObstacle()||(this.y=s)}}explode(){var e;const t=[this.world.map.cellAtWorld(this.x,this.y)];if(this.largeExplosion){const i=this.dx>0?1:-1,s=this.dy>0?1:-1;t.push(t[0].neigh(i,0)),t.push(t[0].neigh(0,s)),t.push(t[0].neigh(i,s)),this.soundEffect(qt)}else this.soundEffect(kt);for(const i of t){i.takeExplosionHit();for(const s of this.world.tanks){const n=(e=s.builder)==null?void 0:e.$;if(n){const{inTank:r,parachuting:l}=n.states;n.order!==r&&n.order!==l&&n.cell===i&&n.kill()}}if(this.world.spawn){const[s,n]=i.getWorldCoordinates();this.world.spawn(N,s,n)}}}}const{round:H,floor:De,ceil:Vt,min:Gt,sqrt:je,max:W,sin:dt,cos:ut,PI:pt}=Math;class Bt extends L{constructor(t){super(t),this.styled=!0,this.team=null,this.hidden=!1,this.speed=0,this.slideTicks=0,this.slideDirection=0,this.accelerating=!1,this.braking=!1,this.direction=0,this.turningClockwise=!1,this.turningCounterClockwise=!1,this.turnSpeedup=0,this.shells=40,this.mines=0,this.armour=40,this.trees=0,this.reload=0,this.shooting=!1,this.layingMine=!1,this.firingRange=7,this.kills=0,this.deaths=0,this.waterTimer=0,this.onBoat=!0,this.cell=null,this.on("netUpdate",e=>{(e.hasOwnProperty("x")||e.hasOwnProperty("y")||e.armour===255)&&this.updateCell()})}anySpawn(){this.updateCell(),this.world.addTank(this),this.on("finalize",()=>this.world.removeTank(this))}updateCell(){this.x!=null&&this.y!=null?this.cell=this.world.map.cellAtWorld(this.x,this.y):this.cell=null}reset(){const t=this.world.map.getRandomStart();[this.x,this.y]=t.cell.getWorldCoordinates(),this.direction=t.direction*16,this.updateCell(),this.speed=0,this.slideTicks=0,this.slideDirection=0,this.accelerating=!1,this.braking=!1,this.turningClockwise=!1,this.turningCounterClockwise=!1,this.turnSpeedup=0,this.shells=40,this.mines=0,this.armour=40,this.trees=0,this.reload=0,this.shooting=!1,this.layingMine=!1,this.firingRange=7,this.waterTimer=0,this.onBoat=!0,this.fireball=null}serialization(t,e){var i;if(t&&(e("B","team"),e("O","builder")),e("B","armour"),this.armour===255){e("O","fireball"),this.x=this.y=null;return}else(i=this.fireball)==null||i.clear();e("H","x"),e("H","y"),e("B","direction"),e("B","speed",{tx:s=>s*4,rx:s=>s/4}),e("B","slideTicks"),e("B","slideDirection"),e("B","turnSpeedup",{tx:s=>s+50,rx:s=>s-50}),e("B","shells"),e("B","mines"),e("B","trees"),e("B","reload"),e("B","firingRange",{tx:s=>s*2,rx:s=>s/2}),e("B","waterTimer"),e("H","kills"),e("H","deaths"),e("f","accelerating"),e("f","braking"),e("f","turningClockwise"),e("f","turningCounterClockwise"),e("f","shooting"),e("f","layingMine"),e("f","onBoat"),e("f","hidden")}getDirection16th(){return H((this.direction-1)/16)%16}getSlideDirection16th(){return H((this.slideDirection-1)/16)%16}getCarryingPillboxes(){return this.world.map.pills.filter(t=>{var e;return t.inTank&&((e=t.owner)==null?void 0:e.$)===this})}getTile(){const t=this.getDirection16th(),e=this.onBoat?1:0;return[t,e]}updateHiddenStatus(){if(!this.cell||!this.world.authority)return;const t=this.world.map.cellAtTile(this.cell.x,this.cell.y-1).isType("#"),e=this.world.map.cellAtTile(this.cell.x,this.cell.y+1).isType("#"),i=this.world.map.cellAtTile(this.cell.x-1,this.cell.y).isType("#"),s=this.world.map.cellAtTile(this.cell.x+1,this.cell.y).isType("#");this.hidden=t&&e&&i&&s}isAlly(t){return t===this||this.team!==255&&t.team===this.team}increaseRange(){this.firingRange=Gt(7,this.firingRange+.5)}decreaseRange(){this.firingRange=W(1,this.firingRange-.5)}takeShellHit(t){if(this.armour-=5,this.armour<0){const e=this.shells+this.mines>20;this.world.spawn&&this.ref("fireball",this.world.spawn(Z,this.x,this.y,t.direction,e)),this.deaths++,t.attribution&&t.attribution.$&&t.attribution.$!==this&&t.attribution.$.kills++,this.kill()}else this.slideTicks=8,this.slideDirection=t.direction,this.onBoat&&(this.onBoat=!1,this.speed=0,this.cell.isType("^")&&this.sink());return ee}takeMineHit(){if(this.armour-=10,this.armour<0){const t=this.shells+this.mines>20;this.world.spawn&&this.ref("fireball",this.world.spawn(Z,this.x,this.y,this.direction,t)),this.deaths++,this.kill()}else this.onBoat&&(this.onBoat=!1,this.speed=0,this.cell.isType("^")&&this.sink())}spawn(t){this.team=t,this.reset(),this.world.spawn&&this.ref("builder",this.world.spawn(At,this))}update(){this.cell&&(this.death()||(this.shootOrReload(),this.layMine(),this.turn(),this.accelerate(),this.fixPosition(),this.move(),this.updateHiddenStatus()))}destroy(){this.dropPillboxes(),this.world.destroy&&this.world.destroy(this.builder.$)}death(){return this.armour!==255?!1:this.world.authority&&--this.respawnTimer===0?(delete this.respawnTimer,this.reset(),!1):!0}shootOrReload(){this.reload>0&&this.reload--,!(!this.shooting||this.reload!==0||this.shells<=0)&&(this.shells--,this.reload=13,this.world.spawn&&this.world.spawn(it,this,{range:this.firingRange,onWater:this.onBoat}),this.soundEffect(Tt))}layMine(){if(!this.layingMine||this.mines<=0)return;const t=(this.direction+128)%256,e=(256-H((t-1)/16)%16*16)*2*pt/256,i=this.x+H(ut(e)*C),s=this.y+H(dt(e)*C),n=this.world.map.cellAtWorld(i,s);n.base||n.pill||n.mine||n.isType("^"," ","|","b","}")||(n.setType(null,!0,0),this.mines--,this.soundEffect(vt))}turn(){const t=this.cell.getTankTurn(this)*2.6555;if(this.turningClockwise===this.turningCounterClockwise){this.turnSpeedup=0;return}let e;for(this.turningCounterClockwise?(e=t,this.turnSpeedup<10&&(e/=2),this.turnSpeedup<0&&(this.turnSpeedup=0),this.turnSpeedup++):(e=-t,this.turnSpeedup>-10&&(e/=2),this.turnSpeedup>0&&(this.turnSpeedup=0),this.turnSpeedup--),this.direction+=e;this.direction<0;)this.direction+=256;this.direction>=256&&(this.direction%=256)}accelerate(){const t=this.cell.getTankSpeed(this);let e;this.speed>t?e=-.25:this.accelerating===this.braking?e=0:this.accelerating?e=.25:e=-.25,e>0&&this.speed<t?this.speed=Gt(t,this.speed+e):e<0&&this.speed>0&&(this.speed=W(0,this.speed+e))}fixPosition(){if(this.cell.getTankSpeed(this)===0){const t=C/2;this.x%C>=t?this.x++:this.x--,this.y%C>=t?this.y++:this.y--,this.speed=W(0,this.speed-1)}for(const t of this.world.tanks)t!==this&&t.armour!==255&&B(this,t)<=255&&(t.x<this.x?this.x++:this.x--,t.y<this.y?this.y++:this.y--)}move(){let t=0,e=0;if(this.speed>0){const r=(256-this.getDirection16th()*16)*2*pt/256;t+=H(ut(r)*Vt(this.speed)),e+=H(dt(r)*Vt(this.speed))}if(this.slideTicks>0){const r=(256-this.getSlideDirection16th()*16)*2*pt/256;t+=H(ut(r)*16),e+=H(dt(r)*16),this.slideTicks--}const i=this.x+t,s=this.y+e;let n=!0;if(t!==0){const r=t>0?i+64:i-64,l=this.world.map.cellAtWorld(r,s);l.getTankSpeed(this)!==0&&(n=!1,(!this.onBoat||l.isType(" ","^")||this.speed>=16)&&(this.x=i))}if(e!==0){const r=e>0?s+64:s-64,l=this.world.map.cellAtWorld(i,r);l.getTankSpeed(this)!==0&&(n=!1,(!this.onBoat||l.isType(" ","^")||this.speed>=16)&&(this.y=s))}if(t!==0||e!==0){n&&(this.speed=W(0,this.speed-1));const r=this.cell;this.updateCell(),r!==this.cell&&this.checkNewCell(r)}!this.onBoat&&this.speed<=3&&this.cell.isType(" ")?++this.waterTimer===15&&((this.shells!==0||this.mines!==0)&&this.soundEffect(Zt),this.shells=W(0,this.shells-1),this.mines=W(0,this.mines-1),this.waterTimer=0):this.waterTimer=0}checkNewCell(t){if(this.onBoat)this.cell.isType(" ","^")||this.leaveBoat(t);else{if(this.cell.isType("^")){this.sink();return}this.cell.isType("b")&&this.enterBoat()}this.cell.mine&&this.world.spawn&&this.world.spawn(I,this.cell)}leaveBoat(t){if(this.cell.isType("b")){this.cell.setType(" ",!1,0);const e=(this.cell.x+.5)*C,i=(this.cell.y+.5)*C;this.world.spawn&&this.world.spawn(N,e,i),this.world.soundEffect(V,e,i)}else t.isType(" ")&&t.setType("b",!1,0),this.onBoat=!1}enterBoat(){this.cell.setType(" ",!1,0),this.onBoat=!0}sink(){this.world.soundEffect(Et,this.x,this.y),this.deaths++,this.kill()}kill(){this.dropPillboxes(),this.x=this.y=null,this.armour=255,this.respawnTimer=255}dropPillboxes(){const t=this.getCarryingPillboxes();if(t.length===0||!this.cell)return;let e=this.cell.x;const i=this.cell.y,s=H(je(t.length)),n=De(s/2);e-=n;const r=i+s;for(;t.length!==0;){for(let l=i;l<r;l++){const o=this.world.map.cellAtTile(e,l);if(o.base||o.pill||o.isType("|","}","b"))continue;const h=t.pop();if(!h)return;h.placeAt(o)}e+=1}}}function Ve(a){a.registerType(st),a.registerType(nt),a.registerType(j),a.registerType(Bt),a.registerType(N),a.registerType(I),a.registerType(it),a.registerType(Z),a.registerType(At)}const oe=Object.freeze(Object.defineProperty({__proto__:null,Builder:At,Explosion:N,Fireball:Z,FloodFill:j,MineExplosion:I,Shell:it,Tank:Bt,WorldBase:nt,WorldPillbox:st,registerWithWorld:Ve},Symbol.toStringTag,{value:"Module"}));function yt(a){if(a.length%4!==0)throw new Error("Invalid base64 input length, not properly padded?");let t=a.length/4*3;const e=a.substr(-2);e[0]==="="&&t--,e[1]==="="&&t--;const i=new Array(t),s=new Array(4);let n=0;for(let r=0;r<a.length;r++){const l=a[r],o=l.charCodeAt(0),h=r%4;s[h]=(()=>{if(65<=o&&o<=90)return o-65;if(97<=o&&o<=122)return o-71;if(48<=o&&o<=57)return o+4;if(o===43)return 62;if(o===47)return 63;if(o===61)return-1;throw new Error(`Invalid base64 input character: ${l}`)})(),h===3&&(i[n++]=((s[0]&63)<<2)+((s[1]&48)>>4),s[2]!==-1&&(i[n++]=((s[1]&15)<<4)+((s[2]&60)>>2)),s[3]!==-1&&(i[n++]=((s[2]&3)<<6)+(s[3]&63)))}return i}function Ge(a){let t=null,e=null,i=!1;const s=typeof globalThis<"u"&&typeof globalThis.window<"u"&&typeof globalThis.window.requestAnimationFrame=="function";return{start(){if(!i&&(i=!0,a.tick&&(t=setInterval(a.tick,a.rate)),a.frame&&s)){const n=()=>{i&&(a.frame(),e=globalThis.window.requestAnimationFrame(n))};n()}},stop(){i=!1,t&&(clearInterval(t),t=null),e!==null&&s&&(globalThis.window.cancelAnimationFrame(e),e=null)}}}class Qe extends se{constructor(t){super(),this.lengthComputable=!0,this.loaded=0,this.total=0,this.wrappingUp=!1,this.total=t!==void 0?t:0}add(...t){let e=1,i=null;return typeof t[0]=="number"&&(e=t.shift()),typeof t[0]=="function"&&(i=t.shift()),this.total+=e,this.emit("progress",this),()=>{this.step(e),i==null||i()}}step(t=1){this.loaded+=t,this.emit("progress",this),this.checkComplete()}set(t,e){this.total=t,this.loaded=e,this.emit("progress",this),this.checkComplete()}wrapUp(){this.wrappingUp=!0,this.checkComplete()}checkComplete(){!this.wrappingUp||this.loaded<this.total||this.emit("complete")}}class Ue{constructor(){this.container=document.createElement("div"),this.container.className="vignette",document.body.appendChild(this.container),this.messageLine=document.createElement("div"),this.messageLine.className="vignette-message",this.container.appendChild(this.messageLine)}message(t){this.messageLine.textContent=t}showProgress(){}hideProgress(){}progress(t){}destroy(){this.container.remove(),this.container=null,this.messageLine=null}}class Fe{constructor(){if(this.sounds={},this.isSupported=!1,typeof Audio<"u"){const t=new Audio;this.isSupported=typeof t.canPlayType=="function"}}register(t,e){this.sounds[t]=e,this[t]=()=>this.play(t)}load(t,e,i){if(this.register(t,e),!this.isSupported){i==null||i();return}const s=new Audio;i&&s.addEventListener("canplaythrough",i,{once:!0}),s.addEventListener("error",n=>{const r=n.target.error;(r==null?void 0:r.code)===MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED&&(this.isSupported=!1,i==null||i())},{once:!0}),s.src=e,s.load()}play(t){if(!this.isSupported)return;const e=new Audio;return e.src=this.sounds[t],e.play(),e}}const U=[{r:255,g:0,b:0,name:"red"},{r:0,g:0,b:255,name:"blue"},{r:255,g:255,b:0,name:"yellow"},{r:0,g:255,b:0,name:"green"},{r:255,g:165,b:0,name:"orange"},{r:128,g:0,b:128,name:"purple"}],{min:Qt,max:Ut,round:O,cos:Xe,sin:Ye,PI:Ke,sqrt:Je}=Math;class qe{constructor(t){this.currentTool=null,this.world=t,this.images=this.world.images,this.soundkit=this.world.soundkit,this.canvas=document.createElement("canvas"),document.body.appendChild(this.canvas),this.lastCenter=this.world.map.findCenterCell().getWorldCoordinates(),this.mouse=[0,0],this.canvas.addEventListener("click",e=>this.handleClick(e)),this.canvas.addEventListener("mousemove",e=>{this.mouse=[e.pageX,e.pageY]}),this.setup(),this.handleResize(),window.addEventListener("resize",()=>this.handleResize())}setup(){}centerOn(t,e,i){}drawTile(t,e,i,s){}drawStyledTile(t,e,i,s,n){}drawMap(t,e,i,s){}drawBuilderIndicator(t){}onRetile(t,e,i){}draw(){let t,e;const i=this.world.getViewTarget?this.world.getViewTarget():null;i?{x:t,y:e}=i:this.world.player?({x:t,y:e}=this.world.player,this.world.player.fireball&&({x:t,y:e}=this.world.player.fireball.$)):t=e=null,t==null||e==null?[t,e]=this.lastCenter:this.lastCenter=[t,e],this.centerOn(t,e,(s,n,r,l)=>{this.drawMap(s,n,r,l);for(const o of this.world.objects)if(o&&!(o.hidden&&o!==this.world.player)&&o.styled!=null&&o.x!=null&&o.y!=null){const[h,p]=o.getTile(),c=O(o.x/M)-x/2,d=O(o.y/M)-x/2;o.styled===!0?this.drawStyledTile(h,p,o.team,c,d):o.styled===!1&&this.drawTile(h,p,c,d)}this.drawOverlay()}),this.hud&&this.updateHud()}playSound(t,e,i,s){let n;if(this.world.player&&s===this.world.player)n="Self";else{const l=e-this.lastCenter[0],o=i-this.lastCenter[1],h=Je(l*l+o*o);h>40*C?n="None":h>15*C?n="Far":n="Near"}if(n==="None")return;let r;switch(t){case qt:r=`bigExplosion${n}`;break;case Zt:r=n==="Self"?"bubbles":void 0;break;case te:r=`farmingTree${n}`;break;case ee:r=`hitTank${n}`;break;case D:r=`manBuilding${n}`;break;case ie:r=`manDying${n}`;break;case vt:r=n==="Near"?"manLayMineNear":void 0;break;case kt:r=`mineExplosion${n}`;break;case Tt:r=`shooting${n}`;break;case V:r=`shotBuilding${n}`;break;case Ct:r=`shotTree${n}`;break;case Et:r=`tankSinking${n}`;break}r&&this.soundkit[r]()}handleResize(){this.canvas.width=window.innerWidth,this.canvas.height=window.innerHeight,this.canvas.style.width=`${window.innerWidth}px`,this.canvas.style.height=`${window.innerHeight}px`,document.body.style.width=`${window.innerWidth}px`,document.body.style.height=`${window.innerHeight}px`}handleClick(t){if(t.preventDefault(),this.world.input.focus(),!this.currentTool)return;const[e,i]=this.mouse,s=this.getCellAtScreen(e,i),[n,r,l]=this.world.checkBuildOrder(this.currentTool,s);n&&this.world.buildOrder(n,r,s)}getViewAreaAtWorld(t,e){const{width:i,height:s}=this.canvas;let n=O(t/M-i/2);n=Ut(0,Qt(Rt-i,n));let r=O(e/M-s/2);return r=Ut(0,Qt(Rt-s,r)),[n,r,i,s]}getCellAtScreen(t,e){const[i,s]=this.lastCenter,[n,r,l,o]=this.getViewAreaAtWorld(i,s);return this.world.map.cellAtPixel(n+t,r+e)}drawOverlay(){const t=this.world.player;if(t&&t.armour!==255){if(t.builder){const e=t.builder.$;e.order===e.states.inTank||e.order===e.states.parachuting||this.drawBuilderIndicator(e)}this.world.gunsightVisible&&this.drawReticle()}this.drawNames(),this.drawCursor()}drawReticle(){const t=this.world.player.firingRange*x,e=(256-this.world.player.direction)*2*Ke/256,i=O(this.world.player.x/M+Xe(e)*t)-x/2,s=O(this.world.player.y/M+Ye(e)*t)-x/2;this.drawTile(17,4,i,s)}drawCursor(){const[t,e]=this.mouse,i=this.getCellAtScreen(t,e);this.drawTile(18,6,i.x*x,i.y*x)}drawNames(){}initHud(){this.hud=document.createElement("div"),this.hud.id="hud",document.body.appendChild(this.hud),this.initHudTankStatus(),this.initHudPillboxes(),this.initHudBases(),this.initHudPlayers(),this.initHudStats(),this.initHudToolSelect(),this.initHudNotices(),this.updateHud()}initHudTankStatus(){const t=document.createElement("div");t.id="tankStatus",this.hud.appendChild(t);const e=document.createElement("div");e.className="deco",t.appendChild(e),this.tankIndicators={};for(const i of["shells","mines","armour","trees"]){const s=document.createElement("div");s.className="gauge",s.id=`tank-${i}`,t.appendChild(s);const n=document.createElement("div");n.className="gauge-content",s.appendChild(n),this.tankIndicators[i]=n}}initHudPillboxes(){const t=document.createElement("div");t.id="pillStatus",this.hud.appendChild(t);const e=document.createElement("div");e.className="deco",t.appendChild(e),this.pillIndicators=this.world.map.pills.map(i=>{const s=document.createElement("div");return s.className="pill",t.appendChild(s),[s,i]})}initHudBases(){const t=document.createElement("div");t.id="baseStatus",this.hud.appendChild(t);const e=document.createElement("div");e.className="deco",t.appendChild(e),this.baseIndicators=this.world.map.bases.map((i,s)=>{const n=document.createElement("div");return n.className="base",n.setAttribute("data-base-idx",i.idx),n.setAttribute("data-array-index",s.toString()),t.appendChild(n),[n,i]})}initHudPlayers(){const t=document.createElement("div");t.id="playersStatus",this.hud.appendChild(t);const e=document.createElement("div");e.className="deco",t.appendChild(e),this.playerIndicators=[]}initHudStats(){const t=document.createElement("div");t.id="statsStatus",this.hud.appendChild(t);const e=document.createElement("div");e.className="stat-line",t.appendChild(e);const i=document.createElement("span");i.className="stat-group-left",e.appendChild(i);const s=document.createElement("span");s.className="stat-icon",s.textContent="☠",i.appendChild(s);const n=document.createElement("span");n.className="stat-value",n.id="stat-kills",n.textContent="0",i.appendChild(n);const r=document.createElement("span");r.className="stat-group-right",e.appendChild(r);const l=document.createElement("span");l.className="stat-icon",l.id="stat-score-icon",l.textContent="★",r.appendChild(l);const o=document.createElement("span");o.className="stat-value",o.id="stat-score",o.textContent="0",r.appendChild(o);const h=document.createElement("div");h.className="stat-line",t.appendChild(h);const p=document.createElement("span");p.className="stat-icon",p.textContent="†",h.appendChild(p);const c=document.createElement("span");c.className="stat-value",c.id="stat-deaths",c.textContent="0",h.appendChild(c)}initHudToolSelect(){this.currentTool=null;const t=document.createElement("div");t.id="tool-select",this.hud.appendChild(t);for(const e of["forest","road","building","pillbox","mine"])this.initHudTool(t,e)}initHudTool(t,e){const i=`tool-${e}`,s=document.createElement("input");s.type="radio",s.name="tool",s.id=i,t.appendChild(s);const n=document.createElement("label");n.htmlFor=i,t.appendChild(n);const r=document.createElement("span");r.className=`bolo-tool bolo-${i}`,n.appendChild(r),s.addEventListener("click",l=>{this.currentTool===e?(this.currentTool=null,t.querySelectorAll("input").forEach(o=>{o.checked=!1})):this.currentTool=e,this.world.input.focus()})}initHudNotices(){if(location.hostname.split(".")[1]==="github"){const t=document.createElement("div");t.innerHTML=`
        This is a work-in-progress; less than alpha quality!<br>
        To see multiplayer in action, follow instructions on Github.
      `,Object.assign(t.style,{position:"absolute",top:"70px",left:"0px",width:"100%",textAlign:"center",fontFamily:"monospace",fontSize:"16px",fontWeight:"bold",color:"white"}),this.hud.appendChild(t)}if(location.hostname.split(".")[1]==="github"||location.hostname.substr(-6)===".no.de"){const t=document.createElement("a");t.href="http://github.com/stephank/orona",Object.assign(t.style,{position:"absolute",top:"0px",right:"0px"}),t.innerHTML='<img src="http://s3.amazonaws.com/github/ribbons/forkme_right_darkblue_121621.png" alt="Fork me on GitHub">',this.hud.appendChild(t)}}updateHud(){if(this.pillIndicators)for(let e=0;e<this.pillIndicators.length;e++){const[i]=this.pillIndicators[e],s=this.world.map.pills[e];if(!s)continue;const n=`${s.inTank};${s.carried};${s.armour};${s.team};${s.owner_idx}`;s.hudStatusKey=n,s.inTank||s.carried?i.setAttribute("status","carried"):s.armour===0?i.setAttribute("status","dead"):i.setAttribute("status","healthy");const r=U[s.team]||{r:112,g:112,b:112};i.style.backgroundColor=`rgb(${r.r},${r.g},${r.b})`}if(this.baseIndicators)for(let e=0;e<this.baseIndicators.length;e++){const[i]=this.baseIndicators[e],s=this.world.map.bases[e];if(!s){console.warn(`[HUD] Base at indicator index ${e} is null/undefined`);continue}const n=`${s.armour};${s.team};${s.owner_idx}`;s.hudStatusKey=n,s.armour<=9?i.setAttribute("status","vulnerable"):i.setAttribute("status","healthy");const r=U[s.team]||{r:112,g:112,b:112},l=`rgb(${r.r},${r.g},${r.b})`;i.style.backgroundColor!==l&&(i.style.backgroundColor=l)}if(this.playerIndicators){const e=document.getElementById("playersStatus");if(e){const i=this.world.tanks.filter(s=>s);for(;this.playerIndicators.length>i.length;){const s=this.playerIndicators.pop();s&&s.remove()}for(let s=0;s<i.length;s++){const n=i[s];if(!this.playerIndicators[s]){const h=document.createElement("div");h.className="player",e.appendChild(h),this.playerIndicators[s]=h}const r=this.playerIndicators[s],l=U[n.team]||{r:112,g:112,b:112};r.style.backgroundColor=`rgb(${l.r},${l.g},${l.b})`,n.armour===255?r.setAttribute("data-dead","true"):r.removeAttribute("data-dead")}}}const t=this.world.player;if(t&&t.kills!==void 0&&t.deaths!==void 0){const e=document.getElementById("stat-kills"),i=document.getElementById("stat-deaths"),s=document.getElementById("stat-score"),n=document.getElementById("stat-score-icon");if(e&&(e.textContent=t.kills.toString()),i&&(i.textContent=t.deaths.toString()),s&&t.team!==void 0&&t.team>=0&&t.team<=5){const r=this.world.teamScores.map((h,p)=>({team:p,score:h}));r.sort((h,p)=>p.score-h.score);const l=r.findIndex(h=>h.team===t.team)+1,o=h=>{const p=["th","st","nd","rd"],c=h%100;return h+(p[(c-20)%10]||p[c]||p[0])};if(s.textContent=o(l),n){const h=U[t.team]||{r:192,g:192,b:240};n.style.color=`rgb(${h.r},${h.g},${h.b})`}}}if(t.hudLastStatus=t.hudLastStatus||{},this.tankIndicators)for(const[e,i]of Object.entries(this.tankIndicators)){const s=t.armour===255?0:t[e];t.hudLastStatus[e]!==s&&(t.hudLastStatus[e]=s,i.style.height=`${O(s/40*100)}%`)}}}const{min:K,round:Q,cos:ft,sin:gt,PI:Ze}=Math;class ti extends qe{constructor(){super(...arguments),this.prestyled={}}setup(){try{const n=this.canvas.getContext("2d");if(!n)throw new Error("Could not get 2D context");this.ctx=n,this.ctx.drawImage}catch(n){throw new Error(`Could not initialize 2D canvas: ${n.message}`)}const t=this.images.overlay,e=document.createElement("canvas");e.width=t.width,e.height=t.height;const i=e.getContext("2d");if(!i)throw new Error("Could not get temporary canvas context");i.globalCompositeOperation="copy",i.drawImage(t,0,0);const s=i.getImageData(0,0,t.width,t.height);this.overlay=s.data,this.prestyled={}}drawTile(t,e,i,s,n){(n||this.ctx).drawImage(this.images.base,t*x,e*x,x,x,i,s,x,x)}createPrestyled(t){const e=this.images.styled,{width:i,height:s}=e,n=document.createElement("canvas");n.width=i,n.height=s;const r=n.getContext("2d");if(!r)throw new Error("Could not get canvas context");r.globalCompositeOperation="copy",r.drawImage(e,0,0);const l=r.getImageData(0,0,i,s),o=l.data;for(let h=0;h<i;h++)for(let p=0;p<s;p++){const c=4*(p*i+h),d=this.overlay[c]/255;o[c+0]=Q(d*t.r+(1-d)*o[c+0]),o[c+1]=Q(d*t.g+(1-d)*o[c+1]),o[c+2]=Q(d*t.b+(1-d)*o[c+2]),o[c+3]=K(255,o[c+3]+this.overlay[c])}return r.putImageData(l,0,0),n}drawStyledTile(t,e,i,s,n,r){let l=this.prestyled[i];if(!l){const o=U[i];o?l=this.prestyled[i]=this.createPrestyled(o):l=this.images.styled}(r||this.ctx).drawImage(l,t*x,e*x,x,x,s,n,x,x)}centerOn(t,e,i){this.ctx.save();const[s,n,r,l]=this.getViewAreaAtWorld(t,e);this.ctx.translate(-s,-n),i(s,n,r,l),this.ctx.restore()}drawBuilderIndicator(t){const e=t.owner.$;if(e.hidden&&e!==this.world.player)return;const i=B(e,t);if(i<=128)return;const s=e.x/M,n=e.y/M;this.ctx.save(),this.ctx.globalCompositeOperation="source-over",this.ctx.globalAlpha=K(1,(i-128)/1024);const r=K(50,i/10240*50)+32;let l=q(e,t);this.ctx.beginPath();const o=s+ft(l)*r,h=n+gt(l)*r;this.ctx.moveTo(o,h),l+=Ze,this.ctx.lineTo(o+ft(l-.4)*10,h+gt(l-.4)*10),this.ctx.lineTo(o+ft(l+.4)*10,h+gt(l+.4)*10),this.ctx.closePath(),this.ctx.fillStyle="yellow",this.ctx.fill(),this.ctx.restore()}drawNames(){this.ctx.save(),this.ctx.strokeStyle=this.ctx.fillStyle="white",this.ctx.font="bold 11px sans-serif",this.ctx.textBaselines="alphabetic",this.ctx.textAlign="left";const t=this.world.player;for(const e of this.world.tanks)if(!(e.hidden&&e!==t)&&e.name&&e.armour!==255&&e!==t){if(t){const r=B(t,e);if(r<=768)continue;this.ctx.globalAlpha=K(1,(r-768)/1536)}else this.ctx.globalAlpha=1;const i=this.ctx.measureText(e.name);this.ctx.beginPath();let s=Q(e.x/M)+16,n=Q(e.y/M)-16;this.ctx.moveTo(s,n),s+=12,n-=9,this.ctx.lineTo(s,n),this.ctx.lineTo(s+i.width,n),this.ctx.stroke(),this.ctx.fillText(e.name,s,n-2)}this.ctx.restore()}}const{floor:Ft}=Math,z=16,J=A/z,R=z*x;class ei{constructor(t,e,i){this.canvas=null,this.ctx=null,this.renderer=t,this.sx=e*z,this.sy=i*z,this.ex=this.sx+z-1,this.ey=this.sy+z-1,this.psx=e*R,this.psy=i*R,this.pex=this.psx+R-1,this.pey=this.psy+R-1}isInView(t,e,i,s){return i<this.psx||s<this.psy?!1:!(t>this.pex||e>this.pey)}build(){this.canvas=document.createElement("canvas"),this.canvas.width=this.canvas.height=R;const t=this.canvas.getContext("2d");if(!t)throw new Error("Could not get canvas context");this.ctx=t,this.ctx.translate(-this.psx,-this.psy),this.renderer.world.map.each(e=>{this.onRetile(e,e.tile[0],e.tile[1])},this.sx,this.sy,this.ex,this.ey)}clear(){this.canvas=this.ctx=null}onRetile(t,e,i){if(!this.canvas)return;const s=t.pill||t.base;s?this.renderer.drawStyledTile(t.tile[0],t.tile[1],s.team,t.x*x,t.y*x,this.ctx):this.renderer.drawTile(t.tile[0],t.tile[1],t.x*x,t.y*x,this.ctx)}}class ii extends ti{setup(){super.setup(),this.cache=new Array(J);for(let t=0;t<J;t++){const e=this.cache[t]=new Array(J);for(let i=0;i<J;i++)e[i]=new ei(this,i,t)}}onRetile(t,e,i){if(t.tile=[e,i],!this.cache)return;const s=Ft(t.x/z),n=Ft(t.y/z);!this.cache[n]||!this.cache[n][s]||this.cache[n][s].onRetile(t,e,i)}drawMap(t,e,i,s){const n=t+i-1,r=e+s-1;let l=!1;for(const o of this.cache)for(const h of o){if(!h.isInView(t,e,n,r)){h.canvas&&h.clear();continue}if(!h.canvas){if(l)continue;h.build(),l=!0}this.ctx.drawImage(h.canvas,0,0,R,R,h.psx,h.psy,R,R)}}}const si={boloInit(){this.tanks=[]},addTank(a){a.tank_idx=this.tanks.length,this.tanks.push(a),this.authority&&this.resolveMapObjectOwners(),this.tanks.length===1&&this.emptyStartTime!==void 0&&(this.emptyStartTime=null)},removeTank(a){const t=a.tank_idx;this.tanks.splice(a.tank_idx,1);for(let e=a.tank_idx;e<this.tanks.length;e++)this.tanks[e].tank_idx=e;for(const e of this.getAllMapObjects())if(e.owner_idx!==255)if(e.owner_idx===t){const i=e.team;e.owner_idx=255,e.ref("owner",null),e.team=i}else e.owner_idx>t&&(e.owner_idx-=1);this.authority&&this.resolveMapObjectOwners(),this.tanks.length===0&&this.emptyStartTime!==void 0&&(this.emptyStartTime=Date.now())},getAllMapObjects(){return this.map.pills.concat(this.map.bases)},spawnMapObjects(){for(const a of this.getAllMapObjects())a.world=this,this.insert(a),a.spawn(),a.anySpawn()},resolveMapObjectOwners(){var a;for(const t of this.getAllMapObjects())t.owner_idx!==255&&t.owner_idx<this.tanks.length?t.ref("owner",this.tanks[t.owner_idx]):t.owner_idx===255&&t.owner&&t.ref("owner",null),(a=t.cell)==null||a.retile()}},Mt={start(){const a=new Ue;this.waitForCache(a,()=>{this.loadResources(a,()=>{this.loaded(a)})})},waitForCache(a,t){return t()},loadResources(a,t){a.message("Loading resources");const e=new Qe;this.images={},this.loadImages(i=>{this.images[i]=new Image;const s=this.images[i],n=e.add();s.addEventListener("load",n,{once:!0}),s.src=`images/${i}.png`}),this.soundkit=new Fe,this.loadSounds(i=>{const s=`sounds/${i}.ogg`,n=i.split("_");for(let l=1;l<n.length;l++)n[l]=n[l].substr(0,1).toUpperCase()+n[l].substr(1);const r=n.join("");this.soundkit.load(r,s,e.add())}),typeof applicationCache>"u"&&(a.showProgress(),e.on("progress",i=>a.progress(i.loaded/i.total))),e.on("complete",()=>{a.hideProgress(),t()}),e.wrapUp()},loadImages(a){a("base"),a("styled"),a("overlay")},loadSounds(a){a("big_explosion_far"),a("big_explosion_near"),a("bubbles"),a("farming_tree_far"),a("farming_tree_near"),a("hit_tank_far"),a("hit_tank_near"),a("hit_tank_self"),a("man_building_far"),a("man_building_near"),a("man_dying_far"),a("man_dying_near"),a("man_lay_mine_near"),a("mine_explosion_far"),a("mine_explosion_near"),a("shooting_far"),a("shooting_near"),a("shooting_self"),a("shot_building_far"),a("shot_building_near"),a("shot_tree_far"),a("shot_tree_near"),a("tank_sinking_far"),a("tank_sinking_near")},commonInitialization(){this.renderer=new ii(this),this.map.world=this,this.map.setView(this.renderer),this.boloInit(),this.loop=Ge({rate:le,tick:()=>this.tick(),frame:()=>this.renderer.draw()}),this.increasingRange=!1,this.decreasingRange=!1,this.rangeAdjustTimer=0,this.viewMode="tank",this.currentPillboxIndex=0;const a=o=>{var c;const p=`; ${document.cookie}`.split(`; ${o}=`);return p.length===2&&((c=p.pop())==null?void 0:c.split(";").shift())||null},t={accelerate:"ArrowUp",decelerate:"ArrowDown",turnLeft:"ArrowLeft",turnRight:"ArrowRight",increaseRange:"KeyL",decreaseRange:"Semicolon",shoot:"Space",layMine:"Tab",tankView:"Enter",pillboxView:"KeyP",autoSlowdown:!0,autoGunsight:!0},e=a("keyBindings");this.keyBindings=e?{...t,...JSON.parse(e)}:t,this.input=document.createElement("input"),this.input.id="input-dummy",this.input.type="text",this.input.setAttribute("autocomplete","off"),this.input.setAttribute("readonly","true"),this.input.style.caretColor="transparent",document.body.insertBefore(this.input,this.renderer.canvas),this.input.focus();const i=[this.input,this.renderer.canvas],s=document.querySelectorAll("#tool-select label");i.push(...Array.from(s));const n=o=>{o.preventDefault(),o.stopPropagation();const h=o.code;h===this.keyBindings.increaseRange?this.increasingRange=!0:h===this.keyBindings.decreaseRange?this.decreasingRange=!0:this.handleKeydown(o)},r=o=>{o.preventDefault(),o.stopPropagation();const h=o.code;h===this.keyBindings.increaseRange?this.increasingRange=!1:h===this.keyBindings.decreaseRange?this.decreasingRange=!1:this.handleKeyup(o)},l=o=>(o.preventDefault(),o.stopPropagation(),!1);for(const o of i)o.addEventListener("keydown",n),o.addEventListener("keyup",r),o.addEventListener("keypress",l)},failure(a){this.loop&&this.loop.stop();const t=document.createElement("div");t.textContent=a,t.style.cssText=`
      position: fixed;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      background: white;
      padding: 20px;
      border: 2px solid #333;
      z-index: 10000;
      font-family: sans-serif;
    `;const e=document.createElement("div");e.style.cssText=`
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: rgba(0, 0, 0, 0.5);
      z-index: 9999;
    `,document.body.appendChild(e),document.body.appendChild(t)},checkBuildOrder(a,t){const e=this.player.builder.$;if(e.order!==e.states.inTank)return[!1];if(t.mine)return[!1];let i;switch(a){case"forest":t.base||t.pill||!t.isType("#")?i=[!1]:i=["forest",0];break;case"road":t.base||t.pill||t.isType("|","}","b","^")?i=[!1]:t.isType("#")?i=["forest",0]:t.isType("=")?i=[!1]:t.isType(" ")&&t.hasTankOnBoat()?i=[!1]:i=["road",2];break;case"building":t.base||t.pill||t.isType("b","^")?i=[!1]:t.isType("#")?i=["forest",0]:t.isType("}")?i=["repair",1]:t.isType("|")?i=[!1]:t.isType(" ")?t.hasTankOnBoat()?i=[!1]:i=["boat",20]:t===this.player.cell?i=[!1]:i=["building",2];break;case"pillbox":t.pill?t.pill.armour===16?i=[!1]:t.pill.armour>=11?i=["repair",1,!0]:t.pill.armour>=7?i=["repair",2,!0]:t.pill.armour>=3?i=["repair",3,!0]:t.pill.armour<3?i=["repair",4,!0]:i=[!1]:t.isType("#")?i=["forest",0]:t.base||t.isType("b","^","|","}"," ")?i=[!1]:t===this.player.cell?i=[!1]:i=["pillbox",4];break;case"mine":t.base||t.pill||t.isType("^"," ","|","b","}")?i=[!1]:i=["mine"];break;default:i=[!1]}const[s,n,r]=i;return s?s==="mine"?this.player.mines===0?[!1]:["mine"]:s==="pill"&&this.player.getCarryingPillboxes().length===0?[!1]:n!=null&&this.player.trees<n?r?[s,this.player.trees,r]:[!1]:i:[!1]}};St(Mt,si);const ni=oe;class Ht extends mt{constructor(){super(...arguments),this.authority=!0,this.gunsightVisible=!0,this.autoSlowdownActive=!1}loaded(t){this.map=re.load(yt(_e)),this.commonInitialization(),this.spawnMapObjects(),this.player=this.spawn(Bt),this.player.spawn(0),this.renderer.initHud(),t.destroy(),this.loop.start()}tick(){if(super.tick(),this.increasingRange!==this.decreasingRange){if(++this.rangeAdjustTimer===6){if(this.increasingRange){this.player.increaseRange();const t=this.keyBindings;t&&t.autoGunsight&&this.player.firingRange===7&&(this.gunsightVisible=!1)}else{this.player.decreaseRange();const t=this.keyBindings;t&&t.autoGunsight&&(this.gunsightVisible=!0)}this.rangeAdjustTimer=0}}else this.rangeAdjustTimer=0}soundEffect(t,e,i,s){this.renderer.playSound(t,e,i,s)}mapChanged(t,e,i,s){}handleKeydown(t){switch(t.which||t.keyCode){case 32:this.player.shooting=!0;break;case 37:this.player.turningCounterClockwise=!0;break;case 38:this.player.accelerating=!0,this.autoSlowdownActive&&(this.player.braking=!1,this.autoSlowdownActive=!1);break;case 39:this.player.turningClockwise=!0;break;case 40:this.player.braking=!0,this.autoSlowdownActive=!1;break}}handleKeyup(t){const e=t.which||t.keyCode,i=this.keyBindings;switch(e){case 32:this.player.shooting=!1;break;case 37:this.player.turningCounterClockwise=!1;break;case 38:this.player.accelerating=!1,i&&i.autoSlowdown&&(this.player.braking=!0,this.autoSlowdownActive=!0);break;case 39:this.player.turningClockwise=!1;break;case 40:this.player.braking=!1,this.autoSlowdownActive=!1;break}}buildOrder(t,e,i){this.player.builder.$.performOrder(t,e,i)}}St(Ht.prototype,Mt);ni.registerWithWorld(Ht.prototype);const ri="modulepreload",oi=function(a){return"/"+a},Xt={},li=function(t,e,i){let s=Promise.resolve();if(e&&e.length>0){document.getElementsByTagName("link");const r=document.querySelector("meta[property=csp-nonce]"),l=(r==null?void 0:r.nonce)||(r==null?void 0:r.getAttribute("nonce"));s=Promise.allSettled(e.map(o=>{if(o=oi(o),o in Xt)return;Xt[o]=!0;const h=o.endsWith(".css"),p=h?'[rel="stylesheet"]':"";if(document.querySelector(`link[href="${o}"]${p}`))return;const c=document.createElement("link");if(c.rel=h?"stylesheet":ri,h||(c.as="script"),c.crossOrigin="",c.href=o,l&&c.setAttribute("nonce",l),document.head.appendChild(c),h)return new Promise((d,u)=>{c.addEventListener("load",d),c.addEventListener("error",()=>u(new Error(`Unable to preload CSS for ${o}`)))})}))}function n(r){const l=new Event("vite:preloadError",{cancelable:!0});if(l.payload=r,window.dispatchEvent(l),!l.defaultPrevented)throw r}return s.then(r=>{for(const l of r||[])l.status==="rejected"&&n(l.reason);return t().catch(n)})},et=class et{constructor(){this.objects=[],this.tanks=[],this._isSynchronized=!1}registerType(t){const e=this.constructor.types.length;this.constructor.types.push(t),this.constructor.typesByName.set(t.name,e)}insert(t){t.idx=this.objects.length,this.objects.push(t)}tick(){for(const t of this.objects)t&&t.tick&&t.tick()}netSpawn(t,e){const i=t[e],s=t[e+1]<<8|t[e+2],n=this.constructor.types[i];if(!n)throw new Error(`Unknown object type index: ${i}`);const r=new n(this);for(r._net_type_idx=i,r.idx=s,r._createdViaMessage=!0;this.objects.length<=s;)this.objects.push(null);this.objects[s]=r;const l=this.constructor.types[3];if(n===l){const o=this.tanks.findIndex(h=>h&&h.idx===r.idx);o===-1?this.tanks.push(r):this.tanks[o]=r}return 3}netDestroy(t,e){const i=t[e]<<8|t[e+1];if(this.objects[i]){const s=this.objects[i],n=this.constructor.types[3];if(s.constructor===n){const r=this.tanks.indexOf(s);r!==-1&&this.tanks.splice(r,1)}this.objects[i]=null}return 2}netUpdate(t,e,i){return t&&t.load?t.load(e,i):0}netTick(t,e,i){const s=!this._isSynchronized;let n=0;for(let r=0;r<this.objects.length;r++){const l=this.objects[r];if(l&&l.load){if(i&&i.has(l))continue;const o=l.load(t,e+n,s);n+=o}}return n}netRestore(){}failure(t){console.error("Client error:",t)}};et.types=[],et.typesByName=new Map;let wt=et;const ai=115,hi=87,ci=67,di=68,ui=77,pi=85,fi=117,gi=83,mi=84,bi="L",yi="l",wi="R",xi="r",vi="A",ki="a",Yt="B",Kt="b",Ti="S",Ci="s",Ei="M",Si="m",Ai="I",Bi="D",Mi="O",Hi=oe;function Ii(){const a=[{value:"red",class:"bolo-team-red"},{value:"blue",class:"bolo-team-blue"},{value:"yellow",class:"bolo-team-yellow"},{value:"green",class:"bolo-team-green"},{value:"orange",class:"bolo-team-orange"},{value:"purple",class:"bolo-team-purple"}];for(let t=a.length-1;t>0;t--){const e=Math.floor(Math.random()*(t+1));[a[t],a[e]]=[a[e],a[t]]}return a.map(t=>`
            <input type="radio" id="join-team-${t.value}" name="join-team" value="${t.value}" style="display: none;"></input>
            <label for="join-team-${t.value}" style="cursor: pointer;">
              <span class="bolo-team ${t.class}" style="
                display: inline-block;
                width: 32px;
                height: 32px;
                border: 2px solid black;
                box-sizing: border-box;
              "></span>
            </label>
  `).join("")}const $i=`
    <div id="join-dialog" style="
      background: #DDDDDD;
      border: 1px solid black;
      box-shadow: 2px 2px 0px rgba(0, 0, 0, 0.5);
      padding: 0;
      width: 350px;
      font-family: 'Chicago', 'Charcoal', sans-serif;
      color: black;
      display: flex;
      flex-direction: column;
    ">
      <div id="join-titlebar" style="
        background: white;
        border-bottom: 1px solid black;
        padding: 0;
        height: 20px;
        display: flex;
        align-items: center;
        justify-content: space-between;
        cursor: move;
        user-select: none;
        position: relative;
      ">
        <div style="
          position: absolute;
          left: 0;
          top: 0;
          bottom: 0;
          width: 30%;
          background-image: repeating-linear-gradient(
            0deg,
            black,
            black 1px,
            white 1px,
            white 2px
          );
        "></div>
        <div id="join-close" style="
          width: 13px;
          height: 13px;
          border: 1px solid black;
          background: white;
          margin-left: 4px;
          cursor: pointer;
          position: relative;
          z-index: 1;
        "></div>
        <div style="
          position: absolute;
          left: 50%;
          transform: translateX(-50%);
          font-weight: bold;
          font-size: 12px;
          color: black;
          background: white;
          padding: 0 8px;
          z-index: 1;
        ">Join Game</div>
        <div style="
          position: absolute;
          right: 0;
          top: 0;
          bottom: 0;
          width: 30%;
          background-image: repeating-linear-gradient(
            0deg,
            black,
            black 1px,
            white 1px,
            white 2px
          );
        "></div>
        <div style="width: 13px;"></div>
      </div>

      <div style="padding: 16px; position: relative;">
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
          <div id="team-colors-container" style="display: flex; gap: 8px; justify-content: center; flex-wrap: wrap;">
            ${Ii()}
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
  `;function Ri(a){var i;const e=`; ${document.cookie}`.split(`; ${a}=`);return e.length===2&&((i=e.pop())==null?void 0:i.split(";").shift())||null}function Jt(a,t){document.cookie=`${a}=${t}; path=/; max-age=31536000`}class It extends wt{constructor(){super(),this.authority=!1,this.mapChanges={},this.processingServerMessages=!1,this.objectsCreatedInThisPacket=new Set,this.gunsightVisible=!0,this.autoSlowdownActive=!1,this.teamScores=[0,0,0,0,0,0],this.mapChanges={},this.processingServerMessages=!1}loaded(t){this.vignette=t,this.heartbeatTimer=0;const e=/^\?([a-z]{20})$/.exec(location.search);if(e)this.connectToGame(e[1]);else if(location.search){this.vignette.message("Invalid game ID");return}else this.showLobby()}showLobby(){var d,u,m,b;this.vignette&&this.vignette.message(""),this.addSystemCSSStyles(),document.body.insertAdjacentHTML("beforeend",`
      <div id="lobby-dialog" class="window" style="
        position: fixed;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        width: 650px;
        min-height: 300px;
        max-height: 600px;
        z-index: 10000;
        display: flex;
        flex-direction: column;
      ">
        <div id="lobby-titlebar" class="title-bar" style="cursor: move; user-select: none;">
          <button class="close" id="lobby-close" aria-label="Close"></button>
          <h1 class="title">Bolo Multiplayer Lobby</h1>
        </div>
        <div class="separator" style="flex-shrink: 0;"></div>
        <div class="window-pane" id="lobby-content" style="flex: 1 1 auto; overflow-y: auto; min-height: 0;">

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
          <button id="create-game-btn" class="btn" disabled>Create Game</button>
        </div>

        <div style="margin-top: 30px; text-align: center; border-top: 1px solid black; padding-top: 20px;">
          <button id="how-to-play-btn" class="btn" style="margin-right: 10px;">How to Play</button>
          <button id="key-settings-btn" class="btn" style="margin-right: 10px;">Key Settings</button>
          <button id="team-stats-btn" class="btn">Team Stats</button>
        </div>
        </div>
      </div>
    `);const e=document.getElementById("lobby-dialog"),i=document.getElementById("lobby-titlebar"),s=document.getElementById("lobby-close");this.loadMaps(),this.loadGames(),this.lobbyRefreshInterval=window.setInterval(()=>{this.loadGames()},3e3),(d=document.getElementById("create-game-btn"))==null||d.addEventListener("click",()=>{this.createGame()}),(u=document.getElementById("how-to-play-btn"))==null||u.addEventListener("click",()=>{this.showHowToPlay()}),(m=document.getElementById("key-settings-btn"))==null||m.addEventListener("click",()=>{this.showKeySettings()}),(b=document.getElementById("team-stats-btn"))==null||b.addEventListener("click",()=>{this.showTeamStats()}),window.boloJoinGame=f=>this.connectToGame(f),s==null||s.addEventListener("click",()=>{var f;this.lobbyRefreshInterval&&(clearInterval(this.lobbyRefreshInterval),this.lobbyRefreshInterval=void 0),(f=document.getElementById("lobby-dialog"))==null||f.remove()});let n=!1,r=0,l=0,o=0,h=0;i==null||i.addEventListener("mousedown",f=>{if(f.target===s)return;n=!0,r=f.clientX,l=f.clientY;const v=e.getBoundingClientRect();o=v.left,h=v.top});const p=f=>{if(n){const v=f.clientX-r,w=f.clientY-l;e.style.left=`${o+v}px`,e.style.top=`${h+w}px`,e.style.transform="none"}},c=()=>{n=!1};document.addEventListener("mousemove",p),document.addEventListener("mouseup",c)}async loadMaps(){try{const e=await(await fetch("/api/maps")).json(),i=document.getElementById("map-select");if(!i)return;i.innerHTML=e.map(n=>`<option value="${n.name}">${n.name}</option>`).join("");const s=document.getElementById("create-game-btn");s&&(s.disabled=!1)}catch(t){console.error("Failed to load maps:",t)}}async loadGames(){try{const e=await(await fetch("/api/games")).json(),i=document.getElementById("active-games-list");if(!i)return;e.length===0?i.innerHTML='<p style="color: #888;">No active games. Create one below!</p>':i.innerHTML=e.map(s=>`
          <div style="border: 1px solid #666; padding: 10px; margin-bottom: 10px; display: flex; justify-content: space-between; align-items: center;">
            <div>
              <strong>${s.mapName}</strong>
              <span style="color: #888; margin-left: 10px;">${s.playerCount} player${s.playerCount!==1?"s":""}</span>
            </div>
            <button onclick="window.boloJoinGame('${s.gid}')" style="padding: 5px 15px; cursor: pointer;">Join</button>
          </div>
        `).join("")}catch(t){console.error("Failed to load games:",t)}}async createGame(){const t=document.getElementById("map-select");if(!t||!t.value)return;const e=t.value;try{const i=await fetch("/api/games",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({mapName:e})}),s=await i.json();i.ok?this.connectToGame(s.gid):alert(s.error||"Failed to create game")}catch(i){console.error("Failed to create game:",i),alert("Failed to create game")}}showKeySettings(){var y,k;const t={accelerate:"ArrowUp",decelerate:"ArrowDown",turnLeft:"ArrowLeft",turnRight:"ArrowRight",increaseRange:"KeyL",decreaseRange:"Semicolon",shoot:"Space",layMine:"Tab",tankView:"Enter",pillboxView:"KeyP",autoSlowdown:!0,autoGunsight:!0},e=Ri("keyBindings"),i=e?{...t,...JSON.parse(e)}:t,s=g=>{const T={Space:"Spc",ArrowUp:"↑",ArrowDown:"↓",ArrowLeft:"←",ArrowRight:"→",Enter:"Ret",Tab:"Tab",Semicolon:";",Comma:",",Period:".",Slash:"/",Backslash:"\\",BracketLeft:"[",BracketRight:"]",Quote:"'",Backquote:"`",Minus:"-",Equal:"="};return T[g]?T[g]:g.startsWith("Key")?g.substring(3):g.startsWith("Digit")?g.substring(5):g};this.addSystemCSSStyles();const n=`
      <div id="key-settings-overlay" style="
        position: fixed;
        top: 0; left: 0; right: 0; bottom: 0;
        background: rgba(0, 0, 0, 0.5);
        z-index: 20000;
        display: flex;
        align-items: center;
        justify-content: center;
      ">
        <div id="key-settings-dialog" class="window" style="
          position: fixed;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%);
          width: 500px;
          min-height: 400px;
          max-height: 600px;
          display: flex;
          flex-direction: column;
        ">
          <div id="key-settings-titlebar" class="title-bar" style="cursor: move; user-select: none;">
            <button class="close" id="key-settings-close" aria-label="Close"></button>
            <h1 class="title">Key Settings</h1>
          </div>
          <div class="separator" style="flex-shrink: 0;"></div>
          <div class="window-pane" id="key-settings-content" style="flex: 1 1 auto; overflow-y: auto; min-height: 0;">

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
              <div class="field-row" style="margin-bottom: 8px;">
                <input type="checkbox" id="auto-slowdown" ${i.autoSlowdown?"checked":""}>
                <label for="auto-slowdown">Auto Slowdown</label>
              </div>
              <div class="field-row">
                <input type="checkbox" id="auto-gunsight" ${i.autoGunsight?"checked":""}>
                <label for="auto-gunsight">Enable automatic show &amp; hide of gunsight</label>
              </div>
            </div>
          </div>

          <div style="text-align: center; display: flex; gap: 8px; justify-content: center; padding: 8px 0;">
            <button id="key-settings-cancel" class="btn">Cancel</button>
            <button id="key-settings-ok" class="btn btn-default">OK</button>
          </div>
          </div>
        </div>
      </div>
    `;document.body.insertAdjacentHTML("beforeend",n);const r=document.getElementById("key-settings-dialog"),l=document.getElementById("key-settings-titlebar"),o=document.getElementById("key-settings-close"),h={...i};let p=null;const c=Array.from(document.querySelectorAll(".key-input")),d=g=>{p=g,g.value="...",g.style.background="#ffffcc"};c.forEach(g=>{g.addEventListener("click",T=>{const $=T.target;d($)})});const u=g=>{if(!p)return;g.preventDefault(),g.stopPropagation();const T=p.getAttribute("data-binding");if(!T)return;h[T]=g.code,p.value=s(g.code),p.style.background="white";const $t=c.indexOf(p)+1;$t<c.length?d(c[$t]):p=null};document.addEventListener("keydown",u),o==null||o.addEventListener("click",()=>{var g;document.removeEventListener("keydown",u),(g=document.getElementById("key-settings-overlay"))==null||g.remove()});let m=!1,b=0,f=0,v=0,w=0;l==null||l.addEventListener("mousedown",g=>{if(g.target===o)return;m=!0,b=g.clientX,f=g.clientY;const T=r.getBoundingClientRect();v=T.left,w=T.top});const S=g=>{if(m){const T=g.clientX-b,$=g.clientY-f;r.style.left=`${v+T}px`,r.style.top=`${w+$}px`,r.style.transform="none"}},E=()=>{m=!1};document.addEventListener("mousemove",S),document.addEventListener("mouseup",E),(y=document.getElementById("key-settings-cancel"))==null||y.addEventListener("click",()=>{var g;document.removeEventListener("keydown",u),(g=document.getElementById("key-settings-overlay"))==null||g.remove()}),(k=document.getElementById("key-settings-ok"))==null||k.addEventListener("click",()=>{var g,T,$;h.autoSlowdown=(g=document.getElementById("auto-slowdown"))==null?void 0:g.checked,h.autoGunsight=(T=document.getElementById("auto-gunsight"))==null?void 0:T.checked,Jt("keyBindings",JSON.stringify(h)),document.removeEventListener("keydown",u),($=document.getElementById("key-settings-overlay"))==null||$.remove(),this.updateKeyBindings&&this.updateKeyBindings(h)})}addSystemCSSStyles(){if(document.getElementById("system-css-styles"))return;const t=document.createElement("style");t.id="system-css-styles",t.textContent=`
      :root {
        --primary: #FFFFFF;
        --secondary: #000000;
        --tertiary: #A5A5A5;
      }

      .window {
        display: flex;
        flex-direction: column;
        min-width: 320px;
        overflow: hidden;
        background-color: var(--primary);
        border: 2px solid var(--secondary);
        font-family: 'Chicago', 'Charcoal', sans-serif;
        box-shadow: 2px 2px 0 rgba(0, 0, 0, 0.5);
      }

      .title-bar {
        flex: none;
        display: flex;
        align-items: center;
        height: 19px;
        margin: 2px 2px;
        padding: 2px 1px;
        background: linear-gradient(var(--secondary) 50%, transparent 50%);
        background-size: 6.67% 13.33%;
        background-clip: content-box;
      }

      .title-bar .title {
        padding: 0 8px;
        margin: 0 auto;
        font-size: 12px;
        font-weight: bold;
        line-height: 1.1;
        text-align: center;
        background: var(--primary);
        cursor: default;
      }

      .title-bar button {
        position: relative;
        display: block;
        width: 13px;
        height: 13px;
        margin: 0 2px;
        border: 1px solid var(--secondary);
        background-color: var(--primary);
        cursor: pointer;
        padding: 0;
      }

      .title-bar button.close::before,
      .title-bar button.close::after {
        content: "";
        position: absolute;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        opacity: 0;
      }

      .title-bar button.close:active::before,
      .title-bar button.close:active::after {
        opacity: 1;
      }

      .separator {
        height: 1px;
        background: var(--secondary);
        margin: 0;
      }

      .window-pane {
        overflow-y: scroll;
        overflow-x: hidden;
        height: 100%;
        padding: 16px;
        font-size: 11px;
        line-height: 1.4;
      }

      .window-pane::-webkit-scrollbar {
        width: 22px;
        background-color: var(--primary);
      }

      .window-pane::-webkit-scrollbar-track {
        background: linear-gradient(45deg, var(--secondary) 25%, transparent 25%,
          transparent 75%, var(--secondary) 75%, var(--secondary)),
          linear-gradient(45deg, var(--secondary) 25%, transparent 25%,
          transparent 75%, var(--secondary) 75%, var(--secondary));
        background-color: var(--primary);
        background-size: 4px 4px;
        background-position: 0 0, 2px 2px;
        width: 10px;
        border-left: 3px solid var(--secondary);
      }

      .window-pane::-webkit-scrollbar-thumb {
        width: 20px;
        box-sizing: content-box;
        background-color: var(--primary);
        border: 2px solid var(--secondary);
        border-right: none;
      }

      .window-pane::-webkit-scrollbar-button:horizontal:start:decrement,
      .window-pane::-webkit-scrollbar-button:horizontal:end:increment,
      .window-pane::-webkit-scrollbar-button:vertical:start:decrement,
      .window-pane::-webkit-scrollbar-button:vertical:end:increment {
        display: block;
      }

      .window-pane::-webkit-scrollbar-button:vertical:start {
        background-repeat: no-repeat;
        height: 23.38px;
        background-image: url("data:image/svg+xml;charset=utf-8,%3Csvg width='22' height='24' fill='none' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath fill='%23fff' stroke='%23000' d='M.5.5h21v22.375H.5z'/%3E%3Cpath fill='%23000' d='M1 23h20v-2H1zM1.375 12.375h5.5V11h-5.5zM6.875 17.875h6.875V16.5H6.875zM6.875 17.875v-5.5H5.5v5.5zM9.625 5.5V4.125H8.25V5.5zM11 4.125V2.75H9.625v1.375zM19.25 12.375V11h-1.375v1.375zM17.875 11V9.625H16.5V11zM16.5 9.625V8.25h-1.375v1.375zM15.125 8.25V6.875H13.75V8.25zM13.75 6.875V5.5h-1.375v1.375zM12.375 5.5V4.125H11V5.5zM8.25 6.875V5.5H6.875v1.375zM6.875 8.25V6.875H5.5V8.25zM5.5 9.625V8.25H4.125v1.375zM4.125 11V9.625H2.75V11z'/%3E%3Cpath fill='%23000' d='M2.75 12.375V11H1.375v1.375zM15.125 17.875v-5.5H13.75v5.5zM13.75 12.375h5.5V11h-5.5z'/%3E%3C/svg%3E");
      }

      .window-pane::-webkit-scrollbar-button:vertical:start:active {
        background-repeat: no-repeat;
        height: 23.38px;
        background-image: url("data:image/svg+xml;charset=utf-8,%3Csvg width='22' height='24' fill='none' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath fill='%23fff' stroke='%23000' d='M.5.5h21v22.38H.5z'/%3E%3Cpath fill='%23000' d='M1 23.005h20v-2H1zM1.375 12.378h5.5v-1.375h-5.5zM6.875 17.879h6.875V6.877H6.875zM6.875 17.879v-5.501H5.5v5.5zM9.625 5.501V4.126H8.25v1.375zM11 4.126V2.75H9.625v1.375zM19.25 12.378v-1.375h-1.375v1.375zM17.875 11.002V9.627H13.75v1.375zM16.5 9.627V8.252h-2.75v1.375zM15.125 8.252V6.877H13.75v1.375zM13.75 6.876V5.501h-1.375v1.375zM12.375 5.501V4.126h-2.75v1.375zM12.375 6.876V5.501h-5.5v1.375zM6.875 8.252V6.877H5.5v1.375zM6.875 9.627V8.252h-2.75v1.375zM6.875 11.002V9.627H2.75v1.375z'/%3E%3Cpath fill='%23000' d='M2.75 12.378v-1.375H1.375v1.375zM15.125 17.879v-5.501H13.75v5.5zM13.75 12.378h5.5v-1.375h-5.5z'/%3E%3C/svg%3E");
      }

      .window-pane::-webkit-scrollbar-button:vertical:end {
        height: 23.38px;
        background-image: url("data:image/svg+xml;charset=utf-8,%3Csvg width='22' height='24' fill='none' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath fill='%23fff' stroke='%23000' d='M.5 22.875h21V.5H.5z'/%3E%3Cpath fill='%23000' d='M1 .375h20v2H1zM1.375 11h5.5v1.375h-5.5zM6.875 5.5h6.875v1.375H6.875zM6.875 5.5V11H5.5V5.5zM9.625 17.875v1.375H8.25v-1.375zM11 19.25v1.375H9.625V19.25zM19.25 11v1.375h-1.375V11zM17.875 12.375v1.375H16.5v-1.375zM16.5 13.75v1.375h-1.375V13.75zM15.125 15.125V16.5H13.75v-1.375zM13.75 16.5v1.375h-1.375V16.5zM12.375 17.875v1.375H11v-1.375zM8.25 16.5v1.375H6.875V16.5zM6.875 15.125V16.5H5.5v-1.375zM5.5 13.75v1.375H4.125V13.75zM4.125 12.375v1.375H2.75v-1.375z'/%3E%3Cpath fill='%23000' d='M2.75 11v1.375H1.375V11zM15.125 5.5V11H13.75V5.5zM13.75 11h5.5v1.375h-5.5z'/%3E%3C/svg%3E");
      }

      .window-pane::-webkit-scrollbar-button:vertical:end:active {
        background-repeat: no-repeat;
        height: 23.38px;
        background-image: url("data:image/svg+xml;charset=utf-8,%3Csvg width='22' height='24' fill='none' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath fill='%23fff' stroke='%23000' d='M.5 22.88h21V.5H.5z'/%3E%3Cpath fill='%23000' d='M1 .375h20v2H1zM1.375 11.002h5.5v1.375h-5.5zM6.875 5.501h6.875v11.002H6.875zM6.875 5.501v5.501H5.5v-5.5zM9.625 17.879v1.375H8.25v-1.375zM11 19.254v1.375H9.625v-1.375zM19.25 11.002v1.375h-1.375v-1.375zM17.875 12.378v1.375H13.75v-1.375zM16.5 13.753v1.375h-2.75v-1.375zM15.125 15.128v1.375H13.75v-1.375zM13.75 16.503v1.375h-1.375v-1.375zM12.375 17.879v1.375h-2.75v-1.375zM12.375 16.503v1.375h-5.5v-1.375zM6.875 15.128v1.375H5.5v-1.375zM6.875 13.753v1.375h-2.75v-1.375zM6.875 12.378v1.375H2.75v-1.375z'/%3E%3Cpath fill='%23000' d='M2.75 11.002v1.375H1.375v-1.375zM15.125 5.501v5.501H13.75v-5.5zM13.75 11.002h5.5v1.375h-5.5z'/%3E%3C/svg%3E");
      }

      .btn {
        min-width: 59px;
        height: 20px;
        padding: 0 12px;
        border: 2px solid var(--secondary);
        border-radius: 8px;
        background: var(--primary);
        font-family: 'Chicago', 'Charcoal', sans-serif;
        font-size: 12px;
        font-weight: bold;
        cursor: pointer;
        text-align: center;
      }

      .btn:active {
        background: var(--secondary);
        color: var(--primary);
      }

      .btn-default {
        border-width: 3px;
      }

      .field-row {
        align-items: center;
        display: flex;
        font-size: 12px;
        overflow: visible;
        margin-left: 20px;
      }

      .field-row + .field-row {
        margin-top: 6px;
      }

      .field-row > * + * {
        margin-left: 6px;
      }

      input[type="checkbox"] {
        appearance: none;
        -webkit-appearance: none;
        -moz-appearance: none;
        background: transparent;
        border: none;
        margin: 0;
        opacity: 0;
        position: fixed;
      }

      input[type="checkbox"] + label {
        position: relative;
        cursor: pointer;
        display: inline-flex;
        align-items: center;
        line-height: 13px;
        padding-left: 19px;
      }

      input[type="checkbox"] + label:before {
        content: "";
        display: block;
        height: 13px;
        width: 13px;
        position: absolute;
        left: 0;
        top: 50%;
        transform: translateY(-50%);
        border: 1.5px solid var(--secondary);
        background: var(--primary);
        box-sizing: border-box;
      }

      input[type="checkbox"]:focus-visible + label:before {
        outline: 1px solid var(--secondary);
      }

      input[type="checkbox"]:hover + label:before {
        outline: 1px solid var(--secondary);
      }

      input[type="checkbox"]:checked + label:after {
        content: "";
        display: block;
        height: 12px;
        width: 12px;
        left: 0.5px;
        position: absolute;
        top: 50%;
        transform: translateY(-50%);
        background-image: url("data:image/svg+xml;charset=utf-8,%3Csvg width='12' height='12' viewBox='0 0 12 12' fill='black' xmlns='http://www.w3.org/2000/svg'%3E%3Crect x='0' y='0' width='1' height='1'/%3E%3Crect x='1' y='1' width='1' height='1'/%3E%3Crect x='2' y='2' width='1' height='1'/%3E%3Crect x='3' y='3' width='1' height='1'/%3E%3Crect x='4' y='4' width='1' height='1'/%3E%3Crect x='5' y='5' width='1' height='1'/%3E%3Crect x='6' y='6' width='1' height='1'/%3E%3Crect x='7' y='7' width='1' height='1'/%3E%3Crect x='8' y='8' width='1' height='1'/%3E%3Crect x='9' y='9' width='1' height='1'/%3E%3Crect x='10' y='10' width='1' height='1'/%3E%3Crect x='11' y='11' width='1' height='1'/%3E%3Crect x='11' y='0' width='1' height='1'/%3E%3Crect x='10' y='1' width='1' height='1'/%3E%3Crect x='9' y='2' width='1' height='1'/%3E%3Crect x='8' y='3' width='1' height='1'/%3E%3Crect x='7' y='4' width='1' height='1'/%3E%3Crect x='6' y='5' width='1' height='1'/%3E%3Crect x='5' y='6' width='1' height='1'/%3E%3Crect x='4' y='7' width='1' height='1'/%3E%3Crect x='3' y='8' width='1' height='1'/%3E%3Crect x='2' y='9' width='1' height='1'/%3E%3Crect x='1' y='10' width='1' height='1'/%3E%3Crect x='0' y='11' width='1' height='1'/%3E%3C/svg%3E");
        background-repeat: no-repeat;
      }

      input[type="checkbox"][disabled] + label:before {
        background: var(--tertiary);
      }
    `,document.head.appendChild(t)}showHowToPlay(){var d;this.addSystemCSSStyles(),document.body.insertAdjacentHTML("beforeend",`
      <div id="how-to-play-overlay" style="
        position: fixed;
        top: 0; left: 0; right: 0; bottom: 0;
        background: rgba(0, 0, 0, 0.5);
        z-index: 20000;
        display: flex;
        align-items: center;
        justify-content: center;
      ">
        <div id="how-to-play-dialog" class="window" style="
          position: fixed;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%);
          width: 650px;
          height: 500px;
        ">
          <div id="how-to-play-titlebar" class="title-bar" style="cursor: move; user-select: none;">
            <button class="close" id="how-to-play-close" aria-label="Close"></button>
            <h1 class="title">How to Play Bolo</h1>
          </div>
          <div class="separator"></div>
          <div class="window-pane" id="how-to-play-content">

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
                <strong>Bottom Left:</strong> Three status panels show all Pillboxes (defense turrets), Bases (refuel stations), and Players.<br>
                <strong>Top Right (Stats):</strong> Your kills ☠, deaths †, and team rank ★<br>
                <strong>Top Center (Build Tools):</strong> Five tools: Forest (gather trees), Road, Building, Pillbox, Mine. Click to select, click map to build.<br>
                <strong>Targeting Reticle:</strong> Circular crosshair shows where your shots will land
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

          </div>
          </div>
        </div>
      </div>
    `);const e=document.getElementById("how-to-play-dialog"),i=document.getElementById("how-to-play-titlebar"),s=document.getElementById("how-to-play-close");s==null||s.addEventListener("click",()=>{var u;(u=document.getElementById("how-to-play-overlay"))==null||u.remove()});let n=!1,r=0,l=0,o=0,h=0;i==null||i.addEventListener("mousedown",u=>{if(u.target===s)return;n=!0,r=u.clientX,l=u.clientY;const m=e.getBoundingClientRect();o=m.left,h=m.top});const p=u=>{if(n){const m=u.clientX-r,b=u.clientY-l;e.style.left=`${o+m}px`,e.style.top=`${h+b}px`,e.style.transform="none"}},c=()=>{n=!1};document.addEventListener("mousemove",p),document.addEventListener("mouseup",c),(d=document.getElementById("how-to-play-overlay"))==null||d.addEventListener("click",u=>{var m;u.target===document.getElementById("how-to-play-overlay")&&((m=document.getElementById("how-to-play-overlay"))==null||m.remove())})}showTeamStats(){var m;this.addSystemCSSStyles(),document.body.insertAdjacentHTML("beforeend",`
      <div id="stats-overlay" style="
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0, 0, 0, 0.5);
        z-index: 10001;
        display: flex;
        align-items: center;
        justify-content: center;
      ">
        <div id="stats-dialog" class="window" style="
          position: fixed;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%);
          width: 800px;
          min-height: 500px;
          max-height: 600px;
          display: flex;
          flex-direction: column;
        ">
          <div id="stats-titlebar" class="title-bar" style="cursor: move; user-select: none;">
            <button class="close" id="stats-close" aria-label="Close"></button>
            <h1 class="title">Team Stats</h1>
          </div>
          <div class="separator" style="flex-shrink: 0;"></div>
          <div class="window-pane" id="stats-content" style="flex: 1 1 auto; overflow-y: auto; min-height: 0; padding: 16px;">

            <!-- Time Period Selector -->
            <div style="margin-bottom: 16px; font-size: 12px;">
              <select id="period-select" style="
                padding: 4px 8px;
                width: 150px;
                border: 1px solid black;
                background: white;
                font-family: 'Chicago', 'Charcoal', sans-serif;
                font-size: 12px;
              ">
                <option value="hour">Hour</option>
                <option value="day">Day</option>
                <option value="week">Week</option>
                <option value="month">Month</option>
                <option value="year">Year</option>
              </select>
            </div>

            <!-- Graph Container -->
            <div style="position: relative; height: 400px; background: white; border: 2px solid black; padding: 8px;">
              <canvas id="rankings-chart"></canvas>
            </div>

          </div>
        </div>
      </div>
    `);const e=document.getElementById("stats-dialog"),i=document.getElementById("stats-titlebar"),s=document.getElementById("stats-close");s==null||s.addEventListener("click",()=>{var b;(b=document.getElementById("stats-overlay"))==null||b.remove()});let n=!1,r=0,l=0,o=0,h=0;i.addEventListener("mousedown",b=>{n=!0,r=b.clientX,l=b.clientY;const f=e.getBoundingClientRect();o=f.left,h=f.top});const p=b=>{if(n){const f=b.clientX-r,v=b.clientY-l;e.style.left=`${o+f}px`,e.style.top=`${h+v}px`,e.style.transform="none"}},c=()=>{n=!1};document.addEventListener("mousemove",p),document.addEventListener("mouseup",c),(m=document.getElementById("stats-overlay"))==null||m.addEventListener("click",b=>{var f;b.target===document.getElementById("stats-overlay")&&((f=document.getElementById("stats-overlay"))==null||f.remove())});const d=document.getElementById("period-select");d==null||d.addEventListener("change",b=>{const f=b.target.value;this.initializeStatsChart(f)});const u=(d==null?void 0:d.value)||"hour";this.initializeStatsChart(u)}async initializeStatsChart(t){const{Chart:e,registerables:i}=await li(async()=>{const{Chart:c,registerables:d}=await import("./chart-19k6OvwP.js");return{Chart:c,registerables:d}},[]);e.register(...i);const s=document.getElementById("rankings-chart");if(!s)return;const n=e.getChart(s);n&&n.destroy();const r=await fetch(`/api/stats/rankings?period=${t}`),{data:l}=await r.json();let o=[],h=[];const p={red:"#FF0000",blue:"#0000FF",yellow:"#FFFF00",green:"#00FF00",orange:"#FFA500",purple:"#800080"};if(t==="hour")o=l.map(c=>{const d=new Date(c.timestamp),u=d.getHours().toString().padStart(2,"0"),m=d.getMinutes().toString().padStart(2,"0");return`${u}:${m}`}),Object.keys(p).forEach(c=>{h.push({label:c.charAt(0).toUpperCase()+c.slice(1),data:l.map(d=>d.rankings[c]),borderColor:p[c],backgroundColor:p[c],borderWidth:2,pointRadius:3,tension:.1})});else if(t==="day")o=l.filter((c,d)=>d%60===0).map((c,d)=>{const u=Math.floor(d*60/60),m=d*60%60;return`${u.toString().padStart(2,"0")}:${m.toString().padStart(2,"0")}`}),Object.keys(p).forEach(c=>{h.push({label:c.charAt(0).toUpperCase()+c.slice(1),data:l.filter((d,u)=>u%60===0).map(d=>d.rankings[c]),borderColor:p[c],backgroundColor:p[c],borderWidth:2,pointRadius:0,tension:.1})});else if(t==="week"){const c=["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];o=l.map(d=>{const u=new Date(d.timestamp),m=u.getHours(),b=c[u.getDay()];return m===0||m===12?`${b} ${m===0?"12am":"12pm"}`:""}),Object.keys(p).forEach(d=>{h.push({label:d.charAt(0).toUpperCase()+d.slice(1),data:l.map(u=>u.rankings[d]),borderColor:p[d],backgroundColor:p[d],borderWidth:2,pointRadius:0,tension:0})})}else if(t==="month")o=l.filter((c,d)=>d%24===0).map(c=>{const d=new Date(c.timestamp);return`${d.getMonth()+1}/${d.getDate()}`}),Object.keys(p).forEach(c=>{h.push({label:c.charAt(0).toUpperCase()+c.slice(1),data:l.filter((d,u)=>u%24===0).map(d=>d.rankings[c]),borderColor:p[c],backgroundColor:p[c],borderWidth:2,pointRadius:0,tension:.1})});else if(t==="year"){const c=["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];o=l.map(d=>{const u=new Date(d.timestamp);return c[u.getMonth()]}),Object.keys(p).forEach(d=>{h.push({label:d.charAt(0).toUpperCase()+d.slice(1),data:l.map(u=>u.rankings[d]),borderColor:p[d],backgroundColor:p[d],borderWidth:2,pointRadius:3,tension:.1})})}new e(s,{type:"line",data:{labels:o,datasets:h},options:{responsive:!0,maintainAspectRatio:!1,plugins:{legend:{display:!1},title:{display:!1}},scales:{y:{reverse:!0,min:.5,max:6.5,ticks:{stepSize:1,autoSkip:!1,callback:c=>{const d=["","1st","2nd","3rd","4th","5th","6th"],u=Math.round(c);return u>=1&&u<=6&&Math.abs(c-u)<.01?d[u]:""},font:{family:"Chicago, Charcoal, sans-serif",size:11}},afterBuildTicks:c=>{c.ticks=[1,2,3,4,5,6].map(d=>({value:d}))},title:{display:!1}},x:{ticks:{font:{family:"Chicago, Charcoal, sans-serif",size:10},maxRotation:45,minRotation:45}}}}})}updateKeyBindings(t){this.keyBindings=t}connectToGame(t){var s,n;this.lobbyRefreshInterval&&(clearInterval(this.lobbyRefreshInterval),this.lobbyRefreshInterval=void 0),(s=document.getElementById("lobby-dialog"))==null||s.remove(),(n=this.vignette)==null||n.message("Connecting to game...");const e=t==="demo"?"/demo":`/match/${t}`,i=location.protocol==="https:"?"wss:":"ws:";this.ws=new WebSocket(`${i}//${location.host}${e}`),this.ws.addEventListener("open",()=>{this.connected()},{once:!0}),this.ws.addEventListener("close",()=>{this.failure("Connection lost")},{once:!0})}connected(){this.vignette&&(this.vignette.message("Waiting for the game map"),this.ws&&this.ws.addEventListener("message",t=>{this.receiveMap(t)},{once:!0}))}receiveMap(t){this.map=re.load(yt(t.data)),this.commonInitialization(),this.vignette&&this.vignette.message("Waiting for the game state"),this.ws&&this.ws.addEventListener("message",e=>{this.handleMessage(e)})}synchronized(){this._isSynchronized=!0,this.rebuildMapObjects(),this.vignette&&(this.vignette.destroy(),this.vignette=null),this.loop.start();const t=[0,0,0,0,0,0];for(const y of this.tanks)y.team>=0&&y.team<6&&t[y.team]++;const e=["red","blue","yellow","green","orange","purple"];let i=Math.min(...t),s=e[t.indexOf(i)];const n=document.createElement("div");n.innerHTML=$i;const r=n.firstElementChild;r.style.position="fixed",r.style.top="50%",r.style.left="50%",r.style.transform="translate(-50%, -50%)",r.style.zIndex="10000";const l=document.createElement("div");l.style.cssText=`
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: rgba(0, 0, 0, 0.5);
      z-index: 9999;
    `,document.body.appendChild(l),document.body.appendChild(r),this.joinDialog=r;const o=r.querySelector("#join-nick-field");o&&(o.value="",o.focus(),o.addEventListener("keydown",y=>{y.which===13&&this.join()}));const h=r.querySelector(`#join-team-${s}`);if(h){h.checked=!0;const y=r.querySelector(`label[for="join-team-${s}"] span`);y&&(y.style.borderWidth="3px")}r.querySelectorAll('#join-team input[type="radio"]').forEach(y=>{y.addEventListener("change",k=>{const g=k.target;r.querySelectorAll("#join-team label span").forEach($=>{$.style.borderWidth="2px"});const T=r.querySelector(`label[for="${g.id}"] span`);T&&(T.style.borderWidth="3px")})});const c=r.querySelector("#join-submit");c&&c.addEventListener("click",()=>{this.join()});const d=r.querySelector("#join-titlebar"),u=r.querySelector("#join-close");u==null||u.addEventListener("click",()=>{const y=r.parentElement,k=y==null?void 0:y.querySelector('div[style*="z-index: 9999"]');k&&k.remove(),r.remove(),this.joinDialog=null});let m=!1,b=0,f=0,v=0,w=0;d==null||d.addEventListener("mousedown",y=>{if(y.target===u||u!=null&&u.contains(y.target))return;m=!0,b=y.clientX,f=y.clientY;const k=r.getBoundingClientRect();v=k.left,w=k.top});const S=y=>{if(!m)return;const k=y.clientX-b,g=y.clientY-f;r.style.left=`${v+k}px`,r.style.top=`${w+g}px`,r.style.transform="none"},E=()=>{m=!1};document.addEventListener("mousemove",S),document.addEventListener("mouseup",E)}join(){if(!this.joinDialog)return;const t=this.joinDialog.querySelector("#join-nick-field"),e=t==null?void 0:t.value,i=this.joinDialog.querySelector("#join-team input:checked"),s=i==null?void 0:i.value;let n;switch(s){case"red":n=0;break;case"blue":n=1;break;case"yellow":n=2;break;case"green":n=3;break;case"orange":n=4;break;case"purple":n=5;break;default:n=-1}if(!e||n===-1)return;Jt("nick",e);const r=this.joinDialog.parentElement,l=r==null?void 0:r.querySelector('div[style*="z-index: 9999"]');l&&l.remove(),this.joinDialog.remove(),this.joinDialog=null,this.ws&&this.ws.send(JSON.stringify({command:"join",nick:e,team:n})),this.input.focus()}receiveWelcome(t){this.player=t,this.renderer.initHud(),this.initChat()}tick(){super.tick(),this.increasingRange!==this.decreasingRange?++this.rangeAdjustTimer===6&&(this.ws&&(this.increasingRange?(this.ws.send(Ai),this.keyBindings.autoGunsight&&this.player&&this.player.firingRange===7&&(this.gunsightVisible=!1)):(this.ws.send(Bi),this.keyBindings.autoGunsight&&(this.gunsightVisible=!0))),this.rangeAdjustTimer=0):this.rangeAdjustTimer=0,++this.heartbeatTimer===10&&(this.heartbeatTimer=0,this.ws&&this.ws.send(""))}failure(t){this.ws&&(this.ws.close(),this.ws=null),super.failure(t)}soundEffect(t,e,i,s){}netSpawn(t,e){const i=super.netSpawn(t,e);return this.rebuildMapObjects(),i}netDestroy(t,e){const i=super.netDestroy(t,e);return this.rebuildMapObjects(),i}mapChanged(t,e,i,s){this.processingServerMessages||this.mapChanges[t.idx]==null&&(t._net_oldType=e,t._net_hadMine=i,t._net_oldLife=s,this.mapChanges[t.idx]=t)}initChat(){this.chatMessages=document.createElement("div"),this.chatMessages.id="chat-messages",this.renderer.hud.appendChild(this.chatMessages),this.chatContainer=document.createElement("div"),this.chatContainer.id="chat-input",this.chatContainer.style.display="none",this.renderer.hud.appendChild(this.chatContainer),this.chatInput=document.createElement("input"),this.chatInput.type="text",this.chatInput.name="chat",this.chatInput.maxLength=140,this.chatInput.addEventListener("keydown",t=>this.handleChatKeydown(t)),this.chatContainer.appendChild(this.chatInput)}openChat(t){t=t||{},this.chatContainer.style.display="block",this.chatInput.value="",this.chatInput.focus(),this.chatInput.team=t.team}commitChat(){this.ws&&this.ws.send(JSON.stringify({command:this.chatInput.team?"teamMsg":"msg",text:this.chatInput.value})),this.closeChat()}closeChat(){this.chatContainer.style.display="none",this.input.focus()}receiveChat(t,e,i){i=i||{};const s=document.createElement("p");s.className=i.team?"msg-team":"msg",s.textContent=`<${t.name}> ${e}`,this.chatMessages.appendChild(s),window.setTimeout(()=>{s.remove()},7e3)}handleKeydown(t){if(!this.ws||!this.player)return;const e=t.code,i=this.keyBindings;e===i.shoot?this.ws.send(Ti):e===i.layMine?this.ws.send(Ei):e===i.turnLeft?this.ws.send(bi):e===i.accelerate?(this.ws.send(vi),this.autoSlowdownActive&&(this.ws.send(Kt),this.autoSlowdownActive=!1)):e===i.turnRight?this.ws.send(wi):e===i.decelerate?(this.ws.send(Yt),this.autoSlowdownActive=!1):e===i.tankView?this.switchToTankView():e===i.pillboxView?this.switchToPillboxView():e==="KeyT"?this.openChat():e==="KeyR"&&this.openChat({team:!0})}handleKeyup(t){if(!this.ws||!this.player)return;const e=t.code,i=this.keyBindings;e===i.shoot?this.ws.send(Ci):e===i.layMine?this.ws.send(Si):e===i.turnLeft?this.ws.send(yi):e===i.accelerate?(this.ws.send(ki),i.autoSlowdown&&(this.ws.send(Yt),this.autoSlowdownActive=!0)):e===i.turnRight?this.ws.send(xi):e===i.decelerate&&(this.ws.send(Kt),this.autoSlowdownActive=!1)}handleChatKeydown(t){if(!(!this.ws||!this.player)){switch(t.which){case 13:this.commitChat();break;case 27:this.closeChat();break;default:return}t.preventDefault()}}buildOrder(t,e,i){!this.ws||!this.player||(e=e||0,this.ws.send([Mi,t,e,i.x,i.y].join(",")))}switchToPillboxView(){if(!this.player||!this.map)return;const t=this.map.pills.filter(e=>e&&!e.inTank&&!e.carried&&e.armour>0&&e.team===this.player.team);t.length!==0&&(this.viewMode==="tank"?(this.viewMode="pillbox",this.currentPillboxIndex=0):this.currentPillboxIndex=(this.currentPillboxIndex+1)%t.length)}switchToTankView(){this.viewMode="tank",this.currentPillboxIndex=0}getViewTarget(){if(this.viewMode==="tank"||!this.player||!this.map)return null;const t=this.map.pills.filter(e=>e&&!e.inTank&&!e.carried&&e.armour>0&&e.team===this.player.team);return t.length===0||this.currentPillboxIndex>=t.length?(this.viewMode="tank",null):t[this.currentPillboxIndex]}handleMessage(t){let e=null;if(t.data.charAt(0)==="{")try{this.handleJsonCommand(JSON.parse(t.data))}catch(i){e=i}else if(t.data.charAt(0)==="[")try{const i=JSON.parse(t.data);for(const s of i)this.handleJsonCommand(s)}catch(i){e=i}else{this.netRestore();try{const i=yt(t.data);let s=0;const n=i.length;for(this.processingServerMessages=!0,this.objectsCreatedInThisPacket.clear();s<n;){const r=i[s++],l=this.handleBinaryCommand(r,i,s);s+=l}this.processingServerMessages=!1,s!==n&&(e=new Error(`Message length mismatch, processed ${s} out of ${n} bytes`))}catch(i){e=i}}if(e)throw this.failure("Connection lost (protocol error)"),console&&console.log("Following exception occurred while processing message:",t.data),e}handleBinaryCommand(t,e,i){switch(t){case ai:return this.synchronized(),0;case hi:{const[[s],n]=G("H",e,i);return this.receiveWelcome(this.objects[s]),n}case ci:return this.netSpawn(e,i);case di:return this.netDestroy(e,i);case ui:{const[[s,n,r,l,o],h]=G("BBBBf",e,i),p=String.fromCharCode(r),c=this.map.cells[n][s];return c.setType(p,o),c.life=l,h}case gi:{const[[s,n,r,l],o]=G("BHHH",e,i);return this.renderer.playSound(s,n,r,this.objects[l]),o}case fi:{const[[s],n]=G("H",e,i),r=this.objects[s],l=!this._isSynchronized||r&&r._createdViaMessage,o=r&&r.load?r.load(e,i+n,l):0;return r&&this.objectsCreatedInThisPacket.add(r),r&&r._createdViaMessage&&delete r._createdViaMessage,n+o}case pi:return this.netTick(e,i,this.objectsCreatedInThisPacket);case mi:{const[s,n]=G("HHHHHH",e,i);return this.teamScores=s.map(r=>r/100),n}default:throw new Error(`Bad command '${t}' from server, at offset ${i-1}`)}}handleJsonCommand(t){switch(t.command){case"nick":this.objects[t.idx]&&(this.objects[t.idx].name=t.nick);break;case"msg":this.objects[t.idx]&&this.receiveChat(this.objects[t.idx],t.text);break;case"teamMsg":this.objects[t.idx]&&this.receiveChat(this.objects[t.idx],t.text,{team:!0});break;default:throw new Error(`Bad JSON command '${t.command}' from server.`)}}rebuildMapObjects(){this.map.pills=[],this.map.bases=[];for(const t of this.objects){if(t instanceof st)this.map.pills.push(t);else if(t instanceof nt)this.map.bases.push(t);else continue;t.cell&&t.cell.retile()}}netRestore(){super.netRestore();for(const t in this.mapChanges){const e=this.mapChanges[t];e.setType(e._net_oldType,e._net_hadMine),e.life=e._net_oldLife}this.mapChanges={}}}St(It.prototype,Mt);Hi.registerWithWorld(It.prototype);const Pi=location.search==="?local"||location.hostname.split(".")[1]==="github"?Ht:It;window.addEventListener("load",function(){const a=new Pi;window.world=a,a.start()});
