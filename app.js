import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.4'

const SUPABASE_URL = 'https://crafvogyagobfmpxzmvr.supabase.co'
const SUPABASE_KEY = 'sb_publishable_8-5DgZQrgJrgm2AgvUyKug_dHs4Hyh3'
const SITE_URL = 'https://harikrish-1729.github.io/home-interior-tracker/'
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

const DEFAULT_AREAS = ['Kitchen','Bedroom 1','Bedroom 2','Bathroom 1','Bathroom 2','Hall','Balcony']
const $ = s => document.querySelector(s)
const $$ = s => [...document.querySelectorAll(s)]
const state = { user:null, project:null, membership:null, areas:[], activities:[], team:[], teamOwner:null, page:'dashboard', authMode:'signin', passwordRecovery:false }

function toast(message){ const el=$('#toast'); el.textContent=message; el.classList.remove('hidden'); clearTimeout(window.__toast); window.__toast=setTimeout(()=>el.classList.add('hidden'),2800) }
function esc(s=''){ return String(s).replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c])) }
function fmtDate(v){ if(!v) return '—'; return new Intl.DateTimeFormat('en-IN',{day:'2-digit',month:'short',year:'numeric'}).format(new Date(v+'T00:00:00')) }
function statusClass(s){ return {'Completed':'s-completed','In Progress':'s-progress','Waiting':'s-waiting','On Hold':'s-hold','Not Started':'s-not'}[s]||'s-not' }
function isOverdue(a){ return a.expected_completion && a.status!=='Completed' && new Date(a.expected_completion+'T23:59:59') < new Date() }
function areaName(id){ return state.areas.find(a=>a.id===id)?.name || 'Unknown' }
function show(el,yes=true){ el?.classList.toggle('hidden',!yes) }
function isOwner(){ return state.membership?.role==='owner' || state.project?.owner_id===state.user?.id }
function isAdmin(){ return isOwner() || !!state.membership?.is_admin }

async function init(){
  const {data:{session}}=await supabase.auth.getSession()
  if(session?.user) await enterApp(session.user); else showAuth()
  supabase.auth.onAuthStateChange(async(event,session)=>{
    if(event==='PASSWORD_RECOVERY' && session?.user){ state.passwordRecovery=true; await enterApp(session.user); openPasswordChange(true); return }
    if(session?.user&&!state.user) await enterApp(session.user); if(!session) showAuth()
  })
}
function showAuth(){ state.user=null; show($('#authView'),true); show($('#appView'),false) }
async function enterApp(user){ state.user=user; show($('#authView'),false); show($('#appView'),true); $('#userLabel').textContent=user.email||'Signed in'; await loadProjectContext(); if(user.app_metadata?.must_change_password) openPasswordChange(true) }

async function loadProjectContext(){
  const {data:owned}=await supabase.from('projects').select('*').eq('owner_id',state.user.id).limit(1)
  if(owned?.length){ state.project=owned[0]; state.membership={role:'owner',status:'approved'}; await loadProjectData(); return }
  const {data:members}=await supabase.from('project_members').select('project_id,role,status,is_admin,must_change_password').eq('user_id',state.user.id).order('created_at',{ascending:false}).limit(1)
  if(members?.length){ state.membership=members[0]; if(members[0].status==='approved'){ const {data:p}=await supabase.from('projects').select('*').eq('id',members[0].project_id).single(); state.project=p; await loadProjectData() } else showSetup('waiting'); return }
  state.project=null; state.membership=null; showSetup('new')
}
function showSetup(kind){
  show($('#mainPages'),false)
  const setup=$('#setupView'),waiting=$('#waitingView')
  setup?.classList.toggle('active',kind==='new'); waiting?.classList.toggle('active',kind==='waiting')
  show(setup,kind==='new'); show(waiting,kind==='waiting')
}
async function createProject(){
  const name=$('#newProjectName').value.trim()||'My Home Interior'
  const {data:p,error}=await supabase.from('projects').insert({name,owner_id:state.user.id}).select().single(); if(error)return toast(error.message)
  const {error:aerr}=await supabase.from('areas').insert(DEFAULT_AREAS.map((name,i)=>({project_id:p.id,name,sort_order:i+1}))); if(aerr)return toast(aerr.message)
  state.project=p; state.membership={role:'owner',status:'approved'}; toast('Project created'); await loadProjectData()
}
async function joinProject(){ const code=$('#joinCode').value.trim().toUpperCase(); if(!code)return toast('Enter an invite code'); const {error}=await supabase.rpc('request_project_access',{p_invite_code:code}); if(error)return toast(error.message); $('#joinStatus').textContent='Request sent. The owner needs to approve you.'; toast('Access requested'); await loadProjectContext() }

