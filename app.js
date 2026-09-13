import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.4'

const SUPABASE_URL = 'https://crafvogyagobfmpxzmvr.supabase.co'
const SUPABASE_KEY = 'sb_publishable_8-5DgZQrgJrgm2AgvUyKug_dHs4Hyh3'
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

const DEFAULT_AREAS = ['Kitchen','Bedroom 1','Bedroom 2','Bathroom 1','Bathroom 2','Hall','Balcony']
const $ = (s) => document.querySelector(s)
const $$ = (s) => [...document.querySelectorAll(s)]
const state = { user:null, project:null, membership:null, areas:[], activities:[], team:[], page:'dashboard', authMode:'signin' }

function toast(message){ const el=$('#toast'); el.textContent=message; el.classList.remove('hidden'); clearTimeout(window.__toast); window.__toast=setTimeout(()=>el.classList.add('hidden'),2600) }
function esc(s=''){ return String(s).replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c])) }
function fmtDate(v){ if(!v) return '—'; return new Intl.DateTimeFormat('en-IN',{day:'2-digit',month:'short',year:'numeric'}).format(new Date(v+'T00:00:00')) }
function statusClass(s){ return {'Completed':'s-completed','In Progress':'s-progress','Waiting':'s-waiting','On Hold':'s-hold','Not Started':'s-not'}[s]||'s-not' }
function isOverdue(a){ return a.expected_completion && a.status!=='Completed' && new Date(a.expected_completion+'T23:59:59') < new Date() }
function areaName(id){ return state.areas.find(a=>a.id===id)?.name || 'Unknown' }
function show(el,yes=true){ el?.classList.toggle('hidden',!yes) }

async function init(){
  const {data:{session}} = await supabase.auth.getSession()
  if(session?.user) await enterApp(session.user); else showAuth()
  supabase.auth.onAuthStateChange(async(_event,session)=>{ if(session?.user && !state.user) await enterApp(session.user); if(!session) showAuth() })
}
function showAuth(){ state.user=null; show($('#authView'),true); show($('#appView'),false) }
async function enterApp(user){ state.user=user; show($('#authView'),false); show($('#appView'),true); $('#userLabel').textContent=user.email||'Signed in'; await loadProjectContext() }

async function loadProjectContext(){
  const {data:owned} = await supabase.from('projects').select('*').eq('owner_id',state.user.id).limit(1)
  if(owned?.length){ state.project=owned[0]; state.membership={role:'owner',status:'approved'}; await loadProjectData(); return }
  const {data:members} = await supabase.from('project_members').select('project_id,role,status').eq('user_id',state.user.id).order('created_at',{ascending:false}).limit(1)
  if(members?.length){ state.membership=members[0]; if(members[0].status==='approved'){ const {data:p}=await supabase.from('projects').select('*').eq('id',members[0].project_id).single(); state.project=p; await loadProjectData() } else { showSetup('waiting') } return }
  state.project=null; state.membership=null; showSetup('new')
}
function showSetup(kind){
  show($('#mainPages'),false);
  const setup=$('#setupView'), waiting=$('#waitingView');
  setup?.classList.toggle('active', kind==='new');
  waiting?.classList.toggle('active', kind==='waiting');
  show(setup, kind==='new');
  show(waiting, kind==='waiting');
}

async function createProject(){
  const name=$('#newProjectName').value.trim()||'My Home Interior'
  const {data:p,error}=await supabase.from('projects').insert({name,owner_id:state.user.id}).select().single()
  if(error) return toast(error.message)
  const rows=DEFAULT_AREAS.map((name,i)=>({project_id:p.id,name,sort_order:i+1}))
  const {error:aerr}=await supabase.from('areas').insert(rows)
  if(aerr) return toast(aerr.message)
  state.project=p; state.membership={role:'owner',status:'approved'}; toast('Project created'); await loadProjectData()
}
async function joinProject(){
  const code=$('#joinCode').value.trim().toUpperCase(); if(!code) return toast('Enter an invite code')
  const {error}=await supabase.rpc('request_project_access',{p_invite_code:code})
  if(error) return toast(error.message)
  $('#joinStatus').textContent='Request sent. The owner needs to approve you.'; toast('Access requested'); await loadProjectContext()
}

