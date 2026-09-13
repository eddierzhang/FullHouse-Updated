# Running and deploying FullHouse

## Local, with Docker

Needs [Docker Desktop](https://www.docker.com/products/docker-desktop/).

```bash
cp .env.docker.example .env      # adjust if you like
docker compose up -d --build
docker compose logs -f ollama-pull   # first run downloads the model (~5 GB for qwen2.5:7b)
```

Open http://localhost:8080. Four containers start:

| Service | Role |
|---|---|
| `frontend` | nginx serving the built React app, proxying `/api` to the backend |
| `backend` | FastAPI; migrates and seeds the database on every start (both are idempotent) |
| `ollama` | the local model server |
| `ollama-pull` | one-shot job that downloads `OLLAMA_MODEL`, then exits |

The SQLite database lives in the `app-data` volume and survives restarts and rebuilds.
`docker compose down -v` deletes it along with the downloaded models.

To reuse models already on this machine instead of downloading, set `OLLAMA_MODELS_DIR` in
`.env` (see the example file).

**Keep the backend at one process.** Agent runs execute on its thread pool and stream through
an in-process broker, so scaling it to two replicas would split runs from their live streams.

---

## Free cloud deployment

The constraint that decides everything is the model. A 7B model needs several GB of RAM, and
no free *platform* tier comes close — Render's free web service is 512 MB. So there are two
routes, and only the first runs the agents for free.

### Route 1 (recommended): Oracle Cloud Always Free VM

One free ARM VM runs the entire compose stack, model included.

- **Limits as of June 2026:** 2 OCPUs and 12 GB RAM for Ampere A1 instances. Oracle halved
  this from 4 OCPU / 24 GB and began terminating instances over the new limit on
  18 August 2026, so older tutorials are wrong.
- 12 GB fits `qwen2.5:7b`, but on 2 CPU cores with no GPU **expect a run to take minutes**.
  Use `OLLAMA_MODEL=qwen3.5:4b` there; it is noticeably faster.
- Signup asks for a card to verify identity; Always Free resources are not charged.

**Steps**

1. **Create the VM.** Compute → Instances → Create. Image: Ubuntu 24.04. Shape:
   `VM.Standard.A1.Flex`, 2 OCPU, 12 GB. If it says "out of host capacity", retry later or pick
   another availability domain — free ARM capacity is often exhausted.
2. **Open port 80 twice.** Once in the subnet's security list (Networking → VCN → Security
   List → ingress TCP 80 from 0.0.0.0/0), and once on the machine itself, because Oracle's
   Ubuntu images ship a restrictive firewall:
   ```bash
   sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 80 -j ACCEPT
   sudo netfilter-persistent save
   ```
   Skipping the second step is the most common reason the site "doesn't load".
3. **Install Docker.**
   ```bash
   curl -fsSL https://get.docker.com | sh
   sudo usermod -aG docker $USER && newgrp docker
   ```
4. **Get the code.** The repo is private, so create a
   [fine-grained personal access token](https://github.com/settings/personal-access-tokens)
   with read access to it, then:
   ```bash
   git clone https://<token>@github.com/eddierzhang/FullHouse-Updated.git
   cd FullHouse-Updated
   git checkout change-tracking-and-agent-pages   # until it is merged to main
   ```
5. **Configure and start.**
   ```bash
   cp .env.docker.example .env
   # edit .env: WEB_PORT=80, PUBLIC_URL=http://<vm-public-ip>, OLLAMA_MODEL=qwen3.5:4b
   docker compose up -d --build
   docker compose logs -f ollama-pull
   ```
6. Open `http://<vm-public-ip>`.

**Updating later:** `git pull && docker compose up -d --build`. Migrations run automatically.

### Before you share the link: lock it down

The app has no login. Anyone who finds the URL can approve proposals, delete staff, change
prices and revert history. Pick one before sharing it:

- **Cloudflare Tunnel + Cloudflare Access (free)** — the best fit. The tunnel gives you an
  HTTPS URL without opening port 80 at all, and Access puts an email login in front of it.
- **nginx basic auth** — one password for everyone, a few lines in `frontend/nginx.conf`.
- **Restrict port 80 to your own IP** in the Oracle security list, if only you need it.

### Route 2: free platforms, without agents

Useful for showing the UI, but agent runs won't work for free:

- **Frontend:** Cloudflare Pages, Netlify or Vercel. Build with `VITE_API_BASE` set to the
  backend's URL, and set `FRONTEND_ORIGIN` on the backend to the frontend's URL for CORS.
- **Backend:** Render's free web service — 512 MB, and it spins down after 15 minutes idle.
  Spinning down kills any run in flight; the backend marks those runs failed on its next start.
- **No model:** there is no free host for Ollama at this size. Agents would need
  `LLM_PROVIDER=anthropic` and a paid API key.
- **Database:** Render's free disk is wiped on every deploy, so SQLite won't persist, and
  Render's free Postgres is deleted after 30 days. Neon's free tier (0.5 GB) is permanent,
  but moving to Postgres hasn't been done or tested yet.
