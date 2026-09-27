const items={new:['File','New Project'],video:['File','Open Video…'],open:['File','Open Project…'],save:['File','Save'],saveAs:['File','Save As…'],settings:['File','Settings & Usage…'],undo:['Edit','Undo'],redo:['Edit','Redo'],delete:['Edit','Delete'],help:['Help','Creator Guide']};
async function menuAction(page,id){
  const [group,label]=items[id];
  await page.locator('.menu-bar').getByRole('button',{name:group,exact:true}).click();
  await page.getByRole('menuitem').filter({has:page.locator('span').filter({hasText:new RegExp('^'+label.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'$')})}).click();
}
async function waitSaved(page){await page.waitForFunction(()=>!document.querySelector('.busy-panel')&&document.querySelector('.save-status')?.textContent==='Saved');}
module.exports={menuAction,waitSaved};
