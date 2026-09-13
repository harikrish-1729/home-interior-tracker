import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.4'

const SUPABASE_URL = 'https://crafvogyagobfmpxzmvr.supabase.co'
const SUPABASE_KEY = 'sb_publishable_8-5DgZQrgJrgm2AgvUyKug_dHs4Hyh3'
const SITE_URL = 'https://harikrish-1729.github.io/home-interior-tracker/'
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

const DEFAULT_AREAS = ['Kitchen','Bedroom 1','Bedroom 2','Bathroom 1','Bathroom 2','Hall','Balcony']
const $ = s => document.querySelector(s)
const $$ = s => [...document.querySelectorAll(s)]
const state = { user:null, project:null, membership:null, areas:[], activities:[], purchases:[], purchaseOptions:[], notes:[], team:[], teamOwner:null, page:'dashboard', authMode:'signin', passwordRecovery:false }

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
  const [{data:areas},{data:activities},{data:purchases},{data:notes}]=await Promise.all([
    supabase.from('areas').select('*').eq('project_id',state.project.id).order('sort_order'),
    supabase.from('activities').select('*').eq('project_id',state.project.id).order('updated_at',{ascending:false}),
    supabase.from('purchase_items').select('*').eq('project_id',state.project.id).order('updated_at',{ascending:false}),
    supabase.from('project_notes').select('*').eq('project_id',state.project.id).order('updated_at',{ascending:false})
  ])
  state.areas=areas||[]; state.activities=activities||[]; state.purchases=purchases||[]; state.notes=notes||[]
  if(state.purchases.length){ const {data:opts}=await supabase.from('purchase_options').select('*').in('item_id',state.purchases.map(x=>x.id)).order('option_no'); state.purchaseOptions=opts||[] } else state.purchaseOptions=[]
  populateAreaSelects(); renderAll(); renderSettings(); if(isAdmin()) await loadTeam()
}
function populateAreaSelects(){ const opts=state.areas.map(a=>`<option value="${a.id}">${esc(a.name)}</option>`).join(''); $('#activityArea').innerHTML=opts; $('#areaFilter').innerHTML='<option value="all">All areas</option>'+opts }
function renderAll(){ renderDashboard(); renderActivities(); renderPending(); renderPurchaseCompare(); renderNotes(); renderTeam(); $('#pendingBadge').textContent=state.activities.filter(a=>a.pending_with_me&&a.status!=='Completed').length }

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


