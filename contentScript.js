// グローバル変数
let currentAudio = null;
let playbackState = 'idle'; // idle, loading, playing, paused, error
let db = null;
try {
  db = AudioDatabase.getInstance();
  console.log('AudioDatabase instance created successfully');
} catch (error) {
  console.error('Failed to create AudioDatabase instance:', error);
}
let isProcessing = false;

// オプションページを更新する関数
async function refreshOptionsPage() {
  try {
    console.log('Attempting to refresh options page - timestamp:', Date.now());

    // バックグラウンドスクリプトに処理を委譲
    const response = await chrome.runtime.sendMessage({ 
      action: 'refreshOptionsPage',
      timestamp: Date.now(),
      force: true
    });

    console.log('Refresh message response:', response);

    if (response && response.success) {
      console.log('Successfully refreshed pages with response:', response);
      return true;
    }

    console.log('No active pages found, opening options page...');

    // 最後の手段として通知を表示
    showSuccessNotification('音声が保存されました。設定画面で確認できます。');

    // オプションページを開く
    try {
      const optionsUrl = chrome.runtime.getURL('options.html');
      await chrome.runtime.openOptionsPage();
      console.log('Options page opened successfully');
      return true;
    } catch (tabError) {
      console.error('Failed to open options page:', tabError);
      return false;
    }
  } catch (error) {
    console.error('Failed to refresh pages:', error);
    showSuccessNotification('音声が保存されました。設定画面で確認できます。');
    return false;
  }
}

// Listen for messages from background script
chrome.runtime.onMessage.addListener(async (message, sender, sendResponse) => {
  if (message.type === "PING") {
    sendResponse({ status: "ok" });
    return;
  }

  if (message.action === "playAudio") {
    try {
      const audioBlob = await fetchAudio(message.url);
      if (!audioBlob) {
        throw new Error('音声データの取得に失敗しました');
      }

      // 音声を再生
      await playAudioFromBlob(audioBlob);
      showSuccessNotification('音声の再生を開始しました');

      // データベース接続を確認
      const db = AudioDatabase.getInstance();
      await db.openDB();

      // データベースの状態を確認（デバッグ用）
      const dbState = await db.checkDatabaseState();
      console.log('データベース状態（保存前）:', JSON.stringify(dbState, null, 2));

      // Blobデータの検証
      if (!audioBlob) {
        throw new Error('音声データ（Blob）が見つかりません');
      }
      console.log('音声データのサイズ:', audioBlob.size, 'bytes', 'type:', audioBlob.type);

      // Check for translation from background script
      let translation = message.translation || '';
      console.log(`Received translation from background: ${translation ? `"${translation.substring(0, 30)}..."` : 'none'}`);
      
      // If no translation was provided, we won't attempt to translate again
      if (!translation) {
        console.log('No translation provided from background script');
      }


      // データを保存（音声タイプ情報を含める）
      try {
        console.log(`音声データの保存を開始 - timestamp: ${new Date().toISOString()}`);
        const audioId = await db.saveAudio(audioBlob, message.text, message.voiceType, translation);
        console.log('音声を保存しました。ID:', audioId, '- timestamp:', new Date().toISOString());

        // 正常に保存されたら保存内容を確認
        const savedAudio = await db.getAudio(audioId);
        console.log('保存された音声データの検証:', 
          savedAudio ? 
          `ID: ${savedAudio.id}, サイズ: ${savedAudio.blob?.size || 'なし'} bytes, テキスト長: ${savedAudio.text?.length || 0}文字, 音声タイプ: ${savedAudio.voiceType}` : 
          '取得に失敗');
      } catch (saveError) {
        console.error('音声保存中にエラーが発生しました:', saveError);
        throw saveError;
      }

      // オプションページの更新処理
      try {
        console.log('Sending refresh message to options page');

        chrome.runtime.sendMessage({ 
          action: 'refreshOptionsPage',
          timestamp: Date.now(), // タイムスタンプを追加して毎回異なるメッセージにする
          force: true  // 強制更新フラグ
        }, (response) => {
          if (chrome.runtime.lastError) {
            console.log('Refresh message error (expected if options not open):', chrome.runtime.lastError);
            return;
          }
          console.log('Refresh options page response:', response);
        });
      } catch (msgError) {
        console.log('Failed to send refresh message:', msgError);
        // エラーを無視して処理を続行
      }
    } catch (error) {
      console.error('Error in playAudio:', error);
      showErrorNotification(error.message);
    }
  } else if (message.action === "showError") {
    showError(message.error);
  }
});

