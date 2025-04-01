
// AudioDatabaseのインスタンスを取得
const db = AudioDatabase.getInstance();
let currentAudio = null;
let currentAudioId = null;
let audioFiles = [];

document.addEventListener('DOMContentLoaded', async () => {
  console.log('History page loaded - Initializing...');
  
  try {
    // データベース接続を確認
    await db.openDB();
    console.log('Database connection established');
    
    // 初期データ読み込み
    await loadAudioList();
    
    // 検索機能
    const searchInput = document.getElementById('searchInput');
    let searchTimeout;
    searchInput.addEventListener('input', () => {
      clearTimeout(searchTimeout);
      searchTimeout = setTimeout(() => {
        loadAudioList(searchInput.value);
      }, 300);
    });
    
    // 更新ボタン
    const refreshButton = document.getElementById('refreshButton');
    refreshButton.addEventListener('click', async () => {
      try {
        refreshButton.disabled = true;
        refreshButton.innerHTML = '<i class="material-icons">refresh</i>更新中...';
        
        await db.openDB();
        await loadAudioList(searchInput.value);
        
        showStatus('音声一覧を更新しました', 'success');
      } catch (error) {
        console.error('更新に失敗しました:', error);
        showStatus('更新に失敗しました: ' + error.message, 'error');
      } finally {
        refreshButton.disabled = false;
        refreshButton.innerHTML = '<i class="material-icons">refresh</i>更新';
      }
    });
    
    // 5秒ごとに自動更新
    setInterval(async () => {
      console.log('Auto-refreshing audio list');
      await loadAudioList(searchInput.value);
    }, 5000);
    
  } catch (error) {
    console.error('初期化エラー:', error);
    showStatus('初期化中にエラーが発生しました: ' + error.message, 'error');
  }
});

// ステータスメッセージを表示
function showStatus(message, type) {
  const status = document.getElementById('status');
  status.textContent = message;
  status.className = type;
  status.style.display = 'block';
  
  setTimeout(() => {
    status.style.display = 'none';
    status.textContent = '';
    status.className = '';
  }, 3000);
}

// 音声一覧を読み込んで表示
async function loadAudioList(searchQuery = '') {
  console.log('Loading audio list with query:', searchQuery);
  const audioList = document.getElementById('audioList');
  const loading = document.querySelector('.loading');
  
  try {
    loading.classList.add('active');
    audioList.innerHTML = '';
    
    // データベースから音声一覧を取得
    audioFiles = await db.getAudioList();
    console.log('Retrieved audio files:', audioFiles.length);
    
    // 検索フィルター
    const filteredFiles = searchQuery
      ? audioFiles.filter(audio => 
          audio.text.toLowerCase().includes(searchQuery.toLowerCase()))
      : audioFiles;
    
    if (filteredFiles.length === 0) {
      audioList.innerHTML = `
        <div class="empty-state">
          <i class="material-icons">music_off</i>
          <p>${searchQuery ? '検索結果が見つかりません' : '保存された音声はありません'}</p>
        </div>
      `;
      return;
    }
    
    // 日付でソート（新しい順）
    filteredFiles.sort((a, b) => 
      new Date(b.timestamp) - new Date(a.timestamp)
    );
    
    // 音声アイテムを表示
    for (const audio of filteredFiles) {
      const item = document.createElement('div');
      item.className = 'audio-item';
      item.dataset.audioId = audio.id;
      
      const text = document.createElement('div');
      text.className = 'audio-text';
      text.textContent = audio.text;
      
      const metadata = document.createElement('div');
      metadata.className = 'audio-metadata';
      
      // メタデータ表示
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
      
      // 再生ボタン
      const playButton = document.createElement('button');
      playButton.className = 'play-button';
      playButton.innerHTML = '<i class="material-icons">play_arrow</i>再生';
      playButton.onclick = async () => {
        try {
          playButton.disabled = true;
          currentAudioId = audio.id;
          
          // データベースから音声データを取得
          const audioData = await db.getAudio(audio.id);
          
          if (!audioData || !audioData.blob) {
            throw new Error('音声データが見つかりません');
          }
          
          // 音声を再生
          playAudio(audioData.blob);
          playButton.innerHTML = '<i class="material-icons">volume_up</i>再生中';
          
          setTimeout(() => {
            playButton.disabled = false;
            playButton.innerHTML = '<i class="material-icons">play_arrow</i>再生';
          }, audioData.duration * 1000 + 500);
          
        } catch (error) {
          console.error('再生エラー:', error);
          showStatus('再生に失敗しました: ' + error.message, 'error');
          playButton.disabled = false;
        }
      };
      
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
            console.error('削除エラー:', error);
            showStatus('削除に失敗しました: ' + error.message, 'error');
          }
        }
      };
      
      controls.appendChild(playButton);
      controls.appendChild(deleteButton);
      
      item.appendChild(text);
      item.appendChild(metadata);
      item.appendChild(controls);
      audioList.appendChild(item);
    }
  } catch (error) {
    console.error('音声一覧の読み込みエラー:', error);
    audioList.innerHTML = `
      <div class="empty-state">
        <i class="material-icons">error</i>
        <p>音声の読み込みに失敗しました: ${error.message}</p>
      </div>
    `;
  } finally {
    loading.classList.remove('active');
  }
}

