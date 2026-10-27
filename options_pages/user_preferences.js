import '/lib/jquery-4.0.0.min.js';
import '/lib/jquery-ui-1.14.2.min.js';
import '/lib/uniform/jquery.uniform.js';

import { localizePage } from '/lib/i18n_translator.js';
import { isChristmasPeriod } from '/js/common-utils.js';
import { startData } from '/js/data.js';
import { applyTheme } from '/js/theme.js';
import { cookieForCreationFromFullCookie, getAllCookies } from '/js/cookie_helpers.js';
import { customI18n } from '/lib/custom_i18n.js';
import { setPageCooserEvents } from './options_page_chooser.js';

function closeCustomSelect(wrapper, restoreFocus = false) {
  const trigger = wrapper.find('.custom-select-trigger');
  wrapper.removeClass('is-open opens-upward');
  trigger.attr('aria-expanded', 'false');
  wrapper.find('.custom-select-menu').prop('hidden', true);
  if (restoreFocus) trigger.trigger('focus');
}

function closeAllCustomSelects(except) {
  $('.selector.custom-select.is-open').each(function () {
    if (this !== except) closeCustomSelect($(this));
  });
}

function refreshCustomSelect(selectElement) {
  const select = $(selectElement);
  const wrapper = select.closest('.selector.custom-select');
  if (wrapper.length === 0) return;

  const trigger = wrapper.find('.custom-select-trigger');
  const menu = wrapper.find('.custom-select-menu');
  const selectedIndex = selectElement.selectedIndex;
  const selectedOption = selectElement.options[selectedIndex];
  const label = $(`label[for='${selectElement.id}']`).first();

  const labelText = label.text().trim();
  trigger.text(selectedOption?.text ?? '').prop('disabled', selectElement.disabled);
  if (labelText === '') trigger.removeAttr('aria-label');
  else trigger.attr('aria-label', `${labelText}: ${selectedOption?.text ?? ''}`);
  wrapper.toggleClass('disabled', selectElement.disabled);
  menu.empty();

  [...selectElement.options].forEach((option, index) => {
    $('<button>', {
      type: 'button',
      class: 'custom-select-option',
      role: 'option',
      text: option.text,
      disabled: option.disabled,
      'data-index': index,
      'aria-selected': index === selectedIndex ? 'true' : 'false',
    })
      .toggleClass('is-selected', index === selectedIndex)
      .appendTo(menu);
  });

  if (selectElement.disabled) closeCustomSelect(wrapper);
}

function refreshCustomSelects() {
  $('#options-box select').each(function () {
    refreshCustomSelect(this);
  });
}

