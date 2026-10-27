import '/lib/jquery-4.0.0.min.js';
import '/lib/jquery-ui-1.14.2.min.js';
import '/lib/uniform/jquery.uniform.js';

import { startData } from '/js/data.js';
import {
  buildCookieUrl,
  buildUrl,
  clonePartitionKey,
  cookiesHaveSameIdentity,
  deleteAll,
  deleteCookie,
  Filter,
  cookieForCreationFromFullCookie,
  cookiesToStringGenerator,
  getAllCookies,
} from '/js/cookie_helpers.js';
import {
  getHost,
  addBlockRule,
  switchReadOnlyRule,
  _getMessage,
  filterMatchesCookie,
  getUrlVars,
  copyToClipboard,
  setLoaderVisible,
  downloadCookies,
} from '/js/utils.js';
import { customI18n } from '/lib/custom_i18n.js';
import { applyTheme } from '/js/theme.js';
import { localizePage } from '../lib/i18n_translator.js';
import { buildBlockRule, cookieMatchesSearch, parseCookieImport, readCookieImportFile } from '/js/popup_helpers.js';

async function start() {
  const { data, preferences } = await startData();
  applyTheme(preferences.theme);
  chrome.i18n = await customI18n(data, preferences);
  localizePage();
  const cookiesToString = cookiesToStringGenerator(data, preferences);
  var currentTabID;
  var isTabIncognito = false;
  var cookieList = [];
  var newCookie = false;
  var pasteCookie = false;
  var currentLayout = 'none';
  var lastInput = '';
  var latestListRequestId = 0;
  var domainSearchTimer;

  const exportIcon = $('i', '#exportButton');
  exportIcon.removeClass('fa-copy fa-download');
  exportIcon.addClass(preferences.exportCookiesAction === 'copy' ? 'fa-copy' : 'fa-download');

  $.fx.speeds._default = 200;

  jQuery(document).ready(function () {
    ++data.nPopupClicked;
    start();

    let body = $('body').css('display', 'none');
    setTimeout(() => {
      body.css('display', '');
    }, 100);
  });

  function start() {
    setLoaderVisible(true);
    const urlVars = getUrlVars();
    if (urlVars.url) {
      const url = decodeURIComponent(urlVars.url);
      currentTabID = parseInt(decodeURIComponent(urlVars.id));
      isTabIncognito = decodeURIComponent(urlVars.incognito) === 'true';
      $('input', '#cookieSearchCondition').val(url);
      document.title = document.title + '-' + url;
      doSearch(true);
    } else {
      chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
        const currentTabURL = tabs[0].url;
        currentTabID = tabs[0].id;
        $('input', '#cookieSearchCondition').val(currentTabURL);
        document.title = document.title + '-' + currentTabURL;
        doSearch(false);
      });
    }
  }

  function getUrlOfCookies() {
    return $('input', '#cookieSearchCondition').val();
  }

  function doSearch(isSeparateWindow) {
    const requestId = ++latestListRequestId;
    var url = $('input', '#cookieSearchCondition').val();
    if (url.length < 3) return;
    var filter = new Filter();
    if (/^https?:\/\/.+$/.test(url)) {
      filter.setUrl(url);
    } else {
      filter.setDomain(url);
    }
    createList(filter.getFilter(), isSeparateWindow, requestId);
  }

  function submit(currentTabID) {
    if (newCookie) submitNew(currentTabID);
    else if (pasteCookie) importCookies();
    else submitAll(currentTabID);
  }

  function submitAll(currentTabID) {
    var cookies = $('.cookie', '#cookiesList');
    var nCookiesToUpdate = cookies.length;

    var onUpdateComplete = function () {
      data.nCookiesChanged += cookies.length;
      if (preferences.refreshAfterSubmit) {
        chrome.tabs.reload(currentTabID, { bypassCache: preferences.skipCacheRefresh });
      }
      doSearch();
    };

    cookies.each(function () {
      const originalCookie = cookieList[Number($('.index', this).val())];
      var cCookie = formCookieData($(this));

      if (cCookie === undefined) {
        return;
      }

      const originalUrl = originalCookie ? buildCookieUrl(originalCookie) : cCookie.url;
      const originalName = originalCookie?.name ?? cCookie.name;
      const originalStoreId = originalCookie?.storeId ?? cCookie.storeId;
      const originalPartitionKey = originalCookie?.partitionKey ?? cCookie.partitionKey;

      deleteCookie(originalUrl, originalName, originalStoreId, originalPartitionKey, function () {
        chrome.cookies.set(cCookie, function () {
          if (--nCookiesToUpdate === 0) {
            onUpdateComplete();
          }
        });
      });
    });
  }

  function submitNew() {
    var cCookie = formCookieData($('#newCookie'));
    if (cCookie === undefined) return;

    chrome.cookies.getAllCookieStores(function (cookieStores) {
      for (let x = 0; x < cookieStores.length; x++) {
        if (cookieStores[x].tabIds.indexOf(currentTabID) != -1) {
          cCookie.storeId = cookieStores[x].id;
          break;
        }
      }

      deleteCookie(cCookie.url, cCookie.name, cCookie.storeId, function () {
        chrome.cookies.set(cCookie, function (createdCookie) {
          if (chrome.runtime.lastError || createdCookie === null) return;

          newCookie = false;
          ++data.nCookiesCreated;
          doSearch();
        });
      });
    });
  }

  function createList(filters, isSeparateWindow, requestId) {
    var filteredCookies = [];

    if (filters === null) filters = {};

    var filterURL = {};
    if (filters.url !== undefined) filterURL.url = filters.url;
    if (filters.domain !== undefined) filterURL.domain = filters.domain;

    if (!isSeparateWindow) {
      $('#submitDiv').css({
        bottom: 0,
      });
    } else {
      $('#submitDiv').addClass('submitDivSepWindow');
    }

    chrome.cookies.getAllCookieStores(function (cookieStores) {
      if (requestId !== latestListRequestId) return;

      for (let x = 0; x < cookieStores.length; x++) {
        if (cookieStores[x].tabIds.indexOf(currentTabID) != -1) {
          filterURL.storeId = cookieStores[x].id;
          break;
        }
      }

      getAllCookies(filterURL, function (cks) {
        if (requestId !== latestListRequestId) return;

        var currentC;
        for (var i = 0; i < cks.length; i++) {
          currentC = cks[i];

          if (filters.name !== undefined && currentC.name.toLowerCase().indexOf(filters.name.toLowerCase()) === -1) continue;
          if (filters.domain !== undefined && currentC.domain.toLowerCase().indexOf(filters.domain.toLowerCase()) === -1) continue;
          if (filters.secure !== undefined && String(currentC.secure).toLowerCase() !== String(filters.secure).toLowerCase()) continue;
          if (filters.session !== undefined && String(currentC.session).toLowerCase() !== String(filters.session).toLowerCase()) continue;

          for (var x = 0; x < data.readOnly.length; x++) {
            try {
              var lock = data.readOnly[x];
              if (cookiesHaveSameIdentity(lock, currentC)) {
                currentC.isProtected = true;
                break;
              }
            } catch (e) {
              console.error(e.message);
              delete data.readOnly[x];
            }
          }
          filteredCookies.push(currentC);
        }
        cookieList = filteredCookies;

        $('#cookiesList').empty();

        if (cookieList.length === 0) {
          swithLayout();
          setEvents();
          setLoaderVisible(false);
          return;
        }

        cookieList.sort(function (a, b) {
          if (preferences.sortCookiesType === 'domain_alpha') {
            var compDomain = a.domain.toLowerCase().localeCompare(b.domain.toLowerCase());
            if (compDomain) return compDomain;
          }
          return a.name.toLowerCase().localeCompare(b.name.toLowerCase());
        });

        createAccordionList(cookieList, function () {
          swithLayout();
          setEvents();
          $('input:checkbox').uniform();
          setLoaderVisible(false);
        });
      });
    });
  }

  function createAccordionList(cks, callback, callbackArguments) {
    let createAccordionCallback = callback;
    let createAccordionCallbackArguments = callbackArguments;

    try {
      $('#cookiesList').accordion();
      $('#cookiesList').accordion('destroy');
    } catch (e) {
      console.warn(e.message);
    }

    if (cks === null) cks = cookieList;
    for (var i = 0; i < cks.length; i++) {
      const currentC = cks[i];

      var domainText = '';
      if (preferences.showDomain) {
        domainText = currentC.domain;
        if (preferences.showDomainBeforeName) {
          domainText = domainText + ' | ';
        } else {
          domainText = ' | ' + domainText;
        }
      }

      const nameElement = $('<b/>').text(currentC.name).toggleClass('cookie-protected-title', !!currentC.isProtected);
      var titleText;
      if (preferences.showDomainBeforeName) {
        titleText = $('<p/>').text(domainText).append(nameElement);
      } else {
        titleText = $('<p/>').append(nameElement).append($('<span/>').text(domainText));
      }

      var titleElement = $('<h3/>').append($('<a/>').html(titleText.html()).attr('href', '#'));

      var cookie = $('.cookie_details_template').clone().removeClass('cookie_details_template');

      $('.index', cookie).val(i);
      $('.name', cookie).val(currentC.name);
      $('.value', cookie).val(currentC.value);
      $('.domain', cookie).val(currentC.domain);
      $('.path', cookie).val(currentC.path);
      $('.storeId', cookie).val(currentC.storeId);
      $('.sameSite', cookie).val(currentC.sameSite);

      if (currentC.isProtected) $('.unprotected', cookie).hide();
      else $('.protected', cookie).hide();

      if (currentC.hostOnly) {
        $('.domain', cookie).attr('disabled', 'disabled');
        $('.hostOnly', cookie).prop('checked', true);
      }
      if (currentC.secure) {
        $('.secure', cookie).prop('checked', true);
      }
      if (currentC.httpOnly) {
        $('.httpOnly', cookie).prop('checked', true);
      }
      if (currentC.session) {
        $('.expiration', cookie).attr('disabled', 'disabled');
        $('.session', cookie).prop('checked', true);
      }

      var expDate;
      if (currentC.session) {
        expDate = new Date();
        expDate.setFullYear(expDate.getFullYear() + 1);
      } else {
        expDate = new Date(currentC.expirationDate * 1000.0);
      }
      $('.expiration', cookie).val(expDate);

      $('#cookiesList').append(titleElement);
      $('#cookiesList').append(cookie);
    }

    $('#cookiesList').accordion({
      autoHeight: false,
      heightStyle: 'content',
      collapsible: true,
      active: cks.length - 1,
      create: function (event, ui) {
        $.uniform.update();
        if (createAccordionCallback !== undefined) createAccordionCallback(createAccordionCallbackArguments);
      },
    });
  }

  async function importCookies() {
    var nCookiesImportedThisTime = 0;
    var text = $('.value', '#pasteCookie').val();
    var error = $('.error', '#pasteCookie');
    error.hide();
    error.text('JSON · Netscape · name=value · Perl::LWP');
    error.html(
      error.html() +
        "<br> Also check&nbsp;<a href='http://developer.chrome.com/extensions/cookies.html#type-Cookie' target='_blank'>Developer Chrome Cookie</a><br>Error:",
    );

    try {
      const { cookies: importedCookies } = parseCookieImport(text, getUrlOfCookies());
      for (const [index, importCookie] of importedCookies.entries()) {
        try {
          const cookie = cookieForCreationFromFullCookie(importCookie);
          await chrome.cookies.set(cookie);
          nCookiesImportedThisTime++;
        } catch (e) {
          error.html(
            error.html() +
              '<br>' +
              $('<div/>')
                .text('Cookie number ' + (index + 1))
                .html() +
              '<br>' +
              $('<div/>').text(e.message).html(),
          );
          console.error(e.message);
          error.fadeIn();
          return;
        }
      }
    } catch (e) {
      error.html(error.html() + '<br>' + $('<div/>').text(e.message).html());
      console.error(e.message);
      error.fadeIn();
      return;
    }

    data.nCookiesImported += nCookiesImportedThisTime;
    doSearch();
    return;
  }

  function setEvents() {
    $('#submitButton:first-child')
      .unbind()
      .click(function () {
        submit(currentTabID);
      });
    if (cookieList.length > 0) {
      $('#submitDiv').show();
    }
    $('#submitFiltersButton').button();

    $('#submitFiltersButton')
      .off('click.submitFilters')
      .on('click.submitFilters', function (event) {
        event.preventDefault();
        event.stopPropagation();

        const filterForm = $('#cookieFilter');
        const newRule = buildBlockRule({
          domainChecked: $('.filterDomain:checked', filterForm).length > 0,
          domain: $('#filterByDomain', filterForm).text(),
          nameChecked: $('.filterName:checked', filterForm).length > 0,
          name: $('#filterByName', filterForm).text(),
          valueChecked: $('.filterValue:checked', filterForm).length > 0,
          value: $('#filterByValue', filterForm).text(),
        });

        if (newRule === null) return false;

        var flaggedCookies = 0;
        for (var i = 0; i < cookieList.length; i++) {
          var currentCookie = cookieList[i];
          if (currentCookie.isProtected) continue;
          if (!filterMatchesCookie(newRule, currentCookie.name, currentCookie.domain, currentCookie.value)) continue;

          var url = buildUrl(currentCookie.domain, currentCookie.path, getUrlOfCookies());
          deleteCookie(url, currentCookie.name, currentCookie.storeId, currentCookie.partitionKey);
          flaggedCookies++;
        }
        data.nCookiesFlagged += flaggedCookies;
        addBlockRule(data, newRule);

        doSearch();
        return false;
      });

    $('#deleteAllButton')
      .unbind()
      .click(function () {
        if (cookieList.length === 0) return false;

        var okFunction = function () {
          const nCookiesDeletedThisTime = cookieList.length;
          deleteAll(cookieList, getUrlOfCookies());
          data.nCookiesDeleted += nCookiesDeletedThisTime;
          doSearch();
        };
        startAlertDialog(_getMessage('Alert_deleteAll'), okFunction);
      });

    if (preferences.showCommandsLabels) {
      $('.commands-row', '.commands-table').addClass('commands-row-texy');
    }

    if (preferences.showFlagAndDeleteAll) {
      $('#flagAllButton').show();
      $('#flagAllButton')
        .unbind()
        .click(function () {
          if (cookieList.length === 0) return false;
          var okFunction = function () {
            const nCookiesFlaggedThisTime = cookieList.length;
            for (var i = 0; i < cookieList.length; i++) {
              var currentCookie = cookieList[i];
              if (currentCookie.isProtected) continue;
              var newRule = {};
              newRule.domain = currentCookie.domain;
              newRule.name = currentCookie.name;
              addBlockRule(data, newRule);
              var url = buildUrl(currentCookie.domain, currentCookie.path, getUrlOfCookies());
              deleteCookie(url, currentCookie.name, currentCookie.storeId, currentCookie.partitionKey);
            }
            data.nCookiesFlagged += nCookiesFlaggedThisTime;
            doSearch();
            return;
          };
          startAlertDialog(_getMessage('flagAll'), okFunction);
        });
    } else {
      $('#flagAllButton').hide();
    }

    $('#refreshButton')
      .unbind()
      .click(function () {
        if (currentLayout === 'new') {
          clearNewCookieData();
        } else {
          location.reload(true);
        }
      });

    $('#addCookieButton')
      .unbind()
      .click(function () {
        newCookie = true;
        pasteCookie = false;
        swithLayout('new');
      });

    $('#backToList')
      .unbind()
      .click(function () {
        newCookie = false;
        pasteCookie = false;
        swithLayout();
      });

    $('#optionsButton')
      .unbind()
      .click(function () {
        var urlToOpen = chrome.runtime.getURL('options_main_page.html');
        chrome.tabs.create({
          url: urlToOpen,
        });
      });

    $('#exportButton')
      .unbind()
      .click(function () {
        const exportedCookies = cookiesToString.get(cookieList);
        if (exportedCookies === undefined) return;

        if (preferences.exportCookiesAction === 'copy') {
          copyToClipboard(exportedCookies);
          $('#copiedToast').fadeIn(function () {
            setTimeout(function () {
              $('#copiedToast').fadeOut();
            }, 2500);
          });
        } else {
          downloadCookies(exportedCookies, getUrlOfCookies(), preferences.copyCookiesType);
        }

        data.nCookiesExported += cookieList.length;
        const rootStyle = getComputedStyle(document.documentElement);
        const feedbackColor = rootStyle.getPropertyValue('--success-soft').trim();
        const restingColor = rootStyle.getPropertyValue('--command-surface').trim();
        $(this)
          .stop(true, true)
          .animate({ backgroundColor: feedbackColor }, 300, function () {
            $(this).animate({ backgroundColor: restingColor }, 500);
          });
      });
    $('#pasteButton')
      .unbind()
      .click(function () {
        newCookie = false;
        pasteCookie = true;
        swithLayout('paste');
      });

    $('#importFileInput')
      .off('change.importFile')
      .on('change.importFile', async function () {
        const [file] = this.files;
        if (file === undefined) return;

        const error = $('.error', '#pasteCookie');
        try {
          const text = await readCookieImportFile(file);
          $('.value', '#pasteCookie').val(text).focus();
          $('#importFileName').text(file.name);
          error.empty().hide();
        } catch (readError) {
          error.text(readError.message).show();
        } finally {
          $(this).val('');
        }
      });

    $('.value', '#pasteCookie')
      .off('input.importFileName')
      .on('input.importFileName', function () {
        $('#importFileName').empty();
      });

    $('#searchButton')
      .unbind()
      .click(function () {
        $('#searchBox')
          .stop(true, true)
          .fadeIn('normal', function () {
            $('#searchField').focus();
          });
      });

    $('#searchBox')
      .unbind()
      .focusout(function (event) {
        if (event.relatedTarget && $.contains(this, event.relatedTarget)) return;
        $('#searchBox').fadeOut();
      });

    $('#searchField')
      .unbind()
      .on('input', function () {
        find($(this).val());
      })
      .on('keydown', function (event) {
        if (event.key !== 'Escape') return;
        $(this).val('');
        find('');
        $('#searchBox').fadeOut();
      });
    $('input', '#cookieSearchCondition')
      .unbind()
      .on('input', function () {
        clearTimeout(domainSearchTimer);
        domainSearchTimer = setTimeout(function () {
          doSearch();
        }, 250);
      })
      .on('keydown', function (event) {
        if (event.key !== 'Enter') return;
        clearTimeout(domainSearchTimer);
        doSearch();
      });
    clearNewCookieData();

    $('.toast').each(function () {
      $(this).css('margin-top', '-' + $(this).height() / 2 + 'px');
      $(this).css('margin-left', '-' + $(this).width() / 2 + 'px');
    });

    $('textarea.value, input.name, input.domain, input.path').keydown(function (event) {
      if (event.ctrlKey && event.keyCode === 13) {
        submit(currentTabID);
        event.preventDefault();
        event.stopPropagation();
      }
    });

    setCookieEvents();
  }

  function setCookieEvents() {
    $('.hostOnly').click(function () {
      var cookie = $(this).closest('.cookie');
      var checked = $(this).prop('checked');
      if (!!checked) $('.domain', cookie).attr('disabled', 'disabled');
      else $('.domain', cookie).removeAttr('disabled');
    });

    $('.session').click(function () {
      var cookie = $(this).closest('.cookie');
      var checked = $(this).prop('checked');
      if (!!checked) $('.expiration', cookie).attr('disabled', 'disabled');
      else $('.expiration', cookie).removeAttr('disabled');
    });

    $('.deleteOne').click(function () {
      var cookie = $(this).closest('.cookie');
      var name = $('.name', cookie).val();
      var domain = $('.domain', cookie).val();
      var path = $('.path', cookie).val();
      var storeId = $('.storeId', cookie).val();
      var index = Number($('.index', cookie).val());
      var originalCookie = cookieList[index];
      var okFunction = function () {
        var url = originalCookie ? buildCookieUrl(originalCookie) : buildUrl(domain, path, getUrlOfCookies());
        var originalName = originalCookie?.name ?? name;
        var originalStoreId = originalCookie?.storeId ?? storeId;
        var partitionKey = originalCookie?.partitionKey;
        deleteCookie(url, originalName, originalStoreId, partitionKey, function (success) {
          if (success === true) {
            var head = cookie.prev('h3');
            cookie.add(head).slideUp(function () {
              $(this).remove();
              swithLayout();
            });
          } else {
            location.reload(true);
          }
        });
        ++data.nCookiesDeleted;
      };
      startAlertDialog(_getMessage('Alert_deleteCookie') + ': "' + name + '"?', okFunction);
    });
    $('.flagOne').click(function () {
      var cookie = $(this).closest('.cookie');
      var domain = $('.domain', cookie).val();
      var name = $('.name', cookie).val();
      var value = $('.value', cookie).val();

      $('#filterByDomain', '#cookieFilter').text(domain);
      $('#filterByName', '#cookieFilter').text(name);
      $('#filterByValue', '#cookieFilter').text(value);

      swithLayout('flag');
    });

    $('.protectOne').click(function () {
      var cookie = $(this).closest('.cookie');
      var titleName = $('b', cookie.prev()).first();
      var index = $('.index', cookie).val();
      const isProtected = switchReadOnlyRule(data, cookieList[index]);

      cookieList[index].isProtected = isProtected;
      if (isProtected) {
        $('.unprotected', cookie).fadeOut('fast', function () {
          $('.protected', cookie).fadeIn('fast');
        });
        titleName.addClass('cookie-protected-title');
      } else {
        $('.protected', cookie).fadeOut('fast', function () {
          $('.unprotected', cookie).fadeIn('fast');
        });
        titleName.removeClass('cookie-protected-title');
      }
    });
  }

  function startAlertDialog(title, ok_callback, cancel_callback) {
    if (ok_callback == undefined) {
      return;
    }
    if (!preferences.showAlerts) {
      ok_callback();
      return;
    }

    $('#alert_ok')
      .unbind()
      .click(function () {
        $('#alert_wrapper').hide();
        ok_callback();
      });

    $('#alert_cancel')
      .unbind()
      .click(function () {
        $('#alert_wrapper').hide('fade');
      });
    $('#alert_title_p').empty().text(title);
    $('#alert_wrapper').show('fade');
  }

  function clearNewCookieData() {
    var cookieForm = $('#newCookie');
    $('.index', cookieForm).val('');
    $('.name', cookieForm).val('');
    $('.value', cookieForm).val('');
    $('.domain', cookieForm).val(getHost(getUrlOfCookies()));
    $('.hostOnly', cookieForm).prop('checked', false);
    $('.path', cookieForm).val('/');
    $('.secure', cookieForm).prop('checked', true);
    $('.httpOnly', cookieForm).prop('checked', false);
    $('.session', cookieForm).prop('checked', false);

    var expDate = new Date();
    expDate.setFullYear(expDate.getFullYear() + 1);
    $('.expiration', cookieForm).val(expDate);

    $.uniform.update();
  }

  function find(pattern) {
    if (pattern === lastInput) return;

    lastInput = pattern;
    const cookiesAccordion = $('#cookiesList');
    const headers = cookiesAccordion.children('h3');
    const hasPattern = pattern.trim() !== '';
    let firstMatchIndex = null;

    if (headers.length === 0) return;

    cookiesAccordion.accordion('option', 'collapsible', true);
    cookiesAccordion.accordion('option', 'active', false);

    headers.each(function (index) {
      const header = $(this);
      const cookie = header.next('.cookie');
      const matches = cookieMatchesSearch(
        {
          name: $('.name', cookie).val(),
          domain: $('.domain', cookie).val(),
          value: $('.value', cookie).val(),
        },
        pattern,
      );

      header.toggle(matches);
      header.toggleClass('searchResult', hasPattern && matches);
      cookie.hide();
      if (matches && firstMatchIndex === null) firstMatchIndex = index;
    });

    cookiesAccordion.accordion('refresh');
    if (hasPattern && firstMatchIndex !== null) {
      cookiesAccordion.accordion('option', 'active', firstMatchIndex);
    }
  }

  function swithLayout(newLayout) {
    if (newLayout === undefined) {
      if ($('h3', '#cookiesList').length) {
        newLayout = 'list';
      } else {
        newLayout = 'empty';
      }
    }

    if (currentLayout === newLayout) return;
    currentLayout = newLayout;

    if (newLayout === 'list' || newLayout === 'empty') {
      $('#newCookie').slideUp();
      $('#pasteCookie').slideUp();
      $('#cookieFilter').slideUp();
      $('#submitFiltersButton').slideUp();
    }

    if (newLayout === 'list') {
      $('.commands-table')
        .first()
        .animate({ opacity: 0 }, function () {
          $('#deleteAllButton').show();
          if (preferences.showFlagAndDeleteAll) $('#flagAllButton').show();
          $('#addCookieButton').show();
          $('#backToList').hide();
          $('#exportButton').show();
          $('#pasteButton').show();
          $('#searchButton').show();
          $('.commands-table').first().animate({ opacity: 1 });
          $('#cookieSearchCondition').show();
        });
      $('#noCookies').slideUp();
      $('#cookiesList').slideDown();
      $('#submitDiv').show();
    } else if (newLayout === 'empty') {
      $('.commands-table')
        .first()
        .animate({ opacity: 0 }, function () {
          $('#deleteAllButton').hide();
          $('#flagAllButton').hide();
          $('#addCookieButton').show();
          $('#backToList').hide();
          $('#exportButton').hide();
          $('#pasteButton').show();
          $('#searchButton').hide();
          $('.commands-table').first().animate({ opacity: 1 });
          $('#cookieSearchCondition').show();
        });
      $('.notOnEmpty').hide();
      $('#noCookies').slideDown();
      $('#cookiesList').slideUp();
      $('#submitDiv').hide();
    } else {
      $('.commands-table')
        .first()
        .animate({ opacity: 0 }, function () {
          $('#deleteAllButton').hide();
          $('#flagAllButton').hide();
          $('#addCookieButton').hide();
          $('#backToList').show();
          $('#exportButton').hide();
          $('#pasteButton').hide();
          $('#searchButton').hide();
          $('.commands-table').first().animate({ opacity: 1 });
        });

      $('#noCookies').slideUp();
      $('#cookiesList').slideUp();
      $('#cookieSearchCondition').slideUp();

      if (newLayout === 'flag') {
        $('#submitFiltersButton').slideDown();
        $('#cookieFilter').slideDown();
        $('#newCookie').slideUp();
        $('#pasteCookie').slideUp();
        $('#submitDiv').slideUp();
      } else if (newLayout === 'paste') {
        $('#pasteCookie').slideDown();
        $('#newCookie').slideUp();
        $('#cookieFilter').slideUp();
        $('#submitFiltersButton').slideUp();
        $('#submitDiv').slideDown();
        $('.value', '#new').focus();
      } else if (newLayout === 'new') {
        $('#newCookie').slideDown();
        $('#pasteCookie').slideUp();
        $('#cookieFilter').slideUp();
        $('#submitFiltersButton').slideUp();
        $('#submitDiv').slideDown();
        $('#newCookie input.name').focus();
      }
    }
  }

  function formCookieData(form) {
    var index = $('.index', form).val();
    var originalCookie = index !== undefined && index !== '' ? cookieList[Number(index)] : undefined;
    var name = $('.name', form).val();
    var value = $('.value', form).val();
    var domain = $('.domain', form).val();
    var hostOnly = $('.hostOnly', form).prop('checked');
    var path = $('.path', form).val();
    var secure = $('.secure', form).prop('checked');
    var httpOnly = $('.httpOnly', form).prop('checked');
    var session = $('.session', form).prop('checked');
    var storeId = $('.storeId', form).val();
    var expiration = $('.expiration', form).val();
    var sameSite = $('.sameSite', form).val();

    var newCookie = {};
    newCookie.url = buildUrl(domain, path, getUrlOfCookies());
    newCookie.name = name.replace(';', '').replace(',', '');
    value = value.replace(';', '');
    newCookie.value = value;
    newCookie.path = path;
    newCookie.storeId = storeId;
    if (!hostOnly) newCookie.domain = domain;
    if (!session) {
      var expirationDate = new Date(expiration).getTime() / 1000;
      newCookie.expirationDate = expirationDate;

      // If the expiration date is not valid, tell the user by making the
      // invalid date red and showing it in the accordion
      if (isNaN(expirationDate)) {
        $('.expiration', form).addClass('error');
        $('.expiration', form).focus();
        if (index !== undefined) {
          // This is an existing cookie, not a new one
          $('#cookiesList').accordion('option', 'active', parseInt(index));
        }
        return;
      } else {
        $('.expiration', form).removeClass('error');
      }
    }

    if (sameSite === 'no_restriction' && !secure) {
      $('#error-message').text(_getMessage('Error_No_Restriction'));
      $('#error-message').show();
      return;
    } else {
      $('#error-message').hide();
    }

    newCookie.secure = secure;
    newCookie.httpOnly = httpOnly;
    newCookie.sameSite = sameSite;

    const partitionKey = clonePartitionKey(originalCookie?.partitionKey);
    if (partitionKey !== undefined) newCookie.partitionKey = partitionKey;

    return newCookie;
  }
}
window.addEventListener('load', start);
