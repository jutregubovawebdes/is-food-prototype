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
  const state=vm.runInNewContext(initial+'\n({balance,current,past,history,counts,sequence,cash,editing})',{data:[{},{},{}]});
  assert.equal(state.balance,500);
  assert.equal(state.current,null);
  assert.equal(state.past.length,0);
  assert.equal(state.history.length,0);
  assert.deepEqual(Array.from(state.counts),[0,0,0]);
  assert.equal(state.sequence,1);
  assert.equal(state.cash,false);
  assert.equal(state.editing,false);
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
  assert.match(app,/столовую «Тимьян»/);
  const html=readFileSync(new URL('index.html',root),'utf8');
  assert.match(html,/connect-src 'none'/);
});
