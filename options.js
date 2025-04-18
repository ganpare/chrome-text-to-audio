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


// 一括Ankiエクスポート機能
async function exportAllToAnki(filteredAudios = []) {
  try {
    if (!filteredAudios || filteredAudios.length === 0) {
      // フィルタリングされていない場合は全ての音声を取得
      filteredAudios = await db.getAudioList();
    }

    if (filteredAudios.length === 0) {
      throw new Error('エクスポートする音声がありません');
    }

    // JSZipライブラリが読み込まれているか確認
    if (typeof JSZip === 'undefined') {
      console.log('JSZipが見つかりません。読み込みを試みます');

      try {
        // 明示的にJSZipを読み込み
        await new Promise((resolve, reject) => {
          const scriptTag = document.createElement('script');
          scriptTag.src = chrome.runtime.getURL('jszip.min.js');
          scriptTag.onload = () => {
            console.log('JSZipライブラリを読み込みました');
            resolve();
          };
          scriptTag.onerror = () => {
            reject(new Error('JSZipライブラリの読み込みに失敗しました'));
          };
          document.head.appendChild(scriptTag);
        });
      } catch (error) {
        console.error('JSZipの読み込みエラー:', error);
        throw new Error('ZIPライブラリの読み込みに失敗しました: ' + error.message);
      }
    }

    // 再度確認
    if (typeof JSZip === 'undefined') {
      throw new Error('JSZipライブラリが利用できません');
    }

    console.log('JSZipの初期化成功:', JSZip.version || 'バージョン不明');

    console.log('JSZipバージョン確認:', JSZip.version);

    // 新しいZIPを作成
    console.log('新しいZIPオブジェクトを作成中...');
    const zip = new JSZip();
    console.log('ZIPオブジェクト作成成功:', typeof zip, '生成メソッド存在確認:', typeof zip.generateAsync);

    // タブ区切りテキストデータを準備
    let txtContent = '';
    let audioFilesCount = 0;

    console.log('フィルタ済み音声数:', filteredAudios.length);

    // 各音声を処理
    for (let i = 0; i < filteredAudios.length; i++) {
      const audio = filteredAudios[i];
      console.log(`音声処理中... ${i+1}/${filteredAudios.length} (ID: ${audio.id})`);

      // 音声データをblobとして取得
      let audioData;
      if (audio.blob) {
        console.log(`音声ID ${audio.id} はすでにblob形式です。サイズ: ${audio.blob.size} バイト`);
        audioData = audio.blob;
      } else {
        console.log(`音声ID ${audio.id} のblob形式を取得中...`);
        const fullAudio = await db.getAudio(audio.id);
        if (!fullAudio || !fullAudio.blob) {
          console.warn(`音声ID ${audio.id} のblobデータが見つかりません。スキップします。`);
          continue;
        }
        audioData = fullAudio.blob;
        console.log(`音声ID ${audio.id} のblob取得成功。サイズ: ${audioData.size} バイト`);
      }

      // ファイル名を生成（テキストの先頭20文字を使用）
      const textPrefix = audio.text 
        ? audio.text.substring(0, 20).replace(/[^\w\s]/gi, '').trim() 
        : 'audio';
      const timestamp = new Date(audio.timestamp).toISOString().split('T')[0];
      const audioFileName = `${textPrefix}_${timestamp}.wav`;
      console.log(`ファイル名生成: "${audioFileName}"`);

      // タブ区切りの行を追加 (英語テキスト、日本語テキスト、Ankiの[sound:ファイル名]形式)
      const translation = audio.translation || ''; // 翻訳がない場合は空文字
      txtContent += `${audio.text}\t${translation}\t[sound:${audioFileName}]\n`;

      // 音声ファイルをZIPに追加
      console.log(`ZIPに音声ファイル "${audioFileName}" を追加中... (サイズ: ${audioData.size} バイト)`);
      try {
        zip.file(audioFileName, audioData);
        console.log(`音声ファイル "${audioFileName}" を追加完了`);
        audioFilesCount++;
      } catch (fileError) {
        console.error(`音声ファイル "${audioFileName}" の追加に失敗:`, fileError);
      }
    }

    // テキストファイルをZIPに追加
    const txtFileName = `anki_import_all_${Date.now()}.txt`;
    console.log(`テキストファイル "${txtFileName}" をZIPに追加中... (サイズ: ${txtContent.length} バイト)`);
    zip.file(txtFileName, txtContent);
    console.log(`テキストファイル追加完了`);

    console.log('ZIPファイル生成開始...');
    console.log('圧縮対象ファイル数:', audioFilesCount);

    try {
      // シンプル化されたZIPファイル生成処理
      console.log('ZIPオブジェクト状態確認:', 
               'ファイル数:', Object.keys(zip.files).length, 
               'generateAsyncメソッド存在:', typeof zip.generateAsync === 'function');

      // まず、小さなテストを行う - テキストファイルだけを含むZIPを生成
      console.log('テキストファイルのみでZIP生成テスト...');
      const testZip = new JSZip();
      testZip.file('test.txt', 'テストファイル内容');

      console.log('テストZIP生成中...');
      const testBlob = await testZip.generateAsync({
        type: 'blob',
        compression: 'STORE', // 圧縮なし
      });
      console.log('テストZIP生成成功:', testBlob.size, 'バイト');

      // 実際のZIP生成 - 圧縮レベルを無効化
      console.log('実際のZIPファイル生成開始（圧縮なし）...');
      const zipBlob = await zip.generateAsync({ 
        type: 'blob',
        compression: 'STORE', // 圧縮なし - 問題を回避するため
      });
      console.log('ZIPファイル生成完了:', zipBlob.size, 'バイト');

      // ZIPファイルをダウンロード - より明示的なステップ
      console.log('ダウンロードリンク生成中...');
      const zipUrl = URL.createObjectURL(zipBlob);

      const zipLink = document.createElement('a');
      zipLink.href = zipUrl;
      zipLink.download = `anki_export_${Date.now()}.zip`;
      zipLink.textContent = 'ダウンロード'; // デバッグ用に見えるようにする
      zipLink.style.position = 'fixed';
      zipLink.style.top = '10px';
      zipLink.style.right = '10px';
      zipLink.style.zIndex = '9999';
      zipLink.style.background = 'green';
      zipLink.style.color = 'white';
      zipLink.style.padding = '5px';
      document.body.appendChild(zipLink);
      console.log('リンクをDOM追加完了 - 見えるようにしました');

      // クリックイベント
      console.log('click()呼び出し');
      zipLink.click();

      // 少し長めに待ってからクリーンアップ
      setTimeout(() => {
        document.body.removeChild(zipLink);
        URL.revokeObjectURL(zipUrl);
        console.log('クリーンアップ完了');
      }, 3000); // 3秒待つ


    } catch (zipError) {
      console.error('ZIPファイル生成中のエラー:', zipError);
      showStatus(`ZIPファイル生成エラー: ${zipError.message}`, 'error');
      throw zipError;
    }

    showStatus(`${audioFilesCount}件の音声データと1件のテキストファイルをZIPアーカイブにエクスポートしました。`, 'success');
    return true;
  } catch (error) {
    handleError(error, 'Ankiエクスポートに失敗しました');
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

  // テキスト部分（元の英語テキスト）
  const text = document.createElement('div');
  text.className = 'audio-text';
  text.textContent = audio.text || 'テキストなし';

  // 翻訳テキスト部分（日本語訳）
  const translation = document.createElement('div');
  translation.className = 'audio-translation';

  // 翻訳テキストがある場合は表示、ない場合は編集ボタンのみ表示
  if (audio.translation) {
    translation.innerHTML = `
      <div class="translation-text">${audio.translation}</div>
      <button class="edit-translation-button" title="翻訳を編集">
        <i class="material-icons">edit</i>
      </button>
    `;
  } else {
    translation.innerHTML = `
      <div class="translation-placeholder">翻訳なし</div>
      <button class="add-translation-button" title="翻訳を追加">
        <i class="material-icons">translate</i>追加
      </button>
    `;
  }

  // 翻訳編集ボタンのイベントハンドラ
  const editButton = translation.querySelector('.edit-translation-button, .add-translation-button');
  if (editButton) {
    editButton.addEventListener('click', () => {
      const currentTranslation = audio.translation || '';
      const newTranslation = prompt('日本語訳を入力してください:', currentTranslation);

      if (newTranslation !== null) {
        updateTranslation(audio.id, newTranslation);
      }
    });
  }

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

  // Ankiエクスポートボタン
  const ankiExportButton = createButton('anki-export-button', 'text_snippet', 'Ankiエクスポート', async () => {
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

      // 音声ファイル名の生成（テキストの先頭20文字を使用）
      const textPrefix = audio.text 
        ? audio.text.substring(0, 20).replace(/[^\w\s]/gi, '').trim() 
        : 'audio';
      const audioFileName = `${textPrefix}_${new Date(audio.timestamp).toISOString().split('T')[0]}.wav`;

      // 音声ファイルをダウンロード
      const audioUrl = URL.createObjectURL(blob);
      const audioLink = document.createElement('a');
      audioLink.href = audioUrl;
      audioLink.download = audioFileName;
      document.body.appendChild(audioLink);
      audioLink.click();

      // タブ区切りテキストデータの作成（ヘッダーなし）
      const translation = audio.translation || ''; // 翻訳がない場合は空文字
      const txtContent = `${audio.text}\t${translation}\t[sound:${audioFileName}]`;
      const txtBlob = new Blob([txtContent], { type: 'text/plain;charset=utf-8;' });
      const txtUrl = URL.createObjectURL(txtBlob);

      // テキストファイルをダウンロード
      const txtLink = document.createElement('a');
      txtLink.href = txtUrl;
      txtLink.download = `anki_import_${textPrefix}.txt`;
      document.body.appendChild(txtLink);
      txtLink.click();

      // クリーンアップ
      setTimeout(() => {
        document.body.removeChild(audioLink);
        document.body.removeChild(txtLink);
        URL.revokeObjectURL(audioUrl);
        URL.revokeObjectURL(txtUrl);
      }, 100);

      showStatus('エクスポートが完了しました。音声ファイルとテキストファイルをAnkiにインポートしてください。', 'success');
    } catch (error) {
      handleError(error, 'エクスポートに失敗しました');
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
  controls.appendChild(ankiExportButton);
  controls.appendChild(deleteButton);

  item.appendChild(text);
  item.appendChild(translation);
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
    const deeplApiKey = document.getElementById('deeplApiKey').value.trim();
    const voiceType = document.getElementById('voiceType').value;
    const autoTranslate = document.getElementById('autoTranslate').checked;

    if (!apiKey) {
      showStatus('APIキーを入力してください', 'error');
      return;
    }

    try {
      await chrome.storage.sync.set({
        falApiKey: apiKey,
        deeplApiKey: deeplApiKey,
        voiceType: voiceType,
        autoTranslate: autoTranslate
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

// 翻訳テキストを更新する関数
async function updateTranslation(audioId, newTranslation) {
  try {
    // 全てのデータを取得
    let audios = await db.getAudioList();

    // 該当するオーディオを探す
    const audioIndex = audios.findIndex(a => a.id === audioId);

    if (audioIndex === -1) {
      throw new Error('音声データが見つかりません');
    }

    // 翻訳を更新
    audios[audioIndex].translation = newTranslation;

    // 保存
    await chrome.storage.local.set({ [db.storageKey]: audios });

    // UIを更新
    await loadAudioList(document.getElementById('searchInput').value);

    showStatus('翻訳を更新しました', 'success');
    return true;
  } catch (error) {
      handleError(error, '翻訳の更新に失敗しました');
      return false;
  }
}

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

  // 一括Ankiエクスポートボタン
  const ankiExportAllButton = document.getElementById('ankiExportAllButton');
  if (ankiExportAllButton) {
    ankiExportAllButton.addEventListener('click', async () => {
      try {
        updateButtonState(ankiExportAllButton, true, 'Ankiエクスポート', 'エクスポート中...', 'school');

        // 現在のフィルター条件を取得
        const searchQuery = document.getElementById('searchInput').value;
        const voiceFilter = document.getElementById('voiceFilter').value;
        const sortOrder = document.getElementById('sortOrder').value;

        // フィルタリングされた音声リストを取得
        const audioList = await db.getAudioList();
        const filteredList = applyFilters(audioList, searchQuery, voiceFilter, sortOrder);

        if (filteredList.length === 0) {
          throw new Error('エクスポートする音声がありません');
        }

        if (filteredList.length > 50) {
          if (!confirm(`${filteredList.length}件の音声をエクスポートします。大量の音声ファイルがダウンロードされますが、続行しますか？`)) {
            return;
          }
        } else if (!confirm(`${filteredList.length}件の音声をAnki形式でエクスポートします。続行しますか？`)) {
          return;
        }

        await exportAllToAnki(filteredList);
      } catch (error) {
        handleError(error, 'Ankiエクスポートに失敗しました');
      } finally {
        updateButtonState(ankiExportAllButton, false, 'Ankiエクスポート', 'エクスポート中...', 'school');
      }
    });
  }

  // 一括翻訳ボタン
  const batchTranslateButton = document.getElementById('batchTranslateButton');
  if (batchTranslateButton) {
    batchTranslateButton.addEventListener('click', async () => {
      // 一括翻訳処理を実装する
      alert('一括翻訳機能はまだ実装されていません'); // Placeholder
    });
  }


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
    const result = await chrome.storage.sync.get(['falApiKey', 'deeplApiKey', 'voiceType', 'autoTranslate']);
    if (result.falApiKey) {
      document.getElementById('apiKey').value = result.falApiKey;
    }
    if (result.deeplApiKey) {
      document.getElementById('deeplApiKey').value = result.deeplApiKey;
    }
    if (result.voiceType) {
      document.getElementById('voiceType').value = result.voiceType;
    }
    if (result.autoTranslate !== undefined) {
      document.getElementById('autoTranslate').checked = result.autoTranslate;
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