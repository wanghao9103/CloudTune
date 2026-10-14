use std::{collections::VecDeque, sync::Mutex, time::Duration};
use tokio::sync::oneshot;

const MAX_AUDIO_BYTES: usize = 32 * 1024 * 1024;
const CANCELED: &str = "音频缓存已取消";

fn allowed_url(url: &reqwest::Url) -> bool {
    url.scheme() == "https"
        && url.username().is_empty()
        && url.password().is_none()
        && url.port_or_known_default() == Some(443)
        && url.host_str().is_some_and(|host| {
            ["music.126.net", "music.163.com"]
                .iter()
                .any(|domain| host == *domain || host.ends_with(&format!(".{domain}")))
        })
}

struct Pending {
    id: String,
    cancel: oneshot::Sender<()>,
}

#[derive(Default)]
struct Inner {
    pending: Option<Pending>,
    canceled: VecDeque<String>,
}

pub struct AudioCache {
    client: reqwest::Client,
    inner: Mutex<Inner>,
}

impl AudioCache {
    pub fn new() -> Result<Self, reqwest::Error> {
        let client = reqwest::Client::builder()
            .connect_timeout(Duration::from_secs(4))
            .timeout(Duration::from_secs(12))
            .user_agent("Mozilla/5.0")
            .redirect(reqwest::redirect::Policy::custom(|attempt| {
                if attempt.previous().len() >= 3 || !allowed_url(attempt.url()) {
                    attempt.error("音源重定向不受支持")
                } else {
                    attempt.follow()
                }
            }))
            .build()?;
        Ok(Self {
            client,
            inner: Mutex::new(Inner::default()),
        })
    }

    fn begin(&self, id: &str) -> Result<oneshot::Receiver<()>, String> {
        if id.is_empty() || id.len() > 64 {
            return Err("无效的播放请求".into());
        }
        let mut inner = self.inner.lock().map_err(|_| CANCELED)?;
        if inner.canceled.iter().any(|old| old == id) {
            return Err(CANCELED.into());
        }
        if let Some(old) = inner.pending.take() {
            let _ = old.cancel.send(());
        }
        let (cancel, receiver) = oneshot::channel();
        inner.pending = Some(Pending {
            id: id.into(),
            cancel,
        });
        Ok(receiver)
    }

    pub fn cancel(&self, id: &str) {
        let Ok(mut inner) = self.inner.lock() else {
            return;
        };
        // Remember cancellation even when IPC scheduling delivers it before prepare.
        if !inner.canceled.iter().any(|old| old == id) {
            inner.canceled.push_back(id.chars().take(64).collect());
            if inner.canceled.len() > 64 {
                inner.canceled.pop_front();
            }
        }
        if inner
            .pending
            .as_ref()
            .is_some_and(|pending| pending.id == id)
        {
            if let Some(pending) = inner.pending.take() {
                let _ = pending.cancel.send(());
            }
        }
    }

    fn commit(&self, id: &str, bytes: Vec<u8>) -> Result<Vec<u8>, String> {
        let mut inner = self.inner.lock().map_err(|_| CANCELED)?;
        if inner
            .pending
            .as_ref()
            .is_none_or(|pending| pending.id != id)
        {
            return Err(CANCELED.into());
        }
        inner.pending = None;
        Ok(bytes)
    }

    pub async fn prepare(
        &self,
        id: &str,
        url: &str,
        expected_size: u64,
    ) -> Result<Vec<u8>, String> {
        let started = std::time::Instant::now();
        let url = reqwest::Url::parse(url).map_err(|_| "无效的音源地址")?;
        if !allowed_url(&url) {
            return Err("不支持的音源地址".into());
        }
        let canceled = self.begin(id)?;
        let operation = async {
            let bytes = download(&self.client, url, expected_size).await?;
            let length = bytes.len();
            let bytes = self.commit(id, bytes)?;
            eprintln!(
                "audio-cache ready bytes={} elapsed_ms={}",
                length,
                started.elapsed().as_millis()
            );
            Ok(bytes)
        };
        let result = tokio::select! {
            result = operation => result,
            _ = canceled => Err(CANCELED.into()),
        };
        if result.is_err() {
            self.cancel(id);
            eprintln!(
                "audio-cache failed elapsed_ms={}",
                started.elapsed().as_millis()
            );
        }
        result
    }
}

async fn download(
    client: &reqwest::Client,
    url: reqwest::Url,
    expected_size: u64,
) -> Result<Vec<u8>, String> {
    if expected_size > MAX_AUDIO_BYTES as u64 {
        return Err("音频文件超过播放缓存上限".into());
    }
    let mut response = client
        .get(url)
        .header("Referer", "https://music.163.com/")
        .send()
        .await
        .map_err(|_| "音频缓存超时或网络连接失败")?;
    if response.status() != reqwest::StatusCode::OK {
        return Err("音源暂时无法完整读取".into());
    }
    let length = response.content_length();
    if length.is_some_and(|size| size > MAX_AUDIO_BYTES as u64) {
        return Err("音频文件超过播放缓存上限".into());
    }
    if response
        .headers()
        .get(reqwest::header::CONTENT_TYPE)
        .and_then(|value| value.to_str().ok())
        .is_some_and(|kind| kind.starts_with("text/") || kind.contains("json"))
    {
        return Err("音源返回了非音频内容".into());
    }
    let mut bytes = Vec::new();
    while let Some(chunk) = response
        .chunk()
        .await
        .map_err(|_| "音频缓存未完成，请重试")?
    {
        if bytes.len() + chunk.len() > MAX_AUDIO_BYTES {
            return Err("音频文件超过播放缓存上限".into());
        }
        bytes.extend_from_slice(&chunk);
    }
    if bytes.is_empty()
        || length.is_some_and(|size| size != bytes.len() as u64)
        || (expected_size > 0 && expected_size != bytes.len() as u64)
    {
        return Err("音频缓存不完整，请重试".into());
    }
    Ok(bytes)
}

