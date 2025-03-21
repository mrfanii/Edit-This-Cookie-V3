const prefixLocaleStrings = 'editThis_';

function translate(messageID, args) {
  return chrome.i18n.getMessage(prefixLocaleStrings + messageID, args);
}

export function localizePage() {
  $('[i18n]:not(.i18n-replaced)').each(function () {
    $(this).html($(this).html() + translate($(this).attr('i18n'), $(this).attr('i18n_argument')));
    $(this).addClass('i18n-replaced');
  });
  $('[i18n_value]:not(.i18n-replaced)').each(function () {
    $(this).val(translate($(this).attr('i18n_value')));
    $(this).addClass('i18n-replaced');
  });
  $('[i18n_title]:not(.i18n-replaced)').each(function () {
    $(this).attr('title', translate($(this).attr('i18n_title')));
    $(this).addClass('i18n-replaced');
  });
  $('[i18n_placeholder]:not(.i18n-replaced)').each(function () {
    $(this).attr('placeholder', translate($(this).attr('i18n_placeholder')) + $(this).attr('placeholder'));
    $(this).addClass('i18n-replaced');
  });
  $('[i18n_alt]:not(.i18n-replaced)').each(function () {
    $(this).attr('alt', translate($(this).attr('i18n_alt')));
    $(this).addClass('i18n-replaced');
  });
  $('[i18n_replacement_el]:not(.i18n-replaced)').each(function () {
    var dummy_link = $('a', this);
    var text = dummy_link.text();
    var real_el = $('#' + $(this).attr('i18n_replacement_el'));
    real_el.text(text).val(text).replaceAll(dummy_link);
    $(this).addClass('i18n-replaced');
  });
}