async function loadProjectData(){
  showSetup('none'); show($('#mainPages'),true); show($('#setupView'),false); show($('#waitingView'),false)
  $('#projectNameSide').textContent=state.project.name; $('#dashboardTitle').textContent=state.project.name; $('#inviteCode').textContent=state.project.invite_code||'--------'; show($('#settingsNav'),isOwner()); show($('#teamAdminPanel'),isAdmin())
  const [{data:areas},{data:activities}]=await Promise.all([
    supabase.from('areas').select('*').eq('project_id',state.project.id).order('sort_order'),
    supabase.from('activities').select('*').eq('project_id',state.project.id).order('updated_at',{ascending:false})
  ])
  state.areas=areas||[]; state.activities=activities||[]; populateAreaSelects(); renderAll(); renderSettings(); if(isAdmin()) await loadTeam()
}
function populateAreaSelects(){ const opts=state.areas.map(a=>`<option value="${a.id}">${esc(a.name)}</option>`).join(''); $('#activityArea').innerHTML=opts; $('#areaFilter').innerHTML='<option value="all">All areas</option>'+opts }
function renderAll(){ renderDashboard(); renderActivities(); renderPending(); renderTeam(); $('#pendingBadge').textContent=state.activities.filter(a=>a.pending_with_me&&a.status!=='Completed').length }