async function loadProjectData(){
  showSetup('none'); show($('#mainPages'),true); show($('#setupView'),false); show($('#waitingView'),false)
  $('#projectNameSide').textContent=state.project.name; $('#dashboardTitle').textContent=state.project.name; $('#inviteCode').textContent=state.project.invite_code||'--------'
  const [{data:areas},{data:activities}] = await Promise.all([
    supabase.from('areas').select('*').eq('project_id',state.project.id).order('sort_order'),
    supabase.from('activities').select('*').eq('project_id',state.project.id).order('updated_at',{ascending:false})
  ])
  state.areas=areas||[]; state.activities=activities||[]; populateAreaSelects(); renderAll(); if(isOwner()) await loadTeam()
}
function isOwner(){ return state.membership?.role==='owner' || state.project?.owner_id===state.user?.id }
function populateAreaSelects(){
  const opts=state.areas.map(a=>`<option value="${a.id}">${esc(a.name)}</option>`).join('')
  $('#activityArea').innerHTML=opts; $('#areaFilter').innerHTML='<option value="all">All areas</option>'+opts
}
function renderAll(){ renderDashboard(); renderActivities(); renderPending(); renderTeam(); $('#pendingBadge').textContent=state.activities.filter(a=>a.pending_with_me && a.status!=='Completed').length }

function renderDashboard(){
  const total=state.activities.length, completed=state.activities.filter(a=>a.status==='Completed').length, pct=total?Math.round(completed/total*100):0
  const overdue=state.activities.filter(isOverdue).length, pending=state.activities.filter(a=>a.pending_with_me&&a.status!=='Completed').length
  $('#overallProgress').textContent=pct+'%'; $('#overallBar').style.width=pct+'%'; $('#totalActivities').textContent=total; $('#completedSummary').textContent=`${completed} completed`; $('#overdueCount').textContent=overdue; $('#pendingCount').textContent=pending
  $('#todayText').textContent=new Intl.DateTimeFormat('en-IN',{weekday:'long',day:'numeric',month:'long',year:'numeric'}).format(new Date())
  $('#areaProgress').innerHTML=state.areas.map(ar=>{ const aa=state.activities.filter(x=>x.area_id===ar.id), c=aa.filter(x=>x.status==='Completed').length, p=aa.length?Math.round(c/aa.length*100):0; return `<div class="area-row"><span>${esc(ar.name)}</span><div class="progress"><i style="width:${p}%"></i></div><strong>${p}%</strong></div>` }).join('') || '<div class="empty-mini">No areas yet.</div>'
  const upcoming=[...state.activities].filter(a=>a.expected_completion&&a.status!=='Completed').sort((a,b)=>a.expected_completion.localeCompare(b.expected_completion)).slice(0,6)
  $('#upcomingList').innerHTML=upcoming.length?upcoming.map(a=>`<div class="list-item" data-edit="${a.id}"><div class="list-main"><strong>${esc(a.activity)}</strong><small>${esc(areaName(a.area_id))} · <span class="status ${statusClass(a.status)}">${esc(a.status)}</span></small></div><span class="date-chip ${isOverdue(a)?'overdue':''}">${fmtDate(a.expected_completion)}</span></div>`).join(''):'<div class="empty-mini">No upcoming deadlines.</div>'
  const recent=state.activities.slice(0,6); $('#recentTable').innerHTML=tableMarkup(recent,false)
}
function filteredActivities(){ const area=$('#areaFilter').value,status=$('#statusFilter').value,q=$('#searchFilter').value.trim().toLowerCase(); return state.activities.filter(a=>(area==='all'||a.area_id===area)&&(status==='all'||a.status===status)&&(!q||`${a.activity} ${a.remarks||''} ${a.pending_details||''}`.toLowerCase().includes(q))) }
function renderActivities(){ $('#activitiesTable').innerHTML=tableMarkup(filteredActivities(),true) }
function tableMarkup(rows,showPending=true){
  if(!rows.length) return '<div class="empty-mini">No activities found. Add your first activity to start tracking.</div>'
  return `<table class="data-table"><thead><tr><th>Area</th><th>Activity</th><th>Status</th><th>Expected</th>${showPending?'<th>Pending with me</th>':''}<th>Updated</th></tr></thead><tbody>${rows.map(a=>`<tr data-edit="${a.id}"><td>${esc(areaName(a.area_id))}</td><td><div class="activity-title">${esc(a.activity)}</div><div class="subtle">${esc(a.remarks||'')}</div></td><td><span class="status ${statusClass(a.status)}">${esc(a.status)}</span></td><td class="${isOverdue(a)?'overdue':''}">${fmtDate(a.expected_completion)}</td>${showPending?`<td>${a.pending_with_me?`Yes${a.pending_details?` · ${esc(a.pending_details)}`:''}`:'—'}</td>`:''}<td>${new Intl.DateTimeFormat('en-IN',{day:'2-digit',month:'short'}).format(new Date(a.updated_at))}</td></tr>`).join('')}</tbody></table>`
}
function renderPending(){ const rows=state.activities.filter(a=>a.pending_with_me&&a.status!=='Completed'); $('#pendingCards').innerHTML=rows.length?rows.map(a=>`<article class="pending-card" data-edit="${a.id}"><span class="area-tag">${esc(areaName(a.area_id))}</span><h3>${esc(a.activity)}</h3><p>${esc(a.pending_details||'No pending details entered.')}</p><div class="subtle">Expected: <strong class="${isOverdue(a)?'overdue':''}">${fmtDate(a.expected_completion)}</strong></div></article>`).join(''):'<section class="panel empty-state"><div class="empty-icon">✓</div><h2>Nothing waiting on you</h2><p class="muted">Any activity marked “Pending with me” will appear here.</p></section>' }

