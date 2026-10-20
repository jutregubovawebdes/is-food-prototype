import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
const files = new Map([
  ['/', ['index.html', 'text/html']], ['/index.html', ['index.html', 'text/html']],
  ['/preview', ['preview.html', 'text/html']], ['/preview.html', ['preview.html', 'text/html']],
  ...['app.js','fixtures.js','config.js'].map(f=>['/'+f,[f,'text/javascript']]),
  ['/styles.css',['styles.css','text/css']]
]);
const port=Number(process.env.PORT||4173);
createServer(async(req,res)=>{
  if(req.method!=='GET'&&req.method!=='HEAD'){res.writeHead(405);res.end();return}
  const target=files.get(new URL(req.url,'http://localhost').pathname);
  if(!target){res.writeHead(404);res.end('Not found');return}
  try{
    const body=await readFile(new URL('./public/'+target[0],import.meta.url));
    res.writeHead(200,{'Content-Type':target[1]+'; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});
    res.end(req.method==='HEAD'?undefined:body);
  }catch{res.writeHead(500);res.end('Unable to serve file')}
}).listen(port,'127.0.0.1',()=>console.log('IS.Food: http://127.0.0.1:'+port));
