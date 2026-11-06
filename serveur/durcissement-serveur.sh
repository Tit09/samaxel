#!/bin/bash
# ═══════════════════════════════════════════════════════════════════════════
#  Durcissement d'un serveur Ubuntu 24.04 pour SAMA XHEL (à lancer UNE fois, en root).
#  Chaque mesure répond à un risque (mémoire, chapitre 6 — DevSecOps).
#  Usage : sudo bash durcissement-serveur.sh  (après avoir copié VOTRE clé SSH publique)
# ═══════════════════════════════════════════════════════════════════════════
set -euo pipefail

echo "1/7 Mises à jour de sécurité automatiques (failles connues corrigées sans attendre)"
apt-get update -q && apt-get -y -q upgrade
apt-get -y -q install unattended-upgrades fail2ban ufw curl
dpkg-reconfigure -f noninteractive unattended-upgrades

echo "2/7 SSH : connexion par clé uniquement, pas de root, pas de mot de passe (anti force brute)"
test -s /root/.ssh/authorized_keys || { echo "⚠ Ajoutez d'abord votre clé publique dans /root/.ssh/authorized_keys"; exit 1; }
sed -i -E 's/^#?PasswordAuthentication .*/PasswordAuthentication no/; s/^#?PermitRootLogin .*/PermitRootLogin prohibit-password/; s/^#?KbdInteractiveAuthentication .*/KbdInteractiveAuthentication no/' /etc/ssh/sshd_config
systemctl restart ssh

echo "3/7 Pare-feu : seuls SSH, HTTPS et la visio sont ouverts ; la base de données ne l'est jamais"
ufw default deny incoming && ufw default allow outgoing
ufw allow 22/tcp && ufw allow 80/tcp && ufw allow 443/tcp
ufw allow 3478/tcp && ufw allow 3478/udp && ufw allow 49160:49200/udp
ufw --force enable

echo "4/7 Fail2ban : bannissement des adresses qui multiplient les échecs de connexion"
cat > /etc/fail2ban/jail.d/samaxhel.conf <<CONF
[sshd]
enabled = true
maxretry = 5
bantime = 1h
CONF
systemctl restart fail2ban

echo "5/7 Docker (moteur officiel)"
command -v docker >/dev/null || curl -fsSL https://get.docker.com | sh

echo "6/7 Noyau : protections réseau de base"
cat > /etc/sysctl.d/99-samaxhel.conf <<CONF
net.ipv4.conf.all.rp_filter=1
net.ipv4.tcp_syncookies=1
net.ipv4.conf.all.accept_redirects=0
net.ipv4.conf.all.send_redirects=0
kernel.kptr_restrict=2
CONF
sysctl --system >/dev/null

echo "7/7 Horloge exacte (journaux d'audit et codes à usage unique)"
timedatectl set-ntp true

echo "✔ Serveur durci. Étape suivante : copier le dossier SAMA XHEL, créer serveur/.env, puis docker compose --profile en-ligne up -d"
