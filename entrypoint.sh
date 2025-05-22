#!/bin/sh

echo "Starting cron daemon..."

touch /var/log/handlers.log

cat << 'EOF' > /app/handlers.sh
#!/bin/sh
echo "Running handlers..."
node /app/src/scripts/handlers.js 2>&1 | tee -a /var/log/handlers.log
EOF
chmod +x /app/handlers.sh

echo '* * * * * /app/handlers.sh 2>&1' > /etc/crontabs/root

crond -b -d 8 > /var/log/cron.log 2>&1 &

tail -f /var/log/handlers.log