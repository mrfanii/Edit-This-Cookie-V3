import '/lib/jquery-4.0.0.min.js';
import '/lib/tablesorter/jquery.tablesorter.min.js';
import '/lib/tablesorter/jquery.tablesorter.widgets.min.js';
import '/lib/jquery.jeditable.js';

import { startData } from '/js/data.js';
import { getUrlVars } from '/js/utils.js';
import { buildUrl, clonePartitionKey, getAllCookies } from '/js/cookie_helpers.js';
import { customI18n } from '/lib/custom_i18n.js';
import { localizePage } from '../lib/i18n_translator.js';

async function start() {
  const { data, preferences } = await startData();
  chrome.i18n = await customI18n(data, preferences);
  localizePage();
  var tabURL;
  var cookieList = [];

  var backgroundPageConnection = chrome.runtime.connect({
    name: 'devtools-page',
  });

  backgroundPageConnection.onMessage.addListener(function (message) {
    if (message.action === 'getall') {
      createTable(message);
    } else if (message.action === 'refresh') {
      location.reload(true);
    }
  });

  jQuery(document).ready(function () {
    ++data.nPanelClicked;
    start();
  });

  function start() {
    var urlVars = getUrlVars();
    if (urlVars.url !== undefined) {
      //TESTING PURPOSES
      createList('https://google.com');
      return;
    }
    var tabId = chrome.devtools.inspectedWindow.tabId;
    console.log({ tabId });
    backgroundPageConnection.postMessage({
      action: 'getall',
      tabId: tabId,
    });
  }

  function createList(url) {
    tabURL = url;
    getAllCookies(
      {
        url: tabURL,
      },
      function (cks) {
        createTable({
          url: tabURL,
          cks: cks,
        });
      },
    );
  }

  function createTable(message) {
    tabURL = message.url;
    cookieList = message.cks;

    let $tableBody = $('#cookieTable > tbody');
    $tableBody.empty();

    for (var i = 0; i < cookieList.length; i++) {
      let currentC = cookieList[i];

      var domainDisabled = currentC.hostOnly ? 'disabled' : '';
      var expirationDisabled = currentC.session ? 'disabled' : '';

      let $row = $('<tr/>');
      $row.append($('<td/>').addClass('hiddenColumn').text(i));
      $row.append($('<td/>').addClass('editable').text(currentC.name));
      $row.append($('<td/>').addClass('editable').text(currentC.value));
      $row.append(
        $('<td/>')
          .addClass('editable domain ' + domainDisabled)
          .text(currentC.domain),
      );
      $row.append($('<td/>').addClass('editable').text(currentC.path));
      let expDate;
      if (currentC.session) {
        expDate = new Date();
        expDate.setFullYear(expDate.getFullYear() + 1);
      } else {
        expDate = new Date(currentC.expirationDate * 1000.0);
      }
      $row.append(
        $('<td/>')
          .addClass('editable expiration ' + expirationDisabled)
          .text(expDate),
      );

      $row.append($('<td/>').append($('<input/>').attr('type', 'checkbox').addClass('sessionCB').prop('checked', currentC.session)));
      $row.append($('<td/>').append($('<input/>').attr('type', 'checkbox').addClass('hostOnlyCB').prop('checked', currentC.hostOnly)));
      $row.append($('<td/>').append($('<input/>').attr('type', 'checkbox').prop('checked', currentC.secure)));
      $row.append($('<td/>').append($('<input/>').attr('type', 'checkbox').prop('checked', currentC.httpOnly)));

      var $sameSite = $('<select/>');
      $sameSite.append($('<option/>').attr('value', 'no_restriction').attr('i18n', 'SameSite_None'));
      $sameSite.append($('<option/>').attr('value', 'lax').attr('i18n', 'SameSite_Lax'));
      $sameSite.append($('<option/>').attr('value', 'strict').attr('i18n', 'SameSite_Strict'));
      //todo: add SameSite "unspecified"
      $sameSite.val(currentC.sameSite);
      $row.append($('<td/>').append($sameSite));

      $row.append($('<td/>').addClass('hiddenColumn').text(currentC.name));
      $row.append($('<td/>').addClass('hiddenColumn').text(currentC.storeId));
      $tableBody.append($row);
    }

    localizePage();

    setEvents();
  }

  function setEvents() {
    $('.sessionCB').click(function () {
      var checked = $(this).prop('checked');
      var $domain = $('.expiration', $(this).parent().parent()).first();
      if (!!checked) $domain.addClass('disabled');
      else $domain.removeClass('disabled');
    });

    $('.hostOnlyCB').click(function () {
      var checked = $(this).prop('checked');
      var $domain = $('.domain', $(this).parent().parent()).first();
      if (!!checked) $domain.addClass('disabled');
      else $domain.removeClass('disabled');
    });

    $(':checkbox').click(function () {
      updateCookie.call($(this).parent().first());
    });

    $('#cookieTable').tablesorter({
      // sort on the first column and third column in ascending order
      sortList: [[1, 0]],
      widgets: ['resizable'],
      widgetOptions: {
        resizable: false,
      },
    });

    $('.editable').editable(
      function (newValue, settings) {
        updateCookie.call(this);
        return newValue;
      },
      {
        type: 'textarea',
        onblur: 'submit',
      },
    );
  }

  function updateCookie() {
    let $row = $(this).parent();
    let $cols = $row.children();

    var isForm = function (element) {
      return $('textarea', element).length;
    };
    var isCheckbox = function (element) {
      return $('input', element).length;
    };
    var isSelect = function (element) {
      return $('select', element).length;
    };
    var getValue = function (column, container) {
      let element = container[column];
      if (isCheckbox(element)) {
        return $(element).children(0).prop('checked');
      } else if (isForm(element)) {
        return $('textarea', element).first().val();
      } else if (isSelect(element)) {
        return $('select', element).val();
      } else {
        return $(element).text();
      }
    };

    var id = getValue(0, $cols);
    var name = getValue(1, $cols);
    var value = getValue(2, $cols);
    var domain = getValue(3, $cols);
    var path = getValue(4, $cols);
    var expiration = getValue(5, $cols);
    var session = getValue(6, $cols);
    var hostOnly = getValue(7, $cols);
    var secure = getValue(8, $cols);
    var httpOnly = getValue(9, $cols);
    var sameSite = getValue(10, $cols);
    var origName = getValue(11, $cols);
    var storeId = getValue(12, $cols);
    var originalCookie = cookieList[Number(id)];

    const newCookie = {};
    newCookie.url = buildUrl(domain, path, tabURL);
    newCookie.name = name.replace(';', '').replace(',', '');
    value = value.replace(';', '');
    newCookie.value = value;
    newCookie.path = path;
    newCookie.storeId = storeId;
    if (!hostOnly) newCookie.domain = domain;
    if (!session) {
      var expirationDate = new Date(expiration).getTime() / 1000.0;
      newCookie.expirationDate = expirationDate;
    }
    newCookie.secure = secure;
    newCookie.httpOnly = httpOnly;
    newCookie.sameSite = sameSite;

    const partitionKey = clonePartitionKey(originalCookie?.partitionKey);
    if (partitionKey !== undefined) newCookie.partitionKey = partitionKey;

    backgroundPageConnection.postMessage({
      action: 'submitCookie',
      cookie: newCookie,
      origName: origName,
      originalCookie: originalCookie,
    });
  }
}
window.addEventListener('load', start);
