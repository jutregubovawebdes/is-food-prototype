import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const root=new URL('../public/',import.meta.url);
const app=readFileSync(new URL('app.js',root),'utf8');
function extract(name,next){
  return app.slice(app.indexOf('  function '+name),app.indexOf(next,app.indexOf('  function '+name)));
}
const logic=extract('nextMealDate','  const menuDate')+extract('canChangeOrder','  const deadlineNotice');
const ctx={Intl,Date};
vm.createContext(ctx);
vm.runInContext(logic,ctx);
test('all scripts parse',()=>{
  for(const f of ['app.js','config.js','fixtures.js'])new vm.Script(readFileSync(new URL(f,root),'utf8'),{filename:f});
});
test('initial state has 500 rubles and no orders or selected quantities',()=>{
  const initial=app.slice(app.indexOf("  let page="),app.indexOf('  function canChangeOrder'));
  const state=vm.runInNewContext(initial+'\n({page,balance,current,past,history,counts,sequence,cash,editing})',{data:[{},{},{}]});
  assert.equal(state.page,'menu');
  assert.equal(state.balance,500);
  assert.equal(state.current,null);
  assert.equal(state.past.length,0);
  assert.equal(state.history.length,7);
  assert.deepEqual(Array.from(state.counts),[0,0,0]);
  assert.equal(state.sequence,1);
  assert.equal(state.cash,false);
  assert.equal(state.editing,false);
});
test('accounts isolate orders, balances, drafts and history across switching and sign-out',()=>{
  const initial=app.slice(app.indexOf("  let page="),app.indexOf('  function canChangeOrder'));
  const sandbox=vm.createContext({data:[{},{},{}],render:()=>{}});
  const run=code=>vm.runInContext(code,sandbox);
  run(initial);
  assert.equal(run('accounts.filter(a=>a.connected).length'),2);
  assert.equal(run('activeAccount.name'),'Иван Иванов');
  assert.equal(run('accounts[1].name'),'Анна Петрова');
  run("page='profile'; counts[0]=1; cash=true; signIn('anna@food.local')");
  assert.equal(run('page'),'profile');
  assert.equal(run('activeAccount.name'),'Анна Петрова');
  assert.equal(run('balance'),500);
  assert.equal(run('counts[0]'),0);
  assert.equal(run('cash'),false);
  run("balance=61; current={id:1,total:439}; counts[1]=1; history.push({amount:-10}); switchAccount('user@food.local')");
  assert.equal(run('balance'),500);
  assert.equal(run('current'),null);
  assert.equal(run('counts[0]'),1);
  assert.equal(run('counts[1]'),0);
  assert.equal(run('cash'),true);
  assert.equal(run('history.length'),7);
  run("switchAccount('anna@food.local')");
  assert.equal(run('page'),'profile');
  assert.equal(run('balance'),61);
  assert.equal(run('history.length'),5);
  assert.equal(run('current.total'),439);
  run('logoutAccount()');
  assert.equal(run('activeAccount.email'),'user@food.local');
  assert.equal(run('logged'),true);
  assert.equal(run('accounts.filter(a=>a.connected).length'),1);
  run("signIn(' ANNA@FOOD.LOCAL ')");
  assert.equal(run('accounts.length'),2);
  assert.equal(run('current.total'),439);
  assert.equal(run('balance'),61);
  run("signIn('anna@food.local')");
  assert.equal(run('accounts.length'),2);
  run("logoutAccount(); logoutAccount()");
  assert.equal(run('logged'),false);
  run("signIn('user@food.local')");
  assert.equal(run('page'),'menu');
});
test('mock histories cover existing operation types and reconcile card balance',()=>{
  const initial=app.slice(app.indexOf("  let page="),app.indexOf('  function canChangeOrder'));
  const sandbox=vm.createContext({data:[{},{},{}]});
  vm.runInContext(initial,sandbox);
  const histories=vm.runInContext("[mockHistory('user@food.local'),mockHistory('anna@food.local')]",sandbox);
  for(const history of histories){
    assert.equal(history.filter(h=>h.source==='card').reduce((sum,h)=>sum+h.amount,0),500);
  }
  const ivan=histories[0];
  for(const type of ['начисление','Сгорание','Списание','СБП'])assert.ok(ivan.some(h=>h.text.includes(type)));
  assert.equal(histories[1].length,4);
  const copies=vm.runInContext("const a=mockHistory('anna@food.local'); a[0].amount=0; mockHistory('anna@food.local')[0].amount",sandbox);
  assert.equal(copies,500);
});
test('meal date skips weekend',()=>{
  assert.equal(ctx.nextMealDate('20.10.2026'),'21.10.2026');
  assert.equal(ctx.nextMealDate('23.10.2026'),'26.10.2026');
  assert.equal(ctx.nextMealDate('24.10.2026'),'26.10.2026');
  assert.equal(ctx.nextMealDate('31.12.2026'),'01.01.2027');
});
test('cutoff is ordering day at 15:00 Yekaterinburg',()=>{
  const o={orderDate:'23.10.2026',date:'26.10.2026'};
  assert.equal(ctx.canChangeOrder(o,new Date('2026-10-23T09:59:59Z')),true);
  assert.equal(ctx.canChangeOrder(o,new Date('2026-10-23T10:00:00Z')),false);
  assert.equal(ctx.canChangeOrder(o,new Date('2026-10-26T06:00:00Z')),false);
});
test('no external runtime endpoints or auto-refund entries',()=>{
  assert.doesNotMatch(app.replaceAll('http://www.w3.org/2000/svg',''),/\bfetch\s*\(|XMLHttpRequest|https?:\/\//);
  assert.doesNotMatch(app,/Вернётся по СБП|вернутся по СБП|addHistory\([^;\n]*Возврат/);
  assert.match(app,/чат «ITIS обеды» в Telegram или MAX/);
  const html=readFileSync(new URL('index.html',root),'utf8');
  assert.match(html,/connect-src 'none'/);
});
