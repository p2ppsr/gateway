# Gateway

> Simple Bitcoin Payments

Payment Server and Payment Buttons for Bitcoin

## Initial Description

We define a new component, a Payment Server. It is similar to the former Gateway project:

- An Express server that connects to a database

- Allows creating Payment Buttons

- Allows submitting payments tto payment buttons

- Allows withdrawing funds by button owners after payment is received

- Hosts a frontend where payment buttons can be generated

- Allows button customization on the frontend

- Hosts a JavaScript for website injection of Payment Buttons

- Allows denominations of a currency for the BSV payment

- Buttons clicked can call a client-side callback after submitting payment to the payment server

- Payment submission can be wired up to various actions like sending emails to payee

- Payee can see all payments

- Prompts for MNC install when button clicked by user

- Prompts for MNC install to use the Payment Server

- Admin dashboard for Payment Server admin, to configure server parameters like private key and Sendgrid credentials for email notifications

- Admin dashboard enables owner to delegate other identity keys of MetaNet users as server admins

- Admin dashboard enables admins to enforce a fee on all payments through the server

- Creators of Payment Buttons can choose server-custody or self-custody. Server-custody to be implemented first. Self-custody works when the payee submits their identity key and the payment server derives a “from-anyone SABPPP” payment script for the payee, enabling money to flow directly from payer to payee without going through the payment server

## Dev docs

Run a local MySQL with docker:

```sh
docker run --name mysql-gateway-server -e MYSQL_ROOT_PASSWORD=my-secret-pw -e MYSQL_DATABASE=gateway -e MYSQL_USER=gateway -e MYSQL_PASSWORD=gateway123 -v mysql-gateway-data:/var/lib/mysql -p 3306:3306 -d mysql:latest
```

## License

Open BSV License.
