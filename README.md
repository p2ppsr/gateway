# Gateway

> Simple Bitcoin Payments

Payment Server and Payment Buttons for Bitcoin SV

A staging deployment of the master branch is at [staging-app.gateway.cash](https://staging-app.gateway.cash) and the production branch is deployed to [app.gateway.cash](https://app.gateway.cash).

## Initial Open Source Project ToDo (Help build Gateway.cash v2.0 on BSV!)

We define a new open-source ecosystem component, a Payment Server. It is similar to the former [Gateway](https://github.com/gatewaycash/gateway) project from the BCH days in 2018:

- [x] An Express server that connects to a database
- [x] Allows creating Payment Buttons
- [x] Allows submitting payments to payment buttons
- [ ] Allows withdrawing funds by button owners after payment is received
- [x] Hosts a frontend where payment buttons can be generated
- [x] Hosts a JavaScript for website injection of Payment Buttons
- [x] Payee can see all payments
- [x] Prompts for MNC install when button clicked by user
- [x] Prompts for MNC install to use the Payment Server
- [ ] Allows button customization on the frontend (style/appearance, button text)
- [ ] Allows denominations of a currency for the BSV payment
- [ ] Buttons clicked can call a client-side callback after submitting payment to the payment server
- [ ] Payment submission can be wired up to various actions like sending emails to payee
- [ ] Admin dashboard for Payment Server admin, to configure server parameters like private key and Sendgrid credentials for email notifications
- [ ] Admin dashboard enables owner to delegate other identity keys of Metanet users as server admins
- [ ] Admin dashboard enables admins to enforce a fee on all payments through the server
- [ ] Support for WebHooks that call back to a custom URL as a Payment Action, authenticating with Authrite
- [ ] Support for bearer token authentication of WebHooks if Authrite is not enabled on the target server
- [ ] Expose UI of single-use vs. multi-use buttons
- [ ] Clean up the UI and bring it into a somewhat decent state in terms of styling

## Setup for Hosted Version

### Prerequisites

- A server with Ubuntu 20.04 or later.
- Root or sudo access.
- Node.js (v16 or later) and npm installed.
- MySQL Server or Docker installed.
- A domain name configured with DNS and SSL.

### Step-by-Step Instructions

1. **Set Up the Server Environment**:

   ```sh
   sudo apt update && sudo apt upgrade -y
   sudo apt install -y nodejs npm mysql-server docker.io git
   sudo systemctl start mysql
   sudo systemctl enable mysql
   ```

2. **Configure MySQL**:

   ```sh
   sudo mysql
   ```

   Inside MySQL:

   ```sql
   ALTER USER 'root'@'localhost' IDENTIFIED WITH 'mysql_native_password' BY 'your_secure_password';
   FLUSH PRIVILEGES;
   CREATE DATABASE gateway;
   CREATE USER 'gateway'@'localhost' IDENTIFIED BY 'gateway123';
   GRANT ALL PRIVILEGES ON gateway.* TO 'gateway'@'localhost';
   FLUSH PRIVILEGES;
   EXIT;
   ```

   Or use Docker:

   ```sh
   docker run --name mysql-gateway-server -e MYSQL_ROOT_PASSWORD=my-secret-pw -e MYSQL_DATABASE=gateway -e MYSQL_USER=gateway -e MYSQL_PASSWORD=gateway123 -v mysql-gateway-data:/var/lib/mysql -p 3306:3306 -d mysql:latest
   ```

3. **Clone the Repository**:

   ```sh
   git clone https://github.com/your-repo/gateway.git
   cd gateway
   ```

4. **Install Dependencies**:

   ```sh
   npm install
   ```

5. **Configure the Environment**:

   ```sh
   npm run setup
   ```

   Provide SQL hostname, port, user, password, database name, web server port (e.g., 3001), domain (e.g., https://gateway.example.com), and whether to spawn NGINX (yes for production).  
   Edit `.env` to set a secure `SERVER_PRIVATE_KEY` (e.g., a 64-character hex string).

6. **Run Database Migrations**:

   ```sh
   npx knex migrate:latest
   ```

7. **(Optional) Seed the database**:

   ```sh
   npx knex seed:run
   ```

8. **Configure NGINX for Production**:

   ```sh
   sudo apt install -y nginx
   sudo nano /etc/nginx/sites-available/gateway
   ```

   Use:

   ```nginx
   server {
       listen 80;
       server_name gateway.example.com;
       client_max_body_size 2g;
       location / {
           proxy_pass http://localhost:3001;
           proxy_set_header X-Real-IP $remote_addr;
           proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
           proxy_set_header Host $host;
           proxy_set_header X-NginX-Proxy true;
           proxy_redirect off;
           proxy_next_upstream error timeout http_502 http_503 http_504;
           proxy_next_upstream_tries 5;
           proxy_connect_timeout 3540s;
           proxy_send_timeout 3540s;
           proxy_read_timeout 3540s;
       }
   }
   ```

   Enable and restart:

   ```sh
   sudo ln -s /etc/nginx/sites-available/gateway /etc/nginx/sites-enabled/
   sudo nginx -t
   sudo systemctl restart nginx
   ```

9. **Set Up SSL with Let’s Encrypt**:

   ```sh
   sudo apt install -y certbot python3-certbot-nginx
   sudo certbot --nginx -d gateway.example.com
   ```

   Update `nginx.conf` for port 443 as per Certbot instructions.

10. **Build and Run the Application**:

```sh
npm run build:inject
npm run dev
```

For production:

```sh
npm install -g pm2
pm2 start src/server.ts --name gateway
pm2 save
pm2 startup
```

11. **Verify and Test**:

- Access `https://gateway.example.com`
- Test payment creation, listing, and acknowledgment.
- Check `logs/watch-pay.log` for errors.

## Dev docs

Check `API_UPDATED.md` and `SCHEMA.md`.
