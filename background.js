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

// Function to get voice type from storage
async function getVoiceType() {
  try {
    const result = await chrome.storage.sync.get('voiceType');
    return result.voiceType || 'af_heart'; // デフォルトは心の声
  } catch (error) {
    console.error('Failed to retrieve voice type:', error);
    return 'af_heart';
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

// オプションページまたは履歴ページを更新する関数
async function refreshOptionsPage() {
  try {
    const optionsUrl = chrome.runtime.getURL('options.html');
    const historyUrl = chrome.runtime.getURL('history.html');
    
    // options.htmlまたはhistory.htmlを開いているタブを検索
    const tabs = await chrome.tabs.query({ 
      url: [optionsUrl, historyUrl]
    });

    if (tabs.length > 0) {
      console.log('Active pages found, refreshing...');
      
      // すべての該当タブにメッセージを送信
      let successCount = 0;
      for (const tab of tabs) {
        try {
          // タブにメッセージを送信
          await chrome.tabs.sendMessage(tab.id, { 
            action: 'refreshOptionsPage',
            timestamp: Date.now()
          });
          successCount++;
        } catch (tabError) {
          console.warn(`Failed to send message to tab ${tab.id}:`, tabError);
        }
      }
      
      if (successCount > 0) {
        console.log(`Successfully sent refresh messages to ${successCount} tabs`);
        return { success: true, refreshedTabs: successCount };
      }
    }
    
    console.log('No active pages found that can be refreshed');
    return { success: false, error: 'No active pages found' };
  } catch (error) {
    console.error('Failed to refresh pages:', error);
    return { success: false, error: error.message };
  }
}

// メッセージリスナーの追加
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('Received message in background script:', message, 'from sender:', sender);

  if (message.action === 'refreshOptionsPage') {
    console.log('Processing refresh request, timestamp:', message.timestamp);
    
    // 即座に応答を返す（非同期処理が完了する前に）
    sendResponse({success: true, message: 'Refresh request received'});
    
    // 履歴ページとオプションページを非同期で更新
    setTimeout(async () => {
      try {
        // 少し遅延させて実行（データベース操作完了を待つ）
        await new Promise(resolve => setTimeout(resolve, 500));
        const results = await refreshAllActivePages(message);
        console.log('Page refresh results:', results);
      } catch (err) {
        console.error('Error refreshing pages:', err);
      }
    }, 0);
    
    return true; // 非同期レスポンスのために true を返す
  }
});

// すべてのアクティブなページを更新
async function refreshAllActivePages(message) {
  const optionsUrl = chrome.runtime.getURL('options.html');
  const historyUrl = chrome.runtime.getURL('history.html');
  const results = { options: false, history: false };
  
  try {
    // options.htmlとhistory.htmlを開いているタブを検索
    const tabs = await chrome.tabs.query({ 
      url: [optionsUrl + '*', historyUrl + '*']
    });
    
    console.log('Found active page tabs:', tabs.length);
    
    if (tabs.length === 0) {
      console.log('No active pages found');
      return results;
    }
    
    // すべての該当タブに更新メッセージを送信
    for (const tab of tabs) {
      try {
        console.log('Sending refresh message to tab:', tab.id, tab.url);
        
        const isOptionsPage = tab.url.includes('options.html');
        const action = isOptionsPage ? 'refreshOptionsPage' : 'refreshHistoryPage';
        
        await new Promise((resolve) => {
          chrome.tabs.sendMessage(tab.id, {
            action: action,
            timestamp: message.timestamp || Date.now(),
            force: message.force || false
          }, (response) => {
            const error = chrome.runtime.lastError;
            if (error) {
              console.warn(`Failed to send message to tab ${tab.id}:`, error);
              resolve(false);
            } else {
              console.log(`Successfully sent ${action} to tab ${tab.id}, response:`, response);
              results[isOptionsPage ? 'options' : 'history'] = true;
              resolve(true);
            }
          });
        });
      } catch (tabError) {
        console.warn(`Error processing tab ${tab.id}:`, tabError);
      }
    }
    
    return results;
  } catch (error) {
    console.error('Error in refreshAllActivePages:', error);
    throw error;
  }
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
      const voiceType = await getVoiceType();
      const apiUrl = 'https://queue.fal.run/fal-ai/kokoro/american-english';
      const requestBody = {
        prompt: info.selectionText,
        voice: voiceType
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

      // 音声再生を試行（voiceTypeも一緒に送信）
      await chrome.tabs.sendMessage(tab.id, {
        action: "playAudio",
        url: audioUrl,
        text: info.selectionText,
        voiceType: voiceType
      });

    } catch (error) {
      await showErrorMessage(`エラーが発生しました: ${error.message}`);
    }
  }
});