function renderDashboard(){
  const total=state.activities.length,completed=state.activities.filter(a=>a.status==='Completed').length,pct=total?Math.round(completed/total*100):0
  const overdue=state.activities.filter(isOverdue).length,pending=state.activities.filter(a=>a.pending_with_me&&a.status!=='Completed').length
  $('#overallProgress').textContent=pct+'%'; $('#overallBar').style.width=pct+'%'; $('#totalActivities').textContent=total; $('#completedSummary').textContent=`${completed} completed`; $('#overdueCount').textContent=overdue; $('#pendingCount').textContent=pending
  $('#todayText').textContent=new Intl.DateTimeFormat('en-IN',{weekday:'long',day:'numeric',month:'long',year:'numeric'}).format(new Date())
  $('#areaProgress').innerHTML=state.areas.map(ar=>{ const aa=state.activities.filter(x=>x.area_id===ar.id),c=aa.filter(x=>x.status==='Completed').length,p=aa.length?Math.round(c/aa.length*100):0; return `<button class="area-row area-link" data-area-filter="${ar.id}"><span>${esc(ar.name)}</span><div class="progress"><i style="width:${p}%"></i></div><strong>${p}%</strong></button>` }).join('')||'<div class="empty-mini">No areas yet.</div>'
  const upcoming=[...state.activities].filter(a=>a.expected_completion&&a.status!=='Completed').sort((a,b)=>a.expected_completion.localeCompare(b.expected_completion)).slice(0,6)
  $('#upcomingList').innerHTML=upcoming.length?upcoming.map(a=>`<div class="list-item" data-edit="${a.id}"><div class="list-main"><strong>${esc(a.activity)}</strong><small>${esc(areaName(a.area_id))} · <span class="status ${statusClass(a.status)}">${esc(a.status)}</span></small></div><span class="date-chip ${isOverdue(a)?'overdue':''}">${fmtDate(a.expected_completion)}</span></div>`).join(''):'<div class="empty-mini">No upcoming deadlines.</div>'
  $('#recentTable').innerHTML=tableMarkup(state.activities.slice(0,6),false)
}
function filteredActivities(){
  const area=$('#areaFilter').value,status=$('#statusFilter').value,quick=$('#quickFilter').value,q=$('#searchFilter').value.trim().toLowerCase()
  return state.activities.filter(a=>{
    const quickOk=quick==='all'||(quick==='pending'&&a.pending_with_me&&a.status!=='Completed')||(quick==='overdue'&&isOverdue(a))||(quick==='upcoming'&&a.expected_completion&&a.status!=='Completed'&&!isOverdue(a))||(quick==='completed'&&a.status==='Completed')
    return (area==='all'||a.area_id===area)&&(status==='all'||a.status===status)&&quickOk&&(!q||`${a.activity} ${a.remarks||''} ${a.pending_details||''}`.toLowerCase().includes(q))
  })
}
function renderActivities(){
  const rows=filteredActivities(); $('#activitiesTable').innerHTML=tableMarkup(rows,true)
  const filters=[]; if($('#areaFilter').value!=='all')filters.push(areaName($('#areaFilter').value)); if($('#statusFilter').value!=='all')filters.push($('#statusFilter').value); if($('#quickFilter').value!=='all')filters.push($('#quickFilter option:checked').textContent); if($('#searchFilter').value.trim())filters.push(`Search: ${$('#searchFilter').value.trim()}`)
  $('#activeFilterNote').textContent=filters.length?`Showing ${rows.length} item(s): ${filters.join(' · ')}`:''; show($('#activeFilterNote'),filters.length>0)
}
function tableMarkup(rows,showPending=true){
  if(!rows.length)return '<div class="empty-mini">No activities found. Add your first activity to start tracking.</div>'
  return `<table class="data-table"><thead><tr><th>Area</th><th>Activity</th><th>Status</th><th>Expected</th>${showPending?'<th>Pending with me</th>':''}<th>Updated</th></tr></thead><tbody>${rows.map(a=>`<tr data-edit="${a.id}"><td>${esc(areaName(a.area_id))}</td><td><div class="activity-title">${esc(a.activity)}</div><div class="subtle">${esc(a.remarks||'')}</div></td><td><span class="status ${statusClass(a.status)}">${esc(a.status)}</span></td><td class="${isOverdue(a)?'overdue':''}">${fmtDate(a.expected_completion)}</td>${showPending?`<td>${a.pending_with_me?`Yes${a.pending_details?` · ${esc(a.pending_details)}`:''}`:'—'}</td>`:''}<td>${new Intl.DateTimeFormat('en-IN',{day:'2-digit',month:'short'}).format(new Date(a.updated_at))}</td></tr>`).join('')}</tbody></table>`
}
function renderPending(){ const rows=state.activities.filter(a=>a.pending_with_me&&a.status!=='Completed'); $('#pendingCards').innerHTML=rows.length?rows.map(a=>`<article class="pending-card" data-edit="${a.id}"><span class="area-tag">${esc(areaName(a.area_id))}</span><h3>${esc(a.activity)}</h3><p>${esc(a.pending_details||'No pending details entered.')}</p><div class="subtle">Expected: <strong class="${isOverdue(a)?'overdue':''}">${fmtDate(a.expected_completion)}</strong></div></article>`).join(''):'<section class="panel empty-state"><div class="empty-icon">✓</div><h2>Nothing waiting on you</h2><p class="muted">Any activity marked “Pending with me” will appear here.</p></section>' }

