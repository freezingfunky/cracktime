// Update the extension badge icon color based on current field status
chrome.storage.session.onChanged.addListener((changes) => {
  if (changes.currentField) {
    const field = changes.currentField.newValue;
    if (!field) return;

    const colorMap: Record<string, string> = {
      green: "#2bff88",
      yellow: "#ffaa2b",
      red: "#ff3b3b",
    };

    chrome.action.setBadgeBackgroundColor({
      color: colorMap[field.color] ?? "#333",
    });
    chrome.action.setBadgeText({ text: field.grade });
  }
});

// Clear badge when tab changes
chrome.tabs.onActivated.addListener(() => {
  chrome.action.setBadgeText({ text: "" });
  chrome.storage.session.remove("currentField");
});
