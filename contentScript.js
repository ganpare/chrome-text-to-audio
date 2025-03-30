// グローバル変数
let currentAudio = null;
let playbackState = 'idle'; // idle, loading, playing, paused, error
const db = AudioDatabase.getInstance();
let isProcessing = false;

// オプションページを更新する関数
async function refreshOptionsPage() {
  try {
    const optionsUrl = chrome.runtime.getURL('options.html');
    const queryInfo = { url: optionsUrl };
    
    // Manifest V3では chrome.tabs APIにコンテンツスクリプトからアクセスできないため
    // backgroundスクリプトに処理を委譲します
    chrome.runtime.sendMessage({ 
      action: 'refreshOptionsPage',
      optionsUrl: optionsUrl 
    });
  } catch (error) {
    console.log('Failed to refresh options page:', error);
  }
}

// Listen for messages from background script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log('Content script received message:', request);
  console.log('Current state:', playbackState);

  if (request.type === "PING") {
    sendResponse({ state: playbackState });
    return false;
  }

  if (request.type === "ERROR") {
    // 処理中でない場合のみエラーメッセージを表示
    if (!isProcessing) {
      console.error('Error from background script:', request.error);
    }
    return false;
  }

  if (request.action === "playAudio" && request.url) {
    // 既に再生中の場合は停止
    if (playbackState === 'playing' || playbackState === 'loading') {
      if (currentAudio) {
        currentAudio.pause();
        currentAudio = null;
      }
      playbackState = 'idle';
    }

    playbackState = 'loading';
    isProcessing = true;
    sendResponse({ state: playbackState });

    handleAudioPlayback(request.url, request.text)
      .then(async () => {
        console.log('Audio playback started successfully');
        isProcessing = false;
        // 音声保存後にオプションページを更新（エラーハンドリング追加）
        try {
          await refreshOptionsPage();
        } catch (error) {
          console.warn('Failed to refresh options page:', error);
          // オプションページの更新失敗は致命的ではないため、
          // ユーザーにエラーは表示しません
        }
      })
      .catch(error => {
        console.error('Error in audio playback:', error);
        playbackState = 'error';
        isProcessing = false;
        chrome.runtime.sendMessage({
          type: "ERROR",
          error: `音声の再生に失敗しました: ${error.message}`
        });
      });
    return false;
  }

  return false;
});

async function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

async function handleAudioPlayback(url, originalText) {
  try {
    console.log('Starting audio playback process for URL:', url);
    
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`音声データの取得に失敗しました: ${response.statusText}`);
    }
    
    const blob = await response.blob();
    console.log('Audio data fetched successfully');
    
    // BlobをBase64に変換
    const base64Data = await blobToBase64(blob);
    console.log('Audio data converted to base64');
    
    return new Promise((resolve, reject) => {
      // 新しいAudio要素を作成
      const audio = new Audio();
      
      // エラーハンドリングを先に設定
      audio.onerror = (e) => {
        console.error('Audio loading error:', e);
        reject(new Error('音声データの読み込みに失敗しました'));
      };
      
      // 成功時のハンドラを設定
      audio.oncanplaythrough = async () => {
        try {
          currentAudio = audio;
          await audio.play();
          playbackState = 'playing';
          console.log('Audio playback started');
          showPlayButton(audio, originalText, base64Data);
          
          // 再生開始後にデータベースに保存
          try {
            await db.saveAudio(blob, originalText);
            console.log('Audio saved to database');
          } catch (error) {
            console.error('Failed to save audio to database:', error);
            // データベースへの保存失敗は致命的ではないため、
            // エラーをスローせずに続行
          }
          
          resolve();
        } catch (error) {
          reject(error);
        }
      };
      
      // イベントリスナーを設定
      audio.addEventListener('ended', () => {
        playbackState = 'idle';
        console.log('Audio playback completed');
      });

      audio.addEventListener('pause', () => {
        if (playbackState === 'playing') {
          playbackState = 'paused';
          console.log('Audio playback paused');
        }
      });

      audio.addEventListener('play', () => {
        playbackState = 'playing';
        console.log('Audio playback resumed');
      });
      
      // ソースを設定
      audio.src = base64Data;
    });
    
  } catch (error) {
    playbackState = 'error';
    console.error('Error in handleAudioPlayback:', error);
    throw error;
  }
}

function showPlayButton(audio, originalText, base64Data) {
  const container = document.createElement('div');
  container.style.cssText = `
    position: fixed;
    bottom: 20px;
    right: 20px;
    background: white;
    padding: 10px;
    border-radius: 5px;
    box-shadow: 0 2px 5px rgba(0,0,0,0.2);
    z-index: 10000;
    display: flex;
    gap: 10px;
  `;

  const updatePlayButtonText = () => {
    playButton.textContent = audio.paused ? '再生' : '一時停止';
  };

  const playButton = document.createElement('button');
  updatePlayButtonText();
  playButton.onclick = async () => {
    try {
      if (audio.paused) {
        await audio.play();
      } else {
        audio.pause();
      }
      updatePlayButtonText();
    } catch (error) {
      console.error('Error toggling playback:', error);
      playbackState = 'error';
      chrome.runtime.sendMessage({
        type: "ERROR",
        error: `再生の切り替えに失敗しました: ${error.message}`
      });
    }
  };

  const saveButton = document.createElement('button');
  saveButton.textContent = '保存';
  saveButton.onclick = () => {
    try {
      const a = document.createElement('a');
      a.href = base64Data;
      a.download = `audio_${Date.now()}.wav`;
      a.click();
    } catch (error) {
      console.error('Error saving audio:', error);
      chrome.runtime.sendMessage({
        type: "ERROR",
        error: `音声の保存に失敗しました: ${error.message}`
      });
    }
  };

  const closeButton = document.createElement('button');
  closeButton.textContent = '閉じる';
  closeButton.onclick = () => {
    if (audio) {
      audio.pause();
    }
    playbackState = 'idle';
    container.remove();
  };

  // 音声の状態変更を監視
  audio.addEventListener('play', updatePlayButtonText);
  audio.addEventListener('pause', updatePlayButtonText);

  container.appendChild(playButton);
  container.appendChild(saveButton);
  container.appendChild(closeButton);
  document.body.appendChild(container);
}