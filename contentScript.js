// グローバル変数
let currentAudio = null;
let playbackState = 'idle'; // idle, loading, playing, error

// Listen for messages from background script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log('Content script received message:', request, 'Current state:', playbackState);

  // PINGメッセージの即時処理
  if (request.type === "PING") {
    sendResponse({ status: "OK" });
    return true;
  }

  // エラーメッセージの即時処理
  if (request.action === "showError") {
    console.error('Error from background:', request.error);
    alert(request.error);
    sendResponse({ status: "error shown" });
    return false;
  }

  // 音声再生リクエストの処理
  if (request.action === "playAudio" && request.url) {
    handleAudioPlayback(request.url)
      .then(result => {
        sendResponse(result);
      })
      .catch(error => {
        console.error('Playback error:', error);
        sendResponse({ status: "error", error: error.message });
      });
    return true; // 非同期レスポンスを示す
  }

  return false; // 同期レスポンスの場合
});

// 音声再生を処理する関数
async function handleAudioPlayback(url) {
  try {
    // 既存の音声の停止
    if (currentAudio) {
      try {
        currentAudio.pause();
        currentAudio.remove();
        playbackState = 'idle';
      } catch (e) {
        console.warn('Error cleaning up previous audio:', e);
      }
      currentAudio = null;
    }

    playbackState = 'loading';
    const audio = new Audio();
    
    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        reject(new Error('音声の読み込みがタイムアウトしました'));
      }, 30000);

      audio.onloadstart = () => console.log('Audio loading started');

      audio.oncanplay = () => {
        clearTimeout(timeoutId);
        console.log('Audio can play, attempting playback');
        
        audio.play()
          .then(() => {
            playbackState = 'playing';
            console.log('Playback started successfully');
            resolve({ status: "playing" });
          })
          .catch(error => {
            console.warn('Auto-play failed, showing play button:', error);
            showPlayButton(audio, resolve);
          });
      };

      audio.onplay = () => {
        console.log('Audio playback started');
        playbackState = 'playing';
      };

      audio.onpause = () => {
        console.log('Audio playback paused');
        if (playbackState === 'playing') {
          playbackState = 'idle';
        }
      };

      audio.onended = () => {
        console.log('Audio playback ended');
        playbackState = 'idle';
        currentAudio = null;
      };

      audio.onerror = (e) => {
        clearTimeout(timeoutId);
        const errorMessage = audio.error ? 
          `Error code: ${audio.error.code}, Message: ${audio.error.message}` :
          'Unknown error occurred';
        console.error('Audio error:', errorMessage);
        playbackState = 'error';
        reject(new Error(errorMessage));
      };

      // URLをBlobに変換して再生
      fetch(url)
        .then(response => response.blob())
        .then(blob => {
          const blobUrl = URL.createObjectURL(blob);
          audio.src = blobUrl;
          currentAudio = audio;
        })
        .catch(error => {
          reject(new Error('音声ファイルの取得に失敗しました: ' + error.message));
        });
    });
  } catch (error) {
    throw new Error('音声の再生準備に失敗しました: ' + error.message);
  }
}

// 再生ボタンを表示する関数
function showPlayButton(audio, resolve) {
  const container = document.createElement('div');
  container.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    background: white;
    padding: 10px;
    border-radius: 5px;
    box-shadow: 0 2px 5px rgba(0,0,0,0.2);
    z-index: 9999;
    display: flex;
    gap: 10px;
    align-items: center;
  `;

  const playButton = document.createElement('button');
  playButton.textContent = '音声を再生';
  playButton.style.cssText = `
    padding: 5px 10px;
    cursor: pointer;
    background: #4CAF50;
    color: white;
    border: none;
    border-radius: 3px;
  `;

  const closeButton = document.createElement('button');
  closeButton.textContent = '✕';
  closeButton.style.cssText = `
    padding: 5px;
    cursor: pointer;
    background: none;
    border: none;
    font-size: 12px;
    color: #666;
  `;

  container.appendChild(playButton);
  container.appendChild(closeButton);
  document.body.appendChild(container);

  playButton.onclick = () => {
    audio.play()
      .then(() => {
        container.remove();
        playbackState = 'playing';
        resolve({ status: "playing" });
      })
      .catch(err => {
        console.error('Play button click failed:', err);
        alert('再生に失敗しました: ' + err.message);
        playbackState = 'error';
      });
  };

  closeButton.onclick = () => {
    container.remove();
    playbackState = 'idle';
    resolve({ status: "cancelled" });
  };
}