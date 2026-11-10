const {chromium}=require('playwright');(async()=>{const b=await chromium.launch();
let p=await b.newPage({viewport:{width:1080,height:1080}});await p.goto('file://'+__dirname+'/feed.html');await p.screenshot({path:__dirname+'/anuncio-feed.png'});
p=await b.newPage({viewport:{width:540,height:1000},deviceScaleFactor:2});await p.goto('file://'+__dirname+'/preview.html');await p.screenshot({path:__dirname+'/preview-facebook.png',fullPage:true});
await b.close()})();
