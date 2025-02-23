// グローバル変数で音声要素を管理
let currentAudio = null;

// Listen for messages from background script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log('Content script received message:', request);

  // PINGメッセージの処理
  if (request.type === "PING") {
    console.log('Received PING, sending OK');
    sendResponse({ status: "OK" });
    return true;
  }

  if (request.action === "playAudio" && request.url) {
    console.log('Creating audio element with URL:', request.url);
    
    // 既存の音声を停止
    if (currentAudio) {
      currentAudio.pause();
      currentAudio = null;
    }

    const audio = new Audio(request.url);
    currentAudio = audio;
    
    // 音声の読み込み開始イベント
    audio.onloadstart = () => {
      console.log('Audio loading started');
      sendResponse({ status: "loading" });
    };

    // 音声の読み込み完了イベント
    audio.oncanplay = () => {
      console.log('Audio can play');
    };

    // 再生開始イベント
    audio.onplay = () => {
      console.log('Audio playback started');
    };

    // 再生終了イベント
    audio.onended = () => {
      console.log('Audio playback ended');
      currentAudio = null;
    };

    // エラーイベントを改善し、ユーザーへの通知を追加
    audio.onerror = (e) => {
      console.error('Audio error:', e);
      if (audio.error) {
        console.error('Audio error code:', audio.error.code);
        console.error('Audio error message:', audio.error.message);
      }
      alert('音声の再生に失敗しました。別のテキストを試してください。');
      currentAudio = null;
      sendResponse({ status: "error", error: audio.error?.message || 'Unknown error' });
    };

    // 再生エラーのハンドリングを改善
    audio.play().then(() => {
      sendResponse({ status: "playing" });
    }).catch(error => {
      console.error("Error playing audio:", error);
      alert('音声の再生に失敗しました: ' + error.message);
      currentAudio = null;
      sendResponse({ status: "error", error: error.message });
    });

    return true; // 非同期レスポンスを示す
  } else if (request.action === "showError") {
    console.error('Error from background:', request.error);
    alert('エラーが発生しました: ' + request.error);
    sendResponse({ status: "error shown" });
    return true;
  }
});