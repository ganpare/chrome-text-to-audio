// Function to get API key from storage
async function getFalApiKey() {
  const result = await chrome.storage.sync.get('falApiKey');
  return result.falApiKey;
}

// Function to show error in the active tab
async function showErrorMessage(message) {
  const tabs = await chrome.tabs.query({active: true, currentWindow: true});
  if (tabs[0]?.id) {
    try {
      await chrome.tabs.sendMessage(tabs[0].id, {
        action: "showError",
        error: message
      });
    } catch (error) {
      console.error('Failed to show error message:', error);
    }
  }
}

// Function to wait
const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Function to format URL for logging
function formatUrl(url) {
  try {
    const parsed = new URL(url);
    return `${parsed.protocol}//${parsed.host}${parsed.pathname}`;
  } catch (e) {
    return url;
  }
}

// Function to get result from response URL
async function getResponseResult(responseUrl, apiKey) {
  console.log('=== Getting result from response URL ===');
  console.log('URL:', formatUrl(responseUrl));
  
  try {
    const response = await fetch(responseUrl, {
      method: 'GET',
      headers: {
        'Authorization': `Key ${apiKey}`,
        'Accept': 'application/json'
      }
    });

    console.log('Response status:', response.status);
    console.log('Response headers:', Object.fromEntries(response.headers));

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Error response:', errorText);
      throw new Error(`Failed to get result: ${response.status} - ${errorText}`);
    }

    const result = await response.json();
    console.log('Response result:', JSON.stringify(result, null, 2));
    return result;
  } catch (error) {
    console.error('Error in getResponseResult:', error);
    throw error;
  }
}

// Function to poll status until completion
async function pollStatus(statusUrl, responseUrl, apiKey, maxAttempts = 30) {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    console.log(`\n=== Polling attempt ${attempt + 1}/${maxAttempts} ===`);
    console.log('Status URL:', formatUrl(statusUrl));
    
    try {
      const response = await fetch(statusUrl, {
        method: 'GET',
        headers: {
          'Authorization': `Key ${apiKey}`,
          'Accept': 'application/json'
        }
      });

      console.log('Status response code:', response.status);

      if (!response.ok) {
        const errorText = await response.text();
        console.error('Status check error:', errorText);
        throw new Error(`Status check failed: ${response.status} - ${errorText}`);
      }

      const status = await response.json();
      console.log('Status check result:', JSON.stringify(status, null, 2));

      if (status.status === 'COMPLETED') {
        // ステータスが完了したら、response_urlから結果を取得して処理
        const result = await getResponseResult(responseUrl, apiKey);
        
        // 処理結果の検証
        if (result) {
          console.log('Processing completed successfully');
          return result;
        } else {
          throw new Error('空の結果が返されました');
        }
      } else if (status.status === 'FAILED') {
        throw new Error('処理が失敗しました: ' + (status.error || '不明なエラー'));
      } else {
        console.log('Current status:', status.status);
      }
    } catch (error) {
      console.error('Error during status check:', error);
      throw error;
    }

    // Wait before next attempt
    await wait(1000);
  }
  throw new Error('タイムアウト: 処理が完了しませんでした');
}

// Setup context menu
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: "kokoroTTS-read",
    title: "選択テキストをKokoroTTSで読み上げ",
    contexts: ["selection"]
  });
});

// Handle context menu clicks
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId === "kokoroTTS-read" && info.selectionText) {
    const apiKey = await getFalApiKey();
    if (!apiKey) {
      console.log('No API key found, opening options page');
      chrome.runtime.openOptionsPage();
      await showErrorMessage('APIキーが設定されていません。設定画面で入力してください。');
      return;
    }

    try {
      console.log('\n=== Starting new TTS request ===');
      console.log('Selected text:', info.selectionText);

      const apiUrl = 'https://queue.fal.run/fal-ai/kokoro/american-english';
      console.log('API URL:', formatUrl(apiUrl));

      const requestBody = {
        prompt: info.selectionText,
        voice: "af_heart"
      };
      console.log('Request body:', JSON.stringify(requestBody, null, 2));

      // Initial request to queue the job
      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Key ${apiKey}`,
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify(requestBody)
      });

      console.log('Initial response status:', response.status);

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`API request failed: ${response.status} - ${errorText}`);
      }

      const queueResult = await response.json();
      console.log('Queue response:', JSON.stringify(queueResult, null, 2));

      if (!queueResult.status_url || !queueResult.response_url) {
        console.error('Missing URLs in response:', queueResult);
        throw new Error('必要な情報が見つかりません');
      }

      // Poll until job is complete and get result
      const result = await pollStatus(queueResult.status_url, queueResult.response_url, apiKey);
      console.log('\n=== Final result ===');
      console.log('Result type:', typeof result);
      console.log('Result structure:', JSON.stringify(result, null, 2));
      console.log('Available properties:', Object.keys(result));
      if (result.audio) {
        console.log('Audio object properties:', Object.keys(result.audio));
      }

      // Extract audio URL from result
      let audioUrl;
      if (typeof result === 'string') {
        audioUrl = result;
        console.log('Result is direct URL');
      } else if (result.audio_url) {
        audioUrl = result.audio_url;
        console.log('Found audio_url in root');
      } else if (result.audio?.url) {
        audioUrl = result.audio.url;
        console.log('Found URL in audio.url');
      } else if (result.output?.url) {
        audioUrl = result.output.url;
        console.log('Found URL in output.url');
      } else if (typeof result.output === 'string') {
        audioUrl = result.output;
        console.log('Output is direct URL');
      } else if (result.result?.url) {
        audioUrl = result.result.url;
        console.log('Found URL in result.url');
      }

      if (!audioUrl) {
        console.error('Failed to extract audio URL. Result structure:', result);
        throw new Error('音声URLが見つかりません');
      }

      console.log('Audio URL received:', formatUrl(audioUrl));
      
      // Try to send to content script
      try {
        console.log('Sending PING to content script');
        await chrome.tabs.sendMessage(tab.id, { type: "PING" });
        
        console.log('Sending audio URL to content script');
        await chrome.tabs.sendMessage(tab.id, {
          action: "playAudio",
          url: audioUrl
        });
      } catch (error) {
        console.error('Content script communication error:', error);
        console.log('Attempting to inject content script');
        
        await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          files: ['contentScript.js']
        });
        
        // Wait and retry
        await wait(500);
        try {
          console.log('Retrying audio playback after content script injection');
          await chrome.tabs.sendMessage(tab.id, {
            action: "playAudio",
            url: audioUrl
          });
        } catch (retryError) {
          console.error('Retry failed:', retryError);
          await showErrorMessage('音声の再生に失敗しました。ページを更新して再試行してください。');
        }
      }
    } catch (error) {
      const errorDetails = {
        message: error.message || 'Unknown error',
        name: error.name || 'Error',
        stack: error.stack || 'No stack trace available'
      };
      
      console.error("=== Error details ===");
      console.error(JSON.stringify(errorDetails, null, 2));
      await showErrorMessage(`エラーが発生しました: ${errorDetails.message}`);
    }
  }
});
