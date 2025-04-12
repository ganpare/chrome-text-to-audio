
/**
 * Ankiエクスポート機能をデバッグするための単体テストスクリプト
 * options.jsの一部を取り出してテストします
 */

// テスト用のオーディオデータ
const testAudios = [
  {
    id: 1,
    text: "Hello, this is a test audio file",
    translation: "こんにちは、これはテスト音声ファイルです",
    timestamp: Date.now(),
    fileSize: 12345,
    voiceType: "af_heart"
  },
  {
    id: 2,
    text: "The quick brown fox jumps over the lazy dog",
    translation: "素早い茶色のキツネは怠け者の犬を飛び越える",
    timestamp: Date.now() - 86400000, // 1日前
    fileSize: 23456,
    voiceType: "am_adam"
  }
];

// ステータスメッセージを表示
function showStatus(message, type) {
  console.log(`[${type}] ${message}`);
}

// ダミー音声ファイル（WAV）を作成
function createDummyWavBlob() {
  // 単純な正弦波を持つWAVファイルのヘッダとデータを作成
  const sampleRate = 44100;
  const seconds = 1;
  
  // WAVヘッダ
  const headerView = new DataView(new ArrayBuffer(44));
  
  // "RIFF"識別子
  headerView.setUint8(0, 'R'.charCodeAt(0));
  headerView.setUint8(1, 'I'.charCodeAt(0));
  headerView.setUint8(2, 'F'.charCodeAt(0));
  headerView.setUint8(3, 'F'.charCodeAt(0));
  
  // ファイルサイズからRIFFヘッダサイズを引いた値（36 + PCMデータの長さ）
  headerView.setUint32(4, 36 + sampleRate * seconds * 2, true);
  
  // "WAVE"形式
  headerView.setUint8(8, 'W'.charCodeAt(0));
  headerView.setUint8(9, 'A'.charCodeAt(0));
  headerView.setUint8(10, 'V'.charCodeAt(0));
  headerView.setUint8(11, 'E'.charCodeAt(0));
  
  // "fmt "チャンク
  headerView.setUint8(12, 'f'.charCodeAt(0));
  headerView.setUint8(13, 'm'.charCodeAt(0));
  headerView.setUint8(14, 't'.charCodeAt(0));
  headerView.setUint8(15, ' '.charCodeAt(0));
  
  // fmtチャンクのサイズ
  headerView.setUint32(16, 16, true);
  // オーディオフォーマット（1はPCM）
  headerView.setUint16(20, 1, true);
  // チャンネル数
  headerView.setUint16(22, 1, true);
  // サンプルレート
  headerView.setUint32(24, sampleRate, true);
  // バイトレート (サンプルレート * チャンネル数 * ビット深度 / 8)
  headerView.setUint32(28, sampleRate * 1 * 16 / 8, true);
  // ブロックアライン (チャンネル数 * ビット深度 / 8)
  headerView.setUint16(32, 1 * 16 / 8, true);
  // ビット深度
  headerView.setUint16(34, 16, true);
  
  // "data"チャンク
  headerView.setUint8(36, 'd'.charCodeAt(0));
  headerView.setUint8(37, 'a'.charCodeAt(0));
  headerView.setUint8(38, 't'.charCodeAt(0));
  headerView.setUint8(39, 'a'.charCodeAt(0));
  
  // データチャンクのサイズ
  headerView.setUint32(40, sampleRate * seconds * 2, true);
  
  // 音声データ（簡単な正弦波）
  const samples = sampleRate * seconds;
  const dataView = new DataView(new ArrayBuffer(samples * 2));
  
  for (let i = 0; i < samples; i++) {
    // 440Hz（A4音）の正弦波を生成
    const value = Math.sin(2 * Math.PI * 440 * i / sampleRate) * 0x7FFF;
    dataView.setInt16(i * 2, value, true);
  }
  
  // ヘッダとデータを結合
  return new Blob([headerView.buffer, dataView.buffer], { type: "audio/wav" });
}

// テスト用のBlob追加
testAudios.forEach(audio => {
  audio.blob = createDummyWavBlob();
});