async function adminInvoke(action, payload={}){
  const {data,error}=await supabase.functions.invoke('admin-user-management',{body:{action,project_id:state.project?.id,...payload}})
  if(error) throw error
  if(data?.error) throw new Error(data.error)
  return data
}
async function loadTeam(){
  if(!isAdmin()) return renderTeam()
  try{ const data=await adminInvoke('list_team'); state.team=data.team||[]; state.teamOwner=data.owner||null; renderTeam() }catch(e){ $('#teamList').innerHTML=`<div class="empty-mini">${esc(e.message||'Could not load team')}</div>` }
}
function renderTeam(){
  if(!isAdmin()){ $('#teamList').innerHTML='<div class="empty-mini">Only project admins can manage access.</div>'; return }
  const o=state.teamOwner||{id:state.project?.owner_id,email:isOwner()?state.user?.email:'',display_name:isOwner()?state.user?.user_metadata?.display_name:''}
  const owner=`<div class="list-item owner-row"><div class="list-main"><strong>${esc(o.display_name||o.email||'Project Owner')}</strong><small>${esc(o.email||'')} · Owner / Admin · Approved</small></div><div class="team-actions"><span class="status s-completed">Owner</span>${o.id!==state.user?.id?`<button class="btn btn-secondary" data-reset-admin="${o.id}">Reset password</button>`:''}</div></div>`
  const people=state.team.map(m=>{ const label=m.is_admin?'Admin':(m.role==='viewer'?'Viewer':'Editor'); return `<div class="list-item"><div class="list-main"><strong>${esc(m.profile?.display_name||m.profile?.email||'User')}</strong><small>${esc(m.profile?.email||'')} · ${label} · ${esc(m.status)}</small></div><div class="team-actions">${m.status==='pending'?`<button class="btn btn-primary" data-approve="${m.user_id}">Approve</button><button class="btn btn-ghost" data-reject="${m.user_id}">Reject</button>`:m.status==='approved'?`<select class="member-role" data-role-user="${m.user_id}"><option value="admin" ${m.is_admin?'selected':''}>Admin</option><option value="editor" ${!m.is_admin&&m.role==='editor'?'selected':''}>Editor</option><option value="viewer" ${!m.is_admin&&m.role==='viewer'?'selected':''}>Viewer</option></select>${m.is_admin?`<button class="btn btn-secondary" data-reset-admin="${m.user_id}">Reset password</button>`:''}`:''}</div></div>` }).join('')
  $('#teamList').innerHTML=owner+(people||'<div class="empty-mini">No collaborators yet.</div>')
}
async function updateMember(userId,patch){ try{ await adminInvoke('set_member',{user_id:userId,...patch}); toast('Access updated'); await loadTeam() }catch(e){ toast(e.message||'Could not update access') } }
async function createAdmin(e){
  e.preventDefault(); if(!isAdmin())return
  const email=$('#adminEmail').value.trim(),temp=$('#adminTempPassword').value,display=$('#adminDisplayName').value.trim();
  try{ await adminInvoke('create_admin',{email,temp_password:temp,display_name:display}); $('#createAdminForm').reset(); toast('Admin created. Share the temporary password securely.'); await loadTeam() }catch(err){ toast(err.message||'Could not create admin') }
}
async function resetAdminPassword(userId){
  const temp=prompt('Enter a new temporary password (minimum 10 characters). The admin will be forced to change it after login.'); if(!temp)return;
  try{ await adminInvoke('reset_admin_password',{user_id:userId,temp_password:temp}); toast('Temporary password set. Share it securely with the admin.') }catch(e){ toast(e.message||'Could not reset password') }
}

function renderSettings(){
  if(!isOwner()) return
  $('#settingsProjectName').value=state.project.name||''; $('#settingsLocation').value=state.project.project_location||''; $('#settingsStartDate').value=state.project.start_date||''; $('#settingsTargetDate').value=state.project.target_completion||''; $('#settingsDescription').value=state.project.description||''
  $('#areaManager').innerHTML=state.areas.map(a=>`<div class="area-manage-row"><input value="${esc(a.name)}" data-area-name="${a.id}" /><button class="btn btn-secondary" data-save-area="${a.id}">Save</button><button class="btn btn-ghost danger-text" data-delete-area="${a.id}">Delete</button></div>`).join('')
}
async function saveProjectSettings(e){ e.preventDefault(); if(!isOwner())return; const patch={name:$('#settingsProjectName').value.trim(),project_location:$('#settingsLocation').value.trim()||null,start_date:$('#settingsStartDate').value||null,target_completion:$('#settingsTargetDate').value||null,description:$('#settingsDescription').value.trim()||null}; const {data,error}=await supabase.from('projects').update(patch).eq('id',state.project.id).select().single(); if(error)return toast(error.message); state.project=data; $('#projectNameSide').textContent=data.name; $('#dashboardTitle').textContent=data.name; toast('Project details updated') }
async function saveArea(id){ const input=document.querySelector(`[data-area-name="${id}"]`),name=input?.value.trim(); if(!name)return toast('Area name cannot be empty'); const {error}=await supabase.from('areas').update({name}).eq('id',id).eq('project_id',state.project.id); if(error)return toast(error.message); toast('Area renamed'); await loadProjectData() }
async function addArea(e){ e.preventDefault(); const name=$('#newAreaName').value.trim(); if(!name)return; const max=Math.max(0,...state.areas.map(a=>a.sort_order||0)); const {error}=await supabase.from('areas').insert({project_id:state.project.id,name,sort_order:max+1}); if(error)return toast(error.message); $('#newAreaName').value=''; toast('Area added'); await loadProjectData() }
async function deleteArea(id){ const used=state.activities.some(a=>a.area_id===id); if(used)return toast('Move or delete activities in this area first'); if(!confirm('Delete this area?'))return; const {error}=await supabase.from('areas').delete().eq('id',id).eq('project_id',state.project.id); if(error)return toast(error.message); toast('Area deleted'); await loadProjectData() }