async function loadTeam(){
  const {data:members}=await supabase.from('project_members').select('*').eq('project_id',state.project.id).order('created_at',{ascending:false}); state.team=members||[]
  const ids=state.team.map(m=>m.user_id); let profiles=[]; if(ids.length){ const {data}=await supabase.from('profiles').select('id,email,display_name').in('id',ids); profiles=data||[] }
  state.team=state.team.map(m=>({...m,profile:profiles.find(p=>p.id===m.user_id)})); renderTeam()
}
function renderTeam(){
  if(!isOwner()){ $('#teamList').innerHTML='<div class="empty-mini">Only the project owner can manage access.</div>'; return }
  const people=state.team; $('#teamList').innerHTML=people.length?people.map(m=>`<div class="list-item"><div class="list-main"><strong>${esc(m.profile?.display_name||m.profile?.email||'User')}</strong><small>${esc(m.profile?.email||'')} · ${esc(m.role)} · ${esc(m.status)}</small></div><div>${m.status==='pending'?`<button class="btn btn-primary" data-approve="${m.user_id}">Approve</button> <button class="btn btn-ghost" data-reject="${m.user_id}">Reject</button>`:m.status==='approved'?`<select class="member-role" data-role-user="${m.user_id}"><option value="editor" ${m.role==='editor'?'selected':''}>Editor</option><option value="viewer" ${m.role==='viewer'?'selected':''}>Viewer</option></select>`:''}</div></div>`).join(''):'<div class="empty-mini">No collaborators yet. Share the invite code to get started.</div>'
}
async function updateMember(userId,patch){ const {error}=await supabase.from('project_members').update(patch).eq('project_id',state.project.id).eq('user_id',userId); if(error) return toast(error.message); toast('Access updated'); await loadTeam() }

