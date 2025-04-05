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

      // 音声を再生（先に再生を行う）
      console.log('Preparing audio for playback...');
      let playbackComplete = false;

      const playAudioPromise = new Promise((resolve, reject) => {
        try {
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
                    reject(error);
                  });
              } catch (innerError) {
                console.error('Error starting playback:', innerError);
                showError(`音声の再生開始に失敗しました: ${innerError.message}`);
                URL.revokeObjectURL(blobUrl);
                reject(innerError);
              }
            }
          };

          audio.onended = () => {
            console.log('Audio playback ended');
            playbackComplete = true;
            URL.revokeObjectURL(blobUrl);
            resolve();
          };

          audio.onerror = (error) => {
            console.error('Audio playback error:', error);
            URL.revokeObjectURL(blobUrl);
            showError(`音声の再生中にエラーが発生しました: ${error.message || '不明なエラー'}`);
            reject(error);
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
              reject(new Error('Audio playback timeout'));
            }
          }, 10000);
        } catch (playError) {
          console.error('Caught error during audio playback setup:', playError);
          showError(`音声の再生準備中にエラーが発生しました: ${playError.message}`);
          reject(playError);
        }
      });

      // 通知を表示
      showSuccessNotification('音声の再生を開始しました');

      // 音声の再生が完了した後にデータベースへ保存する
      await playAudioPromise;

      try {
        console.log('音声再生完了、データベースに保存を開始します', new Date().toISOString());

        // データベース接続を確認と再確立
        if (!db) {
          console.log('データベースインスタンスが存在しないため新規作成します');
          db = AudioDatabase.getInstance();
          await db.openDB(true); // 強制再接続
        } else {
          console.log('既存のデータベースインスタンスを使用します');
          await db.openDB(); // 既存接続の確認
        }

        // データベース状態をチェック
        const dbState = await db.checkDatabaseState();
        console.log('データベース状態（保存前）:', JSON.stringify(dbState, null, 2));

        // Blobデータの検証
        if (!audioBlob) {
          throw new Error('音声データ（Blob）が見つかりません');
        }
        console.log('音声データのサイズ:', audioBlob.size, 'bytes', 'type:', audioBlob.type);

        // クローンしたBlobを使用（元のBlobが変更された場合に備えて）
        const blobCopy = audioBlob.slice(0, audioBlob.size, audioBlob.type);
        console.log('Blobコピー作成完了：', blobCopy.size, 'bytes', blobCopy.type);

        // データベースに音声を保存（3回までリトライ）
        let audioId = null;
        let retryCount = 0;
        let saveError = null;

        while (retryCount < 3 && audioId === null) {
          try {
            console.log(`Saving audio data attempt ${retryCount + 1}/3 - timestamp: ${new Date().toISOString()}`);
            audioId = await db.saveAudio(blobCopy, text);
            console.log('音声を保存しました。ID:', audioId, '- timestamp:', new Date().toISOString());

            // 正常に保存されたら保存内容を確認
            const savedAudio = await db.getAudio(audioId);
            console.log('保存された音声データの検証:', 
              savedAudio ? 
              `ID: ${savedAudio.id}, サイズ: ${savedAudio.blob?.size || 'なし'} bytes, テキスト長: ${savedAudio.text?.length || 0}文字` : 
              '取得に失敗');
            break;
          } catch (err) {
            saveError = err;
            console.error(`Save attempt ${retryCount + 1} failed:`, err);

            // 次の試行の前に少し待機
            await new Promise(resolve => setTimeout(resolve, 500));

            // 接続を再確立してリトライ
            await db.openDB(true);
            retryCount++;
          }
        }

        // すべての試行が失敗した場合
        if (audioId === null) {
          throw saveError || new Error('音声の保存に複数回失敗しました');
        }

        showSuccessNotification('音声データを保存しました');

        // データベース状態を確認（デバッグ用）
        const dbStateAfterSave = await db.checkDatabaseState();
        console.log('Database state after save:', dbStateAfterSave);

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
        console.error('Error in audio save process:', error);
        showError(`音声の保存に失敗しました: ${error.message}`);
      }

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