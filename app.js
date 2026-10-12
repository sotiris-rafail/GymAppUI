(function(){
/* Where the Spring Boot backend lives. Set window.FOUNDRY_API_BASE in config.js to change it. */
var API_BASE=String(window.FOUNDRY_API_BASE||(location.protocol+'//'+(location.hostname||'localhost')+':8080')).replace(/\/+$/,'');
var T=I18N.t,TN=function(k,n,p){return I18N.tn(k,n,p);};
function themeNow(){var t=document.documentElement.getAttribute('data-theme');if(t)return t;try{return window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light';}catch(e){return 'light';}}
function setTheme(t){document.documentElement.setAttribute('data-theme',t);try{localStorage.setItem('foundry.theme',t);}catch(e){}}
function dayNames(){return [0,1,2,3,4,5,6].map(function(i){return I18N.day(i);});}
var DEMO={MEMBER:{email:'alex@demo.gym',password:'member123'},ADMIN:{email:'admin@foundry.gym',password:'admin123'}};

function p2(n){return String(n).padStart(2,'0');}
function key(d){return d.getFullYear()+'-'+p2(d.getMonth()+1)+'-'+p2(d.getDate());}
function parseKey(k){var a=k.split('-').map(Number);return new Date(a[0],a[1]-1,a[2]);}
function isoDay(d){return d.getDay()||7;}
function startOf(k,t){var d=parseKey(k);var a=String(t||'00:00').split(':').map(Number);d.setHours(a[0]||0,a[1]||0,0,0);return d;}
function esc(s){return String(s==null?'':s).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});}
function money(n){return '$'+(Number.isInteger(n)?n:Number(n).toFixed(2));}
function label(k){var d=parseKey(k);return I18N.dayFull(isoDay(d)-1)+' '+d.getDate()+' '+I18N.monthOf(d.getMonth());}
function shortLabel(k){var d=parseKey(k);return I18N.day(isoDay(d)-1)+' '+d.getDate()+' '+I18N.monthShort(d.getMonth());}
function toneOf(left,cap){return left<=0?'bad':(left<=2||left/cap<=0.25)?'warn':'ok';}

var TODAY=new Date();
var TODAY_K=key(TODAY);

var state=emptyState();
/* Admin edits are drafts. base is what the server has, state.plans/classes hold the draft, pending holds member plan changes. */
var base={plans:[],classes:[]},pending={};
function clone(o){return JSON.parse(JSON.stringify(o));}
function resetDraft(){base={plans:[],classes:[]};pending={};}
var auth=null; /* {id,name,email,role:'MEMBER'|'ADMIN',planId} once logged in */
var ui={openClasses:{},page:'plans',modal:null,booting:true,fatalErr:null,loginRole:'member',registering:false,cy:TODAY.getFullYear(),cm:TODAY.getMonth(),sel:TODAY_K,saveText:''};
var app=document.getElementById('app');
var busy=false,sessionReq=0,tmpId=0;

function emptyState(){return {plans:[],classes:[],bookings:[],sessions:{},members:[],attendance:[]};}

/* ---------- API ---------- */
async function api(method,path,body){
  var opt={method:method,credentials:'include',headers:{'Accept':'application/json'}};
  if(body!==undefined){opt.headers['Content-Type']='application/json';opt.body=JSON.stringify(body);}
  var res=await fetch(API_BASE+path,opt);
  var txt=res.status===204?'':await res.text();
  var data=null;
  try{data=txt?JSON.parse(txt):null;}catch(e){}
  if(!res.ok){
    var err=new Error((data&&data.message)||('Request failed ('+res.status+').'));
    err.status=res.status;
    if(data&&data.message)err.message=I18N.server(data.message);
    throw err;
  }
  return data;
}
function normPlan(p){return {id:p.id,name:p.name,price:Number(p.price),visits:p.visitsPerMonth};}
function normClass(c){return {id:c.id,name:c.name,coach:c.coach||'',time:c.startTime,duration:c.durationMinutes,capacity:c.capacity,days:c.days.slice().sort(function(a,b){return a-b;})};}
function planBody(p){return {name:p.name,price:p.price,visitsPerMonth:p.visits};}
function classBody(c){return {name:c.name,coach:c.coach,startTime:c.time,durationMinutes:c.duration,capacity:c.capacity,days:c.days};}

async function loadCatalog(){
  var r=await Promise.all([api('GET','/api/plans'),api('GET','/api/classes')]);
  state.plans=r[0].map(normPlan);
  state.classes=r[1].map(normClass);
  base.plans=clone(state.plans);base.classes=clone(state.classes);
}
async function loadSessions(){
  var tok=++sessionReq;
  var first=new Date(ui.cy,ui.cm,1),last=new Date(ui.cy,ui.cm+1,0);
  var list=await api('GET','/api/sessions?from='+key(first)+'&to='+key(last));
  if(tok!==sessionReq)return;
  var map={};
  list.forEach(function(s){(map[s.date]=map[s.date]||[]).push(s);});
  state.sessions=map;
}
async function loadMemberData(){
  var r=await Promise.all([api('GET','/api/me/bookings'),loadSessions()]);
  state.bookings=r[0];
}
async function loadMembers(){state.members=await api('GET','/api/admin/members');}
async function loadAttendance(){state.attendance=await api('GET','/api/admin/attendance');}
async function loadAll(){
  await loadCatalog();
  if(auth.role==='MEMBER')await loadMemberData();else await Promise.all([loadMembers(),loadAttendance()]);
}

/* ---------- lookups ---------- */
function planById(id){return state.plans.find(function(p){return p.id===id;});}
function classById(id){return state.classes.find(function(c){return c.id===id;});}
function sessionsOn(k){return state.sessions[k]||[];}
function usedInMonth(prefix){return state.bookings.filter(function(b){return b.date.indexOf(prefix)===0;}).length;}

/* ---------- views ---------- */
function headerHTML(){
  var who='';
  if(auth){
    var admin=auth.role==='ADMIN';
    who='<span>'+T('signedInAs',{name:'<b>'+esc(admin?T('admin'):auth.name)+'</b>'})+'</span>'+
      '<button class="btn ghost" id="logout" data-act="logout">'+T('logout')+'</button>';
  }
  var langs='<div class="seg langs" role="group" aria-label="'+esc(T('language'))+'">'+I18N.langs.map(function(l){
    return '<button id="lang-'+l.code+'" data-act="lang" data-lang="'+l.code+'" lang="'+l.code+'" title="'+esc(l.name)+'" aria-pressed="'+(I18N.lang===l.code)+'">'+l.label+'</button>';
  }).join('')+'</div>';
  var dark=themeNow()==='dark';
  var theme='<button class="btn ghost theme" id="theme" data-act="theme" aria-label="'+esc(T(dark?'theme.toLight':'theme.toDark'))+'" title="'+esc(T(dark?'theme.toLight':'theme.toDark'))+'">'+(dark?'&#9728;':'&#9790;')+'</button>';
  return '<header class="top"><div class="brand">Foundry<small>'+T('tagline')+'</small></div><div class="who">'+who+theme+langs+'</div></header>';
}
function footerHTML(){
  return '<footer class="foot"><span>'+esc(T('footer',{url:API_BASE}))+'</span></footer>';
}
function field(lab,id,inner,extra){
  return '<div class="field '+(extra||'')+'"><label for="'+id+'">'+lab+'</label>'+inner+'</div>';
}
function inp(kind,id,f,type,val,extra){
  return '<input type="'+type+'" id="'+kind+'-'+f+'-'+id+'" data-kind="'+kind+'" data-id="'+id+'" data-field="'+f+'" value="'+esc(val)+'" '+(extra||'')+'>';
}

function loginHTML(){
  var isAdmin=ui.loginRole==='admin',reg=!isAdmin&&ui.registering;
  var kind=isAdmin?'admin':reg?'reg':'member';
  var title=T('login.'+kind+'.title');
  var sub=T('login.'+kind+'.sub');
  var d=isAdmin?DEMO.ADMIN:DEMO.MEMBER;
  return '<div class="login"><div><h2>'+title+'</h2><p class="sub">'+sub+'</p></div>'+
    '<div class="seg" role="group" aria-label="'+esc(T('login.type'))+'">'+
    '<button id="lr-member" data-act="login-role" data-role="member" aria-pressed="'+(!isAdmin)+'">'+T('member')+'</button>'+
    '<button id="lr-admin" data-act="login-role" data-role="admin" aria-pressed="'+isAdmin+'">'+T('admin')+'</button></div>'+
    '<form class="form" id="login-form" novalidate>'+
    (reg?field(T('login.name'),'login-name','<input type="text" id="login-name" autocomplete="name" maxlength="60">'):'')+
    field(T('login.email'),'login-email','<input type="email" id="login-email" autocomplete="username" maxlength="120">')+
    field(T('login.password'),'login-password','<input type="password" id="login-password" autocomplete="'+(reg?'new-password':'current-password')+'" maxlength="72">')+
    '<p class="err" id="login-err" role="alert" hidden></p>'+
    '<button class="btn" type="submit" id="login-submit">'+(reg?T('login.create'):T('login.submit'))+'</button>'+
    (isAdmin?'':'<button type="button" class="linkbtn" id="toggle-reg" data-act="toggle-reg">'+(reg?T('login.toLogin'):T('login.toReg'))+'</button>')+
    '</form>'+
    '<div class="hint">'+T(isAdmin?'login.demoAdmin':'login.demoMember')+' <code>'+esc(d.email)+'</code> / <code>'+esc(d.password)+'</code> '+
    '<button type="button" class="linkbtn" id="demo-fill" data-act="demo-fill" style="display:inline">'+T('login.fill')+'</button></div></div>';
}

function memberHTML(){
  var plan=planById(auth.planId)||null;
  var prefix=ui.cy+'-'+p2(ui.cm+1);
  var mine=state.bookings.filter(function(b){return b.date.indexOf(prefix)===0;});
  var nowD=new Date();
  var att=mine.filter(function(b){return startOf(b.date,b.startTime)<nowD;}).length;
  var bk=mine.length-att;
  var i;

  /* The gym assigns plans. The member only sees theirs. */
  var plansHTML=plan?
    '<div class="plan-pick on" id="my-plan">'+
      '<span class="pp-name">'+esc(plan.name||T('plan.untitled'))+'</span>'+
      '<span class="pp-price"><b>'+money(plan.price)+'</b> '+T('plan.perMonth')+'</span>'+
      '<span class="pp-visits">'+TN('plan.visits',plan.visits)+'</span>'+
      '<span class="pill accent">'+T('plan.yours')+'</span></div>':
    '<p class="muted" id="no-plan">'+T('plan.none')+'</p>';

  var meter='';
  if(plan){
    var total=plan.visits,left=Math.max(0,total-mine.length),bar='';
    if(total>0&&total<=40){
      bar='<div class="punch" aria-hidden="true">';
      for(i=0;i<total;i++){bar+='<i class="'+(i<att?'att':i<att+bk?'bk':'')+'"></i>';}
      bar+='</div>';
    }else if(total>40){
      var aw=Math.min(100,att/total*100),bw=Math.min(100-aw,bk/total*100);
      bar='<div class="bar" aria-hidden="true"><span class="a" style="width:'+aw+'%"></span><span class="b" style="width:'+bw+'%"></span></div>';
    }
    meter='<div class="usage"><div class="usage-h"><strong>'+I18N.month(ui.cm)+' '+ui.cy+'</strong><span>'+T('plan.used',{used:mine.length,total:total,left:left})+'</span></div>'+bar+
      '<div class="legend"><span><i class="sw att"></i>'+T('plan.attended',{n:att})+'</span><span><i class="sw bk"></i>'+T('plan.booked',{n:bk})+'</span><span><i class="sw"></i>'+T('plan.left',{n:left})+'</span></div></div>';
  }else{
    meter='<div class="usage"><span class="muted">'+T('plan.pickToStart')+'</span></div>';
  }

  var first=new Date(ui.cy,ui.cm,1),offset=(first.getDay()+6)%7,dim=new Date(ui.cy,ui.cm+1,0).getDate();
  var cells='',d;
  for(i=0;i<offset;i++)cells+='<span class="blank"></span>';
  for(d=1;d<=dim;d++){
    var k=ui.cy+'-'+p2(ui.cm+1)+'-'+p2(d);
    var ss=sessionsOn(k);
    var mineDay=ss.some(function(s){return s.mine;});
    var dots=ss.map(function(s){return '<span class="dot '+toneOf(s.capacity-s.booked,s.capacity)+'"></span>';}).join('');
    var cls=['cell'];
    if(k<TODAY_K)cls.push('past');
    if(k===TODAY_K)cls.push('today');
    if(k===ui.sel)cls.push('sel');
    if(mineDay)cls.push('mine');
    var lbl=label(k)+', '+TN('cal.cls',ss.length)+(mineDay?', '+T('cal.youBooked'):'');
    cells+='<button class="'+cls.join(' ')+'" id="day-'+k+'" data-act="pick-day" data-date="'+k+'" aria-label="'+esc(lbl)+'" aria-pressed="'+(k===ui.sel)+'"><span class="n">'+d+'</span><span class="dots">'+dots+'</span></button>';
  }
  var head=dayNames().map(function(x){return '<div class="wd">'+x+'</div>';}).join('');

  var calendar='<section class="panel" aria-label="'+esc(T('cal.aria'))+'"><div class="cal-h"><h2>'+I18N.month(ui.cm)+' '+ui.cy+'</h2>'+
    '<div class="cal-nav"><button class="btn ghost" id="nav-prev" data-act="prev" aria-label="'+esc(T('cal.prev'))+'">&lsaquo;</button>'+
    '<button class="btn ghost" id="nav-today" data-act="today">'+T('cal.today')+'</button>'+
    '<button class="btn ghost" id="nav-next" data-act="next" aria-label="'+esc(T('cal.next'))+'">&rsaquo;</button></div></div>'+
    '<div class="grid7">'+head+cells+'</div>'+
    '<div class="legend cal-legend"><span><i class="sw ok"></i>'+T('cal.open')+'</span><span><i class="sw warn"></i>'+T('cal.few')+'</span><span><i class="sw bad"></i>'+T('cal.full')+'</span><span><i class="sw mine"></i>'+T('cal.mine')+'</span></div></section>';

  return '<div class="page">'+
    '<section aria-label="'+esc(T('plan.section'))+'"><div class="sec-h"><div><h2>'+T('plan.section')+'</h2><p class="sub">'+T('plan.sub')+'</p></div></div>'+
    '<div class="plans single">'+plansHTML+'</div>'+meter+'</section>'+
    '<div class="main">'+calendar+dayPanel(plan)+'</div>'+
    upcomingHTML()+'</div>';
}

function dayPanel(plan){
  var ss=sessionsOn(ui.sel);
  var used=usedInMonth(ui.sel.slice(0,7));
  var blocked=plan&&used>=plan.visits&&ui.sel>=TODAY_K;
  var html='<section class="panel" id="day-panel" aria-label="'+esc(T('day.aria'))+'"><div class="day-h"><h2>'+label(ui.sel)+'</h2>'+
    '<p class="sub">'+(ss.length?TN('cal.cls',ss.length):T('day.none'))+'</p></div>';
  if(blocked){
    html+='<p class="note">'+esc(T('day.blocked',{n:plan.visits,plan:plan.name||T('day.yourPlan'),month:I18N.month(parseKey(ui.sel).getMonth())}))+'</p>';
  }
  if(!ss.length){
    html+='<p class="empty">'+T('day.pick')+'</p>';
  }else{
    html+=ss.map(function(s){return sessionRow(s,plan,used);}).join('');
  }
  return html+'</section>';
}

function sessionRow(s,plan,used){
  var past=startOf(s.date,s.startTime)<new Date();
  var left=Math.max(0,s.capacity-s.booked);
  var tone=toneOf(left,s.capacity);
  var id=s.classId+'-'+s.date;
  var action='';
  if(s.mine&&past){
    action='<span class="pill neutral">'+T('row.attended')+'</span>';
  }else if(s.mine){
    action='<span class="pill accent">'+T('row.booked')+'</span><button class="btn ghost" id="act-'+id+'" data-act="cancel" data-booking="'+s.bookingId+'">'+T('row.cancel')+'</button>';
  }else if(past){
    action='<span class="muted">'+T('row.ended')+'</span>';
  }else if(!plan){
    action='<button class="btn" id="act-'+id+'" disabled>'+T('row.choosePlan')+'</button>';
  }else if(left===0){
    action='<button class="btn" id="act-'+id+'" disabled>'+T('row.full')+'</button>';
  }else if(used>=plan.visits){
    action='<button class="btn" id="act-'+id+'" disabled>'+T('row.noVisits')+'</button>';
  }else{
    action='<button class="btn" id="act-'+id+'" data-act="book" data-class="'+s.classId+'" data-date="'+s.date+'">'+T('row.book')+'</button>';
  }
  var statusPill=left===0?'<span class="pill bad">'+T('row.full')+'</span>':'';
  return '<div class="row"><div class="rtime">'+esc(s.startTime)+'</div><div>'+
    '<div class="rname">'+esc(s.name||T('row.untitled'))+'</div>'+
    '<div class="rmeta">'+T('row.min',{n:s.durationMinutes})+(s.coach?esc(T('row.with',{coach:s.coach})):'')+'</div>'+
    '<div class="cap"><span class="capbar"><span class="'+tone+'" style="width:'+Math.min(100,s.booked/s.capacity*100)+'%"></span></span>'+
    '<span>'+TN('row.cap',left,{booked:s.booked,cap:s.capacity,left:left})+'</span>'+statusPill+'</div></div>'+
    '<div class="act">'+action+'</div></div>';
}

function upcomingHTML(){
  var nowD=new Date();
  var list=state.bookings.filter(function(b){return startOf(b.date,b.startTime)>=nowD;});
  var body=list.length?'<div class="mylist">'+list.map(function(b){
    return '<div class="mrow"><span><b>'+shortLabel(b.date)+', '+esc(b.startTime)+'</b> '+esc(b.className||T('row.untitled'))+'</span>'+
      '<button class="btn ghost" id="up-'+b.id+'" data-act="cancel" data-booking="'+b.id+'">'+T('row.cancel')+'</button></div>';
  }).join('')+'</div>':'<p class="muted">'+T('up.none')+'</p>';
  return '<section class="panel" aria-label="'+esc(T('up.aria'))+'"><div class="sec-h"><h2>'+T('up.title')+'</h2></div>'+body+
    (list.length?'<p class="sub">'+T('up.hint')+'</p>':'')+'</section>';
}

function adminHTML(){
  var plans=state.plans.map(function(p){
    if(p.removed)return removedCard('plan',p);
    return '<div class="acard'+(p.isNew?' isnew':'')+'">'+(p.isNew?'<span class="pill accent newtag">'+T('chg.add')+'</span>':'')+'<div class="fields">'+
      field(T('a.plan.name'),'plan-name-'+p.id,inp('plan',p.id,'name','text',p.name,'maxlength="40"'),'wide')+
      field(T('a.plan.price'),'plan-price-'+p.id,'<div class="prefix"><span>$</span>'+inp('plan',p.id,'price','number',p.price,'min="0" step="0.01" inputmode="decimal"')+'</div>')+
      field(T('a.plan.visits'),'plan-visits-'+p.id,inp('plan',p.id,'visits','number',p.visits,'min="0" max="99" step="1" inputmode="numeric"'))+
      '<div class="field end"><button class="btn danger" id="del-plan-'+p.id+'" data-act="del-plan" data-id="'+p.id+'">'+T('a.remove')+'</button></div>'+
      '</div></div>';
  }).join('');

  var classes=state.classes.map(function(c){
    if(c.removed)return removedCard('class',c);
    var chips=dayNames().map(function(n,i){
      var on=c.days.indexOf(i+1)>-1;
      return '<button class="chip-btn" id="chip-'+c.id+'-'+(i+1)+'" data-act="toggle-day" data-id="'+c.id+'" data-d="'+(i+1)+'" aria-pressed="'+on+'">'+n+'</button>';
    }).join('');
    return '<div class="acard'+(c.isNew?' isnew':'')+'">'+(c.isNew?'<span class="pill accent newtag">'+T('chg.add')+'</span>':'')+'<div class="fields">'+
      field(T('a.class.name'),'class-name-'+c.id,inp('class',c.id,'name','text',c.name,'maxlength="40"'),'wide')+
      field(T('a.class.coach'),'class-coach-'+c.id,inp('class',c.id,'coach','text',c.coach,'maxlength="40"'))+
      field(T('a.class.time'),'class-time-'+c.id,inp('class',c.id,'time','time',c.time))+
      field(T('a.class.length'),'class-duration-'+c.id,inp('class',c.id,'duration','number',c.duration,'min="5" max="240" step="5" inputmode="numeric"'))+
      field(T('a.class.max'),'class-capacity-'+c.id,inp('class',c.id,'capacity','number',c.capacity,'min="1" max="200" step="1" inputmode="numeric"'))+
      '</div><div><div class="lab" style="margin-bottom:6px">'+T('a.class.repeats')+'</div><div class="chips">'+chips+'</div></div>'+
      '<div><button class="btn danger" id="del-class-'+c.id+'" data-act="del-class" data-id="'+c.id+'">'+T('a.class.remove')+'</button></div></div>';
  }).join('');

  var pages={
    plans:'<section aria-label="'+esc(T('a.plans.aria'))+'"><div class="sec-h"><div><h2>'+T('a.plans.title')+'</h2><p class="sub">'+T('a.plans.sub')+'</p></div></div>'+
      '<div class="stack">'+(plans||'<p class="muted">'+T('a.plans.none')+'</p>')+'<button class="btn ghost add" id="add-plan" data-act="add-plan">'+T('a.plans.add')+'</button></div></section>',
    schedule:'<section aria-label="'+esc(T('a.classes.aria'))+'"><div class="sec-h"><div><h2>'+T('a.classes.title')+'</h2><p class="sub">'+T('a.classes.sub')+'</p></div></div>'+
      '<div class="stack">'+(classes||'<p class="muted">'+T('a.classes.none')+'</p>')+'<button class="btn ghost add" id="add-class" data-act="add-class">'+T('a.classes.add')+'</button></div></section>'+
      '<section aria-label="'+esc(T('a.board.aria'))+'"><div class="sec-h"><div><h2>'+T('a.board.title')+'</h2><p class="sub">'+T('a.board.sub')+'</p></div></div>'+
      '<div class="board" id="board">'+boardHTML()+'</div></section>',
    members:'<section aria-label="'+esc(T('a.members.aria'))+'"><div class="sec-h"><div><h2>'+T('a.members.title')+'</h2><p class="sub">'+T('a.members.sub',{month:I18N.month(TODAY.getMonth())})+'</p></div></div>'+
      '<div class="board" id="members-board">'+membersHTML()+'</div></section>'+
      '<section aria-label="'+esc(T('a.att.title'))+'"><div class="sec-h"><div><h2>'+T('a.att.title')+' &middot; '+I18N.month(TODAY.getMonth())+' '+TODAY.getFullYear()+'</h2><p class="sub">'+T('a.att.sub')+'</p></div></div>'+
      '<div class="board" id="attendance-board">'+attendanceHTML()+'</div></section>'
  };
  var nav='<nav class="tabs" aria-label="'+esc(T('a.nav'))+'">'+ADMIN_PAGES.map(function(k){
    var on=k===ui.page;
    return '<a class="tab'+(dirtyCount(k)?' dirty':'')+'" id="tab-'+k+'" href="#/'+k+'"'+(on?' aria-current="page"':'')+(dirtyCount(k)?' title="'+esc(T('a.unsaved'))+'"':'')+'>'+T('a.nav.'+k)+'</a>';
  }).join('')+'</nav>';
  return nav+'<div class="page">'+pages[ui.page]+'</div>'+savebarHTML(ui.page);
}
/* who is booked into each class this month (admin, Members page) */
function attendanceHTML(){
  var nowD=new Date();
  if(!state.attendance.length)return '<div class="mrow"><span class="muted">'+T('a.classes.none')+'</span></div>';
  return state.attendance.map(function(c){
    var people={};c.sessions.forEach(function(x){x.attendees.forEach(function(a){people[a.id]=1;});});
    var nMembers=Object.keys(people).length;
    var open=ui.openClasses[c.classId]?' open':'';
    var body=c.sessions.length?c.sessions.map(function(x){
      var past=startOf(x.date,c.startTime)<nowD;
      return '<div class="asess"><div class="ahead"><b>'+esc(shortLabel(x.date))+'</b> <span class="muted">'+esc(c.startTime)+'</span>'+
        '<span class="pill '+(past?'neutral':'accent')+'">'+T(past?'a.att.attended':'a.att.upcoming')+'</span>'+
        '<span class="muted">'+x.attendees.length+' / '+c.capacity+'</span></div>'+
        '<div class="names">'+x.attendees.map(function(a){return '<span class="name">'+esc(a.name)+'</span>';}).join('')+'</div></div>';
    }).join(''):'<p class="muted">'+T('a.att.none')+'</p>';
    return '<details class="att" data-cid="'+c.classId+'"'+open+'><summary><span><b>'+esc(c.name||T('row.untitled'))+'</b> <span class="muted">'+esc(c.startTime)+(c.coach?esc(T('row.with',{coach:c.coach})):'')+'</span></span>'+
      '<span class="muted">'+esc(TN('a.att.bookings',c.totalBookings))+', '+esc(TN('a.att.members',nMembers))+'</span></summary><div class="abody">'+body+'</div></details>';
  }).join('');
}
function boardHTML(){
  var out='',i;
  for(i=1;i<=7;i++){
    var list=state.classes.filter(function(c){return c.days.indexOf(i)>-1;}).sort(function(a,b){return a.time<b.time?-1:a.time>b.time?1:0;});
    var items=list.length?list.map(function(c){
      return '<span class="bitem"><b>'+esc(c.time)+'</b>'+esc(c.name||T('row.untitled'))+'<em>'+T('a.board.max',{n:c.capacity})+'</em></span>';
    }).join(''):'<span class="muted">'+T('a.board.none')+'</span>';
    out+='<div class="brow"><div class="bday">'+I18N.day(i-1)+'</div><div class="bitems">'+items+'</div></div>';
  }
  return out;
}
function membersHTML(){
  if(!state.members.length)return '<div class="mrow"><span class="muted">'+T('a.members.none')+'</span></div>';
  return state.members.map(function(m){
    var cur=pending.hasOwnProperty(m.id)?pending[m.id]:m.planId;
    var opts='<option value="">'+esc(T('a.members.noPlan'))+'</option>'+base.plans.map(function(p){
      return '<option value="'+p.id+'"'+(p.id===cur?' selected':'')+'>'+esc(p.name||T('plan.untitled'))+'</option>';
    }).join('');
    return '<div class="mrow"><span><b>'+esc(m.name)+'</b> <span class="muted">'+esc(m.email)+'</span></span>'+
      '<span class="massign"><button class="btn ghost small" id="hist-'+m.id+'" data-act="history" data-id="'+m.id+'">'+T('a.hist.btn')+'</button>'+(m.planName!=null?'<span class="muted">'+esc(T('a.members.visits',{used:m.visitsUsedThisMonth,total:m.visitsPerMonth}))+'</span>':'')+
      '<select class="plansel'+(pending.hasOwnProperty(m.id)?' changed':'')+'" id="mplan-'+m.id+'" data-member="'+m.id+'" aria-label="'+esc(T('a.members.planFor',{name:m.name}))+'">'+opts+'</select></span></div>';
  }).join('');
}
async function assignPlan(memberId,planId){
  var m=await api('PUT','/api/admin/members/'+memberId+'/plan',{planId:planId});
  var i=state.members.findIndex(function(x){return x.id===memberId;});
  if(i>-1)state.members[i]=m;
  var b=document.getElementById('members-board');if(b)b.innerHTML=membersHTML();
  var f=document.getElementById('mplan-'+memberId);if(f)f.focus({preventScroll:true});
  toast(m.planName!=null?T('a.members.assigned',{name:m.name,plan:m.planName}):T('a.members.unassigned',{name:m.name}));
}

/* ---------- admin drafts: what changed, save bar, save dialog ---------- */
function markRemoved(list,id){
  var i=list.findIndex(function(x){return x.id===id;});if(i<0)return;
  if(list[i].isNew)list.splice(i,1);else list[i].removed=true;
}
function removedCard(kind,o){
  return '<div class="acard removed"><div class="rmline"><span><span class="pill bad">'+T('chg.remove')+'</span> <b class="struck">'+esc(o.name||T(kind==='plan'?'plan.untitled':'row.untitled'))+'</b></span>'+
    '<button class="btn ghost" id="undo-'+kind+'-'+o.id+'" data-act="undo-'+kind+'" data-id="'+o.id+'">'+T('a.undo')+'</button></div></div>';
}
function daysText(a){return a.length?a.map(function(d){return I18N.day(d-1);}).join(', '):T('chg.none');}
function cv(v){return v===''||v==null?T('chg.empty'):String(v);}
function line(label,a,b){return '<span class="muted">'+esc(label)+':</span> '+esc(a)+' &rarr; <b>'+esc(b)+'</b>';}
function planChanges(){
  var out=[];
  state.plans.forEach(function(p){
    if(p.isNew){out.push({kind:'add',title:p.name||T('plan.untitled'),lines:[esc(money(p.price)+' '+T('plan.perMonth')+', '+TN('plan.visits',p.visits))]});return;}
    var b=base.plans.find(function(x){return x.id===p.id;});if(!b)return;
    if(p.removed){out.push({kind:'remove',title:b.name||T('plan.untitled'),lines:[esc(T('chg.planRemoved'))]});return;}
    var l=[];
    if(p.name!==b.name)l.push(line(T('a.plan.name'),cv(b.name),cv(p.name)));
    if(p.price!==b.price)l.push(line(T('a.plan.price'),money(b.price),money(p.price)));
    if(p.visits!==b.visits)l.push(line(T('a.plan.visits'),b.visits,p.visits));
    if(l.length)out.push({kind:'edit',title:b.name||T('plan.untitled'),lines:l});
  });
  return out;
}
function classChanges(){
  var out=[];
  state.classes.forEach(function(c){
    if(c.isNew){out.push({kind:'add',title:c.name||T('row.untitled'),lines:[esc(c.time+', '+T('row.min',{n:c.duration})+', '+T('a.class.max')+' '+c.capacity+', '+daysText(c.days))]});return;}
    var b=base.classes.find(function(x){return x.id===c.id;});if(!b)return;
    if(c.removed){out.push({kind:'remove',title:b.name||T('row.untitled'),lines:[esc(T('chg.classRemoved'))]});return;}
    var l=[];
    if(c.name!==b.name)l.push(line(T('a.class.name'),cv(b.name),cv(c.name)));
    if(c.coach!==b.coach)l.push(line(T('a.class.coach'),cv(b.coach),cv(c.coach)));
    if(c.time!==b.time)l.push(line(T('a.class.time'),b.time,c.time));
    if(c.duration!==b.duration)l.push(line(T('a.class.length'),b.duration,c.duration));
    if(c.capacity!==b.capacity)l.push(line(T('a.class.max'),b.capacity,c.capacity));
    if(c.days.join()!==b.days.join())l.push(line(T('a.class.repeats'),daysText(b.days),daysText(c.days)));
    if(l.length)out.push({kind:'edit',title:b.name||T('row.untitled'),lines:l});
  });
  return out;
}
function planName(id){var p=base.plans.find(function(x){return x.id===id;});return p?(p.name||T('plan.untitled')):T('a.members.noPlan');}
function memberChanges(){
  var out=[];
  state.members.forEach(function(m){
    if(!pending.hasOwnProperty(m.id))return;
    out.push({kind:'edit',title:m.name,lines:[line(T('a.members.plan'),m.planId==null?T('a.members.noPlan'):planName(m.planId),pending[m.id]==null?T('a.members.noPlan'):planName(pending[m.id]))]});
  });
  return out;
}
function changesFor(page){return page==='plans'?planChanges():page==='schedule'?classChanges():page==='members'?memberChanges():[];}
function dirtyCount(page){return changesFor(page).length;}
function dirtyAny(){return ADMIN_PAGES.some(function(k){return dirtyCount(k)>0;});}
function savebarHTML(page){
  var n=dirtyCount(page);
  return '<div class="savebar" id="savebar"><span class="'+(n?'':'muted')+'" aria-live="polite">'+(n?'<b>'+TN('a.savebar.n',n)+'</b>':T('a.savebar.none'))+'</span><span class="sbtns">'+
    '<button class="btn ghost" id="discard-page" data-act="discard"'+(n?'':' disabled')+'>'+T('a.discard')+'</button>'+
    '<button class="btn" id="save-page" data-act="save"'+(n?'':' disabled')+'>'+T('a.save')+'</button></span></div>';
}
/* update the save bar and the tab markers without re-rendering the page (keeps focus in the field being typed in) */
function refreshDirty(){
  var sb=document.getElementById('savebar');
  if(sb){
    var n=dirtyCount(ui.page),tx=sb.firstChild;
    tx.className=n?'':'muted';tx.innerHTML=n?'<b>'+TN('a.savebar.n',n)+'</b>':T('a.savebar.none');
    var d=document.getElementById('discard-page'),sv=document.getElementById('save-page');
    if(d)d.disabled=!n;if(sv)sv.disabled=!n;
  }
  ADMIN_PAGES.forEach(function(k){
    var t=document.getElementById('tab-'+k);if(!t)return;
    var d=dirtyCount(k)>0;t.classList.toggle('dirty',d);
    if(d)t.setAttribute('title',T('a.unsaved'));else t.removeAttribute('title');
  });
}
function openSave(){
  var ch=changesFor(ui.page);if(!ch.length)return;
  ui.modal={type:'save',page:ui.page,changes:ch,saving:false,error:''};
  renderModal();
}
function discard(){
  if(!dirtyCount(ui.page))return;
  if(!window.confirm(T('a.discard.confirm')))return;
  if(ui.page==='plans')state.plans=clone(base.plans);
  else if(ui.page==='schedule')state.classes=clone(base.classes);
  else pending={};
  render();
}
/* one server call per change; each success updates base so a failure half-way leaves an accurate draft */
async function step(label,fn){
  try{return await fn();}
  catch(e){if(e&&e.status===401)throw e;throw new Error((label?label+': ':'')+(e&&e.message||T('wrong')));}
}
async function applyPlans(){
  var list=state.plans.slice(),i,p,b;
  for(i=0;i<list.length;i++){p=list[i];if(p.isNew||p.removed)continue;
    b=base.plans.find(function(x){return x.id===p.id;});
    if(b&&(p.name!==b.name||p.price!==b.price||p.visits!==b.visits)){
      await step(b.name,function(){return api('PUT','/api/admin/plans/'+p.id,planBody(p));});
      base.plans[base.plans.indexOf(b)]=clone(p);
    }}
  for(i=0;i<list.length;i++){p=list[i];if(!p.isNew)continue;
    var made=await step(p.name,function(){return api('POST','/api/admin/plans',planBody(p));});
    var np=normPlan(made);state.plans[state.plans.indexOf(p)]=np;base.plans.push(clone(np));}
  var gone=false;
  for(i=0;i<list.length;i++){p=list[i];if(!p.removed)continue;
    await step(p.name,function(){return api('DELETE','/api/admin/plans/'+p.id);});
    state.plans=state.plans.filter(function(x){return x.id!==p.id;});base.plans=base.plans.filter(function(x){return x.id!==p.id;});
    Object.keys(pending).forEach(function(k){if(pending[k]===p.id)delete pending[k];});gone=true;}
  if(gone)await loadMembers();
}
async function applyClasses(){
  var list=state.classes.slice(),i,c,b;
  for(i=0;i<list.length;i++){c=list[i];if(c.isNew||c.removed)continue;
    b=base.classes.find(function(x){return x.id===c.id;});
    if(b&&(c.name!==b.name||c.coach!==b.coach||c.time!==b.time||c.duration!==b.duration||c.capacity!==b.capacity||c.days.join()!==b.days.join())){
      await step(b.name,function(){return api('PUT','/api/admin/classes/'+c.id,classBody(c));});
      base.classes[base.classes.indexOf(b)]=clone(c);
    }}
  for(i=0;i<list.length;i++){c=list[i];if(!c.isNew)continue;
    var made=await step(c.name,function(){return api('POST','/api/admin/classes',classBody(c));});
    var nc=normClass(made);state.classes[state.classes.indexOf(c)]=nc;base.classes.push(clone(nc));}
  for(i=0;i<list.length;i++){c=list[i];if(!c.removed)continue;
    await step(c.name,function(){return api('DELETE','/api/admin/classes/'+c.id);});
    state.classes=state.classes.filter(function(x){return x.id!==c.id;});base.classes=base.classes.filter(function(x){return x.id!==c.id;});}
  await Promise.all([loadMembers(),loadAttendance()]);
}
async function applyMembers(){
  var ids=Object.keys(pending);
  for(var i=0;i<ids.length;i++){
    var id=Number(ids[i]),m=state.members.find(function(x){return x.id===id;});
    var res=await step(m?m.name:'',function(){return api('PUT','/api/admin/members/'+id+'/plan',{planId:pending[id]});});
    var k=state.members.findIndex(function(x){return x.id===id;});if(k>-1)state.members[k]=res;
    delete pending[id];
  }
}
async function confirmSave(){
  var m=ui.modal;if(!m||m.type!=='save'||m.saving)return;
  m.saving=true;m.error='';renderModal();
  try{
    if(m.page==='plans')await applyPlans();else if(m.page==='schedule')await applyClasses();else await applyMembers();
    ui.modal=null;render();toast(T('a.save.done'));
    var b=document.getElementById('save-page');if(b&&!b.disabled)b.focus({preventScroll:true});
  }catch(e){
    if(handleAuthError(e)){ui.modal=null;renderModal();return;}
    if(ui.modal!==m)return;
    m.saving=false;m.changes=changesFor(m.page);m.error=T('a.save.failed',{why:e.message});
    render();
  }
}
window.addEventListener('beforeunload',function(e){if(auth&&auth.role==='ADMIN'&&dirtyAny()){e.preventDefault();e.returnValue='';}});


/* ---------- member history dialog (admin) ---------- */
function fmtDate(iso){return new Date(iso).toLocaleDateString(I18N.lang==='el'?'el-GR':'en-GB',{day:'numeric',month:'short',year:'numeric'});}
function monthLabel(k){var a=k.split('-');return I18N.month(Number(a[1])-1)+' '+a[0];}
function historyModalHTML(){
  var m=ui.modal,d=m.data,body;
  if(m.error)body='<p class="err">'+esc(m.error)+'</p>';
  else if(!d)body='<p class="muted">'+T('loading')+'</p>';
  else{
    var plans=d.plans.length?'<ul class="hlist">'+d.plans.map(function(p){
      var active=!p.to;
      return '<li class="hrow"><span><b>'+esc(p.planName)+'</b> <span class="muted">'+money(Number(p.price))+' '+T('plan.perMonth')+', '+esc(TN('plan.visits',p.visitsPerMonth))+'</span></span>'+
        '<span class="hdates">'+esc(fmtDate(p.from))+' &ndash; '+(active?'<span class="pill accent">'+T('a.hist.active')+'</span>':esc(fmtDate(p.to)))+'</span></li>';
    }).join('')+'</ul>':'<p class="muted">'+T('a.hist.none')+'</p>';
    var months='<ul class="hlist">'+d.months.map(function(x){
      var txt=x.visitsPerMonth!=null?T('a.hist.usedOf',{used:x.visits,total:x.visitsPerMonth}):TN('a.hist.visitsUsed',x.visits);
      return '<li class="hrow"><span><b>'+esc(monthLabel(x.month))+'</b> <span class="muted">'+esc(x.planName!=null?x.planName:T('a.hist.noPlanMonth'))+'</span></span><span class="hv">'+esc(txt)+'</span></li>';
    }).join('')+'</ul>';
    body='<h3>'+T('a.hist.plans')+'</h3>'+plans+'<h3>'+T('a.hist.months')+'</h3>'+months;
  }
  return '<div class="scrim" data-act="modal-close-bg"><div class="dialog" role="dialog" aria-modal="true" aria-labelledby="hist-title">'+
    '<h2 id="hist-title">'+esc(T('a.hist.title',{name:m.name}))+'</h2><div class="dbody">'+body+'</div>'+
    '<div class="dactions"><button class="btn" id="hist-close" data-act="modal-close" data-autofocus>'+T('a.hist.close')+'</button></div></div></div>';
}
function saveModalHTML(){
  var m=ui.modal;
  var list=m.changes.length?m.changes.map(function(c){
    return '<div class="chg"><div class="chead"><span class="pill '+(c.kind==='remove'?'bad':c.kind==='add'?'accent':'neutral')+'">'+T('chg.'+c.kind)+'</span> <b>'+esc(c.title)+'</b></div>'+
      (c.lines.length?'<ul>'+c.lines.map(function(l){return '<li>'+l+'</li>';}).join('')+'</ul>':'')+'</div>';
  }).join(''):'<p class="muted">'+T('a.savebar.none')+'</p>';
  return '<div class="scrim" data-act="modal-close-bg"><div class="dialog" role="dialog" aria-modal="true" aria-labelledby="save-title">'+
    '<h2 id="save-title">'+T('a.save.title')+'</h2><p class="sub">'+T('a.save.sub')+'</p>'+
    '<div class="dbody">'+list+(m.error?'<p class="err" role="alert">'+esc(m.error)+'</p>':'')+'</div>'+
    '<div class="dactions"><button class="btn ghost" id="save-cancel" data-act="modal-close" data-autofocus'+(m.saving?' disabled':'')+'>'+T('a.save.cancel')+'</button>'+
    '<button class="btn" id="save-confirm" data-act="save-confirm"'+(m.saving||!m.changes.length?' disabled':'')+'>'+T(m.saving?'a.save.saving':'a.save.confirm')+'</button></div></div></div>';
}
function modalHTML(){return ui.modal.type==='save'?saveModalHTML():historyModalHTML();}
function renderModal(){
  var root=document.getElementById('modal-root');
  if(!root){root=document.createElement('div');root.id='modal-root';document.body.appendChild(root);}
  if(!ui.modal){root.innerHTML='';return;}
  root.innerHTML=modalHTML();
  var c=root.querySelector('[data-autofocus]:not([disabled])')||root.querySelector('button:not([disabled])');if(c)c.focus({preventScroll:true});
}
async function openHistory(id){
  var m=state.members.find(function(x){return x.id===id;});
  ui.modal={type:'history',id:id,name:m?m.name:'',data:null,error:''};
  renderModal();
  try{var data=await api('GET','/api/admin/members/'+id+'/history');if(ui.modal&&ui.modal.id===id){ui.modal.data=data;renderModal();}}
  catch(e){
    if(handleAuthError(e)){ui.modal=null;renderModal();return;}
    if(ui.modal&&ui.modal.id===id){ui.modal.error=e.message||T('wrong');renderModal();}
  }
}
function closeModal(){
  if(!ui.modal||ui.modal.saving)return;
  var m=ui.modal;ui.modal=null;renderModal();
  var b=document.getElementById(m.type==='save'?'save-page':'hist-'+m.id);if(b)b.focus({preventScroll:true});
}
document.addEventListener('toggle',function(e){
  var t=e.target;
  if(t&&t.dataset&&t.dataset.cid)ui.openClasses[t.dataset.cid]=t.open?1:0;
},true);
document.addEventListener('keydown',function(e){
  if(!ui.modal)return;
  if(e.key==='Escape'){e.preventDefault();closeModal();}
  else if(e.key==='Tab'){
    var bs=[].slice.call(document.querySelectorAll('#modal-root button:not([disabled])'));
    e.preventDefault();
    if(!bs.length)return;
    var i=bs.indexOf(document.activeElement);
    i=e.shiftKey?(i<=0?bs.length-1:i-1):(i+1)%bs.length;
    bs[i].focus();
  }
});

/* ---------- admin pages: #/plans, #/schedule, #/members ---------- */
var ADMIN_PAGES=['plans','schedule','members'];
function pageFromHash(){var k=String(location.hash||'').replace(/^#\/?/,'');return ADMIN_PAGES.indexOf(k)>-1?k:'plans';}
window.addEventListener('hashchange',function(){
  var k=pageFromHash();
  if(k!==ui.page){
    ui.page=k;ui.modal=null;render();window.scrollTo(0,0);
    if(k==='members'&&auth&&auth.role==='ADMIN'){loadAttendance().then(function(){var b=document.getElementById('attendance-board');if(b)b.innerHTML=attendanceHTML();}).catch(function(){});}
  }
});

function render(){
  var f=document.activeElement&&document.activeElement.id;
  var body;
  if(ui.booting)body='<p class="muted status">'+T('loading')+'</p>';
  else if(ui.fatalErr)body='<div class="note status">'+esc(T('fatal',{url:API_BASE,reason:ui.fatalErr.message||T('networkError')}))+'</div>';
  else if(!auth)body=loginHTML();
  else body=auth.role==='ADMIN'?adminHTML():memberHTML();
  app.innerHTML=headerHTML()+body+footerHTML();
  document.body.classList.toggle('is-admin',!!(auth&&auth.role==='ADMIN'&&!ui.booting&&!ui.fatalErr));
  if(f){var el=document.getElementById(f);if(el&&el!==document.activeElement){try{el.focus({preventScroll:true});}catch(e){}}}
  renderModal();
}

var tt;
function toast(msg){
  var el=document.getElementById('toast');
  el.textContent=msg;el.hidden=false;
  clearTimeout(tt);tt=setTimeout(function(){el.hidden=true;},3600);
}

/* ---------- errors and busy guard ---------- */
function handleAuthError(e){
  if(e&&e.status===401&&auth){
    auth=null;state=emptyState();resetDraft();ui.modal=null;render();
    toast(T('sessionEnded'));
    return true;
  }
  return false;
}
async function run(fn){
  if(busy)return;
  busy=true;
  try{await fn();}
  catch(e){if(!handleAuthError(e))toast((e&&e.message)||T('wrong'));}
  finally{busy=false;}
}

/* ---------- member actions ---------- */
async function shiftMonth(n){
  var d=new Date(ui.cy,ui.cm+n,1);
  ui.cy=d.getFullYear();ui.cm=d.getMonth();
  ui.sel=(ui.cy===TODAY.getFullYear()&&ui.cm===TODAY.getMonth())?TODAY_K:key(d);
  await loadSessions();render();
}
async function goToday(){
  ui.cy=TODAY.getFullYear();ui.cm=TODAY.getMonth();ui.sel=TODAY_K;
  await loadSessions();render();
}
async function book(classId,k){
  var s=sessionsOn(k).filter(function(x){return x.classId===classId;})[0];
  try{
    await api('POST','/api/bookings',{classId:classId,date:k});
  }catch(e){
    if(e.status===401)throw e;
    await loadMemberData();render();
    throw e;
  }
  await loadMemberData();render();
  toast(T('toast.booked',{what:(s?s.name+', ':'')+shortLabel(k)+(s?' '+T('at')+' '+s.startTime:'')}));
}
async function cancelBooking(bookingId){
  await api('DELETE','/api/bookings/'+bookingId);
  await loadMemberData();render();
  toast(T('toast.cancelled'));
}

var SPECS={
  name:{t:'s'},coach:{t:'s'},time:{t:'time'},
  price:{t:'n',min:0,int:false},visits:{t:'n',min:0,int:true},
  capacity:{t:'n',min:1,int:true},duration:{t:'n',min:5,int:true}
};
function onField(t,final){
  var kind=t.dataset.kind,id=Number(t.dataset.id),f=t.dataset.field;
  if(!kind||!SPECS[f])return;
  var o=kind==='plan'?planById(id):classById(id);
  if(!o)return;
  var sp=SPECS[f];
  if(sp.t==='s'){o[f]=t.value;}
  else if(sp.t==='time'){if(/^\d\d:\d\d$/.test(t.value))o[f]=t.value;else{if(final)t.value=o[f];return;}}
  else{
    var v=parseFloat(t.value);
    if(!isFinite(v)||v<sp.min){if(final)t.value=o[f];return;}
    if(sp.int)v=Math.round(v);
    if(f==='price')v=Math.round(v*100)/100;
    o[f]=v;
    if(final)t.value=v;
  }
  var b=document.getElementById('board');if(b)b.innerHTML=boardHTML();
  refreshDirty();
}

/* ---------- login ---------- */
async function enter(user,msg){
  auth=user;
  ui.cy=TODAY.getFullYear();ui.cm=TODAY.getMonth();ui.sel=TODAY_K;
  state=emptyState();resetDraft();
  await loadAll();
  render();toast(msg);
}
async function logout(){
  if(auth&&auth.role==='ADMIN'&&dirtyAny()&&!window.confirm(T('unsaved.leave')))return;
  try{await api('POST','/api/auth/logout');}catch(e){}
  ui.modal=null;auth=null;state=emptyState();resetDraft();ui.loginRole='member';ui.registering=false;
  render();
}
function showErr(msg){
  var el=document.getElementById('login-err');
  if(el){el.textContent=msg;el.hidden=false;}
}

document.addEventListener('click',function(e){
  var t=e.target.closest('[data-act]');
  if(!t||t.disabled)return;
  var a=t.dataset.act,id=t.dataset.id?Number(t.dataset.id):null;
  if(a==='theme'){setTheme(themeNow()==='dark'?'light':'dark');render();}
  else if(a==='lang'){I18N.set(t.dataset.lang);render();}
  else if(a==='login-role'){ui.loginRole=t.dataset.role;ui.registering=false;render();}
  else if(a==='toggle-reg'){ui.registering=!ui.registering;render();}
  else if(a==='demo-fill'){
    var d=ui.loginRole==='admin'?DEMO.ADMIN:DEMO.MEMBER;
    document.getElementById('login-email').value=d.email;
    document.getElementById('login-password').value=d.password;
  }
  else if(a==='logout'){run(logout);}
  else if(a==='history'){openHistory(id);}
  else if(a==='modal-close'){closeModal();}
  else if(a==='modal-close-bg'){if(e.target===t)closeModal();}
  else if(a==='save'){openSave();}
  else if(a==='save-confirm'){confirmSave();}
  else if(a==='discard'){discard();}
  else if(a==='prev'){run(function(){return shiftMonth(-1);});}
  else if(a==='next'){run(function(){return shiftMonth(1);});}
  else if(a==='today'){run(goToday);}
  else if(a==='pick-day'){
    ui.sel=t.dataset.date;render();
    try{
      if(window.matchMedia('(max-width:860px)').matches){
        var calm=window.matchMedia('(prefers-reduced-motion:reduce)').matches;
        document.getElementById('day-panel').scrollIntoView({block:'start',behavior:calm?'auto':'smooth'});
      }
    }catch(err){}
  }
  else if(a==='book'){run(function(){return book(Number(t.dataset.class),t.dataset.date);});}
  else if(a==='cancel'){run(function(){return cancelBooking(Number(t.dataset.booking));});}
  else if(a==='add-plan'){
    var np={id:--tmpId,name:T('a.plans.new'),price:39,visits:6,isNew:true};
    state.plans.push(np);render();
    var pn=document.getElementById('plan-name-'+np.id);if(pn){pn.focus();pn.select();}
  }
  else if(a==='del-plan'){markRemoved(state.plans,id);render();}
  else if(a==='undo-plan'){var up=planById(id);if(up)up.removed=false;render();}
  else if(a==='add-class'){
    var nc={id:--tmpId,name:T('a.classes.new'),coach:'',time:'18:00',duration:45,capacity:10,days:[1],isNew:true};
    state.classes.push(nc);render();
    var cn=document.getElementById('class-name-'+nc.id);if(cn){cn.focus();cn.select();}
  }
  else if(a==='del-class'){markRemoved(state.classes,id);render();}
  else if(a==='undo-class'){var uc=classById(id);if(uc)uc.removed=false;render();}
  else if(a==='toggle-day'){
    var c=classById(id);if(!c)return;
    var day=Number(t.dataset.d),i=c.days.indexOf(day);
    if(i>-1)c.days.splice(i,1);else c.days.push(day);
    c.days.sort(function(x,y){return x-y;});
    render();
  }
});

document.addEventListener('input',function(e){if(e.target.dataset&&e.target.dataset.field)onField(e.target,false);});
document.addEventListener('change',function(e){
  var mid=e.target.dataset&&e.target.dataset.member;
  if(mid){
    var id=Number(mid),v=e.target.value===''?null:Number(e.target.value);
    var m=state.members.find(function(x){return x.id===id;});
    if(m&&m.planId===v)delete pending[id];else pending[id]=v;
    e.target.classList.toggle('changed',pending.hasOwnProperty(id));
    refreshDirty();
    return;
  }if(e.target.dataset&&e.target.dataset.field)onField(e.target,true);});

document.addEventListener('submit',function(e){
  if(e.target.id!=='login-form')return;
  e.preventDefault();
  run(async function(){
    var email=document.getElementById('login-email').value.trim();
    var pw=document.getElementById('login-password').value;
    var admin=ui.loginRole==='admin',reg=!admin&&ui.registering;
    if(!email||!pw){showErr(T('login.needBoth'));return;}
    var body,path,msg;
    if(admin){path='/api/auth/login';body={email:email,password:pw,role:'ADMIN'};msg=T('login.welcomeAdmin');}
    else if(reg){
      var name=document.getElementById('login-name').value.trim();
      if(!name){showErr(T('login.needName'));return;}
      if(!/^\S+@\S+\.\S+$/.test(email)){showErr(T('login.badEmail'));return;}
      if(pw.length<6){showErr(T('login.shortPw'));return;}
      path='/api/auth/register';body={name:name,email:email,password:pw};msg=T('login.created');
    }else{path='/api/auth/login';body={email:email,password:pw,role:'MEMBER'};msg=T('login.welcome');}
    var user;
    try{user=await api('POST',path,body);}
    catch(err){showErr(err.message);return;}
    ui.registering=false;
    await enter(user,msg);
  });
});

/* ---------- start ---------- */
(async function boot(){
  try{
    try{auth=await api('GET','/api/auth/me');}
    catch(e){if(e.status===401)auth=null;else throw e;}
    if(auth)await loadAll();
  }catch(e){
    auth=null;
    ui.fatalErr=e||new Error('');
  }
  ui.page=pageFromHash();ui.booting=false;render();
})();
})();
