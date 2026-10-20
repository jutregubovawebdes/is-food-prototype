(function(sets){
  'use strict';
  const root=document.getElementById('prototype');
  const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const money=n=>n.toLocaleString('ru-RU')+' ₽';
  const config=window.IS_FOOD_CONFIG;
  const clock=()=>config.fixedNow?new Date(config.fixedNow):new Date();
  const today=new Intl.DateTimeFormat('ru-RU',{timeZone:config.timeZone,day:'2-digit',month:'2-digit',year:'numeric'}).format(clock());
  // The menu date is the meal date; the cutoff belongs to the ordering day.
  function nextMealDate(orderDate){
    const [day,month,year]=orderDate.split('.').map(Number);
    const date=new Date(Date.UTC(year,month-1,day));
    do{date.setUTCDate(date.getUTCDate()+1)}while(date.getUTCDay()===0||date.getUTCDay()===6);
    return [String(date.getUTCDate()).padStart(2,'0'),String(date.getUTCMonth()+1).padStart(2,'0'),date.getUTCFullYear()].join('.');
  }
  const menuDate=nextMealDate(today);
  const stamp=()=>today+', '+clock().toLocaleTimeString('ru-RU',{timeZone:config.timeZone,hour:'2-digit',minute:'2-digit'});
  const data=sets.map(s=>({...s,cost:parseInt(s.price.replace(/\s/g,''))}));
  let page='menu',balance=500,selected=0,counts=data.map(()=>0),editing=false,cash=false,modal=null,notice='',busy=false,logged=true,sequence=1;
  let current=null;
  let past=[];
  let history=mockHistory('user@food.local');
  const accounts=[
    makeAccount('user@food.local','Иван Иванов','1771'),
    makeAccount('anna@food.local','Анна Петрова','2384')
  ];
  let activeAccount=accounts[0];
  let modalReturnFocus='account-switch';
  let quickOpen=false;
  function makeAccount(email,name,card){
    return {email,name,card,connected:true,state:{balance:500,selected:0,counts:data.map(()=>0),editing:false,cash:false,current:null,past:[],history:mockHistory(email),sequence:1}};
  }
  function mockHistory(email){
    // Completed past operations only. SBP is paid separately, not from the card.
    if(email==='user@food.local')return [
      {amount:500,text:'Еженедельное начисление',date:'19.10.2026, 00:01',source:'card'},
      {amount:-500,text:'Списание за обед на 16.10.2026',date:'16.10.2026, 08:00',source:'card'},
      {amount:-240,text:'Оплата по СБП за обед на 16.10.2026',date:'15.10.2026, 12:40',source:'sbp'},
      {amount:500,text:'Еженедельное начисление',date:'12.10.2026, 00:01',source:'card'},
      {amount:-8,text:'Сгорание остатка перед начислением',date:'12.10.2026, 00:00',source:'card'},
      {amount:-492,text:'Списание за обед на 09.10.2026',date:'09.10.2026, 08:00',source:'card'},
      {amount:500,text:'Еженедельное начисление',date:'05.10.2026, 00:01',source:'card'}
    ];
    if(email==='anna@food.local')return [
      {amount:500,text:'Еженедельное начисление',date:'19.10.2026, 00:01',source:'card'},
      {amount:-252,text:'Сгорание остатка перед начислением',date:'19.10.2026, 00:00',source:'card'},
      {amount:-248,text:'Списание за обед на 16.10.2026',date:'16.10.2026, 08:00',source:'card'},
      {amount:500,text:'Еженедельное начисление',date:'12.10.2026, 00:01',source:'card'}
    ];
    return [];
  }
  function saveAccount(){
    if(activeAccount)activeAccount.state={balance,selected,counts,editing,cash,current,past,history,sequence};
  }
  function loadAccount(account){
    activeAccount=account;
    ({balance,selected,counts,editing,cash,current,past,history,sequence}=account.state);
    logged=true;modal=null;quickOpen=false;notice='';busy=false;
  }
  function switchAccount(email){
    const account=accounts.find(a=>a.email===email&&a.connected);
    if(!account)return;
    saveAccount();loadAccount(account);render(modalReturnFocus);
  }
  function signIn(email){
    const returnPage=logged?page:'menu';
    email=email.trim().toLowerCase();
    let account=accounts.find(a=>a.email===email);
    if(!account){
      const presets={'anna@food.local':['Анна Петрова','2384'],'alex@food.local':['Алексей Смирнов','3096']};
      const [name,card]=presets[email]||[email.split('@')[0],String(4000+accounts.length)];
      account=makeAccount(email,name,card);accounts.push(account);
    }
    saveAccount();account.connected=true;loadAccount(account);page=returnPage;render(modalReturnFocus);
  }
  function logoutAccount(){
    saveAccount();activeAccount.connected=false;
    const next=accounts.find(a=>a.connected);
    if(next)loadAccount(next);
    else{logged=false;modal=null;notice='';busy=false}
    render(next?'account-switch':undefined);
  }
  const initials=()=>activeAccount.name.split(/\s+/).map(s=>s[0]).slice(0,2).join('').toUpperCase();
  function passwordIcon(visible){
    return `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>${visible?'<path d="m3 3 18 18"/>':''}</svg>`;
  }
  function loginFields(email){
    return `<label>Email<input name="email" type="email" value="${esc(email)}" required autocomplete="off"></label><label for="signin-password">Пароль</label><div class="password-field"><input id="signin-password" name="password" type="password" value="password" required autocomplete="off"><button type="button" class="password-toggle" id="password-toggle" aria-label="Показать пароль" title="Показать пароль" aria-controls="signin-password">${passwordIcon(false)}</button></div>`;
  }
  function quickMenu(){
    return `<div class="quick-accounts" id="quick-accounts" role="menu" aria-label="Выбор пользователя" ${quickOpen?'':'hidden'}>${accounts.filter(a=>a.connected).map((a,i)=>`<button id="quick-account-${i}" class="quick-account ${a===activeAccount?'is-current':''}" role="menuitemradio" aria-checked="${a===activeAccount}" tabindex="-1" data-account="${esc(a.email)}"><span><strong>${esc(a.name)}</strong><small>Остаток ${money(a.state.balance)}</small></span><span aria-hidden="true">${a===activeAccount?'✓':''}</span></button>`).join('')}<button id="quick-add-account" class="quick-account quick-add" role="menuitem" tabindex="-1">＋ Добавить аккаунт</button><div class="quick-divider" role="separator"></div><button id="logout" class="quick-logout" role="menuitem" tabindex="-1">Выйти</button></div>`;
  }
  function closeQuickMenu(restoreFocus=false){
    quickOpen=false;
    document.getElementById('quick-accounts')?.setAttribute('hidden','');
    document.getElementById('account-switch')?.setAttribute('aria-expanded','false');
    if(restoreFocus)document.getElementById('account-switch')?.focus();
  }
  function canChangeOrder(o,now=clock()){
    if(!o)return false;
    const parts=Object.fromEntries(new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Yekaterinburg',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(now).map(p=>[p.type,p.value]));
    const day=[parts.year,parts.month,parts.day].join('-');
    const orderDay=o.orderDate.split('.').reverse().join('-');
    return day<orderDay||(day===orderDay&&Number(parts.hour)<15);
  }
  const deadlineNotice='После 15:00 изменить или отменить заказ нельзя. Сохранённый заказ остался без изменений.';
  function guardChange(){
    if(canChangeOrder(current))return true;
    editing=false;
    if(modal==='cancel')modal=null;
    notice=deadlineNotice;render();return false;
  }
  function addHistory(amount,text){if(amount)history.unshift({amount,text,date:stamp()})}
  function changePage(p){page=p;notice='';modal=null;render();window.scrollTo(0,0)}
  function qr(){
    // Static SBP QR supplied by the user. No network request is made here.
    return `<svg role="img" aria-label="QR-код для оплаты по СБП" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 45 45" shape-rendering="crispEdges"><rect width="45" height="45" fill="white"/><path fill="#000" d="M4 4h1v1h-1zM5 4h1v1h-1zM6 4h1v1h-1zM7 4h1v1h-1zM8 4h1v1h-1zM9 4h1v1h-1zM10 4h1v1h-1zM12 4h1v1h-1zM13 4h1v1h-1zM14 4h1v1h-1zM16 4h1v1h-1zM17 4h1v1h-1zM22 4h1v1h-1zM23 4h1v1h-1zM24 4h1v1h-1zM27 4h1v1h-1zM30 4h1v1h-1zM31 4h1v1h-1zM32 4h1v1h-1zM34 4h1v1h-1zM35 4h1v1h-1zM36 4h1v1h-1zM37 4h1v1h-1zM38 4h1v1h-1zM39 4h1v1h-1zM40 4h1v1h-1zM4 5h1v1h-1zM10 5h1v1h-1zM13 5h1v1h-1zM14 5h1v1h-1zM15 5h1v1h-1zM16 5h1v1h-1zM17 5h1v1h-1zM18 5h1v1h-1zM19 5h1v1h-1zM20 5h1v1h-1zM22 5h1v1h-1zM24 5h1v1h-1zM28 5h1v1h-1zM34 5h1v1h-1zM40 5h1v1h-1zM4 6h1v1h-1zM6 6h1v1h-1zM7 6h1v1h-1zM8 6h1v1h-1zM10 6h1v1h-1zM13 6h1v1h-1zM15 6h1v1h-1zM17 6h1v1h-1zM20 6h1v1h-1zM22 6h1v1h-1zM24 6h1v1h-1zM27 6h1v1h-1zM32 6h1v1h-1zM34 6h1v1h-1zM36 6h1v1h-1zM37 6h1v1h-1zM38 6h1v1h-1zM40 6h1v1h-1zM4 7h1v1h-1zM6 7h1v1h-1zM7 7h1v1h-1zM8 7h1v1h-1zM10 7h1v1h-1zM12 7h1v1h-1zM13 7h1v1h-1zM16 7h1v1h-1zM19 7h1v1h-1zM23 7h1v1h-1zM24 7h1v1h-1zM26 7h1v1h-1zM27 7h1v1h-1zM29 7h1v1h-1zM30 7h1v1h-1zM32 7h1v1h-1zM34 7h1v1h-1zM36 7h1v1h-1zM37 7h1v1h-1zM38 7h1v1h-1zM40 7h1v1h-1zM4 8h1v1h-1zM6 8h1v1h-1zM7 8h1v1h-1zM8 8h1v1h-1zM10 8h1v1h-1zM12 8h1v1h-1zM13 8h1v1h-1zM16 8h1v1h-1zM19 8h1v1h-1zM20 8h1v1h-1zM22 8h1v1h-1zM24 8h1v1h-1zM26 8h1v1h-1zM28 8h1v1h-1zM29 8h1v1h-1zM31 8h1v1h-1zM34 8h1v1h-1zM36 8h1v1h-1zM37 8h1v1h-1zM38 8h1v1h-1zM40 8h1v1h-1zM4 9h1v1h-1zM10 9h1v1h-1zM12 9h1v1h-1zM16 9h1v1h-1zM20 9h1v1h-1zM21 9h1v1h-1zM25 9h1v1h-1zM28 9h1v1h-1zM30 9h1v1h-1zM32 9h1v1h-1zM34 9h1v1h-1zM40 9h1v1h-1zM4 10h1v1h-1zM5 10h1v1h-1zM6 10h1v1h-1zM7 10h1v1h-1zM8 10h1v1h-1zM9 10h1v1h-1zM10 10h1v1h-1zM12 10h1v1h-1zM14 10h1v1h-1zM16 10h1v1h-1zM18 10h1v1h-1zM20 10h1v1h-1zM22 10h1v1h-1zM24 10h1v1h-1zM26 10h1v1h-1zM28 10h1v1h-1zM30 10h1v1h-1zM32 10h1v1h-1zM34 10h1v1h-1zM35 10h1v1h-1zM36 10h1v1h-1zM37 10h1v1h-1zM38 10h1v1h-1zM39 10h1v1h-1zM40 10h1v1h-1zM12 11h1v1h-1zM13 11h1v1h-1zM14 11h1v1h-1zM16 11h1v1h-1zM18 11h1v1h-1zM19 11h1v1h-1zM21 11h1v1h-1zM24 11h1v1h-1zM25 11h1v1h-1zM26 11h1v1h-1zM27 11h1v1h-1zM32 11h1v1h-1zM4 12h1v1h-1zM8 12h1v1h-1zM10 12h1v1h-1zM11 12h1v1h-1zM12 12h1v1h-1zM16 12h1v1h-1zM17 12h1v1h-1zM21 12h1v1h-1zM23 12h1v1h-1zM24 12h1v1h-1zM25 12h1v1h-1zM26 12h1v1h-1zM27 12h1v1h-1zM28 12h1v1h-1zM31 12h1v1h-1zM32 12h1v1h-1zM33 12h1v1h-1zM34 12h1v1h-1zM35 12h1v1h-1zM36 12h1v1h-1zM37 12h1v1h-1zM40 12h1v1h-1zM4 13h1v1h-1zM6 13h1v1h-1zM7 13h1v1h-1zM8 13h1v1h-1zM11 13h1v1h-1zM13 13h1v1h-1zM14 13h1v1h-1zM15 13h1v1h-1zM17 13h1v1h-1zM20 13h1v1h-1zM21 13h1v1h-1zM22 13h1v1h-1zM27 13h1v1h-1zM29 13h1v1h-1zM30 13h1v1h-1zM31 13h1v1h-1zM32 13h1v1h-1zM36 13h1v1h-1zM37 13h1v1h-1zM38 13h1v1h-1zM39 13h1v1h-1zM5 14h1v1h-1zM8 14h1v1h-1zM10 14h1v1h-1zM11 14h1v1h-1zM12 14h1v1h-1zM14 14h1v1h-1zM16 14h1v1h-1zM20 14h1v1h-1zM27 14h1v1h-1zM29 14h1v1h-1zM31 14h1v1h-1zM32 14h1v1h-1zM33 14h1v1h-1zM37 14h1v1h-1zM4 15h1v1h-1zM11 15h1v1h-1zM18 15h1v1h-1zM21 15h1v1h-1zM23 15h1v1h-1zM25 15h1v1h-1zM27 15h1v1h-1zM39 15h1v1h-1zM4 16h1v1h-1zM5 16h1v1h-1zM6 16h1v1h-1zM7 16h1v1h-1zM10 16h1v1h-1zM11 16h1v1h-1zM12 16h1v1h-1zM15 16h1v1h-1zM19 16h1v1h-1zM20 16h1v1h-1zM21 16h1v1h-1zM24 16h1v1h-1zM25 16h1v1h-1zM26 16h1v1h-1zM28 16h1v1h-1zM33 16h1v1h-1zM34 16h1v1h-1zM38 16h1v1h-1zM39 16h1v1h-1zM40 16h1v1h-1zM4 17h1v1h-1zM6 17h1v1h-1zM11 17h1v1h-1zM13 17h1v1h-1zM14 17h1v1h-1zM15 17h1v1h-1zM16 17h1v1h-1zM19 17h1v1h-1zM20 17h1v1h-1zM21 17h1v1h-1zM22 17h1v1h-1zM28 17h1v1h-1zM29 17h1v1h-1zM31 17h1v1h-1zM32 17h1v1h-1zM33 17h1v1h-1zM36 17h1v1h-1zM37 17h1v1h-1zM39 17h1v1h-1zM4 18h1v1h-1zM5 18h1v1h-1zM10 18h1v1h-1zM11 18h1v1h-1zM16 18h1v1h-1zM18 18h1v1h-1zM19 18h1v1h-1zM21 18h1v1h-1zM24 18h1v1h-1zM26 18h1v1h-1zM27 18h1v1h-1zM28 18h1v1h-1zM31 18h1v1h-1zM32 18h1v1h-1zM33 18h1v1h-1zM35 18h1v1h-1zM36 18h1v1h-1zM37 18h1v1h-1zM38 18h1v1h-1zM4 19h1v1h-1zM5 19h1v1h-1zM6 19h1v1h-1zM7 19h1v1h-1zM8 19h1v1h-1zM11 19h1v1h-1zM13 19h1v1h-1zM14 19h1v1h-1zM15 19h1v1h-1zM16 19h1v1h-1zM17 19h1v1h-1zM20 19h1v1h-1zM21 19h1v1h-1zM25 19h1v1h-1zM26 19h1v1h-1zM28 19h1v1h-1zM31 19h1v1h-1zM32 19h1v1h-1zM33 19h1v1h-1zM34 19h1v1h-1zM35 19h1v1h-1zM36 19h1v1h-1zM38 19h1v1h-1zM39 19h1v1h-1zM40 19h1v1h-1zM4 20h1v1h-1zM6 20h1v1h-1zM7 20h1v1h-1zM10 20h1v1h-1zM12 20h1v1h-1zM16 20h1v1h-1zM18 20h1v1h-1zM20 20h1v1h-1zM21 20h1v1h-1zM23 20h1v1h-1zM25 20h1v1h-1zM26 20h1v1h-1zM28 20h1v1h-1zM32 20h1v1h-1zM33 20h1v1h-1zM34 20h1v1h-1zM35 20h1v1h-1zM37 20h1v1h-1zM38 20h1v1h-1zM39 20h1v1h-1zM40 20h1v1h-1zM4 21h1v1h-1zM5 21h1v1h-1zM6 21h1v1h-1zM7 21h1v1h-1zM8 21h1v1h-1zM9 21h1v1h-1zM12 21h1v1h-1zM13 21h1v1h-1zM15 21h1v1h-1zM17 21h1v1h-1zM18 21h1v1h-1zM21 21h1v1h-1zM22 21h1v1h-1zM27 21h1v1h-1zM29 21h1v1h-1zM30 21h1v1h-1zM32 21h1v1h-1zM34 21h1v1h-1zM36 21h1v1h-1zM38 21h1v1h-1zM39 21h1v1h-1zM6 22h1v1h-1zM7 22h1v1h-1zM8 22h1v1h-1zM10 22h1v1h-1zM11 22h1v1h-1zM13 22h1v1h-1zM15 22h1v1h-1zM17 22h1v1h-1zM18 22h1v1h-1zM19 22h1v1h-1zM21 22h1v1h-1zM22 22h1v1h-1zM25 22h1v1h-1zM26 22h1v1h-1zM27 22h1v1h-1zM30 22h1v1h-1zM32 22h1v1h-1zM33 22h1v1h-1zM36 22h1v1h-1zM37 22h1v1h-1zM38 22h1v1h-1zM4 23h1v1h-1zM5 23h1v1h-1zM8 23h1v1h-1zM11 23h1v1h-1zM12 23h1v1h-1zM13 23h1v1h-1zM14 23h1v1h-1zM17 23h1v1h-1zM19 23h1v1h-1zM20 23h1v1h-1zM21 23h1v1h-1zM23 23h1v1h-1zM24 23h1v1h-1zM25 23h1v1h-1zM26 23h1v1h-1zM27 23h1v1h-1zM30 23h1v1h-1zM31 23h1v1h-1zM33 23h1v1h-1zM34 23h1v1h-1zM36 23h1v1h-1zM39 23h1v1h-1zM4 24h1v1h-1zM6 24h1v1h-1zM9 24h1v1h-1zM10 24h1v1h-1zM14 24h1v1h-1zM15 24h1v1h-1zM16 24h1v1h-1zM22 24h1v1h-1zM23 24h1v1h-1zM25 24h1v1h-1zM26 24h1v1h-1zM28 24h1v1h-1zM30 24h1v1h-1zM31 24h1v1h-1zM32 24h1v1h-1zM34 24h1v1h-1zM35 24h1v1h-1zM37 24h1v1h-1zM38 24h1v1h-1zM6 25h1v1h-1zM7 25h1v1h-1zM8 25h1v1h-1zM13 25h1v1h-1zM14 25h1v1h-1zM15 25h1v1h-1zM16 25h1v1h-1zM17 25h1v1h-1zM19 25h1v1h-1zM20 25h1v1h-1zM21 25h1v1h-1zM23 25h1v1h-1zM27 25h1v1h-1zM28 25h1v1h-1zM29 25h1v1h-1zM30 25h1v1h-1zM31 25h1v1h-1zM32 25h1v1h-1zM35 25h1v1h-1zM36 25h1v1h-1zM40 25h1v1h-1zM4 26h1v1h-1zM6 26h1v1h-1zM7 26h1v1h-1zM10 26h1v1h-1zM11 26h1v1h-1zM15 26h1v1h-1zM17 26h1v1h-1zM21 26h1v1h-1zM22 26h1v1h-1zM26 26h1v1h-1zM28 26h1v1h-1zM31 26h1v1h-1zM34 26h1v1h-1zM35 26h1v1h-1zM36 26h1v1h-1zM37 26h1v1h-1zM38 26h1v1h-1zM7 27h1v1h-1zM8 27h1v1h-1zM9 27h1v1h-1zM11 27h1v1h-1zM12 27h1v1h-1zM15 27h1v1h-1zM21 27h1v1h-1zM23 27h1v1h-1zM25 27h1v1h-1zM26 27h1v1h-1zM27 27h1v1h-1zM28 27h1v1h-1zM32 27h1v1h-1zM33 27h1v1h-1zM35 27h1v1h-1zM36 27h1v1h-1zM38 27h1v1h-1zM39 27h1v1h-1zM4 28h1v1h-1zM7 28h1v1h-1zM8 28h1v1h-1zM9 28h1v1h-1zM10 28h1v1h-1zM14 28h1v1h-1zM15 28h1v1h-1zM17 28h1v1h-1zM18 28h1v1h-1zM19 28h1v1h-1zM22 28h1v1h-1zM23 28h1v1h-1zM24 28h1v1h-1zM26 28h1v1h-1zM27 28h1v1h-1zM28 28h1v1h-1zM32 28h1v1h-1zM33 28h1v1h-1zM37 28h1v1h-1zM38 28h1v1h-1zM4 29h1v1h-1zM5 29h1v1h-1zM6 29h1v1h-1zM7 29h1v1h-1zM8 29h1v1h-1zM9 29h1v1h-1zM11 29h1v1h-1zM16 29h1v1h-1zM17 29h1v1h-1zM18 29h1v1h-1zM20 29h1v1h-1zM22 29h1v1h-1zM23 29h1v1h-1zM27 29h1v1h-1zM29 29h1v1h-1zM30 29h1v1h-1zM32 29h1v1h-1zM34 29h1v1h-1zM36 29h1v1h-1zM6 30h1v1h-1zM7 30h1v1h-1zM8 30h1v1h-1zM9 30h1v1h-1zM10 30h1v1h-1zM13 30h1v1h-1zM14 30h1v1h-1zM15 30h1v1h-1zM20 30h1v1h-1zM21 30h1v1h-1zM22 30h1v1h-1zM23 30h1v1h-1zM26 30h1v1h-1zM27 30h1v1h-1zM32 30h1v1h-1zM34 30h1v1h-1zM36 30h1v1h-1zM37 30h1v1h-1zM9 31h1v1h-1zM11 31h1v1h-1zM12 31h1v1h-1zM13 31h1v1h-1zM16 31h1v1h-1zM21 31h1v1h-1zM24 31h1v1h-1zM25 31h1v1h-1zM27 31h1v1h-1zM30 31h1v1h-1zM32 31h1v1h-1zM33 31h1v1h-1zM34 31h1v1h-1zM36 31h1v1h-1zM39 31h1v1h-1zM40 31h1v1h-1zM4 32h1v1h-1zM5 32h1v1h-1zM8 32h1v1h-1zM9 32h1v1h-1zM10 32h1v1h-1zM12 32h1v1h-1zM15 32h1v1h-1zM17 32h1v1h-1zM18 32h1v1h-1zM19 32h1v1h-1zM20 32h1v1h-1zM21 32h1v1h-1zM23 32h1v1h-1zM24 32h1v1h-1zM25 32h1v1h-1zM29 32h1v1h-1zM30 32h1v1h-1zM32 32h1v1h-1zM33 32h1v1h-1zM34 32h1v1h-1zM35 32h1v1h-1zM36 32h1v1h-1zM38 32h1v1h-1zM40 32h1v1h-1zM12 33h1v1h-1zM13 33h1v1h-1zM14 33h1v1h-1zM18 33h1v1h-1zM20 33h1v1h-1zM21 33h1v1h-1zM23 33h1v1h-1zM24 33h1v1h-1zM25 33h1v1h-1zM26 33h1v1h-1zM28 33h1v1h-1zM29 33h1v1h-1zM30 33h1v1h-1zM31 33h1v1h-1zM32 33h1v1h-1zM36 33h1v1h-1zM40 33h1v1h-1zM4 34h1v1h-1zM5 34h1v1h-1zM6 34h1v1h-1zM7 34h1v1h-1zM8 34h1v1h-1zM9 34h1v1h-1zM10 34h1v1h-1zM12 34h1v1h-1zM16 34h1v1h-1zM17 34h1v1h-1zM19 34h1v1h-1zM22 34h1v1h-1zM23 34h1v1h-1zM24 34h1v1h-1zM25 34h1v1h-1zM28 34h1v1h-1zM32 34h1v1h-1zM34 34h1v1h-1zM36 34h1v1h-1zM40 34h1v1h-1zM4 35h1v1h-1zM10 35h1v1h-1zM13 35h1v1h-1zM14 35h1v1h-1zM15 35h1v1h-1zM17 35h1v1h-1zM19 35h1v1h-1zM20 35h1v1h-1zM23 35h1v1h-1zM26 35h1v1h-1zM27 35h1v1h-1zM32 35h1v1h-1zM36 35h1v1h-1zM37 35h1v1h-1zM38 35h1v1h-1zM40 35h1v1h-1zM4 36h1v1h-1zM6 36h1v1h-1zM7 36h1v1h-1zM8 36h1v1h-1zM10 36h1v1h-1zM12 36h1v1h-1zM14 36h1v1h-1zM17 36h1v1h-1zM18 36h1v1h-1zM20 36h1v1h-1zM24 36h1v1h-1zM26 36h1v1h-1zM27 36h1v1h-1zM28 36h1v1h-1zM32 36h1v1h-1zM33 36h1v1h-1zM34 36h1v1h-1zM35 36h1v1h-1zM36 36h1v1h-1zM37 36h1v1h-1zM38 36h1v1h-1zM40 36h1v1h-1zM4 37h1v1h-1zM6 37h1v1h-1zM7 37h1v1h-1zM8 37h1v1h-1zM10 37h1v1h-1zM13 37h1v1h-1zM16 37h1v1h-1zM22 37h1v1h-1zM27 37h1v1h-1zM30 37h1v1h-1zM32 37h1v1h-1zM33 37h1v1h-1zM34 37h1v1h-1zM35 37h1v1h-1zM39 37h1v1h-1zM40 37h1v1h-1zM4 38h1v1h-1zM6 38h1v1h-1zM7 38h1v1h-1zM8 38h1v1h-1zM10 38h1v1h-1zM14 38h1v1h-1zM16 38h1v1h-1zM17 38h1v1h-1zM19 38h1v1h-1zM22 38h1v1h-1zM23 38h1v1h-1zM26 38h1v1h-1zM27 38h1v1h-1zM29 38h1v1h-1zM30 38h1v1h-1zM33 38h1v1h-1zM34 38h1v1h-1zM37 38h1v1h-1zM38 38h1v1h-1zM39 38h1v1h-1zM4 39h1v1h-1zM10 39h1v1h-1zM15 39h1v1h-1zM17 39h1v1h-1zM18 39h1v1h-1zM19 39h1v1h-1zM20 39h1v1h-1zM21 39h1v1h-1zM23 39h1v1h-1zM24 39h1v1h-1zM25 39h1v1h-1zM27 39h1v1h-1zM29 39h1v1h-1zM30 39h1v1h-1zM31 39h1v1h-1zM32 39h1v1h-1zM36 39h1v1h-1zM39 39h1v1h-1zM4 40h1v1h-1zM5 40h1v1h-1zM6 40h1v1h-1zM7 40h1v1h-1zM8 40h1v1h-1zM9 40h1v1h-1zM10 40h1v1h-1zM12 40h1v1h-1zM14 40h1v1h-1zM20 40h1v1h-1zM21 40h1v1h-1zM22 40h1v1h-1zM23 40h1v1h-1zM24 40h1v1h-1zM29 40h1v1h-1zM30 40h1v1h-1zM31 40h1v1h-1zM32 40h1v1h-1zM34 40h1v1h-1zM35 40h1v1h-1zM39 40h1v1h-1zM40 40h1v1h-1z"/></svg>`;
  }
  const observer=new ResizeObserver(entries=>document.documentElement.style.setProperty('--bar-height',Math.ceil(entries[0].target.getBoundingClientRect().height)+'px'));
  const orderItems=o=>o.items||[{selected:o.selected,qty:o.qty}];
  const basketItems=()=>counts.flatMap((qty,selected)=>qty?[{selected,qty}]:[]);
  const itemSummary=items=>items.map(i=>`№${i.selected+1} × ${i.qty}`).join(' · ');
  const itemRows=o=>orderItems(o).map(i=>`<div class="line"><span>${esc(data[i.selected].title)} × ${i.qty}</span></div>`).join('');
  function totals(){const total=counts.reduce((sum,qty,i)=>sum+data[i].cost*qty,0),available=balance+(editing&&current?current.debit:0),debit=Math.min(total,Math.max(0,available)),due=total-debit,previousPaid=editing&&current?current.paid:0;return{total,available,debit,due,toPay:Math.max(0,due-previousPaid),paid:previousPaid,refund:Math.max(0,previousPaid-due)}}
  function orderCard(o,controls=true){return `<section class="card saved"><div class="card-title"><h2>Ваш заказ №${o.id}</h2></div><p class="meta">Заказ на ${esc(o.date)}</p>${itemRows(o)}<div class="line"><span>Стоимость заказа</span><strong>${money(o.total)}</strong></div><div class="line"><span>С баланса</span><strong>${money(o.debit)}</strong></div>${o.due?`<div class="line"><span>За деньги${o.paid>=o.due?' · оплачено':''}</span><strong>${money(o.due)}</strong></div>`:''}${o.due>o.paid?'<button class="wide" id="pay-open" style="margin-top:12px">Оплатить по СБП</button>':''}${o.paid>o.due?`<p class="muted" style="margin-top:12px">Для возврата переплаты ${money(o.paid-o.due)} напишите в столовую «Тимьян».</p>`:''}${controls?'<div class="actions"><button id="edit">Изменить заказ</button><button id="cancel" class="danger">Отменить заказ</button></div>':''}</section>`}
  function menu(){
    const t=totals(),s=data[selected],saved=current&&!editing;
    return `<main class="has-bar"><div class="intro"><div><h1>Меню на ${esc(menuDate)}</h1><p class="deadline">Заказать до 15:00 ${esc(today)}</p></div><button id="refresh" class="refresh" ${busy?'disabled':''}>${busy?'Обновляем…':'Обновить'}</button></div>${notice?`<div class="notice" role="status">${esc(notice)}</div>`:''}
    ${saved?orderCard(current):`<div class="tabs" role="tablist" aria-label="Выберите комплекс">${data.map((s,i)=>`<button class="tab ${selected===i?'active':''}" id="set-${i}" role="tab" aria-selected="${selected===i}" aria-controls="menu-panel">№${i+1} · <strong>${esc(s.price)}</strong>${counts[i]?`<span class="count-badge">${counts[i]}</span>`:''}</button>`).join('')}</div><section class="card" id="menu-panel" role="tabpanel" aria-labelledby="set-${selected}"><div class="card-title"><h2>${esc(s.title)}</h2><span class="price">${esc(s.price)}</span></div><div class="quantity"><span>В заказе</span><div class="stepper"><button id="minus" aria-label="Уменьшить количество" ${counts[selected]===0?'disabled':''}>−</button><output aria-live="polite">${counts[selected]}</output><button id="plus" aria-label="Увеличить количество" ${counts[selected]>=5?'disabled':''}>+</button></div></div><ul class="dishes">${s.dishes.map(d=>{const m=d.name.match(/^(.+?)\s*\((.+)\)$/);let name=m?m[1]:d.name;if(name==='ВИНЕГРЕТ')name='Винегрет';return `<li><p class="dish-name">${esc(name)}</p>${m?`<p class="ingredients">${esc(m[2])}</p>`:''}<p class="dish-meta">${d.portion!=='-'?esc(d.portion.replace('1 кус','1 кусочек'))+' · ':''}${esc(d.price)}</p></li>`}).join('')}</ul></section>`}
    <div class="bar"><div class="bar-inner">${saved?`<div class="bar-row"><div><div class="total-label">${current.due>current.paid?'Доплата по СБП':'Стоимость заказа'}</div><div class="total">${money(current.due>current.paid?current.due-current.paid:current.total)}</div></div><button class="primary" id="${current.due>current.paid?'pay-bottom':'edit-bottom'}">${current.due>current.paid?'Оплатить':'Изменить'}</button></div>`:`${t.toPay?`<div class="warning">Не хватает ${money(t.toPay)}.</div><label class="cash-option"><input type="checkbox" id="cash" ${cash?'checked':''}><span>Оплачу разницу за деньги<small>С баланса ${money(t.debit)} · доплата по СБП ${money(t.toPay)}</small></span></label>`:''}${editing?`<p class="helper">Предыдущая сумма заказа ${money(current.debit)} учтена в расчёте.${current.paid?' По СБП оплачено '+money(current.paid)+'.':''}${t.refund?' Для возврата переплаты '+money(t.refund)+' напишите в столовую «Тимьян».':''}</p>`:''}${basketItems().length?`<p class="helper basket-summary">В заказе: ${itemSummary(basketItems())}</p>`:''}<div class="bar-row"><div><div class="total-label">Итого</div><div class="total" aria-live="polite">${money(t.total)}</div></div><button id="save" class="primary" ${!canChangeOrder({orderDate:today})||!t.total||t.toPay&&!cash?'disabled':''}>${editing?'Сохранить':'Заказать'}<small class="order-owner">${esc(activeAccount.name)}</small></button></div>${editing?'<button id="discard" class="wide" style="margin-top:8px">Не менять заказ</button>':''}`}</div></div></main>`;
  }
  function profile(){const orders=[...(current?[current]:[]),...past];const dates=[...new Set(orders.map(o=>o.date))];return `<main><div class="intro profile-intro"><h1>Профиль</h1><button id="refresh" class="refresh" ${busy?'disabled':''}>${busy?'Обновляем…':'Обновить'}</button></div>${notice?`<div class="notice" role="status">${esc(notice)}</div>`:''}<section class="card section"><div class="identity"><span class="avatar">${esc(initials())}</span><div><h2>${esc(activeAccount.name)}</h2><p class="meta">${esc(activeAccount.email)}</p></div></div><button id="profile-account-switch" class="profile-account-switch" aria-haspopup="dialog">Сменить аккаунт</button><dl class="fields"><div><dt>Расчётный остаток</dt><dd>${money(balance)}</dd></div><div><dt>Карта</dt><dd>${esc(activeAccount.card)}</dd></div><div><dt>Отдел</dt><dd>IT</dd></div><div><dt>Роль</dt><dd>Пользователь</dd></div></dl><p class="muted" style="margin-top:12px">Остаток рассчитан с учётом ваших заказов. Фактический баланс карты обновится утром в день, на который оформлен заказ.</p></section>${dates.map(date=>`<section class="section"><h2>Мои заказы на ${esc(date)}</h2>${orders.filter(o=>o.date===date).map(o=>`<button class="order-row" data-order="${o.id}"><div class="order-top"><strong>Заказ №${o.id}</strong><strong>${money(o.total)}</strong></div><p class="meta">${o.date} · ${itemSummary(orderItems(o))}</p></button>`).join('')}</section>`).join('')}<section class="section"><h2>История операций</h2><ul class="ledger">${history.map(h=>`<li><div>${esc(h.text)}<small>${esc(h.date)}</small></div><span class="amount ${h.amount>0?'positive':''}">${h.amount>0?'+':'−'}${money(Math.abs(h.amount))}</span></li>`).join('')}</ul></section></main>`}
  function dialog(){
    if(!modal)return '';
    let content='';
    if(modal==='pay')content=`<h2 id="dialog-title">Доплатите по СБП</h2><p>Заказ №${current.id} сохранён. Переведите оставшуюся сумму:</p><div class="payment-total">${money(current.due-current.paid)}</div><div class="qr">${qr()}</div><p class="small">Отсканируйте QR-код в банковском приложении и оплатите. После оплаты уведомите об этом в чате в MAX или Telegram, затем нажмите «Подтверждаю оплату».</p><p class="payment-note">В комментарии к платежу укажите свой номер карты Тимьян: <strong>${esc(activeAccount.card)}</strong>.</p><div class="actions"><button id="bank" class="primary">Подтверждаю оплату</button><button id="later">Оплачу позже</button></div>`;
    else if(modal==='cancel')content=`<h2 id="dialog-title">Отменить заказ?</h2><p>Расчётный остаток увеличится на ${money(current.debit)}. Списание за этот заказ не произойдёт.${current.paid?' Для возврата оплаченных '+money(current.paid)+' напишите в столовую «Тимьян».':current.due?' Неоплаченная доплата будет отменена.':''}</p><div class="actions"><button id="keep">Оставить заказ</button><button id="cancel-confirm" class="danger">Отменить заказ</button></div>`;
    else if(modal==='logout')content=`<h2 id="dialog-title">Выйти из аккаунта?</h2><p>${esc(activeAccount.name)} · ${esc(activeAccount.email)}<br>Сохранённые заказы останутся в профиле. Другие аккаунты останутся подключены.</p><div class="actions"><button id="keep">Остаться</button><button id="logout-confirm" class="danger">Выйти</button></div>`;
    else if(modal==='accounts')content=`<h2 id="dialog-title">Аккаунты</h2><div class="account-list">${accounts.filter(a=>a.connected).map(a=>`<button class="account-option ${a===activeAccount?'is-current':''}" data-account="${esc(a.email)}" ${a===activeAccount?'aria-current="true"':''}><span><strong>${esc(a.name)}</strong><small>${esc(a.email)} · Карта ${esc(a.card)}</small><small>Остаток ${money(a.state.balance)}</small></span><span class="account-mark" aria-hidden="true">${a===activeAccount?'✓':'→'}</span></button>`).join('')}</div><div class="actions"><button id="add-account">＋ Добавить аккаунт</button><button id="keep">Закрыть</button></div>`;
    else if(modal==='add-account'){
      const suggested=['alex@food.local','anna@food.local','user@food.local'].find(email=>!accounts.some(a=>a.email===email&&a.connected))||'';
      content=`<h2 id="dialog-title">Добавить аккаунт</h2><form id="add-account-form" class="account-form">${loginFields(suggested)}<div class="actions"><button type="submit" class="primary">Войти</button><button type="button" id="back-accounts">Назад</button></div></form>`;
    }
    else if(modal==='paid-edit')content='<h2 id="dialog-title">Заказ уже оплачен</h2><p>Для изменения заказа с оплатой по СБП свяжитесь с ответственным за питание.</p><div class="actions"><button id="keep">Понятно</button></div>';
    else if(typeof modal==='object'){const o=modal;content=`<h2 id="dialog-title">Заказ №${o.id}</h2><p>${o.date}</p>${itemRows(o)}<div class="line"><span>Стоимость</span><strong>${money(o.total)}</strong></div><div class="actions"><button id="keep">Закрыть</button></div>`}
    return `<div class="overlay"><section class="dialog" role="dialog" aria-modal="true" aria-labelledby="dialog-title">${content}</section></div>`;
  }
  function render(focus){
    observer.disconnect();
    if(modal||!logged)quickOpen=false;
    if(current&&!canChangeOrder(current)&&(editing||modal==='cancel')){
      editing=false;if(modal==='cancel')modal=null;notice=deadlineNotice;
    }
    saveAccount();
    root.innerHTML=`${logged?`<div id="screen" ${modal?'inert':''}><header class="header"><div class="head"><div class="head-row"><div class="brand-block"><span class="brand">IS.Food</span><span class="header-balance">Остаток: <strong>${money(balance)}</strong></span></div><div class="user-menu-wrap"><button class="user-menu-toggle" id="account-switch" aria-haspopup="menu" aria-expanded="${quickOpen}" aria-controls="quick-accounts"><span class="avatar header-avatar" aria-hidden="true">${esc(initials())}</span><span class="user-menu-name">${esc(activeAccount.name)}</span><svg class="menu-chevron" width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="m4 6 4 4 4-4" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg></button>${quickMenu()}</div></div><nav aria-label="Разделы"><a href="#menu" id="menu-link" class="${page==='menu'?'active':''}" ${page==='menu'?'aria-current="page"':''}>Меню</a><a href="#profile" id="profile-link" class="${page==='profile'?'active':''}" ${page==='profile'?'aria-current="page"':''}>Профиль</a></nav></div></header>${page==='menu'?menu():profile()}</div>${dialog()}`:`<div class="login"><form class="card" id="login"><span class="brand" style="color:#2857af">IS.Food</span><h1 style="margin-top:16px">Вход</h1><p class="meta">Заказывайте обед до 15:00.</p>${loginFields(activeAccount.email)}<button type="submit" class="primary">Войти</button></form></div>`}`;
    const on=(id,fn)=>document.getElementById(id)?.addEventListener('click',fn);
    on('menu-link',e=>{e.preventDefault();changePage('menu')});on('profile-link',e=>{e.preventDefault();changePage('profile')});
    on('account-switch',()=>{modalReturnFocus='account-switch';if(quickOpen){closeQuickMenu(true)}else{quickOpen=true;render('quick-account-0')}});
    on('profile-account-switch',()=>{modalReturnFocus='profile-account-switch';modal='accounts';render()});
    document.querySelectorAll('[data-account]').forEach(b=>b.addEventListener('click',()=>switchAccount(b.dataset.account)));
    on('add-account',()=>{modal='add-account';render()});
    on('quick-add-account',()=>{modalReturnFocus='account-switch';modal='add-account';render()});
    on('back-accounts',()=>{
      if(modalReturnFocus==='account-switch'){modal=null;quickOpen=true;render('quick-add-account')}
      else{modal='accounts';render()}
    });
    on('logout',()=>{modalReturnFocus='account-switch';modal='logout';render()});on('logout-confirm',logoutAccount);
    on('password-toggle',()=>{
      const input=document.getElementById('signin-password'),button=document.getElementById('password-toggle');
      const visible=input.type==='password';
      input.type=visible?'text':'password';
      const label=visible?'Скрыть пароль':'Показать пароль';
      button.setAttribute('aria-label',label);button.title=label;button.innerHTML=passwordIcon(visible);
    });
    for(const id of ['login','add-account-form'])document.getElementById(id)?.addEventListener('submit',e=>{
      e.preventDefault();const form=e.currentTarget;
      if(!form.reportValidity())return;
      const email=form.elements.email.value;
      form.elements.password.value='';
      signIn(email);
    });
    on('refresh',()=>{const refreshingAccount=activeAccount;busy=true;notice='';render();setTimeout(()=>{if(activeAccount!==refreshingAccount||!logged)return;busy=false;notice='Данные обновлены';render('refresh')},450)});
    data.forEach((s,i)=>on('set-'+i,()=>{selected=i;notice='';render('set-'+i)}));
    on('minus',()=>{counts[selected]=Math.max(0,counts[selected]-1);cash=false;render('minus')});on('plus',()=>{counts[selected]=Math.min(5,counts[selected]+1);cash=false;render('plus')});
    document.getElementById('cash')?.addEventListener('change',e=>{cash=e.target.checked;render('cash')});
    on('save',()=>{
      if(editing&&!guardChange())return;
      if(!editing&&!canChangeOrder({orderDate:today})){notice='Приём заказов завершён в 15:00.';render();return;}
      const t=totals();if(!t.total||t.toPay&&!cash)return;
      const id=editing?current.id:sequence++;
      balance=t.available-t.debit;
      current={id,items:basketItems(),total:t.total,debit:t.debit,due:t.due,paid:t.paid,date:menuDate,orderDate:today};
      editing=false;cash=false;notice=t.toPay?'Заказ сохранён. Осталось оплатить разницу.':'Заказ сохранён';modal=t.toPay?'pay':null;render();window.scrollTo(0,0);
    });
    const edit=()=>{if(!guardChange())return;page='menu';counts=data.map(()=>0);orderItems(current).forEach(i=>counts[i.selected]=i.qty);selected=orderItems(current)[0].selected;editing=true;cash=false;notice='';render();window.scrollTo(0,0)};
    on('edit',edit);on('edit-bottom',edit);
    on('discard',()=>{editing=false;notice='';render()});
    on('cancel',()=>{if(!guardChange())return;modal='cancel';render()});
    on('cancel-confirm',()=>{if(!guardChange())return;balance+=current.debit;const paid=current.paid;current=null;counts=data.map(()=>0);cash=false;editing=false;modal=null;notice='Заказ отменён. Расчётный остаток обновлён.'+(paid?' Для возврата оплаченных '+money(paid)+' напишите в столовую «Тимьян».':'');render();window.scrollTo(0,0)});
    const pay=()=>{modal='pay';render()};on('pay-open',pay);on('pay-bottom',pay);
    on('later',()=>{modal=null;render()});on('keep',()=>{modal=null;render(modalReturnFocus)});
    on('bank',()=>{addHistory(-(current.due-current.paid),'Оплата по СБП за заказ №'+current.id);current.paid=current.due;modal=null;notice='Вы подтвердили оплату. Не забудьте уведомить об оплате в чате в MAX или Telegram.';render()});
    document.querySelectorAll('[data-order]').forEach(b=>b.addEventListener('click',()=>{const id=Number(b.dataset.order);if(current?.id===id){changePage('menu')}else{modal=past.find(o=>o.id===id);render()}}));
    if(current&&!editing){
      const allowed=canChangeOrder(current);
      ['edit','edit-bottom','cancel','cancel-confirm'].forEach(id=>{const b=document.getElementById(id);if(b){b.disabled=!allowed;b.setAttribute('aria-describedby','change-deadline')}});
      const card=document.querySelector('.saved');
      if(card){
        const note=document.createElement('p');note.id='change-deadline';note.className='muted';note.style.marginTop='12px';
        note.textContent=allowed?'Изменить или отменить заказ можно до 15:00 '+current.orderDate+'.':'Изменение и отмена были доступны до 15:00 '+current.orderDate+'.';
        card.append(note);
      }
    }
    if(document.querySelector('.bar'))observer.observe(document.querySelector('.bar'));
    root.onkeydown=e=>{
      if(quickOpen){
        if(e.key==='Escape'){e.preventDefault();closeQuickMenu(true);return}
        const items=Array.from(document.querySelectorAll('#quick-accounts button'));
        const index=items.indexOf(document.activeElement);
        if(['ArrowDown','ArrowUp','Home','End'].includes(e.key)){
          e.preventDefault();
          const next=e.key==='Home'?0:e.key==='End'?items.length-1:(index+(e.key==='ArrowDown'?1:-1)+items.length)%items.length;
          items[next]?.focus();return;
        }
      }else if(e.target.id==='account-switch'&&['ArrowDown','ArrowUp'].includes(e.key)){e.preventDefault();quickOpen=true;render(e.key==='ArrowDown'?'quick-account-0':'logout');return}
      if(modal&&e.key==='Escape'){modal=null;render(modalReturnFocus)}
      if(modal&&e.key==='Tab'){const b=Array.from(document.querySelectorAll('.dialog button:not(:disabled), .dialog input:not(:disabled)'));if(e.shiftKey&&document.activeElement===b[0]){e.preventDefault();b.at(-1).focus()}else if(!e.shiftKey&&document.activeElement===b.at(-1)){e.preventDefault();b[0].focus()}}
    };
    if(modal)document.querySelector('.dialog input, .dialog button')?.focus({preventScroll:true});
    else if(focus)document.getElementById(focus)?.focus({preventScroll:true});
  }
  render();
  let lastChangeAllowed=canChangeOrder(current||{orderDate:today});
  function checkDeadline(){const allowed=canChangeOrder(current||{orderDate:today});if(allowed!==lastChangeAllowed){lastChangeAllowed=allowed;render()}}
  setInterval(checkDeadline,1000);
  document.addEventListener('visibilitychange',checkDeadline);
  document.addEventListener('click',e=>{if(quickOpen&&e.target.isConnected&&!e.target.closest('.user-menu-wrap'))closeQuickMenu()});
  document.addEventListener('focusin',e=>{if(quickOpen&&!e.target.closest('.user-menu-wrap'))closeQuickMenu()});
  window.addEventListener('focus',checkDeadline);
})(window.IS_FOOD_MENU);
