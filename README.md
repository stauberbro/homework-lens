# Homework Lens

| Folder | What it is | Where it runs |
|---|---|---|
| `app/` | The Windows app (your Homework Lens page inside Electron) | Students' computers |
| `server/` | Holds your Anthropic API key and passes the app's requests to Claude | Cloudflare Workers (free tier) |
| `site/` | The download page | GitHub Pages (free) |

GitHub Actions builds and deploys all three, so you don't need Node.js on your computer.

## One-time setup

### 1. Get the three accounts and keys

1. **Anthropic API key.** At console.anthropic.com, create a key. Under Billing, **set a monthly spend limit**: every student's question is paid from this account.
2. **Cloudflare.** Sign up free at dash.cloudflare.com.
   - Copy your **Account ID** (right sidebar of the dashboard).
   - Go to My Profile > API Tokens > Create Token > template **"Edit Cloudflare Workers"**, and copy the token.
3. **GitHub.** Sign up free, then create a new repository called `homework-lens` (public, so the download link works for everyone).

### 2. Add the keys to the GitHub repository

In the repository: **Settings > Secrets and variables > Actions**.

Under **Secrets**, add:

| Name | Value |
|---|---|
| `ANTHROPIC_API_KEY` | your Anthropic key |
| `CLOUDFLARE_API_TOKEN` | the Cloudflare token |
| `CLOUDFLARE_ACCOUNT_ID` | the Cloudflare account ID |
| `APP_KEY` | any long random string (for example, mash the keyboard for 30 characters) |

### 3. Push this folder to GitHub

```
cd C:\Users\ohads\homework-lens
git init -b main
git add .
git commit -m "Homework Lens app, server and download page"
git remote add origin https://github.com/YOUR-NAME/homework-lens.git
git push -u origin main
```

Pushing runs **Deploy server**. When it finishes (Actions tab), its log shows the server address, like `https://homework-lens.YOUR-SUBDOMAIN.workers.dev`.

### 4. Tell the app where the server is

**Settings > Secrets and variables > Actions > Variables**, add `SERVER_URL` with that address.

### 5. Turn on the download page

**Settings > Pages > Source: GitHub Actions**. Then on the Actions tab, run **Publish download page**. The page will be at `https://YOUR-NAME.github.io/homework-lens/`.

### 6. Build the first installer

```
git tag v1.0.0
git push origin v1.0.0
```

That runs **Build installer** (about 5 minutes) and attaches `HomeworkLens-Setup.exe` to a GitHub Release. The download button on the page always points at the newest release.

## Releasing an update

Change the code, commit, push, then tag a new version (`v1.0.1`, `v1.1.0`...) and push the tag.

## Good to know

- **Windows SmartScreen** will say "Windows protected your PC" on first run, because the installer isn't code-signed. Students click *More info > Run anyway*. Removing that needs a paid code-signing certificate.
- **Cost:** answers use Claude Opus 5.5 ($4 per million input tokens, $20 per million output). The server allows 20 requests a minute per device. Keep the spend limit on.
- **Take photo** opens a file picker on Windows (there's no phone camera). Students can still drop, paste (Ctrl+V) or pick photos.
- **Read aloud** uses the voices installed in Windows. Extra languages: Windows Settings > Time & language > Speech.
