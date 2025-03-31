
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
