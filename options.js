let db = AudioDatabase.getInstance();
let currentAudio = null;
let currentAudioId = null;
let audioFiles = [];

// 共通ユーティリティ関数
// データベース接続を更新する共通関数
async function refreshDatabaseConnection(force = false) {
  console.log(`Refreshing database connection${force ? ' (forced)' : ''}`);
  db = AudioDatabase.getInstance();
  await db.openDB(force);
  return db;
}

// ボタンの状態を更新する共通関数
function updateButtonState(button, isLoading, defaultText, loadingText, icon = 'refresh') {
  if (!button) return;

  button.disabled = isLoading;
  button.innerHTML = `<i class="material-icons">${icon}</i>${isLoading ? loadingText : defaultText}`;
}

// エラーハンドリングの共通関数
function handleError(error, errorMessage) {
  console.error(errorMessage, error);
  showStatus(`${errorMessage}: ${error.message}`, 'error');
}

// 音声リストを更新する共通関数
async function refreshAudioList(query = '') {
  try {
    await refreshDatabaseConnection(true);
    await loadAudioList(query);
    showStatus('音声一覧を更新しました', 'success');
    return true;
  } catch (error) {
    handleError(error, '更新に失敗しました');
    return false;
  }
}

// UIコンポーネント作成関数
function createButton(className, icon, text, onClick, title = '') {
  const button = document.createElement('button');
  button.className = className;
  button.innerHTML = `<i class="material-icons">${icon}</i>${text}`;
  button.onclick = onClick;
  if (title) button.title = title;
  return button;
}

// 音声アイテムの作成
function createAudioItem(audio, query) {
  const item = document.createElement('div');
  item.className = 'audio-item';
  item.dataset.audioId = audio.id;

  // テキスト部分
  const text = document.createElement('div');
  text.className = 'audio-text';
  text.textContent = audio.text || 'テキストなし';

  // メタデータ部分
  const metadata = document.createElement('div');
  metadata.className = 'audio-metadata';
  const duration = audio.duration ? `${Math.round(audio.duration)}秒` : '不明';
  const fileSize = audio.fileSize ? `${(audio.fileSize / 1024).toFixed(1)}KB` : '不明';
  metadata.innerHTML = `
    <div class="metadata-row">
      <i class="material-icons">schedule</i>
      ${new Date(audio.timestamp).toLocaleString()}
    </div>
    <div class="metadata-row">
      <i class="material-icons">timer</i>
      ${duration}
      <i class="material-icons" style="margin-left: 10px;">save</i>
      ${fileSize}
    </div>
  `;

  // コントロール部分
  const controls = document.createElement('div');
  controls.className = 'audio-controls';

  // 前の音声ボタン
  const prevButton = createButton('nav-button prev-button', 'skip_previous', '', () => playPreviousAudio(audio.id), '前の音声');

  // 再生ボタン
  const playButton = createButton('play-button', 'play_arrow', '再生', async () => {
    try {
      playButton.disabled = true;
      currentAudioId = audio.id;

      // まずリストから取得したblobを使用
      if (audio.blob) {
        console.log('Using blob data from list for ID:', audio.id);
        const success = await playAudio(audio.blob);
        if (success) {
          playButton.innerHTML = '<i class="material-icons">pause</i>一時停止';
        }
      } else {
        // リストにない場合は個別に取得
        console.log('Blob not in list, fetching audio data for ID:', audio.id);
        const audioData = await db.getAudio(audio.id);

        if (!audioData || !audioData.blob) {
          throw new Error('音声データが見つかりません');
        }

        const success = await playAudio(audioData.blob);
        if (success) {
          playButton.innerHTML = '<i class="material-icons">pause</i>一時停止';
        }
      }
    } catch (error) {
      handleError(error, '音声の再生に失敗しました');
    } finally {
      playButton.disabled = false;
    }
  });

  // 次の音声ボタン
  const nextButton = createButton('nav-button next-button', 'skip_next', '', () => playNextAudio(audio.id), '次の音声');

  // ダウンロードボタン
  const downloadButton = createButton('download-button', 'download', 'ダウンロード', async () => {
    try {
      // blobデータを取得
      let blob;
      if (audio.blob) {
        blob = audio.blob;
      } else {
        const audioData = await db.getAudio(audio.id);
        if (!audioData || !audioData.blob) {
          throw new Error('音声データが見つかりません');
        }
        blob = audioData.blob;
      }

      // ファイル名を生成（テキストの先頭20文字を使用）
      const textPrefix = audio.text 
        ? audio.text.substring(0, 20).replace(/[^\w\s]/gi, '').trim() 
        : 'audio';
      const fileName = `${textPrefix}_${new Date(audio.timestamp).toISOString().split('T')[0]}.wav`;

      // ダウンロードリンクを作成
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();

      // クリーンアップ
      setTimeout(() => {
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }, 100);

      showStatus('ダウンロードを開始しました', 'success');
    } catch (error) {
      handleError(error, 'ダウンロードに失敗しました');
    }
  });

  // 削除ボタン
  const deleteButton = createButton('delete-button', 'delete', '削除', async () => {
    if (confirm('この音声を削除してもよろしいですか？')) {
      try {
        await db.deleteAudio(audio.id);
        await loadAudioList(query);
        showStatus('音声を削除しました', 'success');
      } catch (error) {
        handleError(error, '音声の削除に失敗しました');
      }
    }
  });

  controls.appendChild(prevButton);
  controls.appendChild(playButton);
  controls.appendChild(nextButton);
  controls.appendChild(downloadButton);
  controls.appendChild(deleteButton);

  item.appendChild(text);
  item.appendChild(metadata);
  item.appendChild(controls);
  return item;
}

