// 로컬 확인용 간단 서버 (배포에는 필요 없음): node .serve.cjs
const http=require('http'),fs=require('fs'),path=require('path');
const root=__dirname, port=process.env.PORT||5178;
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.png':'image/png','.webmanifest':'application/manifest+json','.json':'application/json','.sql':'text/plain; charset=utf-8'};
http.createServer((req,res)=>{
  let p=decodeURIComponent(new URL(req.url,'http://x').pathname); if(p.endsWith('/')) p+='index.html';
  const f=path.join(root,p); if(!f.startsWith(root)){res.writeHead(403);return res.end();}
  fs.readFile(f,(err,buf)=>{ if(err){res.writeHead(404);return res.end('not found');} res.writeHead(200,{'Content-Type':types[path.extname(f)]||'application/octet-stream','Cache-Control':'no-cache'}); res.end(buf); });
}).listen(port,()=>console.log('http://localhost:'+port));