function setupCustomSelects() {
  $('#options-box select').each(function () {
    const selectElement = this;
    const select = $(selectElement);
    let wrapper = select.closest('div.selector');
    if (wrapper.length === 0) {
      select.wrap('<div class="selector"></div>');
      wrapper = select.parent();
    }
    if (wrapper.hasClass('custom-select')) {
      refreshCustomSelect(selectElement);
      return;
    }

    const menuId = `${selectElement.id}-custom-menu`;
    const trigger = $('<button>', {
      type: 'button',
      class: 'custom-select-trigger',
      'aria-haspopup': 'listbox',
      'aria-expanded': 'false',
      'aria-controls': menuId,
    });
    const menu = $('<div>', {
      id: menuId,
      class: 'custom-select-menu',
      role: 'listbox',
      hidden: true,
    });

    wrapper.addClass('custom-select');
    select.addClass('custom-select-native').attr({ tabindex: -1, 'aria-hidden': 'true' });
    wrapper.append(trigger, menu);

    trigger.on('click.customSelect', function (event) {
      event.preventDefault();
      event.stopPropagation();
      if (selectElement.disabled) return;

      const willOpen = !wrapper.hasClass('is-open');
      closeAllCustomSelects(wrapper[0]);
      wrapper.toggleClass('is-open', willOpen);
      trigger.attr('aria-expanded', willOpen ? 'true' : 'false');
      menu.prop('hidden', !willOpen);
      if (willOpen) {
        const wrapperBounds = wrapper[0].getBoundingClientRect();
        const menuHeight = Math.min(menu[0].scrollHeight, 276) + 7;
        const opensUpward = window.innerHeight - wrapperBounds.bottom < menuHeight && wrapperBounds.top > menuHeight;
        wrapper.toggleClass('opens-upward', opensUpward);
        menu.find('.is-selected').trigger('focus');
      }
    });

    trigger.on('keydown.customSelect', function (event) {
      if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
      event.preventDefault();
      if (!wrapper.hasClass('is-open')) trigger.trigger('click');

      const options = menu.find('.custom-select-option:not(:disabled)');
      const selected = options.filter('.is-selected');
      let target = selected.length ? selected : options.first();
      if (event.key === 'ArrowUp' || event.key === 'End') target = options.last();
      if (event.key === 'Home') target = options.first();
      target.trigger('focus');
    });

    menu.on('click.customSelect', '.custom-select-option', function () {
      if (this.disabled) return;
      selectElement.selectedIndex = Number(this.dataset.index);
      select.trigger('change');
      closeCustomSelect(wrapper, true);
    });

    menu.on('keydown.customSelect', '.custom-select-option', function (event) {
      const options = menu.find('.custom-select-option:not(:disabled)');
      const index = options.index(this);

      if (event.key === 'Escape') {
        event.preventDefault();
        closeCustomSelect(wrapper, true);
      } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault();
        const offset = event.key === 'ArrowDown' ? 1 : -1;
        options.eq((index + offset + options.length) % options.length).trigger('focus');
      } else if (event.key === 'Home' || event.key === 'End') {
        event.preventDefault();
        options.eq(event.key === 'Home' ? 0 : -1).trigger('focus');
      } else if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        $(this).trigger('click');
      } else if (event.key === 'Tab') {
        closeCustomSelect(wrapper);
      }
    });

    select.on('change.customSelect', function () {
      refreshCustomSelect(selectElement);
    });
    refreshCustomSelect(selectElement);
  });

  $(document)
    .off('click.customSelect')
    .on('click.customSelect', function (event) {
      if ($(event.target).closest('.selector.custom-select').length === 0) closeAllCustomSelects();
    });
}

