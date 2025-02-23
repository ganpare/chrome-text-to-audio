document.addEventListener('DOMContentLoaded', async () => {
  // Load saved API key
  const result = await chrome.storage.sync.get('falApiKey');
  if (result.falApiKey) {
    document.getElementById('apiKey').value = result.falApiKey;
  }

  // Save API key when button is clicked
  document.getElementById('save').addEventListener('click', async () => {
    const apiKey = document.getElementById('apiKey').value.trim();
    const status = document.getElementById('status');

    if (!apiKey) {
      status.textContent = 'Error: API key cannot be empty';
      status.className = 'error';
      return;
    }

    try {
      await chrome.storage.sync.set({ falApiKey: apiKey });
      status.textContent = 'Settings saved successfully!';
      status.className = 'success';
    } catch (error) {
      status.textContent = 'Error saving settings';
      status.className = 'error';
    }
  });
});