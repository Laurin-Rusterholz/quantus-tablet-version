import {createDeviceBriefingController} from './quantus-briefing-device-controller.mjs';
const api=()=>window.__quantusTablet;
let controller,origin;
function control(){const next=new URL(api().appBaseUrl()).origin;if(!controller||origin!==next){controller?.unmount();origin=next;controller=createDeviceBriefingController({getUser:()=>api()?.state.user,getData:()=>api()?.state.payload||{},origin})}return controller}
const esc=v=>api().esc(v);
function entity(col,item){return `<button type="button" data-action="${col==='chatgptLeads'?'qb-lead-open':'edit-entity'}" data-collection="${esc(col)}" data-id="${esc(item.id)}">${esc(item.title||item.name||'Original öffnen')}</button>`}
window.renderQuantusTabletBriefing=function(a,date){
  const data=a.state.payload||{},cg=window.QuantusChatgpt,e=data.entities||{};
  const end=new Date(date+'T12:00:00Z');end.setUTCDate(end.getUTCDate()+7);const until=end.toISOString().slice(0,10);
  const events=a.collection('meetings').filter(m=>m.date>=date&&m.date<=until).sort((a,b)=>String(a.date).localeCompare(String(b.date)));
  const task=t=>`<div class="qb-row"><button type="button" data-action="toggle-task" data-id="${esc(t.id)}" aria-label="Aufgabe abschliessen">□</button> ${entity('tasks',t)}<p class="qb-muted">${esc(t.dueDate||'Ohne Termin')}</p><button type="button" data-action="cg-task-delegate" data-id="${esc(t.id)}">Delegieren</button></div>`;
  return `<div class="view">${a.viewHeader('Tagesbriefing',new Date(date+'T12:00:00').toLocaleDateString('de-CH',{weekday:'long',day:'numeric',month:'long'}),'<button class="btn" data-action="db-day" data-tage="-1">‹ Vortag</button><button class="btn" data-action="db-day" data-tag="heute">Heute</button><button class="btn" data-action="db-day" data-tage="1">Folgetag ›</button>')}${a.loginBanner()}${window.QuantusBriefingDevice.render({data,date,pending:a.state.pending.length,adapters:{entity,task,files:cg.attachmentSection,calendar:`<p class="qb-muted">Geladene Quantus-Termine für sieben Folgetage. Live-Kalender separat öffnen.</p>${events.map(m=>`<div class="qb-row">${esc(m.date)} ${esc(m.startTime||m.time||'')} ${entity('meetings',m)}</div>`).join('')}${(data.dailyBriefing?.timeBlocks?.[date]||[]).map(b=>`<p class="qb-muted">${esc(b.startTime||'')}–${esc(b.endTime||'')} · ${esc(b.title||'Block')} (Zeitblock)</p>`).join('')}<a href="#/googlecalendar">Google Kalender</a>`,progress:'<a href="#/smarter">Smarter</a> <a href="#/learning">RecallLab</a>'}})}<div class="mb-mehr"><button class="btn" data-action="go" data-route="daily">Tagesplanung, Routinen und Notizen öffnen</button></div></div>`;
};
window.mountQuantusTabletBriefing=()=>control().mount(document.querySelector('.qb-dashboard'));
(window.__quantusTabletModules=window.__quantusTabletModules||[]).push({key:'briefing-device-actions',routes:[],onAction(action,button){if(action!=='qb-lead-open')return false;const a=api();a.go('chatgptnotes');window.QuantusChatgpt.onAction('cg-lead-open',button);return true}});
window.addEventListener('hashchange',()=>{if(!location.hash.startsWith('#/dailybriefing'))controller?.unmount()});
api()?.scheduleRender();