function purchaseOptionsFor(itemId){ return state.purchaseOptions.filter(o=>o.item_id===itemId).sort((a,b)=>a.option_no-b.option_no) }
function ratingAvg(o){ const vals=[o.service_rating,o.quality_rating,o.durability_rating,o.value_rating].filter(v=>Number(v)>0).map(Number); return vals.length?vals.reduce((a,b)=>a+b,0)/vals.length:0 }
function money(v){ if(v===null||v===undefined||v==='')return '—'; return new Intl.NumberFormat('en-IN',{style:'currency',currency:'INR',maximumFractionDigits:0}).format(Number(v)) }
function stars(v){ const n=Number(v)||0; return n?`${'★'.repeat(n)}${'☆'.repeat(5-n)}`:'—' }
function purchaseStatusClass(s){ return {'Researching':'s-not','Shortlisted':'s-waiting','Selected':'s-progress','Purchased':'s-completed'}[s]||'s-not' }
function filteredPurchases(){ const q=$('#purchaseSearch')?.value.trim().toLowerCase()||'', status=$('#purchaseStatusFilter')?.value||'all', timing=$('#purchaseTimingFilter')?.value||'all', today=new Date(); today.setHours(0,0,0,0); const in7=new Date(today); in7.setDate(in7.getDate()+7); return state.purchases.filter(i=>{ const due=i.due_date?new Date(i.due_date+'T00:00:00'):null, open=i.decision_status!=='Purchased'; const timeOk=timing==='all'||(timing==='overdue'&&open&&due&&due<today)||(timing==='next7'&&open&&due&&due>=today&&due<=in7)||(timing==='nodate'&&!due); const text=`${i.item_name} ${i.category||''} ${i.general_remarks||''} ${purchaseOptionsFor(i.id).map(o=>`${o.brand||''} ${o.model||''} ${o.source_name||''}`).join(' ')}`.toLowerCase(); return (status==='all'||i.decision_status===status)&&timeOk&&(!q||text.includes(q)) }) }
function renderPurchaseCompare(){
  const total=state.purchases.length, completed=state.purchases.filter(i=>i.decision_status==='Purchased').length, remaining=total-completed
  const today=new Date(); today.setHours(0,0,0,0)
  const overdue=state.purchases.filter(i=>i.decision_status!=='Purchased'&&i.due_date&&new Date(i.due_date+'T00:00:00')<today).length
  const upcoming=state.purchases.filter(i=>i.decision_status!=='Purchased'&&i.due_date&&new Date(i.due_date+'T00:00:00')>=today).sort((a,b)=>a.due_date.localeCompare(b.due_date))[0]
  const chosenSpend=state.purchases.reduce((sum,i)=>{ const o=purchaseOptionsFor(i.id).find(x=>x.is_selected); return sum+(o?.price?Number(o.price):0) },0)
  if($('#purchaseTotal')) $('#purchaseTotal').textContent=total; if($('#purchaseCompleted'))$('#purchaseCompleted').textContent=completed; if($('#purchaseRemaining'))$('#purchaseRemaining').textContent=remaining; if($('#purchaseOverdue'))$('#purchaseOverdue').textContent=overdue; if($('#purchaseNextDue'))$('#purchaseNextDue').textContent=upcoming?fmtDate(upcoming.due_date):'—'; if($('#purchaseNextDueItem'))$('#purchaseNextDueItem').textContent=upcoming?upcoming.item_name:'No due date yet'; if($('#purchaseSpend'))$('#purchaseSpend').textContent=money(chosenSpend)
  const items=filteredPurchases(),host=$('#purchaseCompareList'); if(!host)return
  if(!items.length){ host.innerHTML='<section class="panel empty-state purchase-empty"><div class="empty-icon">⌕</div><h2>No purchase comparisons yet</h2><p class="muted">Add something you are planning to buy, then compare brands or sellers side by side.</p><button class="btn btn-primary" data-action="add-purchase">+ Add Item to Compare</button></section>'; return }
  host.innerHTML=items.map(i=>{
    const opts=purchaseOptionsFor(i.id), priced=opts.filter(o=>o.price!==null), min=priced.length?Math.min(...priced.map(o=>Number(o.price))):null, rated=opts.filter(o=>ratingAvg(o)>0), best= rated.length?Math.max(...rated.map(ratingAvg)):0
    const displayCount=Math.max(3,...opts.map(o=>o.option_no||0)); const cards=Array.from({length:displayCount},(_,idx)=>idx+1).map(no=>{ const o=opts.find(x=>x.option_no===no); if(!o)return `<div class="compare-option empty-option"><span class="option-kicker">OPTION ${no}</span><strong>Not added</strong><small>Add another brand/shop if you want a wider comparison.</small></div>`
      const avg=ratingAvg(o), price=o.price!==null&&o.price!==''?Number(o.price):null, budget=i.target_budget?Number(i.target_budget):null
      const isLowest=min!==null&&price!==null&&price===min, isBest=!!best&&avg===best, overBudget=budget!==null&&price!==null&&price>budget, nearBudget=budget!==null&&price!==null&&!overBudget&&price>=budget*.9
      const tags=[
        o.is_selected?'<span class="compare-tag chosen">Your choice</span>':'',
        overBudget?`<span class="compare-tag over-budget">Over budget ${money(price-budget)}</span>`:'',
        isLowest?'<span class="compare-tag lowest">Lowest price</span>':'',
        isBest?'<span class="compare-tag best">Best rated</span>':'',
        nearBudget&&!isLowest?'<span class="compare-tag near-budget">Near budget</span>':''
      ].filter(Boolean).join('')
      const cardClass=o.is_selected?'selected-option':overBudget?'over-budget-option':isBest?'best-rated-option':isLowest?'lowest-price-option':nearBudget?'near-budget-option':''
      const priceClass=overBudget?'price-over':isLowest?'price-lowest':nearBudget?'price-near':''
      return `<div class="compare-option ${cardClass}"><div class="option-top"><span class="option-kicker">OPTION ${no}</span><div class="compare-tags">${tags}</div></div><h3>${esc(o.brand||'Unnamed option')}</h3><div class="model-line">${esc(o.model||'')}</div><div class="compare-price ${priceClass}">${money(o.price)}</div><div class="source-line">${esc(o.source_name||'Source not entered')}${o.source_type?` · ${esc(o.source_type)}`:''}</div><div class="rating-grid"><span>Service <b>${stars(o.service_rating)}</b></span><span>Quality <b>${stars(o.quality_rating)}</b></span><span>Durability <b>${stars(o.durability_rating)}</b></span><span>Value <b>${stars(o.value_rating)}</b></span></div><div class="compare-meta"><span><small>Warranty</small><strong>${esc(o.warranty||'—')}</strong></span><span><small>Overall</small><strong class="${isBest?'overall-best':''}">${avg?avg.toFixed(1)+'/5':'—'}</strong></span></div>${o.remarks?`<p class="option-remarks">${esc(o.remarks)}</p>`:''}</div>`
    }).join('')
    const due=i.due_date?new Date(i.due_date+'T00:00:00'):null, isOverdue=i.decision_status!=='Purchased'&&due&&due<today
    return `<article class="purchase-group panel"><div class="purchase-group-head"><div><div class="purchase-title-line"><h2>${esc(i.item_name)}</h2><span class="status ${purchaseStatusClass(i.decision_status)}">${esc(i.decision_status)}</span>${isOverdue?'<span class="status s-hold">Overdue</span>':''}</div><p class="muted tiny">${esc(i.category||'General')}${i.target_budget?` · Budget ${money(i.target_budget)}`:''}${i.due_date?` · Due ${fmtDate(i.due_date)}`:''}${i.completed_at?` · Purchased ${fmtDate(i.completed_at)}`:''}</p>${i.general_remarks?`<p class="purchase-note">${esc(i.general_remarks)}</p>`:''}</div><button class="btn btn-secondary" data-edit-purchase="${i.id}">Edit comparison</button></div><div class="compare-grid">${cards}</div></article>`
  }).join('')
}
function ratingSliderHtml(id,label,value=3){ return `<div class="field rating-field"><div class="rating-label"><label for="${id}">${label}</label><output data-rating-output="${id}">${value}</output></div><input id="${id}" class="rating-slider" type="range" min="1" max="5" step="1" value="${value}" aria-label="${label} rating from 1 to 5" /><div class="rating-scale"><span>1</span><span>5</span></div></div>` }
function optionFormHtml(no){ return `<section class="option-editor" data-option-no="${no}"><div class="option-editor-head"><h3>Option ${no}</h3><div class="option-head-actions"><label class="choice-radio"><input type="radio" name="selectedPurchaseOption" value="${no}"> Mark as my choice</label><button type="button" class="icon-btn remove-option-btn hidden" data-remove-purchase-option="${no}" title="Remove last option">×</button></div></div><div class="form-grid option-fields"><div class="field"><label>Brand</label><input id="pBrand${no}" placeholder="e.g. Faber" /></div><div class="field"><label>Model</label><input id="pModel${no}" placeholder="Model / variant" /></div><div class="field"><label>Price (₹)</label><input id="pPrice${no}" type="number" min="0" step="0.01" placeholder="0" /></div><div class="field"><label>Shop / website</label><input id="pSource${no}" placeholder="Store name or website" /></div><div class="field"><label>Source type</label><select id="pSourceType${no}"><option value="">—</option><option>Shop</option><option>Online</option><option>Other</option></select></div><div class="field"><label>Warranty / validity</label><input id="pWarranty${no}" placeholder="e.g. 5 years motor" /></div>${ratingSliderHtml('pService'+no,'Service')}${ratingSliderHtml('pQuality'+no,'Quality')}${ratingSliderHtml('pDurability'+no,'Durability')}${ratingSliderHtml('pValue'+no,'Value for money')}<div class="field full"><label>Remarks</label><textarea id="pRemarks${no}" rows="2" placeholder="Anything important about this option"></textarea></div></div></section>` }
function refreshOptionRemoveButton(){ const editors=$$('#purchaseOptionEditors .option-editor'); editors.forEach(e=>e.querySelector('.remove-option-btn')?.classList.add('hidden')); if(editors.length>3) editors.at(-1)?.querySelector('.remove-option-btn')?.classList.remove('hidden') }
function setRating(no,key,val){ const el=$(`#p${key}${no}`); if(!el)return; el.value=val||3; const out=document.querySelector(`[data-rating-output="p${key}${no}"]`); if(out)out.value=el.value }
function fillOptionEditor(no,o){ $('#pBrand'+no).value=o?.brand||''; $('#pModel'+no).value=o?.model||''; $('#pPrice'+no).value=o?.price??''; $('#pSource'+no).value=o?.source_name||''; $('#pSourceType'+no).value=o?.source_type||''; $('#pWarranty'+no).value=o?.warranty||''; setRating(no,'Service',o?.service_rating); setRating(no,'Quality',o?.quality_rating); setRating(no,'Durability',o?.durability_rating); setRating(no,'Value',o?.value_rating); $('#pRemarks'+no).value=o?.remarks||''; const r=document.querySelector(`input[name="selectedPurchaseOption"][value="${no}"]`); if(r)r.checked=!!o?.is_selected }
function buildOptionEditors(opts=[]){ const count=Math.max(3,...opts.map(o=>o.option_no||0)); $('#purchaseOptionEditors').innerHTML=Array.from({length:count},(_,i)=>optionFormHtml(i+1)).join(''); Array.from({length:count},(_,i)=>i+1).forEach(no=>fillOptionEditor(no,opts.find(x=>x.option_no===no))); refreshOptionRemoveButton() }
function addPurchaseOption(){ const editors=$$('#purchaseOptionEditors .option-editor'),no=(editors.length?Math.max(...editors.map(e=>Number(e.dataset.optionNo))):0)+1; $('#purchaseOptionEditors').insertAdjacentHTML('beforeend',optionFormHtml(no)); refreshOptionRemoveButton(); document.querySelector(`[data-option-no="${no}"]`)?.scrollIntoView({behavior:'smooth',block:'center'}) }
function removePurchaseOption(no){ const editors=$$('#purchaseOptionEditors .option-editor'),max=Math.max(...editors.map(e=>Number(e.dataset.optionNo))); if(Number(no)!==max)return toast('Remove the last option first'); if(editors.length<=3)return toast('Keep at least 3 option slots'); document.querySelector(`[data-option-no="${no}"]`)?.remove(); refreshOptionRemoveButton() }
function openPurchase(id){ const item=state.purchases.find(x=>x.id===id); $('#purchaseForm').reset(); $('#purchaseId').value=item?.id||''; $('#purchaseModalTitle').textContent=item?'Edit purchase comparison':'Add item to compare'; show($('#deletePurchaseBtn'),!!item); $('#purchaseItemName').value=item?.item_name||''; $('#purchaseCategory').value=item?.category||''; $('#purchaseBudget').value=item?.target_budget??''; $('#purchaseDecisionStatus').value=item?.decision_status||'Researching'; $('#purchaseDueDate').value=item?.due_date||''; $('#purchaseCompletedDate').value=item?.completed_at||''; $('#purchaseGeneralRemarks').value=item?.general_remarks||''; buildOptionEditors(item?purchaseOptionsFor(item.id):[]); $('#purchaseModal').classList.remove('hidden'); $('#purchaseModal').setAttribute('aria-hidden','false') }
function closePurchase(){ $('#purchaseModal').classList.add('hidden'); $('#purchaseModal').setAttribute('aria-hidden','true') }
function readOption(no,itemId){ const brand=$('#pBrand'+no).value.trim(),model=$('#pModel'+no).value.trim(),price=$('#pPrice'+no).value,source=$('#pSource'+no).value.trim(),remarks=$('#pRemarks'+no).value.trim(),warranty=$('#pWarranty'+no).value.trim(),sourceType=$('#pSourceType'+no).value; const has=brand||model||price||source||remarks||warranty||sourceType; if(!has)return null; const selected=document.querySelector('input[name="selectedPurchaseOption"]:checked')?.value==String(no); return {item_id:itemId,option_no:no,brand:brand||null,model:model||null,price:price?Number(price):null,source_name:source||null,source_type:sourceType||null,warranty:warranty||null,service_rating:Number($('#pService'+no).value),quality_rating:Number($('#pQuality'+no).value),durability_rating:Number($('#pDurability'+no).value),value_rating:Number($('#pValue'+no).value),remarks:remarks||null,is_selected:selected} }
async function savePurchase(e){ e.preventDefault(); const id=$('#purchaseId').value; const payload={project_id:state.project.id,item_name:$('#purchaseItemName').value.trim(),category:$('#purchaseCategory').value.trim()||null,target_budget:$('#purchaseBudget').value?Number($('#purchaseBudget').value):null,decision_status:$('#purchaseDecisionStatus').value,due_date:$('#purchaseDueDate').value||null,completed_at:$('#purchaseCompletedDate').value||($('#purchaseDecisionStatus').value==='Purchased'?new Date().toISOString().slice(0,10):null),general_remarks:$('#purchaseGeneralRemarks').value.trim()||null,updated_by:state.user.id}; let itemId=id; if(id){ const {error}=await supabase.from('purchase_items').update(payload).eq('id',id); if(error)return toast(error.message) } else { const {data,error}=await supabase.from('purchase_items').insert({...payload,created_by:state.user.id}).select().single(); if(error)return toast(error.message); itemId=data.id }
  const existing=purchaseOptionsFor(itemId),currentNos=$$('#purchaseOptionEditors .option-editor').map(e=>Number(e.dataset.optionNo)); for(const no of currentNos){ const o=readOption(no,itemId),old=existing.find(x=>x.option_no===no); if(o){ const {error}=await supabase.from('purchase_options').upsert(o,{onConflict:'item_id,option_no'}); if(error)return toast(error.message) } else if(old){ const {error}=await supabase.from('purchase_options').delete().eq('id',old.id); if(error)return toast(error.message) } } for(const old of existing.filter(x=>!currentNos.includes(x.option_no))){ const {error}=await supabase.from('purchase_options').delete().eq('id',old.id); if(error)return toast(error.message) }
  closePurchase(); toast(id?'Comparison updated':'Item added for comparison'); await loadProjectData(); navigate('purchase') }
