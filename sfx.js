/* KOHbツ.FM — мягкие синтезированные звуки. Громкость: cfg.sndVol (0–100), по умолчанию 25 */
(function(){let A=null,M=null;
const vol=()=>{if(typeof window.SFX_VOL==="number")return window.SFX_VOL/100;try{const v=JSON.parse(localStorage.getItem(window.SFX_KEY||"kohb_cfg")).sndVol;return(v==null?25:v)/100}catch(e){return .25}};
const ac=()=>{try{if(!A){A=new(window.AudioContext||window.webkitAudioContext)();const g=A.createGain(),f=A.createBiquadFilter(),c=A.createDynamicsCompressor();f.type="lowpass";f.frequency.value=2800;g.connect(f);f.connect(c);c.connect(A.destination);M=g}if(A.state==="suspended")A.resume();M.gain.value=vol()}catch(e){}return A};
function tone(f,t,d,ty,g,f2,lp){const a=ac(),T=a.currentTime+t,o=a.createOscillator(),v=a.createGain();o.type=ty;o.frequency.setValueAtTime(f,T);if(f2)o.frequency.exponentialRampToValueAtTime(f2,T+d);
  v.gain.setValueAtTime(0,T);v.gain.linearRampToValueAtTime(g,T+.04);v.gain.setValueAtTime(g,T+d*.6);v.gain.exponentialRampToValueAtTime(.0001,T+d);
  let n=o;if(lp){const q=a.createBiquadFilter();q.type="lowpass";q.frequency.value=lp;o.connect(q);n=q}n.connect(v);v.connect(M);o.start(T);o.stop(T+d+.05)}
function noise(t,d,g,fq){const a=ac(),T=a.currentTime+t,n=Math.floor(a.sampleRate*d),b=a.createBuffer(1,n,a.sampleRate),x=b.getChannelData(0);for(let i=0;i<n;i++)x[i]=Math.random()*2-1;
  const s=a.createBufferSource(),f=a.createBiquadFilter(),v=a.createGain();s.buffer=b;f.type="bandpass";f.frequency.value=fq;f.Q.value=.8;v.gain.setValueAtTime(0,T);v.gain.linearRampToValueAtTime(g,T+.02);v.gain.exponentialRampToValueAtTime(.0001,T+d);s.connect(f);f.connect(v);v.connect(M);s.start(T)}
window.SFX={
  jingle(){[659,784,988].forEach((f,i)=>tone(f,i*.1,.45,"sine",.22))},
  applause(){for(let i=0;i<55;i++)noise(i*.05+Math.random()*.04,.16,.12,800+Math.random()*1800)},
  horn(){[[0,.3],[.36,.3],[.72,.9]].forEach(([t,d])=>[392,494,587].forEach(f=>tone(f,t,d,"sawtooth",.05,f*.97,1400)))},
  pop(){tone(880,0,.12,"sine",.18,1320);tone(1320,.06,.14,"sine",.1)},
  chime(){[523,659,784,1047].forEach((f,i)=>tone(f,i*.09,.4,"sine",.16))},
  fail(){[[0,.28,233],[.3,.28,220],[.6,.28,208],[.9,.9,196]].forEach(([t,d,f],i)=>tone(f,t,d,"sawtooth",.1,i===3?f*.7:f*.97,900))}
};})();
