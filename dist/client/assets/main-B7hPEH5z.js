(function(){const e=document.createElement("link").relList;if(e&&e.supports&&e.supports("modulepreload"))return;for(const i of document.querySelectorAll('link[rel="modulepreload"]'))s(i);new MutationObserver(i=>{for(const n of i)if(n.type==="childList")for(const r of n.addedNodes)r.tagName==="LINK"&&r.rel==="modulepreload"&&s(r)}).observe(document,{childList:!0,subtree:!0});function t(i){const n={};return i.integrity&&(n.integrity=i.integrity),i.referrerPolicy&&(n.referrerPolicy=i.referrerPolicy),i.crossOrigin==="use-credentials"?n.credentials="include":i.crossOrigin==="anonymous"?n.credentials="omit":n.credentials="same-origin",n}function s(i){if(i.ep)return;i.ep=!0;const n=t(i);fetch(i.href,n)}})();const q=class q{constructor(){this.objects=[],this.tanks=[]}registerType(e){const t=this.constructor.types.length;this.constructor.types.push(e),this.constructor.typesByName.set(e.name,t)}insert(e){e.idx=this.objects.length,this.objects.push(e)}tick(){for(const e of this.objects)e&&e.tick&&e.tick()}spawn(e,...t){const s=new e(this);return this.insert(s),s.spawn&&typeof s.spawn=="function"&&s.spawn(...t),s.anySpawn&&typeof s.anySpawn=="function"&&s.anySpawn(),s.constructor.name==="Tank"&&this.tanks.push(s),s}destroy(e){const t=this.objects.indexOf(e);t!==-1&&this.objects.splice(t,1);const s=this.tanks.indexOf(e);s!==-1&&this.tanks.splice(s,1),e.destroy&&e.destroy()}};q.types=[],q.typesByName=new Map;let fe=q;const A=8,g=32,w=g*A,k=256,$e=k*g,rt=20,{round:Pe,floor:ot,min:lt}=Math,R=[{ascii:"|",description:"building"},{ascii:" ",description:"river"},{ascii:"~",description:"swamp"},{ascii:"%",description:"crater"},{ascii:"=",description:"road"},{ascii:"#",description:"forest"},{ascii:":",description:"rubble"},{ascii:".",description:"grass"},{ascii:"}",description:"shot building"},{ascii:"b",description:"river with boat"},{ascii:"^",description:"deep sea"}];function at(){for(const a of R)R[a.ascii]=a}at();class ge{constructor(e,t,s,i){this.map=e,this.x=t,this.y=s,this.type=R["^"],this.mine=this.isEdgeCell(),this.idx=s*k+t}neigh(e,t){return this.map.cellAtTile(this.x+e,this.y+t)}isType(...e){for(let t=0;t<arguments.length;t++){const s=arguments[t];if(this.type===s||this.type.ascii===s)return!0}return!1}isEdgeCell(){return this.x<=20||this.x>=236||this.y<=20||this.y>=236}getNumericType(){if(this.type.ascii==="^")return-1;let e=R.indexOf(this.type);return this.mine&&(e+=8),e}setType(e,t,s){if(s=s??1,this.type,this.mine,t!==void 0&&(this.mine=t),typeof e=="string"){if(this.type=R[e],e.length!==1||!this.type)throw new Error(`Invalid terrain type: ${e}`)}else if(typeof e=="number"){if(e>=10?(e-=8,this.mine=!0):this.mine=!1,this.type=R[e],!this.type)throw new Error(`Invalid terrain type: ${e}`)}else e!==null&&(this.type=e);this.isEdgeCell()&&(this.mine=!0),s>=0&&this.map.retile(this.x-s,this.y-s,this.x+s,this.y+s)}setTile(e,t){this.mine&&!this.pill&&!this.base&&(t+=10),this.map.view.onRetile(this,e,t)}retile(){if(this.pill)this.setTile(this.pill.armour,2);else if(this.base)this.setTile(16,0);else switch(this.type.ascii){case"^":this.retileDeepSea();break;case"|":this.retileBuilding();break;case" ":this.retileRiver();break;case"~":this.setTile(7,1);break;case"%":this.setTile(5,1);break;case"=":this.retileRoad();break;case"#":this.retileForest();break;case":":this.setTile(4,1);break;case".":this.setTile(2,1);break;case"}":this.setTile(8,1);break;case"b":this.retileBoat();break}}retileDeepSea(){const e=(u,c)=>{const f=this.neigh(u,c);return f.isType("^")?"d":f.isType(" ","b")?"w":"l"},t=e(0,-1),s=e(1,-1),i=e(1,0),n=e(1,1),r=e(0,1),l=e(-1,1),o=e(-1,0);e(-1,-1)!=="d"&&t!=="d"&&o!=="d"&&i==="d"&&r==="d"?this.setTile(10,3):s!=="d"&&t!=="d"&&i!=="d"&&o==="d"&&r==="d"?this.setTile(11,3):n!=="d"&&r!=="d"&&i!=="d"&&o==="d"&&t==="d"?this.setTile(13,3):l!=="d"&&r!=="d"&&o!=="d"&&i==="d"&&t==="d"?this.setTile(12,3):o==="w"&&i==="d"?this.setTile(14,3):r==="w"&&t==="d"?this.setTile(15,3):t==="w"&&r==="d"?this.setTile(16,3):i==="w"&&o==="d"?this.setTile(17,3):this.setTile(0,0)}retileBuilding(){const e=(u,c)=>this.neigh(u,c).isType("|","}")?"b":"o",t=e(0,-1),s=e(1,-1),i=e(1,0),n=e(1,1),r=e(0,1),l=e(-1,1),o=e(-1,0),h=e(-1,-1);h==="b"&&t==="b"&&s==="b"&&o==="b"&&i==="b"&&l==="b"&&r==="b"&&n==="b"?this.setTile(17,1):i==="b"&&t==="b"&&r==="b"&&o==="b"&&s!=="b"&&h!=="b"&&n!=="b"&&l!=="b"?this.setTile(30,1):i==="b"&&t==="b"&&r==="b"&&o==="b"&&s!=="b"&&h!=="b"&&n!=="b"&&l==="b"?this.setTile(22,2):i==="b"&&t==="b"&&r==="b"&&o==="b"&&s!=="b"&&h==="b"&&n!=="b"&&l!=="b"?this.setTile(23,2):i==="b"&&t==="b"&&r==="b"&&o==="b"&&s!=="b"&&h!=="b"&&n==="b"&&l!=="b"?this.setTile(24,2):i==="b"&&t==="b"&&r==="b"&&o==="b"&&s==="b"&&h!=="b"&&n!=="b"&&l!=="b"?this.setTile(25,2):h==="b"&&t==="b"&&o==="b"&&i==="b"&&l==="b"&&r==="b"&&n==="b"?this.setTile(16,2):t==="b"&&s==="b"&&o==="b"&&i==="b"&&l==="b"&&r==="b"&&n==="b"?this.setTile(17,2):h==="b"&&t==="b"&&s==="b"&&o==="b"&&i==="b"&&l==="b"&&r==="b"?this.setTile(18,2):h==="b"&&t==="b"&&s==="b"&&o==="b"&&i==="b"&&r==="b"&&n==="b"?this.setTile(19,2):o==="b"&&i==="b"&&t==="b"&&r==="b"&&s==="b"&&l==="b"&&h!=="b"&&n!=="b"?this.setTile(20,2):o==="b"&&i==="b"&&t==="b"&&r==="b"&&n==="b"&&h==="b"&&s!=="b"&&l!=="b"?this.setTile(21,2):t==="b"&&o==="b"&&i==="b"&&r==="b"&&n==="b"&&s==="b"?this.setTile(8,2):t==="b"&&o==="b"&&i==="b"&&r==="b"&&l==="b"&&h==="b"?this.setTile(9,2):t==="b"&&o==="b"&&i==="b"&&r==="b"&&l==="b"&&n==="b"?this.setTile(10,2):t==="b"&&o==="b"&&i==="b"&&r==="b"&&h==="b"&&s==="b"?this.setTile(11,2):t==="b"&&r==="b"&&o==="b"&&i!=="b"&&l==="b"&&h!=="b"?this.setTile(12,2):t==="b"&&r==="b"&&i==="b"&&n==="b"&&o!=="b"&&s!=="b"?this.setTile(13,2):t==="b"&&r==="b"&&i==="b"&&s==="b"&&n!=="b"?this.setTile(14,2):t==="b"&&r==="b"&&o==="b"&&h==="b"&&l!=="b"?this.setTile(15,2):i==="b"&&t==="b"&&o==="b"&&r!=="b"&&h!=="b"&&s!=="b"?this.setTile(26,1):i==="b"&&r==="b"&&o==="b"&&l!=="b"&&n!=="b"?this.setTile(27,1):i==="b"&&t==="b"&&r==="b"&&s!=="b"&&n!=="b"?this.setTile(28,1):r==="b"&&t==="b"&&o==="b"&&h!=="b"&&l!=="b"?this.setTile(29,1):o==="b"&&i==="b"&&t==="b"&&s==="b"&&h!=="b"?this.setTile(4,2):o==="b"&&i==="b"&&t==="b"&&h==="b"&&s!=="b"?this.setTile(5,2):o==="b"&&i==="b"&&r==="b"&&l==="b"&&n!=="b"?this.setTile(6,2):o==="b"&&i==="b"&&r==="b"&&t!=="b"&&n==="b"&&l!=="b"?this.setTile(7,2):i==="b"&&t==="b"&&r==="b"?this.setTile(0,2):o==="b"&&t==="b"&&r==="b"?this.setTile(1,2):i==="b"&&o==="b"&&r==="b"?this.setTile(2,2):i==="b"&&t==="b"&&o==="b"?this.setTile(3,2):i==="b"&&r==="b"&&n==="b"?this.setTile(18,1):o==="b"&&r==="b"&&l==="b"?this.setTile(19,1):i==="b"&&t==="b"&&s==="b"?this.setTile(20,1):o==="b"&&t==="b"&&h==="b"?this.setTile(21,1):i==="b"&&r==="b"?this.setTile(22,1):o==="b"&&r==="b"?this.setTile(23,1):i==="b"&&t==="b"?this.setTile(24,1):o==="b"&&t==="b"?this.setTile(25,1):o==="b"&&i==="b"?this.setTile(11,1):t==="b"&&r==="b"?this.setTile(12,1):i==="b"?this.setTile(13,1):o==="b"?this.setTile(14,1):r==="b"?this.setTile(15,1):t==="b"?this.setTile(16,1):this.setTile(6,1)}retileRiver(){const e=(r,l)=>{const o=this.neigh(r,l);return o.isType("=")?"r":o.isType("^"," ","b")?"w":"l"},t=e(0,-1),s=e(1,0),i=e(0,1),n=e(-1,0);t==="l"&&i==="l"&&s==="l"&&n==="l"?this.setTile(30,2):t==="l"&&i==="l"&&s==="w"&&n==="l"?this.setTile(26,2):t==="l"&&i==="l"&&s==="l"&&n==="w"?this.setTile(27,2):t==="l"&&i==="w"&&s==="l"&&n==="l"?this.setTile(28,2):t==="w"&&i==="l"&&s==="l"&&n==="l"?this.setTile(29,2):t==="l"&&n==="l"?this.setTile(6,3):t==="l"&&s==="l"?this.setTile(7,3):i==="l"&&n==="l"?this.setTile(8,3):i==="l"&&s==="l"?this.setTile(9,3):i==="l"&&t==="l"&&i==="l"?this.setTile(0,3):n==="l"&&s==="l"?this.setTile(1,3):n==="l"?this.setTile(2,3):i==="l"?this.setTile(3,3):s==="l"?this.setTile(4,3):t==="l"?this.setTile(5,3):this.setTile(1,0)}retileRoad(){const e=(u,c)=>{const f=this.neigh(u,c);return f.isType("=")?"r":f.isType("^"," ","b")?"w":"l"},t=e(0,-1),s=e(1,-1),i=e(1,0),n=e(1,1),r=e(0,1),l=e(-1,1),o=e(-1,0),h=e(-1,-1);h!=="r"&&t==="r"&&s!=="r"&&o==="r"&&i==="r"&&l!=="r"&&r==="r"&&n!=="r"?this.setTile(11,0):t==="r"&&o==="r"&&i==="r"&&r==="r"?this.setTile(10,0):o==="w"&&i==="w"&&t==="w"&&r==="w"?this.setTile(26,0):i==="r"&&r==="r"&&o==="w"&&t==="w"?this.setTile(20,0):o==="r"&&r==="r"&&i==="w"&&t==="w"?this.setTile(21,0):t==="r"&&o==="r"&&r==="w"&&i==="w"?this.setTile(22,0):i==="r"&&t==="r"&&o==="w"&&r==="w"?this.setTile(23,0):t==="w"&&r==="w"?this.setTile(24,0):o==="w"&&i==="w"?this.setTile(25,0):t==="w"&&r==="r"?this.setTile(16,0):i==="w"&&o==="r"?this.setTile(17,0):r==="w"&&t==="r"?this.setTile(18,0):o==="w"&&i==="r"?this.setTile(19,0):i==="r"&&r==="r"&&t==="r"&&(s==="r"||n==="r")?this.setTile(27,0):o==="r"&&i==="r"&&r==="r"&&(l==="r"||n==="r")?this.setTile(28,0):o==="r"&&t==="r"&&r==="r"&&(l==="r"||h==="r")?this.setTile(29,0):o==="r"&&i==="r"&&t==="r"&&(s==="r"||h==="r")?this.setTile(30,0):o==="r"&&i==="r"&&r==="r"?this.setTile(12,0):o==="r"&&t==="r"&&r==="r"?this.setTile(13,0):o==="r"&&i==="r"&&t==="r"?this.setTile(14,0):i==="r"&&t==="r"&&r==="r"?this.setTile(15,0):r==="r"&&i==="r"&&n==="r"?this.setTile(6,0):r==="r"&&o==="r"&&l==="r"?this.setTile(7,0):t==="r"&&o==="r"&&h==="r"?this.setTile(8,0):t==="r"&&i==="r"&&s==="r"?this.setTile(9,0):r==="r"&&i==="r"?this.setTile(2,0):r==="r"&&o==="r"?this.setTile(3,0):t==="r"&&o==="r"?this.setTile(4,0):t==="r"&&i==="r"?this.setTile(5,0):i==="r"||o==="r"?this.setTile(0,1):t==="r"||r==="r"?this.setTile(1,1):this.setTile(10,0)}retileForest(){const e=this.neigh(0,-1).isType("#"),t=this.neigh(1,0).isType("#"),s=this.neigh(0,1).isType("#"),i=this.neigh(-1,0).isType("#");!e&&!i&&t&&s?this.setTile(9,9):!e&&i&&!t&&s?this.setTile(10,9):e&&i&&!t&&!s?this.setTile(11,9):e&&!i&&t&&!s?this.setTile(12,9):e&&!i&&!t&&!s?this.setTile(16,9):!e&&!i&&!t&&s?this.setTile(15,9):!e&&i&&!t&&!s?this.setTile(14,9):!e&&!i&&t&&!s?this.setTile(13,9):!e&&!i&&!t&&!s?this.setTile(8,9):this.setTile(3,1)}retileBoat(){const e=(r,l)=>this.neigh(r,l).isType("^"," ","b")?"w":"l",t=e(0,-1),s=e(1,0),i=e(0,1),n=e(-1,0);t!=="w"&&n!=="w"?this.setTile(15,6):t!=="w"&&s!=="w"?this.setTile(16,6):i!=="w"&&s!=="w"?this.setTile(17,6):i!=="w"&&n!=="w"?this.setTile(14,6):n!=="w"?this.setTile(12,6):s!=="w"?this.setTile(13,6):i!=="w"?this.setTile(10,6):this.setTile(11,6)}}class ht{onRetile(e,t,s){}}class ye{constructor(e){this.x=0,this.y=0,this.map=e,this.cell=e.cells[this.y][this.x]}}class Me extends ye{constructor(e,t,s,i,n,r){super(e),this.x=t,this.y=s,this.owner_idx=i,this.armour=n,this.speed=r,this.cell=e.cells[this.y][this.x]}}class Re extends ye{constructor(e,t,s,i,n,r,l){super(e),this.x=t,this.y=s,this.owner_idx=i,this.armour=n,this.shells=r,this.mines=l,this.cell=e.cells[this.y][this.x]}}class _e extends ye{constructor(e,t,s,i){super(e),this.x=t,this.y=s,this.direction=i,this.cell=e.cells[this.y][this.x]}}var H;let ct=(H=class{constructor(){this.CellClass=ge,this.PillboxClass=Me,this.BaseClass=Re,this.StartClass=_e,this.pills=[],this.bases=[],this.starts=[],this.cells=[],this.view=new ht,this.cells=new Array(k);for(let e=0;e<k;e++){const t=this.cells[e]=new Array(k);for(let s=0;s<k;s++)t[s]=new this.CellClass(this,s,e)}}setView(e){this.view=e,this.retile()}cellAtTile(e,t){var i;const s=(i=this.cells[t])==null?void 0:i[e];return s||new this.CellClass(this,e,t,{isDummy:!0})}each(e,t,s,i,n){const r=t!==void 0&&t>=0?t:0,l=s!==void 0&&s>=0?s:0,o=i!==void 0&&i<k?i:k-1,h=n!==void 0&&n<k?n:k-1;for(let u=l;u<=h;u++){const c=this.cells[u];for(let f=r;f<=o;f++)e.call(c[f],c[f])}return this}clear(e,t,s,i){this.each(function(){this.type=R["^"],this.mine=this.isEdgeCell()},e,t,s,i)}retile(e,t,s,i){this.each(function(){this.retile()},e,t,s,i)}findCenterCell(){let e=k-1,t=k-1,s=0,i=0;this.each(function(l){t>l.x&&(t=l.x),i<l.x&&(i=l.x),e>l.y&&(e=l.y),s<l.y&&(s=l.y)}),t>i&&(e=t=0,s=i=k-1);const n=Pe(t+(i-t)/2),r=Pe(e+(s-e)/2);return this.cellAtTile(n,r)}dump(e){e=e||{};const t=(p,C)=>{let b=null,T=null,x=0;for(let P=0;P<p.length;P++){const B=p[P].getNumericType();if(b===B){x++;continue}b!==null&&C(b,x,T),b=B,T=P,x=1}b!==null&&C(b,x,T)},s=p=>{const C=[];let b=null;for(let T=0;T<p.length;T++){let x=p[T]&15;T%2===0?b=x<<4:(C.push(b+x),b=null)}return b!==null&&C.push(b),C},i=e.noPills?[]:this.pills,n=e.noBases?[]:this.bases,r=e.noStarts?[]:this.starts;let l=[];for(const p of"BMAPBOLO")l.push(p.charCodeAt(0));l.push(1,i.length,n.length,r.length);for(const p of i)l.push(p.x,p.y,p.owner_idx,p.armour,p.speed);for(const p of n)l.push(p.x,p.y,p.owner_idx,p.armour,p.shells,p.mines);for(const p of r)l.push(p.x,p.y,p.direction);let o=null,h=null,u=0,c=0,f=0;const d=()=>{if(!o)return;y();const p=s(o);l.push(p.length+4,f,u,c),l=l.concat(p),o=null},m=p=>{251*2-o.length<p&&(d(),o=[],u=c)},y=()=>{if(!h)return;const p=h;h=null,m(p.length+1),o.push(p.length-1),o=o.concat(p),c+=p.length};for(const p of this.cells)f=p[0].y,o=null,u=c=0,h=null,t(p,(C,b,T)=>{if(C===-1){d();return}if(o||(o=[],u=c=T),b>2)for(y();b>2;){m(2);const x=lt(b,9);o.push(x+6,C),c+=x,b-=x}for(;b>0;)h||(h=[]),h.push(C),h.length===8&&y(),b--});return d(),l.push(4,255,255,255),l}static load(e){let t=0;const s=(d,m)=>{let y;try{y=[];for(let p=t;p<t+d;p++)y.push(e[p])}catch{throw new Error(m)}return t+=d,y},i=s(8,"Not a Bolo map.");for(let d=0;d<8;d++)if("BMAPBOLO"[d].charCodeAt(0)!==i[d])throw new Error("Not a Bolo map.");const[n,r,l,o]=s(4,"Incomplete header");if(n!==1)throw new Error(`Unsupported map version: ${n}`);const h=new this,u=[];for(let d=0;d<r;d++)u.push(s(5,"Incomplete pillbox data"));const c=[];for(let d=0;d<l;d++)c.push(s(6,"Incomplete base data"));const f=[];for(let d=0;d<o;d++)f.push(s(3,"Incomplete player start data"));for(;;){const[d,m,y,p]=s(4,"Incomplete map data"),C=d-4;if(C===0&&m===255&&y===255&&p===255)break;const b=s(C,"Incomplete map data");let T=0;const x=()=>{const M=ot(T),B=M===T?(b[M]&240)>>4:b[M]&15;return T+=.5,B};let P=y;for(;P<p;){const M=x();if(M<8)for(let B=1;B<=M+1;B++)h.cellAtTile(P++,m).setType(x(),void 0,-1);else{const B=x();for(let He=1;He<=M-6;He++)h.cellAtTile(P++,m).setType(B,void 0,-1)}}}return h.pills=u.map(d=>new h.PillboxClass(h,...d)),h.bases=c.map(d=>new h.BaseClass(h,...d)),h.starts=f.map(([d,m,y])=>new h.StartClass(h,d,m,y)),h}},H.CellClass=ge,H.PillboxClass=Me,H.BaseClass=Re,H.StartClass=_e,H);const Ye=0,Je=1,qe=2,Ze=3,j=4,et=5,we=6,xe=7,Te=8,D=9,ke=10,ve=11,{sqrt:dt,atan2:ut}=Math;function Ce(a,e){for(const t in e)Object.prototype.hasOwnProperty.call(e,t)&&(a[t]=e[t]);return a}function v(a,e){const t=a.x-e.x,s=a.y-e.y;return dt(t*t+s*s)}function Y(a,e){return ut(e.y-a.y,e.x-a.x)}class tt{constructor(){this.events=new Map}on(e,t){return this.events.has(e)||this.events.set(e,[]),this.events.get(e).push(t),this}once(e,t){const s=(...i)=>{this.off(e,s),t.apply(this,i)};return this.on(e,s)}off(e,t){const s=this.events.get(e);if(s){const i=s.indexOf(t);i!==-1&&s.splice(i,1),s.length===0&&this.events.delete(e)}return this}emit(e,...t){const s=this.events.get(e);return s?(s.slice().forEach(i=>i.apply(this,t)),!0):!1}removeAllListeners(e){return e?this.events.delete(e):this.events.clear(),this}}class pt extends tt{constructor(e){super(),this.idx=-1,this.x=null,this.y=null,this.world=e}destroy(){}tick(){}}function ft(a){return[a&255]}function gt(a){return[(a&65280)>>8,a&255]}function mt(a){return[(a&4278190080)>>>24,(a&16711680)>>16,(a&65280)>>8,a&255]}function bt(a,e){return a[e]}function yt(a,e){return(a[e]<<8)+a[e+1]}function wt(a,e){return(a[e]<<24)+(a[e+1]<<16)+(a[e+2]<<8)+a[e+3]}function xt(){let a=[],e=null,t=0;const s=()=>{e!==null&&(a.push(e),e=null)},i=(n,r)=>{if(n==="f")e===null?(e=r?1:0,t=1):(r&&(e|=1<<t),t++,t===8&&s());else{s();const l=r;let o;switch(n){case"B":o=ft(l);break;case"H":o=gt(l);break;case"I":o=mt(l);break;default:throw new Error(`Unknown format character ${n}`)}a=a.concat(o)}};return i.finish=()=>(s(),a),i}function st(a,e=0){let t=e,s=0;const i=n=>{let r;if(n==="f")r=(1<<s&a[t])>0,s++,s===8&&(t++,s=0);else{s!==0&&(t++,s=0);let l;switch(n){case"B":r=bt(a,t),l=1;break;case"H":r=yt(a,t),l=2;break;case"I":r=wt(a,t),l=4;break;default:throw new Error(`Unknown format character ${n}`)}t+=l}return r};return i.finish=()=>(s!==0&&t++,t-e),i}function G(a,e,t){const s=st(e,t),i=[];for(const n of a)i.push(s(n));return[i,s.finish()]}class Tt extends pt{constructor(e){super(e),this._net_type_idx=0}ref(e,t){this[e]=t?{$:t}:null}tick(){this.update&&this.update()}dump(e=!1){if(!this.serialization)return[];const t=xt();return this.serialization(e,(s,i,n)=>{let r=this[i];if(n!=null&&n.tx&&(r=n.tx(r)),s==="O"){const l=r==null?void 0:r.$,o=(l==null?void 0:l.idx)??65535;t("H",o)}else t(s,r)}),t.finish()}load(e,t,s=!1){if(!this.serialization)return 0;const i=st(e,t),n={};return this.serialization(s,(r,l,o)=>{let h;if(r==="O"){const c=i("H");if(c===65535)h=null;else{const f=this.world.objects[c];h=f?{$:f}:null}}else h=i(r);o!=null&&o.rx&&(h=o.rx(h));const u=Object.getOwnPropertyDescriptor(Object.getPrototypeOf(this),l);u&&u.set?u.set.call(this,h):this[l]=h,n[l]=h}),this.emit&&this.emit("netUpdate",n),i.finish()}}class $ extends Tt{constructor(){super(...arguments),this.styled=null,this.x=null,this.y=null}soundEffect(e){this.world.soundEffect(e,this.x,this.y,this)}getTile(){}}const{floor:kt}=Math;class L extends ${constructor(){super(...arguments),this.styled=!1,this.lifespan=0}serialization(e,t){e&&(t("H","x"),t("H","y")),t("B","lifespan")}getTile(){switch(kt(this.lifespan/3)){case 7:return[20,3];case 6:return[21,3];case 5:return[20,4];case 4:return[21,4];case 3:return[20,5];case 2:return[21,5];case 1:return[18,4];default:return[19,4]}}spawn(e,t){this.x=e,this.y=t,this.lifespan=23}update(){this.lifespan--===0&&this.world.destroy&&this.world.destroy(this)}}class E extends ${constructor(){super(...arguments),this.styled=null,this.lifespan=0}serialization(e,t){e&&(t("H","x"),t("H","y")),t("B","lifespan")}spawn(e){[this.x,this.y]=e.getWorldCoordinates(),this.lifespan=10}anySpawn(){this.cell=this.world.map.cellAtWorld(this.x,this.y)}update(){this.lifespan--===0&&this.world.spawn&&this.world.destroy&&(this.cell&&this.cell.mine&&this.asplode(),this.world.destroy(this))}asplode(){var e;this.cell.setType(null,!1,0),this.cell.takeExplosionHit();for(const t of this.world.tanks){t.armour!==255&&v(this,t)<384&&t.takeMineHit();const s=(e=t.builder)==null?void 0:e.$;if(s){const{inTank:i,parachuting:n}=s.states;s.order!==i&&s.order!==n&&v(this,s)<w/2&&s.kill()}}this.world.spawn&&this.world.spawn(L,this.x,this.y),this.soundEffect(xe),this.spread()}spread(){if(!this.world.spawn)return;let e=this.cell.neigh(1,0);e.isEdgeCell()||this.world.spawn(E,e),e=this.cell.neigh(0,1),e.isEdgeCell()||this.world.spawn(E,e),e=this.cell.neigh(-1,0),e.isEdgeCell()||this.world.spawn(E,e),e=this.cell.neigh(0,-1),e.isEdgeCell()||this.world.spawn(E,e)}}const{round:ie,cos:vt,sin:Ct,PI:At}=Math;class ee extends ${constructor(e){super(e),this.updatePriority=20,this.styled=!1,this.direction=0,this.lifespan=0,this.onWater=!1,this.on("netSync",()=>{this.updateCell()})}serialization(e,t){e&&(t("B","direction"),t("O","owner"),t("O","attribution"),t("f","onWater")),t("H","x"),t("H","y"),t("B","lifespan")}updateCell(){this.cell=this.world.map.cellAtWorld(this.x,this.y)}getDirection16th(){return ie((this.direction-1)/16)%16}getTile(){return[this.getDirection16th(),4]}spawn(e,t){var s;t=t||{},this.ref("owner",e),this.owner.$.hasOwnProperty("owner_idx")?this.ref("attribution",(s=this.owner.$.owner)==null?void 0:s.$):this.ref("attribution",this.owner.$),this.direction=t.direction||this.owner.$.direction,this.lifespan=(t.range||7)*w/32-2,this.onWater=t.onWater||!1,this.x=this.owner.$.x,this.y=this.owner.$.y,this.move()}update(){this.move();const e=this.collide();if(e){const[t,s]=e,i=s.takeShellHit(this);let n,r;t==="cell"?([n,r]=this.cell.getWorldCoordinates(),this.world.soundEffect(i,n,r)):(n=this.x,r=this.y,s.soundEffect(i)),this.asplode(n,r,t)}else this.lifespan--===0&&this.asplode(this.x,this.y,"eol")}move(){this.radians||(this.radians=(256-this.direction)*2*At/256),this.x=this.x+ie(vt(this.radians)*32),this.y=this.y+ie(Ct(this.radians)*32),this.updateCell()}collide(){var s,i,n,r,l;const e=this.cell.pill;if(e&&e.armour>0&&e!==((s=this.owner)==null?void 0:s.$)){const[o,h]=this.cell.getWorldCoordinates();if(v(this,{x:o,y:h})<=127)return["cell",e]}for(const o of this.world.tanks)if(o!==((i=this.owner)==null?void 0:i.$)&&o.armour!==255&&v(this,o)<=127)return["tank",o];if(((n=this.attribution)==null?void 0:n.$)===((r=this.owner)==null?void 0:r.$)){const o=this.cell.base;if(o&&o.armour>4&&(this.onWater||o!=null&&o.owner&&!o.owner.$.isAlly((l=this.attribution)==null?void 0:l.$)))return["cell",o]}return(this.onWater?!this.cell.isType("^"," ","%"):this.cell.isType("|","}","#","b"))?["cell",this.cell]:null}asplode(e,t,s){var i;for(const n of this.world.tanks){const r=(i=n.builder)==null?void 0:i.$;if(r){const{inTank:l,parachuting:o}=r.states;r.order!==l&&r.order!==o&&(s==="cell"?r.cell===this.cell&&r.kill():v(this,r)<w/2&&r.kill())}}this.world.spawn&&this.world.destroy&&(this.world.spawn(L,e,t),this.world.spawn(E,this.cell),this.world.destroy(this))}}const{min:K,max:ne,round:re,ceil:oe,PI:Oe,cos:St,sin:Et}=Math;class te extends ${constructor(e,t,s,i,n,r){super(arguments.length===1?e:null),this.team=255,this.styled=!0,this.owner_idx=255,this.armour=0,this.speed=0,this.coolDown=0,this.reload=0,this.inTank=!1,this.carried=!1,this.haveTarget=!1,this.cell=null,arguments.length>1&&(this.map=e,this.x=(t+.5)*w,this.y=(s+.5)*w,this.owner_idx=i,this.armour=n,this.speed=r),this.on("netUpdate",l=>{var o,h;(l.hasOwnProperty("x")||l.hasOwnProperty("y"))&&this.updateCell(),(l.hasOwnProperty("inTank")||l.hasOwnProperty("carried"))&&this.updateCell(),l.hasOwnProperty("owner")&&!l.hasOwnProperty("team")&&this.updateOwner(),l.hasOwnProperty("armour")&&((o=this.cell)==null||o.retile()),l.hasOwnProperty("team")&&((h=this.cell)==null||h.retile())})}updateCell(){this.cell&&(delete this.cell.pill,this.cell.retile()),this.inTank||this.carried?this.cell=null:(this.cell=this.world.map.cellAtWorld(this.x,this.y),this.cell.pill=this,this.cell.retile())}updateOwner(){var e;this.owner&&(this.owner_idx=this.owner.$.tank_idx,this.team=this.owner.$.team),(e=this.cell)==null||e.retile()}serialization(e,t){t("O","owner"),t("B","owner_idx"),t("B","team"),t("f","inTank"),t("f","carried"),t("f","haveTarget"),!this.inTank&&!this.carried?(t("H","x"),t("H","y")):this.x=this.y=null,t("B","armour"),t("B","speed"),t("B","coolDown"),t("B","reload")}getTile(){return this.armour===0?[18,0]:[16+this.armour,0]}placeAt(e){this.inTank=this.carried=!1,[this.x,this.y]=e.getWorldCoordinates(),this.updateCell(),this.reset()}spawn(){this.reset()}reset(){this.coolDown=32,this.reload=0}anySpawn(){this.updateCell()}update(){if(this.inTank||this.carried)return;if(this.armour===0){this.haveTarget=!1;for(const s of this.world.tanks)if(s.armour!==255&&s.cell===this.cell){this.inTank=!0,this.x=this.y=null,this.updateCell(),this.ref("owner",s),this.updateOwner();break}return}if(this.reload=K(this.speed,this.reload+1),--this.coolDown===0&&(this.coolDown=32,this.speed=K(100,this.speed+1)),this.reload<this.speed)return;let e=null,t=1/0;for(const s of this.world.tanks){const i=this.team===null||this.team===255?!0:s.team!==this.team;if(s.armour!==255&&i&&!s.hidden){const n=v(this,s);n<=2048&&n<t&&(e=s,t=n)}}if(!e){this.haveTarget=!1;return}if(this.haveTarget){const s=(256-e.getDirection16th()*16)*2*Oe/256,i=e.x+t/32*re(St(s)*oe(e.speed)),n=e.y+t/32*re(Et(s)*oe(e.speed)),r=256-Y(this,{x:i,y:n})*256/(2*Oe);this.world.spawn&&this.world.spawn(ee,this,{direction:r}),this.soundEffect(Te)}this.haveTarget=!0,this.reload=0}aggravate(){this.coolDown=32,this.speed=ne(6,re(this.speed/2))}takeShellHit(e){return this.aggravate(),this.armour=ne(0,this.armour-1),this.cell.retile(),D}takeExplosionHit(){this.armour=ne(0,this.armour-5),this.cell.retile()}repair(e){const t=K(e,oe((15-this.armour)/4));return this.armour=K(15,this.armour+t*4),this.cell.retile(),t}}const{min:Bt,max:It}=Math;class se extends ${constructor(e,t,s,i,n,r,l){super(arguments.length===1?e:null),this.owner_idx=255,this._team=255,this.styled=!0,this.armour=0,this.shells=0,this.mines=0,this.refuelCounter=0,arguments.length>1&&(this.map=e,this.x=(t+.5)*w,this.y=(s+.5)*w,this.owner_idx=i,this.armour=n,this.shells=r,this.mines=l,e.cellAtTile(t,s).setType("=",!1,-1)),this.on("netUpdate",o=>{var u,c;const h=((u=this.world)==null?void 0:u.map)||this.map;(o.hasOwnProperty("x")||o.hasOwnProperty("y"))&&this.x!=null&&this.y!=null&&h&&(this.cell=h.cellAtWorld(this.x,this.y),this.cell.base=this),o.hasOwnProperty("owner")&&!o.hasOwnProperty("team")&&this.updateOwner(),o.hasOwnProperty("team")&&((c=this.cell)==null||c.retile())})}get team(){return this._team}set team(e){this._team=e}serialization(e,t){e&&(t("H","x"),t("H","y")),t("O","owner"),t("B","owner_idx"),t("B","team"),t("O","refueling"),t("B","refuelCounter"),t("B","armour"),t("B","shells"),t("B","mines")}updateOwner(){var e;this.owner&&(this.owner_idx=this.owner.$.tank_idx,this.team=this.owner.$.team),(e=this.cell)==null||e.retile()}getTile(){return[16,0]}spawn(){}anySpawn(){this.cell=this.world.map.cellAtWorld(this.x,this.y),this.cell.base=this}update(){if(this.world.authority){const t=this.world.tanks.filter(s=>s.armour!==255).length/1e3;Math.random()<t&&(this.armour<90?this.armour++:this.shells<90?this.shells++:this.mines<90&&this.mines++)}if(this.refueling){const e=this.refueling.$.cell,t=this.refueling.$.armour;(e!==this.cell||t===255)&&this.ref("refueling",null)}if(!this.refueling){this.findSubject();return}if(--this.refuelCounter===0)if(this.armour>0&&this.refueling.$.armour<40){const e=Bt(5,this.armour,40-this.refueling.$.armour);this.refueling.$.armour+=e,this.armour-=e,this.refuelCounter=46}else this.shells>0&&this.refueling.$.shells<40?(this.refueling.$.shells+=1,this.shells-=1,this.refuelCounter=7):this.mines>0&&this.refueling.$.mines<40?(this.refueling.$.mines+=1,this.mines-=1,this.refuelCounter=7):this.refuelCounter=1}findSubject(){const e=this.world.tanks.filter(t=>t.armour!==255&&t.cell===this.cell);for(const t of e)if(this.team!==255&&t.team===this.team){this.ref("refueling",t),this.refuelCounter=46;break}else{let i=!0;for(const n of e)n!==t&&(t.isAlly(n)||(i=!1));if(i){this.ref("owner",t),this.updateOwner(),this.ref("refueling",t),this.refuelCounter=46;break}}}takeShellHit(e){var t;if(this.owner)for(const s of this.world.map.pills)!s.inTank&&!s.carried&&s.armour>0&&(t=s.owner)!=null&&t.$.isAlly(this.owner.$)&&v(this,s)<=2304&&s.aggravate();return this.armour=It(0,this.armour-5),D}}class W extends ${constructor(){super(...arguments),this.styled=null,this.lifespan=0,this.neighbours=[]}serialization(e,t){e&&(t("H","x"),t("H","y")),t("B","lifespan")}spawn(e){[this.x,this.y]=e.getWorldCoordinates(),this.lifespan=16}anySpawn(){this.cell=this.world.map.cellAtWorld(this.x,this.y),this.neighbours=[this.cell.neigh(1,0),this.cell.neigh(0,1),this.cell.neigh(-1,0),this.cell.neigh(0,-1)]}update(){this.lifespan--===0&&(this.flood(),this.world.destroy&&this.world.destroy(this))}canGetWet(){let e=!1;for(const t of this.neighbours)if(!t.base&&!t.pill&&t.isType(" ","^","b")){e=!0;break}return e}flood(){this.canGetWet()&&(this.cell.setType(" ",!1),this.spread())}spread(){if(this.world.spawn)for(const e of this.neighbours)!e.base&&!e.pill&&e.isType("%")&&this.world.spawn(W,e)}}const{round:Ht,random:$t,floor:F}=Math,Le={"|":{tankSpeed:0,tankTurn:0,manSpeed:0}," ":{tankSpeed:3,tankTurn:.25,manSpeed:0},"~":{tankSpeed:3,tankTurn:.25,manSpeed:4},"%":{tankSpeed:3,tankTurn:.25,manSpeed:4},"=":{tankSpeed:16,tankTurn:1,manSpeed:16},"#":{tankSpeed:6,tankTurn:.5,manSpeed:8},":":{tankSpeed:3,tankTurn:.25,manSpeed:4},".":{tankSpeed:12,tankTurn:1,manSpeed:16},"}":{tankSpeed:0,tankTurn:0,manSpeed:0},b:{tankSpeed:16,tankTurn:1,manSpeed:16},"^":{tankSpeed:3,tankTurn:.5,manSpeed:0}};function Pt(){for(const a in Le){const e=Le[a],t=R[a];for(const s in e)t[s]=e[s]}}Pt();class Mt extends ge{constructor(e,t,s,i){super(e,t,s,i),this.life=0}isObstacle(){var e;return((e=this.pill)==null?void 0:e.armour)>0||this.type.tankSpeed===0}hasTankOnBoat(){for(const e of this.map.world.tanks)if(e.armour!==255&&e.cell===this&&e.onBoat)return!0;return!1}getTankSpeed(e){var t,s;return((t=this.pill)==null?void 0:t.armour)>0||(s=this.base)!=null&&s.owner&&!this.base.owner.$.isAlly(e)&&this.base.armour>9?0:e.onBoat&&this.isType("^"," ")?16:this.type.tankSpeed}getTankTurn(e){var t,s;return((t=this.pill)==null?void 0:t.armour)>0||(s=this.base)!=null&&s.owner&&!this.base.owner.$.isAlly(e)&&this.base.armour>9?0:e.onBoat&&this.isType("^"," ")?1:this.type.tankTurn}getManSpeed(e){var s,i;const t=e.owner.$;return((s=this.pill)==null?void 0:s.armour)>0||(i=this.base)!=null&&i.owner&&!this.base.owner.$.isAlly(t)&&this.base.armour>9?0:this.type.manSpeed}getPixelCoordinates(){return[(this.x+.5)*g,(this.y+.5)*g]}getWorldCoordinates(){return[(this.x+.5)*w,(this.y+.5)*w]}setType(e,t,s){var l;const i=this.type,n=this.mine,r=this.life;super.setType(e,t,s),this.life=(()=>{switch(this.type.ascii){case".":return 5;case"}":return 5;case":":return 5;case"~":return 4;default:return 0}})(),(l=this.map.world)==null||l.mapChanged(this,i,n,r)}takeShellHit(e){var s,i;let t=D;if(this.isType(".","}",":","~"))if(--this.life===0){const n=(()=>{switch(this.type.ascii){case".":return"~";case"}":return":";case":":return" ";case"~":return" "}})();this.setType(n)}else(s=this.map.world)==null||s.mapChanged(this,this.type,this.mine);else if(this.isType("#"))this.setType("."),t=ke;else if(this.isType("="))(e.direction>=224||e.direction<32?this.neigh(1,0):e.direction>=32&&e.direction<96?this.neigh(0,-1):e.direction>=96&&e.direction<160?this.neigh(-1,0):this.neigh(0,1)).isType(" ","^")&&this.setType(" ");else{const n=(()=>{switch(this.type.ascii){case"|":return"}";case"b":return" "}})();this.setType(n)}return this.isType(" ")&&(i=this.map.world)!=null&&i.spawn&&this.map.world.spawn(W,this),t}takeExplosionHit(){var e;if(this.pill){this.pill.takeExplosionHit();return}if(this.isType("b"))this.setType(" ");else if(!this.isType(" ","^","b"))this.setType("%");else return;(e=this.map.world)!=null&&e.spawn&&this.map.world.spawn(W,this)}}class it extends ct{constructor(){super(),this.CellClass=Mt,this.PillboxClass=te,this.BaseClass=se;for(let e=0;e<this.cells.length;e++){const t=this.cells[e];for(let s=0;s<t.length;s++){const i=t[s],n=new this.CellClass(this,s,e);n.type=i.type,n.mine=i.mine,t[s]=n}}}static load(e){return super.load(e)}findCenterCell(){return super.findCenterCell()}cellAtTile(e,t){return super.cellAtTile(e,t)}cellAtPixel(e,t){return this.cellAtTile(F(e/g),F(t/g))}cellAtWorld(e,t){return this.cellAtTile(F(e/w),F(t/w))}getRandomStart(){return this.starts[Ht($t()*(this.starts.length-1))]}}const Rt=`Qk1BUEJPTE8BEAsQW5H/D2Vjbv8PZV90/w9lVHX/D2VwbP8PZYFr/w9lq27/D2WueP8PZa58/w9l
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
`).join(""),{round:V,floor:_t,ceil:Ne,min:le,cos:je,sin:We}=Math;class Ae extends ${constructor(e){super(e),this.styled=!0,this.team=null,this.states={inTank:0,waiting:1,returning:2,parachuting:3,actions:{_min:10,forest:10,road:11,repair:12,boat:13,building:14,pillbox:15,mine:16}},this.order=0,this.x=null,this.y=null,this.targetX=0,this.targetY=0,this.trees=0,this.hasMine=!1,this.waitTimer=0,this.animation=0,this.cell=null,this.on("netUpdate",t=>{(t.hasOwnProperty("x")||t.hasOwnProperty("y"))&&this.updateCell()})}updateCell(){this.x!=null&&this.y!=null?this.cell=this.world.map.cellAtWorld(this.x,this.y):this.cell=null}serialization(e,t){e&&(t("O","owner"),t("B","team")),t("B","order"),this.order===this.states.inTank?this.x=this.y=null:(t("H","x"),t("H","y"),t("H","targetX"),t("H","targetY"),t("B","trees"),t("O","pillbox"),t("f","hasMine")),this.order===this.states.waiting&&t("B","waitTimer")}getTile(){return this.order===this.states.parachuting?[16,1]:[17,_t(this.animation/3)]}performOrder(e,t,s){if(this.order!==this.states.inTank||!this.owner.$.onBoat&&this.owner.$.cell!==s&&this.owner.$.cell.getManSpeed(this)===0)return;let i=null;if(e==="mine"){if(this.owner.$.mines===0)return;t=0}else{if(this.owner.$.trees<t)return;if(e==="pillbox"){if(i=this.owner.$.getCarryingPillboxes().pop(),!i)return;i.inTank=!1,i.carried=!0}}this.trees=t,this.hasMine=e==="mine",this.ref("pillbox",i),this.hasMine&&this.owner.$.mines--,this.owner.$.trees-=t,this.order=this.states.actions[e],this.x=this.owner.$.x,this.y=this.owner.$.y,[this.targetX,this.targetY]=s.getWorldCoordinates(),this.updateCell()}kill(){if(!this.world.authority)return;this.soundEffect(et),this.order=this.states.parachuting,this.trees=0,this.hasMine=!1,this.pillbox&&(this.pillbox.$.placeAt(this.cell),this.ref("pillbox",null)),this.owner.$.armour===255?[this.targetX,this.targetY]=[this.x,this.y]:[this.targetX,this.targetY]=[this.owner.$.x,this.owner.$.y];const e=this.world.map.getRandomStart();[this.x,this.y]=e.cell.getWorldCoordinates()}spawn(e){this.ref("owner",e),this.order=this.states.inTank}anySpawn(){this.owner&&this.owner.$&&(this.team=this.owner.$.team),this.animation=0}update(){if(this.order!==this.states.inTank&&!(!this.owner||!this.owner.$))switch(this.animation=(this.animation+1)%9,this.order){case this.states.waiting:this.waitTimer--===0&&(this.order=this.states.returning);break;case this.states.parachuting:this.parachutingIn({x:this.targetX,y:this.targetY});break;case this.states.returning:this.owner.$.armour!==255&&this.move(this.owner.$,128,160);break;default:this.move({x:this.targetX,y:this.targetY},16,144)}}move(e,t,s){let i=this.cell.getManSpeed(this),n=!1;const r=this.world.map.cellAtWorld(this.targetX,this.targetY);i===0&&this.cell===r&&(i=16),this.owner.$.armour!==255&&this.owner.$.onBoat&&v(this,this.owner.$)<s&&(n=!0,i=16),i=le(i,v(this,e));const l=Y(this,e),o=V(je(l)*Ne(i)),h=V(We(l)*Ne(i)),u=this.x+o,c=this.y+h;let f=0;if(o!==0){const d=this.world.map.cellAtWorld(u,this.y);(n||d===r||d.getManSpeed(this)>0)&&(this.x=u,f++)}if(h!==0){const d=this.world.map.cellAtWorld(this.x,c);(n||d===r||d.getManSpeed(this)>0)&&(this.y=c,f++)}f===0?this.order=this.states.returning:(this.updateCell(),v(this,e)<=t&&this.reached())}reached(){if(this.order===this.states.returning){this.order=this.states.inTank,this.x=this.y=null,this.pillbox&&(this.pillbox.$.inTank=!0,this.pillbox.$.carried=!1,this.ref("pillbox",null)),this.owner.$.trees=le(40,this.owner.$.trees+this.trees),this.trees=0,this.hasMine&&(this.owner.$.mines=le(40,this.owner.$.mines+1)),this.hasMine=!1;return}if(this.cell.mine){this.world.spawn&&this.world.spawn(E,this.cell),this.order=this.states.waiting,this.waitTimer=20;return}switch(this.order){case this.states.actions.forest:if(this.cell.base||this.cell.pill||!this.cell.isType("#"))break;this.cell.setType("."),this.trees=4,this.soundEffect(qe);break;case this.states.actions.road:if(this.cell.base||this.cell.pill||this.cell.isType("|","}","b","^","#","=")||this.cell.isType(" ")&&this.cell.hasTankOnBoat())break;this.cell.setType("="),this.trees=0,this.soundEffect(j);break;case this.states.actions.repair:if(this.cell.pill){const e=this.cell.pill.repair(this.trees);this.trees-=e}else if(this.cell.isType("}"))this.cell.setType("|"),this.trees=0;else break;this.soundEffect(j);break;case this.states.actions.boat:if(!this.cell.isType(" ")||this.cell.hasTankOnBoat())break;this.cell.setType("b"),this.trees=0,this.soundEffect(j);break;case this.states.actions.building:if(this.cell.base||this.cell.pill||this.cell.isType("b","^","#","}","|"," "))break;this.cell.setType("|"),this.trees=0,this.soundEffect(j);break;case this.states.actions.pillbox:if(this.cell.pill||this.cell.base||this.cell.isType("b","^","#","|","}"," "))break;this.pillbox.$.armour=15,this.trees=0,this.pillbox.$.placeAt(this.cell),this.ref("pillbox",null),this.soundEffect(j);break;case this.states.actions.mine:if(this.cell.base||this.cell.pill||this.cell.isType("^"," ","|","b","}"))break;this.cell.setType(null,!0,0),this.hasMine=!1,this.soundEffect(we);break}this.order=this.states.waiting,this.waitTimer=20}parachutingIn(e){if(v(this,e)<=16)this.order=this.states.returning;else{const t=Y(this,e);this.x=this.x+V(je(t)*3),this.y=this.y+V(We(t)*3),this.updateCell()}}}const{round:ae,cos:Ot,sin:Lt,PI:Nt}=Math;class J extends ${constructor(){super(...arguments),this.styled=null,this.direction=0,this.largeExplosion=!1,this.lifespan=0}serialization(e,t){e&&(t("B","direction"),t("f","largeExplosion")),t("H","x"),t("H","y"),t("B","lifespan")}getDirection16th(){return ae((this.direction-1)/16)%16}spawn(e,t,s,i){this.x=e,this.y=t,this.direction=s,this.largeExplosion=i,this.lifespan=80}update(){if(this.lifespan--%2===0){if(this.wreck())return;this.move()}this.lifespan===0&&(this.explode(),this.world.destroy&&this.world.destroy(this))}wreck(){this.world.spawn&&this.world.spawn(L,this.x,this.y);const e=this.world.map.cellAtWorld(this.x,this.y);return e.isType("^")?(this.world.destroy&&this.world.destroy(this),this.soundEffect(ve),!0):(e.isType("b")?(e.setType(" "),this.soundEffect(D)):e.isType("#")&&(e.setType("."),this.soundEffect(ke)),!1)}move(){if(this.dx===void 0){const n=(256-this.direction)*2*Nt/256;this.dx=ae(Ot(n)*48),this.dy=ae(Lt(n)*48)}const{dx:e,dy:t}=this,s=this.x+e,i=this.y+t;if(e!==0){const n=e>0?s+24:s-24;this.world.map.cellAtWorld(n,i).isObstacle()||(this.x=s)}if(t!==0){const n=t>0?i+24:i-24;this.world.map.cellAtWorld(s,n).isObstacle()||(this.y=i)}}explode(){var t;const e=[this.world.map.cellAtWorld(this.x,this.y)];if(this.largeExplosion){const s=this.dx>0?1:-1,i=this.dy>0?1:-1;e.push(e[0].neigh(s,0)),e.push(e[0].neigh(0,i)),e.push(e[0].neigh(s,i)),this.soundEffect(Ye)}else this.soundEffect(xe);for(const s of e){s.takeExplosionHit();for(const i of this.world.tanks){const n=(t=i.builder)==null?void 0:t.$;if(n){const{inTank:r,parachuting:l}=n.states;n.order!==r&&n.order!==l&&n.cell===s&&n.kill()}}if(this.world.spawn){const[i,n]=s.getWorldCoordinates();this.world.spawn(L,i,n)}}}}const{round:S,floor:jt,ceil:De,min:Ge,sqrt:Wt,max:N,sin:he,cos:ce,PI:de}=Math;class Se extends ${constructor(e){super(e),this.styled=!0,this.team=null,this.hidden=!1,this.speed=0,this.slideTicks=0,this.slideDirection=0,this.accelerating=!1,this.braking=!1,this.direction=0,this.turningClockwise=!1,this.turningCounterClockwise=!1,this.turnSpeedup=0,this.shells=40,this.mines=0,this.armour=40,this.trees=0,this.reload=0,this.shooting=!1,this.layingMine=!1,this.firingRange=7,this.kills=0,this.deaths=0,this.waterTimer=0,this.onBoat=!0,this.cell=null,this.on("netUpdate",t=>{(t.hasOwnProperty("x")||t.hasOwnProperty("y")||t.armour===255)&&this.updateCell()})}anySpawn(){this.updateCell(),this.world.addTank(this),this.on("finalize",()=>this.world.removeTank(this))}updateCell(){this.x!=null&&this.y!=null?this.cell=this.world.map.cellAtWorld(this.x,this.y):this.cell=null}reset(){const e=this.world.map.getRandomStart();[this.x,this.y]=e.cell.getWorldCoordinates(),this.direction=e.direction*16,this.updateCell(),this.speed=0,this.slideTicks=0,this.slideDirection=0,this.accelerating=!1,this.braking=!1,this.turningClockwise=!1,this.turningCounterClockwise=!1,this.turnSpeedup=0,this.shells=40,this.mines=0,this.armour=40,this.trees=0,this.reload=0,this.shooting=!1,this.layingMine=!1,this.firingRange=7,this.waterTimer=0,this.onBoat=!0,this.fireball=null}serialization(e,t){var s;if(e&&(t("B","team"),t("O","builder")),t("B","armour"),this.armour===255){t("O","fireball"),this.x=this.y=null;return}else(s=this.fireball)==null||s.clear();t("H","x"),t("H","y"),t("B","direction"),t("B","speed",{tx:i=>i*4,rx:i=>i/4}),t("B","slideTicks"),t("B","slideDirection"),t("B","turnSpeedup",{tx:i=>i+50,rx:i=>i-50}),t("B","shells"),t("B","mines"),t("B","trees"),t("B","reload"),t("B","firingRange",{tx:i=>i*2,rx:i=>i/2}),t("B","waterTimer"),t("B","kills"),t("B","deaths"),t("f","accelerating"),t("f","braking"),t("f","turningClockwise"),t("f","turningCounterClockwise"),t("f","shooting"),t("f","layingMine"),t("f","onBoat"),t("f","hidden")}getDirection16th(){return S((this.direction-1)/16)%16}getSlideDirection16th(){return S((this.slideDirection-1)/16)%16}getCarryingPillboxes(){return this.world.map.pills.filter(e=>{var t;return e.inTank&&((t=e.owner)==null?void 0:t.$)===this})}getTile(){const e=this.getDirection16th(),t=this.onBoat?1:0;return[e,t]}updateHiddenStatus(){if(!this.cell||!this.world.authority)return;const e=this.world.map.cellAtTile(this.cell.x,this.cell.y-1).isType("#"),t=this.world.map.cellAtTile(this.cell.x,this.cell.y+1).isType("#"),s=this.world.map.cellAtTile(this.cell.x-1,this.cell.y).isType("#"),i=this.world.map.cellAtTile(this.cell.x+1,this.cell.y).isType("#");this.hidden=e&&t&&s&&i}isAlly(e){return e===this||this.team!==255&&e.team===this.team}increaseRange(){this.firingRange=Ge(7,this.firingRange+.5)}decreaseRange(){this.firingRange=N(1,this.firingRange-.5)}takeShellHit(e){if(this.armour-=5,this.armour<0){const t=this.shells+this.mines>20;this.world.spawn&&this.ref("fireball",this.world.spawn(J,this.x,this.y,e.direction,t)),this.deaths++,e.attribution&&e.attribution.$&&e.attribution.$!==this&&e.attribution.$.kills++,this.kill()}else this.slideTicks=8,this.slideDirection=e.direction,this.onBoat&&(this.onBoat=!1,this.speed=0,this.cell.isType("^")&&this.sink());return Ze}takeMineHit(){if(this.armour-=10,this.armour<0){const e=this.shells+this.mines>20;this.world.spawn&&this.ref("fireball",this.world.spawn(J,this.x,this.y,this.direction,e)),this.deaths++,this.kill()}else this.onBoat&&(this.onBoat=!1,this.speed=0,this.cell.isType("^")&&this.sink())}spawn(e){this.team=e,this.reset(),this.world.spawn&&this.ref("builder",this.world.spawn(Ae,this))}update(){this.cell&&(this.death()||(this.shootOrReload(),this.layMine(),this.turn(),this.accelerate(),this.fixPosition(),this.move(),this.updateHiddenStatus()))}destroy(){this.dropPillboxes(),this.world.destroy&&this.world.destroy(this.builder.$)}death(){return this.armour!==255?!1:this.world.authority&&--this.respawnTimer===0?(delete this.respawnTimer,this.reset(),!1):!0}shootOrReload(){this.reload>0&&this.reload--,!(!this.shooting||this.reload!==0||this.shells<=0)&&(this.shells--,this.reload=13,this.world.spawn&&this.world.spawn(ee,this,{range:this.firingRange,onWater:this.onBoat}),this.soundEffect(Te))}layMine(){if(!this.layingMine||this.mines<=0)return;const e=(this.direction+128)%256,t=(256-S((e-1)/16)%16*16)*2*de/256,s=this.x+S(ce(t)*w),i=this.y+S(he(t)*w),n=this.world.map.cellAtWorld(s,i);n.base||n.pill||n.mine||n.isType("^"," ","|","b","}")||(n.setType(null,!0,0),this.mines--,this.soundEffect(we))}turn(){const e=this.cell.getTankTurn(this)*2.6555;if(this.turningClockwise===this.turningCounterClockwise){this.turnSpeedup=0;return}let t;for(this.turningCounterClockwise?(t=e,this.turnSpeedup<10&&(t/=2),this.turnSpeedup<0&&(this.turnSpeedup=0),this.turnSpeedup++):(t=-e,this.turnSpeedup>-10&&(t/=2),this.turnSpeedup>0&&(this.turnSpeedup=0),this.turnSpeedup--),this.direction+=t;this.direction<0;)this.direction+=256;this.direction>=256&&(this.direction%=256)}accelerate(){const e=this.cell.getTankSpeed(this);let t;this.speed>e?t=-.25:this.accelerating===this.braking?t=0:this.accelerating?t=.25:t=-.25,t>0&&this.speed<e?this.speed=Ge(e,this.speed+t):t<0&&this.speed>0&&(this.speed=N(0,this.speed+t))}fixPosition(){if(this.cell.getTankSpeed(this)===0){const e=w/2;this.x%w>=e?this.x++:this.x--,this.y%w>=e?this.y++:this.y--,this.speed=N(0,this.speed-1)}for(const e of this.world.tanks)e!==this&&e.armour!==255&&v(this,e)<=255&&(e.x<this.x?this.x++:this.x--,e.y<this.y?this.y++:this.y--)}move(){let e=0,t=0;if(this.speed>0){const r=(256-this.getDirection16th()*16)*2*de/256;e+=S(ce(r)*De(this.speed)),t+=S(he(r)*De(this.speed))}if(this.slideTicks>0){const r=(256-this.getSlideDirection16th()*16)*2*de/256;e+=S(ce(r)*16),t+=S(he(r)*16),this.slideTicks--}const s=this.x+e,i=this.y+t;let n=!0;if(e!==0){const r=e>0?s+64:s-64,l=this.world.map.cellAtWorld(r,i);l.getTankSpeed(this)!==0&&(n=!1,(!this.onBoat||l.isType(" ","^")||this.speed>=16)&&(this.x=s))}if(t!==0){const r=t>0?i+64:i-64,l=this.world.map.cellAtWorld(s,r);l.getTankSpeed(this)!==0&&(n=!1,(!this.onBoat||l.isType(" ","^")||this.speed>=16)&&(this.y=i))}if(e!==0||t!==0){n&&(this.speed=N(0,this.speed-1));const r=this.cell;this.updateCell(),r!==this.cell&&this.checkNewCell(r)}!this.onBoat&&this.speed<=3&&this.cell.isType(" ")?++this.waterTimer===15&&((this.shells!==0||this.mines!==0)&&this.soundEffect(Je),this.shells=N(0,this.shells-1),this.mines=N(0,this.mines-1),this.waterTimer=0):this.waterTimer=0}checkNewCell(e){if(this.onBoat)this.cell.isType(" ","^")||this.leaveBoat(e);else{if(this.cell.isType("^")){this.sink();return}this.cell.isType("b")&&this.enterBoat()}this.cell.mine&&this.world.spawn&&this.world.spawn(E,this.cell)}leaveBoat(e){if(this.cell.isType("b")){this.cell.setType(" ",!1,0);const t=(this.cell.x+.5)*w,s=(this.cell.y+.5)*w;this.world.spawn&&this.world.spawn(L,t,s),this.world.soundEffect(D,t,s)}else e.isType(" ")&&e.setType("b",!1,0),this.onBoat=!1}enterBoat(){this.cell.setType(" ",!1,0),this.onBoat=!0}sink(){this.world.soundEffect(ve,this.x,this.y),this.deaths++,this.kill()}kill(){this.dropPillboxes(),this.x=this.y=null,this.armour=255,this.respawnTimer=255}dropPillboxes(){const e=this.getCarryingPillboxes();if(e.length===0||!this.cell)return;let t=this.cell.x;const s=this.cell.y,i=S(Wt(e.length)),n=jt(i/2);t-=n;const r=s+i;for(;e.length!==0;){for(let l=s;l<r;l++){const o=this.world.map.cellAtTile(t,l);if(o.base||o.pill||o.isType("|","}","b"))continue;const h=e.pop();if(!h)return;h.placeAt(o)}t+=1}}}function Dt(a){a.registerType(te),a.registerType(se),a.registerType(W),a.registerType(Se),a.registerType(L),a.registerType(E),a.registerType(ee),a.registerType(J),a.registerType(Ae)}const nt=Object.freeze(Object.defineProperty({__proto__:null,Builder:Ae,Explosion:L,Fireball:J,FloodFill:W,MineExplosion:E,Shell:ee,Tank:Se,WorldBase:se,WorldPillbox:te,registerWithWorld:Dt},Symbol.toStringTag,{value:"Module"}));function me(a){if(a.length%4!==0)throw new Error("Invalid base64 input length, not properly padded?");let e=a.length/4*3;const t=a.substr(-2);t[0]==="="&&e--,t[1]==="="&&e--;const s=new Array(e),i=new Array(4);let n=0;for(let r=0;r<a.length;r++){const l=a[r],o=l.charCodeAt(0),h=r%4;i[h]=(()=>{if(65<=o&&o<=90)return o-65;if(97<=o&&o<=122)return o-71;if(48<=o&&o<=57)return o+4;if(o===43)return 62;if(o===47)return 63;if(o===61)return-1;throw new Error(`Invalid base64 input character: ${l}`)})(),h===3&&(s[n++]=((i[0]&63)<<2)+((i[1]&48)>>4),i[2]!==-1&&(s[n++]=((i[1]&15)<<4)+((i[2]&60)>>2)),i[3]!==-1&&(s[n++]=((i[2]&3)<<6)+(i[3]&63)))}return s}function Gt(a){let e=null,t=null,s=!1;const i=typeof globalThis<"u"&&typeof globalThis.window<"u"&&typeof globalThis.window.requestAnimationFrame=="function";return{start(){if(!s&&(s=!0,a.tick&&(e=setInterval(a.tick,a.rate)),a.frame&&i)){const n=()=>{s&&(a.frame(),t=globalThis.window.requestAnimationFrame(n))};n()}},stop(){s=!1,e&&(clearInterval(e),e=null),t!==null&&i&&(globalThis.window.cancelAnimationFrame(t),t=null)}}}class Qt extends tt{constructor(e){super(),this.lengthComputable=!0,this.loaded=0,this.total=0,this.wrappingUp=!1,this.total=e!==void 0?e:0}add(...e){let t=1,s=null;return typeof e[0]=="number"&&(t=e.shift()),typeof e[0]=="function"&&(s=e.shift()),this.total+=t,this.emit("progress",this),()=>{this.step(t),s==null||s()}}step(e=1){this.loaded+=e,this.emit("progress",this),this.checkComplete()}set(e,t){this.total=e,this.loaded=t,this.emit("progress",this),this.checkComplete()}wrapUp(){this.wrappingUp=!0,this.checkComplete()}checkComplete(){!this.wrappingUp||this.loaded<this.total||this.emit("complete")}}class Ut{constructor(){this.container=document.createElement("div"),this.container.className="vignette",document.body.appendChild(this.container),this.messageLine=document.createElement("div"),this.messageLine.className="vignette-message",this.container.appendChild(this.messageLine)}message(e){this.messageLine.textContent=e}showProgress(){}hideProgress(){}progress(e){}destroy(){this.container.remove(),this.container=null,this.messageLine=null}}class Kt{constructor(){if(this.sounds={},this.isSupported=!1,typeof Audio<"u"){const e=new Audio;this.isSupported=typeof e.canPlayType=="function"}}register(e,t){this.sounds[e]=t,this[e]=()=>this.play(e)}load(e,t,s){if(this.register(e,t),!this.isSupported){s==null||s();return}const i=new Audio;s&&i.addEventListener("canplaythrough",s,{once:!0}),i.addEventListener("error",n=>{const r=n.target.error;(r==null?void 0:r.code)===MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED&&(this.isSupported=!1,s==null||s())},{once:!0}),i.src=t,i.load()}play(e){if(!this.isSupported)return;const t=new Audio;return t.src=this.sounds[e],t.play(),t}}const U=[{r:255,g:0,b:0,name:"red"},{r:0,g:0,b:255,name:"blue"},{r:255,g:255,b:0,name:"yellow"},{r:0,g:255,b:0,name:"green"},{r:255,g:165,b:0,name:"orange"},{r:128,g:0,b:128,name:"purple"}],{min:Qe,max:Ue,round:O,cos:Ft,sin:Vt,PI:zt,sqrt:Xt}=Math;class Yt{constructor(e){this.currentTool=null,this.world=e,this.images=this.world.images,this.soundkit=this.world.soundkit,this.canvas=document.createElement("canvas"),document.body.appendChild(this.canvas),this.lastCenter=this.world.map.findCenterCell().getWorldCoordinates(),this.mouse=[0,0],this.canvas.addEventListener("click",t=>this.handleClick(t)),this.canvas.addEventListener("mousemove",t=>{this.mouse=[t.pageX,t.pageY]}),this.setup(),this.handleResize(),window.addEventListener("resize",()=>this.handleResize())}setup(){}centerOn(e,t,s){}drawTile(e,t,s,i){}drawStyledTile(e,t,s,i,n){}drawMap(e,t,s,i){}drawBuilderIndicator(e){}onRetile(e,t,s){}draw(){let e,t;const s=this.world.getViewTarget?this.world.getViewTarget():null;s?{x:e,y:t}=s:this.world.player?({x:e,y:t}=this.world.player,this.world.player.fireball&&({x:e,y:t}=this.world.player.fireball.$)):e=t=null,e==null||t==null?[e,t]=this.lastCenter:this.lastCenter=[e,t],this.centerOn(e,t,(i,n,r,l)=>{this.drawMap(i,n,r,l);for(const o of this.world.objects)if(o&&!(o.hidden&&o!==this.world.player)&&o.styled!=null&&o.x!=null&&o.y!=null){const[h,u]=o.getTile(),c=O(o.x/A)-g/2,f=O(o.y/A)-g/2;o.styled===!0?this.drawStyledTile(h,u,o.team,c,f):o.styled===!1&&this.drawTile(h,u,c,f)}this.drawOverlay()}),this.hud&&this.updateHud()}playSound(e,t,s,i){let n;if(this.world.player&&i===this.world.player)n="Self";else{const l=t-this.lastCenter[0],o=s-this.lastCenter[1],h=Xt(l*l+o*o);h>40*w?n="None":h>15*w?n="Far":n="Near"}if(n==="None")return;let r;switch(e){case Ye:r=`bigExplosion${n}`;break;case Je:r=n==="Self"?"bubbles":void 0;break;case qe:r=`farmingTree${n}`;break;case Ze:r=`hitTank${n}`;break;case j:r=`manBuilding${n}`;break;case et:r=`manDying${n}`;break;case we:r=n==="Near"?"manLayMineNear":void 0;break;case xe:r=`mineExplosion${n}`;break;case Te:r=`shooting${n}`;break;case D:r=`shotBuilding${n}`;break;case ke:r=`shotTree${n}`;break;case ve:r=`tankSinking${n}`;break}r&&this.soundkit[r]()}handleResize(){this.canvas.width=window.innerWidth,this.canvas.height=window.innerHeight,this.canvas.style.width=`${window.innerWidth}px`,this.canvas.style.height=`${window.innerHeight}px`,document.body.style.width=`${window.innerWidth}px`,document.body.style.height=`${window.innerHeight}px`}handleClick(e){if(e.preventDefault(),this.world.input.focus(),!this.currentTool)return;const[t,s]=this.mouse,i=this.getCellAtScreen(t,s),[n,r,l]=this.world.checkBuildOrder(this.currentTool,i);n&&this.world.buildOrder(n,r,i)}getViewAreaAtWorld(e,t){const{width:s,height:i}=this.canvas;let n=O(e/A-s/2);n=Ue(0,Qe($e-s,n));let r=O(t/A-i/2);return r=Ue(0,Qe($e-i,r)),[n,r,s,i]}getCellAtScreen(e,t){const[s,i]=this.lastCenter,[n,r,l,o]=this.getViewAreaAtWorld(s,i);return this.world.map.cellAtPixel(n+e,r+t)}drawOverlay(){const e=this.world.player;if(e&&e.armour!==255){if(e.builder){const t=e.builder.$;t.order===t.states.inTank||t.order===t.states.parachuting||this.drawBuilderIndicator(t)}this.world.gunsightVisible&&this.drawReticle()}this.drawNames(),this.drawCursor()}drawReticle(){const e=this.world.player.firingRange*g,t=(256-this.world.player.direction)*2*zt/256,s=O(this.world.player.x/A+Ft(t)*e)-g/2,i=O(this.world.player.y/A+Vt(t)*e)-g/2;this.drawTile(17,4,s,i)}drawCursor(){const[e,t]=this.mouse,s=this.getCellAtScreen(e,t);this.drawTile(18,6,s.x*g,s.y*g)}drawNames(){}initHud(){this.hud=document.createElement("div"),this.hud.id="hud",document.body.appendChild(this.hud),this.initHudTankStatus(),this.initHudPillboxes(),this.initHudBases(),this.initHudPlayers(),this.initHudStats(),this.initHudToolSelect(),this.initHudNotices(),this.updateHud()}initHudTankStatus(){const e=document.createElement("div");e.id="tankStatus",this.hud.appendChild(e);const t=document.createElement("div");t.className="deco",e.appendChild(t),this.tankIndicators={};for(const s of["shells","mines","armour","trees"]){const i=document.createElement("div");i.className="gauge",i.id=`tank-${s}`,e.appendChild(i);const n=document.createElement("div");n.className="gauge-content",i.appendChild(n),this.tankIndicators[s]=n}}initHudPillboxes(){const e=document.createElement("div");e.id="pillStatus",this.hud.appendChild(e);const t=document.createElement("div");t.className="deco",e.appendChild(t),this.pillIndicators=this.world.map.pills.map(s=>{const i=document.createElement("div");return i.className="pill",e.appendChild(i),[i,s]})}initHudBases(){const e=document.createElement("div");e.id="baseStatus",this.hud.appendChild(e);const t=document.createElement("div");t.className="deco",e.appendChild(t),this.baseIndicators=this.world.map.bases.map((s,i)=>{const n=document.createElement("div");return n.className="base",n.setAttribute("data-base-idx",s.idx),n.setAttribute("data-array-index",i.toString()),e.appendChild(n),[n,s]})}initHudPlayers(){const e=document.createElement("div");e.id="playersStatus",this.hud.appendChild(e);const t=document.createElement("div");t.className="deco",e.appendChild(t),this.playerIndicators=[]}initHudStats(){const e=document.createElement("div");e.id="statsStatus",this.hud.appendChild(e);const t=document.createElement("div");t.className="stat-line",e.appendChild(t);const s=document.createElement("span");s.className="stat-group-left",t.appendChild(s);const i=document.createElement("span");i.className="stat-icon",i.textContent="☠",s.appendChild(i);const n=document.createElement("span");n.className="stat-value",n.id="stat-kills",n.textContent="0",s.appendChild(n);const r=document.createElement("span");r.className="stat-group-right",t.appendChild(r);const l=document.createElement("span");l.className="stat-icon",l.id="stat-score-icon",l.textContent="★",r.appendChild(l);const o=document.createElement("span");o.className="stat-value",o.id="stat-score",o.textContent="0",r.appendChild(o);const h=document.createElement("div");h.className="stat-line",e.appendChild(h);const u=document.createElement("span");u.className="stat-icon",u.textContent="†",h.appendChild(u);const c=document.createElement("span");c.className="stat-value",c.id="stat-deaths",c.textContent="0",h.appendChild(c)}initHudToolSelect(){this.currentTool=null;const e=document.createElement("div");e.id="tool-select",this.hud.appendChild(e);for(const t of["forest","road","building","pillbox","mine"])this.initHudTool(e,t)}initHudTool(e,t){const s=`tool-${t}`,i=document.createElement("input");i.type="radio",i.name="tool",i.id=s,e.appendChild(i);const n=document.createElement("label");n.htmlFor=s,e.appendChild(n);const r=document.createElement("span");r.className=`bolo-tool bolo-${s}`,n.appendChild(r),i.addEventListener("click",l=>{this.currentTool===t?(this.currentTool=null,e.querySelectorAll("input").forEach(o=>{o.checked=!1})):this.currentTool=t,this.world.input.focus()})}initHudNotices(){if(location.hostname.split(".")[1]==="github"){const e=document.createElement("div");e.innerHTML=`
        This is a work-in-progress; less than alpha quality!<br>
        To see multiplayer in action, follow instructions on Github.
      `,Object.assign(e.style,{position:"absolute",top:"70px",left:"0px",width:"100%",textAlign:"center",fontFamily:"monospace",fontSize:"16px",fontWeight:"bold",color:"white"}),this.hud.appendChild(e)}if(location.hostname.split(".")[1]==="github"||location.hostname.substr(-6)===".no.de"){const e=document.createElement("a");e.href="http://github.com/stephank/orona",Object.assign(e.style,{position:"absolute",top:"0px",right:"0px"}),e.innerHTML='<img src="http://s3.amazonaws.com/github/ribbons/forkme_right_darkblue_121621.png" alt="Fork me on GitHub">',this.hud.appendChild(e)}}updateHud(){if(this.pillIndicators)for(let t=0;t<this.pillIndicators.length;t++){const[s]=this.pillIndicators[t],i=this.world.map.pills[t];if(!i)continue;const n=`${i.inTank};${i.carried};${i.armour};${i.team};${i.owner_idx}`;i.hudStatusKey=n,i.inTank||i.carried?s.setAttribute("status","carried"):i.armour===0?s.setAttribute("status","dead"):s.setAttribute("status","healthy");const r=U[i.team]||{r:112,g:112,b:112};s.style.backgroundColor=`rgb(${r.r},${r.g},${r.b})`}if(this.baseIndicators)for(let t=0;t<this.baseIndicators.length;t++){const[s]=this.baseIndicators[t],i=this.world.map.bases[t];if(!i){console.warn(`[HUD] Base at indicator index ${t} is null/undefined`);continue}const n=`${i.armour};${i.team};${i.owner_idx}`;i.hudStatusKey=n,i.armour<=9?s.setAttribute("status","vulnerable"):s.setAttribute("status","healthy");const r=U[i.team]||{r:112,g:112,b:112},l=`rgb(${r.r},${r.g},${r.b})`;s.style.backgroundColor!==l&&(s.style.backgroundColor=l)}if(this.playerIndicators){const t=document.getElementById("playersStatus");if(t){const s=this.world.tanks.filter(i=>i);for(;this.playerIndicators.length>s.length;){const i=this.playerIndicators.pop();i&&i.remove()}for(let i=0;i<s.length;i++){const n=s[i];if(!this.playerIndicators[i]){const h=document.createElement("div");h.className="player",t.appendChild(h),this.playerIndicators[i]=h}const r=this.playerIndicators[i],l=U[n.team]||{r:112,g:112,b:112};r.style.backgroundColor=`rgb(${l.r},${l.g},${l.b})`,n.armour===255?r.setAttribute("data-dead","true"):r.removeAttribute("data-dead")}}}const e=this.world.player;if(e&&e.kills!==void 0&&e.deaths!==void 0){const t=document.getElementById("stat-kills"),s=document.getElementById("stat-deaths"),i=document.getElementById("stat-score"),n=document.getElementById("stat-score-icon");if(t&&(t.textContent=e.kills.toString()),s&&(s.textContent=e.deaths.toString()),i&&e.team!==void 0&&e.team>=0&&e.team<=5){const r=this.world.teamScores.map((h,u)=>({team:u,score:h}));r.sort((h,u)=>u.score-h.score);const l=r.findIndex(h=>h.team===e.team)+1,o=h=>{const u=["th","st","nd","rd"],c=h%100;return h+(u[(c-20)%10]||u[c]||u[0])};if(i.textContent=o(l),n){const h=U[e.team]||{r:192,g:192,b:240};n.style.color=`rgb(${h.r},${h.g},${h.b})`}}}if(e.hudLastStatus=e.hudLastStatus||{},this.tankIndicators)for(const[t,s]of Object.entries(this.tankIndicators)){const i=e.armour===255?0:e[t];e.hudLastStatus[t]!==i&&(e.hudLastStatus[t]=i,s.style.height=`${O(i/40*100)}%`)}}}const{min:z,round:Q,cos:ue,sin:pe,PI:Jt}=Math;class qt extends Yt{constructor(){super(...arguments),this.prestyled={}}setup(){try{const n=this.canvas.getContext("2d");if(!n)throw new Error("Could not get 2D context");this.ctx=n,this.ctx.drawImage}catch(n){throw new Error(`Could not initialize 2D canvas: ${n.message}`)}const e=this.images.overlay,t=document.createElement("canvas");t.width=e.width,t.height=e.height;const s=t.getContext("2d");if(!s)throw new Error("Could not get temporary canvas context");s.globalCompositeOperation="copy",s.drawImage(e,0,0);const i=s.getImageData(0,0,e.width,e.height);this.overlay=i.data,this.prestyled={}}drawTile(e,t,s,i,n){(n||this.ctx).drawImage(this.images.base,e*g,t*g,g,g,s,i,g,g)}createPrestyled(e){const t=this.images.styled,{width:s,height:i}=t,n=document.createElement("canvas");n.width=s,n.height=i;const r=n.getContext("2d");if(!r)throw new Error("Could not get canvas context");r.globalCompositeOperation="copy",r.drawImage(t,0,0);const l=r.getImageData(0,0,s,i),o=l.data;for(let h=0;h<s;h++)for(let u=0;u<i;u++){const c=4*(u*s+h),f=this.overlay[c]/255;o[c+0]=Q(f*e.r+(1-f)*o[c+0]),o[c+1]=Q(f*e.g+(1-f)*o[c+1]),o[c+2]=Q(f*e.b+(1-f)*o[c+2]),o[c+3]=z(255,o[c+3]+this.overlay[c])}return r.putImageData(l,0,0),n}drawStyledTile(e,t,s,i,n,r){let l=this.prestyled[s];if(!l){const o=U[s];o?l=this.prestyled[s]=this.createPrestyled(o):l=this.images.styled}(r||this.ctx).drawImage(l,e*g,t*g,g,g,i,n,g,g)}centerOn(e,t,s){this.ctx.save();const[i,n,r,l]=this.getViewAreaAtWorld(e,t);this.ctx.translate(-i,-n),s(i,n,r,l),this.ctx.restore()}drawBuilderIndicator(e){const t=e.owner.$;if(t.hidden&&t!==this.world.player)return;const s=v(t,e);if(s<=128)return;const i=t.x/A,n=t.y/A;this.ctx.save(),this.ctx.globalCompositeOperation="source-over",this.ctx.globalAlpha=z(1,(s-128)/1024);const r=z(50,s/10240*50)+32;let l=Y(t,e);this.ctx.beginPath();const o=i+ue(l)*r,h=n+pe(l)*r;this.ctx.moveTo(o,h),l+=Jt,this.ctx.lineTo(o+ue(l-.4)*10,h+pe(l-.4)*10),this.ctx.lineTo(o+ue(l+.4)*10,h+pe(l+.4)*10),this.ctx.closePath(),this.ctx.fillStyle="yellow",this.ctx.fill(),this.ctx.restore()}drawNames(){this.ctx.save(),this.ctx.strokeStyle=this.ctx.fillStyle="white",this.ctx.font="bold 11px sans-serif",this.ctx.textBaselines="alphabetic",this.ctx.textAlign="left";const e=this.world.player;for(const t of this.world.tanks)if(!(t.hidden&&t!==e)&&t.name&&t.armour!==255&&t!==e){if(e){const r=v(e,t);if(r<=768)continue;this.ctx.globalAlpha=z(1,(r-768)/1536)}else this.ctx.globalAlpha=1;const s=this.ctx.measureText(t.name);this.ctx.beginPath();let i=Q(t.x/A)+16,n=Q(t.y/A)-16;this.ctx.moveTo(i,n),i+=12,n-=9,this.ctx.lineTo(i,n),this.ctx.lineTo(i+s.width,n),this.ctx.stroke(),this.ctx.fillText(t.name,i,n-2)}this.ctx.restore()}}const{floor:Ke}=Math,_=16,X=k/_,I=_*g;class Zt{constructor(e,t,s){this.canvas=null,this.ctx=null,this.renderer=e,this.sx=t*_,this.sy=s*_,this.ex=this.sx+_-1,this.ey=this.sy+_-1,this.psx=t*I,this.psy=s*I,this.pex=this.psx+I-1,this.pey=this.psy+I-1}isInView(e,t,s,i){return s<this.psx||i<this.psy?!1:!(e>this.pex||t>this.pey)}build(){this.canvas=document.createElement("canvas"),this.canvas.width=this.canvas.height=I;const e=this.canvas.getContext("2d");if(!e)throw new Error("Could not get canvas context");this.ctx=e,this.ctx.translate(-this.psx,-this.psy),this.renderer.world.map.each(t=>{this.onRetile(t,t.tile[0],t.tile[1])},this.sx,this.sy,this.ex,this.ey)}clear(){this.canvas=this.ctx=null}onRetile(e,t,s){if(!this.canvas)return;const i=e.pill||e.base;i?this.renderer.drawStyledTile(e.tile[0],e.tile[1],i.team,e.x*g,e.y*g,this.ctx):this.renderer.drawTile(e.tile[0],e.tile[1],e.x*g,e.y*g,this.ctx)}}class es extends qt{setup(){super.setup(),this.cache=new Array(X);for(let e=0;e<X;e++){const t=this.cache[e]=new Array(X);for(let s=0;s<X;s++)t[s]=new Zt(this,s,e)}}onRetile(e,t,s){if(e.tile=[t,s],!this.cache)return;const i=Ke(e.x/_),n=Ke(e.y/_);!this.cache[n]||!this.cache[n][i]||this.cache[n][i].onRetile(e,t,s)}drawMap(e,t,s,i){const n=e+s-1,r=t+i-1;let l=!1;for(const o of this.cache)for(const h of o){if(!h.isInView(e,t,n,r)){h.canvas&&h.clear();continue}if(!h.canvas){if(l)continue;h.build(),l=!0}this.ctx.drawImage(h.canvas,0,0,I,I,h.psx,h.psy,I,I)}}}const ts={boloInit(){this.tanks=[]},addTank(a){a.tank_idx=this.tanks.length,this.tanks.push(a),this.authority&&this.resolveMapObjectOwners(),this.tanks.length===1&&this.emptyStartTime!==void 0&&(this.emptyStartTime=null)},removeTank(a){const e=a.tank_idx;this.tanks.splice(a.tank_idx,1);for(let t=a.tank_idx;t<this.tanks.length;t++)this.tanks[t].tank_idx=t;for(const t of this.getAllMapObjects())if(t.owner_idx!==255)if(t.owner_idx===e){const s=t.team;t.owner_idx=255,t.ref("owner",null),t.team=s}else t.owner_idx>e&&(t.owner_idx-=1);this.authority&&this.resolveMapObjectOwners(),this.tanks.length===0&&this.emptyStartTime!==void 0&&(this.emptyStartTime=Date.now())},getAllMapObjects(){return this.map.pills.concat(this.map.bases)},spawnMapObjects(){for(const a of this.getAllMapObjects())a.world=this,this.insert(a),a.spawn(),a.anySpawn()},resolveMapObjectOwners(){var a;for(const e of this.getAllMapObjects())e.owner_idx!==255&&e.owner_idx<this.tanks.length?e.ref("owner",this.tanks[e.owner_idx]):e.owner_idx===255&&e.owner&&e.ref("owner",null),(a=e.cell)==null||a.retile()}},Ee={start(){const a=new Ut;this.waitForCache(a,()=>{this.loadResources(a,()=>{this.loaded(a)})})},waitForCache(a,e){return e()},loadResources(a,e){a.message("Loading resources");const t=new Qt;this.images={},this.loadImages(s=>{this.images[s]=new Image;const i=this.images[s],n=t.add();i.addEventListener("load",n,{once:!0}),i.src=`images/${s}.png`}),this.soundkit=new Kt,this.loadSounds(s=>{const i=`sounds/${s}.ogg`,n=s.split("_");for(let l=1;l<n.length;l++)n[l]=n[l].substr(0,1).toUpperCase()+n[l].substr(1);const r=n.join("");this.soundkit.load(r,i,t.add())}),typeof applicationCache>"u"&&(a.showProgress(),t.on("progress",s=>a.progress(s.loaded/s.total))),t.on("complete",()=>{a.hideProgress(),e()}),t.wrapUp()},loadImages(a){a("base"),a("styled"),a("overlay")},loadSounds(a){a("big_explosion_far"),a("big_explosion_near"),a("bubbles"),a("farming_tree_far"),a("farming_tree_near"),a("hit_tank_far"),a("hit_tank_near"),a("hit_tank_self"),a("man_building_far"),a("man_building_near"),a("man_dying_far"),a("man_dying_near"),a("man_lay_mine_near"),a("mine_explosion_far"),a("mine_explosion_near"),a("shooting_far"),a("shooting_near"),a("shooting_self"),a("shot_building_far"),a("shot_building_near"),a("shot_tree_far"),a("shot_tree_near"),a("tank_sinking_far"),a("tank_sinking_near")},commonInitialization(){this.renderer=new es(this),this.map.world=this,this.map.setView(this.renderer),this.boloInit(),this.loop=Gt({rate:rt,tick:()=>this.tick(),frame:()=>this.renderer.draw()}),this.increasingRange=!1,this.decreasingRange=!1,this.rangeAdjustTimer=0,this.viewMode="tank",this.currentPillboxIndex=0;const a=o=>{var c;const u=`; ${document.cookie}`.split(`; ${o}=`);return u.length===2&&((c=u.pop())==null?void 0:c.split(";").shift())||null},e={accelerate:"ArrowUp",decelerate:"ArrowDown",turnLeft:"ArrowLeft",turnRight:"ArrowRight",increaseRange:"KeyL",decreaseRange:"Semicolon",shoot:"Space",layMine:"Tab",tankView:"Enter",pillboxView:"KeyP",autoSlowdown:!0,autoGunsight:!0},t=a("keyBindings");this.keyBindings=t?{...e,...JSON.parse(t)}:e,this.input=document.createElement("input"),this.input.id="input-dummy",this.input.type="text",this.input.setAttribute("autocomplete","off"),this.input.setAttribute("readonly","true"),this.input.style.caretColor="transparent",document.body.insertBefore(this.input,this.renderer.canvas),this.input.focus();const s=[this.input,this.renderer.canvas],i=document.querySelectorAll("#tool-select label");s.push(...Array.from(i));const n=o=>{o.preventDefault(),o.stopPropagation();const h=o.code;h===this.keyBindings.increaseRange?this.increasingRange=!0:h===this.keyBindings.decreaseRange?this.decreasingRange=!0:this.handleKeydown(o)},r=o=>{o.preventDefault(),o.stopPropagation();const h=o.code;h===this.keyBindings.increaseRange?this.increasingRange=!1:h===this.keyBindings.decreaseRange?this.decreasingRange=!1:this.handleKeyup(o)},l=o=>(o.preventDefault(),o.stopPropagation(),!1);for(const o of s)o.addEventListener("keydown",n),o.addEventListener("keyup",r),o.addEventListener("keypress",l)},failure(a){this.loop&&this.loop.stop();const e=document.createElement("div");e.textContent=a,e.style.cssText=`
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
    `,document.body.appendChild(t),document.body.appendChild(e)},checkBuildOrder(a,e){const t=this.player.builder.$;if(t.order!==t.states.inTank)return[!1];if(e.mine)return[!1];let s;switch(a){case"forest":e.base||e.pill||!e.isType("#")?s=[!1]:s=["forest",0];break;case"road":e.base||e.pill||e.isType("|","}","b","^")?s=[!1]:e.isType("#")?s=["forest",0]:e.isType("=")?s=[!1]:e.isType(" ")&&e.hasTankOnBoat()?s=[!1]:s=["road",2];break;case"building":e.base||e.pill||e.isType("b","^")?s=[!1]:e.isType("#")?s=["forest",0]:e.isType("}")?s=["repair",1]:e.isType("|")?s=[!1]:e.isType(" ")?e.hasTankOnBoat()?s=[!1]:s=["boat",20]:e===this.player.cell?s=[!1]:s=["building",2];break;case"pillbox":e.pill?e.pill.armour===16?s=[!1]:e.pill.armour>=11?s=["repair",1,!0]:e.pill.armour>=7?s=["repair",2,!0]:e.pill.armour>=3?s=["repair",3,!0]:e.pill.armour<3?s=["repair",4,!0]:s=[!1]:e.isType("#")?s=["forest",0]:e.base||e.isType("b","^","|","}"," ")?s=[!1]:e===this.player.cell?s=[!1]:s=["pillbox",4];break;case"mine":e.base||e.pill||e.isType("^"," ","|","b","}")?s=[!1]:s=["mine"];break;default:s=[!1]}const[i,n,r]=s;return i?i==="mine"?this.player.mines===0?[!1]:["mine"]:i==="pill"&&this.player.getCarryingPillboxes().length===0?[!1]:n!=null&&this.player.trees<n?r?[i,this.player.trees,r]:[!1]:s:[!1]}};Ce(Ee,ts);const ss=nt;class Be extends fe{constructor(){super(...arguments),this.authority=!0,this.gunsightVisible=!0,this.autoSlowdownActive=!1}loaded(e){this.map=it.load(me(Rt)),this.commonInitialization(),this.spawnMapObjects(),this.player=this.spawn(Se),this.player.spawn(0),this.renderer.initHud(),e.destroy(),this.loop.start()}tick(){if(super.tick(),this.increasingRange!==this.decreasingRange){if(++this.rangeAdjustTimer===6){if(this.increasingRange){this.player.increaseRange();const e=this.keyBindings;e&&e.autoGunsight&&this.player.firingRange===7&&(this.gunsightVisible=!1)}else{this.player.decreaseRange();const e=this.keyBindings;e&&e.autoGunsight&&(this.gunsightVisible=!0)}this.rangeAdjustTimer=0}}else this.rangeAdjustTimer=0}soundEffect(e,t,s,i){this.renderer.playSound(e,t,s,i)}mapChanged(e,t,s,i){}handleKeydown(e){switch(e.which||e.keyCode){case 32:this.player.shooting=!0;break;case 37:this.player.turningCounterClockwise=!0;break;case 38:this.player.accelerating=!0,this.autoSlowdownActive&&(this.player.braking=!1,this.autoSlowdownActive=!1);break;case 39:this.player.turningClockwise=!0;break;case 40:this.player.braking=!0,this.autoSlowdownActive=!1;break}}handleKeyup(e){const t=e.which||e.keyCode,s=this.keyBindings;switch(t){case 32:this.player.shooting=!1;break;case 37:this.player.turningCounterClockwise=!1;break;case 38:this.player.accelerating=!1,s&&s.autoSlowdown&&(this.player.braking=!0,this.autoSlowdownActive=!0);break;case 39:this.player.turningClockwise=!1;break;case 40:this.player.braking=!1,this.autoSlowdownActive=!1;break}}buildOrder(e,t,s){this.player.builder.$.performOrder(e,t,s)}}Ce(Be.prototype,Ee);ss.registerWithWorld(Be.prototype);const Z=class Z{constructor(){this.objects=[],this.tanks=[],this._isSynchronized=!1}registerType(e){const t=this.constructor.types.length;this.constructor.types.push(e),this.constructor.typesByName.set(e.name,t)}insert(e){e.idx=this.objects.length,this.objects.push(e)}tick(){for(const e of this.objects)e&&e.tick&&e.tick()}netSpawn(e,t){const s=e[t],i=e[t+1]<<8|e[t+2],n=this.constructor.types[s];if(!n)throw new Error(`Unknown object type index: ${s}`);const r=new n(this);for(r._net_type_idx=s,r.idx=i,r._createdViaMessage=!0;this.objects.length<=i;)this.objects.push(null);this.objects[i]=r;const l=this.constructor.types[3];if(n===l){const o=this.tanks.findIndex(h=>h&&h.idx===r.idx);o===-1?this.tanks.push(r):this.tanks[o]=r}return 3}netDestroy(e,t){const s=e[t]<<8|e[t+1];if(this.objects[s]){const i=this.objects[s],n=this.constructor.types[3];if(i.constructor===n){const r=this.tanks.indexOf(i);r!==-1&&this.tanks.splice(r,1)}this.objects[s]=null}return 2}netUpdate(e,t,s){return e&&e.load?e.load(t,s):0}netTick(e,t,s){const i=!this._isSynchronized;let n=0;for(let r=0;r<this.objects.length;r++){const l=this.objects[r];if(l&&l.load){if(s&&s.has(l))continue;const o=l.load(e,t+n,i);n+=o}}return n}netRestore(){}failure(e){console.error("Client error:",e)}};Z.types=[],Z.typesByName=new Map;let be=Z;const is=115,ns=87,rs=67,os=68,ls=77,as=85,hs=117,cs=83,ds=84,us="L",ps="l",fs="R",gs="r",ms="A",bs="a",Fe="B",Ve="b",ys="S",ws="s",xs="M",Ts="m",ks="I",vs="D",Cs="O",As=nt,Ss=`
    <div id="join-dialog" style="
      background: #c0c0c0;
      border: 2px outset #dfdfdf;
      box-shadow: 2px 2px 8px rgba(0, 0, 0, 0.5);
      padding: 16px;
      min-width: 320px;
      font-family: 'Chicago', 'Charcoal', sans-serif;
      color: black;
    ">
      <div style="
        background: white;
        border: 2px inset #808080;
        padding: 12px;
        margin-bottom: 16px;
        text-align: center;
        font-weight: bold;
      ">Join Game</div>

      <div style="margin-bottom: 12px;">
        <label style="display: block; margin-bottom: 4px; font-weight: bold;">Player Name</label>
        <input type="text" id="join-nick-field" name="join-nick-field" maxlength="20" style="
          width: 100%;
          border: 1px inset #808080;
          background: white;
          padding: 4px;
          font-family: 'Chicago', 'Charcoal', sans-serif;
          box-sizing: border-box;
        "></input>
      </div>

      <div id="join-team" style="margin-bottom: 16px;">
        <label style="display: block; margin-bottom: 8px; font-weight: bold;">Choose a team</label>
        <div style="display: flex; gap: 8px; justify-content: center; flex-wrap: wrap;">
          <input type="radio" id="join-team-red" name="join-team" value="red" style="display: none;"></input>
          <label for="join-team-red" style="cursor: pointer;">
            <span class="bolo-team bolo-team-red" style="
              display: inline-block;
              width: 32px;
              height: 32px;
              border: 2px outset #dfdfdf;
              box-sizing: border-box;
            "></span>
          </label>

          <input type="radio" id="join-team-blue" name="join-team" value="blue" style="display: none;"></input>
          <label for="join-team-blue" style="cursor: pointer;">
            <span class="bolo-team bolo-team-blue" style="
              display: inline-block;
              width: 32px;
              height: 32px;
              border: 2px outset #dfdfdf;
              box-sizing: border-box;
            "></span>
          </label>

          <input type="radio" id="join-team-yellow" name="join-team" value="yellow" style="display: none;"></input>
          <label for="join-team-yellow" style="cursor: pointer;">
            <span class="bolo-team bolo-team-yellow" style="
              display: inline-block;
              width: 32px;
              height: 32px;
              border: 2px outset #dfdfdf;
              box-sizing: border-box;
            "></span>
          </label>

          <input type="radio" id="join-team-green" name="join-team" value="green" style="display: none;"></input>
          <label for="join-team-green" style="cursor: pointer;">
            <span class="bolo-team bolo-team-green" style="
              display: inline-block;
              width: 32px;
              height: 32px;
              border: 2px outset #dfdfdf;
              box-sizing: border-box;
            "></span>
          </label>

          <input type="radio" id="join-team-orange" name="join-team" value="orange" style="display: none;"></input>
          <label for="join-team-orange" style="cursor: pointer;">
            <span class="bolo-team bolo-team-orange" style="
              display: inline-block;
              width: 32px;
              height: 32px;
              border: 2px outset #dfdfdf;
              box-sizing: border-box;
            "></span>
          </label>

          <input type="radio" id="join-team-purple" name="join-team" value="purple" style="display: none;"></input>
          <label for="join-team-purple" style="cursor: pointer;">
            <span class="bolo-team bolo-team-purple" style="
              display: inline-block;
              width: 32px;
              height: 32px;
              border: 2px outset #dfdfdf;
              box-sizing: border-box;
            "></span>
          </label>
        </div>
      </div>

      <div style="text-align: center;">
        <button type="button" id="join-submit" style="
          padding: 8px 24px;
          border: 2px outset #dfdfdf;
          background: #c0c0c0;
          cursor: pointer;
          font-family: 'Chicago', 'Charcoal', sans-serif;
          font-weight: bold;
        ">Join Game</button>
      </div>
    </div>
  `;function ze(a){var s;const t=`; ${document.cookie}`.split(`; ${a}=`);return t.length===2&&((s=t.pop())==null?void 0:s.split(";").shift())||null}function Xe(a,e){document.cookie=`${a}=${e}; path=/; max-age=31536000`}class Ie extends be{constructor(){super(),this.authority=!1,this.mapChanges={},this.processingServerMessages=!1,this.objectsCreatedInThisPacket=new Set,this.gunsightVisible=!0,this.autoSlowdownActive=!1,this.teamScores=[0,0,0,0,0,0],this.mapChanges={},this.processingServerMessages=!1}loaded(e){this.vignette=e,this.heartbeatTimer=0;const t=/^\?([a-z]{20})$/.exec(location.search);if(t)this.connectToGame(t[1]);else if(location.search){this.vignette.message("Invalid game ID");return}else this.showLobby()}showLobby(){var t,s,i;this.vignette&&this.vignette.message(""),document.body.insertAdjacentHTML("beforeend",`
      <div id="lobby-dialog" style="
        position: fixed;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        background: rgba(0, 0, 0, 0.9);
        color: white;
        padding: 30px;
        border: 2px solid #c0c0f0;
        min-width: 600px;
        max-width: 800px;
        max-height: 80vh;
        overflow-y: auto;
        font-family: sans-serif;
        z-index: 10000;
      ">
        <h1 style="margin: 0 0 20px 0; text-align: center;">Bolo Multiplayer Lobby</h1>

        <div id="active-games-section">
          <h2 style="margin: 20px 0 10px 0;">Active Games</h2>
          <div id="active-games-list" style="margin-bottom: 20px;">
            Loading...
          </div>
        </div>

        <div id="create-game-section">
          <h2 style="margin: 20px 0 10px 0;">Create New Game</h2>
          <div style="margin-bottom: 10px;">
            <label for="map-select">Select Map:</label>
            <select id="map-select" style="margin-left: 10px; padding: 5px; width: 300px;">
              <option value="">Loading maps...</option>
            </select>
          </div>
          <button id="create-game-btn" style="padding: 10px 20px; cursor: pointer;" disabled>Create Game</button>
        </div>

        <div style="margin-top: 30px; text-align: center; border-top: 1px solid #666; padding-top: 20px;">
          <button id="how-to-play-btn" style="padding: 10px 20px; cursor: pointer; margin-right: 10px;">How to Play</button>
          <button id="key-settings-btn" style="padding: 10px 20px; cursor: pointer;">Key Settings</button>
        </div>
      </div>
    `),this.loadMaps(),this.loadGames(),this.lobbyRefreshInterval=window.setInterval(()=>{this.loadGames()},3e3),(t=document.getElementById("create-game-btn"))==null||t.addEventListener("click",()=>{this.createGame()}),(s=document.getElementById("how-to-play-btn"))==null||s.addEventListener("click",()=>{this.showHowToPlay()}),(i=document.getElementById("key-settings-btn"))==null||i.addEventListener("click",()=>{this.showKeySettings()}),window.boloJoinGame=n=>this.connectToGame(n)}async loadMaps(){try{const t=await(await fetch("/api/maps")).json(),s=document.getElementById("map-select");if(!s)return;s.innerHTML=t.map(n=>`<option value="${n.name}">${n.name}</option>`).join("");const i=document.getElementById("create-game-btn");i&&(i.disabled=!1)}catch(e){console.error("Failed to load maps:",e)}}async loadGames(){try{const t=await(await fetch("/api/games")).json(),s=document.getElementById("active-games-list");if(!s)return;t.length===0?s.innerHTML='<p style="color: #888;">No active games. Create one below!</p>':s.innerHTML=t.map(i=>`
          <div style="border: 1px solid #666; padding: 10px; margin-bottom: 10px; display: flex; justify-content: space-between; align-items: center;">
            <div>
              <strong>${i.mapName}</strong>
              <span style="color: #888; margin-left: 10px;">${i.playerCount} player${i.playerCount!==1?"s":""}</span>
            </div>
            <button onclick="window.boloJoinGame('${i.gid}')" style="padding: 5px 15px; cursor: pointer;">Join</button>
          </div>
        `).join("")}catch(e){console.error("Failed to load games:",e)}}async createGame(){const e=document.getElementById("map-select");if(!e||!e.value)return;const t=e.value;try{const s=await fetch("/api/games",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({mapName:t})}),i=await s.json();s.ok?this.connectToGame(i.gid):alert(i.error||"Failed to create game")}catch(s){console.error("Failed to create game:",s),alert("Failed to create game")}}showKeySettings(){var c,f;const e={accelerate:"ArrowUp",decelerate:"ArrowDown",turnLeft:"ArrowLeft",turnRight:"ArrowRight",increaseRange:"KeyL",decreaseRange:"Semicolon",shoot:"Space",layMine:"Tab",tankView:"Enter",pillboxView:"KeyP",autoSlowdown:!0,autoGunsight:!0},t=ze("keyBindings"),s=t?{...e,...JSON.parse(t)}:e,i=d=>{const m={Space:"Spc",ArrowUp:"↑",ArrowDown:"↓",ArrowLeft:"←",ArrowRight:"→",Enter:"Ret",Tab:"Tab",Semicolon:";",Comma:",",Period:".",Slash:"/",Backslash:"\\",BracketLeft:"[",BracketRight:"]",Quote:"'",Backquote:"`",Minus:"-",Equal:"="};return m[d]?m[d]:d.startsWith("Key")?d.substring(3):d.startsWith("Digit")?d.substring(5):d},n=`
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
          background: #c0c0c0;
          border: 2px outset #dfdfdf;
          box-shadow: 2px 2px 8px rgba(0, 0, 0, 0.5);
          padding: 16px;
          min-width: 400px;
          font-family: 'Chicago', 'Charcoal', sans-serif;
          color: black;
        ">
          <div style="
            background: white;
            border: 2px inset #808080;
            padding: 12px;
            margin-bottom: 16px;
            text-align: center;
            font-weight: bold;
          ">Key Settings</div>

          <div style="margin-bottom: 16px;">
            <div style="font-weight: bold; margin-bottom: 8px;">Drive tank</div>
            <div style="display: flex; gap: 8px; margin-bottom: 4px;">
              <label style="width: 120px;">Accelerate:</label>
              <input type="text" readonly class="key-input" data-binding="accelerate"
                value="${i(s.accelerate)}"
                style="
                  width: 80px;
                  border: 1px inset #808080;
                  background: white;
                  padding: 2px 4px;
                  text-align: center;
                  cursor: pointer;
                  font-family: monospace;
                ">
            </div>
            <div style="display: flex; gap: 8px; margin-bottom: 8px;">
              <label style="width: 120px;">Decelerate:</label>
              <input type="text" readonly class="key-input" data-binding="decelerate"
                value="${i(s.decelerate)}"
                style="
                  width: 80px;
                  border: 1px inset #808080;
                  background: white;
                  padding: 2px 4px;
                  text-align: center;
                  cursor: pointer;
                  font-family: monospace;
                ">
            </div>

            <div style="font-weight: bold; margin-bottom: 8px;">Rotate tank</div>
            <div style="display: flex; gap: 8px; margin-bottom: 4px;">
              <label style="width: 120px;">Anti-clockwise:</label>
              <input type="text" readonly class="key-input" data-binding="turnLeft"
                value="${i(s.turnLeft)}"
                style="
                  width: 80px;
                  border: 1px inset #808080;
                  background: white;
                  padding: 2px 4px;
                  text-align: center;
                  cursor: pointer;
                  font-family: monospace;
                ">
            </div>
            <div style="display: flex; gap: 8px; margin-bottom: 8px;">
              <label style="width: 120px;">Clockwise:</label>
              <input type="text" readonly class="key-input" data-binding="turnRight"
                value="${i(s.turnRight)}"
                style="
                  width: 80px;
                  border: 1px inset #808080;
                  background: white;
                  padding: 2px 4px;
                  text-align: center;
                  cursor: pointer;
                  font-family: monospace;
                ">
            </div>

            <div style="font-weight: bold; margin-bottom: 8px;">Gun range</div>
            <div style="display: flex; gap: 8px; margin-bottom: 4px;">
              <label style="width: 120px;">Increase:</label>
              <input type="text" readonly class="key-input" data-binding="increaseRange"
                value="${i(s.increaseRange)}"
                style="
                  width: 80px;
                  border: 1px inset #808080;
                  background: white;
                  padding: 2px 4px;
                  text-align: center;
                  cursor: pointer;
                  font-family: monospace;
                ">
            </div>
            <div style="display: flex; gap: 8px; margin-bottom: 8px;">
              <label style="width: 120px;">Decrease:</label>
              <input type="text" readonly class="key-input" data-binding="decreaseRange"
                value="${i(s.decreaseRange)}"
                style="
                  width: 80px;
                  border: 1px inset #808080;
                  background: white;
                  padding: 2px 4px;
                  text-align: center;
                  cursor: pointer;
                  font-family: monospace;
                ">
            </div>

            <div style="font-weight: bold; margin-bottom: 8px;">Weapons</div>
            <div style="display: flex; gap: 8px; margin-bottom: 4px;">
              <label style="width: 120px;">Shoot:</label>
              <input type="text" readonly class="key-input" data-binding="shoot"
                value="${i(s.shoot)}"
                style="
                  width: 80px;
                  border: 1px inset #808080;
                  background: white;
                  padding: 2px 4px;
                  text-align: center;
                  cursor: pointer;
                  font-family: monospace;
                ">
            </div>
            <div style="display: flex; gap: 8px; margin-bottom: 8px;">
              <label style="width: 120px;">Lay mine:</label>
              <input type="text" readonly class="key-input" data-binding="layMine"
                value="${i(s.layMine)}"
                style="
                  width: 80px;
                  border: 1px inset #808080;
                  background: white;
                  padding: 2px 4px;
                  text-align: center;
                  cursor: pointer;
                  font-family: monospace;
                ">
            </div>

            <div style="font-weight: bold; margin-bottom: 8px;">Switch views</div>
            <div style="display: flex; gap: 8px; margin-bottom: 4px;">
              <label style="width: 120px;">Tank view:</label>
              <input type="text" readonly class="key-input" data-binding="tankView"
                value="${i(s.tankView)}"
                style="
                  width: 80px;
                  border: 1px inset #808080;
                  background: white;
                  padding: 2px 4px;
                  text-align: center;
                  cursor: pointer;
                  font-family: monospace;
                ">
            </div>
            <div style="display: flex; gap: 8px; margin-bottom: 8px;">
              <label style="width: 120px;">Pillbox view:</label>
              <input type="text" readonly class="key-input" data-binding="pillboxView"
                value="${i(s.pillboxView)}"
                style="
                  width: 80px;
                  border: 1px inset #808080;
                  background: white;
                  padding: 2px 4px;
                  text-align: center;
                  cursor: pointer;
                  font-family: monospace;
                ">
            </div>

            <div style="margin-top: 12px;">
              <div style="margin-bottom: 4px;">
                <label style="cursor: pointer;">
                  <input type="checkbox" id="auto-slowdown" ${s.autoSlowdown?"checked":""}>
                  Auto Slowdown
                </label>
              </div>
              <div>
                <label style="cursor: pointer;">
                  <input type="checkbox" id="auto-gunsight" ${s.autoGunsight?"checked":""}>
                  Enable automatic show &amp; hide of gunsight
                </label>
              </div>
            </div>
          </div>

          <div style="text-align: center; display: flex; gap: 8px; justify-content: center;">
            <button id="key-settings-cancel" style="
              padding: 4px 16px;
              border: 2px outset #dfdfdf;
              background: #c0c0c0;
              cursor: pointer;
              min-width: 80px;
            ">Cancel</button>
            <button id="key-settings-ok" style="
              padding: 4px 16px;
              border: 2px outset #dfdfdf;
              background: #c0c0c0;
              cursor: pointer;
              min-width: 80px;
            ">OK</button>
          </div>
        </div>
      </div>
    `;document.body.insertAdjacentHTML("beforeend",n);const r={...s};let l=null;const o=Array.from(document.querySelectorAll(".key-input")),h=d=>{l=d,d.value="...",d.style.background="#ffffcc"};o.forEach(d=>{d.addEventListener("click",m=>{const y=m.target;h(y)})});const u=d=>{if(!l)return;d.preventDefault(),d.stopPropagation();const m=l.getAttribute("data-binding");if(!m)return;r[m]=d.code,l.value=i(d.code),l.style.background="white";const p=o.indexOf(l)+1;p<o.length?h(o[p]):l=null};document.addEventListener("keydown",u),(c=document.getElementById("key-settings-cancel"))==null||c.addEventListener("click",()=>{var d;document.removeEventListener("keydown",u),(d=document.getElementById("key-settings-overlay"))==null||d.remove()}),(f=document.getElementById("key-settings-ok"))==null||f.addEventListener("click",()=>{var d,m,y;r.autoSlowdown=(d=document.getElementById("auto-slowdown"))==null?void 0:d.checked,r.autoGunsight=(m=document.getElementById("auto-gunsight"))==null?void 0:m.checked,Xe("keyBindings",JSON.stringify(r)),document.removeEventListener("keydown",u),(y=document.getElementById("key-settings-overlay"))==null||y.remove(),this.updateKeyBindings&&this.updateKeyBindings(r)})}showHowToPlay(){var t,s;document.body.insertAdjacentHTML("beforeend",`
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
          background: #c0c0c0;
          border: 2px outset #dfdfdf;
          box-shadow: 2px 2px 8px rgba(0, 0, 0, 0.5);
          padding: 16px;
          max-width: 700px;
          max-height: 85vh;
          overflow-y: auto;
          font-family: 'Chicago', 'Charcoal', sans-serif;
          color: black;
        ">
          <div style="
            background: white;
            border: 2px inset #808080;
            padding: 12px;
            margin-bottom: 16px;
            text-align: center;
            font-weight: bold;
            font-size: 16px;
          ">How to Play Bolo</div>

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
                padding: 8px 32px;
                border: 2px outset #dfdfdf;
                background: #c0c0c0;
                cursor: pointer;
                font-family: 'Chicago', 'Charcoal', sans-serif;
                font-weight: bold;
              ">Close</button>
            </div>
          </div>
        </div>
      </div>
    `),(t=document.getElementById("how-to-play-close"))==null||t.addEventListener("click",()=>{var i;(i=document.getElementById("how-to-play-overlay"))==null||i.remove()}),(s=document.getElementById("how-to-play-overlay"))==null||s.addEventListener("click",i=>{var n;i.target===document.getElementById("how-to-play-overlay")&&((n=document.getElementById("how-to-play-overlay"))==null||n.remove())})}updateKeyBindings(e){this.keyBindings=e}connectToGame(e){var i,n;this.lobbyRefreshInterval&&(clearInterval(this.lobbyRefreshInterval),this.lobbyRefreshInterval=void 0),(i=document.getElementById("lobby-dialog"))==null||i.remove(),(n=this.vignette)==null||n.message("Connecting to game...");const t=e==="demo"?"/demo":`/match/${e}`,s=location.protocol==="https:"?"wss:":"ws:";this.ws=new WebSocket(`${s}//${location.host}${t}`),this.ws.addEventListener("open",()=>{this.connected()},{once:!0}),this.ws.addEventListener("close",()=>{this.failure("Connection lost")},{once:!0})}connected(){this.vignette&&(this.vignette.message("Waiting for the game map"),this.ws&&this.ws.addEventListener("message",e=>{this.receiveMap(e)},{once:!0}))}receiveMap(e){this.map=it.load(me(e.data)),this.commonInitialization(),this.vignette&&this.vignette.message("Waiting for the game state"),this.ws&&this.ws.addEventListener("message",t=>{this.handleMessage(t)})}synchronized(){this._isSynchronized=!0,this.rebuildMapObjects(),this.vignette&&(this.vignette.destroy(),this.vignette=null),this.loop.start();const e=[0,0,0,0,0,0];for(const f of this.tanks)f.team>=0&&f.team<6&&e[f.team]++;const t=["red","blue","yellow","green","orange","purple"];let s=Math.min(...e),i=t[e.indexOf(s)];const n=document.createElement("div");n.innerHTML=Ss;const r=n.firstElementChild;r.style.position="fixed",r.style.top="50%",r.style.left="50%",r.style.transform="translate(-50%, -50%)",r.style.zIndex="10000";const l=document.createElement("div");l.style.cssText=`
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: rgba(0, 0, 0, 0.5);
      z-index: 9999;
    `,document.body.appendChild(l),document.body.appendChild(r),this.joinDialog=r;const o=r.querySelector("#join-nick-field");o&&(o.value=ze("nick")||"",o.focus(),o.addEventListener("keydown",f=>{f.which===13&&this.join()}));const h=r.querySelector(`#join-team-${i}`);if(h){h.checked=!0;const f=r.querySelector(`label[for="join-team-${i}"] span`);f&&(f.style.border="2px inset #808080")}r.querySelectorAll('#join-team input[type="radio"]').forEach(f=>{f.addEventListener("change",d=>{const m=d.target;r.querySelectorAll("#join-team label span").forEach(p=>{p.style.border="2px outset #dfdfdf"});const y=r.querySelector(`label[for="${m.id}"] span`);y&&(y.style.border="2px inset #808080")})});const c=r.querySelector("#join-submit");c&&c.addEventListener("click",()=>{this.join()})}join(){if(!this.joinDialog)return;const e=this.joinDialog.querySelector("#join-nick-field"),t=e==null?void 0:e.value,s=this.joinDialog.querySelector("#join-team input:checked"),i=s==null?void 0:s.value;let n;switch(i){case"red":n=0;break;case"blue":n=1;break;case"yellow":n=2;break;case"green":n=3;break;case"orange":n=4;break;case"purple":n=5;break;default:n=-1}if(!t||n===-1)return;Xe("nick",t);const r=this.joinDialog.parentElement,l=r==null?void 0:r.querySelector('div[style*="z-index: 9999"]');l&&l.remove(),this.joinDialog.remove(),this.joinDialog=null,this.ws&&this.ws.send(JSON.stringify({command:"join",nick:t,team:n})),this.input.focus()}receiveWelcome(e){this.player=e,this.renderer.initHud(),this.initChat()}tick(){super.tick(),this.increasingRange!==this.decreasingRange?++this.rangeAdjustTimer===6&&(this.ws&&(this.increasingRange?(this.ws.send(ks),this.keyBindings.autoGunsight&&this.player&&this.player.firingRange===7&&(this.gunsightVisible=!1)):(this.ws.send(vs),this.keyBindings.autoGunsight&&(this.gunsightVisible=!0))),this.rangeAdjustTimer=0):this.rangeAdjustTimer=0,++this.heartbeatTimer===10&&(this.heartbeatTimer=0,this.ws&&this.ws.send(""))}failure(e){this.ws&&(this.ws.close(),this.ws=null),super.failure(e)}soundEffect(e,t,s,i){}netSpawn(e,t){const s=super.netSpawn(e,t);return this.rebuildMapObjects(),s}netDestroy(e,t){const s=super.netDestroy(e,t);return this.rebuildMapObjects(),s}mapChanged(e,t,s,i){this.processingServerMessages||this.mapChanges[e.idx]==null&&(e._net_oldType=t,e._net_hadMine=s,e._net_oldLife=i,this.mapChanges[e.idx]=e)}initChat(){this.chatMessages=document.createElement("div"),this.chatMessages.id="chat-messages",this.renderer.hud.appendChild(this.chatMessages),this.chatContainer=document.createElement("div"),this.chatContainer.id="chat-input",this.chatContainer.style.display="none",this.renderer.hud.appendChild(this.chatContainer),this.chatInput=document.createElement("input"),this.chatInput.type="text",this.chatInput.name="chat",this.chatInput.maxLength=140,this.chatInput.addEventListener("keydown",e=>this.handleChatKeydown(e)),this.chatContainer.appendChild(this.chatInput)}openChat(e){e=e||{},this.chatContainer.style.display="block",this.chatInput.value="",this.chatInput.focus(),this.chatInput.team=e.team}commitChat(){this.ws&&this.ws.send(JSON.stringify({command:this.chatInput.team?"teamMsg":"msg",text:this.chatInput.value})),this.closeChat()}closeChat(){this.chatContainer.style.display="none",this.input.focus()}receiveChat(e,t,s){s=s||{};const i=document.createElement("p");i.className=s.team?"msg-team":"msg",i.textContent=`<${e.name}> ${t}`,this.chatMessages.appendChild(i),window.setTimeout(()=>{i.remove()},7e3)}handleKeydown(e){if(!this.ws||!this.player)return;const t=e.code,s=this.keyBindings;t===s.shoot?this.ws.send(ys):t===s.layMine?this.ws.send(xs):t===s.turnLeft?this.ws.send(us):t===s.accelerate?(this.ws.send(ms),this.autoSlowdownActive&&(this.ws.send(Ve),this.autoSlowdownActive=!1)):t===s.turnRight?this.ws.send(fs):t===s.decelerate?(this.ws.send(Fe),this.autoSlowdownActive=!1):t===s.tankView?this.switchToTankView():t===s.pillboxView?this.switchToPillboxView():t==="KeyT"?this.openChat():t==="KeyR"&&this.openChat({team:!0})}handleKeyup(e){if(!this.ws||!this.player)return;const t=e.code,s=this.keyBindings;t===s.shoot?this.ws.send(ws):t===s.layMine?this.ws.send(Ts):t===s.turnLeft?this.ws.send(ps):t===s.accelerate?(this.ws.send(bs),s.autoSlowdown&&(this.ws.send(Fe),this.autoSlowdownActive=!0)):t===s.turnRight?this.ws.send(gs):t===s.decelerate&&(this.ws.send(Ve),this.autoSlowdownActive=!1)}handleChatKeydown(e){if(!(!this.ws||!this.player)){switch(e.which){case 13:this.commitChat();break;case 27:this.closeChat();break;default:return}e.preventDefault()}}buildOrder(e,t,s){!this.ws||!this.player||(t=t||0,this.ws.send([Cs,e,t,s.x,s.y].join(",")))}switchToPillboxView(){if(!this.player||!this.map)return;const e=this.map.pills.filter(t=>t&&!t.inTank&&!t.carried&&t.armour>0&&t.team===this.player.team);e.length!==0&&(this.viewMode==="tank"?(this.viewMode="pillbox",this.currentPillboxIndex=0):this.currentPillboxIndex=(this.currentPillboxIndex+1)%e.length)}switchToTankView(){this.viewMode="tank",this.currentPillboxIndex=0}getViewTarget(){if(this.viewMode==="tank"||!this.player||!this.map)return null;const e=this.map.pills.filter(t=>t&&!t.inTank&&!t.carried&&t.armour>0&&t.team===this.player.team);return e.length===0||this.currentPillboxIndex>=e.length?(this.viewMode="tank",null):e[this.currentPillboxIndex]}handleMessage(e){let t=null;if(e.data.charAt(0)==="{")try{this.handleJsonCommand(JSON.parse(e.data))}catch(s){t=s}else if(e.data.charAt(0)==="[")try{const s=JSON.parse(e.data);for(const i of s)this.handleJsonCommand(i)}catch(s){t=s}else{this.netRestore();try{const s=me(e.data);let i=0;const n=s.length;for(this.processingServerMessages=!0,this.objectsCreatedInThisPacket.clear();i<n;){const r=s[i++],l=this.handleBinaryCommand(r,s,i);i+=l}this.processingServerMessages=!1,i!==n&&(t=new Error(`Message length mismatch, processed ${i} out of ${n} bytes`))}catch(s){t=s}}if(t)throw this.failure("Connection lost (protocol error)"),console&&console.log("Following exception occurred while processing message:",e.data),t}handleBinaryCommand(e,t,s){switch(e){case is:return this.synchronized(),0;case ns:{const[[i],n]=G("H",t,s);return this.receiveWelcome(this.objects[i]),n}case rs:return this.netSpawn(t,s);case os:return this.netDestroy(t,s);case ls:{const[[i,n,r,l,o],h]=G("BBBBf",t,s),u=String.fromCharCode(r),c=this.map.cells[n][i];return c.setType(u,o),c.life=l,h}case cs:{const[[i,n,r,l],o]=G("BHHH",t,s);return this.renderer.playSound(i,n,r,this.objects[l]),o}case hs:{const[[i],n]=G("H",t,s),r=this.objects[i],l=!this._isSynchronized||r&&r._createdViaMessage,o=r&&r.load?r.load(t,s+n,l):0;return r&&this.objectsCreatedInThisPacket.add(r),r&&r._createdViaMessage&&delete r._createdViaMessage,n+o}case as:return this.netTick(t,s,this.objectsCreatedInThisPacket);case ds:{const[i,n]=G("HHHHHH",t,s);return this.teamScores=i.map(r=>r/100),n}default:throw new Error(`Bad command '${e}' from server, at offset ${s-1}`)}}handleJsonCommand(e){switch(e.command){case"nick":this.objects[e.idx]&&(this.objects[e.idx].name=e.nick);break;case"msg":this.objects[e.idx]&&this.receiveChat(this.objects[e.idx],e.text);break;case"teamMsg":this.objects[e.idx]&&this.receiveChat(this.objects[e.idx],e.text,{team:!0});break;default:throw new Error(`Bad JSON command '${e.command}' from server.`)}}rebuildMapObjects(){this.map.pills=[],this.map.bases=[];for(const e of this.objects){if(e instanceof te)this.map.pills.push(e);else if(e instanceof se)this.map.bases.push(e);else continue;e.cell&&e.cell.retile()}}netRestore(){super.netRestore();for(const e in this.mapChanges){const t=this.mapChanges[e];t.setType(t._net_oldType,t._net_hadMine),t.life=t._net_oldLife}this.mapChanges={}}}Ce(Ie.prototype,Ee);As.registerWithWorld(Ie.prototype);const Es=location.search==="?local"||location.hostname.split(".")[1]==="github"?Be:Ie;window.addEventListener("load",function(){const a=new Es;window.world=a,a.start()});
