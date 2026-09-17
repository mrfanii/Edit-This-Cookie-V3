import '/lib/jquery-3.3.1.min.js';
import '/lib/jquery-ui-1.12.1.custom.min.js';
import '/lib/uniform/jquery.uniform.js';

import { localizePage } from '/lib/i18n_translator.js';
import { isChristmasPeriod } from '/js/common-utils.js';
import { startData } from '/js/data.js';
import { cookieForCreationFromFullCookie } from '/js/cookie_helpers.js';
import { customI18n } from '/lib/custom_i18n.js';
import { setPageCooserEvents } from './options_page_chooser.js';

async function start() {
  const { data, preferences } = await startData(function () {
    setOptions();
  });
  chrome.i18n = await customI18n(data, preferences);

  let totalCookies;
  let cookiesShortened;

  function setOptions() {
    $('#saveMaxDateButton').button().hide();
    $('#maxDateType').buttonset();
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
      $('#maxDateType').buttonset('disable');
      $('#saveMaxDateButton').button('disable');
    } else {
      $('#maxDateLabel').removeClass('disabled');
      $('#maxDateType').buttonset('enable');
      $('#saveMaxDateButton').button('enable');
    }
    $('#maxDate').val(preferences.maxCookieAge);
    $('input:radio', '.radioMaxDate').prop('checked', false);
    $("input:radio[value='" + preferences.maxCookieAgeType + "']").prop('checked', true);
    $('#maxDateType').buttonset('refresh');

    $('#copyCookiesType').val(preferences.copyCookiesType);
    $('#exportCookiesAction').val(preferences.exportCookiesAction);

    $('#showDomainBeforeName').prop('checked', preferences.showDomainBeforeName);
    $('#showDomainBeforeName').prop('disabled', !preferences.showDomain);
    if (!preferences.showDomain) $('#showDomainBeforeNameLabel').addClass('disabled');
    else $('#showDomainBeforeNameLabel').removeClass('disabled');

    $("option[value='" + preferences.sortCookiesType + "']").prop('selected', true);

    $('#showDevToolsPanel').prop('checked', preferences.showDevToolsPanel);

    $.uniform.update();
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
      $('#maxDateType').buttonset('disable');
      $('#saveMaxDateButton').button('disable').fadeOut();
      $('#saveMaxDateButton:visible').fadeOut();
    } else {
      $('#maxDateLabel').removeClass('disabled');
      $('#maxDateType').buttonset('enable');
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

    chrome.cookies.getAll({}, function (cookies) {
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
      console.log("Shortening life of cookie '" + cookie.name + "' from '" + cookie.expirationDate + "' to '" + maxAllowedExpiration + "'");
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
  $('input:checkbox, input:text, select').uniform();
  setOptions();
  setEvents();
}
window.addEventListener('load', start);
