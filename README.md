# Gateway

> Simple Bitcoin Payments

Payment Server and Payment Buttons for Bitcoin SV

A staging deployment of the master branch is at [staging-app.gateway.cash](https://staging-app.gateway.cash) and the production branch is deployed to [app.gateway.cash](https://app.gateway.cash).

## Initial Open Source Project ToDo (Help build Gateway.cash v2.0 on BSV!)

We define a new open-source ecosystem component, a Payment Server. It is similar to the former [Gateway](https://github.com/gatewaycash/gateway) project from the BCH days in 2018:

- [x] An Express server that connects to a database
- [x] Allows creating Payment Buttons
- [x] Allows submitting payments tto payment buttons
- [x] Allows withdrawing funds by button owners after payment is received
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
- [ ] Admin dashboard enables owner to delegate other identity keys of MetaNet users as server admins
- [ ] Admin dashboard enables admins to enforce a fee on all payments through the server
- [ ] Support for WebHooks that call back to a custom URL as a Payment Action, authenticating with Authrite
- [ ] Support for bearer token authentication of WebHooks if Authrite is not enabled on the target server
- [ ] Expose UI of single-use vs. multi-use buttons
- [ ] Clean up the UI and bring it into a somewhat decent state in terms of styling

## Dev docs

Check [API.md](docs/API.md) and [SCHEMA.md](docs/SCHEMA.md).

First, run a local MySQL with docker:

```sh
docker run --name mysql-gateway-server -e MYSQL_ROOT_PASSWORD=my-secret-pw -e MYSQL_DATABASE=gateway -e MYSQL_USER=gateway -e MYSQL_PASSWORD=gateway123 -v mysql-gateway-data:/var/lib/mysql -p 3306:3306 -d mysql:latest
```

Then, set up and create your `.env` file with `npm run setup`.

Finally, you can run your dev server with `npm run dev`, modify your routes and components. Live-reload should be supported.

Build the payment button injector with `npm run build:inject` and it will compile the code.

## License

Open BSV License.
