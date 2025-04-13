
// JSZipデバッグ用テストスクリプト
document.addEventListener('DOMContentLoaded', async function() {
  // デバッグ用コンソールクリア
  console.clear();
  console.log('JSZipデバッグテスト開始...');

  // JSZip確認ボタン
  document.getElementById('testJSZip').addEventListener('click', async function() {
    try {
      console.log('JSZip確認中...');
      console.log('グローバルJSZip:', typeof JSZip !== 'undefined' ? '利用可能' : '未定義');
      console.log('window.JSZip:', typeof window.JSZip !== 'undefined' ? '利用可能' : '未定義');
      
      if (typeof JSZip === 'undefined') {
        console.log('JSZipを読み込み中...');
        
        await new Promise((resolve, reject) => {
          const script = document.createElement('script');
          script.src = 'jszip.min.js';
          script.onload = () => {
            console.log('JSZip読み込み成功!');
            resolve();
          };
          script.onerror = (e) => {
            console.error('JSZip読み込み失敗:', e);
            reject(new Error('JSZipスクリプトの読み込みに失敗しました'));
          };
          document.head.appendChild(script);
        });
        
        console.log('読み込み後のJSZip状態:', typeof JSZip !== 'undefined' ? '利用可能' : '未定義');
      }
      
      if (typeof JSZip !== 'undefined') {
        console.log('JSZipバージョン:', JSZip.version);
        document.getElementById('status').textContent = `JSZip利用可能 (バージョン: ${JSZip.version})`;
        document.getElementById('status').style.color = 'green';
      } else {
        document.getElementById('status').textContent = 'JSZipが利用できません';
        document.getElementById('status').style.color = 'red';
      }
      
    } catch (error) {
      console.error('JSZip確認エラー:', error);
      document.getElementById('status').textContent = `エラー: ${error.message}`;
      document.getElementById('status').style.color = 'red';
    }
  });

  // 簡単なZIPファイル作成テスト
  document.getElementById('createZip').addEventListener('click', async function() {
    try {
      document.getElementById('status').textContent = 'ZIPファイル生成中...';
      
      if (typeof JSZip === 'undefined') {
        throw new Error('JSZipが利用できません');
      }
      
      // 新しいZIPを作成
      const zip = new JSZip();
      
      // ファイルを追加
      zip.file("hello.txt", "Hello World!");
      zip.file("test.json", JSON.stringify({test: "データ"}));
      
      // フォルダを作成
      const imgFolder = zip.folder("images");
      
      // シンプルな画像データ（1x1 px透明PNG）
      const base64Image = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";
      imgFolder.file("pixel.png", base64Image, {base64: true});
      
      // ZIPを生成
      console.time('ZIPファイル生成');
      const zipBlob = await zip.generateAsync({type: "blob"});
      console.timeEnd('ZIPファイル生成');
      
      console.log('ZIPファイル生成完了:', zipBlob.size, 'バイト');
      
      // ダウンロードリンク作成
      const url = URL.createObjectURL(zipBlob);
      const a = document.createElement('a');
      a.href = url;
      a.download = "debug-test.zip";
      document.body.appendChild(a);
      a.click();
      
      // クリーンアップ
      setTimeout(() => {
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }, 100);
      
      document.getElementById('status').textContent = `成功: ZIPファイル (${zipBlob.size} バイト) を生成しました`;
      document.getElementById('status').style.color = 'green';
      
    } catch (error) {
      console.error('ZIPファイル生成エラー:', error);
      document.getElementById('status').textContent = `エラー: ${error.message}`;
      document.getElementById('status').style.color = 'red';
    }
  });
});
