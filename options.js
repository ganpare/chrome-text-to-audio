let db = AudioDatabase.getInstance();
let currentAudio = null;
let currentAudioId = null;
let audioFiles = [];

// 共通ユーティリティ関数
// データベース接続を更新する共通関数
async function refreshDatabaseConnection(force = false) {
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
  showStatus(`${errorMessage}`, 'error');
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
  const voiceType = audio.voiceType || 'af_heart';

  // 音声タイプの表示名を取得
  const voiceDisplayName = getVoiceDisplayName(voiceType);

  metadata.innerHTML = `
    <div class="metadata-row">
      <i class="material-icons">record_voice_over</i>
      ${voiceDisplayName}
      <i class="material-icons" style="margin-left: 10px;">timer</i>
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
        const success = await playAudio(audio.blob);
        if (success) {
          playButton.innerHTML = '<i class="material-icons">pause</i>一時停止';
        }
      } else {
        // リストにない場合は個別に取得
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

// 音声タイプの表示名を取得する関数
function getVoiceDisplayName(voiceType) {
  const voiceMap = {
    // 女性の声
    'af_heart': 'Heart Voice',
    'af_alloy': 'Alloy Voice',
    'af_aoede': 'Aoede Voice',
    'af_bella': 'Bella Voice',
    'af_jessica': 'Jessica Voice',
    'af_kore': 'Kore Voice',
    'af_nicole': 'Nicole Voice',
    'af_nova': 'Nova Voice',
    'af_river': 'River Voice',
    'af_sarah': 'Sarah Voice',
    'af_sky': 'Sky Voice',
    // 男性の声
    'am_adam': 'Adam Voice',
    'am_echo': 'Echo Voice',
    'am_eric': 'Eric Voice',
    'am_fenrir': 'Fenrir Voice',
    'am_liam': 'Liam Voice',
    'am_michael': 'Michael Voice',
    'am_onyx': 'Onyx Voice',
    'am_puck': 'Puck Voice',
    'am_santa': 'Santa Voice'
  };
  return voiceMap[voiceType] || voiceType;
}

// 空の状態表示の作成
function createEmptyState(query, error = null) {
  return `
    <div class="empty-state">
      <i class="material-icons">${error ? 'error' : 'music_off'}</i>
      <p>${error ? `音声の読み込みに失敗しました` : (query ? '検索結果が見つかりません' : '保存された音声はありません')}</p>
    </div>
  `;
}

// メッセージリスナーを設定
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'refreshOptionsPage') {
    sendResponse({ success: true });

    setTimeout(async () => {
      try {
        await refreshDatabaseConnection(true);
        await loadAudioList();
        showStatus('最新の音声データを読み込みました', 'success');
      } catch (error) {
        handleError(error, '更新中にエラーが発生しました');
        if (message.force) {
          location.reload();
        }
      }
    }, 1500);

    return true;
  }
});

// 音声一覧の並び替えとフィルタリング
function applyFilters(audioList, searchQuery = '', voiceFilter = '', sortOrder = 'newest') {
  let filteredFiles = [...audioList];

  // テキスト検索フィルター
  if (searchQuery) {
    filteredFiles = filteredFiles.filter(audio => 
      audio.text && audio.text.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }

  // 音声タイプフィルター
  if (voiceFilter) {
    filteredFiles = filteredFiles.filter(audio => 
      audio.voiceType === voiceFilter
    );
  }

  // ソート
  switch (sortOrder) {
    case 'newest':
      filteredFiles.sort((a, b) => b.timestamp - a.timestamp);
      break;
    case 'oldest':
      filteredFiles.sort((a, b) => a.timestamp - b.timestamp);
      break;
    case 'largest':
      filteredFiles.sort((a, b) => b.fileSize - a.fileSize);
      break;
    case 'smallest':
      filteredFiles.sort((a, b) => a.fileSize - b.fileSize);
      break;
  }

  return filteredFiles;
}

// イベントリスナーの設定
function setupEventListeners() {
  // APIキーと音声タイプの保存
  document.getElementById('save').addEventListener('click', async () => {
    const apiKey = document.getElementById('apiKey').value.trim();
    const voiceType = document.getElementById('voiceType').value;
    
    if (!apiKey) {
      showStatus('APIキーを入力してください', 'error');
      return;
    }

    try {
      await chrome.storage.sync.set({
        falApiKey: apiKey,
        voiceType: voiceType
      });
      showStatus('設定を保存しました', 'success');
    } catch (error) {
      handleError(error, '設定の保存に失敗しました');
    }
  });

  // 音声タイプの変更時にも保存
  document.getElementById('voiceType').addEventListener('change', async () => {
    const voiceType = document.getElementById('voiceType').value;
    try {
      await chrome.storage.sync.set({ voiceType: voiceType });
      showStatus('音声タイプを更新しました', 'success');
    } catch (error) {
      handleError(error, '音声タイプの保存に失敗しました');
    }
  });

  // 音声タイプフィルター
  const voiceFilter = document.getElementById('voiceFilter');
  voiceFilter.addEventListener('change', () => {
    const searchQuery = document.getElementById('searchInput').value;
    const sortOrder = document.getElementById('sortOrder').value;
    loadAudioList(searchQuery, voiceFilter.value, sortOrder);
  });

  // ソート順変更
  const sortOrder = document.getElementById('sortOrder');
  sortOrder.addEventListener('change', () => {
    const searchQuery = document.getElementById('searchInput').value;
    const voiceType = document.getElementById('voiceFilter').value;
    loadAudioList(searchQuery, voiceType, sortOrder.value);
  });

  // 検索機能を更新
  const searchInput = document.getElementById('searchInput');
  let searchTimeout;
  searchInput.addEventListener('input', () => {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => {
      const voiceType = document.getElementById('voiceFilter').value;
      const sortOrder = document.getElementById('sortOrder').value;
      loadAudioList(searchInput.value, voiceType, sortOrder);
    }, 300);
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
    await loadAudioList();
  });
}

// 初期化処理
document.addEventListener('DOMContentLoaded', async () => {
  try {
    await refreshDatabaseConnection(true);
    audioFiles = await db.getAudioList();

    // 保存されている設定を読み込み
    const result = await chrome.storage.sync.get(['falApiKey', 'voiceType']);
    if (result.falApiKey) {
      document.getElementById('apiKey').value = result.falApiKey;
    }
    if (result.voiceType) {
      document.getElementById('voiceType').value = result.voiceType;
    }

    // イベントリスナーの設定
    setupEventListeners();

    // 初期データ読み込み
    await loadAudioList();
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
async function loadAudioList(query = '', voiceFilter = '', sortOrder = 'newest') {
  const audioList = document.getElementById('audioList');
  const loading = document.querySelector('.loading');

  if (!audioList) return;

  try {
    loading.classList.add('active');
    audioList.innerHTML = '';

    // データベースから音声リストを取得
    const db = AudioDatabase.getInstance();
    audioFiles = await db.getAudioList();

    // フィルターとソートを適用
    const filteredFiles = applyFilters(audioFiles, query, voiceFilter, sortOrder);

    if (filteredFiles.length === 0) {
      audioList.innerHTML = createEmptyState(query);
      return;
    }

    // 音声アイテムを表示
    for (const audio of filteredFiles) {
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

    audio.onerror = () => {
      URL.revokeObjectURL(blobUrl);
      currentAudio = null;
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
  const sortedFiles = [...audioFiles].sort((a, b) => b.timestamp - a.timestamp);
  const currentIndex = sortedFiles.findIndex(audio => audio.id === currentId);
  if (currentIndex > 0) {
    const previousAudio = sortedFiles[currentIndex - 1];
    currentAudioId = previousAudio.id;
    playAudio(previousAudio.blob);
  }
}

// 次の音声を再生
async function playNextAudio(currentId) {
  const sortedFiles = [...audioFiles].sort((a, b) => b.timestamp - a.timestamp);
  const currentIndex = sortedFiles.findIndex(audio => audio.id === currentId);
  if (currentIndex >= 0 && currentIndex < sortedFiles.length - 1) {
    const nextAudio = sortedFiles[currentIndex + 1];
    currentAudioId = nextAudio.id;
    playAudio(nextAudio.blob);
  }
}