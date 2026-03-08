# RESA Survey - Deploy Plan (VPS Contabo)

**VPS:** 209.126.77.36 (ivanpires.dev), Ubuntu 22.04, user `webmaster`
**Stack:** PM2 + Nginx + PostgreSQL 14 (ja instalados)
**Dominio:** resa.ivanpires.dev (ja apontado)

---

## 1. PostgreSQL — criar banco e usuario

```bash
sudo -u postgres psql
```

```sql
CREATE USER resa WITH PASSWORD 'TROCAR_POR_SENHA_SEGURA';
CREATE DATABASE resa_survey OWNER resa;
GRANT ALL PRIVILEGES ON DATABASE resa_survey TO resa;
\q
```

Testar conexao:
```bash
psql -U resa -d resa_survey -h localhost
```

---

## 2. Clonar e buildar

```bash
cd /home/webmaster
git clone git@github.com:ivanlppires/resa-survey.git
cd resa-survey
npm install
npm run build
```

---

## 3. Arquivo .env (apps/server/.env)

```bash
cat > apps/server/.env << 'EOF'
PORT=3001
HOST=127.0.0.1
DATABASE_URL=postgresql://resa:TROCAR_POR_SENHA_SEGURA@localhost:5432/resa_survey
JWT_SECRET=TROCAR_POR_SECRET_LONGO
NODE_ENV=production
EOF
```

---

## 4. PM2 — iniciar o servidor

```bash
cd /home/webmaster/resa-survey
pm2 start apps/server/dist/index.js --name resa-server --env production
pm2 save
```

Verificar:
```bash
curl http://localhost:3001/api/health
# {"status":"ok"}
```

---

## 5. Nginx — configurar site

```bash
sudo nano /etc/nginx/sites-available/resa.ivanpires.dev
```

```nginx
server {
    listen 80;
    server_name resa.ivanpires.dev;

    root /home/webmaster/resa-survey/apps/web/dist;
    index index.html;

    # SPA — todas as rotas caem no index.html
    location / {
        try_files $uri $uri/ /index.html;
    }

    # API — proxy para Fastify
    location /api/ {
        proxy_pass http://127.0.0.1:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }

    # Cache para assets estaticos
    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf)$ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }
}
```

Ativar e testar:
```bash
sudo ln -s /etc/nginx/sites-available/resa.ivanpires.dev /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

---

## 6. HTTPS com Certbot

```bash
sudo certbot --nginx -d resa.ivanpires.dev
```

---

## 7. Script de deploy (deploy.sh)

Criar na raiz do projeto:

```bash
#!/bin/bash
set -e

cd /home/webmaster/resa-survey
git pull origin master
npm install
npm run build
pm2 restart resa-server
echo "Deploy concluido!"
```

```bash
chmod +x deploy.sh
```

Deploy futuro: `./deploy.sh`

---

## Verificacao final

- [ ] http://resa.ivanpires.dev → mostra "RESA Survey"
- [ ] https://resa.ivanpires.dev → HTTPS funcionando
- [ ] https://resa.ivanpires.dev/api/health → {"status":"ok"}
- [ ] pm2 status → resa-server online