function openActivity(id){ const a=state.activities.find(x=>x.id===id); $('#activityForm').reset(); $('#activityId').value=a?.id||''; $('#modalTitle').textContent=a?'Edit activity':'Add activity'; show($('#deleteActivityBtn'),!!a); if(a){ $('#activityArea').value=a.area_id; $('#activityName').value=a.activity; $('#activityStatus').value=a.status; $('#expectedDate').value=a.expected_completion||''; $('#actualDate').value=a.actual_completion||''; $('#remarks').value=a.remarks||''; $('#pendingWithMe').checked=a.pending_with_me; $('#pendingDetails').value=a.pending_details||'' } $('#activityModal').classList.remove('hidden'); $('#activityModal').setAttribute('aria-hidden','false') }
function closeActivity(){ $('#activityModal').classList.add('hidden'); $('#activityModal').setAttribute('aria-hidden','true') }
async function saveActivity(e){ e.preventDefault(); const id=$('#activityId').value,status=$('#activityStatus').value; let actual=$('#actualDate').value||null; if(status==='Completed'&&!actual)actual=new Date().toISOString().slice(0,10); const payload={project_id:state.project.id,area_id:$('#activityArea').value,activity:$('#activityName').value.trim(),status,expected_completion:$('#expectedDate').value||null,actual_completion:actual,remarks:$('#remarks').value.trim()||null,pending_with_me:$('#pendingWithMe').checked,pending_details:$('#pendingDetails').value.trim()||null,updated_by:state.user.id}; const res=id?await supabase.from('activities').update(payload).eq('id',id):await supabase.from('activities').insert({...payload,created_by:state.user.id}); if(res.error)return toast(res.error.message); closeActivity(); toast(id?'Activity updated':'Activity added'); await loadProjectData() }
async function deleteActivity(){ const id=$('#activityId').value; if(!id||!confirm('Delete this activity?'))return; const {error}=await supabase.from('activities').delete().eq('id',id); if(error)return toast(error.message); closeActivity(); toast('Activity deleted'); await loadProjectData() }

function navigate(page){ state.page=page; $$('.page').forEach(x=>x.classList.remove('active')); $(`#${page}Page`)?.classList.add('active'); $$('.nav-item').forEach(x=>x.classList.toggle('active',x.dataset.page===page)); $('.sidebar')?.classList.remove('open'); if(page==='team'&&isAdmin())loadTeam(); if(page==='settings')renderSettings() }
function openActivitiesFilter({area='all',quick='all',status='all'}={}){ $('#areaFilter').value=area; $('#quickFilter').value=quick; $('#statusFilter').value=status; $('#searchFilter').value=''; renderActivities(); navigate('activities') }
function excelRows(rows){ return rows.map(a=>({'Area':areaName(a.area_id),'Activity':a.activity,'Status':a.status,'Expected Completion':a.expected_completion||'','Actual Completion':a.actual_completion||'','Remarks':a.remarks||'','Pending With Me':a.pending_with_me?'Yes':'No','What Is Pending':a.pending_details||'','Last Updated':a.updated_at?new Date(a.updated_at).toLocaleString('en-IN'):''})) }
function exportExcel(rows,label='Activities'){ if(!window.XLSX)return toast('Excel library is still loading. Try again.'); const wb=XLSX.utils.book_new(),ws=XLSX.utils.json_to_sheet(excelRows(rows)); XLSX.utils.book_append_sheet(wb,ws,'Activities'); const safe=(state.project?.name||'Interior-Tracker').replace(/[^a-z0-9]+/gi,'-'); XLSX.writeFile(wb,`${safe}-${label}-${new Date().toISOString().slice(0,10)}.xlsx`) }
function printPage(page){ navigate(page); setTimeout(()=>window.print(),80) }

