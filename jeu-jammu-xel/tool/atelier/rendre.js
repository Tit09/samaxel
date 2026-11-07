const {chromium}=require('playwright');const fs=require('fs');
const ids=process.argv.slice(2);
(async()=>{const b=await chromium.launch();const p=await b.newPage({viewport:{width:1600,height:900}});
p.on('pageerror',e=>console.log('ERR',e.message));fs.mkdirSync('sortie',{recursive:true});
for(const id of ids){await p.goto('file://'+process.cwd()+'/atelier.html?id='+id);await p.evaluate(()=>document.fonts.ready);
 await p.locator('#s').screenshot({path:`sortie/${id}.png`,omitBackground:!id.startsWith('f_')});}
await b.close()})();
