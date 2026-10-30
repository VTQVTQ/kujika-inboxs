// Máy chủ production: đăng nhập Windows tự động (SSO) rồi chuyển cho Next.js.
// Chạy: npm run start   (cần chạy trên Windows; máy chủ nên join domain để nhận user domain)
//
// Hai chế độ, chọn bằng SSO_MODE (trong .env hoặc biến môi trường):
//   sspi (mặc định)  server.js tự xác thực Windows (Negotiate / NTLM) bằng node-expose-sspi, rồi đặt header x-windows-user.
//   iis              IIS đứng trước làm Windows Authentication và proxy sang server này. IIS đặt x-windows-user và
//                    x-inbox-proxy-secret (= SSO_PROXY_SECRET); ứng dụng chỉ tin header khi mã bí mật khớp (lib/auth-identity.ts).
//                    Mặc định chỉ nghe ở 127.0.0.1 để không ai gọi thẳng vào được. Xem docs/trien-khai-iis-offline.md
const express = require("express");
const next = require("next");
const { loadEnvConfig } = require("@next/env");

// Nạp .env sớm (cần SSO_MODE / HOST / PORT trước khi chọn chế độ) — cùng quy tắc nạp của Next.js, biến đã đặt sẵn được ưu tiên
loadEnvConfig(__dirname, false);

const WINDOWS_USER_HEADER = "x-windows-user";
const PROXY_SECRET_MIN_LENGTH = 32;

const mode = (process.env.SSO_MODE || "sspi").trim().toLowerCase();
if (mode !== "sspi" && mode !== "iis") {
  console.error(`SSO_MODE="${process.env.SSO_MODE}" không hợp lệ: chỉ nhận sspi (mặc định) hoặc iis.`);
  process.exit(1);
}

const port = Number(process.env.PORT || 3001);
// IIS chạy cùng máy → chỉ nghe loopback; SSPI phục vụ trực tiếp cho người dùng → mọi địa chỉ
const host = process.env.HOST || (mode === "iis" ? "127.0.0.1" : "0.0.0.0");

if (mode === "iis") {
  // Báo cho lib/auth-identity.ts biết x-windows-user do IIS đặt (đáng tin khi kèm đúng mã bí mật)
  if (process.env.SSO_ENABLED === "1") {
    console.error("SSO_ENABLED=1 (SSPI) đang bật: không chạy cùng chế độ IIS. Bỏ biến này khỏi .env / môi trường của máy chủ.");
    process.exit(1);
  }
  process.env.SSO_PROXY = "1";
} else {
  // Báo cho lib/auth.ts biết header x-windows-user do chính server này đặt (đáng tin cậy)
  process.env.SSO_ENABLED = "1";
}

const app = next({ dev: false, hostname: host, port });
const handle = app.getRequestHandler();

app.prepare().then(() => {
  // Đăng nhập thử (danh tính giả định) không bao giờ chạy cùng SSO thật → dừng hẳn
  if (process.env.AUTH_TEST_LOGIN === "1") {
    console.error("AUTH_TEST_LOGIN=1 đang bật: không chạy cùng SSO thật. Bỏ biến này khỏi .env / môi trường của máy chủ.");
    process.exit(1);
  }

  const server = express();
  server.disable("x-powered-by");

  if (mode === "iis") {
    const secret = process.env.SSO_PROXY_SECRET || "";
    if (secret.length < PROXY_SECRET_MIN_LENGTH) {
      console.error(
        `Chế độ IIS cần SSO_PROXY_SECRET dài ít nhất ${PROXY_SECRET_MIN_LENGTH} ký tự trong .env (cùng giá trị với web.config của IIS).\n` +
          `Tạo: node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"`,
      );
      process.exit(1);
    }
    if (!["127.0.0.1", "::1", "localhost"].includes(host)) {
      console.warn(`⚠  HOST=${host}: không phải loopback. Chỉ mở nếu IIS ở máy khác và mạng giữa hai máy được giới hạn; mã bí mật vẫn bắt buộc.`);
    }
    // Không xử lý danh tính ở đây: lib/auth-identity.ts chỉ tin x-windows-user khi header mã bí mật khớp
  } else {
    // Không cho client tự gửi header này
    server.use((req, _res, nextFn) => {
      delete req.headers[WINDOWS_USER_HEADER];
      nextFn();
    });

    // API công khai cho hệ thống nguồn (máy chủ gọi máy chủ, không có người dùng Windows): bỏ qua SSPI, route tự xác thực bằng mã Bearer
    server.all("/api/v1/*splat", (req, res) => handle(req, res));

    // Xác thực Windows (Negotiate/NTLM) — chỉ nạp module native ở chế độ này để máy chạy IIS không cần nó
    const { sso } = require("node-expose-sspi");
    server.use(sso.auth());

    server.use((req, _res, nextFn) => {
      // node-expose-sspi tách sẵn: user.domain = "FIVESTAR", user.name = "fs-quoc-trong" → ghép lại DOMAIN\account
      const user = req.sso && req.sso.user;
      if (user && user.name) req.headers[WINDOWS_USER_HEADER] = user.domain ? `${user.domain}\\${user.name}` : user.name;
      nextFn();
    });
  }

  server.use((req, res) => handle(req, res));

  server.listen(port, host, () => {
    console.log(
      mode === "iis"
        ? `> Việc cần xử lý chạy sau IIS (Windows Authentication, SSO_MODE=iis) tại http://${host}:${port}`
        : `> Việc cần xử lý chạy SSO Windows tại http://${host}:${port}`,
    );
  });
});
