import '/lib/jquery-4.0.0.min.js';
import '/lib/jquery-ui-1.14.2.min.js';

import { startData } from '/js/data.js';
import { applyTheme } from '/js/theme.js';
import { addBlockRule, _getMessage, deleteBlockRule } from '/js/utils.js';
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
  let newRowVisible = false;

  function setEvents() {
    $('#submitButton')
      .button()
      .off('click.submitRule')
      .on('click.submitRule', function (event) {
        event.preventDefault();
        submitRule();
      });
    $('#ruleDomain, #ruleName, #ruleValue')
      .off('focus.clearAnyValue')
      .on('focus.clearAnyValue', function () {
        if (this.value === 'any') {
          this.value = '';
        }
      });
    $('#addRule')
      .unbind()
      .click(function () {
        showNewEmptyRule();
      });

    $('.cmd_delete')
      .unbind()
      .click(function () {
        if (!preferences.showAlerts || confirm(_getMessage('Alert_deleteRule') + '?')) {
          hideEditCommands();
          let index = $('.active').attr('index');
          forceHideOperations = true;
          $('.operations:visible').clearQueue().fadeOut();
          $('.active').fadeOut(function () {
            forceHideOperations = false;
            if (newRowVisible) {
              showNewEmptyRule();
            }
            deleteBlockRule(data, index);
            if (data.filters.length == 0) {
              let row = $('#no_rules').clone().removeClass('template');
              $('.table').append(row);
              return;
            } else {
              $('#no_rules1').detach();
            }
            return;
          });
        }
      });

    $('.cmd_accept')
      .unbind()
      .click(function () {
        submitRule();
      });

    $('.cmd_cancel')
      .unbind()
      .click(function () {
        hideEditCommands();
      });

    $('.data_row')
      .unbind()
      .mouseover(function () {
        // remove active class from previous element
        $('.active').removeClass('active');

        // add active class to current element
        $(this).addClass('active');

        const operations = $('.operations');
        const buttonHeight = $('.cmd_delete', operations).outerHeight();
        const top = $(this).position().top + ($(this).outerHeight() - buttonHeight) / 2;
        operations.clearQueue().css({ top: top, display: 'inline-block' });
      });
  }

  function setBlockRules() {
    $('.table_row:not(.header, .template, #line_template)', '.table').detach();

    if (data.filters.length == 0) {
      var row = $('#no_rules').clone().removeClass('template').attr('id', '#no_rules1');
      $('.table').append(row);
      return;
    } else {
      $('#no_rules1').detach();
    }

    for (var i = 0; i < data.filters.length; i++) {
      try {
        var filter = data.filters[i];
        var domain = filter.domain != undefined ? filter.domain : 'any';
        var name = filter.name != undefined ? filter.name : 'any';
        var value = filter.value != undefined ? filter.value : 'any';
        addBlockLine(domain, name, value, i);
      } catch (e) {
        console.error(e.message);
      }
    }
  }

  function addBlockLine(domain, name, value, index) {
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
    newRowVisible = false;
    $('.new_rule_operations').fadeOut();
    $('.new_row:not(.template)').fadeOut().detach();
  }

  function showNewEmptyRule() {
    if ($('.new_row:not(.template)').length > 0) {
      $('.new_rule_operations').css('top', $('.new_row:not(.template)').position().top + 6 + 'px');
      $('.new_rule_operations').css('left', '-8px');
      return;
    }

    newRowVisible = true;

    var newRow = $('.new_row.template').clone().removeClass('template');
    $('.table').append(newRow);

    $('.new_rule_operations').css('top', newRow.position().top + 6 + 'px');
    $('.new_rule_operations').css('left', '-8px');

    newRow.hide();
    newRow.fadeIn();
    $('.new_rule_operations').fadeIn();

    newRow.keyup(function (event) {
      // ESC
      if (event.keyCode == 27) {
        $('.cmd_cancel').trigger('click');
      }
      // ENTER
      if (event.keyCode == 13) {
        $('.cmd_accept').trigger('click');
      }
    });
  }

  function submitRule() {
    var domain = $('.new_rule_domain', '.new_row:not(.template)').val();
    domain = domain == 'any' || domain == '' ? undefined : domain;
    var name = $('.new_rule_name', '.new_row:not(.template)').val();
    name = name == 'any' || name == '' ? undefined : name;
    var value = $('.new_rule_value', '.new_row:not(.template)').val();
    value = value == 'any' || value == '' ? undefined : value;

    var newRule = {};
    newRule.name = name;
    newRule.domain = domain;
    newRule.value = value;

    if (name == undefined && domain == undefined && value == undefined) {
      return;
    }

    addBlockRule(data, newRule);
    hideEditCommands();

    location.reload(true);
  }

  localizePage();
  setPageCooserEvents();
  setBlockRules();
  setEvents();
}
window.addEventListener('load', start);