function openPasswordChange(force=false){
  $('#passwordChangeTitle').textContent=force?'Change your temporary password':'Choose a new password';
  $('#passwordChangeText').textContent=force?'For security, you must change the temporary/admin-reset password before continuing.':'Enter and confirm your new password.';
  show($('#passwordChangeModal'),true); $('#passwordChangeModal').classList.remove('hidden');
}
async function submitPasswordChange(e){
  e.preventDefault(); const p=$('#newPassword').value,c=$('#confirmNewPassword').value;
  if(p.length<10)return toast('Use at least 10 characters'); if(p!==c)return toast('Passwords do not match');
  const {error}=await supabase.auth.updateUser({password:p}); if(error)return toast(error.message);
  try{ if(state.project && isAdmin()) await adminInvoke('complete_password_change') }catch(_){}
  const {data:{user}}=await supabase.auth.getUser(); if(user)state.user=user; $('#passwordChangeForm').reset(); show($('#passwordChangeModal'),false); $('#passwordChangeModal').classList.add('hidden'); state.passwordRecovery=false; toast('Password changed successfully')
}
async function forgotPassword(){
  const email=$('#email').value.trim(); if(!email)return toast('Enter your email address first');
  const {error}=await supabase.auth.resetPasswordForEmail(email,{redirectTo:SITE_URL}); if(error)return toast(error.message); toast('Password reset email sent. Check your inbox.')
}
$$('[data-auth-tab]').forEach(b=>b.addEventListener('click',()=>{ state.authMode=b.dataset.authTab; function openPasswordChange(force=false){
  $('#passwordChangeTitle').textContent=force?'Change your temporary password':'Choose a new password';
  $('#passwordChangeText').textContent=force?'For security, you must change the temporary/admin-reset password before continuing.':'Enter and confirm your new password.';
  show($('#passwordChangeModal'),true); $('#passwordChangeModal').classList.remove('hidden');
}
async function submitPasswordChange(e){
  e.preventDefault(); const p=$('#newPassword').value,c=$('#confirmNewPassword').value;
  if(p.length<10)return toast('Use at least 10 characters'); if(p!==c)return toast('Passwords do not match');
  const {error}=await supabase.auth.updateUser({password:p}); if(error)return toast(error.message);
  try{ if(state.project && isAdmin()) await adminInvoke('complete_password_change') }catch(_){}
  const {data:{user}}=await supabase.auth.getUser(); if(user)state.user=user; $('#passwordChangeForm').reset(); show($('#passwordChangeModal'),false); $('#passwordChangeModal').classList.add('hidden'); state.passwordRecovery=false; toast('Password changed successfully')
}
async function forgotPassword(){
  const email=$('#email').value.trim(); if(!email)return toast('Enter your email address first');
  const {error}=await supabase.auth.resetPasswordForEmail(email,{redirectTo:SITE_URL}); if(error)return toast(error.message); toast('Password reset email sent. Check your inbox.')
}
$$('[data-auth-tab]').forEach(x=>x.classList.toggle('active',x===b)); show($('#nameField'),state.authMode==='signup'); $('#authSubmit').textContent=state.authMode==='signup'?'Create account':'Sign in'; $('#password').autocomplete=state.authMode==='signup'?'new-password':'current-password' }))
$('#authForm').addEventListener('submit',async e=>{ e.preventDefault(); const email=$('#email').value.trim(),password=$('#password').value; if(state.authMode==='signup'){ const {data,error}=await supabase.auth.signUp({email,password,options:{emailRedirectTo:SITE_URL,data:{display_name:$('#displayName').value.trim()||email.split('@')[0]}}}); if(error)return toast(error.message); if(!data.session)toast('Account created. Check your email to confirm, then sign in.'); else await enterApp(data.user) } else { const {data,error}=await supabase.auth.signInWithPassword({email,password}); if(error)return toast(error.message); await enterApp(data.user) } })
$('#logoutBtn').addEventListener('click',()=>supabase.auth.signOut()); $('#forgotPasswordBtn').addEventListener('click',forgotPassword); $('#passwordChangeForm').addEventListener('submit',submitPasswordChange); $('#createAdminForm').addEventListener('submit',createAdmin); $('#createProjectBtn').addEventListener('click',createProject); $('#joinProjectBtn').addEventListener('click',joinProject); $('#refreshAccessBtn').addEventListener('click',loadProjectContext)
$$('.nav-item').forEach(b=>b.addEventListener('click',()=>navigate(b.dataset.page))); $$('[data-page-link]').forEach(b=>b.addEventListener('click',()=>navigate(b.dataset.pageLink))); $$('[data-action="add-activity"]').forEach(b=>b.addEventListener('click',()=>openActivity())); $$('[data-close-modal]').forEach(b=>b.addEventListener('click',closeActivity))
$('#activityForm').addEventListener('submit',saveActivity); $('#deleteActivityBtn').addEventListener('click',deleteActivity); ['areaFilter','statusFilter','quickFilter','searchFilter'].forEach(id=>$('#'+id).addEventListener(id==='searchFilter'?'input':'change',renderActivities)); $('#mobileMenuBtn').addEventListener('click',()=>$('.sidebar').classList.toggle('open'))
$('#copyInviteBtn').addEventListener('click',async()=>{ await navigator.clipboard.writeText(state.project?.invite_code||''); toast('Invite code copied') })
$('#projectSettingsForm').addEventListener('submit',saveProjectSettings); $('#addAreaForm').addEventListener('submit',addArea)
$('#exportExcelBtn').addEventListener('click',()=>exportExcel(filteredActivities(),'Activities')); $('#exportPendingBtn').addEventListener('click',()=>exportExcel(state.activities.filter(a=>a.pending_with_me&&a.status!=='Completed'),'Pending-With-Me'))
$('#printDashboardBtn').addEventListener('click',()=>printPage('dashboard')); $('#printActivitiesBtn').addEventListener('click',()=>printPage('activities')); $('#printPendingBtn').addEventListener('click',()=>printPage('pending'))

