// Function to get API key from storage
async function getFalApiKey() {
  try {
    const result = await chrome.storage.sync.get('falApiKey');
    return result.falApiKey || null;
  } catch (error) {
    console.error('Failed to retrieve API key:', error);
    return null;
  }
}

// Function to show error in the active tab
async function showErrorMessage(message) {
  try {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tabs[0]?.id) {
      await chrome.tabs.sendMessage(tabs[0].id, {
        action: "showError",
        error: message
      });
    }
  } catch (error) {
    console.error('Failed to show error message:', error);
  }
}

// Function to wait
const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Function to format URL for logging
function formatUrl(url) {
  try {
    const parsed = new URL(url);
    return `${parsed.protocol}//${parsed.host}${parsed.pathname}`;
  } catch (e) {
    return url;
  }
}

// Function to get result from response URL
async function getResponseResult(responseUrl, apiKey) {
  try {
    const response = await fetch(responseUrl, {
      method: 'GET',
      headers: {
        'Authorization': `Key ${apiKey}`,
        'Accept': 'application/json'
      }
    });

    if (!response.ok) {
      throw new Error(`Failed to get result: ${response.status} - ${await response.text()}`);
    }

    return await response.json();
  } catch (error) {
    console.error('Error in getResponseResult:', error);
    throw error;
  }
}

// Function to poll status until completion
async function pollStatus(statusUrl, responseUrl, apiKey, maxAttempts = 30) {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      const response = await fetch(statusUrl, {
        method: 'GET',
        headers: {
          'Authorization': `Key ${apiKey}`,
          'Accept': 'application/json'
        }
      });

      if (!response.ok) {
        throw new Error(`Status check failed: ${response.status} - ${await response.text()}`);
      }

      const status = await response.json();
      if (status.status === 'COMPLETED') {
        return await getResponseResult(responseUrl, apiKey);
      }
    } catch (error) {
      console.error('Error in pollStatus:', error);
      throw error;
    }

    await wait(1000);
  }

  throw new Error('Polling exceeded maximum attempts');
}

// コンテキストメニューの作成
function createContextMenu() {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: "kokoroTTS-read",
      title: "選択テキストをKokoroTTSで読み上げ",
      contexts: ["selection"]
    });
  });
}

// 拡張機能のインストール時とChrome起動時にメニューを作成
chrome.runtime.onInstalled.addListener(createContextMenu);
chrome.runtime.onStartup.addListener(createContextMenu);

// メッセージリスナーの追加
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'refreshOptionsPage') {
    // 非同期処理を即時実行関数で処理
    (async () => {
      try {
        const tabs = await chrome.tabs.query({ url: request.optionsUrl });
        if (tabs.length > 0) {
          await chrome.tabs.reload(tabs[0].id);
          sendResponse({ success: true });
        } else {
          sendResponse({ success: false, error: 'Options page not found' });
        }
      } catch (error) {
        console.error('Failed to refresh options page:', error);
        sendResponse({ success: false, error: error.message });
      }
    })();
    return true; // 非同期レスポンスを待つことを示す
  }
});

// コンテキストメニューのクリックイベント処理
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId === "kokoroTTS-read" && info.selectionText) {
    const apiKey = await getFalApiKey();
    if (!apiKey) {
      await showErrorMessage('APIキーが設定されていません。設定画面で入力してください。');
      chrome.runtime.openOptionsPage();
      return;
    }

    try {
      const apiUrl = 'https://queue.fal.run/fal-ai/kokoro/american-english';
      const requestBody = {
        prompt: info.selectionText,
        voice: "af_heart"
      };

      // APIにリクエストを送信
      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Key ${apiKey}`,
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify(requestBody)
      });

      if (!response.ok) {
        throw new Error(`API request failed: ${response.status} - ${await response.text()}`);
      }

      const queueResult = await response.json();
      if (!queueResult.status_url || !queueResult.response_url) {
        throw new Error('必要な情報が見つかりません');
      }

      // ステータスをポーリングし、結果を取得
      const result = await pollStatus(queueResult.status_url, queueResult.response_url, apiKey);

      // 音声URLを取得
      let audioUrl = result.audio_url || result.audio?.url || result.output?.url || result.result?.url;
      if (!audioUrl) {
        throw new Error('音声URLが見つかりません');
      }

      // タブの情報を取得
      try {
        const tabInfo = await chrome.tabs.get(tab.id);
        if (!tabInfo?.url?.startsWith('http')) {
          throw new Error('このページでは音声再生を実行できません');
        }
      } catch (error) {
        throw new Error('タブ情報の取得に失敗しました: ' + error.message);
      }

      // コンテンツスクリプトが読み込まれているかチェック
      try {
        await chrome.tabs.sendMessage(tab.id, { type: "PING" });
      } catch {
        await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          files: ['dbHelper.js', 'contentScript.js']
        });
        await wait(500);
      }

      // 音声再生を試行
      const responseMessage = await chrome.tabs.sendMessage(tab.id, {
        action: "playAudio",
        url: audioUrl,
        text: info.selectionText
      });

      if (responseMessage?.status !== "playing") {
        throw new Error('音声の再生に失敗しました');
      }
    } catch (error) {
      await showErrorMessage(`エラーが発生しました: ${error.message}`);
    }
  }
});