// 一括Ankiエクスポート機能
async function exportAllToAnki(filteredAudios = []) {
  try {
    console.log("=== exportAllToAnki開始 ===");
    console.log(`${filteredAudios.length}件のオーディオファイルをエクスポートします`);
    
    if (!filteredAudios || filteredAudios.length === 0) {
      throw new Error('エクスポートする音声がありません');
    }

    // JSZipライブラリを読み込む
    let JSZip;
    try {
      console.log("JSZipライブラリの読み込みを試行...");
      JSZip = window.JSZip;
      if (!JSZip) {
        console.error('window.JSZipが見つかりません。直接JSZipを試します。');
        if (typeof jszip !== 'undefined') {
          JSZip = jszip;
        } else if (typeof JSZip !== 'undefined') {
          JSZip = JSZip;
        }
      }
      if (!JSZip) {
        throw new Error('ZIPライブラリが見つかりません');
      }
      console.log("JSZipライブラリの読み込み成功", JSZip.version || '不明なバージョン');
    } catch (error) {
      console.error('JSZipの読み込みエラー:', error);
      throw new Error('ZIPライブラリの初期化に失敗しました: ' + error.message);
    }

    // 新しいZIPアーカイブを作成
    console.log("新しいZIPアーカイブを作成...");
    const zip = new JSZip();

    // タブ区切りテキストデータを準備
    let txtContent = '';
    let audioFilesCount = 0;

    // 各音声を処理
    for (const audio of filteredAudios) {
      console.log(`音声ID ${audio.id} を処理中...`);
      
      // ファイル名を生成（テキストの先頭20文字を使用）
      const textPrefix = audio.text 
        ? audio.text.substring(0, 20).replace(/[^\w\s]/gi, '').trim() 
        : 'audio';
      const timestamp = new Date(audio.timestamp).toISOString().split('T')[0];
      const audioFileName = `${textPrefix}_${timestamp}.wav`;

      // タブ区切りの行を追加 (英語テキスト、日本語テキスト、Ankiの[sound:ファイル名]形式)
      const translation = audio.translation || ''; // 翻訳がない場合は空文字
      txtContent += `${audio.text}\t${translation}\t[sound:${audioFileName}]\n`;

      // 音声ファイルをZIPに追加
      console.log(`音声ファイル "${audioFileName}" をZIPに追加...`);
      zip.file(audioFileName, audio.blob);
      audioFilesCount++;
    }

    // テキストファイルをZIPに追加
    const txtFileName = `anki_import_all_${Date.now()}.txt`;
    console.log(`テキストファイル "${txtFileName}" をZIPに追加...`);
    zip.file(txtFileName, txtContent);

    console.log('ZIPファイル生成開始...');
    console.log('圧縮対象ファイル数:', audioFilesCount);
    
    try {
      // ZIPファイルを生成
      console.log('zip.generateAsync呼び出し前');
      const zipBlob = await zip.generateAsync({ 
        type: 'blob',
        compression: 'DEFLATE',
        compressionOptions: { level: 5 }
      });
      console.log('ZIPファイル生成完了:', zipBlob.size, 'バイト');

      // ZIPファイルをダウンロード
      const zipUrl = URL.createObjectURL(zipBlob);
      console.log('URLオブジェクト作成:', zipUrl);
      
      const zipLink = document.createElement('a');
      zipLink.href = zipUrl;
      zipLink.download = `anki_export_${Date.now()}.zip`;
      console.log('ダウンロードリンク作成:', zipLink.download);
      
      // 見えるように表示して、クリックのトラブルを回避
      zipLink.style.display = 'none';
      document.body.appendChild(zipLink);
      console.log('リンクをDOM追加完了');
      
      // クリックをトリガー
      console.log('click()呼び出し前');
      zipLink.click();
      console.log('click()呼び出し完了');
      
      // 少し待ってからクリーンアップ（即時削除だとダウンロードが始まらないことがある）
      setTimeout(() => {
        document.body.removeChild(zipLink);
        URL.revokeObjectURL(zipUrl);
        console.log('クリーンアップ完了');
      }, 1000);
    } catch (zipError) {
      console.error('ZIPファイル生成中のエラー:', zipError);
      showStatus(`ZIPファイル生成エラー: ${zipError.message}`, 'error');
      throw zipError;
    }

    showStatus(`${audioFilesCount}件の音声データと1件のテキストファイルをZIPアーカイブにエクスポートしました。`, 'success');
    console.log("=== exportAllToAnki完了 ===");
    return true;
  } catch (error) {
    console.error('Ankiエクスポートエラー:', error);
    showStatus(`Ankiエクスポートに失敗しました: ${error.message}`, 'error');
    return false;
  }
}

// テスト実行のためのHTMLページ
function injectTestButton() {
  const testButton = document.createElement('button');
  testButton.textContent = 'テストエクスポート実行';
  testButton.style.padding = '10px';
  testButton.style.margin = '20px';
  testButton.style.fontSize = '16px';
  testButton.style.backgroundColor = '#4CAF50';
  testButton.style.color = 'white';
  testButton.style.border = 'none';
  testButton.style.cursor = 'pointer';
  testButton.style.borderRadius = '4px';
  
  testButton.onclick = async () => {
    console.log('テストエクスポート開始...');
    await exportAllToAnki(testAudios);
  };
  
  document.body.appendChild(testButton);
  console.log('テストボタンを追加しました');
}

// ページ読み込み完了時にテストボタンを挿入
document.addEventListener('DOMContentLoaded', injectTestButton);