document.addEventListener('click',e=>{
  const row=e.target.closest('[data-edit]'); if(row)openActivity(row.dataset.edit)
  const a=e.target.closest('[data-approve]'); if(a)updateMember(a.dataset.approve,{status:'approved',role:'editor',is_admin:false})
  const r=e.target.closest('[data-reject]'); if(r)updateMember(r.dataset.reject,{status:'rejected'})
  const rp=e.target.closest('[data-reset-admin]'); if(rp)resetAdminPassword(rp.dataset.resetAdmin)
  const stat=e.target.closest('[data-dashboard-filter]'); if(stat){ const f=stat.dataset.dashboardFilter; if(f==='pending')navigate('pending'); else openActivitiesFilter({quick:f}) }
  const area=e.target.closest('[data-area-filter]'); if(area)openActivitiesFilter({area:area.dataset.areaFilter})
  const save=e.target.closest('[data-save-area]'); if(save)saveArea(save.dataset.saveArea)
  const del=e.target.closest('[data-delete-area]'); if(del)deleteArea(del.dataset.deleteArea)
})
document.addEventListener('change',e=>{ if(e.target.matches('[data-role-user]')){ const v=e.target.value; updateMember(e.target.dataset.roleUser,v==='admin'?{is_admin:true,role:'editor',status:'approved'}:{is_admin:false,role:v,status:'approved'}) } })

init()