// 音声を再生
function playAudio(blob) {
  if (currentAudio) {
    currentAudio.pause();
    URL.revokeObjectURL(currentAudio.src);
    currentAudio = null;
  }
  
  const blobUrl = URL.createObjectURL(blob);
  const audio = new Audio(blobUrl);
  currentAudio = audio;
  
  audio.onended = () => {
    URL.revokeObjectURL(blobUrl);
    currentAudio = null;
  };
  
  audio.onerror = (error) => {
    console.error('音声再生エラー:', error);
    URL.revokeObjectURL(blobUrl);
    currentAudio = null;
    showStatus('音声の再生中にエラーが発生しました', 'error');
  };
  
  audio.play();
}
// グローバル変数
const db = AudioDatabase.getInstance();
let currentAudio = null;
let currentAudioId = null;
let audioFiles = [];
let lastRefreshTime = 0;
const REFRESH_INTERVAL = 3000; // 3秒ごとに更新

document.addEventListener('DOMContentLoaded', async () => {
  console.log('History page loaded - Initializing...');
  
  try {
    // データベースの状態を詳細に確認
    const dbState = await db.checkDatabaseState();
    console.log('Database state:', dbState);

    // データベースの初期化を確認
    await db.openDB();
    console.log('Database connection established');

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
        await loadAudioList();
        
        showStatus('音声一覧を更新しました', 'success');
      } catch (error) {
        console.error('Failed to refresh audio list:', error);
        showStatus('更新に失敗しました: ' + error.message, 'error');
      } finally {
        refreshButton.disabled = false;
        refreshButton.innerHTML = '<i class="material-icons">refresh</i>更新';
      }
    });

    // メッセージリスナーの登録 (バックグラウンドからの更新メッセージを受け取る)
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      console.log('Received message in history page:', message);
      
      if (message.action === 'refreshOptionsPage') {
        console.log('Refresh message received from content script:', message.timestamp);
        
        // 即座に応答を返す
        sendResponse({ success: true });
        
        // 少し遅延してからデータ読み込み
        setTimeout(async () => {
          try {
            await loadAudioList();
            console.log('History page refreshed successfully');
          } catch (err) {
            console.error('Error refreshing history page:', err);
          }
        }, 500);
        
        return true; // 非同期レスポンスのためにtrueを返す
      }
    });

    // 初期データ読み込み
    console.log('Starting initial audio list load');
    await loadAudioList();
    console.log('Initial audio list load completed');
    
    // 定期的な更新
    setInterval(async () => {
      const now = Date.now();
      if (now - lastRefreshTime > REFRESH_INTERVAL) {
        console.log('Auto-refreshing audio list');
        await loadAudioList();
        lastRefreshTime = now;
      }
    }, REFRESH_INTERVAL);
    
  } catch (error) {
    console.error('Error during initialization:', error);
    showStatus('初期化中にエラーが発生しました: ' + error.message, 'error');
  }
});

// ステータスメッセージを表示
function showStatus(message, type) {
  const status = document.getElementById('status');
  if (!status) return;
  
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
    
    // 更新時間を記録
    lastRefreshTime = Date.now();
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
    
    try {
      const audioData = await db.getAudio(previousAudio.id);
      if (audioData && audioData.blob) {
        playAudio(audioData.blob);
      }
    } catch (error) {
      console.error('Failed to play previous audio:', error);
      showStatus('前の音声の再生に失敗しました', 'error');
    }
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
    
    try {
      const audioData = await db.getAudio(nextAudio.id);
      if (audioData && audioData.blob) {
        playAudio(audioData.blob);
      }
    } catch (error) {
      console.error('Failed to play next audio:', error);
      showStatus('次の音声の再生に失敗しました', 'error');
    }
  }
}
