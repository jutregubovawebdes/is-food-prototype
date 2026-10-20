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
function cardSandbox(){
  const initial=app.slice(app.indexOf("  let page="),app.indexOf('  function canChangeOrder'));
  const sandbox=vm.createContext({data:[{},{},{}],render:()=>{}});
  vm.runInContext(initial,sandbox);
  return code=>vm.runInContext(code,sandbox);
}
test('one employee switches cards without changing authentication or shared card state',()=>{
  const run=cardSandbox();
  assert.equal(run('cards.filter(c=>c.connected).length'),2);
  assert.equal(run('employee.name'),'Иван Иванов');
  run("page='profile'; counts[0]=1; cash=true; switchCard('2384')");
  assert.equal(run('employee.name'),'Иван Иванов');
  assert.equal(run('activeCard.name'),'Анна Петрова');
  assert.equal(run('page'),'profile');
  assert.equal(run('balance'),500);
  assert.equal(run('counts[0]'),0);
  run("balance=61; current={id:1,total:439}; switchCard('1771')");
  assert.equal(run('balance'),500);
  assert.equal(run('current'),null);
  assert.equal(run('counts[0]'),1);
  assert.equal(run('cash'),true);
  run("switchCard('2384'); logoutAccount()");
  assert.equal(run('logged'),false);
  assert.equal(run('cards.filter(c=>c.connected).length'),2);
  run('signIn()');
  assert.equal(run('page'),'menu');
  assert.equal(run('balance'),61);
  assert.equal(run('current.total'),439);
});
test('card lookup accepts only known numbers and rejects duplicates',()=>{
  const run=cardSandbox();
  for(const number of ['','abc','9999','1771']){
    assert.equal(run('addCard('+JSON.stringify(number)+')'),false);
    assert.ok(run('cardError.length')>0);
  }
  assert.equal(run("addCard(' 3096 ')"),true);
  assert.equal(run('activeCard.name'),'Алексей Смирнов');
  assert.equal(run('activeCard.card'),'3096');
  assert.equal(run('balance'),500);
  assert.equal(run('employee.name'),'Иван Иванов');
  assert.equal(run("addCard('3096')"),false);
});
test('primary card cannot be removed; colleague cards preserve data when re-added',()=>{
  const run=cardSandbox();
  run("removeCard('1771')");
  assert.equal(run('activeCard.card'),'1771');
  assert.equal(run('cards[0].connected'),true);
  run("switchCard('2384'); balance=8; current={id:7,total:492}; removeCard('1771')");
  assert.equal(run('activeCard.card'),'2384');
  assert.equal(run('cards[0].connected'),true);
  run("removeCard('2384')");
  assert.equal(run('activeCard.card'),'1771');
  assert.equal(run('balance'),500);
  assert.equal(run('current'),null);
  assert.equal(run('logged'),true);
  assert.equal(run("addCard('2384')"),true);
  assert.equal(run('balance'),8);
  assert.equal(run('current.id'),7);
  assert.equal(run('cards.length'),2);
  run('logoutAccount()');
  assert.equal(run("addCard('3096')"),false);
});
test('profile always renders primary card and management hides its delete control',()=>{
  const initial=app.slice(app.indexOf("  let page="),app.indexOf('  function canChangeOrder'));
  const sandbox=vm.createContext({data:[{},{},{}],render:()=>{},esc:String,money:n=>n+' ₽'});
  vm.runInContext(initial+extract('profile','  function render'),sandbox);
  vm.runInContext("switchCard('2384')",sandbox);
  const html=vm.runInContext('profile()',sandbox);
  assert.ok(html.includes('Основная карта</dt><dd>№1771'));
  assert.match(html,/Выбранная карта/);
  assert.match(html,/Карта №2384/);
  const management=vm.runInContext("modal='cards'; dialog()",sandbox);
  assert.match(management,/Карта вашего аккаунта/);
  assert.doesNotMatch(management,/data-remove-card="1771"/);
  assert.match(management,/data-remove-card="2384"/);
});
test('payment link matches supplied QR destination and uses selected card number',()=>{
  const run=cardSandbox();
  assert.equal(run('paymentUrl'),'https://qr.nspk.ru/AS1A003JV14RD88D8I3P5RP7CHRVCP9U?type=01&bank=100000000111&crc=6C46');
  assert.ok(app.includes('href="${esc(paymentUrl)}" target="_blank" rel="noopener noreferrer"'));
  assert.ok(app.includes('номер выбранной карты Тимьян: <strong>${esc(activeCard.card)}'));
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
  assert.doesNotMatch(app,/\bfetch\s*\(|XMLHttpRequest/);
  assert.doesNotMatch(app,/Вернётся по СБП|вернутся по СБП|addHistory\([^;\n]*Возврат/);
  assert.match(app,/чат «ITIS обеды» в Telegram или MAX/);
  const html=readFileSync(new URL('index.html',root),'utf8');
  assert.match(html,/connect-src 'none'/);
});