async function start() {
  const { data, preferences } = await startData(function () {
    applyTheme(preferences.theme);
    setOptions();
  });
  applyTheme(preferences.theme);
  chrome.i18n = await customI18n(data, preferences);

  let totalCookies;
  let cookiesShortened;

  function setOptions() {
    $('#saveMaxDateButton').button().hide();
    $('#maxDateType').controlgroup();
    $(':checkbox', '#options-box').removeAttr('checked');
    $('#justDelete').prop('checked', preferences.justDelete);
    $('#showAlerts').prop('checked', preferences.showAlerts);
    $('#showDomain').prop('checked', preferences.showDomain);
    $('#showContextMenu').prop('checked', preferences.showContextMenu);
    $('#showFlagAndDeleteAll').prop('checked', preferences.showFlagAndDeleteAll);
    $('#showCommandsLabels').prop('checked', preferences.showCommandsLabels);

    if (isChristmasPeriod()) {
      $('#showChristmasIcon').prop('checked', preferences.showChristmasIcon);
    } else {
      $('#showChristmasIcon').closest('.formLine').hide();
    }

    $('#refreshAfterSubmit').prop('checked', preferences.refreshAfterSubmit);
    $('#skipCacheRefresh').prop('checked', preferences.skipCacheRefresh);
    $('#skipCacheRefresh').prop('disabled', !preferences.refreshAfterSubmit);
    if (!preferences.refreshAfterSubmit) {
      $('#skipCacheRefreshLabel').addClass('disabled');
    } else {
      $('#skipCacheRefreshLabel').removeClass('disabled');
    }

    $('#useCustomLocale').prop('checked', preferences.useCustomLocale);
    $('#customLocale').empty();
    $('#customLocale').prop('disabled', !preferences.useCustomLocale);
    var select = $('#customLocale');

    for (var i = 0; i < chrome.i18n.existingLocales.length; i++) {
      $('#customLocale').append(
        $('<option>')
          .attr('value', chrome.i18n.existingLocales[i].code)
          .prop('selected', chrome.i18n.existingLocales[i].code === preferences.customLocale)
          .text(chrome.i18n.existingLocales[i].name),
      );
    }

    $('#useMaxDate').prop('checked', preferences.useMaxCookieAge);
    $('#maxDate').prop('disabled', !preferences.useMaxCookieAge);
    if (!preferences.useMaxCookieAge) {
      $('#maxDateLabel').addClass('disabled');
      $('#maxDateType').controlgroup('disable');
      $('#saveMaxDateButton').button('disable');
    } else {
      $('#maxDateLabel').removeClass('disabled');
      $('#maxDateType').controlgroup('enable');
      $('#saveMaxDateButton').button('enable');
    }
    $('#maxDate').val(preferences.maxCookieAge);
    $('input:radio', '.radioMaxDate').prop('checked', false);
    $("input:radio[value='" + preferences.maxCookieAgeType + "']").prop('checked', true);
    $('#maxDateType').controlgroup('refresh');

    $('#theme').val(preferences.theme);
    $('#copyCookiesType').val(preferences.copyCookiesType);
    $('#exportCookiesAction').val(preferences.exportCookiesAction);

    $('#showDomainBeforeName').prop('checked', preferences.showDomainBeforeName);
    $('#showDomainBeforeName').prop('disabled', !preferences.showDomain);
    if (!preferences.showDomain) $('#showDomainBeforeNameLabel').addClass('disabled');
    else $('#showDomainBeforeNameLabel').removeClass('disabled');

    $("option[value='" + preferences.sortCookiesType + "']").prop('selected', true);

    $('#showDevToolsPanel').prop('checked', preferences.showDevToolsPanel);

    $.uniform.update();
    refreshCustomSelects();
  }

  function setEvents() {
    $('#showAlerts').click(function () {
      preferences.showAlerts = $('#showAlerts').prop('checked');
    });
    $('#showDomain').click(function () {
      preferences.showDomain = $('#showDomain').prop('checked');
      $('#showDomainBeforeName').prop('disabled', !preferences.showDomain);
      if (!preferences.showDomain) {
        $('#showDomainBeforeNameLabel').addClass('disabled');
      } else {
        $('#showDomainBeforeNameLabel').removeClass('disabled');
      }
      $.uniform.update();
    });
    $('#refreshAfterSubmit').click(function () {
      preferences.refreshAfterSubmit = $('#refreshAfterSubmit').prop('checked');
      $('#skipCacheRefresh').prop('disabled', !preferences.refreshAfterSubmit);
      if (preferences.refreshAfterSubmit) {
        $('#skipCacheRefreshLabel').removeClass('disabled');
      } else {
        $('#skipCacheRefreshLabel').addClass('disabled');
      }
      $.uniform.update();
    });
    $('#skipCacheRefresh').click(function () {
      preferences.skipCacheRefresh = $('#skipCacheRefresh').prop('checked');
    });
    $('#encodeCookieValue').click(function () {
      preferences.encodeCookieValue = $('#encodeCookieValue').prop('checked');
    });
    $('#showContextMenu').click(function () {
      preferences.showContextMenu = $('#showContextMenu').prop('checked');
    });
    $('#showFlagAndDeleteAll').click(function () {
      preferences.showFlagAndDeleteAll = $('#showFlagAndDeleteAll').prop('checked');
    });
    $('#showCommandsLabels').click(function () {
      preferences.showCommandsLabels = $('#showCommandsLabels').prop('checked');
    });
    $('#showChristmasIcon').click(function () {
      preferences.showChristmasIcon = $('#showChristmasIcon').prop('checked');
    });

    $('#useMaxDate').click(function () {
      updateMaxDate();
    });
    $('#maxDateType').click(function () {
      $('#saveMaxDateButton:hidden').fadeIn();
    });
    $('#maxDate').keydown(function (e) {
      var keyPressed;
      if (!e) var e = window.event;
      if (e.keyCode) keyPressed = e.keyCode;
      else if (e.which) keyPressed = e.which;
      if (
        keyPressed == 46 ||
        keyPressed == 8 ||
        keyPressed == 9 ||
        keyPressed == 27 ||
        keyPressed == 13 ||
        // Allow: Ctrl+A
        (keyPressed == 65 && e.ctrlKey === true) ||
        // Allow: home, end, left, right
        (keyPressed >= 35 && keyPressed <= 39)
      ) {
        // let it happen, don't do anything
        return;
      } else {
        // Ensure that it is a number and stop the keypress
        if (e.shiftKey || ((keyPressed < 48 || keyPressed > 57) && (keyPressed < 96 || keyPressed > 105))) {
          e.preventDefault();
        }
      }
    });
    $('#maxDate').bind('keyup blur', function (e) {
      $('#saveMaxDateButton:hidden').fadeIn();
    });

    $('#saveMaxDateButton').click(function (e) {
      $('#saveMaxDateButton').fadeOut(function () {
        $('#shortenProgress').fadeIn(function () {
          updateMaxDate(true);
        });
      });
    });
    $('#theme').change(function () {
      preferences.theme = $('#theme').val();
      applyTheme(preferences.theme);
    });

    $('#useCustomLocale').click(function () {
      preferences.useCustomLocale = $('#useCustomLocale').prop('checked');
      top.location.reload();
    });

    $('#customLocale').change(function () {
      preferences.customLocale = $('#customLocale').val();
      top.location.reload();
    });

    $('#copyCookiesType').change(function () {
      preferences.copyCookiesType = $('#copyCookiesType').val();
    });

    $('#exportCookiesAction').change(function () {
      preferences.exportCookiesAction = $('#exportCookiesAction').val();
    });

    $('#showDomainBeforeName').click(function () {
      preferences.showDomainBeforeName = $('#showDomainBeforeName').prop('checked');
    });

    $('#sortCookiesType').change(function () {
      preferences.sortCookiesType = $('#sortCookiesType').val();
    });

    $('#showDevToolsPanel').change(function () {
      preferences.showDevToolsPanel = $('#showDevToolsPanel').prop('checked');
    });
  }

  function updateMaxDate(filterAllCookies) {
    var tmp_useMaxCookieAge = $('#useMaxDate').prop('checked');

    $('#useMaxDate').prop('checked', tmp_useMaxCookieAge);
    $('#maxDate').prop('disabled', !tmp_useMaxCookieAge);

    if (!tmp_useMaxCookieAge) {
      $('#maxDateLabel').addClass('disabled');
      $('#maxDateType').controlgroup('disable');
      $('#saveMaxDateButton').button('disable').fadeOut();
      $('#saveMaxDateButton:visible').fadeOut();
    } else {
      $('#maxDateLabel').removeClass('disabled');
      $('#maxDateType').controlgroup('enable');
      $('#saveMaxDateButton').button('enable');
      if (!filterAllCookies) $('#saveMaxDateButton:hidden').fadeIn();
    }

    if (!tmp_useMaxCookieAge || filterAllCookies) preferences.useMaxCookieAge = tmp_useMaxCookieAge;

    if (filterAllCookies == undefined || filterAllCookies == false) return;

    preferences.maxCookieAgeType = $("input:radio[name='radioMaxDate']:checked").val();

    let tmp_maxCookieAge = parseInt($('#maxDate').val());
    if (!(typeof tmp_maxCookieAge === 'number' && tmp_maxCookieAge % 1 == 0)) {
      $('#maxDate').val(1);
      tmp_maxCookieAge = 1;
    }
    preferences.maxCookieAge = tmp_maxCookieAge;

    getAllCookies({}, function (cookies) {
      totalCookies = cookies.length;
      cookiesShortened = 0;
      $('span', '#shortenProgress').text('0 / ' + totalCookies);
      shortenCookies(cookies, setOptions);
    });
  }

  function shortenCookies(cookies, callback) {
    if (cookies.length <= 0) {
      data.nCookiesShortened += cookiesShortened;
      $('#shortenProgress').fadeOut(function () {
        if (callback != undefined) callback();
      });
      return;
    }
    $('span', '#shortenProgress').text(totalCookies - cookies.length + ' / ' + totalCookies);
    var cookie = cookies.pop();
    var maxAllowedExpiration = Math.round(new Date().getTime() / 1000) + preferences.maxCookieAge * preferences.maxCookieAgeType;
    if (cookie.expirationDate != undefined && cookie.expirationDate > maxAllowedExpiration) {
      var newCookie = cookieForCreationFromFullCookie(cookie);
      if (!cookie.session) newCookie.expirationDate = maxAllowedExpiration;
      chrome.cookies.set(newCookie, function () {
        shortenCookies(cookies, callback);
      });
      cookiesShortened++;
    } else shortenCookies(cookies, callback);
  }

  localizePage();
  setPageCooserEvents();
  $('input:checkbox, input:text').uniform();
  setOptions();
  setupCustomSelects();
  setEvents();
}
window.addEventListener('load', start);
