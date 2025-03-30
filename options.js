const db = AudioDatabase.getInstance();
let currentAudio = null;

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
    const audioFiles = await db.getAudioList();
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

    // 初期データ読み込み
    console.log('Starting initial audio list load');
    await loadAudioList();
    console.log('Initial audio list load completed');
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

  try {
    loading.classList.add('active');
    audioList.innerHTML = '';

    // データベースの状態を確認
    const dbState = await db.checkDatabaseState();
    console.log('Database state:', dbState);

    console.log('Fetching audio list from database...');
    const audioFiles = await db.getAudioList();
    console.log('Retrieved audio files:', audioFiles);

    const filteredFiles = searchQuery
      ? audioFiles.filter(audio => 
          audio.text.toLowerCase().includes(searchQuery.toLowerCase()))
      : audioFiles;
    
    console.log('Filtered audio files:', filteredFiles);

    if (filteredFiles.length === 0) {
      console.log('No audio files found');
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

    console.log('Rendering audio items...');
    for (const audio of filteredFiles) {
      console.log('Creating element for audio:', audio);
      const item = document.createElement('div');
      item.className = 'audio-item';

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

      const playButton = document.createElement('button');
      playButton.className = 'play-button';
      playButton.innerHTML = '<i class="material-icons">play_arrow</i>再生';
      playButton.onclick = async () => {
        try {
          playButton.disabled = true;
          const audioData = await db.getAudio(audio.id);
          if (audioData && audioData.blob) {
            await playAudio(audioData.blob);
            playButton.innerHTML = '<i class="material-icons">pause</i>一時停止';
          } else {
            throw new Error('音声データが見つかりません');
          }
        } catch (error) {
          console.error('Failed to play audio:', error);
          showStatus('音声の再生に失敗しました: ' + error.message, 'error');
        } finally {
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
            console.error('Failed to delete audio:', error);
            showStatus('音声の削除に失敗しました', 'error');
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
    console.error('Error in loadAudioList:', error);
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
async function playAudio(blob) {
  if (currentAudio) {
    currentAudio.pause();
    URL.revokeObjectURL(currentAudio.src);
    currentAudio = null;
  }
  
  try {
    const blobUrl = URL.createObjectURL(blob);
    const audio = new Audio(blobUrl);
    currentAudio = audio;
    
    audio.onended = () => {
      URL.revokeObjectURL(blobUrl);
      currentAudio = null;
    };

    audio.onerror = (error) => {
      URL.revokeObjectURL(blobUrl);
      currentAudio = null;
      console.error('Audio playback error:', error);
      throw new Error('音声の再生中にエラーが発生しました');
    };

    await audio.play();
  } catch (error) {
    console.error('Failed to play audio:', error);
    showStatus('音声の再生に失敗しました: ' + error.message, 'error');
  }
}
