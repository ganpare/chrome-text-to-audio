const db = AudioDatabase.getInstance();
let currentAudio = null;
let currentAudioId = null;
let audioFiles = [];

// メッセージリスナーを設定
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('Received message in options page:', message);

  if (message.action === 'refreshOptionsPage') {
    console.log('Refreshing options page from message with timestamp:', message.timestamp);

    // すぐに成功応答を返す（非同期処理が完了する前に）
    sendResponse({ success: true });

    // 少し遅延させてからデータを読み込む（データベースの書き込みが完了するのを待つ）
    setTimeout(async () => {
      try {
        console.log('Delayed refresh starting now');
        // データベース接続を強制的に更新
        await db.openDB(true); // 強制的に再オープン
        // データベースの状態を確認
        const dbState = await db.checkDatabaseState();
        console.log('Database state before refresh:', dbState);
        // 音声リストを再読み込み
        await loadAudioList();
        console.log('Delayed refresh completed successfully');
        showStatus('最新の音声データを読み込みました', 'success');
      } catch (error) {
        console.error('Error in delayed refresh:', error);
        showStatus('更新中にエラーが発生しました: ' + error.message, 'error');
        // エラー発生時は強制的にページをリロード
        if (message.force) {
          console.log('Force refreshing page due to error...');
          location.reload();
        }
      }
    }, 1500); // 1.5秒遅延（少し長めに）

    return true; // 非同期レスポンスのために true を返す
  }
});