// 空の状態表示の作成
function createEmptyState(query, error = null) {
  return `
    <div class="empty-state">
      <i class="material-icons">${error ? 'error' : 'music_off'}</i>
      <p>${error ? `音声の読み込みに失敗しました: ${error.message}` : (query ? '検索結果が見つかりません' : '保存された音声はありません')}</p>
    </div>
  `;
}

// メッセージリスナーを設定
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('Received message in options page:', message);

  if (message.action === 'refreshOptionsPage') {
    console.log('Refreshing options page from message with timestamp:', message.timestamp);
    sendResponse({ success: true });

    setTimeout(async () => {
      try {
        console.log('Delayed refresh starting now');
        await refreshDatabaseConnection(true);
        const dbState = await db.checkDatabaseState();
        console.log('Database state before refresh:', dbState);
        await loadAudioList();
        console.log('Delayed refresh completed successfully');
        showStatus('最新の音声データを読み込みました', 'success');
      } catch (error) {
        handleError(error, '更新中にエラーが発生しました');
        if (message.force) {
          console.log('Force refreshing page due to error...');
          location.reload();
        }
      }
    }, 1500);

    return true;
  }
});

// イベントリスナーの設定
function setupEventListeners() {
  // APIキーの保存
  document.getElementById('save').addEventListener('click', async () => {
    const apiKey = document.getElementById('apiKey').value.trim();
    if (!apiKey) {
      showStatus('APIキーを入力してください', 'error');
      return;
    }

    try {
      await chrome.storage.sync.set({ falApiKey: apiKey });
      showStatus('設定を保存しました', 'success');
    } catch (error) {
      handleError(error, '設定の保存に失敗しました');
    }
  });

  // 検索機能
  const searchInput = document.getElementById('searchInput');
  let searchTimeout;
  searchInput.addEventListener('input', () => {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => loadAudioList(searchInput.value), 300);
  });

  // 更新ボタン
  const refreshButton = document.getElementById('refreshButton');
  refreshButton.addEventListener('click', async () => {
    try {
      updateButtonState(refreshButton, true, '更新', '更新中...');
      await refreshAudioList(searchInput.value);
    } finally {
      updateButtonState(refreshButton, false, '更新', '更新中...');
    }
  });

  // ページがフォーカスされたときに更新
  window.addEventListener('focus', async () => {
    console.log('Page focused, refreshing audio list');
    await loadAudioList();
  });
}

// 初期化処理
document.addEventListener('DOMContentLoaded', async () => {
  console.log('DOM Content Loaded - Initializing options page');

  try {
    // まず現在のデータベース状態を確認
    const dbState = await db.checkDatabaseState();
    console.log('Initial database state:', JSON.stringify(dbState, null, 2));

    // データベース接続を強制的に更新
    await refreshDatabaseConnection(true);
    console.log('Database connection refreshed forcefully');

    // 更新後の状態を再確認
    const updatedDbState = await db.checkDatabaseState();
    console.log('Updated database state:', JSON.stringify(updatedDbState, null, 2));

    console.log('Database initialized successfully');

    // 音声リストを取得（複数回試行する）
    let retryCount = 0;
    const maxRetries = 3;
    let fetchError = null;

    while (retryCount < maxRetries) {
      try {
        console.log(`Fetching audio files (attempt ${retryCount + 1}/${maxRetries})...`);
        audioFiles = await db.getAudioList();
        console.log('Number of audio files in database:', audioFiles.length);

        if (audioFiles.length > 0) {
          console.log('Audio files found:', audioFiles.length);
          console.log('First audio file:', JSON.stringify({
            id: audioFiles[0].id,
            text: audioFiles[0].text?.substring(0, 50) + '...',
            timestamp: audioFiles[0].timestamp,
            hasBlob: !!audioFiles[0].blob,
            blobSize: audioFiles[0].blob?.size || 0,
            fileSize: audioFiles[0].fileSize
          }, null, 2));
        } else {
          console.log('No audio files found in database');
        }

        break; // 成功したらループを抜ける
      } catch (error) {
        fetchError = error;
        console.error(`Error fetching audio files (attempt ${retryCount + 1}):`, error);
        retryCount++;

        if (retryCount < maxRetries) {
          // 接続を再確立して再試行
          await refreshDatabaseConnection(true);
          await new Promise(resolve => setTimeout(resolve, 500));
        }
      }
    }

    if (fetchError && retryCount >= maxRetries) {
      console.error('Failed to fetch audio files after multiple attempts');
      handleError(fetchError, '音声データの取得に失敗しました');
    }

    // 保存されているAPIキーを読み込み
    const result = await chrome.storage.sync.get('falApiKey');
    if (result.falApiKey) {
      document.getElementById('apiKey').value = result.falApiKey;
    }

    // イベントリスナーの設定
    setupEventListeners();

    // 初期データ読み込み
    console.log('Starting initial audio list load');
    await loadAudioList();
    console.log('Initial audio list load completed');
  } catch (error) {
    handleError(error, '初期化中にエラーが発生しました');
  }
});

