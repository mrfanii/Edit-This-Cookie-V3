import { getUrlVars } from '/js/utils.js';
import { storage } from '/js/common-utils.js';

async function start() {
  const panel = await storage.get('option_panel');
  const urlVars = getUrlVars();
  let element;
  if (panel === 'null' || panel === null || panel === undefined) {
    element = 'support';
  } else {
    element = panel;
  }

  if (urlVars.page !== undefined) {
    element = urlVars.page;
  }

  location.href = '/pages/' + element + '.html';
}
window.addEventListener('load', start);