async function deletePurchase(){ const id=$('#purchaseId').value; if(!id||!confirm('Delete this purchase comparison and all its options?'))return; const {error}=await supabase.from('purchase_items').delete().eq('id',id); if(error)return toast(error.message); closePurchase(); toast('Purchase comparison deleted'); await loadProjectData(); navigate('purchase') }
function exportPurchases(){ if(!window.XLSX)return toast('Excel library is still loading. Try again.'); const wb=XLSX.utils.book_new(); const summary=state.purchases.map(i=>{ const chosen=purchaseOptionsFor(i.id).find(o=>o.is_selected); return {'Item':i.item_name,'Category / Room':i.category||'','Status':i.decision_status,'Due Date':i.due_date||'','Actual Purchase Date':i.completed_at||'','Target Budget':i.target_budget??'','Chosen Brand':chosen?.brand||'','Chosen Model':chosen?.model||'','Chosen Price':chosen?.price??'','General Remarks':i.general_remarks||''} }); const options=state.purchases.flatMap(i=>purchaseOptionsFor(i.id).map(o=>({'Item':i.item_name,'Option':o.option_no,'Brand':o.brand||'','Model':o.model||'','Price':o.price??'','Shop / Website':o.source_name||'','Source Type':o.source_type||'','Warranty':o.warranty||'','Service /5':o.service_rating??'','Quality /5':o.quality_rating??'','Durability /5':o.durability_rating??'','Value /5':o.value_rating??'','Overall /5':ratingAvg(o)?ratingAvg(o).toFixed(1):'','Selected':o.is_selected?'Yes':'No','Remarks':o.remarks||''}))); XLSX.utils.book_append_sheet(wb,XLSX.utils.json_to_sheet(summary),'Purchase Summary'); XLSX.utils.book_append_sheet(wb,XLSX.utils.json_to_sheet(options),'Options'); const safe=(state.project?.name||'Interior-Tracker').replace(/[^a-z0-9]+/gi,'-'); XLSX.writeFile(wb,`${safe}-Purchase-Compare-${new Date().toISOString().slice(0,10)}.xlsx`) }


