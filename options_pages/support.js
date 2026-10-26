import '/lib/jquery-4.0.0.min.js';
import '/lib/uniform/jquery.uniform.js';

import { startData } from '/js/data.js';
import { customI18n } from '/lib/custom_i18n.js';
import { setPageCooserEvents } from './options_page_chooser.js';
import { localizePage } from '../lib/i18n_translator.js';

async function start() {
  const { data, preferences } = await startData();
  chrome.i18n = await customI18n(data, preferences);
  localizePage();
  function setEvents() {
    $('.linkify').click(function () {
      var urlToOpen = $(this).attr('lnk');
      if (urlToOpen == undefined) return;

      chrome.tabs.getCurrent(function (cTab) {
        chrome.tabs.create({
          url: urlToOpen,
          active: true,
          index: cTab.index + 1,
          openerTabId: cTab.id,
        });
      });
    });
  }

  $(document).ready(function () {
    setPageCooserEvents();
    $('input:checkbox').uniform();
    setEvents();
  });
}
window.addEventListener('load', start);
