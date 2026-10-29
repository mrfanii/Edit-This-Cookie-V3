import '/lib/jquery-4.0.0.min.js';

import { startData } from '/js/data.js';
import { applyTheme } from '/js/theme.js';
import { _getMessage, deleteReadOnlyRule } from '/js/utils.js';
import { customI18n } from '/lib/custom_i18n.js';
import { localizePage } from '../lib/i18n_translator.js';
import { setPageCooserEvents } from './options_page_chooser.js';

async function start() {
  const { data, preferences } = await startData(function () {
    location.reload(true);
  });
  applyTheme(preferences.theme);
  chrome.i18n = await customI18n(data, preferences);

  let forceHideOperations = false;

  function setEvents() {
    $('.cmd_delete')
      .unbind()
      .click(function () {
        if (!preferences.showAlerts || confirm(_getMessage('Alert_deleteRule') + '?')) {
          hideEditCommands();
          var index = $('.active').attr('index');
          forceHideOperations = true;
          $('.operations:visible').clearQueue();
          $('.operations:visible').fadeOut();
          $('.active').fadeOut(function () {
            forceHideOperations = false;
            deleteReadOnlyRule(data, index);
            return;
          });
        }
      });

    $('.data_row')
      .unbind()
      .mouseover(function () {
        $('.active').removeClass('active');
        $(this).addClass('active');

        const operations = $('.operations');
        const buttonHeight = $('.cmd_delete', operations).outerHeight();
        const top = $(this).position().top + ($(this).outerHeight() - buttonHeight) / 2;
        operations.clearQueue().css('top', top).show();
      });
  }

  function setReadOnlyRules() {
    $('.table_row:not(.header, .template, #line_template)', '.table').detach();

    if (data.readOnly.length == 0) {
      var row = $('#no_rules').clone().removeClass('template');
      $('.table').append(row);
      return;
    }

    for (var i = 0; i < data.readOnly.length; i++) {
      try {
        var rule = data.readOnly[i];
        var domain = rule.domain != undefined ? rule.domain : 'any';
        var name = rule.name != undefined ? rule.name : 'any';
        var value = rule.value != undefined ? rule.value : 'any';
        addRuleLine(domain, name, value, i);
      } catch (e) {
        console.error(e.message);
      }
    }
  }

  function addRuleLine(domain, name, value, index) {
    var line = $('#line_template').clone();
    $('.domain_field', line).empty().text(domain);
    $('.name_field', line).empty().text(name);
    $('.value_field', line).empty().text(value);
    line.attr('id', 'rule_n_' + index);
    line.attr('index', index);
    line.css('display', '');
    $('.table').append(line);
  }

  function hideEditCommands() {
    $('.new_rule_operations').fadeOut();
    $('.new_row:not(.template)').fadeOut().detach();
  }

  localizePage();
  setPageCooserEvents();
  setReadOnlyRules();
  setEvents();
}
window.addEventListener('load', start);