function noteStatusClass(s){ return {'Open':'s-waiting','In Progress':'s-progress','Done':'s-completed'}[s]||'s-not' }
function renderNotes(){ const host=$('#notesList'); if(!host)return; const rows=state.notes; host.innerHTML=rows.length?rows.map(n=>`<div class="simple-note-row ${n.status==='Done'?'note-done':''}" data-note-id="${n.id}"><div class="simple-note-main"><div class="simple-note-meta"><span class="status ${noteStatusClass(n.status)}">${esc(n.status)}</span><small>${new Intl.DateTimeFormat('en-IN',{day:'2-digit',month:'short',year:'numeric'}).format(new Date(n.updated_at))}</small></div><div class="simple-note-text">${esc(n.note).replace(/\n/g,'<br>')}</div></div><div class="simple-note-actions"><button class="btn btn-ghost" data-edit-note="${n.id}">Edit</button><button class="btn btn-ghost danger-text" data-delete-note="${n.id}">Delete</button></div></div>`).join(''):'<div class="simple-empty">No notes yet.</div>' }
function resetNoteForm(){ $('#noteForm')?.reset(); if($('#noteId'))$('#noteId').value=''; if($('#noteStatus'))$('#noteStatus').value='Open'; if($('#noteSubmitText'))$('#noteSubmitText').textContent='+ Add Note'; show($('#cancelNoteEditBtn'),false) }
function editNote(id){ const n=state.notes.find(x=>x.id===id); if(!n)return; $('#noteId').value=n.id; $('#noteText').value=n.note; $('#noteStatus').value=n.status; $('#noteSubmitText').textContent='Update Note'; show($('#cancelNoteEditBtn'),true); $('#noteText').focus(); window.scrollTo({top:0,behavior:'smooth'}) }
async function saveNote(e){ e.preventDefault(); const id=$('#noteId').value,note=$('#noteText').value.trim(); if(!note)return toast('Enter a note'); const payload={project_id:state.project.id,note,status:$('#noteStatus').value,updated_by:state.user.id}; const res=id?await supabase.from('project_notes').update(payload).eq('id',id):await supabase.from('project_notes').insert({...payload,created_by:state.user.id}); if(res.error)return toast(res.error.message); resetNoteForm(); toast(id?'Note updated':'Note added'); await loadProjectData(); navigate('notes') }
async function deleteNote(id){ if(!confirm('Delete this note?'))return; const {error}=await supabase.from('project_notes').delete().eq('id',id); if(error)return toast(error.message); toast('Note deleted'); await loadProjectData(); navigate('notes') }

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

