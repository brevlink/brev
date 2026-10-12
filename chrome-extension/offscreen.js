chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (sender.id !== chrome.runtime.id || message.target !== 'offscreen' || message.type !== 'copy') return;
  // A hidden document cannot rely on navigator.clipboard focus requirements.
  // execCommand is kept only in this document for the CLIPBOARD offscreen reason.
  try {
    const field = document.getElementById('clipboard');
    field.value = message.text;
    field.focus();
    field.select();
    if (!document.execCommand('copy')) throw new Error('Clipboard write failed.');
    field.value = '';
    sendResponse({ok: true});
  } catch (error) { sendResponse({ok: false, message: error.message}); }
});
