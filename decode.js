const hex = "98010c9400000300000a00010000000000803f0000803f0000c03f000034420101020100000001010f00000078000000010f01010000000b05000000030000000a08020000000200000f05040000000300003c0a00030000000200001e0f090000000200000f1e0a0000000300000f1e01080000000200000a010c00000001000003120000000100000f13000000010000321500000001000014ffffff7f0106e696b0e6898b";
const buf = Buffer.from(hex, "hex");
let p = 0;
const u8 = () => buf.readUInt8(p++);
const u32 = () => { const v = buf.readUInt32LE(p); p += 4; return v; };
const i32 = () => { const v = buf.readInt32LE(p); p += 4; return v; };
const f32 = () => { const v = buf.readFloatLE(p); p += 4; return v; };
const u16 = () => { const v = buf.readUInt16LE(p); p += 2; return v; };
const packed = () => { let v = 0, s = 0, b; do { b = u8(); v |= (b & 0x7f) << s; s += 7; } while (b & 0x80); return v >>> 0; };

console.log("total bytes:", buf.length);
const optLen = packed();
console.log("WriteBytesAndSize length:", optLen, "at end offset", p);
const version = u8();
console.log("version:", version);
const msgLen = u16(); const msgTag = u8();
console.log("inner msg len:", msgLen, "tag:", msgTag);
const msgStart = p;
console.log("gameMode:", u8(), "(3=NormalFools)");
console.log("specialMode:", u8());
console.log("rulesPreset:", u8());
console.log("maxPlayers:", u8());
console.log("keywords:", u32());
console.log("map:", u8(), "(0=Skeld)");
console.log("playerSpeed:", f32());
console.log("crewLight:", f32());
console.log("impLight:", f32());
console.log("killCooldown:", f32());
console.log("commonTasks:", u8());
console.log("longTasks:", u8());
console.log("shortTasks:", u8());
console.log("numEmergencies:", i32());
console.log("numImpostors:", u8());
console.log("killDistance:", u8());
console.log("discussionTime:", i32());
console.log("votingTime:", i32());
console.log("isDefaults:", u8());
console.log("emergencyCooldown:", u8());
console.log("confirm:", u8());
console.log("visual:", u8());
console.log("anonymous:", u8());
console.log("taskbar:", u8());
console.log("tag:", u8());
const nroles = packed();
console.log("numRoles:", nroles);
const roleNames = {2:"Scientist",3:"Engineer",4:"GuardianAngel",5:"Shapeshifter",8:"Noisemaker",9:"Phantom",10:"Tracker",12:"Detective",18:"Viper",19:"Judge",21:"SpiritGuide"};
for (let i=0;i<nroles;i++){
  const rt = u16(); const max = u8(); const chance = u8();
  const mlen = u16(); const mtag = u8();
  const opts=[];
  const mstart=p;
  // dump option bytes (we don't know exact layout per role, just hex)
  const obuf = buf.slice(p, p+mlen);
  p += mlen;
  console.log(`  role ${rt}(${roleNames[rt]||"?"}) max=${max} chance=${chance} optLen=${mlen} optHex=${obuf.toString("hex")}`);
}
console.log("after roles offset:", p, "of", buf.length, "remaining:", buf.length - p);
// remaining: crossplayFlags uint32 + numFilters packed + filter strings
if (p < buf.length) {
  console.log("crossplayFlags:", u32());
  const nf = packed();
  console.log("numFilters:", nf);
  for (let i=0;i<nf;i++){ const len=u8(); const s=buf.slice(p,p+len).toString("utf8"); p+=len; console.log("  filter:", s); }
}
console.log("final offset:", p, "total:", buf.length);