function openActivity(id){
  const a=state.activities.find(x=>x.id===id); $('#activityForm').reset(); $('#activityId').value=a?.id||''; $('#modalTitle').textContent=a?'Edit activity':'Add activity'; show($('#deleteActivityBtn'),!!a)
  if(a){ $('#activityArea').value=a.area_id; $('#activityName').value=a.activity; $('#activityStatus').value=a.status; $('#expectedDate').value=a.expected_completion||''; $('#actualDate').value=a.actual_completion||''; $('#remarks').value=a.remarks||''; $('#pendingWithMe').checked=a.pending_with_me; $('#pendingDetails').value=a.pending_details||'' }
  $('#activityModal').classList.remove('hidden'); $('#activityModal').setAttribute('aria-hidden','false')
}
function closeActivity(){ $('#activityModal').classList.add('hidden'); $('#activityModal').setAttribute('aria-hidden','true') }
async function saveActivity(e){
  e.preventDefault(); const id=$('#activityId').value, status=$('#activityStatus').value; let actual=$('#actualDate').value||null; if(status==='Completed'&&!actual) actual=new Date().toISOString().slice(0,10)
  const payload={project_id:state.project.id,area_id:$('#activityArea').value,activity:$('#activityName').value.trim(),status,expected_completion:$('#expectedDate').value||null,actual_completion:actual,remarks:$('#remarks').value.trim()||null,pending_with_me:$('#pendingWithMe').checked,pending_details:$('#pendingDetails').value.trim()||null,updated_by:state.user.id}
  let res; if(id) res=await supabase.from('activities').update(payload).eq('id',id); else res=await supabase.from('activities').insert({...payload,created_by:state.user.id})
  if(res.error) return toast(res.error.message); closeActivity(); toast(id?'Activity updated':'Activity added'); await loadProjectData()
}
async function deleteActivity(){ const id=$('#activityId').value; if(!id||!confirm('Delete this activity?')) return; const {error}=await supabase.from('activities').delete().eq('id',id); if(error) return toast(error.message); closeActivity(); toast('Activity deleted'); await loadProjectData() }
function navigate(page){ state.page=page; $$('.page').forEach(x=>x.classList.remove('active')); $(`#${page}Page`)?.classList.add('active'); $$('.nav-item').forEach(x=>x.classList.toggle('active',x.dataset.page===page)); $('.sidebar')?.classList.remove('open'); if(page==='team'&&isOwner()) loadTeam() }

$$('[data-auth-tab]').forEach(b=>b.addEventListener('click',()=>{ state.authMode=b.dataset.authTab; $$('[data-auth-tab]').forEach(x=>x.classList.toggle('active',x===b)); show($('#nameField'),state.authMode==='signup'); $('#authSubmit').textContent=state.authMode==='signup'?'Create account':'Sign in'; $('#password').autocomplete=state.authMode==='signup'?'new-password':'current-password' }))
$('#authForm').addEventListener('submit',async e=>{ e.preventDefault(); const email=$('#email').value.trim(),password=$('#password').value; if(state.authMode==='signup'){ const {data,error}=await supabase.auth.signUp({email,password,options:{data:{display_name:$('#displayName').value.trim()||email.split('@')[0]}}}); if(error)return toast(error.message); if(!data.session){toast('Account created. Check your email to confirm, then sign in.')} else await enterApp(data.user) } else { const {data,error}=await supabase.auth.signInWithPassword({email,password}); if(error)return toast(error.message); await enterApp(data.user) } })
$('#logoutBtn').addEventListener('click',()=>supabase.auth.signOut()); $('#createProjectBtn').addEventListener('click',createProject); $('#joinProjectBtn').addEventListener('click',joinProject); $('#refreshAccessBtn').addEventListener('click',loadProjectContext)
$$('.nav-item').forEach(b=>b.addEventListener('click',()=>navigate(b.dataset.page))); $$('[data-page-link]').forEach(b=>b.addEventListener('click',()=>navigate(b.dataset.pageLink))); $$('[data-action="add-activity"]').forEach(b=>b.addEventListener('click',()=>openActivity())); $$('[data-close-modal]').forEach(b=>b.addEventListener('click',closeActivity))
$('#activityForm').addEventListener('submit',saveActivity); $('#deleteActivityBtn').addEventListener('click',deleteActivity); ['areaFilter','statusFilter','searchFilter'].forEach(id=>$('#'+id).addEventListener(id==='searchFilter'?'input':'change',renderActivities)); $('#mobileMenuBtn').addEventListener('click',()=>$('.sidebar').classList.toggle('open'))
$('#copyInviteBtn').addEventListener('click',async()=>{ await navigator.clipboard.writeText(state.project?.invite_code||''); toast('Invite code copied') })
document.addEventListener('click',e=>{ const row=e.target.closest('[data-edit]'); if(row) openActivity(row.dataset.edit); const a=e.target.closest('[data-approve]'); if(a) updateMember(a.dataset.approve,{status:'approved',role:'editor'}); const r=e.target.closest('[data-reject]'); if(r) updateMember(r.dataset.reject,{status:'rejected'}) })
document.addEventListener('change',e=>{ if(e.target.matches('[data-role-user]')) updateMember(e.target.dataset.roleUser,{role:e.target.value}) })

init()