// キーボードショートカットのハンドラー
chrome.commands.onCommand.addListener(async (command) => {
  if (command === "read-selected-text") {
    try {
      // 現在のアクティブなタブを取得
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab) {
        console.error('アクティブなタブが見つかりません');
        return;
      }

      // タブのURLをチェック
      if (!tab.url?.startsWith('http')) {
        await showErrorMessage('このページでは音声再生を実行できません');
        return;
      }

      // コンテンツスクリプトを確実に読み込む
      try {
        await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          files: ['dbHelper.js', 'contentScript.js']
        });
        // スクリプトの読み込みを待つ
        await wait(500);
      } catch (error) {
        console.error('コンテンツスクリプトの読み込みに失敗:', error);
        await showErrorMessage('ページの読み込みに失敗しました。ページを更新して再試行してください。');
        return;
      }

      // 選択されたテキストを取得
      const [{ result }] = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        function: () => window.getSelection().toString()
      });

      if (!result) {
        await showErrorMessage('テキストが選択されていません');
        return;
      }

      const apiKey = await getFalApiKey();
      if (!apiKey) {
        await showErrorMessage('APIキーが設定されていません。設定画面で入力してください。');
        chrome.runtime.openOptionsPage();
        return;
      }

      const voiceType = await getVoiceType();
      const apiUrl = 'https://queue.fal.run/fal-ai/kokoro/american-english';
      const requestBody = {
        prompt: result,
        voice: voiceType
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
      const finalResult = await pollStatus(queueResult.status_url, queueResult.response_url, apiKey);

      // 音声URLを取得
      let audioUrl = finalResult.audio_url || finalResult.audio?.url || finalResult.output?.url || finalResult.result?.url;
      if (!audioUrl) {
        throw new Error('音声URLが見つかりません');
      }

      // コンテンツスクリプトとの接続を確認
      let connectionEstablished = false;
      try {
        await new Promise((resolve, reject) => {
          const timeout = setTimeout(() => {
            reject(new Error('接続タイムアウト'));
          }, 5000);

          chrome.tabs.sendMessage(tab.id, { type: "PING" }, (response) => {
            clearTimeout(timeout);
            if (chrome.runtime.lastError) {
              reject(chrome.runtime.lastError);
            } else {
              resolve(response);
            }
          });
        });
        connectionEstablished = true;
      } catch (error) {
        console.warn('コンテンツスクリプトとの接続に失敗:', error);
        // 再接続を試みる
        try {
          await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            files: ['dbHelper.js', 'contentScript.js']
          });
          await wait(1000);
          connectionEstablished = true;
        } catch (retryError) {
          console.error('再接続に失敗:', retryError);
          await showErrorMessage('ページとの接続に失敗しました。ページを更新して再試行してください。');
          return;
        }
      }

      if (connectionEstablished) {
        // 音声再生を試行
        await chrome.tabs.sendMessage(tab.id, {
          action: "playAudio",
          url: audioUrl,
          text: result,
          voiceType: voiceType
        });
      }

    } catch (error) {
      console.error('キーボードショートカット処理中にエラー:', error);
      await showErrorMessage(`エラーが発生しました: ${error.message}`);
    }
  }
});