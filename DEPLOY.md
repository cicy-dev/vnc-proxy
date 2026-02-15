# Deploy to Cloudflare Pages

## 方法 1: 通过 Cloudflare Dashboard

1. 登录 https://dash.cloudflare.com
2. 进入 Pages
3. 创建新项目
4. 连接 Git 仓库或上传文件
5. 构建设置：
   - Build command: `npm run build`
   - Build output directory: `dist`
   - Root directory: `/`

## 方法 2: 使用 wrangler CLI

```bash
# 安装 wrangler (本地项目)
npx wrangler pages deploy dist --project-name=vnc-proxy
```

## 方法 3: 直接上传 dist 目录

1. 打包 dist 目录：
```bash
cd ~/projects/vnc-proxy
tar -czf dist.tar.gz dist/
```

2. 在 Cloudflare Pages Dashboard 上传 `dist.tar.gz`

## 注意事项

- 这是纯静态网站，不包含后端 API
- VNC 代理、xdotool 等功能需要后端服务器支持
- 只部署前端界面到 CF Pages
