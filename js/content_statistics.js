function reportURLChange() {
  chrome.runtime
    .sendMessage({
      type: 'url-change',
      hasTransition: !document.referrer,
    })
    .catch(() => {});
}
window.addEventListener('popstate', reportURLChange);
reportURLChange();