document.addEventListener('DOMContentLoaded', async () => {
  console.log('DOM Content Loaded - Initializing options page');

  try {
    // データベースの状態を詳細に確認
    const dbState = await db.checkDatabaseState();
    console.log('Database state:', JSON.stringify(dbState, null, 2));

    // データベースの初期化を確認
    await db.openDB();
    console.log('Database initialized successfully');

    // 保存されている音声データの数を確認
    audioFiles = await db.getAudioList();
    console.log('Number of audio files in database:', audioFiles.length);
    console.log('Audio files:', JSON.stringify(audioFiles, null, 2));

    // Load saved API key
    const result = await chrome.storage.sync.get('falApiKey');
    if (result.falApiKey) {
      document.getElementById('apiKey').value = result.falApiKey;
    }

    // Save API key when button is clicked
    document.getElementById('save').addEventListener('click', async () => {
      const apiKey = document.getElementById('apiKey').value.trim();
      const status = document.getElementById('status');

      if (!apiKey) {
        showStatus('APIキーを入力してください', 'error');
        return;
      }

      try {
        await chrome.storage.sync.set({ falApiKey: apiKey });
        showStatus('設定を保存しました', 'success');
      } catch (error) {
        showStatus('設定の保存に失敗しました', 'error');
      }
    });

    // 検索機能の実装
    const searchInput = document.getElementById('searchInput');
    let searchTimeout;
    searchInput.addEventListener('input', () => {
      clearTimeout(searchTimeout);
      searchTimeout = setTimeout(() => {
        loadAudioList(searchInput.value);
      }, 300);
    });

    // 更新ボタンの実装
    const refreshButton = document.getElementById('refreshButton');
    refreshButton.addEventListener('click', async () => {
      try {
        refreshButton.disabled = true;
        refreshButton.innerHTML = '<i class="material-icons">refresh</i>更新中...';
        console.log('Manual refresh requested');

        // データベース接続を確認・リフレッシュ
        await db.openDB();
        await loadAudioList(searchInput.value);

        showStatus('音声一覧を更新しました', 'success');
      } catch (error) {
        console.error('Failed to refresh audio list:', error);
        showStatus('更新に失敗しました: ' + error.message, 'error');
      } finally {
        refreshButton.disabled = false;
        refreshButton.innerHTML = '<i class="material-icons">refresh</i>更新';
      }
    });

    // 初期データ読み込み
    console.log('Starting initial audio list load');
    await loadAudioList();
    console.log('Initial audio list load completed');

    // 定期的な更新 (10秒ごと)
    setInterval(async () => {
      console.log('Refreshing audio list...');
      await loadAudioList();
    }, 10000);

    // ページがフォーカスされたときに更新
    window.addEventListener('focus', async () => {
      console.log('Page focused, refreshing audio list');
      await loadAudioList();
    });
  } catch (error) {
    console.error('Error during initialization:', error);
    showStatus('初期化中にエラーが発生しました: ' + error.message, 'error');
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
async function loadAudioList(searchQuery = '') {
  console.log('loadAudioList called with query:', searchQuery);
  const audioList = document.getElementById('audioList');
  const loading = document.querySelector('.loading');

  if (!audioList) {
    console.error('audioList element not found');
    return;
  }

  // データベースの現在の状態をログ
  try {
    const dbState = await db.checkDatabaseState();
    console.log('Current database state:', dbState);
  } catch (e) {
    console.warn('Failed to check database state:', e);
  }

  try {
    loading.classList.add('active');
    audioList.innerHTML = '';

    // データベース接続を確実に更新
    await db.openDB();
    console.log('Fetching audio list from database...');
    audioFiles = await db.getAudioList();
    console.log('Retrieved audio files:', audioFiles.length, 'items');

    // データが見つからない場合はもう一度試行
    if (audioFiles.length === 0) {
      console.log('No audio files found, trying once more...');
      await new Promise(resolve => setTimeout(resolve, 500)); // 少し待機
      await db.openDB(); // 接続を更新
      audioFiles = await db.getAudioList();
      console.log('Second attempt - Retrieved audio files:', audioFiles.length, 'items');
    }

    const filteredFiles = searchQuery
      ? audioFiles.filter(audio => 
          audio.text.toLowerCase().includes(searchQuery.toLowerCase()))
      : audioFiles;

    console.log('Filtered audio files:', filteredFiles.length, 'items');

    if (filteredFiles.length === 0) {
      console.log('No audio files found after filtering');
      audioList.innerHTML = `
        <div class="empty-state">
          <i class="material-icons">music_off</i>
          <p>${searchQuery ? '検索結果が見つかりません' : '保存された音声はありません'}</p>
          <button id="forceRefreshButton" class="refresh-button" style="margin-top: 15px;">
            <i class="material-icons">refresh</i>強制更新
          </button>
        </div>
      `;

      // 強制更新ボタンのイベントリスナーを追加
      const forceRefreshButton = document.getElementById('forceRefreshButton');
      if (forceRefreshButton) {
        forceRefreshButton.addEventListener('click', async () => {
          try {
            forceRefreshButton.disabled = true;
            forceRefreshButton.innerHTML = '<i class="material-icons">refresh</i>更新中...';

            // データベース接続を完全に更新
            db = AudioDatabase.getInstance();
            await db.openDB();
            await loadAudioList();

            showStatus('音声一覧を強制更新しました', 'success');
          } catch (error) {
            console.error('Failed to refresh audio list:', error);
            showStatus('更新に失敗しました: ' + error.message, 'error');
          } finally {
            if (forceRefreshButton) {
              forceRefreshButton.disabled = false;
              forceRefreshButton.innerHTML = '<i class="material-icons">refresh</i>強制更新';
            }
          }
        });
      }

      return;
    }

    // 日付でソート（新しい順）
    filteredFiles.sort((a, b) => 
      new Date(b.timestamp) - new Date(a.timestamp)
    );

    console.log('Rendering audio items...');
    for (const audio of filteredFiles) {
      // console.log('Creating element for audio:', audio);
      const item = document.createElement('div');
      item.className = 'audio-item';
      item.dataset.audioId = audio.id;

      const text = document.createElement('div');
      text.className = 'audio-text';
      text.textContent = audio.text;

      const metadata = document.createElement('div');
      metadata.className = 'audio-metadata';

      // メタデータの表示を改善
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

      const controls = document.createElement('div');
      controls.className = 'audio-controls';

      // 前の音声ボタン
      const prevButton = document.createElement('button');
      prevButton.className = 'nav-button prev-button';
      prevButton.innerHTML = '<i class="material-icons">skip_previous</i>';
      prevButton.onclick = () => playPreviousAudio(audio.id);
      prevButton.title = '前の音声';

      // 再生ボタン
      const playButton = document.createElement('button');
      playButton.className = 'play-button';
      playButton.innerHTML = '<i class="material-icons">play_arrow</i>再生';
      playButton.onclick = async () => {
        try {
          playButton.disabled = true;
          currentAudioId = audio.id;

          // データベースから音声データを取得
          console.log('Fetching audio data for ID:', audio.id);
          const audioData = await db.getAudio(audio.id);

          if (!audioData) {
            throw new Error('音声データが見つかりません (データなし)');
          }

          console.log('Audio data retrieved:', audioData);

          if (!audioData.blob) {
            throw new Error('音声データが見つかりません (Blobなし)');
          }

          // 音声を再生
          const success = await playAudio(audioData.blob);

          if (success) {
            playButton.innerHTML = '<i class="material-icons">pause</i>一時停止';
          }
        } catch (error) {
          console.error('Failed to play audio:', error);
          showStatus('音声の再生に失敗しました: ' + error.message, 'error');
        } finally {
          playButton.disabled = false;
        }
      };

      // 次の音声ボタン
      const nextButton = document.createElement('button');
      nextButton.className = 'nav-button next-button';
      nextButton.innerHTML = '<i class="material-icons">skip_next</i>';
      nextButton.onclick = () => playNextAudio(audio.id);
      nextButton.title = '次の音声';

      const deleteButton = document.createElement('button');
      deleteButton.className = 'delete-button';
      deleteButton.innerHTML = '<i class="material-icons">delete</i>削除';
      deleteButton.onclick = async () => {
        if (confirm('この音声を削除してもよろしいですか？')) {
          try {
            await db.deleteAudio(audio.id);
            await loadAudioList(searchQuery);
            showStatus('音声を削除しました', 'success');
          } catch (error) {
            console.error('Failed to delete audio:', error);
            showStatus('音声の削除に失敗しました', 'error');
          }
        }
      };

      controls.appendChild(prevButton);
      controls.appendChild(playButton);
      controls.appendChild(nextButton);
      controls.appendChild(deleteButton);

      item.appendChild(text);
      item.appendChild(metadata);
      item.appendChild(controls);
      audioList.appendChild(item);
    }

    showStatus(`${filteredFiles.length}件の音声データを読み込みました`, 'success');
  } catch (error) {
    console.error('Error in loadAudioList:', error);
    audioList.innerHTML = `
      <div class="empty-state">
        <i class="material-icons">error</i>
        <p>音声の読み込みに失敗しました: ${error.message}</p>
        <button id="forceRefreshButton" class="refresh-button" style="margin-top: 15px;">
          <i class="material-icons">refresh</i>強制更新
        </button>
      </div>
    `;

    // 強制更新ボタンのイベントリスナーを追加
    const forceRefreshButton = document.getElementById('forceRefreshButton');
    if (forceRefreshButton) {
      forceRefreshButton.addEventListener('click', async () => {
        try {
          forceRefreshButton.disabled = true;
          forceRefreshButton.innerHTML = '<i class="material-icons">refresh</i>更新中...';

          // データベース接続を完全に更新
          db = AudioDatabase.getInstance();
          await db.openDB();
          await loadAudioList();

          showStatus('音声一覧を強制更新しました', 'success');
        } catch (error) {
          console.error('Failed to refresh audio list:', error);
          showStatus('更新に失敗しました: ' + error.message, 'error');
        } finally {
          if (forceRefreshButton) {
            forceRefreshButton.disabled = false;
            forceRefreshButton.innerHTML = '<i class="material-icons">refresh</i>強制更新';
          }
        }
      });
    }
  } finally {
    loading.classList.remove('active');
  }
}

// 音声を再生
async function playAudio(blob) {
  if (currentAudio) {
    currentAudio.pause();
    URL.revokeObjectURL(currentAudio.src);
    currentAudio = null;
  }

  try {
    if (!blob) {
      throw new Error('Blob data is missing');
    }

    const blobUrl = URL.createObjectURL(blob);
    const audio = new Audio(blobUrl);
    currentAudio = audio;

    audio.onended = () => {
      URL.revokeObjectURL(blobUrl);
      currentAudio = null;
      // 再生終了時に自動で次の音声を再生
      if (currentAudioId) {
        playNextAudio(currentAudioId);
      }
    };

    audio.onerror = (error) => {
      URL.revokeObjectURL(blobUrl);
      currentAudio = null;
      console.error('Audio playback error:', error);
      throw new Error('音声の再生中にエラーが発生しました');
    };

    // 現在再生中の項目をハイライト
    document.querySelectorAll('.audio-item').forEach(item => {
      item.classList.remove('playing');
    });
    const currentItem = document.querySelector(`.audio-item[data-audio-id="${currentAudioId}"]`);
    if (currentItem) {
      currentItem.classList.add('playing');
    }

    await audio.play();
    return true;
  } catch (error) {
    console.error('Failed to play audio:', error);
    showStatus('音声の再生に失敗しました: ' + error.message, 'error');
    return false;
  }
}

// 前の音声を再生
async function playPreviousAudio(currentId) {
  const sortedFiles = [...audioFiles].sort((a, b) => 
    new Date(b.timestamp) - new Date(a.timestamp)
  );
  const currentIndex = sortedFiles.findIndex(audio => audio.id === currentId);
  if (currentIndex > 0) {
    const previousAudio = sortedFiles[currentIndex - 1];
    currentAudioId = previousAudio.id;
    playAudio(previousAudio.blob);
  }
}

// 次の音声を再生
async function playNextAudio(currentId) {
  const sortedFiles = [...audioFiles].sort((a, b) => 
    new Date(b.timestamp) - new Date(a.timestamp)
  );
  const currentIndex = sortedFiles.findIndex(audio => audio.id === currentId);
  if (currentIndex >= 0 && currentIndex < sortedFiles.length - 1) {
    const nextAudio = sortedFiles[currentIndex + 1];
    currentAudioId = nextAudio.id;
    playAudio(nextAudio.blob);
  }
}