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
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab?.id) {
      await chrome.tabs.sendMessage(tab.id, {
        action: 'showError',
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

// オプションページを更新する関数
async function refreshOptionsPage() {
  try {
    const optionsUrl = chrome.runtime.getURL('options.html');
    const tabs = await chrome.tabs.query({ url: optionsUrl });

    if (tabs.length > 0) {
      console.log('Refreshing options page...');
      await chrome.tabs.reload(tabs[0].id);
      console.log('Options page refreshed successfully');
    } else {
      console.log('Options page not found');
    }
  } catch (error) {
    console.error('Failed to refresh options page:', error);
  }
}

// メッセージリスナーの追加
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('Received message in background script:', message);

  if (message.action === 'refreshOptionsPage') {
    // まずオプションページをチェック
    chrome.tabs.query({url: chrome.runtime.getURL('options.html')}, optionsTabs => {
      if (optionsTabs.length > 0) {
        // オプションページが開いている場合はメッセージを送信
        chrome.tabs.sendMessage(optionsTabs[0].id, {
          action: 'refreshOptionsPage'
        }, response => {
          if (chrome.runtime.lastError) {
            console.log('Error sending message to options page:', chrome.runtime.lastError);
            // 次に履歴ページをチェック
            checkHistoryPage(sendResponse);
          } else {
            sendResponse({success: true, target: 'options'});
          }
        });
      } else {
        // オプションページが開いていない場合は履歴ページをチェック
        checkHistoryPage(sendResponse);
      }
    });
    return true; // 非同期レスポンスのために true を返す
  }
});

// 履歴ページをチェックして通知する
function checkHistoryPage(sendResponse) {
  chrome.tabs.query({url: chrome.runtime.getURL('history.html')}, historyTabs => {
    if (historyTabs.length > 0) {
      // 履歴ページが開いている場合はメッセージを送信
      chrome.tabs.sendMessage(historyTabs[0].id, {
        action: 'refreshHistoryPage'
      }, response => {
        if (chrome.runtime.lastError) {
          console.log('Error sending message to history page:', chrome.runtime.lastError);
          sendResponse({success: false, error: 'No active pages found'});
        } else {
          sendResponse({success: true, target: 'history'});
        }
      });
    } else {
      // どちらのページも開いていない場合
      sendResponse({success: false, error: 'No active pages found'});
    }
  });
}

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
      await chrome.tabs.sendMessage(tab.id, {
        action: "playAudio",
        url: audioUrl,
        text: info.selectionText
      });

    } catch (error) {
      await showErrorMessage(`エラーが発生しました: ${error.message}`);
    }
  }
});