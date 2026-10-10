use aes::cipher::{block_padding::Pkcs7, BlockEncryptMut, KeyIvInit};
use base64::{engine::general_purpose::STANDARD, Engine};
use rand::{distributions::Alphanumeric, Rng};
use reqwest::cookie::{CookieStore, Jar};
use rsa::{pkcs8::DecodePublicKey, traits::PublicKeyParts, BigUint, RsaPublicKey};
use serde_json::{json, Value};
use std::{
    sync::{Arc, Mutex},
    time::Duration,
};
const ROOT: &str = "https://music.163.com/";
const PUBLIC_KEY: &str = "-----BEGIN PUBLIC KEY-----\nMIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQDgtQn2JZ34ZC28NWYpAUd98iZ3\n7BUrX/aKzmFbt7clFSs6sXqHauqKWqdtLkF2KexO40H1YTX8z2lSgBBOAxLsvakl\nV8k4cBFK9snQXE9/DDaFt6Rr7iVZMldczhC0JNgTz+SHXT6CBHuX3e9SdB1Ua44o\nncaTWz7OBGLbCiK45wIDAQAB\n-----END PUBLIC KEY-----";
fn aes(text: &[u8], key: &[u8]) -> String {
    STANDARD.encode(
        cbc::Encryptor::<aes::Aes128>::new_from_slices(key, b"0102030405060708")
            .expect("fixed AES key and IV lengths")
            .encrypt_padded_vec_mut::<Pkcs7>(text),
    )
}
fn encrypt_with_key(data: &Value, secret: &str) -> (String, String) {
    let first = aes(data.to_string().as_bytes(), b"0CoJUm6Qyw8W8jud");
    let params = aes(first.as_bytes(), secret.as_bytes());
    let key = RsaPublicKey::from_public_key_pem(PUBLIC_KEY).expect("embedded public key");
    let reversed: Vec<u8> = secret.bytes().rev().collect();
    let encoded = BigUint::from_bytes_be(&reversed).modpow(key.e(), key.n());
    (params, format!("{:0>256}", encoded.to_str_radix(16)))
}
fn num(p: &Value, field: &str, default: u64) -> u64 {
    p[field]
        .as_u64()
        .or_else(|| p[field].as_str().and_then(|s| s.parse().ok()))
        .unwrap_or(default)
}
pub fn route(action: &str, p: &Value) -> Result<(&'static str, Value), String> {
    let id = num(p, "id", 0);
    let limit = num(p, "limit", 30).clamp(1, 100);
    let offset = num(p, "offset", 0);
    Ok(match action {
        "banner" => ("/api/v2/banner/get", json!({"clientType":"pc"})),
        "recommend" => (
            "/api/personalized/playlist",
            json!({"limit":limit,"total":true,"n":1000}),
        ),
        "newSongs" => (
            "/api/personalized/newsong",
            json!({"type":"recommend","limit":limit,"areaId":0}),
        ),
        "search" => {
            let s = p["keywords"]
                .as_str()
                .unwrap_or("")
                .chars()
                .take(200)
                .collect::<String>();
            if s.trim().is_empty() {
                return Err("请输入搜索内容".into());
            }
            (
                "/api/cloudsearch/pc",
                json!({"s":s,"type":num(p,"type",1),"limit":limit,"offset":offset,"total":true}),
            )
        }
        "playlist" => ("/api/v6/playlist/detail", json!({"id":id,"n":100000,"s":8})),
        "songDetail" => {
            let ids = p["ids"]
                .as_str()
                .unwrap_or("")
                .split(',')
                .take(100)
                .filter_map(|s| s.parse::<u64>().ok())
                .map(|id| json!({"id":id}))
                .collect::<Vec<_>>();
            (
                "/api/v3/song/detail",
                json!({"c":serde_json::to_string(&ids).unwrap()}),
            )
        }
        "songUrl" => (
            "/api/song/enhance/player/url",
            json!({"ids":format!("[{id}]"),"br":if num(p,"br",320000)==128000{128000}else{320000}}),
        ),
        "lyric" => (
            "/api/song/lyric",
            json!({"id":id,"tv":-1,"lv":-1,"rv":-1,"kv":-1,"_nmclfl":1}),
        ),
        "topPlaylists" => (
            "/api/playlist/list",
            json!({"cat":p["cat"].as_str().unwrap_or("全部"),"order":"hot","limit":limit,"offset":offset,"total":true}),
        ),
        "toplist" => ("/api/toplist", json!({})),
        "qrKey" => ("/api/login/qrcode/unikey", json!({"type":3})),
        "qrCheck" => (
            "/api/login/qrcode/client/login",
            json!({"key":p["key"].as_str().unwrap_or(""),"type":3}),
        ),
        "account" => ("/api/w/nuser/account/get", json!({})),
        "userPlaylists" => (
            "/api/user/playlist",
            json!({"uid":num(p,"uid",0),"limit":100,"offset":0,"includeVideo":true}),
        ),
        "like" => (
            "/api/radio/like",
            json!({"alg":"itembased","trackId":id,"like":p["like"].as_bool().unwrap_or(false),"time":"3"}),
        ),
        "likelist" => ("/api/song/like/get", json!({"uid":num(p,"uid",0)})),
        "daily" => ("/api/v3/discovery/recommend/songs", json!({})),
        "captchaSend" | "phoneLogin" => {
            let phone = p["phone"].as_str().unwrap_or("");
            if phone.len() != 11
                || !phone.starts_with('1')
                || !phone.bytes().all(|b| b.is_ascii_digit())
            {
                return Err("请输入正确的中国大陆手机号".into());
            }
            if action == "captchaSend" {
                (
                    "/api/sms/captcha/sent",
                    json!({"ctcode":"86","secrete":"music_middleuser_pclogin","cellphone":phone}),
                )
            } else {
                let captcha = p["captcha"].as_str().unwrap_or("");
                if !(4..=8).contains(&captcha.len()) || !captcha.bytes().all(|b| b.is_ascii_digit())
                {
                    return Err("请输入正确的验证码".into());
                }
                (
                    "/api/w/login/cellphone",
                    json!({"type":"1","https":"true","phone":phone,"countrycode":"86","captcha":captcha,"remember":"true","secureCaptcha":""}),
                )
            }
        }
        "logout" => ("/api/logout", json!({})),
        _ => return Err("不支持的音乐操作".into()),
    })
}
struct Session {
    client: reqwest::Client,
    jar: Arc<Jar>,
    generation: u64,
    pending_qr: Option<String>,
}
impl Session {
    fn new(cookie: Option<String>, generation: u64) -> Self {
        let jar = Arc::new(Jar::default());
        let url = ROOT.parse().unwrap();
        jar.add_cookie_str("os=pc; Path=/", &url);
        jar.add_cookie_str("appver=2.10.13; Path=/", &url);
        if let Some(cookie) = cookie {
            for pair in cookie.split(';') {
                let pair = pair.trim();
                if pair.contains('=') {
                    jar.add_cookie_str(&format!("{pair}; Path=/"), &url);
                }
            }
        }
        let client = reqwest::Client::builder()
            .cookie_provider(jar.clone())
            .timeout(Duration::from_secs(20))
            .user_agent("Mozilla/5.0")
            .build()
            .expect("HTTP client");
        Self {
            client,
            jar,
            generation,
            pending_qr: None,
        }
    }
}
pub struct MusicState {
    session: Mutex<Session>,
    credential: Option<keyring::Entry>,
}
impl MusicState {
    pub fn new() -> Self {
        // Testing uses an isolated D-Bus/XDG session; never read an unrelated app's keyring entry.
        let credential = keyring::Entry::new("io.yunting.desktop", "netease-session").ok();
        let cookie = credential
            .as_ref()
            .and_then(|entry| entry.get_password().ok());
        Self {
            session: Mutex::new(Session::new(cookie, 0)),
            credential,
        }
    }
    pub async fn request(&self, action: &str, params: &Value) -> Result<Value, String> {
        if action == "cancelLogin" {
            let mut session = self.session.lock().map_err(|_| "会话不可用")?;
            session.generation += 1;
            session.pending_qr = None;
            return Ok(json!({"code":200}));
        }
        let (path, mut payload) = route(action, params)?;
        let (client, jar, generation) = {
            let mut session = self.session.lock().map_err(|_| "会话不可用")?;
            if action == "qrKey" || action == "phoneLogin" {
                session.generation += 1;
                session.pending_qr = None;
            }
            if action == "qrCheck" && session.pending_qr.as_deref() != params["key"].as_str() {
                return Err("登录已取消，请刷新二维码。".into());
            }
            let snapshot = if action == "qrCheck" || action == "phoneLogin" {
                // Login requests use an isolated jar. A canceled response cannot silently set account cookies.
                let cookies = session
                    .jar
                    .cookies(&ROOT.parse().unwrap())
                    .and_then(|c| c.to_str().ok().map(str::to_owned));
                let pending = Session::new(cookies, session.generation);
                (pending.client, pending.jar, pending.generation)
            } else {
                (
                    session.client.clone(),
                    session.jar.clone(),
                    session.generation,
                )
            };
            if action == "logout" {
                let next = session.generation + 1;
                *session = Session::new(None, next);
                if let Some(entry) = &self.credential {
                    match entry.delete_credential() {
                        Ok(()) | Err(keyring::Error::NoEntry) => {}
                        Err(_) => return Err(
                            "本机会话已结束，但系统密钥环未能清除。请解锁密钥环后再次退出登录。"
                                .into(),
                        ),
                    }
                }
            }
            snapshot
        };
        let cookie = jar
            .cookies(&ROOT.parse().unwrap())
            .and_then(|c| c.to_str().ok().map(str::to_owned))
            .unwrap_or_default();
        let csrf = cookie
            .split(';')
            .find_map(|p| p.trim().strip_prefix("__csrf="))
            .unwrap_or("");
        payload["csrf_token"] = json!(csrf);
        let secret = rand::thread_rng()
            .sample_iter(&Alphanumeric)
            .take(16)
            .map(char::from)
            .collect::<String>();
        let (encrypted, key) = encrypt_with_key(&payload, &secret);
        let endpoint = format!(
            "https://music.163.com{}",
            path.replacen("/api/", "/weapi/", 1)
        );
        let response = client
            .post(endpoint)
            .query(&[("csrf_token", csrf)])
            .header("Referer", ROOT)
            .form(&[("params", encrypted), ("encSecKey", key)])
            .send()
            .await
            .map_err(|_| "暂时无法连接网易云音乐，请检查网络后重试。")?;
        let mut body = response
            .json::<Value>()
            .await
            .map_err(|_| "网易云返回了无法读取的响应。")?;
        if action == "qrKey" && body["code"] == 200 {
            let mut session = self.session.lock().map_err(|_| "会话不可用")?;
            if session.generation != generation {
                return Err("二维码已取消".into());
            }
            session.pending_qr = body["unikey"].as_str().map(str::to_owned);
        }
        if (action == "qrCheck" && body["code"] == 803)
            || (action == "phoneLogin" && body["code"] == 200)
        {
            let mut session = self.session.lock().map_err(|_| "会话不可用")?;
            if session.generation != generation {
                return Err("登录已取消，请重新扫码。".into());
            }

            let cookies = jar
                .cookies(&ROOT.parse().unwrap())
                .and_then(|c| c.to_str().ok().map(str::to_owned))
                .unwrap_or_default();
            *session = Session::new(Some(cookies.clone()), generation + 1);
            if self
                .credential
                .as_ref()
                .is_none_or(|entry| entry.set_password(&cookies).is_err())
            {
                body["sessionWarning"]=json!("登录成功；系统密钥环不可用，本次登录不会在重启后保留。请开启并解锁 GNOME Keyring。");
            }
        }
        if let Some(obj) = body.as_object_mut() {
            obj.remove("cookie");
            obj.remove("token");
        }
        Ok(body)
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn weapi_has_expected_wire_format() {
        let (params, key) =
            encrypt_with_key(&json!({"limit":5,"csrf_token":""}), "0123456789abcdef");
        assert_eq!(key.len(), 256);
        assert!(key.bytes().all(|c| c.is_ascii_hexdigit()));
        assert!(STANDARD.decode(params).unwrap().len().is_multiple_of(16));
    }
    #[test]
    fn cancellation_preserves_account_but_rejects_old_qr_polls() {
        let state = MusicState {
            session: Mutex::new(Session::new(Some("MUSIC_U=synthetic-account".into()), 0)),
            credential: None,
        };
        let old_cookie = state
            .session
            .lock()
            .unwrap()
            .jar
            .cookies(&ROOT.parse().unwrap())
            .unwrap();
        tauri::async_runtime::block_on(state.request("cancelLogin", &json!({}))).unwrap();
        assert!(tauri::async_runtime::block_on(
            state.request("qrCheck", &json!({"key":"expired-key"}))
        )
        .is_err());
        let session = state.session.lock().unwrap();
        assert_eq!(session.generation, 1);
        assert_eq!(
            session.jar.cookies(&ROOT.parse().unwrap()).unwrap(),
            old_cookie
        );
        let pending = Session::new(None, session.generation);
        pending
            .jar
            .add_cookie_str("MUSIC_U=late-login; Path=/", &ROOT.parse().unwrap());
        assert_eq!(
            session.jar.cookies(&ROOT.parse().unwrap()).unwrap(),
            old_cookie
        );
    }
    #[test]
    fn api_is_allowlisted_and_pagination_is_bounded() {
        assert!(route("https://example.com", &json!({})).is_err());
        assert!(route("search", &json!({"keywords":" "})).is_err());
        assert_eq!(
            route("recommend", &json!({"limit":10000})).unwrap().1["limit"],
            100
        );
        assert_eq!(
            route("songUrl", &json!({"id":42,"br":128000})).unwrap().1["br"],
            128000
        );
    }
}
