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
    const optionsUrl = chrome.runtime.getURL('options.html');
    // backgroundスクリプトに処理を委譲
    const response = await chrome.runtime.sendMessage({ 
      action: 'refreshOptionsPage',
      optionsUrl: optionsUrl 
    });
    if (!response || !response.success) {
      throw new Error(response?.error || 'Failed to refresh options page');
    }
  } catch (error) {
    console.log('Failed to refresh options page:', error);
    throw error; // エラーを上位に伝播させる
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
      console.log('Received playAudio message:', message);

      // 音声URL取得
      const audioUrl = message.url;
      if (!audioUrl) {
        throw new Error('Audio URL is missing');
      }

      // 音声データをフェッチ
      const response = await fetch(audioUrl);
      if (!response.ok) {
        throw new Error(`Failed to fetch audio: ${response.status}`);
      }

      // Blobとして取得
      const audioBlob = await response.blob();

      // テキスト情報を取得
      const text = message.text || '音声データ';

      try {
        // データベースに音声を保存
        const audioId = await db.saveAudio(audioBlob, text);
        console.log('Audio saved successfully with ID:', audioId);

        // オプションページを更新
        try {
          chrome.runtime.sendMessage({ action: 'refreshOptionsPage' }, (response) => {
            if (chrome.runtime.lastError) {
              console.log('Refresh message error:', chrome.runtime.lastError);
              return;
            }
            console.log('Refresh options page response:', response);
          });
        } catch (msgError) {
          console.log('Failed to send refresh message:', msgError);
          // エラーを無視して処理を続行
        }
      } catch (dbError) {
        console.error('Failed to save audio to database:', dbError);
        // エラー通知を表示
        showError(`データベースへの保存に失敗しました: ${dbError.message}`);
      }

      // 音声を再生
      try {
        console.log('Preparing audio for playback...');
        const blobUrl = URL.createObjectURL(audioBlob);
        const audio = new Audio();
        
        // 再生のためのイベントリスナーを設定
        let playbackStarted = false;
        
        // 再生準備完了イベント
        audio.oncanplaythrough = () => {
          console.log('Audio is ready to play');
          // 一度だけ再生を開始
          if (!playbackStarted) {
            playbackStarted = true;
            console.log('Starting audio playback...');
            try {
              audio.play()
                .catch(error => {
                  console.error('Audio play promise rejected:', error);
                  showError(`音声の再生に失敗しました: ${error.message}`);
                  URL.revokeObjectURL(blobUrl);
                });
            } catch (innerError) {
              console.error('Error starting playback:', innerError);
              showError(`音声の再生開始に失敗しました: ${innerError.message}`);
              URL.revokeObjectURL(blobUrl);
            }
          }
        };

        audio.onended = () => {
          console.log('Audio playback ended');
          URL.revokeObjectURL(blobUrl);
        };

        audio.onerror = (error) => {
          console.error('Audio playback error:', error);
          URL.revokeObjectURL(blobUrl);
          showError(`音声の再生中にエラーが発生しました: ${error.message || '不明なエラー'}`);
        };

        // ソースを設定して読み込み開始
        audio.src = blobUrl;
        audio.load();
        
        // 10秒以上再生が始まらなかった場合のタイムアウト処理
        setTimeout(() => {
          if (!playbackStarted) {
            console.warn('Audio playback timeout');
            showError('音声の読み込みがタイムアウトしました');
            URL.revokeObjectURL(blobUrl);
          }
        }, 10000);
      } catch (playError) {
        console.error('Caught error during audio playback setup:', playError);
        showError(`音声の再生準備中にエラーが発生しました: ${playError.message}`);
      }

      // 通知を表示
      showSuccessNotification('音声の再生を開始しました');

    } catch (error) {
      console.error('Error in playAudio:', error);
      showError(`音声の再生に失敗しました: ${error.message}`);
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