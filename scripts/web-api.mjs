import {
  createCipheriv,
  publicEncrypt,
  constants,
  randomBytes,
} from "node:crypto";
const publicKey = `-----BEGIN PUBLIC KEY-----
MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQDgtQn2JZ34ZC28NWYpAUd98iZ37BUrX/aKzmFbt7clFSs6sXqHauqKWqdtLkF2KexO40H1YTX8z2lSgBBOAxLsvaklV8k4cBFK9snQXE9/DDaFt6Rr7iVZMldczhC0JNgTz+SHXT6CBHuX3e9SdB1Ua44oncaTWz7OBGLbCiK45wIDAQAB
-----END PUBLIC KEY-----`;
function aes(text, key) {
  const cipher = createCipheriv("aes-128-cbc", key, "0102030405060708");
  return Buffer.concat([cipher.update(text), cipher.final()]).toString(
    "base64",
  );
}
export function encrypt(data) {
  const key = randomBytes(8).toString("hex");
  const buffer = Buffer.alloc(128);
  buffer.write(key.split("").reverse().join(""), 112);
  return {
    params: aes(aes(JSON.stringify(data), "0CoJUm6Qyw8W8jud"), key),
    encSecKey: publicEncrypt(
      { key: publicKey, padding: constants.RSA_NO_PADDING },
      buffer,
    ).toString("hex"),
  };
}
export function route(action, p = {}) {
  const id = Number(p.id);
  const limit = Math.min(Number(p.limit) || 30, 100);
  const offset = Math.max(Number(p.offset) || 0, 0);
  switch (action) {
    case "banner":
      return ["/api/v2/banner/get", { clientType: "pc" }];
    case "recommend":
      return ["/api/personalized/playlist", { limit, total: true, n: 1000 }];
    case "newSongs":
      return [
        "/api/personalized/newsong",
        { type: "recommend", limit, areaId: 0 },
      ];
    case "search":
      if (!String(p.keywords || "").trim()) throw Error("请输入搜索内容");
      return [
        "/api/cloudsearch/pc",
        {
          s: String(p.keywords).slice(0, 200),
          type: Number(p.type) || 1,
          limit,
          offset,
          total: true,
        },
      ];
    case "playlist":
      return ["/api/v6/playlist/detail", { id, n: 100000, s: 8 }];
    case "songDetail":
      return [
        "/api/v3/song/detail",
        {
          c: JSON.stringify(
            String(p.ids)
              .split(",")
              .slice(0, 100)
              .map((x) => ({ id: Number(x) })),
          ),
        },
      ];
    case "songUrl":
      return [
        "/api/song/enhance/player/url",
        {
          ids: JSON.stringify([id]),
          br: Number(p.br) === 128000 ? 128000 : 320000,
        },
      ];
    case "lyric":
      return [
        "/api/song/lyric",
        { id, tv: -1, lv: -1, rv: -1, kv: -1, _nmclfl: 1 },
      ];
    case "topPlaylists":
      return [
        "/api/playlist/list",
        { cat: p.cat || "全部", order: "hot", limit, offset, total: true },
      ];
    case "toplist":
      return ["/api/toplist", {}];
    case "qrKey":
      return ["/api/login/qrcode/unikey", { type: 3 }];
    case "qrCheck":
      return [
        "/api/login/qrcode/client/login",
        { key: String(p.key || ""), type: 3 },
      ];
    case "account":
      return ["/api/w/nuser/account/get", {}];
    case "userPlaylists":
      return [
        "/api/user/playlist",
        { uid: Number(p.uid), limit: 100, offset: 0, includeVideo: true },
      ];
    case "like":
      return [
        "/api/radio/like",
        { alg: "itembased", trackId: id, like: !!p.like, time: 3 },
      ];
    case "likelist":
      return ["/api/song/like/get", { uid: Number(p.uid) }];
    case "daily":
      return ["/api/v3/discovery/recommend/songs", {}];
    case "captchaSend":
    case "phoneLogin": {
      if (!/^1\d{10}$/.test(p.phone || ""))
        throw Error("请输入正确的中国大陆手机号");
      if (action === "captchaSend")
        return [
          "/api/sms/captcha/sent",
          {
            ctcode: "86",
            secrete: "music_middleuser_pclogin",
            cellphone: p.phone,
          },
        ];
      if (!/^\d{4,8}$/.test(p.captcha || "")) throw Error("请输入正确的验证码");
      return [
        "/api/w/login/cellphone",
        {
          type: "1",
          https: "true",
          phone: p.phone,
          countrycode: "86",
          captcha: p.captcha,
          remember: "true",
          secureCaptcha: "",
        },
      ];
    }
    case "logout":
      return ["/api/logout", {}];
    default:
      throw Error("不支持的音乐操作");
  }
}
// Development preview only. No credentials are written to disk or sent to the page.
let cookie = "os=pc; appver=2.10.13;";
let generation = 0;
let pendingKey = null;
export async function musicRequest(action, params) {
  if (action === "cancelLogin") {
    generation++;
    pendingKey = null;
    return { code: 200 };
  }
  const [path, payload] = route(action, params);
  if (action === "qrKey" || action === "phoneLogin") {
    generation++;
    pendingKey = null;
  }
  if (action === "qrCheck" && pendingKey !== params.key)
    throw Error("登录已取消");
  const requestGeneration = generation;
  if (action === "logout") {
    generation++;
    pendingKey = null;
  }
  const requestCookie = cookie;
  if (action === "logout") cookie = "os=pc; appver=2.10.13;";
  const csrf = requestCookie.match(/__csrf=([^;]+)/)?.[1] || "";
  const response = await fetch(
    `https://music.163.com${path.replace("/api/", "/weapi/")}?csrf_token=${csrf}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Referer: "https://music.163.com/",
        "User-Agent": "Mozilla/5.0",
        Cookie: requestCookie,
      },
      body: new URLSearchParams(encrypt({ ...payload, csrf_token: csrf })),
      signal: AbortSignal.timeout(20000),
    },
  );
  const body = await response.json();
  if (
    action === "qrKey" &&
    body.code === 200 &&
    requestGeneration === generation
  )
    pendingKey = body.unikey;
  if (
    (action === "qrCheck" && body.code === 803) ||
    (action === "phoneLogin" && body.code === 200)
  ) {
    if (requestGeneration !== generation) throw Error("登录已取消");
    generation++;
    pendingKey = null;
    const pairs = response.headers.getSetCookie().map((s) => s.split(";")[0]);
    cookie = pairs.join("; ") + "; os=pc;";
    body.sessionWarning =
      "浏览器预览仅保留本次登录；桌面版使用系统密钥环保存登录。";
  }
  if (action === "logout") cookie = "os=pc; appver=2.10.13;";
  delete body.cookie;
  delete body.token;
  return body;
}
export function musicApiPlugin() {
  return {
    name: "music-dev-api",
    configureServer(server) {
      server.middlewares.use("/music-api", async (req, res) => {
        // Vite binds to loopback. Also reject cross-site calls to the session-bearing API.
        const origin = req.headers.origin;
        if (
          origin &&
          !/^http:\/\/(127\.0\.0\.1|localhost):1431$/.test(origin)
        ) {
          res.statusCode = 403;
          res.end();
          return;
        }
        if (
          req.method !== "POST" ||
          req.headers["content-type"] !== "application/json"
        ) {
          res.statusCode = 405;
          res.end();
          return;
        }
        try {
          let input = "";
          for await (const chunk of req) {
            input += chunk;
            if (input.length > 8192) throw Error("请求过大");
          }
          const { action, params } = JSON.parse(input);
          const result = await musicRequest(action, params);
          res.setHeader("Content-Type", "application/json");
          res.setHeader("Cache-Control", "no-store");
          res.end(JSON.stringify(result));
        } catch {
          res.statusCode = 502;
          res.setHeader("Content-Type", "application/json");
          res.end(
            JSON.stringify({
              message: "暂时无法连接网易云音乐，请检查网络后重试。",
            }),
          );
        }
      });
    },
  };
}