// ステータスメッセージを表示
function showStatus(message, type) {
  const status = document.getElementById('status');
  status.textContent = message;
  status.className = type;
  setTimeout(() => {
    status.textContent = '';
    status.className = '';
  }, 3000);
}

// 音声一覧を読み込んで表示
async function loadAudioList(query = '') {
  console.log('loadAudioList called with query:', query);
  const audioList = document.getElementById('audioList');
  const loading = document.querySelector('.loading');

  if (!audioList) {
    console.error('audioList element not found');
    return;
  }

  try {
    loading.classList.add('active');
    audioList.innerHTML = '';

    // データベースから音声リストを取得
    const db = AudioDatabase.getInstance();
    console.log('Fetching audio list from storage...');

    // 音声リストを取得
    audioFiles = await db.getAudioList();
    console.log(`Retrieved ${audioFiles.length} audio files`);

    if (audioFiles.length > 0) {
      console.log('Sample audio record:', {
        id: audioFiles[0].id,
        text: audioFiles[0].text.substring(0, 30) + '...',
        hasBlob: !!audioFiles[0].blobData,
        size: audioFiles[0].fileSize
      });
    }

    // 検索フィルター適用
    const filteredFiles = query
      ? audioFiles.filter(audio => audio.text && audio.text.toLowerCase().includes(query.toLowerCase()))
      : audioFiles;

    console.log('Filtered audio files:', filteredFiles.length, 'items');

    if (filteredFiles.length === 0) {
      console.log('No audio files found after filtering');
      audioList.innerHTML = createEmptyState(query);
      return;
    }

    // 日付でソート（新しい順）
    filteredFiles.sort((a, b) => b.timestamp - a.timestamp);

    console.log('Rendering audio items...');
    for (const audio of filteredFiles) {
      // 表示用にblobを作成（必要な場合のみ）
      if (audio.blobData && !audio.blob) {
        audio.blob = db.base64ToBlob(audio.blobData, audio.mimeType);
      }
      audioList.appendChild(createAudioItem(audio, query));
    }

    showStatus(`${filteredFiles.length}件の音声データを読み込みました`, 'success');
  } catch (error) {
    handleError(error, '音声の読み込みに失敗しました');
    audioList.innerHTML = createEmptyState(query, error);
  } finally {
    loading.classList.remove('active');
  }
}

// 音声再生関連の関数
async function playAudio(blob) {
  if (currentAudio) {
    currentAudio.pause();
    URL.revokeObjectURL(currentAudio.src);
    currentAudio = null;
  }

  try {
    if (!blob) throw new Error('Blob data is missing');

    const blobUrl = URL.createObjectURL(blob);
    const audio = new Audio(blobUrl);
    currentAudio = audio;

    audio.onended = () => {
      URL.revokeObjectURL(blobUrl);
      currentAudio = null;
      if (currentAudioId) playNextAudio(currentAudioId);
    };

    audio.onerror = (error) => {
      URL.revokeObjectURL(blobUrl);
      currentAudio = null;
      console.error('Audio playback error:', error);
      throw new Error('音声の再生中にエラーが発生しました');
    };

    // 現在再生中の項目をハイライト
    document.querySelectorAll('.audio-item').forEach(item => item.classList.remove('playing'));
    const currentItem = document.querySelector(`.audio-item[data-audio-id="${currentAudioId}"]`);
    if (currentItem) currentItem.classList.add('playing');

    await audio.play();
    return true;
  } catch (error) {
    handleError(error, '音声の再生に失敗しました');
    return false;
  }
}

// 前の音声を再生
async function playPreviousAudio(currentId) {
  const sortedFiles = [...audioFiles].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  const currentIndex = sortedFiles.findIndex(audio => audio.id === currentId);
  if (currentIndex > 0) {
    const previousAudio = sortedFiles[currentIndex - 1];
    currentAudioId = previousAudio.id;
    playAudio(previousAudio.blob);
  }
}

// 次の音声を再生
async function playNextAudio(currentId) {
  const sortedFiles = [...audioFiles].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  const currentIndex = sortedFiles.findIndex(audio => audio.id === currentId);
  if (currentIndex >= 0 && currentIndex < sortedFiles.length - 1) {
    const nextAudio = sortedFiles[currentIndex + 1];
    currentAudioId = nextAudio.id;
    playAudio(nextAudio.blob);
  }
}