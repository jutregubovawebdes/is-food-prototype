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
  let page='profile',balance=252,selected=0,counts=data.map(()=>0),editing=false,cash=false,modal=null,notice='',busy=false,logged=true,sequence=4;
  let current={id:3,selected:2,qty:1,total:248,debit:248,due:0,paid:0,date:menuDate,orderDate:today};
  const past=[{id:2,selected:0,qty:1,total:497,date:'16.10.2026',orderDate:'15.10.2026'}];
  const history=[
    {amount:-3,text:'Сгорание остатка перед начислением',date:'19.10.2026, 00:01'},
    {amount:500,text:'Еженедельное начисление',date:'19.10.2026, 00:01'},
    {amount:-497,text:'Списание за заказ №2',date:'15.10.2026, 15:10'},
    {amount:500,text:'Еженедельное начисление',date:'13.10.2026, 16:21'}
  ];
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
    // Decorative local matrix. Contains no URL, account details or payment payload.
    const n=29,mark=(x,y)=>{for(const [a,b]of[[0,0],[22,0],[0,22]])if(x>=a&&x<a+7&&y>=b&&y<b+7){let i=x-a,j=y-b;return i===0||j===0||i===6||j===6||i>=2&&i<=4&&j>=2&&j<=4}return ((x*17+y*11+x*y*3)%13)<6};
    let cells='';
    for(let y=0;y<n;y++)for(let x=0;x<n;x++)if(mark(x,y))cells+=`<rect x="${x+3}" y="${y+3}" width="1" height="1"/>`;
    return `<svg viewBox="0 0 35 35" role="img" aria-label="QR-код для оплаты по СБП" xmlns="http://www.w3.org/2000/svg"><rect width="35" height="35" fill="white"/><g fill="#182439">${cells}</g></svg>`;
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
    <div class="bar"><div class="bar-inner">${saved?`<div class="bar-row"><div><div class="total-label">${current.due>current.paid?'Доплата по СБП':'Стоимость заказа'}</div><div class="total">${money(current.due>current.paid?current.due-current.paid:current.total)}</div></div><button class="primary" id="${current.due>current.paid?'pay-bottom':'edit-bottom'}">${current.due>current.paid?'Оплатить':'Изменить'}</button></div>`:`${t.toPay?`<div class="warning">Не хватает ${money(t.toPay)}.</div><label class="cash-option"><input type="checkbox" id="cash" ${cash?'checked':''}><span>Оплачу разницу за деньги<small>С баланса ${money(t.debit)} · доплата по СБП ${money(t.toPay)}</small></span></label>`:''}${editing?`<p class="helper">Предыдущая сумма заказа ${money(current.debit)} учтена в расчёте.${current.paid?' По СБП оплачено '+money(current.paid)+'.':''}${t.refund?' Для возврата переплаты '+money(t.refund)+' напишите в столовую «Тимьян».':''}</p>`:''}${basketItems().length?`<p class="helper basket-summary">В заказе: ${itemSummary(basketItems())}</p>`:''}<div class="bar-row"><div><div class="total-label">Итого</div><div class="total" aria-live="polite">${money(t.total)}</div></div><button id="save" class="primary" ${!canChangeOrder({orderDate:today})||!t.total||t.toPay&&!cash?'disabled':''}>${editing?'Сохранить':'Заказать'}</button></div>${editing?'<button id="discard" class="wide" style="margin-top:8px">Не менять заказ</button>':''}`}</div></div></main>`;
  }
  function profile(){const orders=[...(current?[current]:[]),...past];const dates=[...new Set(orders.map(o=>o.date))];return `<main><div class="intro"><h1>Профиль</h1><button id="refresh" class="refresh" ${busy?'disabled':''}>${busy?'Обновляем…':'Обновить'}</button></div>${notice?`<div class="notice" role="status">${esc(notice)}</div>`:''}<section class="card section"><div class="identity"><span class="avatar">ИИ</span><div><h2>Иван Иванов</h2><p class="meta">user@food.local</p></div></div><dl class="fields"><div><dt>Расчётный остаток</dt><dd>${money(balance)}</dd></div><div><dt>Карта</dt><dd>1771</dd></div><div><dt>Отдел</dt><dd>IT</dd></div><div><dt>Роль</dt><dd>Пользователь</dd></div></dl><p class="muted" style="margin-top:12px">Остаток рассчитан с учётом ваших заказов. Фактический баланс карты обновится утром в день, на который оформлен заказ.</p></section>${dates.map(date=>`<section class="section"><h2>Мои заказы на ${esc(date)}</h2>${orders.filter(o=>o.date===date).map(o=>`<button class="order-row" data-order="${o.id}"><div class="order-top"><strong>Заказ №${o.id}</strong><strong>${money(o.total)}</strong></div><p class="meta">${o.date} · ${itemSummary(orderItems(o))}</p></button>`).join('')}</section>`).join('')}<section class="section"><h2>История операций</h2><ul class="ledger">${history.map(h=>`<li><div>${esc(h.text)}<small>${esc(h.date)}</small></div><span class="amount ${h.amount>0?'positive':''}">${h.amount>0?'+':'−'}${money(Math.abs(h.amount))}</span></li>`).join('')}</ul></section></main>`}
  function dialog(){
    if(!modal)return '';
    let content='';
    if(modal==='pay')content=`<h2 id="dialog-title">Доплатите по СБП</h2><p>Заказ №${current.id} сохранён. Переведите оставшуюся сумму:</p><div class="payment-total">${money(current.due-current.paid)}</div><div class="qr">${qr()}</div><p class="small">Откройте банковское приложение и отсканируйте QR-код или нажмите кнопку ниже.</p><div class="actions"><button id="bank" class="primary">Оплатить ${money(current.due-current.paid)}</button><button id="later">Оплачу позже</button></div>`;
    else if(modal==='cancel')content=`<h2 id="dialog-title">Отменить заказ?</h2><p>Расчётный остаток увеличится на ${money(current.debit)}. Списание за этот заказ не произойдёт.${current.paid?' Для возврата оплаченных '+money(current.paid)+' напишите в столовую «Тимьян».':current.due?' Неоплаченная доплата будет отменена.':''}</p><div class="actions"><button id="keep">Оставить заказ</button><button id="cancel-confirm" class="danger">Отменить заказ</button></div>`;
    else if(modal==='logout')content='<h2 id="dialog-title">Выйти из аккаунта?</h2><p>Сохранённые заказы останутся в вашем профиле.</p><div class="actions"><button id="keep">Остаться</button><button id="logout-confirm" class="danger">Выйти</button></div>';
    else if(modal==='paid-edit')content='<h2 id="dialog-title">Заказ уже оплачен</h2><p>Для изменения заказа с оплатой по СБП свяжитесь с ответственным за питание.</p><div class="actions"><button id="keep">Понятно</button></div>';
    else if(typeof modal==='object'){const o=modal;content=`<h2 id="dialog-title">Заказ №${o.id}</h2><p>${o.date}</p>${itemRows(o)}<div class="line"><span>Стоимость</span><strong>${money(o.total)}</strong></div><div class="actions"><button id="keep">Закрыть</button></div>`}
    return `<div class="overlay"><section class="dialog" role="dialog" aria-modal="true" aria-labelledby="dialog-title">${content}</section></div>`;
  }
  function render(focus){
    observer.disconnect();
    if(current&&!canChangeOrder(current)&&(editing||modal==='cancel')){
      editing=false;if(modal==='cancel')modal=null;notice=deadlineNotice;
    }
    root.innerHTML=`${logged?`<div id="screen" ${modal?'inert':''}><header class="header"><div class="head"><div class="head-row"><span class="brand">IS.Food</span><div class="account"><span class="balance" title="Расчётный остаток с учётом заказов. Фактический баланс карты обновится утром в день, на который оформлен заказ."><span class="user-name">Иван Иванов</span><span>Остаток: <strong>${money(balance)}</strong></span></span><button class="logout" id="logout">Выйти</button></div></div><nav aria-label="Разделы"><a href="#menu" id="menu-link" class="${page==='menu'?'active':''}" ${page==='menu'?'aria-current="page"':''}>Меню</a><a href="#profile" id="profile-link" class="${page==='profile'?'active':''}" ${page==='profile'?'aria-current="page"':''}>Профиль</a></nav></div></header>${page==='menu'?menu():profile()}</div>${dialog()}`:`<div class="login"><form class="card" id="login"><span class="brand" style="color:#2857af">IS.Food</span><h1 style="margin-top:16px">Вход</h1><p class="meta">Заказывайте обед до 15:00.</p><label>Email<input type="email" value="user@food.local" required autocomplete="off"></label><label>Пароль<input type="password" value="password" required autocomplete="off"></label><button type="submit" class="primary">Войти</button></form></div>`}`;
    const on=(id,fn)=>document.getElementById(id)?.addEventListener('click',fn);
    on('menu-link',e=>{e.preventDefault();changePage('menu')});on('profile-link',e=>{e.preventDefault();changePage('profile')});
    on('logout',()=>{modal='logout';render()});on('logout-confirm',()=>{logged=false;modal=null;render()});
    document.getElementById('login')?.addEventListener('submit',e=>{e.preventDefault();logged=true;changePage('menu')});
    on('refresh',()=>{busy=true;notice='';render();setTimeout(()=>{busy=false;notice='Данные обновлены';render('refresh')},450)});
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
    on('later',()=>{modal=null;render()});on('keep',()=>{modal=null;render()});
    on('bank',()=>{addHistory(-(current.due-current.paid),'Оплата по СБП за заказ №'+current.id);current.paid=current.due;modal=null;notice='Доплата получена.';render()});
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
    root.onkeydown=e=>{if(modal&&e.key==='Escape'){modal=null;render()}if(modal&&e.key==='Tab'){const b=Array.from(document.querySelectorAll('.dialog button'));if(e.shiftKey&&document.activeElement===b[0]){e.preventDefault();b.at(-1).focus()}else if(!e.shiftKey&&document.activeElement===b.at(-1)){e.preventDefault();b[0].focus()}}};
    if(modal)document.querySelector('.dialog button')?.focus({preventScroll:true});
    else if(focus)document.getElementById(focus)?.focus({preventScroll:true});
  }
  render();
  let lastChangeAllowed=canChangeOrder(current||{orderDate:today});
  function checkDeadline(){const allowed=canChangeOrder(current||{orderDate:today});if(allowed!==lastChangeAllowed){lastChangeAllowed=allowed;render()}}
  setInterval(checkDeadline,1000);
  document.addEventListener('visibilitychange',checkDeadline);
  window.addEventListener('focus',checkDeadline);
})(window.IS_FOOD_MENU);