// エラーメッセージを表示
function showError(message) {
  // すでに存在する通知を削除
  const existingNotification = document.getElementById('kokoro-tts-notification');
  if (existingNotification) {
    existingNotification.remove();
  }

  const notification = document.createElement('div');
  notification.id = 'kokoro-tts-notification';
  notification.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    background-color: #ffebee;
    color: #c62828;
    padding: 12px 16px;
    border-radius: 4px;
    box-shadow: 0 2px 6px rgba(0,0,0,0.2);
    z-index: 10000;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif;
    font-size: 14px;
    max-width: 400px;
    word-break: break-word;
  `;

  notification.innerHTML = `
    <div style="display: flex; align-items: center;">
      <span style="margin-right: 8px;">⚠️</span>
      <span>${message}</span>
    </div>
  `;

  document.body.appendChild(notification);

  // 5秒後に通知を消す
  setTimeout(() => {
    if (notification && notification.parentElement) {
      notification.remove();
    }
  }, 5000);
}

// 成功通知を表示
function showSuccessNotification(message) {
  // すでに存在する通知を削除
  const existingNotification = document.getElementById('kokoro-tts-notification');
  if (existingNotification) {
    existingNotification.remove();
  }

  const notification = document.createElement('div');
  notification.id = 'kokoro-tts-notification';
  notification.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    background-color: #e8f5e9;
    color: #2e7d32;
    padding: 12px 16px;
    border-radius: 4px;
    box-shadow: 0 2px 6px rgba(0,0,0,0.2);
    z-index: 10000;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif;
    font-size: 14px;
    max-width: 400px;
    word-break: break-word;
  `;

  notification.innerHTML = `
    <div style="display: flex; align-items: center;">
      <span style="margin-right: 8px;">✅</span>
      <span>${message}</span>
    </div>
  `;

  document.body.appendChild(notification);

  // 3秒後に通知を消す
  setTimeout(() => {
    if (notification && notification.parentElement) {
      notification.remove();
    }
  }, 3000);
}

// Blobから音声を再生する関数
async function playAudioFromBlob(blob) {
  try {
    console.log('音声再生を開始します');

    // 現在再生中の音声があれば停止
    if (currentAudio) {
      currentAudio.pause();
      currentAudio = null;
    }

    // BlobからURLを作成
    const audioUrl = URL.createObjectURL(blob);

    // 新しいAudioオブジェクトを作成
    currentAudio = new Audio(audioUrl);

    // 再生状態を設定
    playbackState = 'loading';

    // イベントリスナーを設定
    currentAudio.addEventListener('canplaythrough', () => {
      console.log('音声の読み込みが完了しました');
      playbackState = 'playing';
    });

    currentAudio.addEventListener('ended', () => {
      console.log('音声の再生が終了しました');
      playbackState = 'idle';
      // URLを解放
      URL.revokeObjectURL(audioUrl);
    });

    currentAudio.addEventListener('error', (e) => {
      console.error('音声再生中にエラーが発生しました:', e);
      playbackState = 'error';
      showErrorNotification('音声の再生中にエラーが発生しました');
      // URLを解放
      URL.revokeObjectURL(audioUrl);
    });

    // 音声を再生
    await currentAudio.play();
    console.log('音声の再生を開始しました');

    return true;
  } catch (error) {
    console.error('音声再生中にエラーが発生しました:', error);
    playbackState = 'error';
    throw error;
  }
}

// 音声データを取得する関数
async function fetchAudio(url) {
  try {
    console.log('音声データを取得中:', url);
    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`音声データの取得に失敗しました: ${response.status} ${response.statusText}`);
    }

    const blob = await response.blob();
    console.log('音声データを取得しました:', blob.size, 'bytes');
    return blob;
  } catch (error) {
    console.error('音声データの取得中にエラーが発生しました:', error);
    throw error;
  }
}

// エラー通知を表示する関数（showErrorのエイリアス）
function showErrorNotification(message) {
  showError(message);
}

//音声データの保存処理(翻訳機能追加)
async function playAndSaveAudio(url, text, voiceType, translation = '') {
  try {
    showStatus('音声データを取得中...', 'info');
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`音声データの取得に失敗: ${response.status}`);
    }
    const audioBlob = await response.blob();
    const db = AudioDatabase.getInstance();
    const audioId = await db.saveAudio(audioBlob, text, voiceType, translation);
    showStatus('音声データを保存しました', 'success');
    playAudioFile(audioBlob);
    return audioId;
  } catch (error) {
    console.error('音声の再生と保存に失敗:', error);
    showStatus(`エラー: ${error.message}`, 'error');
    return null;
  }
}

// Translation is now handled by the background script