function navigate(page){ state.page=page; $$('.page').forEach(x=>x.classList.remove('active')); $(`#${page}Page`)?.classList.add('active'); $$('.nav-item').forEach(x=>x.classList.toggle('active',x.dataset.page===page)); $('.sidebar')?.classList.remove('open'); if(page==='team'&&isAdmin())loadTeam(); if(page==='settings')renderSettings(); if(page==='purchase')renderPurchaseCompare(); if(page==='notes')renderNotes() }
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
$$('[data-auth-tab]').forEach(b=>b.addEventListener('click',()=>{ state.authMode=b.dataset.authTab; $$('[data-auth-tab]').forEach(x=>x.classList.toggle('active',x===b)); show($('#nameField'),state.authMode==='signup'); $('#authSubmit').textContent=state.authMode==='signup'?'Create account':'Sign in'; $('#password').autocomplete=state.authMode==='signup'?'new-password':'current-password' }))
$('#authForm').addEventListener('submit',async e=>{ e.preventDefault(); const email=$('#email').value.trim(),password=$('#password').value; if(state.authMode==='signup'){ const {data,error}=await supabase.auth.signUp({email,password,options:{emailRedirectTo:SITE_URL,data:{display_name:$('#displayName').value.trim()||email.split('@')[0]}}}); if(error)return toast(error.message); if(!data.session)toast('Account created. Check your email to confirm, then sign in.'); else await enterApp(data.user) } else { const {data,error}=await supabase.auth.signInWithPassword({email,password}); if(error)return toast(error.message); await enterApp(data.user) } })
$('#logoutBtn').addEventListener('click',()=>supabase.auth.signOut()); $('#forgotPasswordBtn').addEventListener('click',forgotPassword); $('#passwordChangeForm').addEventListener('submit',submitPasswordChange); $('#createAdminForm').addEventListener('submit',createAdmin); $('#createProjectBtn').addEventListener('click',createProject); $('#joinProjectBtn').addEventListener('click',joinProject); $('#refreshAccessBtn').addEventListener('click',loadProjectContext)
$$('.nav-item').forEach(b=>b.addEventListener('click',()=>navigate(b.dataset.page))); $$('[data-page-link]').forEach(b=>b.addEventListener('click',()=>navigate(b.dataset.pageLink))); $$('[data-action="add-activity"]').forEach(b=>b.addEventListener('click',()=>openActivity())); $$('[data-close-modal]').forEach(b=>b.addEventListener('click',closeActivity))
$('#activityForm').addEventListener('submit',saveActivity); $('#deleteActivityBtn').addEventListener('click',deleteActivity); ['areaFilter','statusFilter','quickFilter','searchFilter'].forEach(id=>$('#'+id).addEventListener(id==='searchFilter'?'input':'change',renderActivities)); $('#mobileMenuBtn').addEventListener('click',()=>$('.sidebar').classList.toggle('open'))
$('#copyInviteBtn').addEventListener('click',async()=>{ await navigator.clipboard.writeText(state.project?.invite_code||''); toast('Invite code copied') })
$('#projectSettingsForm').addEventListener('submit',saveProjectSettings); $('#addAreaForm').addEventListener('submit',addArea)
$('#purchaseForm').addEventListener('submit',savePurchase); $('#addPurchaseOptionBtn').addEventListener('click',addPurchaseOption); $('#deletePurchaseBtn').addEventListener('click',deletePurchase); $('#exportPurchasesBtn').addEventListener('click',exportPurchases); $('#printPurchasesBtn').addEventListener('click',()=>printPage('purchase')); ['purchaseSearch','purchaseStatusFilter','purchaseTimingFilter'].forEach(id=>$('#'+id).addEventListener(id==='purchaseSearch'?'input':'change',renderPurchaseCompare)); $$('[data-close-purchase]').forEach(b=>b.addEventListener('click',closePurchase))
$('#exportExcelBtn').addEventListener('click',()=>exportExcel(filteredActivities(),'Activities')); $('#exportPendingBtn').addEventListener('click',()=>exportExcel(state.activities.filter(a=>a.pending_with_me&&a.status!=='Completed'),'Pending-With-Me'))
$('#noteForm').addEventListener('submit',saveNote); $('#cancelNoteEditBtn').addEventListener('click',resetNoteForm);
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
  const ep=e.target.closest('[data-edit-purchase]'); if(ep)openPurchase(ep.dataset.editPurchase)
  const ap=e.target.closest('[data-action="add-purchase"]'); if(ap)openPurchase()
  const ro=e.target.closest('[data-remove-purchase-option]'); if(ro)removePurchaseOption(ro.dataset.removePurchaseOption)
  const en=e.target.closest('[data-edit-note]'); if(en)editNote(en.dataset.editNote)
  const dn=e.target.closest('[data-delete-note]'); if(dn)deleteNote(dn.dataset.deleteNote)
})
document.addEventListener('input',e=>{ if(e.target.matches('.rating-slider')){ const out=document.querySelector(`[data-rating-output="${e.target.id}"]`); if(out)out.value=e.target.value } })
document.addEventListener('change',e=>{ if(e.target.matches('[data-role-user]')){ const v=e.target.value; updateMember(e.target.dataset.roleUser,v==='admin'?{is_admin:true,role:'editor',status:'approved'}:{is_admin:false,role:v,status:'approved'}) } })

init()