#[tauri::command]
pub async fn prepare_audio(
    window: tauri::Window,
    state: tauri::State<'_, AudioCache>,
    request_id: String,
    url: String,
    expected_size: u64,
) -> Result<tauri::ipc::Response, String> {
    if window.label() != "main" {
        return Err("此窗口不允许访问播放缓存".into());
    }
    state
        .prepare(&request_id, &url, expected_size)
        .await
        .map(tauri::ipc::Response::new)
}

#[tauri::command]
pub fn cancel_audio(
    window: tauri::Window,
    state: tauri::State<'_, AudioCache>,
    request_id: String,
) {
    if window.label() == "main" {
        state.cancel(&request_id);
    }
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct PlaybackEvent {
    phase: String,
    source_kind: String,
    position: f64,
    ready_state: u8,
    paused: bool,
    seeking: bool,
    error_code: u8,
}

#[tauri::command]
pub fn playback_event(window: tauri::Window, snapshot: PlaybackEvent) {
    if window.label() != "main"
        || !snapshot.position.is_finite()
        || ![
            "requesting",
            "caching",
            "ready",
            "starting",
            "playing",
            "buffering",
            "recovering",
            "paused",
            "failed",
        ]
        .contains(&snapshot.phase.as_str())
        || !["cached", "local", "remote", "none"].contains(&snapshot.source_kind.as_str())
    {
        return;
    }
    eprintln!(
        "audio-stage phase={} source={} position={:.3} ready={} paused={} seeking={} error={}",
        snapshot.phase,
        snapshot.source_kind,
        snapshot.position,
        snapshot.ready_state,
        snapshot.paused,
        snapshot.seeking,
        snapshot.error_code
    );
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::{Read, Write};

    fn fixture(response: Vec<u8>) -> reqwest::Url {
        let listener = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
        let url = format!("http://{}/audio", listener.local_addr().unwrap())
            .parse()
            .unwrap();
        std::thread::spawn(move || {
            let (mut socket, _) = listener.accept().unwrap();
            socket
                .set_read_timeout(Some(Duration::from_secs(2)))
                .unwrap();
            let mut request = [0u8; 4096];
            let _ = socket.read(&mut request);
            let _ = socket.write_all(&response);
        });
        url
    }

    fn cache() -> AudioCache {
        AudioCache::new().unwrap()
    }

    #[test]
    fn media_urls_and_redirects_are_limited_to_https_music_hosts() {
        for url in [
            "https://m701.music.126.net/song.mp3",
            "https://m7.music.163.com/song.mp3",
        ] {
            assert!(allowed_url(&url.parse().unwrap()));
        }
        for url in [
            "http://m701.music.126.net/song.mp3",
            "https://music.126.net.evil.test/song",
            "https://127.0.0.1/song",
            "https://m701.music.126.net:8443/song",
            "https://name:secret@m701.music.126.net/song",
            "file:///etc/passwd",
        ] {
            assert!(!allowed_url(&url.parse().unwrap()), "{url}");
        }
    }

    #[tokio::test]
    async fn only_complete_bounded_audio_can_become_a_playback_source() {
        let client = reqwest::Client::builder()
            .timeout(Duration::from_secs(2))
            .build()
            .unwrap();
        let url = fixture(b"HTTP/1.1 200 OK\r\nContent-Type: audio/mpeg\r\nContent-Length: 7\r\nConnection: close\r\n\r\nID3test".to_vec());
        assert_eq!(download(&client, url, 7).await.unwrap(), b"ID3test");
        for (headers, expected) in [
            ("Content-Length: 9", 0),
            ("Content-Length: 7", 8),
            ("Content-Length: 33554433", 0),
            ("Content-Length: 7\r\nContent-Type: text/html", 0),
            ("Content-Length: 0", 0),
        ] {
            let url = fixture(
                format!("HTTP/1.1 200 OK\r\n{headers}\r\nConnection: close\r\n\r\nID3test")
                    .into_bytes(),
            );
            assert!(download(&client, url, expected).await.is_err(), "{headers}");
        }
        let url = fixture(b"HTTP/1.1 206 Partial Content\r\nContent-Length: 7\r\nConnection: close\r\n\r\nID3test".to_vec());
        assert!(download(&client, url, 7).await.is_err());
    }

    #[tokio::test]
    async fn pause_and_switch_cancel_only_the_matching_request_even_when_ipc_arrives_late() {
        let cache = cache();
        cache.cancel("before-prepare");
        assert!(cache.begin("before-prepare").is_err());
        let first = cache.begin("first").unwrap();
        let mut second = cache.begin("second").unwrap();
        assert!(first.await.is_ok());
        cache.cancel("first");
        assert!(second.try_recv().is_err());
        assert!(cache.commit("first", b"ID3test".to_vec()).is_err());
        cache.cancel("second");
        assert!(second.await.is_ok());
        assert!(cache.commit("second", b"ID3test".to_vec()).is_err());
    }

    #[test]
    fn completed_buffers_cannot_be_committed_again_or_replace_a_new_request() {
        let cache = cache();
        let _first = cache.begin("first").unwrap();
        assert_eq!(
            cache.commit("first", b"ID3test".to_vec()).unwrap(),
            b"ID3test"
        );
        let _second = cache.begin("second").unwrap();
        assert!(cache.commit("first", b"old".to_vec()).is_err());
        assert_eq!(cache.commit("second", b"new".to_vec()).unwrap(), b"new");
        assert!(cache.commit("second", b"duplicate".to_vec()).is_err());
    }
}
