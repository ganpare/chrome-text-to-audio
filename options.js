const db = new AudioDatabase();
let currentAudio = null;

document.addEventListener('DOMContentLoaded', async () => {
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
  await loadAudioList();
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
  const audioList = document.getElementById('audioList');
  const loading = document.querySelector('.loading');

  try {
    loading.classList.add('active');
    audioList.innerHTML = '';

    const audioFiles = await db.getAudioList();
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

    for (const audio of filteredFiles) {
      const item = document.createElement('div');
      item.className = 'audio-item';

      const text = document.createElement('div');
      text.className = 'audio-text';
      text.textContent = audio.text;

      const metadata = document.createElement('div');
      metadata.className = 'audio-metadata';
      metadata.innerHTML = `
        <i class="material-icons">schedule</i>
        ${new Date(audio.timestamp).toLocaleString()}
      `;

      const controls = document.createElement('div');
      controls.className = 'audio-controls';

      const playButton = document.createElement('button');
      playButton.className = 'play-button';
      playButton.innerHTML = '<i class="material-icons">play_arrow</i>再生';
      playButton.onclick = () => playAudio(audio.blob);

      const deleteButton = document.createElement('button');
      deleteButton.className = 'delete-button';
      deleteButton.innerHTML = '<i class="material-icons">delete</i>削除';
      deleteButton.onclick = async () => {
        if (confirm('この音声を削除してもよろしいですか？')) {
          await db.deleteAudio(audio.id);
          await loadAudioList(searchQuery);
          showStatus('音声を削除しました', 'success');
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
    console.error('Failed to load audio list:', error);
    audioList.innerHTML = `
      <div class="empty-state">
        <i class="material-icons">error</i>
        <p>音声の読み込みに失敗しました</p>
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
  }
  
  const audio = new Audio(URL.createObjectURL(blob));
  currentAudio = audio;
  
  audio.onended = () => {
    URL.revokeObjectURL(audio.src);
    currentAudio = null;
  };

  audio.play().catch(error => {
    console.error('Failed to play audio:', error);
    showStatus('音声の再生に失敗しました', 'error');
  });
}
